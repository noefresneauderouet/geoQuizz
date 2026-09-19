import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Page introuvable',
};

/**
 * Le service worker sert cette page quand une adresse inconnue est demandée
 * hors ligne : mieux vaut une sortie vers l'accueil que le message d'erreur
 * du navigateur.
 */
export default function NotFound() {
  return (
    <main
      className="screen"
      style={{ minHeight: '100dvh', justifyContent: 'center', alignItems: 'center' }}>
      <p style={{ fontSize: 56, lineHeight: 1 }} aria-hidden="true">
        🧭
      </p>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)' }}>Page introuvable</h1>
      <p style={{ color: 'var(--ink-soft)', fontWeight: 600, textAlign: 'center' }}>
        Cette adresse ne mène nulle part.
      </p>
      <Link
        href="/"
        style={{
          marginTop: 'var(--space-2)',
          padding: '12px var(--space-4)',
          borderRadius: 'var(--radius-pill)',
          backgroundColor: 'var(--green)',
          color: 'var(--on-color)',
          fontWeight: 800,
        }}>
        Retour à l’accueil
      </Link>
    </main>
  );
}
