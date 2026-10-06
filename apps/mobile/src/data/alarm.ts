import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Alarm der Kochtimer als geplante Benachrichtigung: Sie klingelt auch, wenn die App im Hintergrund oder das
 * Handy gesperrt ist. Im Browser gibt es das nicht (`alarm.web.ts`).
 */

const CHANNEL = 'timers';

// Auch während die App offen ist, zeigen und klingeln.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let ready: Promise<boolean> | null = null;

async function prepare(): Promise<boolean> {
  // Ab Android 13 fragt das System erst nach der Erlaubnis, wenn es einen Kanal gibt.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Kochtimer',
      importance: Notifications.AndroidImportance.MAX,
      enableVibrate: true,
      vibrationPattern: [0, 500, 300, 500, 300, 500],
    });
  }
  const { granted } = await Notifications.getPermissionsAsync();
  return granted || (await Notifications.requestPermissionsAsync()).granted;
}

/** Plant den Alarm und gibt seine ID zurück; `null`, wenn Benachrichtigungen nicht erlaubt sind. */
export async function scheduleAlarm(title: string, body: string, seconds: number): Promise<string | null> {
  ready ??= prepare().catch(() => false);
  if (!(await ready)) {
    // Beim nächsten Timer noch einmal versuchen, vielleicht ist es dann erlaubt.
    ready = null;
    return null;
  }
  return Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: CHANNEL },
  });
}

/** Nimmt den Alarm zurück, geplant oder schon angezeigt. */
export async function cancelAlarm(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
  await Notifications.dismissNotificationAsync(id);
}
