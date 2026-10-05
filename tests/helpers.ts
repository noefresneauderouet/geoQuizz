/**
 * Petits outils partagés par les tests (ce fichier n'en contient aucun).
 */
import type { ModeId, RegionSetId } from '@/constants/categories';
import { countryByCode, type Country } from '@/lib/countries';
import type { Question } from '@/lib/quiz';
import { regionSet } from '@/lib/regions';

/** Le pays de ce code ; le test échoue tout de suite s'il n'existe pas. */
export function country(code: string): Country {
  const found = countryByCode(code);
  if (!found) throw new Error(`pays inconnu : ${code}`);
  return found;
}

/** Une question sur un pays : drapeau, capitale ou pays sur la carte. */
export function countryQuestion(code: string, mode: Exclude<ModeId, 'etats'> = 'drapeau'): Question {
  return { mode, country: country(code) };
}

/** Une question du mode États. */
export function regionQuestion(set: RegionSetId, code: string): Question {
  const { country: owner, regions } = regionSet(set);
  const region = regions.find((r) => r.code === code);
  if (!region) throw new Error(`région inconnue : ${code}`);
  return { mode: 'etats', country: owner, set, region };
}

/** Un stockage du navigateur, en mémoire : Node n'a ni localStorage ni sessionStorage. */
export class MemoryStorage {
  private items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, String(value));
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  clear(): void {
    this.items.clear();
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }
}

/** Donne au test un localStorage et un sessionStorage neufs, vides. */
export function installStorage(): { local: MemoryStorage; session: MemoryStorage } {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true, writable: true });
  return { local, session };
}

/**
 * Attend qu'une condition devienne vraie. Les connexions de src/lib/room.ts
 * se font en arrière-plan, après un import dynamique : on laisse tourner la
 * boucle d'événements jusqu'à ce qu'elles aboutissent.
 */
export async function waitFor(condition: () => boolean, what = 'la condition attendue'): Promise<void> {
  for (let i = 0; i < 2000; i++) {
    if (condition()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`${what} n'est jamais arrivée`);
}

/** Laisse passer les promesses et les messages en attente. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
}

let generation = 0;

/**
 * Importe un module comme au premier chargement de la page : ce qu'il garde
 * en mémoire (la progression lue sur le disque, le compte…) repart de zéro.
 * Ses propres imports, eux, restent partagés.
 */
export async function freshImport<T>(specifier: string): Promise<T> {
  generation += 1;
  return (await import(`${specifier}?neuf=${generation}`)) as T;
}
