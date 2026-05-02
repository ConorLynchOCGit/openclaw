import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyModelMemoryMigrations,
  createPgMemTestDatabase,
  MmV2NativeRepository,
  type DurableMemoryRecord,
} from "../../extensions/model-memory/runtime-api.ts";
import { buildMemoryCaptureJob, createMemoryCaptureJobStore } from "./model-memory.capture-jobs.js";
import { createModelMemoryProviderScorecardStore } from "./model-memory.provider-scorecard.js";
import {
  backupModelMemoryOperationalState,
  collectModelMemoryRecoveryReport,
  restoreModelMemoryOperationalState,
} from "./model-memory.recovery.js";
import { createModelMemoryRuntimeDirtyStore } from "./model-memory.runtime-dirty.js";

function buildMinimalDurableMemory(memoryId: string): DurableMemoryRecord {
  return {
    memory_id: memoryId,
    schema_version: "durable_memory.v1",
    status: "active",
    unit_type: "atomic",
    kind: "claim",
    artifact_type: null,
    canonical_text: "The user prefers concise recovery reports.",
    search_text: "user prefers concise recovery reports",
    scope: {
      tenant_id: "openclaw",
      user_id: "unknown-user",
      project_id: null,
      workspace_id: null,
      subject_type: "user",
      subject_id: "user",
      applies_to: "global",
    },
    payload: {
      payload_type: "claim",
      claim_type: "preference_state",
      subject: "user",
      predicate: "prefers",
      object: "concise recovery reports",
      qualifiers: [],
      temporal_status: "currently_true",
    },
    validity: {
      valid_at: null,
      invalid_at: null,
      ttl_seconds: null,
      temporal_status: "current",
    },
    confidence: 0.9,
    quality: {
      atomicity: 0.95,
      specificity: 0.8,
      durability: 0.72,
      actionability: 0.55,
      grounding: 1,
    },
    source_refs: [
      {
        source_ingest_event_id: "source-event-001",
        source_type: "conversation_turn",
        source_id: "source-001",
        speaker: "user",
        created_at: "2026-04-21T00:00:00.000Z",
        segment_id: "segment-001",
        start_char: 0,
        end_char: 0,
        evidence_quote: "I prefer concise recovery reports.",
      },
    ],
    lineage: {
      candidate_ids: ["candidate-001"],
      derived_from_memory_ids: [],
      supersedes_memory_ids: [],
      superseded_by_memory_id: null,
      conflicts_with_memory_ids: [],
      parent_memory_id: null,
      child_memory_ids: [],
    },
    created_at: "2026-04-21T00:00:00.000Z",
    updated_at: "2026-04-21T00:00:00.000Z",
    last_accessed_at: null,
    access_count: 0,
    tags: ["claim"],
  };
}

async function withRecoveryEnv<T>(
  run: (params: { stateDir: string; workspaceRoot: string; env: NodeJS.ProcessEnv }) => Promise<T>,
) {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-recovery-state-"));
  const workspaceRoot = path.join(stateDir, "workspace");
  await fs.mkdir(workspaceRoot, { recursive: true, mode: 0o700 });
  const env = {
    ...process.env,
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_TEST_FAST: "1",
  } as NodeJS.ProcessEnv;
  try {
    return await run({ stateDir, workspaceRoot, env });
  } finally {
    await fs.rm(stateDir, { recursive: true, force: true });
  }
}

describe("model-memory recovery", () => {
  it("classifies replay, rebuild, and corrupt runtime-state surfaces explicitly", async () => {
    await withRecoveryEnv(async ({ env, workspaceRoot }) => {
      const captureStore = createMemoryCaptureJobStore({ env });
      await captureStore.enqueue(
        buildMemoryCaptureJob({
          jobId: "capture_job_replay_needed",
          sourceKind: "ordinary_turn",
        }),
      );

      const dirtyStore = createModelMemoryRuntimeDirtyStore({ env });
      await dirtyStore.markDirty({
        reason: "ordinary_turn_capture_written",
        memoryIds: ["memory-1"],
      });

      const scorecardDir = path.join(
        env.OPENCLAW_STATE_DIR!,
        "model-memory",
        "provider-scorecards",
      );
      await fs.mkdir(scorecardDir, { recursive: true, mode: 0o700 });
      await fs.writeFile(path.join(scorecardDir, "events.jsonl"), '{"provider":"openai"', "utf8");

      const report = await collectModelMemoryRecoveryReport({
        env,
        workspaceRoot,
        projectionVersions: [
          {
            targetId: "memory-md",
            canonicalArtifactPath: ".openclaw/model-memory/projections/memory-md.md",
          },
        ],
      });

      expect(report.summary.phase2EntrySafe).toBe(false);
      expect(
        report.surfaces.find((surface) => surface.surfaceId === "capture_jobs")?.reconcileClass,
      ).toBe("replay_required");
      expect(
        report.surfaces.find((surface) => surface.surfaceId === "runtime_dirty")?.reconcileClass,
      ).toBe("rebuild_required");
      expect(
        report.surfaces.find((surface) => surface.surfaceId === "projection_artifacts")
          ?.reconcileClass,
      ).toBe("rebuild_required");
      expect(
        report.surfaces.find((surface) => surface.surfaceId === "provider_scorecards")
          ?.reconcileClass,
      ).toBe("quarantined_corrupt");
    });
  });

  it("backs up and restores operational memory state into a clean reconcile posture", async () => {
    await withRecoveryEnv(async ({ env, workspaceRoot }) => {
      const captureStore = createMemoryCaptureJobStore({ env });
      const captureJob = buildMemoryCaptureJob({
        jobId: "capture_job_written",
        sourceKind: "ordinary_turn",
      });
      await captureStore.enqueue(captureJob);
      await captureStore.markWritten(captureJob.jobId, {
        safeRelatedIds: { memoryIds: ["memory-1"] },
      });

      const dirtyStore = createModelMemoryRuntimeDirtyStore({ env });
      await dirtyStore.markDirty({
        reason: "ordinary_turn_capture_written",
        memoryIds: ["memory-1"],
      });
      await dirtyStore.clearDirty();

      const scorecardStore = createModelMemoryProviderScorecardStore({ env });
      await scorecardStore.record({
        schemaVersion: 1,
        observedAt: "2026-04-24T00:00:00.000Z",
        status: "success",
        requestedModelId: "openai-codex/gpt-5.4-mini",
        provider: "openai",
        providerModel: "gpt-5.4-mini",
        rawContentPersisted: false,
        containsPromptText: false,
        containsTranscript: false,
        containsRawToolLog: false,
      });

      const projectionRoot = path.join(workspaceRoot, ".openclaw", "model-memory", "projections");
      await fs.mkdir(projectionRoot, { recursive: true, mode: 0o700 });
      const markdownRelativePath = ".openclaw/model-memory/projections/memory-md.md";
      const jsonRelativePath = ".openclaw/model-memory/projections/memory-md.json";
      await fs.writeFile(path.join(workspaceRoot, markdownRelativePath), "# MEMORY.md\n", "utf8");
      await fs.writeFile(
        path.join(workspaceRoot, jsonRelativePath),
        `${JSON.stringify({ projection_id: "projection-memory", target_id: "memory-md" }, null, 2)}\n`,
        "utf8",
      );
      await fs.writeFile(
        path.join(projectionRoot, "index.json"),
        `${JSON.stringify(
          {
            schema_version: "memory_projection_artifact_index.v1",
            generated_at: "2026-04-24T00:00:00.000Z",
            projection_count: 1,
            artifact_entries: [
              {
                target_id: "memory-md",
                markdown_path: markdownRelativePath,
                json_path: jsonRelativePath,
              },
            ],
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      const backupDir = path.join(env.OPENCLAW_STATE_DIR!, "recovery-proof-backup");
      await backupModelMemoryOperationalState({ backupDir, env, workspaceRoot });

      await fs.rm(path.join(env.OPENCLAW_STATE_DIR!, "model-memory"), {
        recursive: true,
        force: true,
      });
      await fs.rm(path.join(workspaceRoot, ".openclaw"), { recursive: true, force: true });

      await restoreModelMemoryOperationalState({ backupDir, env, workspaceRoot });
      const report = await collectModelMemoryRecoveryReport({
        env,
        workspaceRoot,
        projectionVersions: [
          {
            targetId: "memory-md",
            canonicalArtifactPath: markdownRelativePath,
          },
        ],
      });

      expect(report.summary.phase2EntrySafe).toBe(true);
      expect(report.summary.overallReconcileClass).toBe("clean");
      expect(
        report.surfaces.every(
          (surface) =>
            surface.surfaceId === "durable_mmv2_db" || surface.reconcileClass === "clean",
        ),
      ).toBe(true);
    });
  });

  it("proves durable MMV2 DB restore using an isolated pg-mem backup snapshot", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new MmV2NativeRepository(database.sql);

      await repository.persistSource({
        id: "source-001",
        sourceKind: "document",
        externalSourceId: "doc-001",
        sourceFingerprint: "fingerprint-001",
        projectId: "project-001",
        sessionId: undefined,
        sourceMetadata: {},
        createdAt: new Date("2026-04-20T00:00:00.000Z"),
      });
      await repository.persistSourceWindows([
        {
          id: "segment-001",
          sourceId: "source-001",
          windowIndex: 0,
          normalizedText: "Recovery docs matter.",
          normalizedFingerprint: "segment-fingerprint-001",
          tokenEstimate: 4,
          headingPath: ["Recovery"],
          blockDescriptors: [],
          lineStart: 1,
          lineEnd: 1,
          createdAt: new Date("2026-04-20T00:00:00.000Z"),
        },
      ]);
      await repository.upsertDurableMemory(buildMinimalDurableMemory("memory-before-backup"));

      const snapshot = database.db.backup();
      await repository.upsertDurableMemory(buildMinimalDurableMemory("memory-after-backup"));
      expect((await repository.listDurableMemories()).map((entry) => entry.memory_id)).toEqual([
        "memory-after-backup",
        "memory-before-backup",
      ]);

      snapshot.restore();

      const restoredRepository = new MmV2NativeRepository(database.sql);
      expect(
        (await restoredRepository.listDurableMemories()).map((entry) => entry.memory_id),
      ).toEqual(["memory-before-backup"]);
    } finally {
      await database.close();
    }
  });
});
