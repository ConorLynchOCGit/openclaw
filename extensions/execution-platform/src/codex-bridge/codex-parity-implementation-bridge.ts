import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import type { RuntimeJobRepository } from "../runtime-job-repository.ts";
import type {
  AgentTeamImplementationBridge,
  AgentTeamImplementationBridgeRunInput,
  AgentTeamImplementationBridgeRunResult,
} from "./agent-team-queued-runner.ts";
import { CodexParityRuntimeAdapter } from "./codex-parity-runtime-adapter.ts";
import { createCodexParityValidationRecord } from "./codex-parity-validation-accounting.ts";

const execFileAsync = promisify(execFile);

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function validationProcessEnv(): NodeJS.ProcessEnv {
  return { ...process.env, NODE_ENV: "test" };
}

function defaultRepoPath(): string {
  return process.env.OPENCLAW_HOST_OPERATOR_REPO_ROOT?.trim() || process.cwd();
}

function validationCommandId(command: string): string {
  return sha256Text(command).slice(0, 16);
}

export type CodexParityImplementationBridgeOptions = {
  repoPath?: string;
  approvedRepoScopePaths?: string[];
  approvedValidationCommands?: string[];
  adapter?: Pick<CodexParityRuntimeAdapter, "run">;
  runtimeJobs?: Pick<RuntimeJobRepository, "attachArtifact" | "recordEvent">;
};

export class CodexParityImplementationBridge implements AgentTeamImplementationBridge {
  private readonly repoPath: string;
  private readonly approvedRepoScopePaths: string[];
  private readonly approvedValidationCommands: string[];
  private readonly adapter: Pick<CodexParityRuntimeAdapter, "run"> | null;
  private readonly runtimeJobs:
    | Pick<RuntimeJobRepository, "attachArtifact" | "recordEvent">
    | undefined;

  constructor(options: CodexParityImplementationBridgeOptions = {}) {
    this.repoPath = options.repoPath ?? defaultRepoPath();
    this.approvedRepoScopePaths = options.approvedRepoScopePaths ?? [
      "extensions/execution-platform/src/codex-bridge/",
      "extensions/execution-platform/src/work-queue/",
      "ui/src/ui/",
      "scripts/",
    ];
    this.approvedValidationCommands = options.approvedValidationCommands ?? [
      "pnpm test:file extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
    ];
    this.adapter = options.adapter ?? null;
    this.runtimeJobs = options.runtimeJobs;
  }

  async run(
    input: AgentTeamImplementationBridgeRunInput,
  ): Promise<AgentTeamImplementationBridgeRunResult> {
    const validationCommands = (
      input.validationRefs.length > 0 ? input.validationRefs : this.approvedValidationCommands
    ).slice(0, 4);
    const adapter =
      this.adapter ??
      new CodexParityRuntimeAdapter({
        runtimeJobs: this.runtimeJobs,
        validationRunnerFactory: (repoRoot) => async (command) => {
          const started = Date.now();
          const parts = command.commandRef.split(/\s+/u);
          if (parts[0] !== "pnpm" || parts[1] !== "test:file" || parts.length < 3) {
            return createCodexParityValidationRecord({
              commandRef: command.commandRef,
              approvedCommandId: command.approvedCommandId,
              status: "skipped",
              durationMs: Date.now() - started,
              boundedSummary: "Validation command is not in approved pnpm test:file shape.",
              skippedReason: "unsupported_validation_command_shape",
            });
          }
          try {
            await execFileAsync("pnpm", parts.slice(1), {
              cwd: repoRoot,
              env: validationProcessEnv(),
              timeout: 240_000,
              maxBuffer: 128 * 1024,
            });
            return createCodexParityValidationRecord({
              commandRef: command.commandRef,
              approvedCommandId: command.approvedCommandId,
              status: "passed",
              exitCode: 0,
              durationMs: Date.now() - started,
              boundedSummary: "Approved focused validation command passed in the live main repo.",
            });
          } catch (error) {
            return createCodexParityValidationRecord({
              commandRef: command.commandRef,
              approvedCommandId: command.approvedCommandId,
              status: "failed",
              exitCode: 1,
              durationMs: Date.now() - started,
              boundedSummary:
                error instanceof Error
                  ? error.message.slice(0, 600)
                  : "Approved focused validation command failed.",
            });
          }
        },
      });
    const result = await adapter.run({
      runtimeJobId: input.runtimeJob.jobId,
      graphNodeId: `${input.teamRunId}-implementation`,
      taskSummary: input.assignedTaskSummary,
      volatilePrompt: [
        input.objective,
        "",
        "OpenClaw evidence refs:",
        ...input.evidenceRefs.slice(0, 20).map((ref) => `- ${ref}`),
      ].join("\n"),
      sourceRepoRoot: this.repoPath,
      approvedScopeRefs:
        input.approvedRepoScopePaths && input.approvedRepoScopePaths.length > 0
          ? input.approvedRepoScopePaths
          : this.approvedRepoScopePaths,
      validationCommands: validationCommands.map((commandRef) => ({
        commandRef,
        approvedCommandId: validationCommandId(commandRef),
        required: true,
      })),
      modelPolicy: {
        codexGpt55Available: true,
        codexCodingModelRef: process.env.OPENCLAW_CODEX_PARITY_COMPLEX_MODEL_REF?.trim() || null,
      },
      sourceEditsRequired: true,
    });
    return {
      status: result.status,
      transportKind: "codex_parity_runtime_adapter",
      modelRef: result.modelSelection.modelRef,
      providerPath: result.modelSelection.providerPath,
      modelRunRef: result.lease.leaseId,
      responseHash: sha256Text(JSON.stringify(result.processResult)),
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      latencyMs: 0,
      summary: `Codex direct main-repo adapter ${result.status}; changed files: ${result.changedFileRefs.join(", ") || "none"}`,
      changedFileRefs: result.changedFileRefs,
      validationRefs: result.validation.records.map((record) => record.commandRef),
      artifactRefs: result.artifactRefs,
      reasonCodes: result.reasonCodes,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
  }
}
