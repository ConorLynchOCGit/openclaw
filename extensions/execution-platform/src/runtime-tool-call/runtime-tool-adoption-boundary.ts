import type { JsonValue } from "../runtime-job-repository.ts";
import type { RuntimeToolFamily } from "./runtime-tool-types.ts";

export type RuntimeToolAdoptionSurfaceStatus =
  | "kernel_primary"
  | "scheduler_node_execution_primary"
  | "production_primary"
  | "queued_for_toolification"
  | "not_in_scope_for_kernel_item";

export type RuntimeToolAdoptionSurface = {
  surfaceId: string;
  status: RuntimeToolAdoptionSurfaceStatus;
  currentBoundary: string;
  targetBoundary: string;
  nextQueueItem: string | null;
  reasonCodes: string[];
};

export const RUNTIME_TOOLIFICATION_TRUTH_REGISTRY_WORK_ITEM_ID =
  "openclaw-convergence.toolification-07-truth-registry-adoption-gate";

export type RuntimeToolificationSurfaceKind =
  | "kernel"
  | "router"
  | "scheduler"
  | "worker_loop"
  | "workflow"
  | "middleware_facade"
  | "validation_qa"
  | "memory"
  | "closeout"
  | "work_queue_readback"
  | "human_task";

export type RuntimeToolificationAdoptionStatus =
  | "production_primary"
  | "live_ux_proven"
  | "tool_trace_available"
  | "registered"
  | "compatibility_only"
  | "queued_for_toolification"
  | "blocked"
  | "retired"
  | "not_in_scope";

export type RuntimeToolificationAdoptionGate = {
  traceRequired: boolean;
  workQueueReadbackRequired: boolean;
  liveUxProofRequired: boolean;
  compatibilityRetirementRequired: boolean;
  closeoutRequired: boolean;
};

export type RuntimeToolificationSurface = {
  surfaceId: string;
  title: string;
  kind: RuntimeToolificationSurfaceKind;
  ownerSystemArea: "execution-platform" | "model-memory" | "gateway" | "work-queue";
  currentStatus: RuntimeToolificationAdoptionStatus;
  targetStatus: RuntimeToolificationAdoptionStatus;
  canonicalToolFamilies: RuntimeToolFamily[];
  productionEntryRefs: string[];
  compatibilityEntryRefs: string[];
  currentBoundary: string;
  targetBoundary: string;
  nextQueueItemId: string | null;
  gates: RuntimeToolificationAdoptionGate;
  evidenceRefs: string[];
  blockerReasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  secretsStored: false;
};

export type RuntimeToolificationGateClaimKind =
  | "registry_entry"
  | "production_primary"
  | "live_ux_proven"
  | "compatibility_retired"
  | "blocked_or_deferred";

export type RuntimeToolificationAdoptionClaim = {
  surfaceId: string;
  claimKind: RuntimeToolificationGateClaimKind;
  claimedStatus: RuntimeToolificationAdoptionStatus;
  evidenceRefs?: string[];
  toolInvocationRefs?: string[];
  workQueueReadbackRefs?: string[];
  liveUxProofRefs?: string[];
  closeoutRefs?: string[];
  retiredCompatibilityRefs?: string[];
  reasonCodes?: string[];
  blockerReasonCodes?: string[];
  limitations?: string[];
  metadata?: JsonValue;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  secretsStored: false;
};

export type RuntimeToolificationGateResult = {
  artifactKind: "runtime_toolification_adoption_gate_result";
  surfaceId: string;
  accepted: boolean;
  claimedStatus: RuntimeToolificationAdoptionStatus;
  effectiveStatus: RuntimeToolificationAdoptionStatus;
  reasonCodes: string[];
  missingEvidenceKinds: string[];
  evidenceRefs: string[];
  toolInvocationRefs: string[];
  workQueueReadbackRefs: string[];
  liveUxProofRefs: string[];
  closeoutRefs: string[];
  retiredCompatibilityRefs: string[];
  limitations: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  secretsStored: false;
};

export type RuntimeToolificationTruthRegistrySummary = {
  artifactKind: "runtime_toolification_truth_registry_summary";
  registryVersion: "runtime-toolification-truth-registry.v1";
  surfaceCount: number;
  productionPrimaryCount: number;
  liveUxProvenCount: number;
  queuedForToolificationCount: number;
  compatibilityOnlyCount: number;
  blockedCount: number;
  adoptionGateAcceptedCount: number;
  adoptionGateRejectedCount: number;
  nextQueueItemIds: string[];
  surfaceStatuses: Array<{
    surfaceId: string;
    title: string;
    currentStatus: RuntimeToolificationAdoptionStatus;
    targetStatus: RuntimeToolificationAdoptionStatus;
    nextQueueItemId: string | null;
    blockerReasonCodes: string[];
  }>;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  secretsStored: false;
};

const MAX_REF_COUNT = 20;
const MAX_REASON_COUNT = 20;
const MAX_LIMITATION_COUNT = 10;

function uniqueBoundedStrings(values: readonly string[] | undefined, maxItems: number): string[] {
  return (values ?? [])
    .map((value) => value.trim())
    .filter((value, index, all) => value.length > 0 && all.indexOf(value) === index)
    .slice(0, maxItems);
}

function requireFalseFlags(input: {
  rawPromptStored?: boolean;
  rawResponseStored?: boolean;
  rawLogsStored?: boolean;
  secretsStored?: boolean;
}): void {
  if (input.rawPromptStored === true) {
    throw new Error("runtime_toolification_claim_raw_prompt_storage_rejected");
  }
  if (input.rawResponseStored === true) {
    throw new Error("runtime_toolification_claim_raw_response_storage_rejected");
  }
  if (input.rawLogsStored === true) {
    throw new Error("runtime_toolification_claim_raw_log_storage_rejected");
  }
  if (input.secretsStored === true) {
    throw new Error("runtime_toolification_claim_secret_storage_rejected");
  }
}

function missingForClaim(input: {
  surface: RuntimeToolificationSurface;
  claim: RuntimeToolificationAdoptionClaim;
}): string[] {
  const { surface, claim } = input;
  const missing: string[] = [];
  const evidenceRefs = uniqueBoundedStrings(claim.evidenceRefs, MAX_REF_COUNT);
  const toolInvocationRefs = uniqueBoundedStrings(claim.toolInvocationRefs, MAX_REF_COUNT);
  const workQueueReadbackRefs = uniqueBoundedStrings(claim.workQueueReadbackRefs, MAX_REF_COUNT);
  const liveUxProofRefs = uniqueBoundedStrings(claim.liveUxProofRefs, MAX_REF_COUNT);
  const closeoutRefs = uniqueBoundedStrings(claim.closeoutRefs, MAX_REF_COUNT);
  const retiredCompatibilityRefs = uniqueBoundedStrings(
    claim.retiredCompatibilityRefs,
    MAX_REF_COUNT,
  );

  if (claim.claimKind === "registry_entry") {
    return evidenceRefs.length === 0 ? ["registry_evidence_ref"] : [];
  }
  if (claim.claimKind === "blocked_or_deferred") {
    return uniqueBoundedStrings(claim.blockerReasonCodes, MAX_REASON_COUNT).length === 0
      ? ["blocker_reason_code"]
      : [];
  }
  if (evidenceRefs.length === 0) {
    missing.push("evidence_ref");
  }
  if (surface.gates.traceRequired && toolInvocationRefs.length === 0) {
    missing.push("runtime_tool_invocation_ref");
  }
  if (surface.gates.workQueueReadbackRequired && workQueueReadbackRefs.length === 0) {
    missing.push("work_queue_readback_ref");
  }
  if (
    (surface.gates.liveUxProofRequired || claim.claimKind === "live_ux_proven") &&
    liveUxProofRefs.length === 0
  ) {
    missing.push("live_ux_proof_ref");
  }
  if (surface.gates.closeoutRequired && closeoutRefs.length === 0) {
    missing.push("closeout_ref");
  }
  if (
    (surface.gates.compatibilityRetirementRequired ||
      claim.claimKind === "compatibility_retired") &&
    retiredCompatibilityRefs.length === 0
  ) {
    missing.push("retired_compatibility_ref");
  }
  return missing;
}

function acceptedStatusForClaim(input: {
  surface: RuntimeToolificationSurface;
  claim: RuntimeToolificationAdoptionClaim;
  accepted: boolean;
}): RuntimeToolificationAdoptionStatus {
  if (!input.accepted) {
    return input.surface.currentStatus;
  }
  if (input.claim.claimKind === "blocked_or_deferred") {
    return input.claim.claimedStatus === "blocked" ? "blocked" : "queued_for_toolification";
  }
  return input.claim.claimedStatus;
}

export function evaluateRuntimeToolificationAdoptionGate(input: {
  surface: RuntimeToolificationSurface;
  claim: RuntimeToolificationAdoptionClaim;
}): RuntimeToolificationGateResult {
  requireFalseFlags(input.claim);
  if (input.surface.surfaceId !== input.claim.surfaceId) {
    throw new Error(
      `runtime_toolification_claim_surface_mismatch:${input.claim.surfaceId}:${input.surface.surfaceId}`,
    );
  }
  const missingEvidenceKinds = missingForClaim(input);
  const accepted = missingEvidenceKinds.length === 0;
  const reasonCodes = uniqueBoundedStrings(
    [
      ...(input.claim.reasonCodes ?? []),
      ...(accepted
        ? ["runtime_toolification_adoption_claim_accepted"]
        : ["runtime_toolification_adoption_claim_rejected"]),
      ...missingEvidenceKinds.map((kind) => `missing_${kind}`),
      ...input.surface.blockerReasonCodes,
    ],
    MAX_REASON_COUNT,
  );
  return {
    artifactKind: "runtime_toolification_adoption_gate_result",
    surfaceId: input.surface.surfaceId,
    accepted,
    claimedStatus: input.claim.claimedStatus,
    effectiveStatus: acceptedStatusForClaim({ ...input, accepted }),
    reasonCodes,
    missingEvidenceKinds,
    evidenceRefs: uniqueBoundedStrings(input.claim.evidenceRefs, MAX_REF_COUNT),
    toolInvocationRefs: uniqueBoundedStrings(input.claim.toolInvocationRefs, MAX_REF_COUNT),
    workQueueReadbackRefs: uniqueBoundedStrings(input.claim.workQueueReadbackRefs, MAX_REF_COUNT),
    liveUxProofRefs: uniqueBoundedStrings(input.claim.liveUxProofRefs, MAX_REF_COUNT),
    closeoutRefs: uniqueBoundedStrings(input.claim.closeoutRefs, MAX_REF_COUNT),
    retiredCompatibilityRefs: uniqueBoundedStrings(
      input.claim.retiredCompatibilityRefs,
      MAX_REF_COUNT,
    ),
    limitations: uniqueBoundedStrings(input.claim.limitations, MAX_LIMITATION_COUNT),
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
  };
}

export function summarizeRuntimeToolificationTruthRegistry(input: {
  surfaces: RuntimeToolificationSurface[];
  gateResults?: RuntimeToolificationGateResult[];
}): RuntimeToolificationTruthRegistrySummary {
  const gateResults = input.gateResults ?? [];
  const statusCount = (status: RuntimeToolificationAdoptionStatus): number =>
    input.surfaces.filter((surface) => surface.currentStatus === status).length;
  return {
    artifactKind: "runtime_toolification_truth_registry_summary",
    registryVersion: "runtime-toolification-truth-registry.v1",
    surfaceCount: input.surfaces.length,
    productionPrimaryCount: statusCount("production_primary"),
    liveUxProvenCount: statusCount("live_ux_proven"),
    queuedForToolificationCount: statusCount("queued_for_toolification"),
    compatibilityOnlyCount: statusCount("compatibility_only"),
    blockedCount: statusCount("blocked"),
    adoptionGateAcceptedCount: gateResults.filter((result) => result.accepted).length,
    adoptionGateRejectedCount: gateResults.filter((result) => !result.accepted).length,
    nextQueueItemIds: uniqueBoundedStrings(
      input.surfaces.flatMap((surface) =>
        surface.nextQueueItemId ? [surface.nextQueueItemId] : [],
      ),
      50,
    ),
    surfaceStatuses: input.surfaces
      .map((surface) => ({
        surfaceId: surface.surfaceId,
        title: surface.title,
        currentStatus: surface.currentStatus,
        targetStatus: surface.targetStatus,
        nextQueueItemId: surface.nextQueueItemId,
        blockerReasonCodes: surface.blockerReasonCodes.slice(0, 10),
      }))
      .slice(0, 50),
    reasonCodes: uniqueBoundedStrings(
      [
        "runtime_toolification_truth_registry_built",
        ...(gateResults.some((result) => !result.accepted)
          ? ["runtime_toolification_adoption_gate_rejections_present"]
          : []),
      ],
      MAX_REASON_COUNT,
    ),
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
  };
}

function surface(
  input: Omit<
    RuntimeToolificationSurface,
    "rawPromptStored" | "rawResponseStored" | "rawLogsStored" | "secretsStored"
  >,
): RuntimeToolificationSurface {
  return {
    ...input,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
  };
}

export function buildRuntimeToolificationTruthRegistry(): RuntimeToolificationSurface[] {
  return [
    surface({
      surfaceId: "runtime-tool-call-kernel",
      title: "Runtime Tool-Call Kernel And Trace Store",
      kind: "kernel",
      ownerSystemArea: "execution-platform",
      currentStatus: "production_primary",
      targetStatus: "production_primary",
      canonicalToolFamilies: ["diagnostic.bounded"],
      productionEntryRefs: [
        "extensions/execution-platform/src/runtime-tool-call/runtime-tool-kernel.ts",
        "extensions/execution-platform/src/runtime-tool-call/runtime-tool-trace-repository.ts",
      ],
      compatibilityEntryRefs: [],
      currentBoundary: "RuntimeToolKernel invokes registered executors and stores bounded traces.",
      targetBoundary:
        "RuntimeToolKernel remains the canonical primitive for runtime tool execution.",
      nextQueueItemId: null,
      gates: {
        traceRequired: true,
        workQueueReadbackRequired: false,
        liveUxProofRequired: false,
        compatibilityRetirementRequired: false,
        closeoutRequired: false,
      },
      evidenceRefs: [
        ".artifacts/execution-platform/runtime-tool-kernel-summary.json",
        ".artifacts/execution-platform/runtime-tool-kernel-hardening-summary.json",
      ],
      blockerReasonCodes: [],
    }),
    surface({
      surfaceId: "router-front-door-tool-protocol",
      title: "Router And Front Door Tool Protocol",
      kind: "router",
      ownerSystemArea: "execution-platform",
      currentStatus: "production_primary",
      targetStatus: "production_primary",
      canonicalToolFamilies: ["router.front_door"],
      productionEntryRefs: [
        "extensions/execution-platform/src/intent-front-door/router-runtime-tools.ts",
        "extensions/execution-platform/src/intent-front-door/router-tool-protocol.ts",
        "extensions/execution-platform/src/intent-routing/native-execution-rpc.ts",
        "src/gateway/execution-platform-http.ts",
      ],
      compatibilityEntryRefs: [
        "extensions/execution-platform/src/intent-routing/model-assisted-intent-router.ts#test-only",
      ],
      currentBoundary:
        "Accepted front-door execution routing records staged router.front_door runtime tool traces and compiles router tool refs into runtime job payloads.",
      targetBoundary:
        "Router remains semantic-only while runtime owns schema, refs, authority, lifecycle, persistence, and Mission Ledger handoff.",
      nextQueueItemId: null,
      gates: {
        traceRequired: true,
        workQueueReadbackRequired: true,
        liveUxProofRequired: false,
        compatibilityRetirementRequired: true,
        closeoutRequired: true,
      },
      evidenceRefs: [".artifacts/execution-platform/router-front-door-tool-protocol-proof.json"],
      blockerReasonCodes: [],
    }),
    surface({
      surfaceId: "scheduler-toolification",
      title: "Scheduler Toolification And Split Planning/Execution",
      kind: "scheduler",
      ownerSystemArea: "execution-platform",
      currentStatus: "production_primary",
      targetStatus: "production_primary",
      canonicalToolFamilies: [
        "scheduler.decompose_graph",
        "scheduler.select_next_node",
        "scheduler.evaluate_node_result",
        "scheduler.repair_decision",
        "worker.invoke",
      ],
      productionEntryRefs: [
        "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
        "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
      ],
      compatibilityEntryRefs: [],
      currentBoundary:
        "Production agent_team.coding scheduler decisions and worker invocation are kernel-backed.",
      targetBoundary:
        "All scheduler decision and node execution surfaces stay kernel-backed with commitment evidence.",
      nextQueueItemId: null,
      gates: {
        traceRequired: true,
        workQueueReadbackRequired: true,
        liveUxProofRequired: false,
        compatibilityRetirementRequired: false,
        closeoutRequired: true,
      },
      evidenceRefs: [
        ".artifacts/execution-platform/scheduler-toolification-split-planning-summary.json",
        ".artifacts/execution-platform/mission-ledger-tool-event-readback-summary.json",
      ],
      blockerReasonCodes: [],
    }),
    surface({
      surfaceId: "worker-tool-loops",
      title: "Worker Tool Loops And Non-Codex File-Edit Worker Lane",
      kind: "worker_loop",
      ownerSystemArea: "execution-platform",
      currentStatus: "production_primary",
      targetStatus: "live_ux_proven",
      canonicalToolFamilies: [
        "worker.invoke",
        "file_edit.propose",
        "file_edit.apply",
        "validation.run",
      ],
      productionEntryRefs: [
        "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts",
        "extensions/execution-platform/src/codex-bridge/model-agnostic-tool-worker-loop.ts",
      ],
      compatibilityEntryRefs: [],
      currentBoundary:
        "Non-Codex/Kimi file-edit lane uses a model-agnostic worker loop with runtime tool events.",
      targetBoundary:
        "Worker loop is live-UX proven across multiple model profiles and larger decomposition tasks.",
      nextQueueItemId: null,
      gates: {
        traceRequired: true,
        workQueueReadbackRequired: true,
        liveUxProofRequired: false,
        compatibilityRetirementRequired: false,
        closeoutRequired: true,
      },
      evidenceRefs: [
        ".artifacts/execution-platform/non-codex-tool-using-worker-live-proof-summary.json",
        ".artifacts/execution-platform/model-agnostic-worker-qualification-summary.json",
      ],
      blockerReasonCodes: [],
    }),
    surface({
      surfaceId: "mission-ledger-evidence-finalization",
      title: "Mission Ledger Evidence Claims And Finalization Handoff",
      kind: "scheduler",
      ownerSystemArea: "execution-platform",
      currentStatus: "production_primary",
      targetStatus: "production_primary",
      canonicalToolFamilies: ["scheduler.evaluate_node_result", "closeout.generate"],
      productionEntryRefs: [
        "extensions/execution-platform/src/workflows/mission-contract-ledger.ts",
        "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
      ],
      compatibilityEntryRefs: [],
      currentBoundary:
        "Node evidence claims are mapped to Mission Ledger commitments before finalization.",
      targetBoundary:
        "Every blocking commitment closes through explicit evidence claims and model sufficiency review.",
      nextQueueItemId: null,
      gates: {
        traceRequired: true,
        workQueueReadbackRequired: true,
        liveUxProofRequired: false,
        compatibilityRetirementRequired: false,
        closeoutRequired: true,
      },
      evidenceRefs: [
        ".artifacts/execution-platform/mission-ledger-tool-event-readback-summary.json",
      ],
      blockerReasonCodes: [],
    }),
    surface({
      surfaceId: "work-queue-tool-event-readback",
      title: "Work Queue Tool/Event Readback",
      kind: "work_queue_readback",
      ownerSystemArea: "work-queue",
      currentStatus: "production_primary",
      targetStatus: "live_ux_proven",
      canonicalToolFamilies: ["work_queue.project_event"],
      productionEntryRefs: [
        "extensions/execution-platform/src/work-queue/execution-read-model.ts",
        "extensions/execution-platform/src/work-queue/work-queue-repository.ts",
      ],
      compatibilityEntryRefs: [],
      currentBoundary:
        "Work Queue readback surfaces active graph progress and runtime tool/event refs.",
      targetBoundary: "Owner UI shows the same bounded event/tool readback during live UX proof.",
      nextQueueItemId: null,
      gates: {
        traceRequired: true,
        workQueueReadbackRequired: true,
        liveUxProofRequired: false,
        compatibilityRetirementRequired: false,
        closeoutRequired: false,
      },
      evidenceRefs: [
        ".artifacts/execution-platform/mission-ledger-tool-event-readback-work-queue-readback-proof.json",
      ],
      blockerReasonCodes: [],
    }),
    surface({
      surfaceId: "model-call-toolification",
      title: "Model Call Toolification And Model Task Middleware Collapse",
      kind: "middleware_facade",
      ownerSystemArea: "execution-platform",
      currentStatus: "production_primary",
      targetStatus: "production_primary",
      canonicalToolFamilies: ["model.call"],
      productionEntryRefs: [
        "extensions/execution-platform/src/model-tasks/",
        "extensions/execution-platform/src/model-routing/",
      ],
      compatibilityEntryRefs: [],
      currentBoundary:
        "Model task middleware is a facade over model.call RuntimeToolKernel invocations for live provider calls.",
      targetBoundary:
        "All model calls use model.call runtime tools with trace-backed budgets and bounded readback.",
      nextQueueItemId: null,
      gates: {
        traceRequired: true,
        workQueueReadbackRequired: true,
        liveUxProofRequired: false,
        compatibilityRetirementRequired: false,
        closeoutRequired: true,
      },
      evidenceRefs: [
        ".artifacts/execution-platform/model-call-toolification-runtime-tool-proof.json",
        ".artifacts/execution-platform/model-call-toolification-work-queue-readback-proof.json",
        ".artifacts/execution-platform/model-call-toolification-adoption-gate-proof.json",
      ],
      blockerReasonCodes: [],
    }),
    surface({
      surfaceId: "script-db-operation-toolification",
      title: "Script And DB Operation Toolification",
      kind: "middleware_facade",
      ownerSystemArea: "execution-platform",
      currentStatus: "production_primary",
      targetStatus: "production_primary",
      canonicalToolFamilies: ["script.execute", "db_operation.execute"],
      productionEntryRefs: [
        "extensions/execution-platform/src/script-jobs/",
        "extensions/execution-platform/src/db-operations/",
      ],
      compatibilityEntryRefs: [],
      currentBoundary:
        "Script and DB operation middleware are facades over script.execute and db_operation.execute runtime tool traces.",
      targetBoundary:
        "Script and DB operations execute through RuntimeToolKernel families and trace store.",
      nextQueueItemId: null,
      gates: {
        traceRequired: true,
        workQueueReadbackRequired: true,
        liveUxProofRequired: false,
        compatibilityRetirementRequired: false,
        closeoutRequired: true,
      },
      evidenceRefs: [],
      blockerReasonCodes: [],
    }),
    surface({
      surfaceId: "validation-qa-toolification",
      title: "Validation And QA Toolification",
      kind: "validation_qa",
      ownerSystemArea: "execution-platform",
      currentStatus: "production_primary",
      targetStatus: "production_primary",
      canonicalToolFamilies: [
        "validation.plan",
        "validation.run",
        "validation.result",
        "validation.review",
        "qa.review",
        "script.execute",
      ],
      productionEntryRefs: [
        "extensions/execution-platform/src/workflows/validation-qa-runtime-tools.ts",
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
        "extensions/execution-platform/src/work-queue/execution-read-model.ts",
        "src/gateway/execution-platform-http.ts",
      ],
      compatibilityEntryRefs: [],
      currentBoundary:
        "Production validation and QA nodes run through validation/QA runtime tool traces with bounded evidence packets.",
      targetBoundary:
        "Validation planning, command refs, result summaries, failure classification, repair plans, coverage review, QA review, and accepted validation evidence are first-class runtime tools.",
      nextQueueItemId: null,
      gates: {
        traceRequired: true,
        workQueueReadbackRequired: true,
        liveUxProofRequired: false,
        compatibilityRetirementRequired: true,
        closeoutRequired: true,
      },
      evidenceRefs: [
        ".artifacts/execution-platform/validation-qa-toolification-runtime-tool-proof.json",
        ".artifacts/execution-platform/validation-qa-toolification-work-queue-readback-proof.json",
        ".artifacts/execution-platform/validation-qa-toolification-adoption-gate-proof.json",
      ],
      blockerReasonCodes: [],
    }),
    surface({
      surfaceId: "closeout-generate-toolification",
      title: "Closeout Generate Toolification And Legacy Closeout Retirement",
      kind: "closeout",
      ownerSystemArea: "execution-platform",
      currentStatus: "production_primary",
      targetStatus: "production_primary",
      canonicalToolFamilies: ["closeout.generate"],
      productionEntryRefs: [
        "extensions/execution-platform/src/codex-bridge/closeout-generate-runtime-tool.ts",
        "extensions/execution-platform/src/codex-bridge/model-closeout-capsule-reporter.ts",
        "extensions/execution-platform/src/codex-bridge/closeout-capsule.ts",
        "src/gateway/execution-platform-http.ts",
      ],
      compatibilityEntryRefs: [],
      currentBoundary:
        "Production dynamic closeout generation is routed through closeout.generate runtime tool traces; degraded/system closeout is diagnostic-only.",
      targetBoundary:
        "All production closeout generation uses closeout.generate and degraded/system closeouts cannot succeed.",
      nextQueueItemId: null,
      gates: {
        traceRequired: true,
        workQueueReadbackRequired: true,
        liveUxProofRequired: false,
        compatibilityRetirementRequired: true,
        closeoutRequired: true,
      },
      evidenceRefs: [
        ".artifacts/execution-platform/closeout-toolification-runtime-tool-proof.json",
        ".artifacts/execution-platform/closeout-toolification-adoption-gate-proof.json",
        ".artifacts/execution-platform/closeout-toolification-legacy-retirement-proof.json",
      ],
      blockerReasonCodes: [],
    }),
    surface({
      surfaceId: "closeout-finalization-toolchain",
      title: "Closeout Finalization Toolchain",
      kind: "closeout",
      ownerSystemArea: "execution-platform",
      currentStatus: "production_primary",
      targetStatus: "production_primary",
      canonicalToolFamilies: [
        "closeout.generate",
        "closeout.finalize",
        "validation.plan",
        "validation.run",
        "validation.result",
        "validation.review",
        "qa.review",
      ],
      productionEntryRefs: [
        "extensions/execution-platform/src/codex-bridge/closeout-finalization-runtime-tools.ts",
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
        "extensions/execution-platform/src/work-queue/execution-read-model.ts",
        "src/gateway/execution-platform-http.ts",
      ],
      compatibilityEntryRefs: [],
      currentBoundary:
        "Production workflow success requires a closeout finalization evidence packet, closeout.finalize runtime tool traces, accepted Mission Ledger/profile/validation/readback evidence, and a model-authored Closeout Capsule.",
      targetBoundary:
        "Closeout finalization is the canonical handoff from workflow evidence to accepted success; degraded/system closeout is diagnostic-only and cannot complete production workflows.",
      nextQueueItemId: null,
      gates: {
        traceRequired: true,
        workQueueReadbackRequired: true,
        liveUxProofRequired: false,
        compatibilityRetirementRequired: true,
        closeoutRequired: true,
      },
      evidenceRefs: [
        ".artifacts/execution-platform/closeout-finalization-tool-contract-proof.json",
        ".artifacts/execution-platform/closeout-finalization-production-wiring-proof.json",
        ".artifacts/execution-platform/closeout-finalization-work-queue-readback-proof.json",
        ".artifacts/execution-platform/closeout-finalization-adoption-gate-proof.json",
      ],
      blockerReasonCodes: [],
    }),
    surface({
      surfaceId: "workflow-evidence-profiles-readback",
      title: "Workflow Evidence Profiles And Tool Trace Readback Hardening",
      kind: "workflow",
      ownerSystemArea: "execution-platform",
      currentStatus: "production_primary",
      targetStatus: "production_primary",
      canonicalToolFamilies: [
        "scheduler.decompose_graph",
        "scheduler.select_next_node",
        "worker.invoke",
        "work_queue.project_event",
      ],
      productionEntryRefs: [
        "extensions/execution-platform/src/workflows/",
        "extensions/execution-platform/src/work-queue/execution-read-model.ts",
      ],
      compatibilityEntryRefs: [],
      currentBoundary:
        "Workflow-specific evidence profiles are canonical production gates for workflow success and Work Queue readback.",
      targetBoundary:
        "Workflow-specific evidence profiles are first-class and owner-readable across starter workflows.",
      nextQueueItemId: null,
      gates: {
        traceRequired: true,
        workQueueReadbackRequired: true,
        liveUxProofRequired: false,
        compatibilityRetirementRequired: false,
        closeoutRequired: true,
      },
      evidenceRefs: [
        ".artifacts/execution-platform/workflow-evidence-profiles-readback-proof.json",
        ".artifacts/execution-platform/workflow-evidence-profiles-readback-adoption-gate-proof.json",
      ],
      blockerReasonCodes: [],
    }),
    surface({
      surfaceId: "canonical-workflow-runtime-engine-definition-registry",
      title: "Canonical Workflow Runtime Engine And Workflow Definition Registry",
      kind: "workflow",
      ownerSystemArea: "execution-platform",
      currentStatus: "production_primary",
      targetStatus: "production_primary",
      canonicalToolFamilies: [
        "scheduler.decompose_graph",
        "scheduler.select_next_node",
        "worker.invoke",
        "closeout.generate",
      ],
      productionEntryRefs: [
        "extensions/execution-platform/src/workflows/workflow-definition.ts",
        "extensions/execution-platform/src/workflows/workflow-definition-registry.ts",
        "extensions/execution-platform/src/workflows/runtime-workflow-graph-engine.ts",
        "extensions/execution-platform/src/workflows/workflow-completion-review.ts",
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      ],
      compatibilityEntryRefs: [],
      currentBoundary:
        "Workflow definitions, engine readiness, evidence profile, completion review, and model-authored closeout are canonical gates for production workflow success.",
      targetBoundary:
        "All production workflows execute through the canonical runtime workflow graph engine and workflow definition registry.",
      nextQueueItemId: null,
      gates: {
        traceRequired: true,
        workQueueReadbackRequired: true,
        liveUxProofRequired: false,
        compatibilityRetirementRequired: false,
        closeoutRequired: true,
      },
      evidenceRefs: [
        ".artifacts/execution-platform/canonical-workflow-runtime-engine-summary.json",
        ".artifacts/execution-platform/canonical-workflow-runtime-adoption-gate-proof.json",
      ],
      blockerReasonCodes: [],
    }),
    surface({
      surfaceId: "coding-team-plugin-extraction",
      title: "Coding Team Plugin Extraction From Dynamic Runner",
      kind: "workflow",
      ownerSystemArea: "execution-platform",
      currentStatus: "production_primary",
      targetStatus: "production_primary",
      canonicalToolFamilies: [
        "scheduler.decompose_graph",
        "scheduler.select_next_node",
        "worker.invoke",
        "file_edit.propose",
        "file_edit.apply",
        "validation.run",
        "work_queue.project_event",
        "closeout.generate",
      ],
      productionEntryRefs: [
        "extensions/execution-platform/src/workflows/workflow-plugin.ts",
        "extensions/execution-platform/src/workflows/workflow-plugin-registry.ts",
        "extensions/execution-platform/src/workflows/agent-team-coding-plugin.ts",
        "extensions/execution-platform/src/workflows/runtime-workflow-graph-engine.ts",
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      ],
      compatibilityEntryRefs: [],
      currentBoundary:
        "agent_team.coding policy, executor keys, scheduler gates, and readback expectations are owned by a canonical workflow plugin consumed by the runtime graph engine.",
      targetBoundary:
        "Coding-team execution remains plugin-backed until the DynamicAgentTeamGraphRunner host shim is removed in the generic runner retirement/plugin extraction follow-up.",
      nextQueueItemId: null,
      gates: {
        traceRequired: true,
        workQueueReadbackRequired: true,
        liveUxProofRequired: false,
        compatibilityRetirementRequired: false,
        closeoutRequired: true,
      },
      evidenceRefs: [
        ".artifacts/execution-platform/coding-team-plugin-extraction-summary.json",
        ".artifacts/execution-platform/coding-team-plugin-adoption-gate-proof.json",
      ],
      blockerReasonCodes: [],
    }),
    surface({
      surfaceId: "product-spec-planning-workflow",
      title: "Product/Spec Planning Production Upgrade",
      kind: "workflow",
      ownerSystemArea: "execution-platform",
      currentStatus: "queued_for_toolification",
      targetStatus: "live_ux_proven",
      canonicalToolFamilies: [
        "scheduler.decompose_graph",
        "research.fetch",
        "human_task.request",
        "work_queue.project_event",
      ],
      productionEntryRefs: [
        "extensions/execution-platform/src/workflows/product-spec-planning-workflow.ts",
        "extensions/execution-platform/src/work-queue/product-spec-planning-worker-contract.ts",
      ],
      compatibilityEntryRefs: [],
      currentBoundary:
        "Product/spec planning has contracts and proof surfaces but not the final live UX proof.",
      targetBoundary:
        "Product/spec planning runs as a scheduler-backed workflow with research, planning capsule, human decision, compile, and closeout.",
      nextQueueItemId: "openclaw-convergence.active-queue-34",
      gates: {
        traceRequired: true,
        workQueueReadbackRequired: true,
        liveUxProofRequired: true,
        compatibilityRetirementRequired: false,
        closeoutRequired: true,
      },
      evidenceRefs: [],
      blockerReasonCodes: ["product_spec_planning_live_ux_proof_pending"],
    }),
    surface({
      surfaceId: "generic-workflow-runner-retirement",
      title: "Generic Workflow Runner Production Retirement",
      kind: "workflow",
      ownerSystemArea: "execution-platform",
      currentStatus: "production_primary",
      targetStatus: "production_primary",
      canonicalToolFamilies: [
        "scheduler.decompose_graph",
        "scheduler.select_next_node",
        "worker.invoke",
        "validation.run",
        "work_queue.project_event",
        "closeout.generate",
      ],
      productionEntryRefs: [
        "extensions/execution-platform/src/codex-bridge/workflow-queued-runner.ts",
        "extensions/execution-platform/src/workflows/runtime-workflow-graph-engine.ts",
        "extensions/execution-platform/src/workflows/workflow-definition-registry.ts",
        "extensions/execution-platform/src/workflows/workflow-plugin-registry.ts",
        "extensions/execution-platform/src/work-queue/execution-read-model.ts",
      ],
      compatibilityEntryRefs: [],
      currentBoundary:
        "WorkflowQueuedRunner is a migration shim only and cannot produce production workflow success; production workflows must run through the canonical workflow runtime engine.",
      targetBoundary:
        "No production workflow path can complete without workflow definition/plugin readiness, runtime tool traces, evidence profile, completion review, and model-authored closeout.",
      nextQueueItemId: null,
      gates: {
        traceRequired: true,
        workQueueReadbackRequired: true,
        liveUxProofRequired: false,
        compatibilityRetirementRequired: true,
        closeoutRequired: true,
      },
      evidenceRefs: [
        ".artifacts/execution-platform/generic-workflow-runner-retirement-summary.json",
        ".artifacts/execution-platform/generic-workflow-runner-retirement-adoption-gate-proof.json",
      ],
      blockerReasonCodes: [],
    }),
    surface({
      surfaceId: "memory-retrieval-context-proactivity-toolification",
      title: "Memory, Retrieval, Context, And Proactivity Tool Families",
      kind: "memory",
      ownerSystemArea: "model-memory",
      currentStatus: "queued_for_toolification",
      targetStatus: "production_primary",
      canonicalToolFamilies: ["memory.retrieve", "memory.capture", "work_queue.project_event"],
      productionEntryRefs: [
        "extensions/execution-platform/src/model-memory-runtime/",
        "src/agents/model-memory/live-runtime/",
      ],
      compatibilityEntryRefs: ["src/agents/model-memory/live-runtime/retrieval-context.ts"],
      currentBoundary:
        "Memory capture/retrieval/proactivity are wired, but not yet uniformly runtime-tool invocations.",
      targetBoundary:
        "Memory retrieve/capture/context/proactivity steps use runtime tool families and Work Queue readback.",
      nextQueueItemId: "openclaw-convergence.active-queue-31",
      gates: {
        traceRequired: true,
        workQueueReadbackRequired: true,
        liveUxProofRequired: false,
        compatibilityRetirementRequired: true,
        closeoutRequired: false,
      },
      evidenceRefs: [],
      blockerReasonCodes: ["memory_toolification_pending"],
    }),
  ];
}

function legacyStatusForSurface(
  surface: RuntimeToolificationSurface,
  legacySurfaceId: string,
): RuntimeToolAdoptionSurfaceStatus {
  if (surface.surfaceId === "runtime-tool-call-kernel") {
    return "kernel_primary";
  }
  if (
    surface.currentStatus === "production_primary" &&
    (surface.kind === "scheduler" || legacySurfaceId === "runtime-work-graph-node-execution")
  ) {
    return "scheduler_node_execution_primary";
  }
  if (surface.currentStatus === "production_primary") {
    return "production_primary";
  }
  if (surface.currentStatus === "queued_for_toolification") {
    return "queued_for_toolification";
  }
  return "not_in_scope_for_kernel_item";
}

function legacyReasonCodeForSurface(surface: RuntimeToolificationSurface): string {
  if (surface.currentStatus === "production_primary") {
    return `${surface.surfaceId.replace(/-/gu, "_")}_primary`;
  }
  if (surface.currentStatus === "queued_for_toolification") {
    return `${surface.surfaceId.replace(/-/gu, "_")}_pending`;
  }
  return `${surface.surfaceId.replace(/-/gu, "_")}_registry_derived`;
}

export type RuntimeToolAdoptionBoundaryLegacyAlias = {
  legacySurfaceId: string;
  canonicalSurfaceId: string;
  currentBoundaryOverride?: string;
  targetBoundaryOverride?: string;
};

export const RUNTIME_TOOL_ADOPTION_BOUNDARY_LEGACY_ALIASES: RuntimeToolAdoptionBoundaryLegacyAlias[] =
  [
    {
      legacySurfaceId: "runtime-tool-call-kernel",
      canonicalSurfaceId: "runtime-tool-call-kernel",
    },
    {
      legacySurfaceId: "runtime-work-graph-node-execution",
      canonicalSurfaceId: "scheduler-toolification",
      currentBoundaryOverride:
        "RuntimeWorkGraphScheduler wraps node execution and scheduler decisions through runtime tool traces.",
      targetBoundaryOverride:
        "All scheduler node execution, progress, and evidence uses runtime tool traces.",
    },
    {
      legacySurfaceId: "scheduler-decisions",
      canonicalSurfaceId: "scheduler-toolification",
    },
    {
      legacySurfaceId: "model-task-middleware",
      canonicalSurfaceId: "model-call-toolification",
    },
    {
      legacySurfaceId: "script-db-middleware",
      canonicalSurfaceId: "script-db-operation-toolification",
    },
    {
      legacySurfaceId: "kimi-codex-worker-loops",
      canonicalSurfaceId: "worker-tool-loops",
    },
    {
      legacySurfaceId: "memory-proactivity-closeout",
      canonicalSurfaceId: "memory-retrieval-context-proactivity-toolification",
    },
    {
      legacySurfaceId: "work-queue-tool-event-readback",
      canonicalSurfaceId: "work-queue-tool-event-readback",
    },
  ];

export function buildRuntimeToolAdoptionBoundaryMapFromRegistry(
  surfaces: RuntimeToolificationSurface[] = buildRuntimeToolificationTruthRegistry(),
): RuntimeToolAdoptionSurface[] {
  const byId = new Map(surfaces.map((surface) => [surface.surfaceId, surface]));
  return RUNTIME_TOOL_ADOPTION_BOUNDARY_LEGACY_ALIASES.map((alias) => {
    const surface = byId.get(alias.canonicalSurfaceId);
    if (!surface) {
      throw new Error(`runtime_tool_adoption_boundary_alias_missing:${alias.canonicalSurfaceId}`);
    }
    return {
      surfaceId: alias.legacySurfaceId,
      status: legacyStatusForSurface(surface, alias.legacySurfaceId),
      currentBoundary: alias.currentBoundaryOverride ?? surface.currentBoundary,
      targetBoundary: alias.targetBoundaryOverride ?? surface.targetBoundary,
      nextQueueItem: surface.nextQueueItemId,
      reasonCodes: uniqueBoundedStrings(
        [
          "runtime_tool_adoption_boundary_registry_derived_compat_export",
          legacyReasonCodeForSurface(surface),
          ...surface.blockerReasonCodes,
        ],
        MAX_REASON_COUNT,
      ),
    };
  });
}

export const RUNTIME_TOOL_ADOPTION_BOUNDARY_MAP: RuntimeToolAdoptionSurface[] =
  buildRuntimeToolAdoptionBoundaryMapFromRegistry();
