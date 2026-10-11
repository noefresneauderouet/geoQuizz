-- Photos de profil.
--
-- À appliquer après 20261009120000_classement_toutes_longueurs.sql : SQL
-- Editor > coller ce fichier > Run, ou `supabase db push` avec la CLI. Le site
-- qui s'en sert peut partir avant ou après : sans ce fichier, le classement
-- s'affiche sans photos, et l'envoi d'une photo échoue.
--
-- La photo est recadrée et réduite **dans le navigateur** (src/lib/avatar.ts),
-- en deux tailles : 256 px pour l'écran Profil, 96 px pour les listes
-- (classement, salle d'attente, fin de partie à plusieurs). Seules ces deux
-- images partent, jamais le fichier choisi : ses métadonnées (lieu de la prise
-- de vue, appareil) restent sur l'appareil.
--
-- Elles vont dans le seau public `avatars` de Supabase Storage, servi par le
-- réseau de Cloudflare, sous `<id du compte>/<version>-256` et `-96`. Une
-- nouvelle photo a une nouvelle version, donc une nouvelle adresse : rien de
-- périmé ne reste en cache, et chaque image peut s'y garder un an.
--
-- `profiles.avatar` porte la version affichée. Le site la change par
-- `set_avatar`, qui vérifie que les deux images existent.

/* --------------------------------- Images -------------------------------- */

-- 100 Ko par image : une photo de 256 px en WebP ou en JPEG en fait 10 à 40.
-- Le navigateur refuse déjà, avant tout envoi, un fichier de plus de 250 Ko.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 102400, array['image/webp', 'image/jpeg']);

-- Un joueur peut-il déposer une image de plus ? Il lui faut un profil (un
-- compte Google sans pseudo n'en a pas), ne pas être exclu, et moins de
-- quatre images : les deux de sa photo, et les deux de celle qui la remplace.
-- Le site efface les anciennes juste après.
create function public.can_store_avatar()
returns boolean
language sql
stable
-- Compte les images du joueur, que ses propres droits ne laissent pas toutes
-- voir pendant l'envoi.
security definer
set search_path = ''
as $$
  select exists (
           select 1 from public.profiles p
           where p.id = auth.uid() and not p.banned
         )
     and (select count(*)
          from storage.objects o
          where o.bucket_id = 'avatars'
            and o.name like auth.uid()::text || '/%') < 4;
$$;

revoke execute on function public.can_store_avatar() from public, anon;
grant execute on function public.can_store_avatar() to authenticated;

-- Le seau est public en lecture, par l'adresse de chaque image. Le reste est
-- réservé à son propriétaire, dans son dossier, et sous les seuls noms que le
-- site écrit. Pas de remplacement d'une image (`update`) : une nouvelle photo
-- est une nouvelle version.
create policy "Photos de profil : envoyer les siennes"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and name ~ ('^' || (select auth.uid()::text) || '/[0-9a-z]{1,16}-(96|256)$')
    and (select public.can_store_avatar())
  );

-- Lister son dossier et effacer ses images : Storage demande les deux droits.
create policy "Photos de profil : lister les siennes"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "Photos de profil : effacer les siennes"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

/* -------------------------------- Profils -------------------------------- */

-- La version de la photo affichée, ou rien. Lisible par tous, comme le pseudo.
alter table public.profiles
  add column avatar text
  constraint profiles_avatar_format check (avatar ~ '^[0-9a-z]{1,16}$');

-- Affiche une photo déjà envoyée (`p_version`), ou la retire (`null`). Une
-- version dont les deux images ne sont pas dans le seau est refusée : le
-- classement ne pointe jamais vers une image absente.
create function public.set_avatar(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  if p_version is not null and (
    select count(*)
    from storage.objects o
    where o.bucket_id = 'avatars'
      and o.name in (v_uid::text || '/' || p_version || '-256', v_uid::text || '/' || p_version || '-96')
  ) < 2 then
    raise exception 'Photo introuvable' using errcode = '22023';
  end if;
  update public.profiles set avatar = p_version where id = v_uid and not banned;
  if not found then
    raise exception 'Pas de profil, ou joueur exclu' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.set_avatar(text) from public, anon;
grant execute on function public.set_avatar(text) to authenticated;

/* ------------------------------ Modération ------------------------------- */

-- Retire la photo d'un joueur, sans l'exclure. Réservé au tableau de bord
-- (SQL Editor) :
--
--   select public.remove_avatar('Pseudo');
--
-- Les images restent dans le seau jusqu'à sa prochaine photo ; pour les
-- effacer tout de suite : Storage > avatars > son dossier (l'id rendu ici).
create function public.remove_avatar(p_username text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.profiles set avatar = null
  where lower(username) = lower(btrim(p_username))
  returning id into v_id;
  if v_id is null then
    raise exception 'Pseudo inconnu : %', p_username using errcode = '22023';
  end if;
  return v_id;
end;
$$;

revoke execute on function public.remove_avatar(text) from public, anon, authenticated;

-- Même fonction que dans 20260926090000_anti_triche.sql : un joueur exclu
-- perd aussi sa photo, et `set_avatar` ne lui en rend pas.
create or replace function public.ban_player(p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.profiles set banned = true, avatar = null
  where lower(username) = lower(btrim(p_username))
  returning id into v_id;
  if v_id is null then
    raise exception 'Pseudo inconnu : %', p_username using errcode = '22023';
  end if;
  delete from public.scores where user_id = v_id;
  delete from public.rounds where user_id = v_id;
end;
$$;

/* ------------------------------- Classement ------------------------------ */

-- Même classement que dans 20261009120000_classement_toutes_longueurs.sql,
-- avec en plus `avatar` : `<id du compte>/<version>`, d'où le site tire
-- l'adresse des images, ou rien. Une colonne de plus change le type rendu :
-- il faut effacer la fonction avant de la recréer. Les versions du site déjà
-- installées ignorent la nouvelle colonne.
drop function public.get_leaderboard_with_bests(text, text, integer, integer);

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
  bests jsonb,
  avatar text
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
          where o.user_id = b.user_id and o.category = p_category and o.mode = p_mode),
         case when p.avatar is not null then p.id::text || '/' || p.avatar end
  from board b
  join public.profiles p on p.id = b.user_id
  order by b.rank;
$$;

grant execute on function public.get_leaderboard_with_bests(text, text, integer, integer) to anon, authenticated;
