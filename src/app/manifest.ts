import type { MetadataRoute } from 'next';

import { BACKGROUND_COLOR, THEME_COLOR } from '@/constants/theme';

/**
 * Le manifeste, généré par Next sous /manifest.webmanifest.
 *
 * L'écrire en TypeScript plutôt qu'en JSON statique a un intérêt concret :
 * les couleurs viennent de la palette du thème, donc elles ne peuvent pas
 * diverger de celles de l'application.
 */
export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  const icon = (file: string, size: number, purpose: 'any' | 'maskable') => ({
    src: `/icons/${file}`,
    sizes: `${size}x${size}`,
    type: 'image/png',
    purpose,
  });

  return {
    id: '/',
    name: 'GeoQuizz — Jeux de géographie',
    short_name: 'GeoQuizz',
    description:
      'Défis tes amis sur les drapeaux, les capitales et les pays du monde, et les régions de certains pays. Défie tes amis et grimpe au classement, ou Joue seul, même hors ligne.',
    lang: 'fr',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    /* `minimal-ui` en repli : un navigateur qui ignore `standalone` garde au
       moins les commandes de navigation plutôt que de rouvrir un onglet. */
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: BACKGROUND_COLOR,
    theme_color: THEME_COLOR,
    categories: ['education', 'games'],
    prefer_related_applications: false,
    icons: [
      icon('icon-192.png', 192, 'any'),
      icon('icon-512.png', 512, 'any'),
      icon('icon-192-maskable.png', 192, 'maskable'),
      icon('icon-512-maskable.png', 512, 'maskable'),
    ],
    /* Accès direct depuis l'icône de l'app, appui long. */
    shortcuts: [
      {
        name: 'Drapeaux du monde',
        short_name: 'Drapeaux',
        url: '/quiz?category=monde&mode=drapeau',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Capitales du monde',
        short_name: 'Capitales',
        url: '/quiz?category=monde&mode=capitale',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Classement',
        short_name: 'Classement',
        url: '/classement',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Ma progression',
        short_name: 'Profil',
        url: '/profil',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  };
}
