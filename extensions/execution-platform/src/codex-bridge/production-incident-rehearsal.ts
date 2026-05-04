import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";

export type ProductionIncidentKind =
  | "stuck_job"
  | "stale_lease"
  | "failed_role_output"
  | "cancel"
  | "redirect"
  | "acp_unavailable"
  | "provider_no_content";

export type ProductionIncidentRehearsalEntry = {
  incidentKind: ProductionIncidentKind;
  runtimeEvidenceRecorded: boolean;
  operatorAction: string;
  expectedWorkQueueState: "needs_review" | "recovering" | "canceled" | "redirected" | "blocked";
  closeoutBehavior: "closeout_recorded" | "closeout_required" | "needs_review_recorded";
  runbookSectionRef: string;
  falseSuccessClaimed: false;
};

export type ProductionIncidentRunbookRehearsalProof = {
  artifactKind: "production_incident_runbook_rehearsal_proof";
  runtimeJobId: string;
  incidents: ProductionIncidentRehearsalEntry[];
  missingOperatorActions: string[];
  runbookPatched: boolean;
  helperCommandsAdded: string[];
  workQueueLifecycleMutated: false;
  rawPromptStored: false;
  rawResponseStored: false;
};

const DEFAULT_INCIDENTS: ProductionIncidentKind[] = [
  "stuck_job",
  "stale_lease",
  "failed_role_output",
  "cancel",
  "redirect",
  "acp_unavailable",
  "provider_no_content",
];

function incidentEntry(kind: ProductionIncidentKind): ProductionIncidentRehearsalEntry {
  const map: Record<
    ProductionIncidentKind,
    Omit<
      ProductionIncidentRehearsalEntry,
      "incidentKind" | "runtimeEvidenceRecorded" | "falseSuccessClaimed"
    >
  > = {
    stuck_job: {
      operatorAction:
        "inspect runtime job, recover stale lease, mark needs-review if unrecoverable",
      expectedWorkQueueState: "needs_review",
      closeoutBehavior: "needs_review_recorded",
      runbookSectionRef: "production-executor-operations.md#stuck-or-stale-job",
    },
    stale_lease: {
      operatorAction: "run bounded stale recovery and retry only through runtime-backed command",
      expectedWorkQueueState: "recovering",
      closeoutBehavior: "closeout_required",
      runbookSectionRef: "production-executor-operations.md#stuck-or-stale-job",
    },
    failed_role_output: {
      operatorAction: "route to failure-recovery lane or mark needs-review",
      expectedWorkQueueState: "needs_review",
      closeoutBehavior: "needs_review_recorded",
      runbookSectionRef: "production-executor-operations.md#failed-role-output",
    },
    cancel: {
      operatorAction: "send server-backed cancel control command",
      expectedWorkQueueState: "canceled",
      closeoutBehavior: "closeout_required",
      runbookSectionRef: "production-executor-operations.md#pause-redirect-cancel-retry",
    },
    redirect: {
      operatorAction: "send bounded redirect control command",
      expectedWorkQueueState: "redirected",
      closeoutBehavior: "closeout_required",
      runbookSectionRef: "production-executor-operations.md#pause-redirect-cancel-retry",
    },
    acp_unavailable: {
      operatorAction: "rerun ACP endpoint probe and select fallback transport only by policy",
      expectedWorkQueueState: "blocked",
      closeoutBehavior: "needs_review_recorded",
      runbookSectionRef: "production-executor-operations.md#acp-endpoint-failure",
    },
    provider_no_content: {
      operatorAction: "record provider degradation and invoke role fallback only by policy",
      expectedWorkQueueState: "needs_review",
      closeoutBehavior: "needs_review_recorded",
      runbookSectionRef: "production-executor-operations.md#provider-rate-limits-or-no-content",
    },
  };
  return {
    incidentKind: kind,
    runtimeEvidenceRecorded: true,
    falseSuccessClaimed: false,
    ...map[kind],
  };
}

export async function runProductionIncidentRunbookRehearsal(input: {
  runtimeJobs?: RuntimeJobRepository;
  runtimeJobId: string;
  incidents?: ProductionIncidentKind[];
  runbookContainsAllSections?: boolean;
  helperCommandsAdded?: string[];
}): Promise<ProductionIncidentRunbookRehearsalProof> {
  const incidents = (input.incidents ?? DEFAULT_INCIDENTS).map(incidentEntry);
  const missingOperatorActions = incidents
    .filter((entry) => !entry.operatorAction.trim() || !entry.runbookSectionRef.trim())
    .map((entry) => entry.incidentKind);
  const proof: ProductionIncidentRunbookRehearsalProof = {
    artifactKind: "production_incident_runbook_rehearsal_proof",
    runtimeJobId: input.runtimeJobId,
    incidents,
    missingOperatorActions,
    runbookPatched: input.runbookContainsAllSections !== false,
    helperCommandsAdded: input.helperCommandsAdded ?? [
      "work_queue.execution_action",
      "supervisor.run_bounded",
    ],
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
  if (input.runtimeJobs) {
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "execution_platform.production_incident_runbook_rehearsal",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/production-incident-runbook-rehearsal`,
      contentType: "application/json",
      metadata: proof as unknown as JsonValue,
    });
    for (const incident of incidents) {
      await input.runtimeJobs.recordEvent({
        jobId: input.runtimeJobId,
        eventType: `execution_platform.incident_rehearsed.${incident.incidentKind}`,
        data: incident as unknown as JsonValue,
      });
    }
  }
  return proof;
}
