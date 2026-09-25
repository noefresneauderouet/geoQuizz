-- Anti-triche, pseudos et modération.
--
-- À appliquer après 20260925170000_leaderboard.sql : SQL Editor > coller ce
-- fichier > Run, ou `supabase db push` avec la CLI.
--
-- Jusqu'ici, `submit_scores` gardait tel quel le temps que le navigateur lui
-- envoyait : n'importe quel compte pouvait s'inscrire premier partout. Le
-- temps est désormais encadré par l'horloge de la base :
--
-- - `start_round` ouvre une manche et note l'heure du serveur ; le navigateur
--   attend sa réponse avant d'afficher la première question ;
-- - `finish_round` la ferme, une seule fois, et compare le temps annoncé au
--   temps réellement écoulé. On ne peut ni annoncer plus vite que ce qu'on a
--   vraiment joué, ni annoncer un temps sans avoir attendu aussi longtemps ;
--   et moins de 800 ms par question en moyenne est refusé.
--
-- Et aussi :
-- - `boards` : la liste fermée des classements (zone, mode, longueur) ;
-- - les pseudos : lettres, chiffres, espace, `_` et `-`, en forme NFC, et
--   plus de renommage depuis l'API ;
-- - un pseudo réservé par un compte jamais confirmé se libère après un jour ;
-- - `ban_player` pour retirer un tricheur, `delete_account` pour qu'un joueur
--   efface son compte.

/* ------------------------------ Classements ------------------------------ */

-- Les couples zone, mode et longueur qu'une manche peut produire (voir
-- `lengthsOf` dans src/components/leaderboard/leaderboard-screen.tsx). Une
-- nouvelle zone, ou une nouvelle longueur, demande une migration qui l'ajoute.
create table public.boards (
  category text not null,
  mode text not null,
  length smallint not null,
  primary key (category, mode, length)
);

alter table public.boards enable row level security;

create policy "Les classements sont publics"
  on public.boards for select
  using (true);

revoke insert, update, delete, truncate on public.boards from anon, authenticated;

insert into public.boards (category, mode, length) values
  ('monde', 'drapeau', 10), ('monde', 'drapeau', 15), ('monde', 'drapeau', 20),
  ('afrique', 'drapeau', 10), ('afrique', 'drapeau', 15), ('afrique', 'drapeau', 20),
  ('amerique', 'drapeau', 10), ('amerique', 'drapeau', 15), ('amerique', 'drapeau', 20),
  ('asie', 'drapeau', 10), ('asie', 'drapeau', 15), ('asie', 'drapeau', 20),
  ('europe', 'drapeau', 10), ('europe', 'drapeau', 15), ('europe', 'drapeau', 20),
  ('oceanie', 'drapeau', 10), ('oceanie', 'drapeau', 14),
  ('monde', 'capitale', 10), ('monde', 'capitale', 15), ('monde', 'capitale', 20),
  ('afrique', 'capitale', 10), ('afrique', 'capitale', 15), ('afrique', 'capitale', 20),
  ('amerique', 'capitale', 10), ('amerique', 'capitale', 15), ('amerique', 'capitale', 20),
  ('asie', 'capitale', 10), ('asie', 'capitale', 15), ('asie', 'capitale', 20),
  ('europe', 'capitale', 10), ('europe', 'capitale', 15), ('europe', 'capitale', 20),
  ('oceanie', 'capitale', 10), ('oceanie', 'capitale', 14),
  ('monde', 'pays', 10), ('monde', 'pays', 15), ('monde', 'pays', 20),
  ('afrique', 'pays', 10), ('afrique', 'pays', 15), ('afrique', 'pays', 20),
  ('amerique', 'pays', 10), ('amerique', 'pays', 15), ('amerique', 'pays', 20),
  ('asie', 'pays', 10), ('asie', 'pays', 15), ('asie', 'pays', 20),
  ('europe', 'pays', 10), ('europe', 'pays', 15), ('europe', 'pays', 20),
  ('oceanie', 'pays', 10), ('oceanie', 'pays', 14),
  ('etats-unis', 'etats', 10), ('etats-unis', 'etats', 15), ('etats-unis', 'etats', 20),
  ('france', 'etats', 10), ('france', 'etats', 13),
  ('espagne', 'etats', 10), ('espagne', 'etats', 15), ('espagne', 'etats', 17),
  ('chine', 'etats', 10), ('chine', 'etats', 15), ('chine', 'etats', 20);

-- Les temps envoyés sur un classement inventé disparaissent, et aucun autre
-- ne pourra y entrer.
delete from public.scores s
where not exists (
  select 1 from public.boards b
  where b.category = s.category and b.mode = s.mode and b.length = s.length
);

alter table public.scores
  add constraint scores_board_fkey foreign key (category, mode, length)
  references public.boards (category, mode, length) on delete cascade;

-- Les tables n'accordent rien d'autre que la lecture.
revoke truncate, references, trigger on public.scores, public.profiles from anon, authenticated;

/* -------------------------------- Pseudos -------------------------------- */

alter table public.profiles add column banned boolean not null default false;

-- Plus de renommage depuis l'API : un pseudo est choisi à l'inscription.
drop policy "Chacun modifie son pseudo" on public.profiles;
revoke update (username) on public.profiles from authenticated;
revoke update on public.profiles from authenticated;

-- Lettres latines (accents compris), chiffres, `_` et `-`, mots séparés par
-- une seule espace, en forme NFC : pas de caractère invisible, pas
-- d'inversion du sens d'écriture, pas de « Noé » en deux écritures. Même
-- règle que `USERNAME_PATTERN` dans src/lib/account.ts.
--
-- `not valid` : les pseudos déjà inscrits ne sont pas revérifiés, seulement
-- les nouveaux.
alter table public.profiles
  add constraint profiles_username_charset check (
    username ~ '^[A-Za-z0-9À-ÖØ-öø-ÿŒœ_-]+( [A-Za-z0-9À-ÖØ-öø-ÿŒœ_-]+)*$'
    and username is nfc normalized
  ) not valid;

-- Un compte jamais confirmé ne garde pas son pseudo : au bout d'un jour, le
-- premier qui le demande l'obtient, et le compte abandonné est effacé.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := normalize(btrim(new.raw_user_meta_data ->> 'username'), nfc);
begin
  begin
    delete from auth.users u
    using public.profiles p
    where p.id = u.id
      and lower(p.username) = lower(v_username)
      and u.email_confirmed_at is null
      and u.created_at < now() - interval '1 day';
  exception
    -- Sans ce droit, l'inscription échouera plus bas sur le pseudo pris :
    -- c'est le comportement d'avant, pas une panne.
    when insufficient_privilege then null;
  end;
  -- Sans pseudo, l'insertion échoue et l'inscription avec elle : le client
  -- vérifie le pseudo avant d'appeler signUp.
  insert into public.profiles (id, username) values (new.id, v_username);
  return new;
end;
$$;

create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.profiles p
    join auth.users u on u.id = p.id
    where lower(p.username) = lower(normalize(btrim(p_username), nfc))
      and not (u.email_confirmed_at is null and u.created_at < now() - interval '1 day')
  );
$$;

/* -------------------------------- Manches -------------------------------- */

-- Une manche ouverte par `start_round`, en attente de `finish_round`. La ligne
-- est effacée à la fin : une manche ne compte qu'une fois. Personne ne la lit
-- ni ne l'écrit directement.
create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null,
  mode text not null,
  length smallint not null,
  started_at timestamptz not null default clock_timestamp(),
  foreign key (category, mode, length) references public.boards (category, mode, length)
    on delete cascade
);

create index rounds_user_idx on public.rounds (user_id, started_at);

alter table public.rounds enable row level security;
revoke all on public.rounds from anon, authenticated;

-- Ouvre une manche classée. Rend son identifiant, à rendre à `finish_round`.
create function public.start_round(p_category text, p_mode text, p_length integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and banned) then
    raise exception 'Compte exclu du classement' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.boards
    where category = p_category and mode = p_mode and length = p_length
  ) then
    raise exception 'Classement inconnu' using errcode = '22023';
  end if;

  -- Les manches abandonnées ne restent pas.
  delete from public.rounds where user_id = v_uid and started_at < now() - interval '1 day';
  -- Largement assez pour jouer, trop peu pour remplir la base.
  if (
    select count(*) from public.rounds
    where user_id = v_uid and started_at > now() - interval '1 hour'
  ) >= 120 then
    raise exception 'Trop de manches commencées' using errcode = '54000';
  end if;

  insert into public.rounds (user_id, category, mode, length)
  values (v_uid, p_category, p_mode, p_length)
  returning id into v_id;
  return v_id;
end;
$$;

-- Ferme une manche trouvée en entier et garde le meilleur temps.
--
-- `p_ms` est le temps de recherche mesuré par le navigateur : il exclut
-- l'instant (400 ms, SOLVED_PAUSE_MS dans src/lib/round.ts) où chaque réponse
-- trouvée reste affichée. La base le confronte au temps écoulé depuis
-- `start_round` :
--
-- - plus long que le temps écoulé (à une seconde près) : refusé. Le chrono du
--   navigateur ne part qu'après la réponse de `start_round`, il ne peut pas
--   avoir compté davantage ;
-- - plus court que le temps écoulé moins les pauses (à 3 s près, pour le
--   réseau) : relevé à cette valeur. On ne gagne rien à annoncer moins.
--
-- Rend une ligne (le meilleur temps retenu, le rang, si c'est un record), ou
-- aucune si le temps est refusé.
create function public.finish_round(p_round uuid, p_ms integer)
returns table (
  category text,
  mode text,
  length smallint,
  best_ms integer,
  rank bigint,
  improved boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_round public.rounds;
  v_elapsed double precision;
  v_ms integer;
  v_row public.scores;
  v_improved boolean;
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;

  delete from public.rounds r
  where r.id = p_round and r.user_id = v_uid
  returning r.* into v_round;
  if not found then
    raise exception 'Manche inconnue ou déjà terminée' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and p.banned) then
    return;
  end if;

  v_elapsed := extract(epoch from clock_timestamp() - v_round.started_at) * 1000;
  if p_ms is null or p_ms < 0 or p_ms > v_elapsed + 1000 then
    return;
  end if;
  v_ms := greatest(p_ms, floor(v_elapsed - v_round.length * 400 - 3000))::integer;
  -- Plus vite que 800 ms par question en moyenne, c'est un programme qui
  -- joue, pas quelqu'un qui tape : même un nom de quatre lettres demande de
  -- reconnaître le drapeau puis de l'écrire.
  if v_ms < v_round.length * 800 then
    return;
  end if;

  begin
    insert into public.scores as s (user_id, category, mode, length, best_ms)
    values (v_uid, v_round.category, v_round.mode, v_round.length, v_ms)
    on conflict on constraint scores_pkey do update
      set best_ms = excluded.best_ms, achieved_at = now()
      where excluded.best_ms < s.best_ms
    returning s.* into v_row;
  exception
    -- Ne devrait plus arriver (le plancher ci-dessus est plus haut que celui
    -- de `scores_plausible`), mais un temps refusé ne doit pas lever d'erreur.
    when check_violation then
      return;
  end;

  v_improved := found;
  if not v_improved then
    select s.* into v_row
    from public.scores s
    where s.user_id = v_uid
      and s.category = v_round.category
      and s.mode = v_round.mode
      and s.length = v_round.length;
  end if;

  category := v_row.category;
  mode := v_row.mode;
  length := v_row.length;
  best_ms := v_row.best_ms;
  improved := v_improved;
  select count(*) + 1 into rank
  from public.scores o
  where o.category = v_row.category
    and o.mode = v_row.mode
    and o.length = v_row.length
    and (o.best_ms, o.achieved_at, o.user_id) < (v_row.best_ms, v_row.achieved_at, v_row.user_id);
  return next;
end;
$$;

-- L'ancien envoi, qui croyait le navigateur sur parole. Une version de l'app
-- encore en cache qui l'appelle reçoit une erreur, et son temps n'entre pas.
drop function public.submit_scores(jsonb);

/* ------------------------------ Modération ------------------------------- */

-- Retire un joueur du classement : ses temps sont effacés et il ne peut plus
-- en envoyer. Réservé au tableau de bord (SQL Editor) :
--
--   select public.ban_player('Pseudo');
--
-- Pour le réintégrer : update public.profiles set banned = false where …
create function public.ban_player(p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.profiles set banned = true
  where lower(username) = lower(btrim(p_username))
  returning id into v_id;
  if v_id is null then
    raise exception 'Pseudo inconnu : %', p_username using errcode = '22023';
  end if;
  delete from public.scores where user_id = v_id;
  delete from public.rounds where user_id = v_id;
end;
$$;

/* --------------------------- Effacer son compte -------------------------- */

-- Le droit à l'effacement : le compte, le profil, les temps et les manches en
-- cours partent ensemble (on delete cascade).
create function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

/* --------------------------------- Droits -------------------------------- */

revoke execute on function public.start_round(text, text, integer) from public, anon;
revoke execute on function public.finish_round(uuid, integer) from public, anon;
revoke execute on function public.delete_account() from public, anon;
revoke execute on function public.ban_player(text) from public, anon, authenticated;
grant execute on function public.start_round(text, text, integer) to authenticated;
grant execute on function public.finish_round(uuid, integer) to authenticated;
grant execute on function public.delete_account() to authenticated;

-- Le classement ne lit que des tables publiques : il n'a pas besoin des
-- droits de son propriétaire (le Security Advisor le signalait).
alter function public.get_leaderboard(text, text, integer, integer) security invoker;
