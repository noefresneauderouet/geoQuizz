/**
 * Un faux Supabase Auth (`@supabase/auth-js`) : inscription, connexion,
 * session enregistrée.
 *
 * Pendant les tests, scripts/test-loader.mjs le donne à src/lib/supabase.ts
 * à la place du vrai. Le test choisit la session de départ et l'erreur que
 * rend la prochaine opération ; chaque appel est noté.
 */

export type FakeSession = {
  access_token: string;
  user: { id: string; email?: string; user_metadata?: { username?: string } };
};

export type FakeAuthError = { code?: string; status?: number; message: string };

type SignUpData = { user: { identities?: unknown[] } | null; session: FakeSession | null };

/** Une session de joueur connecté, telle que Supabase la rend. */
export function sessionOf(id: string, username: string): FakeSession {
  return { access_token: `jeton-${id}`, user: { id, email: `${id}@exemple.fr`, user_metadata: { username } } };
}

export const auth = {
  /** Les clients créés : aucun tant qu'un invité n'a pas de session. */
  clients: [] as unknown[],
  calls: [] as { method: string; args: unknown }[],
  /** La session enregistrée sur l'appareil. */
  session: null as FakeSession | null,
  /** L'erreur que rend la prochaine opération ; `null` : tout se passe bien. */
  error: null as FakeAuthError | null,
  /** Ce que rend une inscription réussie : par défaut, un lien de confirmation part. */
  signUpData: { user: { identities: [{}] }, session: null } as SignUpData,

  reset(): void {
    this.calls = [];
    this.session = null;
    this.error = null;
    this.signUpData = { user: { identities: [{}] }, session: null };
  },

  callsTo(method: string): unknown[] {
    return this.calls.filter((call) => call.method === method).map((call) => call.args);
  },
};

function note(method: string, args: unknown): FakeAuthError | null {
  auth.calls.push({ method, args });
  return auth.error;
}

export class GoTrueClient {
  constructor(options: unknown) {
    auth.clients.push(options);
  }

  onAuthStateChange(): { data: { subscription: { unsubscribe: () => void } } } {
    return { data: { subscription: { unsubscribe: () => undefined } } };
  }

  async getSession() {
    return { data: { session: auth.session }, error: null };
  }

  async signUp(credentials: unknown) {
    const error = note('signUp', credentials);
    return error ? { data: { user: null, session: null }, error } : { data: auth.signUpData, error: null };
  }

  async signInWithPassword(credentials: unknown) {
    const error = note('signInWithPassword', credentials);
    return error ? { data: { session: null }, error } : { data: { session: auth.session }, error: null };
  }

  async resend(options: unknown) {
    return { error: note('resend', options) };
  }

  async signOut(options: unknown) {
    note('signOut', options);
    auth.session = null;
    return { error: null };
  }
}
