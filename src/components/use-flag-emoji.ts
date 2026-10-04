'use client';

import { useSyncExternalStore } from 'react';

const noSubscription = () => () => {};

let drawsFlags: boolean | undefined;

/**
 * Windows ne dessine pas les drapeaux emoji : il écrit à leur place les deux
 * lettres du code du pays (« FR »), qui n'ont rien à faire à l'écran.
 *
 * On écrit un drapeau dans un canvas, puis ses deux lettres séparées par une
 * espace sans chasse, qui empêche de les lire comme un drapeau : là où il
 * manque, les deux images sont les mêmes. On exige en plus de la couleur,
 * que n'ont pas des lettres noires : un navigateur qui brouille la lecture
 * des canvas (Brave) ferait sinon différer deux images identiques.
 */
function detect(): boolean {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  // La police de la page, pour que le canvas choisisse le même repli emoji.
  context.font = `24px ${getComputedStyle(document.body).fontFamily}`;
  context.textBaseline = 'middle';

  const draw = (text: string) => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillText(text, 0, canvas.height / 2);
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  };

  const flag = draw('\u{1F1EB}\u{1F1F7}');
  const letters = draw('\u{1F1EB}​\u{1F1F7}');

  let differs = false;
  let colored = false;
  for (let i = 0; i < flag.length; i += 4) {
    const [r, g, b, a] = flag.subarray(i, i + 4);
    if (r !== letters[i] || g !== letters[i + 1] || b !== letters[i + 2]) differs = true;
    if (a > 0 && Math.max(r, g, b) - Math.min(r, g, b) > 64) colored = true;
  }
  return differs && colored;
}

function snapshot(): boolean {
  if (drawsFlags === undefined) {
    try {
      drawsFlags = detect();
    } catch {
      drawsFlags = false;
    }
  }
  return drawsFlags;
}

/**
 * Vrai si l'appareil dessine les drapeaux emoji (téléphones, Mac), faux sur
 * Windows. Faux au rendu serveur et pendant l'hydratation : l'instantané
 * serveur est constant.
 */
export function useFlagEmoji(): boolean {
  return useSyncExternalStore(noSubscription, snapshot, () => false);
}
