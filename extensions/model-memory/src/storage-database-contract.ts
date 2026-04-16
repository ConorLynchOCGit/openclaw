import { z } from "zod";

export const ModelMemorySourceKindSchema = z.enum([
  "document",
  "ordinary_turn",
  "daily_continuity",
]);
export type ModelMemorySourceKind = z.infer<typeof ModelMemorySourceKindSchema>;

export const ModelMemoryLifecycleStateSchema = z.enum([
  "provisional",
  "active",
  "superseded",
  "expired",
  "conflict_hold",
]);
export type ModelMemoryLifecycleState = z.infer<typeof ModelMemoryLifecycleStateSchema>;

export const ModelMemoryActivationBasisSchema = z.enum([
  "primary_capture",
  "support_attachment",
  "daily_recovery_candidate",
  "collision_conflict",
]);
export type ModelMemoryActivationBasis = z.infer<typeof ModelMemoryActivationBasisSchema>;

export const ModelMemorySupportKindSchema = z.enum([
  "origin_capture",
  "independent_reinforcement",
  "same_source_rerun",
  "daily_recovery",
]);
export type ModelMemorySupportKind = z.infer<typeof ModelMemorySupportKindSchema>;

export type ModelMemorySourceRecord = {
  id: string;
  sourceKind: ModelMemorySourceKind;
  externalSourceId?: string;
  sourceFingerprint: string;
  projectId?: string;
  sessionId?: string;
  sourceMetadata: Record<string, unknown>;
  createdAt: Date;
};

export type ModelMemorySourceWindowRecord = {
  id: string;
  sourceId: string;
  windowIndex: number;
  normalizedText: string;
  normalizedFingerprint: string;
  tokenEstimate: number;
  headingPath: string[];
  blockDescriptors: Array<Record<string, unknown>>;
  lineStart?: number;
  lineEnd?: number;
  createdAt: Date;
};

export type ModelMemoryObjectRecord = {
  id: string;
  sourceWindowId?: string;
  canonicalClass: string;
  kind: string;
  payload: Record<string, unknown>;
  normalizedSubject?: string;
  normalizedTitle?: string;
  normalizedSearchText: string;
  scope: Record<string, unknown>;
  scopeKey?: string;
  provenance?: Array<Record<string, unknown>>;
  lifecycleState?: ModelMemoryLifecycleState;
  activationBasis?: ModelMemoryActivationBasis;
  confidence: string;
  durability: string;
  suggestedReviewMode: string;
  executedReviewMode: string;
  rationaleCodes: string[];
  identityKey: string;
  slotKey?: string;
  contractName: string;
  contractVersion: string;
  modelId: string;
  createdAt: Date;
  activatedAt?: Date;
  expiredAt?: Date;
  supersededAt?: Date;
};

export type ModelMemorySupportItemRecord = {
  id: string;
  memoryObjectId: string;
  sourceWindowId: string;
  provenance: Array<Record<string, unknown>>;
  supportFingerprint: string;
  supportKind: ModelMemorySupportKind;
  countsForReinforcement: boolean;
  derivedFromSourceKind: ModelMemorySourceKind;
  createdAt: Date;
};

export type ModelMemoryWriteEventRecord = {
  id: string;
  sourceWindowId: string;
  candidateIdentityKey?: string;
  decision: string;
  memoryObjectId?: string;
  supersededObjectId?: string;
  supportItemId?: string;
  decisionCodes: string[];
  contractName: string;
  contractVersion: string;
  modelId: string;
  createdAt: Date;
};

export type ModelMemorySupersessionLinkRecord = {
  id: string;
  priorObjectId: string;
  replacementObjectId: string;
  reasonCode: string;
  createdAt: Date;
};

export type TableContract = {
  tableName: string;
  schemaName: string;
  columns: string[];
};

export const CANONICAL_TABLE_CONTRACTS = {
  sources: {
    schemaName: "model_memory",
    tableName: "sources",
    columns: [
      "id",
      "source_kind",
      "external_source_id",
      "source_fingerprint",
      "project_id",
      "session_id",
      "source_metadata",
      "created_at",
    ],
  },
  sourceWindows: {
    schemaName: "model_memory",
    tableName: "source_windows",
    columns: [
      "id",
      "source_id",
      "window_index",
      "normalized_text",
      "normalized_fingerprint",
      "token_estimate",
      "heading_path",
      "block_descriptors",
      "line_start",
      "line_end",
      "created_at",
    ],
  },
  memoryObjects: {
    schemaName: "model_memory",
    tableName: "memory_objects",
    columns: [
      "id",
      "canonical_class",
      "kind",
      "payload",
      "normalized_subject",
      "normalized_title",
      "normalized_search_text",
      "scope",
      "scope_key",
      "confidence",
      "durability",
      "suggested_review_mode",
      "executed_review_mode",
      "rationale_codes",
      "identity_key",
      "slot_key",
      "contract_name",
      "contract_version",
      "model_id",
      "created_at",
      "superseded_at",
      "lifecycle_state",
      "activation_basis",
      "activated_at",
      "expired_at",
    ],
  },
  memorySupportItems: {
    schemaName: "model_memory",
    tableName: "memory_support_items",
    columns: [
      "id",
      "memory_object_id",
      "source_window_id",
      "provenance",
      "support_fingerprint",
      "support_kind",
      "counts_for_reinforcement",
      "derived_from_source_kind",
      "created_at",
    ],
  },
  writeEvents: {
    schemaName: "model_memory",
    tableName: "write_events",
    columns: [
      "id",
      "source_window_id",
      "candidate_identity_key",
      "decision",
      "memory_object_id",
      "superseded_object_id",
      "decision_codes",
      "contract_name",
      "contract_version",
      "model_id",
      "created_at",
      "support_item_id",
    ],
  },
  supersessionLinks: {
    schemaName: "model_memory",
    tableName: "supersession_links",
    columns: ["id", "prior_object_id", "replacement_object_id", "reason_code", "created_at"],
  },
} satisfies Record<string, TableContract>;
