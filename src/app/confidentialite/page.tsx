import type { Metadata } from 'next';
import Link from 'next/link';

import { ContactEmail, External, LegalPage, Section } from '@/components/legal/legal-page';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description:
    'Ce que GeoQuizz enregistre, sur ton appareil et avec un compte, à qui il le confie, et tes droits.',
};

/**
 * Chaque affirmation de cette page se vérifie dans le code : stockage local
 * (src/lib/storage.ts et ses clés), schéma et durées (supabase/migrations/),
 * services appelés par le navigateur (la CSP de vercel.json). Quand l'un
 * d'eux change, cette page change avec lui.
 */
export default function ConfidentialitePage() {
  return (
    <LegalPage title="Politique de confidentialité" path="/confidentialite">
      <p>
        GeoQuizz se joue sans compte. Sans compte, ta progression reste sur ton appareil. Un compte
        ne sert qu’à entrer au classement : cette page dit ce qu’il enregistre, ce que deviennent
        les parties à plusieurs, et comment tout effacer.
      </p>

      <Section title="Qui est responsable">
        <p>
          L’éditeur du site, présenté dans les{' '}
          <Link href="/mentions-legales">mentions légales</Link>, joignable à <ContactEmail /> pour
          toute question sur tes données.
        </p>
      </Section>

      <Section title="Sur ton appareil">
        <p>
          Le site enregistre dans le stockage de ton navigateur ce qu’il lui faut pour fonctionner :
        </p>
        <ul>
          <li>ta progression et tes records, tes derniers réglages de partie et ton thème ;</li>
          <li>
            pour les parties à plusieurs, ton pseudo et un identifiant tiré au hasard, qui te
            reconnaît d’une partie à l’autre ;
          </li>
          <li>le dernier classement consulté, pour l’afficher hors ligne ;</li>
          <li>si tu es connecté, ta session ;</li>
          <li>une copie du site et des drapeaux, pour jouer sans réseau.</li>
        </ul>
        <p>
          Rien de cela n’est envoyé ailleurs : tes records faits sur l’appareil ne partent jamais au
          classement. GeoQuizz ne dépose <strong>aucun cookie</strong> et n’utilise aucun traceur
          publicitaire. Ce stockage sert uniquement au jeu que tu demandes, c’est pourquoi aucun
          bandeau ne te demande ton accord.
        </p>
        <p>
          Ta progression s’efface par « Réinitialiser ma progression », sur l’écran Profil ; tout le
          reste, en effaçant les données du site dans les réglages de ton navigateur.
        </p>
      </Section>

      <Section title="Avec un compte">
        <p>Créer un compte enregistre, chez Supabase :</p>
        <ul>
          <li>
            ton adresse e-mail, et ton mot de passe sous une forme illisible, même pour l’éditeur ;
          </li>
          <li>
            ton <strong>pseudo</strong>, public : il s’affiche au classement à côté de tes temps ;
          </li>
          <li>
            tes meilleurs temps, par zone, mode et longueur de manche, avec leur date ; pendant une
            manche, son heure de départ, pour que le serveur la chronomètre lui-même ;
          </li>
          <li>
            les dates de création du compte et de tes connexions, ainsi que l’adresse IP et le
            navigateur utilisés pour te connecter, qui servent à la sécurité des comptes.
          </li>
        </ul>
        <p>
          Si tu utilises « Continuer avec Google », Google nous transmet ton adresse e-mail, ton nom
          et ta photo de profil. Ils restent rangés avec ton compte, mais le site ne les affiche
          jamais : seul le pseudo que tu choisis est public. GeoQuizz ne demande aucun autre accès à
          ton compte Google.
        </p>
        <p>
          Ton adresse sert seulement à te connecter : elle reçoit le lien qui confirme ton compte, et
          rien d’autre. Pas de lettre d’information, pas de publicité.
        </p>
        <p>
          <strong>Pourquoi c’est permis</strong> : le compte, le pseudo et les temps sont le service
          que tu demandes en t’inscrivant (exécution des{' '}
          <Link href="/conditions">conditions d’utilisation</Link>, article 6.1.b du RGPD). Le
          chronométrage par le serveur, les journaux de connexion et l’exclusion des tricheurs
          répondent à un intérêt légitime : un classement honnête et des comptes protégés (article
          6.1.f).
        </p>
      </Section>

      <Section title="Les parties à plusieurs">
        <p>
          Dans une salle, ton pseudo, ton statut (en attente, en jeu, fini) et ton avancée passent
          aux autres joueurs de la salle par Supabase. Rien n’est enregistré dans une base : ces
          messages disparaissent avec la salle. Une salle publique annonce son code et ses réglages
          à ceux qui cherchent une partie, sans les pseudos.
        </p>
      </Section>

      <Section title="Hébergement et mesure d’audience">
        <p>
          Comme tout hébergeur, Vercel reçoit ton adresse IP et le nom de ton navigateur pour
          t’envoyer les pages et protéger le site contre les abus.
        </p>
        <p>
          Le site compte ses visites avec Vercel Web Analytics, <strong>sans cookie</strong> : page
          vue, site d’où tu viens, lieu approximatif (pays, ville), type d’appareil, système et
          navigateur. Ton adresse IP n’est
          pas gardée ; une empreinte de la visite, effacée au bout de 24 heures, évite de compter
          deux fois la même. Vercel Speed Insights mesure de la même façon la vitesse de chargement
          des pages. Ces statistiques ne servent qu’à savoir quelles pages sont utiles et à garder le
          site rapide (intérêt légitime, article 6.1.f du RGPD).
        </p>
        <p>
          Les images des drapeaux viennent de flagcdn.com, qui reçoit donc ton adresse IP, comme tout
          site qui sert une image.
        </p>
      </Section>

      <Section title="Qui reçoit tes données">
        <ul>
          <li>
            <strong>Vercel</strong> (États-Unis) : hébergement du site, mesure d’audience.
          </li>
          <li>
            <strong>Supabase</strong> (Singapour) : comptes, classement, parties à plusieurs.
          </li>
          <li>
            <strong>Resend</strong> (États-Unis) : envoi des e-mails de confirmation de compte.
          </li>
          <li>
            <strong>Google</strong>, seulement si tu te connectes avec ton compte Google, selon sa
            propre <External href="https://policies.google.com/privacy">politique</External>.
          </li>
          <li>
            <strong>Les autres joueurs</strong> : ton pseudo et tes temps au classement, ton pseudo
            et ton avancée dans une salle.
          </li>
        </ul>
        <p>
          Vercel, Supabase et Resend traitent ces données pour le compte de GeoQuizz, et seulement
          pour faire marcher le site. Ils sont établis hors de l’Union européenne : ces transferts
          reposent sur les clauses contractuelles types de la Commission européenne, et pour Vercel
          et Resend sur leur adhésion au cadre de protection des données UE–États-Unis. Rien n’est
          vendu, ni partagé à des fins publicitaires.
        </p>
      </Section>

      <Section title="Combien de temps">
        <ul>
          <li>
            Compte, pseudo et temps : jusqu’à ce que tu supprimes ton compte. La suppression efface
            tout, tout de suite.
          </li>
          <li>Un compte dont l’adresse n’a jamais été confirmée peut être effacé au bout d’un jour.</li>
          <li>
            Une manche en cours : effacée à sa fin, et au plus tard deux heures après son départ.
          </li>
          <li>
            Un joueur exclu pour triche perd ses temps ; son compte garde la marque de l’exclusion
            jusqu’à sa suppression.
          </li>
          <li>
            Les journaux techniques de Vercel et de Supabase : la durée courte que fixent ces
            services.
          </li>
          <li>Les parties à plusieurs : rien n’est gardé.</li>
          <li>Le stockage de ton appareil : jusqu’à ce que tu l’effaces.</li>
        </ul>
      </Section>

      <Section title="Tes droits">
        <p>
          Tu peux consulter tes données, les corriger, les effacer, en limiter l’usage, t’opposer à
          leur traitement et les récupérer dans un format lisible. Pour effacer ton compte, sans
          rien demander à personne : écran Profil, « Mon compte », puis « Supprimer mon compte ».
          Pour tout le reste, changer de pseudo compris, écris à <ContactEmail /> ; la réponse
          arrive sous un mois.
        </p>
        <p>
          Si la réponse ne te satisfait pas, tu peux saisir la CNIL :{' '}
          <External href="https://www.cnil.fr/fr/plaintes">cnil.fr/fr/plaintes</External>.
        </p>
      </Section>

      <Section title="Sécurité">
        <p>
          Le site ne passe que par des connexions chiffrées (HTTPS). Les règles d’accès de la base
          ne laissent personne lire l’adresse e-mail d’un autre joueur, et un temps n’entre au
          classement que si le serveur l’a lui-même chronométré.
        </p>
      </Section>

      <Section title="Changements">
        <p>
          Si le site change ce qu’il enregistre, cette page change avec lui, et sa date en haut
          aussi.
        </p>
      </Section>
    </LegalPage>
  );
}
