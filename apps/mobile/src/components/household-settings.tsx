import { addMember, createId, listMembers, MEALS, MEMBER_DIETS, removeMember, updateMember, type RowWrite } from '@zauberjournal/core';
import { useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { applyWrites } from '@/data/recipes';
import { useStore, useTable, useValue } from '@/data/store';
import { confirm } from '@/lib/confirm';
import { colors, radius, spacing } from '@/theme';

import { Button, Chip, Hint, SectionTitle } from './ui';

function MealSwitch({ setting, label }: { setting: (typeof MEALS)[number]['setting']; label: string }) {
  const store = useStore();
  const value = useValue(setting);
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch
        accessibilityLabel={`${label} im Plan zeigen`}
        value={value}
        onValueChange={(next) => {
          store?.setValue(setting, next);
        }}
        trackColor={{ true: colors.primary, false: colors.border }}
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
        <View key={member.id} style={styles.member}>
          <View style={styles.memberRow}>
            <TextInput
              accessibilityLabel="Name"
              value={member.name}
              onChangeText={(next) => write(updateMember({ members: membersTable }, member.id, { name: next }))}
              placeholder="Name"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <Button
              small
              variant="ghost"
              title="✕"
              accessibilityLabel={`${member.name} entfernen`}
              onPress={() => void remove(member.id, member.name)}
            />
          </View>
          <View style={styles.chips}>
            {MEMBER_DIETS.map((diet) => (
              <Chip
                key={diet.id}
                label={diet.label}
                accessibilityLabel={`${member.name}: ${diet.label}`}
                selected={member.diet === diet.id}
                onPress={() => write(updateMember({ members: membersTable }, member.id, { diet: diet.id }))}
              />
            ))}
          </View>
        </View>
      ))}
      <View style={styles.memberRow}>
        <TextInput
          accessibilityLabel="Neue Person"
          value={name}
          onChangeText={setName}
          placeholder="Name, z. B. Anna"
          placeholderTextColor={colors.textMuted}
          returnKeyType="done"
          submitBehavior="submit"
          onSubmitEditing={add}
          style={styles.input}
        />
        <Button small variant="secondary" title="Hinzufügen" disabled={!name.trim()} onPress={add} />
      </View>

      <SectionTitle>Mahlzeiten im Plan</SectionTitle>
      <View style={styles.meals}>
        {MEALS.map((meal) => (
          <MealSwitch key={meal.id} setting={meal.setting} label={meal.label} />
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  member: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  meals: {
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  switchLabel: { fontSize: 16, color: colors.text },
});
