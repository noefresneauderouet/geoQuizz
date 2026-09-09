'use client';

import { useState } from 'react';

import { flagEmoji, flagUrl } from '@/lib/countries';

import styles from './flag-view.module.css';

type Props = { code: string };

/**
 * Drapeau du pays.
 *
 * L'image est la seule ressource distante de l'application. Le service worker
 * en garde une copie dès la première vue, donc un pays déjà croisé reste
 * jouable hors ligne ; sinon on retombe sur l'emoji drapeau, toujours
 * lisible. `key` sur le code remet l'état à zéro d'une question à l'autre :
 * sans lui, un échec de chargement condamnerait tous les drapeaux suivants.
 */
export function FlagView({ code }: Props) {
  const [failed, setFailed] = useState(false);

  return (
    <div className={styles.frame}>
      {failed ? (
        <span className={styles.emoji} role="img" aria-label="Drapeau à identifier">
          {flagEmoji(code)}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={code}
          className={styles.image}
          src={flagUrl(code, 640)}
          alt="Drapeau à identifier"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
