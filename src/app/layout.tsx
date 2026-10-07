import type { Metadata, Viewport } from 'next';

import { AppTabs } from '@/components/app-tabs';
import { InstallBanner } from '@/components/pwa/install-banner';
import { StatusPills } from '@/components/pwa/status-pills';
import { BACKGROUND_COLOR, paletteVariables, THEME_COLOR, THEME_KEY } from '@/constants/theme';
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';

export const metadata: Metadata = {
  /* `%s` est remplacé par le titre de chaque page ; la racine garde `default`. */
  title: {
    default: 'GeoQuizz — Jeux de géographie',
    template: '%s — GeoQuizz',
  },
  description:
    'Défis tes amis sur les drapeaux, les capitales et les pays du monde, et les régions de certains pays. Défie tes amis et grimpe au classement, ou Joue seul, même hors ligne.',
  applicationName: 'GeoQuizz',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-48.png', sizes: '48x48', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  /* Safari iOS ignore le manifeste : plein écran, titre et barre d'état de
     l'app installée se règlent uniquement par ces balises. */
  appleWebApp: {
    capable: true,
    title: 'GeoQuizz',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  /* Étend la page sous les encoches et rend env(safe-area-inset-*) exploitable. */
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
  /* Le zoom n'est volontairement pas bloqué. */
  userScalable: true,
};

/**
 * `beforeinstallprompt` part très tôt, parfois avant l'hydratation. Non
 * capturé, il est perdu et l'app ne peut plus proposer l'installation de la
 * visite. Ce script, inscrit dans le HTML, le met de côté ; le hook
 * `useInstallPrompt` le récupère ensuite (voir src/lib/pwa.ts).
 */
const catchInstallPrompt = `
window.__geolearnInstallPrompt = null;
window.addEventListener('beforeinstallprompt', function (event) {
  event.preventDefault();
  window.__geolearnInstallPrompt = event;
  window.dispatchEvent(new Event('geolearn:installable'));
});
`;

/**
 * Le thème imposé depuis le profil, posé sur `<html>` avant la première image.
 * Attendre l'hydratation ferait clignoter l'écran du clair au sombre. Sans
 * réglage, pas d'attribut : la feuille suit l'appareil.
 */
const applyTheme = `
try {
  var theme = localStorage.getItem('${THEME_KEY}');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch (error) {}
`;

/**
 * La traduction du navigateur (Chrome, Edge…) remplace les textes de la page
 * par les siens. React garde l'ancien nœud texte, et dès qu'il veut le retirer
 * ou insérer quelque chose devant, le DOM lève une erreur qui vide l'écran.
 * On laisse alors passer l'opération plutôt que de planter : au pire, un texte
 * reste figé jusqu'à l'écran suivant, ou un élément s'ajoute en fin de bloc
 * au lieu de sa place exacte. Un texte qui change en jeu s'écrit donc
 * d'un seul tenant (`{`${n}/${total}`}`), que React remplace en entier.
 */
const surviveTranslation = `
(function () {
  var remove = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    if (child.parentNode !== this) return child;
    return remove.apply(this, arguments);
  };
  var insert = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (node, reference) {
    if (reference && reference.parentNode !== this) return insert.call(this, node, null);
    return insert.apply(this, arguments);
  };
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `data-theme` est posé par `applyTheme` avant l'hydratation : React ne
    // doit pas le prendre pour un écart avec le HTML construit.
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: applyTheme }} />
        <script dangerouslySetInnerHTML={{ __html: surviveTranslation }} />
        {/* La palette part dans le HTML statique : les couleurs s'appliquent
            dès la première image, sans attendre le JavaScript. */}
        <style dangerouslySetInnerHTML={{ __html: paletteVariables() }} />
        <meta name="background-color" content={BACKGROUND_COLOR} />
        <script dangerouslySetInnerHTML={{ __html: catchInstallPrompt }} />
      </head>
      <body>
        {children}

        {/* Couches flottantes, communes à tous les écrans. */}
        <Analytics/>
        <SpeedInsights />
        <StatusPills />
        <InstallBanner />
        <AppTabs />
      </body>
    </html>
  );
}
