import { useLocalSearchParams } from 'expo-router';

import { RecipeDetail } from '@/components/recipe-detail';

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecipeDetail id={id} />;
}
