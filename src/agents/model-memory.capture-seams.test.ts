import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildModelMemoryCaptureSeamRecord,
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
    ).toMatchObject({ enabled: false, seamEnabled: false });
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

  it("keeps every declared capture seam default-disabled behind its explicit env switch", () => {
    const seamEnv: Array<[ModelMemoryCaptureSeamName, string]> = [
      ["message:preprocessed", "MODEL_MEMORY_CAPTURE_SEAM_MESSAGE_PREPROCESSED_ENABLED"],
      ["ContextEngine.ingest", "MODEL_MEMORY_CAPTURE_SEAM_CONTEXT_INGEST_ENABLED"],
      ["ContextEngine.ingestBatch", "MODEL_MEMORY_CAPTURE_SEAM_CONTEXT_INGEST_BATCH_ENABLED"],
      ["ContextEngine.assemble", "MODEL_MEMORY_CAPTURE_SEAM_CONTEXT_ASSEMBLE_ENABLED"],
      ["ContextEngine.afterTurn", "MODEL_MEMORY_CAPTURE_SEAM_CONTEXT_AFTER_TURN_ENABLED"],
      ["tool_result_persist", "MODEL_MEMORY_CAPTURE_SEAM_TOOL_RESULT_PERSIST_ENABLED"],
      ["after_tool_call", "MODEL_MEMORY_CAPTURE_SEAM_AFTER_TOOL_CALL_ENABLED"],
      ["agent_end", "MODEL_MEMORY_CAPTURE_SEAM_AGENT_END_ENABLED"],
    ];

    for (const [seamName, envName] of seamEnv) {
      expect(
        resolveModelMemoryCaptureSeamSettings({
          seamName,
          outputDir: tempDir,
          env: { MODEL_MEMORY_CAPTURE_SEAMS_ENABLED: "1" } as NodeJS.ProcessEnv,
        }),
      ).toMatchObject({ enabled: true, seamEnabled: false });
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
    ).resolves.toBeUndefined();

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
