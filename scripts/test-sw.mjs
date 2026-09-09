/**
 * Exerce out/sw.js dans un faux ServiceWorkerGlobalScope.
 *
 * Un service worker ne se teste pas à l'œil : ses erreurs ne se voient qu'au
 * deuxième chargement, hors ligne, ou après un déploiement — c'est-à-dire
 * toujours trop tard. On lui donne donc ici un `caches` et un `fetch`
 * simulés, on déroule son cycle de vie, et on vérifie ce qu'il répond.
 *
 *     npm run build && npm test
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'out');
const ORIGIN = 'https://geolearn.test';
const FLAG = 'https://flagcdn.com/w640/fr.png';

if (!existsSync(join(OUT, 'sw.js'))) {
  console.error('out/sw.js est absent — lancez `npm run build` d’abord.');
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* Simulacres                                                          */
/* ------------------------------------------------------------------ */

const keyOf = (request) =>
  new URL(typeof request === 'string' ? request : request.url, ORIGIN).href;

/**
 * Le Request de Node n'accepte ni URL relative ni `mode: 'navigate'`, deux
 * choses parfaitement normales dans un service worker : le worker résout ses
 * URLs contre sa portée, et toute navigation lui arrive en mode `navigate`.
 * On lui substitue donc un porteur d'URL minimal — le worker ne lit de toute
 * façon que `url`, `method` et `mode`.
 */
class FakeRequest {
  constructor(input, init = {}) {
    const source = typeof input === 'string' ? { url: input } : input;
    this.url = new URL(source.url, ORIGIN).href;
    this.method = init.method ?? source.method ?? 'GET';
    this.mode = init.mode ?? source.mode ?? 'no-cors';
    this.cache = init.cache;
  }
}

/** `type` est en lecture seule sur Response ; on la masque par une propriété propre. */
function respond(body, init, type) {
  const response = new Response(body, init);
  Object.defineProperty(response, 'type', { value: type, configurable: true });
  return response;
}

class MockCache {
  constructor() {
    this.store = new Map();
  }
  async put(request, response) {
    this.store.set(keyOf(request), response);
  }
  async match(request) {
    const hit = this.store.get(keyOf(request));
    return hit ? hit.clone() : undefined;
  }
  async addAll(requests) {
    for (const request of requests) {
      const response = await network(request);
      if (!response.ok) throw new Error(`addAll a échoué sur ${keyOf(request)}`);
      this.store.set(keyOf(request), response);
    }
  }
  async keys() {
    return [...this.store.keys()].map((url) => new FakeRequest(url));
  }
  async delete(request) {
    return this.store.delete(keyOf(request));
  }
}

const caches = {
  map: new Map(),
  async open(name) {
    if (!this.map.has(name)) this.map.set(name, new MockCache());
    return this.map.get(name);
  },
  async keys() {
    return [...this.map.keys()];
  },
  async delete(name) {
    return this.map.delete(name);
  },
  async match(request, options) {
    if (options?.cacheName) {
      const cache = this.map.get(options.cacheName);
      return cache ? cache.match(request) : undefined;
    }
    for (const cache of this.map.values()) {
      const hit = await cache.match(request);
      if (hit) return hit;
    }
    return undefined;
  },
};

/** Le réseau : out/ pour l'origine du site, une image en dur pour flagcdn. */
let online = true;
let flagFetches = 0;

async function network(request) {
  if (!online) throw new TypeError('Failed to fetch');

  const url = new URL(keyOf(request));

  if (url.origin === 'https://flagcdn.com') {
    flagFetches += 1;
    return respond('PNG-drapeau', { status: 200, headers: { 'Content-Type': 'image/png' } }, 'cors');
  }

  const file = join(OUT, decodeURIComponent(url.pathname));
  if (!existsSync(file)) return respond('', { status: 404 }, 'basic');
  return respond(readFileSync(file), { status: 200 }, 'basic');
}

/* ------------------------------------------------------------------ */
/* Chargement du worker                                                */
/* ------------------------------------------------------------------ */

const listeners = new Map();
let skipWaitingCalled = false;
let claimed = false;

const self = {
  location: { origin: ORIGIN },
  addEventListener(type, handler) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(handler);
  },
  skipWaiting() {
    skipWaitingCalled = true;
  },
  clients: {
    async claim() {
      claimed = true;
    },
  },
};

runInNewContext(readFileSync(join(OUT, 'sw.js'), 'utf8'), {
  self,
  caches,
  fetch: network,
  Request: FakeRequest,
  Response,
  URL,
  console,
  Promise,
  TypeError,
});

async function lifecycle(type) {
  const waits = [];
  for (const handler of listeners.get(type) ?? []) {
    handler({ waitUntil: (promise) => waits.push(promise) });
  }
  await Promise.all(waits);
}

/** Rejoue une requête à travers le worker, comme le ferait le navigateur. */
async function through(url, init = {}) {
  const request = new FakeRequest(url, init);
  let answer;
  for (const handler of listeners.get('fetch') ?? []) {
    handler({ request, respondWith: (value) => (answer = value) });
  }
  return answer === undefined ? null : await answer;
}

/* ------------------------------------------------------------------ */
/* Vérifications                                                       */
/* ------------------------------------------------------------------ */

const checks = [];
const check = (name, fn) => checks.push([name, fn]);

check('l’installation précache toute la coquille', async () => {
  await lifecycle('install');
  const names = await caches.keys();
  const shell = names.find((n) => n.startsWith('geolearn-shell-'));
  assert.ok(shell, 'aucun cache de coquille créé');
  const cache = await caches.open(shell);
  const keys = await cache.keys();
  assert.ok(keys.length >= 15, `seulement ${keys.length} entrées précachées`);
  assert.ok(await cache.match('/index.html'), 'index.html absent du précache');
  assert.ok(await cache.match('/manifest.webmanifest'), 'manifest absent du précache');
});

check('l’activation supprime les coquilles des versions précédentes', async () => {
  const stale = await caches.open('geolearn-shell-ancienne');
  await stale.put('/index.html', respond('vieux', { status: 200 }, 'basic'));
  const flags = await caches.open('geolearn-flags-v1');
  await flags.put(FLAG, respond('gardé', { status: 200 }, 'cors'));

  await lifecycle('activate');

  const names = await caches.keys();
  assert.ok(!names.includes('geolearn-shell-ancienne'), 'ancienne coquille non supprimée');
  assert.ok(names.includes('geolearn-flags-v1'), 'le cache des drapeaux doit survivre');
  assert.equal(claimed, true, 'clients.claim() non appelé');

  await caches.delete('geolearn-flags-v1');
});

check('« / » sert index.html', async () => {
  const response = await through('/', { mode: 'navigate' });
  const body = await response.text();
  assert.match(body, /GeoLearn — réviser la géographie/);
});

check('« /profil » sert profil.html', async () => {
  const response = await through('/profil', { mode: 'navigate' });
  assert.match(await response.text(), /Ma progression — GeoLearn/);
});

check('« /quiz » avec paramètres sert quiz.html', async () => {
  const response = await through('/quiz?category=monde&mode=drapeau', { mode: 'navigate' });
  assert.match(await response.text(), /Partie en cours — GeoLearn/);
});

check('hors ligne, une route inconnue rend la page « introuvable »', async () => {
  online = false;
  const response = await through('/nexistepas', { mode: 'navigate' });
  online = true;
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Page introuvable/);
});

check('hors ligne, le bundle JavaScript vient du cache', async () => {
  /* Son nom porte une empreinte : on le relit dans la liste de précache
     plutôt que de le coder en dur. */
  const source = readFileSync(join(OUT, 'sw.js'), 'utf8');
  const urls = JSON.parse(source.match(/const PRECACHE_URLS = (\[[\s\S]*?\n\]);/)[1]);

  /* Le plus gros morceau : c'est celui qui porte l'application, et le seul
     dont l'absence hors ligne se verrait vraiment. */
  const bundle = urls
    .filter((url) => url.startsWith('/_next/static/') && url.endsWith('.js'))
    .sort((a, b) => statSync(join(OUT, b)).size - statSync(join(OUT, a)).size)[0];
  assert.ok(bundle, 'aucun bundle JavaScript dans la liste de précache');

  online = false;
  const response = await through(bundle);
  online = true;

  assert.equal(response.status, 200, 'le bundle devrait sortir du cache');
  /* Octet pour octet : une réponse tronquée passerait un simple test de
     longueur minimale, mais casserait l'app. */
  const served = Buffer.from(await response.arrayBuffer());
  assert.deepEqual(served, readFileSync(join(OUT, bundle)), 'le bundle servi diffère du fichier');
});

check('un drapeau est mis en cache à la première vue, puis resservi', async () => {
  flagFetches = 0;

  const first = await through(FLAG, { mode: 'no-cors' });
  assert.equal(first.status, 200);
  assert.equal(flagFetches, 1, 'la première vue doit passer par le réseau');

  const second = await through(FLAG, { mode: 'no-cors' });
  assert.equal(await second.text(), 'PNG-drapeau');

  /* Stale-while-revalidate : le cache répond, et le réseau est tout de même
     sollicité en arrière-plan pour rafraîchir. */
  const flags = await caches.open('geolearn-flags-v1');
  assert.ok(await flags.match(FLAG), 'le drapeau devrait être en cache');
});

check('hors ligne, un drapeau déjà vu s’affiche encore', async () => {
  online = false;
  const response = await through(FLAG, { mode: 'no-cors' });
  online = true;
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'PNG-drapeau');
});

check('hors ligne, un drapeau jamais vu échoue proprement', async () => {
  online = false;
  const response = await through('https://flagcdn.com/w640/jp.png', { mode: 'no-cors' });
  online = true;
  assert.equal(response.status, 504, 'l’échec doit être une réponse, pas un rejet');
});

check('les requêtes non-GET ne sont pas interceptées', async () => {
  const response = await through('/profil', { method: 'POST' });
  assert.equal(response, null, 'le worker ne doit pas répondre aux POST');
});

check('« SKIP_WAITING » active la nouvelle version', async () => {
  for (const handler of listeners.get('message') ?? []) {
    handler({ data: { type: 'SKIP_WAITING' } });
  }
  assert.equal(skipWaitingCalled, true);
});

/* ------------------------------------------------------------------ */

let failed = 0;
for (const [name, fn] of checks) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ÉCHEC ${name}`);
    console.log(`       ${error.message}`);
  }
}

console.log(`\n${checks.length - failed}/${checks.length} vérifications passées`);
process.exit(failed === 0 ? 0 : 1);
