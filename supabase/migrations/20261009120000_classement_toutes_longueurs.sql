-- Le classement montre, à côté du temps classé, les meilleurs temps de chaque
-- joueur sur les autres longueurs de la même zone et du même mode.
--
-- À appliquer après 20261005180000_connexion_google.sql : SQL Editor > coller
-- ce fichier > Run, ou `supabase db push` avec la CLI. **Avant** de déployer
-- le site qui l'appelle : sans ce fichier, le classement reste injoignable.
--
-- `get_leaderboard` reste en place : les versions du site déjà installées
-- (PWA) l'appellent encore.

-- Même classement que `get_leaderboard` (20260925170000_leaderboard.sql), avec
-- en plus `bests` : les meilleurs temps du joueur dans cette zone et ce mode,
-- par longueur, celle du classement comprise ({"10": 41250, "20": 92000}).
-- Une longueur jamais jouée n'y figure pas.
--
-- Toujours un seul aller-retour : chaque `bests` se lit sur la clé primaire de
-- `scores` (user_id, category, mode, length), trois entrées au plus par
-- joueur affiché.
create function public.get_leaderboard_with_bests(
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
  is_me boolean,
  bests jsonb
)
language sql
stable
-- Ne lit que des tables publiques (voir 20260926090000_anti_triche.sql).
security invoker
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
  select b.rank, p.username, b.best_ms, b.achieved_at, coalesce(b.user_id = auth.uid(), false),
         (select jsonb_object_agg(o.length, o.best_ms)
          from public.scores o
          where o.user_id = b.user_id and o.category = p_category and o.mode = p_mode)
  from board b
  join public.profiles p on p.id = b.user_id
  order by b.rank;
$$;

grant execute on function public.get_leaderboard_with_bests(text, text, integer, integer) to anon, authenticated;
