import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  CodeWritingPilotLiveEntrypointRepository,
  type CodeWritingPilotExecutionApproval,
  type CodeWritingPilotLiveResult,
  type CodeWritingPilotValidationEvidence,
} from "./code-writing-pilot-live-entrypoint.ts";
import type {
  CodeWritingPilotPlan,
  CodeWritingPilotPromptPackage,
  CodeWritingPilotRequestSkeleton,
} from "./code-writing-pilot-plan.ts";
import {
  resolveCodingTeamObjectiveScope,
  type CodingTeamObjectiveScope,
} from "./coding-team-objective-scope.ts";
import {
  type AgentTeamImplementationBridge,
  type AgentTeamImplementationBridgeRunInput,
  type AgentTeamImplementationBridgeRunResult,
} from "./coding-team-runtime-job-runner.ts";
import { CODEX_BRIDGE_JOB_TYPE } from "./types.ts";

const execFileAsync = promisify(execFile);
function defaultRepoPath(): string {
  return process.env.OPENCLAW_HOST_OPERATOR_REPO_ROOT?.trim() || process.cwd();
}

function defaultWorkspaceDocsPath(): string {
  const workspaceRoot = process.env.OPENCLAW_HOST_OPERATOR_WORKSPACE_ROOT?.trim();
  if (workspaceRoot) {
    return path.join(workspaceRoot, "docs/projects/execution-platform");
  }
  return path.join(process.cwd(), "docs/projects/execution-platform");
}

export type CodingTeamCodexFileEditingBridgeOptions = {
  runtimeJobs: RuntimeJobRepository;
  entrypoint?: Pick<
    CodeWritingPilotLiveEntrypointRepository,
    "runApprovedLivePilot" | "recordValidationEvidence"
  >;
  repoPath?: string;
  workspaceDocsPath?: string;
  approvedRepoScopePaths?: string[];
  approvedValidationCommands?: string[];
  now?: () => Date;
};

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function bound(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function defaultValidationCommands(input: AgentTeamImplementationBridgeRunInput): string[] {
  const supplied = input.validationRefs.filter((ref) => ref.startsWith("pnpm test:file "));
  return supplied.length > 0
    ? supplied.slice(0, 2)
    : [
        "pnpm test:file extensions/execution-platform/src/codex-bridge/coding-team-runtime-job-runner-dynamic-boundary.test.ts",
      ];
}

function nodeExecutionPacketPromptSummary(input: AgentTeamImplementationBridgeRunInput): string[] {
  const packet = input.nodeExecutionPacket;
  const resource = input.codingResourcePacket;
  if (!packet) {
    return [
      "NodeExecutionPacket:",
      "- not supplied; this bridge invocation is only valid for legacy diagnostic callers and must not be used as a production implementation worker handoff",
    ];
  }
  return [
    "NodeExecutionPacket:",
    `- packetRef: ${packet.packetRef}`,
    `- readiness: ${packet.readinessStatus}`,
    `- resourcePacketRef: ${packet.resourcePacketRef}`,
    `- nodeId: ${packet.nodeId}`,
    `- capabilityId: ${packet.capabilityId}`,
    `- executorKey: ${packet.executorKey}`,
    `- executionIntent: ${packet.executionIntent}`,
    `- evidenceModes: ${packet.evidenceMode.join(", ") || "none"}`,
    `- targetCommitments: ${packet.targetCommitmentIds.slice(0, 12).join(", ") || "none"}`,
    `- validationRefs: ${packet.validationRefs.slice(0, 8).join(", ") || "none"}`,
    `- nodeReadinessStateRef: ${input.nodeReadinessStateRef ?? "not supplied"}`,
    ...(resource
      ? [
          "CodingResourcePacket:",
          `- packetRef: ${resource.packetRef}`,
          `- targetFileRefs: ${resource.targetFileRefs.slice(0, 20).join(", ") || "none"}`,
          `- targetFileSnapshotRefs: ${
            resource.targetFileSnapshotRefs.slice(0, 20).join(", ") || "none"
          }`,
          `- allowedEditScope: ${resource.allowedEditScope.slice(0, 20).join(", ") || "none"}`,
          `- mustReadRefs: ${resource.mustReadRefs.slice(0, 20).join(", ") || "none"}`,
          `- acceptanceCriteria: ${resource.acceptanceCriteria.slice(0, 8).join(" | ") || "none"}`,
          `- stopIfMissingOrEscalate: ${
            resource.stopIfMissingOrEscalate.slice(0, 8).join(" | ") || "none"
          }`,
          `- expectedPatchShape: ${bound(resource.expectedPatchShape, 400)}`,
        ]
      : [
          "CodingResourcePacket:",
          "- not supplied; production implementation workers must receive the hydrated domain resource packet referenced by the NodeExecutionPacket",
        ]),
  ];
}

function bridgePacketPreflightFailure(input: AgentTeamImplementationBridgeRunInput): string[] {
  const failures: string[] = [];
  if (!input.nodeExecutionPacket) {
    failures.push("codex_bridge_node_execution_packet_missing");
  }
  if (!input.codingResourcePacket) {
    failures.push("codex_bridge_coding_resource_packet_missing");
  }
  if (
    input.nodeExecutionPacket &&
    input.codingResourcePacket &&
    input.nodeExecutionPacket.resourcePacketRef !== input.codingResourcePacket.packetRef
  ) {
    failures.push("codex_bridge_resource_packet_ref_mismatch");
  }
  return failures;
}

function promptPackageObjective(input: {
  bridgeInput: AgentTeamImplementationBridgeRunInput;
  scope: CodingTeamObjectiveScope;
}): string {
  return [
    input.bridgeInput.objective,
    "",
    "Implementation lane requirements:",
    `- implement the requested runtime objective for ${input.scope.targetActiveQueueId ?? "the current owner request"}; do not substitute an older proof objective`,
    `- target area: ${input.scope.targetTitle ?? input.scope.ownerSystemArea}`,
    "- if the requested behavior already exists, make the smallest meaningful hardening, regression-test, or readback-quality improvement inside the approved objective scope",
    ...(input.scope.targetActiveQueueId
      ? [
          "- for active queue targets, adjacent proof/readback hardening is not completion unless it directly implements the requested runtime feature and passes target-specific validation",
        ]
      : []),
    "- add or update focused tests",
    "- do not rebuild/reload gateway",
    "- do not deploy, send outbound messages, grant authority, mutate Work Queue lifecycle, or promote models",
    "- do not store raw prompts, raw responses, transcripts, provider logs, tool logs, DB rows, secrets, or hidden reasoning",
    "- use the NodeExecutionPacket and CodingResourcePacket as the worker handoff contract; if snapshots, allowed scope, validation refs, or acceptance criteria are missing, stop with a precise upstream blocker instead of guessing",
    "- finish with a concise human-readable implementation closeout",
    "",
    ...nodeExecutionPacketPromptSummary(input.bridgeInput),
  ].join("\n");
}

function buildLiveInput(input: {
  bridgeInput: AgentTeamImplementationBridgeRunInput;
  childJobId: string;
  runId: string;
  repoPath: string;
  workspaceDocsPath: string;
  approvedRepoScopePaths: string[];
  validationCommands: string[];
  objectiveScope: CodingTeamObjectiveScope;
}): {
  plan: CodeWritingPilotPlan;
  requestSkeleton: CodeWritingPilotRequestSkeleton;
  promptPackage: CodeWritingPilotPromptPackage;
  approval: CodeWritingPilotExecutionApproval;
} {
  const now = new Date().toISOString();
  const pilotPlanId = `${input.runId}-plan`;
  const requestId = `${input.runId}-request`;
  const promptPackageId = `${input.runId}-prompt-package`;
  const objective = promptPackageObjective({
    bridgeInput: input.bridgeInput,
    scope: input.objectiveScope,
  });
  const targetFiles = input.approvedRepoScopePaths;
  const selectedObjective = {
    candidateId: `${input.runId}-objective`,
    title: input.objectiveScope.targetTitle ?? "Coding-team implementation bridge objective",
    objective,
    targetFiles,
    expectedTests: input.validationCommands,
    patchType: "source_test" as const,
    riskNotes: [
      "bounded implementation lane for runtime objective",
      ...input.objectiveScope.reasonCodes.slice(0, 6),
    ],
  };
  const plan: CodeWritingPilotPlan = {
    artifactKind: "codex_bridge_code_writing_pilot_plan",
    pilotPlanId,
    runtimeJobId: input.childJobId,
    sessionId: input.bridgeInput.teamRunId,
    createdAt: now,
    createdBy: "agent_team.coding",
    pilotKind: "code_writing_bridge_pilot",
    planMode: "plan_only",
    selectedObjective,
    objectiveRiskClass: "tiny_non_critical_patch",
    targetFiles,
    maxFilesAllowed: 12,
    maxPatchScopeSummary: `bounded repo-scope patch for ${input.objectiveScope.targetTitle ?? input.objectiveScope.ownerSystemArea}`,
    expectedTests: input.validationCommands,
    validationPlan: input.validationCommands,
    rollbackPlan: ["Use git diff and git revert for the bounded implementation patch if needed."],
    noRebuildRequired: true,
    noDbMigrationRequired: true,
    noDependencyChangeRequired: true,
    noWorkQueueLifecycleMutation: true,
    noAcp: true,
    noSubagents: true,
    noAutobailout: true,
    noTrustedYolo: true,
    noModelPromotion: true,
    noProviderDirectCall: true,
    repoPath: input.repoPath,
    workspaceDocsPath: input.workspaceDocsPath,
    safeUiBridgeMetadata: { notRequiredForBridge: true, rawPromptStored: false } as JsonValue,
    workQueueLink: null,
    priorCloseoutGateState: null,
    controlReadinessSummary: null,
    fakeControlLoopProofRef: null,
    fakeRedirectApplicationProofRef: null,
    skillTriggerReport: {
      objectiveScope: input.objectiveScope,
      rawPromptStored: false,
      rawResponseStored: false,
    } as unknown as JsonValue,
    skillReadinessReport: null,
    skillAuditLintReport: null,
    qualitativeReviewBoundary: null,
    emissionGuardrailState: null,
    expectedOversightStreamChannels: ["runtime_events"],
    expectedControlCommands: ["pause", "redirect", "cancel"],
    expectedCloseoutBehavior: "model-authored implementation closeout plus focused validation",
    operatorApprovalRequired: true,
    operatorApprovalSatisfied: false,
    liveExecutionEnabled: false,
    codexCliInvoked: false,
    commandExecuted: false,
    allowedToCreateLiveRequest: true,
    allowedToRunLivePilot: false,
    blockingReasons: [],
    requiredNextOperatorAction:
      "request_explicit_operator_approval_for_first_code_writing_bridge_pilot",
  };
  const requestSkeleton: CodeWritingPilotRequestSkeleton = {
    artifactKind: "codex_bridge_code_writing_pilot_request_skeleton",
    requestId,
    pilotPlanId,
    runtimeJobId: input.childJobId,
    sessionId: input.bridgeInput.teamRunId,
    requestedMode: "code_writing_bridge_pilot",
    requestedBy: "agent_team.coding",
    requestedAt: now,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    operatorApprovalRequired: true,
    operatorApprovalSatisfied: false,
    enableLiveCodexPilot: false,
    enableCodeWritingBridgePilot: false,
    acknowledgeSeparateExecutorSession: false,
    acknowledgeNoSharedManualSession: false,
    acknowledgeCodeWritingRisk: false,
    acknowledgeNoRebuild: true,
    acknowledgeNoAutobailout: true,
    acknowledgeNoSubagents: true,
    acknowledgeNoWorkQueueLifecycleMutation: true,
    maxRuntimeMs: 15 * 60 * 1000,
    maxStdoutBytes: 2 * 1024 * 1024,
    maxStderrBytes: 128 * 1024,
    maxFilesTouched: 12,
    targetFiles,
    expectedTests: input.validationCommands,
    status: "planned_not_approved",
    commandExecuted: false,
    liveExecutionEnabled: false,
  };
  const promptPackage: CodeWritingPilotPromptPackage = {
    artifactKind: "codex_bridge_code_writing_pilot_prompt_package",
    promptPackageId,
    pilotPlanId,
    runtimeJobId: input.childJobId,
    sessionId: input.bridgeInput.teamRunId,
    objective,
    allowedFiles: targetFiles,
    prohibitedActions: [
      "gateway rebuild/reload",
      "deploy",
      "outbound send",
      "authority grant",
      "Work Queue lifecycle mutation",
      "model promotion",
      "dependency install",
    ],
    validationPlan: input.validationCommands,
    rollbackExpectations: ["bounded git rollback is sufficient"],
    closeoutRequirement: "Concise implementation closeout with changed files and tests.",
    controlBridgeExpectations: [
      "runtime events only",
      `nodeExecutionPacketRef=${
        input.bridgeInput.nodeExecutionPacket?.packetRef ?? "not_supplied"
      }`,
      `codingResourcePacketRef=${
        input.bridgeInput.codingResourcePacket?.packetRef ?? "not_supplied"
      }`,
      `nodeReadinessStateRef=${input.bridgeInput.nodeReadinessStateRef ?? "not_supplied"}`,
    ],
    processCompletionIsTaskSuccess: false,
    rawTranscriptIncluded: false,
    hiddenReasoningRequested: false,
    shellCommandRequestedFromRuntimePayload: false,
    rebuildAuthorityGranted: false,
    autobailoutAuthorityGranted: false,
    subagentAuthorityGranted: false,
    acpAuthorityGranted: false,
    providerDirectCallAuthorityGranted: false,
    workQueueLifecycleMutationAllowed: false,
    inertMetadataOnly: true,
  };
  const approval: CodeWritingPilotExecutionApproval = {
    approvedBy: "owner_policy_coding_team_runtime_objective",
    approvedAt: now,
    approvalScope: "single_code_writing_bridge_pilot",
    runtimeJobId: input.childJobId,
    pilotPlanId,
    requestId,
    promptPackageId,
    sessionId: input.bridgeInput.teamRunId,
    enableLiveCodexPilot: true,
    enableCodeWritingBridgePilot: true,
    acknowledgeSeparateExecutorSession: true,
    acknowledgeNoSharedManualSession: true,
    acknowledgeCodeWritingRisk: true,
    acknowledgeNoRebuild: true,
    acknowledgeNoAutobailout: true,
    acknowledgeNoSubagents: true,
    acknowledgeNoWorkQueueLifecycleMutation: true,
    enableBoundedValidationRepair: true,
    acknowledgeApprovedValidationCommandAuthority: true,
    approvedValidationCommands: input.validationCommands,
    maxValidationRepairAttempts: 1,
    approvedTargetFiles: [],
    approvedRepoScopePaths: targetFiles,
    maxRuntimeMs: 15 * 60 * 1000,
    maxStdoutBytes: 2 * 1024 * 1024,
    maxStderrBytes: 128 * 1024,
    reason: "Owner-approved coding-team runtime objective implementation lane.",
  };
  return { plan, requestSkeleton, promptPackage, approval };
}

async function runValidation(
  command: string,
  repoPath: string,
): Promise<CodeWritingPilotValidationEvidence> {
  const checkedAt = new Date().toISOString();
  const parts = command.split(/\s+/u);
  if (parts[0] !== "pnpm" || parts[1] !== "test:file" || parts.length < 3) {
    return {
      command,
      status: "not_run",
      summary: "Validation command was not in the approved pnpm test:file shape.",
      checkedAt,
    };
  }
  try {
    await execFileAsync("pnpm", parts.slice(1), {
      cwd: repoPath,
      env: { ...process.env, NODE_ENV: "test" },
      timeout: 180_000,
      maxBuffer: 128 * 1024,
    });
    return {
      command,
      status: "passed",
      summary: "Approved focused validation command passed.",
      checkedAt,
    };
  } catch (error) {
    return {
      command,
      status: "failed",
      summary: bound(error instanceof Error ? error.message : String(error), 400),
      checkedAt,
    };
  }
}

function summarizeValidationEvidence(
  evidence: CodeWritingPilotValidationEvidence[],
): CodeWritingPilotValidationEvidence {
  const checkedAt = new Date().toISOString();
  if (evidence.length === 0) {
    return {
      command: "no_validation_command_configured",
      status: "not_run",
      summary: "No approved validation commands were configured.",
      checkedAt,
    };
  }
  const failed = evidence.find((item) => item.status === "failed");
  const notRun = evidence.find((item) => item.status === "not_run");
  const status = failed ? "failed" : notRun ? "not_run" : "passed";
  return {
    command: evidence.map((item) => item.command).join(" ; "),
    status,
    summary: bound(
      `Executed ${evidence.length} approved validation command(s): ${evidence
        .map((item) => `${item.status}:${item.command}`)
        .join(" | ")}`,
      1_200,
    ),
    checkedAt,
  };
}

async function changedFilesInApprovedScopes(input: {
  repoPath: string;
  approvedRepoScopePaths: string[];
  beforeFingerprints?: Map<string, string>;
}): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      [
        "-c",
        `safe.directory=${input.repoPath}`,
        "status",
        "--porcelain",
        "--",
        ...input.approvedRepoScopePaths,
      ],
      {
        cwd: input.repoPath,
        timeout: 30_000,
        maxBuffer: 128 * 1024,
      },
    );
    const candidates = stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^.. ?/u, "").trim())
      .map((line) => line.split(" -> ").pop() ?? line)
      .filter((file) =>
        input.approvedRepoScopePaths.some((scopePath) => file.startsWith(scopePath)),
      )
      .filter((file) => !file.endsWith("/"))
      .slice(0, 40);
    if (!input.beforeFingerprints) {
      return candidates;
    }
    const changed: string[] = [];
    for (const file of candidates) {
      const before = input.beforeFingerprints.get(file) ?? null;
      const after = await fileFingerprint(input.repoPath, file);
      if (before !== after) {
        changed.push(file);
      }
    }
    return changed.slice(0, 40);
  } catch (error) {
    throw new Error(
      `changed_file_evidence_failed:${bound(error instanceof Error ? error.message : String(error), 180)}`,
      { cause: error },
    );
  }
}

function finalResponseSelfReportsIncomplete(value: string | null): boolean {
  if (!value) {
    return false;
  }
  return /\b(not full completion|not complete|not completed|not done|incomplete|needs review|needs_review|explicitly not done|not demonstrate|does not show completion|remains incomplete|not full active-queue|not full completion of the requested runtime migration)\b/iu.test(
    value,
  );
}

async function fileFingerprint(repoPath: string, relativePath: string): Promise<string | null> {
  try {
    const buffer = await readFile(path.resolve(repoPath, relativePath));
    return sha256Text(buffer.toString("base64"));
  } catch {
    return null;
  }
}

async function changedFileFingerprints(input: {
  repoPath: string;
  approvedRepoScopePaths: string[];
}): Promise<Map<string, string>> {
  const files = await changedFilesInApprovedScopes(input);
  const entries = await Promise.all(
    files.map(
      async (file) => [file, (await fileFingerprint(input.repoPath, file)) ?? "missing"] as const,
    ),
  );
  return new Map(entries);
}

export class CodingTeamCodexFileEditingBridge implements AgentTeamImplementationBridge {
  private readonly repoPath: string;
  private readonly workspaceDocsPath: string;
  private readonly approvedRepoScopePaths: string[];
  private readonly now: () => Date;
  private readonly entrypoint: Pick<
    CodeWritingPilotLiveEntrypointRepository,
    "runApprovedLivePilot" | "recordValidationEvidence"
  >;

  constructor(private readonly options: CodingTeamCodexFileEditingBridgeOptions) {
    this.repoPath = options.repoPath ?? defaultRepoPath();
    this.workspaceDocsPath = options.workspaceDocsPath ?? defaultWorkspaceDocsPath();
    this.approvedRepoScopePaths = options.approvedRepoScopePaths ?? [
      "extensions/execution-platform/src/codex-bridge/",
      "extensions/execution-platform/src/workers/",
      "scripts/",
      ".artifacts/execution-platform/",
    ];
    this.now = options.now ?? (() => new Date());
    this.entrypoint =
      options.entrypoint ??
      new CodeWritingPilotLiveEntrypointRepository(options.runtimeJobs, {
        repoPath: this.repoPath,
        workspaceDocsPath: this.workspaceDocsPath,
      });
  }

  async run(
    input: AgentTeamImplementationBridgeRunInput,
  ): Promise<AgentTeamImplementationBridgeRunResult> {
    const packetPreflightFailures = bridgePacketPreflightFailure(input);
    if (packetPreflightFailures.length > 0) {
      const now = this.now().toISOString();
      return {
        status: "needs_review",
        transportKind: "codex_app_server",
        modelRef: "openai-codex/code-writing-bridge",
        providerPath: "codex_app_server",
        modelRunRef: `codex-bridge://blocked/${sha256Text(packetPreflightFailures.join(":")).slice(0, 16)}`,
        responseHash: sha256Text(JSON.stringify(packetPreflightFailures)),
        startedAt: now,
        completedAt: now,
        latencyMs: 0,
        summary:
          "Codex implementation bridge blocked before child job enqueue because the worker handoff packet was incomplete.",
        changedFileRefs: [],
        validationRefs: [],
        artifactRefs: [],
        reasonCodes: [
          "codex_bridge_worker_invocation_packet_preflight_blocked",
          ...packetPreflightFailures,
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      };
    }
    const childJobId = `${input.runtimeJob.jobId}-implementation-codex-bridge`;
    const runId = `coding-team-implementation-${randomUUID()}`;
    const initialValidationCommands =
      this.options.approvedValidationCommands ?? defaultValidationCommands(input);
    const objectiveScope = resolveCodingTeamObjectiveScope({
      objectiveForModel: input.objective,
      objectiveForEvidence: input.objective,
      fallbackRepoScopePaths: this.approvedRepoScopePaths,
      fallbackValidationCommands: initialValidationCommands,
    });
    const approvedRepoScopePaths = objectiveScope.approvedRepoScopePaths;
    const validationCommands = objectiveScope.targetActiveQueueId
      ? objectiveScope.approvedValidationCommands
      : (this.options.approvedValidationCommands ?? objectiveScope.approvedValidationCommands);
    await this.options.runtimeJobs.enqueueJob({
      jobId: childJobId,
      jobType: CODEX_BRIDGE_JOB_TYPE,
      queueName: "codex-bridge",
      parentJobId: input.runtimeJob.jobId,
      parentWorkflowId: "agent_team.coding",
      payload: {
        parentRuntimeJobId: input.runtimeJob.jobId,
        teamRunId: input.teamRunId,
        roleId: input.roleId,
        boundedObjectiveHash: sha256Text(input.objective),
        objectiveScope: {
          ...objectiveScope,
          roleTaskTheme: bound(objectiveScope.roleTaskTheme, 600),
        } as unknown as JsonValue,
        rawPromptStored: false,
        rawResponseStored: false,
        workQueueLifecycleMutated: false,
      },
      idempotencyScope: "coding-team-implementation-bridge",
      idempotencyKey: childJobId,
      maxAttempts: 1,
      leaseTimeoutMs: 20 * 60 * 1000,
      runTimeoutMs: 20 * 60 * 1000,
    });
    const claimedChildJob = await this.options.runtimeJobs.claimNextJob({
      workerId: "agent-team.coding:implementation-bridge",
      queueName: "codex-bridge",
      runtimeJobId: childJobId,
      jobTypes: [CODEX_BRIDGE_JOB_TYPE],
    });
    const stopChildLeaseRenewal = claimedChildJob
      ? this.startChildLeaseRenewal(claimedChildJob.leaseToken)
      : () => undefined;
    const liveInput = buildLiveInput({
      bridgeInput: input,
      childJobId,
      runId,
      repoPath: this.repoPath,
      workspaceDocsPath: this.workspaceDocsPath,
      approvedRepoScopePaths,
      validationCommands,
      objectiveScope,
    });
    let finalResult: CodeWritingPilotLiveResult;
    let validationEvidence: CodeWritingPilotValidationEvidence = summarizeValidationEvidence([]);
    let allValidationEvidence: CodeWritingPilotValidationEvidence[] = [];
    try {
      const beforeChangedFileFingerprints = await changedFileFingerprints({
        repoPath: this.repoPath,
        approvedRepoScopePaths,
      });
      const firstResult = await this.entrypoint.runApprovedLivePilot({
        liveCodeWritingPilotRunId: runId,
        ...liveInput,
        changedFilesProvider: () =>
          changedFilesInApprovedScopes({
            repoPath: this.repoPath,
            approvedRepoScopePaths,
            beforeFingerprints: beforeChangedFileFingerprints,
          }),
      });
      allValidationEvidence = await Promise.all(
        validationCommands.map((command) => runValidation(command, this.repoPath)),
      );
      validationEvidence = summarizeValidationEvidence(allValidationEvidence);
      finalResult = await this.entrypoint.recordValidationEvidence({
        runtimeJobId: childJobId,
        liveCodeWritingPilotRunId: firstResult.liveCodeWritingPilotRunId,
        validationEvidence,
        changedFilesAfterValidation: firstResult.actualFilesChanged,
      });
    } finally {
      stopChildLeaseRenewal();
    }
    const artifactRefs = [
      `runtime-job://${childJobId}/codex-bridge/code-writing-pilot-live/${runId}/codex_bridge.code_writing_pilot_live_result`,
      `runtime-job://${childJobId}/codex-bridge/code-writing-pilot-live/${runId}/codex_bridge.code_writing_pilot_file_scope_report`,
      `runtime-job://${childJobId}/codex-bridge/code-writing-pilot-live/${runId}/codex_bridge.code_writing_pilot_validation_report`,
    ];
    const completed =
      finalResult.completedWorkPathSatisfied &&
      finalResult.fileScopeSatisfied &&
      finalResult.finalResponsePresent &&
      !finalResponseSelfReportsIncomplete(finalResult.finalResponseCandidate) &&
      validationEvidence.status === "passed";
    if (claimedChildJob) {
      if (completed) {
        const childCompleted = await this.options.runtimeJobs.completeJob({
          leaseToken: claimedChildJob.leaseToken,
          result: {
            status: "completed",
            completedWorkPathSatisfied: true,
            validationStatus: validationEvidence.status,
            artifactRefs,
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
            workQueueLifecycleMutated: false,
          },
        });
        if (!childCompleted) {
          throw new Error("codex_bridge_child_job_completion_failed");
        }
      } else {
        const childFailed = await this.options.runtimeJobs.failJob({
          leaseToken: claimedChildJob.leaseToken,
          error: {
            code: "codex_bridge_completed_work_not_satisfied",
            reasonCodes: finalResult.blockingReasons.slice(0, 20),
            completedWorkPathReason: finalResponseSelfReportsIncomplete(
              finalResult.finalResponseCandidate,
            )
              ? "bridge_executor_self_reported_incomplete_objective"
              : finalResult.completedWorkPathReason,
            validationStatus: validationEvidence.status,
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
            workQueueLifecycleMutated: false,
          },
        });
        if (!childFailed) {
          throw new Error("codex_bridge_child_job_failure_record_failed");
        }
      }
    }
    return {
      status: completed ? "completed" : "needs_review",
      transportKind: "codex_app_server",
      modelRef: "openai-codex/code-writing-bridge",
      providerPath: "codex_app_server",
      modelRunRef: finalResult.liveCodeWritingPilotRunId,
      responseHash: sha256Text(
        finalResult.finalResponseCandidate ?? finalResult.completedWorkPathReason,
      ),
      startedAt: finalResult.startedAt,
      completedAt: finalResult.completedAt ?? this.now().toISOString(),
      latencyMs: Math.max(
        0,
        new Date(finalResult.completedAt).getTime() - new Date(finalResult.startedAt).getTime(),
      ),
      summary: bound(
        finalResult.finalResponseCandidate ??
          `Code-writing bridge result: ${finalResult.completedWorkPathReason}`,
        1_000,
      ),
      changedFileRefs: finalResult.actualFilesChanged.slice(0, 40),
      validationRefs: [
        ...allValidationEvidence.map((evidence) => evidence.command),
        `runtime-job://${childJobId}/codex-bridge/code-writing-pilot-live/${runId}/codex_bridge.code_writing_pilot_validation_report`,
      ].filter(Boolean),
      artifactRefs,
      reasonCodes: completed
        ? [
            "codex_file_editing_bridge_completed",
            ...objectiveScope.reasonCodes.slice(0, 6),
            ...(finalResult.actualFilesChanged.length === 0
              ? ["codex_bridge_validation_passed_without_new_file_delta"]
              : []),
          ]
        : [
            ...(finalResponseSelfReportsIncomplete(finalResult.finalResponseCandidate)
              ? ["bridge_executor_self_reported_incomplete_objective"]
              : []),
            ...finalResult.blockingReasons,
            finalResult.completedWorkPathReason,
            finalResult.processResult?.errorMessage
              ? `codex_process_error:${bound(finalResult.processResult.errorMessage, 120)}`
              : null,
            validationEvidence.status !== "passed"
              ? `validation_${validationEvidence.status}:${bound(validationEvidence.summary, 120)}`
              : null,
          ].filter((reason): reason is string => Boolean(reason)),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
  }

  private startChildLeaseRenewal(leaseToken: string): () => void {
    let stopped = false;
    const renew = (): void => {
      if (stopped) {
        return;
      }
      void this.options.runtimeJobs
        .renewLease({
          leaseToken,
          workerId: "agent-team.coding:implementation-bridge",
          extendByMs: 20 * 60 * 1000,
        })
        .catch(() => undefined);
    };
    renew();
    const interval = setInterval(renew, 10_000);
    interval.unref?.();
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }
}
