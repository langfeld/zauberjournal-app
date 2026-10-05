// ==UserScript==
// @name         Zauberjournal: REWE-Warenkorb
// @namespace    https://github.com/langfeld/zauberjournal-app
// @version      1.0.0
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
 * Code fürs Userscript). Das Script koppelt sich dann wie ein weiteres Gerät; in der App lässt es
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
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ quantity, includeTimeslot: false, context: 'product-detail' }),
    });
  }

  /** Listing-ID für den Markt dieser Sitzung, aus der Produktseite. */
  async function listingFromProductPage(productId) {
    const response = await fetch(`/shop/p/${encodeURIComponent(productId)}`, { credentials: 'include' });
    if (!response.ok) return null;
    return /data-listingid="([^"]+)"/.exec(await response.text())?.[1] ?? null;
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
    if (response.status === 409) return { status: 'present', message: '' };
    if (response.status === 401 || response.status === 403) {
      throw new StopError('REWE lässt das gerade nicht zu. Bitte bei REWE anmelden, den Abholservice wählen und es noch einmal versuchen.');
    }
    return { status: 'failed', message: `REWE meldet Fehler ${response.status}` };
  }

  // ─── Oberfläche ───

  const STATUS = {
    pending: { icon: '○', label: 'offen' },
    added: { icon: '✓', label: 'im Warenkorb' },
    present: { icon: '✓', label: 'war schon drin' },
    failed: { icon: '!', label: 'Fehler' },
  };

  const BASKET_ICON =
    '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM6.2 6l.94 2H20a1 1 0 0 1 .9 1.45l-3.28 6.1A2 2 0 0 1 15.86 16.6H8.1a2 2 0 0 1-1.79-1.1L3.38 4H2V2h2.62l.94 2H6.2Zm1.9 4 2 4.6h5.76l2.47-4.6H8.1Z"/></svg>';

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .fab {
      position: fixed; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom)); z-index: 2147483000;
      width: 56px; height: 56px; border: 0; border-radius: 50%; cursor: pointer;
      display: grid; place-items: center; color: #fff; background: #2f6b4f;
      box-shadow: 0 2px 6px rgba(74, 52, 30, 0.2), 0 10px 24px rgba(74, 52, 30, 0.18);
    }
    .badge {
      position: absolute; top: -4px; right: -4px; min-width: 22px; height: 22px; padding: 0 6px;
      border-radius: 11px; background: #b9573a; color: #fff; font-size: 12px; font-weight: 700; line-height: 22px; text-align: center;
    }
    .panel {
      position: fixed; right: 16px; bottom: calc(84px + env(safe-area-inset-bottom)); z-index: 2147483001;
      width: min(400px, calc(100vw - 32px)); max-height: min(72vh, 620px); overflow: auto;
      padding: 18px; border-radius: 18px; border: 1px solid rgba(116, 92, 66, 0.12);
      background: #fffcf7; color: #2a231d; box-shadow: 0 2px 6px rgba(74, 52, 30, 0.12), 0 14px 32px rgba(74, 52, 30, 0.18);
      font-size: 15px; line-height: 1.45;
    }
    .panel[hidden] { display: none; }
    @media (max-width: 520px) {
      .panel { left: 8px; right: 8px; width: auto; bottom: calc(80px + env(safe-area-inset-bottom)); max-height: 78vh; }
    }
    header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    h2 { flex: 1; margin: 0; font: 600 19px/1.3 Georgia, "Times New Roman", serif; }
    .close { border: 0; background: none; font-size: 24px; line-height: 1; color: #74685b; cursor: pointer; padding: 4px 8px; }
    p { margin: 0 0 12px; }
    .muted { color: #74685b; font-size: 14px; }
    label { display: block; margin: 0 0 12px; font-size: 14px; font-weight: 600; color: #74685b; }
    input {
      display: block; width: 100%; margin-top: 6px; padding: 11px 14px; border: 1px solid #e8ded0; border-radius: 12px;
      background: #fff; color: #2a231d; font-size: 16px;
    }
    input:focus { outline: none; border-color: #2f6b4f; box-shadow: 0 0 0 3px rgba(47, 107, 79, 0.14); }
    button.primary, button.secondary, a.secondary {
      display: flex; width: 100%; min-height: 46px; margin-top: 8px; align-items: center; justify-content: center;
      border: 0; border-radius: 999px; font-size: 16px; font-weight: 600; text-decoration: none; cursor: pointer;
    }
    button.primary { background: #2f6b4f; color: #fff; }
    button.secondary, a.secondary { background: #e2ede4; color: #2f6b4f; }
    button:disabled { opacity: 0.45; cursor: default; }
    button.link { display: block; margin: 12px auto 0; border: 0; background: none; color: #74685b; font-size: 14px; text-decoration: underline; cursor: pointer; }
    .notice { margin: 0 0 12px; padding: 10px 12px; border-radius: 12px; font-size: 14px; }
    .notice.error { background: #fae6e3; color: #b3261e; }
    .notice.info { background: #e2ede4; color: #2f6b4f; }
    .summary { display: flex; justify-content: space-between; gap: 8px; font-weight: 600; }
    ul { list-style: none; margin: 4px 0 8px; padding: 0; }
    li { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-top: 1px solid #e8ded0; }
    li:first-child { border-top: 0; }
    .icon {
      flex: none; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center;
      font-size: 13px; font-weight: 700; background: #ece7df; color: #6b6156;
    }
    .added .icon { background: #e3efdf; color: #3d7535; }
    .present .icon { background: #e3efdf; color: #6b6156; }
    .failed .icon { background: #fae6e3; color: #b3261e; }
    .item { flex: 1; min-width: 0; }
    .item small { display: block; color: #74685b; font-size: 13px; }
    .failed .item small { color: #b3261e; }
    .price { flex: none; font-weight: 600; font-variant-numeric: tabular-nums; }
    .progress { height: 8px; margin: 4px 0 12px; border-radius: 999px; background: #f0e8dc; overflow: hidden; }
    .progress div { height: 100%; border-radius: 999px; background: #2f6b4f; }
  `;

  const state = {
    open: false,
    view: 'loading', // loading | setup | retry | empty | order
    order: null,
    running: false,
    done: 0,
    total: 0,
    error: '',
    info: '',
    server: '',
  };

  const host = document.createElement('div');
  host.id = 'zauberjournal-rewe';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${STYLE}</style><button class="fab" type="button" aria-label="Zauberjournal: Einkaufsliste in den Warenkorb">${BASKET_ICON}</button><section class="panel" hidden></section>`;
  const fab = shadow.querySelector('.fab');
  const panel = shadow.querySelector('.panel');

  const openProducts = () => (state.order ? state.order.products.filter((p) => p.status === 'pending' || p.status === 'failed') : []);

  function renderOrder(order) {
    const total = order.products.reduce((sum, product) => sum + product.packs * product.price, 0);
    const open = openProducts().length;
    const rows = order.products
      .map((product) => {
        const status = STATUS[product.status] ?? STATUS.pending;
        const name = product.packs > 1 ? `${product.packs}× ${product.name}` : product.name;
        const note = product.status === 'failed' ? product.message || status.label : product.status === 'pending' ? '' : status.label;
        return `<li class="${product.status}"><span class="icon" title="${status.label}">${status.icon}</span>
          <span class="item">${escapeHtml(name)}${note ? `<small>${escapeHtml(note)}</small>` : ''}</span>
          <span class="price">${formatPrice(product.packs * product.price)}</span></li>`;
      })
      .join('');
    const progress = state.running
      ? `<p class="muted">Lege in den Warenkorb … ${state.done} von ${state.total}</p>
         <div class="progress"><div style="width:${Math.round((state.done / Math.max(1, state.total)) * 100)}%"></div></div>`
      : '';
    return `
      <p class="summary"><span>${escapeHtml(order.listName)}</span><span>ca. ${formatPrice(total)}</span></p>
      <p class="muted">${order.products.length} Produkte. Vorher bei REWE anmelden und den Abholmarkt wählen.</p>
      ${progress}
      <ul>${rows}</ul>
      ${open > 0 ? `<button class="primary" data-action="run" ${state.running ? 'disabled' : ''}>${open === order.products.length ? 'In den Warenkorb legen' : `${open} noch in den Warenkorb legen`}</button>` : ''}
      <a class="secondary" href="${BASKET_PAGE}">Zum Warenkorb</a>
      <button class="link" data-action="reload" ${state.running ? 'disabled' : ''}>Auftrag neu laden</button>`;
  }

  function render() {
    const open = openProducts().length;
    fab.innerHTML = `${BASKET_ICON}${open > 0 ? `<span class="badge">${open}</span>` : ''}`;
    panel.hidden = !state.open;
    if (!state.open) return;

    let body = '';
    if (state.view === 'loading') body = '<p class="muted">Lade den Auftrag …</p>';
    else if (state.view === 'retry') body = '<button class="secondary" data-action="reload">Noch einmal versuchen</button>';
    else if (state.view === 'setup') {
      body = `
        <p>Verbinde das Script mit eurem Zauberjournal. Den Code zeigt die App unter Haushalt → REWE-Abholung → Code fürs Userscript.</p>
        <label>Serveradresse<input name="server" type="url" inputmode="url" autocomplete="url" placeholder="https://kochbuch.example.org" value="${escapeHtml(state.server)}"></label>
        <label>Code<input name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="z. B. 93ZK-JDE6"></label>
        <button class="primary" data-action="connect">Verbinden</button>`;
    } else if (state.view === 'empty') {
      body = `
        <p>Gerade gibt es keinen Auftrag.</p>
        <p class="muted">In der App in der Einkaufsliste auf „In den Warenkorb“ tippen, dann hier neu laden.</p>
        <button class="secondary" data-action="reload">Neu laden</button>`;
    } else if (state.order) body = renderOrder(state.order);

    const notices = `${state.error ? `<p class="notice error" role="alert">${escapeHtml(state.error)}</p>` : ''}${
      state.info ? `<p class="notice info">${escapeHtml(state.info)}</p>` : ''
    }`;
    const logout = state.view === 'setup' || state.view === 'loading' ? '' : '<button class="link" data-action="logout">Script abmelden</button>';
    panel.innerHTML = `<header><h2>Zauberjournal</h2><button class="close" data-action="close" aria-label="Schließen">×</button></header>${notices}${body}${logout}`;
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
    Object.assign(state, { running: true, done: 0, total: products.length, error: '', info: '' });
    render();
    for (const product of products) {
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
    if (!state.error) {
      const failed = order.products.filter((product) => product.status === 'failed').length;
      state.info = failed > 0 ? `Fertig, ${failed} ${failed === 1 ? 'Produkt hat' : 'Produkte haben'} nicht geklappt.` : 'Fertig, alles liegt im Warenkorb.';
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
      await refresh();
    } else if (action === 'run') {
      await run();
    } else if (action === 'logout') {
      await storage.remove('token');
      Object.assign(state, { view: 'setup', order: null, error: '', info: 'Abgemeldet. In der App das Gerät „REWE-Userscript“ entfernen, falls es nicht mehr gebraucht wird.' });
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
