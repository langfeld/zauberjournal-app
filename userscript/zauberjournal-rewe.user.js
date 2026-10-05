// ==UserScript==
// @name         Zauberjournal: REWE-Warenkorb
// @namespace    https://github.com/langfeld/zauberjournal-app
// @version      1.1.0
// @description  Legt die Einkaufsliste aus Zauberjournal in den REWE-Warenkorb (Abholservice).
// @homepageURL  https://github.com/langfeld/zauberjournal-app
// @match        https://www.rewe.de/*
// @match        https://shop.rewe.de/*
// @noframes
// @run-at       document-idle
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM.xmlHttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @connect      *
// ==/UserScript==

/*
 * Holt den Auftrag aus der Einkaufsliste vom Zauberjournal-Server und legt die Produkte über die
 * Website in den Warenkorb. Pro Produkt meldet es zurück, was passiert ist; die App zeigt das an.
 *
 * Einrichten: Serveradresse und einen Code aus der App eingeben (Haushalt → REWE-Abholung →
 * Userscript für rewe.de). Das Script koppelt sich dann wie ein weiteres Gerät; in der App lässt es
 * sich unter „Geräte“ wieder entfernen. Im Script selbst steht kein Schlüssel.
 */
(() => {
  'use strict';

  /** Trägt der Server beim Ausliefern ein, damit beim Einrichten nur der Code fehlt. */
  const SERVER_FROM_INSTALL = '';
  /** Pause zwischen zwei Artikeln, damit REWE nicht zu viele Anfragen auf einmal bekommt. */
  const PAUSE_MS = 500;
  const BASKET_PAGE = '/shop/checkout/basket';

  // ─── Userscript-Manager (Tampermonkey, Violentmonkey; GM.* und GM_*) ───

  const hasGM = typeof GM !== 'undefined';
  const storage = {
    get: (key, fallback) => (hasGM && GM.getValue ? GM.getValue(key, fallback) : Promise.resolve(GM_getValue(key, fallback))),
    set: (key, value) => (hasGM && GM.setValue ? GM.setValue(key, value) : Promise.resolve(GM_setValue(key, value))),
    remove: (key) => (hasGM && GM.deleteValue ? GM.deleteValue(key) : Promise.resolve(GM_deleteValue(key))),
  };

  /** Anfrage an den Zauberjournal-Server; der Userscript-Manager umgeht dabei CORS. */
  function request(options) {
    const send = hasGM && GM.xmlHttpRequest ? GM.xmlHttpRequest : GM_xmlhttpRequest;
    return new Promise((resolve, reject) => {
      send({
        timeout: 20000,
        ...options,
        onload: resolve,
        onerror: () => reject(new Error('Der Zauberjournal-Server ist nicht erreichbar.')),
        ontimeout: () => reject(new Error('Der Zauberjournal-Server antwortet nicht.')),
      });
    });
  }

  function parseJson(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function normalizeServerUrl(input) {
    const url = input.trim().replace(/\/+$/, '');
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }

  function formatPrice(cents) {
    return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
  }

  // ─── Zauberjournal-Server ───

  async function settings() {
    return { server: await storage.get('server', SERVER_FROM_INSTALL), token: await storage.get('token', '') };
  }

  async function serverRequest(method, path, body) {
    const { server, token } = await settings();
    if (!server || !token) throw new Error('Das Script ist noch nicht eingerichtet.');
    const response = await request({
      method,
      url: server + path,
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      data: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = parseJson(response.responseText);
    if (response.status === 401) {
      await storage.remove('token');
      throw new Error('Das Script ist nicht mehr mit dem Haushalt verbunden. Bitte neu einrichten.');
    }
    if (response.status >= 400) throw new Error(data?.error ?? `Der Server meldet Fehler ${response.status}.`);
    return data;
  }

  /** Koppelt das Script wie ein neues Gerät; der Code kommt aus der App. */
  async function connect(serverInput, code) {
    const server = normalizeServerUrl(serverInput);
    const deviceName = /Android/i.test(navigator.userAgent) ? 'REWE-Userscript (Android)' : 'REWE-Userscript (PC)';
    const response = await request({
      method: 'POST',
      url: `${server}/api/pair`,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ code, deviceName }),
    });
    const data = parseJson(response.responseText);
    if (response.status !== 201 || !data?.token) {
      throw new Error(data?.error ?? `Unter dieser Adresse antwortet kein Zauberjournal-Server (Fehler ${response.status}).`);
    }
    await storage.set('server', server);
    await storage.set('token', data.token);
  }

  // ─── REWE-Warenkorb ───

  /** Bricht den ganzen Lauf ab, z. B. wenn niemand bei REWE angemeldet ist. */
  class StopError extends Error {}

  function postListing(listingId, quantity) {
    return fetch(`/shop/api/baskets/listings/${encodeURIComponent(listingId)}`, {
      method: 'POST',
      credentials: 'include',
      // Kein eigener Accept-Header: REWE wählt das Format selbst, auf `application/json` antwortet es mit 406.
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity, includeTimeslot: false, context: 'product-detail' }),
    });
  }

  /** Listing-ID für den Markt dieser Sitzung, aus der Produktseite (Attribut oder eingebettete Daten). */
  async function listingFromProductPage(productId) {
    const response = await fetch(`/shop/p/${encodeURIComponent(productId)}`, { credentials: 'include' });
    if (!response.ok) return null;
    const html = await response.text();
    return (/data-listingid="([^"]+)"/.exec(html) ?? /"listingId"\s*:\s*"([^"]+)"/.exec(html))?.[1] ?? null;
  }

  async function addProduct(product) {
    let response = product.listingId ? await postListing(product.listingId, product.packs) : null;
    // Die Listing-ID aus dem Abgleich gehört zum Markt der App; passt sie nicht, gilt die der Sitzung.
    if (!response || [400, 404, 422].includes(response.status)) {
      const listingId = await listingFromProductPage(product.productId);
      if (!listingId) return { status: 'failed', message: 'In diesem Markt nicht gefunden' };
      response = await postListing(listingId, product.packs);
    }
    if (response.ok) return { status: 'added', message: '' };
    // Was REWE geantwortet hat, steht in der Browser-Konsole.
    console.warn(`Zauberjournal: REWE antwortet mit ${response.status} für ${product.name}`, await response.text().catch(() => ''));
    if (response.status === 409) return { status: 'present', message: '' };
    if (response.status === 401 || response.status === 403) {
      throw new StopError('REWE lässt das gerade nicht zu. Bitte bei REWE anmelden, den Abholservice wählen und es noch einmal versuchen.');
    }
    return { status: 'failed', message: `REWE meldet Fehler ${response.status}` };
  }

  // ─── Oberfläche ───

  /** Symbole aus Material Symbols wie in der App (viewBox 0 -960 960 960). */
  const ICONS = {
    book: 'M560 -543V-611Q593 -625 627.5 -632Q662 -639 700 -639Q726 -639 751 -635Q776 -631 800 -625V-561Q776 -570 751.5 -574.5Q727 -579 700 -579Q662 -579 627 -569.5Q592 -560 560 -543ZM560 -323V-391Q593 -405 627.5 -412Q662 -419 700 -419Q726 -419 751 -415Q776 -411 800 -405V-341Q776 -350 751.5 -354.5Q727 -359 700 -359Q662 -359 627 -350Q592 -341 560 -323ZM560 -433V-501Q593 -515 627.5 -522Q662 -529 700 -529Q726 -529 751 -525Q776 -521 800 -515V-451Q776 -460 751.5 -464.5Q727 -469 700 -469Q662 -469 627 -459.5Q592 -450 560 -433ZM260 -299Q307 -299 351.5 -288.5Q396 -278 440 -257V-651Q399 -675 353 -687Q307 -699 260 -699Q224 -699 188.5 -692Q153 -685 120 -671Q120 -671 120 -671Q120 -671 120 -671V-275Q120 -275 120 -275Q120 -275 120 -275Q155 -287 189.5 -293Q224 -299 260 -299ZM520 -257Q564 -278 608.5 -288.5Q653 -299 700 -299Q736 -299 770.5 -293Q805 -287 840 -275Q840 -275 840 -275Q840 -275 840 -275V-671Q840 -671 840 -671Q840 -671 840 -671Q807 -685 771.5 -692Q736 -699 700 -699Q653 -699 607 -687Q561 -675 520 -651ZM482 -118Q433 -156 377 -179Q321 -202 260 -202Q220 -202 181.5 -191Q143 -180 107 -161Q78 -146 50 -162Q22 -178 22 -210V-691Q22 -710 31 -726.5Q40 -743 57 -751Q104 -774 154.5 -785.5Q205 -797 258 -797Q317 -797 373.5 -782Q430 -767 480 -735Q531 -766 587 -781.5Q643 -797 702 -797Q755 -797 805.5 -785.5Q856 -774 903 -751Q920 -743 929 -726.5Q938 -710 938 -691V-201Q938 -172 910.5 -158.5Q883 -145 853 -161Q817 -180 778.5 -191Q740 -202 700 -202Q640 -202 585 -178.5Q530 -155 482 -118ZM280 -473Q280 -473 280 -473Q280 -473 280 -473Q280 -473 280 -473Q280 -473 280 -473Q280 -473 280 -473Q280 -473 280 -473Q280 -473 280 -473Q280 -473 280 -473Q280 -473 280 -473Q280 -473 280 -473Q280 -473 280 -473Q280 -473 280 -473Z',
    cart: 'M280 -80Q247 -80 223.5 -103.5Q200 -127 200 -160Q200 -193 223.5 -216.5Q247 -240 280 -240Q313 -240 336.5 -216.5Q360 -193 360 -160Q360 -127 336.5 -103.5Q313 -80 280 -80ZM680 -80Q647 -80 623.5 -103.5Q600 -127 600 -160Q600 -193 623.5 -216.5Q647 -240 680 -240Q713 -240 736.5 -216.5Q760 -193 760 -160Q760 -127 736.5 -103.5Q713 -80 680 -80ZM246 -720 342 -520H622Q622 -520 622 -520Q622 -520 622 -520L732 -720Q732 -720 732 -720Q732 -720 732 -720ZM208 -800H798Q821 -800 833 -779.5Q845 -759 834 -738L692 -482Q681 -462 662.5 -451Q644 -440 622 -440H324L280 -360Q280 -360 280 -360Q280 -360 280 -360H760V-280H280Q235 -280 212 -319.5Q189 -359 210 -398L264 -496L120 -800H40V-880H170ZM342 -520H622Q622 -520 622 -520Q622 -520 622 -520Z',
    addCart: 'M440 -600V-720H320V-800H440V-920H520V-800H640V-720H520V-600ZM280 -80Q247 -80 223.5 -103.5Q200 -127 200 -160Q200 -193 223.5 -216.5Q247 -240 280 -240Q313 -240 336.5 -216.5Q360 -193 360 -160Q360 -127 336.5 -103.5Q313 -80 280 -80ZM680 -80Q647 -80 623.5 -103.5Q600 -127 600 -160Q600 -193 623.5 -216.5Q647 -240 680 -240Q713 -240 736.5 -216.5Q760 -193 760 -160Q760 -127 736.5 -103.5Q713 -80 680 -80ZM40 -800V-880H171L341 -520H621Q621 -520 621 -520Q621 -520 621 -520L777 -800H868L692 -482Q681 -462 662.5 -451Q644 -440 622 -440H324L280 -360Q280 -360 280 -360Q280 -360 280 -360H760V-280H280Q235 -280 211.5 -319Q188 -358 210 -398L264 -496L120 -800Z',
    check: 'M382 -222 136 -468 212 -544 382 -373 748 -740 824 -664Z',
    close: 'M256 -200 200 -256 424 -480 200 -704 256 -760 480 -536 704 -760 760 -704 536 -480 760 -256 704 -200 480 -424Z',
    error: 'M480 -280Q497 -280 508.5 -291.5Q520 -303 520 -320Q520 -337 508.5 -348.5Q497 -360 480 -360Q463 -360 451.5 -348.5Q440 -337 440 -320Q440 -303 451.5 -291.5Q463 -280 480 -280ZM440 -440H520V-680H440ZM480 -80Q397 -80 324 -111.5Q251 -143 197 -197Q143 -251 111.5 -324Q80 -397 80 -480Q80 -563 111.5 -636Q143 -709 197 -763Q251 -817 324 -848.5Q397 -880 480 -880Q563 -880 636 -848.5Q709 -817 763 -763Q817 -709 848.5 -636Q880 -563 880 -480Q880 -397 848.5 -324Q817 -251 763 -197Q709 -143 636 -111.5Q563 -80 480 -80ZM480 -160Q614 -160 707 -253Q800 -346 800 -480Q800 -614 707 -707Q614 -800 480 -800Q346 -800 253 -707Q160 -614 160 -480Q160 -346 253 -253Q346 -160 480 -160ZM480 -480Q480 -480 480 -480Q480 -480 480 -480Q480 -480 480 -480Q480 -480 480 -480Q480 -480 480 -480Q480 -480 480 -480Q480 -480 480 -480Q480 -480 480 -480Z',
    info: 'M440 -280H520V-520H440ZM520 -640Q520 -657 508.5 -668.5Q497 -680 480 -680Q463 -680 451.5 -668.5Q440 -657 440 -640Q440 -623 451.5 -611.5Q463 -600 480 -600Q497 -600 508.5 -611.5Q520 -623 520 -640ZM480 -80Q397 -80 324 -111.5Q251 -143 197 -197Q143 -251 111.5 -324Q80 -397 80 -480Q80 -563 111.5 -636Q143 -709 197 -763Q251 -817 324 -848.5Q397 -880 480 -880Q563 -880 636 -848.5Q709 -817 763 -763Q817 -709 848.5 -636Q880 -563 880 -480Q880 -397 848.5 -324Q817 -251 763 -197Q709 -143 636 -111.5Q563 -80 480 -80ZM480 -160Q614 -160 707 -253Q800 -346 800 -480Q800 -614 707 -707Q614 -800 480 -800Q346 -800 253 -707Q160 -614 160 -480Q160 -346 253 -253Q346 -160 480 -160ZM480 -480Q480 -480 480 -480Q480 -480 480 -480Q480 -480 480 -480Q480 -480 480 -480Q480 -480 480 -480Q480 -480 480 -480Q480 -480 480 -480Q480 -480 480 -480Z',
    open: 'M200 -120Q167 -120 143.5 -143.5Q120 -167 120 -200V-760Q120 -793 143.5 -816.5Q167 -840 200 -840H480V-760H200Q200 -760 200 -760Q200 -760 200 -760V-200Q200 -200 200 -200Q200 -200 200 -200H760Q760 -200 760 -200Q760 -200 760 -200V-480H840V-200Q840 -167 816.5 -143.5Q793 -120 760 -120ZM388 -332 332 -388 704 -760H560V-840H840V-560H760V-704Z',
    refresh: 'M480 -160Q346 -160 253 -253Q160 -346 160 -480Q160 -614 253 -707Q346 -800 480 -800Q549 -800 612 -771.5Q675 -743 720 -690V-800H800V-520H520V-600H688Q656 -656 600.5 -688Q545 -720 480 -720Q380 -720 310 -650Q240 -580 240 -480Q240 -380 310 -310Q380 -240 480 -240Q557 -240 619 -284Q681 -328 706 -400H790Q762 -294 676 -227Q590 -160 480 -160Z',
    logout: 'M200 -120Q167 -120 143.5 -143.5Q120 -167 120 -200V-760Q120 -793 143.5 -816.5Q167 -840 200 -840H480V-760H200Q200 -760 200 -760Q200 -760 200 -760V-200Q200 -200 200 -200Q200 -200 200 -200H480V-120ZM640 -280 585 -338 687 -440H360V-520H687L585 -622L640 -680L840 -480Z',
    schedule: 'M612 -292 668 -348 520 -496V-680H440V-464ZM480 -80Q397 -80 324 -111.5Q251 -143 197 -197Q143 -251 111.5 -324Q80 -397 80 -480Q80 -563 111.5 -636Q143 -709 197 -763Q251 -817 324 -848.5Q397 -880 480 -880Q563 -880 636 -848.5Q709 -817 763 -763Q817 -709 848.5 -636Q880 -563 880 -480Q880 -397 848.5 -324Q817 -251 763 -197Q709 -143 636 -111.5Q563 -80 480 -80ZM480 -480Q480 -480 480 -480Q480 -480 480 -480Q480 -480 480 -480Q480 -480 480 -480Q480 -480 480 -480Q480 -480 480 -480Q480 -480 480 -480Q480 -480 480 -480ZM480 -160Q613 -160 706.5 -253.5Q800 -347 800 -480Q800 -613 706.5 -706.5Q613 -800 480 -800Q347 -800 253.5 -706.5Q160 -613 160 -480Q160 -347 253.5 -253.5Q347 -160 480 -160Z',
  };

  function icon(name, size = 20) {
    return `<svg class="i" viewBox="0 -960 960 960" width="${size}" height="${size}" aria-hidden="true"><path fill="currentColor" d="${ICONS[name]}"/></svg>`;
  }

  const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

  /** Anzeige je Zustand eines Produkts; `adding` gilt für das Produkt, das gerade dran ist. */
  const STATUS = {
    pending: { label: 'offen', tone: '', icon: '' },
    adding: { label: 'kommt in den Warenkorb …', tone: 'busy', icon: '' },
    added: { label: 'im Warenkorb', tone: 'ok', icon: 'check' },
    present: { label: 'war schon drin', tone: 'ok', icon: 'check' },
    failed: { label: 'hat nicht geklappt', tone: 'bad', icon: 'error' },
  };

  // Farben und Maße wie in der App (apps/mobile/src/theme.ts).
  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif; }
    .i { display: block; flex: none; }
    .fab {
      position: fixed; right: 18px; bottom: calc(18px + env(safe-area-inset-bottom)); z-index: 2147483000;
      width: 58px; height: 58px; border: 0; border-radius: 50%; cursor: pointer;
      display: grid; place-items: center; color: #fff; background: linear-gradient(160deg, #3a7a5a, #24533d);
      box-shadow: 0 2px 6px rgba(74, 52, 30, 0.22), 0 10px 24px rgba(74, 52, 30, 0.2); transition: transform 0.15s ease;
    }
    .fab:hover { transform: translateY(-1px); }
    .fab:active { transform: scale(0.96); }
    .badge {
      position: absolute; top: -3px; right: -3px; min-width: 24px; height: 24px; padding: 0 6px;
      display: grid; place-items: center; border: 2px solid #fffcf7; border-radius: 12px;
      background: #b9573a; color: #fff; font-size: 12px; font-weight: 700;
    }
    .badge.done { padding: 0; background: #2f6b4f; }
    .panel {
      position: fixed; right: 18px; bottom: calc(88px + env(safe-area-inset-bottom)); z-index: 2147483001;
      width: min(380px, calc(100vw - 36px)); max-height: min(78vh, 680px); display: flex; flex-direction: column; overflow: hidden;
      border-radius: 20px; border: 1px solid rgba(116, 92, 66, 0.12); background: #fffcf7; color: #2a231d;
      box-shadow: 0 2px 6px rgba(74, 52, 30, 0.1), 0 18px 40px rgba(74, 52, 30, 0.2); font-size: 15px; line-height: 1.4;
    }
    .panel[hidden] { display: none; }
    @media (max-width: 520px) {
      .panel { left: 10px; right: 10px; width: auto; bottom: calc(84px + env(safe-area-inset-bottom)); max-height: 80vh; }
    }
    header { display: flex; align-items: center; gap: 12px; padding: 14px 12px 12px 16px; border-bottom: 1px solid #efe6d9; }
    .brand {
      flex: none; width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center;
      color: #f7f2ea; background: linear-gradient(160deg, #3a7a5a, #24533d);
    }
    .titles { flex: 1; min-width: 0; }
    h2 { margin: 0; font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
    .subtitle { display: block; font-size: 12.5px; color: #74685b; }
    .close {
      flex: none; width: 36px; height: 36px; border: 0; border-radius: 50%; display: grid; place-items: center;
      background: transparent; color: #74685b; cursor: pointer;
    }
    .close:hover { background: #f0e8dc; color: #2a231d; }
    .body { flex: 1 1 auto; min-height: 0; padding: 14px 16px; overflow: auto; }
    .bar { flex: none; padding: 12px 16px; border-top: 1px solid #efe6d9; background: #fffcf7; }
    p { margin: 0 0 12px; }
    .muted { color: #74685b; font-size: 13.5px; }
    .summary { margin-bottom: 12px; padding: 12px 14px; border-radius: 14px; background: #f7f2ea; }
    .summary-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
    .list-name { font-size: 15px; font-weight: 600; }
    .total { font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .meta { margin-top: 1px; font-size: 13px; color: #74685b; }
    .progress { height: 6px; margin: 10px 0 7px; border-radius: 999px; background: #e8ded0; overflow: hidden; }
    .progress div { height: 100%; border-radius: 999px; background: #2f6b4f; transition: width 0.3s ease; }
    .progress-label { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #74685b; }
    .progress-label.complete { color: #2f6b4f; font-weight: 600; }
    .hint { display: flex; align-items: flex-start; gap: 8px; margin: 0 0 8px; font-size: 13px; color: #74685b; }
    .hint .i { margin-top: 1px; color: #2f6b4f; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { display: flex; align-items: center; gap: 12px; padding: 9px 0; border-top: 1px solid #efe6d9; }
    li:first-child { border-top: 0; }
    .thumb {
      flex: none; width: 46px; height: 46px; display: grid; place-items: center; overflow: hidden;
      border: 1px solid #efe6d9; border-radius: 12px; background: #fff; color: #b5a996;
    }
    .thumb img { width: 100%; height: 100%; padding: 3px; object-fit: contain; }
    .info { flex: 1; min-width: 0; }
    .name { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 2; -webkit-box-orient: vertical; font-size: 14.5px; }
    .chip {
      display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; padding: 2px 8px 2px 7px;
      border-radius: 999px; background: #f0e8dc; color: #74685b; font-size: 12px; font-weight: 600;
    }
    .chip.ok, .chip.busy { background: #e2ede4; color: #2f6b4f; }
    .chip.bad { background: #fae6e3; color: #b3261e; }
    .spinner {
      flex: none; width: 12px; height: 12px; border: 2px solid currentColor; border-right-color: transparent;
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .amount { flex: none; text-align: right; }
    .price { font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .packs { display: block; font-size: 12.5px; color: #74685b; }
    .actions { display: grid; gap: 8px; }
    .primary, .secondary {
      display: flex; width: 100%; min-height: 46px; align-items: center; justify-content: center; gap: 8px;
      border: 0; border-radius: 999px; font-size: 15.5px; font-weight: 600; text-decoration: none; cursor: pointer;
    }
    .primary { background: #2f6b4f; color: #fff; box-shadow: 0 1px 2px rgba(36, 83, 61, 0.25), 0 4px 12px rgba(36, 83, 61, 0.18); }
    .secondary { background: #e2ede4; color: #2f6b4f; }
    button:disabled { opacity: 0.55; cursor: default; }
    .footer { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 18px; margin-top: 8px; }
    button.link {
      display: inline-flex; align-items: center; gap: 5px; padding: 4px 2px; border: 0;
      background: none; color: #74685b; font-size: 13px; cursor: pointer;
    }
    button.link:hover { color: #2a231d; }
    .notice { display: flex; align-items: flex-start; gap: 8px; margin: 0 0 12px; padding: 10px 12px; border-radius: 12px; font-size: 13.5px; }
    .notice .i { margin-top: 1px; }
    .notice.error { background: #fae6e3; color: #b3261e; }
    .notice.info { background: #e2ede4; color: #2f6b4f; }
    .notice.warn { background: #fbefd9; color: #9a5d00; }
    .loading { display: flex; align-items: center; gap: 10px; color: #74685b; }
    .empty { padding: 6px 4px 2px; text-align: center; }
    .empty p { margin: 0; }
    .circle { width: 64px; height: 64px; margin: 4px auto 12px; display: grid; place-items: center; border-radius: 50%; background: #e2ede4; color: #2f6b4f; }
    h3 { margin: 0 0 6px; font-size: 16px; font-weight: 700; }
    label { display: block; margin: 0 0 12px; font-size: 13.5px; font-weight: 600; color: #74685b; }
    input {
      display: block; width: 100%; margin-top: 6px; padding: 11px 14px; border: 1px solid #e8ded0; border-radius: 12px;
      background: #fff; color: #2a231d; font-size: 16px;
    }
    input:focus { outline: none; border-color: #2f6b4f; box-shadow: 0 0 0 3px rgba(47, 107, 79, 0.14); }
  `;

  const state = {
    open: false,
    view: 'loading', // loading | setup | retry | empty | order
    order: null,
    running: false,
    /** Produkt, das gerade in den Warenkorb kommt. */
    current: null,
    done: 0,
    total: 0,
    error: '',
    warning: '',
    info: '',
    server: '',
  };

  const host = document.createElement('div');
  host.id = 'zauberjournal-rewe';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${STYLE}</style><button class="fab" type="button" aria-label="Zauberjournal: Einkaufsliste in den Warenkorb"></button><section class="panel" hidden></section>`;
  const fab = shadow.querySelector('.fab');
  const panel = shadow.querySelector('.panel');

  const openProducts = () => (state.order ? state.order.products.filter((p) => p.status === 'pending' || p.status === 'failed') : []);

  function productRow(product, showPending) {
    const key = state.current === product.productId ? 'adding' : STATUS[product.status] ? product.status : 'pending';
    const status = STATUS[key];
    const label = key === 'failed' ? product.message || status.label : status.label;
    const symbol = key === 'adding' ? '<span class="spinner"></span>' : status.icon ? icon(status.icon, 14) : '';
    const chip = key !== 'pending' || showPending ? `<span class="chip ${status.tone}">${symbol}${escapeHtml(label)}</span>` : '';
    const image = /^https:\/\//.test(product.imageUrl ?? '')
      ? `<img src="${escapeHtml(product.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : icon('cart', 22);
    return `<li>
      <span class="thumb">${image}</span>
      <span class="info"><span class="name">${escapeHtml(product.name)}</span>${chip}</span>
      <span class="amount"><span class="price">${formatPrice(product.packs * product.price)}</span>${
        product.packs > 1 ? `<span class="packs">${product.packs} ×</span>` : ''
      }</span></li>`;
  }

  function footer(withReload) {
    const reload = withReload
      ? `<button class="link" data-action="reload" ${state.running ? 'disabled' : ''}>${icon('refresh', 16)}Auftrag neu laden</button>`
      : '';
    return `<div class="footer">${reload}<button class="link" data-action="logout">${icon('logout', 16)}Script abmelden</button></div>`;
  }

  function renderOrder(order) {
    const count = order.products.length;
    const total = order.products.reduce((sum, product) => sum + product.packs * product.price, 0);
    const packs = order.products.reduce((sum, product) => sum + product.packs, 0);
    const inBasket = order.products.filter((product) => product.status === 'added' || product.status === 'present').length;
    const open = openProducts().length;
    const started = state.running || order.products.some((product) => product.status !== 'pending');
    const complete = inBasket === count;
    const progressLabel = complete
      ? `${icon('check', 16)}Alles im Warenkorb`
      : state.running
        ? `Lege in den Warenkorb … ${state.done} von ${state.total}`
        : `${inBasket} von ${count} im Warenkorb`;
    const progress = started
      ? `<div class="progress"><div style="width:${Math.round((inBasket / Math.max(1, count)) * 100)}%"></div></div>
         <div class="progress-label${complete ? ' complete' : ''}">${progressLabel}</div>`
      : '';
    const runLabel = open === count ? `${plural(count, 'Produkt', 'Produkte')} in den Warenkorb` : `${open} noch in den Warenkorb`;
    const run =
      open > 0
        ? `<button class="primary" data-action="run" ${state.running ? 'disabled' : ''}>${
            state.running ? '<span class="spinner"></span>Wird in den Warenkorb gelegt …' : `${icon('addCart')}${runLabel}`
          }</button>`
        : '';
    return {
      body: `
        <div class="summary">
          <div class="summary-row"><span class="list-name">${escapeHtml(order.listName)}</span><span class="total">ca. ${formatPrice(total)}</span></div>
          <div class="meta">${plural(count, 'Produkt', 'Produkte')}${packs > count ? ` · ${plural(packs, 'Packung', 'Packungen')}` : ''}</div>
          ${progress}
        </div>
        ${started ? '' : `<p class="hint">${icon('info', 16)}<span>Vorher bei REWE anmelden und den Abholmarkt wählen.</span></p>`}
        <ul>${order.products.map((product) => productRow(product, started)).join('')}</ul>`,
      // Die Knöpfe bleiben unten stehen, auch wenn die Liste lang ist.
      bar: `<div class="actions">${run}<a class="${open > 0 ? 'secondary' : 'primary'}" href="${BASKET_PAGE}">${icon('cart')}Zum Warenkorb</a></div>${footer(true)}`,
    };
  }

  function render() {
    const open = openProducts().length;
    const complete = !!state.order && state.order.products.length > 0 && open === 0;
    fab.innerHTML = `${icon('cart', 26)}${
      open > 0 ? `<span class="badge">${open}</span>` : complete ? `<span class="badge done">${icon('check', 14)}</span>` : ''
    }`;
    panel.hidden = !state.open;
    if (!state.open) return;

    let body = '';
    let bar = '';
    if (state.view === 'loading') body = '<p class="loading"><span class="spinner"></span>Lade den Auftrag …</p>';
    else if (state.view === 'retry') {
      bar = `<div class="actions"><button class="secondary" data-action="reload">${icon('refresh')}Noch einmal versuchen</button></div>${footer(false)}`;
    } else if (state.view === 'setup') {
      body = `
        <p>Verbinde das Script mit eurem Zauberjournal. Den Code zeigt die App unter Haushalt → REWE-Abholung → Userscript für rewe.de.</p>
        <label>Serveradresse<input name="server" type="url" inputmode="url" autocomplete="url" placeholder="https://kochbuch.example.org" value="${escapeHtml(state.server)}"></label>
        <label>Code<input name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="z. B. 93ZK-JDE6"></label>`;
      bar = '<div class="actions"><button class="primary" data-action="connect">Verbinden</button></div>';
    } else if (state.view === 'empty') {
      body = `
        <div class="empty">
          <div class="circle">${icon('cart', 30)}</div>
          <h3>Gerade kein Auftrag</h3>
          <p class="muted">In der App in der Einkaufsliste auf „In den Warenkorb“ tippen, dann hier neu laden.</p>
        </div>`;
      bar = `<div class="actions"><button class="secondary" data-action="reload">${icon('refresh')}Neu laden</button></div>${footer(false)}`;
    } else if (state.order) ({ body, bar } = renderOrder(state.order));

    const notice = (tone, symbol, text) => (text ? `<p class="notice ${tone}"${tone === 'error' ? ' role="alert"' : ''}>${icon(symbol, 18)}<span>${escapeHtml(text)}</span></p>` : '');
    const notices = notice('error', 'error', state.error) + notice('warn', 'error', state.warning) + notice('info', 'info', state.info);
    const subtitle = state.view === 'setup' ? 'Mit dem Haushalt verbinden' : 'REWE-Warenkorb';
    panel.innerHTML = `
      <header>
        <span class="brand">${icon('book', 22)}</span>
        <span class="titles"><h2>Zauberjournal</h2><span class="subtitle">${subtitle}</span></span>
        <button class="close" data-action="close" aria-label="Schließen">${icon('close', 22)}</button>
      </header>
      <div class="body">${notices}${body}</div>${bar ? `<div class="bar">${bar}</div>` : ''}`;
  }

  async function loadOrder() {
    const { server, token } = await settings();
    state.server = server;
    if (!server || !token) {
      state.view = 'setup';
      state.order = null;
      return;
    }
    const data = await serverRequest('GET', '/api/rewe/order');
    state.order = data?.order ?? null;
    state.view = state.order && state.order.products.length > 0 ? 'order' : 'empty';
  }

  async function refresh() {
    state.error = '';
    try {
      await loadOrder();
    } catch (error) {
      state.error = error.message;
      const { token } = await settings();
      state.view = !token ? 'setup' : state.order ? 'order' : 'retry';
    }
    render();
  }

  /** Legt alle offenen Produkte nacheinander in den Warenkorb und meldet jedes einzeln zurück. */
  async function run() {
    const order = state.order;
    const products = openProducts();
    if (!order || products.length === 0 || state.running) return;
    Object.assign(state, { running: true, done: 0, total: products.length, error: '', warning: '', info: '' });
    render();
    for (const product of products) {
      state.current = product.productId;
      render();
      let result;
      try {
        result = await addProduct(product);
      } catch (error) {
        if (error instanceof StopError) {
          state.error = error.message;
          break;
        }
        result = { status: 'failed', message: 'Keine Verbindung zu REWE' };
      }
      Object.assign(product, result);
      state.current = null;
      state.done += 1;
      render();
      try {
        await serverRequest('POST', '/api/rewe/order/results', { order: order.createdAt, results: [{ productId: product.productId, ...result }] });
      } catch (error) {
        state.error = `Rückmeldung an Zauberjournal fehlgeschlagen: ${error.message}`;
        break;
      }
      await sleep(PAUSE_MS);
    }
    state.running = false;
    state.current = null;
    // Klappt alles, zeigt das der Fortschritt; eine Meldung braucht es nur bei Fehlschlägen.
    const failed = order.products.filter((product) => product.status === 'failed').length;
    if (!state.error && failed > 0) {
      state.warning = `${plural(failed, 'Produkt hat', 'Produkte haben')} nicht geklappt. Noch einmal versuchen oder bei REWE selbst suchen.`;
    }
    render();
  }

  shadow.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.fab')) {
      state.open = !state.open;
      render();
      if (state.open && !state.running) await refresh();
      return;
    }
    const action = target?.closest('[data-action]')?.getAttribute('data-action');
    if (action === 'close') {
      state.open = false;
      render();
    } else if (action === 'reload') {
      state.info = '';
      state.warning = '';
      await refresh();
    } else if (action === 'run') {
      await run();
    } else if (action === 'logout') {
      await storage.remove('token');
      Object.assign(state, { view: 'setup', order: null, error: '', warning: '', info: 'Abgemeldet. In der App das Gerät „REWE-Userscript“ entfernen, falls es nicht mehr gebraucht wird.' });
      render();
    } else if (action === 'connect') {
      const serverInput = shadow.querySelector('input[name="server"]')?.value ?? '';
      const code = shadow.querySelector('input[name="code"]')?.value ?? '';
      state.server = serverInput;
      if (!serverInput.trim() || !code.trim()) {
        state.error = 'Bitte Serveradresse und Code eingeben.';
        render();
        return;
      }
      state.error = '';
      try {
        await connect(serverInput, code);
        state.info = 'Verbunden.';
        await refresh();
      } catch (error) {
        state.error = error.message;
        render();
      }
    }
  });

  shadow.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) shadow.querySelector('[data-action="connect"]')?.click();
  });

  document.body.append(host);
  // Beim Laden nur den Auftrag holen, damit der Knopf anzeigt, ob etwas offen ist.
  refresh();
})();
