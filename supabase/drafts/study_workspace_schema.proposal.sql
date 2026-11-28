-- NOTEBOOK SCUOLA — PROPOSTA SQL (NON ESEGUIRE IN PRODUZIONE)
-- Area studio indipendente. Documento di progetto: non è una migration applicabile.
--
-- Verifiche svolte sul progetto Supabase attivo:
-- - PostgreSQL 17.12
-- - regione eu-west-1
-- - pgvector disponibile (0.8.2) ma NON installato
-- - nessuna tabella study_* esistente al momento del controllo
--
-- Scelte di sicurezza:
-- - tutti i dati privati hanno user_id e RLS;
-- - il browser ha accesso SELECT ai propri dati, ma non scrive direttamente nelle
--   tabelle di studio;
-- - tutte le scritture passano da Route Handlers server-side che verificano il
--   JWT Supabase con auth.getUser(token), verificano la proprietà del workspace,
--   applicano quote e solo dopo usano la chiave amministrativa;
-- - la chiave service-role/secret non deve mai essere esposta al browser;
-- - file originali in bucket privato, path: <auth.uid>/<workspace_id>/<source_id>/<filename>.
--
-- Prerequisito embedding: Mistral Embed restituisce vettori da 1024 dimensioni.
-- Modello proposto per i primi test: mistral-embed. Non bloccare la scelta AI
-- generativa (Mistral Small 4 / Gemini Flash-Lite) su questa decisione.
-- Se il modello embedding cambia dimensione, la colonna vector richiederà migrazione
-- e re-indicizzazione. Confrontare qualità e costo prima del rilascio.

begin;

create extension if not exists vector with schema extensions;

create table public.study_workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  subject text,
  education_level text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_workspaces_title_length
    check (char_length(btrim(title)) between 1 and 120),
  constraint study_workspaces_subject_length
    check (subject is null or char_length(subject) <= 60),
  constraint study_workspaces_level_allowed
    check (education_level is null or education_level in ('Medie', 'Superiori', 'Università', 'Altro')),
  constraint study_workspaces_description_length
    check (description is null or char_length(description) <= 1200),
  constraint study_workspaces_id_user_unique unique (id, user_id)
);

create index study_workspaces_user_created_idx
  on public.study_workspaces (user_id, created_at desc);

create table public.study_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  original_filename text not null,
  storage_path text not null unique,
  -- Il path deve essere strettamente namespaced per proprietario/workspace/fonte.
  mime_type text not null,
  byte_size bigint not null,
  sha256_hex text,
  status text not null default 'uploaded',
  page_count integer,
  extracted_token_count integer,
  failure_code text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  upload_expires_at timestamptz not null default (now() + interval '20 minutes'),
  constraint study_sources_storage_path_owner_scope
    check (storage_path like user_id::text || '/' || workspace_id::text || '/' || id::text || '/%'),
  constraint study_sources_workspace_owner_fkey
    foreign key (workspace_id, user_id)
    references public.study_workspaces (id, user_id) on delete cascade,
  constraint study_sources_filename_length
    check (char_length(btrim(original_filename)) between 1 and 255),
  constraint study_sources_mime_allowed
    check (mime_type in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    )),
  constraint study_sources_size_limit
    check (byte_size between 1 and 20971520),
  constraint study_sources_sha256_format
    check (sha256_hex is null or sha256_hex ~ '^[a-f0-9]{64}$'),
  constraint study_sources_status_allowed
    check (status in ('uploaded', 'processing', 'ready', 'failed')),
  constraint study_sources_page_count_valid
    check (page_count is null or page_count between 1 and 10000),
  constraint study_sources_token_count_valid
    check (extracted_token_count is null or extracted_token_count >= 0),
  constraint study_sources_id_workspace_user_unique
    unique (id, workspace_id, user_id)
);

create index study_sources_workspace_created_idx
  on public.study_sources (workspace_id, user_id, created_at desc);

create table public.study_source_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null,
  workspace_id uuid not null,
  user_id uuid not null,
  chunk_index integer not null,
  content text not null,
  page_start integer,
  page_end integer,
  embedding extensions.vector not null,
  embedding_dimensions smallint not null default 1024,
  embedding_model text not null default 'mistral/mistral-embed',
  created_at timestamptz not null default now(),
  constraint study_chunks_source_owner_fkey
    foreign key (source_id, workspace_id, user_id)
    references public.study_sources (id, workspace_id, user_id) on delete cascade,
  constraint study_chunks_index_valid check (chunk_index >= 0),
  constraint study_chunks_content_length check (char_length(content) between 1 and 16000),
  constraint study_chunks_page_range
    check (
      (page_start is null and page_end is null)
      or
      (page_start is not null and page_start >= 1
       and (page_end is null or page_end >= page_start))
    ),
  constraint study_chunks_embedding_dimensions_valid
    check (embedding_dimensions between 1 and 4096
      and extensions.vector_dims(embedding) = embedding_dimensions),
  constraint study_chunks_embedding_model_length
    check (char_length(embedding_model) between 1 and 100),
  constraint study_chunks_source_index_unique unique (source_id, chunk_index)
);

-- Per il beta iniziale, il filtro B-tree sul workspace permette una ricerca
-- esatta su raccolte ridotte. Valutare HNSW dopo aver misurato latenza e recall
-- su un dataset realistico: non introdurre un indice approssimato senza benchmark.
create index study_chunks_workspace_source_idx
  on public.study_source_chunks (workspace_id, user_id, source_id);

create table public.study_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  title text not null default 'Nuova conversazione',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_conversations_workspace_owner_fkey
    foreign key (workspace_id, user_id)
    references public.study_workspaces (id, user_id) on delete cascade,
  constraint study_conversations_title_length
    check (char_length(btrim(title)) between 1 and 160),
  constraint study_conversations_id_workspace_user_unique
    unique (id, workspace_id, user_id)
);

create index study_conversations_workspace_updated_idx
  on public.study_conversations (workspace_id, user_id, updated_at desc);

create table public.study_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  workspace_id uuid not null,
  user_id uuid not null,
  role text not null,
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  model_id text,
  created_at timestamptz not null default now(),
  constraint study_messages_conversation_owner_fkey
    foreign key (conversation_id, workspace_id, user_id)
    references public.study_conversations (id, workspace_id, user_id) on delete cascade,
  constraint study_messages_role_allowed check (role in ('user', 'assistant')),
  constraint study_messages_content_length check (char_length(content) between 1 and 30000),
  constraint study_messages_citations_array
    check (jsonb_typeof(citations) = 'array'),
  constraint study_messages_model_length
    check (model_id is null or char_length(model_id) <= 120)
);

create index study_messages_conversation_created_idx
  on public.study_messages (conversation_id, user_id, created_at);

create table public.study_usage_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  user_id uuid not null,
  workspace_id uuid,
  provider text not null,
  model_id text not null,
  feature text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_usd numeric(14, 8) not null default 0,
  created_at timestamptz not null default now(),
  constraint study_usage_provider_length check (char_length(provider) between 1 and 60),
  constraint study_usage_model_length check (char_length(model_id) between 1 and 120),
  constraint study_usage_feature_length check (char_length(feature) between 1 and 60),
  constraint study_usage_input_tokens_valid check (input_tokens >= 0),
  constraint study_usage_output_tokens_valid check (output_tokens >= 0),
  constraint study_usage_cost_valid check (estimated_cost_usd >= 0)
);

create index study_usage_user_created_idx
  on public.study_usage_events (user_id, created_at desc);

-- RLS: lettura dei soli dati appartenenti all'utente autenticato.
-- Le scritture sono server-side: non creare policy INSERT/UPDATE/DELETE
-- per anon/authenticated in questa prima versione.
alter table public.study_workspaces enable row level security;
alter table public.study_sources enable row level security;
alter table public.study_source_chunks enable row level security;
alter table public.study_conversations enable row level security;
alter table public.study_messages enable row level security;
alter table public.study_usage_events enable row level security;

create policy "Users read own study workspaces"
  on public.study_workspaces for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read own study sources"
  on public.study_sources for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read own study source chunks"
  on public.study_source_chunks for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read own study conversations"
  on public.study_conversations for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read own study messages"
  on public.study_messages for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read own study usage events"
  on public.study_usage_events for select to authenticated
  using ((select auth.uid()) = user_id);

grant usage on schema extensions to service_role;

revoke all on
  public.study_workspaces,
  public.study_sources,
  public.study_source_chunks,
  public.study_conversations,
  public.study_messages,
  public.study_usage_events
from public, anon, authenticated;

-- Il browser non accede direttamente al database isolato.
-- Solo la Edge Function autenticata verso il Supabase principale usa service_role.
grant all on
  public.study_workspaces,
  public.study_sources,
  public.study_source_chunks,
  public.study_conversations,
  public.study_messages,
  public.study_usage_events
to service_role;

-- Ricerca vettoriale: SECURITY INVOKER mantiene i vincoli RLS del chiamante.
-- Non accetta user_id dal client: lo ricava esclusivamente da auth.uid().
drop function if exists public.match_study_source_chunks(
  uuid, extensions.vector, integer, double precision, text
);

create or replace function public.match_study_source_chunks(
  p_user_id uuid,
  p_workspace_id uuid,
  p_query_embedding extensions.vector,
  p_match_count integer default 8,
  p_min_similarity double precision default 0.20,
  p_embedding_model text default 'mistral/mistral-embed'
)
returns table (
  chunk_id uuid,
  source_id uuid,
  chunk_index integer,
  content text,
  page_start integer,
  page_end integer,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    c.id,
    c.source_id,
    c.chunk_index,
    c.content,
    c.page_start,
    c.page_end,
    1 - (c.embedding operator(extensions.<=>) p_query_embedding) as similarity
  from public.study_source_chunks as c
  where c.workspace_id = p_workspace_id
    and c.user_id = p_user_id
    and c.embedding_model = p_embedding_model
    and c.embedding_dimensions = extensions.vector_dims(p_query_embedding)
    and c.embedding is not null
    and 1 - (c.embedding operator(extensions.<=>) p_query_embedding)
      >= greatest(0, least(1, coalesce(p_min_similarity, 0.20)))
  order by c.embedding operator(extensions.<=>) p_query_embedding
  limit greatest(1, least(coalesce(p_match_count, 8), 20));
$function$;

revoke all on function public.match_study_source_chunks(
  uuid, uuid, extensions.vector, integer, double precision, text
) from public, anon, authenticated;

grant execute on function public.match_study_source_chunks(
  uuid, uuid, extensions.vector, integer, double precision, text
) to service_role;

-- Creazione notebook con quota applicata atomicamente.
-- L'advisory transaction lock evita che richieste simultanee superino il limite beta.
create or replace function public.create_study_workspace_with_quota(
  p_user_id uuid,
  p_title text,
  p_subject text default null,
  p_education_level text default null,
  p_description text default null
)
returns public.study_workspaces
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_count integer;
  v_workspace public.study_workspaces;
begin
  if p_user_id is null then
    raise exception using errcode = '22004', message = 'USER_ID_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  select count(*)::integer
    into v_count
  from public.study_workspaces as w
  where w.user_id = p_user_id;

  if v_count >= 5 then
    raise exception using
      errcode = 'P0001',
      message = 'STUDY_WORKSPACE_LIMIT_REACHED';
  end if;

  insert into public.study_workspaces (
    user_id, title, subject, education_level, description
  )
  values (
    p_user_id, p_title, p_subject, p_education_level, p_description
  )
  returning * into v_workspace;

  return v_workspace;
end;
$function$;

revoke all on function public.create_study_workspace_with_quota(
  uuid, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.create_study_workspace_with_quota(
  uuid, text, text, text, text
) to service_role;

-- Bucket privato per documenti originali. 20 MiB per file nella beta.
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'study-source-files',
  'study-source-files',
  false,
  20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do nothing;

-- Se il bucket esiste già con una configurazione diversa, interrompere
-- invece di renderlo accidentalmente pubblico o alterarne i limiti.
do $bucket_check$
begin
  if not exists (
    select 1
    from storage.buckets
    where id = 'study-source-files'
      and public is false
      and file_size_limit = 20971520
      and allowed_mime_types @> array[
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ]
  ) then
    raise exception 'Il bucket study-source-files esiste già o non è configurato come previsto. Verificare manualmente prima di procedere.';
  end if;
end;
$bucket_check$;

-- Non creare policy di accesso diretto per anon/authenticated.
-- La Edge Function server-side verifica il JWT del progetto Auth principale,
-- usa il service_role del progetto dati e genera URL firmati a scadenza breve.

commit;

-- NOTA: una successiva migration dovrà:
-- 1) applicare la verifica di MIME reale/firma file e quote nel backend;
-- 2) eventuali trigger updated_at;
-- 3) scegliere e testare l'indice vector (HNSW o scansione esatta);
-- 4) verificare i grants/Data API settings della nuova tabella/function;
-- 5) eseguire Supabase advisors e test RLS con due utenti distinti.
