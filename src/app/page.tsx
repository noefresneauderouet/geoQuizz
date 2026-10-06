import { LegalLinks } from '@/components/legal/legal-links';
import { ZonePicker } from '@/components/zone-picker';

/*
 * L'accueil garde le titre par défaut du layout : c'est la page racine, et
 * « GeoLearn — réviser la géographie » y est déjà la bonne formule.
 */
export default function AccueilPage() {
  return (
    <main className="screen">
      <ZonePicker />
      <LegalLinks />
    </main>
  );
}
