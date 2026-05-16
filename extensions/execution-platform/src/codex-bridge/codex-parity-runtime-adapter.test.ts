import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CodexParityRuntimeAdapter,
  createCodexParityValidationRecord,
  type CodexParityRuntimeAdapterExecutor,
} from "./index.ts";

const roots: string[] = [];

async function tempRoot(prefix: string) {
  const root = await import("node:fs/promises").then((fs) =>
    fs.mkdtemp(path.join(os.tmpdir(), prefix)),
  );
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Codex parity runtime adapter", () => {
  it("runs directly in the main repo and completes only after validation/review evidence", async () => {
    const repo = await tempRoot("codex-direct-main-repo-");
    await mkdir(path.join(repo, "src"), { recursive: true });
    await writeFile(path.join(repo, "src/readback.ts"), "export const value = 1;\n", "utf8");
    const executor: CodexParityRuntimeAdapterExecutor = async ({ descriptor, prompt }) => {
      expect(descriptor.cwd).toBe(repo);
      expect(descriptor.args).toEqual(["app-server", "--listen", "stdio://"]);
      expect(prompt).not.toContain("Do not use subagents");
      await writeFile(path.join(repo, "src/readback.ts"), "export const value = 2;\n", "utf8");
      return {
        status: "completed",
        exitCode: 0,
        signal: null,
        errorMessage: null,
        finalMessage: "Implemented bounded readback improvement.",
        emittedEventCount: 1,
        stdoutBytes: 100,
        stderrBytes: 0,
        stderrPreview: null,
        validation: {
          allowed: true,
          blockingReasons: [],
          executionMode: "code_writing_bridge_pilot",
          repoPath: descriptor.cwd,
          maxRuntimeMs: 3_600_000,
          commandExecuted: false,
          codexCliInvoked: false,
          acpSessionStarted: false,
          shellCommandExecuted: false,
          providerCallMade: false,
          rebuildPerformed: false,
          schedulerStarted: false,
          daemonStarted: false,
          subagentStarted: false,
          liveExecutionEnabled: false,
        },
        controlDecision: null,
        promptInjectedIntoLiveProcess: false,
        codexCliInvoked: false,
        acpSessionStarted: false,
        shellCommandExecuted: false,
        providerCallMade: false,
        rebuildPerformed: false,
        schedulerStarted: false,
        daemonStarted: false,
        subagentStarted: false,
        liveExecutionEnabled: true,
        commandExecuted: true,
      };
    };
    const adapter = new CodexParityRuntimeAdapter({
      executor,
      async validationRunner(command) {
        return createCodexParityValidationRecord({
          commandRef: command.commandRef,
          approvedCommandId: command.approvedCommandId,
          status: "passed",
          exitCode: 0,
          boundedSummary: "focused validation passed",
        });
      },
    });

    const result = await adapter.run({
      runtimeJobId: "job-1",
      graphNodeId: "node-implementation",
      taskSummary: "Improve readback.",
      volatilePrompt: "Make the code change.",
      sourceRepoRoot: repo,
      approvedScopeRefs: ["src"],
      validationCommands: [
        {
          commandRef: "pnpm test:file src/readback.test.ts",
          approvedCommandId: "readback",
          required: true,
        },
      ],
      modelPolicy: { codexCodingModelRef: "openai-codex/gpt-5.3-codex" },
      sourceEditsRequired: true,
    });

    expect(result.status).toBe("completed");
    expect(result.executionMode).toBe("direct_main_repo");
    expect(result.diff.changedFiles.map((file) => file.fileRef)).toEqual(["src/readback.ts"]);
    expect(result.changedFileRefs).toEqual(["src/readback.ts"]);
    expect(result.codexNativeSubagentsInternalOnly).toBe(true);
    expect(result.openClawRoleEvidenceRequired).toBe(true);
    await expect(readFile(path.join(repo, "src/readback.ts"), "utf8")).resolves.toBe(
      "export const value = 2;\n",
    );
  });

  it("projects bounded Codex app-server progress events through runtime job evidence", async () => {
    const repo = await tempRoot("codex-direct-main-repo-");
    await mkdir(path.join(repo, "src"), { recursive: true });
    await writeFile(path.join(repo, "src/readback.ts"), "export const value = 1;\n", "utf8");
    const events: Array<{ eventType: string; data: unknown }> = [];
    const artifacts: unknown[] = [];
    const executor: CodexParityRuntimeAdapterExecutor = async ({ callbacks }) => {
      await callbacks.onCodexAppServerEvent?.({
        artifactKind: "codex_app_server_parity_progress_event",
        method: "item/completed",
        threadId: "thread-1",
        turnId: "turn-1",
        phase: "item_completed",
        itemType: "fileChange",
        fileRefs: ["src/readback.ts"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      });
      await writeFile(path.join(repo, "src/readback.ts"), "export const value = 2;\n", "utf8");
      return {
        status: "completed",
        exitCode: 0,
        signal: null,
        errorMessage: null,
        finalMessage: "done",
        emittedEventCount: 1,
        stdoutBytes: 1,
        stderrBytes: 0,
        stderrPreview: null,
        validation: {
          allowed: true,
          blockingReasons: [],
          executionMode: "codex_app_server_persistent_thread",
          repoPath: repo,
          maxRuntimeMs: 3_600_000,
          commandExecuted: false,
          codexCliInvoked: false,
          acpSessionStarted: false,
          shellCommandExecuted: false,
          providerCallMade: false,
          rebuildPerformed: false,
          schedulerStarted: false,
          daemonStarted: false,
          subagentStarted: false,
          liveExecutionEnabled: false,
        },
        controlDecision: null,
        promptInjectedIntoLiveProcess: false,
        codexCliInvoked: false,
        acpSessionStarted: false,
        shellCommandExecuted: false,
        providerCallMade: false,
        rebuildPerformed: false,
        schedulerStarted: false,
        daemonStarted: false,
        subagentStarted: false,
        liveExecutionEnabled: true,
        commandExecuted: true,
      };
    };
    const adapter = new CodexParityRuntimeAdapter({
      executor,
      runtimeJobs: {
        async recordEvent(input) {
          events.push({ eventType: input.eventType, data: input.data });
          return {} as never;
        },
        async attachArtifact(input) {
          artifacts.push(input);
          return {} as never;
        },
      },
      async validationRunner(command) {
        return createCodexParityValidationRecord({
          commandRef: command.commandRef,
          approvedCommandId: command.approvedCommandId,
          status: "passed",
          exitCode: 0,
          boundedSummary: "focused validation passed",
        });
      },
    });

    const result = await adapter.run({
      runtimeJobId: "job-1",
      graphNodeId: "node-implementation",
      taskSummary: "Improve readback.",
      volatilePrompt: "Make the code change.",
      sourceRepoRoot: repo,
      approvedScopeRefs: ["src"],
      validationCommands: [
        {
          commandRef: "pnpm test:file src/readback.test.ts",
          approvedCommandId: "readback",
          required: true,
        },
      ],
      modelPolicy: { codexCodingModelRef: "openai-codex/gpt-5.3-codex" },
      sourceEditsRequired: true,
    });

    expect(result.status).toBe("completed");
    expect(artifacts.length).toBeGreaterThan(0);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "codex_parity.app_server_progress" }),
      ]),
    );
    expect(JSON.stringify(events)).toContain("fileChange");
    expect(JSON.stringify(events)).not.toContain('rawResponseStored":true');
  });

  it("does not complete when source edits were required but no file changed", async () => {
    const repo = await tempRoot("codex-direct-main-repo-");
    await mkdir(path.join(repo, "src"), { recursive: true });
    await writeFile(path.join(repo, "src/readback.ts"), "export const value = 1;\n", "utf8");
    const adapter = new CodexParityRuntimeAdapter({
      async executor() {
        return {
          status: "completed",
          exitCode: 0,
          signal: null,
          errorMessage: null,
          finalMessage: "done",
          emittedEventCount: 1,
          stdoutBytes: 1,
          stderrBytes: 0,
          stderrPreview: null,
          validation: {
            allowed: true,
            blockingReasons: [],
            executionMode: "code_writing_bridge_pilot",
            repoPath: repo,
            maxRuntimeMs: 3_600_000,
            commandExecuted: false,
            codexCliInvoked: false,
            acpSessionStarted: false,
            shellCommandExecuted: false,
            providerCallMade: false,
            rebuildPerformed: false,
            schedulerStarted: false,
            daemonStarted: false,
            subagentStarted: false,
            liveExecutionEnabled: false,
          },
          controlDecision: null,
          promptInjectedIntoLiveProcess: false,
          codexCliInvoked: false,
          acpSessionStarted: false,
          shellCommandExecuted: false,
          providerCallMade: false,
          rebuildPerformed: false,
          schedulerStarted: false,
          daemonStarted: false,
          subagentStarted: false,
          liveExecutionEnabled: true,
          commandExecuted: true,
        };
      },
      async validationRunner(command) {
        return createCodexParityValidationRecord({
          commandRef: command.commandRef,
          approvedCommandId: command.approvedCommandId,
          status: "passed",
          exitCode: 0,
          boundedSummary: "focused validation passed",
        });
      },
    });

    const result = await adapter.run({
      runtimeJobId: "job-1",
      graphNodeId: "node-implementation",
      taskSummary: "Improve readback.",
      volatilePrompt: "Make the code change.",
      sourceRepoRoot: repo,
      approvedScopeRefs: ["src"],
      validationCommands: [
        {
          commandRef: "pnpm test:file src/readback.test.ts",
          approvedCommandId: "readback",
          required: true,
        },
      ],
      modelPolicy: { codexCodingModelRef: "openai-codex/gpt-5.3-codex" },
      sourceEditsRequired: true,
    });

    expect(result.status).toBe("needs_review");
    expect(result.sourceAcceptanceDecision.status).toBe("blocked");
    expect(result.reasonCodes).toContain("unsafe_flag:source_edits_required_but_no_files_changed");
  });

  it("does not complete when validation evidence is unknown", async () => {
    const repo = await tempRoot("codex-direct-main-repo-");
    await mkdir(path.join(repo, "src"), { recursive: true });
    await writeFile(path.join(repo, "src/readback.ts"), "export const value = 1;\n", "utf8");
    const adapter = new CodexParityRuntimeAdapter({
      async executor() {
        await writeFile(path.join(repo, "src/readback.ts"), "export const value = 2;\n", "utf8");
        return {
          status: "completed",
          exitCode: 0,
          signal: null,
          errorMessage: null,
          finalMessage: "done",
          emittedEventCount: 1,
          stdoutBytes: 1,
          stderrBytes: 0,
          stderrPreview: null,
          validation: {
            allowed: true,
            blockingReasons: [],
            executionMode: "code_writing_bridge_pilot",
            repoPath: repo,
            maxRuntimeMs: 3_600_000,
            commandExecuted: false,
            codexCliInvoked: false,
            acpSessionStarted: false,
            shellCommandExecuted: false,
            providerCallMade: false,
            rebuildPerformed: false,
            schedulerStarted: false,
            daemonStarted: false,
            subagentStarted: false,
            liveExecutionEnabled: false,
          },
          controlDecision: null,
          promptInjectedIntoLiveProcess: false,
          codexCliInvoked: false,
          acpSessionStarted: false,
          shellCommandExecuted: false,
          providerCallMade: false,
          rebuildPerformed: false,
          schedulerStarted: false,
          daemonStarted: false,
          subagentStarted: false,
          liveExecutionEnabled: true,
          commandExecuted: true,
        };
      },
    });

    const result = await adapter.run({
      runtimeJobId: "job-1",
      graphNodeId: "node-implementation",
      taskSummary: "Improve readback.",
      volatilePrompt: "Make the code change.",
      sourceRepoRoot: repo,
      approvedScopeRefs: ["src"],
      validationCommands: [
        {
          commandRef: "pnpm test:file src/readback.test.ts",
          approvedCommandId: "readback",
          required: true,
        },
      ],
      modelPolicy: { codexCodingModelRef: "openai-codex/gpt-5.3-codex" },
      sourceEditsRequired: true,
    });

    expect(result.status).toBe("needs_review");
    expect(result.sourceAcceptanceDecision.status).toBe("blocked");
    expect(result.reasonCodes).toContain("validation_skipped:readback");
  });

  it("does not complete when implementation weakens a target test suite", async () => {
    const repo = await tempRoot("codex-direct-main-repo-");
    await mkdir(path.join(repo, "ui"), { recursive: true });
    await writeFile(
      path.join(repo, "ui/work-queue.test.ts"),
      [
        "/* @vitest-environment jsdom */",
        "import { describe, expect, it } from 'vitest';",
        "describe('work queue view', () => { it('renders', () => { expect(1).toBe(1); }); });",
      ].join("\n"),
      "utf8",
    );
    const adapter = new CodexParityRuntimeAdapter({
      async executor() {
        await writeFile(
          path.join(repo, "ui/work-queue.test.ts"),
          [
            "/* @vitest-environment node */",
            "import { describe, expect, it } from 'vitest';",
            "describe.skip('work queue view', () => { it('renders', () => { expect(1).toBe(1); }); });",
          ].join("\n"),
          "utf8",
        );
        return {
          status: "completed",
          exitCode: 0,
          signal: null,
          errorMessage: null,
          finalMessage: "done",
          emittedEventCount: 1,
          stdoutBytes: 1,
          stderrBytes: 0,
          stderrPreview: null,
          validation: {
            allowed: true,
            blockingReasons: [],
            executionMode: "codex_app_server_persistent_thread",
            repoPath: repo,
            maxRuntimeMs: 3_600_000,
            commandExecuted: false,
            codexCliInvoked: false,
            acpSessionStarted: false,
            shellCommandExecuted: false,
            providerCallMade: false,
            rebuildPerformed: false,
            schedulerStarted: false,
            daemonStarted: false,
            subagentStarted: false,
            liveExecutionEnabled: false,
          },
          controlDecision: null,
          promptInjectedIntoLiveProcess: false,
          codexCliInvoked: false,
          acpSessionStarted: false,
          shellCommandExecuted: false,
          providerCallMade: false,
          rebuildPerformed: false,
          schedulerStarted: false,
          daemonStarted: false,
          subagentStarted: false,
          liveExecutionEnabled: true,
          commandExecuted: true,
        };
      },
      async validationRunner(command) {
        return createCodexParityValidationRecord({
          commandRef: command.commandRef,
          approvedCommandId: command.approvedCommandId,
          status: "passed",
          exitCode: 0,
          boundedSummary: "focused validation passed",
        });
      },
    });

    const result = await adapter.run({
      runtimeJobId: "job-1",
      graphNodeId: "node-implementation",
      taskSummary: "Improve readback.",
      volatilePrompt: "Make the code change.",
      sourceRepoRoot: repo,
      approvedScopeRefs: ["ui"],
      validationCommands: [
        {
          commandRef: "pnpm test:file ui/work-queue.test.ts",
          approvedCommandId: "work-queue-ui",
          required: true,
        },
      ],
      modelPolicy: { codexCodingModelRef: "openai-codex/gpt-5.3-codex" },
      sourceEditsRequired: true,
    });

    expect(result.status).toBe("needs_review");
    expect(result.testIntegrity.status).toBe("blocked");
    expect(result.reasonCodes).toContain(
      "unsafe_flag:test_integrity:describe_skip_introduced:ui/work-queue.test.ts",
    );
    expect(result.reasonCodes).toContain(
      "unsafe_flag:test_integrity:vitest_environment_downgraded:ui/work-queue.test.ts",
    );
  });
});
