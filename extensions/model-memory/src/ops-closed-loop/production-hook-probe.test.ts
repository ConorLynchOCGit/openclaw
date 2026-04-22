import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildProductionHookProbeRecord,
  readProductionHookProbeRecords,
  recordProductionHookProbe,
  resolveProductionHookProbeSettings,
} from "./production-hook-probe.ts";

describe("production hook probe", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "hook-probe-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("resolves env/config kill switches and output dirs", () => {
    expect(
      resolveProductionHookProbeSettings({
        env: { MODEL_MEMORY_HOOK_PROBE_ENABLED: "1" } as NodeJS.ProcessEnv,
        outputDir: tempDir,
      }),
    ).toEqual({ enabled: true, outputDir: tempDir });
    expect(
      resolveProductionHookProbeSettings({
        config: {
          plugins: {
            entries: {
              "model-memory": {
                config: {
                  hookProbe: { enabled: true, outputDir: "/tmp/probes" },
                },
              },
            },
          },
        },
        env: {} as NodeJS.ProcessEnv,
      }),
    ).toEqual({ enabled: true, outputDir: "/tmp/probes" });
    expect(
      resolveProductionHookProbeSettings({
        env: { MODEL_MEMORY_HOOK_PROBE_ENABLED: "0" } as NodeJS.ProcessEnv,
        outputDir: tempDir,
      }).enabled,
    ).toBe(false);
  });

  it("builds bounded records without raw prompt, transcript, or tool log values", () => {
    const record = buildProductionHookProbeRecord({
      hookName: "after_tool_call",
      triggerSurface: "test",
      observedAt: new Date("2026-04-21T00:00:00.000Z"),
      payload: {
        prompt: "raw prompt must not persist",
        transcript: "raw transcript must not persist",
        raw_tool_log: "tool log must not persist",
        runId: "run-001",
      },
      context: {
        sessionId: "session-001",
        sessionKey: "agent:main:test",
        agentId: "main",
      },
    });
    const serialized = JSON.stringify(record);
    expect(record.verification_level).toBe("production_runtime");
    expect(record.raw_content_persisted).toBe(false);
    expect(record.contains_prompt_text).toBe(false);
    expect(record.contains_transcript).toBe(false);
    expect(record.contains_raw_tool_log).toBe(false);
    expect(record.session_id).toBe("session-001");
    expect(record.run_id).toBe("run-001");
    expect(record.payload_key_paths).toContain("payload.payload.prompt:string");
    expect(serialized).not.toContain("raw prompt must not persist");
    expect(serialized).not.toContain("raw transcript must not persist");
    expect(serialized).not.toContain("tool log must not persist");
  });

  it("hashes dynamic object-key path segments instead of persisting private identifiers", () => {
    const record = buildProductionHookProbeRecord({
      hookName: "message:preprocessed",
      triggerSurface: "test",
      observedAt: new Date("2026-04-21T00:00:00.000Z"),
      payload: {
        cfg: {
          auth: {
            profiles: {
              "openai-codex:user@example.com": { enabled: true },
            },
          },
        },
      },
    });
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain("user@example.com");
    expect(serialized).not.toContain("openai-codex:user");
    expect(record.payload_key_paths.some((entry) => entry.includes("profiles.key#"))).toBe(true);
  });

  it("writes and reads daily JSONL probe records when enabled", async () => {
    await expect(
      recordProductionHookProbe({
        hookName: "message:preprocessed",
        triggerSurface: "test",
        observedAt: new Date("2026-04-21T00:00:00.000Z"),
        payload: { body: "hash me only" },
        context: { sessionKey: "agent:main:test" },
        outputDir: tempDir,
        env: { MODEL_MEMORY_HOOK_PROBE_ENABLED: "1" } as NodeJS.ProcessEnv,
      }),
    ).resolves.toMatchObject({ hook_name: "message:preprocessed" });

    const text = await readFile(path.join(tempDir, "2026-04-21.jsonl"), "utf8");
    expect(text).toContain("model_memory_hook_probe.v1");
    expect(text).not.toContain("hash me only");

    const records = await readProductionHookProbeRecords({ baseDir: tempDir });
    expect(records).toHaveLength(1);
    expect(records[0]?.hook_name).toBe("message:preprocessed");
  });
});
