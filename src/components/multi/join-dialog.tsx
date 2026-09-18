'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent, type MouseEvent } from 'react';

import { joinPath, parseRoomCode } from '@/lib/room';

import styles from './join-dialog.module.css';

/**
 * Rejoindre une partie dont on a le code.
 *
 * Le lien partagé suffit à entrer, mais il faut pouvoir le recevoir : à
 * l'oral, ou d'un téléphone à l'autre, il ne reste que les cinq caractères
 * affichés dans la salle. D'où cette boîte, ouverte depuis l'accueil.
 *
 * `<dialog>` plutôt qu'un panneau maison : le navigateur se charge du fond
 * assombri, de la fermeture par Échap et du piège à focus, et le HTML exporté
 * la contient déjà, masquée, sans rien afficher avant l'appui.
 */
export function JoinDialog() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [rejected, setRejected] = useState(false);

  const open = () => {
    setCode('');
    setRejected(false);
    dialog.current?.showModal();
    input.current?.focus();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseRoomCode(code);
    if (!parsed) {
      setRejected(true);
      return;
    }
    dialog.current?.close();
    router.push(joinPath(parsed));
  };

  /* La boîte occupe tout l'écran, son contenu non : un clic qui l'atteint
     elle-même est un clic à côté, donc une fermeture. */
  const clickOutside = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialog.current) dialog.current?.close();
  };

  return (
    <>
      <button type="button" className={styles.trigger} onClick={open}>
        <span aria-hidden="true">🔑</span> Rejoindre une partie
      </button>

      <dialog ref={dialog} className={styles.dialog} onClick={clickOutside}>
        <form className={styles.form} onSubmit={submit}>
          <h2 className={styles.title}>Rejoindre une partie</h2>
          <p className={styles.help}>
            Le code s&apos;affiche dans la salle d&apos;attente de celui qui a créé la partie.
          </p>

          <input
            ref={input}
            className={styles.code}
            value={code}
            /* Saisi en minuscules ou collé avec le lien entier : `parseRoomCode`
               s'en arrange, mais le champ montre déjà la forme attendue. */
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setRejected(false);
            }}
            aria-label="Code de la partie"
            aria-invalid={rejected}
            aria-describedby={rejected ? 'join-error' : undefined}
            placeholder="K7M2P"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            required
          />

          {rejected ? (
            <p id="join-error" className={styles.error} role="alert">
              Ce code n&apos;est pas valable. Il fait cinq caractères, comme K7M2P.
            </p>
          ) : null}

          <button type="submit" className={styles.primary}>
            Entrer dans la salle
          </button>
          <button type="button" className={styles.ghost} onClick={() => dialog.current?.close()}>
            Annuler
          </button>
        </form>
      </dialog>
    </>
  );
}
