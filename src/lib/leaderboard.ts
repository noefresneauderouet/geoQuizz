/**
 * Le classement en ligne : un meilleur temps par joueur, zone, mode et
 * longueur de manche — le même chiffre que le record du profil (voir
 * progress.ts), seulement pour les manches trouvées en entier.
 *
 * Lecture et écriture passent chacune par **une** fonction de la base
 * (supabase/migrations) : un seul aller-retour, sur un index déjà trié.
 *
 * Côté appareil :
 * - les temps à envoyer attendent dans une file locale. Une manche finie hors
 *   ligne, ou pendant une panne de Supabase, part au retour du réseau ;
 * - le dernier classement lu est gardé : il s'affiche aussitôt à la visite
 *   suivante, pendant qu'on va chercher le frais, et reste lisible hors ligne.
 *
 * Rien ici ne dépend de React.
 */
import type { CategoryId, ModeId } from '@/constants/categories';
import { onSignedIn, readAccount } from '@/lib/account';
import type { Stats } from '@/lib/progress';
import { getItem, setItem } from '@/lib/storage';
import { getDb, hasStoredSession, isSupabaseConfigured } from '@/lib/supabase';

export type BoardKey = { category: CategoryId; mode: ModeId; length: number };

export type BoardRow = {
  rank: number;
  username: string;
  bestMs: number;
  achievedAt: string;
  isMe: boolean;
};

const boardId = ({ category, mode, length }: BoardKey) => `${category}:${mode}:${length}`;

/* --------------------------------- Lecture -------------------------------- */

export const TOP_SIZE = 50;

/** Au-delà, on redemande ; en deçà, le classement en mémoire suffit. */
const FRESH_MS = 30_000;
const CACHE_KEY = 'geolearn.leaderboard.cache.v1';
/** Classements gardés sur l'appareil : les derniers consultés. */
const CACHE_SIZE = 12;

/** `viewer` : le compte pour qui il a été lu — la ligne « moi » en dépend. */
type Cached = { rows: BoardRow[]; at: number; viewer: string | null };

let cache: Record<string, Cached> | null = null;

function readCache(): Record<string, Cached> {
  if (!cache) {
    try {
      cache = JSON.parse(getItem(CACHE_KEY) ?? '{}') as Record<string, Cached>;
    } catch {
      cache = {};
    }
  }
  return cache;
}

function writeCache(id: string, rows: BoardRow[], viewer: string | null) {
  const entries = Object.entries({ ...readCache(), [id]: { rows, at: Date.now(), viewer } })
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, CACHE_SIZE);
  cache = Object.fromEntries(entries);
  setItem(CACHE_KEY, JSON.stringify(cache));
}

/** Le dernier classement lu pour cette clé, s'il y en a un. Synchrone. */
export function cachedBoard(key: BoardKey): Cached | null {
  return readCache()[boardId(key)] ?? null;
}

/** Le cache garde-t-il un classement assez récent, lu pour ce compte ? */
export function isFresh(key: BoardKey, viewer: string | null): boolean {
  const cached = cachedBoard(key);
  return cached !== null && cached.viewer === viewer && Date.now() - cached.at < FRESH_MS;
}

type RawRow = {
  rank: number;
  username: string;
  best_ms: number;
  achieved_at: string;
  is_me: boolean;
};

/**
 * Va chercher le classement, vu par `viewer` (le compte connecté, ou `null`) ;
 * lève une erreur si le réseau ou Supabase manquent.
 */
export async function fetchBoard(key: BoardKey, viewer: string | null): Promise<BoardRow[]> {
  const db = await getDb();
  const { data, error } = await db.rpc(
    'get_leaderboard',
    { p_category: key.category, p_mode: key.mode, p_length: key.length, p_limit: TOP_SIZE },
    // GET : la base l'exécute en lecture seule.
    { get: true },
  );
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as RawRow[]).map((row) => ({
    rank: Number(row.rank),
    username: row.username,
    bestMs: row.best_ms,
    achievedAt: row.achieved_at,
    isMe: row.is_me,
  }));
  writeCache(boardId(key), rows, viewer);
  return rows;
}

/* -------------------------------- Écriture -------------------------------- */

const QUEUE_KEY = 'geolearn.leaderboard.pending.v1';

type Pending = BoardKey & { ms: number };

function readQueue(): Pending[] {
  try {
    return JSON.parse(getItem(QUEUE_KEY) ?? '[]') as Pending[];
  } catch {
    return [];
  }
}

function writeQueue(queue: Pending[]) {
  setItem(QUEUE_KEY, JSON.stringify(queue));
}

/** Ajoute des temps à la file, en ne gardant que le meilleur par classement. */
function enqueue(items: Pending[]) {
  const byId = new Map(readQueue().map((item) => [boardId(item), item]));
  for (const item of items) {
    const previous = byId.get(boardId(item));
    if (!previous || item.ms < previous.ms) byId.set(boardId(item), item);
  }
  writeQueue([...byId.values()]);
}

type Submitted = BoardKey & { bestMs: number; rank: number; improved: boolean };

let flushing: Promise<Submitted[] | null> | null = null;

/**
 * Envoie toute la file en une requête. `null` si rien n'est parti (hors
 * ligne, déconnecté, Supabase en panne) : la file reste pour la prochaine fois.
 */
function flush(): Promise<Submitted[] | null> {
  // `finally` sur la promesse, pas dans la fonction : une file vide se règle
  // aussitôt, et remettrait `flushing` à zéro avant qu'il soit assigné.
  flushing ??= send().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function send(): Promise<Submitted[] | null> {
  try {
    const queue = readQueue();
    if (queue.length === 0) return [];
    const account = await readAccount();
    if (account.status !== 'signed-in') return null;

    const db = await getDb();
    const { data, error } = await db.rpc('submit_scores', { p_scores: queue });
    if (error) return null;

    // Ce qui a été ajouté pendant l'envoi reste dans la file.
    const sent = new Set(queue.map((item) => `${boardId(item)}:${item.ms}`));
    writeQueue(readQueue().filter((item) => !sent.has(`${boardId(item)}:${item.ms}`)));

    type RawSubmitted = {
      category: CategoryId;
      mode: ModeId;
      length: number;
      best_ms: number;
      rank: number;
      improved: boolean;
    };
    const results = ((data ?? []) as RawSubmitted[]).map((row) => ({
      category: row.category,
      mode: row.mode,
      length: row.length,
      bestMs: row.best_ms,
      rank: Number(row.rank),
      improved: row.improved,
    }));
    // Les classements touchés sont à relire.
    if (cache) for (const row of results) delete cache[boardId(row)];
    return results;
  } catch {
    return null;
  }
}

/** Ce que l'écran de fin affiche sous le chrono. */
export type Ranking =
  /** Pas de compte sur cet appareil (ou pas de Supabase) : rien n'est envoyé. */
  | { status: 'guest' }
  /** Temps retenu ; `improved` si c'est un nouveau record en ligne. */
  | { status: 'saved'; rank: number; bestMs: number; improved: boolean }
  /** Pas de réseau : le temps partira tout seul plus tard. */
  | { status: 'queued' };

/**
 * Envoie le temps d'une manche trouvée en entier.
 *
 * Appelée à la fin de chaque manche complète. Un invité ne charge rien : on
 * regarde seulement si une session existe sur l'appareil.
 */
export async function submitRound(key: BoardKey, durationMs: number): Promise<Ranking> {
  if (!isSupabaseConfigured() || !hasStoredSession()) return { status: 'guest' };
  const ms = Math.round(durationMs);
  enqueue([{ ...key, ms }]);
  // Un envoi déjà en route (celui du démarrage) ne contient pas ce temps.
  if (flushing) await flushing;
  const results = await flush();
  if (results === null) return { status: 'queued' };
  const mine = results.find((row) => boardId(row) === boardId(key));
  // Refusé par la base (temps impossible) : on n'en dit rien.
  if (!mine) return { status: 'guest' };
  return { status: 'saved', rank: mine.rank, bestMs: mine.bestMs, improved: mine.improved };
}

/* ------------------------------- Au démarrage ------------------------------ */

const importedKey = (userId: string) => `geolearn.leaderboard.imported.${userId}`;

/**
 * À la première connexion d'un compte sur cet appareil, les records déjà
 * faits ici rejoignent le classement. La base ne garde que le meilleur : les
 * renvoyer ne ferait rien de mal, mais on ne le fait qu'une fois.
 */
function importLocalRecords(userId: string, stats: Stats) {
  if (getItem(importedKey(userId))) return;
  const items = Object.entries(stats.bestTime).flatMap(([id, ms]) => {
    const [category, mode, length] = id.split(':');
    return ms === undefined
      ? []
      : [{ category: category as CategoryId, mode: mode as ModeId, length: Number(length), ms }];
  });
  if (items.length > 0) enqueue(items);
  setItem(importedKey(userId), '1');
}

let started = false;

/**
 * Relance la file au chargement, à chaque connexion et au retour du réseau.
 * `readStats` est passé par l'appelant : progress.ts porte des hooks React, et
 * ce module n'en dépend pas.
 */
export function startLeaderboardSync(readStats: () => Stats): void {
  if (started || !isSupabaseConfigured()) return;
  started = true;
  onSignedIn((account) => {
    importLocalRecords(account.id, readStats());
    void flush();
  });
  globalThis.addEventListener?.('online', () => void flush());
}
