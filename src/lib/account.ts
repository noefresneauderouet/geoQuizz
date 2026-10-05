/**
 * Le compte du joueur : inscription, connexion (e-mail ou Google),
 * déconnexion.
 *
 * Un compte ne sert qu'au classement : on joue sans. L'état tient dans un
 * petit store externe, comme la progression ; src/components/use-account.ts
 * l'enveloppe dans un hook. Rien ici ne dépend de React.
 *
 * Tant qu'aucune session n'est enregistrée sur l'appareil, le client Auth
 * n'est pas chargé : l'invité reste invité sans télécharger une ligne.
 */
import type { AuthError, Session, User } from '@supabase/auth-js';

import { cleanName, MAX_NAME_LENGTH } from '@/lib/room';
import { getAuth, getDb, hasStoredSession, isSupabaseConfigured } from '@/lib/supabase';

export type Account =
  /** Pendant le rendu statique, l'hydratation et la lecture de la session. */
  | { status: 'loading' }
  /** Supabase n'est pas configuré dans cette construction. */
  | { status: 'unavailable' }
  | { status: 'guest' }
  | { status: 'signed-in'; id: string; email: string; username: string }
  /**
   * Connecté avec Google pour la première fois : le pseudo du classement
   * reste à choisir (`chooseUsername`). Hors classement d'ici là.
   */
  | { status: 'needs-username'; id: string; email: string };

export const LOADING: Account = { status: 'loading' };

let snapshot: Account = LOADING;
let started = false;
/** L'échec d'un retour vers le site, lu dans l'adresse au chargement. */
let redirectError: string | null = null;
const listeners = new Set<() => void>();
const signInListeners = new Set<(account: Extract<Account, { status: 'signed-in' }>) => void>();

function set(next: Account) {
  snapshot = next;
  listeners.forEach((listener) => listener());
  if (next.status === 'signed-in') signInListeners.forEach((listener) => listener(next));
}

function fromSession(session: Session | null): Account {
  return fromUser(session?.user ?? null);
}

function fromUser(user: User | null): Account {
  if (!user) return { status: 'guest' };
  const id = user.id;
  const email = user.email ?? '';
  // Le pseudo part dans les métadonnées à l'inscription (ou quand un compte
  // Google le choisit) : la session le porte, sans requête de plus. La table
  // `profiles` en garde la copie publique, celle que lit le classement.
  const username = String(user.user_metadata?.username ?? '');
  return username
    ? { status: 'signed-in', id, email, username }
    : { status: 'needs-username', id, email };
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
  redirectError = readRedirectError();
  // Le lien de confirmation d'e-mail et le retour de Google arrivent avec la
  // session dans l'adresse : c'est le seul cas où il faut charger le client
  // sans session enregistrée.
  const fromRedirect = /access_token=|[?&]code=/.test(globalThis.location?.href ?? '');
  if (!hasStoredSession() && !fromRedirect) {
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
  return 'id' in a && 'id' in b && a.id === b.id;
}

/**
 * Un retour qui a échoué (Google refusé, lien d'e-mail expiré) revient avec
 * l'erreur dans l'adresse, après `?` et après `#`. On la garde pour l'écran
 * Compte, et on l'efface de l'adresse : un rechargement ne la remontre pas.
 */
function readRedirectError(): string | null {
  const location = globalThis.location;
  if (!location || !/[?#&]error=/.test(location.href)) return null;
  const params = new URLSearchParams(`${location.search.slice(1)}&${location.hash.slice(1)}`);
  const url = new URL(location.href);
  for (const key of ['error', 'error_code', 'error_description']) url.searchParams.delete(key);
  url.hash = '';
  history.replaceState(history.state, '', url);
  if (params.get('error_code') === 'otp_expired') {
    return 'Ce lien a expiré ou a déjà servi : essaie de te connecter.';
  }
  if (params.get('error') === 'access_denied') return 'Connexion avec Google annulée.';
  return 'La connexion a échoué. Réessaie, ou passe par ton adresse e-mail.';
}

/**
 * L'erreur rapportée par le dernier retour vers le site, jusqu'à la
 * prochaine tentative de connexion.
 */
export function getRedirectError(): string | null {
  return redirectError;
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
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Lettres latines (accents compris), chiffres, `_` et `-`, mots séparés par
 * une espace : pas de caractère invisible ni d'inversion du sens d'écriture.
 * La base applique la même règle (contrainte `profiles_username_charset`).
 */
const USERNAME_PATTERN = /^[A-Za-z0-9À-ÖØ-öø-ÿŒœ_-]+( [A-Za-z0-9À-ÖØ-öø-ÿŒœ_-]+)*$/u;
export { MAX_NAME_LENGTH };

/** Un échec affichable tel quel, ou rien quand tout s'est bien passé. */
export type Failure = { error: string };

const USERNAME_TAKEN = 'Ce pseudo est déjà pris.';
const USERNAME_CHARSET = 'Le pseudo ne peut contenir que des lettres, des chiffres, _ et -.';

/** Ce qui ne va pas dans un pseudo déjà nettoyé (`cleanName`), s'il y a lieu. */
function checkUsername(username: string): Failure | null {
  if (username.length < MIN_NAME_LENGTH) {
    return { error: `Le pseudo doit faire au moins ${MIN_NAME_LENGTH} caractères.` };
  }
  if (!USERNAME_PATTERN.test(username)) return { error: USERNAME_CHARSET };
  return null;
}

export type SignUpResult =
  | Failure
  /** Connecté tout de suite : la confirmation d'e-mail est désactivée. */
  | { status: 'signed-in' }
  /** Un lien de confirmation vient de partir. */
  | { status: 'confirm-email' };

/**
 * `captchaToken` : la réponse du CAPTCHA (src/components/account/captcha.tsx),
 * quand il est activé. Supabase Auth la vérifie ; sans CAPTCHA, elle est vide.
 */
export async function signUp(
  email: string,
  password: string,
  rawUsername: string,
  captchaToken?: string,
): Promise<SignUpResult> {
  redirectError = null;
  const username = cleanName(rawUsername);
  const invalid = checkUsername(username);
  if (invalid) return invalid;
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
    if (available === false) return { error: USERNAME_TAKEN };

    const auth = await getAuth();
    const { data, error } = await auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { username },
        emailRedirectTo: `${globalThis.location.origin}/compte`,
        captchaToken,
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

/** Renvoie le lien de confirmation, s'il s'est perdu ou a expiré. */
export async function resendConfirmation(
  email: string,
  captchaToken?: string,
): Promise<Failure | null> {
  try {
    const auth = await getAuth();
    const { error } = await auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${globalThis.location.origin}/compte`, captchaToken },
    });
    return error ? { error: describe(error) } : null;
  } catch {
    return { error: NETWORK_ERROR };
  }
}

export async function signIn(
  email: string,
  password: string,
  captchaToken?: string,
): Promise<Failure | null> {
  redirectError = null;
  try {
    const auth = await getAuth();
    if (!loaded) void load();
    const { data, error } = await auth.signInWithPassword({
      email: email.trim(),
      password,
      options: { captchaToken },
    });
    if (error) return { error: describe(error) };
    set(fromSession(data.session));
    return null;
  } catch {
    return { error: NETWORK_ERROR };
  }
}

/**
 * Part chez Google, qui ramène sur /compte avec la session dans l'adresse,
 * comme le lien de confirmation d'e-mail : rien ne revient ici quand tout va
 * bien, la page change. La première fois, le compte est créé sans pseudo, et
 * l'écran Compte le demande (`needs-username`).
 *
 * Une adresse Gmail déjà inscrite par e-mail, et confirmée, retrouve son
 * compte et son pseudo : Supabase relie les deux façons de se connecter.
 */
export async function signInWithGoogle(): Promise<Failure | null> {
  redirectError = null;
  if (globalThis.navigator?.onLine === false) return { error: NETWORK_ERROR };
  try {
    const auth = await getAuth();
    const { error } = await auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${globalThis.location.origin}/compte`,
        // Laisse choisir le compte Google, au lieu de reprendre en silence
        // celui dont on vient de se déconnecter.
        queryParams: { prompt: 'select_account' },
      },
    });
    return error ? { error: describe(error) } : null;
  } catch {
    return { error: NETWORK_ERROR };
  }
}

/**
 * Donne son pseudo à un compte venu de Google. La base crée le profil
 * (`claim_username`, supabase/migrations), puis le pseudo rejoint les
 * métadonnées du compte, comme à l'inscription par e-mail : la session le
 * porte.
 *
 * Un compte qui a déjà le sien (choisi sur un autre appareil, ou avant une
 * coupure) le garde : la base rend celui-là, sans erreur.
 */
export async function chooseUsername(rawUsername: string): Promise<Failure | null> {
  const username = cleanName(rawUsername);
  const invalid = checkUsername(username);
  if (invalid) return invalid;
  try {
    const db = await getDb();
    const { data: kept, error } = await db.rpc('claim_username', { p_username: username });
    if (error) {
      // Les codes de Postgres : pseudo pris, ou refusé par une contrainte.
      if (error.code === '23505') return { error: USERNAME_TAKEN };
      if (error.code === '23514') return { error: USERNAME_CHARSET };
      return { error: NETWORK_ERROR };
    }
    const auth = await getAuth();
    const { data, error: updateError } = await auth.updateUser({
      data: { username: String(kept) },
    });
    if (updateError) return { error: describe(updateError) };
    set(fromUser(data.user));
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

/**
 * Efface le compte, son pseudo et ses temps (fonction `delete_account` de la
 * base), puis déconnecte l'appareil.
 */
export async function deleteAccount(): Promise<Failure | null> {
  try {
    const db = await getDb();
    const { error } = await db.rpc('delete_account');
    if (error) return { error: NETWORK_ERROR };
  } catch {
    return { error: NETWORK_ERROR };
  }
  await signOut();
  return null;
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
    case 'captcha_failed':
      return 'La vérification anti-robot a échoué. Réessaie.';
    case 'signup_disabled':
      return 'Les inscriptions sont fermées pour le moment.';
    default:
      return error.status === 0 || !error.status ? NETWORK_ERROR : error.message;
  }
}
