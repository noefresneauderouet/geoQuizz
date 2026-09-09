'use client';

import type { CSSProperties } from 'react';

import { MODES, type ModeId } from '@/constants/categories';

import styles from './mode-selector.module.css';

type Props = {
  value: ModeId;
  onChange: (mode: ModeId) => void;
  /** Couleur de la pastille active : elle suit la catégorie mise en avant. */
  accent: string;
};

/** Segment à trois positions : Drapeau · Capitale · Pays. */
export function ModeSelector({ value, onChange, accent }: Props) {
  return (
    <div className={styles.track} role="tablist" aria-label="Mode de révision">
      {MODES.map((mode) => {
        const selected = mode.id === value;
        return (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(mode.id)}
            className={selected ? `${styles.segment} ${styles.active}` : styles.segment}
            style={selected ? ({ '--accent': accent } as CSSProperties) : undefined}>
            <span aria-hidden="true">{mode.emoji}</span>
            <span className={styles.label}>{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
}
