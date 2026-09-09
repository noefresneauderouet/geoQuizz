/* eslint-disable no-undef */
/**
 * Service worker de GeoLearn — modèle.
 *
 * Ce fichier n'est pas livré tel quel : `npm run build` y injecte la liste
 * des fichiers produits et l'empreinte de la version, puis écrit le résultat
 * dans out/sw.js. Voir scripts/build-sw.mjs.
 *
 * Deux caches, deux régimes :
 *
 *   - la coquille (HTML, JS, CSS, icônes, données) est *précachée* en entier
 *     à l'installation. GeoLearn embarque déjà ses 194 pays et ses fonds de
 *     carte : une fois la coquille en place, l'application est entièrement
 *     jouable sans réseau, ce qui est tout l'intérêt de l'installer ;
 *
 *   - les drapeaux (flagcdn.com) arrivent au fil des parties, en
 *     stale-while-revalidate. Les précharger aurait alourdi le premier
 *     téléchargement de plusieurs mégaoctets pour des images que l'on ne
 *     verra peut-être jamais.
 */

/* Remplacés à la construction. */
const BUILD_ID = '__BUILD_ID__';
const PRECACHE_URLS = __PRECACHE_URLS__;

const SHELL_CACHE = `geolearn-shell-${BUILD_ID}`;
const FLAG_CACHE = 'geolearn-flags-v1';
const FLAG_ORIGIN = 'https://flagcdn.com';

/** 194 pays, plus les différentes largeurs demandées et un peu de marge. */
const FLAG_MAX_ENTRIES = 400;

/* ------------------------------------------------------------------ */
/* Cycle de vie                                                        */
/* ------------------------------------------------------------------ */

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      /*
       * `cache: 'reload'` court-circuite le cache HTTP du navigateur.
       * Sans lui, un fichier au nom stable — index.html en tête — peut être
       * repris depuis une réponse périmée, et la « nouvelle » version
       * installée serait l'ancienne.
       */
      await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })));
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      /* Une coquille par version : les précédentes n'ont plus d'usage. Le
         cache des drapeaux, lui, traverse les versions — son contenu ne
         dépend pas du build. */
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('geolearn-shell-') && name !== SHELL_CACHE)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

/* Déclenché par le bouton « Mettre à jour » (voir src/lib/pwa.ts). */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* ------------------------------------------------------------------ */
/* Interception                                                        */
/* ------------------------------------------------------------------ */

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin === FLAG_ORIGIN) {
    event.respondWith(serveFlag(request));
    return;
  }

  /* Tout autre domaine est laissé au navigateur. */
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(serveNavigation(url));
    return;
  }

  event.respondWith(serveAsset(request));
});

/**
 * Navigation.
 *
 * L'export statique produit un fichier par route : / donne index.html,
 * /profil donne profil.html. Le serveur fait cette correspondance en ligne ;
 * hors ligne, c'est à nous de la refaire.
 */
async function serveNavigation(url) {
  const cache = await caches.open(SHELL_CACHE);

  for (const candidate of htmlCandidates(url.pathname)) {
    const hit = await cache.match(candidate);
    if (hit) return hit;
  }

  try {
    return await fetch(url.href);
  } catch {
    /* Route inconnue et réseau absent : l'écran « introuvable » de l'app
       vaut mieux que le dinosaure du navigateur — les onglets restent là,
       donc on peut repartir. */
    return (
      (await cache.match('/404.html')) ??
      (await cache.match('/index.html')) ??
      new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain' } })
    );
  }
}

function htmlCandidates(pathname) {
  if (pathname === '/' || pathname === '') return ['/index.html'];
  const clean = pathname.replace(/\/+$/, '');
  return [`${clean}.html`, `${clean}/index.html`, clean];
}

/** Fichiers de la coquille : cache d'abord, ils sont figés pour la version. */
async function serveAsset(request) {
  const cached = await caches.match(request, { cacheName: SHELL_CACHE });
  if (cached) return cached;

  try {
    return await fetch(request);
  } catch {
    return new Response('', { status: 504, statusText: 'Hors ligne' });
  }
}

/**
 * Drapeaux : on rend immédiatement la copie en cache, et on rafraîchit en
 * arrière-plan. Un drapeau ne change pour ainsi dire jamais ; l'attente
 * réseau, elle, se verrait à chaque question.
 */
async function serveFlag(request) {
  const cache = await caches.open(FLAG_CACHE);
  const cached = await cache.match(request);

  /*
   * La requête d'origine vient d'une balise <img> : elle est en mode
   * `no-cors` et sa réponse serait *opaque*. Une réponse opaque se met en
   * cache, mais les navigateurs la comptent dans le quota pour une taille
   * forfaitaire de plusieurs mégaoctets — 194 drapeaux suffiraient à saturer
   * le stockage. flagcdn renvoyant `Access-Control-Allow-Origin: *`, on
   * refait la requête en CORS et on stocke une réponse de taille réelle.
   */
  const refresh = fetch(request.url, { mode: 'cors', credentials: 'omit' })
    .then(async (response) => {
      if (response.ok && response.type === 'cors') {
        await cache.put(request, response.clone());
        await trimFlags(cache);
      }
      return response;
    })
    .catch(() => null);

  if (cached) return cached;

  const fresh = await refresh;
  /* Ni cache ni réseau : l'échec fait basculer FlagView sur l'emoji. */
  return fresh ?? new Response('', { status: 504, statusText: 'Hors ligne' });
}

/** Les clés d'un cache sont rendues dans l'ordre d'insertion : on retire les plus anciennes. */
async function trimFlags(cache) {
  const keys = await cache.keys();
  if (keys.length <= FLAG_MAX_ENTRIES) return;
  await Promise.all(keys.slice(0, keys.length - FLAG_MAX_ENTRIES).map((key) => cache.delete(key)));
}
