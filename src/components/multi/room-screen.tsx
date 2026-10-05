'use client';

import Link from 'next/link';
import { useRouter, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { MultiRoom, Notice } from '@/components/multi/multi-room';
import {
  describeSettings,
  SettingsFields,
  settingsOf,
  type SettingsDraft,
} from '@/components/multi/room-settings';
import { useInBrowser } from '@/components/use-in-browser';
import { CATEGORIES, getCategory, getMode } from '@/constants/categories';
import { DEFAULT_QUESTION_COUNT, getQuestionCount, poolSize, QUESTION_COUNTS } from '@/lib/quiz';
import {
  cleanName,
  getPlayerName,
  getTimeLimit,
  isMultiplayerConfigured,
  isRoomCode,
  markAsHost,
  MAX_NAME_LENGTH,
  newRoomCode,
  roomPath,
  setPlayerName,
  type RoomSettings,
} from '@/lib/room';

import styles from './multi.module.css';

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
    count: Math.min(urlCount(params.get('count')), poolSize(category.id, mode.id)),
    limit: getTimeLimit(params.get('limit')),
  };
}

/**
 * La longueur dans l'URL : 10, 15 ou 20, ou déjà ramenée à la taille de sa
 * zone (14 en Océanie) — la salle réécrit son adresse avec ce qu'elle fait
 * jouer. Toute autre valeur retombe sur 10.
 */
function urlCount(value: string | null): number {
  const count = Number(value);
  const longest = Math.max(...QUESTION_COUNTS);
  return Number.isInteger(count) && count >= 1 && count <= longest ? count : DEFAULT_QUESTION_COUNT;
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

  return (
    <MultiRoom code={code} name={name} settings={settings} isPublic={params.get('public') === '1'} />
  );
}

/** Ce qu'on peut annoncer de la partie avant d'être entré : tout, ou le code seul. */
function roomSummary(code: string, settings: RoomSettings | null): string {
  return settings ? describeSettings(settings) : `Salle ${code}`;
}

/* -------------------------------- Création ------------------------------- */

function CreateRoom({ onName }: { onName: (name: string) => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const [draft, setDraft] = useState<SettingsDraft>(() => ({
    mode: getMode(params.get('mode') ?? undefined).id,
    count: getQuestionCount(params.get('count')),
    limit: getTimeLimit(params.get('limit')),
    isPublic: false,
    category: 'monde',
  }));
  const [name, setName] = useState(getPlayerName);
  const accent = CATEGORIES[0].accent;

  const create = (event: FormEvent) => {
    event.preventDefault();
    const pseudo = cleanName(name);
    if (!pseudo) return;
    setPlayerName(pseudo);
    onName(pseudo);
    const code = newRoomCode();
    markAsHost(code);
    router.replace(roomPath(code, settingsOf(draft), draft.isPublic));
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
        <NameField value={name} onChange={setName} />
        <SettingsFields value={draft} onChange={setDraft} accent={accent} />

        <button
          type="submit"
          className={styles.primary}
          style={{ backgroundColor: accent }}
          disabled={!cleanName(name)}>
          Créer la salle
        </button>
      </form>
    </main>
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
