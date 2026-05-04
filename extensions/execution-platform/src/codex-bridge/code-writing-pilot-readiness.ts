import { writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_DIAGNOSTIC_LIMITS, boundDiagnosticJson } from "../observability/redaction.ts";
import type {
  JsonValue,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import { CODEX_BRIDGE_FAKE_CONTROL_LOOP_PROOF_ARTIFACT_TYPE } from "./control-loop-proof.ts";
import { CODEX_BRIDGE_EMISSION_GUARDRAIL_ARTIFACT_TYPE } from "./emission-guardrails.ts";
import { CODEX_BRIDGE_FAKE_REDIRECT_APPLICATION_PROOF_ARTIFACT_TYPE } from "./redirect-application-proof.ts";
import { CODEX_BRIDGE_SKILL_AUDIT_LINT_ARTIFACT_TYPE } from "./skill-audit-lint.ts";
import { EXECUTION_PLATFORM_WORK_EPISODE_CLOSEOUT_ARTIFACT_TYPE } from "./work-episode-closeout.ts";

const CODE_WRITING_PILOT_READINESS_ARTIFACT_TYPE =
  "codex_bridge.code_writing_pilot_readiness_report";
const CODE_WRITING_PILOT_READINESS_EVENT_TYPE = "codex_bridge.code_writing_pilot_readiness_checked";
const DEFAULT_MAX_CODE_WRITING_READINESS_METADATA_BYTES = 64 * 1024;

export type CodeWritingPilotReadinessReport = {
  artifactKind: "codex_bridge_code_writing_pilot_readiness_report";
  runtimeJobId: string;
  checkedAt: string;
  allowedToPlanCodeWritingPilot: boolean;
  allowedToRunCodeWritingPilot: false;
  blockingReasons: string[];
  clearedBlockers: string[];
  remainingBlockers: string[];
  requiredNextOperatorAction:
    | "plan_operator_approved_code_writing_pilot"
    | "fix_redirect_or_skill_readiness_blockers"
    | "emit_or_fix_closeout"
    | "add_qualitative_review_boundary"
    | "add_realistic_trigger_tests";
  closeoutGatePresent: boolean;
  controlBridgePresent: boolean;
  fakeControlLoopProofPresent: boolean;
  fakeRedirectApplicationProofPresent: boolean;
  skillAuditLintReframed: boolean;
  qualitativeReviewBoundaryPresent: boolean;
  emissionOverclaimGuardrailsPresent: boolean;
  realisticTriggerTestsRepresented: boolean;
  noLiveAuthorityRemainsFalse: true;
  liveCodeWritingRequiresFutureExplicitApproval: true;
};

export type ProduceCodeWritingPilotReadinessInput = {
  runtimeJobId: string;
  checkedAt: string;
  realisticTriggerTestsRepresented?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function artifactPresent(artifacts: RuntimeJobArtifact[], artifactType: string): boolean {
  return artifacts.some((artifact) => artifact.artifactType === artifactType);
}

function metadataHasNoLiveAuthorityFalse(artifact: RuntimeJobArtifact): boolean {
  const metadata = artifact.metadata;
  const serialized = JSON.stringify(metadata).toLowerCase();
  if (
    serialized.includes('"codexcliinvoked":true') ||
    serialized.includes('"commandexecuted":true')
  ) {
    return false;
  }
  if (
    serialized.includes('"providercallmade":true') ||
    serialized.includes('"rebuildperformed":true') ||
    serialized.includes('"subagentstarted":true') ||
    serialized.includes('"workqueuelifecyclemutated":true')
  ) {
    return false;
  }
  return true;
}

function skillAuditLintReframed(artifacts: RuntimeJobArtifact[]): boolean {
  return artifacts.some(
    (artifact) =>
      artifact.artifactType === CODEX_BRIDGE_SKILL_AUDIT_LINT_ARTIFACT_TYPE &&
      isRecord(artifact.metadata) &&
      artifact.metadata.ruleCoverageOnly === true &&
      artifact.metadata.qualitativeJudgmentMade === false &&
      artifact.metadata.necessaryButNotSufficient === true &&
      artifact.metadata.requiresSeparateQualitativeReview === true &&
      artifact.metadata.deepCritiqueTermDeprecated === true,
  );
}

function qualitativeReviewBoundaryPresent(artifacts: RuntimeJobArtifact[]): boolean {
  return artifacts.some(
    (artifact) =>
      artifact.artifactType === CODEX_BRIDGE_SKILL_AUDIT_LINT_ARTIFACT_TYPE &&
      isRecord(artifact.metadata) &&
      isRecord(artifact.metadata.qualitativeReviewBoundary) &&
      artifact.metadata.qualitativeReviewBoundary.notDeterministic === true,
  );
}

function guardrailPresent(artifacts: RuntimeJobArtifact[]): boolean {
  return artifacts.some(
    (artifact) =>
      artifact.artifactType === CODEX_BRIDGE_EMISSION_GUARDRAIL_ARTIFACT_TYPE &&
      isRecord(artifact.metadata) &&
      artifact.metadata.stringPatternOnly === true &&
      artifact.metadata.noSemanticUnderstandingClaimed === true,
  );
}

function cleared(name: string, condition: boolean): string[] {
  return condition ? [name] : [];
}

export class CodexBridgeCodeWritingPilotReadinessRepository {
  private readonly maxArtifactMetadataBytes: number;

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    options: { maxArtifactMetadataBytes?: number } = {},
  ) {
    this.maxArtifactMetadataBytes =
      options.maxArtifactMetadataBytes ?? DEFAULT_MAX_CODE_WRITING_READINESS_METADATA_BYTES;
  }

  async produceReadinessReport(
    input: ProduceCodeWritingPilotReadinessInput,
  ): Promise<CodeWritingPilotReadinessReport> {
    const artifacts = await this.runtimeJobs.listArtifacts(input.runtimeJobId);
    const closeoutGatePresent = artifactPresent(
      artifacts,
      EXECUTION_PLATFORM_WORK_EPISODE_CLOSEOUT_ARTIFACT_TYPE,
    );
    const fakeControlLoopProofPresent = artifactPresent(
      artifacts,
      CODEX_BRIDGE_FAKE_CONTROL_LOOP_PROOF_ARTIFACT_TYPE,
    );
    const fakeRedirectApplicationProofPresent = artifactPresent(
      artifacts,
      CODEX_BRIDGE_FAKE_REDIRECT_APPLICATION_PROOF_ARTIFACT_TYPE,
    );
    const controlBridgePresent = artifacts.some((artifact) =>
      ["codex_bridge.control_command", "codex_bridge.control_command_history"].includes(
        artifact.artifactType,
      ),
    );
    const skillAuditReframed = skillAuditLintReframed(artifacts);
    const qualitativeBoundary = qualitativeReviewBoundaryPresent(artifacts);
    const guardrails = guardrailPresent(artifacts);
    const noLiveAuthorityRemainsFalse = artifacts.every(metadataHasNoLiveAuthorityFalse);
    const realisticTriggers = input.realisticTriggerTestsRepresented === true;
    const checks: Array<[string, boolean]> = [
      ["closeout_gate_present", closeoutGatePresent],
      ["control_bridge_present", controlBridgePresent],
      ["fake_control_loop_proof_present", fakeControlLoopProofPresent],
      ["fake_redirect_application_proof_present", fakeRedirectApplicationProofPresent],
      ["skill_audit_lint_reframed", skillAuditReframed],
      ["qualitative_review_boundary_present", qualitativeBoundary],
      ["emission_overclaim_guardrails_present", guardrails],
      ["realistic_trigger_tests_represented", realisticTriggers],
      ["no_live_authority_remains_false", noLiveAuthorityRemainsFalse],
    ];
    const blockingReasons = checks
      .filter(([, condition]) => !condition)
      .map(([name]) => `missing_or_failed:${name}`);
    const allowedToPlanCodeWritingPilot = blockingReasons.length === 0;
    return {
      artifactKind: "codex_bridge_code_writing_pilot_readiness_report",
      runtimeJobId: input.runtimeJobId,
      checkedAt: input.checkedAt,
      allowedToPlanCodeWritingPilot,
      allowedToRunCodeWritingPilot: false,
      blockingReasons,
      clearedBlockers: checks.flatMap(([name, condition]) => cleared(name, condition)),
      remainingBlockers: blockingReasons,
      requiredNextOperatorAction: allowedToPlanCodeWritingPilot
        ? "plan_operator_approved_code_writing_pilot"
        : !closeoutGatePresent
          ? "emit_or_fix_closeout"
          : !skillAuditReframed
            ? "fix_redirect_or_skill_readiness_blockers"
            : !qualitativeBoundary
              ? "add_qualitative_review_boundary"
              : !realisticTriggers
                ? "add_realistic_trigger_tests"
                : "fix_redirect_or_skill_readiness_blockers",
      closeoutGatePresent,
      controlBridgePresent,
      fakeControlLoopProofPresent,
      fakeRedirectApplicationProofPresent,
      skillAuditLintReframed: skillAuditReframed,
      qualitativeReviewBoundaryPresent: qualitativeBoundary,
      emissionOverclaimGuardrailsPresent: guardrails,
      realisticTriggerTestsRepresented: realisticTriggers,
      noLiveAuthorityRemainsFalse: true,
      liveCodeWritingRequiresFutureExplicitApproval: true,
    };
  }

  async persistReadinessReport(input: {
    report: CodeWritingPilotReadinessReport;
  }): Promise<RuntimeJobArtifact> {
    const bounded = boundDiagnosticJson(input.report as unknown as JsonValue, {
      ...DEFAULT_DIAGNOSTIC_LIMITS,
      maxObjectKeys: 180,
      maxArrayItems: 120,
      maxDepth: 8,
      maxStringLength: 1_000,
    });
    if (Buffer.byteLength(JSON.stringify(bounded), "utf8") > this.maxArtifactMetadataBytes) {
      throw new Error("code-writing pilot readiness metadata exceeds artifact bounds");
    }
    const artifact = await this.runtimeJobs.attachArtifact({
      jobId: input.report.runtimeJobId,
      artifactType: CODE_WRITING_PILOT_READINESS_ARTIFACT_TYPE,
      storageKind: "metadata",
      uri: `runtime-job://${input.report.runtimeJobId}/codex-bridge/code-writing-pilot-readiness`,
      contentType: "application/json",
      sizeBytes: Buffer.byteLength(JSON.stringify(bounded), "utf8"),
      metadata: bounded,
    });
    await this.runtimeJobs.recordEvent({
      jobId: input.report.runtimeJobId,
      eventType: CODE_WRITING_PILOT_READINESS_EVENT_TYPE,
      data: {
        artifactId: artifact.artifactId,
        allowedToPlanCodeWritingPilot: input.report.allowedToPlanCodeWritingPilot,
        allowedToRunCodeWritingPilot: false,
        blockingReasons: input.report.blockingReasons,
      },
    });
    return artifact;
  }
}

export async function writeCodeWritingPilotReadinessArtifact(input: {
  report: CodeWritingPilotReadinessReport;
  artifactPath?: string;
  cwd?: string;
}): Promise<{ artifactPath: string }> {
  const artifactPath =
    input.artifactPath ??
    path.resolve(
      input.cwd ?? process.cwd(),
      ".artifacts/execution-platform/code-writing-pilot-readiness-8r.json",
    );
  await writeFile(artifactPath, `${JSON.stringify(input.report, null, 2)}\n`);
  return { artifactPath };
}

export const CODEX_BRIDGE_CODE_WRITING_PILOT_READINESS_ARTIFACT_TYPE =
  CODE_WRITING_PILOT_READINESS_ARTIFACT_TYPE;
export const CODEX_BRIDGE_CODE_WRITING_PILOT_READINESS_EVENT_TYPE =
  CODE_WRITING_PILOT_READINESS_EVENT_TYPE;
