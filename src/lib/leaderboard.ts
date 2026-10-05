/**
 * Le classement en ligne : un meilleur temps par joueur, zone, mode et
 * longueur de manche — le même chiffre que le record du profil (voir
 * progress.ts), seulement pour les manches trouvées en entier.
 *
 * La lecture passe par **une** fonction de la base (supabase/migrations) :
 * un seul aller-retour, sur un index déjà trié. L'écriture en demande deux,
 * une à chaque bout de la manche, pour que la base en mesure la durée.
 *
 * Le dernier classement lu est gardé sur l'appareil : il s'affiche aussitôt à
 * la visite suivante, pendant qu'on va chercher le frais, et reste lisible
 * hors ligne.
 *
 * Rien ici ne dépend de React.
 */
import type { CategoryId, ModeId } from '@/constants/categories';
import { readAccount } from '@/lib/account';
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

/**
 * Le temps ne vient pas du navigateur seul : la base ouvre la manche
 * (`start_round`), note l'heure, et compare à la fin le temps annoncé au temps
 * réellement écoulé (`finish_round`, supabase/migrations). Le chronomètre ne
 * doit donc partir qu'une fois la manche ouverte.
 *
 * Conséquence voulue : une manche jouée hors ligne ne compte pas au
 * classement. Elle reste un record sur l'appareil.
 */

const START_TIMEOUT_MS = 5000;

/** Une manche ouverte au classement : son identifiant côté base, et le compte qui la joue. */
export type RankedRound = { id: string; key: BoardKey; viewer: string };

/**
 * Ouvre une manche classée, ou rend `null` : invité, pas de Supabase, hors
 * ligne, ou refus de la base. Un invité ne charge rien.
 */
export async function startRankedRound(key: BoardKey): Promise<RankedRound | null> {
  if (!isSupabaseConfigured() || !hasStoredSession()) return null;
  try {
    const account = await readAccount();
    if (account.status !== 'signed-in') return null;
    const db = await getDb();
    // Un réseau qui traîne ne doit pas bloquer la partie : passé ce délai, on
    // joue hors classement.
    const { data, error } = await db
      .rpc('start_round', { p_category: key.category, p_mode: key.mode, p_length: key.length })
      .abortSignal(AbortSignal.timeout(START_TIMEOUT_MS));
    return error || typeof data !== 'string' ? null : { id: data, key, viewer: account.id };
  } catch {
    return null;
  }
}

/**
 * Efface une manche ouverte qui ne sera pas trouvée en entier : arrêtée en
 * cours de route, ou écran quitté. Sans réponse attendue ; ce qui échoue ici
 * (hors ligne) est nettoyé plus tard par la base.
 */
export function cancelRankedRound(round: RankedRound | null): void {
  if (round === null) return;
  void getDb()
    .then((db) => db.rpc('cancel_round', { p_round: round.id }))
    .catch(() => undefined);
}

/** Ce que l'écran de fin affiche sous le chrono. */
export type Ranking =
  /** Pas de compte sur cet appareil (ou pas de Supabase) : rien n'est envoyé. */
  | { status: 'guest' }
  /** Temps retenu ; `improved` si c'est un nouveau record en ligne. */
  | { status: 'saved'; rank: number; bestMs: number; improved: boolean }
  /** La manche n'a pas pu s'ouvrir ou se fermer (réseau) : hors classement. */
  | { status: 'offline' }
  /** La base a refusé le temps. */
  | { status: 'rejected' };

type RawSubmitted = { best_ms: number; rank: number; improved: boolean };

/**
 * Ferme une manche trouvée en entier. `round` vaut `null` quand elle n'a pas
 * pu s'ouvrir : on dit alors pourquoi elle ne compte pas.
 */
export async function finishRankedRound(
  round: RankedRound | null,
  durationMs: number,
): Promise<Ranking> {
  if (!isSupabaseConfigured() || !hasStoredSession()) return { status: 'guest' };
  if (round === null) return { status: 'offline' };
  try {
    const db = await getDb();
    const { data, error } = await db.rpc('finish_round', {
      p_round: round.id,
      p_ms: Math.round(durationMs),
    });
    if (error) return { status: 'offline' };
    const row = ((data ?? []) as RawSubmitted[])[0];
    if (!row) return { status: 'rejected' };
    if (cache) delete cache[boardId(round.key)];
    keepMyBest(round.viewer, round.key, row.best_ms);
    return {
      status: 'saved',
      rank: Number(row.rank),
      bestMs: row.best_ms,
      improved: row.improved,
    };
  } catch {
    return { status: 'offline' };
  }
}

/* ------------------------------ Mes records ------------------------------- */

/**
 * Les meilleurs temps du compte connecté, un par classement, sous la même clé
 * que les records de l'appareil (`europe:drapeau:15`, voir progress.ts).
 *
 * Connecté, ce sont eux que le profil et l'écran de fin affichent. Le record
 * de l'appareil ne dit pas la même chose que le classement : il compte les
 * manches que la base n'a pas chronométrées (sans compte, hors ligne,
 * refusées), ignore celles jouées sur un autre appareil, et se partage entre
 * les comptes d'un même navigateur. Il ne remonte jamais vers la base : ce
 * serait croire le navigateur sur parole.
 *
 * Lus dans `scores`, publique en lecture, et gardés sur l'appareil pour
 * s'afficher aussitôt, et hors ligne.
 */
export type MyBests = Partial<Record<string, number>>;

/** `viewer` : le compte à qui ils appartiennent. */
type Mine = { viewer: string; bests: MyBests; at: number };

const MINE_KEY = 'geolearn.leaderboard.mine.v1';

/** `undefined` tant que le disque n'a pas été lu. */
let mine: Mine | null | undefined;
const mineListeners = new Set<() => void>();

function readMine(): Mine | null {
  if (mine === undefined) {
    try {
      mine = JSON.parse(getItem(MINE_KEY) ?? 'null') as Mine | null;
    } catch {
      mine = null;
    }
  }
  return mine;
}

function writeMine(next: Mine) {
  mine = next;
  setItem(MINE_KEY, JSON.stringify(next));
  mineListeners.forEach((listener) => listener());
}

export function subscribeMyBests(listener: () => void): () => void {
  mineListeners.add(listener);
  return () => {
    mineListeners.delete(listener);
  };
}

/** Les records du compte `viewer`, s'ils ont déjà été lus ; `null` sinon. Synchrone. */
export function myBestsOf(viewer: string): MyBests | null {
  const current = readMine();
  return current?.viewer === viewer ? current.bests : null;
}

type RawBest = { category: CategoryId; mode: ModeId; length: number; best_ms: number };

/**
 * Relit les records du compte `viewer`, sauf s'ils l'ont été il y a moins de
 * 30 s. Lève une erreur si le réseau ou Supabase manquent : les précédents
 * restent alors en place.
 */
export async function refreshMyBests(viewer: string): Promise<void> {
  const current = readMine();
  if (current?.viewer === viewer && Date.now() - current.at < FRESH_MS) return;
  const db = await getDb();
  const { data, error } = await db
    .from('scores')
    .select('category, mode, length, best_ms')
    .eq('user_id', viewer);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as RawBest[];
  writeMine({
    viewer,
    at: Date.now(),
    bests: Object.fromEntries(rows.map((row) => [boardId(row), row.best_ms])),
  });
}

/**
 * Le meilleur temps que la base vient de rendre (`finish_round`). Rien si les
 * records de ce compte n'ont jamais été lus : la prochaine lecture les
 * apportera tous.
 */
function keepMyBest(viewer: string, key: BoardKey, bestMs: number) {
  const current = readMine();
  if (current?.viewer !== viewer) return;
  writeMine({ ...current, bests: { ...current.bests, [boardId(key)]: bestMs } });
}
