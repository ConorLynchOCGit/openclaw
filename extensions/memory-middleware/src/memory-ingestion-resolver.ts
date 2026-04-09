import { getCaptureMetadataByCaptureClass } from "openclaw/plugin-sdk/memory-family-policy";
import type { MemoryMiddlewareConfig } from "./config.js";
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
  type WorkflowImprovementNeedCategory,
  type WorkflowImprovementReasonCode,
  type WorkflowImprovementSemanticConfidence,
  type WorkflowImprovementTemplate,
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

type ResponseStyleSemanticCaptureClass = "explicit_requirement" | "requirement_correction";

type ProjectFactSemanticCaptureClass = "explicit_project_fact" | "project_fact_correction";

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

type ResponseStyleIngestionModeProfile = {
  mode: ResponseStyleIngestionMode;
  parseDirect: (text: string) => OrdinaryTurnAutoCaptureMatch | null;
  parseRawFallback?: (text: string) => OrdinaryTurnAutoCaptureMatch | null;
  allowForget: boolean;
  acceptedSemanticCaptureClasses: readonly ResponseStyleSemanticCaptureClass[];
};

type ProjectFactIngestionModeProfile = {
  mode: ProjectFactIngestionMode;
  parseDirect: (text: string) => OrdinaryTurnAutoCaptureMatch | null;
  parseRawFallback?: (text: string) => OrdinaryTurnAutoCaptureMatch | null;
  expectedCaptureClass: ProjectFactSemanticCaptureClass;
};

type ProjectFactSemanticDetectorProfile = {
  id: "supported_field" | "generalized_reference";
  detect:
    | typeof detectProjectFactSemanticDecision
    | typeof detectGenericProjectFactSemanticDecision;
  acceptedFactFamilies: readonly ProjectFactFamily[];
};

type RecurringProcedureSemanticDetectorProfile = {
  id: "recurring_procedure";
  detect: typeof detectRecurringProcedureSemanticDecision;
  acceptedProcedureFamilies: readonly RecurringProcedureFamily[];
};

type ResponseStyleSemanticDetectorProfile = {
  id: "response_style";
  detect: typeof detectResponseStyleSemanticDecision;
  acceptedCaptureClasses: readonly ResponseStyleSemanticCaptureClass[];
};

type WorkflowSemanticDetectorProfile = {
  id: "workflow_improvement" | "project_rule" | "unmet_need";
  detect:
    | typeof detectProjectRuleSemanticDecision
    | typeof detectUnmetNeedSemanticDecision
    | typeof detectWorkflowImprovementSemanticDecision;
  acceptedCaptureCategories: readonly ("workflow_improvement" | "project_rule" | "unmet_need")[];
};

type WorkflowCaptureCategory = "workflow_improvement" | "project_rule" | "unmet_need";

type ProjectFactSemanticCaptureDecision = Extract<
  | ReturnType<typeof detectProjectFactSemanticDecision>
  | ReturnType<typeof detectGenericProjectFactSemanticDecision>,
  { action: "capture" }
>;

type WorkflowSemanticCaptureDecision = Extract<
  | ReturnType<typeof detectProjectRuleSemanticDecision>
  | ReturnType<typeof detectUnmetNeedSemanticDecision>
  | ReturnType<typeof detectWorkflowImprovementSemanticDecision>,
  { action: "capture" }
>;

type RecurringProcedureSemanticCaptureDecision = Extract<
  ReturnType<typeof detectRecurringProcedureSemanticDecision>,
  { action: "capture" }
>;

type ResponseStyleSemanticDecision = ReturnType<typeof detectResponseStyleSemanticDecision>;

type ResolvedResponseStyleSemanticDecision =
  | {
      action: "capture";
      decision: Extract<ResponseStyleSemanticDecision, { action: "capture" }>;
    }
  | {
      action: "forget";
      decision: Extract<ResponseStyleSemanticDecision, { action: "forget" }>;
    };

const RESPONSE_STYLE_INGESTION_MODE_PROFILES = {
  ordinary_turn: {
    mode: "ordinary_turn",
    parseDirect: (text: string) =>
      parseOrdinaryTurnAutoCapturePreference(text, "user-preference-v2"),
    allowForget: true,
    acceptedSemanticCaptureClasses: ["explicit_requirement", "requirement_correction"],
  },
  candidate_learning: {
    mode: "candidate_learning",
    parseDirect: (text: string) => parseAutoCaptureManagedCandidateContent(text),
    parseRawFallback: (text: string) =>
      parseOrdinaryTurnAutoCapturePreference(text, "user-preference-v2"),
    allowForget: false,
    acceptedSemanticCaptureClasses: ["explicit_requirement"],
  },
  candidate_correction: {
    mode: "candidate_correction",
    parseDirect: (text: string) => parseManagedCorrectionCandidateContent(text),
    parseRawFallback: (text: string) =>
      parseOrdinaryTurnAutoCapturePreference(text, "user-preference-v2"),
    allowForget: false,
    acceptedSemanticCaptureClasses: ["requirement_correction"],
  },
} as const satisfies Record<ResponseStyleIngestionMode, ResponseStyleIngestionModeProfile>;

const PROJECT_FACT_INGESTION_MODE_PROFILES = {
  ordinary_turn: {
    mode: "ordinary_turn",
    parseDirect: (text: string) =>
      parseOrdinaryTurnAutoCapturePreference(text, "user-preference-v2"),
    expectedCaptureClass: "explicit_project_fact",
  },
  candidate_learning: {
    mode: "candidate_learning",
    parseDirect: (text: string) => parseAutoCaptureManagedCandidateContent(text),
    parseRawFallback: (text: string) =>
      parseOrdinaryTurnAutoCapturePreference(text, "user-preference-v2"),
    expectedCaptureClass: "explicit_project_fact",
  },
  candidate_correction: {
    mode: "candidate_correction",
    parseDirect: (text: string) => parseManagedCorrectionCandidateContent(text),
    parseRawFallback: (text: string) =>
      parseOrdinaryTurnAutoCapturePreference(text, "user-preference-v2"),
    expectedCaptureClass: "project_fact_correction",
  },
} as const satisfies Record<ProjectFactIngestionMode, ProjectFactIngestionModeProfile>;

const PROJECT_FACT_SEMANTIC_DETECTOR_PROFILES = [
  {
    id: "supported_field",
    detect: detectProjectFactSemanticDecision,
    acceptedFactFamilies: ["supported_field"],
  },
  {
    id: "generalized_reference",
    detect: detectGenericProjectFactSemanticDecision,
    acceptedFactFamilies: ["generalized_reference"],
  },
] as const satisfies readonly ProjectFactSemanticDetectorProfile[];

const WORKFLOW_SEMANTIC_DETECTOR_PROFILES = [
  {
    id: "project_rule",
    detect: detectProjectRuleSemanticDecision,
    acceptedCaptureCategories: ["project_rule"],
  },
  {
    id: "unmet_need",
    detect: detectUnmetNeedSemanticDecision,
    acceptedCaptureCategories: ["unmet_need"],
  },
  {
    id: "workflow_improvement",
    detect: detectWorkflowImprovementSemanticDecision,
    acceptedCaptureCategories: ["workflow_improvement"],
  },
] as const satisfies readonly WorkflowSemanticDetectorProfile[];

const RECURRING_PROCEDURE_SEMANTIC_DETECTOR_PROFILES = [
  {
    id: "recurring_procedure",
    detect: detectRecurringProcedureSemanticDecision,
    acceptedProcedureFamilies: ["supported_key", "generalized_named_checklist"],
  },
] as const satisfies readonly RecurringProcedureSemanticDetectorProfile[];

const RESPONSE_STYLE_SEMANTIC_DETECTOR_PROFILES = [
  {
    id: "response_style",
    detect: detectResponseStyleSemanticDecision,
    acceptedCaptureClasses: ["explicit_requirement", "requirement_correction"],
  },
] as const satisfies readonly ResponseStyleSemanticDetectorProfile[];

const SEMANTIC_DETECTOR_REGISTRY = {
  project_fact: PROJECT_FACT_SEMANTIC_DETECTOR_PROFILES,
  recurring_procedure: RECURRING_PROCEDURE_SEMANTIC_DETECTOR_PROFILES,
  response_style: RESPONSE_STYLE_SEMANTIC_DETECTOR_PROFILES,
  workflow: WORKFLOW_SEMANTIC_DETECTOR_PROFILES,
} as const;

function resolveSemanticDetectorDecision<
  TDecision extends { action: string },
  TProfile extends {
    id: string;
    detect: (text: string) => TDecision;
  },
  TCapture,
>(params: {
  text: string;
  profiles: readonly TProfile[];
  selectCapture: (decision: TDecision, profile: TProfile) => TCapture | null;
}): { profileId: TProfile["id"]; decision: TCapture } | null {
  for (const profile of params.profiles) {
    const decision = profile.detect(params.text);
    const capture = params.selectCapture(decision, profile);
    if (!capture) {
      continue;
    }
    return {
      profileId: profile.id,
      decision: capture,
    };
  }
  return null;
}

function resolveResponseStyleIngestionModeProfile(
  mode: ResponseStyleIngestionMode,
): ResponseStyleIngestionModeProfile {
  return RESPONSE_STYLE_INGESTION_MODE_PROFILES[mode];
}

function resolveProjectFactIngestionModeProfile(
  mode: ProjectFactIngestionMode,
): ProjectFactIngestionModeProfile {
  return PROJECT_FACT_INGESTION_MODE_PROFILES[mode];
}

function resolveResponseStyleSemanticCaptureAllowed(params: {
  profile: ResponseStyleIngestionModeProfile;
  captureClass: string;
}): boolean {
  return params.profile.acceptedSemanticCaptureClasses.includes(
    params.captureClass as ResponseStyleSemanticCaptureClass,
  );
}

function readProjectFactDeterministicEvidence(
  source: IngestionTextSource,
  primarySource: IngestionTextSource,
): string[] {
  return [source === primarySource ? "managed_content_pattern_match" : "raw_turn_pattern_match"];
}

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
  const profile = resolveResponseStyleIngestionModeProfile(params.mode);
  const directParsed = profile.parseDirect(params.text);
  if (directParsed) {
    const directMatch =
      params.mode === "candidate_correction"
        ? isResponseStyleCorrectionMatch(directParsed)
        : isResponseStyleLearningMatch(directParsed) ||
          (params.mode === "ordinary_turn" &&
            isSupportedResponseStyleTemplate(directParsed.template));
    if (directMatch) {
      return {
        parsed: directParsed,
        responseStyleFamily:
          directParsed.template === "response_style_generalized_guidance"
            ? "generalized_guidance"
            : "supported_template",
      };
    }
  }

  const fallbackParsed = profile.parseRawFallback?.(params.text) ?? null;
  if (!fallbackParsed) {
    return null;
  }
  const fallbackMatch =
    params.mode === "candidate_correction"
      ? isResponseStyleCorrectionMatch(fallbackParsed)
      : isResponseStyleLearningMatch(fallbackParsed);
  if (!fallbackMatch) {
    return null;
  }
  return {
    parsed: fallbackParsed,
    responseStyleFamily:
      fallbackParsed.template === "response_style_generalized_guidance"
        ? "generalized_guidance"
        : "supported_template",
  };
}

function resolveProjectFactDeterministicProfile(params: {
  text: string;
  profile: ProjectFactIngestionModeProfile;
}): {
  parsed: OrdinaryTurnAutoCaptureMatch;
  factFamily: ProjectFactFamily;
  fieldKey?: ProjectFactFieldKey;
  evidence: string[];
} | null {
  const directParsed = params.profile.parseDirect(params.text);
  const directDeterministic = directParsed
    ? resolveProjectFactDeterministicMatch({
        parsed: directParsed,
        expectedCaptureClass: params.profile.expectedCaptureClass,
      })
    : null;
  if (directParsed && directDeterministic) {
    return {
      parsed: directParsed,
      factFamily: directDeterministic.factFamily,
      ...(directDeterministic.fieldKey ? { fieldKey: directDeterministic.fieldKey } : {}),
      evidence: ["managed_content_pattern_match"],
    };
  }

  const fallbackParsed = params.profile.parseRawFallback?.(params.text) ?? null;
  const fallbackDeterministic = fallbackParsed
    ? resolveProjectFactDeterministicMatch({
        parsed: fallbackParsed,
        expectedCaptureClass: params.profile.expectedCaptureClass,
      })
    : null;
  if (fallbackParsed && fallbackDeterministic) {
    return {
      parsed: fallbackParsed,
      factFamily: fallbackDeterministic.factFamily,
      ...(fallbackDeterministic.fieldKey ? { fieldKey: fallbackDeterministic.fieldKey } : {}),
      evidence: ["raw_turn_pattern_match"],
    };
  }
  return null;
}

function resolveProjectFactSemanticDecision(params: {
  text: string;
  expectedCaptureClass: ProjectFactSemanticCaptureClass;
}): {
  profileId: ProjectFactSemanticDetectorProfile["id"];
  decision: ProjectFactSemanticCaptureDecision;
} | null {
  return resolveSemanticDetectorDecision<
    ReturnType<ProjectFactSemanticDetectorProfile["detect"]>,
    ProjectFactSemanticDetectorProfile,
    ProjectFactSemanticCaptureDecision
  >({
    text: params.text,
    profiles: SEMANTIC_DETECTOR_REGISTRY.project_fact,
    selectCapture: (decision, profile) => {
      if (decision.action !== "capture") {
        return null;
      }
      if (decision.match.captureClass !== params.expectedCaptureClass) {
        return null;
      }
      return (profile.acceptedFactFamilies as readonly ProjectFactFamily[]).includes(
        decision.match.factFamily,
      )
        ? decision
        : null;
    },
  });
}

function resolveRecurringProcedureSemanticDecision(text: string): {
  profileId: RecurringProcedureSemanticDetectorProfile["id"];
  decision: RecurringProcedureSemanticCaptureDecision;
} | null {
  return resolveSemanticDetectorDecision<
    ReturnType<RecurringProcedureSemanticDetectorProfile["detect"]>,
    RecurringProcedureSemanticDetectorProfile,
    RecurringProcedureSemanticCaptureDecision
  >({
    text,
    profiles: SEMANTIC_DETECTOR_REGISTRY.recurring_procedure,
    selectCapture: (decision, profile) => {
      if (decision.action !== "capture") {
        return null;
      }
      return (profile.acceptedProcedureFamilies as readonly RecurringProcedureFamily[]).includes(
        decision.match.procedureFamily,
      )
        ? decision
        : null;
    },
  });
}

function resolveResponseStyleSemanticDecision(params: {
  text: string;
  profile: ResponseStyleIngestionModeProfile;
}): {
  profileId: ResponseStyleSemanticDetectorProfile["id"];
  decision: ResolvedResponseStyleSemanticDecision;
} | null {
  return resolveSemanticDetectorDecision<
    ReturnType<ResponseStyleSemanticDetectorProfile["detect"]>,
    ResponseStyleSemanticDetectorProfile,
    ResolvedResponseStyleSemanticDecision
  >({
    text: params.text,
    profiles: SEMANTIC_DETECTOR_REGISTRY.response_style,
    selectCapture: (decision, profile) => {
      if (decision.action === "forget") {
        return params.profile.allowForget
          ? {
              action: "forget",
              decision,
            }
          : null;
      }
      if (decision.action !== "capture") {
        return null;
      }
      return (
        profile.acceptedCaptureClasses as readonly ResponseStyleSemanticCaptureClass[]
      ).includes(decision.match.captureClass) &&
        resolveResponseStyleSemanticCaptureAllowed({
          profile: params.profile,
          captureClass: decision.match.captureClass,
        })
        ? {
            action: "capture",
            decision,
          }
        : null;
    },
  });
}

export async function resolveResponseStyleIngestion(params: {
  config: MemoryMiddlewareConfig;
  content: string;
  primarySource: IngestionTextSource;
  rawCandidates?: string[];
  mode: ResponseStyleIngestionMode;
  allowPhrasePatternMatch: boolean;
}): Promise<ResolvedResponseStyleIngestion | null> {
  const profile = resolveResponseStyleIngestionModeProfile(params.mode);
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

      const semanticResolution = resolveResponseStyleSemanticDecision({
        text,
        profile,
      });
      if (!semanticResolution) {
        return null;
      }
      if (semanticResolution.decision.action === "forget") {
        const semanticDecision = semanticResolution.decision.decision;
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
      const semanticDecision = semanticResolution.decision.decision;

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
  const profile = resolveProjectFactIngestionModeProfile(params.mode);

  return resolveAcrossSources({
    content: params.content,
    primarySource: params.primarySource,
    rawCandidates: params.rawCandidates,
    tryResolve: async (text, source) => {
      const deterministic = resolveProjectFactDeterministicProfile({
        text,
        profile,
      });
      if (deterministic) {
        return {
          familyId: "project_fact" as const,
          parsed: deterministic.parsed,
          factFamily: deterministic.factFamily,
          ...(deterministic.fieldKey ? { fieldKey: deterministic.fieldKey } : {}),
          reviewMode:
            deterministic.factFamily === "generalized_reference"
              ? "hold_for_more_evidence"
              : "pending_confirmation",
          detectionSource: "deterministic" as const,
          confidence: "high" as const,
          evidence:
            source === params.primarySource
              ? readProjectFactDeterministicEvidence(source, params.primarySource)
              : deterministic.evidence,
        };
      }

      const semanticResolution = resolveProjectFactSemanticDecision({
        text,
        expectedCaptureClass: profile.expectedCaptureClass,
      });
      if (semanticResolution) {
        const { decision: semanticDecision } = semanticResolution;
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
      const semanticResolution = resolveRecurringProcedureSemanticDecision(text);
      if (!semanticResolution) {
        return null;
      }
      const { decision: semanticDecision } = semanticResolution;
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

function resolveWorkflowFamilyId(match: {
  captureClass: WorkflowImprovementCaptureClass;
}): "workflow_improvement" | "project_rule" | "unmet_need" {
  const captureCategory = getCaptureMetadataByCaptureClass(match.captureClass)?.category;
  if (captureCategory === "project_rule") {
    return "project_rule";
  }
  if (captureCategory === "unmet_need") {
    return "unmet_need";
  }
  if (captureCategory === "workflow_improvement") {
    return "workflow_improvement";
  }
  return "workflow_improvement";
}

function resolveWorkflowReviewMode(
  captureClass: WorkflowImprovementCaptureClass,
): "pending_confirmation" | "hold_for_more_evidence" {
  const captureCategory = getCaptureMetadataByCaptureClass(captureClass)?.category;
  if (captureCategory === "project_rule" || captureCategory === "unmet_need") {
    return "hold_for_more_evidence";
  }
  return captureClass === "workflow_generalized_guidance"
    ? "hold_for_more_evidence"
    : "pending_confirmation";
}

function resolveWorkflowSemanticDecision(text: string): {
  profileId: WorkflowSemanticDetectorProfile["id"];
  decision: WorkflowSemanticCaptureDecision;
} | null {
  return resolveSemanticDetectorDecision<
    ReturnType<WorkflowSemanticDetectorProfile["detect"]>,
    WorkflowSemanticDetectorProfile,
    WorkflowSemanticCaptureDecision
  >({
    text,
    profiles: SEMANTIC_DETECTOR_REGISTRY.workflow,
    selectCapture: (decision, profile) => {
      if (decision.action !== "capture") {
        return null;
      }
      const captureCategory = getCaptureMetadataByCaptureClass(decision.match.captureClass)
        ?.category as WorkflowCaptureCategory | undefined;
      if (!captureCategory) {
        return null;
      }
      return (profile.acceptedCaptureCategories as readonly WorkflowCaptureCategory[]).includes(
        captureCategory,
      )
        ? decision
        : null;
    },
  });
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
    familyId: resolveWorkflowFamilyId({
      captureClass: params.match.captureClass,
    }),
    parsed,
    lessonFamily,
    reviewMode: params.reviewMode,
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

  const semanticResolution = resolveWorkflowSemanticDecision(params.text);
  if (semanticResolution) {
    const { decision } = semanticResolution;
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
      reviewMode: resolveWorkflowReviewMode(decision.match.captureClass),
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
