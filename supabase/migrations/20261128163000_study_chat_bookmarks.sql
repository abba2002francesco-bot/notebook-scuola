begin;

alter table public.study_messages
  add column if not exists is_bookmarked boolean not null default false,
  add column if not exists bookmarked_at timestamptz;

alter table public.study_messages
  drop constraint if exists study_messages_bookmark_assistant_only;
alter table public.study_messages
  add constraint study_messages_bookmark_assistant_only
  check (not is_bookmarked or role = 'assistant');

create index if not exists study_conversations_workspace_updated_idx
  on public.study_conversations (workspace_id, user_id, updated_at desc);

create index if not exists study_messages_bookmarked_workspace_idx
  on public.study_messages (workspace_id, user_id, bookmarked_at desc)
  where is_bookmarked = true;

commit;
