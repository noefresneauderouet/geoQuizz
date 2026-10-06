-- Connexion avec Google.
--
-- À appliquer après 20260928170000_manches_abandonnees.sql : SQL Editor >
-- coller ce fichier > Run, ou `supabase db push` avec la CLI. **Avant**
-- d'activer Google dans Authentication > Sign In / Providers : sans ce
-- fichier, la première connexion Google échoue (« Database error saving new
-- user »), car `handle_new_user` exige un pseudo.
--
-- Un compte Google arrive sans pseudo : Google donne un nom, une adresse et
-- une photo, et le nom de quelqu'un n'a pas à s'afficher au classement sans
-- qu'il l'ait choisi. Le compte est donc créé sans profil, et le joueur
-- choisit son pseudo juste après, sur /compte, par `claim_username`.
--
-- Tant qu'il ne l'a pas fait, il n'entre pas au classement : `rounds` et
-- `scores` pointent vers `profiles`, une manche sans profil est refusée.

-- Même fonction que dans 20260926090000_anti_triche.sql, sauf qu'un compte
-- sans pseudo (Google) est accepté, sans profil.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := nullif(normalize(btrim(new.raw_user_meta_data ->> 'username'), nfc), '');
begin
  if v_username is null then
    return new;
  end if;
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
  insert into public.profiles (id, username) values (new.id, v_username);
  return new;
end;
$$;

-- Donne son pseudo au compte connecté, qui n'en a pas encore, et le rend.
-- Un compte qui en a déjà un le garde, et c'est celui-là qui est rendu : le
-- pseudo ne se choisit qu'une fois, et la même demande, refaite depuis un
-- autre appareil ou après une coupure, ne change rien.
--
-- Mêmes règles qu'à l'inscription par e-mail : les contraintes de `profiles`
-- (longueur, caractères), l'unicité sans tenir compte de la casse, et le
-- pseudo d'un compte jamais confirmé libéré au bout d'un jour.
create function public.claim_username(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_username text := normalize(btrim(p_username), nfc);
  v_existing text;
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;

  select username into v_existing from public.profiles where id = v_uid;
  if found then
    return v_existing;
  end if;

  begin
    delete from auth.users u
    using public.profiles p
    where p.id = u.id
      and lower(p.username) = lower(v_username)
      and u.email_confirmed_at is null
      and u.created_at < now() - interval '1 day';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.profiles (id, username) values (v_uid, v_username);
  exception
    -- Le site lit ce code pour dire « Ce pseudo est déjà pris ».
    when unique_violation then
      raise exception 'Pseudo déjà pris' using errcode = '23505';
  end;
  return v_username;
end;
$$;

revoke execute on function public.claim_username(text) from public, anon;
grant execute on function public.claim_username(text) to authenticated;
