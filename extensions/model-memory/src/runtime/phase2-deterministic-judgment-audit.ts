import { sha256JsonValue } from "../hashing.ts";

export const DETERMINISTIC_JUDGMENT_AUDIT_SCHEMA_VERSION =
  "deterministic_judgment_audit.v1" as const;

export type DeterministicJudgmentAuditFile = {
  path: string;
  text: string;
};

export type DeterministicJudgmentAuditFindingClass =
  | "semantic_judgment_review"
  | "allowed_guardrail"
  | "ambiguous_review";

export type DeterministicJudgmentAuditFinding = {
  filePath: string;
  lineNumber: number;
  scope: "runtime" | "test_proof_or_script";
  findingClass: DeterministicJudgmentAuditFindingClass;
  matchedPattern: string;
  lineExcerpt: string;
  reason: string;
  classification: DeterministicJudgmentHotspotClassification;
  confidence: "low" | "medium" | "high";
  recommendedAction: DeterministicJudgmentRecommendedAction;
  eliminationRationale: string;
};

export type DeterministicJudgmentHotspotClassification =
  | "runtime_elimination_debt"
  | "test_enshrinement_debt"
  | "valid_guardrail"
  | "acceptable_structural_retrieval_logic"
  | "fixture_reference_noise";

export type DeterministicJudgmentRecommendedAction =
  | "keep"
  | "document_guardrail"
  | "move_to_model_review"
  | "replace_with_structural_filter"
  | "remove"
  | "remove_or_rewrite_test"
  | "manual_review";

export type DeterministicJudgmentClassificationCounts = Record<
  DeterministicJudgmentHotspotClassification,
  number
>;

export type DeterministicJudgmentAuditReport = {
  schemaVersion: typeof DETERMINISTIC_JUDGMENT_AUDIT_SCHEMA_VERSION;
  generatedAt: string;
  fileCount: number;
  findingCount: number;
  semanticJudgmentReviewCount: number;
  allowedGuardrailCount: number;
  ambiguousReviewCount: number;
  classificationCounts: DeterministicJudgmentClassificationCounts;
  runtimeFindingCount: number;
  runtimeClassificationCounts: DeterministicJudgmentClassificationCounts;
  nonRuntimeFindingCount: number;
  runtimeEliminationDebtCount: number;
  testEnshrinementDebtCount: number;
  fixtureReferenceNoiseCount: number;
  aggressiveEliminationRequiredCount: number;
  topRuntimeDebtHotspots: Array<{
    filePath: string;
    findingCount: number;
    debtCount: number;
    topClassifications: Array<{
      classification: DeterministicJudgmentHotspotClassification;
      count: number;
    }>;
  }>;
  topTestDebtHotspots: Array<{
    filePath: string;
    findingCount: number;
    debtCount: number;
    topClassifications: Array<{
      classification: DeterministicJudgmentHotspotClassification;
      count: number;
    }>;
  }>;
  priorityHotspots: Array<{
    filePath: string;
    findingCount: number;
    aggressiveEliminationRequiredCount: number;
    topClassifications: Array<{
      classification: DeterministicJudgmentHotspotClassification;
      count: number;
    }>;
  }>;
  reportHash: string;
  findings: DeterministicJudgmentAuditFinding[];
  interpretation: {
    claim: "aggressive_elimination_plan_not_proof_of_absence";
    deterministicGuardrailsRemainAllowed: string[];
    reviewTarget: string;
    defaultPosture: string;
  };
};

const SEMANTIC_JUDGMENT_PATTERNS: Array<{ pattern: RegExp; label: string; reason: string }> = [
  {
    pattern: /\bclassif(?:y|ies|ication)/iu,
    label: "classification",
    reason: "Classification can be semantic judgment when it decides meaning or surfacing.",
  },
  {
    pattern: /\binfer(?:s|red|ence)?/iu,
    label: "inference",
    reason: "Inference can be semantic judgment when it decides what content means.",
  },
  {
    pattern: /\bsemantic/iu,
    label: "semantic",
    reason: "Semantic logic needs review unless it is clearly model-owned or quarantined.",
  },
  {
    pattern: /\bmeaning/iu,
    label: "meaning",
    reason: "Meaning extraction should be model-owned unless this is a structural guardrail.",
  },
  {
    pattern: /\bintent/iu,
    label: "intent",
    reason: "Intent assignment is subjective unless bounded by explicit typed input.",
  },
  {
    pattern: /\bshouldSurface\w*\b|\bsurfacing\b|\bsurfaced\b|\bsurfaceCandidate\b/iu,
    label: "surfacing",
    reason: "Surfacing decisions are product judgment unless they only enforce safety policy.",
  },
  {
    pattern: /\brank(?:s|ed|ing)?\b|\bscore(?:s|d|ing)?\b/iu,
    label: "rank_or_score",
    reason: "Ranking/scoring can become hidden judgment when it decides usefulness.",
  },
  {
    pattern: /\bkeyword(?:s)?|\btopic(?:s)?|\bheuristic(?:s)?/iu,
    label: "keyword_topic_heuristic",
    reason: "Keyword/topic heuristics must not be runtime authority for meaning or usefulness.",
  },
  {
    pattern: /\buseful(?:ness)?|\bhigh[-_ ]?impact|\bworth(?:y)?/iu,
    label: "usefulness",
    reason: "Usefulness and impact are subjective product judgments.",
  },
];

const GUARDRAIL_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bhash(?:es|ed|ing)?|\bsha256/iu, label: "hash_or_id" },
  { pattern: /\bid(?:s)?|\bidentifier(?:s)?/iu, label: "identity" },
  { pattern: /\bschema|\bzod|\bvalidate(?:s|d|ion)?/iu, label: "schema_validation" },
  { pattern: /\bredact(?:s|ed|ion)?|\bsecret(?:s)?/iu, label: "redaction" },
  { pattern: /\bcap(?:s|ped)?|\blimit(?:s|ed)?|\bmax(?:imum)?/iu, label: "caps_limits" },
  { pattern: /\bref(?:s|erence)?|\bprovenance|\bsource/iu, label: "refs_provenance" },
  { pattern: /\bcooldown|\bbudget|\bquota/iu, label: "cooldown_budget" },
  { pattern: /\bdedupe|\bduplicate|\bnormalize(?:d|s)?/iu, label: "dedupe_normalize" },
  { pattern: /\bpersist(?:s|ed|ence)?|\bstorage|\bwrite(?:s|n)?/iu, label: "persistence" },
  { pattern: /\bpermission(?:s)?|\bauthority|\bpolicy|\bsafety/iu, label: "policy_safety" },
];

const STRUCTURAL_RETRIEVAL_PATTERN =
  /\b(?:exact|canonical|stable|source|authority|project|session|user|operator|kind|id|ids|ref|refs|window|createdAt|updatedAt|scope|tenant|profile|class|limit|max|hash|provenance)\b/iu;
const VALUE_JUDGMENT_PATTERN =
  /\b(?:useful|usefulness|worth|quality|rank|score|priority|relevance|semantic|meaning|intent|infer|classif|topic|keyword|heuristic|surfacing|surfaced|shouldSurface\w*)\b/iu;
const OBSOLETE_LOGIC_PATTERN =
  /\b(?:legacy|fallback|semantic[-_ ]?forest|keyword|topic|heuristic|source[-_ ]?fragment|static[-_ ]?default)\b/iu;
const TEST_ASSERTION_PATTERN =
  /\b(?:expect|assert|it|test|describe|toBe|toEqual|toContain|toMatch|should|snapshot|fixture|proof)\b/iu;
const EXECUTABLE_DECISION_PATTERN =
  /(?:=>|>=|<=|===|!==|&&|\|\||\?|:|return|if\s*\(|filter\s*\(|map\s*\(|sort\s*\(|toSorted\s*\(|score|rank|surface|candidate|classif|intent|meaning|useful|worth|quality|signalWeight|weight)/iu;

function boundedLineExcerpt(line: string): string {
  const normalized = line.replace(/\s+/gu, " ").trim();
  if (normalized.length <= 220) {
    return normalized;
  }
  return `${normalized.slice(0, 219).trimEnd()}.`;
}

function isCommentOnlyLine(line: string): boolean {
  return /^\s*(?:\/\/|\/\*|\*|\*\/)/u.test(line);
}

function lineHasGuardrailContext(line: string): string | null {
  for (const candidate of GUARDRAIL_PATTERNS) {
    if (candidate.pattern.test(line)) {
      return candidate.label;
    }
  }
  return null;
}

function classifyLine(line: string): {
  findingClass: DeterministicJudgmentAuditFindingClass;
  matchedPattern: string;
  reason: string;
} | null {
  const guardrail = lineHasGuardrailContext(line);
  const semanticMatches = SEMANTIC_JUDGMENT_PATTERNS.filter((candidate) =>
    candidate.pattern.test(line),
  );

  if (semanticMatches.length === 0 && guardrail) {
    return {
      findingClass: "allowed_guardrail",
      matchedPattern: guardrail,
      reason:
        "Deterministic guardrail logic remains allowed for identity, schema, caps, provenance, safety, dedupe, and persistence.",
    };
  }

  if (semanticMatches.length === 0) {
    return null;
  }

  const firstMatch = semanticMatches[0];
  if (guardrail) {
    return {
      findingClass: "ambiguous_review",
      matchedPattern: `${firstMatch.label}+${guardrail}`,
      reason:
        "Line mixes semantic-judgment vocabulary with guardrail vocabulary and needs review for boundary ownership.",
    };
  }

  return {
    findingClass: "semantic_judgment_review",
    matchedPattern: firstMatch.label,
    reason: firstMatch.reason,
  };
}

function isRuntimePath(filePath: string): boolean {
  return (
    /\.(?:ts|tsx|js|mjs)$/u.test(filePath) &&
    !filePath.endsWith(".test.ts") &&
    !filePath.endsWith(".test.tsx") &&
    !filePath.includes("/test/") &&
    !filePath.includes("/tests/") &&
    !filePath.startsWith("scripts/")
  );
}

function isTestProofOrScriptPath(filePath: string): boolean {
  return !isRuntimePath(filePath);
}

function isRetrievalPath(filePath: string): boolean {
  return /(?:^|\/)(?:retrieval|candidate-recall|pack-assembler|runtime-retrieval|hierarchical-retrieval)/u.test(
    filePath,
  );
}

function isAuditInfrastructurePath(filePath: string): boolean {
  return /(?:phase2-deterministic-judgment-audit|phase2-candidate-review-validation|phase2-candidate-review-golden-corpus)/u.test(
    filePath,
  );
}

function isFixtureReferenceNoise(input: { filePath: string; line: string }): boolean {
  if (isAuditInfrastructurePath(input.filePath)) {
    return true;
  }
  return !TEST_ASSERTION_PATTERN.test(input.line) && !EXECUTABLE_DECISION_PATTERN.test(input.line);
}

function isQuarantineGuardrailTestLine(input: { filePath: string; line: string }): boolean {
  return (
    input.filePath.endsWith("semantic-forest-quarantine.test.ts") ||
    /\.not\.to(?:Contain|Match)\(/u.test(input.line)
  );
}

function isSchemaOrTypeDeclaration(line: string): boolean {
  return (
    /\bz\.infer\b/u.test(line) ||
    /^\s*(?:export\s+)?(?:type|interface)\b/u.test(line) ||
    /^\s*(?:export\s+)?const\s+\w*Schema\b/u.test(line) ||
    /\bSchema\s*=|\bSchema\./u.test(line)
  );
}

function isDeclarativePolicyRegistryLine(input: { filePath: string; line: string }): boolean {
  if (!/legacy-fallback-registry/u.test(input.filePath)) {
    return false;
  }
  return /^\s*(?:surface|status|defaultLivePathAllowed|rollbackFlag|auditRequired|reason):/u.test(
    input.line,
  );
}

function classifyHotspot(input: {
  filePath: string;
  line: string;
  findingClass: DeterministicJudgmentAuditFindingClass;
  matchedPattern: string;
}): {
  classification: DeterministicJudgmentHotspotClassification;
  confidence: "low" | "medium" | "high";
  recommendedAction: DeterministicJudgmentRecommendedAction;
  eliminationRationale: string;
} {
  const line = input.line;
  const runtimePath = isRuntimePath(input.filePath);
  const retrievalPath = isRetrievalPath(input.filePath);
  const structural = STRUCTURAL_RETRIEVAL_PATTERN.test(line);
  const valueJudgment = VALUE_JUDGMENT_PATTERN.test(line);
  const obsolete = OBSOLETE_LOGIC_PATTERN.test(line) || /legacy|fallback/u.test(input.filePath);
  const testProofOrScriptPath = isTestProofOrScriptPath(input.filePath);

  if (isSchemaOrTypeDeclaration(line) || isDeclarativePolicyRegistryLine(input)) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "document_guardrail",
      eliminationRationale:
        "This is declarative schema/type/policy-registry metadata, not executable semantic judgment.",
    };
  }

  if (testProofOrScriptPath) {
    if (isQuarantineGuardrailTestLine(input)) {
      return {
        classification: "valid_guardrail",
        confidence: "high",
        recommendedAction: "keep",
        eliminationRationale:
          "This test/proof line asserts a quarantine or absence guardrail rather than enshrining deterministic semantic behavior.",
      };
    }
    if (isFixtureReferenceNoise({ filePath: input.filePath, line })) {
      return {
        classification: "fixture_reference_noise",
        confidence: "medium",
        recommendedAction: "keep",
        eliminationRationale:
          "This non-runtime line references judgment vocabulary without asserting deterministic semantic behavior.",
      };
    }
    if (valueJudgment || obsolete || input.findingClass === "ambiguous_review") {
      return {
        classification: "test_enshrinement_debt",
        confidence: "high",
        recommendedAction: "remove_or_rewrite_test",
        eliminationRationale:
          "This test/proof/script line appears to assert, preserve, or normalize deterministic semantic/value judgment and must be removed or rewritten around model-owned boundaries.",
      };
    }
  }

  if (input.findingClass === "allowed_guardrail") {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "This line matches guardrail-only logic. Keep deterministic ownership unless later review finds hidden value judgment nearby.",
    };
  }

  if (obsolete && runtimePath) {
    return {
      classification: "runtime_elimination_debt",
      confidence: "high",
      recommendedAction: "remove",
      eliminationRationale:
        "Runtime legacy/fallback/keyword/heuristic logic is presumed obsolete unless explicitly proven as a safety guardrail.",
    };
  }

  if (
    retrievalPath &&
    structural &&
    !/\b(?:useful|usefulness|worth|intent|meaning|topic|keyword|heuristic)\b/iu.test(line)
  ) {
    return {
      classification: "acceptable_structural_retrieval_logic",
      confidence: "medium",
      recommendedAction: "document_guardrail",
      eliminationRationale:
        "Retrieval code appears to constrain by explicit structure such as ids, refs, source scope, object kind, or windows. Preserve only if it does not decide semantic value.",
    };
  }

  if (valueJudgment && runtimePath) {
    return {
      classification: "runtime_elimination_debt",
      confidence: "high",
      recommendedAction: "move_to_model_review",
      eliminationRationale:
        "Runtime deterministic value judgment must be removed, replaced with structural filtering, or moved behind a bounded model-reviewed path.",
    };
  }

  if (input.findingClass === "ambiguous_review") {
    return {
      classification: "runtime_elimination_debt",
      confidence: "medium",
      recommendedAction: "move_to_model_review",
      eliminationRationale:
        "Ambiguous runtime ownership defaults to model-owned semantic judgment until proven to be a pure guardrail.",
    };
  }

  return {
    classification: runtimePath ? "runtime_elimination_debt" : "fixture_reference_noise",
    confidence: "low",
    recommendedAction: runtimePath ? "manual_review" : "keep",
    eliminationRationale:
      "The audit could not prove this is a pure guardrail. Runtime ambiguity remains elimination debt; non-runtime ambiguity remains reference noise unless it asserts deterministic behavior.",
  };
}

function emptyClassificationCounts(): DeterministicJudgmentClassificationCounts {
  return {
    runtime_elimination_debt: 0,
    test_enshrinement_debt: 0,
    valid_guardrail: 0,
    acceptable_structural_retrieval_logic: 0,
    fixture_reference_noise: 0,
  };
}

function buildClassificationCounts(
  findings: DeterministicJudgmentAuditFinding[],
): DeterministicJudgmentClassificationCounts {
  const counts = emptyClassificationCounts();
  for (const finding of findings) {
    counts[finding.classification] += 1;
  }
  return counts;
}

function requiresAggressiveElimination(finding: DeterministicJudgmentAuditFinding): boolean {
  return (
    finding.classification === "runtime_elimination_debt" ||
    finding.classification === "test_enshrinement_debt"
  );
}

function buildDebtHotspots(input: {
  findings: DeterministicJudgmentAuditFinding[];
  debtClassification: "runtime_elimination_debt" | "test_enshrinement_debt";
}): DeterministicJudgmentAuditReport["topRuntimeDebtHotspots"] {
  const byFile = new Map<
    string,
    {
      findingCount: number;
      debtCount: number;
      classifications: DeterministicJudgmentClassificationCounts;
    }
  >();
  for (const finding of input.findings) {
    if (isAuditInfrastructurePath(finding.filePath)) {
      continue;
    }
    const isTargetScope =
      input.debtClassification === "runtime_elimination_debt"
        ? finding.scope === "runtime"
        : finding.scope === "test_proof_or_script";
    if (!isTargetScope) {
      continue;
    }
    const current = byFile.get(finding.filePath) ?? {
      findingCount: 0,
      debtCount: 0,
      classifications: emptyClassificationCounts(),
    };
    current.findingCount += 1;
    if (finding.classification === input.debtClassification) {
      current.debtCount += 1;
    }
    current.classifications[finding.classification] += 1;
    byFile.set(finding.filePath, current);
  }
  return [...byFile.entries()]
    .map(([filePath, value]) => ({
      filePath,
      findingCount: value.findingCount,
      debtCount: value.debtCount,
      topClassifications: Object.entries(value.classifications)
        .map(([classification, count]) => ({
          classification: classification as DeterministicJudgmentHotspotClassification,
          count,
        }))
        .filter((entry) => entry.count > 0)
        .toSorted((left, right) => right.count - left.count)
        .slice(0, 3),
    }))
    .filter((hotspot) => hotspot.debtCount > 0)
    .toSorted(
      (left, right) =>
        right.debtCount - left.debtCount ||
        right.findingCount - left.findingCount ||
        left.filePath.localeCompare(right.filePath),
    )
    .slice(0, 40);
}

function buildPriorityHotspots(
  findings: DeterministicJudgmentAuditFinding[],
): DeterministicJudgmentAuditReport["priorityHotspots"] {
  return buildDebtHotspots({ findings, debtClassification: "runtime_elimination_debt" }).map(
    (hotspot) => ({
      filePath: hotspot.filePath,
      findingCount: hotspot.findingCount,
      aggressiveEliminationRequiredCount: hotspot.debtCount,
      topClassifications: hotspot.topClassifications,
    }),
  );
}

export function buildDeterministicJudgmentAuditReport(input: {
  files: DeterministicJudgmentAuditFile[];
  generatedAt?: string;
  maxFindingsPerFile?: number;
}): DeterministicJudgmentAuditReport {
  const maxFindingsPerFile = input.maxFindingsPerFile ?? 40;
  const findings: DeterministicJudgmentAuditFinding[] = [];

  for (const file of input.files) {
    let perFileCount = 0;
    const lines = file.text.split(/\r?\n/u);
    for (const [index, line] of lines.entries()) {
      if (perFileCount >= maxFindingsPerFile) {
        break;
      }
      if (isCommentOnlyLine(line)) {
        continue;
      }
      const classification = classifyLine(line);
      if (!classification) {
        continue;
      }
      const hotspot = classifyHotspot({
        filePath: file.path,
        line,
        findingClass: classification.findingClass,
        matchedPattern: classification.matchedPattern,
      });
      findings.push({
        filePath: file.path,
        lineNumber: index + 1,
        scope: isRuntimePath(file.path) ? "runtime" : "test_proof_or_script",
        findingClass: classification.findingClass,
        matchedPattern: classification.matchedPattern,
        lineExcerpt: boundedLineExcerpt(line),
        reason: classification.reason,
        classification: hotspot.classification,
        confidence: hotspot.confidence,
        recommendedAction: hotspot.recommendedAction,
        eliminationRationale: hotspot.eliminationRationale,
      });
      perFileCount += 1;
    }
  }

  const semanticJudgmentReviewCount = findings.filter(
    (finding) => finding.findingClass === "semantic_judgment_review",
  ).length;
  const allowedGuardrailCount = findings.filter(
    (finding) => finding.findingClass === "allowed_guardrail",
  ).length;
  const ambiguousReviewCount = findings.filter(
    (finding) => finding.findingClass === "ambiguous_review",
  ).length;
  const classificationCounts = buildClassificationCounts(findings);
  const runtimeFindings = findings.filter((finding) => finding.scope === "runtime");
  const runtimeClassificationCounts = buildClassificationCounts(runtimeFindings);
  const runtimeFindingCount = runtimeFindings.length;
  const nonRuntimeFindingCount = findings.length - runtimeFindingCount;
  const runtimeEliminationDebtCount = classificationCounts.runtime_elimination_debt;
  const testEnshrinementDebtCount = classificationCounts.test_enshrinement_debt;
  const fixtureReferenceNoiseCount = classificationCounts.fixture_reference_noise;
  const aggressiveEliminationRequiredCount = findings.filter(requiresAggressiveElimination).length;
  const topRuntimeDebtHotspots = buildDebtHotspots({
    findings,
    debtClassification: "runtime_elimination_debt",
  });
  const topTestDebtHotspots = buildDebtHotspots({
    findings,
    debtClassification: "test_enshrinement_debt",
  });
  const priorityHotspots = buildPriorityHotspots(findings);
  const reportHash = sha256JsonValue({
    files: input.files.map((file) => ({ path: file.path, hash: sha256JsonValue(file.text) })),
    findings,
    classificationCounts,
    runtimeClassificationCounts,
    runtimeFindingCount,
    nonRuntimeFindingCount,
    runtimeEliminationDebtCount,
    testEnshrinementDebtCount,
    fixtureReferenceNoiseCount,
    aggressiveEliminationRequiredCount,
    topRuntimeDebtHotspots,
    topTestDebtHotspots,
    priorityHotspots,
  });

  return {
    schemaVersion: DETERMINISTIC_JUDGMENT_AUDIT_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    fileCount: input.files.length,
    findingCount: findings.length,
    semanticJudgmentReviewCount,
    allowedGuardrailCount,
    ambiguousReviewCount,
    classificationCounts,
    runtimeFindingCount,
    runtimeClassificationCounts,
    nonRuntimeFindingCount,
    runtimeEliminationDebtCount,
    testEnshrinementDebtCount,
    fixtureReferenceNoiseCount,
    aggressiveEliminationRequiredCount,
    topRuntimeDebtHotspots,
    topTestDebtHotspots,
    priorityHotspots,
    reportHash,
    findings,
    interpretation: {
      claim: "aggressive_elimination_plan_not_proof_of_absence",
      deterministicGuardrailsRemainAllowed: [
        "ids",
        "hashes",
        "schema validation",
        "caps",
        "redaction",
        "source refs",
        "provenance",
        "cooldowns",
        "dedupe",
        "persistence boundaries",
        "unsafe-output demotion",
      ],
      reviewTarget:
        "deterministic code that decides meaning, usefulness, classification, ranking, or surfacing without model review",
      defaultPosture:
        "Deterministic value judgment is presumed unsafe at scale. Runtime findings are elimination debt and test/proof findings are enshrinement debt unless they are explicit guardrails, structural retrieval constraints, or harmless fixture/reference noise.",
    },
  };
}

export function renderDeterministicJudgmentAuditMarkdown(
  report: DeterministicJudgmentAuditReport,
): string {
  const lines = [
    "# Deterministic Judgment Audit",
    "",
    `Generated: ${report.generatedAt}`,
    `Files scanned: ${report.fileCount}`,
    `Findings: ${report.findingCount}`,
    `Semantic-judgment review: ${report.semanticJudgmentReviewCount}`,
    `Ambiguous review: ${report.ambiguousReviewCount}`,
    `Allowed guardrails: ${report.allowedGuardrailCount}`,
    `Runtime findings: ${report.runtimeFindingCount}`,
    `Non-runtime/test findings: ${report.nonRuntimeFindingCount}`,
    `Runtime elimination debt: ${report.runtimeEliminationDebtCount}`,
    `Test enshrinement debt: ${report.testEnshrinementDebtCount}`,
    `Fixture/reference noise: ${report.fixtureReferenceNoiseCount}`,
    `Aggressive elimination required: ${report.aggressiveEliminationRequiredCount}`,
    `Report hash: ${report.reportHash}`,
    "",
    "This is an aggressive elimination plan, not proof that all deterministic judgment is absent.",
    "Runtime deterministic value judgment defaults to removal or model-owned review unless proven to be a guardrail or structural retrieval constraint.",
    "Tests and proof scripts that assert deterministic semantic behavior are debt too; they must be removed or rewritten around model-owned boundaries.",
    "Deterministic guardrails remain allowed for ids, hashes, schemas, caps, redaction, refs, provenance, cooldowns, dedupe, persistence, and unsafe-output demotion.",
    "",
    "## Classification Counts",
    "",
    ...Object.entries(report.classificationCounts).map(([classification, count]) => {
      return `- ${classification}: ${count}`;
    }),
    "",
    "## Runtime Classification Counts",
    "",
    ...Object.entries(report.runtimeClassificationCounts).map(([classification, count]) => {
      return `- ${classification}: ${count}`;
    }),
    "",
    "## Runtime Debt Hotspots",
    "",
    ...report.topRuntimeDebtHotspots.slice(0, 30).map((hotspot) => {
      return `- ${hotspot.filePath}: debt=${hotspot.debtCount} findings=${hotspot.findingCount}`;
    }),
    "",
    "## Test Enshrinement Debt Hotspots",
    "",
    ...report.topTestDebtHotspots.slice(0, 30).map((hotspot) => {
      return `- ${hotspot.filePath}: debt=${hotspot.debtCount} findings=${hotspot.findingCount}`;
    }),
    "",
    "## Legacy Priority Hotspots",
    "",
    ...report.priorityHotspots.slice(0, 30).map((hotspot) => {
      return `- ${hotspot.filePath}: aggressive=${hotspot.aggressiveEliminationRequiredCount} findings=${hotspot.findingCount}`;
    }),
    "",
    "## Findings",
    "",
  ];

  for (const finding of report.findings.slice(0, 200)) {
    lines.push(
      `- ${finding.classification} ${finding.filePath}:${finding.lineNumber} [${finding.matchedPattern}] action=${finding.recommendedAction} ${finding.lineExcerpt}`,
    );
  }

  if (report.findings.length > 200) {
    lines.push(`- ${report.findings.length - 200} additional findings omitted from markdown.`);
  }

  return `${lines.join("\n")}\n`;
}
