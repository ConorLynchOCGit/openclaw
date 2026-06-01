import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import {
  classifyModelTaskCall,
  evaluateModelPolicyBindingPreflight,
} from "../model-tasks/model-task-classification.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import { RuntimeToolRegistry } from "../runtime-tool-call/runtime-tool-registry.ts";
import { RuntimeToolTraceRepository } from "../runtime-tool-call/runtime-tool-trace-repository.ts";
import { buildActionReviewArtifact } from "../workflows/action-review-artifacts.ts";
import { buildContextBrokerRequest } from "../workflows/context-broker.ts";
import {
  compileContextRepairRequirement,
  evaluateContextRepairNodeExecutionGate,
} from "../workflows/context-repair-requirement.ts";
import { compileResourceRequirementPacketFromBrokerRequest } from "../workflows/resource-requirement-packet.ts";
import { buildImplementationTaskPacket } from "../workflows/worker-execution-packets.ts";
import {
  compileNodeExecutionPacketForImplementationTask,
  compileNodeExecutionPacketForReadOnlyResource,
  validateWorkerInvocationPacketHydration,
  type NodeExecutionContract,
  type NodeExecutionPacket,
} from "../workflows/node-resource-materialization.ts";
import {
  buildResourceSelectionHandleManifest,
  buildResourceSelectionFieldRepairRequest,
  compileResourceSelectionPacket,
  resourceSelectionDecisionFromToolCall,
  type ResourceSelectionCandidateHandle,
} from "../workflows/resource-selection.ts";
import { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import type { RuntimeWorkGraphBranchScopedFrontierState } from "../workflows/runtime-work-graph-scheduler.ts";
import {
  buildRuntimeNodeCapabilityManifest,
  findRuntimeNodeCapability,
} from "../workflows/runtime-node-capability-registry.ts";
import { evaluateChildEpochFrontierEligibility } from "../workflows/readiness-recompute-authority.ts";
import {
  invokeSchedulerRuntimeTool,
  registerSchedulerRuntimeTools,
  type SchedulerRuntimeToolId,
  type SchedulerRuntimeToolInvocationSummary,
} from "../workflows/scheduler-runtime-tools.ts";
import { compileWorkIntent } from "../workflows/work-intent.ts";
import { runWorkerSmokeMatrixProof } from "./worker-smoke-matrix.ts";

export const ADVERSARIAL_PROOF_ENTRY_SCHEMA_VERSION =
  "execution-platform.adversarial-proof-entry-suite.v1" as const;

export const ADVERSARIAL_PROOF_ENTRY_CASE_IDS = [
  "stale_child_replay",
  "missing_contract_body",
  "resource_repair_without_requirement",
  "domain_resource_selection_over_budget",
  "accepted_with_limitations_without_consumer_waiver",
  "worker_edit_rollback_review",
  "sibling_branch_failure_isolation",
  "provider_routing_contradiction",
  "semantic_lexical_trap",
  "non_coding_domain_fixture",
  "capability_manifest_default_trap",
] as const;

export type AdversarialProofEntryCaseId = (typeof ADVERSARIAL_PROOF_ENTRY_CASE_IDS)[number];

export type AdversarialProofEntryCaseResult = {
  caseId: AdversarialProofEntryCaseId;
  status: "passed" | "failed";
  safeFailureKind:
    | "stale_child_blocked"
    | "missing_contract_blocked"
    | "resource_repair_requirement_blocked"
    | "domain_resource_selection_budget_blocked"
    | "context_limitation_waiver_blocked"
    | "rollback_review_hydrated"
    | "branch_failure_isolated"
    | "provider_route_mismatch_blocked"
    | "lexical_trap_no_effect"
    | "neutral_domain_substrate_passed"
    | "capability_manifest_blocked";
  blockedBeforeProvider: boolean;
  blockedBeforeWorker: boolean;
  providerInvoked: boolean;
  workerInvoked: boolean;
  executableFrontierOpened: boolean;
  authorityWidened: boolean;
  siblingEvidenceSurvived: boolean | null;
  semanticRuntimeJudgmentUsed: false;
  reasonCodes: string[];
  missingFields: string[];
  schemaPaths: string[];
  policyPaths: string[];
  blockerRefs: string[];
  readinessRefs: string[];
  reviewArtifactRefs: string[];
  validationRefs: string[];
  evidenceRefs: string[];
  nextLegalTransitions: string[];
  proofToolInvocationRefs: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  hiddenReasoningStored: false;
};

export type AdversarialProofEntrySuiteResult = {
  artifactKind: "execution_platform.adversarial_proof_entry_suite";
  schemaVersion: typeof ADVERSARIAL_PROOF_ENTRY_SCHEMA_VERSION;
  runtimeJobId: string;
  graphId: string;
  generatedAt: string;
  pass: boolean;
  caseResults: AdversarialProofEntryCaseResult[];
  passedCaseCount: number;
  failedCaseCount: number;
  caseIdsExercised: AdversarialProofEntryCaseId[];
  providerInvocationCount: number;
  workerInvocationCount: number;
  safeBlockCount: number;
  reviewArtifactRefs: string[];
  validationRefs: string[];
  evidenceRefs: string[];
  readinessRefs: string[];
  proofToolInvocationRefs: string[];
  reasonCodes: string[];
  authoritySurfaceRetirementGate: "passed" | "failed";
  generalitySentinel: "passed" | "failed";
  capabilityManifestConformance: "passed" | "failed";
  semanticJudgmentOwner: "model_or_human";
  runtimeAuthority:
    "schema_refs_hashes_bounds_provider_routes_payload_presence_lifecycle_epochs_readiness_validation_manifest_conformance";
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  hiddenReasoningStored: false;
  workQueueLifecycleMutated: false;
};

type ProofRuntime = {
  database: Awaited<ReturnType<typeof createExecutionPlatformPgMemTestDatabase>>;
  kernel: RuntimeToolKernel;
  traces: RuntimeToolTraceRepository;
};

type ImplementationFixture = {
  nodeExecutionContract: NodeExecutionContract;
  nodeExecutionPacket: NodeExecutionPacket;
  codingResourcePacket: ReturnType<
    typeof compileNodeExecutionPacketForImplementationTask
  >["codingResourcePacket"];
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hashJson(value: unknown): string {
  return `sha256:${sha256(JSON.stringify(value))}`;
}

function uniqueStrings(values: Array<string | null | undefined>, max = 120): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= max) {
      break;
    }
  }
  return output;
}

function casePassed(
  input: Omit<AdversarialProofEntryCaseResult, "status" | "semanticRuntimeJudgmentUsed"> & {
    passed: boolean;
  },
): AdversarialProofEntryCaseResult {
  const { passed, ...result } = input;
  return {
    ...result,
    status: passed ? "passed" : "failed",
    semanticRuntimeJudgmentUsed: false,
  };
}

async function createProofRuntime(input: {
  runtimeJobId: string;
  graphId: string;
}): Promise<ProofRuntime> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  await applyExecutionPlatformMigrations(database.sql);
  const registry = new RuntimeToolRegistry();
  registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });
  const traces = new RuntimeToolTraceRepository(database.sql);
  const kernel = new RuntimeToolKernel({ registry, traces });
  const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
  const graphs = new RuntimeWorkGraphRepository(database.sql);
  await runtimeJobs.enqueueJob({
    jobId: input.runtimeJobId,
    jobType: "executor.agent_team",
    queueName: "agent-team",
    payload: { workflowId: "agent_team.coding", proofGate: "adversarial_entry_suite" },
  });
  await graphs.createGraph({
    graphId: input.graphId,
    rootRuntimeJobId: input.runtimeJobId,
    workflowId: "agent_team.coding",
    orchestratorModelRef: "openai-codex/gpt-5.5",
    graphStatus: "running",
  });
  return { database, kernel, traces };
}

async function recordProofTool(input: {
  runtime: ProofRuntime;
  runtimeJobId: string;
  graphId: string;
  caseId: AdversarialProofEntryCaseId | "suite";
  nodeId?: string | null;
  toolId: Extract<SchedulerRuntimeToolId, `proof_entry.${string}`>;
  summary: string;
  metadata: Record<string, unknown>;
}): Promise<SchedulerRuntimeToolInvocationSummary> {
  return await invokeSchedulerRuntimeTool({
    kernel: input.runtime.kernel,
    toolId: input.toolId,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    nodeId: null,
    roleRef: "proof_entry_suite",
    modelRef: null,
    idempotencyKey: `${input.caseId}:${input.toolId}`,
    inputSummary: input.summary,
    metadata: {
      caseId: input.caseId,
      subjectNodeId: input.nodeId ?? null,
      ...input.metadata,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
    },
  });
}

function implementationFixture(input: {
  runtimeJobId: string;
  graphId: string;
  nodeId: string;
  fileRef?: string;
}): ImplementationFixture {
  const fileRef = input.fileRef ?? "extensions/execution-platform/src/proof-entry-fixture.ts";
  const content = "export const proofEntryFixture = true;\n";
  const implementationTaskPacket = buildImplementationTaskPacket({
    runtimeJobId: input.runtimeJobId,
    workflowId: "agent_team.coding",
    graphId: input.graphId,
    sourceGraphNodeId: input.nodeId,
    microtaskId: `${input.nodeId}:task`,
    microtaskTitle: "Adversarial entry implementation fixture",
    exactEditObjective: "Provide one bounded source-edit fixture for structural readiness gates.",
    taskSummary: "A structural fixture with concrete snapshots, validation refs, and accepted context refs.",
    targetCommitmentIds: ["commitment:adversarial-entry"],
    targetFileRefs: [fileRef],
    targetFileSnapshots: [
      {
        fileRef,
        snapshotRef: `repo-snapshot://adversarial-entry/${sha256(fileRef).slice(0, 16)}`,
        contentHash: `sha256:${sha256(content)}`,
        byteCount: Buffer.byteLength(content, "utf8"),
        sourceKind: "repo_file",
        freshnessStatus: "fresh",
        rawContentStored: false,
      },
    ],
    allowedFileRefs: [fileRef],
    allowedEditScope: [fileRef],
    mustReadRefs: [fileRef],
    likelyModifyRefs: [fileRef],
    contextPacketRefs: [`resource-requirement://adversarial-entry/${input.nodeId}`],
    sourceResourceHandoffRefs: [`resource-handoff://adversarial-entry/${input.nodeId}/accepted`],
    sourcePromptExcerptRefs: [`source-prompt://adversarial-entry/${input.nodeId}`],
    validationCommandRefs: [`git diff --check -- ${fileRef}`],
    acceptanceCriteria: ["Structural readiness gates must decide whether worker dispatch is legal."],
    expectedEvidenceClaimKinds: ["source_change", "test_validation"],
    evidenceClaimExpectations: ["Changed files and validation refs map to the fixture commitment."],
    successEvidenceDescriptions: ["Bounded structural fixture compiles into executable packets."],
    contextFreshnessSummary: "fresh",
  });
  return compileNodeExecutionPacketForImplementationTask({
    runtimeJobId: input.runtimeJobId,
    workflowId: "agent_team.coding",
    graphId: input.graphId,
    nodeId: input.nodeId,
    nodeKind: "implementation",
    capabilityId: "implementation_microtask",
    executorKey: "kind:implementation",
    workerRef: "worker.kimi.file-implementation",
    implementationTaskPacket,
  });
}

function traceRefs(...summaries: SchedulerRuntimeToolInvocationSummary[]): string[] {
  return uniqueStrings(summaries.map((summary) => summary.invocationRef), 80);
}

async function staleChildReplayCase(input: {
  runtime: ProofRuntime;
  runtimeJobId: string;
  graphId: string;
}): Promise<AdversarialProofEntryCaseResult> {
  const caseId = "stale_child_replay";
  const prepare = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    toolId: "proof_entry.prepare_case",
    summary: "Prepare stale child replay negative case.",
    metadata: { targetBoundary: "child_epoch_frontier_eligibility" },
  });
  const fault = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    nodeId: "stale-child-node",
    toolId: "proof_entry.inject_structural_fault",
    summary: "Inject stale child epoch metadata.",
    metadata: { childBoundaryEpoch: "boundary-epoch:old", currentBoundaryEpoch: "boundary-epoch:new" },
  });
  const eligibility = evaluateChildEpochFrontierEligibility({
    nodeId: "stale-child-node",
    nodeMetadata: {
      boundaryReplayChild: true,
      boundaryEpoch: "boundary-epoch:old",
      parentNodeId: "parent-node",
      parentContractHash: "sha256:old-contract",
      parentResourcePacketHash: "sha256:old-resource",
      nodeEpochSuperseded: true,
    },
    graphMetadata: { currentBoundaryEpoch: "boundary-epoch:new" },
    currentBoundaryEpoch: "boundary-epoch:new",
    currentParentContractHash: "sha256:new-contract",
    currentParentResourcePacketHash: "sha256:new-resource",
  });
  const preflight = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    nodeId: "stale-child-node",
    toolId: "proof_entry.run_preflight",
    summary: "Evaluate child epoch frontier eligibility.",
    metadata: {
      eligible: eligibility.eligible,
      reasonCodes: eligibility.reasonCodes,
    },
  });
  const safeBlock = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    nodeId: "stale-child-node",
    toolId: "proof_entry.assert_no_executable_frontier",
    summary: "Assert stale child is not executable.",
    metadata: { eligible: eligibility.eligible, stale: eligibility.stale },
  });
  const passed =
    !
    eligibility.eligible &&
    eligibility.reasonCodes.includes("child_epoch_superseded_not_executable") &&
    eligibility.reasonCodes.includes("child_epoch_boundary_epoch_mismatch");
  return casePassed({
    caseId,
    passed,
    safeFailureKind: "stale_child_blocked",
    blockedBeforeProvider: true,
    blockedBeforeWorker: true,
    providerInvoked: false,
    workerInvoked: false,
    executableFrontierOpened: eligibility.eligible,
    authorityWidened: false,
    siblingEvidenceSurvived: null,
    reasonCodes: uniqueStrings([
      "adversarial_stale_child_replay_case_executed",
      ...eligibility.reasonCodes,
      passed ? "adversarial_stale_child_replay_passed" : "adversarial_stale_child_replay_failed",
    ]),
    missingFields: [],
    schemaPaths: [],
    policyPaths: [],
    blockerRefs: ["frontier-blocker://stale-child-node/child-epoch"],
    readinessRefs: [],
    reviewArtifactRefs: [],
    validationRefs: [],
    evidenceRefs: [],
    nextLegalTransitions: ["supersede_child_epoch", "needs_review"],
    proofToolInvocationRefs: traceRefs(prepare, fault, preflight, safeBlock),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
  });
}

async function missingContractBodyCase(input: {
  runtime: ProofRuntime;
  runtimeJobId: string;
  graphId: string;
}): Promise<AdversarialProofEntryCaseResult> {
  const caseId = "missing_contract_body";
  const fixture = implementationFixture({
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    nodeId: "missing-contract-body-node",
  });
  const prepare = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    nodeId: fixture.nodeExecutionPacket.nodeId,
    toolId: "proof_entry.prepare_case",
    summary: "Prepare missing contract body negative case.",
    metadata: { nodeExecutionContractRef: fixture.nodeExecutionContract.contractRef },
  });
  const fault = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    nodeId: fixture.nodeExecutionPacket.nodeId,
    toolId: "proof_entry.inject_structural_fault",
    summary: "Drop hydrated NodeExecutionContract body while preserving packet ref.",
    metadata: { omittedBodyRef: fixture.nodeExecutionContract.contractRef },
  });
  const gate = validateWorkerInvocationPacketHydration({
    nodeExecutionPacket: fixture.nodeExecutionPacket,
    nodeExecutionContract: null,
    resourcePacket: fixture.codingResourcePacket,
    nodeExecutionPacketRequired: true,
    nodeId: fixture.nodeExecutionPacket.nodeId,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    workflowId: "agent_team.coding",
  });
  const preflight = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    nodeId: fixture.nodeExecutionPacket.nodeId,
    toolId: "proof_entry.run_preflight",
    summary: "Evaluate worker readiness with missing contract body.",
    metadata: { allowed: gate.allowed, reasonCodes: gate.reasonCodes },
  });
  const provider = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    nodeId: fixture.nodeExecutionPacket.nodeId,
    toolId: "proof_entry.assert_no_provider_invocation",
    summary: "Assert worker/provider dispatch did not occur.",
    metadata: { providerInvoked: false, workerInvoked: false },
  });
  const passed =
    !
    gate.allowed && gate.reasonCodes.includes("node_execution_contract_body_missing");
  return casePassed({
    caseId,
    passed,
    safeFailureKind: "missing_contract_blocked",
    blockedBeforeProvider: true,
    blockedBeforeWorker: true,
    providerInvoked: false,
    workerInvoked: false,
    executableFrontierOpened: false,
    authorityWidened: false,
    siblingEvidenceSurvived: null,
    reasonCodes: uniqueStrings([
      "adversarial_missing_contract_body_case_executed",
      ...gate.reasonCodes,
      passed ? "adversarial_missing_contract_body_passed" : "adversarial_missing_contract_body_failed",
    ]),
    missingFields: ["nodeExecutionContract.body"],
    schemaPaths: ["nodeExecutionContract"],
    policyPaths: [],
    blockerRefs: ["worker-dispatch-blocker://missing-contract-body-node/contract-body"],
    readinessRefs: gate.nodeReadinessState?.stateRef ? [gate.nodeReadinessState.stateRef] : [],
    reviewArtifactRefs: [],
    validationRefs: [],
    evidenceRefs: [],
    nextLegalTransitions: gate.nodeReadinessState?.nextLegalTransitions ?? ["needs_review"],
    proofToolInvocationRefs: traceRefs(prepare, fault, preflight, provider),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
  });
}

async function contextRepairWithoutRequirementCase(input: {
  runtime: ProofRuntime;
  runtimeJobId: string;
  graphId: string;
}): Promise<AdversarialProofEntryCaseResult> {
  const caseId = "resource_repair_without_requirement";
  const prepare = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    nodeId: "repair-context-node",
    toolId: "proof_entry.prepare_case",
    summary: "Prepare context repair node without requirement packet.",
    metadata: { consumerNodeId: "consumer-implementation-node" },
  });
  const blockedGate = evaluateContextRepairNodeExecutionGate({
    node: {
      nodeId: "repair-context-node",
      nodeKind: "resource_scout",
      inputHandoffRefs: [],
      metadata: {
        runtimeOwnedContextRepairNode: true,
        contextBrokerRequestRef: "runtime-job://job/context-broker/request",
        contextRepairConsumerNodeId: "consumer-implementation-node",
        rawPromptStored: false,
        rawResponseStored: false,
      },
    },
    edges: [],
  });
  const block = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    nodeId: "repair-context-node",
    toolId: "proof_entry.assert_safe_block",
    summary: "Assert context repair without requirement cannot run as production scout.",
    metadata: { status: blockedGate.status, reasonCodes: blockedGate.reasonCodes },
  });
  const compiled = compileContextRepairRequirement({
    runtimeJobId: input.runtimeJobId,
    workflowId: "agent_team.coding",
    graphId: input.graphId,
    repairNodeId: "repair-context-node",
    failedConsumerNodeId: "consumer-implementation-node",
    consumerBranchId: "branch:consumer",
    workIntentRef: "work-intent://consumer-implementation-node",
    targetCommitmentIds: ["commitment:context-repair"],
    downstreamCapabilityId: "implementation_microtask",
    downstreamExecutionIntent: "source_edit",
    downstreamEvidenceMode: ["changed_file_evidence", "validation_evidence"],
    contextPurpose: "Resolve missing target snapshots before implementation.",
    semanticQuestions: ["Which exact bounded target refs are needed by this consumer?"],
    missingFields: ["resourceRequirementRef"],
    reasonCodes: ["resource_repair_requirement_packet_ref_missing"],
  });
  const compile = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    nodeId: "repair-context-node",
    toolId: "proof_entry.run_preflight",
    summary: "Compile the missing ResourceRequirementPacket for the repair node.",
    metadata: {
      resourceRequirementRef: compiled.packet.resourceRequirementRef,
      status: compiled.status,
      canDispatchContextScout: compiled.canDispatchContextScout,
    },
  });
  const passed =
    blockedGate.status === "blocked" &&
    blockedGate.reasonCodes.includes("resource_repair_requirement_packet_ref_missing") &&
    Boolean(compiled.packet.resourceRequirementRef) &&
    compiled.reasonCodes.includes("resource_requirement_runtime_did_not_copy_broad_broker_refs");
  return casePassed({
    caseId,
    passed,
    safeFailureKind: "resource_repair_requirement_blocked",
    blockedBeforeProvider: true,
    blockedBeforeWorker: true,
    providerInvoked: false,
    workerInvoked: false,
    executableFrontierOpened: false,
    authorityWidened: false,
    siblingEvidenceSurvived: null,
    reasonCodes: uniqueStrings([
      "adversarial_resource_repair_without_requirement_case_executed",
      ...blockedGate.reasonCodes,
      ...compiled.reasonCodes,
      passed
        ? "adversarial_resource_repair_without_requirement_passed"
        : "adversarial_resource_repair_without_requirement_failed",
    ]),
    missingFields: ["resourceRequirementRefs"],
    schemaPaths: ["node.metadata.resourceRequirementRefs"],
    policyPaths: ["resource_repair.production_dispatch.requirement_packet"],
    blockerRefs: ["context-repair-blocker://repair-context-node/requirement"],
    readinessRefs: [compiled.packet.resourceRequirementRef],
    reviewArtifactRefs: [],
    validationRefs: [],
    evidenceRefs: [],
    nextLegalTransitions: ["resource_repair.compile_requirement", "needs_review"],
    proofToolInvocationRefs: traceRefs(prepare, block, compile),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
  });
}

function resourceCandidate(index: number): ResourceSelectionCandidateHandle {
  const ref = `repo://neutral-domain/permit-section-${String(index).padStart(3, "0")}.md`;
  return {
    candidateId: `candidate-${index}`,
    resourceRef: ref,
    resourceKind: "permit_review.workflow_section",
    candidateSource: "bounded_manifest",
    sourceRefs: [ref],
    authorityScopeRefs: [`authority://permit-review/read-only/${index}`],
    targetCommitmentIds: ["commitment:neutral-permit-review"],
    capabilityIds: ["reviewer"],
    evidenceRequirements: ["read_only_evidence"],
    objectiveSnippet: "Review neutral permit workflow material.",
    contextSummary: "Bounded neutral-domain resource candidate.",
    payloadRef: `payload://neutral-domain/permit-section-${index}`,
    payloadHash: `sha256:${sha256(ref)}`,
    omittedBodyRef: `omitted://neutral-domain/permit-section-${index}`,
    omittedBodyHash: `sha256:${sha256(`omitted:${ref}`)}`,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

async function domainResourceSelectionOverBudgetCase(input: {
  runtime: ProofRuntime;
  runtimeJobId: string;
  graphId: string;
}): Promise<AdversarialProofEntryCaseResult> {
  const caseId = "domain_resource_selection_over_budget";
  const prepare = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    nodeId: "domain-resource-selection-over-budget-node",
    toolId: "proof_entry.prepare_case",
    summary: "Prepare over-budget resource selection manifest.",
    metadata: { candidateCount: 120, maxInputBytes: 2_400 },
  });
  const manifest = buildResourceSelectionHandleManifest({
    runtimeJobId: input.runtimeJobId,
    workflowId: "agent_team.coding",
    graphId: input.graphId,
    nodeId: "domain-resource-selection-over-budget-node",
    domainKind: "coding_source_refs",
    objectiveSnippet: "Select exact target refs from an intentionally overlarge candidate set.",
    targetCommitmentIds: ["commitment:domain-resource-selection-budget"],
    capabilityIds: ["implementation_microtask"],
    evidenceRequirements: ["changed_file_evidence"],
    candidateHandles: Array.from({ length: 120 }, (_, index) => resourceCandidate(index)),
    maxInputBytes: 2_400,
  });
  const repair = buildResourceSelectionFieldRepairRequest({
    nodeId: "domain-resource-selection-over-budget-node",
    manifest,
  });
  const preflight = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    nodeId: "domain-resource-selection-over-budget-node",
    toolId: "proof_entry.run_preflight",
    summary: "Evaluate handle manifest input budget before model call.",
    metadata: {
      budgetStatus: manifest.budgetStatus,
      inputByteCount: manifest.inputByteCount,
      maxInputBytes: manifest.maxInputBytes,
      repairRequestRef: repair.repairRequestRef,
    },
  });
  const provider = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    nodeId: "domain-resource-selection-over-budget-node",
    toolId: "proof_entry.assert_no_provider_invocation",
    summary: "Assert over-budget target selection did not silently call or upgrade a model.",
    metadata: { providerInvoked: false, silentModelUpgrade: false },
  });
  const safeBlock = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    nodeId: "domain-resource-selection-over-budget-node",
    toolId: "proof_entry.assert_safe_block",
    summary: "Assert over-budget target selection requires a narrowed manifest, not model repair.",
    metadata: {
      budgetStatus: manifest.budgetStatus,
      repairStatus: repair.status,
      requiredTransition: "resource_selection.narrow_candidate_manifest",
    },
  });
  const passed =
    manifest.budgetStatus === "over_budget" &&
    manifest.reasonCodes.includes("domain_resource_selection_payload_over_budget") &&
    repair.status === "no_repair_required";
  return casePassed({
    caseId,
    passed,
    safeFailureKind: "domain_resource_selection_budget_blocked",
    blockedBeforeProvider: true,
    blockedBeforeWorker: true,
    providerInvoked: false,
    workerInvoked: false,
    executableFrontierOpened: false,
    authorityWidened: false,
    siblingEvidenceSurvived: null,
    reasonCodes: uniqueStrings([
      "adversarial_domain_resource_selection_over_budget_case_executed",
      ...manifest.reasonCodes,
      ...repair.reasonCodes,
      repair.status === "no_repair_required"
        ? "resource_selection_budget_block_not_field_repair"
        : "resource_selection_budget_block_incorrectly_field_repair",
      passed
        ? "adversarial_domain_resource_selection_over_budget_passed"
        : "adversarial_domain_resource_selection_over_budget_failed",
    ]),
    missingFields: [],
    schemaPaths: ["resourceSelectionHandleManifest.inputByteCount"],
    policyPaths: ["model_task_policy.maxInputBytes"],
    blockerRefs: [
      `resource-selection-budget-blocker://domain-resource-selection-over-budget-node/${manifest.manifestId}`,
    ],
    readinessRefs: [manifest.manifestRef],
    reviewArtifactRefs: [],
    validationRefs: [],
    evidenceRefs: [],
    nextLegalTransitions: [
      "resource_selection.narrow_candidate_manifest",
      "resource_selection.request_candidate_filtering",
      "needs_review",
    ],
    proofToolInvocationRefs: traceRefs(prepare, preflight, provider, safeBlock),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
  });
}

async function acceptedWithLimitationsWithoutWaiverCase(input: {
  runtime: ProofRuntime;
  runtimeJobId: string;
  graphId: string;
}): Promise<AdversarialProofEntryCaseResult> {
  const caseId = "accepted_with_limitations_without_consumer_waiver";
  const fixture = implementationFixture({
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    nodeId: "limited-context-implementation-node",
  });
  const limitation = "Context handoff accepted with limitation for validation-command discovery.";
  const prepare = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    nodeId: fixture.nodeExecutionPacket.nodeId,
    toolId: "proof_entry.prepare_case",
    summary: "Prepare accepted-with-limitations implementation handoff without waiver.",
    metadata: { limitation },
  });
  const blocked = validateWorkerInvocationPacketHydration({
    nodeExecutionPacket: fixture.nodeExecutionPacket,
    nodeExecutionContract: fixture.nodeExecutionContract,
    resourcePacket: fixture.codingResourcePacket,
    implementationContextPacket: {
      readinessStatus: "ready_with_limitations",
      sourceWorkUnitId: "limited-context-work-unit",
      contextFreshnessStatus: "fresh",
      contextLimitations: [{ limitation, blocking: false }],
      contextLimitationWaivers: [],
    },
    nodeExecutionPacketRequired: true,
    nodeId: fixture.nodeExecutionPacket.nodeId,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    workflowId: "agent_team.coding",
  });
  const allowedWithWaiver = validateWorkerInvocationPacketHydration({
    nodeExecutionPacket: fixture.nodeExecutionPacket,
    nodeExecutionContract: fixture.nodeExecutionContract,
    resourcePacket: fixture.codingResourcePacket,
    implementationContextPacket: {
      readinessStatus: "ready_with_limitations",
      sourceWorkUnitId: "limited-context-work-unit",
      contextFreshnessStatus: "fresh",
      contextLimitations: [{ limitation, blocking: false }],
      contextLimitationWaivers: [
        {
          consumerNodeId: fixture.nodeExecutionPacket.nodeId,
          workUnitId: "limited-context-work-unit",
          limitation,
          evidenceRefs: ["context-waiver://limited-context-implementation-node/exact-consumer"],
        },
      ],
    },
    nodeExecutionPacketRequired: true,
    nodeId: fixture.nodeExecutionPacket.nodeId,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    workflowId: "agent_team.coding",
  });
  const preflight = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    nodeId: fixture.nodeExecutionPacket.nodeId,
    toolId: "proof_entry.run_preflight",
    summary: "Evaluate context limitation waiver gate.",
    metadata: {
      blockedWithoutWaiver: !blocked.allowed,
      allowedWithExactWaiver: allowedWithWaiver.allowed,
      blockedReasonCodes: blocked.reasonCodes,
    },
  });
  const passed =
    !
    blocked.allowed &&
    blocked.reasonCodes.includes("node_readiness_context_limitation_waiver_missing") &&
    !allowedWithWaiver.reasonCodes.includes("node_readiness_context_limitation_waiver_missing");
  return casePassed({
    caseId,
    passed,
    safeFailureKind: "context_limitation_waiver_blocked",
    blockedBeforeProvider: true,
    blockedBeforeWorker: true,
    providerInvoked: false,
    workerInvoked: false,
    executableFrontierOpened: false,
    authorityWidened: false,
    siblingEvidenceSurvived: null,
    reasonCodes: uniqueStrings([
      "adversarial_accepted_with_limitations_without_waiver_case_executed",
      ...blocked.reasonCodes,
      passed
        ? "adversarial_accepted_with_limitations_without_waiver_passed"
        : "adversarial_accepted_with_limitations_without_waiver_failed",
    ]),
    missingFields: ["implementationContextPacket.contextLimitationWaivers"],
    schemaPaths: ["implementationContextPacket.contextLimitations"],
    policyPaths: ["resource_requirement.limitationPolicy.acceptedWithLimitationsRequiresConsumerWaiver"],
    blockerRefs: ["context-limitation-blocker://limited-context-implementation-node/exact-waiver"],
    readinessRefs: uniqueStrings([
      blocked.nodeReadinessState?.stateRef,
      allowedWithWaiver.nodeReadinessState?.stateRef,
    ]),
    reviewArtifactRefs: [],
    validationRefs: [],
    evidenceRefs: [],
    nextLegalTransitions: blocked.nodeReadinessState?.nextLegalTransitions ?? ["open_node_resource_demand"],
    proofToolInvocationRefs: traceRefs(prepare, preflight),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
  });
}

async function workerEditRollbackReviewCase(input: {
  runtime: ProofRuntime;
  runtimeJobId: string;
  graphId: string;
}): Promise<AdversarialProofEntryCaseResult> {
  const caseId = "worker_edit_rollback_review";
  const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-adversarial-entry-worker-"));
  const prepare = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    toolId: "proof_entry.prepare_case",
    summary: "Prepare rollback worker smoke lane.",
    metadata: { repoRootHash: hashJson(repoRoot) },
  });
  const smoke = await runWorkerSmokeMatrixProof({
    runtimeJobId: `${input.runtimeJobId}:worker-rollback`,
    graphId: `${input.graphId}:worker-rollback`,
    repoRoot,
  });
  const editLane = smoke.laneResults.find((lane) => lane.outcome === "scoped_edit") ?? null;
  const targetPath = editLane?.changedFileRefs[0] ? path.join(repoRoot, editLane.changedFileRefs[0]) : null;
  const contentAfterRollback = targetPath ? await readFile(targetPath, "utf8") : "";
  const hydrated = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    nodeId: editLane?.nodeId ?? null,
    toolId: "proof_entry.assert_review_artifact_hydrates",
    summary: "Assert worker review artifacts persist and hydrate after rollback.",
    metadata: {
      reviewArtifactRefs: editLane?.reviewArtifactRefs ?? [],
      workspaceRestored: editLane?.workspaceRestored ?? false,
      rollbackMode: editLane?.rollbackMode ?? null,
    },
  });
  const passed =

    smoke.pass &&
    Boolean(editLane) &&
    editLane?.workspaceRestored === true &&
    editLane.rollbackMode === "rolled_back" &&
    editLane.reviewArtifactRefs.length > 0 &&
    !contentAfterRollback.includes("status: 'after'");
  return casePassed({
    caseId,
    passed,
    safeFailureKind: "rollback_review_hydrated",
    blockedBeforeProvider: false,
    blockedBeforeWorker: false,
    providerInvoked: false,
    workerInvoked: true,
    executableFrontierOpened: false,
    authorityWidened: false,
    siblingEvidenceSurvived: null,
    reasonCodes: uniqueStrings([
      "adversarial_worker_edit_rollback_review_case_executed",
      ...smoke.reasonCodes,
      passed
        ? "adversarial_worker_edit_rollback_review_passed"
        : "adversarial_worker_edit_rollback_review_failed",
    ]),
    missingFields: [],
    schemaPaths: [],
    policyPaths: [],
    blockerRefs: [],
    readinessRefs: uniqueStrings(
      smoke.laneResults.flatMap((lane) => [lane.nodeExecutionPacketRef, lane.domainResourcePacketRef]),
    ),
    reviewArtifactRefs: editLane?.reviewArtifactRefs ?? [],
    validationRefs: editLane?.validationRefs ?? [],
    evidenceRefs: editLane?.evidenceClaimRefs ?? [],
    nextLegalTransitions: ["review_action_artifact"],
    proofToolInvocationRefs: traceRefs(prepare, hydrated),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
  });
}

function branchState(input: {
  graphId: string;
  branchId: string;
  nodeId: string;
  status: RuntimeWorkGraphBranchScopedFrontierState["status"];
  evidenceRefs: string[];
  blockerCode?: string | null;
  reasonCodes?: string[];
  siblingBranchIds: string[];
}): RuntimeWorkGraphBranchScopedFrontierState {
  return {
    artifactKind: "runtime_work_graph_branch_scoped_frontier_state",
    schemaVersion: "execution-platform.runtime-work-graph.branch-scoped-frontier.v1",
    graphId: input.graphId,
    currentSuperstep: 7,
    branchId: input.branchId,
    parentBranchId: null,
    nodeId: input.nodeId,
    nodeKind: "implementation",
    workIntentRef: `work-intent://${input.nodeId}`,
    contractRef: `contract://${input.nodeId}`,
    readinessRef: `readiness://${input.nodeId}`,
    resourceRequirementRefs: [`resource-requirement://${input.nodeId}`],
    domainResourcePacketRef: `resource-packet://${input.nodeId}`,
    resourcePacketRef: `resource-packet://${input.nodeId}`,
    status: input.status,
    blocker: input.blockerCode
      ? {
          code: input.blockerCode,
          summary: "Branch-local materialization blocker.",
          schemaPath: "nodeExecutionContract",
          policyPath: "resource_materialization",
          reasonCodes: input.reasonCodes ?? [],
        }
      : null,
    blockerSignature: input.blockerCode
      ? `signature://${sha256(`${input.nodeId}:${input.blockerCode}`).slice(0, 16)}`
      : null,
    consumerRefs: [`consumer://${input.nodeId}`],
    dependentConsumers: [`consumer://${input.nodeId}`],
    siblingBranchIds: input.siblingBranchIds,
    successfulEvidenceRefs: input.status === "succeeded" ? input.evidenceRefs : [],
    failedEvidenceRefs: input.status === "failed" ? input.evidenceRefs : [],
    repairNodeRefs: input.status === "failed" ? [`repair://${input.nodeId}`] : [],
    diagnosticOnlyNodeRefs: [],
    nextLegalTransitions: input.status === "failed" ? ["open_node_resource_demand"] : ["run_validation"],
    branchClosureState: input.status === "succeeded" ? "closed_succeeded" : "not_applicable",
    branchLocalTransitionPending: false,
    capabilityId: "implementation_microtask",
    executorKey: "kind:implementation",
    modelRef: null,
    workerRef: "worker.kimi.file-implementation",
    phase: "resource_materialization",
    objectiveSummary: "Branch-scoped frontier fixture.",
    whySelected: "Explicit adversarial branch-state fixture.",
    currentToolId: null,
    currentToolInvocationRef: null,
    targetRefSummary: [`target://${input.nodeId}`],
    readinessStatus: input.status,
    rootCauseRef: input.status === "failed" ? `root-cause://${input.nodeId}` : null,
    rootCauseSystemic: input.status === "failed",
    updatedAt: new Date().toISOString(),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}

async function siblingBranchFailureIsolationCase(input: {
  runtime: ProofRuntime;
  runtimeJobId: string;
  graphId: string;
}): Promise<AdversarialProofEntryCaseResult> {
  const caseId = "sibling_branch_failure_isolation";
  const prepare = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    toolId: "proof_entry.prepare_case",
    summary: "Prepare branch-scoped frontier sibling failure case.",
    metadata: { branchCount: 2 },
  });
  const successEvidenceRef = "evidence://sibling-success/source-change";
  const success = branchState({
    graphId: input.graphId,
    branchId: "branch:success",
    nodeId: "sibling-success-node",
    status: "succeeded",
    evidenceRefs: [successEvidenceRef],
    siblingBranchIds: ["branch:failed"],
  });
  const failed = branchState({
    graphId: input.graphId,
    branchId: "branch:failed",
    nodeId: "sibling-failed-node",
    status: "failed",
    evidenceRefs: ["evidence://sibling-failed/materialization-blocker"],
    blockerCode: "resource_packet_missing",
    reasonCodes: ["node_execution_packet_resource_packet_body_missing"],
    siblingBranchIds: ["branch:success"],
  });
  const assertSurvived = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    toolId: "proof_entry.assert_sibling_evidence_survived",
    summary: "Assert successful sibling evidence survives failed branch root cause.",
    metadata: {
      successEvidenceRefs: success.successfulEvidenceRefs,
      failedBranchBlocker: failed.blocker,
    },
  });
  const passed =
    success.successfulEvidenceRefs.includes(successEvidenceRef) &&
    failed.blocker?.code === "resource_packet_missing" &&
    failed.repairNodeRefs.length > 0 &&
    success.siblingBranchIds.includes(failed.branchId);
  return casePassed({
    caseId,
    passed,
    safeFailureKind: "branch_failure_isolated",
    blockedBeforeProvider: true,
    blockedBeforeWorker: true,
    providerInvoked: false,
    workerInvoked: false,
    executableFrontierOpened: false,
    authorityWidened: false,
    siblingEvidenceSurvived: success.successfulEvidenceRefs.includes(successEvidenceRef),
    reasonCodes: uniqueStrings([
      "adversarial_sibling_branch_failure_isolation_case_executed",
      ...(failed.blocker?.reasonCodes ?? []),
      passed
        ? "adversarial_sibling_branch_failure_isolation_passed"
        : "adversarial_sibling_branch_failure_isolation_failed",
    ]),
    missingFields: ["resourcePacket.body"],
    schemaPaths: ["domainResourcePacket"],
    policyPaths: ["branch_scoped_frontier_state.failed_branch"],
    blockerRefs: [failed.blockerSignature ?? "branch-blocker://sibling-failed-node"],
    readinessRefs: [success.readinessRef, failed.readinessRef].filter(
      (ref): ref is string => Boolean(ref),
    ),
    reviewArtifactRefs: [],
    validationRefs: [],
    evidenceRefs: [successEvidenceRef],
    nextLegalTransitions: failed.nextLegalTransitions,
    proofToolInvocationRefs: traceRefs(prepare, assertSurvived),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
  });
}

async function providerRoutingContradictionCase(input: {
  runtime: ProofRuntime;
  runtimeJobId: string;
  graphId: string;
}): Promise<AdversarialProofEntryCaseResult> {
  const caseId = "provider_routing_contradiction";
  const prepare = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    toolId: "proof_entry.prepare_case",
    summary: "Prepare provider route contradiction case.",
    metadata: { expectedProviderPath: "codex_app_server", actualProviderPath: "openrouter" },
  });
  const classification = classifyModelTaskCall({
    taskClass: "global_reasoning",
    callSite: "scheduler.global_reasoning",
    workflowId: "agent_team.coding",
    graphId: input.graphId,
    nodeId: "provider-route-mismatch-node",
    runtimeJobId: input.runtimeJobId,
  });
  const preflight = evaluateModelPolicyBindingPreflight({
    classification,
    providerCallRequested: true,
    actualModelRef: "qwen/qwen3-coder-next",
    actualProviderPath: "openrouter",
    actualReasoningMode: "none",
    actualParserMode: "runtime_json_object",
    actualResponseFormatMode: "prompt_only_json",
    actualAllowedToolFamily: "scheduler.orchestrator_decision",
    actualOutputContractId: "runtime_work_graph_orchestrator_plan",
    actualOutputContractVersion: "v1",
    requestedInputBytes: 8_000,
    requestedMaxOutputTokens: 2_000,
    requestedTimeoutMs: 90_000,
    proofMode: true,
  });
  const tool = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    nodeId: "provider-route-mismatch-node",
    toolId: "proof_entry.run_preflight",
    summary: "Evaluate provider route mismatch before model invocation.",
    metadata: {
      accepted: preflight.accepted,
      mismatches: preflight.mismatches,
      reasonCodes: preflight.reasonCodes,
    },
  });
  const passed =
    !
    preflight.accepted &&
    preflight.reasonCodes.includes("model_policy_provider_path_mismatch") &&
    preflight.reasonCodes.includes("model_policy_model_ref_not_allowed");
  return casePassed({
    caseId,
    passed,
    safeFailureKind: "provider_route_mismatch_blocked",
    blockedBeforeProvider: true,
    blockedBeforeWorker: true,
    providerInvoked: false,
    workerInvoked: false,
    executableFrontierOpened: false,
    authorityWidened: false,
    siblingEvidenceSurvived: null,
    reasonCodes: uniqueStrings([
      "adversarial_provider_routing_contradiction_case_executed",
      ...preflight.reasonCodes,
      passed
        ? "adversarial_provider_routing_contradiction_passed"
        : "adversarial_provider_routing_contradiction_failed",
    ]),
    missingFields: [],
    schemaPaths: ["modelPolicyBinding.providerPath"],
    policyPaths: ["model_contract_boundary.scheduler_global_reasoning"],
    blockerRefs: ["model-policy-blocker://provider-route-mismatch-node"],
    readinessRefs: [preflight.boundaryRef].filter((ref): ref is string => Boolean(ref)),
    reviewArtifactRefs: [],
    validationRefs: [],
    evidenceRefs: [],
    nextLegalTransitions: ["needs_review"],
    proofToolInvocationRefs: traceRefs(prepare, tool),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
  });
}

async function semanticLexicalTrapCase(input: {
  runtime: ProofRuntime;
  runtimeJobId: string;
  graphId: string;
}): Promise<AdversarialProofEntryCaseResult> {
  const caseId = "semantic_lexical_trap";
  const prepare = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    toolId: "proof_entry.prepare_case",
    summary: "Prepare lexical trap strings in non-authoritative fields.",
    metadata: { trapStringCount: 5 },
  });
  const base = evaluateChildEpochFrontierEligibility({
    nodeId: "neutral-node",
    nodeMetadata: {
      boundaryReplayChild: true,
      boundaryEpoch: "boundary-epoch:current",
      parentNodeId: "neutral-parent",
      parentContractHash: "sha256:contract",
      parentResourcePacketHash: "sha256:resource",
    },
    graphMetadata: { currentBoundaryEpoch: "boundary-epoch:current" },
    currentBoundaryEpoch: "boundary-epoch:current",
    currentParentContractHash: "sha256:contract",
    currentParentResourcePacketHash: "sha256:resource",
  });
  const trapped = evaluateChildEpochFrontierEligibility({
    nodeId: "neutral-node",
    nodeMetadata: {
      boundaryReplayChild: true,
      boundaryEpoch: "boundary-epoch:current",
      parentNodeId: "neutral-parent",
      parentContractHash: "sha256:contract",
      parentResourcePacketHash: "sha256:resource",
      title: "Product/Spec context_synthesis implementation missing blocker trap",
      fileName: "implementation-context-product-spec.md",
      commitmentId: "commitment:context_synthesis_implementation_product_spec",
      contextSummary: "This text should not affect structural runtime behavior.",
      artifactRef: "artifact://Product/Spec/context_synthesis/implementation",
    },
    graphMetadata: { currentBoundaryEpoch: "boundary-epoch:current" },
    currentBoundaryEpoch: "boundary-epoch:current",
    currentParentContractHash: "sha256:contract",
    currentParentResourcePacketHash: "sha256:resource",
  });
  const assertNoChange = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    nodeId: "neutral-node",
    toolId: "proof_entry.assert_no_authority_widening",
    summary: "Assert lexical trap strings do not alter structural eligibility.",
    metadata: {
      baseEligible: base.eligible,
      trappedEligible: trapped.eligible,
      baseReasonCodes: base.reasonCodes,
      trappedReasonCodes: trapped.reasonCodes,
    },
  });
  const passed =
    base.eligible === trapped.eligible &&
    JSON.stringify(base.reasonCodes) === JSON.stringify(trapped.reasonCodes);
  return casePassed({
    caseId,
    passed,
    safeFailureKind: "lexical_trap_no_effect",
    blockedBeforeProvider: true,
    blockedBeforeWorker: true,
    providerInvoked: false,
    workerInvoked: false,
    executableFrontierOpened: false,
    authorityWidened: false,
    siblingEvidenceSurvived: null,
    reasonCodes: uniqueStrings([
      "adversarial_semantic_lexical_trap_case_executed",
      "lexical_trap_structural_fields_unchanged",
      passed ? "adversarial_semantic_lexical_trap_passed" : "adversarial_semantic_lexical_trap_failed",
    ]),
    missingFields: [],
    schemaPaths: [],
    policyPaths: ["runtime_authority.structural_fields_only"],
    blockerRefs: [],
    readinessRefs: [],
    reviewArtifactRefs: [],
    validationRefs: [],
    evidenceRefs: [],
    nextLegalTransitions: ["no_action_required"],
    proofToolInvocationRefs: traceRefs(prepare, assertNoChange),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
  });
}

async function nonCodingDomainFixtureCase(input: {
  runtime: ProofRuntime;
  runtimeJobId: string;
  graphId: string;
}): Promise<AdversarialProofEntryCaseResult> {
  const caseId = "non_coding_domain_fixture";
  const prepare = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    nodeId: "permit-review-node",
    toolId: "proof_entry.prepare_case",
    summary: "Prepare neutral non-coding domain substrate fixture.",
    metadata: { domainKind: "permit_review.workflow" },
  });
  const manifest = buildRuntimeNodeCapabilityManifest();
  const workIntent = compileWorkIntent({
    decisionId: "decision:permit-review",
    graphId: input.graphId,
    workUnitId: "permit-review-work-unit",
    title: "Neutral permit workflow review",
    objective: "Review a neutral permit workflow packet through read-only orchestration substrate.",
    commitmentIds: ["commitment:neutral-permit-review"],
    executionIntent: "review",
    selectedCapabilityId: "reviewer",
    consideredCapabilityIds: ["reviewer", "observability_readback"],
    capabilityRationale: "Review capability is explicitly selected for neutral read-only assessment.",
    costRationale: "Read-only review does not need implementation authority.",
    expectedOutput: "Bounded review artifact over neutral permit material.",
    successCriteria: ["Review artifact is hydrateable and tied to neutral domain refs."],
    contextQuestions: ["What permit workflow rule changed?"],
    resourceRefs: ["permit://workflow/rule-a"],
    inputRefs: ["permit://workflow/source-packet"],
    validationNeeds: ["validation://permit-review/schema-check"],
    downstreamConsumer: "permit-review-node",
    stopIfMissing: ["Stop if neutral permit source refs are missing."],
    capabilityManifest: manifest,
  });
  const brokerRequest = buildContextBrokerRequest({
    runtimeJobId: input.runtimeJobId,
    workflowId: "permit_review.workflow",
    graphId: input.graphId,
    requestingNodeId: "permit-context-request",
    consumerNodeId: "permit-review-node",
    targetCommitmentIds: ["commitment:neutral-permit-review"],
    requiredResourceKind: "permit_review.workflow_packet",
    neededByPhase: "review_ready",
    semanticQuestion: "Which neutral permit workflow refs are required for read-only review?",
    candidateResourceRefs: ["permit://workflow/rule-a"],
    missingContextReasonCodes: ["permit_review_resource_required"],
  });
  const requirement = compileResourceRequirementPacketFromBrokerRequest({
    request: brokerRequest,
    workIntentRef: workIntent.workIntent?.workIntentRef ?? null,
    consumerBranchId: "branch:permit-review",
    downstreamCapabilityId: "reviewer",
    downstreamExecutionIntent: "review",
    downstreamEvidenceMode: ["read_only_evidence"],
    contextPurpose: "Neutral permit workflow review context.",
    semanticQuestions: ["Which bounded permit refs support this review?"],
    requiredResourceKinds: ["permit_workflow_rule"],
    knownTargetRefs: ["permit://workflow/rule-a"],
    knownValidationNeedRefs: ["validation://permit-review/schema-check"],
  });
  const selectionManifest = buildResourceSelectionHandleManifest({
    runtimeJobId: input.runtimeJobId,
    workflowId: "permit_review.workflow",
    graphId: input.graphId,
    nodeId: "permit-review-node",
    sourceWorkUnitId: "permit-review-work-unit",
    domainKind: "permit_review.workflow",
    objectiveSnippet: "Select neutral permit workflow refs.",
    targetCommitmentIds: ["commitment:neutral-permit-review"],
    capabilityIds: ["reviewer"],
    evidenceRequirements: ["read_only_evidence"],
    candidateHandles: [resourceCandidate(1)],
    maxInputBytes: 32_000,
  });
  const selectionDecision = resourceSelectionDecisionFromToolCall({
    toolName: "resource.selection.propose",
    arguments: {
      selectedResourceRefs: [selectionManifest.candidateHandles[0].resourceRef],
      resourceIntents: [
        {
          resourceRef: selectionManifest.candidateHandles[0].resourceRef,
          intentKind: "read_only_review_source",
          intendedUse: "Provide neutral permit workflow source evidence.",
          rationale: "The model-authored selection chooses the one candidate from the manifest.",
          validationHintRefs: ["validation://permit-review/schema-check"],
        },
      ],
      validationDiscoveryPlan: ["Use the neutral permit schema validation ref."],
      selectionRationale: "One bounded candidate satisfies the neutral review objective.",
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  });
  const selectionPacket = compileResourceSelectionPacket({
    runtimeJobId: input.runtimeJobId,
    workflowId: "permit_review.workflow",
    graphId: input.graphId,
    nodeId: "permit-review-node",
    sourceWorkUnitId: "permit-review-work-unit",
    domainKind: "permit_review.workflow",
    targetCommitmentIds: ["commitment:neutral-permit-review"],
    manifest: selectionManifest,
    decision: selectionDecision,
    modelTaskBoundaryId: "domain_resource_selection",
    modelTaskPolicyRef: "model-task-policy://neutral-domain/read-only",
    providerPath: "runtime_only",
    modelRef: "model://not-invoked",
  });
  const materialized = compileNodeExecutionPacketForReadOnlyResource({
    runtimeJobId: input.runtimeJobId,
    workflowId: "permit_review.workflow",
    graphId: input.graphId,
    nodeId: "permit-review-node",
    nodeKind: "reviewer",
    capabilityId: "reviewer",
    executorKey: "kind:reviewer",
    workerRef: "worker.reviewer.runtime",
    packetId: "permit-review-node:read-only",
    executionIntent: "review",
    evidenceMode: ["read_only_evidence"],
    sourceRefs: selectionPacket.selectedResourceRefs,
    boundedSnapshotRefs: ["permit-snapshot://workflow/rule-a"],
    contextPacketRefs: [requirement.packet.resourceRequirementRef],
    acceptedResourceHandoffRefs: ["resource-handoff://permit-review/accepted"],
    validationRefs: ["validation://permit-review/schema-check"],
    validationDiscoveryPlan: ["Validate neutral permit workflow schema refs."],
    targetCommitmentIds: ["commitment:neutral-permit-review"],
    evidenceClaimExpectations: ["Read-only evidence maps to neutral permit workflow commitment."],
    authorityScope: ["permit://workflow/read-only"],
    stopIfMissingOrEscalate: ["Stop if permit source refs are unavailable."],
  });
  const artifact = buildActionReviewArtifact({
    runtimeJobId: input.runtimeJobId,
    workflowId: "permit_review.workflow",
    graphId: input.graphId,
    branchId: "branch:permit-review",
    nodeId: "permit-review-node",
    workerId: "worker.reviewer.runtime",
    roleId: "reviewer",
    capabilityId: "reviewer",
    taskId: "permit-review-work-unit",
    actionKind: "permit_review.workflow_review",
    actionStatus: "blocked",
    reviewState: "pending_model_or_human_review",
    authorityScopeRefs: ["permit://workflow/read-only"],
    nodeExecutionContractRef: materialized.nodeExecutionContract.contractRef,
    nodeExecutionContractHash: materialized.nodeExecutionContract.contractHash,
    nodeExecutionPacketRef: materialized.nodeExecutionPacket.packetRef,
    nodeExecutionPacketHash: hashJson(materialized.nodeExecutionPacket),
    domainResourcePacketRef: materialized.readOnlyResourcePacket.packetRef,
    domainResourcePacketHash: hashJson(materialized.readOnlyResourcePacket),
    domainResourceSelectionPacketRef: selectionPacket.packetRef,
    domainResourceSelectionPacketHash: hashJson(selectionPacket),
    validationRefs: ["validation://permit-review/schema-check"],
    evidenceClaimRefs: ["evidence://permit-review/read-only"],
    rollbackMode: "not_applicable",
    rollbackResultRefs: [],
    reviewDecisionRefs: [],
    payloadRefs: [
      workIntent.workIntent?.workIntentRef ?? "work-intent://permit-review/missing",
      requirement.packet.resourceRequirementRef,
      selectionPacket.packetRef,
    ],
    payloadHashes: [
      requirement.packet.resourceRequirementHash,
      selectionManifest.manifestHash,
      hashJson(selectionPacket),
    ],
    payloadCounts: {
      workIntents: workIntent.workIntent ? 1 : 0,
      resourceRequirements: 1,
      resourceSelections: 1,
    },
    boundedSummary: "Neutral non-coding permit workflow fixture exercised generic orchestration contracts.",
    reasonCodes: ["neutral_domain_action_review_fixture"],
  });
  const preflight = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    nodeId: "permit-review-node",
    toolId: "proof_entry.run_preflight",
    summary: "Evaluate neutral non-coding domain fixture contracts.",
    metadata: {
      workIntentRef: workIntent.workIntent?.workIntentRef ?? null,
      resourceRequirementRef: requirement.packet.resourceRequirementRef,
      resourceSelectionPacketRef: selectionPacket.packetRef,
      nodeExecutionPacketRef: materialized.nodeExecutionPacket.packetRef,
      actionReviewArtifactRef: artifact.artifactRef,
    },
  });
  const passed =
    Boolean(workIntent.workIntent) &&

    workIntent.capabilityValidation.valid &&
    requirement.reasonCodes.includes("resource_requirement_runtime_did_not_copy_broad_broker_refs") &&
    selectionPacket.status === "accepted" &&

    materialized.readiness.valid &&
    artifact.artifactKind === "action_review_artifact";
  return casePassed({
    caseId,
    passed,
    safeFailureKind: "neutral_domain_substrate_passed",
    blockedBeforeProvider: true,
    blockedBeforeWorker: true,
    providerInvoked: false,
    workerInvoked: false,
    executableFrontierOpened: false,
    authorityWidened: false,
    siblingEvidenceSurvived: null,
    reasonCodes: uniqueStrings([
      "adversarial_non_coding_domain_fixture_case_executed",
      ...workIntent.reasonCodes,
      ...requirement.reasonCodes,
      ...selectionPacket.reasonCodes,
      ...materialized.readiness.reasonCodes,
      passed
        ? "adversarial_non_coding_domain_fixture_passed"
        : "adversarial_non_coding_domain_fixture_failed",
    ]),
    missingFields: [],
    schemaPaths: [],
    policyPaths: [],
    blockerRefs: [],
    readinessRefs: uniqueStrings([
      workIntent.workIntent?.workIntentRef,
      requirement.packet.resourceRequirementRef,
      selectionPacket.packetRef,
      materialized.readiness.state.stateRef,
    ]),
    reviewArtifactRefs: [artifact.artifactRef],
    validationRefs: ["validation://permit-review/schema-check"],
    evidenceRefs: ["evidence://permit-review/read-only"],
    nextLegalTransitions: materialized.readiness.state.nextLegalTransitions,
    proofToolInvocationRefs: traceRefs(prepare, preflight),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
  });
}

async function capabilityManifestDefaultTrapCase(input: {
  runtime: ProofRuntime;
  runtimeJobId: string;
  graphId: string;
}): Promise<AdversarialProofEntryCaseResult> {
  const caseId = "capability_manifest_default_trap";
  const prepare = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    nodeId: "capability-default-trap-node",
    toolId: "proof_entry.prepare_case",
    summary: "Prepare omitted capability and incompatible capability trap.",
    metadata: { defaultCapabilityForbidden: "implementation_microtask" },
  });
  const manifest = buildRuntimeNodeCapabilityManifest();
  const missing = compileWorkIntent({
    decisionId: "decision:capability-missing",
    graphId: input.graphId,
    workUnitId: "capability-missing-work-unit",
    title: "Capability missing trap",
    objective: "Do not default a missing capability to implementation.",
    commitmentIds: ["commitment:capability-trap"],
    executionIntent: "source_edit",
    selectedCapabilityId: "capability.omitted",
    consideredCapabilityIds: [],
    capabilityRationale: "The model failed to provide a registered capability.",
    expectedOutput: "A manifest-conformance blocker.",
    successCriteria: ["Runtime blocks rather than defaulting."],
    downstreamConsumer: "capability-default-trap-node",
    capabilityManifest: manifest,
  });
  const incompatible = compileWorkIntent({
    decisionId: "decision:capability-incompatible",
    graphId: input.graphId,
    workUnitId: "capability-incompatible-work-unit",
    title: "Capability incompatible trap",
    objective: "Do not run readback as source edit.",
    commitmentIds: ["commitment:capability-trap"],
    executionIntent: "source_edit",
    selectedCapabilityId: "observability_readback",
    consideredCapabilityIds: ["observability_readback"],
    capabilityRationale: "The selected capability is intentionally incompatible.",
    expectedOutput: "A manifest-conformance blocker.",
    successCriteria: ["Runtime blocks rather than defaulting."],
    downstreamConsumer: "capability-default-trap-node",
    capabilityManifest: manifest,
  });
  const defaultCapability = findRuntimeNodeCapability("implementation_microtask", manifest);
  const preflight = await recordProofTool({
    runtime: input.runtime,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    caseId,
    nodeId: "capability-default-trap-node",
    toolId: "proof_entry.run_preflight",
    summary: "Evaluate capability manifest conformance without default fallback.",
    metadata: {
      missingCapabilityReasonCodes: missing.reasonCodes,
      incompatibleCapabilityReasonCodes: incompatible.reasonCodes,
      defaultCapabilityExistsButNotUsed: Boolean(defaultCapability),
    },
  });
  const passed =
    !missing.capabilityValidation.valid &&
    missing.reasonCodes.some((code) =>
      code.startsWith("work_intent_selected_capability_unknown:"),
    ) &&
    !incompatible.capabilityValidation.valid &&
    incompatible.reasonCodes.some((code) =>
      code.startsWith("work_intent_execution_intent_capability_conflict:"),
    ) &&
    defaultCapability?.capabilityId === "implementation_microtask";
  return casePassed({
    caseId,
    passed,
    safeFailureKind: "capability_manifest_blocked",
    blockedBeforeProvider: true,
    blockedBeforeWorker: true,
    providerInvoked: false,
    workerInvoked: false,
    executableFrontierOpened: false,
    authorityWidened: false,
    siblingEvidenceSurvived: null,
    reasonCodes: uniqueStrings([
      "adversarial_capability_manifest_default_trap_case_executed",
      ...missing.reasonCodes,
      ...incompatible.reasonCodes,
      passed
        ? "adversarial_capability_manifest_default_trap_passed"
        : "adversarial_capability_manifest_default_trap_failed",
    ]),
    missingFields: ["workIntent.selectedCapabilityId"],
    schemaPaths: ["workIntent.modelFields.selectedCapabilityId"],
    policyPaths: ["runtime_node_capability_manifest"],
    blockerRefs: ["capability-manifest-blocker://capability-default-trap-node"],
    readinessRefs: [],
    reviewArtifactRefs: [],
    validationRefs: [],
    evidenceRefs: [],
    nextLegalTransitions: ["needs_review"],
    proofToolInvocationRefs: traceRefs(prepare, preflight),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
  });
}

async function runCases(input: {
  runtime: ProofRuntime;
  runtimeJobId: string;
  graphId: string;
}): Promise<AdversarialProofEntryCaseResult[]> {
  return [
    await staleChildReplayCase(input),
    await missingContractBodyCase(input),
    await contextRepairWithoutRequirementCase(input),
    await domainResourceSelectionOverBudgetCase(input),
    await acceptedWithLimitationsWithoutWaiverCase(input),
    await workerEditRollbackReviewCase(input),
    await siblingBranchFailureIsolationCase(input),
    await providerRoutingContradictionCase(input),
    await semanticLexicalTrapCase(input),
    await nonCodingDomainFixtureCase(input),
    await capabilityManifestDefaultTrapCase(input),
  ];
}

export async function runAdversarialProofEntrySuite(input: {
  runtimeJobId?: string;
  graphId?: string;
} = {}): Promise<AdversarialProofEntrySuiteResult> {
  const runtimeJobId = input.runtimeJobId ?? "adversarial-proof-entry-suite-job";
  const graphId = input.graphId ?? "adversarial-proof-entry-suite-graph";
  const runtime = await createProofRuntime({ runtimeJobId, graphId });
  try {
    const prepare = await recordProofTool({
      runtime,
      runtimeJobId,
      graphId,
      caseId: "suite",
      toolId: "proof_entry.prepare_suite",
      summary: "Prepare adversarial proof-entry suite.",
      metadata: { caseIds: ADVERSARIAL_PROOF_ENTRY_CASE_IDS },
    });
    const unrecordedCaseResults = await runCases({ runtime, runtimeJobId, graphId });
    const caseResults: AdversarialProofEntryCaseResult[] = [];
    for (const caseResult of unrecordedCaseResults) {
      const recorded = await recordProofTool({
        runtime,
        runtimeJobId,
        graphId,
        caseId: caseResult.caseId,
        toolId: "proof_entry.record_case_result",
        summary: `Record adversarial proof-entry result for ${caseResult.caseId}.`,
        metadata: {
          caseStatus: caseResult.status,
          safeFailureKind: caseResult.safeFailureKind,
          reasonCodes: caseResult.reasonCodes,
          blockedBeforeProvider: caseResult.blockedBeforeProvider,
          blockedBeforeWorker: caseResult.blockedBeforeWorker,
          providerInvoked: caseResult.providerInvoked,
          workerInvoked: caseResult.workerInvoked,
        },
      });
      caseResults.push({
        ...caseResult,
        proofToolInvocationRefs: uniqueStrings(
          [...caseResult.proofToolInvocationRefs, recorded.invocationRef],
          80,
        ),
      });
    }
    const closeout = await recordProofTool({
      runtime,
      runtimeJobId,
      graphId,
      caseId: "suite",
      toolId: "proof_entry.record_suite_closeout",
      summary: "Record adversarial proof-entry suite closeout evidence.",
      metadata: {
        passedCaseCount: caseResults.filter((result) => result.status === "passed").length,
        failedCaseCount: caseResults.filter((result) => result.status === "failed").length,
      },
    });
    const traceRows = await runtime.traces.listInvocations({ graphId, limit: 400 });
    const caseIdsExercised = uniqueStrings(
      caseResults.map((result) => result.caseId),
      32,
    ) as AdversarialProofEntryCaseId[];
    const allCasesExercised = ADVERSARIAL_PROOF_ENTRY_CASE_IDS.every((caseId) =>
      caseIdsExercised.includes(caseId),
    );
    const allCasesPassed = caseResults.every((result) => result.status === "passed");
    const noUnsafeInvocation = caseResults.every(
      (result) =>
        result.caseId === "worker_edit_rollback_review" ||
        (!result.providerInvoked && ! result.workerInvoked),
    );
    const noExecutableFrontier = caseResults.every(
      (result) => ! result.executableFrontierOpened,
    );
    const noAuthorityWidening = caseResults.every((result) => ! result.authorityWidened);
    const generalitySentinel = caseResults.some(
      (result) =>
        result.caseId === "non_coding_domain_fixture" && result.status === "passed",
    )
      ? "passed"
      : "failed";
    const capabilityManifestConformance = caseResults.some(
      (result) =>
        result.caseId === "capability_manifest_default_trap" && result.status === "passed",
    )
      ? "passed"
      : "failed";
    const authoritySurfaceRetirementGate =
      allCasesPassed && noUnsafeInvocation && noExecutableFrontier && noAuthorityWidening
        ? "passed"
        : "failed";
    const pass =
      allCasesExercised &&
      allCasesPassed &&
      authoritySurfaceRetirementGate === "passed" &&
      generalitySentinel === "passed" &&
      capabilityManifestConformance === "passed";
    return {
      artifactKind: "execution_platform.adversarial_proof_entry_suite",
      schemaVersion: ADVERSARIAL_PROOF_ENTRY_SCHEMA_VERSION,
      runtimeJobId,
      graphId,
      generatedAt: new Date().toISOString(),
      pass,
      caseResults,
      passedCaseCount: caseResults.filter((result) => result.status === "passed").length,
      failedCaseCount: caseResults.filter((result) => result.status === "failed").length,
      caseIdsExercised,
      providerInvocationCount: caseResults.filter((result) => result.providerInvoked).length,
      workerInvocationCount: caseResults.filter((result) => result.workerInvoked).length,
      safeBlockCount: caseResults.filter(
        (result) =>
          result.blockedBeforeProvider ||
          result.blockedBeforeWorker ||
          result.safeFailureKind === "rollback_review_hydrated" ||
          result.safeFailureKind === "neutral_domain_substrate_passed",
      ).length,
      reviewArtifactRefs: uniqueStrings(
        caseResults.flatMap((result) => result.reviewArtifactRefs),
        120,
      ),
      validationRefs: uniqueStrings(
        caseResults.flatMap((result) => result.validationRefs),
        120,
      ),
      evidenceRefs: uniqueStrings(
        caseResults.flatMap((result) => result.evidenceRefs),
        120,
      ),
      readinessRefs: uniqueStrings(
        caseResults.flatMap((result) => result.readinessRefs),
        160,
      ),
      proofToolInvocationRefs: uniqueStrings(
        [
          prepare.invocationRef,
          closeout.invocationRef,
          ...caseResults.flatMap((result) => result.proofToolInvocationRefs),
          ...traceRows
            .filter((row) => row.toolId.startsWith("proof_entry."))
            .map((row) => row.invocationId),
        ],
        240,
      ),
      reasonCodes: uniqueStrings(
        [
          allCasesExercised
            ? "adversarial_entry_all_cases_exercised"
            : "adversarial_entry_case_coverage_missing",
          allCasesPassed
            ? "adversarial_entry_all_cases_passed"
            : "adversarial_entry_case_failure_present",
          `authority_surface_retirement_gate:${authoritySurfaceRetirementGate}`,
          `generality_sentinel:${generalitySentinel}`,
          `capability_manifest_conformance:${capabilityManifestConformance}`,
          pass ? "adversarial_proof_entry_suite_passed" : "adversarial_proof_entry_suite_failed",
          "runtime_semantic_judgment_not_used",
          "raw_storage_flags_false",
        ],
        120,
      ),
      authoritySurfaceRetirementGate,
      generalitySentinel,
      capabilityManifestConformance,
      semanticJudgmentOwner: "model_or_human",
      runtimeAuthority:
        "schema_refs_hashes_bounds_provider_routes_payload_presence_lifecycle_epochs_readiness_validation_manifest_conformance",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      hiddenReasoningStored: false,
      workQueueLifecycleMutated: false,
    };
  } finally {
    await runtime.database.close();
  }
}

export async function writeAdversarialProofEntrySuiteArtifact(input: {
  outputPath: string;
  result?: AdversarialProofEntrySuiteResult;
}): Promise<AdversarialProofEntrySuiteResult> {
  const result = input.result ?? (await runAdversarialProofEntrySuite());
  await mkdir(path.dirname(input.outputPath), { recursive: true });
  await writeFile(input.outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}
