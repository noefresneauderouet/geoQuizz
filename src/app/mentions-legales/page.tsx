import type { Metadata } from 'next';
import Link from 'next/link';

import { ContactEmail, External, LegalPage, Section } from '@/components/legal/legal-page';
import { SITE_URL } from '@/constants/site';

export const metadata: Metadata = {
  title: 'Mentions légales',
  description: 'Éditeur, hébergeurs et crédits de GeoQuizz.',
};

/**
 * L'éditeur est un particulier, sans activité commerciale : la loi pour la
 * confiance dans l'économie numérique (LCEN) lui permet de ne publier que
 * l'hébergeur, à condition de lui avoir donné son identité.
 */
export default function MentionsLegalesPage() {
  return (
    <LegalPage title="Mentions légales" path="/mentions-legales">
      <Section title="Éditeur">
        <p>
          GeoQuizz ({SITE_URL.replace('https://', '')}) est un jeu gratuit, sans publicité, édité par
          un particulier à titre non professionnel. Comme la loi pour la confiance dans l’économie
          numérique le permet dans ce cas, l’éditeur ne publie pas son nom ni son adresse.
        </p>
        <p>
          Responsable de la publication : l’éditeur, joignable à <ContactEmail />.
        </p>
      </Section>

      <Section title="Hébergement">
        <ul>
          <li>
            <strong>Le site</strong> : Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723,
            États-Unis. Téléphone : +1 951 383 6898.{' '}
            <External href="https://vercel.com">vercel.com</External>
          </li>
          <li>
            <strong>Les comptes, le classement et les parties à plusieurs</strong> : Supabase Pte.
            Ltd., Singapour. <External href="https://supabase.com">supabase.com</External>
          </li>
        </ul>
      </Section>

      <Section title="Signaler un contenu">
        <p>
          Les seuls contenus écrits par les joueurs sont leurs pseudos. Pour en signaler un
          (injurieux, qui usurpe une identité…) ou pour toute autre question, écris à{' '}
          <ContactEmail />.
        </p>
      </Section>

      <Section title="Crédits">
        <ul>
          <li>
            Pays et capitales : d’après{' '}
            <External href="https://github.com/mledoze/countries">world-countries</External>{' '}
            (Mohammed Le Doze), sous licence{' '}
            <External href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL</External>.
          </li>
          <li>
            Cartes : <External href="https://www.naturalearthdata.com">Natural Earth</External>{' '}
            (domaine public), dans la version de{' '}
            <External href="https://github.com/visionscarto/world-atlas">Visionscarto</External>{' '}
            pour le monde.
          </li>
          <li>
            Drapeaux : <External href="https://flagpedia.net">Flagpedia</External> (flagcdn.com).
          </li>
        </ul>
        <p>
          Les frontières et les noms suivent ces sources publiques : leur choix ne vaut pas prise de
          position.
        </p>
      </Section>

      <Section title="Données personnelles">
        <p>
          Ce que le site enregistre, et tes droits, sont décrits dans la{' '}
          <Link href="/confidentialite">politique de confidentialité</Link>. L’usage du jeu suit
          les <Link href="/conditions">conditions d’utilisation</Link>.
        </p>
      </Section>
    </LegalPage>
  );
}
