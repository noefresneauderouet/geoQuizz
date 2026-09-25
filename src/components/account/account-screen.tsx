'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { useAccount } from '@/components/use-account';
import {
  MAX_NAME_LENGTH,
  MIN_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
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
      </div>
    );
  }

  return <AuthForms />;
}

function AuthForms() {
  const [tab, setTab] = useState<Tab>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    if (tab === 'sign-in') {
      const failure = await signIn(email, password);
      if (failure) setError(failure.error);
    } else {
      const result = await signUp(email, password, username);
      if ('error' in result) setError(result.error);
      else if (result.status === 'confirm-email') setSentTo(email.trim());
    }
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
        <button
          type="button"
          className={styles.ghost}
          onClick={() => {
            setSentTo(null);
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

        <button type="submit" className={styles.primary} disabled={busy}>
          {busy ? 'Un instant…' : signingUp ? 'Créer mon compte' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}
