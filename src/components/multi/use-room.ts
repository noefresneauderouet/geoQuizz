'use client';

import { useEffect, useRef, useState } from 'react';

import {
  joinRoom,
  listPublicRoom,
  type FinishMessage,
  type KnownPlayer,
  type PlayerState,
  type ProgressMessage,
  type PublicListing,
  type ResetMessage,
  type RoomConnection,
  type RoomSettings,
  type StartMessage,
} from '@/lib/room';

export type RoomEvents = {
  onStart: (message: StartMessage) => void;
  onFinish: (message: FinishMessage) => void;
  onReset: (message: ResetMessage) => void;
};

export type RoomStatus = 'connecting' | 'connected' | 'error';

/**
 * La salle vue depuis React.
 *
 * Les joueurs qui partent ne sont pas oubliés : ils restent listés, marqués
 * déconnectés, avec leur dernière avancée. Un joueur qui perd le réseau en
 * pleine partie garde ainsi sa place au classement.
 *
 * `self` est republié à chaque changement — il ne change que deux ou trois
 * fois par partie. `events` peut changer à chaque rendu : on lit toujours la
 * dernière version, sans se reconnecter.
 */
export function useRoom(code: string, self: PlayerState, events: RoomEvents) {
  const [status, setStatus] = useState<RoomStatus>('connecting');
  const [players, setPlayers] = useState<Record<string, KnownPlayer>>({});
  /** Dernière avancée reçue de chaque autre joueur, avec le numéro de sa partie. */
  const [scores, setScores] = useState<Record<string, ProgressMessage>>({});
  const connection = useRef<RoomConnection | null>(null);
  const eventsRef = useRef(events);
  const selfRef = useRef(self);

  useEffect(() => {
    eventsRef.current = events;
    selfRef.current = self;
  });

  useEffect(() => {
    const room = joinRoom(code, selfRef.current, {
      onPlayers: (present) =>
        setPlayers((known) => {
          const next: Record<string, KnownPlayer> = {};
          for (const [id, player] of Object.entries(known)) {
            next[id] = { ...player, connected: false };
          }
          for (const player of present) next[player.id] = { ...player, connected: true };
          return next;
        }),
      onStart: (message) => eventsRef.current.onStart(message),
      onFinish: (message) => eventsRef.current.onFinish(message),
      onReset: (message) => eventsRef.current.onReset(message),
      onProgress: (message) =>
        setScores((known) => {
          const previous = known[message.playerId];
          // Les messages peuvent se croiser : on ne recule jamais dans une partie.
          if (previous && previous.game === message.game && previous.found > message.found) {
            return known;
          }
          return { ...known, [message.playerId]: message };
        }),
      onStatus: setStatus,
    });
    connection.current = room;
    return () => {
      room.leave();
      connection.current = null;
    };
  }, [code]);

  useEffect(() => {
    connection.current?.publish(self);
  }, [self]);

  return {
    status,
    players: Object.values(players),
    scores,
    start: (message: StartMessage) => connection.current?.start(message),
    finish: (message: FinishMessage) => connection.current?.finish(message),
    reset: (message: ResetMessage) => connection.current?.reset(message),
    progress: (message: ProgressMessage) => connection.current?.progress(message),
  };
}

/**
 * Annonce une salle publique dans le hall. `code` est `null` pour une salle
 * privée, ou pour qui n'en est pas l'hôte ; `settings` est `null` tant qu'on
 * ne peut pas y entrer.
 *
 * Des réglages changés mettent l'annonce à jour ; seul le code relance la
 * connexion au hall.
 */
export function usePublicListing(code: string | null, settings: RoomSettings | null) {
  const listing = useRef<PublicListing | null>(null);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
    listing.current?.show(settings);
  }, [settings]);

  useEffect(() => {
    if (!code) return;
    const current = listPublicRoom(code);
    current.show(settingsRef.current);
    listing.current = current;
    return () => {
      current.stop();
      listing.current = null;
    };
  }, [code]);
}
