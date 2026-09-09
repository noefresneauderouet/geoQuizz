import type { NextConfig } from 'next';

/**
 * GeoLearn est une application installable, pas un site servi.
 *
 * `output: 'export'` produit des fichiers statiques dans out/ : aucun serveur
 * Node à faire tourner, aucun coût d'hébergement, et surtout un jeu de
 * fichiers que le service worker peut précacher en entier — c'est ce qui rend
 * l'app jouable hors ligne une fois ajoutée à l'écran d'accueil.
 */
const nextConfig: NextConfig = {
  output: 'export',

  /*
   * L'optimiseur d'images de Next a besoin d'un serveur ; en export statique
   * il faut le désactiver explicitement. Les seules images de l'app sont les
   * icônes (déjà aux bonnes tailles) et les drapeaux distants, dont le cache
   * est géré par le service worker.
   */
  images: { unoptimized: true },

  /*
   * `out/profil.html` plutôt que `out/profil/index.html` : les URL restent
   * sans extension côté navigateur, et le service worker n'a qu'une seule
   * convention à connaître pour retrouver une page hors ligne.
   */
  trailingSlash: false,
};

export default nextConfig;
