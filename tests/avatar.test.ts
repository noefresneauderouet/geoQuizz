/**
 * Les photos de profil (src/lib/avatar.ts) : le fichier accepté, le
 * recadrage, les adresses, l'envoi et l'effacement. Storage, Auth et la base
 * sont des faux (tests/fakes/).
 *
 * La réduction elle-même demande un canvas, que Node n'a pas : les tests
 * envoient des images déjà réduites (`saveAvatar`).
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type * as AvatarModule from '@/lib/avatar';

import { auth, sessionOf } from './fakes/auth';
import { database, type Answer } from './fakes/postgrest';
import { installStorageApi, storageApi } from './fakes/storage-api';
import { freshImport, installStorage, type MemoryStorage } from './helpers';

const SESSION_KEY = 'sb-demo-auth-token';
const ME = '0f8fad5b-d9cb-469f-a165-70867728950e';
const NETWORK_ERROR = 'Connexion au serveur impossible. Vérifie ton réseau et réessaie.';
const SERVER_ERROR = 'La photo n’a pas pu être enregistrée. Réessaie dans un instant.';

let local: MemoryStorage;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://demo.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'cle-publique';
  local = installStorage().local;
  installStorageApi();
  storageApi.reset();
  auth.reset();
  database.reset();
  // Connecté : Storage ne répond qu'au jeton d'un compte.
  local.setItem(SESSION_KEY, '{}');
  auth.session = sessionOf(ME, 'Noé');
});

/** Le module, comme à l'ouverture de la page. */
const openAvatar = () => freshImport<typeof AvatarModule>('@/lib/avatar');

/** Ce que répond la base : la photo du profil, et `set_avatar`. */
function profile(version: string | null, setAvatar: Answer | Error = { data: null, error: null }) {
  database.respond = (name) => {
    if (name === 'from:profiles') return { data: { avatar: version }, error: null };
    if (name === 'set_avatar') {
      if (setAvatar instanceof Error) throw setAvatar;
      return setAvatar;
    }
    return { data: null, error: null };
  };
}

/** Deux images déjà réduites, comme les rend le navigateur. */
const images = () => ({
  256: new Blob([new Uint8Array(12_000)], { type: 'image/webp' }),
  96: new Blob([new Uint8Array(3_000)], { type: 'image/webp' }),
});

/** Range une photo dans le faux seau. */
function stored(version: string) {
  for (const size of [256, 96]) {
    storageApi.files.set(`${ME}/${version}-${size}`, { type: 'image/webp', size: 1, cacheControl: null });
  }
}

const bytes = (...values: number[]) => new Uint8Array(values);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50);
const GIF = bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0);

describe('le fichier choisi', () => {
  it('est reconnu à ses premiers octets : PNG, JPEG, WebP', async () => {
    const { sniffImage } = await openAvatar();
    assert.equal(sniffImage(PNG), 'image/png');
    assert.equal(sniffImage(JPEG), 'image/jpeg');
    assert.equal(sniffImage(WEBP), 'image/webp');
  });

  it('refuse les autres formats, même déguisés', async () => {
    const { sniffImage, checkFile } = await openAvatar();
    assert.equal(sniffImage(GIF), null);
    assert.equal(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">')), null);
    // Un RIFF qui n'est pas du WebP : un son WAV.
    assert.equal(sniffImage(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45)), null);
    assert.equal(sniffImage(new Uint8Array(0)), null);
    const gif = new Blob([GIF], { type: 'image/png' });
    assert.deepEqual(await checkFile(gif), { error: 'Choisis une image PNG, JPEG ou WebP.' });
  });

  it('fait 250 Ko au plus', async () => {
    const { checkFile, MAX_FILE_BYTES } = await openAvatar();
    const padded = (size: number) => new Blob([PNG, new Uint8Array(size - PNG.length)]);
    assert.equal(await checkFile(padded(MAX_FILE_BYTES)), null);
    assert.deepEqual(await checkFile(padded(MAX_FILE_BYTES + 1)), {
      error: 'Cette image fait 251 Ko : 250 Ko au plus.',
    });
  });

  it('est recadré au carré, au centre', async () => {
    const { squareCrop } = await openAvatar();
    assert.deepEqual(squareCrop(1200, 800), { x: 200, y: 0, size: 800 });
    assert.deepEqual(squareCrop(600, 1001), { x: 0, y: 200, size: 600 });
    assert.deepEqual(squareCrop(300, 300), { x: 0, y: 0, size: 300 });
  });
});

describe('les adresses', () => {
  it('mènent au seau public du projet, une par taille', async () => {
    const { avatarUrl } = await openAvatar();
    const ref = `${ME}/mg2x1k7a`;
    assert.equal(
      avatarUrl(ref, 96),
      `https://demo.supabase.co/storage/v1/object/public/avatars/${ME}/mg2x1k7a-96`,
    );
    assert.equal(
      avatarUrl(ref, 256),
      `https://demo.supabase.co/storage/v1/object/public/avatars/${ME}/mg2x1k7a-256`,
    );
  });

  it('ne se fabriquent pas avec n’importe quoi', async () => {
    const { avatarUrl, isAvatarRef } = await openAvatar();
    for (const bad of [
      null,
      undefined,
      '',
      ME,
      `${ME}/`,
      `${ME}/../secret`,
      `${ME}/MAJUSCULES`,
      `${ME}/beaucoup-trop-long-pour-une-version`,
      'https://ailleurs.example/photo.png',
      `../${ME}/abc`,
    ]) {
      assert.equal(isAvatarRef(bad), false, String(bad));
      assert.equal(avatarUrl(bad, 96), null, String(bad));
    }
  });

  it('manquent sans projet Supabase', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL; // remis par beforeEach
    const { avatarUrl } = await openAvatar();
    assert.equal(avatarUrl(`${ME}/abc`, 96), null);
  });
});

describe('ma photo', () => {
  it('se lit dans le profil, et se garde sur l’appareil', async () => {
    profile('mg2x1k7a');
    const { refreshMyAvatar, myAvatarOf } = await openAvatar();
    assert.equal(myAvatarOf(ME), undefined);
    assert.equal(await refreshMyAvatar(ME), `${ME}/mg2x1k7a`);
    assert.deepEqual(database.callsTo('from:profiles')[0].args, { select: 'avatar', id: ME });

    // Rouverte, la page la connaît sans rien demander.
    const reopened = await openAvatar();
    assert.equal(reopened.myAvatarOf(ME), `${ME}/mg2x1k7a`);
    assert.equal(reopened.myAvatarOf('un-autre-compte'), undefined);
    assert.equal(await reopened.refreshMyAvatar(ME), `${ME}/mg2x1k7a`);
    assert.equal(database.callsTo('from:profiles').length, 1);
  });

  it('vaut `null` sans photo', async () => {
    profile(null);
    const { refreshMyAvatar, myAvatarOf } = await openAvatar();
    assert.equal(await refreshMyAvatar(ME), null);
    assert.equal(myAvatarOf(ME), null);
  });
});

describe('envoyer une photo', () => {
  it('range les deux tailles sous une nouvelle version, puis l’affiche', async () => {
    profile(null);
    const { saveAvatar, myAvatarOf } = await openAvatar();
    assert.equal(await saveAvatar(ME, images()), null);

    const [{ args }] = database.callsTo('set_avatar');
    const version = (args as { p_version: string }).p_version;
    assert.match(version, /^[0-9a-z]{1,16}$/);
    assert.deepEqual(storageApi.paths(), [`${ME}/${version}-256`, `${ME}/${version}-96`]);
    const large = storageApi.files.get(`${ME}/${version}-256`);
    assert.deepEqual(large, { type: 'image/webp', size: 12_000, cacheControl: 'max-age=31536000' });
    assert.equal(myAvatarOf(ME), `${ME}/${version}`);
    // Au nom du joueur, pas avec la clé publique.
    assert.ok(storageApi.calls.every((call) => call.authorization === `Bearer jeton-${ME}`));
  });

  it('efface l’ancienne une fois la nouvelle affichée', async () => {
    stored('ancienne');
    profile('ancienne');
    const { saveAvatar } = await openAvatar();
    assert.equal(await saveAvatar(ME, images()), null);

    const [{ args }] = database.callsTo('set_avatar');
    const version = (args as { p_version: string }).p_version;
    assert.deepEqual(storageApi.paths(), [`${ME}/${version}-256`, `${ME}/${version}-96`]);
    // L'ancienne est restée en place jusqu'à ce que la nouvelle la remplace.
    const actions = storageApi.calls.map((call) => call.action);
    assert.deepEqual(actions, ['list', 'upload', 'upload', 'list', 'remove']);
  });

  it('fait d’abord la place, en gardant la photo affichée', async () => {
    stored('affichee');
    stored('interrompue');
    profile('affichee');
    const { saveAvatar } = await openAvatar();
    assert.equal(await saveAvatar(ME, images()), null);
    // Avant tout envoi, seules les images de l'envoi interrompu partent.
    assert.equal(storageApi.calls[1].action, 'remove');
    assert.equal(storageApi.calls[2].action, 'upload');
    const version = (database.callsTo('set_avatar')[0].args as { p_version: string }).p_version;
    assert.deepEqual(storageApi.paths(), [`${ME}/${version}-256`, `${ME}/${version}-96`]);
  });

  it('refusée par la base, ne change pas la photo affichée', async () => {
    stored('ancienne');
    profile('ancienne', { data: null, error: { message: 'Pas de profil, ou joueur exclu' } });
    const { saveAvatar, myAvatarOf } = await openAvatar();
    assert.deepEqual(await saveAvatar(ME, images()), { error: SERVER_ERROR });
    assert.equal(myAvatarOf(ME), `${ME}/ancienne`);
    assert.ok(storageApi.files.has(`${ME}/ancienne-256`));
  });

  it('refusée par Storage, ne touche pas au profil', async () => {
    profile(null);
    storageApi.fail = (action) => (action === 'upload' ? 413 : null);
    const { saveAvatar } = await openAvatar();
    assert.deepEqual(await saveAvatar(ME, images()), { error: SERVER_ERROR });
    assert.equal(database.callsTo('set_avatar').length, 0);
  });

  it('hors ligne, le dit', async () => {
    profile(null);
    storageApi.fail = () => 'network';
    const { saveAvatar } = await openAvatar();
    assert.deepEqual(await saveAvatar(ME, images()), { error: NETWORK_ERROR });
  });

  it('demande un compte', async () => {
    local.removeItem(SESSION_KEY);
    auth.session = null;
    profile(null);
    const { saveAvatar } = await openAvatar();
    assert.deepEqual(await saveAvatar(ME, images()), { error: NETWORK_ERROR });
    assert.deepEqual(storageApi.calls, []);
  });
});

describe('retirer sa photo', () => {
  it('la retire du profil, puis efface ses images', async () => {
    stored('ancienne');
    profile('ancienne');
    const { removeAvatar, myAvatarOf } = await openAvatar();
    assert.equal(await removeAvatar(ME), null);
    assert.deepEqual(database.callsTo('set_avatar')[0].args, { p_version: null });
    assert.deepEqual(storageApi.paths(), []);
    assert.equal(myAvatarOf(ME), null);
  });

  it('refusé par la base, garde tout', async () => {
    stored('ancienne');
    profile('ancienne', { data: null, error: { message: 'refusé' } });
    const { removeAvatar } = await openAvatar();
    assert.deepEqual(await removeAvatar(ME), { error: SERVER_ERROR });
    assert.equal(storageApi.paths().length, 2);
  });
});

describe('avant d’effacer le compte', () => {
  it('ses images sont effacées', async () => {
    stored('ancienne');
    stored('interrompue');
    const { deleteAvatarFiles } = await openAvatar();
    assert.equal(await deleteAvatarFiles(ME), true);
    assert.deepEqual(storageApi.paths(), []);
  });

  it('hors ligne ou Storage en panne, elles risquent de rester : on le dit', async () => {
    stored('ancienne');
    const { deleteAvatarFiles } = await openAvatar();
    storageApi.fail = () => 'network';
    assert.equal(await deleteAvatarFiles(ME), false);
    storageApi.fail = () => 503;
    assert.equal(await deleteAvatarFiles(ME), false);
    assert.equal(storageApi.paths().length, 2);
  });

  it('un refus de Storage (pas encore de seau) veut dire qu’il n’y a rien', async () => {
    storageApi.fail = () => 400;
    const { deleteAvatarFiles } = await openAvatar();
    assert.equal(await deleteAvatarFiles(ME), true);
  });
});
