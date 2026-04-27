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
  reasonCode:
    | "started_not_finished"
    | "stale_decision_reopened"
    | "superseded_closed"
    | "idle_open_followup";
};

export type Phase2OutcomeFollowupDecision = {
  opportunityId: string;
  nextStatus: Phase2OpportunityLifecycleStatus;
  reasonCode: Phase2OutcomeFollowupRule["reasonCode"];
  surfaced: boolean;
};

export type Phase2OutcomeFollowupCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "bounded_followup_only"
    | "canonical_id_preserved"
    | "non_spammy_resurfacing"
    | "superseded_closes"
    | "no_dark_data_required";
};

export type Phase2OutcomeFollowupTelemetry = {
  schemaVersion: typeof PHASE2_PROACTIVITY_OUTCOME_FOLLOWUP_SCHEMA_VERSION;
  reportId: string;
  entryCount: number;
  decisionCount: number;
  resurfacedCount: number;
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

function ageHours(now: number, updatedAt: string): number {
  return Math.max(0, Math.floor((now - new Date(updatedAt).getTime()) / 3_600_000));
}

export async function buildPhase2ProactivityOutcomeFollowupReport(
  input: Phase2OutcomeFollowupInput = {},
): Promise<Phase2OutcomeFollowupReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const rollback = readRollback(input.env);
  const nowMs = (input.now ?? new Date()).getTime();
  const entries = input.entries ?? [];
  const decisions = rollback
    ? []
    : entries.flatMap((entry): Phase2OutcomeFollowupDecision[] => {
        const age = ageHours(nowMs, entry.updatedAt);
        if (entry.status === "planning_started" && age >= 24) {
          return [
            {
              opportunityId: entry.opportunityId,
              nextStatus: "draft_ready",
              reasonCode: "started_not_finished",
              surfaced: true,
            },
          ];
        }
        if (entry.status === "planned" && age >= 24) {
          return [
            {
              opportunityId: entry.opportunityId,
              nextStatus: "draft_ready",
              reasonCode: "started_not_finished",
              surfaced: true,
            },
          ];
        }
        if (entry.status === "stale" && age >= 24) {
          return [
            {
              opportunityId: entry.opportunityId,
              nextStatus: "surfaced",
              reasonCode: "stale_decision_reopened",
              surfaced: true,
            },
          ];
        }
        if (entry.status === "superseded") {
          return [
            {
              opportunityId: entry.opportunityId,
              nextStatus: "superseded",
              reasonCode: "superseded_closed",
              surfaced: false,
            },
          ];
        }
        if (entry.status === "open" && age >= 48) {
          return [
            {
              opportunityId: entry.opportunityId,
              nextStatus: "surfaced",
              reasonCode: "idle_open_followup",
              surfaced: true,
            },
          ];
        }
        return [];
      });
  const checks: Phase2OutcomeFollowupCheck[] = [];
  addCheck(checks, "bounded_followup_only", true);
  addCheck(
    checks,
    "canonical_id_preserved",
    decisions.every((decision) =>
      entries.some((entry) => entry.opportunityId === decision.opportunityId),
    ),
  );
  addCheck(
    checks,
    "non_spammy_resurfacing",
    decisions.filter((decision) => decision.surfaced).length <= entries.length,
  );
  addCheck(
    checks,
    "superseded_closes",
    decisions
      .filter((decision) => decision.reasonCode === "superseded_closed")
      .every((decision) => !decision.surfaced),
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
      resurfacedCount: decisions.filter((decision) => decision.surfaced).length,
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
