import type { OpenClawPluginToolContext } from "../../api.js";
import { getCanonicalCaptureMetadataByCaptureClass } from "../capture-class-metadata.js";
import type { CandidateSubmissionInput } from "../db/runtime.js";
import {
  buildCanonicalMemoryIngestionCandidateFromAutoCaptureMatch,
  buildCanonicalMemoryIngestionCandidateFromResolvedIngestion,
  isCanonicalizableResolvedResponseStyleIngestion,
} from "../memory-canonical-compat.js";
import type { ResolvedCanonicalizableIngestion } from "../memory-ingestion-resolver.js";
import type { OrdinaryTurnAutoCaptureMatch } from "../memory-ingestion-types.js";
import {
  buildPendingConfirmationMetadata,
  buildProjectFactPendingConfirmationMetadata,
  buildProjectFactSemanticMetadata,
  buildRecurringProcedurePendingConfirmationMetadata,
  buildRecurringProcedureSemanticMetadata,
  buildResponseStyleSemanticMetadata,
  buildWorkflowImprovementPendingConfirmationMetadata,
  buildWorkflowImprovementSemanticMetadata,
} from "../memory-lifecycle-metadata.js";
import {
  parseManagedCorrectionCandidateContent,
  parseOrdinaryTurnAutoCapturePreference,
} from "../ordinary-turn-auto-capture.js";
import {
  isSupportedProjectFactField,
  type ProjectFactFamily,
  type ProjectFactFieldKey,
} from "../project-fact-semantic.js";
import type {
  RecurringProcedureFamily,
  RecurringProcedureKey,
} from "../recurring-procedure-semantic.js";
import type {
  ResponseStyleFamily,
  ResponseStyleSemanticConfidence,
} from "../response-style-semantic.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import { resolveCanonicalWorkflowAutoReviewProfile } from "../workflow-canonical-policy.js";
import type {
  WorkflowImprovementCaptureClass,
  WorkflowImprovementGuidancePattern,
  WorkflowImprovementLessonFamily,
  WorkflowImprovementSemanticConfidence,
} from "../workflow-improvement-semantic.js";

type ManagedResponseStyleResolution = {
  action: "capture";
  familyId: "response_style";
  parsed: OrdinaryTurnAutoCaptureMatch;
  responseStyleFamily: ResponseStyleFamily;
  reviewMode: "direct" | "pending_confirmation" | "hold_for_more_evidence";
  source: "content" | "raw";
  detectionSource: "deterministic" | "semantic";
  confidence: "high" | ResponseStyleSemanticConfidence;
  evidence: string[];
  observedText: string;
};

type ManagedProjectFactResolution = {
  familyId: "project_fact";
  parsed: OrdinaryTurnAutoCaptureMatch;
  factFamily: ProjectFactFamily;
  fieldKey?: ProjectFactFieldKey;
  reviewMode: "pending_confirmation" | "hold_for_more_evidence";
  source: "content" | "raw";
  detectionSource: "deterministic" | "semantic";
  confidence: "high" | "medium";
  evidence: string[];
  observedText: string;
};

type ManagedRecurringProcedureResolution = {
  familyId: "recurring_procedure";
  parsed: OrdinaryTurnAutoCaptureMatch;
  procedureFamily: RecurringProcedureFamily;
  procedureKey?: RecurringProcedureKey;
  reviewMode: "direct" | "pending_confirmation" | "hold_for_more_evidence";
  source: "content" | "raw";
  detectionSource: "semantic" | "deterministic";
  confidence: "high" | "medium";
  evidence: string[];
  observedText: string;
};

type ManagedWorkflowImprovementResolution = {
  familyId: "workflow_improvement";
  captureCategory: "workflow_improvement" | "project_rule" | "unmet_need";
  parsed: OrdinaryTurnAutoCaptureMatch;
  lessonFamily: WorkflowImprovementLessonFamily;
  reviewMode: "pending_confirmation" | "hold_for_more_evidence";
  guidancePattern?: WorkflowImprovementGuidancePattern;
  source: "content" | "raw";
  detectionSource: "semantic" | "deterministic";
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  observedText: string;
};

type ManagedCorrectionOverride = {
  parsed: OrdinaryTurnAutoCaptureMatch;
  source: "content" | "raw";
  detectionSource?: "semantic";
  confidence?: ResponseStyleSemanticConfidence;
  evidence?: string[];
};

function readManagedAutoCaptureRecord(
  input: CandidateSubmissionInput,
): Record<string, unknown> | null {
  const autoCapture = input.metadata?.autoCapture;
  return autoCapture && typeof autoCapture === "object" && !Array.isArray(autoCapture)
    ? (autoCapture as Record<string, unknown>)
    : null;
}

function readManagedAutoCaptureString(
  input: CandidateSubmissionInput,
  key: string,
): string | undefined {
  const autoCapture = readManagedAutoCaptureRecord(input);
  const value = autoCapture?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function buildManagedExplicitProjectFactMatch(
  input: CandidateSubmissionInput,
): OrdinaryTurnAutoCaptureMatch | null {
  const captureClass = readManagedAutoCaptureString(input, "captureClass");
  const template = readManagedAutoCaptureString(input, "template");
  const subject = readManagedAutoCaptureString(input, "subject");
  const value = readManagedAutoCaptureString(input, "value");
  const subjectKey = readManagedAutoCaptureString(input, "subjectKey");
  const key = readManagedAutoCaptureString(input, "key");
  if (
    captureClass !== "explicit_project_fact" ||
    (template !== "project_fact_named_scope" &&
      template !== "project_fact_generalized_named_scope") ||
    !subject ||
    !value ||
    !subjectKey ||
    !key
  ) {
    return null;
  }

  const profile = readManagedAutoCaptureString(input, "profile") ?? "user-preference-v2";
  const normalizedSubject =
    readManagedAutoCaptureString(input, "normalizedSubject") ?? subject.trim().toLowerCase();
  const normalizedValue =
    readManagedAutoCaptureString(input, "normalizedValue") ?? value.trim().toLowerCase();
  const projectScope = readManagedAutoCaptureString(input, "projectScope");
  const normalizedProjectScope =
    readManagedAutoCaptureString(input, "normalizedProjectScope") ??
    (projectScope ? projectScope.trim().toLowerCase() : undefined);
  const rawFieldKey = readManagedAutoCaptureString(input, "fieldKey");
  const fieldKey =
    rawFieldKey && isSupportedProjectFactField(rawFieldKey) ? rawFieldKey : undefined;
  const factFamily =
    readManagedAutoCaptureString(input, "factFamily") ??
    (fieldKey ? "supported_field" : "generalized_reference");

  return {
    profile: profile === "user-preference-v1" ? "user-preference-v1" : "user-preference-v2",
    captureClass: "explicit_project_fact",
    candidateKind: "learning",
    reasonCode: "explicit_project_fact_statement",
    template,
    subject,
    value,
    normalizedSubject,
    normalizedValue,
    content: input.content,
    subjectKey,
    key,
    ...(projectScope ? { projectScope } : {}),
    ...(normalizedProjectScope ? { normalizedProjectScope } : {}),
    ...(factFamily === "supported_field" || factFamily === "generalized_reference"
      ? { factFamily }
      : {}),
    ...(fieldKey ? { fieldKey } : {}),
  };
}

export type CandidateSubmitManagedNormalizationDeps = {
  mergeCandidateMetadata: (
    input: CandidateSubmissionInput,
    patch: Record<string, unknown>,
  ) => CandidateSubmissionInput;
  buildFallbackResponseStyleResolution: (params: {
    parsed: OrdinaryTurnAutoCaptureMatch;
    source: "content" | "raw";
  }) => ManagedResponseStyleResolution | null;
  resolveManagedCorrectionSubmission: (params: {
    runtime: MemoryMiddlewareRuntime;
    input: CandidateSubmissionInput;
    context?: OpenClawPluginToolContext;
  }) => Promise<ManagedCorrectionOverride | null>;
  resolveManagedProjectFactCorrection: (params: {
    runtime: MemoryMiddlewareRuntime;
    input: CandidateSubmissionInput;
    context?: OpenClawPluginToolContext;
  }) => Promise<ManagedProjectFactResolution | null>;
  resolveManagedResponseStyleLearning: (params: {
    runtime: MemoryMiddlewareRuntime;
    input: CandidateSubmissionInput;
  }) => Promise<ManagedResponseStyleResolution | null>;
  resolveManagedProjectFactLearning: (params: {
    runtime: MemoryMiddlewareRuntime;
    input: CandidateSubmissionInput;
  }) => Promise<ManagedProjectFactResolution | null>;
  resolveManagedRecurringProcedureSubmission: (params: {
    runtime: MemoryMiddlewareRuntime;
    input: CandidateSubmissionInput;
    context?: OpenClawPluginToolContext;
  }) => Promise<ManagedRecurringProcedureResolution | null>;
  resolveManagedWorkflowImprovementSubmission: (params: {
    runtime: MemoryMiddlewareRuntime;
    input: CandidateSubmissionInput;
    context?: OpenClawPluginToolContext;
  }) => Promise<ManagedWorkflowImprovementResolution | null>;
  resolveManagedResponseStyleCorrection: (params: {
    runtime: MemoryMiddlewareRuntime;
    input: CandidateSubmissionInput;
    context?: OpenClawPluginToolContext;
  }) => Promise<ManagedResponseStyleResolution | null>;
  resolveAutoPromotableFeedbackSubmission: (
    input: CandidateSubmissionInput,
  ) => OrdinaryTurnAutoCaptureMatch | null;
};

function resolveCanonicalIngestionModeForSubmissionKind(
  kind: CandidateSubmissionInput["kind"],
): "candidate_learning" | "candidate_correction" | "candidate_procedure" | "candidate_improvement" {
  switch (kind) {
    case "learning":
      return "candidate_learning";
    case "correction":
      return "candidate_correction";
    case "procedure":
      return "candidate_procedure";
    case "improvement":
      return "candidate_improvement";
  }
}

function mergeCanonicalResolvedIngestionMetadata(params: {
  deps: CandidateSubmitManagedNormalizationDeps;
  input: CandidateSubmissionInput;
  resolution: ResolvedCanonicalizableIngestion;
  patch: Record<string, unknown>;
}): CandidateSubmissionInput {
  return params.deps.mergeCandidateMetadata(params.input, {
    ...params.patch,
    canonicalIngestionCandidate: buildCanonicalMemoryIngestionCandidateFromResolvedIngestion({
      ingestion: params.resolution,
      mode: resolveCanonicalIngestionModeForSubmissionKind(params.input.kind),
      ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
      captureSeam: "model_tool_primary",
      captureProfile: "tool-submitted",
      ...(params.input.agentId ? { sourceAgent: params.input.agentId } : {}),
      ...(params.input.sessionId ? { sourceSession: params.input.sessionId } : {}),
    }),
  });
}

function normalizeCorrectionPreferenceKey(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized ? normalized : null;
}

async function normalizeManagedLearningInput(params: {
  deps: CandidateSubmitManagedNormalizationDeps;
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
  correctionOverride: ManagedCorrectionOverride | null;
}): Promise<CandidateSubmissionInput> {
  const { deps, input, context, correctionOverride } = params;

  if (correctionOverride) {
    const normalizedCorrectionInput = deps.mergeCandidateMetadata(
      {
        ...input,
        kind: "correction",
        content: correctionOverride.parsed.content,
      },
      {
        classificationAdjustment: {
          source: "candidate_submit_normalizer",
          matchedFrom: correctionOverride.source,
          fromKind: "learning",
          toKind: "correction",
          reason: "bounded_correction_match",
        },
      },
    );
    return normalizeManagedToolCandidateInput({
      deps,
      runtime: params.runtime,
      input: normalizedCorrectionInput,
      context,
    });
  }

  const projectFactCorrectionOverride = await deps.resolveManagedProjectFactCorrection({
    runtime: params.runtime,
    input,
    context,
  });
  if (projectFactCorrectionOverride) {
    const normalizedCorrectionInput = deps.mergeCandidateMetadata(
      {
        ...input,
        kind: "correction",
        content: projectFactCorrectionOverride.parsed.content,
      },
      {
        classificationAdjustment: {
          source: "candidate_submit_normalizer",
          matchedFrom: projectFactCorrectionOverride.source,
          fromKind: "learning",
          toKind: "correction",
          reason: "bounded_project_fact_correction_match",
        },
      },
    );
    return normalizeManagedToolCandidateInput({
      deps,
      runtime: params.runtime,
      input: normalizedCorrectionInput,
      context,
    });
  }

  const responseStyleResolution = await deps.resolveManagedResponseStyleLearning({
    runtime: params.runtime,
    input,
  });
  if (responseStyleResolution) {
    const patch = {
      category: "user_requirement",
      source: "explicit_user_requirement",
      autoCapture: {
        source: "model_tool_candidate_submit",
        captureSeam: "model_tool_primary",
        profile: responseStyleResolution.parsed.profile,
        captureClass: responseStyleResolution.parsed.captureClass,
        reasonCode: responseStyleResolution.parsed.reasonCode,
        template: responseStyleResolution.parsed.template,
        responseStyleFamily: responseStyleResolution.responseStyleFamily,
        key: responseStyleResolution.parsed.key,
        subjectKey: responseStyleResolution.parsed.subjectKey,
        subject: responseStyleResolution.parsed.subject,
        normalizedSubject: responseStyleResolution.parsed.normalizedSubject,
        value: responseStyleResolution.parsed.value,
        normalizedValue: responseStyleResolution.parsed.normalizedValue,
        toolName: "memory_candidate_submit",
      },
      ...buildResponseStyleSemanticMetadata({
        detectionSource: responseStyleResolution.detectionSource,
        confidence: responseStyleResolution.confidence,
        evidence: responseStyleResolution.evidence,
      }),
      ...(responseStyleResolution.reviewMode !== "direct"
        ? buildPendingConfirmationMetadata({
            confidence: responseStyleResolution.confidence,
            evidence: responseStyleResolution.evidence,
            responseStyleFamily: responseStyleResolution.responseStyleFamily,
            state: responseStyleResolution.reviewMode,
          })
        : {}),
    };
    return isCanonicalizableResolvedResponseStyleIngestion(responseStyleResolution)
      ? mergeCanonicalResolvedIngestionMetadata({
          deps,
          input,
          resolution: responseStyleResolution,
          patch,
        })
      : deps.mergeCandidateMetadata(input, patch);
  }

  const projectFactResolution = await deps.resolveManagedProjectFactLearning({
    runtime: params.runtime,
    input,
  });
  if (projectFactResolution) {
    return mergeCanonicalResolvedIngestionMetadata({
      deps,
      input,
      resolution: projectFactResolution,
      patch: {
        category: "project_fact",
        source: "explicit_project_fact",
        subject_key: projectFactResolution.parsed.subjectKey,
        autoCapture: {
          source: "model_tool_candidate_submit",
          captureSeam: "model_tool_primary",
          profile: projectFactResolution.parsed.profile,
          captureClass: projectFactResolution.parsed.captureClass,
          reasonCode: projectFactResolution.parsed.reasonCode,
          template: projectFactResolution.parsed.template,
          factFamily: projectFactResolution.factFamily,
          ...(projectFactResolution.fieldKey ? { fieldKey: projectFactResolution.fieldKey } : {}),
          key: projectFactResolution.parsed.key,
          subjectKey: projectFactResolution.parsed.subjectKey,
          subject: projectFactResolution.parsed.subject,
          normalizedSubject: projectFactResolution.parsed.normalizedSubject,
          value: projectFactResolution.parsed.value,
          normalizedValue: projectFactResolution.parsed.normalizedValue,
          ...(projectFactResolution.parsed.projectScope
            ? { projectScope: projectFactResolution.parsed.projectScope }
            : {}),
          ...(projectFactResolution.parsed.normalizedProjectScope
            ? { normalizedProjectScope: projectFactResolution.parsed.normalizedProjectScope }
            : {}),
          toolName: "memory_candidate_submit",
        },
        ...(projectFactResolution.detectionSource === "semantic"
          ? buildProjectFactSemanticMetadata({
              detectionSource: projectFactResolution.detectionSource,
              confidence: projectFactResolution.confidence,
              evidence: projectFactResolution.evidence,
              factFamily: projectFactResolution.factFamily,
              ...(projectFactResolution.fieldKey
                ? { fieldKey: projectFactResolution.fieldKey }
                : {}),
            })
          : {}),
        ...buildProjectFactPendingConfirmationMetadata({
          confidence: projectFactResolution.confidence,
          evidence: projectFactResolution.evidence,
          factFamily: projectFactResolution.factFamily,
          state:
            projectFactResolution.factFamily === "generalized_reference"
              ? "hold_for_more_evidence"
              : "pending_confirmation",
          ...(projectFactResolution.fieldKey ? { fieldKey: projectFactResolution.fieldKey } : {}),
          ...(projectFactResolution.factFamily === "generalized_reference"
            ? { clusterKey: projectFactResolution.parsed.key }
            : {}),
        }),
      },
    });
  }

  const explicitProjectFactMatch = buildManagedExplicitProjectFactMatch(input);
  if (explicitProjectFactMatch) {
    const factFamily =
      explicitProjectFactMatch.factFamily === "supported_field" ||
      explicitProjectFactMatch.factFamily === "generalized_reference"
        ? explicitProjectFactMatch.factFamily
        : explicitProjectFactMatch.fieldKey
          ? "supported_field"
          : "generalized_reference";
    const reviewMode =
      factFamily === "supported_field" ? "pending_confirmation" : "hold_for_more_evidence";
    const evidence = ["managed_submission_metadata_projection"];
    return deps.mergeCandidateMetadata(input, {
      category: "project_fact",
      source: "explicit_project_fact",
      subject_key: explicitProjectFactMatch.subjectKey,
      autoCapture: {
        ...(readManagedAutoCaptureRecord(input) ?? {}),
        source: "model_tool_candidate_submit",
        captureSeam: "model_tool_primary",
        profile: explicitProjectFactMatch.profile,
        captureClass: explicitProjectFactMatch.captureClass,
        reasonCode: explicitProjectFactMatch.reasonCode,
        template: explicitProjectFactMatch.template,
        key: explicitProjectFactMatch.key,
        subjectKey: explicitProjectFactMatch.subjectKey,
        subject: explicitProjectFactMatch.subject,
        normalizedSubject: explicitProjectFactMatch.normalizedSubject,
        value: explicitProjectFactMatch.value,
        normalizedValue: explicitProjectFactMatch.normalizedValue,
        ...(explicitProjectFactMatch.projectScope
          ? { projectScope: explicitProjectFactMatch.projectScope }
          : {}),
        ...(explicitProjectFactMatch.normalizedProjectScope
          ? { normalizedProjectScope: explicitProjectFactMatch.normalizedProjectScope }
          : {}),
        ...(factFamily ? { factFamily } : {}),
        ...(explicitProjectFactMatch.fieldKey
          ? { fieldKey: explicitProjectFactMatch.fieldKey }
          : {}),
        toolName: "memory_candidate_submit",
      },
      ...buildProjectFactSemanticMetadata({
        detectionSource: "deterministic",
        confidence: "high",
        evidence,
        factFamily,
        ...(explicitProjectFactMatch.fieldKey
          ? { fieldKey: explicitProjectFactMatch.fieldKey }
          : {}),
      }),
      ...buildProjectFactPendingConfirmationMetadata({
        confidence: "high",
        evidence,
        factFamily,
        ...(explicitProjectFactMatch.fieldKey
          ? { fieldKey: explicitProjectFactMatch.fieldKey }
          : {}),
        ...(factFamily === "generalized_reference"
          ? { clusterKey: explicitProjectFactMatch.key }
          : {}),
        state: reviewMode,
      }),
      canonicalIngestionCandidate: buildCanonicalMemoryIngestionCandidateFromAutoCaptureMatch({
        profileId: "project_fact",
        match: explicitProjectFactMatch,
        reviewMode,
        detectionSource: "deterministic",
        evidence,
        observedText: input.content,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        captureSeam: "model_tool_primary",
        captureProfile: "tool-submitted",
      }),
    });
  }

  const parsedFromContent = deps.resolveAutoPromotableFeedbackSubmission(input);
  const parsedFromRaw =
    !parsedFromContent && typeof input.metadata?.raw === "string"
      ? parseOrdinaryTurnAutoCapturePreference(input.metadata.raw, "user-preference-v2")
      : null;
  const parsed = parsedFromContent ?? parsedFromRaw;
  if (!parsed) {
    return input;
  }

  const fallbackPatch = {
    category:
      parsed.captureClass === "explicit_requirement"
        ? "user_requirement"
        : parsed.captureClass === "explicit_project_fact"
          ? "project_fact"
          : "user_preference",
    source:
      parsed.captureClass === "explicit_requirement"
        ? "explicit_user_requirement"
        : parsed.captureClass === "explicit_project_fact"
          ? "explicit_project_fact"
          : "explicit_user_statement",
    autoCapture: {
      source: "model_tool_candidate_submit",
      captureSeam: "model_tool_primary",
      profile: parsed.profile,
      captureClass: parsed.captureClass,
      reasonCode: parsed.reasonCode,
      template: parsed.template,
      key: parsed.key,
      subjectKey: parsed.subjectKey,
      subject: parsed.subject,
      value: parsed.value,
      ...(parsed.responseStyleFamily ? { responseStyleFamily: parsed.responseStyleFamily } : {}),
      ...(parsed.projectScope ? { projectScope: parsed.projectScope } : {}),
      toolName: "memory_candidate_submit",
    },
  };
  const fallbackResponseStyleResolution = deps.buildFallbackResponseStyleResolution({
    parsed,
    source: parsedFromContent ? "content" : "raw",
  });
  return fallbackResponseStyleResolution
    ? mergeCanonicalResolvedIngestionMetadata({
        deps,
        input,
        resolution: fallbackResponseStyleResolution,
        patch: fallbackPatch,
      })
    : deps.mergeCandidateMetadata(input, fallbackPatch);
}

async function normalizeManagedProcedureInput(params: {
  deps: CandidateSubmitManagedNormalizationDeps;
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<CandidateSubmissionInput> {
  const procedureResolution = await params.deps.resolveManagedRecurringProcedureSubmission({
    runtime: params.runtime,
    input: params.input,
    context: params.context,
  });
  if (!procedureResolution) {
    return params.input;
  }
  const candidateReviewMode =
    procedureResolution.reviewMode === "direct"
      ? "pending_confirmation"
      : procedureResolution.reviewMode;
  return mergeCanonicalResolvedIngestionMetadata({
    deps: params.deps,
    input: {
      ...params.input,
      content: procedureResolution.parsed.content,
    },
    resolution: {
      ...procedureResolution,
      reviewMode: candidateReviewMode,
    },
    patch: {
      category:
        procedureResolution.parsed.captureClass === "recurring_procedure_correction"
          ? "recurring_procedure_correction"
          : "recurring_procedure",
      source:
        procedureResolution.parsed.captureClass === "recurring_procedure_correction"
          ? "conversational_recurring_procedure_correction"
          : "explicit_recurring_procedure",
      subject_key: procedureResolution.parsed.subjectKey,
      autoCapture: {
        source: "model_tool_candidate_submit",
        captureSeam: "model_tool_primary",
        profile: procedureResolution.parsed.profile,
        captureClass: procedureResolution.parsed.captureClass,
        reasonCode: procedureResolution.parsed.reasonCode,
        template: procedureResolution.parsed.template,
        procedureFamily: procedureResolution.procedureFamily,
        ...(procedureResolution.procedureKey
          ? { procedureKey: procedureResolution.procedureKey }
          : {}),
        key: procedureResolution.parsed.key,
        subjectKey: procedureResolution.parsed.subjectKey,
        subject: procedureResolution.parsed.subject,
        normalizedSubject: procedureResolution.parsed.normalizedSubject,
        title: procedureResolution.parsed.title,
        steps: procedureResolution.parsed.steps ?? [],
        value: procedureResolution.parsed.value,
        normalizedValue: procedureResolution.parsed.normalizedValue,
        toolName: "memory_candidate_submit",
      },
      ...buildRecurringProcedureSemanticMetadata({
        detectionSource: procedureResolution.detectionSource,
        confidence: procedureResolution.confidence,
        evidence: procedureResolution.evidence,
        procedureFamily: procedureResolution.procedureFamily,
        ...(procedureResolution.procedureKey
          ? { procedureKey: procedureResolution.procedureKey }
          : {}),
      }),
      ...(procedureResolution.parsed.captureClass !== "recurring_procedure_correction" &&
      (procedureResolution.confidence === "medium" ||
        procedureResolution.reviewMode === "hold_for_more_evidence")
        ? buildRecurringProcedurePendingConfirmationMetadata({
            confidence: procedureResolution.confidence,
            evidence: procedureResolution.evidence,
            procedureFamily: procedureResolution.procedureFamily,
            ...(procedureResolution.procedureKey
              ? { procedureKey: procedureResolution.procedureKey }
              : {}),
            state: candidateReviewMode,
          })
        : {}),
    },
  });
}

async function normalizeManagedImprovementInput(params: {
  deps: CandidateSubmitManagedNormalizationDeps;
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<CandidateSubmissionInput> {
  const workflowImprovementResolution =
    await params.deps.resolveManagedWorkflowImprovementSubmission({
      runtime: params.runtime,
      input: params.input,
      context: params.context,
    });
  if (!workflowImprovementResolution) {
    return params.input;
  }

  const workflowCaptureMetadata = getCanonicalCaptureMetadataByCaptureClass(
    workflowImprovementResolution.parsed.captureClass,
  );
  return mergeCanonicalResolvedIngestionMetadata({
    deps: params.deps,
    input: {
      ...params.input,
      content: workflowImprovementResolution.parsed.content,
    },
    resolution: workflowImprovementResolution,
    patch: {
      ...(workflowCaptureMetadata
        ? {
            category: workflowCaptureMetadata.category,
            source: workflowCaptureMetadata.source,
          }
        : {
            category: "workflow_improvement",
            source: "explicit_workflow_improvement",
          }),
      subject_key: workflowImprovementResolution.parsed.subjectKey,
      workflowPhraseInduction: {
        observedText: workflowImprovementResolution.observedText,
      },
      autoCapture: {
        source: "model_tool_candidate_submit",
        captureSeam: "model_tool_primary",
        profile: workflowImprovementResolution.parsed.profile,
        captureClass: workflowImprovementResolution.parsed.captureClass,
        reasonCode: workflowImprovementResolution.parsed.reasonCode,
        template: workflowImprovementResolution.parsed.template,
        lessonFamily: workflowImprovementResolution.lessonFamily,
        ...(workflowImprovementResolution.guidancePattern
          ? { guidancePattern: workflowImprovementResolution.guidancePattern }
          : {}),
        ...(workflowImprovementResolution.parsed.needCategory
          ? { needCategory: workflowImprovementResolution.parsed.needCategory }
          : {}),
        key: workflowImprovementResolution.parsed.key,
        subjectKey: workflowImprovementResolution.parsed.subjectKey,
        subject: workflowImprovementResolution.parsed.subject,
        ...(workflowImprovementResolution.parsed.projectScope
          ? { projectScope: workflowImprovementResolution.parsed.projectScope }
          : {}),
        ...(workflowImprovementResolution.parsed.normalizedProjectScope
          ? { normalizedProjectScope: workflowImprovementResolution.parsed.normalizedProjectScope }
          : {}),
        normalizedSubject: workflowImprovementResolution.parsed.normalizedSubject,
        value: workflowImprovementResolution.parsed.value,
        normalizedValue: workflowImprovementResolution.parsed.normalizedValue,
        ...(workflowImprovementResolution.parsed.neededCapability
          ? { neededCapability: workflowImprovementResolution.parsed.neededCapability }
          : {}),
        ...(workflowImprovementResolution.parsed.normalizedNeededCapability
          ? {
              normalizedNeededCapability:
                workflowImprovementResolution.parsed.normalizedNeededCapability,
            }
          : {}),
        ...(workflowImprovementResolution.parsed.recommendedAction
          ? { recommendedAction: workflowImprovementResolution.parsed.recommendedAction }
          : {}),
        ...(workflowImprovementResolution.parsed.normalizedRecommendedAction
          ? {
              normalizedRecommendedAction:
                workflowImprovementResolution.parsed.normalizedRecommendedAction,
            }
          : {}),
        ...(workflowImprovementResolution.parsed.avoidAction
          ? { avoidAction: workflowImprovementResolution.parsed.avoidAction }
          : {}),
        ...(workflowImprovementResolution.parsed.normalizedAvoidAction
          ? { normalizedAvoidAction: workflowImprovementResolution.parsed.normalizedAvoidAction }
          : {}),
        ...(workflowImprovementResolution.parsed.rationale
          ? { rationale: workflowImprovementResolution.parsed.rationale }
          : {}),
        ...(workflowImprovementResolution.parsed.normalizedRationale
          ? { normalizedRationale: workflowImprovementResolution.parsed.normalizedRationale }
          : {}),
        ...(resolveCanonicalWorkflowAutoReviewProfile({
          captureClass: workflowImprovementResolution.parsed.captureClass,
          lessonFamily: workflowImprovementResolution.lessonFamily,
          template: workflowImprovementResolution.parsed.template,
          captureCategory: workflowImprovementResolution.captureCategory,
        })?.modeMetadata ?? { guidanceMode: "guidance_only" }),
        toolName: "memory_candidate_submit",
      },
      ...buildWorkflowImprovementSemanticMetadata({
        detectionSource: workflowImprovementResolution.detectionSource,
        confidence: workflowImprovementResolution.confidence,
        evidence: workflowImprovementResolution.evidence,
        captureClass: workflowImprovementResolution.parsed
          .captureClass as WorkflowImprovementCaptureClass,
        lessonFamily: workflowImprovementResolution.lessonFamily,
        ...(workflowImprovementResolution.guidancePattern
          ? { guidancePattern: workflowImprovementResolution.guidancePattern }
          : {}),
      }),
      ...buildWorkflowImprovementPendingConfirmationMetadata({
        confidence: workflowImprovementResolution.confidence,
        evidence: workflowImprovementResolution.evidence,
        lessonFamily: workflowImprovementResolution.lessonFamily,
        state: workflowImprovementResolution.reviewMode,
        ...(workflowImprovementResolution.guidancePattern
          ? { guidancePattern: workflowImprovementResolution.guidancePattern }
          : {}),
        clusterKey: workflowImprovementResolution.parsed.key,
      }),
    },
  });
}

async function normalizeManagedCorrectionInput(params: {
  deps: CandidateSubmitManagedNormalizationDeps;
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
  correctionOverride: ManagedCorrectionOverride | null;
}): Promise<CandidateSubmissionInput> {
  const responseStyleCorrection = await params.deps.resolveManagedResponseStyleCorrection({
    runtime: params.runtime,
    input: params.input,
    context: params.context,
  });
  if (responseStyleCorrection) {
    return mergeCanonicalResolvedIngestionMetadata({
      deps: params.deps,
      input: params.input,
      resolution: responseStyleCorrection,
      patch: {
        category:
          responseStyleCorrection.parsed.captureClass === "requirement_correction"
            ? "user_requirement_correction"
            : "user_preference_correction",
        source:
          responseStyleCorrection.parsed.captureClass === "requirement_correction"
            ? "conversational_user_requirement_correction"
            : "conversational_user_correction",
        subject_key: responseStyleCorrection.parsed.subjectKey,
        ...(responseStyleCorrection.parsed.captureClass === "preference_correction"
          ? { preference_key: responseStyleCorrection.parsed.subjectKey }
          : {}),
        autoCapture: {
          source: "model_tool_candidate_submit",
          captureSeam: "model_tool_primary",
          profile: responseStyleCorrection.parsed.profile,
          captureClass: responseStyleCorrection.parsed.captureClass,
          reasonCode: responseStyleCorrection.parsed.reasonCode,
          template: responseStyleCorrection.parsed.template,
          key: responseStyleCorrection.parsed.key,
          subjectKey: responseStyleCorrection.parsed.subjectKey,
          subject: responseStyleCorrection.parsed.subject,
          ...(typeof responseStyleCorrection.parsed.normalizedSubject === "string"
            ? { normalizedSubject: responseStyleCorrection.parsed.normalizedSubject }
            : {}),
          value: responseStyleCorrection.parsed.value,
          ...(typeof responseStyleCorrection.parsed.normalizedValue === "string"
            ? { normalizedValue: responseStyleCorrection.parsed.normalizedValue }
            : {}),
          ...(responseStyleCorrection.responseStyleFamily
            ? { responseStyleFamily: responseStyleCorrection.responseStyleFamily }
            : {}),
          ...(responseStyleCorrection.parsed.projectScope
            ? { projectScope: responseStyleCorrection.parsed.projectScope }
            : {}),
          toolName: "memory_candidate_submit",
        },
        ...(responseStyleCorrection.detectionSource === "semantic"
          ? buildResponseStyleSemanticMetadata({
              detectionSource: responseStyleCorrection.detectionSource,
              confidence: responseStyleCorrection.confidence,
              evidence: responseStyleCorrection.evidence,
            })
          : {}),
        ...(responseStyleCorrection.reviewMode !== "direct"
          ? buildPendingConfirmationMetadata({
              confidence: responseStyleCorrection.confidence,
              evidence: responseStyleCorrection.evidence,
              responseStyleFamily: responseStyleCorrection.responseStyleFamily,
              state: responseStyleCorrection.reviewMode,
            })
          : {}),
      },
    });
  }

  const projectFactCorrection = await params.deps.resolveManagedProjectFactCorrection({
    runtime: params.runtime,
    input: params.input,
    context: params.context,
  });
  if (projectFactCorrection) {
    return mergeCanonicalResolvedIngestionMetadata({
      deps: params.deps,
      input: params.input,
      resolution: projectFactCorrection,
      patch: {
        category: "project_fact_correction",
        source: "conversational_project_fact_correction",
        subject_key: projectFactCorrection.parsed.subjectKey,
        autoCapture: {
          source: "model_tool_candidate_submit",
          captureSeam: "model_tool_primary",
          profile: projectFactCorrection.parsed.profile,
          captureClass: "project_fact_correction",
          reasonCode: "explicit_project_fact_correction",
          template: projectFactCorrection.parsed.template,
          factFamily: projectFactCorrection.factFamily,
          ...(projectFactCorrection.fieldKey ? { fieldKey: projectFactCorrection.fieldKey } : {}),
          key: projectFactCorrection.parsed.key,
          subjectKey: projectFactCorrection.parsed.subjectKey,
          subject: projectFactCorrection.parsed.subject,
          normalizedSubject: projectFactCorrection.parsed.normalizedSubject,
          value: projectFactCorrection.parsed.value,
          normalizedValue: projectFactCorrection.parsed.normalizedValue,
          ...(projectFactCorrection.parsed.projectScope
            ? { projectScope: projectFactCorrection.parsed.projectScope }
            : {}),
          ...(projectFactCorrection.parsed.normalizedProjectScope
            ? { normalizedProjectScope: projectFactCorrection.parsed.normalizedProjectScope }
            : {}),
          toolName: "memory_candidate_submit",
        },
        ...(projectFactCorrection.detectionSource === "semantic"
          ? buildProjectFactSemanticMetadata({
              detectionSource: projectFactCorrection.detectionSource,
              confidence: projectFactCorrection.confidence,
              evidence: projectFactCorrection.evidence,
              factFamily: projectFactCorrection.factFamily,
              ...(projectFactCorrection.fieldKey
                ? { fieldKey: projectFactCorrection.fieldKey }
                : {}),
            })
          : {}),
      },
    });
  }

  const parsedCorrectionOverride = params.correctionOverride?.parsed ?? null;
  const normalizedPreferenceKey = normalizeCorrectionPreferenceKey(
    params.input.metadata?.preferenceKey,
  );
  const normalizedValue =
    typeof params.input.metadata?.value === "string"
      ? params.input.metadata.value.trim().toLowerCase()
      : null;
  const parsed =
    parsedCorrectionOverride ??
    (normalizedPreferenceKey && normalizedValue
      ? parseManagedCorrectionCandidateContent(
          `User correction: preferred ${normalizedPreferenceKey} is ${normalizedValue}.`,
        )
      : null) ??
    (typeof params.input.metadata?.raw === "string"
      ? parseOrdinaryTurnAutoCapturePreference(params.input.metadata.raw, "user-preference-v2")
      : null);
  if (
    !parsed ||
    (parsed.captureClass !== "preference_correction" &&
      parsed.captureClass !== "requirement_correction" &&
      parsed.captureClass !== "project_fact_correction")
  ) {
    return params.input;
  }

  return params.deps.mergeCandidateMetadata(params.input, {
    category:
      parsed.captureClass === "project_fact_correction"
        ? "project_fact_correction"
        : parsed.captureClass === "requirement_correction"
          ? "user_requirement_correction"
          : "user_preference_correction",
    source:
      parsed.captureClass === "project_fact_correction"
        ? "conversational_project_fact_correction"
        : parsed.captureClass === "requirement_correction"
          ? "conversational_user_requirement_correction"
          : "conversational_user_correction",
    subject_key: parsed.subjectKey,
    ...(parsed.captureClass === "preference_correction"
      ? { preference_key: parsed.subjectKey }
      : {}),
    autoCapture: {
      source: "model_tool_candidate_submit",
      captureSeam: "model_tool_primary",
      profile: parsed.profile,
      captureClass: parsed.captureClass,
      reasonCode: parsed.reasonCode,
      template: parsed.template,
      key: parsed.key,
      subjectKey: parsed.subjectKey,
      subject: parsed.subject,
      ...(typeof parsed.normalizedSubject === "string"
        ? { normalizedSubject: parsed.normalizedSubject }
        : {}),
      value: parsed.value,
      ...(typeof parsed.normalizedValue === "string"
        ? { normalizedValue: parsed.normalizedValue }
        : {}),
      ...(parsed.responseStyleFamily ? { responseStyleFamily: parsed.responseStyleFamily } : {}),
      ...(parsed.projectScope ? { projectScope: parsed.projectScope } : {}),
      toolName: "memory_candidate_submit",
    },
    ...(params.correctionOverride?.detectionSource === "semantic" &&
    params.correctionOverride.confidence &&
    params.correctionOverride.evidence
      ? buildResponseStyleSemanticMetadata({
          detectionSource: params.correctionOverride.detectionSource,
          confidence: params.correctionOverride.confidence,
          evidence: params.correctionOverride.evidence,
        })
      : {}),
    ...(params.correctionOverride?.confidence === "medium" && params.correctionOverride.evidence
      ? buildPendingConfirmationMetadata({
          confidence: params.correctionOverride.confidence,
          evidence: params.correctionOverride.evidence,
          responseStyleFamily:
            params.correctionOverride.parsed.responseStyleFamily ?? "supported_template",
        })
      : {}),
  });
}

export async function normalizeManagedToolCandidateInput(params: {
  deps: CandidateSubmitManagedNormalizationDeps;
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<CandidateSubmissionInput> {
  const correctionOverride = await params.deps.resolveManagedCorrectionSubmission({
    runtime: params.runtime,
    input: params.input,
    context: params.context,
  });

  switch (params.input.kind) {
    case "learning":
      return normalizeManagedLearningInput({
        deps: params.deps,
        runtime: params.runtime,
        input: params.input,
        context: params.context,
        correctionOverride,
      });
    case "procedure":
      return normalizeManagedProcedureInput({
        deps: params.deps,
        runtime: params.runtime,
        input: params.input,
        context: params.context,
      });
    case "improvement":
      return normalizeManagedImprovementInput({
        deps: params.deps,
        runtime: params.runtime,
        input: params.input,
        context: params.context,
      });
    case "correction":
      return normalizeManagedCorrectionInput({
        deps: params.deps,
        runtime: params.runtime,
        input: params.input,
        context: params.context,
        correctionOverride,
      });
  }
}
