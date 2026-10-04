/** Verschiebt einen Eintrag um eine Position nach oben (-1) oder unten (+1). */
export function moveItem<T>(items: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return [...items];
  const result = [...items];
  [result[index], result[target]] = [result[target]!, result[index]!];
  return result;
}
