import Storage from 'expo-sqlite/kv-store';

/**
 * Stockage clé/valeur synchrone. Sur mobile c'est expo-sqlite/kv-store ;
 * la variante .web.ts utilise localStorage, ce qui évite d'embarquer le
 * module WASM de SQLite dans le bundle web.
 */
export function getItem(key: string): string | null {
  try {
    return Storage.getItemSync(key);
  } catch {
    return null;
  }
}

export function setItem(key: string, value: string): void {
  try {
    Storage.setItemSync(key, value);
  } catch {
    // stockage indisponible : la session reste jouable, sans persistance
  }
}
