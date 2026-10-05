/**
 * Un faux Supabase Realtime, tout en mémoire.
 *
 * Pendant les tests, scripts/test-loader.mjs le donne à src/lib/room.ts à la
 * place de `@supabase/realtime-js`. Il joue le serveur : les canaux ouverts
 * sur un même sujet (`room:K7PQX`, `hall`) reçoivent les messages des autres
 * et voient leur Presence, comme autant d'appareils dans une même salle.
 *
 * Il ne reproduit que ce dont room.ts se sert, et garde la trace de tout ce
 * qui passe : les tests vérifient ce qui a été publié, et combien de fois.
 */

export type Status = 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR' | 'TIMED_OUT';

export type BroadcastMessage = { type: 'broadcast'; event: string; payload: unknown };

type ChannelOptions = {
  config?: {
    broadcast?: { self?: boolean };
    presence?: { key?: string; enabled?: boolean };
  };
};

let anonymous = 0;

export class FakeChannel {
  readonly topic: string;
  readonly options: ChannelOptions;
  /** La clé de Presence : l'identifiant du joueur, le code de la salle, ou une clé tirée. */
  readonly key: string;
  /** Abonné, et pas encore parti ni coupé. */
  joined = false;
  /** Retiré par `removeChannel`. */
  removed = false;
  /** Chaque état publié en Presence, dans l'ordre : c'est là que se compte la limite de fréquence. */
  readonly tracked: unknown[] = [];
  untracked = 0;
  /** L'état publié en ce moment ; `undefined` s'il n'y en a pas. */
  presence: unknown = undefined;
  readonly sent: BroadcastMessage[] = [];
  readonly received: BroadcastMessage[] = [];

  private listener: ((status: Status) => void) | null = null;
  private syncs: (() => void)[] = [];
  private broadcasts: { event: string; callback: (message?: BroadcastMessage) => void }[] = [];

  constructor(topic: string, options: ChannelOptions = {}) {
    this.topic = topic;
    this.options = options;
    this.key = options.config?.presence?.key || `anonyme-${++anonymous}`;
  }

  on(type: string, filter: { event: string }, callback: (message?: BroadcastMessage) => void): this {
    if (type === 'presence' && filter.event === 'sync') this.syncs.push(callback);
    if (type === 'broadcast') this.broadcasts.push({ event: filter.event, callback });
    return this;
  }

  subscribe(listener?: (status: Status) => void): this {
    this.listener = listener ?? null;
    if (server.answers) queueMicrotask(() => this.connect());
    return this;
  }

  /** Le serveur accepte l'abonnement : SUBSCRIBED, puis l'état de Presence de la salle. */
  connect(): void {
    if (this.removed) return;
    this.joined = true;
    this.listener?.('SUBSCRIBED');
    if (server.syncOnJoin) this.sync();
  }

  /** Une coupure, venue du serveur ou du réseau : le canal sort de la salle. */
  cut(status: Exclude<Status, 'SUBSCRIBED'>): void {
    this.drop();
    this.listener?.(status);
  }

  presenceState(): Record<string, unknown[]> {
    const state: Record<string, unknown[]> = {};
    for (const channel of server.open(this.topic)) {
      if (channel.presence !== undefined) (state[channel.key] ??= []).push(channel.presence);
    }
    return state;
  }

  async track(payload: unknown): Promise<'ok'> {
    this.tracked.push(payload);
    this.presence = payload;
    server.syncAll(this.topic);
    return 'ok';
  }

  async untrack(): Promise<'ok'> {
    this.untracked += 1;
    this.presence = undefined;
    server.syncAll(this.topic);
    return 'ok';
  }

  async send(message: BroadcastMessage): Promise<'ok'> {
    this.sent.push(message);
    for (const channel of server.open(this.topic)) {
      if (channel === this && this.options.config?.broadcast?.self !== true) continue;
      queueMicrotask(() => channel.deliver(message));
    }
    return 'ok';
  }

  sync(): void {
    for (const callback of this.syncs) callback();
  }

  deliver(message: BroadcastMessage): void {
    if (!this.joined) return;
    this.received.push(message);
    for (const { event, callback } of this.broadcasts) if (event === message.event) callback(message);
  }

  leave(): void {
    this.removed = true;
    this.drop();
    this.listener?.('CLOSED');
  }

  private drop(): void {
    const present = this.joined && this.presence !== undefined;
    this.joined = false;
    this.presence = undefined;
    if (present) server.syncAll(this.topic);
  }
}

export class RealtimeClient {
  readonly url: string;
  readonly options: unknown;

  constructor(url: string, options?: unknown) {
    this.url = url;
    this.options = options;
    server.clients.push(this);
  }

  channel(topic: string, options?: ChannelOptions): FakeChannel {
    const channel = new FakeChannel(topic, options);
    server.channels.push(channel);
    return channel;
  }

  async removeChannel(channel: FakeChannel): Promise<'ok'> {
    channel.leave();
    return 'ok';
  }
}

/** Le serveur, et les réglages qui permettent aux tests de le dérégler. */
export const server = {
  /** Les clients créés : room.ts n'en ouvre qu'un par onglet. */
  clients: [] as RealtimeClient[],
  /** Les canaux ouverts depuis le dernier `reset`, dans l'ordre. */
  channels: [] as FakeChannel[],
  /** Faux : les abonnements restent en attente, comme sans réseau. */
  answers: true,
  /** Faux : le serveur n'envoie pas l'état de Presence à l'arrivée. */
  syncOnJoin: true,

  reset(): void {
    this.channels = [];
    this.answers = true;
    this.syncOnJoin = true;
  },

  /** Les canaux de ce sujet encore dans la salle. */
  open(topic: string): FakeChannel[] {
    return this.channels.filter((channel) => channel.topic === topic && channel.joined);
  },

  /** Le dernier canal ouvert sur ce sujet. */
  last(topic: string): FakeChannel | undefined {
    return this.channels.filter((channel) => channel.topic === topic).at(-1);
  },

  /** Prévient chaque canal de la salle que la Presence a changé. */
  syncAll(topic: string): void {
    queueMicrotask(() => {
      for (const channel of this.open(topic)) channel.sync();
    });
  },

  /** Un appareil piloté par le test : un autre joueur, ou quelqu'un qui envoie n'importe quoi. */
  device(topic: string, key?: string): FakeChannel {
    const channel = new FakeChannel(topic, { config: { presence: { key } } });
    this.channels.push(channel);
    return channel.subscribe();
  },
};
