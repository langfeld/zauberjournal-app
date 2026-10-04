import { emptyRecipeDraft } from '@zauberjournal/core';
import { useState } from 'react';

import { RecipeEditor } from '@/components/recipe-editor';

export default function NewRecipeScreen() {
  const [draft] = useState(emptyRecipeDraft);
  return <RecipeEditor recipeId={null} initialDraft={draft} />;
}
