/**
 * Les parties à plusieurs.
 *
 * L'app est un export statique : il n'y a pas de serveur pour tenir une
 * salle. Les joueurs se retrouvent donc sur un canal Supabase Realtime,
 * `room:<CODE>`, qui ne stocke rien et se contente de relayer :
 *
 * - **Presence** — qui est là (pseudo, hôte, statut, et les réglages pour le
 *   seul hôte). Le service retire tout
 *   seul ceux qui ferment l'onglet ou perdent le réseau : c'est la salle
 *   d'attente. Supabase limite sévèrement la fréquence de ces mises à jour —
 *   au-delà, il ferme le canal du joueur — : on n'y publie donc que ce qui
 *   change deux ou trois fois par partie, jamais l'avancée.
 * - **Broadcast** — tout le reste : `start` (l'hôte lance, avec la graine du
 *   tirage), `progress` (une réponse trouvée), `finish` (quelqu'un a tout
 *   trouvé, tout le monde s'arrête) et `reset` (retour en salle d'attente).
 *
 * C'est un jeu entre amis, pas un classement public : les invités n'ont pas
 * de compte, et rien ne prouve qui envoie un message. On se contente donc de
 * vérifier que chaque message reçu est bien formé (`parseStart`…), et les
 * parties à plusieurs n'entrent jamais au classement. Rien ici ne dépend de React ; src/components/multi/use-room.ts
 * l'enveloppe dans un hook.
 */
import type { RealtimeChannel, RealtimeClient } from '@supabase/realtime-js';

import { categoriesFor, MODES, type CategoryId, type ModeId } from '@/constants/categories';
import { getItem, setItem } from '@/lib/storage';
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from '@/lib/supabase';

/* --------------------------------- Salle --------------------------------- */

export const MAX_PLAYERS = 8;
/** Durée du compte à rebours entre le lancement et la première question. */
export const COUNTDOWN_MS = 3000;

/** Sans 0/O ni 1/I/L : un code se dicte sans ambiguïté. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;

export function newRoomCode(): string {
  const values = crypto.getRandomValues(new Uint32Array(CODE_LENGTH));
  return Array.from(values, (v) => CODE_ALPHABET[v % CODE_ALPHABET.length]).join('');
}

export function isRoomCode(value: string | null | undefined): value is string {
  return (
    typeof value === 'string' &&
    value.length === CODE_LENGTH &&
    [...value].every((c) => CODE_ALPHABET.includes(c))
  );
}

/**
 * Le code tel qu'on le saisit à la main : en minuscules, espacé, ou collé
 * avec le lien tout entier — c'est ce qu'on a sous la main quand un ami
 * l'envoie. `null` si rien de valable n'en sort.
 */
export function parseRoomCode(value: string): string | null {
  const fromLink = value.match(/[?&]code=([^&\s]+)/i)?.[1];
  const code = (fromLink ?? value).replace(/[\s-]/g, '').toUpperCase();
  return isRoomCode(code) ? code : null;
}

/** Ce que la salle fait jouer. Tout est dans le lien : on l'affiche avant même d'être connecté. */
export type RoomSettings = {
  category: CategoryId;
  mode: ModeId;
  count: number;
  /** Temps imparti en secondes ; 0 : pas de limite, la partie finit au premier qui a tout trouvé. */
  limit: TimeLimit;
};

export function roomPath(code: string, settings: RoomSettings): string {
  const { category, mode, count, limit } = settings;
  return `/salle?code=${code}&category=${category}&mode=${mode}&count=${count}&limit=${limit}`;
}

/**
 * Entrer par le code seul : le lien complet n'est pas passé par là, donc les
 * réglages manquent. L'hôte les publie dans la salle (`PlayerState.settings`),
 * et le lancement les porte de toute façon.
 */
export function joinPath(code: string): string {
  return `/salle?code=${code}`;
}

/** Limites de temps proposées à la création d'une salle, en secondes. */
export const TIME_LIMITS = [0, 60, 120, 180, 300] as const;
export type TimeLimit = (typeof TIME_LIMITS)[number];

/** Lit la limite dans l'URL ; toute valeur inconnue veut dire « pas de limite ». */
export function getTimeLimit(value: string | null | undefined): TimeLimit {
  return TIME_LIMITS.find((limit) => String(limit) === value) ?? 0;
}

/** « 2 min », ou « Aucune ». */
export function formatTimeLimit(limit: TimeLimit): string {
  return limit === 0 ? 'Aucune' : `${limit / 60} min`;
}

/* -------------------------------- Identité ------------------------------- */

const PLAYER_ID_KEY = 'geolearn.player.id';
const PLAYER_NAME_KEY = 'geolearn.player.name';
export const MAX_NAME_LENGTH = 16;

/** Identifiant stable de cet appareil, créé à la première partie à plusieurs. */
export function getPlayerId(): string {
  const existing = getItem(PLAYER_ID_KEY);
  if (existing) return existing;
  // Pas de `crypto.randomUUID` : il n'existe que sur HTTPS ou localhost, et un
  // téléphone qui teste sur le réseau local ouvre l'app en http://192.168…
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  setItem(PLAYER_ID_KEY, id);
  return id;
}

export function getPlayerName(): string {
  return getItem(PLAYER_NAME_KEY) ?? '';
}

export function setPlayerName(name: string): void {
  setItem(PLAYER_NAME_KEY, cleanName(name));
}

export function cleanName(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
}

/*
 * L'hôte est celui qui a créé la salle, dans cet onglet. sessionStorage
 * plutôt que localStorage : le lien ouvert ailleurs, même sur cet appareil,
 * doit faire entrer en invité.
 */
const hostKey = (code: string) => `geolearn.host.${code}`;

export function markAsHost(code: string): void {
  try {
    globalThis.sessionStorage?.setItem(hostKey(code), '1');
  } catch {
    // stockage indisponible : on jouera en invité
  }
}

export function isHostOf(code: string): boolean {
  try {
    return globalThis.sessionStorage?.getItem(hostKey(code)) === '1';
  } catch {
    return false;
  }
}

/* --------------------------------- Joueurs ------------------------------- */

export type PlayerStatus = 'lobby' | 'playing' | 'done';

/** Ce que chaque joueur publie de lui-même (Presence) : rien qui change en cours de partie. */
export type PlayerState = {
  id: string;
  name: string;
  host: boolean;
  joinedAt: number;
  status: PlayerStatus;
  /** Numéro de la partie dans la salle : il avance à chaque « Rejouer ». */
  game: number;
  /**
   * Publié par le seul hôte, et jamais modifié ensuite : c'est ainsi que
   * celui qui est entré avec le code seul apprend ce que la salle fait jouer.
   */
  settings?: RoomSettings;
};

/** Un joueur tel qu'on le connaît : son dernier état publié, et s'il est encore là. */
export type KnownPlayer = PlayerState & { connected: boolean };

/** L'avancée d'un joueur dans une partie. */
export type Score = {
  /** Questions trouvées : le joueur en est à la question `found + 1`. */
  found: number;
  /**
   * Temps écoulé depuis *son* lancement quand il a trouvé la dernière
   * réponse. Mesuré sur son propre appareil : des horloges mal réglées ne
   * faussent rien. C'est ce qui départage deux joueurs au même niveau.
   */
  reachedMs: number;
};

/** Un participant et son avancée, tel qu'on l'affiche en jeu et au classement. */
export type Contender = KnownPlayer & Score;

/**
 * Plus de questions trouvées d'abord ; à égalité, celui qui y est arrivé le
 * premier. L'identifiant départage le reste, pour que l'ordre soit le même sur
 * tous les écrans.
 */
export function rankPlayers<T extends PlayerState & Score>(players: readonly T[]): T[] {
  return [...players].sort(
    (a, b) => b.found - a.found || a.reachedMs - b.reachedMs || a.id.localeCompare(b.id),
  );
}

/* --------------------------------- Réseau -------------------------------- */

/**
 * Le lancement porte les réglages : tout le monde construit la même manche,
 * y compris celui dont l'URL ne les contient pas.
 */
export type StartMessage = { game: number; seed: number; settings: RoomSettings };
export type FinishMessage = { game: number; playerId: string };
export type ResetMessage = { game: number };
export type ProgressMessage = Score & { game: number; playerId: string };

export type RoomHandlers = {
  /** Tous les joueurs présents, à chaque changement. */
  onPlayers: (players: PlayerState[]) => void;
  onStart: (message: StartMessage) => void;
  onFinish: (message: FinishMessage) => void;
  /** L'hôte ramène tout le monde en salle d'attente pour une nouvelle partie. */
  onReset: (message: ResetMessage) => void;
  onProgress: (message: ProgressMessage) => void;
  onStatus: (status: 'connected' | 'error') => void;
};

export type RoomConnection = {
  publish: (state: PlayerState) => void;
  start: (message: StartMessage) => void;
  finish: (message: FinishMessage) => void;
  reset: (message: ResetMessage) => void;
  progress: (message: ProgressMessage) => void;
  leave: () => void;
};

/*
 * Ce qui arrive du canal vient de n'importe qui connaissant le code : on ne
 * transmet à l'écran que des messages bien formés, aux valeurs plausibles.
 * Un message qui ne l'est pas est ignoré.
 */

const isGame = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) < 1_000_000;

const isPlayerId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f-]{1,64}$/.test(value);

function isSettings(value: unknown): value is RoomSettings {
  if (typeof value !== 'object' || value === null) return false;
  const { category, mode, count, limit } = value as Record<string, unknown>;
  return (
    MODES.some((m) => m.id === mode) &&
    categoriesFor(mode as ModeId).some((c) => c.id === category) &&
    Number.isInteger(count) &&
    (count as number) >= 1 &&
    (count as number) <= 50 &&
    TIME_LIMITS.some((l) => l === limit)
  );
}

function parseStart(payload: unknown): StartMessage | null {
  const m = payload as Partial<StartMessage> | null;
  return m && isGame(m.game) && Number.isInteger(m.seed) && isSettings(m.settings)
    ? { game: m.game, seed: m.seed as number, settings: m.settings }
    : null;
}

function parseFinish(payload: unknown): FinishMessage | null {
  const m = payload as Partial<FinishMessage> | null;
  return m && isGame(m.game) && isPlayerId(m.playerId) ? { game: m.game, playerId: m.playerId } : null;
}

function parseReset(payload: unknown): ResetMessage | null {
  const m = payload as Partial<ResetMessage> | null;
  return m && isGame(m.game) ? { game: m.game } : null;
}

function parseProgress(payload: unknown): ProgressMessage | null {
  const m = payload as Partial<ProgressMessage> | null;
  return m &&
    isGame(m.game) &&
    isPlayerId(m.playerId) &&
    Number.isInteger(m.found) &&
    (m.found as number) >= 0 &&
    (m.found as number) <= 50 &&
    typeof m.reachedMs === 'number' &&
    Number.isFinite(m.reachedMs) &&
    m.reachedMs >= 0
    ? { game: m.game, playerId: m.playerId, found: m.found as number, reachedMs: m.reachedMs }
    : null;
}

/** Un état de joueur publié dans la salle, nettoyé ; `null` s'il est mal formé. */
function parsePlayer(value: unknown): PlayerState | null {
  const p = value as Partial<PlayerState> | null;
  if (!p || !isPlayerId(p.id) || typeof p.name !== 'string') return null;
  if (!['lobby', 'playing', 'done'].includes(p.status as string) || !isGame(p.game)) return null;
  return {
    id: p.id,
    name: cleanName(p.name),
    host: p.host === true,
    joinedAt: typeof p.joinedAt === 'number' && Number.isFinite(p.joinedAt) ? p.joinedAt : 0,
    status: p.status as PlayerStatus,
    game: p.game,
    settings: isSettings(p.settings) ? p.settings : undefined,
  };
}

/** Appelle `handler` avec le message, s'il est valable. */
function when<T>(parse: (payload: unknown) => T | null, handler: (message: T) => void) {
  return ({ payload }: { payload: unknown }) => {
    const message = parse(payload);
    if (message) handler(message);
  };
}

/** Vrai si le projet Supabase est configuré dans cette construction. */
export const isMultiplayerConfigured = isSupabaseConfigured;

let client: RealtimeClient | null = null;

/**
 * Le client n'est chargé qu'ici, par import dynamique : le jeu solo n'en
 * embarque pas une ligne.
 */
async function getClient(): Promise<RealtimeClient> {
  if (client) return client;
  const { RealtimeClient } = await import('@supabase/realtime-js');
  client = new RealtimeClient(`${supabaseUrl().replace(/^http/, 'ws')}/realtime/v1`, {
    params: { apikey: supabaseKey() },
  });
  return client;
}

/**
 * Rejoint la salle. La connexion se fait en arrière-plan ; `leave` peut être
 * appelé à tout moment, même avant qu'elle aboutisse.
 */
export function joinRoom(code: string, self: PlayerState, handlers: RoomHandlers): RoomConnection {
  let channel: RealtimeChannel | null = null;
  let left = false;
  let latest = self;
  let subscribed = false;

  void getClient().then((realtime) => {
    if (left) return;
    channel = realtime.channel(`room:${code}`, {
      config: {
        // Pas d'écho de ses propres messages : quand l'envoi passe par l'API
        // HTTP (repli automatique de la bibliothèque), il ne revient jamais.
        // L'expéditeur applique donc lui-même ce qu'il envoie.
        broadcast: { self: false },
        presence: { key: self.id, enabled: true },
      },
    });

    const ch = channel;
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<PlayerState>();
      // Un même joueur peut apparaître deux fois le temps d'une reconnexion :
      // on garde sa publication la plus récente.
      const players: PlayerState[] = Object.values(state)
        .map((entries) => parsePlayer(entries[entries.length - 1]))
        .filter((player) => player !== null)
        .slice(0, MAX_PLAYERS * 2);
      handlers.onPlayers(players);
    })
      .on('broadcast', { event: 'start' }, when(parseStart, handlers.onStart))
      .on('broadcast', { event: 'finish' }, when(parseFinish, handlers.onFinish))
      .on('broadcast', { event: 'reset' }, when(parseReset, handlers.onReset))
      .on('broadcast', { event: 'progress' }, when(parseProgress, handlers.onProgress))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          subscribed = true;
          void ch.track(latest);
          handlers.onStatus('connected');
        } else if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          // Fermé sans qu'on l'ait quitté : le serveur nous a coupés (limite
          // dépassée, par exemple). Mieux vaut le dire que se taire.
          (status === 'CLOSED' && !left)
        ) {
          handlers.onStatus('error');
        }
      });
  });

  const send = (event: string, payload: object) => {
    void channel?.send({ type: 'broadcast', event, payload });
  };

  return {
    publish: (state) => {
      latest = state;
      if (subscribed) void channel?.track(state);
    },
    start: (message) => send('start', message),
    finish: (message) => send('finish', message),
    reset: (message) => send('reset', message),
    progress: (message) => send('progress', message),
    leave: () => {
      left = true;
      if (channel && client) void client.removeChannel(channel);
      channel = null;
    },
  };
}
