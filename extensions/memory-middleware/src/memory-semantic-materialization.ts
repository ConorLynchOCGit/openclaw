import { createHash } from "node:crypto";
import {
  createCanonicalMemoryRecord,
  type CanonicalMemoryScope,
} from "openclaw/plugin-sdk/memory-canonical-core";
import type { CanonicalMemoryIngestionCandidate } from "openclaw/plugin-sdk/memory-canonical-ingestion";
import { createCanonicalMemoryIngestionCandidate } from "openclaw/plugin-sdk/memory-canonical-ingestion";
import type { DocumentMemoryIngestionCategory } from "./document-memory-ingestion-types.js";
import { buildCanonicalMemoryIngestionCandidateFromAutoCaptureMatch } from "./memory-canonical-compat-builders.js";
import type { CompatibilityMemoryProfileId } from "./memory-compatibility-profile.js";
import {
  toOrdinaryTurnProjectFactMatch,
  toOrdinaryTurnRecurringProcedureMatch,
  toOrdinaryTurnResponseStyleMatch,
  toOrdinaryTurnWorkflowImprovementMatch,
  type OrdinaryTurnAutoCaptureMatch,
} from "./memory-ingestion-types.js";
import type {
  MemorySemanticObject,
  MemorySemanticPreferenceObject,
  MemorySemanticProjectFactObject,
  MemorySemanticRoutingObject,
} from "./memory-semantic-interpretation.js";
import type { ValidatedMemorySemanticObject } from "./memory-semantic-validation.js";
import {
  createProjectFactCanonicalMatch,
  type ProjectFactFamily,
  type ProjectFactFieldKey,
} from "./project-fact-semantic.js";
import {
  createRecurringProcedureCanonicalMatch,
  type RecurringProcedureFamily,
} from "./recurring-procedure-semantic.js";
import {
  createResponseStyleCanonicalMatch,
  type ResponseStyleFamily,
} from "./response-style-semantic.js";
import {
  createGeneralizedWorkflowImprovementMatch,
  createSpecificWorkflowImprovementCanonicalMatch,
  type WorkflowImprovementGuidancePattern,
  type WorkflowImprovementLessonFamily,
} from "./workflow-improvement-semantic.js";

export type MaterializedMemorySemanticForgetProjection = {
  subject: string;
  subjectKey: string;
  evidence: string[];
  observedText: string;
  reviewMode: "direct" | "pending_confirmation" | "hold_for_more_evidence";
  confidence: "high" | "medium";
};

export type MaterializedMemorySemanticCaptureProjection = {
  category: DocumentMemoryIngestionCategory;
  match: OrdinaryTurnAutoCaptureMatch;
  canonicalCandidate: CanonicalMemoryIngestionCandidate;
  evidence: string[];
  observedText: string;
  reviewMode: "direct" | "pending_confirmation" | "hold_for_more_evidence";
  confidence: "high" | "medium";
  responseStyleFamily?: ResponseStyleFamily;
  factFamily?: ProjectFactFamily;
  fieldKey?: ProjectFactFieldKey;
  procedureFamily?: RecurringProcedureFamily;
  lessonFamily?: WorkflowImprovementLessonFamily;
  guidancePattern?: WorkflowImprovementGuidancePattern;
};

export type MaterializedMemorySemanticResult =
  | {
      action: "forget";
      object: Extract<MemorySemanticObject, { kind: "preference" }>;
      projection: MaterializedMemorySemanticForgetProjection;
    }
  | {
      action: "capture";
      object: MemorySemanticObject;
      projection: MaterializedMemorySemanticCaptureProjection;
    };

function normalizeLower(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[`"'()[\]{}:;,.!?/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createStableKey(parts: Array<string | undefined>): string {
  return createHash("sha256")
    .update(parts.map((part) => part?.trim() ?? "").join("|"))
    .digest("hex")
    .slice(0, 16);
}

function buildSubjectKey(normalizedSubject: string): string {
  return createStableKey(["subject", normalizedSubject]);
}

function buildMatchKey(params: {
  captureClass: OrdinaryTurnAutoCaptureMatch["captureClass"];
  normalizedSubject: string;
  normalizedValue: string;
  projectScope?: string;
}): string {
  return createStableKey([
    params.captureClass,
    params.normalizedSubject,
    params.normalizedValue,
    params.projectScope ? normalizeLower(params.projectScope) : "",
  ]);
}

function renderPreferenceStatement(object: MemorySemanticPreferenceObject): string {
  return object.instruction;
}

function renderProjectFactStatement(object: MemorySemanticProjectFactObject): string {
  return `${object.subject}: ${object.value}`;
}

function renderProcedureStatement(title: string, steps: string[]): string {
  return `${title}: ${steps.join("; ")}`;
}

function renderRoutingStatement(object: MemorySemanticRoutingObject): string {
  const resources =
    object.companionResources && object.companionResources.length > 0
      ? [object.primaryResource, ...object.companionResources].join(" and ")
      : object.primaryResource;
  return `For ${object.task}, use ${resources}.`;
}

function renderCorrectionStatement(
  object: Extract<MemorySemanticObject, { kind: "correction" }>,
): string {
  if (object.correctionKind === "missing_capability" && object.neededCapability) {
    return object.rationaleText
      ? `Need ${object.neededCapability} for ${object.subject} because ${object.rationaleText}.`
      : `Need ${object.neededCapability} for ${object.subject}.`;
  }
  if (object.recommendedAction && object.avoidAction) {
    return `Use ${object.recommendedAction} instead of ${object.avoidAction}.`;
  }
  if (object.recommendedAction) {
    return object.rationaleText
      ? `${object.recommendedAction}. ${object.rationaleText}`
      : object.recommendedAction;
  }
  if (object.avoidAction) {
    return object.rationaleText
      ? `Avoid ${object.avoidAction}. ${object.rationaleText}`
      : `Avoid ${object.avoidAction}.`;
  }
  return object.subject;
}

function resolveScopeProjectId(
  validated: ValidatedMemorySemanticObject,
  explicitProjectId?: string,
): string | undefined {
  return explicitProjectId ?? validated.object.scope?.projectId;
}

function buildCanonicalCandidate(params: {
  profileId: CompatibilityMemoryProfileId;
  match: OrdinaryTurnAutoCaptureMatch;
  reviewMode: "direct" | "pending_confirmation" | "hold_for_more_evidence";
  evidence: string[];
  observedText: string;
  projectId?: string;
  captureSeam: string;
  captureProfile: string;
}): CanonicalMemoryIngestionCandidate {
  return buildCanonicalMemoryIngestionCandidateFromAutoCaptureMatch({
    profileId: params.profileId,
    match: params.match,
    reviewMode: params.reviewMode,
    detectionSource: "semantic",
    evidence: params.evidence,
    observedText: params.observedText,
    ...(params.projectId ? { projectId: params.projectId } : {}),
    captureSeam: params.captureSeam,
    captureProfile: params.captureProfile,
  });
}

function resolveRoutingCanonicalScope(params: {
  object: MemorySemanticRoutingObject;
  projectId?: string;
}): CanonicalMemoryScope {
  const projectId = params.projectId ?? params.object.scope?.projectId;
  if (projectId) {
    return { kind: "mixed", projectId };
  }
  if (params.object.scope?.projectScope) {
    return { kind: "mixed" };
  }
  return { kind: "global" };
}

function buildRoutingCanonicalCandidate(params: {
  object: MemorySemanticRoutingObject;
  match: OrdinaryTurnAutoCaptureMatch;
  reviewMode: "direct" | "pending_confirmation" | "hold_for_more_evidence";
  evidence: string[];
  observedText: string;
  projectId?: string;
  captureSeam: string;
  captureProfile: string;
}): CanonicalMemoryIngestionCandidate {
  return createCanonicalMemoryIngestionCandidate({
    record: createCanonicalMemoryRecord({
      kind: "reference",
      subject: params.object.task,
      statement: renderRoutingStatement(params.object),
      scope: resolveRoutingCanonicalScope({
        object: params.object,
        projectId: params.projectId,
      }),
      confidence: { level: params.reviewMode === "hold_for_more_evidence" ? "medium" : "high" },
      validationStatus: params.reviewMode === "direct" ? "approved" : params.reviewMode,
      provenance: {
        captureSeam: params.captureSeam,
        captureProfile: params.captureProfile,
        reviewState: params.reviewMode,
      },
      facets: {
        subjectKey: params.match.subjectKey,
        captureClass: params.match.captureClass,
        reasonCode: params.match.reasonCode,
        template: params.match.template,
        ...(params.match.projectScope ? { projectScope: params.match.projectScope } : {}),
        ...(params.object.rationaleText ? { rationale: params.object.rationaleText } : {}),
      },
      tags: ["reference", "reference_routing", "semantic_ingestion"],
      compatibility: {
        captureCategory: "reference_routing",
      },
    }),
    identity: {
      dedupeKey: params.match.key,
      clusterKey: params.match.key,
      subjectKey: params.match.subjectKey,
    },
    capture: {
      mode: "ordinary_turn",
      source: "transcript",
      observedText: params.observedText,
      evidence: params.evidence,
      detectionSource: "semantic",
      reviewMode: params.reviewMode,
    },
    compatibility: {
      candidateKind: params.match.candidateKind,
      captureClass: params.match.captureClass,
      reasonCode: params.match.reasonCode,
      template: params.match.template,
      metadata: {
        resourceType: "reference_routing",
      },
    },
  });
}

function buildResponseStyleProjection(params: {
  validated: ValidatedMemorySemanticObject;
  captureSeam: string;
  captureProfile: string;
}): MaterializedMemorySemanticResult {
  const object = params.validated.object;
  if (object.kind !== "preference") {
    throw new Error("expected preference object");
  }
  const normalizedSubject = normalizeLower(object.subject);
  const subjectKey = buildSubjectKey(normalizedSubject);
  if (object.operation === "forget") {
    return {
      action: "forget",
      object,
      projection: {
        subject: object.subject,
        subjectKey,
        evidence: params.validated.evidence,
        observedText: params.validated.observedText,
        reviewMode: params.validated.reviewMode,
        confidence: params.validated.confidence,
      },
    };
  }
  const responseStyleProfile =
    object.preferenceProfile === "concise"
      ? { template: "responses_concise" as const, family: "supported_template" as const }
      : object.preferenceProfile === "bullets"
        ? { template: "responses_bullets" as const, family: "supported_template" as const }
        : object.preferenceProfile === "plain_english"
          ? { template: "responses_plain_english" as const, family: "supported_template" as const }
          : object.preferenceProfile === "no_tables"
            ? { template: "responses_no_tables" as const, family: "supported_template" as const }
            : object.preferenceProfile === "numbered_steps"
              ? {
                  template: "responses_numbered_steps" as const,
                  family: "supported_template" as const,
                }
              : {
                  template: "response_style_generalized_guidance" as const,
                  family: "generalized_guidance" as const,
                };
  const match = {
    ...toOrdinaryTurnResponseStyleMatch(
      createResponseStyleCanonicalMatch({
        template: responseStyleProfile.template,
        family: responseStyleProfile.family,
        subject: object.subject,
        value: renderPreferenceStatement(object),
      }),
    ),
    profile: "user-preference-v2" as const,
  } satisfies OrdinaryTurnAutoCaptureMatch;
  return {
    action: "capture",
    object,
    projection: {
      category: "response_style",
      match,
      canonicalCandidate: buildCanonicalCandidate({
        profileId: "response_style",
        match,
        reviewMode: params.validated.reviewMode,
        evidence: params.validated.evidence,
        observedText: params.validated.observedText,
        captureSeam: params.captureSeam,
        captureProfile: params.captureProfile,
      }),
      evidence: params.validated.evidence,
      observedText: params.validated.observedText,
      reviewMode: params.validated.reviewMode,
      confidence: params.validated.confidence,
      responseStyleFamily: match.responseStyleFamily ?? "generalized_guidance",
    },
  };
}

function buildCorrectionProjection(params: {
  validated: ValidatedMemorySemanticObject;
  captureSeam: string;
  captureProfile: string;
  projectId?: string;
}): MaterializedMemorySemanticResult {
  const object = params.validated.object;
  if (object.kind !== "correction") {
    throw new Error("expected correction object");
  }
  const value = renderCorrectionStatement(object);
  const normalizedSubject = normalizeLower(object.subject);
  const normalizedValue = normalizeLower(value);

  if (object.correctionKind === "response_preference") {
    const match = {
      ...toOrdinaryTurnResponseStyleMatch(
        createResponseStyleCanonicalMatch({
          template: "response_style_generalized_guidance",
          family: "generalized_guidance",
          subject: object.subject,
          value,
          captureClass: "requirement_correction",
        }),
      ),
      profile: "user-preference-v2" as const,
    } satisfies OrdinaryTurnAutoCaptureMatch;
    return {
      action: "capture",
      object,
      projection: {
        category: "response_style",
        match,
        canonicalCandidate: buildCanonicalCandidate({
          profileId: "response_style",
          match,
          reviewMode: params.validated.reviewMode,
          evidence: params.validated.evidence,
          observedText: params.validated.observedText,
          captureSeam: params.captureSeam,
          captureProfile: params.captureProfile,
        }),
        evidence: params.validated.evidence,
        observedText: params.validated.observedText,
        reviewMode: params.validated.reviewMode,
        confidence: params.validated.confidence,
        responseStyleFamily: "generalized_guidance",
      },
    };
  }

  if (object.correctionKind === "project_rule") {
    const projectScope = object.scope?.projectScope;
    const normalizedProjectScope = projectScope ? normalizeLower(projectScope) : undefined;
    const match: OrdinaryTurnAutoCaptureMatch = {
      profile: "user-preference-v2",
      captureClass: "project_rule_guidance",
      candidateKind: "improvement",
      reasonCode: "project_rule_guidance_statement",
      template: "project_rule_guidance",
      subject: object.subject,
      value,
      normalizedSubject,
      normalizedValue,
      content: value,
      subjectKey: buildSubjectKey(
        projectScope
          ? `${normalizeLower(projectScope)} :: ${normalizedSubject}`
          : normalizedSubject,
      ),
      key: buildMatchKey({
        captureClass: "project_rule_guidance",
        normalizedSubject,
        normalizedValue,
        projectScope,
      }),
      ...(projectScope ? { projectScope } : {}),
      ...(normalizedProjectScope ? { normalizedProjectScope } : {}),
      lessonFamily: "generalized_project_rule",
      ...(object.guidancePattern ? { guidancePattern: object.guidancePattern } : {}),
      ...(object.recommendedAction ? { recommendedAction: object.recommendedAction } : {}),
      ...(object.recommendedAction
        ? { normalizedRecommendedAction: normalizeLower(object.recommendedAction) }
        : {}),
      ...(object.avoidAction ? { avoidAction: object.avoidAction } : {}),
      ...(object.avoidAction ? { normalizedAvoidAction: normalizeLower(object.avoidAction) } : {}),
      ...(object.rationaleText ? { rationale: object.rationaleText } : {}),
      ...(object.rationaleText
        ? { normalizedRationale: normalizeLower(object.rationaleText) }
        : {}),
    };
    return {
      action: "capture",
      object,
      projection: {
        category: "project_rule",
        match,
        canonicalCandidate: buildCanonicalCandidate({
          profileId: "project_rule",
          match,
          reviewMode:
            params.validated.reviewMode === "direct"
              ? "pending_confirmation"
              : params.validated.reviewMode,
          evidence: params.validated.evidence,
          observedText: params.validated.observedText,
          projectId: resolveScopeProjectId(params.validated, params.projectId),
          captureSeam: params.captureSeam,
          captureProfile: params.captureProfile,
        }),
        evidence: params.validated.evidence,
        observedText: params.validated.observedText,
        reviewMode: params.validated.reviewMode,
        confidence: params.validated.confidence,
        lessonFamily: "generalized_project_rule",
        ...(object.guidancePattern ? { guidancePattern: object.guidancePattern } : {}),
      },
    };
  }

  if (object.correctionKind === "missing_capability" && object.neededCapability) {
    const projectScope = object.scope?.projectScope;
    const normalizedProjectScope = projectScope ? normalizeLower(projectScope) : undefined;
    const match: OrdinaryTurnAutoCaptureMatch = {
      profile: "user-preference-v2",
      captureClass: "unmet_need_recommendation",
      candidateKind: "improvement",
      reasonCode: "unmet_need_recommendation_statement",
      template: "unmet_need_recommendation",
      subject: object.subject,
      value,
      normalizedSubject,
      normalizedValue,
      content: value,
      subjectKey: buildSubjectKey(
        projectScope
          ? `${normalizeLower(projectScope)} :: ${normalizedSubject}`
          : normalizedSubject,
      ),
      key: buildMatchKey({
        captureClass: "unmet_need_recommendation",
        normalizedSubject,
        normalizedValue,
        projectScope,
      }),
      ...(projectScope ? { projectScope } : {}),
      ...(normalizedProjectScope ? { normalizedProjectScope } : {}),
      lessonFamily: "generalized_unmet_need",
      neededCapability: object.neededCapability,
      normalizedNeededCapability: normalizeLower(object.neededCapability),
      ...(object.rationaleText ? { rationale: object.rationaleText } : {}),
      ...(object.rationaleText
        ? { normalizedRationale: normalizeLower(object.rationaleText) }
        : {}),
    };
    return {
      action: "capture",
      object,
      projection: {
        category: "unmet_need",
        match,
        canonicalCandidate: buildCanonicalCandidate({
          profileId: "unmet_need",
          match,
          reviewMode:
            params.validated.reviewMode === "direct"
              ? "pending_confirmation"
              : params.validated.reviewMode,
          evidence: params.validated.evidence,
          observedText: params.validated.observedText,
          projectId: resolveScopeProjectId(params.validated, params.projectId),
          captureSeam: params.captureSeam,
          captureProfile: params.captureProfile,
        }),
        evidence: params.validated.evidence,
        observedText: params.validated.observedText,
        reviewMode: params.validated.reviewMode,
        confidence: params.validated.confidence,
        lessonFamily: "generalized_unmet_need",
      },
    };
  }

  const projectScope = object.scope?.projectScope;
  const normalizedProjectScope = projectScope ? normalizeLower(projectScope) : undefined;
  const workflowBase =
    object.workflowProfile === "environment_constraint"
      ? createSpecificWorkflowImprovementCanonicalMatch({
          captureClass: "workflow_environment_constraint",
          reasonCode: "workflow_environment_constraint_statement",
          template: "workflow_environment_constraint",
          semanticProfileId: "environment_constraint",
          subject: object.subject,
          value,
          ...(object.recommendedAction ? { recommendedAction: object.recommendedAction } : {}),
          ...(object.avoidAction ? { avoidAction: object.avoidAction } : {}),
          ...(object.rationaleText ? { rationale: object.rationaleText } : {}),
        })
      : object.workflowProfile === "api_workaround"
        ? createSpecificWorkflowImprovementCanonicalMatch({
            captureClass: "workflow_api_workaround",
            reasonCode: "workflow_api_workaround_statement",
            template: "workflow_api_workaround",
            semanticProfileId: "api_workaround",
            subject: object.subject,
            value,
            ...(object.recommendedAction ? { recommendedAction: object.recommendedAction } : {}),
            ...(object.avoidAction ? { avoidAction: object.avoidAction } : {}),
            ...(object.rationaleText ? { rationale: object.rationaleText } : {}),
          })
        : createGeneralizedWorkflowImprovementMatch({
            guidancePattern: object.guidancePattern ?? "use_instead_of",
            subject: object.subject,
            ...(object.recommendedAction ? { recommendedAction: object.recommendedAction } : {}),
            ...(object.avoidAction ? { avoidAction: object.avoidAction } : {}),
            ...(object.rationaleText ? { rationale: object.rationaleText } : {}),
          });
  const match = {
    ...toOrdinaryTurnWorkflowImprovementMatch({
      ...workflowBase,
      ...(projectScope ? { projectScope } : {}),
      ...(normalizedProjectScope ? { normalizedProjectScope } : {}),
    }),
    profile: "user-preference-v2" as const,
  } satisfies OrdinaryTurnAutoCaptureMatch;
  return {
    action: "capture",
    object,
    projection: {
      category: "workflow_improvement",
      match,
      canonicalCandidate: buildCanonicalCandidate({
        profileId: "workflow_improvement",
        match,
        reviewMode:
          params.validated.reviewMode === "direct"
            ? "pending_confirmation"
            : params.validated.reviewMode,
        evidence: params.validated.evidence,
        observedText: params.validated.observedText,
        projectId: resolveScopeProjectId(params.validated, params.projectId),
        captureSeam: params.captureSeam,
        captureProfile: params.captureProfile,
      }),
      evidence: params.validated.evidence,
      observedText: params.validated.observedText,
      reviewMode: params.validated.reviewMode,
      confidence: params.validated.confidence,
      lessonFamily: "generalized_workflow_lesson",
      ...(object.guidancePattern ? { guidancePattern: object.guidancePattern } : {}),
    },
  };
}

function buildProcedureProjection(params: {
  validated: ValidatedMemorySemanticObject;
  captureSeam: string;
  captureProfile: string;
  projectId?: string;
}): MaterializedMemorySemanticResult {
  const object = params.validated.object;
  if (object.kind !== "procedure") {
    throw new Error("expected procedure object");
  }
  const procedureFamily = object.procedureKey ? "supported_key" : "generalized_named_checklist";
  const match = {
    ...toOrdinaryTurnRecurringProcedureMatch(
      createRecurringProcedureCanonicalMatch({
        title: object.title,
        steps: object.steps,
        procedureFamily,
        ...(object.procedureKey ? { procedureKey: object.procedureKey } : {}),
      }),
    ),
    profile: "user-preference-v2" as const,
  } satisfies OrdinaryTurnAutoCaptureMatch;
  return {
    action: "capture",
    object,
    projection: {
      category: "recurring_procedure",
      match,
      canonicalCandidate: buildCanonicalCandidate({
        profileId: "recurring_procedure",
        match,
        reviewMode:
          params.validated.reviewMode === "direct"
            ? "pending_confirmation"
            : params.validated.reviewMode,
        evidence: params.validated.evidence,
        observedText: params.validated.observedText,
        projectId: resolveScopeProjectId(params.validated, params.projectId),
        captureSeam: params.captureSeam,
        captureProfile: params.captureProfile,
      }),
      evidence: params.validated.evidence,
      observedText: params.validated.observedText,
      reviewMode: params.validated.reviewMode,
      confidence: params.validated.confidence,
      procedureFamily: match.procedureFamily ?? "generalized_named_checklist",
    },
  };
}

function buildProjectFactProjection(params: {
  validated: ValidatedMemorySemanticObject;
  captureSeam: string;
  captureProfile: string;
  projectId?: string;
}): MaterializedMemorySemanticResult | null {
  const object = params.validated.object;
  if (object.kind !== "project_fact") {
    throw new Error("expected project_fact object");
  }
  const projectScope = object.scope?.projectScope;
  if (!projectScope) {
    return null;
  }
  const factFamily: ProjectFactFamily = object.factFieldKey
    ? "supported_field"
    : "generalized_reference";
  const match = {
    ...toOrdinaryTurnProjectFactMatch(
      createProjectFactCanonicalMatch({
        projectScope,
        subjectLabel: object.subject,
        value: object.value,
        factFamily,
        ...(object.factFieldKey ? { fieldKey: object.factFieldKey } : {}),
      }),
    ),
    profile: "user-preference-v2" as const,
  } satisfies OrdinaryTurnAutoCaptureMatch;
  return {
    action: "capture",
    object,
    projection: {
      category: "project_fact",
      match,
      canonicalCandidate: buildCanonicalCandidate({
        profileId: "project_fact",
        match,
        reviewMode:
          params.validated.reviewMode === "direct"
            ? "pending_confirmation"
            : params.validated.reviewMode,
        evidence: params.validated.evidence,
        observedText: params.validated.observedText,
        projectId: resolveScopeProjectId(params.validated, params.projectId),
        captureSeam: params.captureSeam,
        captureProfile: params.captureProfile,
      }),
      evidence: params.validated.evidence,
      observedText: params.validated.observedText,
      reviewMode: params.validated.reviewMode,
      confidence: params.validated.confidence,
      factFamily,
      ...(object.factFieldKey ? { fieldKey: object.factFieldKey } : {}),
    },
  };
}

function buildRoutingProjection(params: {
  validated: ValidatedMemorySemanticObject;
  captureSeam: string;
  captureProfile: string;
  projectId?: string;
}): MaterializedMemorySemanticResult {
  const object = params.validated.object;
  if (object.kind !== "routing") {
    throw new Error("expected routing object");
  }
  const projectScope = object.scope?.projectScope;
  const normalizedProjectScope = projectScope ? normalizeLower(projectScope) : undefined;
  const normalizedSubject = normalizeLower(object.task);
  const value = renderRoutingStatement(object);
  const normalizedValue = normalizeLower(value);
  const resourceSummary =
    object.companionResources && object.companionResources.length > 0
      ? [object.primaryResource, ...object.companionResources].join(" and ")
      : object.primaryResource;
  const match: OrdinaryTurnAutoCaptureMatch = {
    profile: "user-preference-v2",
    captureClass: "workflow_generalized_guidance",
    candidateKind: "improvement",
    reasonCode: "workflow_generalized_guidance_statement",
    template: "workflow_generalized_guidance",
    subject: object.task,
    value,
    normalizedSubject,
    normalizedValue,
    content: value,
    subjectKey: buildSubjectKey(
      projectScope ? `${normalizeLower(projectScope)} :: ${normalizedSubject}` : normalizedSubject,
    ),
    key: buildMatchKey({
      captureClass: "workflow_generalized_guidance",
      normalizedSubject,
      normalizedValue,
      projectScope,
    }),
    ...(projectScope ? { projectScope } : {}),
    ...(normalizedProjectScope ? { normalizedProjectScope } : {}),
    lessonFamily: "generalized_workflow_lesson",
    recommendedAction: resourceSummary,
    normalizedRecommendedAction: normalizeLower(resourceSummary),
    ...(object.rationaleText ? { rationale: object.rationaleText } : {}),
    ...(object.rationaleText ? { normalizedRationale: normalizeLower(object.rationaleText) } : {}),
  };
  return {
    action: "capture",
    object,
    projection: {
      category: "reference_routing",
      match,
      canonicalCandidate: buildRoutingCanonicalCandidate({
        object,
        match,
        reviewMode:
          params.validated.reviewMode === "direct"
            ? "pending_confirmation"
            : params.validated.reviewMode,
        evidence: params.validated.evidence,
        observedText: params.validated.observedText,
        projectId: resolveScopeProjectId(params.validated, params.projectId),
        captureSeam: params.captureSeam,
        captureProfile: params.captureProfile,
      }),
      evidence: params.validated.evidence,
      observedText: params.validated.observedText,
      reviewMode: params.validated.reviewMode,
      confidence: params.validated.confidence,
      lessonFamily: "generalized_workflow_lesson",
    },
  };
}

export function materializeValidatedMemorySemanticObject(params: {
  validated: ValidatedMemorySemanticObject;
  captureSeam: string;
  captureProfile: string;
  projectId?: string;
}): MaterializedMemorySemanticResult | null {
  switch (params.validated.object.kind) {
    case "preference":
      return buildResponseStyleProjection(params);
    case "correction":
      return buildCorrectionProjection(params);
    case "procedure":
      return buildProcedureProjection(params);
    case "project_fact":
      return buildProjectFactProjection(params);
    case "routing":
      return buildRoutingProjection(params);
  }
}
