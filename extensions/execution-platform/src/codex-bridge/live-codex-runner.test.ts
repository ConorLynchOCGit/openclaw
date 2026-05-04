import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  LiveCodexRunner,
  createCompletedWorkPathContract,
  createOperatorAcceptanceMetadata,
  validateLiveCodexRunnerReadiness,
  type CodexProcessDescriptor,
  type CodexRunnerChildProcess,
  type CodexRunnerSpawn,
  type CodexRunnerSpawnOptions,
  type ObserveOnlyPilotGateResult,
} from "./index.ts";

const repoPath = "/root/services/openclaw-roles/live";
const testNow = () => new Date("2026-05-02T00:00:00.000Z");

function baseAudit() {
  return {
    codexCliInvoked: false,
    acpSessionStarted: false,
    shellCommandExecuted: false,
    providerCallMade: false,
    rebuildPerformed: false,
    schedulerStarted: false,
    daemonStarted: false,
    subagentStarted: false,
    liveExecutionEnabled: false,
    commandExecuted: false,
  } as const;
}

function descriptor(overrides: Partial<CodexProcessDescriptor> = {}): CodexProcessDescriptor {
  return {
    artifactKind: "codex_process_descriptor",
    descriptorId: "codex-process-bridge-pilot",
    command: "codex",
    args: ["exec", "--json", "--cd", repoPath, "Return a final answer."],
    cwd: repoPath,
    envPolicy: {
      secretsIncluded: false,
      inheritedEnvAllowed: false,
    },
    promptStrategy: "inline_finalized_prompt_text",
    expectedStdout: "jsonl_events",
    expectedStderr: "progress_events",
    expectedStream: "codex_exec_jsonl",
    maxRuntimeMs: 60_000,
    executionAllowed: true,
    sourcePackageId: "future-run-package",
    ...baseAudit(),
    ...overrides,
  };
}

function acceptance(overrides = {}) {
  return createOperatorAcceptanceMetadata({
    acceptedBy: "operator",
    acceptedAt: "2026-05-02T00:00:00.000Z",
    runtimeJobId: "bridge-pilot",
    trustProfileId: "observe_only",
    executionMode: "observe_only_live_local_codex",
    repoPath,
    maxRuntimeMs: 60_000,
    reason: "observe-only live runner skeleton test",
    expiresAt: "2026-05-02T01:00:00.000Z",
    ...overrides,
  });
}

function gate(overrides: Partial<ObserveOnlyPilotGateResult> = {}): ObserveOnlyPilotGateResult {
  const currentDescriptor = descriptor();
  return {
    artifactKind: "observe_only_pilot_gate",
    runtimeJobId: "bridge-pilot",
    allowed: true,
    blockingReasons: [],
    operatorApprovalRequired: true,
    operatorApprovalSatisfied: true,
    expectedProcessDescriptor: currentDescriptor,
    expectedStreamParser: "codex_exec_jsonl",
    expectedArtifactContract: createCompletedWorkPathContract(),
    ...baseAudit(),
    ...overrides,
  };
}

class FakeChildProcess extends EventEmitter implements CodexRunnerChildProcess {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  killed = false;

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killed = true;
    queueMicrotask(() => this.emit("close", null, typeof signal === "string" ? signal : null));
    return true;
  }

  override on(
    event: "error" | "exit" | "close",
    listener: (codeOrError?: number | Error | null, signal?: NodeJS.Signals | null) => void,
  ): this {
    return super.on(event, listener);
  }
}

function createFakeSpawn(input: {
  stdoutLines?: string[];
  stderr?: string;
  closeCode?: number;
  stayOpen?: boolean;
  onSpawn?: (command: string, args: string[], options: CodexRunnerSpawnOptions) => void;
}): CodexRunnerSpawn {
  return (command, args, options) => {
    input.onSpawn?.(command, args, options);
    const child = new FakeChildProcess();
    if (!input.stayOpen) {
      queueMicrotask(() => {
        if (input.stderr) {
          child.stderr.write(input.stderr);
        }
        for (const line of input.stdoutLines ?? []) {
          child.stdout.write(`${line}\n`);
        }
        child.stdout.end();
        child.stderr.end();
        child.emit("close", input.closeCode ?? 0, null);
      });
    }
    return child;
  };
}

describe("live Codex runner skeleton", () => {
  it("defaults to disabled and refuses without spawning", async () => {
    let spawnCalled = false;
    const runner = new LiveCodexRunner({
      now: testNow,
      spawn: createFakeSpawn({
        onSpawn: () => {
          spawnCalled = true;
        },
      }),
    });
    const result = await runner.run(
      { descriptor: descriptor(), gate: gate(), operatorAcceptance: acceptance() },
      {},
    );
    expect(result.status).toBe("refused");
    expect(result.validation.blockingReasons).toContain("live_codex_pilot_not_enabled");
    expect(result.commandExecuted).toBe(false);
    expect(spawnCalled).toBe(false);
  });

  it("validates command, args, repo, descriptor authority, acceptance, gate, and limits", () => {
    const blocked = validateLiveCodexRunnerReadiness({
      descriptor: {
        ...descriptor({
          args: ["run"],
          cwd: "/tmp/wrong",
          executionAllowed: false,
          sourcePackageId: "",
        }),
        command: "bash",
        commandExecuted: true,
        envPolicy: { secretsIncluded: true, inheritedEnvAllowed: false },
        allowRebuild: true,
      } as unknown as CodexProcessDescriptor,
      gate: gate({ allowed: false }),
      operatorAcceptance: acceptance({
        allowFileWrites: true,
        allowShellCommands: true,
        allowNetwork: true,
      }),
      options: {
        enableLiveCodexPilot: false,
        maxRuntimeMs: 0,
        maxStdoutBytes: 0,
        maxStderrBytes: 0,
      },
      now: new Date("2026-05-02T00:00:00.000Z"),
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.blockingReasons).toEqual(
      expect.arrayContaining([
        "live_codex_pilot_not_enabled",
        "invalid_command",
        "invalid_args_prefix",
        "repo_scope_mismatch",
        "descriptor_execution_not_allowed",
        "descriptor_already_executed",
        "descriptor_env_secrets_not_allowed",
        "descriptor_source_package_id_required",
        "descriptor_forbidden_future_authority",
        "pilot_gate_not_allowed",
        "observe_only_file_writes_blocked",
        "observe_only_shell_commands_blocked",
        "observe_only_network_blocked",
        "invalid_max_runtime_ms",
        "invalid_max_stdout_bytes",
        "invalid_max_stderr_bytes",
      ]),
    );
    expect(blocked.commandExecuted).toBe(false);
  });

  it("allows only an internally materialized observe-only descriptor with valid gate and acceptance", () => {
    const allowed = validateLiveCodexRunnerReadiness({
      descriptor: descriptor(),
      gate: gate(),
      operatorAcceptance: acceptance(),
      options: {
        enableLiveCodexPilot: true,
      },
      now: new Date("2026-05-02T00:00:00.000Z"),
    });
    expect(allowed).toMatchObject({
      allowed: true,
      blockingReasons: [],
      executionMode: "observe_only_live_local_codex",
      repoPath,
      commandExecuted: false,
    });
  });

  it("uses injected fake spawn to parse JSONL and capture final result without invoking Codex", async () => {
    const lines = [
      JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "done" } }),
      JSON.stringify({ type: "turn.completed" }),
    ];
    const seenLines: string[] = [];
    const runner = new LiveCodexRunner({
      enableLiveCodexPilot: true,
      now: testNow,
      spawn: createFakeSpawn({
        stdoutLines: lines,
        stderr: "progress\n",
        onSpawn(command, args, options) {
          expect(command).toBe("codex");
          expect(args.slice(0, 4)).toEqual(["exec", "--json", "--cd", repoPath]);
          expect(options).toMatchObject({
            cwd: repoPath,
            shell: false,
            stdio: ["ignore", "pipe", "pipe"],
          });
          expect(options.env.PATH).toEqual(expect.any(String));
        },
      }),
    });
    const result = await runner.run(
      { descriptor: descriptor(), gate: gate(), operatorAcceptance: acceptance() },
      {
        onJsonlLine(line) {
          seenLines.push(line);
        },
      },
    );
    expect(result).toMatchObject({
      status: "completed",
      exitCode: 0,
      finalMessage: "done",
      emittedEventCount: 3,
      stderrPreview: "progress\n",
      commandExecuted: true,
    });
    expect(result.stdoutBytes).toBeGreaterThan(0);
    expect(result.stderrBytes).toBeGreaterThan(0);
    expect(seenLines).toEqual(lines);
    expect(result.codexCliInvoked).toBe(false);
  });

  it("enforces stdout and stderr byte limits deterministically", async () => {
    const stdoutLimited = await new LiveCodexRunner({
      enableLiveCodexPilot: true,
      now: testNow,
      maxStdoutBytes: 10,
      spawn: createFakeSpawn({
        stdoutLines: [JSON.stringify({ type: "thread.started", large: "x".repeat(100) })],
      }),
    }).run({ descriptor: descriptor(), gate: gate(), operatorAcceptance: acceptance() }, {});
    expect(stdoutLimited.status).toBe("killed");
    expect(stdoutLimited.errorMessage).toContain("output byte limit");

    const stderrLimited = await new LiveCodexRunner({
      enableLiveCodexPilot: true,
      now: testNow,
      maxStderrBytes: 10,
      spawn: createFakeSpawn({ stderr: "x".repeat(100) }),
    }).run({ descriptor: descriptor(), gate: gate(), operatorAcceptance: acceptance() }, {});
    expect(stderrLimited.status).toBe("killed");
    expect(stderrLimited.stderrBytes).toBeGreaterThan(10);
    expect(stderrLimited.stderrPreview?.length).toBeLessThanOrEqual(10);
  });

  it("returns timed_out when the injected process stays open past the runtime budget", async () => {
    const result = await new LiveCodexRunner({
      enableLiveCodexPilot: true,
      now: testNow,
      maxRuntimeMs: 1,
      spawn: createFakeSpawn({ stayOpen: true }),
    }).run({ descriptor: descriptor(), gate: gate(), operatorAcceptance: acceptance() }, {});
    expect(result.status).toBe("timed_out");
    expect(result.errorMessage).toBe("live Codex runner timed out");
    expect(result.commandExecuted).toBe(true);
  });

  it("can be canceled by an external live control signal", async () => {
    const controller = new AbortController();
    const resultPromise = new LiveCodexRunner({
      enableLiveCodexPilot: true,
      now: testNow,
      maxRuntimeMs: 60_000,
      externalAbortSignal: controller.signal,
      spawn: createFakeSpawn({
        stayOpen: true,
      }),
    }).run({ descriptor: descriptor(), gate: gate(), operatorAcceptance: acceptance() }, {});

    controller.abort();
    const result = await resultPromise;

    expect(result.status).toBe("killed");
    expect(result.errorMessage).toBe("live Codex runner canceled by external control");
    expect(result.commandExecuted).toBe(true);
  });
});
