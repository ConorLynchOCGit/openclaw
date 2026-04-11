import type {
  ProjectFactFamily,
  ProjectFactFieldKey,
  ProjectFactSemanticConfidence,
} from "./project-fact-semantic.js";
import type {
  RecurringProcedureFamily,
  RecurringProcedureKey,
  RecurringProcedureSemanticConfidence,
} from "./recurring-procedure-semantic.js";
import type {
  ResponseStyleFamily,
  ResponseStyleSemanticConfidence,
} from "./response-style-semantic.js";
import { resolveWorkflowSemanticDetectionSource } from "./workflow-canonical-policy.js";
import type {
  WorkflowImprovementCaptureClass,
  WorkflowImprovementGuidancePattern,
  WorkflowImprovementLessonFamily,
  WorkflowImprovementSemanticConfidence,
} from "./workflow-improvement-semantic.js";

const MEMORY_CONFIRMATION_WINDOW_MS = 72 * 60 * 60 * 1000;
const MEMORY_CONFIRMATION_MIN_AGE_MS = 5_000;

function buildLifecycleExpiration(observedAt: string): string {
  return new Date(Date.parse(observedAt) + MEMORY_CONFIRMATION_WINDOW_MS).toISOString();
}

export function buildResponseStyleSemanticMetadata(params: {
  detectionSource: "deterministic" | "semantic";
  confidence: "high" | ResponseStyleSemanticConfidence;
  evidence: string[];
}): Record<string, unknown> {
  return {
    semanticDetection: {
      source: "response_style_semantic_v1",
      detectionSource: params.detectionSource,
      confidence: params.confidence,
      evidence: params.evidence,
    },
  };
}

export function buildProjectFactSemanticMetadata(params: {
  detectionSource: "deterministic" | "semantic";
  confidence: "high" | ProjectFactSemanticConfidence;
  evidence: string[];
  factFamily: ProjectFactFamily;
  fieldKey?: ProjectFactFieldKey;
}): Record<string, unknown> {
  return {
    semanticDetection: {
      source: "project_fact_semantic_v1",
      detectionSource: params.detectionSource,
      confidence: params.confidence,
      factFamily: params.factFamily,
      ...(params.fieldKey ? { fieldKey: params.fieldKey } : {}),
      evidence: params.evidence,
    },
  };
}

export function buildRecurringProcedureSemanticMetadata(params: {
  detectionSource: "semantic";
  confidence: "high" | RecurringProcedureSemanticConfidence;
  evidence: string[];
  procedureFamily: RecurringProcedureFamily;
  procedureKey?: RecurringProcedureKey;
}): Record<string, unknown> {
  return {
    semanticDetection: {
      source: "recurring_procedure_semantic_v1",
      detectionSource: params.detectionSource,
      confidence: params.confidence,
      procedureFamily: params.procedureFamily,
      ...(params.procedureKey ? { procedureKey: params.procedureKey } : {}),
      evidence: params.evidence,
    },
  };
}

export function buildWorkflowImprovementSemanticMetadata(params: {
  detectionSource: "semantic" | "deterministic";
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  lessonFamily: WorkflowImprovementLessonFamily;
  guidancePattern?: WorkflowImprovementGuidancePattern;
  captureClass?: WorkflowImprovementCaptureClass;
}): Record<string, unknown> {
  return {
    semanticDetection: {
      source: resolveWorkflowSemanticDetectionSource({
        detectionSource: params.detectionSource,
        ...(params.captureClass ? { captureClass: params.captureClass } : {}),
        lessonFamily: params.lessonFamily,
      }),
      detectionSource: params.detectionSource,
      confidence: params.confidence,
      lessonFamily: params.lessonFamily,
      ...(params.guidancePattern ? { guidancePattern: params.guidancePattern } : {}),
      evidence: params.evidence,
    },
  };
}

export function buildPendingConfirmationMetadata(params: {
  confidence: ResponseStyleSemanticConfidence;
  evidence: string[];
  responseStyleFamily: ResponseStyleFamily;
  state?: "pending_confirmation" | "hold_for_more_evidence";
  observedAt?: string;
}): Record<string, unknown> {
  const observedAt = params.observedAt ?? new Date().toISOString();
  return {
    candidateLifecycle: {
      family: "response_style",
      state: params.state ?? "pending_confirmation",
      confidence: params.confidence,
      evidenceCount: 1,
      observedAt,
      expiresAt: buildLifecycleExpiration(observedAt),
      responseStyleFamily: params.responseStyleFamily,
      evidence: params.evidence,
    },
  };
}

export function buildProjectFactPendingConfirmationMetadata(params: {
  confidence: ProjectFactSemanticConfidence;
  evidence: string[];
  factFamily: ProjectFactFamily;
  state?: "pending_confirmation" | "hold_for_more_evidence";
  fieldKey?: ProjectFactFieldKey;
  clusterKey?: string;
  observedAt?: string;
}): Record<string, unknown> {
  const observedAt = params.observedAt ?? new Date().toISOString();
  return {
    candidateLifecycle: {
      family: "project_fact",
      state: params.state ?? "pending_confirmation",
      confidence: params.confidence,
      evidenceCount: 1,
      observedAt,
      expiresAt: buildLifecycleExpiration(observedAt),
      factFamily: params.factFamily,
      ...(params.fieldKey ? { fieldKey: params.fieldKey } : {}),
      ...(params.clusterKey ? { clusterKey: params.clusterKey } : {}),
      evidence: params.evidence,
    },
  };
}

export function buildRecurringProcedurePendingConfirmationMetadata(params: {
  confidence: RecurringProcedureSemanticConfidence;
  evidence: string[];
  procedureFamily: RecurringProcedureFamily;
  procedureKey?: RecurringProcedureKey;
  state?: "pending_confirmation" | "hold_for_more_evidence";
  observedAt?: string;
}): Record<string, unknown> {
  const observedAt = params.observedAt ?? new Date().toISOString();
  return {
    candidateLifecycle: {
      family: "recurring_procedure",
      state: params.state ?? "pending_confirmation",
      confidence: params.confidence,
      evidenceCount: 1,
      observedAt,
      expiresAt: buildLifecycleExpiration(observedAt),
      procedureFamily: params.procedureFamily,
      ...(params.procedureKey ? { procedureKey: params.procedureKey } : {}),
      evidence: params.evidence,
    },
  };
}

export function buildWorkflowImprovementPendingConfirmationMetadata(params: {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  lessonFamily: WorkflowImprovementLessonFamily;
  state?: "pending_confirmation" | "hold_for_more_evidence";
  guidancePattern?: WorkflowImprovementGuidancePattern;
  observedAt?: string;
  clusterKey?: string;
  contradictionCount?: number;
}): Record<string, unknown> {
  const observedAt = params.observedAt ?? new Date().toISOString();
  return {
    candidateLifecycle: {
      family: "workflow_improvement",
      state: params.state ?? "pending_confirmation",
      confidence: params.confidence,
      evidenceCount: 1,
      observedAt,
      expiresAt: buildLifecycleExpiration(observedAt),
      lessonFamily: params.lessonFamily,
      ...(params.guidancePattern ? { guidancePattern: params.guidancePattern } : {}),
      ...(params.clusterKey ? { clusterKey: params.clusterKey } : {}),
      ...(typeof params.contradictionCount === "number"
        ? { contradictionCount: params.contradictionCount }
        : {}),
      evidence: params.evidence,
    },
  };
}

function shouldSkipImmediateLifecycleConfirmation(createdAt: string, now = Date.now()): boolean {
  const createdAtMs = Date.parse(createdAt);
  return Number.isFinite(createdAtMs) && now - createdAtMs < MEMORY_CONFIRMATION_MIN_AGE_MS;
}

export function shouldSkipImmediateConfirmation(createdAt: string, now = Date.now()): boolean {
  return shouldSkipImmediateLifecycleConfirmation(createdAt, now);
}

export function shouldSkipImmediateProjectFactConfirmation(
  createdAt: string,
  now = Date.now(),
): boolean {
  return shouldSkipImmediateLifecycleConfirmation(createdAt, now);
}

export function shouldSkipImmediateRecurringProcedureConfirmation(
  createdAt: string,
  now = Date.now(),
): boolean {
  return shouldSkipImmediateLifecycleConfirmation(createdAt, now);
}

export function shouldSkipImmediateWorkflowImprovementConfirmation(
  createdAt: string,
  now = Date.now(),
): boolean {
  return shouldSkipImmediateLifecycleConfirmation(createdAt, now);
}
