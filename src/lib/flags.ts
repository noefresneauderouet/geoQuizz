/**
 * Les drapeaux, téléchargés tous ensemble pour ne rien dire de la question.
 *
 * Une balise <img> pointée sur flagcdn.com/w640/fr.png donnait la réponse
 * dans son adresse : trois lignes de script lisaient le code du pays et
 * tapaient son nom. Désormais, le premier drapeau demandé fait venir les 196,
 * toujours dans le même ordre, et FlagView dessine celui de la question dans
 * un <canvas>. Ni le réseau, ni les adresses, ni le texte de la page ne
 * désignent plus le pays affiché.
 *
 * Ce n'est pas une garantie absolue : la page connaît la réponse, puisqu'elle
 * la vérifie. Un script qui fouille la mémoire de l'application, ou qui
 * compare l'image aux 196 drapeaux, la trouve encore. Le classement s'en
 * remet alors au temps minimal que compte la base, et au bannissement.
 */
import { COUNTRIES, flagUrl } from '@/lib/countries';

const requests = new Map<string, Promise<Blob | null>>();

/**
 * En CORS : flagcdn l'autorise, et le service worker sert sa copie en cache
 * (scripts/service-worker.js), qui a la même adresse, donc la même largeur.
 */
async function download(code: string): Promise<Blob | null> {
  try {
    const response = await fetch(flagUrl(code, 640), { mode: 'cors', credentials: 'omit' });
    return response.ok ? await response.blob() : null;
  } catch {
    return null;
  }
}

/**
 * Lance chaque drapeau qui n'est ni arrivé ni en route. Un échec est oublié,
 * et retenté à l'appel suivant, c'est-à-dire à la question suivante, quelle
 * qu'elle soit : une nouvelle tentative ne désigne pas le drapeau affiché.
 */
function requestAll() {
  for (const { code } of COUNTRIES) {
    if (requests.has(code)) continue;
    const request = download(code);
    requests.set(code, request);
    void request.then((blob) => {
      if (!blob) requests.delete(code);
    });
  }
}

/** Le drapeau d'un pays ; `null` s'il n'a pas pu être téléchargé. */
export function flagImage(code: string): Promise<Blob | null> {
  requestAll();
  return requests.get(code) ?? Promise.resolve(null);
}
