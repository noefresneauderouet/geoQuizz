'use client';

import { useSyncExternalStore } from 'react';

import { THEME_KEY, type ThemeChoice } from '@/constants/theme';
import { getItem, setItem } from '@/lib/storage';

import styles from './theme-selector.module.css';

const CHOICES: readonly { id: ThemeChoice; label: string; emoji: string }[] = [
  { id: 'system', label: 'Auto', emoji: '🌓' },
  { id: 'light', label: 'Clair', emoji: '☀️' },
  { id: 'dark', label: 'Sombre', emoji: '🌙' },
];

/*
 * Même petit store que la progression (src/lib/progress.ts) : le disque est
 * lu une fois, l'instantané en mémoire fait ensuite autorité.
 */
let choice: ThemeChoice | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): ThemeChoice {
  if (!choice) {
    const stored = getItem(THEME_KEY);
    choice = stored === 'light' || stored === 'dark' ? stored : 'system';
  }
  return choice;
}

/** Le HTML construit ne connaît pas le réglage : il montre « Auto ». */
const getServerSnapshot = (): ThemeChoice => 'system';

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Applique le thème sans recharger : l'attribut que le script du layout pose
 * au chargement, ici mis à jour en direct. `system` le retire, et la feuille
 * suit alors l'appareil.
 */
function choose(next: ThemeChoice) {
  choice = next;
  setItem(THEME_KEY, next);
  const root = document.documentElement;
  if (next === 'system') delete root.dataset.theme;
  else root.dataset.theme = next;
  listeners.forEach((listener) => listener());
}

/** Segment à trois positions : Auto · Clair · Sombre. */
export function ThemeSelector() {
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div className={styles.track} role="radiogroup" aria-label="Thème">
      {CHOICES.map((c) => {
        const selected = c.id === value;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => choose(c.id)}
            className={selected ? `${styles.segment} ${styles.active}` : styles.segment}>
            <span aria-hidden="true">{c.emoji}</span>
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
