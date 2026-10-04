import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, spacing } from '@/theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  small?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
};

const buttonColors: Record<ButtonVariant, { background: string; text: string; border: string }> = {
  primary: { background: colors.primary, text: colors.primaryText, border: colors.primary },
  secondary: { background: colors.surface, text: colors.primary, border: colors.border },
  ghost: { background: 'transparent', text: colors.primary, border: 'transparent' },
  danger: { background: colors.surface, text: colors.danger, border: colors.danger },
};

export function Button({ title, onPress, variant = 'primary', small, disabled, accessibilityLabel }: ButtonProps) {
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
        { backgroundColor: palette.background, borderColor: palette.border },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <Text style={[styles.buttonText, small && styles.buttonTextSmall, { color: palette.text }]}>{title}</Text>
    </Pressable>
  );
}

type TextFieldProps = TextInputProps & { label?: string };

export function TextField({ label, style, multiline, ...props }: TextFieldProps) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        style={[styles.input, multiline && styles.inputMultiline, style]}
        {...props}
      />
    </View>
  );
}

type StepperProps = {
  label: string;
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
  canDecrease?: boolean;
  canIncrease?: boolean;
};

export function Stepper({ label, value, onDecrease, onIncrease, canDecrease = true, canIncrease = true }: StepperProps) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <Button
        small
        variant="secondary"
        title="−"
        accessibilityLabel={`${label}: weniger`}
        disabled={!canDecrease}
        onPress={onDecrease}
      />
      <Text style={styles.stepperValue} accessibilityLabel={`${label}: ${value}`}>
        {value}
      </Text>
      <Button
        small
        variant="secondary"
        title="+"
        accessibilityLabel={`${label}: mehr`}
        disabled={!canIncrease}
        onPress={onIncrease}
      />
    </View>
  );
}

type ChipProps = { label: string; selected: boolean; onPress: () => void; accessibilityLabel?: string };

export function Chip({ label, selected, onPress, accessibilityLabel }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Hint({ children }: { children: ReactNode }) {
  return <Text style={styles.hint}>{children}</Text>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSmall: {
    minHeight: 36,
    minWidth: 36,
    paddingHorizontal: spacing.md,
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  buttonTextSmall: { fontSize: 15 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.35 },
  field: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  input: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
  },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepperLabel: { flex: 1, fontSize: 16, color: colors.text },
  stepperValue: { minWidth: 28, textAlign: 'center', fontSize: 18, fontWeight: '600', color: colors.text },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { fontSize: 14, color: colors.text },
  chipTextSelected: { color: colors.primary, fontWeight: '600' },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: spacing.lg },
  hint: { fontSize: 14, color: colors.textMuted },
  card: {
    padding: spacing.md,
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
