/**
 * Génère src/data/countries.json à partir de `world-countries` (npm) :
 * nom FR corrigé, capitale FR, continent, alias acceptés, coordonnées.
 *
 * Les 194 pays sont jouables dans les trois modes. En mode « Pays », ceux qui
 * sont trop petits pour se voir sur la carte reçoivent un cercle de repérage,
 * posé sur `latlng` quand le fond de carte n'a carrément aucune forme pour eux.
 *
 * Usage : npm run generate-countries
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const world = require('world-countries');
// Même fond de carte que src/components/world-map.tsx : Natural Earth 1:50m.
const atlas = require('world-atlas/countries-50m.json');

const REGION_TO_CONTINENT = {
  Africa: 'afrique',
  Americas: 'amerique',
  Asia: 'asie',
  Europe: 'europe',
  Oceania: 'oceanie',
};

/** Capitales dont le nom français diffère de celui fourni par world-countries. */
const CAPITALS_FR = {
  // Afrique
  DZ: 'Alger', EG: 'Le Caire', ET: 'Addis-Abeba', SO: 'Mogadiscio',
  SZ: 'Mbabane', LY: 'Tripoli', SS: 'djouba',
  // Amériques
  CU: 'La Havane', MX: 'Mexico', GT: 'Guatemala', PA: 'Panama',
  US: 'Washington', TT: "Port-d'Espagne", GD: 'Saint-Georges',
  AG: "Saint-John's",
  // Asie
  CN: 'Pékin', IL: 'Jérusalem', IQ: 'Bagdad', IR: 'Téhéran', KR: 'Séoul',
  KW: 'Koweït', MN: 'Oulan-Bator', NP: 'Katmandou', SA: 'Riyad',
  SY: 'Damas', YE: 'Sanaa', LB: 'Beyrouth', AF: 'Kaboul', AM: 'Erevan',
  AZ: 'Bakou', GE: 'Tbilissi', KG: 'Bichkek', TJ: 'Douchanbé',
  TM: 'Achgabat', UZ: 'Tachkent', BD: 'Dacca', BT: 'Thimphou',
  OM: 'Mascate', PH: 'Manille', SG: 'Singapour', VN: 'Hanoï',
  AE: 'Abou Dabi', MM: 'Naypyidaw',
  // Europe
  AT: 'Vienne', BE: 'Bruxelles', CH: 'Berne', CY: 'Nicosie',
  DK: 'Copenhague', GB: 'Londres', GR: 'Athènes', MD: 'Chisinau',
  PL: 'Varsovie', PT: 'Lisbonne', RO: 'Bucarest', RU: 'Moscou',
  SM: 'Saint-Marin', UA: 'Kiev', VA: 'Cité du Vatican',
  AD: 'Andorre-la-Vieille', MT: 'La Valette',
  // Océanie
  KI: 'Tarawa', VU: 'Port-Vila',
};

/** Autres capitales acceptées (sièges de gouvernement, anciens noms, graphies). */
const CAPITAL_ALIASES = {
  BO: ['La Paz'],
  ZA: ['Le Cap', 'Bloemfontein', 'Cape Town'],
  CI: ['Abidjan'],
  BJ: ['Cotonou'],
  SZ: ['Lobamba'],
  NL: ['La Haye'],
  LK: ['Sri Jayawardenepura Kotte', 'Kotte'],
  TZ: ['Dar es Salaam'],
  MM: ['Nay Pyi Taw', 'Rangoun', 'Yangon'],
  UA: ['Kyiv'],
  MD: ['Chișinău'],
  TT: ['Port of Spain'],
  IL: ['Tel Aviv'],
  BI: ['Bujumbura'],
  ME: ['Cetinje'],
  KZ: ['Noursoultan', 'Nur-Sultan'],
  VA: ['Vatican'],
  US: ['Washington DC', 'Washington D.C.'],
};

/** Noms de pays FR corrigés (world-countries a quelques libellés bancals). */
const NAMES_FR = {
  CV: 'Cap-Vert', MU: 'Maurice', SZ: 'Eswatini', PW: 'Palaos',
  CD: 'République démocratique du Congo', CG: 'République du Congo',
  SR: 'Suriname', SV: 'Salvador', NG: 'Nigeria', ST: 'Sao Tomé-et-Principe',
  TL: 'Timor oriental', VA: 'Vatican', MM: 'Birmanie',
};

/** Réponses alternatives acceptées pour le nom du pays. */
const NAME_ALIASES = {
  US: ['USA', 'Etats-Unis', "Etats-Unis d'Amerique", 'Amerique'],
  GB: ['Angleterre', 'UK', 'Grande-Bretagne', 'Great Britain'],
  NL: ['Hollande'],
  CD: ['RDC', 'Congo-Kinshasa', 'Congo Kinshasa', 'Zaire'],
  CG: ['Congo', 'Congo-Brazzaville', 'Congo Brazzaville'],
  CF: ['Centrafrique'],
  CZ: ['République tchèque', 'Tchequie'],
  MK: ['Macédoine'],
  MM: ['Myanmar'],
  TR: ['Türkiye', 'Turkiye'],
  KN: ['Saint-Kitts-et-Nevis', 'Saint-Kitts'],
  VA: ['Cité du Vatican', 'Saint-Siège'],
  SV: ['El Salvador'],
  VN: ['Vietnam', 'Viet Nam'],
  KR: ['Corée', 'Coree du sud'],
  AE: ['Emirats arabes unis', 'EAU'],
  DO: ['Saint-Domingue'],
  LA: ['Laos'],
  IR: ['Perse'],
  NZ: ['Nouvelle Zelande'],
  CI: ['Cote Ivoire', 'Ivory Coast'],
  TL: ['Timor-Leste','timor'],
  BY: ['Bélarus', 'Belarus'],
};

const countries = world
  .filter((c) => c.unMember || c.cca2 === 'VA')
  .map((c) => {
    const name = NAMES_FR[c.cca2] ?? c.translations.fra.common;
    const capital = CAPITALS_FR[c.cca2] ?? c.capital?.[0] ?? null;
    return {
      code: c.cca2,
      numeric: c.ccn3,
      name,
      nameAliases: NAME_ALIASES[c.cca2] ?? [],
      capital,
      capitalAliases: CAPITAL_ALIASES[c.cca2] ?? [],
      continent: REGION_TO_CONTINENT[c.region],
      latlng: c.latlng,
      area: c.area,
    };
  })
  .filter((c) => c.continent && c.capital)
  .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

writeFileSync(
  new URL('../src/data/countries.json', import.meta.url),
  JSON.stringify(countries, null, 0) + '\n',
  'utf8'
);

const byContinent = countries.reduce((acc, c) => {
  acc[c.continent] = (acc[c.continent] ?? 0) + 1;
  return acc;
}, {});
console.log(`${countries.length} pays écrits dans src/data/countries.json`);
console.log(byContinent);

// Diagnostic : ces pays n'ont aucune forme dans le fond de carte, donc la carte
// s'appuie sur leurs coordonnées et l'anneau est leur seule représentation.
const drawable = new Set(
  feature(atlas, atlas.objects.countries).features.map((f) => String(f.id))
);
const pointOnly = countries.filter((c) => !drawable.has(c.numeric));
console.log(
  pointOnly.length
    ? `repérés au point seul (${pointOnly.length}) : ${pointOnly.map((c) => c.name).join(', ')}`
    : 'tous les pays ont une forme sur la carte'
);
