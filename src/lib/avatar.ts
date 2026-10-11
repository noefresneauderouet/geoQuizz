/**
 * Les photos de profil.
 *
 * Une photo demande un compte. Le fichier choisi ne quitte jamais l'appareil :
 * le navigateur le recadre au carré et en tire deux images, qui partent seules
 * dans Supabase Storage (seau `avatars`, servi par le réseau de Cloudflare).
 * Les informations cachées du fichier — lieu de la prise de vue, appareil —
 * restent donc sur l'appareil.
 *
 * Deux tailles, pas plus : 256 px pour l'écran Profil, où la photo fait
 * 96 px de côté, et 96 px pour les listes (classement, salle d'attente, fin
 * de partie), où elle en fait une trentaine, ce qui couvre les écrans trois
 * fois plus denses. Une taille unique ferait télécharger cinquante photos de
 * 256 px pour un classement ; une troisième ne changerait rien à l'œil.
 *
 * Chaque nouvelle photo a sa version, donc ses adresses
 * (`<compte>/<version>-256`) : rien de périmé ne reste en cache, et une image
 * peut s'y garder un an. `profiles.avatar` porte la version affichée ; le
 * classement et les salles se passent la « référence » `<compte>/<version>`,
 * d'où `avatarUrl` tire l'adresse.
 *
 * Rien ici ne dépend de React ; le hook est dans
 * src/components/use-my-avatar.ts.
 */
import { Palette } from '@/constants/theme';
import type { Failure } from '@/lib/account';
import { getItem, setItem } from '@/lib/storage';
import { getDb, isSupabaseConfigured, storageRequest, supabaseUrl } from '@/lib/supabase';

/** Le fichier choisi : 250 Ko au plus. */
export const MAX_FILE_BYTES = 250 * 1024;

/** Les formats habituels d'une photo de profil. */
export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type ImageType = (typeof ACCEPTED_TYPES)[number];

/** Les deux images tirées de la photo, en pixels de côté. */
export const AVATAR_SIZES = [256, 96] as const;
export type AvatarSize = (typeof AVATAR_SIZES)[number];
export type AvatarImages = Record<AvatarSize, Blob>;

const BUCKET = 'avatars';
/** Ce que le seau accepte par image (supabase/migrations) : il en faut dix fois moins. */
const MAX_IMAGE_BYTES = 100 * 1024;
/** Une image ne change jamais d'adresse : un an de cache. */
const CACHE_SECONDS = 365 * 24 * 3600;

const NETWORK_ERROR = 'Connexion au serveur impossible. Vérifie ton réseau et réessaie.';
const SERVER_ERROR = 'La photo n’a pas pu être enregistrée. Réessaie dans un instant.';

/* -------------------------------- Le fichier ------------------------------ */

/**
 * Le format d'une image, lu dans ses premiers octets plutôt que dans son nom
 * ou le type qu'annonce le navigateur, qui manque parfois. `null` : ce n'est
 * pas une image qu'on accepte (GIF, SVG, HEIC…).
 */
export function sniffImage(head: Uint8Array): ImageType | null {
  const startsWith = (bytes: number[], offset = 0) =>
    bytes.every((byte, i) => head[offset + i] === byte);
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg';
  // « RIFF », la taille du fichier sur quatre octets, puis « WEBP ».
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return null;
}

/** Ce qui ne va pas dans le fichier choisi, avant de l'ouvrir ; rien s'il convient. */
export async function checkFile(file: Blob): Promise<Failure | null> {
  if (file.size > MAX_FILE_BYTES) {
    return { error: `Cette image fait ${Math.ceil(file.size / 1024)} Ko : 250 Ko au plus.` };
  }
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return sniffImage(head) ? null : { error: 'Choisis une image PNG, JPEG ou WebP.' };
}

export type Crop = { x: number; y: number; size: number };

/** Le plus grand carré au centre de l'image : la photo se recadre sans se déformer. */
export function squareCrop(width: number, height: number): Crop {
  const size = Math.min(width, height);
  return { x: Math.floor((width - size) / 2), y: Math.floor((height - size) / 2), size };
}

/* -------------------------------- Adresses -------------------------------- */

const REFERENCE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-z]{1,16}$/;

/**
 * Une référence de photo bien formée : l'identifiant du compte, puis la
 * version. Celles qui arrivent d'une salle viennent de n'importe qui : rien
 * d'autre ne doit pouvoir devenir une adresse.
 */
export function isAvatarRef(value: unknown): value is string {
  return typeof value === 'string' && REFERENCE.test(value);
}

/** L'adresse publique d'une image de la photo, ou `null` sans photo. */
export function avatarUrl(ref: string | null | undefined, size: AvatarSize): string | null {
  if (!isAvatarRef(ref) || !isSupabaseConfigured()) return null;
  return `${supabaseUrl()}/storage/v1/object/public/${BUCKET}/${ref}-${size}`;
}

/* ------------------------------- Ma photo --------------------------------- */

/**
 * La photo du compte connecté, lue dans `profiles` et gardée sur l'appareil :
 * l'écran Profil l'affiche aussitôt, et une salle la publie sans attendre.
 */
type Mine = { viewer: string; avatar: string | null; at: number };

const MINE_KEY = 'geolearn.avatar.mine.v1';
/** Au-delà, on relit la base ; en deçà, ce qu'on a suffit. */
const FRESH_MS = 30_000;

/** `undefined` tant que le disque n'a pas été lu. */
let mine: Mine | null | undefined;
const listeners = new Set<() => void>();

function readMine(): Mine | null {
  if (mine === undefined) {
    try {
      mine = JSON.parse(getItem(MINE_KEY) ?? 'null') as Mine | null;
    } catch {
      mine = null;
    }
  }
  return mine;
}

function writeMine(next: Mine | null) {
  mine = next;
  setItem(MINE_KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

export function subscribeMyAvatar(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * La référence de la photo du compte `viewer` ; `null` s'il n'en a pas,
 * `undefined` tant qu'elle n'a jamais été lue. Synchrone.
 */
export function myAvatarOf(viewer: string): string | null | undefined {
  const current = readMine();
  return current?.viewer === viewer ? current.avatar : undefined;
}

/**
 * Relit la photo du compte `viewer`, sauf si c'est fait depuis moins de 30 s
 * (`force` : quoi qu'il arrive), et la rend. Lève une erreur si le réseau ou
 * Supabase manquent : la précédente reste alors en place.
 */
export async function refreshMyAvatar(viewer: string, force = false): Promise<string | null> {
  const current = readMine();
  if (!force && current?.viewer === viewer && Date.now() - current.at < FRESH_MS) {
    return current.avatar;
  }
  const db = await getDb();
  const { data, error } = await db
    .from('profiles')
    .select('avatar')
    .eq('id', viewer)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const version = (data as { avatar: string | null } | null)?.avatar ?? null;
  const avatar = version === null ? null : `${viewer}/${version}`;
  writeMine({ viewer, avatar, at: Date.now() });
  return avatar;
}

/* --------------------------------- Envoi ---------------------------------- */

/** Une réponse d'erreur de Storage : `status` dit si c'est un refus ou une panne. */
class StorageError extends Error {
  constructor(readonly status: number) {
    super(`Storage : ${status}`);
  }
}

const JSON_HEADERS = { 'content-type': 'application/json' };

/**
 * Efface les images du compte `viewer`, sauf celles de la photo `keep`. Lève
 * une erreur si la liste ou l'effacement échoue.
 */
async function removeFiles(viewer: string, keep: string | null): Promise<void> {
  const listed = await storageRequest(`object/list/${BUCKET}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ prefix: viewer, limit: 100, offset: 0 }),
  });
  if (!listed.ok) throw new StorageError(listed.status);
  const paths = ((await listed.json()) as { name: string }[])
    .map((file) => `${viewer}/${file.name}`)
    .filter((path) => keep === null || !path.startsWith(`${keep}-`));
  if (paths.length === 0) return;
  const removed = await storageRequest(`object/${BUCKET}`, {
    method: 'DELETE',
    headers: JSON_HEADERS,
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!removed.ok) throw new StorageError(removed.status);
}

/**
 * Enregistre une photo déjà réduite (`resize`) et l'affiche partout. Les
 * images de l'ancienne sont effacées une fois la nouvelle en place.
 */
export async function saveAvatar(viewer: string, images: AvatarImages): Promise<Failure | null> {
  try {
    // La photo affichée, lue dans la base : ce sont ses images qu'il faut
    // garder. Les autres viennent d'un envoi interrompu, et le seau n'en
    // accepte que quatre par compte : on fait la place d'abord.
    const current = await refreshMyAvatar(viewer, true);
    await removeFiles(viewer, current);

    const version = Date.now().toString(36);
    for (const size of AVATAR_SIZES) {
      const response = await storageRequest(`object/${BUCKET}/${viewer}/${version}-${size}`, {
        method: 'POST',
        headers: {
          'content-type': images[size].type,
          'cache-control': `max-age=${CACHE_SECONDS}`,
          'x-upsert': 'false',
        },
        body: images[size],
      });
      if (!response.ok) return { error: SERVER_ERROR };
    }

    const db = await getDb();
    const { error } = await db.rpc('set_avatar', { p_version: version });
    if (error) return { error: SERVER_ERROR };
    const avatar = `${viewer}/${version}`;
    writeMine({ viewer, avatar, at: Date.now() });

    // L'ancienne n'est plus affichée nulle part. Si l'effacement échoue, le
    // prochain envoi s'en charge.
    await removeFiles(viewer, avatar).catch(() => undefined);
    return null;
  } catch {
    return { error: NETWORK_ERROR };
  }
}

/** Retire la photo : le profil n'en affiche plus, ses images sont effacées. */
export async function removeAvatar(viewer: string): Promise<Failure | null> {
  try {
    const db = await getDb();
    const { error } = await db.rpc('set_avatar', { p_version: null });
    if (error) return { error: SERVER_ERROR };
    writeMine({ viewer, avatar: null, at: Date.now() });
    await removeFiles(viewer, null).catch(() => undefined);
    return null;
  } catch {
    return { error: NETWORK_ERROR };
  }
}

/**
 * Efface toutes les images du compte, juste avant le compte lui-même : la base
 * ne peut pas le faire, Storage les range hors d'elle. Rend `false` si elles
 * sont peut-être encore là (réseau coupé, Storage en panne) ; un refus — pas
 * de seau, rien à soi — veut dire qu'il n'y a rien à effacer.
 */
export async function deleteAvatarFiles(viewer: string): Promise<boolean> {
  try {
    await removeFiles(viewer, null);
  } catch (error) {
    if (!(error instanceof StorageError) || error.status >= 500) return false;
  }
  if (readMine()?.viewer === viewer) writeMine(null);
  return true;
}

/* ---------------------------- Dans le navigateur -------------------------- */

/**
 * Vérifie le fichier choisi, en tire les deux images et les enregistre. Ne
 * tourne que dans un navigateur : il faut un canvas.
 */
export async function changeAvatar(viewer: string, file: Blob): Promise<Failure | null> {
  const invalid = await checkFile(file);
  if (invalid) return invalid;
  let images: AvatarImages;
  try {
    images = await resize(file);
  } catch {
    return { error: 'Cette image est illisible. Essaie avec une autre.' };
  }
  return saveAvatar(viewer, images);
}

/** Recadre la photo au carré et en tire les deux tailles. */
async function resize(file: Blob): Promise<AvatarImages> {
  // Sans option : les navigateurs suivent d'eux-mêmes l'orientation notée
  // dans une photo de téléphone, et un ancien refuserait `from-image`.
  const bitmap = await createImageBitmap(file);
  try {
    const large = shrink(bitmap, squareCrop(bitmap.width, bitmap.height), 256);
    const small = shrink(large, { x: 0, y: 0, size: 256 }, 96);
    return { 256: await encode(large), 96: await encode(small) };
  } finally {
    bitmap.close();
  }
}

function canvasOf(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas indisponible');
  context.imageSmoothingQuality = 'high';
  return [canvas, context];
}

/**
 * Le carré `crop` de `source`, réduit à `size` pixels de côté. Une grande
 * photo est réduite de moitié en moitié : d'un seul coup, elle perdrait sa
 * netteté.
 */
function shrink(source: CanvasImageSource, crop: Crop, size: number): HTMLCanvasElement {
  let from = source;
  let area = crop;
  while (area.size >= size * 2) {
    const half = Math.ceil(area.size / 2);
    const [step, context] = canvasOf(half);
    context.drawImage(from, area.x, area.y, area.size, area.size, 0, 0, half, half);
    from = step;
    area = { x: 0, y: 0, size: half };
  }
  const [canvas, context] = canvasOf(size);
  context.drawImage(from, area.x, area.y, area.size, area.size, 0, 0, size, size);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * En WebP, ou en JPEG là où le navigateur ne sait pas l'écrire (Safari rend
 * alors du PNG). Le JPEG n'a pas de transparence : le fond est celui des
 * cartes. La qualité baisse si l'image dépasse ce qu'accepte le seau.
 */
async function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  for (const quality of [0.85, 0.7, 0.5]) {
    let blob = await toBlob(canvas, 'image/webp', quality);
    if (blob?.type !== 'image/webp') blob = await toBlob(opaque(canvas), 'image/jpeg', quality);
    if (blob && blob.size <= MAX_IMAGE_BYTES) return blob;
  }
  throw new Error('Image trop lourde');
}

function opaque(source: HTMLCanvasElement): HTMLCanvasElement {
  const [canvas, context] = canvasOf(source.width);
  context.fillStyle = Palette.card;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0);
  return canvas;
}
