'use client';

import { useRef, useState, type MouseEvent } from 'react';
import { encode } from 'uqr';

import styles from './qr-dialog.module.css';

type Props = {
  code: string;
  /** L'allure du bouton, celle des boutons de la salle d'attente. */
  className?: string;
};

type Qr = { size: number; path: string };

/**
 * Le lien de la salle en QR code, affiché en grand.
 *
 * Autour d'une même table, c'est le plus court chemin d'un téléphone à
 * l'autre : on tend l'écran, l'autre vise, il est dans la salle. Le code est
 * calculé à l'ouverture, sur l'URL que le navigateur affiche : c'est le même
 * lien que « Partager le lien ».
 */
export function QrDialog({ code, className }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [qr, setQr] = useState<Qr | null>(null);

  const open = () => {
    // Deux modules de marge : le fond clair tout autour suffit aux lecteurs.
    const { size, data } = encode(window.location.href, { ecc: 'M', border: 2 });
    setQr({ size, path: toPath(data) });
    dialog.current?.showModal();
  };

  /* Comme la boîte « Rejoindre une partie » : un clic à côté du contenu ferme. */
  const clickOutside = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialog.current) dialog.current?.close();
  };

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={open}
        aria-label="Afficher le QR code du lien"
        title="QR code">
        <QrIcon />
      </button>

      <dialog
        ref={dialog}
        className={styles.dialog}
        onClick={clickOutside}
        aria-labelledby="qr-title">
        <div className={styles.body}>
          <h2 id="qr-title" className={styles.title}>
            Scanne pour rejoindre
          </h2>
          {qr ? (
            <svg
              className={styles.qr}
              viewBox={`0 0 ${qr.size} ${qr.size}`}
              shapeRendering="crispEdges"
              role="img"
              aria-label={`QR code du lien de la salle ${code}`}>
              <path d={qr.path} fill="currentColor" />
            </svg>
          ) : null}
          <p className={styles.code}>{code}</p>
          <button type="button" className={styles.ghost} onClick={() => dialog.current?.close()}>
            Fermer
          </button>
        </div>
      </dialog>
    </>
  );
}

/** Les modules sombres en un seul tracé : un rectangle par suite contiguë d'une ligne. */
function toPath(data: boolean[][]): string {
  let path = '';
  data.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x++;
      path += `M${start} ${y}h${x - start}v1h${start - x}z`;
    }
  });
  return path;
}

/* Trois repères et quelques modules : ce qu'on reconnaît d'un QR code. */
function QrIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M3 3h8v8H3zM5 5h4v4H5zM6 6h2v2H6zM13 3h8v8h-8zM15 5h4v4h-4zM16 6h2v2h-2zM3 13h8v8H3zM5 15h4v4H5zM6 16h2v2H6zM13 13h3v3h-3zM18 13h3v3h-3zM16 16h2v2h-2zM13 18h3v3h-3zM18 18h3v3h-3z"
      />
    </svg>
  );
}
