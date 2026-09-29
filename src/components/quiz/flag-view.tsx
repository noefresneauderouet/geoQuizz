'use client';

import { useEffect, useRef, useState } from 'react';

import { flagImage } from '@/lib/flags';

import styles from './flag-view.module.css';

type Props = { code: string };

/**
 * Drapeau du pays.
 *
 * Il est dessiné dans un <canvas> : la page ne porte ni adresse d'image, ni
 * nom de fichier, ni emoji qui trahiraient le pays (voir src/lib/flags.ts).
 * Le canvas prend tout le cadre, quelle que soit la forme du drapeau, pour
 * que ses dimensions ne disent rien non plus ; le drapeau y est centré, sans
 * dépasser sa taille naturelle, comme l'image qu'il remplace.
 *
 * Le service worker précache tous les drapeaux à son installation : ils
 * s'affichent hors ligne. S'il en manque un quand même, un message le dit, et
 * la question suivante le fera retenter. L'écran de jeu remonte ce composant
 * à chaque question (`key` dans quiz-board.tsx) : un échec ne se reporte pas
 * sur la suivante.
 */
export function FlagView({ code }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let bitmap: ImageBitmap | null = null;
    let active = true;

    /* Redessiné à chaque changement de taille : fixer `width` efface le canvas. */
    const draw = () => {
      const context = canvas.getContext('2d');
      if (!bitmap || !context) return;
      const ratio = window.devicePixelRatio || 1;
      const box = { width: canvas.clientWidth, height: canvas.clientHeight };
      canvas.width = Math.round(box.width * ratio);
      canvas.height = Math.round(box.height * ratio);
      const scale =
        Math.min(1, box.width / bitmap.width, box.height / bitmap.height) * ratio;
      const width = bitmap.width * scale;
      const height = bitmap.height * scale;
      context.imageSmoothingQuality = 'high';
      context.drawImage(
        bitmap,
        (canvas.width - width) / 2,
        (canvas.height - height) / 2,
        width,
        height
      );
    };

    const observer = new ResizeObserver(draw);
    observer.observe(canvas);

    void flagImage(code)
      .then((blob) => (blob ? createImageBitmap(blob) : null))
      .catch(() => null)
      .then((decoded) => {
        if (!active) {
          decoded?.close();
        } else if (!decoded) {
          setFailed(true);
        } else {
          bitmap = decoded;
          draw();
        }
      });

    return () => {
      active = false;
      observer.disconnect();
      bitmap?.close();
    };
  }, [code]);

  return (
    <div className={styles.frame}>
      {failed ? (
        <p className={styles.missing}>Ce drapeau n’a pas pu se charger.</p>
      ) : (
        <canvas
          ref={canvasRef}
          className={styles.image}
          role="img"
          aria-label="Drapeau à identifier"
        />
      )}
    </div>
  );
}
