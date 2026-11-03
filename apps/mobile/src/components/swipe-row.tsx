import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, StyleSheet, Text, Vibration, View, type GestureResponderEvent } from 'react-native';

import { colors, spacing } from '@/theme';

import { Icon, type IconName } from './icon';

/** Erst ab so viel Bewegung zur Seite gehört der Finger der Zeile; bis dahin kann die Seite noch scrollen. */
const SLOP = 10;
/** Anteil der Breite, ab dem Loslassen auslöst */
const THRESHOLD = 0.35;
/** Ein schneller Wisch löst schon früher aus: Punkte je Millisekunde und Mindestweg */
const FLING_SPEED = 0.6;
const FLING_DISTANCE = 40;
/** Hält der Finger vor dem Loslassen so lange still, zählt die Geschwindigkeit nicht. */
const FLING_PAUSE_MS = 100;
/** Der Browser kann nur in JavaScript animieren. */
const NATIVE_DRIVER = Platform.OS !== 'web';

type SwipeRowProps = {
  children: ReactNode;
  /** Was das Wischen tut, z. B. „Aufgebraucht“; steht hinter der Zeile. */
  label: string;
  icon: IconName;
  /** Weit genug nach links oder rechts gewischt */
  onSwipe: () => void;
  /** Die Zeile verschwindet danach aus der Liste: Sie gleitet hinaus, statt zurückzukommen. */
  leaves?: boolean;
  disabled?: boolean;
  /** Innenabstand der Karte: Beim Wischen reicht die Zeile bis an ihren Rand, der Inhalt bleibt eingerückt. */
  inset?: number;
};

/**
 * Zeile, die sich nach links oder rechts wischen lässt. Wie das Ziehen in der Monatsansicht mit den Respondern von
 * React Native und nur mit den Verschiebungen des Fingers. Hat die Zeile den Finger, scrollt die Seite nicht mehr,
 * und Knöpfe in der Zeile lösen nicht aus.
 */
export function SwipeRow({ children, label, icon, onSwipe, leaves = false, disabled = false, inset = 0 }: SwipeRowProps) {
  const [offset] = useState(() => new Animated.Value(0));
  /** Die Zeile ist verschoben. Nur dann gibt es das Band dahinter; in Ruhe bleibt die Karte, wie sie ist. */
  const [moved, setMoved] = useState(false);
  /** 1 nach rechts, -1 nach links; die Beschriftung steht auf der Seite, die frei wird. */
  const [direction, setDirection] = useState<1 | -1>(1);
  /** Weit genug: Loslassen löst aus. */
  const [armed, setArmed] = useState(false);
  const width = useRef(0);
  const start = useRef({ x: 0, y: 0 });
  /** Stand der Geste ohne Rendern; `speed` aus den letzten beiden Bewegungen */
  const gesture = useRef({ dx: 0, direction: 1, armed: false, time: 0, x: 0, speed: 0 });
  const comeBack = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (comeBack.current) clearTimeout(comeBack.current);
    },
    [],
  );

  const arm = (next: boolean) => {
    if (next === gesture.current.armed) return;
    gesture.current.armed = next;
    setArmed(next);
  };

  const rest = () => {
    arm(false);
    setMoved(false);
  };

  const settle = () => {
    Animated.spring(offset, { toValue: 0, speed: 16, bounciness: 0, useNativeDriver: NATIVE_DRIVER }).start(({ finished }) => {
      if (finished) rest();
    });
  };

  const complete = (side: 1 | -1) => {
    arm(true);
    if (!leaves) {
      onSwipe();
      settle();
      return;
    }
    Animated.timing(offset, { toValue: side * width.current, duration: 160, useNativeDriver: NATIVE_DRIVER }).start(({ finished }) => {
      if (!finished) return;
      onSwipe();
      // Bleibt die Zeile doch, etwa weil nichts mehr zu tun war, kommt sie zurück.
      comeBack.current = setTimeout(() => {
        offset.setValue(0);
        rest();
      }, 1000);
    });
  };

  const follow = (event: GestureResponderEvent) => {
    const { pageX, timestamp } = event.nativeEvent;
    const current = gesture.current;
    if (timestamp > current.time) current.speed = (pageX - current.x) / (timestamp - current.time);
    current.time = timestamp;
    current.x = pageX;
    current.dx = pageX - start.current.x;
    offset.setValue(current.dx);
    const nextDirection = current.dx < 0 ? -1 : 1;
    if (nextDirection !== current.direction) {
      current.direction = nextDirection;
      setDirection(nextDirection);
    }
    const reached = Math.abs(current.dx) >= width.current * THRESHOLD;
    if (reached && !current.armed) Vibration.vibrate(15);
    arm(reached);
  };

  const release = (event: GestureResponderEvent) => {
    const { dx, speed, time, armed: reached } = gesture.current;
    const moving = event.nativeEvent.timestamp - time < FLING_PAUSE_MS;
    const flung = moving && Math.abs(dx) >= FLING_DISTANCE && Math.abs(speed) >= FLING_SPEED && speed * dx > 0;
    if (reached || flung) complete(dx < 0 ? -1 : 1);
    else settle();
  };

  return (
    <View
      style={[styles.row, { marginHorizontal: -inset }]}
      onLayout={(event) => {
        width.current = event.nativeEvent.layout.width;
      }}
      onStartShouldSetResponderCapture={(event) => {
        start.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
        return false;
      }}
      // Erst eine deutliche Bewegung zur Seite übernimmt den Finger, z. B. von einem Knopf in der Zeile.
      onMoveShouldSetResponderCapture={(event) => {
        if (disabled) return false;
        const dx = Math.abs(event.nativeEvent.pageX - start.current.x);
        const dy = Math.abs(event.nativeEvent.pageY - start.current.y);
        return dx > SLOP && dx > dy * 1.5;
      }}
      onResponderGrant={(event) => {
        if (comeBack.current) clearTimeout(comeBack.current);
        offset.stopAnimation();
        gesture.current = { ...gesture.current, dx: 0, time: event.nativeEvent.timestamp, x: event.nativeEvent.pageX, speed: 0 };
        setMoved(true);
        // `true` hält auf Android die Seite davon ab, den Finger zum Scrollen zu übernehmen.
        return true;
      }}
      onResponderMove={follow}
      onResponderRelease={release}
      onResponderTerminate={settle}
      onResponderTerminationRequest={() => false}>
      {moved ? (
        <View
          aria-hidden
          style={[
            StyleSheet.absoluteFill,
            styles.behind,
            {
              paddingHorizontal: inset,
              flexDirection: direction > 0 ? 'row' : 'row-reverse',
              backgroundColor: armed ? colors.accent : colors.accentSoft,
            },
          ]}>
          <Icon name={icon} size={22} color={armed ? colors.primaryText : colors.accent} />
          <Text style={[styles.label, { color: armed ? colors.primaryText : colors.accent }]}>{label}</Text>
        </View>
      ) : null}
      <Animated.View style={[{ paddingHorizontal: inset, transform: [{ translateX: offset }] }, moved && styles.front]}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { overflow: 'hidden' },
  behind: { alignItems: 'center', gap: spacing.sm, pointerEvents: 'none' },
  label: { fontSize: 15, fontWeight: '700' },
  // Deckt das Band ab; in Ruhe durchsichtig, sonst überdeckte die Zeile unten die runden Ecken der Karte.
  front: { backgroundColor: colors.surface },
});
