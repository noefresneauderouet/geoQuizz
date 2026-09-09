/**
 * Direction artistique GeoLearn : vert, bleu, jaune, marron clair.
 *
 * L'app assume un rendu clair unique — les fonds de catégorie portent la
 * couleur — ce qui garantit un contraste stable quel que soit le réglage
 * système.
 *
 * Cette palette est la **seule** source de vérité. Le CSS ne la recopie pas :
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
} as const;

/** `greenLight` -> `--green-light` */
const toVariableName = (key: string) => `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/**
 * Le bloc `:root` correspondant à la palette, prêt à être injecté.
 *
 * Rendu à la construction par un composant serveur : il part dans le HTML
 * statique, donc les couleurs s'appliquent dès la première image, sans
 * attendre le JavaScript.
 */
export function paletteVariables(): string {
  const lines = Object.entries(Palette).map(([key, value]) => `  ${toVariableName(key)}: ${value};`);
  return `:root {\n${lines.join('\n')}\n}`;
}

/** Couleur de la barre d'outils du navigateur et du manifeste. */
export const THEME_COLOR = Palette.green;

/** Fond de l'app, repris par le manifeste pour l'écran de lancement. */
export const BACKGROUND_COLOR = Palette.sand;
