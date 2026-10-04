import { useNavigation } from 'expo-router';
import { useEffect, type RefObject } from 'react';

import { confirm } from '@/lib/confirm';

/**
 * Fragt beim Verlassen des Bildschirms nach, ob ungespeicherte Änderungen verworfen werden sollen.
 * `leavingRef` auf `true` setzen, bevor nach dem Speichern bewusst weg navigiert wird.
 */
export function useConfirmDiscard(hasChanges: boolean, leavingRef: RefObject<boolean>) {
  const navigation = useNavigation();

  useEffect(() => {
    return navigation.addListener('beforeRemove', (event) => {
      if (!hasChanges || leavingRef.current) return;
      event.preventDefault();
      void confirm('Änderungen verwerfen?', 'Deine Änderungen sind noch nicht gespeichert.', 'Verwerfen').then(
        (discard) => {
          if (!discard) return;
          leavingRef.current = true;
          navigation.dispatch(event.data.action);
        },
      );
    });
  }, [navigation, hasChanges, leavingRef]);
}
