import type { MemoryFamilyId } from "openclaw/plugin-sdk/memory-family-policy";
import type { CandidateSubmissionInput, CandidateSubmissionResult } from "./db/runtime.js";
import { readCanonicalMemoryIngestionCandidateFromMetadata } from "./memory-canonical-compat.js";
import type { MemoryMiddlewareRuntime } from "./runtime.js";

export type WriteResolutionStage<TContext, TResult> = {
  id: string;
  resolve: (context: TContext) => Promise<TResult | null>;
};

export type WriteHandledStage<TContext> = {
  id: string;
  handle: (context: TContext) => Promise<boolean>;
};

export type WriteResultStage<TContext, TResult> = {
  id: string;
  apply: (params: { context: TContext; result: TResult }) => Promise<TResult>;
};

export type CandidateWriteStageMatch = {
  submissionKinds?: readonly CandidateSubmissionInput["kind"][];
  familyIds?: readonly MemoryFamilyId[];
};

export type CandidateWriteResolutionStage<TContext, TResult> = WriteResolutionStage<
  TContext,
  TResult
> & {
  match?: CandidateWriteStageMatch;
};

export type CandidateWriteResultStage<TContext, TResult> = WriteResultStage<TContext, TResult> & {
  match?: CandidateWriteStageMatch;
};

export async function runWriteResolutionStages<TContext, TResult>(params: {
  context: TContext;
  stages: readonly WriteResolutionStage<TContext, TResult>[];
}): Promise<TResult | null> {
  for (const stage of params.stages) {
    const resolved = await stage.resolve(params.context);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

export async function runWriteHandledStages<TContext>(params: {
  context: TContext;
  stages: readonly WriteHandledStage<TContext>[];
}): Promise<boolean> {
  for (const stage of params.stages) {
    if (await stage.handle(params.context)) {
      return true;
    }
  }
  return false;
}

export async function runWriteResultStages<TContext, TResult>(params: {
  context: TContext;
  result: TResult;
  stages: readonly WriteResultStage<TContext, TResult>[];
}): Promise<TResult> {
  let result = params.result;
  for (const stage of params.stages) {
    result = await stage.apply({
      context: params.context,
      result,
    });
  }
  return result;
}

function resolveCandidateWriteFamilyId(input: CandidateSubmissionInput): MemoryFamilyId | null {
  const canonicalCandidate = readCanonicalMemoryIngestionCandidateFromMetadata(input.metadata);
  const canonicalFamilyId = canonicalCandidate?.compatibility.transitionalFamilyId;
  if (
    canonicalFamilyId === "response_style" ||
    canonicalFamilyId === "project_fact" ||
    canonicalFamilyId === "recurring_procedure" ||
    canonicalFamilyId === "workflow_improvement" ||
    canonicalFamilyId === "project_rule" ||
    canonicalFamilyId === "unmet_need"
  ) {
    return canonicalFamilyId;
  }

  const metadata = input.metadata;
  const autoCapture =
    metadata?.autoCapture &&
    typeof metadata.autoCapture === "object" &&
    !Array.isArray(metadata.autoCapture)
      ? (metadata.autoCapture as Record<string, unknown>)
      : null;
  const category = typeof metadata?.category === "string" ? metadata.category : null;
  const template = typeof autoCapture?.template === "string" ? autoCapture.template : null;
  const captureClass =
    typeof autoCapture?.captureClass === "string" ? autoCapture.captureClass : null;

  if (
    category === "user_preference" ||
    category === "user_requirement" ||
    (template !== null &&
      (template.startsWith("responses_") || template === "response_style_generalized_guidance")) ||
    captureClass === "explicit_preference" ||
    captureClass === "explicit_requirement" ||
    captureClass === "preference_correction" ||
    captureClass === "requirement_correction"
  ) {
    return "response_style";
  }
  if (
    category === "project_fact" ||
    category === "project_fact_correction" ||
    template === "project_fact_named_scope" ||
    template === "project_fact_generalized_named_scope"
  ) {
    return "project_fact";
  }
  if (
    category === "recurring_procedure" ||
    category === "recurring_procedure_correction" ||
    captureClass === "explicit_recurring_procedure" ||
    captureClass === "recurring_procedure_correction"
  ) {
    return "recurring_procedure";
  }
  if (
    category === "project_rule" ||
    category === "unmet_need" ||
    category === "workflow_improvement" ||
    captureClass === "project_rule_guidance" ||
    captureClass === "unmet_need_recommendation" ||
    captureClass === "workflow_generalized_guidance" ||
    captureClass === "workflow_supported_lesson"
  ) {
    if (category === "project_rule" || captureClass === "project_rule_guidance") {
      return "project_rule";
    }
    if (category === "unmet_need" || captureClass === "unmet_need_recommendation") {
      return "unmet_need";
    }
    return "workflow_improvement";
  }
  return null;
}

function matchesCandidateWriteStage(
  input: CandidateSubmissionInput,
  match: CandidateWriteStageMatch | undefined,
): boolean {
  if (!match) {
    return true;
  }
  if (match.submissionKinds && !match.submissionKinds.includes(input.kind)) {
    return false;
  }
  if (!match.familyIds) {
    return true;
  }
  const familyId = resolveCandidateWriteFamilyId(input);
  return familyId ? match.familyIds.includes(familyId) : false;
}

export async function runCandidateWriteResolutionStages<
  TContext extends { input: CandidateSubmissionInput },
  TResult,
>(params: {
  context: TContext;
  stages: readonly CandidateWriteResolutionStage<TContext, TResult>[];
}): Promise<TResult | null> {
  return runWriteResolutionStages({
    context: params.context,
    stages: params.stages.filter((stage) =>
      matchesCandidateWriteStage(params.context.input, stage.match),
    ),
  });
}

export async function runCandidateWriteResultStages<
  TContext extends { input: CandidateSubmissionInput },
  TResult,
>(params: {
  context: TContext;
  result: TResult;
  stages: readonly CandidateWriteResultStage<TContext, TResult>[];
}): Promise<TResult> {
  return runWriteResultStages({
    context: params.context,
    result: params.result,
    stages: params.stages.filter((stage) =>
      matchesCandidateWriteStage(params.context.input, stage.match),
    ),
  });
}

const SUBMIT_CANDIDATE_INGRESS_METHOD = {
  learning: "submitLearning",
  correction: "submitCorrectionSuggestion",
  procedure: "submitProcedureSuggestion",
  improvement: "submitImprovementNote",
} as const satisfies Record<
  CandidateSubmissionInput["kind"],
  keyof MemoryMiddlewareRuntime["candidateIngress"]
>;

export async function submitCandidateByKind(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
}): Promise<CandidateSubmissionResult> {
  const method = SUBMIT_CANDIDATE_INGRESS_METHOD[params.input.kind];
  return params.runtime.candidateIngress[method](params.input);
}
