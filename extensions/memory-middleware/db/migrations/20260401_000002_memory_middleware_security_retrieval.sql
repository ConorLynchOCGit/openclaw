begin;

create extension if not exists pg_trgm;
create extension if not exists vector;

create type memory_middleware.internal_role as enum (
  'viewer',
  'reviewer',
  'operator',
  'maintainer'
);

create table memory_middleware.internal_principals (
  id uuid primary key default gen_random_uuid(),
  external_key text not null unique,
  display_name text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table memory_middleware.project_memberships (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references memory_middleware.internal_principals(id) on delete cascade,
  project_id uuid not null references memory_middleware.projects(id) on delete cascade,
  role memory_middleware.internal_role not null default 'viewer',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (principal_id, project_id)
);

create table memory_middleware.policy_scope_memberships (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references memory_middleware.internal_principals(id) on delete cascade,
  scope memory_middleware.policy_scope not null,
  project_id uuid references memory_middleware.projects(id) on delete cascade,
  memory_object_id uuid references memory_middleware.memory_objects(id) on delete cascade,
  procedure_id uuid references memory_middleware.procedures(id) on delete cascade,
  skill_candidate_id uuid references memory_middleware.skill_candidates(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table memory_middleware.memory_embeddings (
  id uuid primary key default gen_random_uuid(),
  memory_object_id uuid not null references memory_middleware.memory_objects(id) on delete cascade,
  content_hash_sha256 text,
  embedding_model text not null,
  embedding_version text not null,
  chunk_index integer not null default 0,
  chunk_text text,
  embedding vector,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (memory_object_id, embedding_model, embedding_version, chunk_index)
);

alter table memory_middleware.projects
  add column search_document tsvector generated always as (
    setweight(to_tsvector('english', coalesce(slug, '')), 'A')
    || setweight(to_tsvector('english', coalesce(name, '')), 'A')
    || setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) stored;

alter table memory_middleware.memory_objects
  add column search_document tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A')
    || setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) stored;

alter table memory_middleware.policies
  add column search_document tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A')
    || setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) stored;

alter table memory_middleware.procedures
  add column search_document tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A')
    || setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) stored;

alter table memory_middleware.skill_candidates
  add column search_document tsvector generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A')
    || setweight(to_tsvector('english', coalesce(summary, '')), 'B')
  ) stored;

create or replace function memory_middleware.current_principal_external_key()
returns text
language sql
stable
as $$
  select nullif(current_setting('memory_middleware.principal_external_key', true), '')
$$;

create or replace function memory_middleware.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(current_setting('memory_middleware.service_role', true), ''), 'off') = 'on'
$$;

create or replace function memory_middleware.current_principal_id()
returns uuid
language sql
stable
security definer
set search_path = memory_middleware, pg_temp
as $$
  select ip.id
  from memory_middleware.internal_principals ip
  where ip.external_key = memory_middleware.current_principal_external_key()
    and ip.archived_at is null
  limit 1
$$;

create or replace function memory_middleware.has_project_access(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = memory_middleware, pg_temp
as $$
  select
    memory_middleware.is_service_role()
    or exists (
      select 1
      from memory_middleware.project_memberships pm
      where pm.project_id = target_project_id
        and pm.principal_id = memory_middleware.current_principal_id()
    )
$$;

create or replace function memory_middleware.has_project_review_access(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = memory_middleware, pg_temp
as $$
  select
    memory_middleware.is_service_role()
    or exists (
      select 1
      from memory_middleware.project_memberships pm
      where pm.project_id = target_project_id
        and pm.principal_id = memory_middleware.current_principal_id()
        and pm.role in ('reviewer', 'operator', 'maintainer')
    )
$$;

alter table memory_middleware.projects enable row level security;
alter table memory_middleware.agents enable row level security;
alter table memory_middleware.sessions enable row level security;
alter table memory_middleware.memory_events enable row level security;
alter table memory_middleware.tool_results enable row level security;
alter table memory_middleware.compaction_events enable row level security;
alter table memory_middleware.memory_objects enable row level security;
alter table memory_middleware.memory_sources enable row level security;
alter table memory_middleware.memory_links enable row level security;
alter table memory_middleware.memory_reviews enable row level security;
alter table memory_middleware.policies enable row level security;
alter table memory_middleware.procedures enable row level security;
alter table memory_middleware.procedure_runs enable row level security;
alter table memory_middleware.skill_candidates enable row level security;
alter table memory_middleware.background_jobs enable row level security;
alter table memory_middleware.agent_state enable row level security;
alter table memory_middleware.internal_principals enable row level security;
alter table memory_middleware.project_memberships enable row level security;
alter table memory_middleware.policy_scope_memberships enable row level security;
alter table memory_middleware.memory_embeddings enable row level security;

create policy projects_service_all
  on memory_middleware.projects
  for all
  using (memory_middleware.is_service_role())
  with check (memory_middleware.is_service_role());

create policy projects_member_select
  on memory_middleware.projects
  for select
  using (memory_middleware.has_project_access(id));

create policy agents_service_all
  on memory_middleware.agents
  for all
  using (memory_middleware.is_service_role())
  with check (memory_middleware.is_service_role());

create policy sessions_service_all
  on memory_middleware.sessions
  for all
  using (memory_middleware.is_service_role())
  with check (memory_middleware.is_service_role());

create policy sessions_member_select
  on memory_middleware.sessions
  for select
  using (
    project_id is not null
    and memory_middleware.has_project_access(project_id)
  );

create policy memory_events_service_all
  on memory_middleware.memory_events
  for all
  using (memory_middleware.is_service_role())
  with check (memory_middleware.is_service_role());

create policy tool_results_service_all
  on memory_middleware.tool_results
  for all
  using (memory_middleware.is_service_role())
  with check (memory_middleware.is_service_role());

create policy compaction_events_service_all
  on memory_middleware.compaction_events
  for all
  using (memory_middleware.is_service_role())
  with check (memory_middleware.is_service_role());

create policy memory_objects_service_all
  on memory_middleware.memory_objects
  for all
  using (memory_middleware.is_service_role())
  with check (memory_middleware.is_service_role());

create policy memory_objects_internal_select
  on memory_middleware.memory_objects
  for select
  using (
    (
      review_state = 'approved'
      and project_id is not null
      and memory_middleware.has_project_access(project_id)
    )
    or (
      review_state in ('candidate', 'corrected', 'rejected')
      and project_id is not null
      and memory_middleware.has_project_review_access(project_id)
    )
  );

create policy memory_sources_service_all
  on memory_middleware.memory_sources
  for all
  using (memory_middleware.is_service_role())
  with check (memory_middleware.is_service_role());

create policy memory_links_service_all
  on memory_middleware.memory_links
  for all
  using (memory_middleware.is_service_role())
  with check (memory_middleware.is_service_role());

create policy memory_reviews_service_all
  on memory_middleware.memory_reviews
  for all
  using (memory_middleware.is_service_role())
  with check (memory_middleware.is_service_role());

create policy memory_reviews_reviewer_select
  on memory_middleware.memory_reviews
  for select
  using (
    exists (
      select 1
      from memory_middleware.memory_objects mo
      where mo.id = memory_object_id
        and mo.project_id is not null
        and memory_middleware.has_project_review_access(mo.project_id)
    )
  );

create policy policies_service_all
  on memory_middleware.policies
  for all
  using (memory_middleware.is_service_role())
  with check (memory_middleware.is_service_role());

create policy policies_internal_select
  on memory_middleware.policies
  for select
  using (
    (
      scope = 'global'
      and status = 'active'
    )
    or (
      project_id is not null
      and memory_middleware.has_project_access(project_id)
      and (
        status = 'active'
        or memory_middleware.has_project_review_access(project_id)
      )
    )
  );

create policy procedures_service_all
  on memory_middleware.procedures
  for all
  using (memory_middleware.is_service_role())
  with check (memory_middleware.is_service_role());

create policy procedures_internal_select
  on memory_middleware.procedures
  for select
  using (
    (
      status in ('validated', 'superseded', 'archived')
      and project_id is not null
      and memory_middleware.has_project_access(project_id)
    )
    or (
      status in ('draft', 'rejected')
      and project_id is not null
      and memory_middleware.has_project_review_access(project_id)
    )
  );

create policy procedure_runs_service_all
  on memory_middleware.procedure_runs
  for all
  using (memory_middleware.is_service_role())
  with check (memory_middleware.is_service_role());

create policy procedure_runs_internal_select
  on memory_middleware.procedure_runs
  for select
  using (
    exists (
      select 1
      from memory_middleware.procedures p
      where p.id = procedure_id
        and p.project_id is not null
        and memory_middleware.has_project_review_access(p.project_id)
    )
  );

create policy skill_candidates_service_all
  on memory_middleware.skill_candidates
  for all
  using (memory_middleware.is_service_role())
  with check (memory_middleware.is_service_role());

create policy skill_candidates_reviewer_select
  on memory_middleware.skill_candidates
  for select
  using (
    project_id is not null
    and memory_middleware.has_project_review_access(project_id)
  );

create policy background_jobs_service_all
  on memory_middleware.background_jobs
  for all
  using (memory_middleware.is_service_role())
  with check (memory_middleware.is_service_role());

create policy agent_state_service_all
  on memory_middleware.agent_state
  for all
  using (memory_middleware.is_service_role())
  with check (memory_middleware.is_service_role());

create policy internal_principals_service_all
  on memory_middleware.internal_principals
  for all
  using (memory_middleware.is_service_role())
  with check (memory_middleware.is_service_role());

create policy internal_principals_self_select
  on memory_middleware.internal_principals
  for select
  using (id = memory_middleware.current_principal_id());

create policy project_memberships_service_all
  on memory_middleware.project_memberships
  for all
  using (memory_middleware.is_service_role())
  with check (memory_middleware.is_service_role());

create policy project_memberships_self_select
  on memory_middleware.project_memberships
  for select
  using (principal_id = memory_middleware.current_principal_id());

create policy policy_scope_memberships_service_all
  on memory_middleware.policy_scope_memberships
  for all
  using (memory_middleware.is_service_role())
  with check (memory_middleware.is_service_role());

create policy policy_scope_memberships_self_select
  on memory_middleware.policy_scope_memberships
  for select
  using (principal_id = memory_middleware.current_principal_id());

create policy memory_embeddings_service_all
  on memory_middleware.memory_embeddings
  for all
  using (memory_middleware.is_service_role())
  with check (memory_middleware.is_service_role());

create view memory_middleware.internal_approved_memory_v
with (security_barrier = true)
as
select
  mo.id,
  mo.project_id,
  mo.agent_id,
  mo.session_id,
  mo.memory_kind,
  mo.title,
  mo.content,
  mo.metadata,
  mo.created_at,
  mo.updated_at,
  me.event_name as source_event_name,
  me.happened_at as source_happened_at
from memory_middleware.memory_objects mo
left join memory_middleware.memory_events me
  on me.id = mo.source_event_id
where mo.review_state = 'approved';

create view memory_middleware.internal_reviewable_candidates_v
with (security_barrier = true)
as
select
  mo.id,
  mo.project_id,
  mo.agent_id,
  mo.session_id,
  mo.memory_kind,
  mo.review_state,
  mo.title,
  mo.content,
  mo.metadata,
  mo.created_at,
  mo.updated_at,
  me.event_name as source_event_name,
  me.happened_at as source_happened_at,
  mr.action as latest_review_action,
  mr.resulting_state as latest_review_state,
  mr.rationale as latest_review_rationale,
  mr.created_at as latest_reviewed_at
from memory_middleware.memory_objects mo
left join memory_middleware.memory_events me
  on me.id = mo.source_event_id
left join lateral (
  select action, resulting_state, rationale, created_at
  from memory_middleware.memory_reviews
  where memory_object_id = mo.id
  order by created_at desc, id desc
  limit 1
) mr on true
where mo.review_state in ('candidate', 'corrected', 'rejected');

create view memory_middleware.internal_procedure_drafts_v
with (security_barrier = true)
as
select
  p.id,
  p.project_id,
  p.source_memory_object_id,
  p.status,
  p.title,
  p.body,
  p.metadata,
  p.created_at,
  p.updated_at
from memory_middleware.procedures p
where p.status = 'draft';

create index memory_middleware_projects_search_document_idx
  on memory_middleware.projects
  using gin (search_document);
create index memory_middleware_projects_trigram_idx
  on memory_middleware.projects
  using gin ((lower(coalesce(slug, '') || ' ' || coalesce(name, '') || ' ' || coalesce(description, ''))) gin_trgm_ops);

create index memory_middleware_memory_objects_search_document_idx
  on memory_middleware.memory_objects
  using gin (search_document);
create index memory_middleware_memory_objects_trigram_idx
  on memory_middleware.memory_objects
  using gin ((lower(coalesce(title, '') || ' ' || coalesce(content, ''))) gin_trgm_ops);

create index memory_middleware_policies_search_document_idx
  on memory_middleware.policies
  using gin (search_document);
create index memory_middleware_policies_trigram_idx
  on memory_middleware.policies
  using gin ((lower(coalesce(title, '') || ' ' || coalesce(body, ''))) gin_trgm_ops);

create index memory_middleware_procedures_search_document_idx
  on memory_middleware.procedures
  using gin (search_document);
create index memory_middleware_procedures_trigram_idx
  on memory_middleware.procedures
  using gin ((lower(coalesce(title, '') || ' ' || coalesce(body, ''))) gin_trgm_ops);

create index memory_middleware_skill_candidates_search_document_idx
  on memory_middleware.skill_candidates
  using gin (search_document);
create index memory_middleware_skill_candidates_trigram_idx
  on memory_middleware.skill_candidates
  using gin ((lower(coalesce(name, '') || ' ' || coalesce(summary, ''))) gin_trgm_ops);

create index memory_middleware_project_memberships_project_role_idx
  on memory_middleware.project_memberships (project_id, role);
create index memory_middleware_project_memberships_principal_idx
  on memory_middleware.project_memberships (principal_id);

create index memory_middleware_policy_scope_memberships_principal_scope_idx
  on memory_middleware.policy_scope_memberships (principal_id, scope);

create index memory_middleware_memory_embeddings_memory_object_idx
  on memory_middleware.memory_embeddings (memory_object_id);
create index memory_middleware_memory_embeddings_model_version_idx
  on memory_middleware.memory_embeddings (embedding_model, embedding_version);

create index memory_middleware_background_jobs_embedding_queue_idx
  on memory_middleware.background_jobs (run_after, created_at)
  where job_kind = 'embedding' and status in ('queued', 'running');

create trigger set_internal_principals_updated_at
before update on memory_middleware.internal_principals
for each row execute function memory_middleware.set_updated_at();

create trigger set_project_memberships_updated_at
before update on memory_middleware.project_memberships
for each row execute function memory_middleware.set_updated_at();

create trigger set_policy_scope_memberships_updated_at
before update on memory_middleware.policy_scope_memberships
for each row execute function memory_middleware.set_updated_at();

create trigger set_memory_embeddings_updated_at
before update on memory_middleware.memory_embeddings
for each row execute function memory_middleware.set_updated_at();

commit;
