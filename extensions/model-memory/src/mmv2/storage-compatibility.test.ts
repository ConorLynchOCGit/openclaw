import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { DurableMemoryRecord } from "./contracts.ts";
import { projectDurableMemoryToLegacyRecord } from "./storage-compatibility.ts";

const repoRoot = resolve(import.meta.dirname, "../../../..");

function durableMemory(overrides: Partial<DurableMemoryRecord> = {}): DurableMemoryRecord {
  return {
    memory_id: overrides.memory_id ?? "memory-compat-001",
    schema_version: "durable_memory.v1",
    status: overrides.status ?? "active",
    unit_type: overrides.unit_type ?? "atomic",
    kind: overrides.kind ?? "claim",
    artifact_type: overrides.artifact_type ?? null,
    canonical_text:
      overrides.canonical_text ?? "The model-memory runtime projection path is artifact-only.",
    search_text: overrides.search_text ?? "model memory runtime projection path artifact only",
    scope: overrides.scope ?? {
      tenant_id: "openclaw",
      user_id: "unknown-user",
      project_id: "project-001",
      workspace_id: "workspace-001",
      subject_type: "project",
      subject_id: "project-001",
      applies_to: "current_project",
    },
    payload: overrides.payload ?? {
      claim_type: "project_fact",
      subject: "runtime projection path",
      predicate: "is",
      object: "artifact-only",
    },
    validity: overrides.validity ?? {
      valid_at: "2026-04-22T00:00:00.000Z",
      invalid_at: null,
      ttl_seconds: null,
      temporal_status: "current",
    },
    confidence: overrides.confidence ?? 0.92,
    quality: overrides.quality ?? {
      atomicity: 0.9,
      specificity: 0.9,
      durability: 0.9,
      actionability: 0.9,
      grounding: 0.9,
    },
    source_refs: overrides.source_refs ?? [
      {
        source_ingest_event_id: "source-event-001",
        source_type: "document",
        source_id: "source-001",
        speaker: "system",
        created_at: "2026-04-22T00:00:00.000Z",
        segment_id: "segment-001",
        start_char: 0,
        end_char: 64,
        evidence_quote: "projection path is artifact-only",
      },
    ],
    lineage: overrides.lineage ?? {
      candidate_ids: [],
      derived_from_memory_ids: [],
      supersedes_memory_ids: [],
      superseded_by_memory_id: null,
      conflicts_with_memory_ids: [],
      parent_memory_id: null,
      child_memory_ids: [],
    },
    created_at: overrides.created_at ?? "2026-04-22T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-04-22T00:00:00.000Z",
    last_accessed_at: overrides.last_accessed_at ?? null,
    access_count: overrides.access_count ?? 0,
    tags: overrides.tags ?? [],
  };
}

describe("MMV2 storage compatibility quarantine", () => {
  it("projects durable memories through structural identity without legacy semantic identity imports", () => {
    const source = readFileSync(
      resolve(repoRoot, "extensions/model-memory/src/mmv2/storage-compatibility.ts"),
      "utf8",
    );

    expect(source).not.toContain("../semantic-identity.ts");
    expect(source).not.toContain("deriveMemoryIdentity");

    const record = projectDurableMemoryToLegacyRecord(durableMemory());

    expect(record.id).toBe("memory-compat-001");
    expect(record.normalizedSubject).toBe("runtime projection path");
    expect(record.normalizedSearchText).toContain("artifact-only");
    expect(record.scopeKey).toMatch(/^[0-9a-f-]{36}$/u);
    expect(record.identityKey).toMatch(/^[0-9a-f-]{36}$/u);
    expect(record.slotKey).toMatch(/^[0-9a-f-]{36}$/u);
    expect(record.lifecycleState).toBe("active");
  });
});
