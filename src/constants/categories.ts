import { Palette } from '@/constants/theme';

/** Les zones des modes Drapeau, Capitale et Pays : le monde, ou un continent. */
export type ZoneId = 'monde' | 'afrique' | 'amerique' | 'asie' | 'europe' | 'oceanie';
export type ContinentId = Exclude<ZoneId, 'monde'>;

/** Les pays du mode « États », dont on cherche les régions (src/data/regions.json). */
export type RegionSetId = 'etats-unis' | 'france' | 'espagne' | 'chine';

/** Une zone, ou le pays dont on cherche les régions. */
export type CategoryId = ZoneId | RegionSetId;

/**
 * Plusieurs continents joués ensemble, liés par une virgule dans l'ordre de
 * CATEGORIES : « afrique,europe » (voir src/lib/zones.ts).
 */
export type MixId = `${ContinentId},${string}`;

/** Ce qu'on joue : une catégorie, ou un mélange de continents. */
export type PlayId = CategoryId | MixId;

export type Category<Id extends PlayId = PlayId> = {
  id: Id;
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
  /** Teinte de la carte, en mode « Pays » comme en mode « États ». */
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
 * puis indique son chemin ci-dessous. Tant qu'elle vaut `null`, la catégorie
 * affiche son dégradé — aucun autre code à toucher. Pense à relancer la construction : le service worker précache la
 * liste exacte des fichiers produits.
 */
const PHOTOS: Record<CategoryId, string | null> = {
  monde: '/categories/monde.jpg',
  afrique: '/categories/afrique.jpg',
  amerique: '/categories/amerique.jpg',
  asie: '/categories/asie.jpg',
  europe: '/categories/europe.jpg',
  oceanie: '/categories/oceanie.jpg',
  'etats-unis': '/categories/etats-unis.jpg',
  france: '/categories/france.jpg',
  espagne: '/categories/espagne.jpg',
  chine: '/categories/chine.jpg',
};

export const CATEGORIES: readonly Category<ZoneId>[] = [
  {
    id: 'monde',
    label: 'Monde',
    tagline: 'Tous les pays, tous les continents',
    emoji: '🌍',
    gradient: [Palette.green, Palette.blue, Palette.yellowDark],
    accent: Palette.blue,
    scrim: 'rgba(33, 64, 95, 0.3)',
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
    scrim: 'rgba(122, 74, 43, 0.3)',
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
    scrim: 'rgba(30, 92, 66, 0.3)',
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
    scrim: 'rgba(122, 74, 43, 0.3)',
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
    scrim: 'rgba(33, 64, 95, 0.3)',
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
    scrim: 'rgba(23, 112, 106, 0.3)',
    map: { land: Palette.brownLight, highlight: '#17706A', stroke: Palette.brownDark },
    photo: PHOTOS.oceanie,
  },
] as const;

/**
 * Les pays du mode « États ». Leurs régions, et la façon d'en parler, sont
 * dans src/data/regions.json (voir scripts/generate-regions.mjs).
 */
export const REGION_SETS: readonly Category<RegionSetId>[] = [
  {
    id: 'etats-unis',
    label: 'États-Unis',
    tagline: 'De la Nouvelle-Angleterre à Hawaï',
    emoji: '🦅',
    gradient: ['#2E5A94', '#B03A48'],
    accent: '#2E5A94',
    scrim: 'rgba(46, 90, 148, 0.3)',
    map: { land: Palette.brownLight, highlight: '#2E5A94', stroke: Palette.brownDark },
    photo: PHOTOS['etats-unis'],
  },
  {
    id: 'france',
    label: 'France',
    tagline: 'Les treize régions de métropole',
    emoji: '🥐',
    gradient: ['#8E6CB8', '#5B3F87'],
    accent: '#6F52A0',
    scrim: 'rgba(91, 63, 135, 0.3)',
    map: { land: Palette.brownLight, highlight: '#6F52A0', stroke: Palette.brownDark },
    photo: PHOTOS.france,
  },
  {
    id: 'espagne',
    label: 'Espagne',
    tagline: 'De la Galice aux Baléares, Canaries comprises',
    emoji: '💃',
    gradient: ['#E07A3F', '#A8452A'],
    accent: '#C4572E',
    scrim: 'rgba(168, 69, 42, 0.3)',
    map: { land: Palette.brownLight, highlight: '#C4572E', stroke: Palette.brownDark },
    photo: PHOTOS.espagne,
  },
  {
    id: 'chine',
    label: 'Chine',
    tagline: 'Provinces, régions autonomes et municipalités',
    emoji: '🐉',
    gradient: ['#C23B3B', '#7D1F2B'],
    accent: '#B8323A',
    scrim: 'rgba(125, 31, 43, 0.3)',
    map: { land: Palette.brownLight, highlight: '#B8323A', stroke: Palette.brownDark },
    photo: PHOTOS.chine,
  },
] as const;

export function isRegionSet(id: PlayId): id is RegionSetId {
  return REGION_SETS.some((c) => c.id === id);
}

/** Ce qu'on peut jouer dans un mode : les pays pour « États », les zones sinon. */
export function categoriesFor(mode: ModeId): readonly Category<CategoryId>[] {
  return mode === 'etats' ? REGION_SETS : CATEGORIES;
}

/**
 * La catégorie d'une adresse. Avec un mode, elle doit lui correspondre — un
 * lien « France » en mode Drapeau retombe sur le monde, un lien « Europe » en
 * mode États sur le premier pays. Sans mode, toutes sont acceptées.
 *
 * Un mélange de continents n'en est pas une : il retombe aussi sur le monde.
 * C'est `parsePlay` (src/lib/zones.ts) qui le lit.
 */
export function getCategory(id: string | undefined, mode?: ModeId): Category<CategoryId> {
  const candidates = mode ? categoriesFor(mode) : [...CATEGORIES, ...REGION_SETS];
  return candidates.find((c) => c.id === id) ?? candidates[0];
}

/* ------------------------------------------------------------------ */

export type ModeId = 'drapeau' | 'capitale' | 'pays' | 'etats';

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
  {
    id: 'etats',
    label: 'États',
    plural: 'États et régions',
    emoji: '🧩',
    // La consigne exacte dépend du pays : « l'État », « la région »…
    prompt: 'Quelle est la région surlignée ?',
  },
] as const;

/** Les modes qui se jouent sur une zone, à l'inverse de « États ». */
export const ZONE_MODES = MODES.filter((m) => m.id !== 'etats');

export function getMode(id: string | undefined): Mode {
  return MODES.find((m) => m.id === id) ?? MODES[0];
}
