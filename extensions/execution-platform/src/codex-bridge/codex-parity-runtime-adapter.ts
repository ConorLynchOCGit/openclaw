import { createHash, randomUUID } from "node:crypto";
import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import { CodexAppServerParityExecutor } from "./codex-app-server-parity-executor.ts";
import {
  selectCodexParityRoleModel,
  type CodexParityRoleModelPolicyInput,
  type CodexParityRoleModelSelection,
} from "./codex-parity-role-model-policy.ts";
import {
  createAcceptedCodexParityReview,
  decideCodexParitySourceAcceptance,
  type CodexParityReviewDecision,
  type CodexParitySourceAcceptanceDecision,
} from "./codex-parity-source-acceptance.ts";
import {
  createCodexParityTestIntegritySnapshot,
  decideCodexParityTestIntegrity,
  type CodexParityTestIntegrityDecision,
} from "./codex-parity-test-integrity.ts";
import {
  createCodexParityValidationRecord,
  runCodexParityValidationAccounting,
  type CodexParityValidationAccounting,
  type CodexParityValidationCommand,
  type CodexParityValidationRunner,
} from "./codex-parity-validation-accounting.ts";
import type { CodexProcessDescriptor, SupervisorProcessCallbacks } from "./execution-supervisor.ts";
import type { LiveCodexRunnerResult } from "./live-codex-runner.ts";
import {
  createMainRepoHashManifest,
  diffMainRepoHashManifests,
  isMainRepoFileWithinScope,
  type MainRepoChangeManifest,
  type MainRepoHashManifest,
} from "./main-repo-change-evidence.ts";
import {
  acquireMainRepoWriteLease,
  releaseMainRepoWriteLease,
  type MainRepoWriteLease,
} from "./main-repo-write-lease.ts";

export type CodexParityRuntimeAdapterExecutor = (input: {
  descriptor: CodexProcessDescriptor;
  prompt: string;
  approvedScopeRefs?: string[];
  validationCommandRefs?: string[];
  callbacks: SupervisorProcessCallbacks;
  abortSignal?: AbortSignal;
}) => Promise<LiveCodexRunnerResult>;

export type CodexParityRuntimeAdapterInput = {
  runtimeJobId: string;
  graphNodeId: string;
  taskSummary: string;
  volatilePrompt: string;
  sourceRepoRoot: string;
  approvedScopeRefs: string[];
  validationCommands: CodexParityValidationCommand[];
  sourceEditsRequired?: boolean;
  modelPolicy?: CodexParityRoleModelPolicyInput;
};

export type CodexParityRuntimeAdapterResult = {
  artifactKind: "codex_parity_runtime_adapter_result";
  status: "completed" | "needs_review" | "failed";
  runtimeJobId: string;
  graphNodeId: string;
  modelSelection: CodexParityRoleModelSelection;
  executionMode: "direct_main_repo";
  lease: MainRepoWriteLease;
  beforeManifest: MainRepoHashManifest;
  afterManifest: MainRepoHashManifest;
  diff: MainRepoChangeManifest;
  validation: CodexParityValidationAccounting;
  testIntegrity: CodexParityTestIntegrityDecision;
  review: CodexParityReviewDecision;
  sourceAcceptanceDecision: CodexParitySourceAcceptanceDecision;
  processResult: {
    status: LiveCodexRunnerResult["status"];
    exitCode: number | null;
    stdoutBytes: number;
    stderrBytes: number;
    finalMessageHash: string | null;
  };
  changedFileRefs: string[];
  artifactRefs: string[];
  reasonCodes: string[];
  codexNativeSubagentsInternalOnly: true;
  openClawRoleEvidenceRequired: true;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawCommandLogsStored: false;
  workQueueLifecycleMutated: false;
};

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function bounded(value: string, max = 2_000): string {
  return value.trim().slice(0, max);
}

function compactResultMetadata(result: CodexParityRuntimeAdapterResult): JsonValue {
  return {
    artifactKind: result.artifactKind,
    status: result.status,
    runtimeJobId: result.runtimeJobId,
    graphNodeId: result.graphNodeId,
    executionMode: result.executionMode,
    modelSelection: result.modelSelection,
    lease: {
      leaseId: result.lease.leaseId,
      status: result.lease.status,
      advisoryOnly: result.lease.advisoryOnly,
      approvedScopeRefs: result.lease.approvedScopeRefs,
    },
    beforeManifest: {
      manifestId: result.beforeManifest.manifestId,
      fileCount: result.beforeManifest.fileCount,
      evidenceStatus: result.beforeManifest.evidenceStatus,
    },
    afterManifest: {
      manifestId: result.afterManifest.manifestId,
      fileCount: result.afterManifest.fileCount,
      evidenceStatus: result.afterManifest.evidenceStatus,
    },
    diff: {
      changeManifestId: result.diff.changeManifestId,
      changedFileCount: result.diff.changedFiles.length,
      changedFileRefs: result.diff.changedFiles.map((file) => file.fileRef).slice(0, 80),
      diffHash: result.diff.diffHash,
      evidenceStatus: result.diff.evidenceStatus,
    },
    validation: {
      requiredValidationCount: result.validation.requiredValidationCount,
      recordedValidationCount: result.validation.recordedValidationCount,
      skippedValidationCount: result.validation.skippedValidationCount,
      unknownValidationCount: result.validation.unknownValidationCount,
      allRequiredValidationStatesKnown: result.validation.allRequiredValidationStatesKnown,
      allRequiredValidationAccepted: result.validation.allRequiredValidationAccepted,
      records: result.validation.records.slice(0, 20),
    },
    testIntegrity: result.testIntegrity,
    review: result.review,
    sourceAcceptanceDecision: result.sourceAcceptanceDecision,
    processResult: result.processResult,
    changedFileRefs: result.changedFileRefs.slice(0, 80),
    artifactRefs: result.artifactRefs,
    reasonCodes: result.reasonCodes.slice(0, 80),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawCommandLogsStored: false,
    workQueueLifecycleMutated: false,
  } as JsonValue;
}

function buildPrompt(input: CodexParityRuntimeAdapterInput): string {
  const validationCommands = input.validationCommands
    .map((command) => `- ${command.commandRef}`)
    .join("\n");
  const sourceEditRequirement =
    input.sourceEditsRequired === false
      ? "This node is read-only; do not edit files unless a later OpenClaw-visible node grants implementation authority."
      : [
          "This implementation node requires an actual source or test edit inside the approved scope.",
          "If the requested behavior already exists, make the smallest generally useful hardening, test, or owner-readback improvement that directly supports the task.",
          "Do not finish with only a plan, analysis, or verbal recommendation when source edits are required.",
        ].join(" ");
  return [
    "You are a Codex parity implementation worker invoked by OpenClaw.",
    "OpenClaw owns orchestration, role graph, Work Queue readback, runtime truth, and final closeout.",
    "Your job is this implementation node. You are running in the live main repository, not an isolated copy.",
    "Edit real source files directly when the task requires source edits.",
    sourceEditRequirement,
    "Codex-native subagents may be used internally if useful, but they do not replace OpenClaw-visible role evidence.",
    `Approved editable scopes: ${input.approvedScopeRefs.join(", ")}`,
    "Do not edit outside approved scopes. If required work needs other files, stop and explain the needed scope expansion.",
    "Do not deploy, send outbound messages, grant authority, mutate Work Queue lifecycle, promote models, change gateway env/port/auth/pairing/ACP, or store raw logs.",
    "Run the approved validations listed by OpenClaw when you can; do not claim tests passed unless evidence exists.",
    "Approved validation commands:",
    validationCommands || "- none configured; report needs_review after editing",
    "Return a concise implementation report. Runtime file evidence and validation, not final prose, determine success.",
    "",
    `Task summary: ${bounded(input.taskSummary, 1_500)}`,
    "",
    input.volatilePrompt,
  ].join("\n");
}

function descriptor(input: {
  runtimeJobId: string;
  repoRoot: string;
  sourcePackageId: string;
}): CodexProcessDescriptor {
  return {
    artifactKind: "codex_process_descriptor",
    descriptorId: `codex-app-server-${input.runtimeJobId}-direct-main-repo`,
    command: "codex",
    args: ["app-server", "--listen", "stdio://"],
    cwd: input.repoRoot,
    envPolicy: {
      secretsIncluded: false,
      inheritedEnvAllowed: false,
    },
    promptStrategy: "inline_finalized_prompt_text",
    expectedStdout: "jsonl_events",
    expectedStderr: "progress_events",
    expectedStream: "codex_exec_jsonl",
    maxRuntimeMs: 3_600_000,
    executionAllowed: true,
    sourcePackageId: input.sourcePackageId,
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
  };
}

function defaultValidationRunner(repoRoot: string): CodexParityValidationRunner {
  return async (command) => {
    return createCodexParityValidationRecord({
      commandRef: command.commandRef,
      approvedCommandId: command.approvedCommandId,
      status: "skipped",
      boundedSummary:
        "Validation execution is owned by the runtime script middleware; this adapter recorded an explicit skipped state because no runner was injected.",
      skippedReason: `runtime_validation_runner_not_configured_for:${repoRoot}`,
    });
  };
}

function createRefusedProcessResult(input: {
  reason: string;
  sourceRepoRoot: string;
}): LiveCodexRunnerResult {
  return {
    status: "refused",
    exitCode: null,
    signal: null,
    errorMessage: input.reason,
    finalMessage: null,
    emittedEventCount: 0,
    stdoutBytes: 0,
    stderrBytes: 0,
    stderrPreview: null,
    validation: {
      allowed: false,
      blockingReasons: [input.reason],
      executionMode: "codex_app_server_persistent_thread",
      repoPath: input.sourceRepoRoot,
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
    liveExecutionEnabled: false,
    commandExecuted: false,
  };
}

export class CodexParityRuntimeAdapter {
  constructor(
    private readonly options: {
      runtimeJobs?: Pick<RuntimeJobRepository, "attachArtifact" | "recordEvent"> & {
        getJob?: RuntimeJobRepository["getJob"];
      };
      executor?: CodexParityRuntimeAdapterExecutor;
      validationRunner?: CodexParityValidationRunner;
      validationRunnerFactory?: (repoRoot: string) => CodexParityValidationRunner;
      reviewer?: (input: {
        diff: MainRepoChangeManifest;
        validation: CodexParityValidationAccounting;
      }) => Promise<CodexParityReviewDecision>;
      now?: () => Date;
    } = {},
  ) {}

  async run(input: CodexParityRuntimeAdapterInput): Promise<CodexParityRuntimeAdapterResult> {
    const modelSelection = selectCodexParityRoleModel("implementation_complex", input.modelPolicy);
    const lease = acquireMainRepoWriteLease({
      runtimeJobId: input.runtimeJobId,
      repoRoot: input.sourceRepoRoot,
      approvedScopeRefs: input.approvedScopeRefs,
      now: this.options.now?.(),
    });
    await this.options.runtimeJobs?.recordEvent({
      jobId: input.runtimeJobId,
      eventType: "codex_parity.main_repo_write_lease_acquired",
      data: lease as unknown as JsonValue,
    });
    const before = await createMainRepoHashManifest({
      repoRoot: input.sourceRepoRoot,
      approvedScopeRefs: input.approvedScopeRefs,
      manifestId: `${input.runtimeJobId}-main-repo-before`,
    });
    const beforeTestIntegrity = await createCodexParityTestIntegritySnapshot({
      repoRoot: input.sourceRepoRoot,
      manifest: before,
      snapshotId: `${input.runtimeJobId}-test-integrity-before`,
    });
    const prompt = buildPrompt(input);
    const processDescriptor = descriptor({
      runtimeJobId: input.runtimeJobId,
      repoRoot: input.sourceRepoRoot,
      sourcePackageId: `codex-direct-main-repo-adapter-${randomUUID()}`,
    });
    let lastHeartbeatAt = 0;
    const modelCallStartedAt = Date.now();
    const abortController = new AbortController();
    let controlPoller: NodeJS.Timeout | null = null;
    const runtimeJobGetter = this.options.runtimeJobs?.getJob;
    if (runtimeJobGetter) {
      controlPoller = setInterval(() => {
        void runtimeJobGetter
          .call(this.options.runtimeJobs, input.runtimeJobId)
          .then(async (job) => {
            if (!job || !["canceled", "failed", "timed_out"].includes(job.state)) {
              return;
            }
            if (abortController.signal.aborted) {
              return;
            }
            await this.options.runtimeJobs?.recordEvent({
              jobId: input.runtimeJobId,
              eventType: "codex_parity.implementation_model_call_abort_requested",
              data: {
                artifactKind: "codex_parity_progress_event",
                runtimeJobId: input.runtimeJobId,
                graphNodeId: input.graphNodeId,
                phase: "implementation_model_call_abort_requested",
                runtimeJobState: job.state,
                modelRef: modelSelection.modelRef,
                providerPath: modelSelection.providerPath,
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              } as JsonValue,
            });
            abortController.abort();
          })
          .catch(() => undefined);
      }, 5_000);
      controlPoller.unref?.();
    }
    const callbacks: SupervisorProcessCallbacks = {
      onHeartbeat: async () => {
        const now = Date.now();
        if (now - lastHeartbeatAt < 30_000) {
          return;
        }
        lastHeartbeatAt = now;
        await this.options.runtimeJobs?.recordEvent({
          jobId: input.runtimeJobId,
          eventType: "codex_parity.implementation_model_call_heartbeat",
          data: {
            artifactKind: "codex_parity_progress_event",
            runtimeJobId: input.runtimeJobId,
            graphNodeId: input.graphNodeId,
            phase: "implementation_model_call_running",
            modelRef: modelSelection.modelRef,
            providerPath: modelSelection.providerPath,
            elapsedMs: now - modelCallStartedAt,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          } as JsonValue,
        });
      },
      onCodexAppServerEvent: async (event) => {
        await this.options.runtimeJobs?.recordEvent({
          jobId: input.runtimeJobId,
          eventType: "codex_parity.app_server_progress",
          data: {
            artifactKind: "codex_parity_app_server_progress_projection",
            runtimeJobId: input.runtimeJobId,
            graphNodeId: input.graphNodeId,
            modelRef: modelSelection.modelRef,
            providerPath: modelSelection.providerPath,
            event,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          } as JsonValue,
        });
      },
    };
    await this.options.runtimeJobs?.recordEvent({
      jobId: input.runtimeJobId,
      eventType: "codex_parity.implementation_model_call_started",
      data: {
        artifactKind: "codex_parity_progress_event",
        runtimeJobId: input.runtimeJobId,
        graphNodeId: input.graphNodeId,
        phase: "implementation_model_call_started",
        modelRef: modelSelection.modelRef,
        providerPath: modelSelection.providerPath,
        timeoutMs: modelSelection.timeoutMs,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } as JsonValue,
    });
    const runnerResult = await (async () => {
      try {
        if (modelSelection.missingConfigBlocker) {
          return createRefusedProcessResult({
            reason: modelSelection.missingConfigBlocker,
            sourceRepoRoot: input.sourceRepoRoot,
          });
        }
        if (this.options.executor) {
          return await this.options.executor({
            descriptor: processDescriptor,
            prompt,
            approvedScopeRefs: input.approvedScopeRefs,
            validationCommandRefs: input.validationCommands.map((command) => command.commandRef),
            callbacks,
            abortSignal: abortController.signal,
          });
        }
        return await new CodexAppServerParityExecutor({
          model: modelSelection.modelRef.replace(/^openai-codex\//u, ""),
          reasoningEffort:
            modelSelection.reasoningEffort === "not_applicable"
              ? "xhigh"
              : modelSelection.reasoningEffort,
          timeoutMs: modelSelection.timeoutMs,
        }).run({
          descriptor: processDescriptor,
          prompt,
          approvedScopeRefs: input.approvedScopeRefs,
          validationCommandRefs: input.validationCommands.map((command) => command.commandRef),
          callbacks,
          abortSignal: abortController.signal,
        });
      } finally {
        if (controlPoller) {
          clearInterval(controlPoller);
        }
      }
    })();
    await this.options.runtimeJobs?.recordEvent({
      jobId: input.runtimeJobId,
      eventType: "codex_parity.implementation_model_call_completed",
      data: {
        artifactKind: "codex_parity_progress_event",
        runtimeJobId: input.runtimeJobId,
        graphNodeId: input.graphNodeId,
        phase: "implementation_model_call_completed",
        modelRef: modelSelection.modelRef,
        providerPath: modelSelection.providerPath,
        status: runnerResult.status,
        elapsedMs: Date.now() - modelCallStartedAt,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } as JsonValue,
    });
    const after = await createMainRepoHashManifest({
      repoRoot: input.sourceRepoRoot,
      approvedScopeRefs: input.approvedScopeRefs,
      manifestId: `${input.runtimeJobId}-main-repo-after`,
    });
    const afterTestIntegrity = await createCodexParityTestIntegritySnapshot({
      repoRoot: input.sourceRepoRoot,
      manifest: after,
      snapshotId: `${input.runtimeJobId}-test-integrity-after`,
    });
    const diff = diffMainRepoHashManifests({ before, after });
    const changedFileRefs = diff.changedFiles.map((file) => file.fileRef);
    const testIntegrity = decideCodexParityTestIntegrity({
      before: beforeTestIntegrity,
      after: afterTestIntegrity,
      changedFileRefs,
    });
    const outOfScopeChangedFileRefs = changedFileRefs.filter(
      (fileRef) =>
        !input.approvedScopeRefs.some((scope) => isMainRepoFileWithinScope(fileRef, scope)),
    );
    const validation = await runCodexParityValidationAccounting({
      requiredCommands: input.validationCommands,
      runner:
        this.options.validationRunner ??
        this.options.validationRunnerFactory?.(input.sourceRepoRoot) ??
        defaultValidationRunner(input.sourceRepoRoot),
    });
    const review = this.options.reviewer
      ? await this.options.reviewer({ diff, validation })
      : createAcceptedCodexParityReview({
          reviewRef: `runtime-job://${input.runtimeJobId}/codex-direct-main-repo/review/${diff.changeManifestId}`,
          boundedSummary: "Default bounded reviewer accepted structural evidence for tests.",
          reasonCodes: ["default_test_reviewer_acceptance"],
        });
    const sourceAcceptanceDecision = decideCodexParitySourceAcceptance({
      diff,
      validation,
      review,
      unsafeFlags: [
        ...(runnerResult.status === "completed" ? [] : [`codex_process_${runnerResult.status}`]),
        ...(runnerResult.codexCliInvoked ? ["codex_exec_one_shot_not_allowed"] : []),
        ...(before.evidenceStatus === "accepted" && after.evidenceStatus === "accepted"
          ? []
          : ["main_repo_file_evidence_failed"]),
        ...(input.sourceEditsRequired !== false && changedFileRefs.length === 0
          ? ["source_edits_required_but_no_files_changed"]
          : []),
        ...(testIntegrity.status === "accepted"
          ? []
          : testIntegrity.reasonCodes.map((reason) => `test_integrity:${reason}`)),
        ...outOfScopeChangedFileRefs.map((file) => `main_repo_out_of_scope_change:${file}`),
      ],
    });
    const completed =
      runnerResult.status === "completed" && sourceAcceptanceDecision.status === "allowed";
    const releasedLease = releaseMainRepoWriteLease({
      lease,
      now: this.options.now?.(),
    });
    const artifactRefs = [
      `runtime-job://${input.runtimeJobId}/codex-direct-main-repo/lease/${lease.leaseId}`,
      `runtime-job://${input.runtimeJobId}/codex-direct-main-repo/diff/${diff.changeManifestId}`,
      `runtime-job://${input.runtimeJobId}/codex-direct-main-repo/validation`,
      review.reviewRef,
    ];
    const result: CodexParityRuntimeAdapterResult = {
      artifactKind: "codex_parity_runtime_adapter_result",
      status: completed
        ? "completed"
        : sourceAcceptanceDecision.status === "blocked"
          ? "needs_review"
          : "failed",
      runtimeJobId: input.runtimeJobId,
      graphNodeId: input.graphNodeId,
      modelSelection,
      executionMode: "direct_main_repo",
      lease: releasedLease,
      beforeManifest: before,
      afterManifest: after,
      diff,
      validation,
      testIntegrity,
      review,
      sourceAcceptanceDecision,
      processResult: {
        status: runnerResult.status,
        exitCode: runnerResult.exitCode,
        stdoutBytes: runnerResult.stdoutBytes,
        stderrBytes: runnerResult.stderrBytes,
        finalMessageHash: runnerResult.finalMessage ? sha256Text(runnerResult.finalMessage) : null,
      },
      changedFileRefs,
      artifactRefs,
      reasonCodes: [
        ...modelSelection.reasonCodes,
        ...diff.reasonCodes,
        ...testIntegrity.reasonCodes,
        ...validation.reasonCodes,
        ...review.reasonCodes,
        ...sourceAcceptanceDecision.reasonCodes,
        ...releasedLease.reasonCodes,
      ],
      codexNativeSubagentsInternalOnly: true,
      openClawRoleEvidenceRequired: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawCommandLogsStored: false,
      workQueueLifecycleMutated: false,
    };
    const metadata = compactResultMetadata(result);
    const metadataJson = JSON.stringify(metadata);
    await this.options.runtimeJobs?.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "codex_parity.runtime_adapter_result",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/codex-direct-main-repo/result`,
      contentType: "application/json",
      sizeBytes: Buffer.byteLength(metadataJson, "utf8"),
      sha256: sha256Text(metadataJson),
      metadata,
    });
    return result;
  }
}
