-- Esegui questo script UNA SOLA VOLTA su Supabase > SQL Editor > New query.
-- Aggiunge nomi utente pubblici univoci senza modificare email o password.

alter table public.profiles
  add column if not exists username text;

-- Assegna un nome utente provvisorio agli account già registrati.
update public.profiles
set username = coalesce(
  nullif(left(regexp_replace(lower(display_name), '[^a-z0-9_]', '', 'g'), 15), ''),
  'studente'
) || '_' || substr(replace(id::text, '-', ''), 1, 8)
where username is null or btrim(username) = '';

create unique index if not exists profiles_username_unique
  on public.profiles (lower(username));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_username_format'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_username_format
      check (username ~ '^[a-z0-9_]{3,24}$');
  end if;
end;
$$;

alter table public.profiles
  alter column username set not null;

-- I nuovi account ricevono automaticamente un nome utente temporaneo.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
  v_username_base text;
begin
  v_display_name := left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(coalesce(new.email, 'studente'), '@', 1)), 40);
  v_username_base := left(regexp_replace(lower(v_display_name), '[^a-z0-9_]', '', 'g'), 15);
  if v_username_base = '' then
    v_username_base := 'studente';
  end if;

  insert into public.profiles (id, display_name, username)
  values (
    new.id,
    v_display_name,
    v_username_base || '_' || substr(replace(new.id::text, '-', ''), 1, 8)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
