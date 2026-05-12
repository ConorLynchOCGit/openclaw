import type { JsonValue } from "../runtime-job-repository.ts";
import type {
  WorkItemTruth,
  WorkQueueConvergenceSlicePlanningStatus,
  WorkQueueConvergenceSliceProjection,
} from "./types.ts";

export const CONVERGENCE_SLICE_TRACKER_VERSION = "openclaw-platform-convergence.v4" as const;
const LEGACY_CONVERGENCE_SLICE_TRACKER_VERSION = "openclaw-platform-convergence.v3" as const;
export const CONVERGENCE_SLICE_WORK_ITEM_TYPE = "openclaw_convergence_slice" as const;

export type ConvergenceSliceDefinition = {
  sliceId: string;
  trackerKind: "historical_slice" | "active_queue_item";
  title: string;
  track: string;
  wave: string;
  ownerSystemArea: string;
  priority: number;
  legacySliceId: string | null;
  previousSliceId: string | null;
  historicalSliceId: string | null;
  activeQueueId: string | null;
  activeQueuePosition: number | null;
  supersededByActiveQueueId: string | null;
  dependsOnSliceIds: string[];
  dependsOnActiveQueueIds: string[];
  dependsOnHistoricalSliceIds: string[];
  sourceDocRefs: string[];
  artifactRefs: string[];
  planningStatus: WorkQueueConvergenceSlicePlanningStatus;
  nextAction: string | null;
  blockerReasonCodes: string[];
};

type ConvergenceSliceTrackerMetadata = {
  artifactKind: "work_queue_convergence_slice_tracker_metadata";
  trackerVersion: typeof CONVERGENCE_SLICE_TRACKER_VERSION;
  sliceId: string;
  trackerKind: "historical_slice" | "active_queue_item";
  title: string;
  track: string;
  wave: string;
  ownerSystemArea: string;
  priority: number;
  legacySliceId: string | null;
  previousSliceId: string | null;
  historicalSliceId: string | null;
  activeQueueId: string | null;
  activeQueuePosition: number | null;
  supersededByActiveQueueId: string | null;
  dependsOnSliceIds: string[];
  dependsOnActiveQueueIds: string[];
  dependsOnHistoricalSliceIds: string[];
  sourceDocRefs: string[];
  artifactRefs: string[];
  planningStatus: WorkQueueConvergenceSlicePlanningStatus;
  nextAction: string | null;
  blockerReasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutationAllowed: false;
};

type ConvergenceSliceTrackerWorkQueue = {
  readWorkItemTruth(workItemId: string): Promise<WorkItemTruth | null>;
  createWorkItem(input: {
    workItemId?: string;
    itemType: string;
    title: string;
    description?: string | null;
    metadata?: JsonValue;
    actorId?: string | null;
  }): Promise<unknown>;
  updateWorkItemPlanningMetadata(input: {
    workItemId: string;
    title: string;
    description?: string | null;
    metadata?: JsonValue;
    actorId?: string | null;
  }): Promise<unknown>;
  createWorkItemVersion(input: {
    workItemId: string;
    title?: string | null;
    body?: string | null;
    artifactMetadata?: JsonValue;
    makeCurrent?: boolean;
  }): Promise<unknown>;
  attachArtifactReference(input: {
    workItemId: string;
    artifactType: string;
    storageKind: string;
    uri: string;
    metadata?: JsonValue;
  }): Promise<unknown>;
  addDependency(input: {
    workItemId: string;
    dependsOnWorkItemId: string;
    dependencyType?: string;
    metadata?: JsonValue;
  }): Promise<unknown>;
};

const SOURCE_DOC_REFS = [
  "docs/projects/execution-platform/STATUS.md",
  "docs/projects/execution-platform/CURRENT_SLICE.md",
  "docs/projects/execution-platform/DECISIONS.md",
  "docs/projects/execution-platform/roadmap.md",
  "docs/projects/execution-platform/specs/execution-supervisor-protocol.md",
  "docs/projects/execution-platform/specs/intent-routing-and-workflow-contracts.md",
  "docs/projects/execution-platform/specs/work-queue-execution-truth.md",
] as const;

const SLICE_TITLES = [
  "OpenClaw Session Health Repair",
  "Work Queue Canonical Slice Tracker",
  "Execution Platform DB Boundary",
  "Feature Flag and Kill Switch Registry",
  "Gateway Enqueue-Only Live Workflow Boundary",
  "Runtime Worker Supervisor Skeleton",
  "Workflow Worker Adapter Registry And Contract States",
  "ACP/Codex Coding Worker Adapter End-to-End Proof",
  "Closeout Model Executor Placement",
  "Browser Prompt Runtime Job Linkage Audit",
  "Work Queue Runtime Readback Upgrade",
  "Runtime Controls Through Worker Supervisor",
  "Coding Team Permission Model Reconciliation",
  "Coding Team Live Worker Soak",
  "Web Research Worker Adapter",
  "Research-to-Coding Handoff Worker Path",
  "Docs/Skills Worker Adapter",
  "QA/Test Worker Adapter",
  "Architecture/Spec Worker Adapter",
  "Model-Task Middleware Live Completion",
  "Script Middleware Live Completion",
  "DB Operation Middleware Live Completion",
  "Middleware Worker Supervisor Adoption",
  "Workflow Adapter Middleware Adoption",
  "Middleware Bypass Audit And Legacy Path Shutdown",
  "Managed Soak With Middleware-Backed Workflows",
  "Full Platform Middleware Roster And Memory Adoption Checks",
  "Live Gateway Human UI Proof And Autocompaction Repair",
  "Live Front-Door Owner Soak",
  "Release/DevOps Reviewer Workflow",
  "Memory Curator Workflow",
  "Skill Curator Workflow",
  "Incident/Recovery Assistant Workflow",
  "Design Worker Contract And Adapter Plan",
  "Marketing/Content Worker Contract And Adapter Plan",
  "Product/Spec Planning Worker Contract",
  "Production Deploy Workflow",
  "Outbound Notification Workflow",
  "Dependency/Install Workflow",
  "Model Eval And Promotion Workflow",
  "Tracker And Memory Truth Reconciliation",
  "Work Queue Memory Readback Repair",
  "Prompt Router Memory Policy Live Integration",
  "Route-Aware Retrieval And Context Pack Insertion",
  "Capture And Proactivity Middleware Migration",
  "Automatic Compaction Live Proof",
  "Qualitative Memory Live Soak",
  "Skillifier Runtime Job Migration",
  "Proactivity Work Queue Quality Soak",
  "Coding Research Docs QA Architecture Memory-Aware Workflow Soak",
  "Model Memory Compatibility Hard Shutdown",
  "Coding Team Codex-Parity Trust Soak",
  "Core OpenClaw Loop Simplification",
  "Final Platform Coherence Audit",
  "Final Owner UX Production Soak",
  "Release Rollback Runbook Closeout",
] as const;

type ActiveQueueEntry = {
  title: string;
  legacySliceNumber: number | null;
  ownerSystemArea?: string;
  sourceDocRefs?: string[];
  nextAction?: string;
};

const ACTIVE_QUEUE_ENTRIES: ActiveQueueEntry[] = [
  { legacySliceNumber: 52, title: "Coding Team Codex-Parity Trust Soak" },
  {
    legacySliceNumber: null,
    title: "Dynamic Coding Team Orchestration Graph",
    ownerSystemArea: "workflows",
    nextAction:
      "Build the durable TeamRunGraph with GPT-5.5 orchestration, repeated role invocations, dynamic test/repair loops, Kimi/Codex implementation lanes, budget ledgers, chunked artifacts, and one final model-authored closeout.",
    sourceDocRefs: ["docs/projects/execution-platform/specs/runtime-work-graph.md"],
  },
  {
    legacySliceNumber: null,
    title: "Work Queue Parent Child Action Graph",
    ownerSystemArea: "work-queue",
    nextAction:
      "Extend the DB-backed Work Queue into a durable parent/child action graph with dependencies, assignments, blockers, runtime-job/team-graph links, and owner readback while keeping runtime jobs as lifecycle truth.",
    sourceDocRefs: [
      "docs/projects/execution-platform/specs/runtime-work-graph.md",
      "docs/projects/execution-platform/specs/work-queue-execution-truth.md",
    ],
  },
  {
    legacySliceNumber: null,
    title: "Human Operator Task Adapter",
    ownerSystemArea: "workflows",
    nextAction:
      "Add first-class human interrupt/resume graph nodes with Work Queue surfacing, deadlines, bounded owner input refs, and runtime resume evidence.",
    sourceDocRefs: ["docs/projects/execution-platform/specs/runtime-work-graph.md"],
  },
  {
    legacySliceNumber: null,
    title: "Plan To Runtime Compiler",
    ownerSystemArea: "execution-platform",
    nextAction:
      "Compile approved parent/child action graphs into workflow-specific runtime jobs and human tasks using deterministic authority/scope validation plus model-assisted planning.",
    sourceDocRefs: [
      "docs/projects/execution-platform/specs/runtime-work-graph.md",
      "docs/projects/execution-platform/specs/intent-routing-and-workflow-contracts.md",
    ],
  },
  {
    legacySliceNumber: null,
    title: "Managed Multi-Action Project Soak",
    ownerSystemArea: "workflows",
    nextAction:
      "Run one real owner-useful parent work item through orchestration, child actions, Kimi/Codex implementation, dynamic testing/repair, human pause/resume, Work Queue readback, and final closeout.",
    sourceDocRefs: [
      "docs/projects/execution-platform/specs/runtime-work-graph.md",
      "docs/projects/execution-platform/specs/live-execution-readiness-gates.md",
    ],
  },
  { legacySliceNumber: 53, title: "Core OpenClaw Loop Simplification" },
  {
    legacySliceNumber: 48,
    title: "Skillifier Runtime Job Migration",
    ownerSystemArea: "model-memory",
    nextAction:
      "Migrate Skillifier drafting/quality review into runtime jobs with model-task and DB-operation middleware evidence, Work Queue readback, Closeout Capsule opportunity linkage, and no invisible heartbeat mutation.",
    sourceDocRefs: [
      "docs/projects/model-memory/STATUS.md",
      "docs/projects/model-memory/CURRENT_SLICE.md",
      "docs/projects/model-memory/roadmap.md",
      "docs/projects/execution-platform/specs/work-queue-execution-truth.md",
      "docs/projects/execution-platform/specs/runtime-work-graph.md",
    ],
  },
  {
    legacySliceNumber: null,
    title: "Runtime Parity Gap Audit And Kill Switches",
    ownerSystemArea: "codex-bridge",
    nextAction:
      "Add a Codex parity readiness audit and kill switches so one-shot or proof-shaped coding paths cannot claim Codex parity success.",
    sourceDocRefs: [
      "docs/projects/execution-platform/specs/codex-parity-runtime.md",
      "docs/projects/execution-platform/specs/runtime-work-graph.md",
      "docs/projects/execution-platform/specs/work-queue-execution-truth.md",
    ],
  },
  {
    legacySliceNumber: null,
    title: "Persistent Codex Adapter Loop",
    ownerSystemArea: "codex-bridge",
    nextAction:
      "Replace one-shot Codex execution with a continuation-capable Codex adapter loop using direct main-repo writes, leases, per-turn evidence, and no production one-shot path.",
    sourceDocRefs: ["docs/projects/execution-platform/specs/codex-parity-runtime.md"],
  },
  {
    legacySliceNumber: null,
    title: "Validation Failure Classification And Repair",
    ownerSystemArea: "codex-bridge",
    nextAction:
      "Turn failed validations into in-job test-review and implementation-repair turns with bounded failure packets, reruns, and repair budget evidence.",
    sourceDocRefs: [
      "docs/projects/execution-platform/specs/codex-parity-runtime.md",
      "docs/projects/execution-platform/specs/script-worker-and-validation-scaling.md",
    ],
  },
  {
    legacySliceNumber: null,
    title: "Dynamic OpenClaw Role Graph Executor",
    ownerSystemArea: "workflows",
    nextAction:
      "Make the Runtime Work Graph drive live coding-team execution: GPT 5.5 orchestrator first, real role nodes, repeated context/test/review calls, and graph state streaming.",
    sourceDocRefs: [
      "docs/projects/execution-platform/specs/codex-parity-runtime.md",
      "docs/projects/execution-platform/specs/runtime-work-graph.md",
    ],
  },
  {
    legacySliceNumber: null,
    title: "Scope Expansion And Human Decision Nodes",
    ownerSystemArea: "workflows",
    nextAction:
      "Add bounded scope expansion requests and human wait/resume nodes so real jobs can continue safely without UX resubmission when they need owner input or additional repo scope.",
    sourceDocRefs: [
      "docs/projects/execution-platform/specs/codex-parity-runtime.md",
      "docs/projects/execution-platform/specs/runtime-work-graph.md",
    ],
  },
  {
    legacySliceNumber: null,
    title: "Kimi Standard Implementation Main-Edit Proof",
    ownerSystemArea: "codex-bridge",
    nextAction:
      "Prove Kimi as a real direct-main-repo standard implementation worker with scoped file edits, validation, and escalation to Codex when Kimi cannot complete the task.",
    sourceDocRefs: [
      "docs/projects/execution-platform/specs/codex-parity-runtime.md",
      "docs/projects/execution-platform/specs/model-routing-policy-and-evals.md",
    ],
  },
  {
    legacySliceNumber: null,
    title: "Work Queue Owner Readback For Real Agent Loops",
    ownerSystemArea: "work-queue",
    nextAction:
      "Expose graph status, active node, role/model refs, changed files, validation attempts, repair attempts, scope/human waits, limitations, final closeout, and ELI5 progress in owner readback.",
    sourceDocRefs: [
      "docs/projects/execution-platform/specs/codex-parity-runtime.md",
      "docs/projects/execution-platform/specs/work-queue-execution-truth.md",
    ],
  },
  {
    legacySliceNumber: null,
    title: "Closeout Ordering And Quality Gate",
    ownerSystemArea: "workers",
    nextAction:
      "Generate the final model-authored Closeout Capsule only after runtime evidence is accepted or explicitly failed/needs-review, and require it to reflect validation/repair history.",
    sourceDocRefs: [
      "docs/projects/execution-platform/specs/codex-parity-runtime.md",
      "docs/projects/execution-platform/specs/observability-safety-and-artifacts.md",
    ],
  },
  {
    legacySliceNumber: null,
    title: "Long-Form UX Codex Parity Proof",
    ownerSystemArea: "gateway",
    nextAction:
      "Run one 10k-20k character OpenClaw UX coding prompt through direct main-repo Codex implementation, dynamic role graph, in-job validation repair, Work Queue readback, and Closeout Capsule without local Codex rescue.",
    sourceDocRefs: [
      "docs/projects/execution-platform/specs/codex-parity-runtime.md",
      "docs/projects/execution-platform/specs/live-execution-readiness-gates.md",
    ],
  },
  {
    legacySliceNumber: null,
    title: "Managed Multi-Prompt Coding Soak",
    ownerSystemArea: "codex-bridge",
    nextAction:
      "Run 3-5 real owner-useful coding prompts through the parity runtime, including multi-file work, validation repair, scope/human decision, Kimi standard implementation or escalation, and useful owner closeouts.",
    sourceDocRefs: [
      "docs/projects/execution-platform/specs/codex-parity-runtime.md",
      "docs/projects/execution-platform/specs/live-execution-readiness-gates.md",
    ],
  },
  { legacySliceNumber: 49, title: "Proactivity Work Queue Quality Soak" },
  { legacySliceNumber: 31, title: "Memory Curator Workflow" },
  { legacySliceNumber: 32, title: "Skill Curator Workflow" },
  { legacySliceNumber: 36, title: "Product/Spec Planning Worker Contract" },
  { legacySliceNumber: 33, title: "Incident/Recovery Assistant Workflow" },
  { legacySliceNumber: 30, title: "Release/DevOps Reviewer Workflow" },
  { legacySliceNumber: 37, title: "Production Deploy Workflow" },
  { legacySliceNumber: 38, title: "Outbound Notification Workflow" },
  { legacySliceNumber: 39, title: "Dependency/Install Workflow" },
  { legacySliceNumber: 40, title: "Model Eval And Promotion Workflow" },
  { legacySliceNumber: 34, title: "Design Worker Contract And Adapter Plan" },
  { legacySliceNumber: 35, title: "Marketing/Content Worker Contract And Adapter Plan" },
  { legacySliceNumber: 54, title: "Final Platform Coherence Audit" },
  { legacySliceNumber: 55, title: "Final Owner UX Production Soak" },
  { legacySliceNumber: 56, title: "Release Rollback Runbook Closeout" },
] satisfies ActiveQueueEntry[];

const ACTIVE_QUEUE_LEGACY_SLICE_SET = new Set<number>(
  ACTIVE_QUEUE_ENTRIES.map((entry) => entry.legacySliceNumber).filter(
    (legacySliceNumber): legacySliceNumber is number => legacySliceNumber !== null,
  ),
);

type ReconciledSliceState = {
  planningStatus: WorkQueueConvergenceSlicePlanningStatus;
  artifactRefs: string[];
  nextAction: string | null;
  blockerReasonCodes: string[];
};

const ACTIVE_QUEUE_RECONCILED_STATES: Record<number, ReconciledSliceState> = {
  1: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/active-queue-01-coding-team-codex-parity-summary.json",
      ".artifacts/execution-platform/active-queue-01-coding-team-codex-parity-quality-review.json",
      ".artifacts/execution-platform/active-queue-01-coding-team-codex-parity-artifact-index.json",
      ".artifacts/execution-platform/coding-team-work-queue-linked-pilot-proof.json",
      ".artifacts/execution-platform/coding-team-closeout-quality-proof.json",
      ".artifacts/execution-platform/coding-team-work-queue-readback-proof.json",
    ],
    nextAction:
      "Proceed to active-queue-02 Dynamic Coding Team Orchestration Graph; broader managed multi-action soak remains active-queue-06.",
    blockerReasonCodes: [],
  },
  2: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/runtime-work-graph-schema-repository-proof.json",
      ".artifacts/execution-platform/dynamic-coding-team-orchestrator-proof.json",
      ".artifacts/execution-platform/dynamic-test-repair-loop-proof.json",
      ".artifacts/execution-platform/dynamic-coding-team-runtime-proof.json",
    ],
    nextAction:
      "Use the durable Runtime Work Graph as the substrate for active-queue-07 Core OpenClaw Loop Simplification.",
    blockerReasonCodes: [],
  },
  3: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/work-queue-parent-child-action-graph-proof.json",
      ".artifacts/execution-platform/managed-multi-action-project-soak-work-queue-readback.json",
    ],
    nextAction:
      "Use parent/child Work Queue readback as planning/projection evidence; runtime jobs remain lifecycle truth.",
    blockerReasonCodes: [],
  },
  4: {
    planningStatus: "completed",
    artifactRefs: [".artifacts/execution-platform/human-operator-task-adapter-proof.json"],
    nextAction:
      "Use bounded human pause/resume nodes for future multi-action plans that need owner input.",
    blockerReasonCodes: [],
  },
  5: {
    planningStatus: "completed",
    artifactRefs: [".artifacts/execution-platform/plan-to-runtime-compiler-proof.json"],
    nextAction:
      "Use the compiler boundary for approved action graphs; invalid authority/scope/dependencies must remain blocked before runtime job creation.",
    blockerReasonCodes: [],
  },
  6: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/managed-multi-action-project-soak-summary.json",
      ".artifacts/execution-platform/managed-multi-action-project-soak-quality-review.json",
      ".artifacts/execution-platform/managed-multi-action-project-soak-run-index.json",
    ],
    nextAction:
      "Proceed to active-queue-07 Core OpenClaw Loop Simplification with Runtime Work Graph evidence available.",
    blockerReasonCodes: [],
  },
  7: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/runtime-work-graph-openclaw-readiness-summary.json",
      ".artifacts/execution-platform/runtime-work-graph-browser-ux-proof-run.json",
      ".artifacts/execution-platform/runtime-work-graph-browser-ux-quality-review.json",
      ".artifacts/execution-platform/runtime-work-graph-browser-ux-work-queue-readback.json",
      ".artifacts/execution-platform/kimi-live-source-edit-proof.json",
      ".artifacts/execution-platform/runtime-work-graph-process-cleanup-proof.json",
    ],
    nextAction:
      "Proceed to active-queue-08 Skillifier Runtime Job Migration; active-queue-07 is runnable through OpenClaw UX/runtime with parent and child runtime jobs succeeded.",
    blockerReasonCodes: [],
  },
  8: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/active-queue-08-skillifier-runtime-contract-proof.json",
      ".artifacts/execution-platform/active-queue-08-skillifier-worker-adapter-proof.json",
      ".artifacts/execution-platform/active-queue-08-closeout-opportunity-skillifier-integration-proof.json",
      ".artifacts/execution-platform/active-queue-08-skill-candidate-artifact-proof.json",
      ".artifacts/execution-platform/active-queue-08-work-queue-skillifier-readback-proof.json",
      ".artifacts/execution-platform/active-queue-08-live-skillifier-runtime-proof.json",
      ".artifacts/execution-platform/active-queue-08-live-skillifier-work-queue-readback.json",
      ".artifacts/execution-platform/active-queue-08-skillifier-runtime-summary.json",
    ],
    nextAction:
      "Proceed to active-queue-09 Runtime Parity Gap Audit And Kill Switches; Skillifier work is runtime-backed, Work Queue-visible, and review-gated for skill-file apply, but coding parity must be fixed before the next broad soak.",
    blockerReasonCodes: [],
  },
  9: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/codex-parity-live-ux-proof-run.json",
      ".artifacts/execution-platform/codex-parity-live-ux-quality-review.json",
      ".artifacts/execution-platform/codex-parity-live-ux-work-queue-readback.json",
      ".artifacts/execution-platform/codex-parity-plus-gateway-rebuild-reload-proof-v2.json",
    ],
    nextAction:
      "Use production success gates and live evidence extraction fixes as the baseline for the remaining Codex parity block.",
    blockerReasonCodes: [],
  },
  10: {
    planningStatus: "needs_review",
    artifactRefs: [
      ".artifacts/execution-platform/codex-parity-live-ux-proof-run.json",
      ".artifacts/execution-platform/codex-parity-live-ux-quality-review.json",
    ],
    nextAction:
      "Prove continuation on the same Codex adapter thread after a live validation failure; the long-form pass completed without needing repair.",
    blockerReasonCodes: ["live_failed_validation_continuation_unproven"],
  },
  11: {
    planningStatus: "needs_review",
    artifactRefs: [
      ".artifacts/execution-platform/dynamic-test-repair-loop-proof.json",
      ".artifacts/execution-platform/codex-parity-live-ux-proof-run.json",
    ],
    nextAction:
      "Run a live production-path failed-validation repair case and require the same runtime job to classify, repair, rerun, and close out.",
    blockerReasonCodes: ["live_failed_validation_repair_unproven"],
  },
  12: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/codex-parity-live-ux-proof-run.json",
      ".artifacts/execution-platform/codex-parity-live-ux-work-queue-readback.json",
    ],
    nextAction:
      "Dynamic OpenClaw role graph execution is live for GPT-5.5 orchestration, repeated Kimi context scout calls, Codex implementation, test review, reviewer, observability, and final closeout.",
    blockerReasonCodes: [],
  },
  13: {
    planningStatus: "needs_review",
    artifactRefs: [
      ".artifacts/execution-platform/managed-multi-action-project-soak-summary.json",
      ".artifacts/execution-platform/codex-parity-live-ux-proof-run.json",
    ],
    nextAction:
      "Prove owner-visible scope expansion or human decision nodes in the Codex parity runtime path, not only in the earlier managed multi-action graph proof.",
    blockerReasonCodes: ["codex_parity_scope_human_live_case_unproven"],
  },
  14: {
    planningStatus: "needs_review",
    artifactRefs: [
      ".artifacts/execution-platform/kimi-live-source-edit-proof.json",
      ".artifacts/execution-platform/codex-parity-live-ux-proof-run.json",
    ],
    nextAction:
      "Run Kimi as the standard implementation lane on a real direct-main-repo coding task with source edits, validation, and escalation if needed.",
    blockerReasonCodes: ["kimi_standard_implementation_live_case_unproven"],
  },
  15: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/codex-parity-live-ux-work-queue-readback.json",
      ".artifacts/execution-platform/codex-parity-live-ux-quality-review.json",
    ],
    nextAction:
      "Owner readback now surfaces dynamic task graph fallback, role/model refs, repeated roles, source edits, validation refs, progress stages, and closeout evidence.",
    blockerReasonCodes: [],
  },
  16: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/codex-parity-live-ux-proof-run.json",
      ".artifacts/execution-platform/codex-parity-live-ux-quality-review.json",
    ],
    nextAction:
      "Closeout remains after accepted runtime evidence in the live proof; next failed-repair proof must confirm closeout accurately reports needs-review/failure when evidence is rejected.",
    blockerReasonCodes: [],
  },
  17: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/codex-parity-live-ux-proof-preflight.json",
      ".artifacts/execution-platform/codex-parity-live-ux-proof-run.json",
      ".artifacts/execution-platform/codex-parity-live-ux-quality-review.json",
      ".artifacts/execution-platform/codex-parity-live-ux-work-queue-readback.json",
    ],
    nextAction:
      "Proceed through the remaining parity blockers before active-queue-18 Managed Multi-Prompt Coding Soak.",
    blockerReasonCodes: [],
  },
};

const RECONCILED_SLICE_STATES: Record<number, ReconciledSliceState> = {
  1: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/openclaw-session-health-repair-summary.json",
      ".artifacts/execution-platform/manual-closeout-openclaw-session-health-repair-proof.json",
    ],
    nextAction: "Use session-health repair evidence as dependency input for the amended roadmap.",
    blockerReasonCodes: [],
  },
  2: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/work-queue-canonical-slice-tracker-summary.json",
      ".artifacts/execution-platform/convergence-tracker-live-seed-proof.json",
    ],
    nextAction: "Use canonical tracker evidence as dependency input for the amended roadmap.",
    blockerReasonCodes: [],
  },
  3: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/db-boundary-activation-summary.json",
      ".artifacts/execution-platform/execution-platform-live-db-boundary-readiness.json",
    ],
    nextAction: "Use the shared configured runtime DB boundary as live linkage input.",
    blockerReasonCodes: [],
  },
  4: {
    planningStatus: "completed",
    artifactRefs: [".artifacts/execution-platform/feature-flag-kill-switch-registry-summary.json"],
    nextAction: "Use feature-flag and kill-switch registry as rollout guardrail input.",
    blockerReasonCodes: [],
  },
  5: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/slice-05-gateway-enqueue-only-proof.json",
      ".artifacts/execution-platform/slices-05-07-worker-boundary-integration-proof.json",
    ],
    nextAction:
      "Use gateway enqueue-only boundary evidence as dependency input for worker adapter activation.",
    blockerReasonCodes: [],
  },
  6: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/slice-06-runtime-worker-supervisor-skeleton-proof.json",
      ".artifacts/execution-platform/slice-06-runtime-worker-supervisor-no-side-effects-proof.json",
      ".artifacts/execution-platform/slices-05-07-worker-boundary-integration-proof.json",
    ],
    nextAction:
      "Use runtime worker supervisor skeleton as dependency input for typed worker adapters.",
    blockerReasonCodes: [],
  },
  7: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/slice-07-worker-adapter-registry-proof.json",
      ".artifacts/execution-platform/slice-07-worker-contract-state-readback-proof.json",
      ".artifacts/execution-platform/slices-05-07-worker-boundary-integration-proof.json",
    ],
    nextAction:
      "Use workflow worker adapter contract states to activate the first ACP/Codex coding adapter.",
    blockerReasonCodes: [],
  },
  8: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/slice-08-acp-codex-coding-worker-adapter-proof.json",
      ".artifacts/execution-platform/slice-08-coding-worker-supervisor-integration-proof.json",
      ".artifacts/execution-platform/slice-08-coding-worker-live-blocker.json",
    ],
    nextAction:
      "Use static ACP/Codex coding worker adapter proof as dependency input for live adapter activation.",
    blockerReasonCodes: [],
  },
  9: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/slice-09-closeout-model-executor-placement-proof.json",
      ".artifacts/execution-platform/slice-09-closeout-capsule-worker-supervisor-proof.json",
      ".artifacts/execution-platform/slice-09-closeout-capsule-readback-proof.json",
      ".artifacts/execution-platform/slice-09-work-episode-pack-capsule-index-proof.json",
      ".artifacts/execution-platform/model-first-closeout-host-runtime-proof.json",
      ".artifacts/execution-platform/model-first-closeout-correction-summary.json",
      ".artifacts/execution-platform/manual-closeout-model-first-closeout-correction-proof.json",
      ".artifacts/execution-platform/closeout-capsule-final-summary.json",
    ],
    nextAction:
      "Use worker-boundary Closeout Capsule enforcement as dependency input for live coding worker closeout.",
    blockerReasonCodes: [],
  },
  10: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/slice-10-browser-runtime-linkage-static-proof.json",
      ".artifacts/execution-platform/slice-10-browser-runtime-linkage-live-blocker.json",
      ".artifacts/execution-platform/slice-10-work-queue-runtime-linkage-readback-proof.json",
      ".artifacts/execution-platform/slice-10-chat-closeout-readback-proof.json",
      ".artifacts/execution-platform/live-gateway-human-ui-execution-proof.json",
      ".artifacts/execution-platform/real-owner-soak-agent-main-summary.json",
      ".artifacts/execution-platform/closeout-capsule-three-prompt-soak-summary.json",
      ".artifacts/execution-platform/closeout-capsule-full-managed-soak-summary.json",
    ],
    nextAction:
      "Use static browser runtime linkage audit as dependency input for Work Queue runtime readback upgrade.",
    blockerReasonCodes: [],
  },
  11: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/slice-11-work-queue-runtime-readback-proof.json",
      ".artifacts/execution-platform/slice-11-work-queue-readback-no-lifecycle-mutation-proof.json",
      ".artifacts/execution-platform/slice-11-closeout-capsule-owner-readback-proof.json",
      ".artifacts/execution-platform/closeout-readback-repair-summary.json",
      ".artifacts/execution-platform/work-queue-product-readback-polish-proof.json",
      ".artifacts/execution-platform/amended-convergence-tracker-live-readback.json",
    ],
    nextAction:
      "Use upgraded Work Queue runtime readback as dependency input for live worker soak.",
    blockerReasonCodes: [],
  },
  12: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/slice-12-runtime-controls-through-worker-supervisor-proof.json",
      ".artifacts/execution-platform/slice-12-runtime-control-negative-cases-proof.json",
      ".artifacts/execution-platform/slice-12-work-queue-control-readback-proof.json",
      ".artifacts/execution-platform/work-queue-runtime-controls-live-smoke-proof.json",
      ".artifacts/execution-platform/work-queue-runtime-controls-live-readback-proof.json",
    ],
    nextAction:
      "Work Queue runtime controls are owner-only live after focused runtime-backed smoke; use as dependency input for final owner soaks.",
    blockerReasonCodes: [],
  },
  13: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/slice-13-coding-team-permission-model-proof.json",
      ".artifacts/execution-platform/slice-13-workflow-permission-readback-proof.json",
      ".artifacts/execution-platform/slice-13-permission-negative-cases-proof.json",
      ".artifacts/execution-platform/coding-team-permission-model-summary.json",
      ".artifacts/execution-platform/coding-team-permission-model-proof.json",
    ],
    nextAction:
      "Use coding-team permission reconciliation as dependency input for live coding worker soak.",
    blockerReasonCodes: [],
  },
  14: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/slice-14-coding-team-live-worker-summary.json",
      ".artifacts/execution-platform/slice-14-coding-team-live-worker-blocker.json",
      ".artifacts/execution-platform/slice-14-coding-team-live-worker-validation-proof.json",
      ".artifacts/execution-platform/coding-team-live-pilot-summary.json",
      ".artifacts/execution-platform/coding-team-work-queue-linked-pilot-proof.json",
      ".artifacts/execution-platform/coding-team-closeout-quality-proof.json",
      ".artifacts/execution-platform/kimi-k2-6-role-transport-fix-summary.json",
      ".artifacts/execution-platform/kimi-k2-6-role-transport-fix-validation-proof.json",
      ".artifacts/execution-platform/slice-14-coding-team-multi-prompt-soak-summary.json",
      ".artifacts/execution-platform/slice-14-coding-team-multi-prompt-soak-index.json",
      ".artifacts/execution-platform/slice-14-coding-team-multi-prompt-soak-work-queue-proof.json",
    ],
    nextAction:
      "Use the completed coding-team multi-prompt soak as dependency input for Slice 15 Web Research Worker Adapter.",
    blockerReasonCodes: [],
  },
  15: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/web-researcher-live-pilot-summary.json",
      ".artifacts/execution-platform/web-researcher-live-pilot-runtime-evidence-proof.json",
      ".artifacts/execution-platform/slice-15-web-research-worker-adapter-proof.json",
      ".artifacts/execution-platform/slices-15-19-worker-adapter-integration-proof.json",
      ".artifacts/execution-platform/starter-web-research-live-quality-proof.json",
      ".artifacts/execution-platform/starter-workflow-live-quality-soak-summary.json",
    ],
    nextAction:
      "Use the web research worker adapter as dependency input for research-to-coding handoff work.",
    blockerReasonCodes: [],
  },
  16: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/web-research-to-coding-linked-handoff-proof.json",
      ".artifacts/execution-platform/convergence-slices-10-13-summary.json",
      ".artifacts/execution-platform/slice-16-research-to-coding-handoff-worker-proof.json",
      ".artifacts/execution-platform/slices-15-19-worker-adapter-integration-proof.json",
      ".artifacts/execution-platform/starter-research-to-coding-live-quality-proof.json",
      ".artifacts/execution-platform/starter-workflow-live-quality-soak-summary.json",
    ],
    nextAction:
      "Use worker-supervised research-to-coding handoff as dependency input for docs/skills worker work.",
    blockerReasonCodes: [],
  },
  17: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/docs-skills-live-pilot-live-proof.json",
      ".artifacts/execution-platform/docs-skills-work-queue-readback-proof.json",
      ".artifacts/execution-platform/slice-17-docs-skills-worker-adapter-proof.json",
      ".artifacts/execution-platform/slices-15-19-worker-adapter-integration-proof.json",
      ".artifacts/execution-platform/starter-docs-skills-live-quality-proof.json",
      ".artifacts/execution-platform/starter-workflow-live-quality-soak-summary.json",
    ],
    nextAction:
      "Use the docs/skills worker adapter as dependency input for QA/test worker expansion.",
    blockerReasonCodes: [],
  },
  18: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/qa-test-review-live-proof.json",
      ".artifacts/execution-platform/qa-test-work-queue-readback-proof.json",
      ".artifacts/execution-platform/slice-18-qa-test-worker-adapter-proof.json",
      ".artifacts/execution-platform/slices-15-19-worker-adapter-integration-proof.json",
      ".artifacts/execution-platform/starter-qa-test-live-quality-proof.json",
      ".artifacts/execution-platform/starter-workflow-live-quality-soak-summary.json",
    ],
    nextAction: "Use the QA/test worker adapter as dependency input for architecture/spec work.",
    blockerReasonCodes: [],
  },
  19: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/architecture-spec-review-live-proof.json",
      ".artifacts/execution-platform/architecture-spec-work-queue-readback-proof.json",
      ".artifacts/execution-platform/slice-19-architecture-spec-worker-adapter-proof.json",
      ".artifacts/execution-platform/slices-15-19-worker-adapter-integration-proof.json",
      ".artifacts/execution-platform/starter-architecture-spec-live-quality-proof.json",
      ".artifacts/execution-platform/starter-workflow-live-quality-soak-summary.json",
    ],
    nextAction:
      "Use starter workflow adapters as dependency input for middleware live completion slices.",
    blockerReasonCodes: [],
  },
  20: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/model-task-middleware-contract-proof.json",
      ".artifacts/execution-platform/convergence-slices-10-13-summary.json",
    ],
    nextAction: "Use model-task middleware evidence as input for worker-supervised live use.",
    blockerReasonCodes: [],
  },
  21: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/script-middleware-contract-proof.json",
      ".artifacts/execution-platform/convergence-slices-10-13-summary.json",
    ],
    nextAction:
      "Use allowlisted script middleware evidence as input for worker-supervised live use.",
    blockerReasonCodes: [],
  },
  22: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/db-operation-middleware-contract-proof.json",
      ".artifacts/execution-platform/convergence-slices-10-13-summary.json",
    ],
    nextAction: "Use DB-operation middleware evidence as input for worker-supervised live use.",
    blockerReasonCodes: [],
  },
  23: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/slice-23-middleware-worker-supervisor-adoption-proof.json",
      ".artifacts/execution-platform/slice-23-middleware-lease-renewal-proof.json",
      ".artifacts/execution-platform/slice-23-middleware-supervisor-negative-cases-proof.json",
      ".artifacts/execution-platform/slices-23-26-middleware-adoption-summary.json",
    ],
    nextAction:
      "Use middleware worker supervisor adoption evidence as dependency input for workflow adapter middleware adoption.",
    blockerReasonCodes: [],
  },
  24: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/slice-24-workflow-adapter-middleware-adoption-proof.json",
      ".artifacts/execution-platform/slice-24-coding-team-middleware-adoption-proof.json",
      ".artifacts/execution-platform/slice-24-starter-workflow-middleware-adoption-proof.json",
      ".artifacts/execution-platform/slice-24-workflow-middleware-readback-proof.json",
      ".artifacts/execution-platform/slices-23-26-middleware-adoption-summary.json",
    ],
    nextAction:
      "Use workflow adapter middleware evidence as dependency input for bypass audit and legacy path shutdown.",
    blockerReasonCodes: [],
  },
  25: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/slice-25-middleware-bypass-audit.json",
      ".artifacts/execution-platform/slice-25-legacy-path-shutdown-proof.json",
      ".artifacts/execution-platform/slice-25-middleware-evidence-enforcement-proof.json",
      ".artifacts/execution-platform/slices-23-26-middleware-adoption-summary.json",
    ],
    nextAction:
      "Use middleware bypass audit as dependency input for managed middleware-backed soak.",
    blockerReasonCodes: [],
  },
  26: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/slice-26-managed-middleware-backed-soak-index.json",
      ".artifacts/execution-platform/slice-26-managed-middleware-backed-soak-work-queue-proof.json",
      ".artifacts/execution-platform/slice-26-managed-middleware-backed-soak-quality-assessment.json",
      ".artifacts/execution-platform/slices-23-26-middleware-adoption-summary.json",
    ],
    nextAction:
      "Use managed middleware-backed soak as dependency input for full platform middleware roster and memory adoption checks.",
    blockerReasonCodes: [],
  },
  27: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/full-platform-middleware-wiring-summary.json",
      ".artifacts/execution-platform/checkpoint-a-model-task-roster-binding-proof.json",
      ".artifacts/execution-platform/checkpoint-b-workflow-middleware-adoption-proof.json",
      ".artifacts/execution-platform/checkpoint-c-model-memory-capture-middleware-proof.json",
      ".artifacts/execution-platform/checkpoint-d-retrieval-context-pack-middleware-proof.json",
      ".artifacts/execution-platform/checkpoint-e-skills-proactivity-middleware-proof.json",
      ".artifacts/execution-platform/checkpoint-f-full-platform-middleware-soak-proof.json",
    ],
    nextAction:
      "Use full-platform middleware adoption checks as dependency input for live gateway human UI proof and autocompaction repair.",
    blockerReasonCodes: [],
  },
  28: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/slices-26-28-summary.json",
      ".artifacts/execution-platform/agent-main-autocompaction-live-repair-proof.json",
      ".artifacts/execution-platform/live-gateway-human-ui-normal-chat-proof.json",
      ".artifacts/execution-platform/live-gateway-human-ui-health-postcheck-proof.json",
    ],
    nextAction:
      "Use live gateway human UI and autocompaction repair evidence as dependency input for live front-door owner soak.",
    blockerReasonCodes: [],
  },
  29: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/slice-29-live-front-door-owner-soak-summary.json",
      ".artifacts/execution-platform/managed-owner-soak-run-index.json",
      ".artifacts/execution-platform/managed-owner-soak-work-queue-runtime-proof.json",
      ".artifacts/execution-platform/slice-29-live-front-door-owner-soak-validation-proof.json",
    ],
    nextAction:
      "Use live front-door owner soak evidence as dependency input for remaining execution workflow expansion and memory runtime hardening.",
    blockerReasonCodes: [],
  },
  41: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/model-memory-runtime-hook-reality-audit.json",
      ".artifacts/execution-platform/model-memory-runtime-wiring-summary.json",
      ".artifacts/execution-platform/work-queue-memory-proactivity-readback-proof.json",
      ".artifacts/execution-platform/memory-runtime-maximal-live-wiring-preflight.json",
      ".artifacts/execution-platform/memory-runtime-tracker-docs-artifact-reconciliation-proof.json",
    ],
    nextAction: "Use reconciled tracker truth as input for memory readback and live wiring slices.",
    blockerReasonCodes: [],
  },
  42: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/work-queue-memory-proactivity-readback-proof.json",
      ".artifacts/execution-platform/memory-runtime-work-queue-readback-shape-proof.json",
    ],
    nextAction: "Use repaired readback shape for live prompt-router memory and context-pack proof.",
    blockerReasonCodes: [],
  },
  43: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/prompt-router-memory-policy-live-integration-proof.json",
    ],
    nextAction:
      "Use live prompt-router memory policy decisions as route-aware context-pack inputs.",
    blockerReasonCodes: [],
  },
  44: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/route-aware-context-pack-live-migration-proof.json",
      ".artifacts/execution-platform/memory-runtime-gateway-rebuild-reload-proof.json",
    ],
    nextAction: "Use route-aware context-pack insertion in qualitative live memory soak.",
    blockerReasonCodes: [],
  },
  45: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/memory-capture-proactivity-middleware-migration-proof.json",
      ".artifacts/execution-platform/model-memory-runtime-wiring-summary.json",
      ".artifacts/execution-platform/closeout-capsule-proactivity-work-queue-proof.json",
    ],
    nextAction: "Use middleware-backed capture/proactivity evidence for qualitative memory soak.",
    blockerReasonCodes: [],
  },
  46: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/live-over-budget-automatic-compaction-proof.json",
      ".artifacts/execution-platform/model-memory-runtime-live-context-compaction-proof.json",
      ".artifacts/execution-platform/memory-runtime-13-hook-hard-gate-proof.json",
    ],
    nextAction:
      "Use controlled over-budget compaction proof as dependency input for memory-aware workflow soaks.",
    blockerReasonCodes: [],
  },
  47: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/qualitative-memory-live-soak-summary.json",
      ".artifacts/execution-platform/qualitative-memory-live-soak-run-index.json",
      ".artifacts/execution-platform/model-memory-runtime-live-proof-summary.json",
      ".artifacts/execution-platform/memory-runtime-all-hook-migrations-proof.json",
      ".artifacts/execution-platform/memory-live-dense-capture-model-authored-review.json",
      ".artifacts/execution-platform/memory-live-quality-hard-shutdown-summary.json",
    ],
    nextAction:
      "Proceed to skillifier runtime job migration and proactivity Work Queue quality soak; dense capture and workflow context quality have live proof.",
    blockerReasonCodes: [],
  },
  50: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/memory-live-dense-capture-and-workflow-run-index.json",
      ".artifacts/execution-platform/memory-live-workflow-retrieval-context-review.json",
      ".artifacts/execution-platform/memory-live-quality-hard-shutdown-summary.json",
    ],
    nextAction:
      "Use memory-aware workflow context proof as dependency input for coding-team Codex-parity trust and final owner UX soak.",
    blockerReasonCodes: [],
  },
  51: {
    planningStatus: "completed",
    artifactRefs: [
      ".artifacts/execution-platform/model-memory-compatibility-path-audit.json",
      ".artifacts/execution-platform/model-memory-compatibility-shutdown-proof.json",
      ".artifacts/execution-platform/memory-live-quality-hard-shutdown-summary.json",
    ],
    nextAction:
      "Legacy retrieval-context overlay is hard-disabled outside tests/explicit compatibility mode; proceed to coding-team Codex-parity trust soak.",
    blockerReasonCodes: [],
  },
};

function sliceId(index: number): string {
  return `openclaw-convergence.slice-${String(index + 1).padStart(2, "0")}`;
}

function historicalSliceId(number: number): string {
  return `openclaw-convergence.slice-${String(number).padStart(2, "0")}`;
}

function activeQueueId(position: number): string {
  return `openclaw-convergence.active-queue-${String(position).padStart(2, "0")}`;
}

function ownerForTitle(title: string): string {
  if (title.includes("Memory")) {
    return "model-memory";
  }
  if (title.includes("Skill")) {
    return "skills-system";
  }
  if (title.includes("Queue")) {
    return "work-queue";
  }
  if (title.includes("Router") || title.includes("Gateway")) {
    return "intent-front-door";
  }
  if (title.includes("Team") || title.includes("Workflow") || title.includes("Worker")) {
    return "workflows";
  }
  if (title.includes("Middleware")) {
    return "runtime-middleware";
  }
  return "execution-platform";
}

function waveForIndex(index: number): string {
  if (index < 4) {
    return "wave-1-foundation";
  }
  if (index < 14) {
    return "wave-2-worker-runtime-foundation";
  }
  if (index < 22) {
    return "wave-3-live-workflows-and-middleware";
  }
  if (index < 29) {
    return "wave-4-middleware-owner-runtime-proof";
  }
  if (index < 40) {
    return "wave-5-expanded-workflows-and-authority";
  }
  if (index < 50) {
    return "wave-6-memory-skills-proactivity";
  }
  return "wave-7-core-loop-final-soak-release";
}

export function buildOpenClawConvergenceSliceDefinitions(): ConvergenceSliceDefinition[] {
  const historicalDefinitions = SLICE_TITLES.map((title, index) => {
    const number = index + 1;
    const reconciled = RECONCILED_SLICE_STATES[number];
    const activeQueuePosition = ACTIVE_QUEUE_ENTRIES.findIndex(
      (entry) => entry.legacySliceNumber === number,
    );
    const supersededByActiveQueueId =
      activeQueuePosition === -1 ? null : activeQueueId(activeQueuePosition + 1);
    const plannedStatus = reconciled?.planningStatus ?? "planned";
    const planningStatus =
      plannedStatus === "planned" && ACTIVE_QUEUE_LEGACY_SLICE_SET.has(number)
        ? "superseded"
        : plannedStatus;
    return {
      sliceId: sliceId(index),
      trackerKind: "historical_slice" as const,
      title,
      track: "openclaw-platform-convergence",
      wave: waveForIndex(index),
      ownerSystemArea: ownerForTitle(title),
      priority: number,
      legacySliceId: sliceId(index),
      previousSliceId: null,
      historicalSliceId: sliceId(index),
      activeQueueId: null,
      activeQueuePosition: null,
      supersededByActiveQueueId,
      dependsOnSliceIds: number === 1 ? [] : [sliceId(index - 1)],
      dependsOnActiveQueueIds: [],
      dependsOnHistoricalSliceIds: number === 1 ? [] : [sliceId(index - 1)],
      sourceDocRefs: [...SOURCE_DOC_REFS],
      artifactRefs: reconciled?.artifactRefs ?? [],
      planningStatus,
      nextAction: supersededByActiveQueueId
        ? `Historical planned slice superseded by active queue item ${supersededByActiveQueueId}.`
        : (reconciled?.nextAction ??
          "Wait for prerequisite slice closeout evidence before implementation."),
      blockerReasonCodes: reconciled?.blockerReasonCodes ?? [],
    };
  });
  const activeDefinitions = ACTIVE_QUEUE_ENTRIES.map((entry, index) => {
    const position = index + 1;
    const legacyNumber = entry.legacySliceNumber;
    const title = entry.title;
    const queueId = activeQueueId(position);
    const previousQueueId = position === 1 ? null : activeQueueId(position - 1);
    const reconciled = ACTIVE_QUEUE_RECONCILED_STATES[position];
    const legacySliceId = legacyNumber === null ? null : historicalSliceId(legacyNumber);
    return {
      sliceId: queueId,
      trackerKind: "active_queue_item" as const,
      title,
      track: "openclaw-platform-convergence",
      wave: "wave-7-active-execution-queue",
      ownerSystemArea: entry.ownerSystemArea ?? ownerForTitle(title),
      priority: position,
      legacySliceId,
      previousSliceId: previousQueueId,
      historicalSliceId: legacySliceId,
      activeQueueId: queueId,
      activeQueuePosition: position,
      supersededByActiveQueueId: null,
      dependsOnSliceIds: previousQueueId ? [previousQueueId] : [],
      dependsOnActiveQueueIds: previousQueueId ? [previousQueueId] : [],
      dependsOnHistoricalSliceIds:
        position === 1
          ? [
              historicalSliceId(14),
              historicalSliceId(29),
              historicalSliceId(47),
              historicalSliceId(50),
              historicalSliceId(51),
            ]
          : [],
      sourceDocRefs: [...SOURCE_DOC_REFS, ...(entry.sourceDocRefs ?? [])],
      artifactRefs: reconciled?.artifactRefs ?? [],
      planningStatus: reconciled?.planningStatus ?? ("planned" as const),
      nextAction:
        reconciled?.nextAction ??
        entry.nextAction ??
        (position === 1
          ? "Next implementation prompt target: active-queue-01 Coding Team Codex-Parity Trust Soak."
          : "Wait for prior active queue item closeout evidence before implementation."),
      blockerReasonCodes: reconciled?.blockerReasonCodes ?? [],
    };
  });
  return [...historicalDefinitions, ...activeDefinitions];
}

export function buildConvergenceSliceTrackerMetadata(
  definition: ConvergenceSliceDefinition,
): ConvergenceSliceTrackerMetadata {
  return {
    artifactKind: "work_queue_convergence_slice_tracker_metadata",
    trackerVersion: CONVERGENCE_SLICE_TRACKER_VERSION,
    sliceId: definition.sliceId,
    trackerKind: definition.trackerKind,
    title: definition.title,
    track: definition.track,
    wave: definition.wave,
    ownerSystemArea: definition.ownerSystemArea,
    priority: definition.priority,
    legacySliceId: definition.legacySliceId,
    previousSliceId: definition.previousSliceId,
    historicalSliceId: definition.historicalSliceId,
    activeQueueId: definition.activeQueueId,
    activeQueuePosition: definition.activeQueuePosition,
    supersededByActiveQueueId: definition.supersededByActiveQueueId,
    dependsOnSliceIds: definition.dependsOnSliceIds.slice(0, 20),
    dependsOnActiveQueueIds: definition.dependsOnActiveQueueIds.slice(0, 20),
    dependsOnHistoricalSliceIds: definition.dependsOnHistoricalSliceIds.slice(0, 20),
    sourceDocRefs: definition.sourceDocRefs.slice(0, 20),
    artifactRefs: definition.artifactRefs.slice(0, 20),
    planningStatus: definition.planningStatus,
    nextAction: definition.nextAction,
    blockerReasonCodes: definition.blockerReasonCodes.slice(0, 20),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

export function buildOpenClawActiveConvergenceQueue(): ConvergenceSliceDefinition[] {
  return buildOpenClawConvergenceSliceDefinitions().filter(
    (definition) => definition.trackerKind === "active_queue_item",
  );
}

export function getNextActiveConvergenceQueueItem(): ConvergenceSliceDefinition | null {
  return (
    buildOpenClawActiveConvergenceQueue()
      .filter(
        (definition) =>
          definition.planningStatus !== "completed" && definition.planningStatus !== "superseded",
      )
      .toSorted(
        (left, right) => (left.activeQueuePosition ?? 999) - (right.activeQueuePosition ?? 999),
      )
      .at(0) ?? null
  );
}

export function summarizeOpenClawActiveQueueRebase(): {
  trackerVersion: typeof CONVERGENCE_SLICE_TRACKER_VERSION;
  historicalSliceCount: number;
  completedHistoricalSliceCount: number;
  supersededHistoricalPlannedCount: number;
  activeQueueItemCount: number;
  nextActiveQueueItem: {
    activeQueueId: string;
    title: string;
    legacySliceId: string | null;
  } | null;
  activeQueueTitles: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutationAllowed: false;
} {
  const definitions = buildOpenClawConvergenceSliceDefinitions();
  const historical = definitions.filter(
    (definition) => definition.trackerKind === "historical_slice",
  );
  const active = buildOpenClawActiveConvergenceQueue();
  const next = getNextActiveConvergenceQueueItem();
  return {
    trackerVersion: CONVERGENCE_SLICE_TRACKER_VERSION,
    historicalSliceCount: historical.length,
    completedHistoricalSliceCount: historical.filter(
      (definition) => definition.planningStatus === "completed",
    ).length,
    supersededHistoricalPlannedCount: historical.filter(
      (definition) => definition.planningStatus === "superseded",
    ).length,
    activeQueueItemCount: active.length,
    nextActiveQueueItem: next
      ? {
          activeQueueId: next.activeQueueId ?? next.sliceId,
          title: next.title,
          legacySliceId: next.legacySliceId,
        }
      : null,
    activeQueueTitles: active.map((definition) => definition.title),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length <= 500 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArrayValue(value: unknown, limit = 20): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.slice(0, 500))
        .slice(0, limit)
    : [];
}

function planningStatusValue(value: unknown): WorkQueueConvergenceSlicePlanningStatus | null {
  return value === "planned" ||
    value === "ready" ||
    value === "in_progress" ||
    value === "blocked" ||
    value === "needs_review" ||
    value === "completed" ||
    value === "superseded"
    ? value
    : null;
}

function trackerKindValue(value: unknown): "historical_slice" | "active_queue_item" | "unknown" {
  return value === "historical_slice" || value === "active_queue_item" ? value : "unknown";
}

export function projectConvergenceSliceTracker(
  truth: WorkItemTruth,
): WorkQueueConvergenceSliceProjection | null {
  if (truth.item.itemType !== CONVERGENCE_SLICE_WORK_ITEM_TYPE) {
    return null;
  }
  const metadata = asRecord(truth.item.metadata);
  if (
    metadata?.artifactKind !== "work_queue_convergence_slice_tracker_metadata" ||
    (metadata.trackerVersion !== CONVERGENCE_SLICE_TRACKER_VERSION &&
      metadata.trackerVersion !== LEGACY_CONVERGENCE_SLICE_TRACKER_VERSION)
  ) {
    return {
      artifactKind: "work_queue_convergence_slice_projection",
      trackerVersion: CONVERGENCE_SLICE_TRACKER_VERSION,
      trackerKind: "unknown",
      sliceId: truth.item.workItemId,
      title: truth.item.title,
      track: "openclaw-platform-convergence",
      wave: "unknown",
      planningStatus: "needs_review",
      priority: 999,
      legacySliceId: null,
      previousSliceId: null,
      historicalSliceId: null,
      activeQueueId: null,
      activeQueuePosition: null,
      supersededByActiveQueueId: null,
      dependsOnSliceIds: [],
      dependsOnActiveQueueIds: [],
      dependsOnHistoricalSliceIds: [],
      sourceDocRefs: [],
      artifactRefs: truth.artifacts.map((artifact) => artifact.uri).slice(0, 20),
      runtimeJobRefs: truth.runs
        .map((run) => run.runtimeJobId)
        .filter((runtimeJobId): runtimeJobId is string => Boolean(runtimeJobId)),
      blockerReasonCodes: ["convergence_slice_tracker_metadata_invalid"],
      nextAction: "Repair convergence slice tracker metadata.",
      ownerSystemArea: "execution-platform",
      createdAt: truth.item.createdAt.toISOString(),
      updatedAt: truth.item.updatedAt.toISOString(),
      planningStateSource: "work_item_metadata",
      runtimeState: {
        lifecycleState: truth.item.lifecycleState,
        runCount: truth.runs.length,
        runtimeJobIds: truth.runs
          .map((run) => run.runtimeJobId)
          .filter((runtimeJobId): runtimeJobId is string => Boolean(runtimeJobId)),
        lifecycleTruthSource: "work_queue_repository",
        planningStatusIsLifecycleState: false,
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutationAllowed: false,
    };
  }
  const runtimeJobRefs = truth.runs
    .map((run) => run.runtimeJobId)
    .filter((runtimeJobId): runtimeJobId is string => Boolean(runtimeJobId))
    .slice(0, 20);
  return {
    artifactKind: "work_queue_convergence_slice_projection",
    trackerVersion:
      metadata.trackerVersion === LEGACY_CONVERGENCE_SLICE_TRACKER_VERSION
        ? LEGACY_CONVERGENCE_SLICE_TRACKER_VERSION
        : CONVERGENCE_SLICE_TRACKER_VERSION,
    trackerKind: trackerKindValue(metadata.trackerKind),
    sliceId: stringValue(metadata.sliceId) ?? truth.item.workItemId,
    title: stringValue(metadata.title) ?? truth.item.title,
    track: stringValue(metadata.track) ?? "openclaw-platform-convergence",
    wave: stringValue(metadata.wave) ?? "unknown",
    planningStatus: planningStatusValue(metadata.planningStatus) ?? "needs_review",
    priority: numberValue(metadata.priority) ?? 999,
    legacySliceId: stringValue(metadata.legacySliceId),
    previousSliceId: stringValue(metadata.previousSliceId),
    historicalSliceId: stringValue(metadata.historicalSliceId),
    activeQueueId: stringValue(metadata.activeQueueId),
    activeQueuePosition: numberValue(metadata.activeQueuePosition),
    supersededByActiveQueueId: stringValue(metadata.supersededByActiveQueueId),
    dependsOnSliceIds: stringArrayValue(metadata.dependsOnSliceIds),
    dependsOnActiveQueueIds: stringArrayValue(metadata.dependsOnActiveQueueIds),
    dependsOnHistoricalSliceIds: stringArrayValue(metadata.dependsOnHistoricalSliceIds),
    sourceDocRefs: stringArrayValue(metadata.sourceDocRefs),
    artifactRefs: [
      ...stringArrayValue(metadata.artifactRefs),
      ...truth.artifacts.map((artifact) => artifact.uri),
    ].slice(0, 20),
    runtimeJobRefs,
    blockerReasonCodes: stringArrayValue(metadata.blockerReasonCodes),
    nextAction: stringValue(metadata.nextAction),
    ownerSystemArea: stringValue(metadata.ownerSystemArea) ?? "execution-platform",
    createdAt: truth.item.createdAt.toISOString(),
    updatedAt: truth.item.updatedAt.toISOString(),
    planningStateSource: "work_item_metadata",
    runtimeState: {
      lifecycleState: truth.item.lifecycleState,
      runCount: truth.runs.length,
      runtimeJobIds: runtimeJobRefs,
      lifecycleTruthSource: "work_queue_repository",
      planningStatusIsLifecycleState: false,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

export async function seedOpenClawConvergenceSliceTracker(input: {
  workQueue: ConvergenceSliceTrackerWorkQueue;
  actorId?: string | null;
}): Promise<{ created: number; existing: number; updated: number; sliceIds: string[] }> {
  const definitions = buildOpenClawConvergenceSliceDefinitions();
  let created = 0;
  let existing = 0;
  let updated = 0;
  for (const definition of definitions) {
    const workItemId = definition.sliceId;
    const already = await input.workQueue.readWorkItemTruth(workItemId);
    if (already) {
      existing += 1;
      await input.workQueue.updateWorkItemPlanningMetadata({
        workItemId,
        title: definition.title,
        description: `OpenClaw platform convergence tracker item for ${definition.title}.`,
        metadata: buildConvergenceSliceTrackerMetadata(definition) as unknown as JsonValue,
        actorId: input.actorId ?? "system:openclaw-convergence-tracker",
      });
      await input.workQueue.createWorkItemVersion({
        workItemId,
        title: definition.title,
        body: `Slice ${definition.priority}: ${definition.title}\n\nPlanning status: ${definition.planningStatus}\nNext action: ${definition.nextAction ?? "None"}`,
        artifactMetadata: {
          trackerVersion: CONVERGENCE_SLICE_TRACKER_VERSION,
          sourceDocRefs: definition.sourceDocRefs,
          rawPromptStored: false,
          rawResponseStored: false,
        },
        makeCurrent: true,
      });
      updated += 1;
    } else {
      await input.workQueue.createWorkItem({
        workItemId,
        itemType: CONVERGENCE_SLICE_WORK_ITEM_TYPE,
        title: definition.title,
        description: `OpenClaw platform convergence tracker item for ${definition.title}.`,
        metadata: buildConvergenceSliceTrackerMetadata(definition) as unknown as JsonValue,
        actorId: input.actorId ?? "system:openclaw-convergence-tracker",
      });
      await input.workQueue.createWorkItemVersion({
        workItemId,
        title: definition.title,
        body: `Slice ${definition.priority}: ${definition.title}\n\nPlanning status: ${definition.planningStatus}\nNext action: ${definition.nextAction ?? "None"}`,
        artifactMetadata: {
          trackerVersion: CONVERGENCE_SLICE_TRACKER_VERSION,
          sourceDocRefs: definition.sourceDocRefs,
          rawPromptStored: false,
          rawResponseStored: false,
        },
        makeCurrent: true,
      });
      for (const artifactRef of definition.artifactRefs) {
        await input.workQueue.attachArtifactReference({
          workItemId,
          artifactType: "openclaw_convergence.slice_artifact_ref",
          storageKind: "artifact_ref",
          uri: artifactRef,
          metadata: {
            trackerVersion: CONVERGENCE_SLICE_TRACKER_VERSION,
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
      }
      created += 1;
    }
  }
  for (const definition of definitions) {
    for (const dependsOnSliceId of definition.dependsOnSliceIds) {
      await input.workQueue.addDependency({
        workItemId: definition.sliceId,
        dependsOnWorkItemId: dependsOnSliceId,
        dependencyType: "convergence_slice_prerequisite",
        metadata: {
          trackerVersion: CONVERGENCE_SLICE_TRACKER_VERSION,
          planningDependency: true,
          runtimeLifecycleDependency: false,
        },
      });
    }
  }
  return {
    created,
    existing,
    updated,
    sliceIds: definitions.map((definition) => definition.sliceId),
  };
}
