begin;

create extension if not exists pgcrypto;

create schema if not exists memory_middleware;

create type memory_middleware.session_status as enum (
  'active',
  'compacted',
  'closed',
  'archived'
);

create type memory_middleware.memory_event_kind as enum (
  'session',
  'tool_result',
  'review',
  'compaction',
  'memory_capture',
  'procedure',
  'procedure_run',
  'policy',
  'background_job',
  'candidate_submission'
);

create type memory_middleware.tool_result_status as enum (
  'persisted',
  'rehydrated',
  'compacted',
  'deleted'
);

create type memory_middleware.compaction_kind as enum (
  'micro',
  'full'
);

create type memory_middleware.compaction_status as enum (
  'planned',
  'completed',
  'skipped',
  'failed'
);

create type memory_middleware.memory_object_kind as enum (
  'user',
  'feedback',
  'project',
  'reference',
  'procedure',
  'policy'
);

create type memory_middleware.memory_review_state as enum (
  'candidate',
  'approved',
  'corrected',
  'rejected',
  'superseded'
);

create type memory_middleware.memory_review_action as enum (
  'approve',
  'correct',
  'reject',
  'supersede'
);

create type memory_middleware.memory_source_kind as enum (
  'session',
  'event',
  'tool_result',
  'review',
  'imported_reference',
  'procedure',
  'policy',
  'manual'
);

create type memory_middleware.memory_link_kind as enum (
  'related',
  'derived_from',
  'supports',
  'contradicts',
  'supersedes',
  'references',
  'belongs_to',
  'procedure_evidence',
  'policy_applies'
);

create type memory_middleware.policy_kind as enum (
  'behavioral',
  'approval',
  'safety',
  'retention',
  'promotion'
);

create type memory_middleware.policy_scope as enum (
  'global',
  'project',
  'agent',
  'session',
  'memory',
  'procedure',
  'skill_candidate'
);

create type memory_middleware.policy_enforcement as enum (
  'advisory',
  'soft_block',
  'hard_block'
);

create type memory_middleware.policy_status as enum (
  'draft',
  'active',
  'superseded',
  'retired'
);

create type memory_middleware.procedure_status as enum (
  'draft',
  'validated',
  'superseded',
  'rejected',
  'archived'
);

create type memory_middleware.procedure_run_outcome as enum (
  'passed',
  'failed',
  'partial',
  'cancelled'
);

create type memory_middleware.skill_candidate_status as enum (
  'candidate',
  'vetted',
  'approved_limited',
  'approved_normal',
  'rejected',
  'quarantined',
  'installed'
);

create type memory_middleware.background_job_kind as enum (
  'compaction',
  'review',
  'promotion',
  'indexing',
  'maintenance',
  'embedding'
);

create type memory_middleware.background_job_status as enum (
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled'
);

create type memory_middleware.agent_state_lifecycle as enum (
  'active',
  'paused',
  'completed',
  'superseded'
);

create or replace function memory_middleware.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table memory_middleware.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table memory_middleware.agents (
  id uuid primary key default gen_random_uuid(),
  external_key text unique,
  name text not null,
  role text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table memory_middleware.sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references memory_middleware.projects(id) on delete set null,
  agent_id uuid references memory_middleware.agents(id) on delete set null,
  session_key text not null unique,
  title text,
  status memory_middleware.session_status not null default 'active',
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table memory_middleware.memory_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references memory_middleware.projects(id) on delete set null,
  agent_id uuid references memory_middleware.agents(id) on delete set null,
  session_id uuid references memory_middleware.sessions(id) on delete cascade,
  event_kind memory_middleware.memory_event_kind not null,
  event_name text not null,
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  happened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table memory_middleware.tool_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references memory_middleware.sessions(id) on delete cascade,
  memory_event_id uuid references memory_middleware.memory_events(id) on delete set null,
  tool_name text not null,
  status memory_middleware.tool_result_status not null default 'persisted',
  content_type text,
  preview_text text,
  payload_text text,
  payload_json jsonb,
  size_bytes bigint,
  checksum_sha256 text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table memory_middleware.compaction_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references memory_middleware.sessions(id) on delete cascade,
  agent_id uuid references memory_middleware.agents(id) on delete set null,
  source_event_id uuid references memory_middleware.memory_events(id) on delete set null,
  compaction_kind memory_middleware.compaction_kind not null,
  status memory_middleware.compaction_status not null default 'planned',
  summary text,
  details jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table memory_middleware.memory_objects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references memory_middleware.projects(id) on delete set null,
  agent_id uuid references memory_middleware.agents(id) on delete set null,
  session_id uuid references memory_middleware.sessions(id) on delete set null,
  source_event_id uuid references memory_middleware.memory_events(id) on delete set null,
  memory_kind memory_middleware.memory_object_kind not null,
  review_state memory_middleware.memory_review_state not null default 'candidate',
  title text,
  content text not null,
  content_json jsonb,
  confidence numeric(5,4),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  superseded_at timestamptz
);

create table memory_middleware.memory_sources (
  id uuid primary key default gen_random_uuid(),
  memory_object_id uuid not null references memory_middleware.memory_objects(id) on delete cascade,
  source_kind memory_middleware.memory_source_kind not null,
  source_table text,
  source_id uuid,
  reference_uri text,
  excerpt text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memory_sources_source_locator_pair_check
    check (
      (source_table is null and source_id is null)
      or (source_table is not null and source_id is not null)
    )
);

create table memory_middleware.memory_links (
  id uuid primary key default gen_random_uuid(),
  source_memory_object_id uuid not null references memory_middleware.memory_objects(id) on delete cascade,
  target_memory_object_id uuid references memory_middleware.memory_objects(id) on delete cascade,
  target_table text,
  target_id uuid,
  link_kind memory_middleware.memory_link_kind not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memory_links_target_presence_check
    check (
      target_memory_object_id is not null
      or (target_table is not null and target_id is not null)
    ),
  constraint memory_links_target_exclusive_check
    check (
      (
        target_memory_object_id is not null
        and target_table is null
        and target_id is null
      )
      or (
        target_memory_object_id is null
        and target_table is not null
        and target_id is not null
      )
    )
);

create table memory_middleware.memory_reviews (
  id uuid primary key default gen_random_uuid(),
  memory_object_id uuid not null references memory_middleware.memory_objects(id) on delete cascade,
  reviewer_agent_id uuid references memory_middleware.agents(id) on delete set null,
  action memory_middleware.memory_review_action not null,
  resulting_state memory_middleware.memory_review_state not null,
  rationale text,
  correction_content text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table memory_middleware.policies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references memory_middleware.projects(id) on delete set null,
  policy_kind memory_middleware.policy_kind not null,
  scope memory_middleware.policy_scope not null,
  enforcement memory_middleware.policy_enforcement not null default 'advisory',
  status memory_middleware.policy_status not null default 'draft',
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retired_at timestamptz
);

create table memory_middleware.procedures (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references memory_middleware.projects(id) on delete set null,
  source_memory_object_id uuid references memory_middleware.memory_objects(id) on delete set null,
  status memory_middleware.procedure_status not null default 'draft',
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  validated_at timestamptz
);

create table memory_middleware.procedure_runs (
  id uuid primary key default gen_random_uuid(),
  procedure_id uuid not null references memory_middleware.procedures(id) on delete cascade,
  session_id uuid references memory_middleware.sessions(id) on delete set null,
  agent_id uuid references memory_middleware.agents(id) on delete set null,
  outcome memory_middleware.procedure_run_outcome not null,
  notes text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table memory_middleware.skill_candidates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references memory_middleware.projects(id) on delete set null,
  source_procedure_id uuid references memory_middleware.procedures(id) on delete set null,
  status memory_middleware.skill_candidate_status not null default 'candidate',
  name text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  vetted_at timestamptz
);

create table memory_middleware.background_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references memory_middleware.projects(id) on delete set null,
  session_id uuid references memory_middleware.sessions(id) on delete set null,
  agent_id uuid references memory_middleware.agents(id) on delete set null,
  job_kind memory_middleware.background_job_kind not null,
  status memory_middleware.background_job_status not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  run_after timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table memory_middleware.agent_state (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references memory_middleware.projects(id) on delete set null,
  agent_id uuid not null references memory_middleware.agents(id) on delete cascade,
  session_id uuid references memory_middleware.sessions(id) on delete cascade,
  state_key text not null,
  lifecycle memory_middleware.agent_state_lifecycle not null default 'active',
  state_json jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, session_id, state_key)
);

create index memory_middleware_sessions_project_id_idx
  on memory_middleware.sessions (project_id);
create index memory_middleware_sessions_agent_id_idx
  on memory_middleware.sessions (agent_id);
create index memory_middleware_memory_events_session_id_idx
  on memory_middleware.memory_events (session_id);
create index memory_middleware_memory_events_event_kind_idx
  on memory_middleware.memory_events (event_kind);
create index memory_middleware_memory_events_happened_at_idx
  on memory_middleware.memory_events (happened_at desc);
create index memory_middleware_tool_results_session_id_idx
  on memory_middleware.tool_results (session_id);
create index memory_middleware_tool_results_memory_event_id_idx
  on memory_middleware.tool_results (memory_event_id);
create index memory_middleware_compaction_events_session_id_idx
  on memory_middleware.compaction_events (session_id);
create index memory_middleware_memory_objects_project_id_idx
  on memory_middleware.memory_objects (project_id);
create index memory_middleware_memory_objects_session_id_idx
  on memory_middleware.memory_objects (session_id);
create index memory_middleware_memory_objects_kind_state_idx
  on memory_middleware.memory_objects (memory_kind, review_state);
create index memory_middleware_memory_objects_review_queue_idx
  on memory_middleware.memory_objects (review_state, created_at desc);
create index memory_middleware_memory_sources_memory_object_id_idx
  on memory_middleware.memory_sources (memory_object_id);
create index memory_middleware_memory_links_source_idx
  on memory_middleware.memory_links (source_memory_object_id);
create index memory_middleware_memory_links_target_memory_idx
  on memory_middleware.memory_links (target_memory_object_id);
create index memory_middleware_memory_reviews_memory_object_id_idx
  on memory_middleware.memory_reviews (memory_object_id);
create index memory_middleware_policies_project_id_idx
  on memory_middleware.policies (project_id);
create index memory_middleware_policies_scope_status_idx
  on memory_middleware.policies (scope, status);
create index memory_middleware_procedures_project_id_idx
  on memory_middleware.procedures (project_id);
create index memory_middleware_procedures_status_created_at_idx
  on memory_middleware.procedures (status, created_at desc);
create index memory_middleware_procedure_runs_procedure_id_idx
  on memory_middleware.procedure_runs (procedure_id);
create index memory_middleware_skill_candidates_source_procedure_id_idx
  on memory_middleware.skill_candidates (source_procedure_id);
create index memory_middleware_skill_candidates_status_created_at_idx
  on memory_middleware.skill_candidates (status, created_at desc);
create index memory_middleware_background_jobs_status_run_after_idx
  on memory_middleware.background_jobs (status, run_after);
create index memory_middleware_agent_state_agent_id_idx
  on memory_middleware.agent_state (agent_id);

create trigger set_projects_updated_at
before update on memory_middleware.projects
for each row execute function memory_middleware.set_updated_at();

create trigger set_agents_updated_at
before update on memory_middleware.agents
for each row execute function memory_middleware.set_updated_at();

create trigger set_sessions_updated_at
before update on memory_middleware.sessions
for each row execute function memory_middleware.set_updated_at();

create trigger set_memory_events_updated_at
before update on memory_middleware.memory_events
for each row execute function memory_middleware.set_updated_at();

create trigger set_tool_results_updated_at
before update on memory_middleware.tool_results
for each row execute function memory_middleware.set_updated_at();

create trigger set_compaction_events_updated_at
before update on memory_middleware.compaction_events
for each row execute function memory_middleware.set_updated_at();

create trigger set_memory_objects_updated_at
before update on memory_middleware.memory_objects
for each row execute function memory_middleware.set_updated_at();

create trigger set_memory_sources_updated_at
before update on memory_middleware.memory_sources
for each row execute function memory_middleware.set_updated_at();

create trigger set_memory_links_updated_at
before update on memory_middleware.memory_links
for each row execute function memory_middleware.set_updated_at();

create trigger set_memory_reviews_updated_at
before update on memory_middleware.memory_reviews
for each row execute function memory_middleware.set_updated_at();

create trigger set_policies_updated_at
before update on memory_middleware.policies
for each row execute function memory_middleware.set_updated_at();

create trigger set_procedures_updated_at
before update on memory_middleware.procedures
for each row execute function memory_middleware.set_updated_at();

create trigger set_procedure_runs_updated_at
before update on memory_middleware.procedure_runs
for each row execute function memory_middleware.set_updated_at();

create trigger set_skill_candidates_updated_at
before update on memory_middleware.skill_candidates
for each row execute function memory_middleware.set_updated_at();

create trigger set_background_jobs_updated_at
before update on memory_middleware.background_jobs
for each row execute function memory_middleware.set_updated_at();

create trigger set_agent_state_updated_at
before update on memory_middleware.agent_state
for each row execute function memory_middleware.set_updated_at();

commit;
