-- Comptes et classement.
--
-- À appliquer une fois sur le projet Supabase : SQL Editor > coller ce
-- fichier > Run, ou `supabase db push` avec la CLI.
--
-- Deux tables, et tout passe par trois fonctions :
--
-- - `profiles` : le pseudo affiché au classement, un par compte. La ligne est
--   créée par un déclencheur à l'inscription, à partir du pseudo que le
--   client passe dans les métadonnées (`options.data.username`).
-- - `scores` : **un seul** meilleur temps par joueur, zone, mode et longueur
--   de manche. La table ne grossit donc pas avec le nombre de parties jouées,
--   seulement avec le nombre de joueurs.
--
-- Les clients ne peuvent que lire. Ils n'écrivent jamais directement dans
-- `scores` : `submit_scores` vérifie l'identité, borne les valeurs et ne
-- garde que le meilleur temps, en une requête.

/* -------------------------------- Profils -------------------------------- */

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  -- 3 à 16 caractères (MAX_NAME_LENGTH côté client), sans espace autour.
  constraint profiles_username_format check (
    char_length(username) between 3 and 16 and username = btrim(username)
  )
);

-- Unicité sans tenir compte de la casse : « Noé » et « noé » sont le même pseudo.
create unique index profiles_username_key on public.profiles (lower(username));

alter table public.profiles enable row level security;

create policy "Les pseudos sont publics"
  on public.profiles for select
  using (true);

-- On ne peut changer que son propre pseudo, et rien d'autre.
create policy "Chacun modifie son pseudo"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (username) on public.profiles to authenticated;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Sans pseudo, l'insertion échoue et l'inscription avec elle : le client
  -- vérifie le pseudo avant d'appeler signUp.
  insert into public.profiles (id, username)
  values (new.id, btrim(new.raw_user_meta_data ->> 'username'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Le formulaire d'inscription l'appelle avant signUp, pour dire tout de suite
-- que le pseudo est pris plutôt que d'échouer sur une erreur générique.
create function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(btrim(p_username))
  );
$$;

/* -------------------------------- Scores --------------------------------- */

create table public.scores (
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Les identifiants de src/constants/categories.ts. Pas de liste fermée ici :
  -- un nouveau pays du mode États ne demande pas de migration.
  category text not null check (category ~ '^[a-z-]{2,24}$'),
  mode text not null check (mode in ('drapeau', 'capitale', 'pays', 'etats')),
  -- Longueur réelle de la manche : l'Océanie en compte 14, la France 13.
  length smallint not null check (length between 1 and 50),
  best_ms integer not null,
  achieved_at timestamptz not null default now(),
  primary key (user_id, category, mode, length),
  -- Garde-fou contre les temps impossibles : 250 ms par question au minimum.
  constraint scores_plausible check (best_ms >= length * 250 and best_ms < 86400000)
);

-- L'index du classement : filtre sur (zone, mode, longueur), déjà trié par
-- temps. Le top 50 se lit en parcourant 50 entrées, quel que soit le nombre
-- de joueurs, et le rang d'un joueur se compte sur le même index.
create index scores_board_idx
  on public.scores (category, mode, length, best_ms, achieved_at, user_id);

alter table public.scores enable row level security;

create policy "Le classement est public"
  on public.scores for select
  using (true);

revoke insert, update, delete on public.scores from anon, authenticated;

/* ------------------------------- Fonctions ------------------------------- */

-- Envoie un ou plusieurs temps (une manche finie, ou la file d'attente d'un
-- appareil revenu en ligne) en un seul aller-retour.
--
-- p_scores : [{ "category": "europe", "mode": "drapeau", "length": 10, "ms": 41250 }, …]
--
-- Rend, pour chaque temps, le meilleur temps retenu, le rang du joueur et si
-- ce temps vient de battre son record.
create function public.submit_scores(p_scores jsonb)
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
  v_item jsonb;
  v_row public.scores;
  v_improved boolean;
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  if jsonb_typeof(p_scores) <> 'array' or jsonb_array_length(p_scores) > 200 then
    raise exception 'Liste de scores invalide' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_scores) loop
    -- Un temps refusé (impossible, mal formé) est ignoré seul : il ne doit
    -- pas bloquer les autres, ni la file d'attente d'où il vient.
    begin
      -- Ne garde que le meilleur : la mise à jour n'a lieu que si le temps bat
      -- celui en base. Sinon, aucune ligne n'est écrite (ni WAL, ni verrou long).
      insert into public.scores as s (user_id, category, mode, length, best_ms)
      values (
        v_uid,
        v_item ->> 'category',
        v_item ->> 'mode',
        (v_item ->> 'length')::smallint,
        (v_item ->> 'ms')::integer
      )
      on conflict on constraint scores_pkey do update
        set best_ms = excluded.best_ms, achieved_at = now()
        where excluded.best_ms < s.best_ms
      returning s.* into v_row;

      v_improved := found;
      if not v_improved then
        select s.* into v_row
        from public.scores s
        where s.user_id = v_uid
          and s.category = v_item ->> 'category'
          and s.mode = v_item ->> 'mode'
          and s.length = (v_item ->> 'length')::smallint;
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
    exception
      when check_violation or invalid_text_representation or numeric_value_out_of_range
        or not_null_violation then
        continue;
    end;
  end loop;
end;
$$;

-- Le classement d'une zone, d'un mode et d'une longueur : les `p_limit`
-- premiers, plus la ligne du joueur connecté s'il est plus loin. Un seul
-- aller-retour, qui ne lit que des entrées d'index.
--
-- À égalité de temps, le premier arrivé passe devant.
create function public.get_leaderboard(
  p_category text,
  p_mode text,
  p_length integer,
  p_limit integer default 50
)
returns table (
  rank bigint,
  username text,
  best_ms integer,
  achieved_at timestamptz,
  is_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with top as (
    select s.user_id, s.best_ms, s.achieved_at,
           row_number() over (order by s.best_ms, s.achieved_at, s.user_id) as rank
    from public.scores s
    where s.category = p_category and s.mode = p_mode and s.length = p_length
    order by s.best_ms, s.achieved_at, s.user_id
    limit least(greatest(p_limit, 1), 100)
  ),
  me as (
    select s.user_id, s.best_ms, s.achieved_at,
           (select count(*) + 1
            from public.scores o
            where o.category = s.category and o.mode = s.mode and o.length = s.length
              and (o.best_ms, o.achieved_at, o.user_id) < (s.best_ms, s.achieved_at, s.user_id)
           ) as rank
    from public.scores s
    where s.user_id = auth.uid()
      and s.category = p_category and s.mode = p_mode and s.length = p_length
      and not exists (select 1 from top where top.user_id = s.user_id)
  ),
  board as (
    select * from top
    union all
    select * from me
  )
  select b.rank, p.username, b.best_ms, b.achieved_at, coalesce(b.user_id = auth.uid(), false)
  from board b
  join public.profiles p on p.id = b.user_id
  order by b.rank;
$$;

revoke execute on function public.submit_scores(jsonb) from public, anon;
grant execute on function public.submit_scores(jsonb) to authenticated;
grant execute on function public.get_leaderboard(text, text, integer, integer) to anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
