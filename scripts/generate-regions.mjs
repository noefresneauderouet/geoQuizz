/**
 * Génère les régions du mode « États » :
 *
 * - src/data/regions.json — pour chaque pays, ses régions (nom FR, variantes
 *   acceptées, capitale) et la façon d'en parler (« Quel est l'État surligné ? »).
 * - src/data/region-shapes.json — leurs contours, une topologie par pays.
 *
 * Les contours viennent de Natural Earth 1:10m, comme le fond de carte du
 * mode « Pays » (en 1:50m). Natural Earth découpe la France en départements
 * et l'Espagne en provinces : on les fusionne en régions et en communautés
 * autonomes. Le fichier source pèse 40 Mo ; il est téléchargé une fois et
 * gardé dans le dossier temporaire du système.
 *
 * Ajouter un pays : une entrée dans SETS ci-dessous, sa catégorie dans
 * src/constants/categories.ts, sa projection dans src/components/region-map.tsx.
 *
 * Usage : npm run generate-regions
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { merge, quantize } from 'topojson-client';
import { topology } from 'topojson-server';
import {
  filter,
  filterWeight,
  presimplify,
  simplify,
  sphericalRingArea,
  sphericalTriangleArea,
} from 'topojson-simplify';

const SOURCE_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson';
const SOURCE_FILE = join(tmpdir(), 'geolearn-ne_10m_admin_1_states_provinces.geojson');

/** [code, nom, variantes acceptées, capitale ou null] */
const US = [
  ['AL', 'Alabama', [], 'Montgomery'],
  ['AK', 'Alaska', [], 'Juneau'],
  ['AZ', 'Arizona', [], 'Phoenix'],
  ['AR', 'Arkansas', [], 'Little Rock'],
  ['CA', 'Californie', ['California'], 'Sacramento'],
  ['CO', 'Colorado', [], 'Denver'],
  ['CT', 'Connecticut', [], 'Hartford'],
  ['DE', 'Delaware', [], 'Dover'],
  ['FL', 'Floride', ['Florida'], 'Tallahassee'],
  ['GA', 'Géorgie', ['Georgia'], 'Atlanta'],
  ['HI', 'Hawaï', ['Hawaii'], 'Honolulu'],
  ['ID', 'Idaho', [], 'Boise'],
  ['IL', 'Illinois', [], 'Springfield'],
  ['IN', 'Indiana', [], 'Indianapolis'],
  ['IA', 'Iowa', [], 'Des Moines'],
  ['KS', 'Kansas', [], 'Topeka'],
  ['KY', 'Kentucky', [], 'Frankfort'],
  ['LA', 'Louisiane', ['Louisiana'], 'Baton Rouge'],
  ['ME', 'Maine', [], 'Augusta'],
  ['MD', 'Maryland', [], 'Annapolis'],
  ['MA', 'Massachusetts', [], 'Boston'],
  ['MI', 'Michigan', [], 'Lansing'],
  ['MN', 'Minnesota', [], 'Saint Paul'],
  ['MS', 'Mississippi', [], 'Jackson'],
  ['MO', 'Missouri', [], 'Jefferson City'],
  ['MT', 'Montana', [], 'Helena'],
  ['NE', 'Nebraska', [], 'Lincoln'],
  ['NV', 'Nevada', [], 'Carson City'],
  ['NH', 'New Hampshire', [], 'Concord'],
  ['NJ', 'New Jersey', [], 'Trenton'],
  ['NM', 'Nouveau-Mexique', ['New Mexico'], 'Santa Fe'],
  ['NY', 'New York', ['État de New York'], 'Albany'],
  ['NC', 'Caroline du Nord', ['North Carolina'], 'Raleigh'],
  ['ND', 'Dakota du Nord', ['North Dakota'], 'Bismarck'],
  ['OH', 'Ohio', [], 'Columbus'],
  ['OK', 'Oklahoma', [], 'Oklahoma City'],
  ['OR', 'Oregon', [], 'Salem'],
  ['PA', 'Pennsylvanie', ['Pennsylvania'], 'Harrisburg'],
  ['RI', 'Rhode Island', [], 'Providence'],
  ['SC', 'Caroline du Sud', ['South Carolina'], 'Columbia'],
  ['SD', 'Dakota du Sud', ['South Dakota'], 'Pierre'],
  ['TN', 'Tennessee', [], 'Nashville'],
  ['TX', 'Texas', [], 'Austin'],
  ['UT', 'Utah', [], 'Salt Lake City'],
  ['VT', 'Vermont', [], 'Montpelier'],
  ['VA', 'Virginie', ['Virginia'], 'Richmond'],
  ['WA', 'Washington', ['État de Washington'], 'Olympia'],
  ['WV', 'Virginie-Occidentale', ['West Virginia'], 'Charleston'],
  ['WI', 'Wisconsin', [], 'Madison'],
  ['WY', 'Wyoming', [], 'Cheyenne'],
];

/** Les 13 régions de métropole, par leur nom dans Natural Earth. */
const FR = [
  ['ARA', 'Auvergne-Rhône-Alpes', [], 'Lyon', 'Auvergne-Rhône-Alpes'],
  ['BFC', 'Bourgogne-Franche-Comté', [], 'Dijon', 'Bourgogne-Franche-Comté'],
  ['BRE', 'Bretagne', [], 'Rennes', 'Bretagne'],
  ['CVL', 'Centre-Val de Loire', ['Centre'], 'Orléans', 'Centre-Val de Loire'],
  ['COR', 'Corse', [], 'Ajaccio', 'Corse'],
  ['GES', 'Grand Est', [], 'Strasbourg', 'Grand Est'],
  ['HDF', 'Hauts-de-France', [], 'Lille', 'Hauts-de-France'],
  ['IDF', 'Île-de-France', [], 'Paris', 'Île-de-France'],
  ['NOR', 'Normandie', [], 'Rouen', 'Normandie'],
  ['NAQ', 'Nouvelle-Aquitaine', [], 'Bordeaux', 'Nouvelle-Aquitaine'],
  ['OCC', 'Occitanie', [], 'Toulouse', 'Occitanie'],
  ['PDL', 'Pays de la Loire', [], 'Nantes', 'Pays de la Loire'],
  ['PAC', "Provence-Alpes-Côte d'Azur", ['PACA'], 'Marseille', "Provence-Alpes-Côte-d'Azur"],
];

/** Les 17 communautés autonomes ; Ceuta et Melilla, villes autonomes, restent hors jeu. */
const ES = [
  ['AN', 'Andalousie', ['Andalucía'], 'Séville', 'Andalucía'],
  ['AR', 'Aragon', [], 'Saragosse', 'Aragón'],
  ['AS', 'Asturies', ['Asturias'], 'Oviedo', 'Asturias'],
  ['IB', 'Îles Baléares', ['Baleares'], 'Palma', 'Islas Baleares'],
  ['CN', 'Canaries', ['Îles Canaries', 'Canarias'], 'Santa Cruz de Tenerife et Las Palmas', 'Canary Is.'],
  ['CB', 'Cantabrie', ['Cantabria'], 'Santander', 'Cantabria'],
  ['CL', 'Castille-et-León', ['Castilla y León'], 'Valladolid', 'Castilla y León'],
  ['CM', 'Castille-La Manche', ['Castilla-La Mancha'], 'Tolède', 'Castilla-La Mancha'],
  ['CT', 'Catalogne', ['Cataluña', 'Catalunya'], 'Barcelone', 'Cataluña'],
  ['EX', 'Estrémadure', ['Extremadura'], 'Mérida', 'Extremadura'],
  ['GA', 'Galice', ['Galicia'], 'Saint-Jacques-de-Compostelle', 'Galicia'],
  ['RI', 'La Rioja', [], 'Logroño', 'La Rioja'],
  ['MD', 'Communauté de Madrid', ['Madrid'], 'Madrid', 'Madrid'],
  ['MC', 'Région de Murcie', ['Murcie', 'Murcia'], 'Murcie', 'Murcia'],
  ['NC', 'Navarre', ['Navarra'], 'Pampelune', 'Foral de Navarra'],
  ['PV', 'Pays basque', ['Euskadi', 'País Vasco'], 'Vitoria-Gasteiz', 'País Vasco'],
  ['VC', 'Communauté valencienne', ['Comunidad Valenciana'], 'Valence', 'Valenciana'],
];

/** Provinces, régions autonomes et municipalités ; les municipalités n'ont pas de capitale à part. */
const CN = [
  ['AH', 'Anhui', [], 'Hefei'],
  ['BJ', 'Pékin', ['Beijing'], null],
  ['CQ', 'Chongqing', [], null],
  ['FJ', 'Fujian', [], 'Fuzhou'],
  ['GS', 'Gansu', [], 'Lanzhou'],
  ['GD', 'Guangdong', [], 'Canton'],
  ['GX', 'Guangxi', [], 'Nanning'],
  ['GZ', 'Guizhou', [], 'Guiyang'],
  ['HI', 'Hainan', [], 'Haikou'],
  ['HE', 'Hebei', [], 'Shijiazhuang'],
  ['HL', 'Heilongjiang', [], 'Harbin'],
  ['HA', 'Henan', [], 'Zhengzhou'],
  ['HB', 'Hubei', [], 'Wuhan'],
  ['HN', 'Hunan', [], 'Changsha'],
  ['JS', 'Jiangsu', [], 'Nankin'],
  ['JX', 'Jiangxi', [], 'Nanchang'],
  ['JL', 'Jilin', [], 'Changchun'],
  ['LN', 'Liaoning', [], 'Shenyang'],
  ['NM', 'Mongolie-Intérieure', ['Inner Mongolia', 'Nei Mongol'], 'Hohhot'],
  ['NX', 'Ningxia', [], 'Yinchuan'],
  ['QH', 'Qinghai', [], 'Xining'],
  ['SN', 'Shaanxi', [], "Xi'an"],
  ['SD', 'Shandong', [], 'Jinan'],
  ['SH', 'Shanghai', [], null],
  ['SX', 'Shanxi', [], 'Taiyuan'],
  ['SC', 'Sichuan', [], 'Chengdu'],
  ['TJ', 'Tianjin', [], null],
  ['XZ', 'Tibet', ['Xizang'], 'Lhassa'],
  ['XJ', 'Xinjiang', [], 'Ürümqi'],
  ['YN', 'Yunnan', [], 'Kunming'],
  ['ZJ', 'Zhejiang', [], 'Hangzhou'],
];

/**
 * Chaque pays : où le trouver dans Natural Earth, à quelle région rattacher
 * chaque entité, et jusqu'où simplifier.
 *
 * `minArea` (km²) écarte les îlots, invisibles à cette échelle et lourds en
 * tracés ; `detail` (km²) est l'aire du plus petit triangle gardé par la
 * simplification. Les deux sont plus fins pour la France et l'Espagne, qu'on
 * voit de plus près.
 */
const SETS = {
  'etats-unis': {
    a3: 'USA',
    country: 'US',
    label: 'État',
    plural: 'États',
    prompt: "Quel est l'État surligné ?",
    capitalLabel: 'capitale',
    regions: US,
    // Le district de Columbia n'est pas un État.
    groupOf: (p) => (p.postal === 'DC' ? null : p.iso_3166_2.slice(3)),
    minArea: 40,
    detail: 4,
  },
  france: {
    a3: 'FRA',
    country: 'FR',
    label: 'Région',
    plural: 'régions',
    prompt: 'Quelle est la région surlignée ?',
    capitalLabel: 'chef-lieu',
    regions: FR,
    // Les départements d'outre-mer restent hors de la carte de métropole.
    groupOf: (p) => (p.type_en === 'Metropolitan department' ? byNaturalEarthName(FR, p.region) : null),
    minArea: 10,
    detail: 0.4,
  },
  espagne: {
    a3: 'ESP',
    country: 'ES',
    label: 'Communauté',
    plural: 'communautés autonomes',
    prompt: 'Quelle est la communauté autonome surlignée ?',
    capitalLabel: 'capitale',
    regions: ES,
    groupOf: (p) => (p.type_en === 'Autonomous Community' ? byNaturalEarthName(ES, p.region) : null),
    minArea: 10,
    detail: 0.4,
  },
  chine: {
    a3: 'CHN',
    country: 'CN',
    label: 'Province',
    plural: 'provinces',
    prompt: 'Quelle est la province surlignée ?',
    capitalLabel: 'capitale',
    regions: CN,
    // Les îles Paracels n'ont pas de province dans Natural Earth, ni de type.
    groupOf: (p) => (p.type_en ? p.iso_3166_2.slice(3) : null),
    minArea: 40,
    detail: 4,
  },
};

function byNaturalEarthName(table, name) {
  const row = table.find((r) => r[4] === name);
  if (!row) throw new Error(`région inconnue dans Natural Earth : ${name}`);
  return row[0];
}

async function loadSource() {
  if (!existsSync(SOURCE_FILE)) {
    console.log(`téléchargement de Natural Earth (40 Mo) → ${SOURCE_FILE}`);
    const response = await fetch(SOURCE_URL);
    if (!response.ok) throw new Error(`téléchargement impossible : ${response.status}`);
    writeFileSync(SOURCE_FILE, Buffer.from(await response.arrayBuffer()));
  }
  return JSON.parse(readFileSync(SOURCE_FILE, 'utf8'));
}

/** km² -> stéradians, l'unité des aires sphériques de topojson-simplify. */
const steradians = (km2) => km2 / 6371 ** 2;

const source = await loadSource();
const metadata = {};
const shapes = {};

for (const [id, set] of Object.entries(SETS)) {
  const features = source.features.filter((f) => f.properties.adm0_a3 === set.a3);

  // Toutes les entités d'abord dans une même topologie : `merge` dissout les
  // frontières qu'elles partagent, là où une concaténation les laisserait
  // tracées au milieu de la région.
  const raw = topology({ raw: { type: 'FeatureCollection', features } });
  const groups = new Map();
  raw.objects.raw.geometries.forEach((geometry, i) => {
    const key = set.groupOf(features[i].properties);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(geometry);
  });

  const codes = set.regions.map((r) => r[0]);
  const missing = codes.filter((code) => !groups.has(code));
  const unknown = [...groups.keys()].filter((key) => !codes.includes(key));
  if (missing.length || unknown.length) {
    throw new Error(`${id} : sans contour [${missing}] ; hors liste [${unknown}]`);
  }

  const merged = {
    type: 'FeatureCollection',
    features: set.regions.map(([code]) => ({
      type: 'Feature',
      id: `${set.country}-${code}`,
      properties: {},
      geometry: merge(raw, groups.get(code)),
    })),
  };

  let topo = topology({ regions: merged });
  topo = filter(topo, filterWeight(topo, steradians(set.minArea), sphericalRingArea));
  topo = simplify(presimplify(topo, sphericalTriangleArea), steradians(set.detail));
  // Coordonnées ramenées à une grille de 10⁴ pas, en écarts d'un point au
  // suivant : quelques octets par point au lieu d'une vingtaine. Le pas fait
  // un kilomètre pour les États-Unis, Aléoutiennes comprises, cent mètres
  // pour la France.
  shapes[id] = quantize(topo, 1e4);

  metadata[id] = {
    country: set.country,
    label: set.label,
    plural: set.plural,
    prompt: set.prompt,
    capitalLabel: set.capitalLabel,
    regions: set.regions
      .map(([code, name, nameAliases, capital]) => ({
        code: `${set.country}-${code}`,
        name,
        nameAliases,
        capital,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
  };
  console.log(`${id} : ${set.regions.length} régions`);
}

const write = (file, data) =>
  writeFileSync(new URL(`../src/data/${file}`, import.meta.url), JSON.stringify(data) + '\n', 'utf8');
write('regions.json', metadata);
write('region-shapes.json', shapes);

for (const file of ['regions.json', 'region-shapes.json']) {
  const size = readFileSync(new URL(`../src/data/${file}`, import.meta.url)).length;
  console.log(`src/data/${file} : ${(size / 1024).toFixed(0)} ko`);
}
