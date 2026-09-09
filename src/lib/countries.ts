import raw from '@/data/countries.json';

import type { CategoryId } from '@/constants/categories';

export type Country = {
  /** ISO 3166-1 alpha-2, sert aussi à charger le drapeau. */
  code: string;
  /** ISO 3166-1 numérique, sert de clé dans la carte world-atlas. */
  numeric: string;
  name: string;
  nameAliases: string[];
  capital: string;
  capitalAliases: string[];
  continent: Exclude<CategoryId, 'monde'>;
  /** [latitude, longitude] — sert à poser le repère quand la carte n'a pas de forme. */
  latlng: [number, number];
  area: number;
};

export const COUNTRIES = raw as Country[];

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function countryByCode(code: string): Country | undefined {
  return BY_CODE.get(code);
}

/** Les pays d'une catégorie ; « monde » renvoie tout. */
export function countriesOf(category: CategoryId): Country[] {
  if (category === 'monde') return COUNTRIES;
  return COUNTRIES.filter((c) => c.continent === category);
}

/** Emoji drapeau dérivé du code ISO (fallback si l'image ne charge pas). */
export function flagEmoji(code: string): string {
  return String.fromCodePoint(
    ...code.toUpperCase().split('').map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)
  );
}

/** Image du drapeau ; le service worker en garde une copie (scripts/service-worker.js). */
export function flagUrl(code: string, width: 160 | 320 | 640 = 320): string {
  return `https://flagcdn.com/w${width}/${code.toLowerCase()}.png`;
}
