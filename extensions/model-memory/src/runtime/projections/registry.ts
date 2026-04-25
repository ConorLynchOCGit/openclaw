import type { DerivedArtifactRole } from "../../derived-artifact.ts";
import type { MemoryProjectionType } from "../../runtime-read-models.ts";

export type ProjectionArtifactKind = "markdown_page" | "json_digest" | "jsonl_index" | "dashboard";

export type ProjectionFreshnessRule =
  | "memory_event_change"
  | "source_hash_change"
  | "scheduled_refresh"
  | "manual_refresh";

export type ProjectionRetrievalRole =
  | "operating_context"
  | "user_profile"
  | "project_state"
  | "procedure"
  | "source_reference"
  | "episode_continuity"
  | "entity_world"
  | "conflict_dashboard"
  | "digest_index";

export type ProjectionRegistryEntry = {
  projectionType: MemoryProjectionType;
  schemaVersion: "memory_projection.v1";
  humanReadable: boolean;
  machineFacing: boolean;
  compilerInputs: Array<
    "durable_memories" | "memory_events" | "memory_edges" | "source_refs" | "ingest_metadata"
  >;
  artifactOutputs: ProjectionArtifactKind[];
  freshnessRules: ProjectionFreshnessRule[];
  staleRule: string;
  conflictRule: string;
  retrievalRole: ProjectionRetrievalRole;
  runtimeUseCase: string;
  derivedArtifactRoles?: DerivedArtifactRole[];
  generationContextAuthority?: "none" | "thin_renderer_only";
  selectionHints: string[];
  sourceRequirements: {
    requireActiveMemoryIds: boolean;
    requireSourceEventIds: boolean;
    allowConflictedOnlyInConflictSections: boolean;
  };
  artifactPathPrefix: string;
};

export const PROJECTION_REGISTRY: readonly ProjectionRegistryEntry[] = [
  {
    projectionType: "user_profile_page",
    schemaVersion: "memory_projection.v1",
    humanReadable: true,
    machineFacing: true,
    compilerInputs: ["durable_memories", "memory_events", "source_refs"],
    artifactOutputs: ["markdown_page", "json_digest"],
    freshnessRules: ["memory_event_change", "scheduled_refresh"],
    staleRule:
      "stale when any source memory is superseded, deleted, or replaced after compile time",
    conflictRule: "conflicted user preferences appear only in conflict sections",
    retrievalRole: "user_profile",
    runtimeUseCase: "supplies stable user preferences when task-relevant",
    selectionHints: ["preference", "user", "style", "remembered preference"],
    sourceRequirements: {
      requireActiveMemoryIds: true,
      requireSourceEventIds: true,
      allowConflictedOnlyInConflictSections: true,
    },
    artifactPathPrefix: ".openclaw/model-memory/projections/user-profile",
  },
  {
    projectionType: "project_page",
    schemaVersion: "memory_projection.v1",
    humanReadable: true,
    machineFacing: true,
    compilerInputs: [
      "durable_memories",
      "memory_events",
      "memory_edges",
      "source_refs",
      "ingest_metadata",
    ],
    artifactOutputs: ["markdown_page", "json_digest"],
    freshnessRules: ["memory_event_change", "source_hash_change", "scheduled_refresh"],
    staleRule: "stale when project-scoped source ids or source hashes change",
    conflictRule:
      "project conflicts are summarized in conflict markers and omitted from compiled truth",
    retrievalRole: "project_state",
    runtimeUseCase:
      "provides operator/report project-state read-model visibility; rich generation/context compilation belongs to project_state capsules",
    derivedArtifactRoles: ["read_model", "operator_report", "workspace_bootstrap"],
    generationContextAuthority: "thin_renderer_only",
    selectionHints: ["project", "blocker", "decision", "current state"],
    sourceRequirements: {
      requireActiveMemoryIds: true,
      requireSourceEventIds: true,
      allowConflictedOnlyInConflictSections: true,
    },
    artifactPathPrefix: ".openclaw/model-memory/projections/projects",
  },
  {
    projectionType: "procedure_page",
    schemaVersion: "memory_projection.v1",
    humanReadable: true,
    machineFacing: true,
    compilerInputs: ["durable_memories", "memory_events", "memory_edges", "source_refs"],
    artifactOutputs: ["markdown_page", "json_digest"],
    freshnessRules: ["memory_event_change", "source_hash_change"],
    staleRule: "stale when procedure source memory, source ref, or dependency edge changes",
    conflictRule: "conflicting procedure versions require conflict-aware retrieval",
    retrievalRole: "procedure",
    runtimeUseCase: "injects operational runbooks and checklists for repeated workflows",
    selectionHints: ["procedure", "runbook", "checklist", "workflow"],
    sourceRequirements: {
      requireActiveMemoryIds: true,
      requireSourceEventIds: true,
      allowConflictedOnlyInConflictSections: true,
    },
    artifactPathPrefix: ".openclaw/model-memory/projections/procedures",
  },
  {
    projectionType: "source_page",
    schemaVersion: "memory_projection.v1",
    humanReadable: true,
    machineFacing: true,
    compilerInputs: ["durable_memories", "memory_events", "source_refs", "ingest_metadata"],
    artifactOutputs: ["markdown_page", "json_digest"],
    freshnessRules: ["source_hash_change", "memory_event_change"],
    staleRule: "stale when the referenced source hash changes",
    conflictRule: "source-derived conflicting claims are linked but not compiled as current truth",
    retrievalRole: "source_reference",
    runtimeUseCase: "points the agent to canonical docs and source evidence",
    selectionHints: ["source", "doc", "evidence", "reference"],
    sourceRequirements: {
      requireActiveMemoryIds: true,
      requireSourceEventIds: true,
      allowConflictedOnlyInConflictSections: true,
    },
    artifactPathPrefix: ".openclaw/model-memory/projections/sources",
  },
  {
    projectionType: "decision_log",
    schemaVersion: "memory_projection.v1",
    humanReadable: true,
    machineFacing: true,
    compilerInputs: ["durable_memories", "memory_events", "memory_edges", "source_refs"],
    artifactOutputs: ["markdown_page", "json_digest", "jsonl_index"],
    freshnessRules: ["memory_event_change", "scheduled_refresh"],
    staleRule: "stale when a decision memory is corrected, superseded, or deleted",
    conflictRule: "contested decisions are marked and excluded from current-decision summaries",
    retrievalRole: "project_state",
    runtimeUseCase: "supplies prior decisions with conflict and stale markers",
    selectionHints: ["decision", "decided", "prior decision", "stale"],
    sourceRequirements: {
      requireActiveMemoryIds: true,
      requireSourceEventIds: true,
      allowConflictedOnlyInConflictSections: true,
    },
    artifactPathPrefix: ".openclaw/model-memory/projections/decisions",
  },
  {
    projectionType: "timeline_page",
    schemaVersion: "memory_projection.v1",
    humanReadable: true,
    machineFacing: true,
    compilerInputs: ["durable_memories", "memory_events", "memory_edges", "source_refs"],
    artifactOutputs: ["markdown_page", "json_digest"],
    freshnessRules: ["memory_event_change", "scheduled_refresh"],
    staleRule: "stale when episode or event order changes after compile time",
    conflictRule:
      "conflicted episodes are listed only when conflict-aware timeline mode is requested",
    retrievalRole: "episode_continuity",
    runtimeUseCase: "supports what changed and recent continuity queries",
    selectionHints: ["timeline", "changed", "recent", "episode"],
    sourceRequirements: {
      requireActiveMemoryIds: true,
      requireSourceEventIds: true,
      allowConflictedOnlyInConflictSections: true,
    },
    artifactPathPrefix: ".openclaw/model-memory/projections/timelines",
  },
  {
    projectionType: "entity_page",
    schemaVersion: "memory_projection.v1",
    humanReadable: true,
    machineFacing: true,
    compilerInputs: ["durable_memories", "memory_events", "memory_edges", "source_refs"],
    artifactOutputs: ["markdown_page", "json_digest"],
    freshnessRules: ["memory_event_change", "scheduled_refresh"],
    staleRule: "stale when entity claims or same-entity edges change",
    conflictRule: "conflicting entity claims are rendered as contested claims, not current truth",
    retrievalRole: "entity_world",
    runtimeUseCase: "supports what do we know about an entity queries",
    selectionHints: ["entity", "who", "what do we know", "about"],
    sourceRequirements: {
      requireActiveMemoryIds: true,
      requireSourceEventIds: true,
      allowConflictedOnlyInConflictSections: true,
    },
    artifactPathPrefix: ".openclaw/model-memory/projections/entities",
  },
  {
    projectionType: "dashboard",
    schemaVersion: "memory_projection.v1",
    humanReadable: true,
    machineFacing: false,
    compilerInputs: ["durable_memories", "memory_events", "memory_edges", "ingest_metadata"],
    artifactOutputs: ["dashboard", "json_digest"],
    freshnessRules: ["memory_event_change", "scheduled_refresh"],
    staleRule: "stale when the latest compile does not include the latest memory event",
    conflictRule: "dashboards may summarize conflicts but cannot resolve truth",
    retrievalRole: "conflict_dashboard",
    runtimeUseCase: "summarizes health, stale/conflict state, and operator-facing memory status",
    selectionHints: ["dashboard", "health", "conflict", "stale"],
    sourceRequirements: {
      requireActiveMemoryIds: true,
      requireSourceEventIds: false,
      allowConflictedOnlyInConflictSections: true,
    },
    artifactPathPrefix: ".openclaw/model-memory/projections/dashboards",
  },
  {
    projectionType: "agent_digest",
    schemaVersion: "memory_projection.v1",
    humanReadable: false,
    machineFacing: true,
    compilerInputs: ["durable_memories", "memory_events", "memory_edges", "source_refs"],
    artifactOutputs: ["json_digest"],
    freshnessRules: ["memory_event_change", "source_hash_change"],
    staleRule: "stale when any source memory id is no longer active",
    conflictRule: "conflicted inputs are excluded unless a conflict pack is requested",
    retrievalRole: "digest_index",
    runtimeUseCase: "provides compact machine-facing context for agent retrieval",
    selectionHints: ["agent", "digest", "context", "machine"],
    sourceRequirements: {
      requireActiveMemoryIds: true,
      requireSourceEventIds: true,
      allowConflictedOnlyInConflictSections: true,
    },
    artifactPathPrefix: ".openclaw/model-memory/projections/agent-digests",
  },
  {
    projectionType: "projection_digest",
    schemaVersion: "memory_projection.v1",
    humanReadable: false,
    machineFacing: true,
    compilerInputs: ["durable_memories", "memory_events", "memory_edges", "source_refs"],
    artifactOutputs: ["json_digest"],
    freshnessRules: ["memory_event_change", "source_hash_change"],
    staleRule: "stale when source memory ids are missing, inactive, superseded, or deleted",
    conflictRule: "digest marks conflict sources and does not inject them into normal packs",
    retrievalRole: "digest_index",
    runtimeUseCase: "provides compact projection index context for retrieval pack assembly",
    selectionHints: ["projection", "digest", "index", "retrieval"],
    sourceRequirements: {
      requireActiveMemoryIds: true,
      requireSourceEventIds: true,
      allowConflictedOnlyInConflictSections: true,
    },
    artifactPathPrefix: ".openclaw/model-memory/projections/digests",
  },
];

export function getProjectionRegistryEntry(
  projectionType: MemoryProjectionType,
): ProjectionRegistryEntry {
  const entry = PROJECTION_REGISTRY.find(
    (candidate) => candidate.projectionType === projectionType,
  );
  if (!entry) {
    throw new Error(`unknown projection type: ${projectionType}`);
  }
  return entry;
}
