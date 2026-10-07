import type { MetadataRoute } from 'next';

import { LEGAL_PAGES, SITE_URL } from '@/constants/site';

/**
 * Le sitemap, généré par Next sous /sitemap.xml et annoncé par robots.txt.
 *
 * Sans lui, Google ne découvre les pages qu'en suivant les liens de l'accueil,
 * et il repasse rarement sur un site neuf.
 *
 * /quiz et /salle n'y sont pas : elles ne servent qu'avec les réglages d'une
 * partie (zone, mode, code de salle), et leur HTML est vide sans eux. Pas de
 * date de modification non plus : la seule connue serait celle de la
 * construction, qui changerait à chaque déploiement sans que la page change.
 */
export const dynamic = 'force-static';

const PAGES = [
  '/',
  '/classement',
  '/profil',
  '/compte',
  ...LEGAL_PAGES.map((page) => page.href),
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((path) => ({ url: `${SITE_URL}${path}` }));
}
