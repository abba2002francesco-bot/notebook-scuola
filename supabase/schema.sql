-- NOTEBOOK SCUOLA — schema iniziale per Supabase
-- Esegui tutto questo file una sola volta da Supabase > SQL Editor.

create extension if not exists pgcrypto;

-- Profili pubblici minimali: non esponiamo email o altri dati personali.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Studente',
  created_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 40)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(coalesce(new.email, 'studente'), '@', 1)), 40)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.notebooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  notebook_url text not null,
  subject text not null,
  education_level text not null,
  topic text,
  school text,
  tags text[] not null default '{}',
  content_types text[] not null default '{}',
  description text not null,
  image_paths text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notebooks_title_length check (char_length(title) between 4 and 100),
  constraint notebooks_description_length check (char_length(description) between 20 and 1200),
  constraint notebooks_subject_length check (char_length(subject) between 2 and 40),
  constraint notebooks_level_allowed check (education_level in ('Medie', 'Superiori', 'Università', 'Altro')),
  constraint notebooks_url_allowed check (notebook_url ~* '^https://(notebooklm\.google\.com|notebooklm\.link\.google)(/|$)'),
  constraint notebooks_image_count check (cardinality(image_paths) <= 4),
  constraint notebooks_tag_count check (cardinality(tags) <= 10)
);

create unique index if not exists notebooks_url_unique on public.notebooks (lower(notebook_url));
create index if not exists notebooks_created_at_idx on public.notebooks (created_at desc);
create index if not exists notebooks_subject_idx on public.notebooks (subject);
create index if not exists notebooks_level_idx on public.notebooks (education_level);
create index if not exists notebooks_tags_idx on public.notebooks using gin (tags);
create index if not exists notebooks_content_types_idx on public.notebooks using gin (content_types);

create table if not exists public.notebook_votes (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references public.notebooks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (notebook_id, user_id)
);

create table if not exists public.notebook_favorites (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references public.notebooks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (notebook_id, user_id)
);

create table if not exists public.notebook_comments (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references public.notebooks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  constraint comment_length check (char_length(content) between 2 and 500)
);
create index if not exists notebook_comments_notebook_idx on public.notebook_comments (notebook_id, created_at desc);

create table if not exists public.notebook_reports (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references public.notebooks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  details text,
  created_at timestamptz not null default now(),
  constraint report_reason_length check (char_length(reason) between 2 and 80),
  constraint report_details_length check (details is null or char_length(details) <= 500)
);

-- RLS: tutte le tabelle sono protette. I notebook e i commenti sono leggibili pubblicamente;
-- ogni utente può modificare solo i propri contenuti e i propri elementi personali.
alter table public.profiles enable row level security;
alter table public.notebooks enable row level security;
alter table public.notebook_votes enable row level security;
alter table public.notebook_favorites enable row level security;
alter table public.notebook_comments enable row level security;
alter table public.notebook_reports enable row level security;

drop policy if exists "Public profiles are readable" on public.profiles;
create policy "Public profiles are readable" on public.profiles for select using (true);
drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Anyone can read notebooks" on public.notebooks;
create policy "Anyone can read notebooks" on public.notebooks for select using (true);
drop policy if exists "Signed in users create their notebooks" on public.notebooks;
create policy "Signed in users create their notebooks" on public.notebooks for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Owners update their notebooks" on public.notebooks;
create policy "Owners update their notebooks" on public.notebooks for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Owners delete their notebooks" on public.notebooks;
create policy "Owners delete their notebooks" on public.notebooks for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Anyone can read notebook votes" on public.notebook_votes;
create policy "Anyone can read notebook votes" on public.notebook_votes for select using (true);
drop policy if exists "Users vote as themselves" on public.notebook_votes;
create policy "Users vote as themselves" on public.notebook_votes for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users remove their own votes" on public.notebook_votes;
create policy "Users remove their own votes" on public.notebook_votes for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Users read their favorites" on public.notebook_favorites;
create policy "Users read their favorites" on public.notebook_favorites for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users save their favorites" on public.notebook_favorites;
create policy "Users save their favorites" on public.notebook_favorites for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users remove their favorites" on public.notebook_favorites;
create policy "Users remove their favorites" on public.notebook_favorites for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Anyone can read notebook comments" on public.notebook_comments;
create policy "Anyone can read notebook comments" on public.notebook_comments for select using (true);
drop policy if exists "Signed in users comment as themselves" on public.notebook_comments;
create policy "Signed in users comment as themselves" on public.notebook_comments for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Authors remove their own comments" on public.notebook_comments;
create policy "Authors remove their own comments" on public.notebook_comments for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Signed in users submit reports" on public.notebook_reports;
create policy "Signed in users submit reports" on public.notebook_reports for insert to authenticated with check (auth.uid() = user_id);
-- Le segnalazioni non sono leggibili dagli utenti: il titolare le gestisce dal pannello Supabase.

-- Privilegi SQL espliciti per i ruoli API Supabase. RLS resta il controllo effettivo dei dati.
grant select on public.profiles to anon, authenticated;
grant update on public.profiles to authenticated;
grant select, insert, update, delete on public.notebooks to authenticated;
grant select on public.notebooks to anon;
grant select, insert, delete on public.notebook_votes to authenticated;
grant select on public.notebook_votes to anon;
grant select, insert, delete on public.notebook_favorites to authenticated;
grant select, insert, delete on public.notebook_comments to authenticated;
grant select on public.notebook_comments to anon;
grant insert on public.notebook_reports to authenticated;

-- Bucket pubblico per le immagini di anteprima (non contiene i notebook originali).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notebook-images', 'notebook-images', true, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 4194304, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Public can view notebook preview images" on storage.objects;
create policy "Public can view notebook preview images" on storage.objects for select using (bucket_id = 'notebook-images');
drop policy if exists "Users upload preview images into their folder" on storage.objects;
create policy "Users upload preview images into their folder" on storage.objects for insert to authenticated with check (bucket_id = 'notebook-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users delete their own preview images" on storage.objects;
create policy "Users delete their own preview images" on storage.objects for delete to authenticated using (bucket_id = 'notebook-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Fine schema Notebook Scuola.
