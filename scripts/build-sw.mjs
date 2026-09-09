/**
 * Assemble out/sw.js.
 *
 * Le modèle scripts/service-worker.js décrit les stratégies ; ce script
 * fournit les deux valeurs qu'il ne peut pas connaître : la liste exacte des
 * fichiers produits par l'export, et une empreinte de version.
 *
 * L'empreinte est un condensé du *contenu* de la coquille, pas un horodatage :
 * reconstruire sans rien changer ne provoque donc aucune mise à jour, et les
 * utilisateurs ne voient pas passer « Nouvelle version disponible » pour rien.
 *
 * Lancé par `npm run build`, juste après `expo export`.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'out');
const TEMPLATE = join(ROOT, 'scripts', 'service-worker.js');

/*
 * Ce qui reste hors de la coquille.
 *
 * Les cartes de source ne servent qu'au débogage, et les fichiers de données
 * de route de Next (.txt) accompagnent une navigation client dont on n'a pas
 * l'usage ici : les trois pages sont déjà précachées en entier.
 */
const EXCLUDED = [/^sw\.js$/, /\.map$/, /\.txt$/];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(OUT)
  .map((full) => ({ full, rel: relative(OUT, full).split(sep).join('/') }))
  .filter(({ rel }) => !EXCLUDED.some((pattern) => pattern.test(rel)))
  .sort((a, b) => a.rel.localeCompare(b.rel));

if (files.length === 0) {
  console.error('out/ est vide — lancez `next build` d’abord.');
  process.exit(1);
}

/* Garde-fou : une coquille sans ces fichiers ne s’installe pas. */
for (const required of ['index.html', '404.html', 'manifest.webmanifest', 'icons/icon-512.png']) {
  if (!files.some(({ rel }) => rel === required)) {
    console.error(`Fichier attendu absent de out/ : ${required}`);
    process.exit(1);
  }
}

const digest = createHash('sha256');
let bytes = 0;
for (const { full, rel } of files) {
  const content = readFileSync(full);
  bytes += content.length;
  digest.update(rel);
  digest.update(createHash('sha256').update(content).digest());
}
const buildId = digest.digest('hex').slice(0, 12);

/* encodeURI : les noms produits par Next partent tels quels dans un
   `new Request(url)` côté worker. */
const urls = files.map(({ rel }) => `/${encodeURI(rel)}`);

const source = readFileSync(TEMPLATE, 'utf8')
  .replace("'__BUILD_ID__'", JSON.stringify(buildId))
  .replace('__PRECACHE_URLS__', JSON.stringify(urls, null, 2));

writeFileSync(join(OUT, 'sw.js'), source);

console.log(`sw.js écrit — version ${buildId}`);
console.log(`  ${files.length} fichiers précachés, ${(bytes / 1024 / 1024).toFixed(2)} Mo`);
