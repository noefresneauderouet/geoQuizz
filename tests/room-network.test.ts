/**
 * Les échanges d'une salle à plusieurs (src/lib/room.ts), sur un faux
 * Supabase Realtime (tests/fakes/realtime.ts) : plusieurs joueurs dans un
 * même processus, sans réseau.
 *
 * Ce qui est vérifié : qui voit qui, ce que chacun reçoit, ce qui est ignoré
 * parce que mal formé, et combien de fois on publie en Presence — Supabase
 * coupe le canal d'un joueur qui publie trop souvent.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it, type TestContext } from 'node:test';

import {
  findPublicRoom,
  joinRoom,
  listPublicRoom,
  MAX_PLAYERS,
  type PlayerState,
  type RoomHandlers,
  type RoomSettings,
  type StartMessage,
} from '@/lib/room';

import { server, type FakeChannel } from './fakes/realtime';
import { settle, waitFor } from './helpers';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://demo.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'cle-publique';

const CODE = 'K7PQX';
const TOPIC = `room:${CODE}`;
const EUROPE: RoomSettings = { category: 'europe', mode: 'drapeau', count: 10, limit: 0 };
const ASIA: RoomSettings = { category: 'asie', mode: 'pays', count: 15, limit: 120 };

const HOST_ID = 'aaaa0000';
const GUEST_ID = 'bbbb1111';

function state(id: string, patch: Partial<PlayerState> = {}): PlayerState {
  return { id, name: id, host: false, joinedAt: 1, status: 'lobby', game: 0, ...patch };
}

/** Ce qu'un joueur a reçu de la salle, événement par événement. */
type Inbox = {
  players: PlayerState[][];
  start: StartMessage[];
  finish: unknown[];
  reset: unknown[];
  progress: unknown[];
  status: string[];
};

function inbox(): Inbox & RoomHandlers {
  const box: Inbox = { players: [], start: [], finish: [], reset: [], progress: [], status: [] };
  return {
    ...box,
    onPlayers: (players) => box.players.push(players),
    onStart: (message) => box.start.push(message),
    onFinish: (message) => box.finish.push(message),
    onReset: (message) => box.reset.push(message),
    onProgress: (message) => box.progress.push(message),
    onStatus: (status) => box.status.push(status),
  };
}

/** Les joueurs que voit ce joueur en ce moment. */
const seen = (box: Inbox) => (box.players.at(-1) ?? []).map((p) => p.id).sort();

/** Le canal de ce joueur, côté serveur. */
const channelOf = (id: string): FakeChannel => {
  const channel = server.channels.find((c) => c.topic === TOPIC && c.key === id);
  if (!channel) throw new Error(`${id} n'a pas de canal`);
  return channel;
};

/** Fait entrer un joueur et attend qu'il soit connecté. */
async function enter(t: TestContext, id: string, patch: Partial<PlayerState> = {}) {
  const box = inbox();
  const room = joinRoom(CODE, state(id, patch), box);
  t.after(() => room.leave());
  await waitFor(() => box.status.includes('connected'), `la connexion de ${id}`);
  await settle();
  return { room, box };
}

beforeEach(() => server.reset());

describe('entrer dans une salle', () => {
  it('ouvre un seul client Realtime pour l’onglet, vers le projet Supabase', async (t) => {
    await enter(t, HOST_ID);
    await enter(t, GUEST_ID);
    assert.equal(server.clients.length, 1);
    assert.equal(server.clients[0].url, 'wss://demo.supabase.co/realtime/v1');
    assert.deepEqual(server.clients[0].options, { params: { apikey: 'cle-publique' } });
  });

  it('rejoint le canal de la salle, sans écho de ses propres messages', async (t) => {
    await enter(t, HOST_ID);
    const channel = channelOf(HOST_ID);
    assert.equal(channel.topic, 'room:K7PQX');
    assert.deepEqual(channel.options.config, {
      broadcast: { self: false },
      presence: { key: HOST_ID, enabled: true },
    });
  });

  it('se présente une fois connecté, et voit les autres', async (t) => {
    const host = await enter(t, HOST_ID, { host: true, settings: EUROPE });
    const guest = await enter(t, GUEST_ID);
    await settle();
    assert.deepEqual(seen(host.box), [HOST_ID, GUEST_ID]);
    assert.deepEqual(seen(guest.box), [HOST_ID, GUEST_ID]);
    // Entré avec le code seul, l'invité apprend les réglages par l'hôte.
    assert.deepEqual(guest.box.players.at(-1)?.find((p) => p.host)?.settings, EUROPE);
  });

  it('ne publie qu’une fois les changements faits avant la connexion', async (t) => {
    server.answers = false;
    const box = inbox();
    const room = joinRoom(CODE, state(HOST_ID), box);
    t.after(() => room.leave());
    await waitFor(() => server.last(TOPIC) !== undefined, 'le canal');

    room.publish(state(HOST_ID, { name: 'Noé' }));
    room.publish(state(HOST_ID, { name: 'Noé', status: 'playing', game: 1 }));
    const channel = channelOf(HOST_ID);
    assert.deepEqual(channel.tracked, []);

    channel.connect();
    await settle();
    assert.deepEqual(channel.tracked, [state(HOST_ID, { name: 'Noé', status: 'playing', game: 1 })]);
  });

  it('publie chaque nouvel état une fois connecté', async (t) => {
    const { room } = await enter(t, HOST_ID);
    room.publish(state(HOST_ID, { status: 'playing', game: 1 }));
    await settle();
    assert.equal(channelOf(HOST_ID).tracked.length, 2);
  });
});

describe('les messages de la partie', () => {
  it('le lancement de l’hôte arrive aux invités, pas à lui-même', async (t) => {
    const host = await enter(t, HOST_ID, { host: true });
    const guest = await enter(t, GUEST_ID);
    const start = { game: 1, seed: 123456, settings: EUROPE };
    host.room.start(start);
    await settle();
    assert.deepEqual(guest.box.start, [start]);
    assert.deepEqual(host.box.start, []);
  });

  it('l’avancée, la fin et le retour en salle d’attente circulent', async (t) => {
    const host = await enter(t, HOST_ID, { host: true });
    const guest = await enter(t, GUEST_ID);

    guest.room.progress({ game: 1, playerId: GUEST_ID, found: 3, reachedMs: 4200 });
    guest.room.finish({ game: 1, playerId: GUEST_ID });
    host.room.reset({ game: 2 });
    await settle();

    assert.deepEqual(host.box.progress, [{ game: 1, playerId: GUEST_ID, found: 3, reachedMs: 4200 }]);
    assert.deepEqual(host.box.finish, [{ game: 1, playerId: GUEST_ID }]);
    assert.deepEqual(guest.box.reset, [{ game: 2 }]);
  });

  it('un lancement sur plusieurs continents passe', async (t) => {
    const host = await enter(t, HOST_ID, { host: true });
    const guest = await enter(t, GUEST_ID);
    const mix: RoomSettings = { category: 'afrique,europe', mode: 'capitale', count: 20, limit: 0 };
    host.room.start({ game: 1, seed: 9, settings: mix });
    await settle();
    assert.deepEqual(guest.box.start, [{ game: 1, seed: 9, settings: mix }]);
  });

  it('les champs en trop ne passent pas', async (t) => {
    const guest = await enter(t, GUEST_ID);
    const intruder = server.device(TOPIC);
    await settle();
    await intruder.send({
      type: 'broadcast',
      event: 'start',
      payload: { game: 1, seed: 5, settings: EUROPE, extra: '<script>' },
    });
    await settle();
    assert.deepEqual(guest.box.start, [{ game: 1, seed: 5, settings: EUROPE }]);
  });
});

describe('ce qui est mal formé est ignoré', () => {
  /** Messages que n'importe qui connaissant le code peut envoyer. */
  const malformed: Record<string, unknown[]> = {
    start: [
      null,
      'bonjour',
      { game: 1, seed: 5 },
      { game: -1, seed: 5, settings: EUROPE },
      { game: 1.5, seed: 5, settings: EUROPE },
      { game: 1_000_000, seed: 5, settings: EUROPE },
      { game: 1, seed: 0.5, settings: EUROPE },
      { game: 1, seed: 5, settings: { ...EUROPE, category: 'atlantide' } },
      { game: 1, seed: 5, settings: { ...EUROPE, mode: 'etats' } },
      // Un mélange s'écrit dans l'ordre, sans le monde, et jamais en mode États.
      { game: 1, seed: 5, settings: { ...EUROPE, category: 'europe,afrique' } },
      { game: 1, seed: 5, settings: { ...EUROPE, category: 'monde,europe' } },
      { game: 1, seed: 5, settings: { ...EUROPE, category: 'afrique,europe', mode: 'etats' } },
      { game: 1, seed: 5, settings: { ...EUROPE, count: 0 } },
      { game: 1, seed: 5, settings: { ...EUROPE, count: 51 } },
      { game: 1, seed: 5, settings: { ...EUROPE, limit: 45 } },
    ],
    finish: [{ game: 1 }, { game: 1, playerId: 'PAS-HEXA' }, { game: 1, playerId: 'a'.repeat(65) }],
    reset: [{}, { game: '2' }],
    progress: [
      { game: 1, playerId: GUEST_ID, found: 51, reachedMs: 0 },
      { game: 1, playerId: GUEST_ID, found: -1, reachedMs: 0 },
      { game: 1, playerId: GUEST_ID, found: 2, reachedMs: -5 },
      { game: 1, playerId: GUEST_ID, found: 2, reachedMs: Number.POSITIVE_INFINITY },
      { game: 1, playerId: GUEST_ID, found: 2, reachedMs: '100' },
    ],
  };

  for (const [event, payloads] of Object.entries(malformed)) {
    it(`un message « ${event} » invalide n’arrive pas à l’écran`, async (t) => {
      const host = await enter(t, HOST_ID, { host: true });
      const intruder = server.device(TOPIC);
      await settle();
      for (const payload of payloads) await intruder.send({ type: 'broadcast', event, payload });
      await settle();
      const { start, finish, reset, progress } = host.box;
      const received = { start, finish, reset, progress };
      assert.deepEqual(received[event as keyof typeof received], []);
    });
  }

  it('un joueur mal formé n’apparaît pas dans la salle', async (t) => {
    const host = await enter(t, HOST_ID, { host: true });
    for (const [key, payload] of [
      ['x1', { id: 'PAS-HEXA', name: 'x', status: 'lobby', game: 0 }],
      ['x2', { id: 'cccc', name: 42, status: 'lobby', game: 0 }],
      ['x3', { id: 'dddd', name: 'x', status: 'triche', game: 0 }],
      ['x4', { id: 'eeee', name: 'x', status: 'lobby', game: -3 }],
    ] as const) {
      await server.device(TOPIC, key).track(payload);
    }
    await settle();
    assert.deepEqual(seen(host.box), [HOST_ID]);
  });

  it('un joueur est nettoyé : pseudo, statut d’hôte, réglages', async (t) => {
    const host = await enter(t, HOST_ID, { host: true });
    await server.device(TOPIC, 'ffff').track({
      id: 'ffff',
      name: '   Un   pseudo vraiment beaucoup trop long  ',
      host: 'oui',
      joinedAt: 'hier',
      status: 'lobby',
      game: 0,
      settings: { ...EUROPE, count: 500 },
      avatar: 'https://ailleurs.example/photo.png',
    });
    await settle();
    const other = host.box.players.at(-1)?.find((p) => p.id === 'ffff');
    assert.deepEqual(other, {
      id: 'ffff',
      name: 'Un pseudo vraime',
      host: false,
      joinedAt: 0,
      status: 'lobby',
      game: 0,
      settings: undefined,
    });
  });

  it('la photo d’un joueur passe, sous forme de référence seulement', async (t) => {
    const host = await enter(t, HOST_ID, { host: true });
    const avatar = '0f8fad5b-d9cb-469f-a165-70867728950e/mg2x1k7a';
    await server.device(TOPIC, GUEST_ID).track(state(GUEST_ID, { avatar }));
    await settle();
    const guest = host.box.players.at(-1)?.find((p) => p.id === GUEST_ID);
    assert.equal(guest?.avatar, avatar);
  });

  it('un joueur publié deux fois (reconnexion) compte une fois, à son dernier état', async (t) => {
    const host = await enter(t, HOST_ID, { host: true });
    await server.device(TOPIC, GUEST_ID).track(state(GUEST_ID, { name: 'avant' }));
    await server.device(TOPIC, GUEST_ID).track(state(GUEST_ID, { name: 'après' }));
    await settle();
    const guests = host.box.players.at(-1)?.filter((p) => p.id === GUEST_ID);
    assert.deepEqual(guests?.map((p) => p.name), ['après']);
  });

  it(`la liste s’arrête à ${MAX_PLAYERS * 2} joueurs, même si on en invente`, async (t) => {
    const host = await enter(t, HOST_ID, { host: true });
    for (let i = 0; i < 40; i++) {
      const id = `${i}`.padStart(4, '0');
      await server.device(TOPIC, id).track(state(id));
    }
    await settle();
    assert.equal(host.box.players.at(-1)?.length, MAX_PLAYERS * 2);
  });
});

describe('quitter la salle, ou la perdre', () => {
  it('celui qui part disparaît de la liste des autres', async (t) => {
    const host = await enter(t, HOST_ID, { host: true });
    const guest = await enter(t, GUEST_ID);
    guest.room.leave();
    await settle();
    assert.deepEqual(seen(host.box), [HOST_ID]);
    assert.equal(channelOf(GUEST_ID).removed, true);
    assert.deepEqual(guest.box.status, ['connected'], 'partir n’est pas une erreur');
  });

  it('partir avant d’être connecté n’ouvre rien', async () => {
    const box = inbox();
    const room = joinRoom(CODE, state(GUEST_ID), box);
    room.leave();
    await settle();
    assert.equal(server.last(TOPIC), undefined);
    assert.deepEqual(box.status, []);
  });

  for (const status of ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'] as const) {
    it(`une coupure (${status}) est signalée à l’écran`, async (t) => {
      const guest = await enter(t, GUEST_ID);
      channelOf(GUEST_ID).cut(status);
      assert.deepEqual(guest.box.status, ['connected', 'error']);
    });
  }
});

describe('les parties publiques', () => {
  /** Annonce une salle dans le hall, et attend que ce soit fait. */
  async function announce(t: TestContext, code: string, settings: RoomSettings | null) {
    const listing = listPublicRoom(code);
    t.after(() => listing.stop());
    listing.show(settings);
    await waitFor(() => server.open('hall').some((c) => c.key === code), `l'annonce de ${code}`);
    await settle();
    const channel = server.open('hall').find((c) => c.key === code);
    if (!channel) throw new Error('canal du hall introuvable');
    return { listing, channel };
  }

  it('une salle annoncée est trouvée par « Partie aléatoire »', async (t) => {
    await announce(t, CODE, EUROPE);
    assert.deepEqual(await findPublicRoom(), { code: CODE, settings: EUROPE });
  });

  it('sans salle annoncée, il n’y a rien à rejoindre', async () => {
    assert.equal(await findPublicRoom(), null);
  });

  it('une annonce mal formée est ignorée', async (t) => {
    await server.device('hall', 'bidon').track({ code: 'K0PQX', settings: EUROPE });
    await server.device('hall', 'faux').track({ code: 'ABCDE', settings: { ...EUROPE, mode: 'etats' } });
    await announce(t, CODE, ASIA);
    assert.deepEqual(await findPublicRoom(), { code: CODE, settings: ASIA });
  });

  it('le hasard choisit parmi toutes les salles ouvertes', async (t) => {
    await announce(t, 'AAAAA', EUROPE);
    await announce(t, 'BBBBB', EUROPE);
    await announce(t, 'CCCCC', EUROPE);
    const found = new Set<string>();
    for (let pick = 0; pick < 3; pick++) {
      t.mock.method(crypto, 'getRandomValues', (array: Uint32Array) => {
        array[0] = pick;
        return array;
      });
      found.add((await findPublicRoom())?.code ?? '');
      t.mock.restoreAll();
    }
    assert.deepEqual([...found].sort(), ['AAAAA', 'BBBBB', 'CCCCC']);
  });

  it('ne republie l’annonce que si les réglages changent', async (t) => {
    const { listing, channel } = await announce(t, CODE, EUROPE);
    listing.show({ ...EUROPE });
    listing.show({ ...EUROPE });
    listing.show(ASIA);
    await settle();
    assert.deepEqual(channel.tracked, [
      { code: CODE, settings: EUROPE },
      { code: CODE, settings: ASIA },
    ]);
  });

  it('retire l’annonce quand la partie commence, une seule fois', async (t) => {
    const { listing, channel } = await announce(t, CODE, EUROPE);
    listing.show(null);
    listing.show(null);
    await settle();
    assert.equal(channel.untracked, 1);
    assert.equal(await findPublicRoom(), null);
  });

  it('les changements faits avant la connexion partent en une seule annonce', async (t) => {
    server.answers = false;
    const listing = listPublicRoom(CODE);
    t.after(() => listing.stop());
    await waitFor(() => server.last('hall') !== undefined, 'le canal du hall');
    listing.show(EUROPE);
    listing.show(ASIA);
    const channel = server.last('hall');
    assert.ok(channel);
    channel.connect();
    await settle();
    assert.deepEqual(channel.tracked, [{ code: CODE, settings: ASIA }]);
  });

  it('refait l’annonce après une coupure', async (t) => {
    const { channel } = await announce(t, CODE, EUROPE);
    channel.cut('CLOSED');
    channel.connect();
    await settle();
    assert.equal(channel.tracked.length, 2);
    assert.deepEqual(await findPublicRoom(), { code: CODE, settings: EUROPE });
  });

  it('disparaît quand l’hôte s’en va', async (t) => {
    const { listing } = await announce(t, CODE, EUROPE);
    listing.stop();
    await settle();
    assert.equal(await findPublicRoom(), null);
  });

  it('la recherche quitte le hall une fois la réponse obtenue', async () => {
    await findPublicRoom();
    await settle();
    assert.deepEqual(server.open('hall'), []);
  });

  it('une liste qui tarde est une liste vide', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    server.syncOnJoin = false;
    const search = findPublicRoom();
    await waitFor(() => server.open('hall').length === 1, 'la connexion au hall');
    t.mock.timers.tick(2000);
    assert.equal(await search, null);
  });

  it('un hall injoignable fait échouer la recherche', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    server.answers = false;
    const search = findPublicRoom();
    await waitFor(() => server.last('hall') !== undefined, 'le canal du hall');
    t.mock.timers.tick(10_000);
    await assert.rejects(search, /Hall injoignable/);
  });

  it('une erreur du hall fait échouer la recherche tout de suite', async () => {
    server.answers = false;
    const search = findPublicRoom();
    await waitFor(() => server.last('hall') !== undefined, 'le canal du hall');
    server.last('hall')?.cut('CHANNEL_ERROR');
    await assert.rejects(search, /Hall injoignable/);
  });
});
