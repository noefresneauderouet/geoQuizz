/**
 * Le classement en ligne, côté navigateur (src/lib/leaderboard.ts) : ouvrir
 * et fermer une manche classée, lire un classement et le garder sur
 * l'appareil. La base est un faux (tests/fakes/postgrest.ts).
 *
 * La vérification des temps elle-même se fait dans la base (start_round,
 * finish_round, supabase/migrations/) : ces tests ne la couvrent pas.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type * as LeaderboardModule from '@/lib/leaderboard';

import { auth, sessionOf } from './fakes/auth';
import { database, type Answer } from './fakes/postgrest';
import { freshImport, installStorage, type MemoryStorage } from './helpers';

const SESSION_KEY = 'sb-demo-auth-token';
const CACHE_KEY = 'geolearn.leaderboard.cache.v2';
const KEY = { category: 'europe', mode: 'drapeau', length: 10 } as const;

let local: MemoryStorage;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://demo.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'cle-publique';
  local = installStorage().local;
  auth.reset();
  database.reset();
});

const openBoard = () => freshImport<typeof LeaderboardModule>('@/lib/leaderboard');

/** Un joueur connecté sur cet appareil. */
function signIn() {
  local.setItem(SESSION_KEY, '{}');
  auth.session = sessionOf('u1', 'Noé');
}

/** Ce que répond la base, fonction par fonction. */
function answers(table: Record<string, Answer | Error>) {
  database.respond = (name) => {
    const answer = table[name] ?? { data: null, error: null };
    if (answer instanceof Error) throw answer;
    return answer;
  };
}

describe('un invité', () => {
  it('joue hors classement, sans rien demander à la base', async () => {
    const { startRankedRound, finishRankedRound } = await openBoard();
    assert.equal(await startRankedRound(KEY), null);
    assert.deepEqual(await finishRankedRound(null, 30_000), { status: 'guest' });
    assert.deepEqual(database.calls, []);
  });

  it('joue hors classement quand Supabase n’est pas configuré', async () => {
    signIn();
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // remis par beforeEach
    const { startRankedRound, finishRankedRound } = await openBoard();
    assert.equal(await startRankedRound(KEY), null);
    assert.deepEqual(await finishRankedRound({ id: 'r1', key: KEY, viewer: 'u1' }, 30_000), { status: 'guest' });
    assert.deepEqual(database.calls, []);
  });
});

describe('une manche classée', () => {
  it('s’ouvre auprès de la base avant la première question', async () => {
    signIn();
    answers({ start_round: { data: 'manche-1', error: null } });
    const { startRankedRound } = await openBoard();
    assert.deepEqual(await startRankedRound(KEY), { id: 'manche-1', key: KEY, viewer: 'u1' });
    assert.deepEqual(database.callsTo('start_round')[0].args, {
      p_category: 'europe',
      p_mode: 'drapeau',
      p_length: 10,
    });
  });

  it('se joue hors classement si la base refuse ou ne répond pas', async () => {
    signIn();
    const { startRankedRound } = await openBoard();
    for (const answer of [
      { data: null, error: { message: 'refusé' } },
      { data: 42, error: null },
      new TypeError('fetch failed'),
    ]) {
      answers({ start_round: answer });
      assert.equal(await startRankedRound(KEY), null);
    }
  });

  it('se ferme avec le temps arrondi à la milliseconde', async () => {
    signIn();
    answers({ finish_round: { data: [{ best_ms: 41_235, rank: '3', improved: true }], error: null } });
    const { finishRankedRound } = await openBoard();
    assert.deepEqual(await finishRankedRound({ id: 'manche-1', key: KEY, viewer: 'u1' }, 41_234.6), {
      status: 'saved',
      rank: 3,
      bestMs: 41_235,
      improved: true,
    });
    assert.deepEqual(database.callsTo('finish_round')[0].args, { p_round: 'manche-1', p_ms: 41_235 });
  });

  it('dit pourquoi un temps ne compte pas', async () => {
    signIn();
    const { finishRankedRound } = await openBoard();
    const round = { id: 'manche-1', key: KEY, viewer: 'u1' };

    // La manche n'a pas pu s'ouvrir (hors ligne au départ).
    assert.deepEqual(await finishRankedRound(null, 30_000), { status: 'offline' });
    // La base a refusé le temps : trop rapide, manche inconnue…
    answers({ finish_round: { data: [], error: null } });
    assert.deepEqual(await finishRankedRound(round, 30_000), { status: 'rejected' });
    // Le réseau a manqué à la fin.
    answers({ finish_round: { data: null, error: { message: 'timeout' } } });
    assert.deepEqual(await finishRankedRound(round, 30_000), { status: 'offline' });
    answers({ finish_round: new TypeError('fetch failed') });
    assert.deepEqual(await finishRankedRound(round, 30_000), { status: 'offline' });
  });

  it('abandonnée, est effacée de la base', async () => {
    signIn();
    const { cancelRankedRound } = await openBoard();
    cancelRankedRound(null);
    cancelRankedRound({ id: 'manche-1', key: KEY, viewer: 'u1' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(
      database.callsTo('cancel_round').map((call) => call.args),
      [{ p_round: 'manche-1' }],
    );
  });

  it('abandonnée hors ligne, ne fait pas d’erreur', async () => {
    signIn();
    answers({ cancel_round: new TypeError('fetch failed') });
    const { cancelRankedRound } = await openBoard();
    assert.doesNotThrow(() => cancelRankedRound({ id: 'manche-1', key: KEY, viewer: 'u1' }));
    await new Promise((resolve) => setImmediate(resolve));
  });
});

describe('la lecture du classement', () => {
  const rows = [
    {
      rank: '1',
      username: 'Alice',
      best_ms: 30_000,
      achieved_at: '2026-10-01T10:00:00Z',
      is_me: false,
      bests: { '10': 30_000, '20': 70_000 },
    },
    {
      rank: '2',
      username: 'Noé',
      best_ms: 41_000,
      achieved_at: '2026-10-02T10:00:00Z',
      is_me: true,
      bests: { '10': 41_000 },
    },
  ];

  it('se fait en un appel, en lecture seule, avec les temps des autres longueurs', async () => {
    answers({ get_leaderboard_with_bests: { data: rows, error: null } });
    const { fetchBoard } = await openBoard();
    const board = await fetchBoard(KEY, 'u1');
    assert.equal(board[0].bests[20], 70_000);
    // Une longueur jamais jouée manque : l'écran y met un tiret.
    assert.equal(board[1].bests[15], undefined);
    assert.deepEqual(board, [
      {
        rank: 1,
        username: 'Alice',
        bestMs: 30_000,
        achievedAt: '2026-10-01T10:00:00Z',
        isMe: false,
        bests: { 10: 30_000, 20: 70_000 },
      },
      {
        rank: 2,
        username: 'Noé',
        bestMs: 41_000,
        achievedAt: '2026-10-02T10:00:00Z',
        isMe: true,
        bests: { 10: 41_000 },
      },
    ]);
    const [call] = database.callsTo('get_leaderboard_with_bests');
    assert.deepEqual(call.args, { p_category: 'europe', p_mode: 'drapeau', p_length: 10, p_limit: 50 });
    assert.deepEqual(call.options, { get: true });
  });

  it('échoue avec le message de la base', async () => {
    answers({ get_leaderboard_with_bests: { data: null, error: { message: 'base indisponible' } } });
    const { fetchBoard } = await openBoard();
    await assert.rejects(fetchBoard(KEY, null), /base indisponible/);
  });

  it('est gardé sur l’appareil, et relu hors ligne', async () => {
    answers({ get_leaderboard_with_bests: { data: rows, error: null } });
    await (await openBoard()).fetchBoard(KEY, 'u1');
    assert.ok(local.getItem(CACHE_KEY));

    const { cachedBoard } = await openBoard();
    assert.equal(cachedBoard(KEY)?.rows.length, 2);
    assert.equal(cachedBoard({ ...KEY, length: 20 }), null);
  });

  it('reste frais trente secondes, pour le même compte', async (t) => {
    answers({ get_leaderboard_with_bests: { data: rows, error: null } });
    let now = 1_000_000;
    t.mock.method(Date, 'now', () => now);
    const { fetchBoard, isFresh } = await openBoard();
    await fetchBoard(KEY, 'u1');
    assert.equal(isFresh(KEY, 'u1'), true);
    assert.equal(isFresh(KEY, null), false, 'lu pour un autre compte');
    now += 30_000;
    assert.equal(isFresh(KEY, 'u1'), false);
  });

  it('est oublié dès qu’un nouveau temps y entre, avec ceux des autres longueurs', async () => {
    signIn();
    answers({
      get_leaderboard_with_bests: { data: rows, error: null },
      finish_round: { data: [{ best_ms: 29_000, rank: 1, improved: true }], error: null },
    });
    const { fetchBoard, finishRankedRound, cachedBoard } = await openBoard();
    const longer = { ...KEY, length: 20 };
    const elsewhere = { ...KEY, category: 'asie' } as const;
    for (const key of [KEY, longer, elsewhere]) await fetchBoard(key, 'u1');
    await finishRankedRound({ id: 'manche-1', key: KEY, viewer: 'u1' }, 29_000);
    assert.equal(cachedBoard(KEY), null);
    // Le nouveau temps à 10 s'affiche aussi dans la colonne du classement à 20.
    assert.equal(cachedBoard(longer), null);
    assert.ok(cachedBoard(elsewhere), 'une autre zone ne change pas');
  });

  it('ne garde que les douze derniers classements consultés', async (t) => {
    answers({ get_leaderboard_with_bests: { data: rows, error: null } });
    let now = 0;
    t.mock.method(Date, 'now', () => (now += 1000));
    const { fetchBoard, cachedBoard } = await openBoard();
    for (let length = 1; length <= 13; length++) await fetchBoard({ ...KEY, length }, null);
    assert.equal(cachedBoard({ ...KEY, length: 1 }), null);
    assert.ok(cachedBoard({ ...KEY, length: 2 }));
    assert.ok(cachedBoard({ ...KEY, length: 13 }));
  });
});

describe('l’identité des requêtes', () => {
  it('porte le jeton du joueur connecté, ou la clé publique d’un invité', async (t) => {
    const sent: (string | null)[] = [];
    t.mock.method(globalThis, 'fetch', async (_input: unknown, init?: { headers?: Headers }) => {
      sent.push(init?.headers?.get('Authorization') ?? null);
      return new Response('[]');
    });
    answers({ get_leaderboard_with_bests: { data: [], error: null } });
    const { fetchBoard } = await openBoard();
    await fetchBoard(KEY, null);

    const client = database.clients.at(-1);
    assert.equal(client?.url, 'https://demo.supabase.co/rest/v1');
    await client?.options.fetch?.('https://demo.supabase.co/rest/v1/rpc/get_leaderboard_with_bests', {});
    signIn();
    await client?.options.fetch?.('https://demo.supabase.co/rest/v1/rpc/get_leaderboard_with_bests', {});
    assert.deepEqual(sent, ['Bearer cle-publique', 'Bearer jeton-u1']);
  });
});
