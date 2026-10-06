/** Im Browser gibt es keine geplanten Benachrichtigungen; das Ende eines Timers zeigt nur die App selbst. */
export async function scheduleAlarm(title: string, body: string, seconds: number): Promise<string | null> {
  void [title, body, seconds];
  return null;
}

export async function cancelAlarm(id: string): Promise<void> {
  void id;
}
