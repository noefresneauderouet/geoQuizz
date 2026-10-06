/**
 * Adresse publique du site, celle que Google explore.
 *
 * Le sitemap et robots.txt la veulent en entier : ils se lisent hors de toute
 * page, et une adresse relative n'y a pas de sens.
 */
export const SITE_URL = 'https://geoquizz.games';

/**
 * L'adresse de contact des pages légales : mentions légales, demandes sur les
 * données personnelles, signalement d'un pseudo. Celle de l'éditeur, qu'il a
 * choisi de publier ; elle doit recevoir le courrier pour de bon : la loi
 * demande qu'on puisse joindre l'éditeur.
 */
export const CONTACT_EMAIL = 'noe.fresneau@gmail.com';

/** Les pages légales, dans l'ordre où le pied de page les cite. */
export const LEGAL_PAGES = [
  { href: '/mentions-legales', label: 'Mentions légales' },
  { href: '/confidentialite', label: 'Confidentialité' },
  { href: '/conditions', label: 'Conditions d’utilisation' },
] as const;

/** Date de la dernière modification du texte des pages légales. */
export const LEGAL_UPDATED = '6 octobre 2026';
