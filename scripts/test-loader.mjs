/**
 * Ce qui permet à Node d'exécuter src/ tel quel pour les tests unitaires.
 *
 * L'app est écrite pour Next.js : du TypeScript, des imports sans extension,
 * l'alias `@/` pour src/, et des fichiers JSON importés comme des modules.
 * Node ne connaît rien de tout ça. Ces crochets (« hooks ») de chargement
 * comblent l'écart, sans outil de test à installer :
 *
 *   - `@/lib/room` mène à src/lib/room.ts, `./storage` à ./storage.ts ;
 *   - un .ts est traduit en JavaScript par `typescript`, déjà présent pour
 *     `npm run typecheck` ;
 *   - un .json devient un module qui exporte son contenu.
 *
 * Les clients Supabase sont remplacés par les faux de tests/fakes/ : un test
 * ne touche jamais au réseau, et peut jouer à la fois l'hôte, les invités et
 * le serveur.
 *
 * Chargé par scripts/test-unit.mjs (`npm run test:unit`).
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const SRC = new URL('src/', ROOT);

/** Les paquets que les tests remplacent, et par quoi. */
const FAKES = {
  '@supabase/realtime-js': 'tests/fakes/realtime.ts',
  '@supabase/postgrest-js': 'tests/fakes/postgrest.ts',
  '@supabase/auth-js': 'tests/fakes/auth.ts',
};

const EXTENSIONS = ['.ts', '.tsx', '.json', '.js', '.mjs'];

/** Un fichier du projet, hors dépendances : c'est à nous de le résoudre et de le traduire. */
const isOurs = (url) => url.startsWith('file:') && !url.includes('/node_modules/');

const isFile = (path) => existsSync(path) && statSync(path).isFile();

/**
 * Complète l'extension, comme le fait Next.js. Le paramètre d'adresse est
 * gardé : `@/lib/progress?neuf=1` donne un module neuf, comme au premier
 * chargement de la page (voir `freshImport`, tests/helpers.ts).
 */
function findFile(url) {
  const path = fileURLToPath(url);
  const withQuery = (file) => pathToFileURL(file).href + url.search;
  if (isFile(path)) return withQuery(path);
  for (const extension of EXTENSIONS) {
    if (isFile(path + extension)) return withQuery(path + extension);
  }
  for (const extension of EXTENSIONS) {
    const index = `${path}/index${extension}`;
    if (isFile(index)) return withQuery(index);
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (Object.hasOwn(FAKES, specifier)) {
    return { url: new URL(FAKES[specifier], ROOT).href, shortCircuit: true };
  }

  let target = null;
  if (specifier.startsWith('@/')) {
    target = new URL(specifier.slice(2), SRC);
  } else if (/^\.\.?\//.test(specifier) && context.parentURL && isOurs(context.parentURL)) {
    target = new URL(specifier, context.parentURL);
  }

  const url = target && findFile(target);
  return url ? { url, shortCircuit: true } : nextResolve(specifier, context);
}

let typescript = null;

async function compile(source, path) {
  typescript ??= (await import('typescript')).default;
  const { outputText } = typescript.transpileModule(source, {
    fileName: path,
    compilerOptions: {
      module: typescript.ModuleKind.ESNext,
      target: typescript.ScriptTarget.ES2022,
      jsx: typescript.JsxEmit.ReactJSX,
      // Les numéros de ligne d'une erreur renvoient au .ts, pas au JavaScript produit.
      inlineSourceMap: true,
      inlineSources: true,
    },
  });
  return outputText;
}

export async function load(url, context, nextLoad) {
  if (!isOurs(url)) return nextLoad(url, context);
  const path = fileURLToPath(url);

  if (/\.json$/.test(path)) {
    return { format: 'module', source: `export default ${readFileSync(path, 'utf8')};`, shortCircuit: true };
  }
  if (/\.tsx?$/.test(path)) {
    return { format: 'module', source: await compile(readFileSync(path, 'utf8'), path), shortCircuit: true };
  }
  return nextLoad(url, context);
}
