import {
  addMember,
  createId,
  listMembers,
  MEALS,
  MEMBER_DIETS,
  removeMember,
  updateMember,
  type MemberDiet,
  type RowWrite,
} from '@zauberjournal/core';
import { useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { applyWrites } from '@/data/recipes';
import { useStore, useTable, useValue } from '@/data/store';
import { confirm } from '@/lib/confirm';
import { colors, spacing, tones } from '@/theme';

import { MEAL_ICONS } from './category-style';
import { Icon } from './icon';
import { AddField, Avatar, Card, Hint, IconButton, SectionTitle, Segmented, TextField, type SegmentOption } from './ui';

const DIET_OPTIONS: SegmentOption<MemberDiet>[] = MEMBER_DIETS.map((diet) => ({
  ...diet,
  color: diet.id === 'omnivore' ? undefined : tones.green.foreground,
}));

function MealSwitch({ meal, divider }: { meal: (typeof MEALS)[number]; divider: boolean }) {
  const store = useStore();
  const value = useValue(meal.setting);
  return (
    <View style={[styles.switchRow, divider && styles.divider]}>
      <Icon name={MEAL_ICONS[meal.id]} size={22} color={colors.textMuted} />
      <Text style={styles.switchLabel}>{meal.label}</Text>
      <Switch
        accessibilityLabel={`${meal.label} im Plan zeigen`}
        value={value}
        onValueChange={(next) => {
          store?.setValue(meal.setting, next);
        }}
        trackColor={{ true: colors.primary, false: colors.borderStrong }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

/** Personen des Haushalts und Mahlzeiten im Plan; gilt für alle Geräte des Haushalts. */
export function HouseholdSettings() {
  const store = useStore();
  const membersTable = useTable('members');
  const members = useMemo(() => listMembers({ members: membersTable }), [membersTable]);
  const [name, setName] = useState('');

  const write = (writes: RowWrite[]) => {
    if (store && writes.length > 0) applyWrites(store, writes);
  };
  const add = () => {
    if (!name.trim()) return;
    write(addMember({ members: membersTable }, name, 'omnivore', createId).writes);
    setName('');
  };
  const remove = async (memberId: string, memberName: string) => {
    const message = `${memberName || 'Diese Person'} isst danach bei keinem Gericht mehr mit.`;
    if (await confirm('Person entfernen?', message, 'Entfernen')) write(removeMember(memberId, Date.now()));
  };

  return (
    <>
      <SectionTitle>Personen</SectionTitle>
      <Hint>Wer im Haushalt mitisst. Wer vegetarisch isst, bekommt im Plan automatisch die vegetarische Option.</Hint>
      {members.map((member) => (
        <Card key={member.id} style={styles.member}>
          <View style={styles.memberRow}>
            <Avatar name={member.name || '?'} toneKey={member.id} />
            <TextField
              accessibilityLabel="Name"
              value={member.name}
              onChangeText={(next) => write(updateMember({ members: membersTable }, member.id, { name: next }))}
              placeholder="Name"
              containerStyle={styles.grow}
            />
            <IconButton
              icon="close"
              variant="muted"
              accessibilityLabel={`${member.name} entfernen`}
              onPress={() => void remove(member.id, member.name)}
            />
          </View>
          <Segmented
            small
            options={DIET_OPTIONS}
            value={member.diet}
            labelPrefix={`${member.name}: `}
            onChange={(diet) => write(updateMember({ members: membersTable }, member.id, { diet }))}
          />
        </Card>
      ))}
      <AddField accessibilityLabel="Neue Person" value={name} onChangeText={setName} onAdd={add} placeholder="Name, z. B. Anna" />

      <SectionTitle>Mahlzeiten im Plan</SectionTitle>
      <Card style={styles.meals}>
        {MEALS.map((meal, index) => (
          <MealSwitch key={meal.id} meal={meal} divider={index > 0} />
        ))}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  member: { padding: spacing.md },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grow: { flex: 1 },
  meals: { paddingVertical: spacing.xs, gap: 0 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm + 2 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  switchLabel: { flex: 1, fontSize: 16, color: colors.text },
});
