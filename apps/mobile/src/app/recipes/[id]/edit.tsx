import { buildRecipeView, recipeViewToDraft } from '@zauberjournal/core';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { NotFound } from '@/components/not-found';
import { RecipeEditor } from '@/components/recipe-editor';
import { useRecipeTables } from '@/data/recipes';

export default function EditRecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tables = useRecipeTables();
  const [draft] = useState(() => {
    const view = buildRecipeView(tables, id);
    return view ? recipeViewToDraft(view) : null;
  });

  if (!draft) return <NotFound />;
  return <RecipeEditor recipeId={id} initialDraft={draft} />;
}
