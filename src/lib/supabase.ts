/**
 * Le projet Supabase : salles à plusieurs (Realtime), comptes (Auth),
 * classement (Postgres, via l'API REST) et photos de profil (Storage).
 *
 * Les trois clients sont des paquets séparés, chargés chacun par `import()`
 * au moment où l'on s'en sert : le jeu solo d'un invité n'en télécharge
 * aucun, et le classement n'embarque pas le client Realtime. Storage n'a
 * pas de client : trois requêtes suffisent (`storageRequest`).
 */
import type { GoTrueClient } from '@supabase/auth-js';
import type { PostgrestClient } from '@supabase/postgrest-js';

import { getItem } from '@/lib/storage';

/** Vrai si le projet Supabase est configuré dans cette construction. */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * La racine du projet. Celle de l'API REST, souvent copiée à sa place, y est
 * ramenée.
 */
export function supabaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    .replace(/\/rest\/v1\/?$/, '')
    .replace(/\/$/, '');
}

export function supabaseKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
}

/**
 * Où le client Auth range la session, sous le nom que supabase-js lui
 * donnerait : `sb-<référence du projet>-auth-token`.
 */
function sessionKey(): string {
  const ref = new URL(supabaseUrl() || 'http://localhost').hostname.split('.')[0];
  return `sb-${ref}-auth-token`;
}

/**
 * Une session est enregistrée sur cet appareil. Se lit sans charger le client
 * Auth : un invité ne le télécharge jamais.
 */
export function hasStoredSession(): boolean {
  return isSupabaseConfigured() && getItem(sessionKey()) !== null;
}

let auth: Promise<GoTrueClient> | null = null;

export function getAuth(): Promise<GoTrueClient> {
  auth ??= import('@supabase/auth-js').then(
    ({ GoTrueClient }) =>
      new GoTrueClient({
        url: `${supabaseUrl()}/auth/v1`,
        headers: { apikey: supabaseKey() },
        storageKey: sessionKey(),
        persistSession: true,
        autoRefreshToken: true,
        // Le lien de confirmation reçu par e-mail ramène sur /compte avec la
        // session dans l'adresse.
        detectSessionInUrl: true,
      }),
  );
  return auth;
}

/**
 * Le jeton du joueur connecté, ou rien pour un invité. Un invité ne charge
 * pas le client Auth pour le savoir.
 */
async function accessToken(): Promise<string | undefined> {
  if (!hasStoredSession()) return undefined;
  return (await (await getAuth()).getSession()).data.session?.access_token;
}

let db: Promise<PostgrestClient> | null = null;

/**
 * Le client de l'API REST. Chaque requête part avec le jeton du joueur
 * connecté, ou la clé publique pour un invité : c'est ce qui permet à la base
 * de savoir qui envoie un temps.
 */
export function getDb(): Promise<PostgrestClient> {
  db ??= import('@supabase/postgrest-js').then(
    ({ PostgrestClient }) =>
      new PostgrestClient(`${supabaseUrl()}/rest/v1`, {
        headers: { apikey: supabaseKey() },
        fetch: async (input, init) => {
          const headers = new Headers(init?.headers);
          headers.set('Authorization', `Bearer ${(await accessToken()) ?? supabaseKey()}`);
          return fetch(input, { ...init, headers });
        },
      }),
  );
  return db;
}

/**
 * Une requête à l'API de Storage (`/storage/v1/…`), au nom du joueur
 * connecté : ses règles d'accès ne laissent écrire que dans son dossier.
 * Rejette hors ligne, comme `fetch`, et sans session.
 */
export async function storageRequest(path: string, init: RequestInit): Promise<Response> {
  const token = await accessToken();
  if (!token) throw new Error('Connexion requise');
  const headers = new Headers(init.headers);
  headers.set('apikey', supabaseKey());
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${supabaseUrl()}/storage/v1/${path}`, { ...init, headers });
}
