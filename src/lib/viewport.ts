/**
 * Zone réellement visible de la fenêtre, clavier virtuel déduit.
 *
 * Sur téléphone, le clavier ne réduit ni `100dvh` ni la fenêtre de mise en
 * page : il se pose par-dessus, et le navigateur décale la page pour garder
 * le champ en vue — ce qui pousse le haut de l'écran hors du cadre. Seule
 * l'API VisualViewport décrit ce qui reste visible. On la recopie dans des
 * variables CSS de la racine, que l'écran de jeu suit pour tenir entier
 * au-dessus du clavier :
 *
 *   - `--visible-top` et `--visible-height` : position et hauteur de la zone ;
 *   - `--visible-bottom-inset` : `0px` quand le clavier est ouvert, puisqu'il
 *     recouvre la zone système du bas (la barre d'accueil de l'iPhone).
 *
 * Sans l'API, rien n'est écrit, et les valeurs de repli du CSS s'appliquent.
 */

/** En deçà, un écart de hauteur vient des barres du navigateur, pas d'un clavier. */
const KEYBOARD_MIN_HEIGHT = 150;

const VARIABLES = ['--visible-top', '--visible-height', '--visible-bottom-inset'];

/** Suit la zone visible ; renvoie la fonction qui cesse de la suivre. */
export function followVisibleViewport(): () => void {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  const root = document.documentElement;

  const clear = () => {
    for (const name of VARIABLES) root.style.removeProperty(name);
  };

  const sync = () => {
    // Un zoom au doigt rétrécit aussi la zone visible. L'écran garde alors sa
    // taille normale, sans quoi il n'y aurait plus rien à agrandir.
    if (viewport.scale > 1.01) {
      clear();
      return;
    }
    root.style.setProperty('--visible-top', `${viewport.offsetTop}px`);
    root.style.setProperty('--visible-height', `${viewport.height}px`);
    if (root.clientHeight - viewport.height > KEYBOARD_MIN_HEIGHT) {
      root.style.setProperty('--visible-bottom-inset', '0px');
    } else {
      root.style.removeProperty('--visible-bottom-inset');
    }
  };

  sync();
  // `scroll` : sur iOS, la zone visible glisse dans la page quand le clavier
  // s'ouvre ou qu'on fait défiler ; l'écran doit la suivre.
  viewport.addEventListener('resize', sync);
  viewport.addEventListener('scroll', sync);
  return () => {
    viewport.removeEventListener('resize', sync);
    viewport.removeEventListener('scroll', sync);
    clear();
  };
}
