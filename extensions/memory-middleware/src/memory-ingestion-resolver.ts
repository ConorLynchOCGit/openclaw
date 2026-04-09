import type { MemoryMiddlewareConfig } from "./config.js";
import { getMemoryFamilyDefinitionByWorkflowLessonFamily } from "./memory-family-registry.js";
import {
  type OrdinaryTurnAutoCaptureMatch,
  toOrdinaryTurnProjectFactMatch,
  toOrdinaryTurnRecurringProcedureMatch,
  toOrdinaryTurnResponseStyleMatch,
  toOrdinaryTurnWorkflowImprovementMatch,
} from "./memory-ingestion-types.js";
import {
  parseAutoCaptureManagedCandidateContent,
  parseManagedCorrectionCandidateContent,
  parseOrdinaryTurnAutoCapturePreference,
} from "./ordinary-turn-auto-capture.js";
import {
  detectGenericProjectFactSemanticDecision,
  detectProjectFactSemanticDecision,
  isBoundedGenericProjectFactReference,
  type ProjectFactFamily,
  type ProjectFactFieldKey,
  type ProjectFactSemanticConfidence,
} from "./project-fact-semantic.js";
import { detectProjectRuleSemanticDecision } from "./project-rule-semantic.js";
import {
  detectRecurringProcedureSemanticDecision,
  type RecurringProcedureFamily,
  type RecurringProcedureKey,
  type RecurringProcedureSemanticConfidence,
} from "./recurring-procedure-semantic.js";
import { findApprovedResponseStylePhrasePatternMatch } from "./response-style-phrase-induction.js";
import {
  detectResponseStyleSemanticDecision,
  isResponseStyleCorrectionMatch,
  isResponseStyleLearningMatch,
  isSupportedResponseStyleTemplate,
  type ResponseStyleFamily,
  type ResponseStyleSemanticConfidence,
} from "./response-style-semantic.js";
import { detectUnmetNeedSemanticDecision } from "./unmet-need-semantic.js";
import {
  detectWorkflowImprovementSemanticDecision,
  type WorkflowImprovementCaptureClass,
  type WorkflowImprovementGuidancePattern,
  type WorkflowImprovementLessonFamily,
  type WorkflowImprovementLessonKey,
  type WorkflowImprovementNeedCategory,
  type WorkflowImprovementReasonCode,
  type WorkflowImprovementSemanticConfidence,
  type WorkflowImprovementTemplate,
  type WorkflowImprovementToolKey,
} from "./workflow-improvement-semantic.js";
import { findApprovedWorkflowPhrasePatternMatch } from "./workflow-phrase-induction.js";

export type IngestionTextSource = "content" | "raw" | "transcript";

export type ResponseStyleIngestionMode =
  | "ordinary_turn"
  | "candidate_learning"
  | "candidate_correction";

export type ProjectFactIngestionMode =
  | "ordinary_turn"
  | "candidate_learning"
  | "candidate_correction";

export type ResolvedResponseStyleIngestion =
  | {
      action: "capture";
      familyId: "response_style";
      parsed: OrdinaryTurnAutoCaptureMatch;
      responseStyleFamily: ResponseStyleFamily;
      reviewMode: "direct" | "pending_confirmation" | "hold_for_more_evidence";
      source: IngestionTextSource;
      detectionSource: "deterministic" | "semantic";
      confidence: "high" | ResponseStyleSemanticConfidence;
      evidence: string[];
      observedText: string;
    }
  | {
      action: "forget";
      familyId: "response_style";
      source: IngestionTextSource;
      detectionSource: "semantic";
      confidence: "high";
      evidence: string[];
      subject: string;
      subjectKey: string;
      observedText: string;
    };

export type ResolvedProjectFactIngestion = {
  familyId: "project_fact";
  parsed: OrdinaryTurnAutoCaptureMatch;
  factFamily: ProjectFactFamily;
  fieldKey?: ProjectFactFieldKey;
  reviewMode: "pending_confirmation" | "hold_for_more_evidence";
  source: IngestionTextSource;
  detectionSource: "deterministic" | "semantic";
  confidence: "high" | ProjectFactSemanticConfidence;
  evidence: string[];
  observedText: string;
};

export type ResolvedRecurringProcedureIngestion = {
  familyId: "recurring_procedure";
  parsed: OrdinaryTurnAutoCaptureMatch;
  procedureFamily: RecurringProcedureFamily;
  procedureKey?: RecurringProcedureKey;
  reviewMode: "pending_confirmation" | "hold_for_more_evidence";
  source: IngestionTextSource;
  detectionSource: "semantic";
  confidence: "high" | RecurringProcedureSemanticConfidence;
  evidence: string[];
  observedText: string;
};

type ProjectFactDeterministicPredicate = (
  parsed: OrdinaryTurnAutoCaptureMatch,
) => { factFamily: ProjectFactFamily; fieldKey?: ProjectFactFieldKey } | null;

function inferProjectFactFieldKeyFromSubject(subject: string): ProjectFactFieldKey | null {
  const fieldLabel = subject.split("/").pop()?.trim().toLowerCase() ?? "";
  return fieldLabel === "default branch"
    ? "default_branch"
    : fieldLabel === "staging branch"
      ? "staging_branch"
      : fieldLabel === "repository url"
        ? "repository_url"
        : fieldLabel === "deployment url"
          ? "deployment_url"
          : fieldLabel === "documentation url"
            ? "documentation_url"
            : fieldLabel === "runbook url"
              ? "runbook_url"
              : fieldLabel === "primary package manager"
                ? "primary_package_manager"
                : fieldLabel === "primary environment name"
                  ? "primary_environment_name"
                  : null;
}

function normalizeGenericProjectFactSubjectLabel(subject: string): string | null {
  const fieldLabel = subject.split("/").pop()?.trim().toLowerCase() ?? "";
  return fieldLabel.length > 0 ? fieldLabel.replace(/\s+/g, " ") : null;
}

function resolveProjectFactDeterministicMatch(params: {
  parsed: OrdinaryTurnAutoCaptureMatch | null;
  expectedCaptureClass: "explicit_project_fact" | "project_fact_correction";
}): {
  parsed: OrdinaryTurnAutoCaptureMatch;
  factFamily: ProjectFactFamily;
  fieldKey?: ProjectFactFieldKey;
} | null {
  const { parsed, expectedCaptureClass } = params;
  if (
    !parsed ||
    parsed.captureClass !== expectedCaptureClass ||
    (parsed.template !== "project_fact_named_scope" &&
      parsed.template !== "project_fact_generalized_named_scope")
  ) {
    return null;
  }

  const fieldKey = inferProjectFactFieldKeyFromSubject(parsed.subject);
  if (fieldKey) {
    return {
      parsed,
      factFamily: "supported_field",
      fieldKey,
    };
  }

  const subjectLabel = normalizeGenericProjectFactSubjectLabel(parsed.subject);
  if (
    parsed.template === "project_fact_generalized_named_scope" &&
    subjectLabel &&
    isBoundedGenericProjectFactReference({
      subjectLabel,
      value: parsed.value,
    })
  ) {
    return {
      parsed,
      factFamily: "generalized_reference",
    };
  }

  return null;
}

async function resolveAcrossSources<T>(params: {
  content: string;
  primarySource: IngestionTextSource;
  rawCandidates?: string[];
  tryResolve: (text: string, source: IngestionTextSource) => Promise<T | null>;
}): Promise<(T & { source: IngestionTextSource; observedText: string }) | null> {
  const contentResolution = await params.tryResolve(params.content, params.primarySource);
  if (contentResolution) {
    return {
      ...contentResolution,
      source: params.primarySource,
      observedText: params.content,
    };
  }

  for (const rawCandidate of params.rawCandidates ?? []) {
    const rawResolution = await params.tryResolve(rawCandidate, "raw");
    if (rawResolution) {
      return {
        ...rawResolution,
        source: "raw",
        observedText: rawCandidate,
      };
    }
  }

  return null;
}

function resolveResponseStyleDeterministicMatch(params: {
  text: string;
  mode: ResponseStyleIngestionMode;
}): { parsed: OrdinaryTurnAutoCaptureMatch; responseStyleFamily: ResponseStyleFamily } | null {
  if (params.mode === "ordinary_turn") {
    const parsed = parseOrdinaryTurnAutoCapturePreference(params.text, "user-preference-v2");
    if (parsed && isSupportedResponseStyleTemplate(parsed.template)) {
      return {
        parsed,
        responseStyleFamily: "supported_template",
      };
    }
    return null;
  }

  if (params.mode === "candidate_learning") {
    const managedContent = parseAutoCaptureManagedCandidateContent(params.text);
    if (managedContent && isResponseStyleLearningMatch(managedContent)) {
      return {
        parsed: managedContent,
        responseStyleFamily:
          managedContent.template === "response_style_generalized_guidance"
            ? "generalized_guidance"
            : "supported_template",
      };
    }
    const rawTurn = parseOrdinaryTurnAutoCapturePreference(params.text, "user-preference-v2");
    if (rawTurn && isResponseStyleLearningMatch(rawTurn)) {
      return {
        parsed: rawTurn,
        responseStyleFamily:
          rawTurn.template === "response_style_generalized_guidance"
            ? "generalized_guidance"
            : "supported_template",
      };
    }
    return null;
  }

  const managedCorrection = parseManagedCorrectionCandidateContent(params.text);
  if (managedCorrection && isResponseStyleCorrectionMatch(managedCorrection)) {
    return {
      parsed: managedCorrection,
      responseStyleFamily:
        managedCorrection.template === "response_style_generalized_guidance"
          ? "generalized_guidance"
          : "supported_template",
    };
  }
  const rawCorrection = parseOrdinaryTurnAutoCapturePreference(params.text, "user-preference-v2");
  if (rawCorrection && isResponseStyleCorrectionMatch(rawCorrection)) {
    return {
      parsed: rawCorrection,
      responseStyleFamily:
        rawCorrection.template === "response_style_generalized_guidance"
          ? "generalized_guidance"
          : "supported_template",
    };
  }
  return null;
}

export async function resolveResponseStyleIngestion(params: {
  config: MemoryMiddlewareConfig;
  content: string;
  primarySource: IngestionTextSource;
  rawCandidates?: string[];
  mode: ResponseStyleIngestionMode;
  allowPhrasePatternMatch: boolean;
}): Promise<ResolvedResponseStyleIngestion | null> {
  const resolution = (await resolveAcrossSources({
    content: params.content,
    primarySource: params.primarySource,
    rawCandidates: params.rawCandidates,
    tryResolve: async (text) => {
      const deterministic = resolveResponseStyleDeterministicMatch({
        text,
        mode: params.mode,
      });
      if (deterministic) {
        return {
          action: "capture" as const,
          familyId: "response_style" as const,
          parsed: deterministic.parsed,
          responseStyleFamily: deterministic.responseStyleFamily,
          reviewMode:
            deterministic.responseStyleFamily === "generalized_guidance"
              ? "hold_for_more_evidence"
              : "direct",
          detectionSource: "deterministic" as const,
          confidence: "high" as const,
          evidence: ["deterministic_pattern_match"],
        };
      }

      if (params.allowPhrasePatternMatch) {
        const phraseMatch = await findApprovedResponseStylePhrasePatternMatch({
          config: params.config,
          text,
        });
        if (phraseMatch) {
          return {
            action: "capture" as const,
            familyId: "response_style" as const,
            parsed: toOrdinaryTurnResponseStyleMatch(phraseMatch.match),
            responseStyleFamily: phraseMatch.match.family,
            reviewMode:
              phraseMatch.match.family === "generalized_guidance"
                ? "hold_for_more_evidence"
                : "direct",
            detectionSource: "deterministic" as const,
            confidence: "high" as const,
            evidence: ["approved_phrase_pattern_match"],
          };
        }
      }

      const semanticDecision = detectResponseStyleSemanticDecision(text);
      if (semanticDecision.action === "forget") {
        if (params.mode !== "ordinary_turn") {
          return null;
        }
        return {
          action: "forget" as const,
          familyId: "response_style" as const,
          detectionSource: "semantic" as const,
          confidence: "high" as const,
          evidence: semanticDecision.evidence,
          subject: semanticDecision.subject,
          subjectKey: semanticDecision.subjectKey,
        };
      }
      if (semanticDecision.action !== "capture") {
        return null;
      }

      if (
        params.mode === "candidate_learning" &&
        semanticDecision.match.captureClass !== "explicit_requirement"
      ) {
        return null;
      }
      if (
        params.mode === "candidate_correction" &&
        semanticDecision.match.captureClass !== "requirement_correction"
      ) {
        return null;
      }

      return {
        action: "capture" as const,
        familyId: "response_style" as const,
        parsed: toOrdinaryTurnResponseStyleMatch(semanticDecision.match),
        responseStyleFamily: semanticDecision.match.family,
        reviewMode: (semanticDecision.match.family === "generalized_guidance"
          ? "hold_for_more_evidence"
          : semanticDecision.confidence === "high"
            ? "direct"
            : "pending_confirmation") as
          | "direct"
          | "pending_confirmation"
          | "hold_for_more_evidence",
        detectionSource: "semantic" as const,
        confidence: semanticDecision.confidence,
        evidence: semanticDecision.evidence,
      };
    },
  })) as ResolvedResponseStyleIngestion | null;

  return resolution;
}

export function resolveProjectFactIngestion(params: {
  content: string;
  primarySource: IngestionTextSource;
  rawCandidates?: string[];
  mode: ProjectFactIngestionMode;
}): Promise<ResolvedProjectFactIngestion | null> {
  const contentDeterministicResolver: ProjectFactDeterministicPredicate =
    params.mode === "candidate_correction"
      ? (parsed) =>
          resolveProjectFactDeterministicMatch({
            parsed,
            expectedCaptureClass: "project_fact_correction",
          })
      : (parsed) =>
          resolveProjectFactDeterministicMatch({
            parsed,
            expectedCaptureClass: "explicit_project_fact",
          });

  const resolveParsed = (text: string): OrdinaryTurnAutoCaptureMatch | null => {
    if (params.mode === "ordinary_turn") {
      return parseOrdinaryTurnAutoCapturePreference(text, "user-preference-v2");
    }
    if (params.mode === "candidate_learning") {
      return parseAutoCaptureManagedCandidateContent(text);
    }
    return parseManagedCorrectionCandidateContent(text);
  };

  return resolveAcrossSources({
    content: params.content,
    primarySource: params.primarySource,
    rawCandidates: params.rawCandidates,
    tryResolve: async (text, source) => {
      const directParsed = resolveParsed(text);
      const directDeterministic = directParsed ? contentDeterministicResolver(directParsed) : null;
      if (directParsed && directDeterministic) {
        return {
          familyId: "project_fact" as const,
          parsed: directParsed,
          factFamily: directDeterministic.factFamily,
          ...(directDeterministic.fieldKey ? { fieldKey: directDeterministic.fieldKey } : {}),
          reviewMode:
            directDeterministic.factFamily === "generalized_reference"
              ? "hold_for_more_evidence"
              : "pending_confirmation",
          detectionSource: "deterministic" as const,
          confidence: "high" as const,
          evidence: [
            source === params.primarySource
              ? "managed_content_pattern_match"
              : "raw_turn_pattern_match",
          ],
        };
      }

      const rawTurnParsed =
        params.mode === "ordinary_turn"
          ? null
          : parseOrdinaryTurnAutoCapturePreference(text, "user-preference-v2");
      const rawTurnDeterministic = rawTurnParsed
        ? contentDeterministicResolver(rawTurnParsed)
        : null;
      if (rawTurnParsed && rawTurnDeterministic) {
        return {
          familyId: "project_fact" as const,
          parsed: rawTurnParsed,
          factFamily: rawTurnDeterministic.factFamily,
          ...(rawTurnDeterministic.fieldKey ? { fieldKey: rawTurnDeterministic.fieldKey } : {}),
          reviewMode:
            rawTurnDeterministic.factFamily === "generalized_reference"
              ? "hold_for_more_evidence"
              : "pending_confirmation",
          detectionSource: "deterministic" as const,
          confidence: "high" as const,
          evidence: ["raw_turn_pattern_match"],
        };
      }

      const semanticDecision = detectProjectFactSemanticDecision(text);
      if (
        semanticDecision.action === "capture" &&
        ((params.mode === "candidate_correction" &&
          semanticDecision.match.captureClass === "project_fact_correction") ||
          (params.mode !== "candidate_correction" &&
            semanticDecision.match.captureClass === "explicit_project_fact"))
      ) {
        return {
          familyId: "project_fact" as const,
          parsed: toOrdinaryTurnProjectFactMatch(semanticDecision.match),
          factFamily: semanticDecision.match.factFamily,
          ...(semanticDecision.match.fieldKey ? { fieldKey: semanticDecision.match.fieldKey } : {}),
          reviewMode: "pending_confirmation" as const,
          detectionSource: "semantic" as const,
          confidence: semanticDecision.confidence,
          evidence: semanticDecision.evidence,
        };
      }

      const genericDecision = detectGenericProjectFactSemanticDecision(text);
      if (
        genericDecision.action === "capture" &&
        ((params.mode === "candidate_correction" &&
          genericDecision.match.captureClass === "project_fact_correction") ||
          (params.mode !== "candidate_correction" &&
            genericDecision.match.captureClass === "explicit_project_fact"))
      ) {
        return {
          familyId: "project_fact" as const,
          parsed: toOrdinaryTurnProjectFactMatch(genericDecision.match),
          factFamily: genericDecision.match.factFamily,
          reviewMode: "hold_for_more_evidence" as const,
          detectionSource: "semantic" as const,
          confidence: genericDecision.confidence,
          evidence: genericDecision.evidence,
        };
      }

      return null;
    },
  });
}

export function resolveRecurringProcedureIngestion(params: {
  content: string;
  primarySource: IngestionTextSource;
  rawCandidates?: string[];
}): Promise<ResolvedRecurringProcedureIngestion | null> {
  return resolveAcrossSources({
    content: params.content,
    primarySource: params.primarySource,
    rawCandidates: params.rawCandidates,
    tryResolve: async (text) => {
      const semanticDecision = detectRecurringProcedureSemanticDecision(text);
      if (semanticDecision.action !== "capture") {
        return null;
      }
      return {
        familyId: "recurring_procedure" as const,
        parsed: toOrdinaryTurnRecurringProcedureMatch(semanticDecision.match),
        procedureFamily: semanticDecision.match.procedureFamily,
        ...(semanticDecision.match.procedureKey
          ? { procedureKey: semanticDecision.match.procedureKey }
          : {}),
        reviewMode:
          semanticDecision.match.procedureFamily === "supported_key"
            ? "pending_confirmation"
            : "hold_for_more_evidence",
        detectionSource: "semantic" as const,
        confidence: semanticDecision.confidence,
        evidence: semanticDecision.evidence,
      };
    },
  });
}

export type ResolvedWorkflowIngestion = {
  familyId: "workflow_improvement" | "project_rule" | "unmet_need";
  parsed: OrdinaryTurnAutoCaptureMatch;
  lessonFamily: WorkflowImprovementLessonFamily;
  reviewMode: "pending_confirmation" | "hold_for_more_evidence";
  lessonKey?: WorkflowImprovementLessonKey;
  toolKey?: WorkflowImprovementToolKey;
  guidancePattern?: WorkflowImprovementGuidancePattern;
  source: IngestionTextSource;
  detectionSource: "semantic" | "deterministic";
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  observedText: string;
};

export type ResolvedCanonicalizableIngestion =
  | ResolvedProjectFactIngestion
  | ResolvedRecurringProcedureIngestion
  | ResolvedWorkflowIngestion
  | Extract<ResolvedResponseStyleIngestion, { action: "capture" }>;

function resolveWorkflowFamilyId(
  lessonFamily: WorkflowImprovementLessonFamily,
): "workflow_improvement" | "project_rule" | "unmet_need" {
  const definition = getMemoryFamilyDefinitionByWorkflowLessonFamily(lessonFamily);
  if (
    definition?.id === "workflow_improvement" ||
    definition?.id === "project_rule" ||
    definition?.id === "unmet_need"
  ) {
    return definition.id;
  }
  return "workflow_improvement";
}

function buildResolvedWorkflowIngestion(params: {
  match: {
    captureClass: WorkflowImprovementCaptureClass;
    candidateKind: "improvement";
    reasonCode: WorkflowImprovementReasonCode;
    template: WorkflowImprovementTemplate;
    lessonFamily: WorkflowImprovementLessonFamily;
    projectScope?: string;
    normalizedProjectScope?: string;
    lessonKey?: WorkflowImprovementLessonKey;
    toolKey?: WorkflowImprovementToolKey;
    guidancePattern?: WorkflowImprovementGuidancePattern;
    needCategory?: WorkflowImprovementNeedCategory;
    subject: string;
    value: string;
    normalizedSubject: string;
    normalizedValue: string;
    content: string;
    subjectKey: string;
    key: string;
    neededCapability?: string;
    normalizedNeededCapability?: string;
    recommendedAction?: string;
    normalizedRecommendedAction?: string;
    avoidAction?: string;
    normalizedAvoidAction?: string;
    rationale?: string;
    normalizedRationale?: string;
  };
  source: IngestionTextSource;
  detectionSource: "semantic" | "deterministic";
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  reviewMode: "pending_confirmation" | "hold_for_more_evidence";
  observedText: string;
}): ResolvedWorkflowIngestion {
  const parsed = toOrdinaryTurnWorkflowImprovementMatch(params.match);
  const lessonFamily = parsed.lessonFamily ?? params.match.lessonFamily;
  return {
    familyId: resolveWorkflowFamilyId(lessonFamily),
    parsed,
    lessonFamily,
    reviewMode: params.reviewMode,
    ...(parsed.lessonKey ? { lessonKey: parsed.lessonKey } : {}),
    ...(parsed.toolKey ? { toolKey: parsed.toolKey } : {}),
    ...(parsed.guidancePattern ? { guidancePattern: parsed.guidancePattern } : {}),
    source: params.source,
    detectionSource: params.detectionSource,
    confidence: params.confidence,
    evidence: params.evidence,
    observedText: params.observedText,
  };
}

async function resolveWorkflowImprovementText(params: {
  config: MemoryMiddlewareConfig;
  text: string;
  projectId?: string;
  allowPhrasePatternMatch: boolean;
  source: IngestionTextSource;
}): Promise<Omit<ResolvedWorkflowIngestion, "source" | "observedText"> | null> {
  if (params.allowPhrasePatternMatch && params.projectId) {
    const deterministicPattern = await findApprovedWorkflowPhrasePatternMatch({
      config: params.config,
      text: params.text,
      projectId: params.projectId,
    });
    if (deterministicPattern) {
      const {
        source: _source,
        observedText: _observedText,
        ...resolved
      } = buildResolvedWorkflowIngestion({
        match: deterministicPattern.match,
        source: params.source,
        detectionSource: "deterministic",
        confidence: "high",
        evidence: ["approved_phrase_pattern_match"],
        reviewMode: "hold_for_more_evidence",
        observedText: params.text,
      });
      return resolved;
    }
  }

  const semanticDetectors = [
    {
      detect: detectProjectRuleSemanticDecision,
      reviewMode: "hold_for_more_evidence" as const,
    },
    {
      detect: detectUnmetNeedSemanticDecision,
      reviewMode: "hold_for_more_evidence" as const,
    },
    {
      detect: detectWorkflowImprovementSemanticDecision,
      reviewModeFromMatch: (match: { lessonFamily: WorkflowImprovementLessonFamily }) =>
        match.lessonFamily === "supported_lesson"
          ? ("pending_confirmation" as const)
          : ("hold_for_more_evidence" as const),
    },
  ] as const;

  for (const detector of semanticDetectors) {
    const decision = detector.detect(params.text);
    if (decision.action !== "capture") {
      continue;
    }
    const reviewMode =
      "reviewModeFromMatch" in detector
        ? detector.reviewModeFromMatch(decision.match)
        : detector.reviewMode;
    const {
      source: _source,
      observedText: _observedText,
      ...resolved
    } = buildResolvedWorkflowIngestion({
      match: decision.match,
      source: params.source,
      detectionSource: "semantic",
      confidence: decision.confidence,
      evidence: decision.evidence,
      reviewMode,
      observedText: params.text,
    });
    return resolved;
  }

  return null;
}

export async function resolveWorkflowImprovementIngestion(params: {
  config: MemoryMiddlewareConfig;
  content: string;
  primarySource: IngestionTextSource;
  rawCandidates?: string[];
  projectId?: string;
  allowPhrasePatternMatch: boolean;
}): Promise<ResolvedWorkflowIngestion | null> {
  return resolveAcrossSources({
    content: params.content,
    primarySource: params.primarySource,
    rawCandidates: params.rawCandidates,
    tryResolve: async (text, source) =>
      resolveWorkflowImprovementText({
        config: params.config,
        text,
        projectId: params.projectId,
        allowPhrasePatternMatch: params.allowPhrasePatternMatch,
        source,
      }),
  });
}
