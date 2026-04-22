import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MODEL_MEMORY_CAPTURE_SEAM_POLICIES,
  buildModelMemoryCaptureSeamDedupeKey,
  buildModelMemoryCaptureSeamRecord,
  getModelMemoryCaptureSeamPolicy,
  type ModelMemoryCaptureSeamName,
  recordModelMemoryCaptureSeamEvidence,
  resolveModelMemoryCaptureSeamSettings,
} from "./model-memory.capture-seams.js";

describe("model-memory capture seam wiring", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "model-memory-capture-seam-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("requires global and seam-specific kill switches", () => {
    expect(
      resolveModelMemoryCaptureSeamSettings({
        seamName: "message:preprocessed",
        outputDir: tempDir,
        env: {} as NodeJS.ProcessEnv,
      }),
    ).toMatchObject({ enabled: false, seamEnabled: true });
    expect(
      resolveModelMemoryCaptureSeamSettings({
        seamName: "message:preprocessed",
        outputDir: tempDir,
        env: {
          MODEL_MEMORY_CAPTURE_SEAMS_ENABLED: "1",
          MODEL_MEMORY_CAPTURE_SEAM_MESSAGE_PREPROCESSED_ENABLED: "1",
        } as NodeJS.ProcessEnv,
      }),
    ).toEqual({ enabled: true, seamEnabled: true, outputDir: tempDir });
    expect(
      resolveModelMemoryCaptureSeamSettings({
        seamName: "ContextEngine.ingest",
        outputDir: tempDir,
        env: {
          MODEL_MEMORY_CAPTURE_SEAMS_ENABLED: "1",
          MODEL_MEMORY_CAPTURE_SEAM_CONTEXT_INGEST_ENABLED: "1",
        } as NodeJS.ProcessEnv,
      }),
    ).toEqual({ enabled: true, seamEnabled: true, outputDir: tempDir });
    expect(
      resolveModelMemoryCaptureSeamSettings({
        seamName: "ContextEngine.ingestBatch",
        outputDir: tempDir,
        env: {
          MODEL_MEMORY_CAPTURE_SEAMS_ENABLED: "1",
          MODEL_MEMORY_CAPTURE_SEAM_CONTEXT_INGEST_BATCH_ENABLED: "1",
        } as NodeJS.ProcessEnv,
      }),
    ).toEqual({ enabled: true, seamEnabled: true, outputDir: tempDir });
  });

  it("activates eligible seams behind the global switch and keeps raw ingress fallbacks disabled", () => {
    const seamEnv: Array<[ModelMemoryCaptureSeamName, string]> = [
      ["message:received", "MODEL_MEMORY_CAPTURE_SEAM_MESSAGE_RECEIVED_ENABLED"],
      ["message:transcribed", "MODEL_MEMORY_CAPTURE_SEAM_MESSAGE_TRANSCRIBED_ENABLED"],
      ["message:preprocessed", "MODEL_MEMORY_CAPTURE_SEAM_MESSAGE_PREPROCESSED_ENABLED"],
      ["ContextEngine.ingest", "MODEL_MEMORY_CAPTURE_SEAM_CONTEXT_INGEST_ENABLED"],
      ["ContextEngine.ingestBatch", "MODEL_MEMORY_CAPTURE_SEAM_CONTEXT_INGEST_BATCH_ENABLED"],
      ["ContextEngine.assemble", "MODEL_MEMORY_CAPTURE_SEAM_CONTEXT_ASSEMBLE_ENABLED"],
      ["ContextEngine.afterTurn", "MODEL_MEMORY_CAPTURE_SEAM_CONTEXT_AFTER_TURN_ENABLED"],
      ["tool_result_persist", "MODEL_MEMORY_CAPTURE_SEAM_TOOL_RESULT_PERSIST_ENABLED"],
      ["after_tool_call", "MODEL_MEMORY_CAPTURE_SEAM_AFTER_TOOL_CALL_ENABLED"],
      ["agent_end", "MODEL_MEMORY_CAPTURE_SEAM_AGENT_END_ENABLED"],
      ["agent:bootstrap", "MODEL_MEMORY_CAPTURE_SEAM_AGENT_BOOTSTRAP_ENABLED"],
      ["memory_file_import", "MODEL_MEMORY_CAPTURE_SEAM_MEMORY_FILE_IMPORT_ENABLED"],
    ];

    for (const [seamName, envName] of seamEnv) {
      const policy = getModelMemoryCaptureSeamPolicy(seamName);
      expect(
        resolveModelMemoryCaptureSeamSettings({
          seamName,
          outputDir: tempDir,
          env: { MODEL_MEMORY_CAPTURE_SEAMS_ENABLED: "1" } as NodeJS.ProcessEnv,
        }),
      ).toMatchObject({
        enabled: true,
        seamEnabled: policy.status === "active",
      });
      expect(
        resolveModelMemoryCaptureSeamSettings({
          seamName,
          outputDir: tempDir,
          env: {
            MODEL_MEMORY_CAPTURE_SEAMS_ENABLED: "1",
            [envName]: "1",
          } as NodeJS.ProcessEnv,
        }),
      ).toEqual({ enabled: true, seamEnabled: true, outputDir: tempDir });
    }
  });

  it("documents kill switches, rollback, dedupe, and MMV2-native posture for every seam", () => {
    expect(MODEL_MEMORY_CAPTURE_SEAM_POLICIES.map((entry) => entry.seamName)).toEqual([
      "message:received",
      "message:transcribed",
      "message:preprocessed",
      "ContextEngine.ingest",
      "ContextEngine.ingestBatch",
      "ContextEngine.assemble",
      "ContextEngine.afterTurn",
      "tool_result_persist",
      "after_tool_call",
      "agent_end",
      "agent:bootstrap",
      "memory_file_import",
    ]);
    for (const policy of MODEL_MEMORY_CAPTURE_SEAM_POLICIES) {
      expect(policy.globalKillSwitch).toBe("MODEL_MEMORY_CAPTURE_SEAMS_ENABLED");
      expect(policy.seamKillSwitch).toMatch(/^MODEL_MEMORY_CAPTURE_SEAM_/u);
      expect(policy.noRawDataAllowed).toBe(true);
      expect(policy.independentRollback).toBe(true);
      expect(policy.dedupeRequired).toBe(true);
    }
    expect(getModelMemoryCaptureSeamPolicy("message:received").status).toBe("fallback_only");
    expect(getModelMemoryCaptureSeamPolicy("message:transcribed").status).toBe("fallback_only");
    expect(getModelMemoryCaptureSeamPolicy("message:preprocessed").status).toBe("active");
  });

  it("builds stable cross-seam dedupe keys from safe authority ids", () => {
    const key = buildModelMemoryCaptureSeamDedupeKey({
      seamName: "ContextEngine.ingestBatch",
      sourceHash: "a".repeat(64),
      sessionId: "session-1",
    });
    expect(key).toHaveLength(64);
    expect(
      buildModelMemoryCaptureSeamDedupeKey({
        seamName: "ContextEngine.ingestBatch",
        sourceHash: "a".repeat(64),
        sessionId: "session-1",
      }),
    ).toBe(key);
    expect(
      buildModelMemoryCaptureSeamDedupeKey({
        seamName: "agent_end",
        sourceHash: "a".repeat(64),
        sessionId: "session-1",
      }),
    ).not.toBe(key);
  });

  it("does not persist raw prompt, transcript, tool log, or dynamic key identifiers", () => {
    const record = buildModelMemoryCaptureSeamRecord({
      seamName: "tool_result_persist",
      triggerSurface: "test",
      observedAt: new Date("2026-04-21T00:00:00.000Z"),
      payload: {
        prompt: "raw prompt must not persist",
        transcript: "raw transcript must not persist",
        raw_tool_log: "tool log must not persist",
        cfg: {
          auth: {
            profiles: {
              "openai-codex:user@example.com": { enabled: true },
            },
          },
        },
      },
      context: { sessionId: "session-1", sessionKey: "agent:main:test" },
    });
    const serialized = JSON.stringify(record);
    expect(record.raw_content_persisted).toBe(false);
    expect(record.semantic_memory_write_attempted).toBe(false);
    expect(record.durable_memory_write_attempted).toBe(false);
    expect(record.session_id).toBe("session-1");
    expect(serialized).not.toContain("raw prompt must not persist");
    expect(serialized).not.toContain("raw transcript must not persist");
    expect(serialized).not.toContain("tool log must not persist");
    expect(serialized).not.toContain("user@example.com");
    expect(record.payload_key_paths.some((entry) => entry.includes("profiles.key#"))).toBe(true);
  });

  it("writes bounded evidence only when enabled", async () => {
    await expect(
      recordModelMemoryCaptureSeamEvidence({
        seamName: "agent_end",
        triggerSurface: "test",
        payload: { finalText: "do not persist this exact text" },
        outputDir: tempDir,
        env: { MODEL_MEMORY_CAPTURE_SEAMS_ENABLED: "1" } as NodeJS.ProcessEnv,
      }),
    ).resolves.toMatchObject({ seam_name: "agent_end" });

    await expect(
      recordModelMemoryCaptureSeamEvidence({
        seamName: "agent_end",
        triggerSurface: "test",
        observedAt: new Date("2026-04-21T00:00:00.000Z"),
        payload: { finalText: "do not persist this exact text" },
        outputDir: tempDir,
        env: {
          MODEL_MEMORY_CAPTURE_SEAMS_ENABLED: "1",
          MODEL_MEMORY_CAPTURE_SEAM_AGENT_END_ENABLED: "1",
        } as NodeJS.ProcessEnv,
      }),
    ).resolves.toMatchObject({ seam_name: "agent_end" });

    const text = await readFile(path.join(tempDir, "2026-04-21.jsonl"), "utf8");
    expect(text).toContain("model_memory_capture_seam.v1");
    expect(text).not.toContain("do not persist this exact text");
  });
});
