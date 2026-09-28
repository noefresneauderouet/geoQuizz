-- Les manches abandonnées ne restent plus dans `rounds`.
--
-- Jusqu'ici, seule `finish_round` effaçait une manche, et le site ne l'appelle
-- que pour une manche trouvée en entier. Une partie arrêtée en cours de route,
-- ou une page quittée, laissait sa ligne un jour entier, et plus longtemps
-- encore si le joueur ne revenait pas.
--
-- - `cancel_round` : le site efface lui-même la manche qu'il n'ira pas au
--   bout ;
-- - `start_round` efface, pour tous les joueurs, les manches ouvertes depuis
--   plus de deux heures : ce qui reste d'un onglet fermé en pleine partie.

create index rounds_started_idx on public.rounds (started_at);

-- Efface une manche du joueur connecté qui ne sera pas terminée. Rien si elle
-- n'existe plus : la manche a pu être fermée ou nettoyée entre-temps.
create function public.cancel_round(p_round uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  delete from public.rounds where id = p_round and user_id = auth.uid();
end;
$$;

-- Même fonction que dans 20260926090000_anti_triche.sql, sauf le nettoyage :
-- deux heures au lieu d'un jour, et pour tout le monde. Une manche de vingt
-- questions ne dure pas si longtemps ; passé ce délai, `finish_round` la dit
-- inconnue et le temps reste un record local.
create or replace function public.start_round(p_category text, p_mode text, p_length integer)
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
  delete from public.rounds where started_at < now() - interval '2 hours';
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

revoke execute on function public.cancel_round(uuid) from public, anon;
grant execute on function public.cancel_round(uuid) to authenticated;
