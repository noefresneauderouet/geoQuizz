/**
 * Sert out/ en local, pour essayer l'application installée.
 *
 * Un service worker n'est autorisé que sur HTTPS ou sur localhost : ouvrir
 * out/index.html depuis le disque (file://) ne permet donc ni le hors-ligne
 * ni l'installation. D'où ce serveur, qui reproduit ce qu'un hébergeur
 * statique doit faire :
 *
 *   - servir /profil depuis profil.html (URL sans extension) ;
 *   - ne jamais laisser sw.js ni les pages HTML être mis en cache par le
 *     navigateur, faute de quoi une nouvelle version ne serait jamais vue ;
 *   - au contraire, figer les fichiers au nom haché pour un an.
 *
 * Aucune dépendance : c'est le http de Node.
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const OUT = resolve(process.cwd(), 'out');
const PORT = Number(process.env.PORT ?? 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

/**
 * Tout ce que Next range sous /_next/static/ porte une empreinte de contenu
 * dans son nom (`0cz1d0mv5g_q7.js`) : le fichier ne changera jamais sans
 * changer de nom, donc il peut être figé pour un an.
 *
 * C'est la convention de Next, plus fiable qu'un motif deviné sur le nom —
 * l'alphabet des empreintes a déjà changé d'une version à l'autre.
 */
const IMMUTABLE_PREFIX = '/_next/static/';

/**
 * La règle porte sur le **fichier servi**, pas sur l'URL demandée.
 *
 * « / » et « /profil » ne se terminent pas par .html alors qu'ils servent
 * bien des pages : décider d'après l'URL leur donnait une heure de cache, de
 * quoi masquer une mise à jour tout ce temps.
 */
function cacheControl(pathname, file) {
  if (pathname === '/sw.js') return 'no-cache';
  if (file.toLowerCase().endsWith('.html')) return 'no-cache';
  if (pathname.startsWith(IMMUTABLE_PREFIX)) return 'public, max-age=31536000, immutable';
  return 'public, max-age=3600';
}

/** Chemin d'URL -> fichier de dist, en refusant toute sortie du dossier. */
function locate(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const candidates =
    clean === '/' || clean === '\\'
      ? ['index.html']
      : [clean, `${clean}.html`, join(clean, 'index.html')];

  for (const candidate of candidates) {
    const full = join(OUT, candidate);
    if (!full.startsWith(OUT)) continue;
    if (existsSync(full) && statSync(full).isFile()) return full;
  }
  return null;
}

if (!existsSync(OUT)) {
  console.error('out/ est absent — lancez `npm run build` d’abord.');
  process.exit(1);
}

createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
  const file = locate(pathname);

  if (!file) {
    const notFound = join(OUT, '404.html');
    res.writeHead(404, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' });
    if (existsSync(notFound)) createReadStream(notFound).pipe(res);
    else res.end('404');
    return;
  }

  res.writeHead(200, {
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': cacheControl(pathname, file),
    'Content-Length': statSync(file).size,
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`GeoQuizz sur http://localhost:${PORT}`);
  console.log('Installation : icône dans la barre d’adresse (Chrome/Edge),');
  console.log('ou Partager › Sur l’écran d’accueil (Safari iOS).');
});
