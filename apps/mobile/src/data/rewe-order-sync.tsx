import { applyReweOrder, isActive, reweOrderFits } from '@zauberjournal/core';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { claimReweOrder, getReweOrder } from './api';
import { useConnection } from './connection';
import { applyWrites } from './recipes';
import { useStore } from './store';
import { readAppTables } from './tables';

/** So oft nachsehen, solange ein Auftrag auf die Bestellung wartet. */
const POLL_MS = 60_000;
/** Nach dem Verbinden kurz warten, damit die Änderungen der anderen Geräte schon da sind. */
const SETTLE_MS = 2000;

const checks = new Set<() => void>();

/** Gleich nachsehen, z. B. nachdem ein Auftrag geschickt wurde oder die Einkaufsliste eine neue Meldung sieht. */
export function requestReweOrderCheck() {
  for (const check of checks) check();
}

/**
 * Übernimmt die Bestellung bei REWE, sobald das Userscript sie meldet: Die Liste wird abgeschlossen, das Bestellte
 * kommt in den Vorrat, Fehlendes auf die nächste Liste. Nur ein Gerät übernimmt eine Meldung; das vergibt der
 * Server. Was übernommen oder zurückgenommen ist, steht an der Liste und kommt nicht wieder.
 */
export function ReweOrderSync() {
  const store = useStore();
  const { credentials, status } = useConnection();
  const [active, setActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!store || !credentials || status !== 'online' || !active) return;
    let stopped = false;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      if (busy || stopped) return;
      busy = true;
      clearTimeout(timer);
      let waiting = false;
      try {
        const order = await getReweOrder(credentials);
        const list = order ? readAppTables(store).shoppingLists[order.listId] : undefined;
        if (stopped || !order || !list || !isActive(list)) return;
        const placement = order.placed;
        if (!placement) {
          waiting = list.status === 'open';
          return;
        }
        // Schon übernommen oder zurückgenommen, von Hand abgeschlossen oder bei einem anderen Gerät
        if (list.reweReportedAt === placement.reportedAt || (list.status !== 'open' && !list.reweOrderId)) return;
        if (placement.claimedBy && placement.claimedBy !== credentials.deviceId) return;
        // Passt sie hier nicht, wohl weil noch Daten fehlen, darf ein anderes Gerät übernehmen.
        if (!reweOrderFits(readAppTables(store), order)) return;
        const claimed = await claimReweOrder(credentials, order, placement);
        if (stopped || !claimed) return;
        applyWrites(store, applyReweOrder(readAppTables(store), claimed, Date.now()));
      } catch {
        // Server gerade nicht erreichbar: später noch einmal.
        waiting = true;
      } finally {
        busy = false;
        if (!stopped && waiting) timer = setTimeout(() => void check(), POLL_MS);
      }
    };

    const request = () => void check();
    checks.add(request);
    timer = setTimeout(request, SETTLE_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
      checks.delete(request);
    };
  }, [store, credentials, status, active]);

  return null;
}
