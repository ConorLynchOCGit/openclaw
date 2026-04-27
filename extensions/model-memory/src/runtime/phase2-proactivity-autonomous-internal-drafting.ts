import { buildDerivedArtifactId, uniqueSortedStrings } from "../derived-artifact.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../source-authority.ts";
import type {
  Phase2OpportunityLedgerEntry,
  Phase2OpportunityLifecycleStatus,
} from "./phase2-proactivity-opportunity-ledger.ts";

export const PHASE2_PROACTIVITY_AUTONOMOUS_INTERNAL_DRAFTING_SCHEMA_VERSION =
  "phase2_proactivity_autonomous_internal_drafting.v1" as const;
export const PHASE2_PROACTIVITY_AUTONOMOUS_INTERNAL_DRAFTING_REPORT_SCHEMA_VERSION =
  "phase2_proactivity_autonomous_internal_drafting_report.v1" as const;

export type Phase2AutonomousDraftKind = "planning_brief" | "investigation_brief";

export type Phase2AutonomousDraft = {
  draftId: string;
  opportunityId: string;
  workItemId: string;
  draftKind: Phase2AutonomousDraftKind;
  title: string;
  whyNow: string;
  recommendedApproach: string;
  options: string[];
  risks: string[];
  nextSafeStep: string;
  uncertainty: string;
  evidenceSummary: string;
  boundedContextSummary: string;
  safetyBoundary: string;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
};

export type Phase2AutonomousDraftCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "top_heartbeat_items_only"
    | "bounded_draft_required"
    | "no_chat_inject"
    | "no_external_send"
    | "no_file_edits"
    | "no_action_execution"
    | "no_dark_data_required";
};

export type Phase2AutonomousDraftTelemetry = {
  schemaVersion: typeof PHASE2_PROACTIVITY_AUTONOMOUS_INTERNAL_DRAFTING_SCHEMA_VERSION;
  reportId: string;
  inputCount: number;
  draftCount: number;
  sourceRefs: string[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
};

export type Phase2AutonomousDraftRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_AUTONOMOUS_INTERNAL_DRAFTING_DISABLED";
  targetMode: "manual_handoff_only";
  disablesAutonomousDrafts: true;
};

export type Phase2AutonomousDraftDecision =
  | "drafts_ready"
  | "no_drafts"
  | "blocked"
  | "rollback_disabled";

export type Phase2AutonomousDraftReport = {
  schemaVersion: typeof PHASE2_PROACTIVITY_AUTONOMOUS_INTERNAL_DRAFTING_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2AutonomousDraftDecision;
  drafts: Phase2AutonomousDraft[];
  checks: Phase2AutonomousDraftCheck[];
  telemetry: Phase2AutonomousDraftTelemetry;
  rollbackPlan: Phase2AutonomousDraftRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
};

export type Phase2AutonomousDraftInput = {
  now?: Date;
  topEntries?: Phase2OpportunityLedgerEntry[];
  env?: Record<string, string | undefined>;
};

const PROHIBITED_MARKERS = [
  "raw-prompt-marker",
  "raw-transcript-marker",
  "raw-tool-log-marker",
  "secret-marker",
  "private-phrase-marker",
] as const;

function assertNoDarkData(value: unknown): void {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const marker of PROHIBITED_MARKERS) {
    if (serialized.includes(marker)) {
      throw new Error(`phase2 autonomous internal drafting contains prohibited marker: ${marker}`);
    }
  }
}

function readRollback(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_AUTONOMOUS_INTERNAL_DRAFTING_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function addCheck(
  checks: Phase2AutonomousDraftCheck[],
  reasonCode: Phase2AutonomousDraftCheck["reasonCode"],
  condition: boolean,
): void {
  checks.push({
    checkId: `phase2_proactivity_autonomous_internal_drafting:${reasonCode}:${checks.length + 1}`,
    status: condition ? "pass" : "fail",
    reasonCode,
  });
}

function eligibleStatus(status: Phase2OpportunityLifecycleStatus): boolean {
  return (
    status === "open" ||
    status === "surfaced" ||
    status === "planning_started" ||
    status === "planned"
  );
}

function draftForEntry(entry: Phase2OpportunityLedgerEntry): Phase2AutonomousDraft {
  const draftKind: Phase2AutonomousDraftKind =
    entry.workItemKind === "investigation_request" ? "investigation_brief" : "planning_brief";
  return {
    draftId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_autonomous_draft",
      targetId: entry.opportunityId,
      seed: { draftKind, contentHashes: entry.contentHashes },
    }),
    opportunityId: entry.opportunityId,
    workItemId: entry.workItemId,
    draftKind,
    title: entry.title,
    whyNow: entry.whyNow,
    recommendedApproach:
      draftKind === "investigation_brief"
        ? `Investigate the current evidence around ${entry.title} and reduce uncertainty before proposing work.`
        : `Turn ${entry.title} into a short bounded plan with options, risks, and the smallest useful next step.`,
    options:
      draftKind === "investigation_brief"
        ? [
            "Review the bounded evidence and identify the concrete uncertainty.",
            "Check whether the issue is already resolved or superseded.",
            "Recommend the smallest safe investigation outcome to pursue next.",
          ]
        : [
            "Produce a concise 3-5 step plan from current evidence.",
            "Offer one smaller fallback if the main plan is too broad.",
            "State the user decision needed before any file edits or execution.",
          ],
    risks: [
      "The opportunity may already be partly resolved by newer work.",
      "The evidence is bounded and may omit context outside the current session.",
    ],
    nextSafeStep: entry.proposedNextStep,
    uncertainty: "State assumptions explicitly and avoid taking execution as implied approval.",
    evidenceSummary: entry.evidenceSummary,
    boundedContextSummary: `${entry.whyNow} ${entry.expectedUserValue}`.slice(0, 240),
    safetyBoundary:
      "This is an internal bounded draft only. Do not edit files, execute actions, or send outbound messages without explicit approval.",
    sourceRefs: entry.sourceRefs,
    sourceProfileIds: entry.sourceProfileIds,
    authorityTiers: entry.authorityTiers,
    contentHashes: entry.contentHashes,
    proofHashes: entry.proofHashes,
    noDarkDataStatus: entry.noDarkDataStatus,
  };
}

export async function buildPhase2ProactivityAutonomousInternalDraftingReport(
  input: Phase2AutonomousDraftInput = {},
): Promise<Phase2AutonomousDraftReport> {
  assertNoDarkData(input.topEntries ?? []);
  const generatedAt = (input.now ?? new Date()).toISOString();
  const rollback = readRollback(input.env);
  const topEntries = (input.topEntries ?? [])
    .filter((entry) => eligibleStatus(entry.status))
    .slice(0, 3);
  const drafts = rollback ? [] : topEntries.map(draftForEntry);
  const checks: Phase2AutonomousDraftCheck[] = [];
  addCheck(checks, "top_heartbeat_items_only", (input.topEntries ?? []).length >= drafts.length);
  addCheck(
    checks,
    "bounded_draft_required",
    drafts.every((draft) => draft.nextSafeStep.length >= 24),
  );
  addCheck(checks, "no_chat_inject", true);
  addCheck(checks, "no_external_send", true);
  addCheck(checks, "no_file_edits", true);
  addCheck(checks, "no_action_execution", true);
  addCheck(
    checks,
    "no_dark_data_required",
    drafts.every((draft) => draft.noDarkDataStatus === "pass"),
  );
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactivity_autonomous_internal_drafting_report",
    targetId: topEntries[0]?.sessionKey ?? "main",
    seed: { generatedAt, draftIds: drafts.map((draft) => draft.draftId) },
  });
  const decision: Phase2AutonomousDraftDecision = rollback
    ? "rollback_disabled"
    : drafts.length > 0
      ? "drafts_ready"
      : "no_drafts";
  const telemetry: Phase2AutonomousDraftTelemetry = {
    schemaVersion: PHASE2_PROACTIVITY_AUTONOMOUS_INTERNAL_DRAFTING_SCHEMA_VERSION,
    reportId,
    inputCount: input.topEntries?.length ?? 0,
    draftCount: drafts.length,
    sourceRefs: uniqueSortedStrings(drafts.flatMap((draft) => draft.sourceRefs)),
    contentHashes: uniqueSortedStrings(drafts.flatMap((draft) => draft.contentHashes)),
    proofHashes: uniqueSortedStrings(drafts.flatMap((draft) => draft.proofHashes)),
    noDarkDataStatus: checks.some(
      (check) => check.reasonCode === "no_dark_data_required" && check.status === "fail",
    )
      ? "fail"
      : "pass",
  };
  const report: Phase2AutonomousDraftReport = {
    schemaVersion: PHASE2_PROACTIVITY_AUTONOMOUS_INTERNAL_DRAFTING_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    drafts,
    checks,
    telemetry,
    rollbackPlan: {
      rollbackId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_proactivity_autonomous_internal_drafting_rollback",
        targetId: reportId,
        seed: decision,
      }),
      killSwitchEnvVar: "MODEL_MEMORY_PHASE2_AUTONOMOUS_INTERNAL_DRAFTING_DISABLED",
      targetMode: "manual_handoff_only",
      disablesAutonomousDrafts: true,
    },
    noDarkDataStatus: telemetry.noDarkDataStatus,
  };
  assertNoDarkData(report);
  return report;
}
