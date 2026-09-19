import raw from '@/data/regions.json';

import type { RegionSetId } from '@/constants/categories';
import { countryByCode, type Country } from '@/lib/countries';

export type Region = {
  /** ISO 3166-2 (« US-CA », « FR-BRE »), sert aussi de clé dans les contours. */
  code: string;
  name: string;
  nameAliases: string[];
  /** Absente pour les municipalités chinoises, qui sont leur propre capitale. */
  capital: string | null;
};

/** Un pays du mode « États », et la façon de parler de ses régions. */
export type RegionSet = {
  country: Country;
  /** « État », « Région » : l'étiquette du champ de réponse. */
  label: string;
  /** « États », « régions » : ce que compte la carte de l'accueil. */
  plural: string;
  /** « Quel est l'État surligné ? » */
  prompt: string;
  /** « capitale », ou « chef-lieu » pour les régions françaises. */
  capitalLabel: string;
  regions: Region[];
};

type RawSet = Omit<RegionSet, 'country'> & { country: string };

const SETS = new Map(
  Object.entries(raw as Record<RegionSetId, RawSet>).map(([id, set]) => {
    const country = countryByCode(set.country);
    if (!country) throw new Error(`regions.json : pays inconnu ${set.country}`);
    return [id as RegionSetId, { ...set, country }];
  }),
);

export function regionSet(id: RegionSetId): RegionSet {
  const set = SETS.get(id);
  if (!set) throw new Error(`regions.json : aucune région pour ${id}`);
  return set;
}
