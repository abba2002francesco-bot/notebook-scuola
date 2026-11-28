begin;

alter table public.study_sources
  add column if not exists chunk_count integer not null default 0,
  add column if not exists chunked_at timestamptz;

alter table public.study_sources
  drop constraint if exists study_sources_chunk_count_valid;
alter table public.study_sources
  add constraint study_sources_chunk_count_valid check (chunk_count between 0 and 2000);

alter table public.study_source_chunks
  alter column embedding drop not null,
  alter column embedding_dimensions drop not null,
  alter column embedding_dimensions drop default,
  alter column embedding_model drop not null,
  alter column embedding_model drop default;

alter table public.study_source_chunks
  drop constraint if exists study_chunks_embedding_dimensions_valid;
alter table public.study_source_chunks
  drop constraint if exists study_chunks_embedding_model_length;

alter table public.study_source_chunks
  add constraint study_chunks_embedding_metadata_valid
  check (
    (embedding is null and embedding_dimensions is null and embedding_model is null)
    or
    (embedding is not null
      and embedding_dimensions between 1 and 4096
      and extensions.vector_dims(embedding) = embedding_dimensions
      and embedding_model is not null
      and char_length(embedding_model) between 1 and 100)
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
  chunk_id uuid, source_id uuid, chunk_index integer, content text,
  page_start integer, page_end integer, similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select c.id, c.source_id, c.chunk_index, c.content, c.page_start, c.page_end,
    1 - (c.embedding operator(extensions.<=>) p_query_embedding) as similarity
  from public.study_source_chunks as c
  where c.workspace_id = p_workspace_id
    and c.user_id = p_user_id
    and c.embedding is not null
    and c.embedding_model = p_embedding_model
    and c.embedding_dimensions = extensions.vector_dims(p_query_embedding)
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

create or replace function public.replace_study_source_chunks(
  p_user_id uuid, p_workspace_id uuid, p_source_id uuid, p_chunks jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_source public.study_sources;
  v_count integer;
  v_total_chars bigint;
  v_min_index integer;
  v_max_index integer;
  v_distinct_indices integer;
begin
  if p_user_id is null or p_workspace_id is null or p_source_id is null then
    raise exception using errcode = '22004', message = 'STUDY_CHUNKS_REQUIRED_FIELDS';
  end if;
  if p_chunks is null or pg_catalog.jsonb_typeof(p_chunks) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'STUDY_CHUNKS_INVALID';
  end if;

  v_count := pg_catalog.jsonb_array_length(p_chunks);
  if v_count < 1 or v_count > 2000 then
    raise exception using errcode = '22023', message = 'STUDY_CHUNKS_COUNT_INVALID';
  end if;

  select count(*)::integer,
         coalesce(sum(pg_catalog.char_length(x.content)), 0)::bigint,
         min(x.chunk_index), max(x.chunk_index),
         count(distinct x.chunk_index)::integer
    into v_count, v_total_chars, v_min_index, v_max_index, v_distinct_indices
  from pg_catalog.jsonb_to_recordset(p_chunks)
    as x(chunk_index integer, content text, page_start integer, page_end integer);

  if v_count < 1 or v_count > 2000 or v_min_index <> 0
     or v_max_index <> v_count - 1 or v_distinct_indices <> v_count
     or v_total_chars > 4000000 then
    raise exception using errcode = '22023', message = 'STUDY_CHUNKS_INVALID';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_chunks)
      as x(chunk_index integer, content text, page_start integer, page_end integer)
    where x.content is null or pg_catalog.char_length(pg_catalog.btrim(x.content)) < 1
       or pg_catalog.char_length(x.content) > 16000
       or x.chunk_index is null or x.chunk_index < 0
       or ((x.page_start is null and x.page_end is not null)
         or (x.page_start is not null and
           (x.page_start < 1 or (x.page_end is not null and x.page_end < x.page_start))))
  ) then
    raise exception using errcode = '22023', message = 'STUDY_CHUNKS_INVALID';
  end if;

  select * into v_source
  from public.study_sources as s
  where s.id = p_source_id and s.workspace_id = p_workspace_id and s.user_id = p_user_id
  for update;

  if not found or v_source.status <> 'extracted' then
    raise exception using errcode = 'P0001', message = 'STUDY_SOURCE_NOT_READY';
  end if;

  delete from public.study_source_chunks as c
  where c.source_id = p_source_id and c.workspace_id = p_workspace_id and c.user_id = p_user_id;

  insert into public.study_source_chunks (
    source_id, workspace_id, user_id, chunk_index, content, page_start, page_end
  )
  select p_source_id, p_workspace_id, p_user_id, x.chunk_index, x.content, x.page_start, x.page_end
  from pg_catalog.jsonb_to_recordset(p_chunks)
    as x(chunk_index integer, content text, page_start integer, page_end integer)
  order by x.chunk_index;

  update public.study_sources
  set chunk_count = v_count, chunked_at = pg_catalog.now()
  where id = p_source_id and workspace_id = p_workspace_id and user_id = p_user_id;

  return v_count;
end;
$function$;

revoke all on function public.replace_study_source_chunks(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_study_source_chunks(uuid, uuid, uuid, jsonb)
  to service_role;

commit;
