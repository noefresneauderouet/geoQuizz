/**
 * Les parties à plusieurs.
 *
 * L'app est un export statique : il n'y a pas de serveur pour tenir une
 * salle. Les joueurs se retrouvent donc sur un canal Supabase Realtime,
 * `room:<CODE>`, qui ne stocke rien et se contente de relayer :
 *
 * - **Presence** — qui est là (pseudo, hôte, statut). Le service retire tout
 *   seul ceux qui ferment l'onglet ou perdent le réseau : c'est la salle
 *   d'attente. Supabase limite sévèrement la fréquence de ces mises à jour —
 *   au-delà, il ferme le canal du joueur — : on n'y publie donc que ce qui
 *   change deux ou trois fois par partie, jamais l'avancée.
 * - **Broadcast** — tout le reste : `start` (l'hôte lance, avec la graine du
 *   tirage), `progress` (une réponse trouvée), `finish` (quelqu'un a tout
 *   trouvé, tout le monde s'arrête) et `reset` (retour en salle d'attente).
 *
 * Chaque client est de confiance : c'est un jeu entre amis, pas un classement
 * public. Rien ici ne dépend de React ; src/components/multi/use-room.ts
 * l'enveloppe dans un hook.
 */
import type { RealtimeChannel, RealtimeClient } from '@supabase/realtime-js';

import type { CategoryId, ModeId } from '@/constants/categories';
import { getItem, setItem } from '@/lib/storage';

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
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
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

export type StartMessage = { game: number; seed: number };
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

/** Vrai si le projet Supabase est configuré dans cette construction. */
export function isMultiplayerConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

let client: RealtimeClient | null = null;

/**
 * Le client n'est chargé qu'ici, par import dynamique : le jeu solo n'en
 * embarque pas une ligne.
 */
async function getClient(): Promise<RealtimeClient> {
  if (client) return client;
  const { RealtimeClient } = await import('@supabase/realtime-js');
  // L'adresse attendue est la racine du projet ; celle de l'API REST, souvent
  // copiée à sa place, est ramenée à la racine.
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    .replace(/\/rest\/v1\/?$/, '')
    .replace(/\/$/, '');
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  client = new RealtimeClient(`${url.replace(/^http/, 'ws')}/realtime/v1`, {
    params: { apikey },
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
        .map((entries) => entries[entries.length - 1])
        .filter(Boolean);
      handlers.onPlayers(players);
    })
      .on('broadcast', { event: 'start' }, ({ payload }) => handlers.onStart(payload as StartMessage))
      .on('broadcast', { event: 'finish' }, ({ payload }) =>
        handlers.onFinish(payload as FinishMessage),
      )
      .on('broadcast', { event: 'reset' }, ({ payload }) => handlers.onReset(payload as ResetMessage))
      .on('broadcast', { event: 'progress' }, ({ payload }) =>
        handlers.onProgress(payload as ProgressMessage),
      )
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
