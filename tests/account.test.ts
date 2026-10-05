/**
 * Le compte du joueur (src/lib/account.ts) : inscription, connexion,
 * déconnexion, suppression. Supabase Auth et la base sont des faux
 * (tests/fakes/) : aucun compte réel n'est créé.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type * as AccountModule from '@/lib/account';

import { auth, sessionOf } from './fakes/auth';
import { database } from './fakes/postgrest';
import { freshImport, installStorage, type MemoryStorage } from './helpers';

const PROJECT = 'https://demo.supabase.co';
const SESSION_KEY = 'sb-demo-auth-token';
const NETWORK_ERROR = 'Connexion au serveur impossible. Vérifie ton réseau et réessaie.';

let local: MemoryStorage;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = PROJECT;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'cle-publique';
  local = installStorage().local;
  auth.reset();
  database.reset();
  Object.defineProperty(globalThis, 'location', {
    value: { origin: 'https://geoquizz.games', href: 'https://geoquizz.games/compte' },
    configurable: true,
    writable: true,
  });
});

/** Le module, comme à l'ouverture de la page. */
const openAccount = () => freshImport<typeof AccountModule>('@/lib/account');

/** Une session enregistrée sur l'appareil, pour ce joueur. */
function storeSession(id = 'u1', username = 'Noé') {
  local.setItem(SESSION_KEY, '{}');
  auth.session = sessionOf(id, username);
}

/** Supabase renvoie un pseudo libre. */
const usernameFree = () => {
  database.respond = (name) => ({ data: name === 'username_available' ? true : null, error: null });
};

describe('l’état du compte', () => {
  it('est « invité » sans session, sans rien télécharger', async () => {
    const clients = auth.clients.length;
    const { readAccount } = await openAccount();
    assert.deepEqual(await readAccount(), { status: 'guest' });
    assert.equal(auth.clients.length, clients, 'le client Auth ne doit pas être chargé');
  });

  it('est « indisponible » sans projet Supabase', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL; // remis par beforeEach
    const { readAccount } = await openAccount();
    assert.deepEqual(await readAccount(), { status: 'unavailable' });
  });

  it('retrouve le joueur d’une session enregistrée', async () => {
    storeSession('u1', 'Noé');
    const { readAccount } = await openAccount();
    assert.deepEqual(await readAccount(), {
      status: 'signed-in',
      id: 'u1',
      email: 'u1@exemple.fr',
      username: 'Noé',
    });
  });

  it('prévient de la connexion qui était déjà là', async () => {
    storeSession('u1', 'Noé');
    const { onSignedIn, readAccount } = await openAccount();
    await readAccount();
    const seen: string[] = [];
    onSignedIn((account) => seen.push(account.username));
    assert.deepEqual(seen, ['Noé']);
  });
});

describe('l’inscription', () => {
  it('refuse un pseudo trop court', async () => {
    const { signUp } = await openAccount();
    assert.deepEqual(await signUp('a@b.fr', 'motdepasse', 'ab'), {
      error: 'Le pseudo doit faire au moins 3 caractères.',
    });
    assert.deepEqual(await signUp('a@b.fr', 'motdepasse', '   a    '), {
      error: 'Le pseudo doit faire au moins 3 caractères.',
    });
  });

  it('refuse les caractères interdits dans le pseudo', async () => {
    const { signUp } = await openAccount();
    for (const name of ['No@é', 'abc.def', 'abc‮def', 'abc​def', '😀😀😀']) {
      assert.deepEqual(
        await signUp('a@b.fr', 'motdepasse', name),
        { error: 'Le pseudo ne peut contenir que des lettres, des chiffres, _ et -.' },
        name,
      );
    }
  });

  it('refuse un mot de passe de moins de 8 caractères', async () => {
    const { signUp } = await openAccount();
    assert.deepEqual(await signUp('a@b.fr', '1234567', 'Noé'), {
      error: 'Le mot de passe doit faire au moins 8 caractères.',
    });
  });

  it('ne contacte pas Supabase tant que le formulaire est faux', async () => {
    const { signUp } = await openAccount();
    await signUp('a@b.fr', 'court', 'Noé');
    await signUp('a@b.fr', 'motdepasse', 'x');
    assert.deepEqual(database.calls, []);
    assert.deepEqual(auth.calls, []);
  });

  it('envoie un lien de confirmation, pseudo nettoyé et adresse sans espaces', async () => {
    usernameFree();
    const { signUp } = await openAccount();
    assert.deepEqual(await signUp('  noe@exemple.fr ', 'motdepasse', '  Élodie_du-92  '), {
      status: 'confirm-email',
    });
    assert.deepEqual(database.callsTo('username_available')[0].args, { p_username: 'Élodie_du-92' });
    assert.deepEqual(auth.callsTo('signUp'), [
      {
        email: 'noe@exemple.fr',
        password: 'motdepasse',
        options: {
          data: { username: 'Élodie_du-92' },
          emailRedirectTo: 'https://geoquizz.games/compte',
          captchaToken: undefined,
        },
      },
    ]);
  });

  it('refuse un pseudo déjà pris, avant de créer le compte', async () => {
    database.respond = () => ({ data: false, error: null });
    const { signUp } = await openAccount();
    assert.deepEqual(await signUp('a@b.fr', 'motdepasse', 'Noé'), { error: 'Ce pseudo est déjà pris.' });
    assert.deepEqual(auth.callsTo('signUp'), []);
  });

  it('signale une adresse déjà inscrite', async () => {
    usernameFree();
    // Supabase ne le dit pas : il rend un utilisateur sans identité.
    auth.signUpData = { user: { identities: [] }, session: null };
    const { signUp } = await openAccount();
    assert.deepEqual(await signUp('a@b.fr', 'motdepasse', 'Noé'), {
      error: 'Un compte existe déjà avec cette adresse.',
    });
  });

  it('connecte tout de suite quand la confirmation est désactivée', async () => {
    usernameFree();
    auth.signUpData = { user: { identities: [{}] }, session: sessionOf('u2', 'Noé') };
    const { signUp, getAccount } = await openAccount();
    assert.deepEqual(await signUp('a@b.fr', 'motdepasse', 'Noé'), { status: 'signed-in' });
    assert.equal(getAccount().status, 'signed-in');
  });

  it('dit que le réseau manque quand la base ne répond pas', async () => {
    database.respond = () => {
      throw new TypeError('fetch failed');
    };
    const { signUp } = await openAccount();
    assert.deepEqual(await signUp('a@b.fr', 'motdepasse', 'Noé'), { error: NETWORK_ERROR });
  });
});

describe('la connexion', () => {
  it('traduit les erreurs de Supabase en français', async () => {
    const { signIn } = await openAccount();
    const cases: [typeof auth.error, string][] = [
      [{ code: 'invalid_credentials', status: 400, message: 'x' }, 'Adresse ou mot de passe incorrect.'],
      [{ code: 'email_not_confirmed', status: 400, message: 'x' }, 'Confirme d’abord ton adresse : le lien est dans tes e-mails.'],
      [{ code: 'over_request_rate_limit', status: 429, message: 'x' }, 'Trop de tentatives. Réessaie dans quelques minutes.'],
      [{ status: 0, message: 'fetch failed' }, NETWORK_ERROR],
      [{ code: 'autre', status: 500, message: 'Erreur du serveur' }, 'Erreur du serveur'],
    ];
    for (const [error, message] of cases) {
      auth.error = error;
      assert.deepEqual(await signIn('a@b.fr', 'motdepasse'), { error: message });
    }
  });

  it('connecte le joueur', async () => {
    auth.session = sessionOf('u1', 'Noé');
    const { signIn, getAccount } = await openAccount();
    assert.equal(await signIn(' a@b.fr ', 'motdepasse'), null);
    assert.deepEqual(auth.callsTo('signInWithPassword')[0], {
      email: 'a@b.fr',
      password: 'motdepasse',
      options: { captchaToken: undefined },
    });
    assert.equal(getAccount().status, 'signed-in');
  });

  it('déconnecte cet appareil seulement', async () => {
    storeSession();
    const { readAccount, signOut, getAccount } = await openAccount();
    await readAccount();
    await signOut();
    assert.deepEqual(auth.callsTo('signOut'), [{ scope: 'local' }]);
    assert.deepEqual(getAccount(), { status: 'guest' });
  });
});

describe('la suppression du compte', () => {
  it('efface le compte dans la base, puis déconnecte', async () => {
    storeSession();
    const { readAccount, deleteAccount, getAccount } = await openAccount();
    await readAccount();
    assert.equal(await deleteAccount(), null);
    assert.equal(database.callsTo('delete_account').length, 1);
    assert.deepEqual(getAccount(), { status: 'guest' });
  });

  it('garde le joueur connecté si la base refuse', async () => {
    storeSession();
    database.respond = () => ({ data: null, error: { message: 'refusé' } });
    const { readAccount, deleteAccount, getAccount } = await openAccount();
    await readAccount();
    assert.deepEqual(await deleteAccount(), { error: NETWORK_ERROR });
    assert.equal(getAccount().status, 'signed-in');
  });
});
