/**
 * Direction artistique GeoLearn : vert, bleu, jaune, marron clair.
 * L'app assume un rendu clair unique (les fonds photo/dégradés portent la couleur),
 * ce qui garantit un contraste stable quel que soit le réglage système.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Palette = {
  /** Verts — nature, bonnes réponses */
  green: '#2F855A',
  greenDark: '#1E5C42',
  greenLight: '#9AE6B4',

  /** Bleus — océan, navigation */
  blue: '#3D6FA6',
  blueDark: '#21405F',
  blueLight: '#BEE3F8',

  /** Jaunes — soleil, accent, score */
  yellow: '#E9B44C',
  yellowDark: '#C97B24',
  yellowLight: '#FAECC8',

  /** Marrons clairs — terre, papier, cartes */
  brown: '#B0714A',
  brownDark: '#7A4A2B',
  brownLight: '#E8D9C5',

  /** Neutres chauds */
  sand: '#FBF6EE',
  card: '#FFFFFF',
  ink: '#3A2E22',
  inkSoft: '#7C6A56',
  border: '#E3D5C1',
  danger: '#C0392B',
} as const;

export const Colors = {
  light: {
    text: Palette.ink,
    background: Palette.sand,
    backgroundElement: Palette.card,
    backgroundSelected: Palette.yellowLight,
    textSecondary: Palette.inkSoft,
  },
  dark: {
    text: Palette.ink,
    background: Palette.sand,
    backgroundElement: Palette.card,
    backgroundSelected: Palette.yellowLight,
    textSecondary: Palette.inkSoft,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 10,
  medium: 18,
  large: 28,
  pill: 999,
} as const;

/** Ombre douce et chaude, homogène sur toutes les cartes. */
export const Shadow = {
  card: Platform.select({
    ios: {
      shadowColor: Palette.brownDark,
      shadowOpacity: 0.18,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
    },
    android: { elevation: 5 },
    default: {
      boxShadow: `0 6px 14px ${Palette.brownDark}2E`,
    },
  }),
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
