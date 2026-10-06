'use client';

import Link from 'next/link';
import { useEffect, useReducer, useRef, useState } from 'react';

import { CategoryBackground } from '@/components/category-background';
import { QrDialog } from '@/components/multi/qr-dialog';
import { describeSettings, draftOf, SettingsEditor } from '@/components/multi/room-settings';
import { usePublicListing, useRoom } from '@/components/multi/use-room';
import { QuizBoard } from '@/components/quiz/quiz-board';
import { getCategory, getMode, type Category, type Mode } from '@/constants/categories';
import { vibrateSuccess } from '@/lib/feedback';
import { buildRound } from '@/lib/quiz';
import { newSeed, seeded } from '@/lib/random';
import {
  contendersOf,
  COUNTDOWN_MS,
  formatTimeLimit,
  getPlayerId,
  isHostOf,
  MAX_PLAYERS,
  rankPlayers,
  roomPath,
  roomSettings,
  sameSettings,
  seatOf,
  type Contender,
  type FinishMessage,
  type KnownPlayer,
  type PlayerState,
  type ResetMessage,
  type RoomSettings,
  type StartMessage,
} from '@/lib/room';
import { newGame, reducer, SOLVED_PAUSE_MS, type Game } from '@/lib/round';
import { clock } from '@/lib/timer';

import styles from './multi.module.css';

type Phase =
  | { kind: 'lobby' }
  | { kind: 'countdown'; until: number }
  /** `deadline` : fin de la partie quand la salle a une limite de temps. */
  | { kind: 'playing'; deadline: number | null }
  /** Partie arrêtée, le temps que les derniers états arrivent. `winnerId` vide : le temps est écoulé. */
  | { kind: 'stopped'; winnerId: string }
  | { kind: 'ranking'; winnerId: string };

/** L'avancée d'une manche, telle qu'on la publie et qu'on la classe. */
const scoreOf = (game: Game) => ({ found: game.found.length, reachedMs: game.lastFoundMs });

/** Le temps laissé aux derniers états pour arriver avant d'afficher le classement. */
const SETTLE_MS = 1200;

type Props = {
  code: string;
  name: string;
  /** Ceux du lien ; `null` quand on est entré avec le code seul. */
  settings: RoomSettings | null;
  /** L'hôte a ouvert la salle à tous : « Partie aléatoire » peut y mener. */
  isPublic: boolean;
};

/**
 * Une salle, de l'attente au classement.
 *
 * Tout ce qui est partagé passe par la salle (src/lib/room.ts) ; tout le
 * reste — la manche elle-même, son chronomètre — tourne ici, sur chaque
 * appareil, à partir de la même graine.
 */
export function MultiRoom({ code, name, settings: fromLink, isPublic: publicLink }: Props) {
  const host = isHostOf(code);
  /** L'hôte peut ouvrir ou fermer sa salle entre deux parties. */
  const [isPublic, setPublic] = useState(publicLink);
  /**
   * Ce que ce joueur publie dans la salle (Presence). Son avancée n'y est pas :
   * elle se lit dans sa manche, et part aux autres par des messages `progress`.
   */
  const [me, setMe] = useState<PlayerState>(() => ({
    id: getPlayerId(),
    name,
    host,
    joinedAt: Date.now(),
    status: 'lobby',
    game: 0,
    // L'hôte arrive toujours depuis l'écran de création : ses réglages sont
    // dans son URL, et il est le seul à les publier. Il les change ensuite
    // entre deux parties (`changeSettings`).
    settings: host ? (fromLink ?? undefined) : undefined,
  }));
  /**
   * Les réglages du dernier lancement. En partie, ils l'emportent sur ce que
   * l'URL et la salle d'attente annonçaient : c'est ce que l'hôte envoie qui
   * se joue.
   */
  const [launched, setLaunched] = useState<RoomSettings | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'lobby' });
  const [game, dispatch] = useReducer(reducer, null, () => newGame([], 0));
  /** La partie en cours a déjà été arrêtée : un second `finish` est ignoré. */
  const stopped = useRef(-1);

  const update = (patch: Partial<typeof me>) => setMe((s) => ({ ...s, ...patch }));
  const clearRound = () => dispatch({ type: 'restart', round: [], now: clock() });

  /*
   * Les trois moments partagés. Chacun est appliqué ici tout de suite par
   * celui qui le déclenche, puis envoyé aux autres : on ne compte pas sur
   * l'écho de ses propres messages, que Supabase ne renvoie pas toujours.
   */
  const startGame = ({ game: number, seed, settings: played }: StartMessage) => {
    // Les numéros de partie ne font que croître : un lancement déjà vu est ignoré.
    if (number <= me.game) return;
    clearRound();
    setLaunched(played);
    // Une seule publication pour tout le lancement : Presence est limité.
    update({ game: number, status: 'playing' });
    setPhase({ kind: 'countdown', until: Date.now() + COUNTDOWN_MS });
    setTimeout(() => {
      const round = buildRound(played.category, played.mode, played.count, seeded(seed));
      dispatch({ type: 'restart', round, now: clock() });
      setPhase({
        kind: 'playing',
        deadline: played.limit ? Date.now() + played.limit * 1000 : null,
      });
    }, COUNTDOWN_MS);
  };

  const finishGame = ({ game: number, playerId }: FinishMessage) => {
    if (number !== me.game || stopped.current === number) return;
    stopped.current = number;
    dispatch({ type: 'end', now: clock() });
    update({ status: 'done' });
    setPhase({ kind: 'stopped', winnerId: playerId });
    setTimeout(() => setPhase({ kind: 'ranking', winnerId: playerId }), SETTLE_MS);
  };

  const backToLobby = ({ game: number }: ResetMessage) => {
    clearRound();
    update({ game: number, status: 'lobby' });
    setPhase({ kind: 'lobby' });
  };

  const room = useRoom(code, me, {
    onStart: startGame,
    onFinish: finishGame,
    onReset: backToLobby,
  });

  /* Ce que la salle fait jouer : le lancement en partie, l'hôte en salle d'attente. */
  const chosen = host ? me.settings : room.players.find((p) => p.host)?.settings;
  const settings = roomSettings(phase.kind === 'lobby', chosen, launched, fromLink);

  /*
   * L'hôte a validé de nouveaux réglages. Une seule publication pour tout le
   * changement, et aucune s'il n'a rien changé : Presence est limité.
   */
  const changeSettings = (next: RoomSettings, nextPublic: boolean) => {
    if (!sameSettings(next, me.settings)) update({ settings: next });
    setPublic(nextPublic);
  };

  /*
   * L'adresse suit les réglages : le lien partagé, le QR code et un
   * rechargement mènent à la partie telle qu'elle se jouera, plus à celle de
   * la création.
   */
  const path = settings ? roomPath(code, settings, host && isPublic) : null;
  useEffect(() => {
    if (path && path !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, '', path);
    }
  }, [path]);

  const mode = getMode(settings?.mode);
  const category = getCategory(settings?.category, mode.id);

  /* Une réponse trouvée reste affichée un instant, comme en solo. */
  useEffect(() => {
    if (!game.solved) return;
    vibrateSuccess();
    const last = game.queue.length === 1;
    const id = setTimeout(() => {
      dispatch({ type: 'advance', now: clock() });
      room.progress({ game: me.game, playerId: me.id, ...scoreOf(game) });
      // Tout trouvé : on arrête la partie de tout le monde, la sienne comprise.
      if (last) {
        const message = { game: me.game, playerId: me.id };
        room.finish(message);
        finishGame(message);
      }
    }, SOLVED_PAUSE_MS.exact);
    return () => clearTimeout(id);
    // `game` ne bouge pas tant que la réponse est affichée : seule l'arrivée
    // d'une réponse relance, comme en solo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.solved]);

  /*
   * Partie arrêtée : sa dernière avancée est renvoyée une fois. Si un message
   * s'est perdu en route, le classement se fait quand même sur le vrai score.
   */
  useEffect(() => {
    if (me.status === 'done') {
      room.progress({ game: me.game, playerId: me.id, ...scoreOf(game) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.status]);

  /*
   * Limite de temps : chaque appareil arrête sa propre partie à l'échéance,
   * sans message — tous ont lancé au même moment, à la latence près.
   */
  useEffect(() => {
    if (phase.kind !== 'playing' || phase.deadline === null) return;
    const id = setTimeout(
      () => finishGame({ game: me.game, playerId: '' }),
      phase.deadline - Date.now(),
    );
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const complete = game.over && game.round.length > 0 && game.queue.length === 0;

  const connected = room.players.filter((p) => p.connected);
  // Les places vont aux premiers arrivés.
  const seat = seatOf(connected, me.id);

  /*
   * Une salle publique ne figure dans le hall que tant qu'on peut y entrer :
   * en salle d'attente, avec une place libre. C'est son hôte qui l'annonce,
   * avec ses derniers réglages.
   */
  const open =
    room.status === 'connected' && phase.kind === 'lobby' && connected.length < MAX_PLAYERS;
  usePublicListing(host && isPublic ? code : null, open ? (me.settings ?? null) : null);

  /* Les participants de la partie en cours, avec leur avancée. */
  const contenders = (): Contender[] => contendersOf(me, scoreOf(game), room.players, room.scores);

  if (room.status === 'error') {
    return (
      <Notice category={category} emoji="📡" title="Connexion impossible">
        Les parties à plusieurs ont besoin d&apos;internet. Vérifie ta connexion, puis rouvre le
        lien.
      </Notice>
    );
  }

  if (room.status === 'connecting' || seat === -1) {
    return (
      <Notice category={category} emoji="⏳" title="Connexion à la salle…">
        Salle {code}
      </Notice>
    );
  }

  if (seat >= MAX_PLAYERS) {
    return (
      <Notice category={category} emoji="🚪" title="Salle complète">
        Cette salle accueille {MAX_PLAYERS} joueurs au plus.
      </Notice>
    );
  }

  if (phase.kind === 'countdown') {
    return <Countdown category={category} until={phase.until} />;
  }

  // Manche arrêtée — tout trouvé, ou un autre a fini : il n'y a plus de
  // question à montrer le temps que les derniers états arrivent.
  if (phase.kind === 'stopped' || (phase.kind === 'playing' && game.over)) {
    const timeUp = phase.kind === 'stopped' && phase.winnerId === '';
    return (
      <CategoryBackground category={category} className={styles.screen}>
        <div className={styles.centered}>
          <div className={styles.card}>
            <span className={styles.bigEmoji} aria-hidden="true">
              {complete ? '🎉' : '🏁'}
            </span>
            <h1 className={styles.title}>
              {complete ? 'Tout trouvé !' : timeUp ? 'Temps écoulé !' : 'Partie terminée'}
            </h1>
            <p className={styles.hint}>Classement en cours…</p>
          </div>
        </div>
      </CategoryBackground>
    );
  }

  if (phase.kind === 'playing') {
    const opponents = contenders().filter((p) => p.id !== me.id);
    return (
      <QuizBoard
        category={category}
        mode={mode}
        game={game}
        dispatch={dispatch}
        deadline={phase.deadline}
        status={<Opponents players={opponents} total={game.round.length} />}
      />
    );
  }

  if (phase.kind === 'ranking') {
    const ranked = rankPlayers(contenders());
    return (
      <Ranking
        category={category}
        players={ranked}
        selfId={me.id}
        winnerId={phase.winnerId}
        total={game.round.length}
        isHost={me.host}
        onReplay={() => {
          const message = { game: me.game + 1 };
          room.reset(message);
          backToLobby(message);
        }}
      />
    );
  }

  return (
    <Lobby
      code={code}
      category={category}
      mode={mode}
      settings={settings}
      isPublic={isPublic}
      self={me}
      players={connected}
      onChangeSettings={changeSettings}
      onStart={(played) => {
        const message = { game: me.game + 1, seed: newSeed(), settings: played };
        room.start(message);
        startGame(message);
      }}
    />
  );
}

/* ---------------------------- Salle d'attente ---------------------------- */

type LobbyProps = {
  code: string;
  category: Category;
  mode: Mode;
  /** `null` tant que l'hôte ne s'est pas présenté : on ne sait pas encore ce qui se jouera. */
  settings: RoomSettings | null;
  isPublic: boolean;
  self: PlayerState;
  players: KnownPlayer[];
  /** L'hôte seul : il change les réglages sans recréer la salle. */
  onChangeSettings: (settings: RoomSettings, isPublic: boolean) => void;
  onStart: (settings: RoomSettings) => void;
};

function Lobby({
  code,
  category,
  mode,
  settings,
  isPublic,
  self,
  players,
  onChangeSettings,
  onStart,
}: LobbyProps) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  // Sa propre présence peut avoir un temps de retard sur un retour en salle
  // d'attente : on ne se compte jamais soi-même comme « en partie ».
  const inGame = players.filter(
    (p) => p.id !== self.id && p.status !== 'lobby' && p.game >= self.game,
  );
  const waiting = players
    .filter((p) => !inGame.includes(p))
    .sort((a, b) => a.joinedAt - b.joinedAt);
  const hostHere = players.some((p) => p.host);

  const share = async () => {
    const url = window.location.href;
    const chrono = settings?.limit ? `, ${formatTimeLimit(settings.limit)} chrono` : '';
    const text = settings
      ? `Viens me défier sur GeoQuizz : ${category.label}, ${mode.label.toLowerCase()}, ${settings.count} questions${chrono}.`
      : `Viens me défier sur GeoQuizz, salle ${code}.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'GeoQuizz', text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // partage annulé : rien à faire
    }
  };

  let hint: string;
  if (inGame.length > 0) hint = 'Une partie est en cours : tu joueras la suivante.';
  // Entré par le code, seul dans la salle : le plus probable est une faute de
  // frappe, pas un hôte parti entre-temps.
  else if (!hostHere && waiting.length < 2) hint = 'Personne ici. Vérifie le code de la partie.';
  else if (!hostHere) hint = 'L’hôte a quitté la salle.';
  else if (self.host) hint = waiting.length < 2 ? 'Attends au moins un adversaire.' : '';
  else hint = 'En attente de l’hôte…';

  if (editing) {
    return (
      <SettingsEditor
        code={code}
        initial={draftOf(settings, isPublic)}
        onSave={(next, nextPublic) => {
          onChangeSettings(next, nextPublic);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const summary = settings ? describeSettings(settings) : 'Réglages de l’hôte…';

  return (
    <CategoryBackground category={category} className={styles.screen}>
      <div className={styles.centered}>
        <div className={styles.card}>
          <p className={styles.eyebrow}>Salle d&apos;attente</p>
          <p className={styles.code} aria-label={`Code de la salle : ${code.split('').join(' ')}`}>
            {code}
          </p>
          {/* L'hôte peut les changer : la ligne réapparaît en fondu à chaque
              changement, et un lecteur d'écran l'annonce. */}
          <p className={styles.settings} aria-live="polite">
            <span key={summary} className={styles.fresh}>
              {summary}
            </span>
          </p>
          {/* Seul l'hôte sait que sa salle est publique : c'est lui qui
              l'annonce aux joueurs de « Partie aléatoire ». */}
          {self.host && isPublic ? (
            <p className={styles.visibility}>🌍 Partie publique, ouverte à tous</p>
          ) : null}
          {self.host ? (
            <button type="button" className={styles.edit} onClick={() => setEditing(true)}>
              ⚙️ Modifier les réglages
            </button>
          ) : null}

          <div className={styles.shareRow}>
            <button type="button" className={styles.share} onClick={share}>
              {copied ? '✓ Lien copié' : '🔗 Partager le lien'}
            </button>
            <QrDialog code={code} className={`${styles.share} ${styles.qrButton}`} />
          </div>

          <h2 className={styles.listTitle}>
            {`Joueurs · ${waiting.length}/${MAX_PLAYERS}`}
          </h2>
          <ul className={styles.players}>
            {waiting.map((p) => (
              <li key={p.id} className={styles.player}>
                <span className={styles.playerName}>
                  {p.name}
                  {p.id === self.id ? <span className={styles.you}> (toi)</span> : null}
                </span>
                {p.host ? (
                  <span className={styles.hostBadge} aria-label="hôte">
                    👑
                  </span>
                ) : null}
              </li>
            ))}
          </ul>

          {/* Seul l'hôte lance, et il a ses réglages depuis la création : le
              bouton ne peut pas manquer de savoir quoi lancer. */}
          {self.host && settings && inGame.length === 0 ? (
            <button
              type="button"
              className={styles.primary}
              style={{ backgroundColor: category.accent }}
              disabled={waiting.length < 2}
              onClick={() => onStart(settings)}>
              Lancer la partie
            </button>
          ) : null}
          {hint ? <p className={styles.hint}>{hint}</p> : null}

          <Link href="/" className={styles.ghost}>
            Quitter la salle
          </Link>
        </div>
      </div>
    </CategoryBackground>
  );
}

/* ---------------------------------- Jeu ---------------------------------- */

function Countdown({ category, until }: { category: Category; until: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(1, Math.ceil((until - now) / 1000));
  return (
    <CategoryBackground category={category} className={styles.screen}>
      <div className={styles.centered}>
        <p key={left} className={styles.countdown} aria-live="assertive">
          {left}
        </p>
        <p className={styles.countdownLabel}>Même quiz pour tout le monde. Prêt ?</p>
      </div>
    </CategoryBackground>
  );
}

function Opponents({ players, total }: { players: Contender[]; total: number }) {
  if (players.length === 0) return null;
  return (
    <ul className={styles.opponents} aria-label="Avancée des adversaires">
      {rankPlayers(players).map((p) => (
        <li key={p.id} className={p.connected ? styles.opponent : `${styles.opponent} ${styles.gone}`}>
          <span className={styles.opponentName}>{p.name}</span>
          <span className={styles.opponentScore}>
            {`${p.found}/${total}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------- Classement ------------------------------ */

type RankingProps = {
  category: Category;
  players: Contender[];
  selfId: string;
  winnerId: string;
  total: number;
  isHost: boolean;
  onReplay: () => void;
};

const MEDALS = ['🥇', '🥈', '🥉'];

function Ranking({ category, players, selfId, winnerId, total, isHost, onReplay }: RankingProps) {
  const winner = players.find((p) => p.id === winnerId);
  const myRank = players.findIndex((p) => p.id === selfId);

  return (
    <CategoryBackground category={category} className={styles.screen}>
      <div className={styles.centered}>
        <div className={styles.card}>
          <span className={styles.bigEmoji} aria-hidden="true">
            {myRank === 0 ? '🏆' : '🏁'}
          </span>
          <h1 className={styles.title}>{myRank === 0 ? 'Victoire !' : 'Partie terminée'}</h1>
          {winner ? (
            <p className={styles.settings}>
              {winner.id === selfId ? 'Tu as' : `${winner.name} a`} tout trouvé en premier.
            </p>
          ) : winnerId === '' ? (
            <p className={styles.settings}>
              ⏳ Temps écoulé : le classement suit les questions trouvées.
            </p>
          ) : null}

          <ol className={styles.ranking}>
            {players.map((p, i) => (
              <li
                key={p.id}
                className={p.id === selfId ? `${styles.rankRow} ${styles.rankSelf}` : styles.rankRow}>
                <span className={styles.rank}>{MEDALS[i] ?? `${i + 1}`}</span>
                <span className={styles.playerName}>
                  {p.name}
                  {p.id === selfId ? <span className={styles.you}> (toi)</span> : null}
                  {!p.connected ? <span className={styles.you}> · déconnecté</span> : null}
                </span>
                <span className={styles.rankScore}>
                  {`${p.found}/${total}`}
                </span>
              </li>
            ))}
          </ol>

          {isHost ? (
            <button
              type="button"
              className={styles.primary}
              style={{ backgroundColor: category.accent }}
              onClick={onReplay}>
              Nouvelle partie
            </button>
          ) : (
            <p className={styles.hint}>L&apos;hôte peut relancer une partie.</p>
          )}
          <Link href="/" className={styles.ghost}>
            Quitter la salle
          </Link>
        </div>
      </div>
    </CategoryBackground>
  );
}

/* --------------------------------- Divers -------------------------------- */

type NoticeProps = { category: Category; emoji: string; title: string; children: React.ReactNode };

export function Notice({ category, emoji, title, children }: NoticeProps) {
  return (
    <CategoryBackground category={category} className={styles.screen}>
      <div className={styles.centered}>
        <div className={styles.card}>
          <span className={styles.bigEmoji} aria-hidden="true">
            {emoji}
          </span>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.settings}>{children}</p>
          <Link href="/" className={styles.ghost}>
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    </CategoryBackground>
  );
}
