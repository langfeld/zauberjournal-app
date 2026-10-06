import { useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, fonts, initialOf, radius, shadows, spacing, toneFor, tones, type Tone } from '@/theme';

import { Icon, type IconName } from './icon';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** Symbol vor dem Text. */
  icon?: IconName;
  small?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
};

const buttonColors: Record<ButtonVariant, { background: string; text: string }> = {
  primary: { background: colors.primary, text: colors.primaryText },
  secondary: { background: colors.primarySoft, text: colors.primary },
  ghost: { background: 'transparent', text: colors.primary },
  danger: { background: colors.dangerSoft, text: colors.danger },
};

export function Button({ title, onPress, variant = 'primary', icon, small, disabled, accessibilityLabel }: ButtonProps) {
  const palette = buttonColors[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: palette.background },
        variant === 'primary' && !disabled && styles.raised,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      {icon ? <Icon name={icon} size={small ? 18 : 20} color={palette.text} /> : null}
      <Text numberOfLines={1} style={[styles.buttonText, small && styles.buttonTextSmall, { color: palette.text }]}>
        {title}
      </Text>
    </Pressable>
  );
}

type IconButtonVariant = 'primary' | 'secondary' | 'ghost' | 'surface' | 'muted';

const iconButtonColors: Record<IconButtonVariant, { background: string; icon: string }> = {
  primary: { background: colors.primary, icon: colors.primaryText },
  secondary: { background: colors.primarySoft, icon: colors.primary },
  ghost: { background: 'transparent', icon: colors.primary },
  surface: { background: colors.surface, icon: colors.primary },
  muted: { background: 'transparent', icon: colors.textMuted },
};

type IconButtonProps = {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  variant?: IconButtonVariant;
  size?: number;
  disabled?: boolean;
};

/** Runder Knopf nur mit Symbol, z. B. zum Blättern oder Entfernen. */
export function IconButton({ icon, accessibilityLabel, onPress, variant = 'ghost', size = 40, disabled }: IconButtonProps) {
  const palette = iconButtonColors[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { width: size, height: size, backgroundColor: palette.background },
        variant === 'surface' && styles.iconButtonSurface,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <Icon name={icon} size={Math.round(size * 0.55)} color={palette.icon} />
    </Pressable>
  );
}

type TextFieldProps = TextInputProps & {
  label?: string;
  /** Symbol links im Feld. */
  icon?: IconName;
  /** Steht rechts im Feld, z. B. ein Knopf. */
  trailing?: ReactNode;
  /** Ganz runde Ecken, z. B. für Suchfelder. */
  round?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

export function TextField({
  label,
  icon,
  trailing,
  round,
  containerStyle,
  style,
  multiline,
  onFocus,
  onBlur,
  ...props
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.inputBox,
          round && styles.inputBoxRound,
          multiline && styles.inputBoxMultiline,
          focused && styles.inputBoxFocused,
        ]}>
        {icon ? (
          <Icon
            name={icon}
            size={20}
            color={focused ? colors.primary : colors.textMuted}
            style={multiline ? styles.inputIconTop : undefined}
          />
        ) : null}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.textMuted}
          multiline={multiline}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, multiline && styles.inputMultiline, style]}
          {...props}
        />
        {trailing}
      </View>
    </View>
  );
}

type SearchFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  /** Weiterer Knopf rechts im Feld, z. B. für Filter */
  action?: ReactNode;
};

export function SearchField({ value, onChangeText, placeholder, accessibilityLabel, action }: SearchFieldProps) {
  return (
    <TextField
      round
      icon="search"
      accessibilityLabel={accessibilityLabel}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      autoCorrect={false}
      returnKeyType="search"
      trailing={
        <>
          {value ? (
            <IconButton icon="close" variant="muted" size={32} accessibilityLabel="Suche leeren" onPress={() => onChangeText('')} />
          ) : null}
          {action}
        </>
      }
    />
  );
}

type AddFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  onAdd: () => void;
  placeholder: string;
  accessibilityLabel: string;
};

/** Eingabe mit rundem Plus-Knopf; die Tastatur bleibt nach dem Hinzufügen offen. */
export function AddField({ value, onChangeText, onAdd, placeholder, accessibilityLabel }: AddFieldProps) {
  return (
    <TextField
      round
      accessibilityLabel={accessibilityLabel}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      returnKeyType="done"
      submitBehavior="submit"
      onSubmitEditing={onAdd}
      trailing={
        <IconButton icon="add" variant="primary" size={36} accessibilityLabel="Hinzufügen" disabled={!value.trim()} onPress={onAdd} />
      }
    />
  );
}

type StepperProps = {
  label: string;
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
  canDecrease?: boolean;
  canIncrease?: boolean;
  icon?: IconName;
};

export function Stepper({ label, value, onDecrease, onIncrease, canDecrease = true, canIncrease = true, icon }: StepperProps) {
  return (
    <View style={styles.stepper}>
      {icon ? <Icon name={icon} size={20} color={colors.textMuted} /> : null}
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControl}>
        <IconButton
          icon="remove"
          variant="surface"
          size={34}
          accessibilityLabel={`${label}: weniger`}
          disabled={!canDecrease}
          onPress={onDecrease}
        />
        <Text style={styles.stepperValue} accessibilityLabel={`${label}: ${value}`}>
          {value}
        </Text>
        <IconButton
          icon="add"
          variant="surface"
          size={34}
          accessibilityLabel={`${label}: mehr`}
          disabled={!canIncrease}
          onPress={onIncrease}
        />
      </View>
    </View>
  );
}

type ChipProps = { label: string; selected: boolean; onPress: () => void; accessibilityLabel?: string; icon?: IconName };

export function Chip({ label, selected, onPress, accessibilityLabel, icon }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}>
      {icon ? <Icon name={icon} size={16} color={selected ? colors.primaryText : colors.textMuted} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export type SegmentOption<T extends string> = {
  id: T;
  label: string;
  icon?: IconName;
  /** Farbe, wenn ausgewählt; sonst Grün. */
  color?: string;
};

type SegmentedProps<T extends string> = {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  small?: boolean;
  /** Vorangestellt in den Bezeichnungen für Screenreader, z. B. der Name eines Lebensmittels. */
  labelPrefix?: string;
};

/** Umschalter zwischen wenigen Möglichkeiten, z. B. Woche und Monat. */
export function Segmented<T extends string>({ options, value, onChange, small, labelPrefix = '' }: SegmentedProps<T>) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const selected = option.id === value;
        const color = selected ? (option.color ?? colors.primary) : colors.textMuted;
        return (
          <Pressable
            key={option.id || '-'}
            accessibilityRole="button"
            accessibilityLabel={`${labelPrefix}${option.label}`}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.id)}
            style={[styles.segment, small && styles.segmentSmall, selected && styles.segmentSelected]}>
            {option.icon ? <Icon name={option.icon} size={small ? 16 : 18} color={color} /> : null}
            <Text style={[styles.segmentText, small && styles.segmentTextSmall, { color }, selected && styles.segmentTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.sectionTitle}>
      {children}
    </Text>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <Text style={styles.hint}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Überschrift einer Karte mit Symbol davor. */
export function CardHeader({ icon, title, tone = tones.green }: { icon: IconName; title: string; tone?: Tone }) {
  return (
    <View style={styles.cardHeader}>
      <IconCircle icon={icon} tone={tone} size={40} />
      <Text accessibilityRole="header" style={styles.cardTitle}>
        {title}
      </Text>
    </View>
  );
}

type IconCircleProps = { icon: IconName; tone: Tone; size?: number; square?: boolean };

/** Symbol auf farbigem Grund, z. B. vor Warengruppen. */
export function IconCircle({ icon, tone, size = 40, square }: IconCircleProps) {
  return (
    <View
      style={[
        styles.iconCircle,
        { width: size, height: size, borderRadius: square ? size * 0.3 : size / 2, backgroundColor: tone.background },
      ]}>
      <Icon name={icon} size={Math.round(size * 0.55)} color={tone.foreground} />
    </View>
  );
}

/** Anfangsbuchstabe auf einer Farbe, die zum Namen gehört (oder zu `toneKey`, damit sie beim Tippen bleibt). */
export function Avatar({ name, toneKey, size = 40 }: { name: string; toneKey?: string; size?: number }) {
  const tone = toneFor(toneKey ?? name);
  return (
    <View
      aria-hidden
      style={[styles.iconCircle, { width: size, height: size, borderRadius: size / 2, backgroundColor: tone.background }]}>
      <Text style={[styles.avatarText, { color: tone.foreground, fontSize: Math.round(size * 0.45) }]}>{initialOf(name)}</Text>
    </View>
  );
}

type TagProps = { label: string; icon?: IconName; tone?: Tone };

/** Kleine Markierung, z. B. „eingekauft“ oder eine Zeitangabe. */
export function Tag({ label, icon, tone = tones.stone }: TagProps) {
  return (
    <View style={[styles.tag, { backgroundColor: tone.background }]}>
      {icon ? <Icon name={icon} size={14} color={tone.foreground} /> : null}
      <Text style={[styles.tagText, { color: tone.foreground }]}>{label}</Text>
    </View>
  );
}

type NoticeTone = 'info' | 'warning' | 'danger';

const NOTICE_STYLES: Record<NoticeTone, { icon: IconName; background: string; foreground: string }> = {
  info: { icon: 'info', background: colors.primarySoft, foreground: colors.primary },
  warning: { icon: 'warning', background: colors.warningSoft, foreground: colors.warning },
  danger: { icon: 'error', background: colors.dangerSoft, foreground: colors.danger },
};

type NoticeProps = { tone?: NoticeTone; title?: string; children: string | string[] };

/** Hinweis- oder Fehlerkasten; mehrere Meldungen erscheinen als Aufzählung. */
export function Notice({ tone = 'info', title, children }: NoticeProps) {
  const palette = NOTICE_STYLES[tone];
  const messages = Array.isArray(children) ? children : [children];
  return (
    <View
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      style={[styles.notice, { backgroundColor: palette.background }]}>
      <Icon name={palette.icon} size={20} color={palette.foreground} />
      <View style={styles.noticeBody}>
        {title ? <Text style={[styles.noticeTitle, { color: palette.foreground }]}>{title}</Text> : null}
        {messages.map((message, index) => (
          <Text key={index} style={styles.noticeText}>
            {messages.length > 1 ? `• ${message}` : message}
          </Text>
        ))}
      </View>
    </View>
  );
}

type EmptyStateProps = { icon: IconName; title: string; children?: ReactNode; tone?: Tone };

/** Freundlicher Platzhalter, wenn eine Liste leer ist. */
export function EmptyState({ icon, title, children, tone = tones.green }: EmptyStateProps) {
  return (
    <View style={styles.empty}>
      <IconCircle icon={icon} tone={tone} size={72} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {children ? <Text style={styles.emptyText}>{children}</Text> : null}
    </View>
  );
}

/** Fortschritt von 0 bis 1. */
export function ProgressBar({ value }: { value: number }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${percent}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  buttonSmall: {
    minHeight: 36,
    minWidth: 36,
    paddingHorizontal: spacing.md + 2,
    gap: spacing.xs + 2,
  },
  raised: { boxShadow: shadows.button },
  buttonText: { flexShrink: 1, fontSize: 16, fontWeight: '600' },
  buttonTextSmall: { fontSize: 14 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.4 },
  iconButton: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  iconButtonSurface: { boxShadow: '0px 1px 2px rgba(74, 52, 30, 0.14)' },
  field: { gap: spacing.xs + 2 },
  label: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  inputBoxRound: { borderRadius: radius.pill, paddingRight: spacing.xs + 2 },
  inputBoxMultiline: { alignItems: 'flex-start' },
  inputBoxFocused: { borderColor: colors.primary, boxShadow: '0px 0px 0px 3px rgba(47, 107, 79, 0.14)' },
  inputIconTop: { marginTop: 13 },
  input: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 0,
    paddingVertical: spacing.sm + 2,
    color: colors.text,
    fontSize: 16,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top', paddingTop: spacing.md },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepperLabel: { flex: 1, fontSize: 16, color: colors.text },
  stepperControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
  },
  stepperValue: { minWidth: 28, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.text },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    minHeight: 36,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: '500', color: colors.text },
  chipTextSelected: { color: colors.primaryText, fontWeight: '600' },
  segmented: {
    flexDirection: 'row',
    padding: 3,
    gap: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    minHeight: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
  },
  segmentSmall: { minHeight: 30, paddingHorizontal: spacing.md },
  segmentSelected: { backgroundColor: colors.surface, boxShadow: '0px 1px 3px rgba(74, 52, 30, 0.14)' },
  segmentText: { fontSize: 14, fontWeight: '500' },
  segmentTextSmall: { fontSize: 13 },
  segmentTextSelected: { fontWeight: '700' },
  sectionTitle: { fontFamily: fonts.display, fontSize: 21, lineHeight: 27, color: colors.text, marginTop: spacing.lg },
  hint: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  card: {
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardTitle: { flex: 1, fontFamily: fonts.display, fontSize: 19, lineHeight: 25, color: colors.text },
  iconCircle: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.display },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    // Nie breiter als der Platz; langer Text bricht in der Pille um.
    maxWidth: '100%',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  tagText: { flexShrink: 1, fontSize: 12.5, fontWeight: '600' },
  notice: { flexDirection: 'row', gap: spacing.md, padding: spacing.md + 2, borderRadius: radius.md },
  noticeBody: { flex: 1, gap: spacing.xs },
  noticeTitle: { fontSize: 15, fontWeight: '700' },
  noticeText: { fontSize: 15, lineHeight: 21, color: colors.text },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
  emptyTitle: { fontFamily: fonts.display, fontSize: 21, lineHeight: 27, color: colors.text, marginTop: spacing.sm, textAlign: 'center' },
  emptyText: { fontSize: 15, lineHeight: 21, color: colors.textMuted, textAlign: 'center' },
  progressTrack: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceSunken, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primary },
});
