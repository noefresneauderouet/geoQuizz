import { getCategory, getMode, type CategoryId, type ModeId } from '@/constants/categories';
import { getQuestionCount, type QuestionCount } from '@/lib/quiz';
import { getItem, setItem } from '@/lib/storage';

const KEY = 'geolearn.last-game.v1';

/**
 * Les réglages de la dernière partie solo lancée sur cet appareil. L'accueil
 * les reprend pour que la suivante se relance sans tout rechoisir.
 */
export type LastGame = {
  category: CategoryId;
  mode: ModeId;
  count: QuestionCount;
};

/**
 * Même principe que src/lib/progress.ts : le disque est lu une fois, puis
 * l'instantané en mémoire fait autorité. `undefined` veut dire « pas encore
 * lu », `null` « aucune partie enregistrée ».
 */
let snapshot: LastGame | null | undefined;
const listeners = new Set<() => void>();

/**
 * Relit ce qui est stocké en le passant par les mêmes garde-fous que l'URL
 * de /quiz : une valeur d'une ancienne version, ou modifiée à la main,
 * retombe sur un réglage valide au lieu de casser l'accueil.
 */
function parse(raw: string | null): LastGame | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof LastGame, unknown>>;
    const mode = getMode(String(value.mode));
    return {
      mode: mode.id,
      category: getCategory(String(value.category), mode.id).id,
      count: getQuestionCount(String(value.count)),
    };
  } catch {
    return null;
  }
}

export function readLastGame(): LastGame | null {
  if (snapshot === undefined) snapshot = parse(getItem(KEY));
  return snapshot;
}

export function saveLastGame(game: LastGame): void {
  const prev = readLastGame();
  if (
    prev &&
    prev.category === game.category &&
    prev.mode === game.mode &&
    prev.count === game.count
  ) {
    return;
  }
  snapshot = game;
  setItem(KEY, JSON.stringify(game));
  listeners.forEach((listener) => listener());
}

export function subscribeLastGame(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
