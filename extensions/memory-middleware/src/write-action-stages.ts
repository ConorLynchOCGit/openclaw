import type { CandidateSubmissionInput, CandidateSubmissionResult } from "./db/runtime.js";
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

export async function submitCandidateByKind(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
}): Promise<CandidateSubmissionResult> {
  switch (params.input.kind) {
    case "learning":
      return params.runtime.candidateIngress.submitLearning(params.input);
    case "correction":
      return params.runtime.candidateIngress.submitCorrectionSuggestion(params.input);
    case "procedure":
      return params.runtime.candidateIngress.submitProcedureSuggestion(params.input);
    case "improvement":
      return params.runtime.candidateIngress.submitImprovementNote(params.input);
  }
}
