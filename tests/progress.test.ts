/**
 * Ce que l'appareil retient du solo : les records (src/lib/progress.ts) et
 * les réglages de la dernière partie (src/lib/last-game.ts).
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type * as LastGameModule from '@/lib/last-game';
import type * as ProgressModule from '@/lib/progress';

import { freshImport, installStorage, type MemoryStorage } from './helpers';

const PROGRESS_KEY = 'geolearn.progress.v1';
const LAST_GAME_KEY = 'geolearn.last-game.v1';

let local: MemoryStorage;
beforeEach(() => {
  local = installStorage().local;
});

/** La progression, lue sur le disque comme à l'ouverture de l'app. */
const openProgress = () => freshImport<typeof ProgressModule>('@/lib/progress');
const openLastGame = () => freshImport<typeof LastGameModule>('@/lib/last-game');

const europe = { category: 'europe', mode: 'drapeau', total: 10, bestStreak: 0 } as const;

describe('les records', () => {
  it('commencent vides', async () => {
    const { readStats, EMPTY_STATS } = await openProgress();
    assert.deepEqual(readStats(), EMPTY_STATS);
  });

  it('retiennent le temps d’une manche trouvée en entier', async () => {
    const { recordRound, readStats } = await openProgress();
    const outcome = recordRound({ ...europe, score: 10, durationMs: 60_000 });
    // Une première manche complète ne bat personne.
    assert.deepEqual(outcome, { previousBestMs: undefined, newRecord: false });
    assert.equal(readStats().bestTime['europe:drapeau:10'], 60_000);
  });

  it('annoncent un nouveau record quand le temps est battu', async () => {
    const { recordRound, readStats } = await openProgress();
    recordRound({ ...europe, score: 10, durationMs: 60_000 });
    assert.deepEqual(recordRound({ ...europe, score: 10, durationMs: 45_000 }), {
      previousBestMs: 60_000,
      newRecord: true,
    });
    assert.deepEqual(recordRound({ ...europe, score: 10, durationMs: 50_000 }), {
      previousBestMs: 45_000,
      newRecord: false,
    });
    assert.equal(readStats().bestTime['europe:drapeau:10'], 45_000);
  });

  it('ne gardent aucun temps pour une manche incomplète, mais comptent ses réponses', async () => {
    const { recordRound, readStats } = await openProgress();
    const outcome = recordRound({ ...europe, score: 7, durationMs: 10_000, bestStreak: 4 });
    assert.equal(outcome.newRecord, false);
    const stats = readStats();
    assert.equal(stats.bestTime['europe:drapeau:10'], undefined);
    assert.equal(stats.best['europe:drapeau:10'], 7);
    assert.equal(stats.totalAnswers, 10);
    assert.equal(stats.totalCorrect, 7);
    assert.equal(stats.totalTimeMs, 10_000);
    assert.equal(stats.rounds, 1);
    assert.equal(stats.bestStreak, 4);
  });

  it('séparent les zones, les modes et les longueurs de manche', async () => {
    const { recordRound, readStats } = await openProgress();
    recordRound({ ...europe, score: 10, durationMs: 1000 });
    recordRound({ ...europe, total: 20, score: 20, durationMs: 2000 });
    recordRound({ ...europe, mode: 'capitale', score: 10, durationMs: 3000 });
    recordRound({ category: 'oceanie', mode: 'pays', total: 14, score: 14, durationMs: 4000, bestStreak: 14 });
    // Un mélange de continents a ses propres records.
    recordRound({ ...europe, category: 'afrique,europe', score: 10, durationMs: 5000 });
    assert.deepEqual(readStats().bestTime, {
      'europe:drapeau:10': 1000,
      'europe:drapeau:20': 2000,
      'europe:capitale:10': 3000,
      'oceanie:pays:14': 4000,
      'afrique,europe:drapeau:10': 5000,
    });
  });

  it('gardent le meilleur score et la meilleure série', async () => {
    const { recordRound, readStats } = await openProgress();
    recordRound({ ...europe, score: 8, durationMs: 1000, bestStreak: 6 });
    recordRound({ ...europe, score: 5, durationMs: 1000, bestStreak: 2 });
    assert.equal(readStats().best['europe:drapeau:10'], 8);
    assert.equal(readStats().bestStreak, 6);
  });

  it('survivent à la fermeture de l’app', async () => {
    (await openProgress()).recordRound({ ...europe, score: 10, durationMs: 30_000 });
    const { readStats } = await openProgress();
    assert.equal(readStats().bestTime['europe:drapeau:10'], 30_000);
    assert.equal(readStats().rounds, 1);
  });

  it('rangent les records d’avant le choix de la longueur sous 10 questions', async () => {
    local.setItem(PROGRESS_KEY, JSON.stringify({ best: { 'europe:drapeau': 9 }, bestTime: { 'asie:pays': 70_000 } }));
    const { readStats } = await openProgress();
    assert.deepEqual(readStats().best, { 'europe:drapeau:10': 9 });
    assert.deepEqual(readStats().bestTime, { 'asie:pays:10': 70_000 });
    assert.equal(readStats().rounds, 0);
  });

  it('repartent de zéro si les données sont abîmées', async () => {
    local.setItem(PROGRESS_KEY, '{pas du json');
    const { readStats, EMPTY_STATS } = await openProgress();
    assert.deepEqual(readStats(), EMPTY_STATS);
  });

  it('s’effacent à la demande', async () => {
    const { recordRound, resetProgress, readStats, EMPTY_STATS } = await openProgress();
    recordRound({ ...europe, score: 10, durationMs: 30_000 });
    resetProgress();
    assert.deepEqual(readStats(), EMPTY_STATS);
    assert.deepEqual(JSON.parse(local.getItem(PROGRESS_KEY) ?? ''), EMPTY_STATS);
  });
});

describe('la dernière partie', () => {
  it('n’existe pas avant la première', async () => {
    const { readLastGame } = await openLastGame();
    assert.equal(readLastGame(), null);
  });

  it('est retenue, et l’accueil en est prévenu', async () => {
    const { readLastGame, saveLastGame, subscribeLastGame } = await openLastGame();
    let calls = 0;
    const unsubscribe = subscribeLastGame(() => {
      calls += 1;
    });
    saveLastGame({ category: 'asie', mode: 'capitale', count: 15 });
    assert.deepEqual(readLastGame(), { category: 'asie', mode: 'capitale', count: 15 });
    assert.equal(calls, 1);

    // Les mêmes réglages ne réécrivent rien.
    saveLastGame({ category: 'asie', mode: 'capitale', count: 15 });
    assert.equal(calls, 1);
    unsubscribe();
    saveLastGame({ category: 'europe', mode: 'capitale', count: 15 });
    assert.equal(calls, 1);

    const reopened = await openLastGame();
    assert.deepEqual(reopened.readLastGame(), { category: 'europe', mode: 'capitale', count: 15 });
  });

  it('retombe sur des réglages valides si ce qui est stocké ne l’est pas', async () => {
    local.setItem(LAST_GAME_KEY, JSON.stringify({ category: 'europe', mode: 'etats', count: 12 }));
    const { readLastGame } = await openLastGame();
    assert.deepEqual(readLastGame(), { category: 'etats-unis', mode: 'etats', count: 10 });
  });

  it('retient plusieurs continents, et retombe sur le monde s’ils ne se lisent pas', async () => {
    const { readLastGame, saveLastGame } = await openLastGame();
    saveLastGame({ category: 'afrique,europe', mode: 'drapeau', count: 10 });
    assert.deepEqual((await openLastGame()).readLastGame(), {
      category: 'afrique,europe',
      mode: 'drapeau',
      count: 10,
    });
    assert.equal(readLastGame()?.category, 'afrique,europe');

    const unknown = { category: 'afrique,mars', mode: 'drapeau', count: 10 };
    local.setItem(LAST_GAME_KEY, JSON.stringify(unknown));
    assert.equal((await openLastGame()).readLastGame()?.category, 'monde');
  });

  it('est oubliée si les données sont abîmées', async () => {
    local.setItem(LAST_GAME_KEY, 'n’importe quoi');
    const { readLastGame } = await openLastGame();
    assert.equal(readLastGame(), null);
  });
});
