'use client';

/**
 * Tout ce qui fait de GeoQuizz une application installable.
 *
 * Trois choses, indépendantes :
 *   - `useInstallPrompt` : proposer l'ajout à l'écran d'accueil ;
 *   - `useServiceWorker` : enregistrer le worker et signaler une mise à jour ;
 *   - `useOnline`        : savoir si le réseau répond.
 *
 * L'état du navigateur (réseau, invite d'installation) est lu par
 * `useSyncExternalStore` plutôt que recopié dans un `useState` : c'est un
 * état extérieur à React, et le rendu statique s'exécute sous Node, où
 * `window` n'existe pas. Chaque store fournit donc un instantané serveur
 * neutre, ce qui garantit une hydratation sans écart.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { getItem, setItem } from '@/lib/storage';

/** Non typé par TypeScript : la spec n'est implémentée que par Chromium. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

declare global {
  interface Window {
    /**
     * `beforeinstallprompt` se déclenche souvent avant l'hydratation. Un
     * écouteur posé dans le <head> (voir src/app/layout.tsx) met l'événement
     * de côté ici ; le store le récupère au premier abonnement.
     */
    __geoquizzInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

const INSTALLABLE_EVENT = 'geoquizz:installable';
const DISMISSED_KEY = 'geolearn.install.dismissed.v1';

/* ------------------------------------------------------------------ */
/* Installation                                                        */
/* ------------------------------------------------------------------ */

/** L'app tourne-t-elle déjà dans sa propre fenêtre, hors navigateur ? */
function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    // Safari iOS n'implémente pas display-mode et expose ce drapeau non standard.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

/**
 * iOS n'expose aucune API d'installation : Safari n'y ajoute une app que
 * par « Partager › Sur l'écran d'accueil ». On ne peut donc que l'expliquer.
 */
function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return iOS && webkit;
}

type InstallSnapshot = {
  prompt: BeforeInstallPromptEvent | null;
  /** Refusée, ou déjà installée : plus rien à proposer. */
  silenced: boolean;
  /** Pas d'API d'installation, mais le geste existe (iOS). */
  manual: boolean;
};

/** Instantané serveur, et point de départ avant le premier abonnement. */
const IDLE: InstallSnapshot = { prompt: null, silenced: true, manual: false };

let installSnapshot: InstallSnapshot = IDLE;
const installListeners = new Set<() => void>();
let installStarted = false;

function updateInstall(patch: Partial<InstallSnapshot>) {
  installSnapshot = { ...installSnapshot, ...patch };
  installListeners.forEach((listener) => listener());
}

const onInstallable = () => updateInstall({ prompt: window.__geoquizzInstallPrompt ?? null });

const onInstalled = () => {
  window.__geoquizzInstallPrompt = null;
  updateInstall({ prompt: null, silenced: true });
};

function subscribeInstall(listener: () => void): () => void {
  installListeners.add(listener);

  /*
   * Le premier abonné amorce le store. React relit l'instantané juste après
   * s'être abonné : la lecture faite ici est donc bien prise en compte.
   */
  if (!installStarted) {
    installStarted = true;
    installSnapshot = {
      prompt: window.__geoquizzInstallPrompt ?? null,
      silenced: isStandalone() || getItem(DISMISSED_KEY) !== null,
      manual: isIosSafari(),
    };
    window.addEventListener(INSTALLABLE_EVENT, onInstallable);
    window.addEventListener('appinstalled', onInstalled);
  }

  return () => {
    installListeners.delete(listener);
  };
}

const getInstallSnapshot = () => installSnapshot;
const getInstallServerSnapshot = () => IDLE;

export type InstallState = {
  /** Le navigateur nous a donné un vrai bouton d'installation. */
  canPrompt: boolean;
  /** Pas de bouton possible, mais on peut décrire le geste (iOS). */
  needsManualSteps: boolean;
  install: () => Promise<void>;
  dismiss: () => void;
};

async function runInstall(): Promise<void> {
  const event = installSnapshot.prompt;
  if (!event) return;

  await event.prompt();
  const { outcome } = await event.userChoice;

  // Un événement `beforeinstallprompt` ne se rejoue pas : consommé, il est
  // perdu. On le retire des deux côtés pour ne pas laisser un bouton mort.
  window.__geoquizzInstallPrompt = null;
  updateInstall({ prompt: null, silenced: outcome === 'accepted' });
}

function dismissInstall(): void {
  setItem(DISMISSED_KEY, '1');
  updateInstall({ silenced: true });
}

/**
 * Invite à installer l'app.
 *
 * Elle ne dit rien tant que le navigateur n'a pas confirmé que
 * l'installation est possible, et se tait définitivement une fois refusée :
 * une bannière qui revient à chaque visite se fait fermer sans être lue.
 */
export function useInstallPrompt(): InstallState {
  const snapshot = useSyncExternalStore(
    subscribeInstall,
    getInstallSnapshot,
    getInstallServerSnapshot
  );

  return {
    canPrompt: !snapshot.silenced && snapshot.prompt !== null,
    needsManualSteps: !snapshot.silenced && snapshot.prompt === null && snapshot.manual,
    install: runInstall,
    dismiss: dismissInstall,
  };
}

/* ------------------------------------------------------------------ */
/* Service worker                                                      */
/* ------------------------------------------------------------------ */

export type UpdateState = {
  /** Une version plus récente est installée et attend d'être activée. */
  ready: boolean;
  /** Active la nouvelle version et recharge la page. */
  apply: () => void;
};

/**
 * Enregistre le service worker et surveille les mises à jour.
 *
 * Le worker s'installe en arrière-plan mais reste en attente : l'écraser
 * pendant une partie rechargerait la page au milieu d'une question. On
 * signale la mise à jour, et c'est l'utilisateur qui décide du moment.
 */
export function useServiceWorker(): UpdateState {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        if (cancelled) return;

        // Une version peut déjà attendre depuis la visite précédente.
        if (registration.waiting && navigator.serviceWorker.controller) {
          setWaiting(registration.waiting);
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            // Sans `controller`, c'est la toute première installation :
            // rien à proposer, l'utilisateur voit déjà la bonne version.
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              setWaiting(installing);
            }
          });
        });
      })
      .catch(() => {
        // Pas de worker : l'app fonctionne, simplement sans hors-ligne.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const apply = useCallback(() => {
    if (!waiting) return;
    // Le rechargement est déclenché par `controllerchange`, une fois le
    // nouveau worker réellement aux commandes — recharger tout de suite
    // reservirait l'ancienne version depuis le cache.
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
      once: true,
    });
    waiting.postMessage({ type: 'SKIP_WAITING' });
  }, [waiting]);

  return { ready: waiting !== null, apply };
}

/* ------------------------------------------------------------------ */
/* Réseau                                                              */
/* ------------------------------------------------------------------ */

function subscribeOnline(listener: () => void): () => void {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

/**
 * `navigator.onLine` ne prouve pas qu'Internet répond, seulement qu'une
 * interface est active. Cela suffit ici : le seul appel réseau de l'app est
 * le chargement des drapeaux, et l'emoji prend le relais en cas d'échec.
 *
 * On suppose l'app en ligne côté serveur : afficher « hors ligne » le temps
 * d'une hydratation serait un clignotement pour rien.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );
}
