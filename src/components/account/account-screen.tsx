'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { Captcha, CAPTCHA_SITE_KEY } from '@/components/account/captcha';
import { useAccount } from '@/components/use-account';
import {
  deleteAccount,
  MAX_NAME_LENGTH,
  MIN_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  resendConfirmation,
  signIn,
  signOut,
  signUp,
} from '@/lib/account';

import styles from './account.module.css';

type Tab = 'sign-in' | 'sign-up';

/**
 * Se connecter, créer un compte, se déconnecter.
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

  return <AuthForms />;
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
            ? 'Appuie encore : pseudo et temps seront effacés'
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
  const [error, setError] = useState<string | null>(null);
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
      </form>
    </div>
  );
}
