import { useLocalSearchParams } from 'expo-router';

import { RecipeDetail } from '@/components/recipe-detail';

/** Rezept aus dem Plan heraus ansehen, z. B. einen Vorschlag; „Zurück“ bleibt so im Plan. */
export default function PlanRecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecipeDetail id={id} preview />;
}
