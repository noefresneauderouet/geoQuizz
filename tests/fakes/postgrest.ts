/**
 * Une fausse base Supabase (l'API REST, `@supabase/postgrest-js`).
 *
 * Pendant les tests, scripts/test-loader.mjs la donne à src/lib/supabase.ts
 * à la place de la vraie. Chaque appel de fonction (`rpc`) et chaque lecture
 * de table (`from`, notée `from:<table>`) est noté, et sa réponse vient de
 * `database.respond`, que le test règle : un classement, un refus, ou une
 * panne de réseau (`respond` lève alors une erreur).
 */

export type Answer = { data: unknown; error: { message: string } | null };
export type Call = { name: string; args: unknown; options: unknown };

type ClientOptions = {
  headers?: Record<string, string>;
  fetch?: (input: string, init?: { headers?: Record<string, string> }) => Promise<unknown>;
};

/** Une requête en cours : une promesse, avec ce que leaderboard.ts y enchaîne. */
class Query extends Promise<Answer> {
  abortSignal(): this {
    return this;
  }
}

/**
 * Une lecture de table : `from('profiles').select('avatar').eq('id', …)`. Elle
 * part, comme la vraie, quand on l'attend ; ses arguments sont la colonne
 * choisie et les filtres.
 */
class Table implements PromiseLike<Answer> {
  private args: Record<string, unknown> = {};

  constructor(private readonly table: string) {}

  select(columns: string): this {
    this.args.select = columns;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.args[column] = value;
    return this;
  }

  maybeSingle(): this {
    return this;
  }

  then<A = Answer, B = never>(
    onFulfilled?: ((answer: Answer) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    const name = `from:${this.table}`;
    database.calls.push({ name, args: this.args, options: undefined });
    return new Promise<Answer>((resolve, reject) => {
      queueMicrotask(() => {
        try {
          resolve(database.respond(name, this.args));
        } catch (error) {
          reject(error);
        }
      });
    }).then(onFulfilled, onRejected);
  }
}

export const database = {
  /** Les clients créés : un par onglet au plus, et aucun pour un invité. */
  clients: [] as { url: string; options: ClientOptions }[],
  calls: [] as Call[],
  respond: (() => ({ data: null, error: null })) as (name: string, args: unknown) => Answer,

  reset(): void {
    this.calls = [];
    this.respond = () => ({ data: null, error: null });
  },

  /** Les appels faits à cette fonction de la base. */
  callsTo(name: string): Call[] {
    return this.calls.filter((call) => call.name === name);
  },
};

export class PostgrestClient {
  constructor(url: string, options: ClientOptions = {}) {
    database.clients.push({ url, options });
  }

  from(table: string): Table {
    return new Table(table);
  }

  rpc(name: string, args?: unknown, options?: unknown): Query {
    database.calls.push({ name, args, options });
    return new Query((resolve, reject) => {
      queueMicrotask(() => {
        try {
          resolve(database.respond(name, args));
        } catch (error) {
          reject(error);
        }
      });
    });
  }
}
