'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';

import { CountSelector } from '@/components/count-selector';
import { ModeSelector } from '@/components/mode-selector';
import {
  CATEGORIES,
  categoriesFor,
  getCategory,
  getMode,
  type CategoryId,
  type ModeId,
} from '@/constants/categories';
import { DEFAULT_QUESTION_COUNT, poolSize, QUESTION_COUNTS, type QuestionCount } from '@/lib/quiz';
import { formatTimeLimit, TIME_LIMITS, type RoomSettings, type TimeLimit } from '@/lib/room';

import selectorStyles from '../count-selector.module.css';
import styles from './multi.module.css';

/**
 * Les réglages d'une salle tels qu'on les choisit : à sa création, puis par
 * son hôte entre deux parties.
 */
export type SettingsDraft = {
  mode: ModeId;
  count: QuestionCount;
  limit: TimeLimit;
  isPublic: boolean;
  /** Le dernier choix de zone : il peut manquer au mode choisi (voir `zoneOf`). */
  category: CategoryId;
};

/**
 * Passer en mode États remplace les zones par les pays : le choix précédent
 * retombe alors sur le premier de la liste, et revient avec le mode d'avant.
 */
function zoneOf({ mode, category }: SettingsDraft): CategoryId {
  const choices = categoriesFor(mode);
  return choices.some((c) => c.id === category) ? category : choices[0].id;
}

/** « 🌍 Monde · 🏳️ Drapeau · 10 questions · ⏳ 2 min » : la partie en une ligne. */
export function describeSettings(settings: RoomSettings): string {
  const category = getCategory(settings.category, settings.mode);
  const mode = getMode(settings.mode);
  const chrono = settings.limit ? ` · ⏳ ${formatTimeLimit(settings.limit)}` : '';
  return `${category.emoji} ${category.label} · ${mode.emoji} ${mode.label} · ${settings.count} questions${chrono}`;
}

/** Ce que la salle fera jouer. Une zone plus petite que la longueur demandée se joue en entier. */
export function settingsOf(draft: SettingsDraft): RoomSettings {
  const category = zoneOf(draft);
  return {
    category,
    mode: draft.mode,
    count: Math.min(draft.count, poolSize(category, draft.mode)),
    limit: draft.limit,
  };
}

/** Le formulaire rouvert sur les réglages d'une salle ; `null` : ceux de la création. */
export function draftOf(settings: RoomSettings | null, isPublic: boolean): SettingsDraft {
  return {
    mode: settings?.mode ?? getMode(undefined).id,
    // Une manche ramenée à la taille de sa zone (14 pays en Océanie) : la
    // première longueur qui la contient la redonne telle quelle.
    count:
      QUESTION_COUNTS.find((count) => count >= (settings?.count ?? 0)) ?? DEFAULT_QUESTION_COUNT,
    limit: settings?.limit ?? 0,
    isPublic,
    category: settings?.category ?? 'monde',
  };
}

type FieldsProps = {
  value: SettingsDraft;
  onChange: (draft: SettingsDraft) => void;
  accent: string;
};

/** Mode, longueur, temps, visibilité et zone : tout ce qui règle une salle, sauf le pseudo. */
export function SettingsFields({ value, onChange, accent }: FieldsProps) {
  const set = (patch: Partial<SettingsDraft>) => onChange({ ...value, ...patch });
  const zone = zoneOf(value);
  const label = value.mode === 'etats' ? 'Pays' : 'Zone';

  return (
    <>
      <h2 className="sectionTitle">Mode</h2>
      <ModeSelector value={value.mode} onChange={(mode) => set({ mode })} accent={accent} />
      <CountSelector value={value.count} onChange={(count) => set({ count })} accent={accent} />
      <LimitSelector value={value.limit} onChange={(limit) => set({ limit })} accent={accent} />
      <VisibilitySelector
        value={value.isPublic}
        onChange={(isPublic) => set({ isPublic })}
        accent={accent}
      />

      <h2 className="sectionTitle">{label}</h2>
      <div className={styles.zones} role="radiogroup" aria-label={label}>
        {categoriesFor(value.mode).map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={c.id === zone}
            className={c.id === zone ? `${styles.zone} ${styles.zoneActive}` : styles.zone}
            style={c.id === zone ? { borderColor: c.accent, color: c.accent } : undefined}
            onClick={() => set({ category: c.id })}>
            <span aria-hidden="true">{c.emoji}</span> {c.label}
          </button>
        ))}
      </div>
    </>
  );
}

type EditorProps = {
  code: string;
  initial: SettingsDraft;
  onSave: (settings: RoomSettings, isPublic: boolean) => void;
  onCancel: () => void;
};

/**
 * L'hôte change les réglages de sa salle entre deux parties : les choix de
 * la création, sans le pseudo. Rien ne part avant « Enregistrer » : une
 * seule publication pour tous les changements, Presence étant limité.
 */
export function SettingsEditor({ code, initial, onSave, onCancel }: EditorProps) {
  const [draft, setDraft] = useState(initial);
  const accent = CATEGORIES[0].accent;

  const save = (event: FormEvent) => {
    event.preventDefault();
    onSave(settingsOf(draft), draft.isPublic);
  };

  return (
    <main className="screen">
      <header>
        <p className={styles.eyebrow}>Salle {code}</p>
        <h1 className={styles.pageTitle}>Réglages de la partie</h1>
        <p className={styles.pageSubtitle}>
          Les joueurs de la salle les verront dès que tu les enregistres.
        </p>
      </header>

      <form className={styles.form} onSubmit={save}>
        <SettingsFields value={draft} onChange={setDraft} accent={accent} />
        <button type="submit" className={styles.primary} style={{ backgroundColor: accent }}>
          Enregistrer
        </button>
        <button type="button" className={styles.ghost} onClick={onCancel}>
          Annuler
        </button>
      </form>
    </main>
  );
}

type LimitSelectorProps = {
  value: TimeLimit;
  onChange: (limit: TimeLimit) => void;
  accent: string;
};

/** Même présentation que le choix du nombre de questions, juste au-dessus. */
function LimitSelector({ value, onChange, accent }: LimitSelectorProps) {
  return (
    <div className={selectorStyles.row}>
      <span className={selectorStyles.caption} id="limit-caption">
        Temps
      </span>
      <div
        className={`${selectorStyles.track} ${styles.limitTrack}`}
        role="radiogroup"
        aria-labelledby="limit-caption"
        style={{ '--accent': accent } as CSSProperties}>
        {TIME_LIMITS.map((limit) => {
          const selected = limit === value;
          return (
            <button
              key={limit}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={limit === 0 ? 'Sans limite de temps' : `${limit / 60} minutes`}
              onClick={() => onChange(limit)}
              className={
                selected ? `${selectorStyles.option} ${selectorStyles.active}` : selectorStyles.option
              }>
              {limit === 0 ? '∞' : `${limit / 60}′`}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type VisibilitySelectorProps = {
  value: boolean;
  onChange: (isPublic: boolean) => void;
  accent: string;
};

/**
 * Privée : on n'y entre qu'avec le lien ou le code. Publique : « Partie
 * aléatoire », sur l'accueil, peut aussi y mener des inconnus.
 */
function VisibilitySelector({ value, onChange, accent }: VisibilitySelectorProps) {
  const options = [
    { isPublic: false, label: '🔒 Privée' },
    { isPublic: true, label: '🌍 Publique' },
  ];
  return (
    <div className={selectorStyles.row}>
      <span className={selectorStyles.caption} id="visibility-caption">
        Partie
      </span>
      <div
        className={selectorStyles.track}
        role="radiogroup"
        aria-labelledby="visibility-caption"
        style={{ '--accent': accent } as CSSProperties}>
        {options.map((option) => {
          const selected = option.isPublic === value;
          return (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.isPublic)}
              className={
                selected ? `${selectorStyles.option} ${selectorStyles.active}` : selectorStyles.option
              }>
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
