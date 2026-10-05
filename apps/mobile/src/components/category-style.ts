import type { FoodCategory, MealId } from '@zauberjournal/core';

import { tones, type Tone } from '@/theme';

import type { IconName } from './icon';

/** Symbol und Farbe je Warengruppe, für Einkaufsliste, Vorrat und Lebensmittel. */
export const CATEGORY_STYLES: Record<FoodCategory, { icon: IconName; tone: Tone }> = {
  produce: { icon: 'nutrition', tone: tones.green },
  bakery: { icon: 'bakery_dining', tone: tones.wheat },
  dairy: { icon: 'egg', tone: tones.blue },
  meat: { icon: 'kebab_dining', tone: tones.rose },
  fish: { icon: 'set_meal', tone: tones.teal },
  frozen: { icon: 'ac_unit', tone: tones.ice },
  dry: { icon: 'rice_bowl', tone: tones.ochre },
  canned: { icon: 'grocery', tone: tones.terracotta },
  spices: { icon: 'soup_kitchen', tone: tones.olive },
  sweets: { icon: 'cookie', tone: tones.berry },
  drinks: { icon: 'local_drink', tone: tones.sky },
  household: { icon: 'cleaning_services', tone: tones.lavender },
  other: { icon: 'shopping_basket', tone: tones.stone },
};

export const MEAL_ICONS: Record<MealId, IconName> = {
  breakfast: 'breakfast_dining',
  lunch: 'lunch_dining',
  dinner: 'dinner_dining',
  snack: 'icecream',
};
