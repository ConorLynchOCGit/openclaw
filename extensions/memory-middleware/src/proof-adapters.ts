import type { PluginLogger } from "../api.js";
import type { MemoryMiddlewareConfig } from "./config.js";
import type {
  MemoryFamilyProofInspectionMode,
  MemoryProofArtifactMode,
} from "./memory-proof-policy.js";
import {
  inspectProjectFactLifecycle,
  type ProjectFactLifecycleInspection,
} from "./project-fact-lifecycle.js";
import {
  inspectRecurringProcedureLifecycle,
  type RecurringProcedureLifecycleInspection,
} from "./recurring-procedure-lifecycle.js";
import {
  inspectResponseStyleLifecycle,
  type ResponseStyleLifecycleInspection,
} from "./response-style-lifecycle.js";
import {
  inspectResponseStylePhrasePatternLifecycle,
  type ResponseStylePhraseLifecycleInspection,
} from "./response-style-phrase-induction.js";
import {
  inspectWorkflowImprovementLifecycle,
  type WorkflowImprovementLifecycleInspection,
} from "./workflow-improvement-lifecycle.js";
import {
  inspectWorkflowPhrasePatternLifecycle,
  type WorkflowPhraseLifecycleInspection,
} from "./workflow-phrase-induction.js";

export type ProofLifecycleDetails =
  | ResponseStyleLifecycleInspection
  | ProjectFactLifecycleInspection
  | RecurringProcedureLifecycleInspection
  | WorkflowImprovementLifecycleInspection
  | WorkflowPhraseLifecycleInspection
  | ResponseStylePhraseLifecycleInspection;

export type MemoryProofStepArtifacts = {
  candidateId?: string;
  candidateEventId?: string;
  approvedObjectId?: string;
  promotedMemoryObjectId?: string;
  procedureId?: string;
  validatedProcedureId?: string;
  reviewId?: string;
};

export type ProofCaptureExpectationInput = {
  key?: string;
  subjectKey?: string;
  normalizedPhrase?: string;
  projectId?: string;
};

type ProofLifecycleAdapterContext = {
  config: MemoryMiddlewareConfig;
  logger: PluginLogger;
  expectation: ProofCaptureExpectationInput;
};

export type MemoryProofLifecycleAdapter = {
  inspectionMode: MemoryFamilyProofInspectionMode;
  inspect: (params: ProofLifecycleAdapterContext) => Promise<ProofLifecycleDetails | null>;
};

export type MemoryProofArtifactAdapter = {
  artifactMode: MemoryProofArtifactMode;
  buildArtifacts: (inspection: ProofLifecycleDetails) => MemoryProofStepArtifacts;
};

function requireValue(value: string | undefined, message: string): string {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

const PROOF_LIFECYCLE_ADAPTERS: Record<
  MemoryFamilyProofInspectionMode,
  MemoryProofLifecycleAdapter
> = {
  response_style_lifecycle: {
    inspectionMode: "response_style_lifecycle",
    inspect: async ({ config, logger, expectation }) =>
      inspectResponseStyleLifecycle({
        config,
        key: requireValue(expectation.key, "capture expectation key is required"),
        subjectKey: requireValue(
          expectation.subjectKey,
          "capture expectation subjectKey is required",
        ),
        logger,
      }),
  },
  project_fact_lifecycle: {
    inspectionMode: "project_fact_lifecycle",
    inspect: async ({ config, logger, expectation }) =>
      inspectProjectFactLifecycle({
        config,
        key: requireValue(expectation.key, "capture expectation key is required"),
        subjectKey: requireValue(
          expectation.subjectKey,
          "capture expectation subjectKey is required",
        ),
        projectId: expectation.projectId,
        logger,
      }),
  },
  recurring_procedure_lifecycle: {
    inspectionMode: "recurring_procedure_lifecycle",
    inspect: async ({ config, logger, expectation }) =>
      inspectRecurringProcedureLifecycle({
        config,
        key: requireValue(expectation.key, "capture expectation key is required"),
        subjectKey: requireValue(
          expectation.subjectKey,
          "capture expectation subjectKey is required",
        ),
        logger,
      }),
  },
  workflow_improvement_lifecycle: {
    inspectionMode: "workflow_improvement_lifecycle",
    inspect: async ({ config, logger, expectation }) =>
      inspectWorkflowImprovementLifecycle({
        config,
        key: requireValue(expectation.key, "capture expectation key is required"),
        subjectKey: requireValue(
          expectation.subjectKey,
          "capture expectation subjectKey is required",
        ),
        projectId: expectation.projectId,
        logger,
      }),
  },
  workflow_phrase_pattern_lifecycle: {
    inspectionMode: "workflow_phrase_pattern_lifecycle",
    inspect: async ({ config, logger, expectation }) =>
      inspectWorkflowPhrasePatternLifecycle({
        config,
        patternKey: requireValue(expectation.key, "capture expectation key is required"),
        targetKey: requireValue(
          expectation.subjectKey,
          "capture expectation subjectKey is required",
        ),
        normalizedPhrase: requireValue(
          expectation.normalizedPhrase,
          "capture expectation normalizedPhrase is required",
        ),
        projectId: expectation.projectId,
        logger,
      }),
  },
  response_style_phrase_pattern_lifecycle: {
    inspectionMode: "response_style_phrase_pattern_lifecycle",
    inspect: async ({ config, logger, expectation }) =>
      inspectResponseStylePhrasePatternLifecycle({
        config,
        patternKey: requireValue(expectation.key, "capture expectation key is required"),
        targetKey: requireValue(
          expectation.subjectKey,
          "capture expectation subjectKey is required",
        ),
        normalizedPhrase: requireValue(
          expectation.normalizedPhrase,
          "capture expectation normalizedPhrase is required",
        ),
        logger,
      }),
  },
};

const PROOF_ARTIFACT_ADAPTERS: Record<MemoryProofArtifactMode, MemoryProofArtifactAdapter> = {
  approved_memory_object: {
    artifactMode: "approved_memory_object",
    buildArtifacts: (inspection) => {
      const lifecycle = inspection as
        | ResponseStyleLifecycleInspection
        | ProjectFactLifecycleInspection
        | WorkflowImprovementLifecycleInspection;
      return {
        ...(lifecycle.pendingCandidate?.id ? { candidateId: lifecycle.pendingCandidate.id } : {}),
        ...(lifecycle.pendingCandidate?.sourceEventId
          ? { candidateEventId: lifecycle.pendingCandidate.sourceEventId }
          : {}),
        ...(lifecycle.matchingApprovedObjectId
          ? { approvedObjectId: lifecycle.matchingApprovedObjectId }
          : {}),
      };
    },
  },
  phrase_pattern: {
    artifactMode: "phrase_pattern",
    buildArtifacts: (inspection) => {
      const lifecycle = inspection as
        | WorkflowPhraseLifecycleInspection
        | ResponseStylePhraseLifecycleInspection;
      return {
        ...(lifecycle.pendingCandidate?.id ? { candidateId: lifecycle.pendingCandidate.id } : {}),
        ...(lifecycle.matchingApprovedObjectId
          ? { approvedObjectId: lifecycle.matchingApprovedObjectId }
          : {}),
      };
    },
  },
  validated_procedure: {
    artifactMode: "validated_procedure",
    buildArtifacts: (inspection) => {
      const lifecycle = inspection as RecurringProcedureLifecycleInspection;
      return {
        ...(lifecycle.pendingCandidate?.id ? { candidateId: lifecycle.pendingCandidate.id } : {}),
        ...(lifecycle.pendingCandidate?.sourceEventId
          ? { candidateEventId: lifecycle.pendingCandidate.sourceEventId }
          : {}),
        ...(lifecycle.matchingValidatedProcedureId
          ? { validatedProcedureId: lifecycle.matchingValidatedProcedureId }
          : {}),
      };
    },
  },
};

export function resolveProofLifecycleAdapter(
  inspectionMode: MemoryFamilyProofInspectionMode,
): MemoryProofLifecycleAdapter {
  return PROOF_LIFECYCLE_ADAPTERS[inspectionMode];
}

export function resolveProofArtifactAdapter(
  artifactMode: MemoryProofArtifactMode,
): MemoryProofArtifactAdapter {
  return PROOF_ARTIFACT_ADAPTERS[artifactMode];
}

export function buildProofLifecycleArtifacts(params: {
  artifactMode: MemoryProofArtifactMode;
  inspection: ProofLifecycleDetails;
}): MemoryProofStepArtifacts {
  return resolveProofArtifactAdapter(params.artifactMode).buildArtifacts(params.inspection);
}
