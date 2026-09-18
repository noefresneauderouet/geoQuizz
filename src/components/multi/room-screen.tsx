'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useSyncExternalStore, type CSSProperties, type FormEvent } from 'react';

import { CountSelector } from '@/components/count-selector';
import { ModeSelector } from '@/components/mode-selector';
import { MultiRoom, Notice } from '@/components/multi/multi-room';
import { CATEGORIES, getCategory, getMode, type CategoryId } from '@/constants/categories';
import { countriesOf } from '@/lib/countries';
import { getQuestionCount, type QuestionCount } from '@/lib/quiz';
import {
  cleanName,
  formatTimeLimit,
  getPlayerName,
  getTimeLimit,
  isMultiplayerConfigured,
  isRoomCode,
  markAsHost,
  MAX_NAME_LENGTH,
  newRoomCode,
  roomPath,
  setPlayerName,
  TIME_LIMITS,
  type TimeLimit,
} from '@/lib/room';

import selectorStyles from '../count-selector.module.css';
import styles from './multi.module.css';

const noSubscription = () => () => {};

/**
 * Vrai dans le navigateur une fois l'hydratation faite, faux au rendu serveur
 * et pendant l'hydratation : l'instantané serveur est constant, donc les
 * deux rendus coïncident.
 */
function useInBrowser(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

/**
 * /salle — sans code, on crée une salle ; avec un code, on la rejoint.
 *
 * L'écran dépend du stockage local (pseudo, identité, rôle d'hôte). En
 * développement, Next le rend aussi côté serveur, où ce stockage n'existe
 * pas : rien n'est donc affiché avant l'hydratation, sinon les deux rendus
 * divergeraient.
 */
export function RoomScreen() {
  const inBrowser = useInBrowser();
  return inBrowser ? <RoomRouter /> : <p className={styles.loading}>Ouverture de la salle…</p>;
}

function RoomRouter() {
  const params = useSearchParams();
  const code = params.get('code');
  const category = getCategory(params.get('category') ?? undefined);
  const mode = getMode(params.get('mode') ?? undefined);
  const count = Math.min(getQuestionCount(params.get('count')), countriesOf(category.id).length);
  const limit = getTimeLimit(params.get('limit'));
  const chrono = limit ? ` · ⏳ ${formatTimeLimit(limit)}` : '';
  /** Pseudo confirmé pour cette visite ; le dernier utilisé ne sert qu'à préremplir. */
  const [name, setName] = useState<string | null>(null);

  if (!isMultiplayerConfigured()) {
    return (
      <Notice category={category} emoji="🛠️" title="Multijoueur indisponible">
        Cette version de GeoLearn n&apos;est pas reliée à un service de parties en ligne.
      </Notice>
    );
  }

  if (!isRoomCode(code)) return <CreateRoom onName={setName} />;

  // Toujours demandé en rejoignant, prérempli : on garde son pseudo d'un
  // appui, ou on en change.
  if (!name) {
    return (
      <NameStep
        title="Rejoindre la partie"
        subtitle={`${category.emoji} ${category.label} · ${mode.emoji} ${mode.label} · ${count} questions${chrono}`}
        onSubmit={setName}
      />
    );
  }

  return (
    <MultiRoom
      code={code}
      name={name}
      category={category}
      mode={mode}
      count={count}
      limit={limit}
    />
  );
}

/* -------------------------------- Création ------------------------------- */

function CreateRoom({ onName }: { onName: (name: string) => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState(getMode(params.get('mode') ?? undefined).id);
  const [count, setCount] = useState<QuestionCount>(getQuestionCount(params.get('count')));
  const [limit, setLimit] = useState<TimeLimit>(getTimeLimit(params.get('limit')));
  const [category, setCategory] = useState<CategoryId>('monde');
  const [draft, setDraft] = useState(getPlayerName);
  const accent = CATEGORIES[0].accent;

  const create = (event: FormEvent) => {
    event.preventDefault();
    const pseudo = cleanName(draft);
    if (!pseudo) return;
    setPlayerName(pseudo);
    onName(pseudo);
    const code = newRoomCode();
    markAsHost(code);
    router.replace(roomPath(code, { category, mode, count, limit }));
  };

  return (
    <main className="screen">
      <header>
        <Link href="/" className={styles.back}>
          ← Accueil
        </Link>
        <h1 className={styles.pageTitle}>Défier des amis</h1>
        <p className={styles.pageSubtitle}>
          Crée une salle, partage le lien, et lance quand tout le monde est là.
        </p>
      </header>

      <form className={styles.form} onSubmit={create}>
        <NameField value={draft} onChange={setDraft} />

        <h2 className="sectionTitle">Mode</h2>
        <ModeSelector value={mode} onChange={setMode} accent={accent} />
        <CountSelector value={count} onChange={setCount} accent={accent} />
        <LimitSelector value={limit} onChange={setLimit} accent={accent} />

        <h2 className="sectionTitle">Zone</h2>
        <div className={styles.zones} role="radiogroup" aria-label="Zone">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={c.id === category}
              className={c.id === category ? `${styles.zone} ${styles.zoneActive}` : styles.zone}
              style={c.id === category ? { borderColor: c.accent, color: c.accent } : undefined}
              onClick={() => setCategory(c.id)}>
              <span aria-hidden="true">{c.emoji}</span> {c.label}
            </button>
          ))}
        </div>

        <button
          type="submit"
          className={styles.primary}
          style={{ backgroundColor: accent }}
          disabled={!cleanName(draft)}>
          Créer la salle
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

/* --------------------------------- Pseudo -------------------------------- */

function NameField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className={styles.nameField}>
      <span className="sectionTitle">Ton pseudo</span>
      <input
        className={styles.nameInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={MAX_NAME_LENGTH}
        autoComplete="nickname"
        placeholder="Ex. : Léa"
        required
      />
    </label>
  );
}

type NameStepProps = { title: string; subtitle: string; onSubmit: (name: string) => void };

function NameStep({ title, subtitle, onSubmit }: NameStepProps) {
  const [draft, setDraft] = useState(getPlayerName);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const pseudo = cleanName(draft);
    if (!pseudo) return;
    setPlayerName(pseudo);
    onSubmit(pseudo);
  };

  return (
    <main className="screen">
      <header>
        <h1 className={styles.pageTitle}>{title}</h1>
        <p className={styles.pageSubtitle}>{subtitle}</p>
      </header>
      <form className={styles.form} onSubmit={submit}>
        <NameField value={draft} onChange={setDraft} />
        <button
          type="submit"
          className={styles.primary}
          style={{ backgroundColor: CATEGORIES[0].accent }}
          disabled={!cleanName(draft)}>
          Entrer dans la salle
        </button>
      </form>
    </main>
  );
}
