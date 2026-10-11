'use client';

import { useState, type CSSProperties } from 'react';

import { avatarUrl } from '@/lib/avatar';

import styles from './avatar.module.css';

type Props = {
  /** La référence de la photo (src/lib/avatar.ts) ; sans elle, l'initiale du pseudo. */
  avatar: string | null | undefined;
  name: string;
  /** Côté, en pixels CSS. */
  size: number;
};

/** Les couples fond et texte des bandeaux : ils restent lisibles dans les deux thèmes. */
const TINTS = [styles.green, styles.blue, styles.yellow, styles.brown];

/**
 * Une photo de profil ronde, ou l'initiale du pseudo sur une teinte qui en
 * dépend : chaque joueur garde la même d'un écran à l'autre.
 *
 * L'image de 96 px suffit jusqu'à 48 px affichés ; au-delà, celle de 256 px.
 * Une image qui ne se charge pas (hors ligne, photo retirée) laisse place à
 * l'initiale. Décorative dans les deux cas : le pseudo est écrit à côté.
 */
export function Avatar({ avatar, name, size }: Props) {
  const url = avatarUrl(avatar, size > 48 ? 256 : 96);
  /** L'adresse qui a échoué : une autre photo a droit à son essai. */
  const [failed, setFailed] = useState<string | null>(null);
  const style = { '--avatar-size': `${size}px` } as CSSProperties;

  if (url !== null && url !== failed) {
    return (
      // Export statique : pas d'optimisation d'image par Next, et les deux
      // tailles sont déjà faites pour ces usages.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={styles.avatar}
        style={style}
        src={url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(url)}
      />
    );
  }

  const initial = [...name.trim()][0]?.toLocaleUpperCase('fr') ?? '?';
  return (
    <span
      className={`${styles.avatar} ${styles.initial} ${TINTS[hash(name) % TINTS.length]}`}
      style={style}
      aria-hidden="true">
      {initial}
    </span>
  );
}

function hash(text: string): number {
  let h = 0;
  for (const char of text) h = (h * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return h;
}
