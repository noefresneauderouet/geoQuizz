import { Palette } from '@/constants/theme';

export type CategoryId = 'monde' | 'afrique' | 'amerique' | 'asie' | 'europe' | 'oceanie';

export type Category = {
  id: CategoryId;
  label: string;
  /** Sous-titre affiché sur la carte de la catégorie. */
  tagline: string;
  emoji: string;
  /** Dégradé affiché tant qu'aucune photo n'est déposée (et derrière la photo). */
  gradient: readonly [string, string, ...string[]];
  /** Couleur d'accent : boutons, bordure du segment, focus du champ de réponse. */
  accent: string;
  /** Voile posé sur la photo pour garder le texte lisible. */
  scrim: string;
  /** Teinte de la carte du monde en mode « Pays ». */
  map: { land: string; highlight: string; stroke: string };
  /** Photo de fond optionnelle, servie depuis public/categories/. */
  photo: string | null;
};

/**
 * Photos de fond.
 *
 * Dépose simplement tes images dans public/categories/ :
 *   public/categories/monde.jpg
 *   public/categories/afrique.jpg   (etc.)
 *
 * puis dé-commente la ligne correspondante ci-dessous. Tant qu'une ligne
 * reste commentée, la catégorie affiche son dégradé — aucun autre code à
 * toucher. Pense à relancer la construction : le service worker précache la
 * liste exacte des fichiers produits.
 */
const PHOTOS: Record<CategoryId, string | null> = {
  monde: null, // '/categories/monde.jpg',
  afrique: null, // '/categories/afrique.jpg',
  amerique: null, // '/categories/amerique.jpg',
  asie: null, // '/categories/asie.jpg',
  europe: null, // '/categories/europe.jpg',
  oceanie: null, // '/categories/oceanie.jpg',
};

export const CATEGORIES: readonly Category[] = [
  {
    id: 'monde',
    label: 'Monde',
    tagline: 'Tous les pays, tous les continents',
    emoji: '🌍',
    gradient: [Palette.green, Palette.blue, Palette.yellowDark],
    accent: Palette.blue,
    scrim: 'rgba(33, 64, 95, 0.55)',
    map: { land: Palette.brownLight, highlight: Palette.yellow, stroke: Palette.brownDark },
    photo: PHOTOS.monde,
  },
  {
    id: 'afrique',
    label: 'Afrique',
    tagline: 'Savanes, déserts et grands fleuves',
    emoji: '🦁',
    gradient: [Palette.yellow, Palette.yellowDark],
    accent: Palette.yellowDark,
    scrim: 'rgba(122, 74, 43, 0.5)',
    map: { land: Palette.brownLight, highlight: Palette.yellowDark, stroke: Palette.brownDark },
    photo: PHOTOS.afrique,
  },
  {
    id: 'amerique',
    label: 'Amérique',
    tagline: "De l'Alaska à la Terre de Feu",
    emoji: '🗽',
    gradient: [Palette.green, Palette.greenDark],
    accent: Palette.green,
    scrim: 'rgba(30, 92, 66, 0.5)',
    map: { land: Palette.brownLight, highlight: Palette.green, stroke: Palette.brownDark },
    photo: PHOTOS.amerique,
  },
  {
    id: 'asie',
    label: 'Asie',
    tagline: 'Le plus vaste continent',
    emoji: '🏯',
    gradient: [Palette.brown, Palette.brownDark],
    accent: Palette.brown,
    scrim: 'rgba(122, 74, 43, 0.5)',
    map: { land: Palette.brownLight, highlight: Palette.brownDark, stroke: Palette.brownDark },
    photo: PHOTOS.asie,
  },
  {
    id: 'europe',
    label: 'Europe',
    tagline: 'Petits pays, grandes capitales',
    emoji: '🏰',
    gradient: [Palette.blue, Palette.blueDark],
    accent: Palette.blue,
    scrim: 'rgba(33, 64, 95, 0.5)',
    map: { land: Palette.brownLight, highlight: Palette.blue, stroke: Palette.brownDark },
    photo: PHOTOS.europe,
  },
  {
    id: 'oceanie',
    label: 'Océanie',
    tagline: 'Îles du Pacifique',
    emoji: '🏝️',
    gradient: ['#2A9D8F', '#17706A'],
    accent: '#17706A',
    scrim: 'rgba(23, 112, 106, 0.5)',
    map: { land: Palette.brownLight, highlight: '#17706A', stroke: Palette.brownDark },
    photo: PHOTOS.oceanie,
  },
] as const;

export function getCategory(id: string | undefined): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
}

/* ------------------------------------------------------------------ */

export type ModeId = 'drapeau' | 'capitale' | 'pays';

export type Mode = {
  id: ModeId;
  label: string;
  /** Pluriel écrit en toutes lettres : « drapeaux », pas « drapeau » + s. */
  plural: string;
  emoji: string;
  /** Consigne affichée en haut de l'écran de jeu. */
  prompt: string;
};

export const MODES: readonly Mode[] = [
  {
    id: 'drapeau',
    label: 'Drapeau',
    plural: 'drapeaux',
    emoji: '🏳️',
    prompt: 'À quel pays appartient ce drapeau ?',
  },
  {
    id: 'capitale',
    label: 'Capitale',
    plural: 'capitales',
    emoji: '📍',
    prompt: 'Quelle est la capitale ?',
  },
  { id: 'pays', label: 'Pays', plural: 'pays', emoji: '🗺️', prompt: 'Quel est le pays surligné ?' },
] as const;

export function getMode(id: string | undefined): Mode {
  return MODES.find((m) => m.id === id) ?? MODES[0];
}
