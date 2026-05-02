import { describe, expect, it } from "vitest";
import {
  buildBoundedToolResultProofFact,
  buildToolResultProofLiveCapture,
} from "./tool-result-proof-capture.ts";

describe("tool-result proof capture", () => {
  it("builds durable MMV2 proof from bounded artifact facts without raw tool output", () => {
    const built = buildToolResultProofLiveCapture({
      toolName: "list_projection_artifacts",
      toolCallId: "tool-call-001",
      runId: "run-001",
      sessionId: "session-001",
      sessionKey: "agent:main:test",
      agentId: "agent-001",
      observedAt: new Date("2026-04-21T12:00:00.000Z"),
      result: {
        details: {
          status: "success",
          artifactPath: ".openclaw/model-memory/projections/index.json",
          fileCount: 17,
        },
        output: "private raw tool log must not persist: temporary-private-tool-output-secret",
      },
    });

    expect(built).toBeDefined();
    expect(built?.boundedFact).toEqual(
      expect.objectContaining({
        status: "success",
        toolName: "list_projection_artifacts",
        artifactPaths: [".openclaw/model-memory/projections/index.json"],
        fileCount: 17,
      }),
    );
    expect(built?.liveMemoryBatch.durableMemories).toHaveLength(1);
    expect(built?.liveMemoryBatch.memoryEvents).toHaveLength(1);
    expect(built?.liveMemoryBatch.durableMemories[0]).toEqual(
      expect.objectContaining({
        status: "active",
        kind: "source_ref",
      }),
    );

    const serialized = JSON.stringify(built);
    expect(serialized).toContain(".openclaw/model-memory/projections/index.json");
    expect(serialized).toContain("File count: 17");
    expect(serialized).not.toContain("temporary-private-tool-output-secret");
    expect(serialized).not.toContain("private raw tool log must not persist");
    expect(serialized).toContain("rawToolLogPersisted");
    expect(built?.source.sourceMetadata).toEqual(
      expect.objectContaining({
        captureSeam: "tool_result_proof",
        rawPromptPersisted: false,
        rawTranscriptPersisted: false,
        rawToolLogPersisted: false,
      }),
    );
  });

  it("skips successful tool results with no bounded fact", () => {
    const built = buildToolResultProofLiveCapture({
      toolName: "chatty_tool",
      observedAt: new Date("2026-04-21T12:00:00.000Z"),
      result: {
        details: { status: "success" },
        output: "completed successfully with no durable locator or count",
      },
    });

    expect(built).toBeUndefined();
  });

  it("accepts the container workspace projection path alias as bounded artifact evidence", () => {
    const fact = buildBoundedToolResultProofFact({
      toolName: "list_projection_artifacts",
      observedAt: new Date("2026-04-21T12:00:00.000Z"),
      result: {
        output: [
          "Path: /home/node/.openclaw/workspace/.openclaw/model-memory/projections",
          "index.json exists: yes",
          "file count: 13",
        ].join("\n"),
      },
    });

    expect(fact?.artifactPaths).toEqual([
      "/home/node/.openclaw/workspace/.openclaw/model-memory/projections",
    ]);
    expect(fact?.fileCount).toBe(13);
  });

  it("captures bounded failure class without copying raw failure logs", () => {
    const fact = buildBoundedToolResultProofFact({
      toolName: "build",
      observedAt: new Date("2026-04-21T12:00:00.000Z"),
      isError: true,
      result: {
        details: { status: "failed", errorClass: "CommandFailed", exitCode: 2 },
        stderr: "raw compiler output with secret-ish stack details must not persist",
      },
    });

    expect(fact).toEqual(
      expect.objectContaining({
        status: "failure",
        errorClass: "CommandFailed",
        exitCode: 2,
      }),
    );
    const built = buildToolResultProofLiveCapture({
      toolName: "build",
      observedAt: new Date("2026-04-21T12:00:00.000Z"),
      isError: true,
      result: {
        details: { status: "failed", errorClass: "CommandFailed", exitCode: 2 },
        stderr: "raw compiler output with secret-ish stack details must not persist",
      },
    });

    expect(built?.liveMemoryBatch.durableMemories[0]?.kind).toBe("episode");
    const serialized = JSON.stringify(built);
    expect(serialized).toContain("Error class: CommandFailed");
    expect(serialized).not.toContain("raw compiler output");
    expect(serialized).not.toContain("secret-ish stack details");
  });

  it("captures bounded host-operator schema failures without raw tool params", () => {
    const fact = buildBoundedToolResultProofFact({
      toolName: "host_operator_repo",
      observedAt: new Date("2026-04-23T04:27:00.000Z"),
      isError: true,
      result: {
        status: "error",
        tool: "host_operator_repo",
        error: 'install_skill requires top-level content or files[{path:"SKILL.md",content}]',
        input: {
          keys: ["action", "content", "scope", "skillName"],
          action: "install_skill",
          scope: "live_repo",
          skillName: "web-researcher",
          content: "<redacted:1220b>",
        },
      },
    });

    expect(fact).toEqual(
      expect.objectContaining({
        status: "failure",
        toolName: "host_operator_repo",
        actionName: "install_skill",
      }),
    );
    const built = buildToolResultProofLiveCapture({
      toolName: "host_operator_repo",
      observedAt: new Date("2026-04-23T04:27:00.000Z"),
      isError: true,
      result: {
        status: "error",
        tool: "host_operator_repo",
        error: 'install_skill requires top-level content or files[{path:"SKILL.md",content}]',
        input: {
          keys: ["action", "content", "scope", "skillName"],
          action: "install_skill",
          scope: "live_repo",
          skillName: "web-researcher",
          content: "<redacted:1220b>",
        },
      },
    });

    const serialized = JSON.stringify(built);
    expect(serialized).toContain("Action: install_skill");
    expect(serialized).not.toContain("Full skill body");
    expect(serialized).not.toContain("---\\nname:");
  });

  it("captures runtime dirty EACCES as a bounded operational blocker", () => {
    const built = buildToolResultProofLiveCapture({
      toolName: "model_memory_runtime_dirty",
      observedAt: new Date("2026-04-23T05:00:00.000Z"),
      isError: true,
      result: {
        status: "error",
        code: "EACCES",
        error:
          "EACCES: permission denied, open '/home/node/.openclaw/model-memory/runtime-dirty/state.json'",
      },
    });

    expect(built?.boundedFact).toEqual(
      expect.objectContaining({
        status: "failure",
        errorClass: "EACCES",
        pathCategory: "runtime_dirty_state",
      }),
    );
    const serialized = JSON.stringify(built);
    expect(serialized).toContain("runtime_dirty_state");
    expect(serialized).not.toContain("Remediation:");
    expect(serialized).not.toContain("raw tool log");
  });
});
