import { Stack } from 'expo-router';

import { Palette } from '@/constants/theme';

/**
 * Pile interne à l'onglet « Apprendre » : l'accueil, puis l'écran de jeu
 * poussé par-dessus. Les onglets restent au nombre de deux.
 */
export default function ApprendreLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Palette.sand },
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="quiz" options={{ animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
