'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { AppMenu } from '@/components/app-menu';
import { Avatar } from '@/components/avatar';
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
import { formatDuration } from '@/lib/timer';

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
      <header className="pageHeader">
        <div>
          <h1 className={styles.brand}>Classement</h1>
          <p className={styles.subtitle}>
            Meilleur temps sur une manche trouvée en entier. À égalité, le premier arrivé passe
            devant.
          </p>
        </div>
        <AppMenu />
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

      {account.status === 'guest' ? (
        <p className={styles.banner}>
          <Link href="/compte" className={styles.link}>
            Connecte-toi
          </Link>{' '}
          pour apparaître ici : tes records faits sur cet appareil suivront.
        </p>
      ) : account.status === 'needs-username' ? (
        <p className={styles.banner}>
          <Link href="/compte" className={styles.link}>
            Choisis ton pseudo
          </Link>{' '}
          pour apparaître ici.
        </p>
      ) : null}

      <BoardTable board={board} lengths={lengths} length={length} onSort={setLength} />
    </>
  );
}

function fromCache(key: BoardKey): Board {
  const cached = cachedBoard(key);
  return cached ? { status: 'ready', rows: cached.rows } : { status: 'loading' };
}

type BoardTableProps = {
  board: Board;
  /** Une colonne par longueur jouable dans la zone. */
  lengths: number[];
  /** La longueur qui classe, et dont la colonne est mise en avant. */
  length: number;
  onSort: (length: number) => void;
};

/**
 * Une ligne par joueur, ses temps à 10, 15 et 20 questions côte à côte. Les
 * en-têtes de ces colonnes choisissent le classement affiché : la liste ne
 * montre que les joueurs qui ont un temps à cette longueur.
 */
function BoardTable({ board, lengths, length, onSort }: BoardTableProps) {
  if (!isSupabaseConfigured()) {
    return <p className={styles.muted}>Classement indisponible dans cette version.</p>;
  }
  const rows = board.status === 'loading' ? null : board.rows;
  // L'en-tête reste en place pendant qu'un classement se charge : on peut
  // passer d'une longueur à l'autre sans attendre.
  const message =
    board.status === 'loading'
      ? 'Chargement du classement…'
      : rows === null
        ? 'Classement injoignable pour le moment.'
        : rows.length === 0
          ? 'Personne pour l’instant. La première place est libre !'
          : null;
  return (
    <>
      {board.status === 'offline' && rows ? (
        <p className={styles.muted} role="status">
          Hors ligne : dernier classement connu.
        </p>
      ) : null}
      <div className={styles.board}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.rankCol}>
                <span className={styles.srOnly}>Rang</span>
              </th>
              <th scope="col" className={styles.nameCol}>
                Joueur
              </th>
              {lengths.map((l) => (
                <th
                  key={l}
                  scope="col"
                  className={styles.timeCol}
                  aria-sort={l === length ? 'ascending' : undefined}>
                  <button
                    type="button"
                    className={l === length ? `${styles.sort} ${styles.sortActive}` : styles.sort}
                    aria-label={`${l} questions`}
                    onClick={() => onSort(l)}>
                    {`${l} q`}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {message ? (
              <tr>
                <td colSpan={2 + lengths.length} className={styles.message}>
                  <span role="status">{message}</span>
                </td>
              </tr>
            ) : (
              rows?.map((row) => (
                <tr
                  key={`${row.rank}-${row.username}`}
                  className={row.isMe ? `${styles.row} ${styles.me}` : styles.row}
                  // Le joueur hors du top est séparé des autres par un trait.
                  data-outside={row.rank > TOP_SIZE ? '' : undefined}>
                  <td className={styles.rank}>{medal(row.rank)}</td>
                  <th scope="row" className={styles.name}>
                    <span className={styles.player}>
                      <Avatar avatar={row.avatar} name={row.username} size={28} />
                      <span className={styles.playerName}>{row.username}</span>
                    </span>
                  </th>
                  {lengths.map((l) => (
                    <td
                      key={l}
                      className={l === length ? `${styles.time} ${styles.sorted}` : styles.time}>
                      <BestTime ms={l === length ? row.bestMs : row.bests[l]} />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Un temps, ou un tiret discret quand le joueur n'a pas joué cette longueur. */
function BestTime({ ms }: { ms: number | undefined }) {
  if (ms !== undefined) return formatDuration(ms);
  return (
    <>
      <span className={styles.none} aria-hidden="true">
        —
      </span>
      <span className={styles.srOnly}>Pas de temps</span>
    </>
  );
}

function medal(rank: number): string {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : String(rank);
}
