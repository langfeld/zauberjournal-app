import type { IconName } from './icon';

/** Die fünf Bereiche der App; jeder Tab hat seinen eigenen Stack mit Kopfzeile. */
export const TABS = [
  { name: '(recipes)', href: '/', label: 'Rezepte', icon: 'menu_book', sf: 'book' },
  { name: 'plan', href: '/plan', label: 'Plan', icon: 'calendar_month', sf: 'calendar' },
  { name: 'shopping', href: '/shopping', label: 'Einkauf', icon: 'shopping_cart', sf: 'cart' },
  { name: 'pantry', href: '/pantry', label: 'Vorrat', icon: 'kitchen', sf: 'refrigerator' },
  { name: 'household', href: '/household', label: 'Haushalt', icon: 'home', sf: 'house' },
] as const satisfies readonly { name: string; href: string; label: string; icon: IconName; sf: string }[];

/** Der Haushalt-Tab bekommt ein Ausrufezeichen, wenn etwas nicht stimmt. */
export const ATTENTION_TAB = 'household';
