import { Client } from "pg";
import { DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG } from "../config.js";
import type { CandidateSubmissionInput, CandidateSubmissionResult } from "../db/runtime.js";
import { readCanonicalMemoryIngestionCandidateFromMetadata } from "../memory-canonical-compat.js";
import {
  attemptApprovedMemoryObjectCorrectionPromotion,
  resolveMemoryCorrectionPlan,
  resolveMemoryCorrectionPromotionPolicy,
} from "../memory-correction-engine.js";
import { matchesSubmissionRoutingTarget } from "../memory-profile-routing.js";
import {
  parseAutoCaptureManagedCandidateContent,
  parseOrdinaryTurnAutoCapturePreference,
} from "../ordinary-turn-auto-capture.js";
import { inspectProjectFactLifecycle } from "../project-fact-lifecycle.js";
import { isSupportedProjectFactField } from "../project-fact-semantic.js";
import { inspectRecurringProcedureLifecycle } from "../recurring-procedure-lifecycle.js";
import {
  getRecurringProcedureTitle,
  isSupportedRecurringProcedureKey,
  type RecurringProcedureFamily,
  type RecurringProcedureKey,
} from "../recurring-procedure-semantic.js";
import {
  advanceRecurringProcedureCandidateStages,
  buildRecurringProcedureStagedInspection,
} from "../recurring-procedure-staged-substrate.js";
import { inspectResponseStyleLifecycle } from "../response-style-lifecycle.js";
import { type ResponseStyleFamily } from "../response-style-semantic.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  buildResponseStyleCanonicalMatchFromInput,
  buildToolProjectFactAutoPromotionMetadata,
  buildToolRecurringProcedureAutoPromotionMetadata,
  buildToolResponseStyleAutoPromotionMetadata,
  isExplicitRequirementCaptureClass,
  isPendingCandidateLifecycleState,
  isRecurringProcedureCorrectionCaptureClass,
  isRequirementCorrectionCaptureClass,
  isResponseStyleCanonicalTemplate,
  readAutoCaptureString,
  readNestedMetadataString,
} from "./candidate-submit-profile-helpers.js";

export function resolveAutoPromotableFeedbackSubmission(
  input: CandidateSubmissionInput,
): ReturnType<typeof parseAutoCaptureManagedCandidateContent> | null {
  if (input.kind !== "learning") {
    return null;
  }
  const metadata = input.metadata ?? {};
  const parsedFromContent = parseAutoCaptureManagedCandidateContent(input.content);
  if (
    parsedFromContent &&
    (parsedFromContent.captureClass === "explicit_preference" ||
      parsedFromContent.captureClass === "explicit_requirement")
  ) {
    return parsedFromContent;
  }
  if (typeof metadata.raw === "string") {
    const rawCandidates = [
      metadata.raw,
      metadata.raw.replace(/^(?:going forward|from now on),\s*/i, ""),
    ];
    for (const rawCandidate of rawCandidates) {
      const parsedFromRaw = parseOrdinaryTurnAutoCapturePreference(
        rawCandidate,
        "user-preference-v2",
      );
      if (
        parsedFromRaw &&
        (parsedFromRaw.captureClass === "explicit_preference" ||
          parsedFromRaw.captureClass === "explicit_requirement")
      ) {
        return parsedFromRaw;
      }
    }
  }
  return null;
}

export async function inspectStagedRecurringProcedureLifecycle(params: {
  runtime: MemoryMiddlewareRuntime;
  key: string;
  subjectKey: string;
}): Promise<ReturnType<typeof buildRecurringProcedureStagedInspection>> {
  return buildRecurringProcedureStagedInspection(
    await inspectRecurringProcedureLifecycle({
      config: params.runtime.config,
      key: params.key,
      subjectKey: params.subjectKey,
    }),
  );
}

export async function autoPromoteRecurringProcedureCandidateFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  candidateId: string;
  input: CandidateSubmissionInput;
  title: string;
  subjectKey: string;
  procedureFamily: RecurringProcedureFamily;
  procedureKey?: RecurringProcedureKey;
  correctionPlan?: ReturnType<typeof resolveMemoryCorrectionPlan> | null;
  confirmationState?: "confirmed";
  supersedeValidatedProceduresBySubjectKey: typeof import("../recurring-procedure-lifecycle.js").supersedeValidatedProceduresBySubjectKey;
}): Promise<CandidateSubmissionResult> {
  const promotionMetadata = buildToolRecurringProcedureAutoPromotionMetadata({
    input: params.input,
    autoPromotionProfile: params.confirmationState
      ? params.procedureFamily === "generalized_named_checklist"
        ? "recurring_procedure_generalized_confirmation_v1"
        : "recurring_procedure_confirmation_v1"
      : params.correctionPlan?.status === "execute" &&
          params.correctionPlan.executionKind === "validated_procedure_supersede"
        ? params.procedureFamily === "generalized_named_checklist"
          ? "recurring_procedure_generalized_correction_v1"
          : "recurring_procedure_correction_v1"
        : "recurring_procedure_direct_v1",
    ...(params.confirmationState ? { confirmationState: params.confirmationState } : {}),
  });
  const transition = await advanceRecurringProcedureCandidateStages({
    config: params.runtime.config,
    candidateId: params.candidateId,
    title: params.title,
    subjectKey: params.subjectKey,
    correctionPlan: params.correctionPlan,
    agentExternalKey: params.input.agentId,
    sessionKey: params.input.sessionId,
    reviewCandidate: (input) => params.runtime.candidateReview.review(input),
    promoteToProcedureDraft: (input) =>
      params.runtime.candidatePromotion.promoteToProcedureDraft(input),
    validateProcedure: (input) => params.runtime.procedureValidation.validate(input),
    supersedeValidatedProceduresBySubjectKey: params.supersedeValidatedProceduresBySubjectKey,
    metadata: promotionMetadata,
    logLabel: "recurring-procedure tool",
    logContext: {
      candidateId: params.candidateId,
      subjectKey: params.subjectKey,
      correctionPromotion:
        params.correctionPlan?.status === "execute" &&
        params.correctionPlan.executionKind === "validated_procedure_supersede",
      ...(params.procedureKey ? { procedureKey: params.procedureKey } : {}),
    },
  });
  if (!transition.accepted || !transition.artifacts.validatedProcedureId) {
    return {
      accepted: false,
      status: "failed",
      kind: "procedure",
      reason: transition.accepted
        ? "validated procedure stage transition did not produce a validated procedure id"
        : transition.reason,
    };
  }
  return {
    accepted: true,
    status: "accepted",
    kind: "procedure",
    storage: "database",
    reviewState: "approved",
    eventId:
      transition.artifacts.candidateEventId ??
      readNestedMetadataString(params.input.metadata, ["sourceEventId"]) ??
      params.candidateId,
    memoryObjectId: transition.artifacts.validatedProcedureId,
  };
}

export async function maybeAutoPromoteToolSubmittedPreference(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  result: CandidateSubmissionResult;
}): Promise<CandidateSubmissionResult> {
  const autoPromotion =
    params.runtime.config.autoPromotion ?? DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG;
  if (
    autoPromotion.profile !== "explicit-user-preference-v1" ||
    !params.result.accepted ||
    !params.result.memoryObjectId
  ) {
    return params.result;
  }
  if (
    readCanonicalMemoryIngestionCandidateFromMetadata(params.input.metadata) &&
    !matchesSubmissionRoutingTarget(params.input.metadata, "response_style")
  ) {
    return params.result;
  }
  const parsedGeneral = resolveAutoPromotableFeedbackSubmission(params.input);
  const template = readAutoCaptureString(params.input.metadata, "template");
  const key = readAutoCaptureString(params.input.metadata, "key");
  const subjectKey = readAutoCaptureString(params.input.metadata, "subjectKey");
  const captureClass = readAutoCaptureString(params.input.metadata, "captureClass");
  const responseStyleFamily =
    (readAutoCaptureString(
      params.input.metadata,
      "responseStyleFamily",
    ) as ResponseStyleFamily | null) ?? null;
  const pendingConfirmationState = readNestedMetadataString(params.input.metadata, [
    "candidateLifecycle",
    "state",
  ]);
  if (
    isPendingCandidateLifecycleState(pendingConfirmationState) ||
    (!parsedGeneral &&
      (!isResponseStyleCanonicalTemplate(template) ||
        (!isExplicitRequirementCaptureClass(captureClass) &&
          !isRequirementCorrectionCaptureClass(captureClass))))
  ) {
    return params.result;
  }
  if (
    isRequirementCorrectionCaptureClass(captureClass) &&
    responseStyleFamily === "generalized_guidance"
  ) {
    if (!key || !subjectKey) {
      return params.result;
    }
    const inspection = await inspectResponseStyleLifecycle({
      config: params.runtime.config,
      key,
      subjectKey,
    });
    if (!inspection) {
      return params.result;
    }
    const correctionAttempt = await attemptApprovedMemoryObjectCorrectionPromotion({
      familyId: "response_style",
      trigger: "explicit_correction",
      promotionPolicy: resolveMemoryCorrectionPromotionPolicy(autoPromotion.profile),
      activeApprovedSubjectObjectIds: inspection.activeApprovedSubjectObjectIds,
      candidateId: params.result.memoryObjectId,
      reviewCandidate: params.runtime.candidateReview.review,
      promoteToMemory: params.runtime.candidatePromotion.promoteToMemory,
      promotionMetadata: buildToolResponseStyleAutoPromotionMetadata({
        input: params.input,
        autoPromotionProfile: "response_style_generalized_correction_v1",
      }),
      reviewerAgentId: params.input.agentId,
      config: params.runtime.config,
      schema: params.runtime.config.database?.schema ?? "memory_middleware",
      logContext: {
        key,
        subjectKey,
        correctionPromotion: true,
      },
      logLabel: "response-style correction",
      supersedeRationale:
        "older approved memory was superseded by a reviewed correction promotion for the same bounded subject",
      supersedeSource: "response-style-correction-promotion",
      supersedeReason: "candidate_correction_promotion",
      supersedeMetadata: {
        subjectKey,
      },
    });
    if (correctionAttempt.kind === "not_executable") {
      return params.result;
    }
    if (!correctionAttempt.accepted || !correctionAttempt.promotedMemoryObjectId) {
      return params.result;
    }
    return {
      ...params.result,
      memoryObjectId: correctionAttempt.promotedMemoryObjectId,
      reviewState: "approved",
    };
  }
  const autoPromotionMetadata = parsedGeneral
    ? {
        autoPromotion: {
          source: "candidate_submit_auto_promotion",
          captureSeam: "model_tool_primary",
          profile: autoPromotion.profile,
          captureProfile: "tool-submitted",
          captureClass: parsedGeneral.captureClass,
          reasonCode: parsedGeneral.reasonCode,
          key: parsedGeneral.key,
          subjectKey: parsedGeneral.subjectKey,
          subject: parsedGeneral.subject,
          value: parsedGeneral.value,
          toolName: "memory_candidate_submit",
        },
      }
    : buildToolResponseStyleAutoPromotionMetadata({
        input: params.input,
        autoPromotionProfile: autoPromotion.profile,
      });
  const reviewResult = await params.runtime.candidateReview.review({
    candidateId: params.result.memoryObjectId,
    outcome: "accepted",
    metadata: autoPromotionMetadata,
  });
  if (!reviewResult.accepted) {
    return params.result;
  }
  const promotionResult = await params.runtime.candidatePromotion.promoteToMemory({
    candidateId: params.result.memoryObjectId,
    metadata: autoPromotionMetadata,
  });
  if (!promotionResult.accepted) {
    return params.result;
  }
  return {
    ...params.result,
    memoryObjectId: promotionResult.promotedMemoryObjectId,
    reviewState: "approved",
  };
}

export async function maybeAutoPromoteToolSubmittedProjectFact(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  result: CandidateSubmissionResult;
}): Promise<CandidateSubmissionResult> {
  const autoPromotion =
    params.runtime.config.autoPromotion ?? DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG;
  if (
    autoPromotion.profile !== "explicit-user-preference-v1" ||
    !params.result.accepted ||
    !params.result.memoryObjectId ||
    params.input.kind !== "correction"
  ) {
    return params.result;
  }
  if (
    readCanonicalMemoryIngestionCandidateFromMetadata(params.input.metadata) &&
    !matchesSubmissionRoutingTarget(params.input.metadata, "project_fact")
  ) {
    return params.result;
  }

  const template = readAutoCaptureString(params.input.metadata, "template");
  const key = readAutoCaptureString(params.input.metadata, "key");
  const subjectKey = readAutoCaptureString(params.input.metadata, "subjectKey");
  const fieldKey = readAutoCaptureString(params.input.metadata, "fieldKey");
  const factFamily =
    readAutoCaptureString(params.input.metadata, "factFamily") ??
    (fieldKey ? "supported_field" : undefined);
  if (
    (template !== "project_fact_named_scope" &&
      template !== "project_fact_generalized_named_scope") ||
    !key ||
    !subjectKey ||
    !factFamily ||
    (fieldKey && !isSupportedProjectFactField(fieldKey))
  ) {
    return params.result;
  }

  const inspection = await inspectProjectFactLifecycle({
    config: params.runtime.config,
    key,
    subjectKey,
    ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
  });
  const fallbackApprovedSubjectObjectIds = await selectApprovedProjectFactSubjectObjectIds({
    runtime: params.runtime,
    subjectKey,
    ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
  });
  const activeApprovedSubjectObjectIds = inspection?.activeApprovedSubjectObjectIds.length
    ? inspection.activeApprovedSubjectObjectIds
    : fallbackApprovedSubjectObjectIds;

  const correctionAttempt = await attemptApprovedMemoryObjectCorrectionPromotion({
    familyId: "project_fact",
    trigger: "explicit_correction",
    promotionPolicy: resolveMemoryCorrectionPromotionPolicy(autoPromotion.profile),
    activeApprovedSubjectObjectIds,
    candidateId: params.result.memoryObjectId,
    reviewCandidate: params.runtime.candidateReview.review,
    promoteToMemory: params.runtime.candidatePromotion.promoteToMemory,
    promotionMetadata: buildToolProjectFactAutoPromotionMetadata({
      input: params.input,
      autoPromotionProfile:
        factFamily === "generalized_reference"
          ? "project_fact_generalized_correction_v1"
          : "project_fact_correction_v1",
    }),
    reviewerAgentId: params.input.agentId,
    config: params.runtime.config,
    schema: params.runtime.config.database?.schema ?? "memory_middleware",
    logContext: {
      key,
      subjectKey,
      factFamily,
      correctionPromotion: true,
    },
    logLabel: "project-fact correction",
    supersedeRationale:
      "older approved memory was superseded by a reviewed correction promotion for the same bounded subject",
    supersedeSource: "project-fact-correction-promotion",
    supersedeReason: "candidate_correction_promotion",
    supersedeMetadata: {
      subjectKey,
    },
  });
  if (correctionAttempt.kind === "not_executable") {
    return params.result;
  }
  if (!correctionAttempt.accepted || !correctionAttempt.promotedMemoryObjectId) {
    return params.result;
  }

  return {
    ...params.result,
    memoryObjectId: correctionAttempt.promotedMemoryObjectId,
    reviewState: "approved",
  };
}

async function selectApprovedProjectFactSubjectObjectIds(params: {
  runtime: MemoryMiddlewareRuntime;
  subjectKey: string;
  projectId?: string;
}): Promise<string[]> {
  const databaseUrl = params.runtime.config.database?.url;
  if (!databaseUrl) {
    return [];
  }

  const schema = params.runtime.config.database?.schema ?? "memory_middleware";
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const result = await client.query<{ id: string }>(
      `
        select id::text as id
        from ${schema}.memory_objects
        where review_state = 'approved'
          and (
            metadata->'candidateMetadata'->'autoCapture'->>'subjectKey' = $1::text
            or metadata->'candidateMetadata'->'canonicalIngestionCandidate'->'identity'->>'subjectKey' = $1::text
            or metadata->'promotionMetadata'->'autoPromotion'->>'subjectKey' = $1::text
            or metadata->'promotionMetadata'->'canonicalIngestionCandidate'->'identity'->>'subjectKey' = $1::text
            or metadata->'autoPromotion'->>'subjectKey' = $1::text
          )
          and ($2::uuid is null or project_id = $2::uuid)
        order by created_at desc, id desc
      `,
      [params.subjectKey, params.projectId ?? null],
    );
    return result.rows.map((row) => row.id);
  } catch {
    return [];
  } finally {
    await client.end().catch(() => {});
  }
}

export async function maybeAutoPromoteToolSubmittedRecurringProcedure(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  result: CandidateSubmissionResult;
  supersedeValidatedProceduresBySubjectKey: typeof import("../recurring-procedure-lifecycle.js").supersedeValidatedProceduresBySubjectKey;
}): Promise<CandidateSubmissionResult> {
  const autoPromotion =
    params.runtime.config.autoPromotion ?? DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG;
  if (
    autoPromotion.profile !== "explicit-user-preference-v1" ||
    !params.result.accepted ||
    !params.result.memoryObjectId ||
    params.input.kind !== "procedure"
  ) {
    return params.result;
  }
  if (
    readCanonicalMemoryIngestionCandidateFromMetadata(params.input.metadata) &&
    !matchesSubmissionRoutingTarget(params.input.metadata, "recurring_procedure")
  ) {
    return params.result;
  }

  const template = readAutoCaptureString(params.input.metadata, "template");
  const subjectKey = readAutoCaptureString(params.input.metadata, "subjectKey");
  const procedureFamily = readAutoCaptureString(params.input.metadata, "procedureFamily") as
    | RecurringProcedureFamily
    | undefined;
  const procedureKey = readAutoCaptureString(params.input.metadata, "procedureKey");
  const title =
    readAutoCaptureString(params.input.metadata, "title") ??
    (procedureKey && isSupportedRecurringProcedureKey(procedureKey)
      ? getRecurringProcedureTitle(procedureKey)
      : undefined);
  const pendingConfirmationState = readNestedMetadataString(params.input.metadata, [
    "candidateLifecycle",
    "state",
  ]);
  const captureClass = readAutoCaptureString(params.input.metadata, "captureClass");
  if (
    (template !== "named_recurring_checklist" && template !== "generalized_recurring_checklist") ||
    !subjectKey ||
    !procedureFamily ||
    (procedureKey !== undefined && !isSupportedRecurringProcedureKey(procedureKey)) ||
    !title ||
    isPendingCandidateLifecycleState(pendingConfirmationState)
  ) {
    return params.result;
  }

  const inspection = await inspectStagedRecurringProcedureLifecycle({
    runtime: params.runtime,
    key: readAutoCaptureString(params.input.metadata, "key") ?? params.result.memoryObjectId,
    subjectKey,
  });
  if (!inspection) {
    if (isRecurringProcedureCorrectionCaptureClass(captureClass)) {
      return params.result;
    }
    return autoPromoteRecurringProcedureCandidateFromTool({
      runtime: {
        ...params.runtime,
      },
      candidateId: params.result.memoryObjectId,
      input: params.input,
      title,
      subjectKey,
      procedureFamily,
      ...(procedureKey && isSupportedRecurringProcedureKey(procedureKey) ? { procedureKey } : {}),
      correctionPlan: null,
      supersedeValidatedProceduresBySubjectKey: params.supersedeValidatedProceduresBySubjectKey,
    });
  }

  if (
    inspection.hasActiveValidatedSubjectTargets &&
    !isRecurringProcedureCorrectionCaptureClass(captureClass)
  ) {
    return params.result;
  }

  if (
    procedureFamily === "generalized_named_checklist" &&
    !isRecurringProcedureCorrectionCaptureClass(captureClass)
  ) {
    return params.result;
  }

  const recurringProcedureCorrectionPlan = isRecurringProcedureCorrectionCaptureClass(captureClass)
    ? resolveMemoryCorrectionPlan({
        familyId: "recurring_procedure",
        trigger: "explicit_correction",
        promotionPolicy: resolveMemoryCorrectionPromotionPolicy(autoPromotion.profile),
        activeValidatedSubjectProcedureIds: inspection.activeValidatedSubjectProcedureIds,
      })
    : null;

  const promotionMetadata = buildToolRecurringProcedureAutoPromotionMetadata({
    input: params.input,
    autoPromotionProfile: recurringProcedureCorrectionPlan
      ? procedureFamily === "generalized_named_checklist"
        ? "recurring_procedure_generalized_correction_v1"
        : "recurring_procedure_correction_v1"
      : "recurring_procedure_direct_v1",
  });
  const transition = await advanceRecurringProcedureCandidateStages({
    config: params.runtime.config,
    candidateId: params.result.memoryObjectId,
    title,
    subjectKey,
    correctionPlan: recurringProcedureCorrectionPlan,
    agentExternalKey: params.input.agentId,
    sessionKey: params.input.sessionId,
    reviewCandidate: (input) => params.runtime.candidateReview.review(input),
    promoteToProcedureDraft: (input) =>
      params.runtime.candidatePromotion.promoteToProcedureDraft(input),
    validateProcedure: (input) => params.runtime.procedureValidation.validate(input),
    supersedeValidatedProceduresBySubjectKey: params.supersedeValidatedProceduresBySubjectKey,
    metadata: promotionMetadata,
    logLabel: "recurring-procedure tool",
    logContext: {
      candidateId: params.result.memoryObjectId,
      subjectKey,
      correctionPromotion:
        recurringProcedureCorrectionPlan?.status === "execute" &&
        recurringProcedureCorrectionPlan.executionKind === "validated_procedure_supersede",
      ...(procedureKey ? { procedureKey } : {}),
    },
  });
  if (!transition.accepted || !transition.artifacts.validatedProcedureId) {
    return params.result;
  }

  return {
    ...params.result,
    memoryObjectId: transition.artifacts.validatedProcedureId,
    reviewState: "approved",
  };
}
