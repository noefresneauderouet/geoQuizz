'use client';

import Link from 'next/link';
import { useRouter, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation';
import { useState, useSyncExternalStore, type CSSProperties, type FormEvent } from 'react';

import { CountSelector } from '@/components/count-selector';
import { ModeSelector } from '@/components/mode-selector';
import { MultiRoom, Notice } from '@/components/multi/multi-room';
import {
  CATEGORIES,
  categoriesFor,
  getCategory,
  getMode,
  type CategoryId,
} from '@/constants/categories';
import { getQuestionCount, poolSize, type QuestionCount } from '@/lib/quiz';
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
  type RoomSettings,
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

/**
 * Les réglages portés par l'URL.
 *
 * Le lien partagé les contient tous ; un code tapé à la main, aucun. On rend
 * alors `null` plutôt que des valeurs par défaut, qui feraient annoncer une
 * partie que l'hôte n'a pas choisie.
 */
function urlSettings(params: ReadonlyURLSearchParams): RoomSettings | null {
  if (!params.has('category')) return null;
  const mode = getMode(params.get('mode') ?? undefined);
  const category = getCategory(params.get('category') ?? undefined, mode.id);
  return {
    category: category.id,
    mode: mode.id,
    // Une zone plus petite que la longueur demandée se joue en entier.
    count: Math.min(getQuestionCount(params.get('count')), poolSize(category.id, mode.id)),
    limit: getTimeLimit(params.get('limit')),
  };
}

function RoomRouter() {
  const params = useSearchParams();
  const code = params.get('code');
  const settings = urlSettings(params);
  /** Pseudo confirmé pour cette visite ; le dernier utilisé ne sert qu'à préremplir. */
  const [name, setName] = useState<string | null>(null);

  if (!isMultiplayerConfigured()) {
    return (
      <Notice category={getCategory(undefined)} emoji="🛠️" title="Multijoueur indisponible">
        Cette version de GeoQuizz n&apos;est pas reliée à un service de parties en ligne.
      </Notice>
    );
  }

  if (!isRoomCode(code)) return <CreateRoom onName={setName} />;

  // Toujours demandé en rejoignant, prérempli : on garde son pseudo d'un
  // appui, ou on en change.
  if (!name) {
    return <NameStep title="Rejoindre la partie" subtitle={roomSummary(code, settings)} onSubmit={setName} />;
  }

  return <MultiRoom code={code} name={name} settings={settings} />;
}

/** Ce qu'on peut annoncer de la partie avant d'être entré : tout, ou le code seul. */
function roomSummary(code: string, settings: RoomSettings | null): string {
  if (!settings) return `Salle ${code}`;
  const category = getCategory(settings.category, settings.mode);
  const mode = getMode(settings.mode);
  const chrono = settings.limit ? ` · ⏳ ${formatTimeLimit(settings.limit)}` : '';
  return `${category.emoji} ${category.label} · ${mode.emoji} ${mode.label} · ${settings.count} questions${chrono}`;
}

/* -------------------------------- Création ------------------------------- */

function CreateRoom({ onName }: { onName: (name: string) => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState(getMode(params.get('mode') ?? undefined).id);
  const [count, setCount] = useState<QuestionCount>(getQuestionCount(params.get('count')));
  const [limit, setLimit] = useState<TimeLimit>(getTimeLimit(params.get('limit')));
  const [choice, setCategory] = useState<CategoryId>('monde');
  const [draft, setDraft] = useState(getPlayerName);
  const accent = CATEGORIES[0].accent;
  // Passer en mode États remplace les zones par les pays : le choix
  // précédent retombe alors sur le premier de la liste.
  const choices = categoriesFor(mode);
  const category = choices.some((c) => c.id === choice) ? choice : choices[0].id;

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
        <h1 className={styles.pageTitle}>Créer une partie</h1>
        <p className={styles.pageSubtitle}>
          Partage le lien ou dicte le code, et lance quand tout le monde est là.
        </p>
      </header>

      <form className={styles.form} onSubmit={create}>
        <NameField value={draft} onChange={setDraft} />

        <h2 className="sectionTitle">Mode</h2>
        <ModeSelector value={mode} onChange={setMode} accent={accent} />
        <CountSelector value={count} onChange={setCount} accent={accent} />
        <LimitSelector value={limit} onChange={setLimit} accent={accent} />

        <h2 className="sectionTitle">{mode === 'etats' ? 'Pays' : 'Zone'}</h2>
        <div
          className={styles.zones}
          role="radiogroup"
          aria-label={mode === 'etats' ? 'Pays' : 'Zone'}>
          {choices.map((c) => (
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
