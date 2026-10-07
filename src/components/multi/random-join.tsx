'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { findPublicRoom, isMultiplayerConfigured, roomPath } from '@/lib/room';

import styles from './random-join.module.css';

type Search = 'idle' | 'searching' | 'none' | 'offline' | 'unavailable';

const MESSAGES: Partial<Record<Search, string>> = {
  none: 'Aucune partie publique trouvée. Crée la tienne en publique pour qu’on te rejoigne.',
  offline: 'Recherche impossible. Vérifie ta connexion.',
  unavailable: 'Multijoueur indisponible.',
};

/**
 * Rejoindre une partie publique au hasard, depuis l'accueil.
 *
 * Les salles publiques s'annoncent dans le hall (src/lib/room.ts) ; on y
 * entre comme avec leur lien, réglages compris, pour que l'écran du pseudo
 * dise déjà ce qui se joue.
 *
 * `className` remplace l'allure du bouton, comme pour « Rejoindre une partie ».
 */
export function RandomJoin({ className }: { className?: string }) {
  const router = useRouter();
  const [search, setSearch] = useState<Search>('idle');

  const start = async () => {
    if (!isMultiplayerConfigured()) {
      setSearch('unavailable');
      return;
    }
    setSearch('searching');
    try {
      const room = await findPublicRoom();
      if (!room) {
        setSearch('none');
        return;
      }
      router.push(roomPath(room.code, room.settings));
    } catch {
      setSearch('offline');
    }
  };

  const message = MESSAGES[search];

  return (
    <>
      <button
        type="button"
        className={className ?? styles.trigger}
        onClick={start}
        disabled={search === 'searching'}>
        <span aria-hidden="true">🎲</span>{' '}
        {search === 'searching' ? 'Recherche…' : 'Partie aléatoire'}
      </button>
      {/* Toujours dans la page, même vide : un lecteur d'écran n'annonce que
          ce qui change dans une zone qu'il connaît déjà. */}
      <p className={message ? styles.message : styles.silent} role="status">
        {message}
      </p>
    </>
  );
}
