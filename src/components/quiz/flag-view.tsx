'use client';

import { useState } from 'react';

import { flagEmoji, flagUrl } from '@/lib/countries';

import styles from './flag-view.module.css';

type Props = { code: string };

/**
 * Drapeau du pays.
 *
 * L'image est la seule ressource distante de l'application. Le service worker
 * télécharge tous les drapeaux dès son installation, à cette largeur de 640
 * px (voir scripts/build-sw.mjs) : ils restent affichés hors ligne. Si l'un
 * d'eux manque, on retombe sur l'emoji drapeau, toujours lisible. `key` sur
 * le code remet l'état à zéro d'une question à l'autre : sans lui, un échec
 * de chargement condamnerait tous les drapeaux suivants.
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
