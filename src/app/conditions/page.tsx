import type { Metadata } from 'next';
import Link from 'next/link';

import { ContactEmail, LegalPage, Section } from '@/components/legal/legal-page';

export const metadata: Metadata = {
  title: 'Conditions d’utilisation',
  description: 'Les règles du jeu GeoQuizz : compte, pseudo, classement et fair-play.',
};

export default function ConditionsPage() {
  return (
    <LegalPage title="Conditions d’utilisation" path="/conditions">
      <p>
        Ces conditions s’appliquent à tous ceux qui jouent sur GeoQuizz. Jouer, c’est les
        accepter ; créer un compte aussi.
      </p>

      <Section title="Le jeu">
        <p>
          GeoQuizz est un jeu gratuit pour réviser les drapeaux, les capitales, les pays et les
          régions du monde. Il se joue sans compte, et sans réseau une fois le site chargé. Il est
          proposé tel quel : il peut changer, être interrompu ou s’arrêter, sans préavis. Le
          classement et les parties à plusieurs demandent une connexion et dépendent de services
          extérieurs.
        </p>
      </Section>

      <Section title="Ton compte">
        <ul>
          <li>Un compte sert à entrer au classement. Il demande une adresse e-mail valide.</li>
          <li>Ton mot de passe est personnel : ne le donne à personne.</li>
          <li>Si tu as moins de 15 ans, demande l’accord d’un parent avant de créer un compte.</li>
          <li>
            Tu peux supprimer ton compte quand tu veux, depuis l’écran « Mon compte » : ton pseudo et
            tes temps disparaissent avec lui.
          </li>
        </ul>
      </Section>

      <Section title="Ton pseudo">
        <p>
          Ton pseudo est visible de tous, au classement et dans les salles. Il ne doit pas être
          injurieux, haineux, sexuel ou publicitaire, ni reprendre le nom de quelqu’un d’autre. Un
          pseudo qui ne respecte pas ces règles peut être retiré du classement, avec le compte qui le
          porte.
        </p>
      </Section>

      <Section title="Le classement et le fair-play">
        <p>
          Le classement ne retient que les manches trouvées en entier, chronométrées par le serveur.
          Il est interdit d’y entrer autrement qu’en jouant soi-même : script, robot, outil qui
          répond à ta place, requêtes modifiées ou faille exploitée.
        </p>
        <p>
          Un joueur qui triche est exclu du classement : ses temps sont effacés et il ne peut plus
          en envoyer. Si tu trouves une faille, signale-la à <ContactEmail /> nous pourrions ajouter un titre spécial a ton compte sur les classement en ligne.
        </p>
      </Section>

      <Section title="Les parties à plusieurs">
        <p>
          Une salle réunit les joueurs qui en ont le code ou le lien ; une salle publique, n’importe
          qui. Reste correct avec les autres joueurs : les règles du pseudo s’y appliquent aussi.
        </p>
      </Section>

      <Section title="Responsabilité">
        <p>
          Les questions sont préparées avec soin, mais une erreur reste possible : signale-la à{' '}
          <ContactEmail />. Ta progression enregistrée sur l’appareil peut se perdre si le navigateur
          efface ses données ; l’éditeur ne peut pas la récupérer.
        </p>
      </Section>

      <Section title="Données personnelles">
        <p>
          Ce que le site enregistre et tes droits sont décrits dans la{' '}
          <Link href="/confidentialite">politique de confidentialité</Link>. L’éditeur et les
          hébergeurs sont présentés dans les <Link href="/mentions-legales">mentions légales</Link>.
        </p>
      </Section>

      <Section title="Changements et droit applicable">
        <p>
          Ces conditions peuvent évoluer ; la date en haut de la page indique leur dernière version.
          Elles sont soumises au droit français. Pour toute question, écris à <ContactEmail />.
        </p>
      </Section>
    </LegalPage>
  );
}
