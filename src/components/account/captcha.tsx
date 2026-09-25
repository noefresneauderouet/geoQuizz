'use client';

import { useEffect, useRef } from 'react';

import styles from './account.module.css';

/**
 * Le CAPTCHA de l'inscription, de la connexion et du renvoi du lien :
 * Cloudflare Turnstile, que Supabase Auth sait vérifier.
 *
 * Il ne s'active qu'avec `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (dans .env.local et
 * dans Vercel), et doit l'être en même temps côté Supabase (Authentication >
 * Attack Protection, avec la clé secrète). Sans la clé publique, rien ne
 * s'affiche et les formulaires marchent comme avant.
 */
export const CAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

type Turnstile = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      language: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ) => string;
  remove: (id: string) => void;
};

let script: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
  script ??= new Promise<Turnstile>((resolve, reject) => {
    const element = document.createElement('script');
    element.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    element.async = true;
    element.onload = () => {
      const turnstile = (globalThis as { turnstile?: Turnstile }).turnstile;
      if (turnstile) resolve(turnstile);
      else reject(new Error('Turnstile absent'));
    };
    element.onerror = () => {
      script = null;
      reject(new Error('Turnstile injoignable'));
    };
    document.head.append(element);
  });
  return script;
}

type Props = {
  /** La réponse à envoyer avec le formulaire, ou `null` tant qu'il n'y en a pas. */
  onToken: (token: string | null) => void;
  /**
   * Une réponse ne sert qu'une fois : changer cette valeur après chaque essai
   * en redemande une.
   */
  attempt: number;
};

export function Captcha({ onToken, attempt }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const report = useRef(onToken);
  useEffect(() => {
    report.current = onToken;
  });

  useEffect(() => {
    if (!CAPTCHA_SITE_KEY) return;
    let id: string | null = null;
    let gone = false;
    report.current(null);
    loadTurnstile()
      .then((turnstile) => {
        if (gone || !box.current) return;
        id = turnstile.render(box.current, {
          sitekey: CAPTCHA_SITE_KEY,
          language: 'fr',
          callback: (token) => report.current(token),
          'expired-callback': () => report.current(null),
          'error-callback': () => report.current(null),
        });
      })
      .catch(() => report.current(null));
    return () => {
      gone = true;
      if (id !== null) void loadTurnstile().then((turnstile) => turnstile.remove(id as string));
    };
  }, [attempt]);

  return CAPTCHA_SITE_KEY ? <div ref={box} className={styles.captcha} /> : null;
}
