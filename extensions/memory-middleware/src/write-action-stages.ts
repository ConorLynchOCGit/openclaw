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

export type CandidateWriteStageCondition = {
  submissionKinds?: readonly CandidateSubmissionInput["kind"][];
  lanes?: readonly CandidateWriteLane[];
  familyIds?: readonly MemoryFamilyId[];
  canonicalKinds?: readonly string[];
  captureCategories?: readonly string[];
  captureClasses?: readonly string[];
  derivedViews?: readonly string[];
};

export type CandidateWriteStageMatch = CandidateWriteStageCondition & {
  anyOf?: readonly CandidateWriteStageCondition[];
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
  const captureCategory =
    typeof canonicalCandidate?.record.compatibility.captureCategory === "string"
      ? canonicalCandidate.record.compatibility.captureCategory
      : undefined;
  const tags = canonicalCandidate?.record.tags ?? [];
  const captureClass = canonicalCandidate?.compatibility.captureClass;
  const canonicalFamilyId =
    captureCategory === "project_fact" ||
    captureCategory === "recurring_procedure" ||
    captureCategory === "workflow_improvement" ||
    captureCategory === "project_rule" ||
    captureCategory === "unmet_need"
      ? captureCategory
      : captureClass === "explicit_preference" ||
          captureClass === "preference_correction" ||
          captureClass === "explicit_requirement" ||
          captureClass === "requirement_correction"
        ? "response_style"
        : captureClass === "explicit_project_fact" || captureClass === "project_fact_correction"
          ? "project_fact"
          : captureClass === "recurring_procedure" ||
              captureClass === "recurring_procedure_correction"
            ? "recurring_procedure"
            : captureClass === "workflow_tool_gotcha" ||
                captureClass === "workflow_environment_constraint" ||
                captureClass === "workflow_api_workaround" ||
                captureClass === "workflow_generalized_guidance"
              ? "workflow_improvement"
              : captureClass === "project_rule_guidance"
                ? "project_rule"
                : captureClass === "unmet_need_recommendation"
                  ? "unmet_need"
                  : tags.includes("response_style")
                    ? "response_style"
                    : null;
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
  return null;
}

export type CandidateWriteClassification = {
  lanes: readonly CandidateWriteLane[];
  familyId: MemoryFamilyId | null;
  canonicalKind?: string;
  captureCategory?: string;
  captureClass?: string;
  derivedViews: readonly string[];
  dedupeKey?: string;
  subjectKey?: string;
};

export type CandidateWriteLane =
  | "user_preference"
  | "project_fact"
  | "recurring_procedure"
  | "workflow_guidance"
  | "project_rule"
  | "unmet_need";

export type CandidateWriteOperation = {
  id: string;
  input: CandidateSubmissionInput;
  classification: CandidateWriteClassification;
};

export type CandidateWritePlan = {
  operation: CandidateWriteOperation;
};

function resolveCandidateWriteLanes(params: {
  familyId: MemoryFamilyId | null;
  captureCategory?: string;
  derivedViews: readonly string[];
}): readonly CandidateWriteLane[] {
  const lanes = new Set<CandidateWriteLane>();
  if (params.familyId === "response_style" || params.derivedViews.includes("response_style")) {
    lanes.add("user_preference");
  }
  if (params.captureCategory === "project_fact" || params.familyId === "project_fact") {
    lanes.add("project_fact");
  }
  if (
    params.captureCategory === "recurring_procedure" ||
    params.familyId === "recurring_procedure"
  ) {
    lanes.add("recurring_procedure");
  }
  if (
    params.captureCategory === "workflow_improvement" ||
    params.familyId === "workflow_improvement" ||
    params.derivedViews.includes("workflow_guidance")
  ) {
    lanes.add("workflow_guidance");
  }
  if (params.captureCategory === "project_rule" || params.familyId === "project_rule") {
    lanes.add("project_rule");
  }
  if (params.captureCategory === "unmet_need" || params.familyId === "unmet_need") {
    lanes.add("unmet_need");
  }
  return [...lanes];
}

export function resolveCandidateWriteClassification(
  input: CandidateSubmissionInput,
): CandidateWriteClassification {
  const canonicalCandidate = readCanonicalMemoryIngestionCandidateFromMetadata(input.metadata);
  const familyId = resolveCandidateWriteFamilyId(input);
  const derivedViews =
    Array.isArray(canonicalCandidate?.record.tags) &&
    canonicalCandidate.record.tags.some((tag) => tag === "workflow_guidance")
      ? ["workflow_guidance"]
      : [];
  const captureCategory =
    typeof canonicalCandidate?.record.compatibility.captureCategory === "string"
      ? canonicalCandidate.record.compatibility.captureCategory
      : undefined;
  return {
    lanes: resolveCandidateWriteLanes({
      familyId,
      captureCategory,
      derivedViews,
    }),
    familyId,
    canonicalKind: canonicalCandidate?.record.kind,
    captureCategory,
    captureClass: canonicalCandidate?.compatibility.captureClass,
    derivedViews,
    dedupeKey:
      typeof canonicalCandidate?.identity.dedupeKey === "string"
        ? canonicalCandidate.identity.dedupeKey
        : undefined,
    subjectKey:
      typeof canonicalCandidate?.identity.subjectKey === "string"
        ? canonicalCandidate.identity.subjectKey
        : undefined,
  };
}

export function buildCandidateWritePlan(input: CandidateSubmissionInput): CandidateWritePlan {
  const classification = resolveCandidateWriteClassification(input);
  return {
    operation: {
      id: "primary",
      input,
      classification,
    },
  };
}

function readPrimaryCandidateWriteOperation<TContext extends { input: CandidateSubmissionInput }>(
  context: TContext & {
    candidateWritePlan?: CandidateWritePlan;
  },
): CandidateWriteOperation {
  const plan = context.candidateWritePlan ?? buildCandidateWritePlan(context.input);
  return plan.operation;
}

export function buildCandidateWriteExecutionContext<
  TContext extends { input: CandidateSubmissionInput },
>(
  context: TContext,
): TContext & {
  candidateWritePlan: CandidateWritePlan;
  candidateWriteClassification: CandidateWriteClassification;
} {
  const candidateWritePlan = buildCandidateWritePlan(context.input);
  return {
    ...context,
    candidateWritePlan,
    candidateWriteClassification: candidateWritePlan.operation.classification,
  };
}

function readCandidateWriteClassification<TContext extends { input: CandidateSubmissionInput }>(
  context: TContext & {
    candidateWritePlan?: CandidateWritePlan;
    candidateWriteClassification?: CandidateWriteClassification;
  },
): CandidateWriteClassification {
  return (
    context.candidateWriteClassification ??
    readPrimaryCandidateWriteOperation(context).classification
  );
}

function matchesCandidateWriteStageCondition(
  input: CandidateSubmissionInput,
  classification: CandidateWriteClassification,
  match: CandidateWriteStageCondition | undefined,
): boolean {
  if (!match) {
    return true;
  }
  if (match.submissionKinds && !match.submissionKinds.includes(input.kind)) {
    return false;
  }
  if (match.lanes && !match.lanes.some((lane) => classification.lanes.includes(lane))) {
    return false;
  }
  if (match.familyIds) {
    if (!classification.familyId || !match.familyIds.includes(classification.familyId)) {
      return false;
    }
  }
  if (
    match.canonicalKinds &&
    (!classification.canonicalKind || !match.canonicalKinds.includes(classification.canonicalKind))
  ) {
    return false;
  }
  if (
    match.captureCategories &&
    (!classification.captureCategory ||
      !match.captureCategories.includes(classification.captureCategory))
  ) {
    return false;
  }
  if (
    match.captureClasses &&
    (!classification.captureClass || !match.captureClasses.includes(classification.captureClass))
  ) {
    return false;
  }
  if (
    match.derivedViews &&
    !match.derivedViews.some((derivedView) => classification.derivedViews.includes(derivedView))
  ) {
    return false;
  }
  return true;
}

function matchesCandidateWriteStage<TContext extends { input: CandidateSubmissionInput }>(
  context: TContext & {
    candidateWritePlan?: CandidateWritePlan;
    candidateWriteClassification?: CandidateWriteClassification;
  },
  match: CandidateWriteStageMatch | undefined,
): boolean {
  if (!match) {
    return true;
  }
  const classification = readCandidateWriteClassification(context);
  if (!matchesCandidateWriteStageCondition(context.input, classification, match)) {
    return false;
  }
  if (
    match.anyOf &&
    !match.anyOf.some((candidate) =>
      matchesCandidateWriteStageCondition(context.input, classification, candidate),
    )
  ) {
    return false;
  }
  return true;
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
      matchesCandidateWriteStage(params.context, stage.match),
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
      matchesCandidateWriteStage(params.context, stage.match),
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

export async function submitCandidateWritePlan(params: {
  runtime: MemoryMiddlewareRuntime;
  plan: CandidateWritePlan;
}): Promise<CandidateSubmissionResult> {
  return submitCandidateByKind({
    runtime: params.runtime,
    input: params.plan.operation.input,
  });
}
