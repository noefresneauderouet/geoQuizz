import type { Metadata, Viewport } from 'next';

import { AppTabs } from '@/components/app-tabs';
import { InstallBanner } from '@/components/pwa/install-banner';
import { StatusPills } from '@/components/pwa/status-pills';
import { BACKGROUND_COLOR, paletteVariables, THEME_COLOR } from '@/constants/theme';

import './globals.css';

export const metadata: Metadata = {
  /* `%s` est remplacé par le titre de chaque page ; la racine garde `default`. */
  title: {
    default: 'GeoLearn — réviser la géographie',
    template: '%s — GeoLearn',
  },
  description:
    'Révise les drapeaux, les capitales et les pays du monde. 194 pays, six zones, jouable hors ligne.',
  applicationName: 'GeoLearn',
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
    title: 'GeoLearn',
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        {/* La palette part dans le HTML statique : les couleurs s'appliquent
            dès la première image, sans attendre le JavaScript. */}
        <style dangerouslySetInnerHTML={{ __html: paletteVariables() }} />
        <meta name="background-color" content={BACKGROUND_COLOR} />
        <script dangerouslySetInnerHTML={{ __html: catchInstallPrompt }} />
      </head>
      <body>
        {children}

        {/* Couches flottantes, communes à tous les écrans. */}
        <StatusPills />
        <InstallBanner />
        <AppTabs />
      </body>
    </html>
  );
}
