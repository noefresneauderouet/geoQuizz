import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

/*
 * eslint-config-next 16 publie directement des configurations « plates » :
 * on les étale, sans passer par le pont FlatCompat de l'ancien format.
 *
 * scripts/ est écarté : ces fichiers tournent sous Node ou dans un service
 * worker, deux environnements que les règles de Next ne décrivent pas.
 */
const config = [
  { ignores: ['.next/**', 'out/**', 'node_modules/**', 'scripts/**'] },
  ...coreWebVitals,
  ...typescript,
];

export default config;
