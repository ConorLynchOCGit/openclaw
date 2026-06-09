import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureEnv } from "../test-utils/env.js";
import { resetProcessRegistryForTests } from "./bash-process-registry.js";
import { buildExecForegroundResult } from "./bash-tools.exec.js";
import { createExecTool } from "./bash-tools.exec.js";
import { resolveShellFromPath } from "./shell-utils.js";

const isWin = process.platform === "win32";
const defaultShell = isWin
  ? undefined
  : process.env.OPENCLAW_TEST_SHELL || resolveShellFromPath("bash") || process.env.SHELL || "sh";
const longDelayCmd = isWin ? "Start-Sleep -Seconds 5" : "sleep 5";

describe("exec foreground failures", () => {
  let envSnapshot: ReturnType<typeof captureEnv>;

  beforeEach(() => {
    vi.useRealTimers();
    envSnapshot = captureEnv(["SHELL"]);
    if (!isWin && defaultShell) {
      process.env.SHELL = defaultShell;
    }
    resetProcessRegistryForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    envSnapshot.restore();
  });

  it("returns a failed text result when the default timeout is exceeded", async () => {
    const tool = createExecTool({
      security: "full",
      ask: "off",
      timeoutSec: 0.05,
      backgroundMs: 10,
      allowBackground: false,
    });

    const result = await tool.execute("call-timeout", {
      command: longDelayCmd,
    });

    expect(result.content[0]).toMatchObject({ type: "text" });
    expect((result.content[0] as { text?: string }).text).toMatch(/timed out/i);
    expect((result.content[0] as { text?: string }).text).toMatch(/re-run with a higher timeout/i);
    expect(result.details).toMatchObject({
      status: "failed",
      exitCode: null,
      aggregated: "",
    });
    expect((result.details as { durationMs?: number }).durationMs).toEqual(expect.any(Number));
  });
});

describe("buildExecForegroundResult", () => {
  it("returns a tail preview and truncation metadata for oversized foreground output", () => {
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-exec-managed-output-"));
    const output = `${"x".repeat(60 * 1024)}\nDONE`;
    try {
      const result = buildExecForegroundResult({
        outcome: {
          status: "completed",
          exitCode: 0,
          exitSignal: null,
          durationMs: 123,
          aggregated: output,
          timedOut: false,
        },
        cwd: "/repo",
        stateRoot,
        sessionKey: "agent:execution-validation-scout:subagent:test",
        toolCallId: "call-exec",
      });

      const text = (result.content[0] as { text?: string }).text ?? "";
      expect(text).toContain("Exec output truncated for model context");
      expect(text).toContain("managedOutputRef=openclaw-managed-output://");
      expect(text).toContain("DONE");
      expect(text.length).toBeLessThan(output.length);
      expect(result.details).toMatchObject({
        status: "completed",
        exitCode: 0,
        timedOut: false,
        truncated: true,
        totalOutputChars: output.length,
        cwd: "/repo",
        managedOutputRef: expect.stringContaining("openclaw-managed-output://"),
        managedOutputBytes: Buffer.byteLength(output, "utf8"),
        managedOutputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      });

      const outputDir = path.join(stateRoot, "managed-tool-output");
      expect(fs.existsSync(outputDir)).toBe(true);
    } finally {
      fs.rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it("keeps failed timeout metadata separate from bootstrap/provider failures", () => {
    const result = buildExecForegroundResult({
      outcome: {
        status: "failed",
        exitCode: null,
        exitSignal: "SIGKILL",
        durationMs: 456,
        aggregated: "partial output",
        timedOut: true,
        failureKind: "overall-timeout",
        reason: "partial output\n\nCommand timed out after 30 seconds",
      },
      cwd: "/repo",
    });

    const text = (result.content[0] as { text?: string }).text ?? "";
    expect(text).toContain("Command timed out after 30 seconds");
    expect(result.details).toMatchObject({
      status: "failed",
      exitCode: null,
      exitSignal: "SIGKILL",
      timedOut: true,
      failureKind: "overall-timeout",
      truncated: false,
      managedOutputRef: null,
    });
  });
});
