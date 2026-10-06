import type { Suggestion, SuggestionReasonKind } from '@zauberjournal/core';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, shadows, spacing, tones, type Tone } from '@/theme';

import type { IconName } from './icon';
import { RecipeThumbnail } from './recipe-photo';
import { Tag } from './ui';

const REASON_STYLES: Record<SuggestionReasonKind, { icon: IconName; tone: Tone }> = {
  expiring: { icon: 'schedule', tone: tones.ochre },
  leftover: { icon: 'kitchen', tone: tones.wheat },
  stock: { icon: 'kitchen', tone: tones.green },
  shopping: { icon: 'shopping_basket', tone: tones.teal },
  longAgo: { icon: 'event', tone: tones.sky },
  forAll: { icon: 'group', tone: tones.green },
  unsuitable: { icon: 'warning', tone: tones.rose },
  planned: { icon: 'today', tone: tones.stone },
};

type SuggestionCardProps = {
  suggestion: Suggestion;
  /** Tipp auf Foto und Titel */
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Rechts in der antippbaren Fläche, z. B. ein Plus */
  trailing?: ReactNode;
  /** Eigene Knöpfe rechts daneben, außerhalb der antippbaren Fläche */
  actions?: ReactNode;
};

/** Vorgeschlagenes Rezept mit Foto, Titel und den Gründen dafür. */
export function SuggestionCard({ suggestion, onPress, accessibilityLabel, trailing, actions }: SuggestionCardProps) {
  const content = (
    <>
      <RecipeThumbnail photoId={suggestion.photo} title={suggestion.title} size={52} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {suggestion.title}
        </Text>
        {suggestion.reasons.length > 0 ? (
          <View style={styles.reasons}>
            {suggestion.reasons.map((reason) => (
              <Tag key={`${reason.kind}:${reason.text}`} label={reason.text} {...REASON_STYLES[reason.kind]} />
            ))}
          </View>
        ) : null}
      </View>
      {trailing}
    </>
  );
  return (
    <View style={[styles.card, actions ? styles.withActions : null]}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? suggestion.title}
          onPress={onPress}
          style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
          {content}
        </Pressable>
      ) : (
        <View style={styles.main}>{content}</View>
      )}
      {actions}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  withActions: { paddingRight: spacing.sm + 2 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm + 2 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  text: { flex: 1, gap: spacing.xs + 2 },
  title: { fontFamily: fonts.display, fontSize: 16.5, lineHeight: 21, color: colors.text },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
