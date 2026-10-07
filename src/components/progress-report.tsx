'use client';

import Link from 'next/link';
import { useState } from 'react';

import { AppMenu } from '@/components/app-menu';
import { useAccount } from '@/components/use-account';
import { useMyBests } from '@/components/use-my-bests';
import {
  CATEGORIES,
  MODES,
  REGION_SETS,
  ZONE_MODES,
  type Category,
  type Mode,
  type ModeId,
  type PlayId,
} from '@/constants/categories';
import type { MyBests } from '@/lib/leaderboard';
import { resetProgress, useStats, type ScoreKey, type Stats } from '@/lib/progress';
import { formatDuration, formatSeconds } from '@/lib/timer';
import { mixesIn, playCategory } from '@/lib/zones';

import styles from './progress-report.module.css';

/** Meilleurs scores et taux de réussite. Le thème se règle dans le menu (app-menu.tsx). */
export function ProgressReport() {
  const stats = useStats();
  /** Connecté, les temps affichés sont ceux du classement (voir recordsOf). */
  const online = useMyBests();
  const [confirming, setConfirming] = useState(false);

  const accuracy = stats.totalAnswers
    ? Math.round((stats.totalCorrect / stats.totalAnswers) * 100)
    : 0;

  // Le temps par réponse plutôt que le temps total : il ne récompense pas
  // celui qui a simplement joué davantage.
  const pace = stats.totalAnswers ? stats.totalTimeMs / stats.totalAnswers : 0;

  // Les manches n'ont pas toutes la même longueur : on compare le temps par
  // question des manches trouvées en entier, pas leur durée brute.
  const paces = Object.entries(online ?? stats.bestTime).flatMap(([key, time]) =>
    time === undefined ? [] : [time / lengthOf(key)],
  );
  const fastest = paces.length > 0 ? Math.min(...paces) : null;
  const anyUnranked = Object.keys(stats.bestTime).some(
    (key) => unrankedTime(stats, online, key) !== undefined,
  );
  // Les mélanges de continents joués sur cet appareil ont leur ligne, sous
  // les zones : ils n'ont pas de classement, donc rien qu'ici.
  const zones = [...CATEGORIES, ...mixesIn(Object.keys(stats.best)).map(playCategory)];

  /*
   * Effacement en deux temps : le bouton demande confirmation dans son propre
   * libellé. `window.confirm` ouvrirait une boîte système qui jure avec le
   * reste, et qui est purement bloquante.
   */
  const reset = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    resetProgress();
    setConfirming(false);
  };

  return (
    <>
      <header className="pageHeader">
        <div>
          <h1 className={styles.brand}>Ma progression</h1>
          <p className={styles.subtitle}>
            {stats.rounds > 0
              ? `${stats.rounds} partie${stats.rounds > 1 ? 's' : ''} jouée${stats.rounds > 1 ? 's' : ''} · ${formatSeconds(pace)} par réponse`
              : 'Aucune partie pour le moment'}
          </p>
        </div>
        <AppMenu />
      </header>

      <AccountLink />

      <div className={styles.statRow}>
        <Stat value={`${accuracy}%`} label="de réussite" color="var(--green)" />
        <Stat value={String(stats.bestStreak)} label="meilleure série" color="var(--yellow-dark)" />
        <Stat value={String(stats.totalCorrect)} label="bonnes réponses" color="var(--blue)" />
        <Stat
          value={fastest === null ? '—' : formatSeconds(fastest)}
          label="par question, record"
          color="var(--brown-dark)"
        />
      </div>

      <h2 className="sectionTitle">Meilleurs scores</h2>
      <p className={styles.hint}>
        Une ligne par longueur de partie. Tant qu’une manche n’est pas trouvée en entier, on affiche
        le nombre de réponses ; ensuite, seul le chrono compte — c’est lui qui fait le classement.
        {online === null
          ? null
          : ' Connecté, ce sont tes temps du classement, les mêmes sur tous tes appareils.'}
        {anyUnranked
          ? ' Un temps suivi de * a été fait sur cet appareil sans compter au classement : sans compte, hors ligne, refusé, ou sur plusieurs zones mélangées.'
          : null}
      </p>
      <ScoreTable
        stats={stats}
        online={online}
        heading="Zone"
        categories={zones}
        modes={ZONE_MODES}
      />

      <h2 className="sectionTitle">États et régions</h2>
      <ScoreTable
        stats={stats}
        online={online}
        heading="Pays"
        categories={REGION_SETS}
        modes={REGION_MODES}
      />

      <button type="button" className={styles.reset} onClick={reset}>
        {confirming ? 'Appuie encore pour confirmer' : 'Réinitialiser ma progression'}
      </button>
    </>
  );
}

/** Le compte, qui ne sert qu'au classement : une ligne, qui mène à /compte. */
function AccountLink() {
  const account = useAccount();
  if (account.status === 'loading' || account.status === 'unavailable') return null;
  return (
    <Link href="/compte" className={styles.account}>
      {account.status === 'signed-in' ? (
        <>
          <span>
            Connecté : <strong>{account.username}</strong>
          </span>
          <span className={styles.accountAction}>Mon compte</span>
        </>
      ) : account.status === 'needs-username' ? (
        <>
          <span>Choisis ton pseudo pour entrer au classement.</span>
          <span className={styles.accountAction}>Choisir</span>
        </>
      ) : (
        <>
          <span>Crée un compte pour entrer au classement.</span>
          <span className={styles.accountAction}>Se connecter</span>
        </>
      )}
    </Link>
  );
}

const REGION_MODES = MODES.filter((m) => m.id === 'etats');

type ScoreTableProps = {
  stats: Stats;
  online: MyBests | null;
  /** Titre de la première colonne : « Zone », ou « Pays » pour le mode États. */
  heading: string;
  categories: readonly Category[];
  modes: readonly Mode[];
};

/** Une ligne par catégorie, une colonne par mode, les records dans les cases. */
function ScoreTable({ stats, online, heading, categories, modes }: ScoreTableProps) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{heading}</th>
            {modes.map((m) => (
              <th key={m.id} scope="col">
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <tr key={cat.id}>
              <th scope="row">
                {cat.emoji} {cat.label}
              </th>
              {modes.map((m) => {
                const records = recordsOf(stats, online, cat.id, m.id);
                return (
                  <td key={m.id}>
                    {records.length === 0
                      ? '—'
                      : records.map(({ length, found, time, unranked }) => (
                          <span
                            key={length}
                            className={
                              time === undefined
                                ? styles.cellLine
                                : `${styles.cellLine} ${styles.perfect}`
                            }>
                            <span className={styles.cellLength}>{length} q</span>
                            {time !== undefined
                              ? formatDuration(time)
                              : unranked === undefined
                                ? `${found}/${length}`
                                : null}
                            {unranked === undefined ? null : (
                              <span
                                className={styles.unranked}>{`${formatDuration(unranked)}*`}</span>
                            )}
                          </span>
                        ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** « europe:drapeau:15 » -> 15 */
function lengthOf(key: string): number {
  return Number(key.split(':')[2]);
}

/**
 * Les records d'une case du tableau, de la partie la plus courte à la plus
 * longue.
 *
 * Connecté (`online`), le temps est celui du classement, et les manches
 * jouées sur d'autres appareils ont leur ligne. Le temps de l'appareil ne
 * s'y ajoute que s'il est plus rapide (`unranked`).
 */
function recordsOf(stats: Stats, online: MyBests | null, category: PlayId, mode: ModeId) {
  const prefix = `${category}:${mode}:`;
  const keys = new Set(
    [...Object.keys(stats.best), ...Object.keys(online ?? {})].filter((key) =>
      key.startsWith(prefix),
    ),
  );
  return [...keys]
    .map((key) => ({
      length: lengthOf(key),
      // Un temps au classement veut dire une manche trouvée en entier.
      found: stats.best[key as ScoreKey] ?? lengthOf(key),
      time: online === null ? stats.bestTime[key as ScoreKey] : online[key],
      unranked: unrankedTime(stats, online, key),
    }))
    .sort((a, b) => a.length - b.length);
}

/**
 * Le record de l'appareil quand il bat, à la seconde affichée près, celui du
 * classement : une manche que la base n'a pas chronométrée (sans compte, hors
 * ligne, refusée). Rien pour un invité, dont le record de l'appareil est le
 * seul.
 */
function unrankedTime(stats: Stats, online: MyBests | null, key: string): number | undefined {
  const local = stats.bestTime[key as ScoreKey];
  if (online === null || local === undefined) return undefined;
  const ranked = online[key];
  const shown = (ms: number) => Math.round(ms / 1000);
  return ranked === undefined || shown(local) < shown(ranked) ? local : undefined;
}

function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue} style={{ color }}>
        {value}
      </span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
