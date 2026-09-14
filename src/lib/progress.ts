'use client';

import { useSyncExternalStore } from 'react';

import type { CategoryId, ModeId } from '@/constants/categories';
import { getItem, setItem } from '@/lib/storage';

const KEY = 'geolearn.progress.v1';

/**
 * Un record par zone, mode **et longueur réelle de manche** : un temps sur 20
 * questions ne se compare pas à un temps sur 10.
 */
export type ScoreKey = `${CategoryId}:${ModeId}:${number}`;

export function scoreKey(category: CategoryId, mode: ModeId, length: number): ScoreKey {
  return `${category}:${mode}:${length}`;
}

export type Stats = {
  /** Meilleur nombre de réponses trouvées, par zone, mode et longueur. */
  best: Partial<Record<ScoreKey, number>>;
  /**
   * Meilleur temps sur une manche entièrement trouvée, en millisecondes.
   *
   * Le classement ne regardera que ce chiffre : quand tout est trouvé, il n'y
   * a plus rien d'autre à départager. Une manche arrêtée avant la fin ne
   * laisse donc aucun temps. Une clé absente veut dire « jamais terminée
   * en entier ici ».
   */
  bestTime: Partial<Record<ScoreKey, number>>;
  totalAnswers: number;
  totalCorrect: number;
  /** Temps de recherche cumulé sur toutes les parties terminées. */
  totalTimeMs: number;
  rounds: number;
  /** Meilleure série de réponses trouvées sans passer, tous modes confondus. */
  bestStreak: number;
  /** Codes ISO des pays laissés sans réponse et jamais retrouvés depuis. */
  toReview: string[];
};

export const EMPTY_STATS: Stats = {
  best: {},
  bestTime: {},
  totalAnswers: 0,
  totalCorrect: 0,
  totalTimeMs: 0,
  rounds: 0,
  bestStreak: 0,
  toReview: [],
};

/**
 * Petit store externe : le disque est lu une seule fois, puis l'instantané en
 * mémoire fait autorité. Les écrans s'y abonnent via useSyncExternalStore, ce
 * qui rafraîchit le profil dès la fin d'une partie sans effet de bord.
 */
let snapshot: Stats | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): Stats {
  if (!snapshot) {
    try {
      const raw = getItem(KEY);
      snapshot = raw ? migrate({ ...EMPTY_STATS, ...(JSON.parse(raw) as Stats) }) : EMPTY_STATS;
    } catch {
      // données corrompues ou stockage indisponible : on repart de zéro
      snapshot = EMPTY_STATS;
    }
  }
  return snapshot;
}

/**
 * Les parties d'avant le choix de la longueur faisaient toujours 10 questions,
 * et leurs clés s'écrivaient `europe:drapeau`. On les range sous
 * `europe:drapeau:10` à la lecture ; la prochaine écriture les fixe.
 */
function migrate(stats: Stats): Stats {
  const withLength = <T>(record: Partial<Record<string, T>>) =>
    Object.fromEntries(
      Object.entries(record).map(([key, value]) => [
        key.split(':').length === 2 ? `${key}:10` : key,
        value,
      ]),
    ) as Partial<Record<ScoreKey, T>>;
  return { ...stats, best: withLength(stats.best), bestTime: withLength(stats.bestTime) };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function commit(next: Stats) {
  snapshot = next;
  setItem(KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

export type RoundResult = {
  category: CategoryId;
  mode: ModeId;
  score: number;
  total: number;
  /** Temps de recherche de la manche, correction exclue (src/lib/timer.ts). */
  durationMs: number;
  bestStreak: number;
  missed: string[];
  solved: string[];
};

export function recordRound(result: RoundResult) {
  const prev = getSnapshot();
  const key = scoreKey(result.category, result.mode, result.total);

  // Un pays quitte la liste « à revoir » dès qu'on le retrouve.
  const toReview = new Set(prev.toReview);
  result.solved.forEach((code) => toReview.delete(code));
  result.missed.forEach((code) => toReview.add(code));

  // Seule une manche entièrement trouvée laisse un temps, et seulement s'il
  // bat le précédent. Tout le reste de la progression, lui, continue de compter.
  const prevTime = prev.bestTime[key];
  const perfect = result.score === result.total;
  const bestTime =
    perfect && (prevTime === undefined || result.durationMs < prevTime)
      ? { ...prev.bestTime, [key]: result.durationMs }
      : prev.bestTime;

  commit({
    best: { ...prev.best, [key]: Math.max(prev.best[key] ?? 0, result.score) },
    bestTime,
    totalAnswers: prev.totalAnswers + result.total,
    totalCorrect: prev.totalCorrect + result.score,
    totalTimeMs: prev.totalTimeMs + result.durationMs,
    rounds: prev.rounds + 1,
    bestStreak: Math.max(prev.bestStreak, result.bestStreak),
    toReview: [...toReview],
  });
}

export function resetProgress() {
  commit(EMPTY_STATS);
}

/**
 * Instantané servi pendant le rendu statique **et** pendant l'hydratation.
 *
 * Il doit rester constant : si l'hydratation lisait déjà localStorage, le
 * premier rendu client afficherait des scores que le HTML construit à la
 * compilation ne contient pas, et React signalerait un écart. Les vraies
 * valeurs arrivent juste après, au premier abonnement.
 */
const getServerSnapshot = (): Stats => EMPTY_STATS;

export function useStats(): Stats {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
