'use client';

import Link from 'next/link';
import { useId, useState, type ChangeEvent } from 'react';

import { Avatar } from '@/components/avatar';
import { useMyAvatar } from '@/components/use-my-avatar';
import { ACCEPTED_TYPES, changeAvatar, removeAvatar } from '@/lib/avatar';

import styles from './profile-card.module.css';

type Props = { id: string; username: string };

/**
 * L'en-tête du profil d'un joueur connecté : sa photo, son pseudo, et de quoi
 * changer l'une ou aller au compte.
 *
 * Le sélecteur de fichier est un vrai champ, caché à l'œil, que la photo et le
 * bouton ouvrent par leur `<label>` : ça marche partout, clavier compris, sans
 * clic simulé.
 */
export function ProfileCard({ id, username }: Props) {
  const avatar = useMyAvatar();
  const inputId = useId();
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: 'upload' | 'remove', task: () => Promise<{ error: string } | null>) => {
    setBusy(action);
    setError(null);
    const failure = await task();
    setError(failure?.error ?? null);
    setBusy(null);
  };

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Le même fichier, choisi une seconde fois après un échec, doit repartir.
    event.target.value = '';
    if (file) void run('upload', () => changeAvatar(id, file));
  };

  return (
    <section className={styles.card} aria-label="Mon profil">
      <label htmlFor={inputId} className={styles.photo} data-busy={busy !== null || undefined}>
        <Avatar avatar={avatar} name={username} size={88} />
      </label>

      <div className={styles.body}>
        <p className={styles.name}>{username}</p>
        <div className={styles.actions}>
          <input
            id={inputId}
            className={styles.file}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            aria-label={avatar ? 'Changer ma photo de profil' : 'Ajouter une photo de profil'}
            disabled={busy !== null}
            onChange={choose}
          />
          <label htmlFor={inputId} className={styles.primary} aria-hidden="true">
            {busy === 'upload' ? 'Envoi…' : avatar ? 'Changer la photo' : 'Ajouter une photo'}
          </label>
          {avatar ? (
            <button
              type="button"
              className={styles.ghost}
              disabled={busy !== null}
              onClick={() => void run('remove', () => removeAvatar(id))}>
              {busy === 'remove' ? 'Un instant…' : 'Retirer'}
            </button>
          ) : null}
          <Link href="/compte" className={styles.ghost}>
            Mon compte
          </Link>
        </div>
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : (
        <p className={styles.note}>
          PNG, JPEG ou WebP, 250 Ko au plus, recadrée au carré. Elle s’affiche au classement et dans
          les parties à plusieurs.
        </p>
      )}
    </section>
  );
}
