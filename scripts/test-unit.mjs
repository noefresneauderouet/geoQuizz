/**
 * Lance les tests unitaires de tests/ avec le lanceur intégré à Node
 * (`node --test`) : aucun outil de test à installer.
 *
 *     npm run test:unit
 *     npm run test:unit -- --test-name-pattern="salle"   # seulement certains tests
 *
 * Chaque fichier *.test.ts tourne dans son propre processus, à travers
 * scripts/test-loader.mjs, qui apprend à Node à lire src/.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TESTS = join(ROOT, 'tests');
const LOADER = pathToFileURL(join(ROOT, 'scripts', 'test-loader.mjs')).href;

const files = readdirSync(TESTS)
  .filter((name) => name.endsWith('.test.ts'))
  .sort()
  .map((name) => join(TESTS, name));

/** Installe les crochets dans chaque processus de test, avant tout import. */
const register = `data:text/javascript,${encodeURIComponent(
  `import { register } from 'node:module'; register(${JSON.stringify(LOADER)});`,
)}`;

const { status } = spawnSync(
  process.execPath,
  [
    '--enable-source-maps',
    '--import',
    register,
    '--test',
    '--test-reporter=spec',
    ...process.argv.slice(2),
    ...files,
  ],
  { cwd: ROOT, stdio: 'inherit' },
);

process.exit(status ?? 1);
