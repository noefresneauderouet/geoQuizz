/**
 * Plusieurs zones à la fois.
 *
 * On peut jouer un mélange de continents — l'Afrique et l'Europe, par
 * exemple : les questions sont tirées dans leurs pays réunis. Un mélange
 * s'écrit comme une zone, ses continents liés par une virgule dans l'ordre de
 * CATEGORIES (« afrique,europe ») : c'est ce que portent l'adresse de la
 * partie, les records de l'appareil, la dernière partie et les salles.
 *
 * Le monde ne se mélange pas : il contient déjà tout. Les cinq continents
 * ensemble, c'est donc le monde, et la manche se joue comme telle — classement
 * compris. Les autres mélanges n'ont pas de classement en ligne : leurs
 * records restent sur l'appareil.
 *
 * Le mode États ne se mélange pas non plus : on y choisit un seul pays.
 */
import {
  CATEGORIES,
  getCategory,
  type Category,
  type CategoryId,
  type ContinentId,
  type MixId,
  type ModeId,
  type PlayId,
} from '@/constants/categories';

const SEPARATOR = ',';

const CONTINENTS: readonly ContinentId[] = CATEGORIES.flatMap((c) =>
  c.id === 'monde' ? [] : [c.id],
);

export function isContinent(id: string): id is ContinentId {
  return CONTINENTS.includes(id as ContinentId);
}

export function isMix(id: PlayId): id is MixId {
  return id.includes(SEPARATOR);
}

/** Les continents d'un mélange ; une catégorie seule, sinon. */
export function zonesOf(id: PlayId): CategoryId[] {
  return id.split(SEPARATOR) as CategoryId[];
}

/**
 * Le mélange de ces continents, remis dans l'ordre et sans doublon. Un seul
 * continent redonne sa zone ; aucun, ou les cinq, le monde.
 */
export function mixOf(zones: readonly ContinentId[]): PlayId {
  const chosen = CONTINENTS.filter((id) => zones.includes(id));
  if (chosen.length === 0 || chosen.length === CONTINENTS.length) return 'monde';
  return chosen.join(SEPARATOR) as PlayId;
}

/**
 * Ce qu'on joue, d'après une adresse : une catégorie (`getCategory`), ou un
 * mélange de continents. Ce qui ne se lit pas retombe comme `getCategory` :
 * sur le monde, ou sur le premier pays en mode États.
 */
export function parsePlay(value: string | null | undefined, mode?: ModeId): PlayId {
  if (value && mode !== 'etats' && value.includes(SEPARATOR)) {
    const parts = value.split(SEPARATOR);
    if (parts.every(isContinent)) return mixOf(parts);
  }
  return getCategory(value ?? undefined, mode).id;
}

/** Vrai si cette zone fait partie de ce qu'on joue. */
export function isChosen(play: PlayId, id: CategoryId): boolean {
  return zonesOf(play).includes(id);
}

/**
 * Un appui sur une zone, à l'accueil ou dans les réglages d'une salle. Le
 * monde, comme un pays du mode États, se choisit seul. Un continent s'ajoute
 * aux continents déjà choisis, ou s'en retire ; sans plus aucun, on revient
 * au monde.
 */
export function toggleZone(play: PlayId, id: CategoryId): PlayId {
  if (!isContinent(id)) return id;
  const chosen = zonesOf(play).filter(isContinent);
  return mixOf(chosen.includes(id) ? chosen.filter((z) => z !== id) : [...chosen, id]);
}

/**
 * De quoi afficher ce qu'on joue : la catégorie elle-même, ou pour un
 * mélange, celle du monde — sa photo, ses couleurs, sa carte — sous les noms
 * et les emojis de ses continents mis bout à bout.
 */
export function playCategory(play: PlayId): Category {
  if (!isMix(play)) return getCategory(play);
  const zones = zonesOf(play).map((id) => getCategory(id));
  const [world] = CATEGORIES;
  return {
    ...world,
    id: play,
    label: zones.map((z) => z.label).join(' + '),
    tagline: `${zones.length} continents mélangés`,
    emoji: zones.map((z) => z.emoji).join(''),
    gradient: zones.map((z) => z.accent) as [string, string, ...string[]],
  };
}

/**
 * Les mélanges dont ces clés de records parlent (`afrique,europe:drapeau:10`,
 * voir progress.ts), chacun une fois, dans l'ordre où l'accueil les propose.
 */
export function mixesIn(keys: readonly string[]): MixId[] {
  const mixes = new Set<MixId>();
  for (const key of keys) {
    const [play] = key.split(':');
    if (play && parsePlay(play) === play && isMix(play as PlayId)) mixes.add(play as MixId);
  }
  const rank = (mix: MixId) => zonesOf(mix).map((id) => CONTINENTS.indexOf(id as ContinentId));
  return [...mixes].sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    for (let i = 0; i < Math.min(ra.length, rb.length); i++) {
      if (ra[i] !== rb[i]) return ra[i] - rb[i];
    }
    return ra.length - rb.length;
  });
}
