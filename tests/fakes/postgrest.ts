/**
 * Une fausse base Supabase (l'API REST, `@supabase/postgrest-js`).
 *
 * Pendant les tests, scripts/test-loader.mjs la donne à src/lib/supabase.ts
 * à la place de la vraie. Chaque appel de fonction (`rpc`) est noté, et sa
 * réponse vient de `database.respond`, que le test règle : un classement,
 * un refus, ou une panne de réseau (`respond` lève alors une erreur).
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
