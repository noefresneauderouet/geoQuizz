'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

import { Captcha, CAPTCHA_SITE_KEY } from '@/components/account/captcha';
import { useAccount } from '@/components/use-account';
import {
  chooseUsername,
  deleteAccount,
  getRedirectError,
  MAX_NAME_LENGTH,
  MIN_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  resendConfirmation,
  signIn,
  signInWithGoogle,
  signOut,
  signUp,
} from '@/lib/account';

import styles from './account.module.css';

type Tab = 'sign-in' | 'sign-up';

/**
 * Se connecter (e-mail ou Google), créer un compte, se déconnecter.
 *
 * Le compte ne sert qu'au classement : l'écran le dit d'emblée, pour que
 * personne ne croie devoir s'inscrire pour jouer.
 */
export function AccountScreen() {
  const account = useAccount();

  if (account.status === 'loading') {
    return <p className={styles.muted}>Chargement…</p>;
  }

  if (account.status === 'unavailable') {
    return (
      <div className={styles.card}>
        <h1 className={styles.title}>Comptes indisponibles</h1>
        <p className={styles.muted}>
          Le serveur n’est pas configuré dans cette version. Tu peux jouer normalement : tes records
          restent sur cet appareil.
        </p>
      </div>
    );
  }

  if (account.status === 'signed-in') {
    return (
      <div className={styles.card}>
        <h1 className={styles.title}>{account.username || 'Mon compte'}</h1>
        <p className={styles.muted}>{account.email}</p>
        <p className={styles.help}>
          Chaque manche trouvée en entier envoie ton temps au classement.
        </p>
        <Link href="/classement" className={styles.primary}>
          Voir le classement
        </Link>
        <button type="button" className={styles.ghost} onClick={() => void signOut()}>
          Se déconnecter
        </button>
        <DeleteAccount />
      </div>
    );
  }

  if (account.status === 'needs-username') {
    return <ChooseUsername email={account.email} />;
  }

  return <AuthForms />;
}

/**
 * Le premier passage par Google : le compte existe, il lui manque le pseudo
 * du classement. Le nom que donne Google n'est pas proposé : il n'a pas à
 * s'afficher au classement sans que la personne l'ait choisi.
 */
function ChooseUsername({ email }: { email: string }) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const failure = await chooseUsername(username);
    if (failure) setError(failure.error);
    setBusy(false);
  };

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>Choisis ton pseudo</h1>
      <p className={styles.help}>
        Connexion réussie avec <strong>{email}</strong>. Il ne reste qu’à choisir ton pseudo : c’est
        lui qui s’affiche au classement, pas ton nom.
      </p>
      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        <label className={styles.field}>
          <span className={styles.label}>Pseudo</span>
          <input
            className={styles.input}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            minLength={MIN_NAME_LENGTH}
            maxLength={MAX_NAME_LENGTH}
            autoComplete="nickname"
            required
          />
          <span className={styles.note}>Visible par tous au classement, et définitif.</span>
        </label>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className={styles.primary} disabled={busy}>
          {busy ? 'Un instant…' : 'Valider mon pseudo'}
        </button>
      </form>
      <button type="button" className={styles.ghost} onClick={() => void signOut()}>
        Se déconnecter
      </button>
    </div>
  );
}

/** « Continuer avec Google » : la page part chez Google et revient sur /compte. */
function GoogleButton({ onError }: { onError: (error: string) => void }) {
  const [busy, setBusy] = useState(false);
  // Revenu de Google par « Précédent » : le navigateur peut rendre la page
  // telle qu'il l'a quittée, bouton occupé compris.
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(false);
    };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);
  return (
    <button
      type="button"
      className={styles.google}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signInWithGoogle().then((failure) => {
          // Sans erreur, la page est déjà en route vers Google : le bouton
          // reste occupé jusque-là.
          if (failure) {
            onError(failure.error);
            setBusy(false);
          }
        });
      }}>
      <GoogleLogo />
      {busy ? 'Un instant…' : 'Continuer avec Google'}
    </button>
  );
}

/** Le « G » de Google, dans ses couleurs : ses règles de marque l'exigent. */
function GoogleLogo() {
  return (
    <svg className={styles.googleLogo} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/**
 * Effacer son compte, en deux appuis : le bouton demande confirmation dans
 * son propre libellé, comme l'arrêt d'une manche.
 */
function DeleteAccount() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const press = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError(null);
    void deleteAccount().then((failure) => {
      setBusy(false);
      setConfirming(false);
      if (failure) setError(failure.error);
    });
  };

  return (
    <>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" className={styles.danger} disabled={busy} onClick={press}>
        {busy
          ? 'Un instant…'
          : confirming
            ? 'Appuie encore : pseudo, photo et temps seront effacés'
            : 'Supprimer mon compte'}
      </button>
    </>
  );
}

function AuthForms() {
  const [tab, setTab] = useState<Tab>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  // Un retour de Google (ou d'un lien d'e-mail) qui a échoué s'affiche ici.
  const [error, setError] = useState<string | null>(getRedirectError);
  const [sentTo, setSentTo] = useState<string | null>(null);
  /** La réponse du CAPTCHA, quand il est activé ; elle ne sert qu'une fois. */
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const waitingForCaptcha = CAPTCHA_SITE_KEY !== '' && captchaToken === null;
  const token = captchaToken ?? undefined;
  const nextAttempt = () => {
    setCaptchaToken(null);
    setAttempt((n) => n + 1);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    if (tab === 'sign-in') {
      const failure = await signIn(email, password, token);
      if (failure) setError(failure.error);
    } else {
      const result = await signUp(email, password, username, token);
      if ('error' in result) setError(result.error);
      else if (result.status === 'confirm-email') setSentTo(email.trim());
    }
    nextAttempt();
    setBusy(false);
  };

  if (sentTo) {
    return (
      <div className={styles.card}>
        <h1 className={styles.title}>Vérifie tes e-mails</h1>
        <p className={styles.help}>
          Un lien de confirmation vient de partir à <strong>{sentTo}</strong>. Ouvre-le sur cet
          appareil pour activer ton compte.
        </p>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <Captcha onToken={setCaptchaToken} attempt={attempt} />
        <button
          type="button"
          className={styles.ghost}
          disabled={busy || waitingForCaptcha}
          onClick={() => {
            setBusy(true);
            setError(null);
            void resendConfirmation(sentTo, token).then((failure) => {
              setError(failure ? failure.error : 'Lien renvoyé.');
              nextAttempt();
              setBusy(false);
            });
          }}>
          Renvoyer le lien
        </button>
        <button
          type="button"
          className={styles.ghost}
          onClick={() => {
            setSentTo(null);
            setError(null);
            setTab('sign-in');
          }}>
          J’ai confirmé, me connecter
        </button>
      </div>
    );
  }

  const signingUp = tab === 'sign-up';

  return (
    <div className={styles.card}>
      <div className={styles.tabs} role="tablist" aria-label="Compte">
        {(
          [
            ['sign-in', 'Se connecter'],
            ['sign-up', 'Créer un compte'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => {
              setTab(id);
              setError(null);
            }}>
            {label}
          </button>
        ))}
      </div>

      <p className={styles.help}>
        {signingUp
          ? 'Un compte sert à apparaître au classement. Sans compte, tu joues pareil.'
          : 'Connecte-toi pour envoyer tes temps au classement.'}
      </p>

      <GoogleButton onError={setError} />
      <p className={styles.separator}>ou avec ton adresse e-mail</p>

      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        {signingUp ? (
          <label className={styles.field}>
            <span className={styles.label}>Pseudo</span>
            <input
              className={styles.input}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              minLength={MIN_NAME_LENGTH}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="nickname"
              required
            />
            <span className={styles.note}>Visible par tous au classement.</span>
          </label>
        ) : null}
        <label className={styles.field}>
          <span className={styles.label}>Adresse e-mail</span>
          <input
            className={styles.input}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Mot de passe</span>
          <input
            className={styles.input}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={signingUp ? MIN_PASSWORD_LENGTH : undefined}
            autoComplete={signingUp ? 'new-password' : 'current-password'}
            required
          />
        </label>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <Captcha onToken={setCaptchaToken} attempt={attempt} />

        <button type="submit" className={styles.primary} disabled={busy || waitingForCaptcha}>
          {busy ? 'Un instant…' : signingUp ? 'Créer mon compte' : 'Se connecter'}
        </button>

        {signingUp ? (
          <p className={styles.note}>
            En créant ton compte, tu acceptes les{' '}
            <Link href="/conditions" className={styles.noteLink}>
              conditions d’utilisation
            </Link>
            . La{' '}
            <Link href="/confidentialite" className={styles.noteLink}>
              politique de confidentialité
            </Link>{' '}
            dit ce que deviennent tes données.
          </p>
        ) : null}
      </form>
    </div>
  );
}
