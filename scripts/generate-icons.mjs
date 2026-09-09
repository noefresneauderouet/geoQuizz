/**
 * Génère les icônes PWA de GeoLearn.
 *
 * L'icône n'est pas un binaire déposé à la main : c'est le fond de carte de
 * l'application, projeté en orthographique et rendu dans la palette du thème.
 * Changer une couleur dans src/constants/theme.ts puis relancer
 *
 *     npm run generate-icons
 *
 * régénère la famille complète, cohérente avec l'app.
 *
 * Le rendu est fait à la main (pngjs + d3-geo) parce qu'aucun rasteriseur
 * n'est installé : les anneaux projetés par d3-geo sont remplis par balayage
 * de lignes, avec un suréchantillonnage x4 qui tient lieu d'anticrénelage.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { geoOrthographic, geoPath } from 'd3-geo';
import { PNG } from 'pngjs';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'icons');

/* Palette — reprise de src/constants/theme.ts. */
const GREEN = '#2F855A';
const BLUE_DARK = '#21405F';
const SAND = '#FBF6EE';
const YELLOW = '#E9B44C';

/** Centre du globe : Europe / Afrique, la vue la plus lisible en petit. */
const CENTER = [15, 20];

/** Suréchantillonnage : chaque pixel final est la moyenne de 4x4 sous-pixels. */
const SS = 4;

const hex = (value) => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16),
];

/* ------------------------------------------------------------------ */
/* Rastérisation                                                       */
/* ------------------------------------------------------------------ */

/**
 * Contexte de dessin minimal, au format attendu par d3-geo : il ne peint
 * rien, il collecte les anneaux projetés en coordonnées écran.
 */
function ringCollector() {
  const rings = [];
  let current = null;
  return {
    rings,
    beginPath() {
      current = null;
    },
    moveTo(x, y) {
      current = [[x, y]];
      rings.push(current);
    },
    lineTo(x, y) {
      if (current) current.push([x, y]);
    },
    closePath() {
      current = null;
    },
    arc() {
      /* d3-geo n'appelle arc() que pour les points ; l'icône n'en a pas. */
    },
  };
}

/**
 * Remplit des anneaux dans un masque booléen, règle pair-impair.
 *
 * La règle pair-impair traite gratuitement les trous (mers intérieures) :
 * un anneau intérieur inverse simplement la parité.
 */
function rasterize(rings, size) {
  const mask = new Uint8Array(size * size);

  /* Segments non horizontaux uniquement : un segment horizontal ne croise
     jamais une ligne de balayage en un point unique. */
  const edges = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[(i + 1) % ring.length];
      if (y0 === y1) continue;
      edges.push({ x0, y0, x1, y1, yMin: Math.min(y0, y1), yMax: Math.max(y0, y1) });
    }
  }

  const crossings = [];
  for (let y = 0; y < size; y++) {
    const scan = y + 0.5;
    crossings.length = 0;
    for (const e of edges) {
      if (scan < e.yMin || scan >= e.yMax) continue;
      crossings.push(e.x0 + ((scan - e.y0) / (e.y1 - e.y0)) * (e.x1 - e.x0));
    }
    if (crossings.length < 2) continue;
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const from = Math.max(0, Math.ceil(crossings[i] - 0.5));
      const to = Math.min(size - 1, Math.floor(crossings[i + 1] - 0.5));
      for (let x = from; x <= to; x++) mask[y * size + x] = 1;
    }
  }
  return mask;
}

/** Distance signée à un rectangle à coins arrondis, négative à l'intérieur. */
function roundedRectDistance(x, y, size, radius) {
  const dx = Math.abs(x - size / 2) - (size / 2 - radius);
  const dy = Math.abs(y - size / 2) - (size / 2 - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

/* ------------------------------------------------------------------ */
/* Composition                                                         */
/* ------------------------------------------------------------------ */

const land = (() => {
  const atlas = JSON.parse(readFileSync(require.resolve('world-atlas/land-110m.json'), 'utf8'));
  return feature(atlas, atlas.objects.land);
})();

/**
 * Peint une icône.
 *
 * @param size      côté en pixels
 * @param globe     diamètre du globe, en fraction du côté
 * @param cornerPct rayon des coins, en fraction du côté (0 = carré plein)
 * @param opaque    false : hors du carré arrondi, le fond reste transparent
 */
function render({ size, globe, cornerPct, opaque }) {
  const S = size * SS;
  const radius = (globe * S) / 2;
  const center = S / 2;

  const projection = geoOrthographic()
    .rotate([-CENTER[0], -CENTER[1]])
    .scale(radius)
    .translate([center, center]);

  const collector = ringCollector();
  geoPath(projection, collector)(land);
  const landMask = rasterize(collector.rings, S);

  const [gr, gg, gb] = hex(GREEN);
  const [br, bg, bb] = hex(BLUE_DARK);
  const [sr, sg, sb] = hex(SAND);
  const [yr, yg, yb] = hex(YELLOW);
  const cornerRadius = cornerPct * S;

  /* Accumulateurs en alpha prémultiplié : sans cela, les pixels de bord
     moyennent une couleur avec du transparent noir et cernent l'icône. */
  const acc = new Float64Array(size * size * 4);
  const ringOuter = radius;
  const ringInner = radius - Math.max(1, S * 0.012);

  for (let y = 0; y < S; y++) {
    const py = Math.floor(y / SS);
    for (let x = 0; x < S; x++) {
      const inSquare = opaque || roundedRectDistance(x + 0.5, y + 0.5, S, cornerRadius) <= 0;
      if (!inSquare) continue;

      const d = Math.hypot(x + 0.5 - center, y + 0.5 - center);
      let r;
      let g;
      let b;

      if (d <= ringInner) {
        /* Disque du globe : terre verte sur papier sable. */
        if (landMask[y * S + x]) {
          [r, g, b] = [gr, gg, gb];
        } else {
          [r, g, b] = [sr, sg, sb];
        }
      } else if (d <= ringOuter) {
        /* Liseré doré : détache le globe du fond, même en 32 px. */
        [r, g, b] = [yr, yg, yb];
      } else {
        /* Fond : dégradé diagonal vert -> bleu profond. */
        const t = (x / S) * 0.35 + (y / S) * 0.65;
        r = gr + (br - gr) * t;
        g = gg + (bg - gg) * t;
        b = gb + (bb - gb) * t;
      }

      const i = (py * size + Math.floor(x / SS)) * 4;
      acc[i] += r;
      acc[i + 1] += g;
      acc[i + 2] += b;
      acc[i + 3] += 255;
    }
  }

  const png = new PNG({ width: size, height: size });
  const samples = SS * SS;
  for (let i = 0; i < size * size; i++) {
    const a = acc[i * 4 + 3] / samples;
    const cover = a / 255;
    png.data[i * 4] = cover > 0 ? Math.round(acc[i * 4] / samples / cover) : 0;
    png.data[i * 4 + 1] = cover > 0 ? Math.round(acc[i * 4 + 1] / samples / cover) : 0;
    png.data[i * 4 + 2] = cover > 0 ? Math.round(acc[i * 4 + 2] / samples / cover) : 0;
    png.data[i * 4 + 3] = Math.round(a);
  }
  return PNG.sync.write(png);
}

/*
 * La famille d'icônes.
 *
 * `maskable` laisse Android rogner l'icône à la forme du lanceur : le contenu
 * doit tenir dans le cercle central de 80 %, d'où un globe plus petit et un
 * fond qui va bord à bord. Les icônes `any` peuvent au contraire occuper tout
 * le carré, coins arrondis compris.
 */
const ICONS = [
  { file: 'icon-192.png', size: 192, globe: 0.74, cornerPct: 0.22, opaque: false },
  { file: 'icon-512.png', size: 512, globe: 0.74, cornerPct: 0.22, opaque: false },
  { file: 'icon-192-maskable.png', size: 192, globe: 0.56, cornerPct: 0, opaque: true },
  { file: 'icon-512-maskable.png', size: 512, globe: 0.56, cornerPct: 0, opaque: true },
  /* iOS applique son propre masque et n'accepte pas la transparence. */
  { file: 'apple-touch-icon.png', size: 180, globe: 0.78, cornerPct: 0, opaque: true },
  { file: 'favicon-32.png', size: 32, globe: 0.9, cornerPct: 0.22, opaque: false },
  { file: 'favicon-48.png', size: 48, globe: 0.9, cornerPct: 0.22, opaque: false },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const icon of ICONS) {
  const buffer = render(icon);
  writeFileSync(join(OUT_DIR, icon.file), buffer);
  console.log(
    `  ${icon.file.padEnd(26)} ${String(icon.size).padStart(4)} px  ${(buffer.length / 1024).toFixed(1)} Ko`
  );
}
console.log(`\n${ICONS.length} icônes écrites dans public/icons/`);
