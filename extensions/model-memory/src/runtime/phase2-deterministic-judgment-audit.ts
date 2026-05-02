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

function isHybridRetrievalRecallOrAssemblyLine(input: { filePath: string; line: string }): boolean {
  if (!isRuntimePath(input.filePath) || !isRetrievalPath(input.filePath)) {
    return false;
  }
  const line = input.line;
  if (
    /\b(?:useful|usefulness|worth|shouldSurface\w*|surfacing|surfaced|skill|proactiv|card|brief|human[-_ ]?facing|visible)\b/iu.test(
      line,
    )
  ) {
    return false;
  }
  return /\b(?:lexical|source_lineage|sourceLineage|recency|recent|temporal|graph|projection|vector|rank|ranked|ranking|rankIndex|rankBand|score|scored|scoring|priority|candidate|pack|result|scope|scopeMatch|classifyScopeMatch|requestPurpose)\b/iu.test(
    line,
  );
}

function isProactivityActionBoundaryGuardrailLine(input: {
  filePath: string;
  line: string;
}): boolean {
  return (
    input.filePath.endsWith("phase2-proactivity-action-boundary.ts") &&
    /\b(?:classification|classificationCounts|report_only|suggestion_only|approval_required_action|blocked_action|approvalRequirement|executed|userFacingProactiveMessage|prohibitActionExecution|prohibitUserFacingProactiveMessages)\b/u.test(
      input.line,
    )
  );
}

function isAutonomousSendBoundaryGuardrailLine(input: { filePath: string; line: string }): boolean {
  return (
    /phase2-(?:autonomous-send-boundary-preflight|autonomous-send-readiness-manual-override)\.ts$/u.test(
      input.filePath,
    ) &&
    /\b(?:classification|classifications|approval_required_auto_send_candidate|blocked_autonomous_send|manual_override_required|future_auto_send_review_only_control|autoSendExecutionAllowed|actionExecutionObserved|broadAutonomousSendingObserved|manualSendRequired|reportOnly)\b/u.test(
      input.line,
    )
  );
}

function isProactivityFeedbackControlPlaneLine(input: { filePath: string; line: string }): boolean {
  return (
    input.filePath.endsWith("phase2-proactivity-feedback-loop.ts") &&
    /\b(?:useful|not_useful|too_repetitive|wrong_context|unsafe_private|negative_feedback_recorded|quality_signal_only|suppress_repeated_candidate|block_future_surfacing_pending_review|semanticTruthWrite|memoryCorrectionWrite|feedbackIsControlPlaneSignal|feedbackMayAffectRanking|feedbackMayAffectSuppression|rawFreeformTextAllowed|explicit feedback counts)\b/iu.test(
      input.line,
    )
  );
}

function isSafeLevel1AutofixGuardrailLine(input: { filePath: string; line: string }): boolean {
  return (
    input.filePath.endsWith("ops-closed-loop/safe-level1-autofix.ts") &&
    /\b(?:semanticTruthTouchRequested|semantic_truth_mutated|forbidden_semantic_truth_actions|semantic_truth_auto_fix_disabled|semantic truth mutation|semantic_candidate_auto_repair|operator_approval_ticket)\b/iu.test(
      input.line,
    )
  );
}

function isModelOwnedCollisionAdjudicationLine(input: { filePath: string; line: string }): boolean {
  return (
    input.filePath.endsWith("semantic-collision-adjudication.ts") &&
    /\b(?:semantic_collision_adjudication|ExecutorBackedSemanticCollisionAdjudicator|adjudicate|adjudication|modelId|contractName|responseFormat|sameCoreMemory|deltaType|matchedCandidateId|normalized meaning|Do not infer meaning|similarity score|candidateRankReason|sameClaimRisk|structural delta summary)\b/iu.test(
      input.line,
    )
  );
}

function isLargeDocumentEvidenceModelTraceLine(input: { filePath: string; line: string }): boolean {
  return (
    input.filePath.endsWith("src/agents/model-memory.large-document-evidence.ts") &&
    /(?:LargeDocumentClassification|classification|RecordingSemanticInterpreter|SemanticInterpreter\w*|SemanticInterpreterTraceEvent|SemanticInterpreterTraceMetadata|executionTraces|contractVersion|resolvedModelId|purposes|interpret\(input\))/u.test(
      input.line,
    )
  );
}

function isModelMemoryRecoveryOperationalLine(input: { filePath: string; line: string }): boolean {
  return (
    input.filePath.endsWith("src/agents/model-memory.recovery.ts") &&
    /\b(?:semantic_truth|classification|classifyRecoveries|reconcileClass|restartAction|operational_state|derived_artifact|quarantined_corrupt|blocked_busy|replay_required|rebuild_required|stale_but_servable)\b/u.test(
      input.line,
    )
  );
}

function isAuditInfrastructurePath(filePath: string): boolean {
  return /(?:phase2-deterministic-judgment-audit|phase2-candidate-review-validation|phase2-candidate-review-golden-corpus)/u.test(
    filePath,
  );
}

function isAuditInfrastructureLine(input: { filePath: string; line: string }): boolean {
  return isRuntimePath(input.filePath) && isAuditInfrastructurePath(input.filePath);
}

function isModelOwnedInterpreterPlumbingLine(input: { filePath: string; line: string }): boolean {
  if (
    /(?:semantic-interpreter|real-semantic-interpreter|semantic-extraction-prompt|prompt-contracts|document-ingestion|document-ingestion-tool|document-ingestion-contracts|mmv2\/(?:admission|atomic-extraction|canonicalization|capture-routing|composite-extraction|document-shadow-ingestion|file-pack-runner|proof-runner|proof-runner-real|test-helpers))\.ts$/u.test(
      input.filePath,
    )
  ) {
    return /\b(?:SemanticInterpreter\w*|ExecutorBackedSemanticInterpreter|SemanticExtractionPrompt|ModelMemoryObject|ValidationFailure|semantic_extraction|semantic-interpreter|semantic-extraction-prompt|semantic-validator|semantic-schema|contractName|build\w*Prompt|responseSchema|parseJsonModelOutput|sanitizeAdmissionScores|scores: sanitizeAdmissionScores|ALLOWED_ADMISSION_REASON_CODES|useful_future_context|Classify by semantic role|Do not infer facts|Never emit child steps)\b/u.test(
      input.line,
    );
  }
  return false;
}

function isMmV2ProofInfrastructureLine(input: { filePath: string; line: string }): boolean {
  if (
    !/extensions\/model-memory\/src\/mmv2\/(?:test-helpers|proof-|tool-result-proof-capture)/u.test(
      input.filePath,
    )
  ) {
    return false;
  }
  return /\b(?:SemanticInterpreter\w*|scripted|proof|fixture|expected|actual|compare|mismatch|captureOne|resolve|candidate_id|scores|semanticChangedPaths|normalizedPrompt|prompt:|rank|classification|intent|sourceRefs|proofHash)\b/iu.test(
    input.line,
  );
}

function isDocumentIngestionOperationalLine(input: { filePath: string; line: string }): boolean {
  return (
    input.filePath.endsWith(
      "extensions/model-memory/src/admin/document-ingestion-runner-service.ts",
    ) &&
    /\b(?:classifyMemoryIngestionFailure|classifyDocumentIngestionFailure|DocumentIngestionFailureClass|isMemoryIngestionProviderBoundaryFailure|failureClass|SemanticInterpreter\w*|SemanticCollisionAdjudicator)\b/u.test(
      input.line,
    )
  );
}

function isTelegramTopicRoutingTestLine(input: { filePath: string; line: string }): boolean {
  return (
    /src\/infra\/heartbeat-runner\.(?:ghost-reminder|returns-default-unset)\.test\.ts$/u.test(
      input.filePath,
    ) &&
    /(?:Telegram topic|telegram:[^"']*:topic:\d+|:topic:\d+|:topic:|MessageThreadId|messageThreadId|Topic heartbeat)/u.test(
      input.line,
    )
  );
}

function isUiAttachmentKindStructuralLine(input: { filePath: string; line: string }): boolean {
  return (
    input.filePath.endsWith("ui/src/ui/chat/message-normalizer.ts") &&
    /\b(?:inferAttachmentKind|mimeTypeFromUrl|mediaKindFromMime|kind: inferred\.kind|label: inferred\.label|mimeType: inferred\.mimeType)\b/u.test(
      input.line,
    )
  );
}

function isUiToolOutputMetadataStructuralLine(input: { filePath: string; line: string }): boolean {
  return (
    input.filePath.endsWith("ui/src/ui/chat/tool-cards.ts") &&
    /\b(?:inferToolOutputMetaFromText|extractToolOutputMeta|outputMeta|sourceTruncated|historyTruncated|fullContentAvailable)\b/u.test(
      input.line,
    )
  );
}

function isUiNavigationStructuralLine(input: { filePath: string; line: string }): boolean {
  return (
    /ui\/src\/ui\/(?:app-settings|app-lifecycle|storage|navigation)\.ts$/u.test(input.filePath) &&
    /\b(?:inferBasePath|inferBasePathFromPathname|normalizeBasePath|pathname)\b/u.test(input.line)
  );
}

function isExportSurfaceModelPlumbingLine(input: { filePath: string; line: string }): boolean {
  return (
    /extensions\/model-memory\/src\/(?:index|runtime-api)\.ts$/u.test(input.filePath) &&
    /^\s*export \* from "\.\/(?:real-semantic-interpreter|semantic-extraction-prompt|semantic-schema|semantic-interpreter|semantic-validator)\.ts";$/u.test(
      input.line,
    )
  );
}

function isRetrievalModelOrPlanPlumbingLine(input: { filePath: string; line: string }): boolean {
  return (
    isRuntimePath(input.filePath) &&
    /extensions\/model-memory\/src\/(?:retrieval-request-interpreter|runtime\/retrieval\/types)\.ts$/u.test(
      input.filePath,
    ) &&
    /\b(?:RetrievalPlan|RetrievalRun|intent: string|structured retrieval intent|Do not return fields like intent|semantic-schema|CanonicalClass|MemoryKind|Confidence)\b/u.test(
      input.line,
    )
  );
}

function isModelMemoryProofAgentPlumbingLine(input: { filePath: string; line: string }): boolean {
  if (
    !/src\/agents\/model-memory\.(?:prompt-lane-proof|session-turn-proof)\.ts$/u.test(
      input.filePath,
    )
  ) {
    return false;
  }
  return /\b(?:SemanticCollisionAdjudicator|SemanticInterpreter\w*|ExecutorBackedSemanticInterpreter|semantic_extraction|operatorChecks|expectedOutcome|whyDurable|selectionReason|prompt lane|write path|active claims|model returned a result)\b/iu.test(
    input.line,
  );
}

function isModelMemoryReportOnlyAgentLine(input: { filePath: string; line: string }): boolean {
  return (
    /src\/agents\/model-memory\.(?:live-vs-replay-parity|rebuild-diff|cache-diff|retrieval-package-review)\.ts$/u.test(
      input.filePath,
    ) &&
    (/\b(?:classifyParity|classifyDiff|classification|rebuildDiff\.classification|Support-only classification|score: entry\.score|score: number|RetrievalPackageReviewResult)\b/u.test(
      input.line,
    ) ||
      /score=/u.test(input.line))
  );
}

function isSemanticModuleImportExportOrTypePlumbingLine(input: {
  filePath: string;
  line: string;
}): boolean {
  if (!isRuntimePath(input.filePath)) {
    return false;
  }
  if (
    !/^\s*(?:import|export\s+\*|export\s+type|type|interface|\}|\w+\??:|\w+,)/u.test(input.line)
  ) {
    return false;
  }
  return /\b(?:SemanticInterpreter|SemanticCollisionAdjudicator|collisionAdjudicator|adjudicator: SemanticCollisionAdjudicator|semantic-collision-adjudication|semantic-identity|semantic-schema|semantic-validator|semantic-extraction-prompt|semantic-interpreter|ModelMemoryObject|MemoryScope|Provenance|ReviewMode|MemoryKindSchema|MemoryKind|MemoryIdentityDescriptor)\b/u.test(
    input.line,
  );
}

function isOperationalFailureTaxonomyLine(input: { filePath: string; line: string }): boolean {
  return (
    isRuntimePath(input.filePath) &&
    /\b(?:classifyMemoryIngestionFailure|classifyRunnerError|classifyBenchmarkRouteFailure|classifyFailure|MemoryIngestionFailureClass|failure_class|failureClass|error.*kind)\b/u.test(
      input.line,
    )
  );
}

function isNoSemanticAuthorityPolicyFlagLine(input: { filePath: string; line: string }): boolean {
  return (
    isRuntimePath(input.filePath) &&
    /\b(?:semanticSimilarityTruthAllowed: false|topicParserAllowed: false|semanticTruthWriteObserved: false|semanticTruth: false|feedbackCreatesSemanticTruth: false|feedback_not_canonical_truth|semanticTruthWrite|semantic_truth_mutated|semantic truth mutation|no semantic write|semanticMemoryWriteAttempted)\b/iu.test(
      input.line,
    )
  );
}

function isProactivityImportOrEvidenceRequirementLine(input: {
  filePath: string;
  line: string;
}): boolean {
  return (
    /extensions\/model-memory\/src\/runtime\/phase2-(?:proactivity-daily-review-heartbeat|real-suggestion-content-contract|user-facing-proactivity-notification-ux|autosend-simulation-observability|heartbeat-proactivity-reliability|low-risk-autosend-controlled-scope|personal-default-proactivity-scope|product-proactivity-presentation|proactivity-feedback-loop)\.ts$/u.test(
      input.filePath,
    ) &&
    (/^\s*(?:import|\})/u.test(input.line) ||
      /\b(?:requires .*surfacing evidence|product surfacing report is required|phase2-product-proactivity-presentation|Product Proactivity Presentation|bundled-product-presentation-baseline|planner-review-artifacts-and-surfacing\.md)\b/u.test(
        input.line,
      ))
  );
}

function isActionApprovalSafetyClassificationLine(input: {
  filePath: string;
  line: string;
}): boolean {
  return (
    input.filePath.endsWith(
      "extensions/model-memory/src/runtime/phase2-staged-action-approval-workflow.ts",
    ) &&
    /\b(?:classification|approval_required_action|blocked_action|blocked_output|actionExecutionObserved|requiresApproval|approvalRequired)\b/u.test(
      input.line,
    )
  );
}

function isModelReviewedProposalSchemaLine(input: { filePath: string; line: string }): boolean {
  return (
    input.filePath.endsWith(
      "extensions/model-memory/src/runtime/phase2-model-reviewed-candidate-discovery.ts",
    ) && /\bshouldSurface: boolean\b/u.test(input.line)
  );
}

function isModelOrHumanPromptContractLine(input: { filePath: string; line: string }): boolean {
  return (
    isRuntimePath(input.filePath) &&
    /\b(?:contractName: "semantic_extraction"|contractName: "semantic_collision_adjudication"|semantic_extraction|semantic_collision_adjudication|Do not infer meaning|Classify by semantic role|Never emit child steps|Refine the smallest useful skill contract|normalized meaning)\b/u.test(
      input.line,
    )
  );
}

function isUiTransportOrExplicitStatusLine(input: { filePath: string; line: string }): boolean {
  return (
    /ui\/src\/ui\/(?:types|controllers\/dreaming|views\/dreaming|controllers\/skills|views\/agents-utils)\.ts$/u.test(
      input.filePath,
    ) &&
    /\b(?:topicKey|topicLabel|topic\/|useful|surfaced|score: number|Semantic search)\b/u.test(
      input.line,
    )
  );
}

function isProactivityLifecycleOrModelPromptLine(input: {
  filePath: string;
  line: string;
}): boolean {
  return (
    /extensions\/model-memory\/src\/runtime\/phase2-(?:controlled-proactivity-suggestions|proactivity-autonomous-internal-drafting|proactivity-opportunity-ledger|proactivity-growth-loops|user-facing-proactivity-briefs|proactivity-heartbeat-review-loop)\.ts$/u.test(
      input.filePath,
    ) &&
    /(?:classification: "report_only" \| "suggestion_only"|status === "surfaced"|"surfaced"|signalId: "unresolved-question-inline-surfacing"|planner-review-artifacts-and-surfacing\.md|usefulFollowOn|REVERSE_PROMPT_BAD_PREFIX|smallest useful next step)/u.test(
      input.line,
    )
  );
}

function isModelOwnedAdmissionFallbackQuarantineLine(input: {
  filePath: string;
  line: string;
}): boolean {
  return (
    input.filePath.endsWith("extensions/model-memory/src/mmv2/admission.ts") &&
    /\bscores: \{/u.test(input.line)
  );
}

function isPromptOrReportContractTextLine(input: { filePath: string; line: string }): boolean {
  return (
    /(?:src\/agents\/model-memory\.(?:prompt-lane-proof|recovery|zero-candidate-text-search-diagnostic)|extensions\/model-memory\/src\/(?:prompt-contracts|phase2-entry-validation|proof\/phase2-controlled-config-ui-proof|runtime\/retrieval\/phase2-scoped-production-rollout)|src\/infra\/heartbeat-runner)\.ts$/u.test(
      input.filePath,
    ) &&
    /\b(?:specific enough to be useful|Canonical semantic truth|semantic_collision_adjudication|semantic truth|Same config\.patch JSON merge patch semantics|phase2_controlled_config_ui_proof|phase2_scoped_production_rollout_observation|useful follow-up question)\b/u.test(
      input.line,
    )
  );
}

function isContractBoundaryTraceLine(input: { filePath: string; line: string }): boolean {
  return (
    isRuntimePath(input.filePath) &&
    /\b(?:semantic_contract_boundary|semanticChangedPaths|classification\?: string)\b/u.test(
      input.line,
    )
  );
}

function isProactivityRuntimeOrGatewayPlumbingLine(input: {
  filePath: string;
  line: string;
}): boolean {
  return (
    /(?:src\/infra\/model-memory-proactivity-runtime|src\/gateway\/server-methods\/model-memory-proactivity)\.ts$/u.test(
      input.filePath,
    ) &&
    (/^\s*(?:import|\})/u.test(input.line) ||
      /(?:classifySystemEventForProactivity|"surfaced")/u.test(input.line))
  );
}

function isDatabaseModelAdjudicationPlumbingLine(input: {
  filePath: string;
  line: string;
}): boolean {
  return (
    input.filePath.endsWith("extensions/model-memory/src/db/database-memory-object-store.ts") &&
    /^\s*(?:import|\})/u.test(input.line) &&
    /\b(?:SemanticCollisionAdjudicator|semantic-collision-adjudication|semantic-identity|semantic-schema|ModelMemoryObject)\b/u.test(
      input.line,
    )
  );
}

function isLiveMemoryServiceModelOrSourceAuthorityLine(input: {
  filePath: string;
  line: string;
}): boolean {
  return (
    /(?:extensions\/model-memory\/src\/(?:live-document-ingestion-service|live-daily-continuity-recovery-service|live-ordinary-turn-capture-service)|src\/agents\/model-memory\/live-runtime\/assistant-turn-capture)\.ts$/u.test(
      input.filePath,
    ) &&
    /\b(?:SemanticCollisionAdjudicator|semantic-collision-adjudication|semantic_contract_boundary|classifyLiveTurnSourceAuthority|classifyCaptureFailure|sourceAuthority)\b/u.test(
      input.line,
    )
  );
}

function isProofPromptNormalizationPlumbingLine(input: {
  filePath: string;
  line: string;
}): boolean {
  return (
    input.filePath.endsWith("extensions/model-memory/src/mmv2/proof-prompt-normalization.ts") &&
    /\b(?:SemanticExtractionPrompt|PreparedProofPrompt|originalPrompt|normalizedPrompt|prompt:)\b/u.test(
      input.line,
    )
  );
}

function isMmV2WriteSimulationStructuralLine(input: { filePath: string; line: string }): boolean {
  return (
    input.filePath.endsWith("extensions/model-memory/src/mmv2/write-simulation.ts") &&
    /\b(?:createCanonicalSemanticKey|semanticKey)\b/u.test(input.line)
  );
}

function isReconciliationStructuralOrModelPlumbingLine(input: {
  filePath: string;
  line: string;
}): boolean {
  return (
    input.filePath.endsWith("extensions/model-memory/src/mmv2/reconciliation.ts") &&
    /\b(?:SemanticInterpreter|InterpreterSourceWindow|semantic-identity|createCanonicalSemanticKey|createExistingMemorySemanticKey|without superseding by semantic similarity|without fuzzy supersession)\b/u.test(
      input.line,
    )
  );
}

function isDuplicateBenchmarkReviewedArtifactLine(input: {
  filePath: string;
  line: string;
}): boolean {
  return (
    input.filePath.endsWith("src/agents/model-memory.duplicate-benchmark.ts") &&
    /\b(?:seedStrategy|semanticSeeds|DuplicateBenchmarkSemanticSeed|REVIEWED_RERUN_CASES|REVIEWED_CLUSTER_CASES|reviewed case|adjudicatedLabel|rationale|distinct durable rules|SecretRef activation semantics)\b/u.test(
      input.line,
    )
  );
}

function isLiveShadowModelPlumbingLine(input: { filePath: string; line: string }): boolean {
  return (
    input.filePath.endsWith("extensions/model-memory/src/live-shadow-adapters.ts") &&
    /\b(?:deriveMemoryIdentity|SemanticInterpreter|interpreter: input\.interpreter|interpreter: SemanticInterpreter)\b/u.test(
      input.line,
    )
  );
}

function isProactivityArtifactOrSafetyLine(input: { filePath: string; line: string }): boolean {
  return (
    /extensions\/model-memory\/src\/runtime\/phase2-(?:contextual-proactivity-surfacing|product-proactivity-surfacing)\.ts$/u.test(
      input.filePath,
    ) &&
    /\b(?:requires real suggestion content evidence|missing required surfacing lanes|contains prohibited|prohibited marker content|phase2-contextual-proactivity-surfacing|Phase 2 Contextual Proactivity Surfacing|bundled-product-surfacing-baseline)\b/u.test(
      input.line,
    )
  );
}

function isLiveRuntimeModelOrFailurePlumbingLine(input: {
  filePath: string;
  line: string;
}): boolean {
  return (
    /(?:src\/agents\/model-memory\/live-runtime\/(?:dirty-state|json|runtime-deps)|src\/infra\/model-memory-codex-capture-runtime)\.ts$/u.test(
      input.filePath,
    ) &&
    /\b(?:classifyMemoryIngestionFailure|MemoryIngestionFailureClass|classifyCaptureFailure|failureClass|SemanticInterpreter|semanticInterpreter|SemanticInterpreterInput|ExecutorBackedMmV2SemanticInterpreter|interpret\(input)\b/iu.test(
      input.line,
    )
  );
}

function isModelOwnedMemoryProofFixtureLine(input: { filePath: string; line: string }): boolean {
  return (
    input.filePath.endsWith(
      "scripts/model-memory-phase2-model-owned-memory-capture-retrieval-proof.mjs",
    ) &&
    /\b(?:model-owned memory capture|source windows structurally|not select text because it appears useful|pending, quarantined, or blocked|scoped memories|retrieval recall remains deterministic|Final context-pack inclusion belongs to the model)\b/iu.test(
      input.line,
    )
  );
}

function isPrePhase2OperationalMetricLine(input: { filePath: string; line: string }): boolean {
  return (
    input.filePath.endsWith("extensions/model-memory/src/db/pre-phase2-gates.ts") &&
    /\b(?:pgStatStatements|classifyPgStatStatementsFamily|classifyUnavailablePgStatStatementsReason|retrieval requests|exclusion and ranking)\b/u.test(
      input.line,
    )
  );
}

function isRealCandidatePolicyGuardrailLine(input: { filePath: string; line: string }): boolean {
  return (
    input.filePath.endsWith(
      "extensions/model-memory/src/runtime/phase2-real-memory-proactivity-candidates.ts",
    ) && /\b(?:semanticSimilarityTruthAllowed: false|topicParserAllowed: false)\b/u.test(input.line)
  );
}

function isCaptureSeamNoWriteGuardrailLine(input: { filePath: string; line: string }): boolean {
  return (
    input.filePath.endsWith("src/agents/model-memory.capture-seams.ts") &&
    /\b(?:semantic_memory_write_attempted|semanticMemoryWriteAttempted|no semantic write)\b/u.test(
      input.line,
    )
  );
}

function isProactivityInboxStructuralLine(input: { filePath: string; line: string }): boolean {
  return (
    input.filePath.endsWith("extensions/model-memory/src/runtime/phase2-proactivity-inbox.ts") &&
    /\b(?:phase2-product-proactivity-presentation|opportunityStatus|surfaced|autosend_simulation|Report-only auto-send simulation observation)\b/u.test(
      input.line,
    )
  );
}

function isLargeDocumentProofOrchestrationLine(input: { filePath: string; line: string }): boolean {
  return (
    /src\/agents\/model-memory\.(?:population-wave|proof-phase)\.ts$/u.test(input.filePath) &&
    /\b(?:LargeDocumentClassification|classification|primary_large_source_proof_input|bootstrap_preservation_sensitive_input|daily_continuity_recovery_input|purposes|LargeDocumentEvaluationPurpose|TIER_|packId|sourceKind)\b/u.test(
      input.line,
    )
  );
}

function isLegacyProofRunnerInfrastructureLine(input: { filePath: string; line: string }): boolean {
  return (
    input.filePath.endsWith("extensions/model-memory/src/proof/proof-runner.ts") &&
    /\b(?:SemanticInterpreter|SemanticInterpreterInput|SemanticInterpreterResult|ModelMemoryObject|createProofInterpreter|expectedAction|expectedObjects|proofCase|compareCanonicalObjects|handleProofWrites|writeDecision|matchedObjectCount)\b/u.test(
      input.line,
    )
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

function isUiTransportFixtureTestLine(input: { filePath: string; line: string }): boolean {
  if (/\b(?:expect|shouldSurface|surfaceFrom|toBe|toEqual|toContain|toMatch)\b/u.test(input.line)) {
    return false;
  }
  return (
    /ui\/src\/ui\/(?:views|controllers)\/(?:dreaming|skills)\.test\.ts$/u.test(input.filePath) &&
    /\b(?:topic\/|topicKey|topicLabel|score: |results: \[\{ score|labels: \[|key: "topic\/)\b/u.test(
      input.line,
    )
  );
}

function isFeedbackControlPlaneTestLine(input: { filePath: string; line: string }): boolean {
  if (
    /\b(?:shouldSurface|surfaceFrom|futureCandidateFrom|candidateAuthority)\b/u.test(input.line)
  ) {
    return false;
  }
  return (
    /extensions\/model-memory\/src\/runtime\/phase2-(?:proactivity-feedback-loop|follow-up-autosend-preflight|personal-autosend-continuation-decision|autosend-trial-quality-review)\.test\.ts$/u.test(
      input.filePath,
    ) &&
    /(?:controls: \["useful"\]|"useful"|useful feedback|positive feedback|quality report only|metadata only without ranking writes|unsafe private feedback blocks future surfacing safely|product UX and report-only quality review pass safety checks)/iu.test(
      input.line,
    )
  );
}

function isProactivityBadExampleRejectionTestLine(input: {
  filePath: string;
  line: string;
}): boolean {
  if (/\bexpect\s*\(/u.test(input.line) && !/not\.to/u.test(input.line)) {
    return false;
  }
  return (
    /(?:phase2-user-facing-proactivity-briefs\.test\.ts|model-memory-phase2-(?:model-authored-proactivity-briefs|proactivity-briefs)-proof\.mjs)$/u.test(
      input.filePath,
    ) &&
    /\b(?:Question worth asking before|Skill worth creating|Turn Turn|Already recurring|Build the bounded request with|It sets the default|demotes malformed reverse prompts|containsSourceFragment)\b/u.test(
      input.line,
    )
  );
}

function isModelReviewPromptFixtureLine(input: { filePath: string; line: string }): boolean {
  return (
    /scripts\/model-memory-(?:model-driven-packet-experiment|phase2-model-reviewed-candidate-discovery-proof|phase2-skill-candidate-ledger-proof)\.mjs$/u.test(
      input.filePath,
    ) &&
    /\b(?:Preserve the most operationally useful rules|Prefer recency and operational usefulness|qualitative score out of 10|Final qualitative usefulness remains a human\/model review step|classify the strongest|Prefer no candidate over weak candidates|Skill worth creating|Question worth asking before|same topic|most useful next implementation step)\b/u.test(
      input.line,
    )
  );
}

function isModelReviewedCandidateFixtureTestLine(input: {
  filePath: string;
  line: string;
}): boolean {
  if (
    /\b(?:shouldSurfaceFrom|surfaceFrom|keywordScore|qualityScore|semanticScore)\b/u.test(
      input.line,
    )
  ) {
    return false;
  }
  return (
    /(?:phase2-model-reviewed-candidate-discovery\.test\.ts|phase2-live-proactivity-signals\.test\.ts|phase2-real-memory-proactivity-candidates\.test\.ts|phase2-skill-candidate-ledger\.test\.ts|model-memory-phase2-(?:local-high-context-candidate-review|model-reviewed-candidate-discovery-proof|proactive-planning-handoff-quality-proof)\.mjs)$/u.test(
      input.filePath,
    ) &&
    /\b(?:shouldSurface: true|model-reviewed|surfacedProposalCount|proposal\.shouldSurface|whyNow:|sourceRefs:|worth operator review|worth investigation|same skills work surfaced|live proactive opportunity is ready|Deterministic surfacing|recurring work is proving)\b/iu.test(
      input.line,
    )
  );
}

function isProactivityTestArtifactOrAbsenceLine(input: {
  filePath: string;
  line: string;
}): boolean {
  if (
    /\b(?:shouldSurfaceFrom|surfaceFrom|keywordScore|qualityScore|semanticScore)\b/u.test(
      input.line,
    )
  ) {
    return false;
  }
  return (
    /(?:phase2-(?:product-proactivity-presentation|contextual-proactivity-surfacing)\.test\.ts|model-memory-phase2-(?:product|contextual)-proactivity-surfacing-proof\.mjs|model-memory-phase2-(?:autosend-simulation-observability|proactivity-feedback-loop|operator-ingestion-maintenance)-proof\.mjs|phase2-ui-runtime-proof-coverage\.test\.ts|phase2-operator-ingestion-rollout\.test\.ts|phase2-proactivity-product-correctness\.test\.ts|ui\/src\/ui\/navigation\.browser\.test\.ts)$/u.test(
      input.filePath,
    ) &&
    /\b(?:proactivity surfacing|Product Proactivity Presentation|Contextual Proactivity Surfacing|surfacing proof|surfacing-test|surfacing-proof|without surfacing content|rollback disables surfacing|background-only candidate surfaced inline|rejects wildcard active context|operator-enabled ingestion and maintenance surfacing|Stable operator rule surfaced)\b/iu.test(
      input.line,
    )
  );
}

function isStructuralGuardrailTestDescriptionLine(input: {
  filePath: string;
  line: string;
}): boolean {
  if (
    /\b(?:shouldSurfaceFrom|surfaceFrom|futureCandidateFrom|candidateAuthority|keywordScore|qualityScore|semanticScore)\b/u.test(
      input.line,
    )
  ) {
    return false;
  }
  return (
    input.filePath.endsWith(".test.ts") &&
    /\b(?:fails closed|requires the explicit|only behind an explicit flag|without legacy|without mutating semantic truth|without copying semantic payload|without inventing semantic categories|without touching semantic memory|without backfilling intent|without topic-specific inference|does not infer topics|does not supersede|does not reinterpret semantic meaning|structural correction target refs|structural identity|structurally valid provenance|non-semantic session working state|bounded text is missing|scrubs legacy persisted tokens|idle fallback lifecycle events|stale provider fallback|fallback UI handling|request errors|useful error strings|legacy-only identities|active-legacy|storageEngine: "legacy"|adapts legacy captured objects|legacy live write contract|runtime dirty state|channel-prefixed legacy keys)\b/iu.test(
      input.line,
    )
  );
}

function isSourceAuthorityStructuralTestLine(input: { filePath: string; line: string }): boolean {
  return (
    input.filePath.endsWith("extensions/model-memory/src/source-authority.test.ts") &&
    /\b(?:classifies explicit live user turns as user-authoritative source metadata|classifies cited researcher-report live turns as cited-soft only with source refs|sourceProfileId|authorityTier|citation_required|lower_authority_auto_admit|source refs)\b/iu.test(
      input.line,
    )
  );
}

function isOperationalTaxonomyTestLine(input: { filePath: string; line: string }): boolean {
  return (
    isTestProofOrScriptPath(input.filePath) &&
    /\b(?:classifies nano route failures separately from model-quality failures|classifyBenchmarkRouteFailure|classifies low coverage and quote failures as partial adaptive fallback work|classifyMemoryIngestionFailure|classifyDocumentIngestionFailure|permission|failureClass|routeFailure|provider_json_boundary|model_route_not_found|unsupported_strict_schema)\b/iu.test(
      input.line,
    )
  );
}

function isRetrievalPromptOrPackTestLine(input: { filePath: string; line: string }): boolean {
  if (/\b(?:shouldSurfaceFrom|includeBecauseIntent|semanticScore)\b/u.test(input.line)) {
    return false;
  }
  return (
    /(?:retrieval-request-interpreter\.test\.ts|real-retrieval-request-interpreter\.test\.ts|runtime\/retrieval\/(?:hierarchical-retrieval|phase2-controlled-retrieval-packs|project-state-capsules)\.test\.ts)$/u.test(
      input.filePath,
    ) &&
    /(?:Do not return fields like intent|rejects malformed retrieval output instead of backfilling intent|intent: "phase2_controlled_retrieval"|intent: "project status"|function subquery|score: 10)/u.test(
      input.line,
    )
  );
}

function isBenchmarkOrDiagnosticFixtureLine(input: { filePath: string; line: string }): boolean {
  if (
    /\b(?:shouldSurfaceFrom|includeInPack|candidateAuthority|candidate\.score\s*[><=])\b/u.test(
      input.line,
    )
  ) {
    return false;
  }
  return (
    /(?:benchmark-runner\.test\.ts|model-memory\.zero-candidate-text-search-diagnostic\.test\.ts|model-memory-live-cache-aware-benchmark\.mjs)$/u.test(
      input.filePath,
    ) &&
    /(?:ranks large-document compression strategies by evidence safety before token savings|preferredStrategy|\[acceptable\] score=|\[wrong\] score=|Source span span-fact-001 says)/iu.test(
      input.line,
    )
  );
}

function isPromptFixtureOrHumanReviewQuestionLine(input: {
  filePath: string;
  line: string;
}): boolean {
  if (/\bexpect\s*\(/u.test(input.line)) {
    return false;
  }
  return (
    /scripts\/model-memory-(?:model-driven-packet-experiment|phase2-authoritative-final-capture-proof|phase2-live-proactivity-generation-proof|phase2-proactivity-work-items-heartbeat-proof)\.mjs$/u.test(
      input.filePath,
    ) &&
    /\b(?:target budget|Bootstrap usability|more useful than a long raw projection|which one should be surfaced in heartbeat|usefulness-first live-generation follow-up|intent-specific CTA)\b/iu.test(
      input.line,
    )
  );
}

function isNoSemanticAuthorityPolicyTestLine(input: { filePath: string; line: string }): boolean {
  return (
    isTestProofOrScriptPath(input.filePath) &&
    /(?:semanticSimilarityTruthAllowed\)\.toBe\(false\)|semanticTruthWriteObserved\)\.toBe\(false\)|semantic truth|semantic memory|semanticSimilarityTruthAllowed: false)/iu.test(
      input.line,
    )
  );
}

function isNoSemanticPruningPolicyLine(input: { filePath: string; line: string }): boolean {
  if (/\b(?:semanticPruning:\s*true|semanticScore|shouldSurfaceFrom)\b/u.test(input.line)) {
    return false;
  }
  return (
    /(?:codex-session-memory-capture\.ts|codex-session-memory-capture\.test\.ts|document-source-adapter\.test\.ts)$/u.test(
      input.filePath,
    ) &&
    /\b(?:semanticPruning:\s*false|without semantic (?:filtering|pruning))\b/iu.test(input.line)
  );
}

function isHandoffOrUiFixtureLine(input: { filePath: string; line: string }): boolean {
  if (/\b(?:shouldSurfaceFrom|candidateAuthority|keywordScore|semanticScore)\b/u.test(input.line)) {
    return false;
  }
  return (
    /(?:phase2-proactive-planning-handoff-quality\.test\.ts|model-memory-phase2-proactive-planning-handoff-quality-proof\.mjs|ui\/src\/ui\/app-proactivity\.test\.ts)$/u.test(
      input.filePath,
    ) &&
    /\b(?:intent CTAs to useful expected output contracts|sourceRefs:|gateway:\/\/handoff-quality|useful agent work|if useful|suggestedAction)\b/iu.test(
      input.line,
    )
  );
}

function isModelMemoryComparisonOrReviewedFixtureLine(input: {
  filePath: string;
  line: string;
}): boolean {
  return (
    /(?:runtime-comparison\.test\.ts|model-memory\.duplicate-benchmark\.test\.ts|model-memory\.session-turn-proof\.test\.ts)$/u.test(
      input.filePath,
    ) &&
    /(?:classifies divergence, duplicate deltas, and supersession deltas object-natively|bootstraps semantic seeds from legacy reviewed case ids|storageEngine: "legacy")/iu.test(
      input.line,
    )
  );
}

function isProactivityFixtureCopyLine(input: { filePath: string; line: string }): boolean {
  if (
    /\b(?:shouldSurfaceFrom|surfaceFrom|futureCandidateFrom|candidateAuthority)\b/u.test(input.line)
  ) {
    return false;
  }
  if (/\bexpect\s*\(/u.test(input.line) && !/not\.to/u.test(input.line)) {
    return false;
  }
  return (
    /extensions\/model-memory\/src\/runtime\/phase2-(?:proactivity-growth-loops|proactivity-outcome-followup-loop|user-facing-proactivity-briefs)\.test\.ts$/u.test(
      input.filePath,
    ) &&
    /\b(?:generate useful proactive items without inbox fishing|Proof-originated items are still surfacing after completion|If useful, turn that missing context into a bounded checklist)\b/iu.test(
      input.line,
    )
  );
}

function isSemanticModuleTestNameLine(input: { filePath: string; line: string }): boolean {
  return (
    /extensions\/model-memory\/src\/(?:real-semantic-interpreter|semantic-collision-adjudication|semantic-identity|semantic-schema|semantic-validator)\.test\.ts$/u.test(
      input.filePath,
    ) && /^\s*describe\(/u.test(input.line)
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
  return (
    /^\s*(?:surface|status|defaultLivePathAllowed|rollbackFlag|auditRequired|reason):/u.test(
      input.line,
    ) || /^\s*"[^"]*",?$/u.test(input.line)
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

  if (isAuditInfrastructureLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "Audit and validation infrastructure names deterministic judgment debt so it can be found and removed; these lines do not operate as runtime semantic authority.",
    };
  }

  if (isModelOwnedInterpreterPlumbingLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "This line is model-owned interpreter or prompt-contract plumbing. Deterministic code may route, validate, and sanitize model I/O without owning semantic judgment.",
    };
  }

  if (isMmV2ProofInfrastructureLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "This line belongs to MMV2 proof/test infrastructure that resolves scripted model outputs or compares proof artifacts; it is not live runtime semantic authority.",
    };
  }

  if (isLargeDocumentProofOrchestrationLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "This line classifies large-document proof inputs or records proof-purpose metadata. It selects bounded proof corpora and does not decide memory meaning or user-facing value.",
    };
  }

  if (isLegacyProofRunnerInfrastructureLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "This proof runner line resolves scripted interpreter outputs or compares proof artifacts. It is not live runtime semantic authority.",
    };
  }

  if (isUiAttachmentKindStructuralLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "Attachment kind resolution is deterministic MIME/file-extension normalization for UI rendering, not memory meaning, usefulness, or surfacing value judgment.",
    };
  }

  if (isUiToolOutputMetadataStructuralLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "Tool-card output metadata inference only detects explicit truncation/full-content markers for UI transport state. It does not decide memory meaning, usefulness, candidate quality, or surfacing value.",
    };
  }

  if (isUiNavigationStructuralLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "UI base-path inference is deterministic route normalization for deployment paths. It does not decide memory meaning, usefulness, candidate quality, or surfacing value.",
    };
  }

  if (isExportSurfaceModelPlumbingLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "This export-surface line exposes model-owned interpreter/schema modules. It is API plumbing, not deterministic semantic authority.",
    };
  }

  if (isRetrievalModelOrPlanPlumbingLine({ filePath: input.filePath, line })) {
    return {
      classification: "acceptable_structural_retrieval_logic",
      confidence: "high",
      recommendedAction: "document_guardrail",
      eliminationRationale:
        "Retrieval request intent fields and prompt-contract text are model-owned retrieval planning plumbing. Deterministic code may carry the model plan and assemble recall candidates; it must not make final semantic inclusion judgment.",
    };
  }

  if (isModelMemoryProofAgentPlumbingLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "This line belongs to proof-agent prompt metadata or model-interpreter plumbing. It can guide proof review but does not run as production semantic authority.",
    };
  }

  if (isModelMemoryReportOnlyAgentLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "This agent line records proof/report-only structural classifications or retrieval recall scores. It does not run as production memory, surfacing, or context-pack inclusion authority.",
    };
  }

  if (isSemanticModuleImportExportOrTypePlumbingLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "This line is import/export/type plumbing for model-memory schema, interpreter, identity, or model-owned adjudication modules. It is not executable semantic authority by itself.",
    };
  }

  if (isOperationalFailureTaxonomyLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "Operational failure taxonomy classifies provider/runtime errors for reporting and retry policy. It does not decide memory meaning, usefulness, surfacing value, or candidate quality.",
    };
  }

  if (isNoSemanticAuthorityPolicyFlagLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "This line explicitly records that semantic truth, semantic-similarity authority, topic parser authority, or semantic writes are disabled. It is a guardrail against deterministic judgment.",
    };
  }

  if (isProactivityImportOrEvidenceRequirementLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "This proactivity line imports surfacing types or requires upstream surfacing evidence. It does not create candidates, author visible copy, or decide surfacing value.",
    };
  }

  if (isActionApprovalSafetyClassificationLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "Staged-action classifications are deterministic safety/control-plane states for approval or blocking, not semantic usefulness or candidate quality decisions.",
    };
  }

  if (isModelReviewedProposalSchemaLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "The shouldSurface field is part of the model-reviewed proposal schema. Deterministic code validates it; the judgment comes from the bounded model review.",
    };
  }

  if (isModelOrHumanPromptContractLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "This line is prompt-contract or operator-review text for a model/human judgment step. It does not perform deterministic judgment in runtime code.",
    };
  }

  if (isUiTransportOrExplicitStatusLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "This UI line transports explicit backend labels or statuses. It does not decide memory meaning, candidate value, or proactivity surfacing.",
    };
  }

  if (isProactivityLifecycleOrModelPromptLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "This proactivity line is a lifecycle/status field, model prompt text, or validator pattern. It does not create candidates, author visible card copy, or decide value without a model-owned path.",
    };
  }

  if (isModelOwnedAdmissionFallbackQuarantineLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "When model admission output is missing for a candidate, MMV2 fills required report scores only while quarantining the candidate. The deterministic fallback does not admit semantic truth.",
    };
  }

  if (isPromptOrReportContractTextLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "This line is prompt, report, or operator-review contract text. It names the judgment to be reviewed but does not execute deterministic value judgment.",
    };
  }

  if (isContractBoundaryTraceLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "This line records model contract-boundary or trace metadata. It does not make semantic admission, surfacing, or value decisions.",
    };
  }

  if (isProactivityRuntimeOrGatewayPlumbingLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "Gateway/runtime proactivity lines here import structural builders or transport explicit lifecycle status. They do not author visible copy or decide candidate value.",
    };
  }

  if (isDatabaseModelAdjudicationPlumbingLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "The database store may import structural identity and model-adjudication types to assemble candidates and route model decisions; these imports do not make final semantic judgments.",
    };
  }

  if (isLiveMemoryServiceModelOrSourceAuthorityLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "Live memory service lines here route model-owned adjudication, record source-authority guardrails, or report semantic contract boundaries. They do not perform deterministic semantic admission as final truth.",
    };
  }

  if (isProofPromptNormalizationPlumbingLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "Proof prompt normalization preserves/restores model prompt contracts and structural placeholders. It does not use deterministic semantic comparison as proof authority.",
    };
  }

  if (isMmV2WriteSimulationStructuralLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "Write simulation records a deterministic key derived from model-owned canonical candidates for proof accounting. It does not adjudicate admission, reconciliation, duplicate truth, or surfacing.",
    };
  }

  if (isReconciliationStructuralOrModelPlumbingLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "MMV2 reconciliation may use explicit structural identity keys and model interpreter plumbing. The referenced lines do not perform fuzzy semantic supersession as canonical truth.",
    };
  }

  if (isDuplicateBenchmarkReviewedArtifactLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "The duplicate benchmark line belongs to static reviewed benchmark labels or report fields. Runtime semantic fallback matching was removed; remaining reviewed labels are proof artifacts, not live duplicate truth.",
    };
  }

  if (isLiveShadowModelPlumbingLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "Live shadow adapters route model-owned interpreters and structural identity observations for comparison; they do not decide production memory meaning or surfacing value.",
    };
  }

  if (isProactivityArtifactOrSafetyLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "This proactivity surfacing line is artifact naming or deterministic safety validation. It does not select candidates, author visible copy, or decide product value.",
    };
  }

  if (isModelOwnedMemoryProofFixtureLine({ filePath: input.filePath, line })) {
    return {
      classification: "fixture_reference_noise",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "This proof script line is source fixture text fed to model-owned capture validation. It does not assert or execute deterministic semantic judgment.",
    };
  }

  if (isLiveRuntimeModelOrFailurePlumbingLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "Live runtime JSON/capture lines are model-executor plumbing or operational failure taxonomy, not deterministic memory meaning or value judgment.",
    };
  }

  if (isPrePhase2OperationalMetricLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "Pre-Phase-2 gate lines classify database extension availability and structural retrieval health metrics. They do not make semantic memory or surfacing decisions.",
    };
  }

  if (isRealCandidatePolicyGuardrailLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "These candidate policy flags explicitly prohibit semantic similarity truth and topic parser authority. They are guardrails against deterministic judgment.",
    };
  }

  if (isCaptureSeamNoWriteGuardrailLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "Capture seam fields record whether semantic memory writes were attempted and document no-write seams. This is persistence-boundary telemetry, not semantic truth.",
    };
  }

  if (isProactivityInboxStructuralLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "Inbox lines here are structural status/import/report-only simulation metadata. They do not decide candidate usefulness or visible card copy.",
    };
  }

  if (isDocumentIngestionOperationalLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "Document ingestion runner failure classification is an operational circuit-breaker taxonomy over provider/runtime errors, not memory meaning or user-facing value judgment.",
    };
  }

  if (isHybridRetrievalRecallOrAssemblyLine({ filePath: input.filePath, line })) {
    return {
      classification: "acceptable_structural_retrieval_logic",
      confidence: "high",
      recommendedAction: "document_guardrail",
      eliminationRationale:
        "Hybrid retrieval may use deterministic lexical, recency, graph/projection, source-lineage, ranking, and package-assembly signals to recall candidate memories. These are recall mechanics, not skill/proactivity/card value judgment.",
    };
  }

  if (isProactivityActionBoundaryGuardrailLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "Proactivity action-boundary classifications are deterministic safety policy states, not semantic usefulness or surfacing judgment.",
    };
  }

  if (isAutonomousSendBoundaryGuardrailLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "Autonomous-send boundary classifications are deterministic safety policy states and report-only controls, not semantic usefulness or surfacing judgment.",
    };
  }

  if (isProactivityFeedbackControlPlaneLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "Proactivity feedback lines are explicit operator control-plane metadata with semantic truth and memory-correction writes disabled, not inferred usefulness authority.",
    };
  }

  if (isSafeLevel1AutofixGuardrailLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "Safe Level 1 autofix lines explicitly block semantic truth mutation or route it to operator approval; they are safety guardrails.",
    };
  }

  if (isModelOwnedCollisionAdjudicationLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "Collision adjudication uses deterministic bounded summaries as model input; the semantic same-memory decision is returned by the model-owned adjudicator.",
    };
  }

  if (isLargeDocumentEvidenceModelTraceLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "Large-document evidence lines classify proof inputs or record model-interpreter traces; they do not make canonical semantic truth decisions.",
    };
  }

  if (isModelMemoryRecoveryOperationalLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "Recovery lines classify storage/restart health and recovery surfaces, not memory meaning or user-facing value.",
    };
  }

  if (isNoSemanticPruningPolicyLine({ filePath: input.filePath, line })) {
    return {
      classification: "valid_guardrail",
      confidence: "high",
      recommendedAction: "keep",
      eliminationRationale:
        "This line explicitly disables semantic packet pruning or names a no-pruning test. It is a guardrail against deterministic judgment, not a live semantic authority.",
    };
  }

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
    if (isTelegramTopicRoutingTestLine({ filePath: input.filePath, line })) {
      return {
        classification: "valid_guardrail",
        confidence: "high",
        recommendedAction: "keep",
        eliminationRationale:
          "This test uses Telegram topic/thread routing terminology. It is transport addressing, not keyword/topic semantic judgment.",
      };
    }
    if (isUiTransportFixtureTestLine({ filePath: input.filePath, line })) {
      return {
        classification: "valid_guardrail",
        confidence: "high",
        recommendedAction: "keep",
        eliminationRationale:
          "This UI test transports backend fixture labels or external search scores. It does not assert deterministic memory meaning, candidate quality, or surfacing value.",
      };
    }
    if (isFeedbackControlPlaneTestLine({ filePath: input.filePath, line })) {
      return {
        classification: "valid_guardrail",
        confidence: "high",
        recommendedAction: "keep",
        eliminationRationale:
          "This test asserts explicit feedback remains control-plane metadata or safety suppression. It does not make positive feedback semantic truth or future-candidate authority.",
      };
    }
    if (isProactivityBadExampleRejectionTestLine({ filePath: input.filePath, line })) {
      return {
        classification: "valid_guardrail",
        confidence: "high",
        recommendedAction: "keep",
        eliminationRationale:
          "This test/proof line names known bad deterministic card fragments so validators can reject or demote them. It does not preserve those fragments as acceptable output.",
      };
    }
    if (isModelReviewPromptFixtureLine({ filePath: input.filePath, line })) {
      return {
        classification: "fixture_reference_noise",
        confidence: "medium",
        recommendedAction: "keep",
        eliminationRationale:
          "This script line is model-review prompt or qualitative grading fixture text. It delegates judgment to a model/human review instead of asserting deterministic behavior.",
      };
    }
    if (isModelReviewedCandidateFixtureTestLine({ filePath: input.filePath, line })) {
      return {
        classification: "valid_guardrail",
        confidence: "high",
        recommendedAction: "keep",
        eliminationRationale:
          "This test/proof line carries explicit model-reviewed proposal fixture fields or proof metadata. It does not assert deterministic candidate discovery or surfacing authority.",
      };
    }
    if (isProactivityTestArtifactOrAbsenceLine({ filePath: input.filePath, line })) {
      return {
        classification: "valid_guardrail",
        confidence: "high",
        recommendedAction: "keep",
        eliminationRationale:
          "This test/proof line is proactivity artifact naming, report-title verification, or an absence/blocking assertion. It does not authorize deterministic surfacing.",
      };
    }
    if (isStructuralGuardrailTestDescriptionLine({ filePath: input.filePath, line })) {
      return {
        classification: "valid_guardrail",
        confidence: "high",
        recommendedAction: "keep",
        eliminationRationale:
          "This test line asserts deterministic guardrails, explicit compatibility gates, structural identity, or absence of semantic mutation. It does not preserve deterministic value judgment.",
      };
    }
    if (isSourceAuthorityStructuralTestLine({ filePath: input.filePath, line })) {
      return {
        classification: "valid_guardrail",
        confidence: "high",
        recommendedAction: "keep",
        eliminationRationale:
          "Source-authority tests classify source provenance and citation policy. They do not decide semantic memory meaning, candidate usefulness, or visible surfacing value.",
      };
    }
    if (isOperationalTaxonomyTestLine({ filePath: input.filePath, line })) {
      return {
        classification: "valid_guardrail",
        confidence: "high",
        recommendedAction: "keep",
        eliminationRationale:
          "This test/proof line covers operational failure taxonomy over provider/runtime errors or ingestion coverage states, not semantic value judgment.",
      };
    }
    if (isRetrievalPromptOrPackTestLine({ filePath: input.filePath, line })) {
      return {
        classification: "acceptable_structural_retrieval_logic",
        confidence: "high",
        recommendedAction: "document_guardrail",
        eliminationRationale:
          "This retrieval test line covers model-owned retrieval prompt fields or structural pack fixtures. It does not make final semantic context inclusion judgment.",
      };
    }
    if (isBenchmarkOrDiagnosticFixtureLine({ filePath: input.filePath, line })) {
      return {
        classification: "valid_guardrail",
        confidence: "high",
        recommendedAction: "keep",
        eliminationRationale:
          "This benchmark/diagnostic line records fixture scores or evidence-safety report expectations. It is not production semantic ranking or surfacing authority.",
      };
    }
    if (isNoSemanticAuthorityPolicyTestLine({ filePath: input.filePath, line })) {
      return {
        classification: "valid_guardrail",
        confidence: "high",
        recommendedAction: "keep",
        eliminationRationale:
          "This test/proof line asserts that semantic authority or semantic-memory mutation is disabled. It is a no-cheat guardrail, not deterministic judgment.",
      };
    }
    if (isHandoffOrUiFixtureLine({ filePath: input.filePath, line })) {
      return {
        classification: "valid_guardrail",
        confidence: "high",
        recommendedAction: "keep",
        eliminationRationale:
          "This handoff/UI test line carries explicit fixture copy, source refs, or expected-output contract labels. It does not make candidate usefulness or surfacing authority deterministic.",
      };
    }
    if (isModelMemoryComparisonOrReviewedFixtureLine({ filePath: input.filePath, line })) {
      return {
        classification: "valid_guardrail",
        confidence: "high",
        recommendedAction: "keep",
        eliminationRationale:
          "This model-memory test line covers object-native comparison, reviewed benchmark fixture seeds, or explicit storage-engine fixtures. It is not live deterministic semantic authority.",
      };
    }
    if (isProactivityFixtureCopyLine({ filePath: input.filePath, line })) {
      return {
        classification: "valid_guardrail",
        confidence: "high",
        recommendedAction: "keep",
        eliminationRationale:
          "This proactivity test line is fixture copy or bad-example input used to validate model-owned/card-quality boundaries. It does not assert deterministic card copy or surfacing value.",
      };
    }
    if (isPromptFixtureOrHumanReviewQuestionLine({ filePath: input.filePath, line })) {
      return {
        classification: "fixture_reference_noise",
        confidence: "medium",
        recommendedAction: "keep",
        eliminationRationale:
          "This script line is model/human review prompt text or proof prompt metadata. It asks for judgment; deterministic code does not answer it.",
      };
    }
    if (isSemanticModuleTestNameLine({ filePath: input.filePath, line })) {
      return {
        classification: "fixture_reference_noise",
        confidence: "high",
        recommendedAction: "keep",
        eliminationRationale:
          "This test describe line names semantic modules under test. It is not an assertion that deterministic code owns semantic judgment.",
      };
    }
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
        "hybrid retrieval candidate recall and package assembly signals",
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
