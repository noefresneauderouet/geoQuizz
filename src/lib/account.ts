/**
 * Le compte du joueur : inscription, connexion, déconnexion.
 *
 * Un compte ne sert qu'au classement : on joue sans. L'état tient dans un
 * petit store externe, comme la progression ; src/components/use-account.ts
 * l'enveloppe dans un hook. Rien ici ne dépend de React.
 *
 * Tant qu'aucune session n'est enregistrée sur l'appareil, le client Auth
 * n'est pas chargé : l'invité reste invité sans télécharger une ligne.
 */
import type { AuthError, Session } from '@supabase/auth-js';

import { cleanName, MAX_NAME_LENGTH } from '@/lib/room';
import { getAuth, getDb, hasStoredSession, isSupabaseConfigured } from '@/lib/supabase';

export type Account =
  /** Pendant le rendu statique, l'hydratation et la lecture de la session. */
  | { status: 'loading' }
  /** Supabase n'est pas configuré dans cette construction. */
  | { status: 'unavailable' }
  | { status: 'guest' }
  | { status: 'signed-in'; id: string; email: string; username: string };

export const LOADING: Account = { status: 'loading' };

let snapshot: Account = LOADING;
let started = false;
const listeners = new Set<() => void>();
const signInListeners = new Set<(account: Extract<Account, { status: 'signed-in' }>) => void>();

function set(next: Account) {
  snapshot = next;
  listeners.forEach((listener) => listener());
  if (next.status === 'signed-in') signInListeners.forEach((listener) => listener(next));
}

function fromSession(session: Session | null): Account {
  if (!session) return { status: 'guest' };
  const { user } = session;
  return {
    status: 'signed-in',
    id: user.id,
    email: user.email ?? '',
    // Le pseudo part dans les métadonnées à l'inscription : la session le
    // porte, sans requête de plus. La table `profiles` en garde la copie
    // publique, celle que lit le classement.
    username: String(user.user_metadata?.username ?? ''),
  };
}

/**
 * Lit la session une fois, puis suit ses changements (connexion dans un autre
 * onglet, jeton expiré…).
 */
function start() {
  if (started) return;
  started = true;
  if (!isSupabaseConfigured()) {
    set({ status: 'unavailable' });
    return;
  }
  // Le lien de confirmation d'e-mail arrive avec la session dans l'adresse :
  // c'est le seul cas où il faut charger le client sans session enregistrée.
  const fromEmailLink = /access_token=|[?&]code=/.test(globalThis.location?.href ?? '');
  if (!hasStoredSession() && !fromEmailLink) {
    set({ status: 'guest' });
    return;
  }
  void load();
}

let loaded: Promise<void> | null = null;

function load(): Promise<void> {
  loaded ??= getAuth().then(async (auth) => {
    auth.onAuthStateChange((_event, session) => {
      // Le rappel ne doit pas attendre d'autre appel Auth : on se contente de
      // publier le nouvel état.
      const next = fromSession(session);
      if (next.status !== snapshot.status || !sameAccount(next, snapshot)) set(next);
    });
    const { data } = await auth.getSession();
    set(fromSession(data.session));
  });
  return loaded;
}

function sameAccount(a: Account, b: Account): boolean {
  return a.status === 'signed-in' && b.status === 'signed-in' && a.id === b.id;
}

export function subscribeAccount(listener: () => void): () => void {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

export function getAccount(): Account {
  return snapshot;
}

/** Appelé à chaque connexion, et au chargement quand une session existe déjà. */
export function onSignedIn(
  listener: (account: Extract<Account, { status: 'signed-in' }>) => void,
): () => void {
  signInListeners.add(listener);
  start();
  if (snapshot.status === 'signed-in') listener(snapshot);
  return () => {
    signInListeners.delete(listener);
  };
}

/** Attend que la session soit lue : `guest`, `signed-in` ou `unavailable`. */
export async function readAccount(): Promise<Account> {
  start();
  if (snapshot.status === 'loading') await load();
  return snapshot;
}

/* -------------------------------- Actions -------------------------------- */

export const MIN_NAME_LENGTH = 3;
export const MIN_PASSWORD_LENGTH = 6;
export { MAX_NAME_LENGTH };

/** Un échec affichable tel quel, ou rien quand tout s'est bien passé. */
export type Failure = { error: string };

export type SignUpResult =
  | Failure
  /** Connecté tout de suite : la confirmation d'e-mail est désactivée. */
  | { status: 'signed-in' }
  /** Un lien de confirmation vient de partir. */
  | { status: 'confirm-email' };

export async function signUp(
  email: string,
  password: string,
  rawUsername: string,
): Promise<SignUpResult> {
  const username = cleanName(rawUsername);
  if (username.length < MIN_NAME_LENGTH) {
    return { error: `Le pseudo doit faire au moins ${MIN_NAME_LENGTH} caractères.` };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.` };
  }
  try {
    // Vérifié avant : la base refuserait un pseudo pris, mais avec une erreur
    // générique qui n'aiderait personne.
    const db = await getDb();
    const { data: available, error: checkError } = await db.rpc('username_available', {
      p_username: username,
    });
    if (checkError) return { error: NETWORK_ERROR };
    if (available === false) return { error: 'Ce pseudo est déjà pris.' };

    const auth = await getAuth();
    const { data, error } = await auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { username },
        emailRedirectTo: `${globalThis.location.origin}/compte`,
      },
    });
    if (error) return { error: describe(error) };
    // Adresse déjà inscrite, confirmation active : Supabase ne le dit pas
    // (pour ne pas révéler qui a un compte) et rend un utilisateur sans
    // identité.
    if (data.user && data.user.identities?.length === 0) {
      return { error: 'Un compte existe déjà avec cette adresse.' };
    }
    if (data.session) {
      set(fromSession(data.session));
      return { status: 'signed-in' };
    }
    return { status: 'confirm-email' };
  } catch {
    return { error: NETWORK_ERROR };
  }
}

export async function signIn(email: string, password: string): Promise<Failure | null> {
  try {
    const auth = await getAuth();
    if (!loaded) void load();
    const { data, error } = await auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { error: describe(error) };
    set(fromSession(data.session));
    return null;
  } catch {
    return { error: NETWORK_ERROR };
  }
}

export async function signOut(): Promise<void> {
  try {
    const auth = await getAuth();
    // `local` : ne déconnecte que cet appareil, et fonctionne hors ligne.
    await auth.signOut({ scope: 'local' });
  } finally {
    set({ status: 'guest' });
  }
}

const NETWORK_ERROR = 'Connexion au serveur impossible. Vérifie ton réseau et réessaie.';

/** Les erreurs d'Auth, en français. Les codes sont ceux de Supabase Auth. */
function describe(error: AuthError): string {
  switch (error.code) {
    case 'invalid_credentials':
      return 'Adresse ou mot de passe incorrect.';
    case 'email_not_confirmed':
      return 'Confirme d’abord ton adresse : le lien est dans tes e-mails.';
    case 'user_already_exists':
    case 'email_exists':
      return 'Un compte existe déjà avec cette adresse.';
    case 'weak_password':
      return 'Mot de passe trop faible : allonge-le ou mélange lettres et chiffres.';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'Cette adresse e-mail n’est pas valide.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Trop de tentatives. Réessaie dans quelques minutes.';
    case 'signup_disabled':
      return 'Les inscriptions sont fermées pour le moment.';
    default:
      return error.status === 0 || !error.status ? NETWORK_ERROR : error.message;
  }
}
