begin;

create table public.study_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  title text not null,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_notes_title_valid
    check (char_length(btrim(title)) between 1 and 160),
  constraint study_notes_content_valid
    check (char_length(content) <= 50000),
  constraint study_notes_workspace_owner_fkey
    foreign key (workspace_id, user_id)
    references public.study_workspaces (id, user_id)
    on delete cascade
);

create index study_notes_workspace_owner_updated_idx
  on public.study_notes (workspace_id, user_id, updated_at desc);

alter table public.study_notes enable row level security;

revoke all on table public.study_notes from public, anon, authenticated;
grant select, insert, update, delete on table public.study_notes to service_role;

commit;
