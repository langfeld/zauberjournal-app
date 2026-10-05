import type { ReweOrder, ReweOrderRequest } from '@zauberjournal/core';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { errorMessage } from '@/lib/error-message';

import { getReweOrder, sendReweOrder } from './api';
import { useConnection } from './connection';

/** Solange das Userscript noch arbeitet, so oft nachsehen. */
const POLL_MS = 5000;

/**
 * Auftrag fürs Userscript: lädt ihn, solange der Bildschirm zu sehen ist, und schickt neue.
 * Hat das Script noch offene Produkte, fragt die App regelmäßig nach, um den Fortschritt zu zeigen.
 */
export function useReweOrder() {
  const { credentials } = useConnection();
  const [order, setOrder] = useState<ReweOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const pending = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!credentials) return;
      let cancelled = false;
      const load = () =>
        getReweOrder(credentials).then(
          (next) => {
            if (cancelled) return;
            pending.current = next?.products.some((product) => product.status === 'pending') ?? false;
            setOrder(next);
            setError(null);
          },
          (problem: unknown) => {
            if (!cancelled) setError(errorMessage(problem));
          },
        );
      void load();
      const timer = setInterval(() => {
        if (pending.current) void load();
      }, POLL_MS);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }, [credentials]),
  );

  const send = async (request: ReweOrderRequest) => {
    if (!credentials || sending) return;
    setSending(true);
    setError(null);
    try {
      const next = await sendReweOrder(credentials, request);
      pending.current = next.products.length > 0;
      setOrder(next);
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setSending(false);
    }
  };

  return { order, error, sending, send };
}
