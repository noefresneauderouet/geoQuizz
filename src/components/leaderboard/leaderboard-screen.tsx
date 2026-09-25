'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { ModeSelector } from '@/components/mode-selector';
import { useAccount } from '@/components/use-account';
import { useInBrowser } from '@/components/use-in-browser';
import {
  categoriesFor,
  getCategory,
  getMode,
  type CategoryId,
  type ModeId,
} from '@/constants/categories';
import {
  cachedBoard,
  fetchBoard,
  isFresh,
  TOP_SIZE,
  type BoardKey,
  type BoardRow,
} from '@/lib/leaderboard';
import { poolSize, QUESTION_COUNTS } from '@/lib/quiz';
import { isSupabaseConfigured } from '@/lib/supabase';
import { formatDuration, formatSeconds } from '@/lib/timer';

import styles from './leaderboard.module.css';

/**
 * Le classement lit le cache de l'appareil et l'adresse : il n'existe qu'au
 * navigateur, comme la partie.
 */
export function LeaderboardScreen() {
  const inBrowser = useInBrowser();
  return inBrowser ? <Leaderboard /> : <p className={styles.muted}>Chargement du classement…</p>;
}

/**
 * Les longueurs qu'on peut vraiment jouer dans une catégorie : l'Océanie n'a
 * que 14 pays, donc 15 et 20 questions y font la même manche de 14.
 */
function lengthsOf(category: CategoryId, mode: ModeId): number[] {
  const pool = poolSize(category, mode);
  return [...new Set(QUESTION_COUNTS.map((count) => Math.min(count, pool)))];
}

type Board =
  | { status: 'loading' }
  | { status: 'ready'; rows: BoardRow[] }
  /** Réseau ou serveur indisponible ; `rows` est le dernier classement connu. */
  | { status: 'offline'; rows: BoardRow[] | null };

function Leaderboard() {
  const params = useSearchParams();
  const account = useAccount();

  const [mode, setMode] = useState<ModeId>(() => getMode(params.get('mode') ?? undefined).id);
  const [category, setCategory] = useState<CategoryId>(
    () => getCategory(params.get('category') ?? undefined, mode).id,
  );
  const lengths = useMemo(() => lengthsOf(category, mode), [category, mode]);
  const [wantedLength, setLength] = useState(() => Number(params.get('length')) || lengths[0]);
  // Changer de zone peut rendre la longueur choisie injouable : on retombe
  // sur la plus proche en dessous.
  const length = lengths.includes(wantedLength)
    ? wantedLength
    : (lengths.filter((l) => l <= wantedLength).at(-1) ?? lengths[0]);

  const key: BoardKey = useMemo(() => ({ category, mode, length }), [category, mode, length]);
  const accountId = account.status === 'signed-in' ? account.id : null;
  const [board, setBoard] = useState<Board>(() => fromCache(key));
  // Le dernier classement lu s'affiche tout de suite, pendant qu'on va
  // chercher le frais. Un classement de moins de 30 s n'est pas redemandé.
  const [shownKey, setShownKey] = useState(key);
  const [shownAccount, setShownAccount] = useState(accountId);
  if (shownKey !== key || shownAccount !== accountId) {
    setShownKey(key);
    setShownAccount(accountId);
    setBoard(fromCache(key));
  }

  useEffect(() => {
    if (account.status === 'loading') return;
    if (isFresh(key, accountId)) return;
    const cached = cachedBoard(key);
    let cancelled = false;
    fetchBoard(key, accountId).then(
      (rows) => {
        if (!cancelled) setBoard({ status: 'ready', rows });
      },
      () => {
        if (!cancelled) setBoard({ status: 'offline', rows: cached?.rows ?? null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, account.status, accountId]);

  const current = getCategory(category, mode);

  const chooseMode = (next: ModeId) => {
    setMode(next);
    // Le mode États se joue sur un pays, les autres sur une zone.
    setCategory(getCategory(category, next).id);
  };

  return (
    <>
      <header>
        <h1 className={styles.brand}>Classement</h1>
        <p className={styles.subtitle}>
          Meilleur temps sur une manche trouvée en entier. À égalité, le premier arrivé passe
          devant.
        </p>
      </header>

      <ModeSelector value={mode} onChange={chooseMode} accent={current.accent} />

      <div className={styles.chips} role="radiogroup" aria-label="Zone">
        {categoriesFor(mode).map((cat) => (
          <button
            key={cat.id}
            type="button"
            role="radio"
            aria-checked={cat.id === category}
            className={cat.id === category ? `${styles.chip} ${styles.chipActive}` : styles.chip}
            onClick={() => setCategory(cat.id)}>
            <span aria-hidden="true">{cat.emoji}</span> {cat.label}
          </button>
        ))}
      </div>

      <div className={styles.chips} role="radiogroup" aria-label="Nombre de questions">
        {lengths.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={l === length}
            className={l === length ? `${styles.chip} ${styles.chipActive}` : styles.chip}
            onClick={() => setLength(l)}>
            {l} questions
          </button>
        ))}
      </div>

      {account.status === 'guest' ? (
        <p className={styles.banner}>
          <Link href="/compte" className={styles.link}>
            Connecte-toi
          </Link>{' '}
          pour apparaître ici : tes records faits sur cet appareil suivront.
        </p>
      ) : null}

      <BoardTable board={board} length={length} />
    </>
  );
}

function fromCache(key: BoardKey): Board {
  const cached = cachedBoard(key);
  return cached ? { status: 'ready', rows: cached.rows } : { status: 'loading' };
}

function BoardTable({ board, length }: { board: Board; length: number }) {
  if (!isSupabaseConfigured()) {
    return <p className={styles.muted}>Classement indisponible dans cette version.</p>;
  }
  if (board.status === 'loading') {
    return <p className={styles.muted}>Chargement du classement…</p>;
  }
  const rows = board.rows;
  return (
    <>
      {board.status === 'offline' ? (
        <p className={styles.muted} role="status">
          {rows
            ? 'Hors ligne : dernier classement connu.'
            : 'Classement injoignable pour le moment.'}
        </p>
      ) : null}
      {rows && rows.length === 0 ? (
        <p className={styles.muted}>Personne pour l’instant. La première place est libre !</p>
      ) : null}
      {rows && rows.length > 0 ? (
        <ol className={styles.list}>
          {rows.map((row) => (
            <li
              key={`${row.rank}-${row.username}`}
              className={row.isMe ? `${styles.row} ${styles.me}` : styles.row}
              // Le joueur hors du top est séparé des autres par un trait.
              data-outside={row.rank > TOP_SIZE ? '' : undefined}>
              <span className={styles.rank}>{medal(row.rank)}</span>
              <span className={styles.name}>{row.username}</span>
              <span className={styles.time}>
                {formatDuration(row.bestMs)}
                <span className={styles.pace}>{formatSeconds(row.bestMs / length)} / q</span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </>
  );
}

function medal(rank: number): string {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : String(rank);
}
