import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts } from '@/theme';

/**
 * Zeichen der Schrift Material Symbols, die die App nutzt. Die Namen stehen auf fonts.google.com/icons;
 * die Code-Punkte kommen aus `expo-symbols/build/android/symbols.json`.
 */
const GLYPHS = {
  ac_unit: 0xeb3b,
  add: 0xe145,
  add_home: 0xf8eb,
  add_shopping_cart: 0xe854,
  alt_route: 0xf184,
  arrow_downward: 0xe5db,
  arrow_upward: 0xe5d8,
  auto_awesome: 0xe65f,
  bakery_dining: 0xea53,
  bookmark: 0xe866,
  breakfast_dining: 0xea54,
  calendar_month: 0xebcc,
  category: 0xe574,
  check: 0xe5ca,
  check_circle: 0xe86c,
  chevron_left: 0xe5cb,
  chevron_right: 0xe5cc,
  cleaning_services: 0xf0ff,
  close: 0xe5cd,
  cloud_done: 0xe2bf,
  cloud_off: 0xe2c1,
  cloud_sync: 0xeb5a,
  content_paste: 0xe14f,
  cookie: 0xeaac,
  delete: 0xe872,
  devices: 0xe1b1,
  dinner_dining: 0xea57,
  dns: 0xe875,
  eco: 0xea35,
  edit: 0xe3c9,
  egg: 0xeacc,
  error: 0xe000,
  event: 0xe878,
  expand_less: 0xe5ce,
  expand_more: 0xe5cf,
  grocery: 0xef97,
  group: 0xe7ef,
  group_add: 0xe7f0,
  home: 0xe88a,
  icecream: 0xea69,
  info: 0xe88e,
  inventory_2: 0xe1a1,
  kebab_dining: 0xe842,
  kitchen: 0xeb47,
  link: 0xe157,
  local_drink: 0xe544,
  location_on: 0xe0c8,
  logout: 0xe9ba,
  lunch_dining: 0xea61,
  menu_book: 0xea19,
  merge: 0xeb98,
  nutrition: 0xe110,
  open_in_new: 0xe89e,
  person: 0xe7fd,
  person_off: 0xe510,
  photo_camera: 0xe412,
  photo_library: 0xe413,
  qr_code: 0xef6b,
  qr_code_scanner: 0xf206,
  radio_button_unchecked: 0xe836,
  refresh: 0xe5d5,
  remove: 0xe15b,
  remove_shopping_cart: 0xe928,
  restaurant: 0xe56c,
  rice_bowl: 0xf1f5,
  schedule: 0xe8b5,
  search: 0xe8b6,
  search_off: 0xea76,
  sell: 0xf05b,
  set_meal: 0xf1ea,
  share: 0xe80d,
  shopping_basket: 0xe8cb,
  shopping_cart: 0xe8cc,
  skillet: 0xf543,
  smartphone: 0xe32c,
  soup_kitchen: 0xe7d3,
  sticky_note_2: 0xf1fc,
  storefront: 0xea12,
  sync: 0xe627,
  task_alt: 0xe2e6,
  timer: 0xe425,
  today: 0xe8df,
  warning: 0xe002,
} as const;

export type IconName = keyof typeof GLYPHS;

type IconProps = { name: IconName; size?: number; color?: string; style?: StyleProp<ViewStyle> };

/** Einfarbiges Symbol. Es ist nur Schmuck; Screenreader lesen die Beschriftung daneben. */
export function Icon({ name, size = 20, color = colors.text, style }: IconProps) {
  return (
    <View aria-hidden style={[{ width: size, height: size }, style]}>
      <Text allowFontScaling={false} style={[styles.glyph, { fontSize: size, lineHeight: size, color }]}>
        {String.fromCharCode(GLYPHS[name])}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  glyph: { fontFamily: fonts.icons, textAlign: 'center', includeFontPadding: false },
});
