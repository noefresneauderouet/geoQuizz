/**
 * Un faux Supabase Storage : le seau des photos de profil, en mémoire.
 *
 * src/lib/avatar.ts n'a pas de client à remplacer : il parle à Storage par
 * `fetch` (`storageRequest`, src/lib/supabase.ts). `installStorageApi` met ce
 * faux à la place de `fetch`, et toute autre adresse est refusée : un test ne
 * touche jamais au réseau.
 *
 * Comme le vrai, il range les images par chemin (`<compte>/<version>-96`),
 * liste un dossier, et efface une liste de chemins. Les règles d'accès, elles,
 * sont dans la base (supabase/migrations) : il ne les rejoue pas.
 */

export type StoredFile = { type: string; size: number; cacheControl: string | null };

/** Une requête reçue : `upload`, `list` ou `remove`, et le jeton qui l'accompagnait. */
export type StorageCall = { action: string; path: string; authorization: string | null };

const BASE = 'https://demo.supabase.co/storage/v1/object/';
const BUCKET = 'avatars';

export const storageApi = {
  files: new Map<string, StoredFile>(),
  calls: [] as StorageCall[],
  /**
   * Ce qui arrive à la prochaine requête de cette action : `network`, une
   * coupure ; un nombre, une réponse d'erreur ; `null`, tout va bien.
   */
  fail: (() => null) as (action: string) => 'network' | number | null,

  reset(): void {
    this.files.clear();
    this.calls = [];
    this.fail = () => null;
  },

  /** Les chemins rangés, dans l'ordre alphabétique. */
  paths(): string[] {
    return [...this.files.keys()].sort();
  },

  callsTo(action: string): StorageCall[] {
    return this.calls.filter((call) => call.action === action);
  },
};

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function serve(url: string, init: RequestInit = {}): Promise<Response> {
  if (!url.startsWith(BASE)) throw new TypeError(`réseau interdit pendant les tests : ${url}`);
  const route = url.slice(BASE.length);
  const method = init.method ?? 'GET';
  const headers = new Headers(init.headers);

  const action =
    method === 'POST' && route === `list/${BUCKET}`
      ? 'list'
      : method === 'DELETE' && route === BUCKET
        ? 'remove'
        : method === 'POST' && route.startsWith(`${BUCKET}/`)
          ? 'upload'
          : null;
  if (action === null) return reply(400, { error: `route inconnue : ${method} ${route}` });

  const path = action === 'upload' ? route.slice(BUCKET.length + 1) : '';
  storageApi.calls.push({ action, path, authorization: headers.get('Authorization') });
  const failure = storageApi.fail(action);
  if (failure === 'network') throw new TypeError('fetch failed');
  if (failure !== null) return reply(failure, { error: 'refusé' });

  if (action === 'upload') {
    if (storageApi.files.has(path)) return reply(409, { error: 'Duplicate' });
    const body = init.body as Blob;
    storageApi.files.set(path, {
      type: headers.get('content-type') ?? '',
      size: body.size,
      cacheControl: headers.get('cache-control'),
    });
    return reply(200, { Key: `${BUCKET}/${path}` });
  }

  const request = JSON.parse(String(init.body)) as { prefix?: string; prefixes?: string[] };
  if (action === 'list') {
    const folder = `${request.prefix}/`;
    const names = storageApi
      .paths()
      .filter((p) => p.startsWith(folder))
      .map((p) => ({ name: p.slice(folder.length) }));
    return reply(200, names);
  }
  const removed = (request.prefixes ?? []).filter((p) => storageApi.files.delete(p));
  return reply(200, removed.map((name) => ({ name })));
}

/** Met le faux à la place de `fetch`, pour tout le fichier de test. */
export function installStorageApi(): void {
  Object.defineProperty(globalThis, 'fetch', {
    value: (input: string | URL, init?: RequestInit) => serve(String(input), init),
    configurable: true,
    writable: true,
  });
}
