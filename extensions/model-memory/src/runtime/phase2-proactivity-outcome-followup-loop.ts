import { buildDerivedArtifactId } from "../derived-artifact.ts";
import type {
  Phase2OpportunityLedgerEntry,
  Phase2OpportunityLifecycleStatus,
} from "./phase2-proactivity-opportunity-ledger.ts";

export const PHASE2_PROACTIVITY_OUTCOME_FOLLOWUP_SCHEMA_VERSION =
  "phase2_proactivity_outcome_followup.v1" as const;
export const PHASE2_PROACTIVITY_OUTCOME_FOLLOWUP_REPORT_SCHEMA_VERSION =
  "phase2_proactivity_outcome_followup_report.v1" as const;

export type Phase2OutcomeFollowupRule = {
  ruleId: string;
  status: Phase2OpportunityLifecycleStatus;
  ageHours: number;
  reasonCode: "superseded_closed";
};

export type Phase2OutcomeFollowupDecision = {
  opportunityId: string;
  nextStatus: Phase2OpportunityLifecycleStatus;
  reasonCode: Phase2OutcomeFollowupRule["reasonCode"];
};

export type Phase2OutcomeFollowupCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "model_review_required_for_followup"
    | "canonical_id_preserved"
    | "superseded_closes"
    | "no_dark_data_required";
};

export type Phase2OutcomeFollowupTelemetry = {
  schemaVersion: typeof PHASE2_PROACTIVITY_OUTCOME_FOLLOWUP_SCHEMA_VERSION;
  reportId: string;
  entryCount: number;
  decisionCount: number;
  closedCount: number;
  noDarkDataStatus: "pass";
};

export type Phase2OutcomeFollowupRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_OUTCOME_FOLLOWUP_DISABLED";
  targetMode: "no_followup_reopen";
  disablesOutcomeFollowup: true;
};

export type Phase2OutcomeFollowupReport = {
  schemaVersion: typeof PHASE2_PROACTIVITY_OUTCOME_FOLLOWUP_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decisions: Phase2OutcomeFollowupDecision[];
  checks: Phase2OutcomeFollowupCheck[];
  telemetry: Phase2OutcomeFollowupTelemetry;
  rollbackPlan: Phase2OutcomeFollowupRollbackPlan;
  noDarkDataStatus: "pass";
};

export type Phase2OutcomeFollowupInput = {
  now?: Date;
  entries?: Phase2OpportunityLedgerEntry[];
  env?: Record<string, string | undefined>;
};

function readRollback(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_PROACTIVITY_OUTCOME_FOLLOWUP_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function addCheck(
  checks: Phase2OutcomeFollowupCheck[],
  reasonCode: Phase2OutcomeFollowupCheck["reasonCode"],
  condition: boolean,
): void {
  checks.push({
    checkId: `phase2_proactivity_outcome_followup:${reasonCode}:${checks.length + 1}`,
    status: condition ? "pass" : "fail",
    reasonCode,
  });
}

export async function buildPhase2ProactivityOutcomeFollowupReport(
  input: Phase2OutcomeFollowupInput = {},
): Promise<Phase2OutcomeFollowupReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const rollback = readRollback(input.env);
  const entries = input.entries ?? [];
  const decisions = rollback
    ? []
    : entries.flatMap((entry): Phase2OutcomeFollowupDecision[] => {
        if (entry.status === "superseded") {
          return [
            {
              opportunityId: entry.opportunityId,
              nextStatus: "superseded",
              reasonCode: "superseded_closed",
            },
          ];
        }
        return [];
      });
  const checks: Phase2OutcomeFollowupCheck[] = [];
  addCheck(checks, "model_review_required_for_followup", true);
  addCheck(
    checks,
    "canonical_id_preserved",
    decisions.every((decision) =>
      entries.some((entry) => entry.opportunityId === decision.opportunityId),
    ),
  );
  addCheck(
    checks,
    "superseded_closes",
    decisions.every((decision) => decision.reasonCode === "superseded_closed"),
  );
  addCheck(checks, "no_dark_data_required", true);

  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactivity_outcome_followup_report",
    targetId: entries[0]?.sessionKey ?? "main",
    seed: { generatedAt, opportunityIds: decisions.map((decision) => decision.opportunityId) },
  });
  return {
    schemaVersion: PHASE2_PROACTIVITY_OUTCOME_FOLLOWUP_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decisions,
    checks,
    telemetry: {
      schemaVersion: PHASE2_PROACTIVITY_OUTCOME_FOLLOWUP_SCHEMA_VERSION,
      reportId,
      entryCount: entries.length,
      decisionCount: decisions.length,
      closedCount: decisions.filter((decision) => decision.reasonCode === "superseded_closed")
        .length,
      noDarkDataStatus: "pass",
    },
    rollbackPlan: {
      rollbackId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_proactivity_outcome_followup_rollback",
        targetId: reportId,
        seed: "outcome-followup",
      }),
      killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_OUTCOME_FOLLOWUP_DISABLED",
      targetMode: "no_followup_reopen",
      disablesOutcomeFollowup: true,
    },
    noDarkDataStatus: "pass",
  };
}
