import path from "node:path";
import type { OpenClawConfig } from "openclaw/plugin-sdk/memory-core";
import { z } from "zod";
import type { OpenClawPluginToolContext, PluginLogger } from "../api.js";
import type { MemoryMiddlewareConfig } from "./config.js";
import { MEMORY_OBJECT_SEARCH_SCOPES, type MemoryObjectSearchHybridInput } from "./db/runtime.js";
import { createOrdinaryTurnAutoCaptureHandler } from "./ordinary-turn-auto-capture.js";
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
import type { MemoryMiddlewareRuntime } from "./runtime.js";
import { searchMemoryObjectsHybridFromTool } from "./tools/memory-object-search-hybrid.js";
import {
  inspectWorkflowImprovementLifecycle,
  type WorkflowImprovementLifecycleInspection,
} from "./workflow-improvement-lifecycle.js";
import {
  inspectWorkflowPhrasePatternLifecycle,
  type WorkflowPhraseLifecycleInspection,
} from "./workflow-phrase-induction.js";

const MemoryProofModeSchema = z.enum(["isolated", "production"]);
const MemoryProofFamilySchema = z.enum([
  "response_style",
  "project_fact",
  "project_rule",
  "unmet_need",
  "recurring_procedure",
  "workflow_improvement",
  "workflow_phrase_pattern",
  "response_style_phrase_pattern",
]);
const MemoryProofSearchScopeSchema = z.enum(MEMORY_OBJECT_SEARCH_SCOPES);

const MemoryProofCaptureExpectationSchema = z.object({
  family: MemoryProofFamilySchema,
  key: z.string().min(1).optional(),
  subjectKey: z.string().min(1).optional(),
  normalizedPhrase: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
});

const MemoryProofAttributionSchema = z.object({
  agentId: z.string().min(1),
  sessionId: z.string().min(1),
  projectId: z.string().min(1).optional(),
});

const MemoryProofTranscriptCaptureStepSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal("transcript_capture"),
    text: z.string().min(1),
    sessionFile: z.string().min(1),
    sessionKey: z.string().min(1),
    agentExternalKey: z.string().min(1),
    messageId: z.string().min(1).optional(),
    timestampMs: z.number().int().positive().optional(),
    attribution: MemoryProofAttributionSchema,
    expectation: MemoryProofCaptureExpectationSchema.optional(),
    expectNoLifecycle: z.literal(true).optional(),
  })
  .refine((value) => Boolean(value.expectation || value.expectNoLifecycle), {
    message: "transcript_capture requires expectation or expectNoLifecycle",
  })
  .refine((value) => !(value.expectation && value.expectNoLifecycle), {
    message: "transcript_capture cannot combine expectation with expectNoLifecycle",
  });

const MemoryProofCandidateReviewStepSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal("candidate_review"),
    candidateId: z.string().min(1).optional(),
    candidateIdFromStep: z.string().min(1).optional(),
    outcome: z.enum(["accepted", "rejected"]),
    reviewerAgentId: z.string().min(1).optional(),
    rationale: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => Boolean(value.candidateId || value.candidateIdFromStep), {
    message: "candidate_review requires candidateId or candidateIdFromStep",
  });

const MemoryProofCandidatePromoteMemoryStepSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal("candidate_promote_memory"),
    candidateId: z.string().min(1).optional(),
    candidateIdFromStep: z.string().min(1).optional(),
    promoterAgentId: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => Boolean(value.candidateId || value.candidateIdFromStep), {
    message: "candidate_promote_memory requires candidateId or candidateIdFromStep",
  });

const MemoryProofCandidatePromoteProcedureStepSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal("candidate_promote_procedure"),
    candidateId: z.string().min(1).optional(),
    candidateIdFromStep: z.string().min(1).optional(),
    promoterAgentId: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => Boolean(value.candidateId || value.candidateIdFromStep), {
    message: "candidate_promote_procedure requires candidateId or candidateIdFromStep",
  });

const MemoryProofProcedureValidateStepSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal("procedure_validate"),
    procedureId: z.string().min(1).optional(),
    procedureIdFromStep: z.string().min(1).optional(),
    validatorAgentId: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => Boolean(value.procedureId || value.procedureIdFromStep), {
    message: "procedure_validate requires procedureId or procedureIdFromStep",
  });

const MemoryProofSearchExpectationSchema = z.object({
  minRecords: z.number().int().positive().optional(),
  recordId: z.string().min(1).optional(),
  recordIdFromStep: z.string().min(1).optional(),
  matchedFieldsInclude: z.array(z.string().min(1)).optional(),
  objectType: z.enum(["memory_object", "procedure"]).optional(),
});

const MemoryProofHybridSearchStepSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("hybrid_search"),
  query: z.string().min(1),
  scope: MemoryProofSearchScopeSchema.optional(),
  kindFilter: z.enum(["project", "feedback", "procedure"]).optional(),
  projectId: z.string().min(1).optional(),
  limit: z.number().int().positive().max(25).optional(),
  context: z
    .object({
      agentId: z.string().min(1).optional(),
      sessionKey: z.string().min(1).optional(),
    })
    .optional(),
  expectation: MemoryProofSearchExpectationSchema.optional(),
});

const MemoryProofStepSchema = z.discriminatedUnion("kind", [
  MemoryProofTranscriptCaptureStepSchema,
  MemoryProofCandidateReviewStepSchema,
  MemoryProofCandidatePromoteMemoryStepSchema,
  MemoryProofCandidatePromoteProcedureStepSchema,
  MemoryProofProcedureValidateStepSchema,
  MemoryProofHybridSearchStepSchema,
]);

const MemoryProofPlanSchema = z.object({
  mode: MemoryProofModeSchema,
  label: z.string().min(1),
  steps: z.array(MemoryProofStepSchema).min(1),
});

export type MemoryProofMode = z.infer<typeof MemoryProofModeSchema>;
export type MemoryProofFamily = z.infer<typeof MemoryProofFamilySchema>;
export type MemoryProofPlan = z.infer<typeof MemoryProofPlanSchema>;
export type MemoryProofStep = z.infer<typeof MemoryProofStepSchema>;
export type MemoryProofCaptureExpectation = z.infer<typeof MemoryProofCaptureExpectationSchema>;

type LifecycleInspection =
  | {
      family: "response_style";
      inspection: ResponseStyleLifecycleInspection;
    }
  | {
      family: "project_fact";
      inspection: ProjectFactLifecycleInspection;
    }
  | {
      family: "recurring_procedure";
      inspection: RecurringProcedureLifecycleInspection;
    }
  | {
      family: "project_rule";
      inspection: WorkflowImprovementLifecycleInspection;
    }
  | {
      family: "unmet_need";
      inspection: WorkflowImprovementLifecycleInspection;
    }
  | {
      family: "workflow_improvement";
      inspection: WorkflowImprovementLifecycleInspection;
    }
  | {
      family: "workflow_phrase_pattern";
      inspection: WorkflowPhraseLifecycleInspection;
    }
  | {
      family: "response_style_phrase_pattern";
      inspection: ResponseStylePhraseLifecycleInspection;
    };

export type MemoryProofHealthSnapshot = {
  endpoint: string;
  probe: "healthz" | "readyz";
  capturedAt: string;
  ok: boolean;
  statusCode?: number;
  body?: unknown;
  error?: string;
};

export type MemoryProofStepArtifacts = {
  candidateId?: string;
  candidateEventId?: string;
  approvedObjectId?: string;
  promotedMemoryObjectId?: string;
  procedureId?: string;
  validatedProcedureId?: string;
  reviewId?: string;
};

export type MemoryProofStepResult =
  | {
      id: string;
      kind: "transcript_capture";
      artifacts: MemoryProofStepArtifacts;
      expectation?: MemoryProofCaptureExpectation;
      lifecycle?: LifecycleInspection;
      ignored?: boolean;
    }
  | {
      id: string;
      kind: "candidate_review";
      artifacts: MemoryProofStepArtifacts;
      outcome: "accepted" | "rejected";
      accepted: boolean;
      status?: string;
      reason?: string;
    }
  | {
      id: string;
      kind: "candidate_promote_memory";
      artifacts: MemoryProofStepArtifacts;
      accepted: boolean;
      status?: string;
      reason?: string;
    }
  | {
      id: string;
      kind: "candidate_promote_procedure";
      artifacts: MemoryProofStepArtifacts;
      accepted: boolean;
      status?: string;
      reason?: string;
    }
  | {
      id: string;
      kind: "procedure_validate";
      artifacts: MemoryProofStepArtifacts;
      accepted: boolean;
      status?: string;
      reason?: string;
      procedureRunId?: string;
    }
  | {
      id: string;
      kind: "hybrid_search";
      artifacts: MemoryProofStepArtifacts;
      result: Awaited<ReturnType<typeof searchMemoryObjectsHybridFromTool>>;
    };

export type MemoryProofRunResult = {
  mode: MemoryProofMode;
  label: string;
  health: {
    before: MemoryProofHealthSnapshot[];
    after: MemoryProofHealthSnapshot[];
  };
  steps: MemoryProofStepResult[];
};

type SubmittedCaptureRecord = {
  metadata?: Record<string, unknown>;
  eventId?: string;
  memoryObjectId?: string;
};

type AcceptedCaptureSubmission = {
  eventId: string;
  memoryObjectId: string;
};

function summarizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function trimSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function resolveProofTranscriptFile(
  step: z.infer<typeof MemoryProofTranscriptCaptureStepSchema>,
): string {
  if (/[\\/]agents[\\/][^\\/]+[\\/]sessions[\\/].+\.jsonl$/i.test(step.sessionFile)) {
    return step.sessionFile;
  }
  return path.join(
    "/tmp",
    "memory-proof-runner",
    "agents",
    step.agentExternalKey,
    "sessions",
    `${step.sessionKey}.jsonl`,
  );
}

function summarizeLifecycleArtifacts(lifecycle: LifecycleInspection): MemoryProofStepArtifacts {
  switch (lifecycle.family) {
    case "response_style":
    case "project_fact":
    case "project_rule":
    case "unmet_need":
    case "workflow_improvement":
      return {
        ...(lifecycle.inspection.pendingCandidate?.id
          ? { candidateId: lifecycle.inspection.pendingCandidate.id }
          : {}),
        ...(lifecycle.inspection.pendingCandidate?.sourceEventId
          ? { candidateEventId: lifecycle.inspection.pendingCandidate.sourceEventId }
          : {}),
        ...(lifecycle.inspection.matchingApprovedObjectId
          ? { approvedObjectId: lifecycle.inspection.matchingApprovedObjectId }
          : {}),
      };
    case "workflow_phrase_pattern":
    case "response_style_phrase_pattern":
      return {
        ...(lifecycle.inspection.pendingCandidate?.id
          ? { candidateId: lifecycle.inspection.pendingCandidate.id }
          : {}),
        ...(lifecycle.inspection.matchingApprovedObjectId
          ? { approvedObjectId: lifecycle.inspection.matchingApprovedObjectId }
          : {}),
      };
    case "recurring_procedure":
      return {
        ...(lifecycle.inspection.pendingCandidate?.id
          ? { candidateId: lifecycle.inspection.pendingCandidate.id }
          : {}),
        ...(lifecycle.inspection.pendingCandidate?.sourceEventId
          ? { candidateEventId: lifecycle.inspection.pendingCandidate.sourceEventId }
          : {}),
        ...(lifecycle.inspection.matchingValidatedProcedureId
          ? { validatedProcedureId: lifecycle.inspection.matchingValidatedProcedureId }
          : {}),
      };
  }
}

async function inspectLifecycle(params: {
  config: MemoryMiddlewareConfig;
  logger: PluginLogger;
  expectation: MemoryProofCaptureExpectation;
}): Promise<LifecycleInspection> {
  assert(params.expectation.key, "capture expectation key is required");
  switch (params.expectation.family) {
    case "response_style": {
      assert(params.expectation.subjectKey, "capture expectation subjectKey is required");
      const inspection = await inspectResponseStyleLifecycle({
        config: params.config,
        key: params.expectation.key,
        subjectKey: params.expectation.subjectKey,
        logger: params.logger,
      });
      assert(inspection, "response-style lifecycle inspection unavailable");
      return { family: "response_style", inspection };
    }
    case "project_fact": {
      assert(params.expectation.subjectKey, "capture expectation subjectKey is required");
      const inspection = await inspectProjectFactLifecycle({
        config: params.config,
        key: params.expectation.key,
        subjectKey: params.expectation.subjectKey,
        projectId: params.expectation.projectId,
        logger: params.logger,
      });
      assert(inspection, "project-fact lifecycle inspection unavailable");
      return { family: "project_fact", inspection };
    }
    case "project_rule": {
      assert(params.expectation.subjectKey, "capture expectation subjectKey is required");
      const inspection = await inspectWorkflowImprovementLifecycle({
        config: params.config,
        key: params.expectation.key,
        subjectKey: params.expectation.subjectKey,
        projectId: params.expectation.projectId,
        logger: params.logger,
      });
      assert(inspection, "project-rule lifecycle inspection unavailable");
      return { family: "project_rule", inspection };
    }
    case "unmet_need": {
      assert(params.expectation.subjectKey, "capture expectation subjectKey is required");
      const inspection = await inspectWorkflowImprovementLifecycle({
        config: params.config,
        key: params.expectation.key,
        subjectKey: params.expectation.subjectKey,
        projectId: params.expectation.projectId,
        logger: params.logger,
      });
      assert(inspection, "unmet-need lifecycle inspection unavailable");
      return { family: "unmet_need", inspection };
    }
    case "recurring_procedure": {
      assert(params.expectation.subjectKey, "capture expectation subjectKey is required");
      const inspection = await inspectRecurringProcedureLifecycle({
        config: params.config,
        key: params.expectation.key,
        subjectKey: params.expectation.subjectKey,
        logger: params.logger,
      });
      assert(inspection, "recurring-procedure lifecycle inspection unavailable");
      return { family: "recurring_procedure", inspection };
    }
    case "workflow_improvement": {
      assert(params.expectation.subjectKey, "capture expectation subjectKey is required");
      const inspection = await inspectWorkflowImprovementLifecycle({
        config: params.config,
        key: params.expectation.key,
        subjectKey: params.expectation.subjectKey,
        projectId: params.expectation.projectId,
        logger: params.logger,
      });
      assert(inspection, "workflow-improvement lifecycle inspection unavailable");
      return { family: "workflow_improvement", inspection };
    }
    case "workflow_phrase_pattern": {
      assert(params.expectation.subjectKey, "capture expectation subjectKey is required");
      assert(
        params.expectation.normalizedPhrase,
        "capture expectation normalizedPhrase is required",
      );
      const inspection = await inspectWorkflowPhrasePatternLifecycle({
        config: params.config,
        patternKey: params.expectation.key,
        targetKey: params.expectation.subjectKey,
        normalizedPhrase: params.expectation.normalizedPhrase,
        projectId: params.expectation.projectId,
        logger: params.logger,
      });
      assert(inspection, "workflow phrase-pattern lifecycle inspection unavailable");
      return { family: "workflow_phrase_pattern", inspection };
    }
    case "response_style_phrase_pattern": {
      assert(params.expectation.subjectKey, "capture expectation subjectKey is required");
      assert(
        params.expectation.normalizedPhrase,
        "capture expectation normalizedPhrase is required",
      );
      const inspection = await inspectResponseStylePhrasePatternLifecycle({
        config: params.config,
        patternKey: params.expectation.key,
        targetKey: params.expectation.subjectKey,
        normalizedPhrase: params.expectation.normalizedPhrase,
        logger: params.logger,
      });
      assert(inspection, "response-style phrase-pattern lifecycle inspection unavailable");
      return { family: "response_style_phrase_pattern", inspection };
    }
  }
}

function resolveCandidateId(params: {
  step:
    | z.infer<typeof MemoryProofCandidateReviewStepSchema>
    | z.infer<typeof MemoryProofCandidatePromoteMemoryStepSchema>
    | z.infer<typeof MemoryProofCandidatePromoteProcedureStepSchema>;
  resultsById: Map<string, MemoryProofStepResult>;
}): string {
  if (params.step.candidateId) {
    return params.step.candidateId;
  }
  assert(params.step.candidateIdFromStep, `${params.step.kind} missing candidate reference`);
  const prior = params.resultsById.get(params.step.candidateIdFromStep);
  assert(prior, `${params.step.kind} referenced unknown step ${params.step.candidateIdFromStep}`);
  assert(
    prior.artifacts.candidateId,
    `${params.step.kind} step reference did not expose candidateId`,
  );
  return prior.artifacts.candidateId;
}

function resolveProcedureId(params: {
  step: z.infer<typeof MemoryProofProcedureValidateStepSchema>;
  resultsById: Map<string, MemoryProofStepResult>;
}): string {
  if (params.step.procedureId) {
    return params.step.procedureId;
  }
  assert(params.step.procedureIdFromStep, "procedure_validate missing procedure reference");
  const prior = params.resultsById.get(params.step.procedureIdFromStep);
  assert(prior, `procedure_validate referenced unknown step ${params.step.procedureIdFromStep}`);
  assert(
    prior.artifacts.procedureId,
    "procedure_validate step reference did not expose procedureId",
  );
  return prior.artifacts.procedureId;
}

function resolveExpectedSearchRecordId(params: {
  step: z.infer<typeof MemoryProofHybridSearchStepSchema>;
  resultsById: Map<string, MemoryProofStepResult>;
}): string | undefined {
  const expectation = params.step.expectation;
  if (!expectation) {
    return undefined;
  }
  if (expectation.recordId) {
    return expectation.recordId;
  }
  if (!expectation.recordIdFromStep) {
    return undefined;
  }
  const prior = params.resultsById.get(expectation.recordIdFromStep);
  assert(prior, `hybrid_search referenced unknown step ${expectation.recordIdFromStep}`);
  return (
    prior.artifacts.promotedMemoryObjectId ??
    prior.artifacts.approvedObjectId ??
    prior.artifacts.validatedProcedureId ??
    prior.artifacts.procedureId
  );
}

async function snapshotGatewayHealth(
  gatewayBaseUrl?: string,
): Promise<MemoryProofHealthSnapshot[]> {
  if (!gatewayBaseUrl) {
    return [];
  }
  const baseUrl = trimSlash(gatewayBaseUrl);
  const probes: Array<"healthz" | "readyz"> = ["healthz", "readyz"];
  const snapshots: MemoryProofHealthSnapshot[] = [];
  for (const probe of probes) {
    const endpoint = `${baseUrl}/${probe}`;
    const capturedAt = new Date().toISOString();
    try {
      const response = await fetch(endpoint);
      const text = await response.text();
      let body: unknown = text;
      try {
        body = text.length > 0 ? JSON.parse(text) : undefined;
      } catch {
        body = text;
      }
      snapshots.push({
        endpoint,
        probe,
        capturedAt,
        ok: response.ok,
        statusCode: response.status,
        ...(body !== undefined ? { body } : {}),
      });
    } catch (error) {
      snapshots.push({
        endpoint,
        probe,
        capturedAt,
        ok: false,
        error: summarizeError(error),
      });
    }
  }
  return snapshots;
}

async function runTranscriptCaptureStep(params: {
  step: z.infer<typeof MemoryProofTranscriptCaptureStepSchema>;
  runtime: MemoryMiddlewareRuntime;
  cfg: OpenClawConfig;
  config: MemoryMiddlewareConfig;
  logger: PluginLogger;
}): Promise<MemoryProofStepResult> {
  const transcriptFile = resolveProofTranscriptFile(params.step);
  let submittedCapture: SubmittedCaptureRecord | undefined;
  const rememberSubmission = (input: {
    metadata?: Record<string, unknown>;
    result: AcceptedCaptureSubmission;
  }) => {
    submittedCapture = {
      ...(input.metadata ? { metadata: input.metadata } : {}),
      ...(input.result.eventId ? { eventId: input.result.eventId } : {}),
      ...(input.result.memoryObjectId ? { memoryObjectId: input.result.memoryObjectId } : {}),
    };
  };
  const capture = createOrdinaryTurnAutoCaptureHandler({
    config: params.config,
    cfg: params.cfg,
    logger: params.logger,
    candidateIngress: params.runtime.candidateIngress,
    deps: {
      resolveAttribution: async () => params.step.attribution,
      submitCorrectionSuggestion: async (input) => {
        const result = await params.runtime.candidateIngress.submitCorrectionSuggestion(input);
        if (result.accepted) {
          rememberSubmission({ metadata: input.metadata, result });
        }
        return result;
      },
      submitLearning: async (input) => {
        const result = await params.runtime.candidateIngress.submitLearning(input);
        if (result.accepted) {
          rememberSubmission({ metadata: input.metadata, result });
        }
        return result;
      },
      submitProcedureSuggestion: async (input) => {
        const result = await params.runtime.candidateIngress.submitProcedureSuggestion(input);
        if (result.accepted) {
          rememberSubmission({ metadata: input.metadata, result });
        }
        return result;
      },
      submitImprovementNote: async (input) => {
        const result = await params.runtime.candidateIngress.submitImprovementNote(input);
        if (result.accepted) {
          rememberSubmission({ metadata: input.metadata, result });
        }
        return result;
      },
      reviewCandidate: (input) => params.runtime.candidateReview.review(input),
      promoteToMemory: (input) => params.runtime.candidatePromotion.promoteToMemory(input),
      promoteToProcedureDraft: (input) =>
        params.runtime.candidatePromotion.promoteToProcedureDraft(input),
      validateProcedure: (input) => params.runtime.procedureValidation.validate(input),
    },
  });

  await capture({
    sessionFile: transcriptFile,
    sessionKey: params.step.sessionKey,
    ...(params.step.messageId ? { messageId: params.step.messageId } : {}),
    message: {
      role: "user",
      content: params.step.text,
      ...(params.step.timestampMs ? { timestamp: params.step.timestampMs } : {}),
    },
  });

  if (params.step.expectNoLifecycle) {
    assert(
      !submittedCapture?.eventId && !submittedCapture?.memoryObjectId,
      `transcript_capture ${params.step.id} unexpectedly created lifecycle evidence`,
    );
    return {
      id: params.step.id,
      kind: "transcript_capture",
      artifacts: {},
      ignored: true,
    };
  }

  assert(params.step.expectation, `transcript_capture ${params.step.id} missing expectation`);
  const autoCaptureMetadata =
    submittedCapture?.metadata?.autoCapture &&
    typeof submittedCapture.metadata.autoCapture === "object" &&
    !Array.isArray(submittedCapture.metadata.autoCapture)
      ? (submittedCapture.metadata.autoCapture as Record<string, unknown>)
      : undefined;
  const phraseInductionMetadata =
    submittedCapture?.metadata?.phraseInduction &&
    typeof submittedCapture.metadata.phraseInduction === "object" &&
    !Array.isArray(submittedCapture.metadata.phraseInduction)
      ? (submittedCapture.metadata.phraseInduction as Record<string, unknown>)
      : undefined;
  const derivedExpectation: MemoryProofCaptureExpectation = {
    ...params.step.expectation,
    ...(params.step.expectation.key
      ? {}
      : typeof phraseInductionMetadata?.patternKey === "string" &&
          phraseInductionMetadata.patternKey.trim().length > 0
        ? { key: phraseInductionMetadata.patternKey.trim() }
        : typeof autoCaptureMetadata?.key === "string" && autoCaptureMetadata.key.trim().length > 0
          ? { key: autoCaptureMetadata.key.trim() }
          : {}),
    ...(params.step.expectation.subjectKey
      ? {}
      : typeof phraseInductionMetadata?.targetKey === "string" &&
          phraseInductionMetadata.targetKey.trim().length > 0
        ? { subjectKey: phraseInductionMetadata.targetKey.trim() }
        : typeof autoCaptureMetadata?.subjectKey === "string" &&
            autoCaptureMetadata.subjectKey.trim().length > 0
          ? { subjectKey: autoCaptureMetadata.subjectKey.trim() }
          : {}),
    ...(params.step.expectation.normalizedPhrase
      ? {}
      : typeof phraseInductionMetadata?.normalizedPhrase === "string" &&
          phraseInductionMetadata.normalizedPhrase.trim().length > 0
        ? { normalizedPhrase: phraseInductionMetadata.normalizedPhrase.trim() }
        : {}),
  };
  const lifecycle = await inspectLifecycle({
    config: params.config,
    logger: params.logger,
    expectation: derivedExpectation,
  });
  const artifacts = summarizeLifecycleArtifacts(lifecycle);

  assert(
    artifacts.candidateId || artifacts.approvedObjectId || artifacts.validatedProcedureId,
    `transcript_capture ${params.step.id} did not create pending or approved lifecycle evidence`,
  );

  return {
    id: params.step.id,
    kind: "transcript_capture",
    artifacts: {
      ...artifacts,
      ...(submittedCapture?.eventId ? { candidateEventId: submittedCapture.eventId } : {}),
      ...(submittedCapture?.memoryObjectId && !artifacts.candidateId
        ? { candidateId: submittedCapture.memoryObjectId }
        : {}),
    },
    expectation: derivedExpectation,
    lifecycle,
  };
}

async function runCandidateReviewStep(params: {
  step: z.infer<typeof MemoryProofCandidateReviewStepSchema>;
  runtime: MemoryMiddlewareRuntime;
  resultsById: Map<string, MemoryProofStepResult>;
}): Promise<MemoryProofStepResult> {
  const candidateId = resolveCandidateId({
    step: params.step,
    resultsById: params.resultsById,
  });
  const result = await params.runtime.candidateReview.review({
    candidateId,
    outcome: params.step.outcome,
    ...(params.step.reviewerAgentId ? { reviewerAgentId: params.step.reviewerAgentId } : {}),
    ...(params.step.rationale ? { rationale: params.step.rationale } : {}),
    ...(params.step.metadata ? { metadata: params.step.metadata } : {}),
  });
  return {
    id: params.step.id,
    kind: "candidate_review",
    artifacts: {
      candidateId,
      ...(result.accepted ? { reviewId: result.reviewId } : {}),
    },
    outcome: params.step.outcome,
    accepted: result.accepted,
    ...(result.status ? { status: result.status } : {}),
    ...(!result.accepted && result.reason ? { reason: result.reason } : {}),
  };
}

async function runCandidatePromoteMemoryStep(params: {
  step: z.infer<typeof MemoryProofCandidatePromoteMemoryStepSchema>;
  runtime: MemoryMiddlewareRuntime;
  resultsById: Map<string, MemoryProofStepResult>;
}): Promise<MemoryProofStepResult> {
  const candidateId = resolveCandidateId({
    step: params.step,
    resultsById: params.resultsById,
  });
  const result = await params.runtime.candidatePromotion.promoteToMemory({
    candidateId,
    ...(params.step.promoterAgentId ? { promoterAgentId: params.step.promoterAgentId } : {}),
    ...(params.step.metadata ? { metadata: params.step.metadata } : {}),
  });
  return {
    id: params.step.id,
    kind: "candidate_promote_memory",
    artifacts: {
      candidateId,
      ...(result.accepted && result.promotedMemoryObjectId
        ? { promotedMemoryObjectId: result.promotedMemoryObjectId }
        : {}),
    },
    accepted: result.accepted,
    ...(result.status ? { status: result.status } : {}),
    ...(!result.accepted && result.reason ? { reason: result.reason } : {}),
  };
}

async function runCandidatePromoteProcedureStep(params: {
  step: z.infer<typeof MemoryProofCandidatePromoteProcedureStepSchema>;
  runtime: MemoryMiddlewareRuntime;
  resultsById: Map<string, MemoryProofStepResult>;
}): Promise<MemoryProofStepResult> {
  const candidateId = resolveCandidateId({
    step: params.step,
    resultsById: params.resultsById,
  });
  const result = await params.runtime.candidatePromotion.promoteToProcedureDraft({
    candidateId,
    ...(params.step.promoterAgentId ? { promoterAgentId: params.step.promoterAgentId } : {}),
    ...(params.step.title ? { title: params.step.title } : {}),
    ...(params.step.metadata ? { metadata: params.step.metadata } : {}),
  });
  return {
    id: params.step.id,
    kind: "candidate_promote_procedure",
    artifacts: {
      candidateId,
      ...(result.accepted && result.procedureId ? { procedureId: result.procedureId } : {}),
    },
    accepted: result.accepted,
    ...(result.status ? { status: result.status } : {}),
    ...(!result.accepted && result.reason ? { reason: result.reason } : {}),
  };
}

async function runProcedureValidateStep(params: {
  step: z.infer<typeof MemoryProofProcedureValidateStepSchema>;
  runtime: MemoryMiddlewareRuntime;
  resultsById: Map<string, MemoryProofStepResult>;
}): Promise<MemoryProofStepResult> {
  const procedureId = resolveProcedureId({
    step: params.step,
    resultsById: params.resultsById,
  });
  const result = await params.runtime.procedureValidation.validate({
    procedureId,
    ...(params.step.validatorAgentId ? { validatorAgentId: params.step.validatorAgentId } : {}),
    ...(params.step.metadata ? { metadata: params.step.metadata } : {}),
  });
  return {
    id: params.step.id,
    kind: "procedure_validate",
    artifacts: {
      procedureId,
      ...(result.accepted && result.procedureId
        ? { validatedProcedureId: result.procedureId }
        : {}),
    },
    accepted: result.accepted,
    ...(result.status ? { status: result.status } : {}),
    ...(!result.accepted && result.reason ? { reason: result.reason } : {}),
    ...(result.accepted && result.procedureRunId ? { procedureRunId: result.procedureRunId } : {}),
  };
}

function buildSearchInput(
  step: z.infer<typeof MemoryProofHybridSearchStepSchema>,
): MemoryObjectSearchHybridInput {
  return {
    query: step.query,
    ...(step.scope ? { scope: step.scope } : {}),
    ...(step.kindFilter ? { kind: step.kindFilter } : {}),
    ...(step.projectId ? { projectId: step.projectId } : {}),
    ...(step.limit !== undefined ? { limit: step.limit } : {}),
  };
}

async function runHybridSearchStep(params: {
  step: z.infer<typeof MemoryProofHybridSearchStepSchema>;
  runtime: MemoryMiddlewareRuntime;
  cfg: OpenClawConfig;
  resultsById: Map<string, MemoryProofStepResult>;
}): Promise<MemoryProofStepResult> {
  const toolContext: Partial<OpenClawPluginToolContext> = {
    runtimeConfig: params.cfg,
    ...(params.step.context?.agentId ? { agentId: params.step.context.agentId } : {}),
    ...(params.step.context?.sessionKey ? { sessionKey: params.step.context.sessionKey } : {}),
  };
  const result = await searchMemoryObjectsHybridFromTool({
    runtime: params.runtime,
    input: buildSearchInput(params.step),
    context: toolContext as OpenClawPluginToolContext,
  });
  if (!result.accepted) {
    throw new Error(`hybrid_search ${params.step.id} failed: ${result.reason}`);
  }
  const expectedRecordId = resolveExpectedSearchRecordId({
    step: params.step,
    resultsById: params.resultsById,
  });
  const minRecords = params.step.expectation?.minRecords ?? (expectedRecordId ? 1 : undefined);
  if (minRecords !== undefined) {
    assert(
      result.records.length >= minRecords,
      `hybrid_search ${params.step.id} returned ${result.records.length} record(s), expected at least ${minRecords}`,
    );
  }
  if (expectedRecordId) {
    const matchingRecord = result.records.find(
      (record: (typeof result.records)[number]) => record.id === expectedRecordId,
    );
    assert(
      matchingRecord,
      `hybrid_search ${params.step.id} did not return expected record ${expectedRecordId}`,
    );
    if (params.step.expectation?.objectType) {
      assert(
        matchingRecord.objectType === params.step.expectation.objectType,
        `hybrid_search ${params.step.id} expected objectType ${params.step.expectation.objectType}, got ${matchingRecord.objectType}`,
      );
    }
    if (params.step.expectation?.matchedFieldsInclude?.length) {
      const matchedFields =
        "matchedFields" in matchingRecord ? matchingRecord.matchedFields : undefined;
      const actual = Array.isArray(matchedFields) ? matchedFields : [];
      for (const expectedField of params.step.expectation.matchedFieldsInclude) {
        assert(
          actual.includes(expectedField),
          `hybrid_search ${params.step.id} expected matched field ${expectedField}`,
        );
      }
    }
  }

  return {
    id: params.step.id,
    kind: "hybrid_search",
    artifacts: {
      ...(expectedRecordId ? { approvedObjectId: expectedRecordId } : {}),
    },
    result,
  };
}

export function parseMemoryProofPlan(raw: unknown): MemoryProofPlan {
  const plan = MemoryProofPlanSchema.parse(raw);
  const seenIds = new Set<string>();
  for (const step of plan.steps) {
    if (seenIds.has(step.id)) {
      throw new Error(`duplicate proof step id: ${step.id}`);
    }
    seenIds.add(step.id);
  }
  return plan;
}

export async function runMemoryProofPlan(params: {
  plan: MemoryProofPlan;
  cfg: OpenClawConfig;
  runtime: MemoryMiddlewareRuntime;
  logger: PluginLogger;
  gatewayBaseUrl?: string;
}): Promise<MemoryProofRunResult> {
  const config = params.runtime.config;
  const steps: MemoryProofStepResult[] = [];
  const resultsById = new Map<string, MemoryProofStepResult>();

  const before = await snapshotGatewayHealth(params.gatewayBaseUrl);
  for (const step of params.plan.steps) {
    let result: MemoryProofStepResult;
    switch (step.kind) {
      case "transcript_capture":
        result = await runTranscriptCaptureStep({
          step,
          runtime: params.runtime,
          cfg: params.cfg,
          config,
          logger: params.logger,
        });
        break;
      case "candidate_review":
        result = await runCandidateReviewStep({
          step,
          runtime: params.runtime,
          resultsById,
        });
        break;
      case "candidate_promote_memory":
        result = await runCandidatePromoteMemoryStep({
          step,
          runtime: params.runtime,
          resultsById,
        });
        break;
      case "candidate_promote_procedure":
        result = await runCandidatePromoteProcedureStep({
          step,
          runtime: params.runtime,
          resultsById,
        });
        break;
      case "procedure_validate":
        result = await runProcedureValidateStep({
          step,
          runtime: params.runtime,
          resultsById,
        });
        break;
      case "hybrid_search":
        result = await runHybridSearchStep({
          step,
          runtime: params.runtime,
          cfg: params.cfg,
          resultsById,
        });
        break;
    }
    steps.push(result);
    resultsById.set(result.id, result);
  }
  const after = await snapshotGatewayHealth(params.gatewayBaseUrl);

  return {
    mode: params.plan.mode,
    label: params.plan.label,
    health: {
      before,
      after,
    },
    steps,
  };
}
