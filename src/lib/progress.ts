'use client';

import { useSyncExternalStore } from 'react';

import type { CategoryId, ModeId } from '@/constants/categories';
import { getItem, setItem } from '@/lib/storage';

const KEY = 'geolearn.progress.v1';

export type ScoreKey = `${CategoryId}:${ModeId}`;

export type Stats = {
  /** Meilleur score sur 10, par catégorie et mode. */
  best: Partial<Record<ScoreKey, number>>;
  totalAnswers: number;
  totalCorrect: number;
  rounds: number;
  /** Meilleure série de bonnes réponses consécutives, tous modes confondus. */
  bestStreak: number;
  /** Codes ISO des pays ratés au moins une fois et jamais réussis depuis. */
  toReview: string[];
};

export const EMPTY_STATS: Stats = {
  best: {},
  totalAnswers: 0,
  totalCorrect: 0,
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
      snapshot = raw ? { ...EMPTY_STATS, ...(JSON.parse(raw) as Stats) } : EMPTY_STATS;
    } catch {
      // données corrompues ou stockage indisponible : on repart de zéro
      snapshot = EMPTY_STATS;
    }
  }
  return snapshot;
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
  bestStreak: number;
  missed: string[];
  solved: string[];
};

export function recordRound(result: RoundResult) {
  const prev = getSnapshot();
  const key: ScoreKey = `${result.category}:${result.mode}`;

  // Un pays quitte la liste « à revoir » dès qu'on le retrouve.
  const toReview = new Set(prev.toReview);
  result.solved.forEach((code) => toReview.delete(code));
  result.missed.forEach((code) => toReview.add(code));

  commit({
    best: { ...prev.best, [key]: Math.max(prev.best[key] ?? 0, result.score) },
    totalAnswers: prev.totalAnswers + result.total,
    totalCorrect: prev.totalCorrect + result.score,
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
