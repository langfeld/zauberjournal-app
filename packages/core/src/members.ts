import { activeSorted, changedCells, type RowWrite, type Table } from './rows.ts';
import { assignSortKeys } from './sort-keys.ts';

export type MemberDiet = 'omnivore' | 'vegetarian' | 'vegan';

export const MEMBER_DIETS: readonly { id: MemberDiet; label: string }[] = [
  { id: 'omnivore', label: 'isst alles' },
  { id: 'vegetarian', label: 'vegetarisch' },
  { id: 'vegan', label: 'vegan' },
];

export type MemberRow = { name: string; diet: MemberDiet; sortKey: string; deletedAt: number | null };

export type MemberView = { id: string; name: string; diet: MemberDiet };

type MemberTables = { members: Table<MemberRow> };

/** Personen des Haushalts in ihrer Reihenfolge. */
export function listMembers(tables: MemberTables): MemberView[] {
  return activeSorted(tables.members, () => true).map(([id, member]) => ({ id, name: member.name, diet: member.diet }));
}

export function addMember(
  tables: MemberTables,
  name: string,
  diet: MemberDiet,
  createId: () => string,
): { memberId: string; writes: RowWrite[] } {
  const existing = activeSorted(tables.members, () => true).map(([, member]) => member.sortKey);
  const sortKey = assignSortKeys([...existing, undefined]).at(-1)!;
  const memberId = createId();
  return {
    memberId,
    writes: [{ table: 'members', rowId: memberId, cells: { name: name.trim(), diet, sortKey, deletedAt: null } }],
  };
}

export function updateMember(tables: MemberTables, memberId: string, cells: Partial<Pick<MemberRow, 'name' | 'diet'>>): RowWrite[] {
  const write = changedCells('members', memberId, tables.members[memberId], cells);
  return write ? [write] : [];
}

export function removeMember(memberId: string, now: number): RowWrite[] {
  return [{ table: 'members', rowId: memberId, cells: { deletedAt: now } }];
}
