import { ThemeProvider, type Theme } from 'expo-router';
import { DefaultTheme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { Palette } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

/** GeoLearn assume un thème clair unique : la couleur vient des catégories. */
const GeoLearnTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Palette.green,
    background: Palette.sand,
    card: Palette.card,
    text: Palette.ink,
    border: Palette.border,
    notification: Palette.yellowDark,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={GeoLearnTheme}>
      <StatusBar style="dark" />
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}
