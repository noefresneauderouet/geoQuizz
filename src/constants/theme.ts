/**
 * Direction artistique GeoLearn : vert, bleu, jaune, marron clair.
 *
 * Deux jeux de couleurs, clair et sombre, sous les mêmes noms. Le thème suit
 * le réglage de l'appareil, sauf si le profil en impose un (voir
 * src/components/theme-selector.tsx). Les fonds de catégorie, eux, ne changent
 * pas : ils sont l'identité de la zone, et le texte posé dessus reste blanc.
 *
 * Ces palettes sont la **seule** source de vérité. Le CSS ne les recopie pas :
 * `paletteVariables()` en dérive les variables `--green`, `--sand`… que le
 * layout racine écrit dans le document (voir src/app/layout.tsx). Modifier une
 * couleur ici la change partout, feuilles de style comprises.
 */

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
  dangerLight: '#F7D9D4',

  /** Texte posé sur un aplat de couleur : bouton, dégradé de zone. */
  onColor: '#FFFFFF',
  /** Texte posé sur le jaune, trop clair pour du blanc. */
  onYellow: '#3A2E22',

  /** Ombre des cartes, et voile derrière une boîte de dialogue. */
  shadow: 'rgb(122 74 43 / 18%)',
  backdrop: 'rgb(58 46 34 / 55%)',
} as const;

/**
 * Le thème sombre, clé pour clé.
 *
 * Les rôles se retournent : `*Light` reste la teinte de fond d'un bandeau,
 * devenue profonde, et `*Dark` le texte qu'on y pose, devenu clair. Le vert
 * et le rouge sont à mi-chemin, parce qu'ils servent à la fois de texte sur
 * les cartes et de fond sous un texte blanc.
 */
export const DarkPalette: { readonly [K in keyof typeof Palette]: string } = {
  green: '#379663',
  greenDark: '#9AE6B4',
  greenLight: '#1D3B2D',

  blue: '#7AA7D9',
  blueDark: '#BEE3F8',
  blueLight: '#1C2E42',

  yellow: '#E9B44C',
  yellowDark: '#F0B35E',
  yellowLight: '#3A2E1C',

  brown: '#D19A74',
  brownDark: '#E6C3A1',
  brownLight: '#3A2E25',

  sand: '#17130F',
  card: '#241E18',
  ink: '#F3EADF',
  inkSoft: '#B3A290',
  border: '#3B3128',
  danger: '#DC5A4E',
  dangerLight: '#46211D',

  onColor: '#FFFFFF',
  onYellow: '#3A2E22',

  shadow: 'rgb(0 0 0 / 45%)',
  backdrop: 'rgb(0 0 0 / 60%)',
};

/**
 * Le réglage du profil. `system` suit l'appareil ; les deux autres
 * l'emportent sur lui.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

/** Clé du stockage local, lue aussi par le script d'amorçage du layout. */
export const THEME_KEY = 'geolearn.theme.v1';

/** `greenLight` -> `--green-light` */
const toVariableName = (key: string) => `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

const declarations = (palette: Record<string, string>, indent: string) =>
  Object.entries(palette)
    .map(([key, value]) => `${indent}${toVariableName(key)}: ${value};`)
    .join('\n');

/**
 * Les deux palettes en variables CSS, prêtes à être injectées.
 *
 * Le sombre s'applique quand `<html>` porte `data-theme="dark"`, ou quand
 * l'appareil le demande et que le profil n'a pas imposé le clair. Aucun
 * attribut, c'est le réglage `system`.
 *
 * Rendu à la construction par un composant serveur : il part dans le HTML
 * statique, donc les couleurs s'appliquent dès la première image, sans
 * attendre le JavaScript.
 */
export function paletteVariables(): string {
  return `:root {
${declarations(Palette, '  ')}
  color-scheme: light;
}

:root[data-theme='dark'] {
${declarations(DarkPalette, '  ')}
  color-scheme: dark;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
${declarations(DarkPalette, '    ')}
    color-scheme: dark;
  }
}`;
}

/** Couleur de la barre d'outils du navigateur et du manifeste. */
export const THEME_COLOR = Palette.green;

/** Fond de l'app, repris par le manifeste pour l'écran de lancement. */
export const BACKGROUND_COLOR = Palette.sand;
