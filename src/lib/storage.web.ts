/** Variante web de @/lib/storage : localStorage plutôt que SQLite/WASM. */
export function getItem(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function setItem(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // mode privé ou stockage plein
  }
}
