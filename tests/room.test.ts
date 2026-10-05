/**
 * Les règles d'une salle à plusieurs, hors réseau (src/lib/room.ts) : codes,
 * réglages, identité, places, avancée et classement.
 *
 * Les échanges entre joueurs sont dans room-network.test.ts.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  cleanName,
  contendersOf,
  formatTimeLimit,
  getPlayerId,
  getPlayerName,
  getTimeLimit,
  isHostOf,
  isRoomCode,
  joinPath,
  markAsHost,
  MAX_PLAYERS,
  newRoomCode,
  parseRoomCode,
  rankPlayers,
  roomPath,
  roomSettings,
  sameSettings,
  seatOf,
  setPlayerName,
  withPresence,
  withProgress,
  type KnownPlayer,
  type PlayerState,
  type ProgressMessage,
  type RoomSettings,
} from '@/lib/room';

import { installStorage } from './helpers';

const EUROPE: RoomSettings = { category: 'europe', mode: 'drapeau', count: 10, limit: 0 };
const FRANCE: RoomSettings = { category: 'france', mode: 'etats', count: 13, limit: 120 };
const AFRICA: RoomSettings = { category: 'afrique', mode: 'capitale', count: 20, limit: 60 };

function player(id: string, patch: Partial<KnownPlayer> = {}): KnownPlayer {
  return { id, name: id, host: false, joinedAt: 0, status: 'lobby', game: 0, connected: true, ...patch };
}

const progress = (playerId: string, game: number, found: number, reachedMs = found * 1000): ProgressMessage => ({
  playerId,
  game,
  found,
  reachedMs,
});

describe('le code de la salle', () => {
  it('fait cinq caractères, sans 0, O, 1, I ni L', () => {
    for (let i = 0; i < 500; i++) {
      const code = newRoomCode();
      assert.ok(isRoomCode(code), code);
      assert.doesNotMatch(code, /[0O1IL]/);
    }
  });

  it('refuse ce qui n’en est pas un', () => {
    assert.equal(isRoomCode('K7PQX'), true);
    for (const value of ['k7pqx', 'K7PQ', 'K7PQXY', 'K0PQX', 'KLPQX', 'K7 QX', '', null, undefined]) {
      assert.equal(isRoomCode(value), false, String(value));
    }
  });

  it('se lit tel qu’on le tape, ou dans le lien entier', () => {
    assert.equal(parseRoomCode('k7pqx'), 'K7PQX');
    assert.equal(parseRoomCode(' K7P-QX '), 'K7PQX');
    assert.equal(parseRoomCode('K7P QX'), 'K7PQX');
    assert.equal(parseRoomCode('https://geoquizz.games/salle?code=K7PQX&category=europe'), 'K7PQX');
    assert.equal(parseRoomCode('Rejoins-moi : https://geoquizz.games/salle?mode=pays&code=k7pqx'), 'K7PQX');
  });

  it('rend null quand rien de valable n’en sort', () => {
    assert.equal(parseRoomCode(''), null);
    assert.equal(parseRoomCode('BONJOUR'), null);
    assert.equal(parseRoomCode('https://geoquizz.games/salle?code=ABC'), null);
  });
});

describe('les réglages de la salle', () => {
  it('compare deux réglages champ par champ', () => {
    assert.equal(sameSettings(EUROPE, { ...EUROPE }), true);
    assert.equal(sameSettings(EUROPE, { ...EUROPE, count: 15 }), false);
    assert.equal(sameSettings(EUROPE, { ...EUROPE, limit: 60 }), false);
    assert.equal(sameSettings(null, undefined), true);
    assert.equal(sameSettings(EUROPE, null), false);
  });

  it('s’écrivent dans le lien de la salle', () => {
    assert.equal(roomPath('K7PQX', FRANCE), '/salle?code=K7PQX&category=france&mode=etats&count=13&limit=120');
    assert.equal(
      roomPath('K7PQX', EUROPE, true),
      '/salle?code=K7PQX&category=europe&mode=drapeau&count=10&limit=0&public=1',
    );
    assert.equal(joinPath('K7PQX'), '/salle?code=K7PQX');
  });

  it('lisent la limite de temps, sans limite par défaut', () => {
    assert.equal(getTimeLimit('120'), 120);
    assert.equal(getTimeLimit('45'), 0);
    assert.equal(getTimeLimit(null), 0);
    assert.equal(formatTimeLimit(0), 'Aucune');
    assert.equal(formatTimeLimit(180), '3 min');
  });

  it('viennent de l’hôte en salle d’attente, du lancement en partie', () => {
    // Salle d'attente : l'hôte a pu changer les réglages depuis la partie d'avant.
    assert.equal(roomSettings(true, AFRICA, EUROPE, FRANCE), AFRICA);
    assert.equal(roomSettings(true, undefined, EUROPE, FRANCE), EUROPE);
    assert.equal(roomSettings(true, undefined, null, FRANCE), FRANCE);
    // En partie : c'est ce que l'hôte a envoyé à tous qui se joue.
    assert.equal(roomSettings(false, AFRICA, EUROPE, FRANCE), EUROPE);
    assert.equal(roomSettings(false, AFRICA, null, FRANCE), AFRICA);
    // Entré avec le code seul, avant que la présence de l'hôte n'arrive.
    assert.equal(roomSettings(true, undefined, null, null), null);
  });
});

describe('l’identité du joueur', () => {
  let storage: ReturnType<typeof installStorage>;
  beforeEach(() => {
    storage = installStorage();
  });

  it('garde le même identifiant sur l’appareil', () => {
    const id = getPlayerId();
    assert.match(id, /^[0-9a-f]{32}$/);
    assert.equal(getPlayerId(), id);
    assert.equal(storage.local.getItem('geolearn.player.id'), id);
  });

  it('donne un identifiant différent à chaque appareil', () => {
    const first = getPlayerId();
    installStorage();
    assert.notEqual(getPlayerId(), first);
  });

  it('nettoie le pseudo avant de le garder', () => {
    assert.equal(getPlayerName(), '');
    setPlayerName('   Noé    le   grand   ');
    assert.equal(getPlayerName(), 'Noé le grand');
  });

  it('coupe un pseudo trop long et le met sous une forme unique', () => {
    assert.equal(cleanName('abcdefghijklmnopqrstuvwxyz'), 'abcdefghijklmnop');
    assert.equal(cleanName('Noé'), 'Noé');
  });

  it('reconnaît l’hôte dans l’onglet qui a créé la salle, et là seulement', () => {
    assert.equal(isHostOf('K7PQX'), false);
    markAsHost('K7PQX');
    assert.equal(isHostOf('K7PQX'), true);
    assert.equal(isHostOf('ABCDE'), false);
    assert.equal(storage.local.length, 0, 'l’hôte ne doit pas être retenu sur tout l’appareil');
  });

  it('joue en invité quand le stockage est refusé', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('stockage refusé');
      },
    });
    assert.doesNotThrow(() => markAsHost('K7PQX'));
    assert.equal(isHostOf('K7PQX'), false);
  });
});

describe('les places dans la salle', () => {
  it('vont aux premiers arrivés', () => {
    const players = [player('c', { joinedAt: 30 }), player('a', { joinedAt: 10 }), player('b', { joinedAt: 20 })];
    assert.equal(seatOf(players, 'a'), 0);
    assert.equal(seatOf(players, 'b'), 1);
    assert.equal(seatOf(players, 'c'), 2);
  });

  it('se départagent par l’identifiant, pareil sur tous les écrans', () => {
    const players = [player('b', { joinedAt: 10 }), player('a', { joinedAt: 10 })];
    assert.equal(seatOf(players, 'a'), 0);
    assert.equal(seatOf(players, 'b'), 1);
  });

  it(`laissent dehors le ${MAX_PLAYERS + 1}e joueur`, () => {
    const players = Array.from({ length: MAX_PLAYERS + 1 }, (_, i) => player(`p${i}`, { joinedAt: i }));
    assert.equal(seatOf(players, `p${MAX_PLAYERS - 1}`), MAX_PLAYERS - 1);
    assert.ok(seatOf(players, `p${MAX_PLAYERS}`) >= MAX_PLAYERS);
  });

  it('n’existent pas tant que sa présence n’est pas arrivée', () => {
    assert.equal(seatOf([player('a')], 'moi'), -1);
  });
});

describe('les joueurs connus', () => {
  it('gardent ceux qui sont partis, marqués déconnectés', () => {
    let known = withPresence({}, [player('a'), player('b')]);
    known = withPresence(known, [player('a')]);
    assert.equal(known.a.connected, true);
    assert.equal(known.b.connected, false);
    assert.equal(known.b.name, 'b');
  });

  it('prennent le dernier état publié, et reviennent à la reconnexion', () => {
    let known = withPresence({}, [player('a')]);
    known = withPresence(known, []);
    known = withPresence(known, [player('a', { status: 'playing', game: 1 })]);
    assert.equal(known.a.connected, true);
    assert.equal(known.a.status, 'playing');
  });
});

describe('l’avancée reçue des autres', () => {
  it('suit chaque réponse trouvée', () => {
    let scores = withProgress({}, progress('a', 1, 1));
    scores = withProgress(scores, progress('a', 1, 2));
    scores = withProgress(scores, progress('b', 1, 1));
    assert.equal(scores.a.found, 2);
    assert.equal(scores.b.found, 1);
  });

  it('ne recule jamais quand deux messages se croisent', () => {
    const scores = withProgress({}, progress('a', 1, 3));
    assert.equal(withProgress(scores, progress('a', 1, 2)), scores);
  });

  it('repart de zéro à la partie suivante', () => {
    const scores = withProgress(withProgress({}, progress('a', 1, 9)), progress('a', 2, 0));
    assert.deepEqual(scores.a, progress('a', 2, 0));
  });
});

describe('les participants d’une partie', () => {
  const me: PlayerState = player('moi', { status: 'playing', game: 2 });
  const mine = { found: 4, reachedMs: 9000 };

  it('commencent par soi, avec sa propre avancée plutôt que celle du réseau', () => {
    const [self] = contendersOf(me, mine, [player('moi')], { moi: progress('moi', 2, 1) });
    assert.equal(self.id, 'moi');
    assert.equal(self.found, 4);
    assert.equal(self.reachedMs, 9000);
    assert.equal(self.connected, true);
  });

  it('ne comptent que les joueurs de cette partie', () => {
    const players = [
      player('en-jeu', { status: 'playing', game: 2 }),
      player('fini', { status: 'done', game: 2 }),
      player('en-attente', { status: 'lobby', game: 2 }),
      player('partie-davant', { status: 'done', game: 1 }),
    ];
    const ids = contendersOf(me, mine, players, {}).map((p) => p.id);
    assert.deepEqual(ids, ['moi', 'en-jeu', 'fini']);
  });

  it('comptent celui dont l’avancée arrive avant la présence', () => {
    const late = player('pressé', { status: 'lobby', game: 1 });
    const [, other] = contendersOf(me, mine, [late], { pressé: progress('pressé', 2, 3, 5000) });
    assert.equal(other.id, 'pressé');
    assert.equal(other.found, 3);
    assert.equal(other.reachedMs, 5000);
  });

  it('partent de zéro sans avancée de cette partie', () => {
    const other = player('lent', { status: 'playing', game: 2 });
    const [, contender] = contendersOf(me, mine, [other], { lent: progress('lent', 1, 8) });
    assert.equal(contender.found, 0);
    assert.equal(contender.reachedMs, 0);
  });

  it('gardent un joueur déconnecté et son avancée', () => {
    const gone = player('parti', { status: 'playing', game: 2, connected: false });
    const [, contender] = contendersOf(me, mine, [gone], { parti: progress('parti', 2, 6) });
    assert.equal(contender.connected, false);
    assert.equal(contender.found, 6);
  });
});

describe('le classement d’une partie', () => {
  const ranked = (players: (KnownPlayer & { found: number; reachedMs: number })[]) =>
    rankPlayers(players).map((p) => p.id);

  it('place d’abord qui a trouvé le plus de réponses', () => {
    assert.deepEqual(
      ranked([
        { ...player('a'), found: 3, reachedMs: 1000 },
        { ...player('b'), found: 5, reachedMs: 9000 },
      ]),
      ['b', 'a'],
    );
  });

  it('à égalité, qui y est arrivé le premier', () => {
    assert.deepEqual(
      ranked([
        { ...player('a'), found: 5, reachedMs: 9000 },
        { ...player('b'), found: 5, reachedMs: 4000 },
      ]),
      ['b', 'a'],
    );
  });

  it('puis l’identifiant, pour que l’ordre soit le même partout', () => {
    assert.deepEqual(
      ranked([
        { ...player('b'), found: 5, reachedMs: 4000 },
        { ...player('a'), found: 5, reachedMs: 4000 },
      ]),
      ['a', 'b'],
    );
  });

  it('ne touche pas à la liste reçue', () => {
    const players = [
      { ...player('a'), found: 1, reachedMs: 0 },
      { ...player('b'), found: 2, reachedMs: 0 },
    ];
    rankPlayers(players);
    assert.deepEqual(
      players.map((p) => p.id),
      ['a', 'b'],
    );
  });
});
