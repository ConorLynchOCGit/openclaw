import { DEFAULT_DIAGNOSTIC_LIMITS, boundDiagnosticJson } from "../observability/redaction.ts";
import type {
  JsonValue,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import type { CodexBridgeControlReasonCategory } from "./control-bridge.ts";

const EMISSION_GUARDRAIL_ARTIFACT_TYPE = "codex_bridge.emission_guardrail_report";
const EMISSION_GUARDRAIL_EVENT_TYPE = "codex_bridge.emission_guardrail_checked";
const DEFAULT_MAX_EMISSION_GUARDRAIL_METADATA_BYTES = 32 * 1024;

export type CodexBridgeEmissionGuardrailSeverity = "info" | "warning" | "blocking";

export type CodexBridgeEmissionGuardrailReasonCode =
  | "qualitative_judgment_mislabeled_deterministic"
  | "best_in_class_or_robustness_overclaim"
  | "rule_coverage_mislabeled_skill_quality"
  | "semantic_judgment_mislabeled_deterministic"
  | "process_completion_mislabeled_task_success"
  | "closeout_evidence_missing_or_minimized";

export type CodexBridgeEmissionGuardrailReport = {
  artifactKind: "codex_bridge_emission_guardrail_report";
  guardrailId: string;
  checkedAt: string;
  detected: boolean;
  reasonCodes: CodexBridgeEmissionGuardrailReasonCode[];
  severity: CodexBridgeEmissionGuardrailSeverity;
  recommendedControlReason: CodexBridgeControlReasonCategory | null;
  matchedPhrases: string[];
  boundedInputSummary: string;
  stringPatternOnly: true;
  noSemanticUnderstandingClaimed: true;
};

export type EvaluateCodexBridgeEmissionGuardrailsInput = {
  guardrailId?: string;
  checkedAt?: string;
  text?: string | null;
  metadata?: JsonValue | null;
};

type EmissionPattern = {
  pattern: RegExp;
  phrase: string;
  reasonCode: CodexBridgeEmissionGuardrailReasonCode;
  severity: CodexBridgeEmissionGuardrailSeverity;
  recommendedControlReason: CodexBridgeControlReasonCategory;
};

const EMISSION_PATTERNS: EmissionPattern[] = [
  {
    pattern: /\bdeterministic\s+deep\s+critique\b/iu,
    phrase: "deterministic deep critique",
    reasonCode: "qualitative_judgment_mislabeled_deterministic",
    severity: "blocking",
    recommendedControlReason: "deterministic_vs_model_judgment_violation",
  },
  {
    pattern: /\bdeterministic\s+quality\s+judg(e)?ment\b/iu,
    phrase: "deterministic quality judgment",
    reasonCode: "qualitative_judgment_mislabeled_deterministic",
    severity: "blocking",
    recommendedControlReason: "deterministic_vs_model_judgment_violation",
  },
  {
    pattern: /\bdeterministic\s+qualitative\s+(review|critique|judg(e)?ment)\b/iu,
    phrase: "deterministic qualitative review",
    reasonCode: "qualitative_judgment_mislabeled_deterministic",
    severity: "blocking",
    recommendedControlReason: "deterministic_vs_model_judgment_violation",
  },
  {
    pattern: /\bsemantic\s+judg(e)?ment\s+is\s+deterministic\b/iu,
    phrase: "semantic judgment is deterministic",
    reasonCode: "semantic_judgment_mislabeled_deterministic",
    severity: "blocking",
    recommendedControlReason: "deterministic_vs_model_judgment_violation",
  },
  {
    pattern: /\bbest[-\s]?in[-\s]?class\s+(proven|proof|verified)\b/iu,
    phrase: "best-in-class proven",
    reasonCode: "best_in_class_or_robustness_overclaim",
    severity: "warning",
    recommendedControlReason: "prohibited_semantic_drift",
  },
  {
    pattern: /\brobust(ness)?\s+(proven|proof|verified)\b/iu,
    phrase: "robustness proven",
    reasonCode: "best_in_class_or_robustness_overclaim",
    severity: "warning",
    recommendedControlReason: "prohibited_semantic_drift",
  },
  {
    pattern: /\brule\s+coverage\s+(proves|is|equals)\s+skill\s+quality\b/iu,
    phrase: "rule coverage proves skill quality",
    reasonCode: "rule_coverage_mislabeled_skill_quality",
    severity: "blocking",
    recommendedControlReason: "deterministic_vs_model_judgment_violation",
  },
  {
    pattern: /\bprocess\s+completion\s+(means|equals|is)\s+task\s+success\b/iu,
    phrase: "process completion means task success",
    reasonCode: "process_completion_mislabeled_task_success",
    severity: "blocking",
    recommendedControlReason: "prohibited_semantic_drift",
  },
  {
    pattern: /\b(closeout|outcome\s+pack)\s+(is\s+)?(optional|not\s+required)\b/iu,
    phrase: "closeout is optional",
    reasonCode: "closeout_evidence_missing_or_minimized",
    severity: "blocking",
    recommendedControlReason: "missing_closeout_evidence",
  },
];

function jsonByteLength(value: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function assertJsonByteLength(value: JsonValue, maxBytes: number, name: string): void {
  if (jsonByteLength(value) > maxBytes) {
    throw new Error(`${name} exceeds ${maxBytes} bytes`);
  }
}

function inputText(input: EvaluateCodexBridgeEmissionGuardrailsInput): string {
  const metadata =
    input.metadata === undefined || input.metadata === null ? "" : JSON.stringify(input.metadata);
  return [input.text ?? "", metadata].join(" ").replace(/\s+/gu, " ").trim();
}

function boundedSummary(text: string): string {
  if (!text) {
    return "No input text supplied.";
  }
  return text.length <= 500 ? text : `${text.slice(0, 499).trimEnd()}.`;
}

function maxSeverity(
  left: CodexBridgeEmissionGuardrailSeverity,
  right: CodexBridgeEmissionGuardrailSeverity,
): CodexBridgeEmissionGuardrailSeverity {
  const rank: Record<CodexBridgeEmissionGuardrailSeverity, number> = {
    info: 0,
    warning: 1,
    blocking: 2,
  };
  return rank[right] > rank[left] ? right : left;
}

function recommendedReason(patterns: EmissionPattern[]): CodexBridgeControlReasonCategory | null {
  const blocking = patterns.find((pattern) => pattern.severity === "blocking");
  return (blocking ?? patterns[0])?.recommendedControlReason ?? null;
}

export function evaluateCodexBridgeEmissionGuardrails(
  input: EvaluateCodexBridgeEmissionGuardrailsInput,
): CodexBridgeEmissionGuardrailReport {
  const text = inputText(input);
  const matchedPatterns = EMISSION_PATTERNS.filter((candidate) => candidate.pattern.test(text));
  const severity = matchedPatterns.reduce<CodexBridgeEmissionGuardrailSeverity>(
    (current, candidate) => maxSeverity(current, candidate.severity),
    "info",
  );
  return {
    artifactKind: "codex_bridge_emission_guardrail_report",
    guardrailId: input.guardrailId ?? "emission-guardrail",
    checkedAt: input.checkedAt ?? new Date().toISOString(),
    detected: matchedPatterns.length > 0,
    reasonCodes: [...new Set(matchedPatterns.map((pattern) => pattern.reasonCode))],
    severity,
    recommendedControlReason: recommendedReason(matchedPatterns),
    matchedPhrases: [...new Set(matchedPatterns.map((pattern) => pattern.phrase))],
    boundedInputSummary: boundedSummary(text),
    stringPatternOnly: true,
    noSemanticUnderstandingClaimed: true,
  };
}

export class CodexBridgeEmissionGuardrailRepository {
  private readonly maxArtifactMetadataBytes: number;

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    options: { maxArtifactMetadataBytes?: number } = {},
  ) {
    this.maxArtifactMetadataBytes =
      options.maxArtifactMetadataBytes ?? DEFAULT_MAX_EMISSION_GUARDRAIL_METADATA_BYTES;
  }

  async persistEmissionGuardrailReport(input: {
    runtimeJobId: string;
    report: CodexBridgeEmissionGuardrailReport;
  }): Promise<RuntimeJobArtifact> {
    const bounded = boundDiagnosticJson(input.report as unknown as JsonValue, {
      ...DEFAULT_DIAGNOSTIC_LIMITS,
      maxObjectKeys: 120,
      maxArrayItems: 80,
      maxDepth: 8,
      maxStringLength: 1_000,
    });
    assertJsonByteLength(bounded, this.maxArtifactMetadataBytes, "emission guardrail metadata");
    const artifact = await this.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: EMISSION_GUARDRAIL_ARTIFACT_TYPE,
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/codex-bridge/emission-guardrail/${input.report.guardrailId}`,
      contentType: "application/json",
      sizeBytes: jsonByteLength(bounded),
      metadata: bounded,
    });
    await this.runtimeJobs.recordEvent({
      jobId: input.runtimeJobId,
      eventType: EMISSION_GUARDRAIL_EVENT_TYPE,
      data: {
        artifactId: artifact.artifactId,
        guardrailId: input.report.guardrailId,
        detected: input.report.detected,
        severity: input.report.severity,
        reasonCodes: input.report.reasonCodes,
        stringPatternOnly: true,
      },
    });
    return artifact;
  }
}

export const CODEX_BRIDGE_EMISSION_GUARDRAIL_ARTIFACT_TYPE = EMISSION_GUARDRAIL_ARTIFACT_TYPE;
export const CODEX_BRIDGE_EMISSION_GUARDRAIL_EVENT_TYPE = EMISSION_GUARDRAIL_EVENT_TYPE;
