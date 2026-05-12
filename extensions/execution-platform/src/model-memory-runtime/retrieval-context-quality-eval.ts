import { z } from "zod";
import {
  type JsonModelExecutor,
  parseJsonModelOutput,
} from "../../../model-memory/src/model-execution.ts";
import {
  RETRIEVAL_CONTEXT_QUALITY_CORPUS,
  type RetrievalContextQualityCase,
} from "./retrieval-context-quality-corpus.ts";

export const RetrievalContextModelQualityReviewSchema = z
  .object({
    schemaVersion: z.literal("model-memory.retrieval-context-quality-review.v1"),
    reviewerModelRef: z.string().trim().min(1),
    qualityDecision: z.enum(["passed", "needs_review", "failed"]),
    humanReadableAssessment: z.string().trim().min(1).max(4_000),
    retrievalQualityAssessment: z.string().trim().min(1).max(2_000),
    contextPackUsefulnessAssessment: z.string().trim().min(1).max(2_000),
    workflowImpactAssessment: z.string().trim().min(1).max(2_000),
    staleSuppressionAssessment: z.string().trim().min(1).max(1_200),
    distractingContextRisks: z.array(z.string().trim().min(1).max(240)).max(12),
    recommendedNextStep: z.string().trim().min(1).max(1_200),
    evidenceRefs: z.array(z.string().trim().min(1).max(240)).min(1).max(24),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    workQueueLifecycleMutated: z.literal(false),
  })
  .strict();

export type RetrievalContextModelQualityReview = z.infer<
  typeof RetrievalContextModelQualityReviewSchema
>;

export type RetrievalContextQualityReviewResult = {
  artifactKind: "retrieval_context_quality_model_review";
  status: "passed" | "needs_review" | "failed";
  corpusVersion: "model-memory.retrieval-context-quality.v1";
  totalCases: number;
  modelAuthoredReview: RetrievalContextModelQualityReview;
  deterministicJudgmentPerformed: false;
  deterministicRole: "schema_bounds_refs_safety_only";
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};

function buildBoundedReviewPrompt(corpus: RetrievalContextQualityCase[]): string {
  return JSON.stringify(
    {
      task: "Review retrieval and context-pack quality from bounded anchors only. Judge whether context packs improve workflow output without stale, distracting, or unsafe context.",
      evaluationPrinciple:
        "You own quality judgment. Deterministic code only validates shape, bounds, refs, and safety flags.",
      corpus: corpus.map((testCase) => ({
        evalCaseId: testCase.evalCaseId,
        workflowSurface: testCase.workflowSurface,
        boundedPromptSummary: testCase.boundedPromptSummary,
        expectedRelevantRefs: testCase.expectedRelevantRefs,
        expectedSuppressedRefs: testCase.expectedSuppressedRefs,
        expectedContextPackKinds: testCase.expectedContextPackKinds,
        baselineExpectedWeakness: testCase.baselineExpectedWeakness,
        expectedImprovement: testCase.expectedImprovement,
      })),
      requiredOutput:
        "Return strict JSON matching schemaVersion model-memory.retrieval-context-quality-review.v1. Include human-readable qualitative assessment, workflow impact, risks, and next step.",
      rawPromptStored: false,
    },
    null,
    2,
  );
}

export async function runModelAuthoredRetrievalContextQualityReview(input: {
  executor: JsonModelExecutor;
  corpus?: RetrievalContextQualityCase[];
  modelRef?: string;
  supplementalEvidence?: Array<{
    evalCaseId: string;
    selectedPackRefs: string[];
    skippedStaleRefs: string[];
    workflowOutputEvidenceRef: string;
    boundedQualitySummary: string;
  }>;
}): Promise<RetrievalContextQualityReviewResult> {
  const corpus = input.corpus ?? RETRIEVAL_CONTEXT_QUALITY_CORPUS;
  const modelRef = input.modelRef ?? "openai-codex/gpt-5.4";
  const response = await input.executor.execute({
    contract: {
      contractName: "model_memory_retrieval_context_quality_review",
      contractVersion: "v1",
      modelId: modelRef,
    },
    systemPrompt:
      "You are a Model Memory retrieval/context quality reviewer. Produce model-authored judgment. Do not store or request raw prompts, raw responses, transcripts, provider logs, or secrets. Do not grant authority or lifecycle success.",
    userPrompt: JSON.stringify(
      {
        boundedReviewRequest: JSON.parse(buildBoundedReviewPrompt(corpus)),
        supplementalEvidence: input.supplementalEvidence ?? [],
      },
      null,
      2,
    ),
    responseFormat: "json",
    responseOptions: {
      maxOutputTokens: 3_500,
      reasoningEffort: "low",
      transport: {
        type: "json_schema",
        name: "retrieval_context_quality_review",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: [
            "schemaVersion",
            "reviewerModelRef",
            "qualityDecision",
            "humanReadableAssessment",
            "retrievalQualityAssessment",
            "contextPackUsefulnessAssessment",
            "workflowImpactAssessment",
            "staleSuppressionAssessment",
            "distractingContextRisks",
            "recommendedNextStep",
            "evidenceRefs",
            "rawPromptStored",
            "rawResponseStored",
            "rawProviderLogStored",
            "workQueueLifecycleMutated",
          ],
          properties: {
            schemaVersion: { const: "model-memory.retrieval-context-quality-review.v1" },
            reviewerModelRef: { type: "string" },
            qualityDecision: { enum: ["passed", "needs_review", "failed"] },
            humanReadableAssessment: { type: "string", maxLength: 4000 },
            retrievalQualityAssessment: { type: "string", maxLength: 2000 },
            contextPackUsefulnessAssessment: { type: "string", maxLength: 2000 },
            workflowImpactAssessment: { type: "string", maxLength: 2000 },
            staleSuppressionAssessment: { type: "string", maxLength: 1200 },
            distractingContextRisks: { type: "array", maxItems: 12, items: { type: "string" } },
            recommendedNextStep: { type: "string", maxLength: 1200 },
            evidenceRefs: { type: "array", minItems: 1, maxItems: 24, items: { type: "string" } },
            rawPromptStored: { const: false },
            rawResponseStored: { const: false },
            rawProviderLogStored: { const: false },
            workQueueLifecycleMutated: { const: false },
          },
        },
      },
    },
  });
  const review = parseJsonModelOutput(
    response,
    {
      contractName: "model_memory_retrieval_context_quality_review",
      contractVersion: "v1",
      modelId: modelRef,
    },
    RetrievalContextModelQualityReviewSchema,
  );
  return {
    artifactKind: "retrieval_context_quality_model_review",
    status: review.qualityDecision,
    corpusVersion: "model-memory.retrieval-context-quality.v1",
    totalCases: corpus.length,
    modelAuthoredReview: review,
    deterministicJudgmentPerformed: false,
    deterministicRole: "schema_bounds_refs_safety_only",
    reasonCodes:
      review.qualityDecision === "passed"
        ? ["model_authored_retrieval_context_quality_review_passed"]
        : ["model_authored_retrieval_context_quality_review_requires_attention"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function validateModelAuthoredRetrievalContextQualityReview(input: {
  review: unknown;
  totalCases?: number;
}): RetrievalContextQualityReviewResult {
  const review = RetrievalContextModelQualityReviewSchema.parse(input.review);
  return {
    artifactKind: "retrieval_context_quality_model_review",
    status: review.qualityDecision,
    corpusVersion: "model-memory.retrieval-context-quality.v1",
    totalCases: input.totalCases ?? RETRIEVAL_CONTEXT_QUALITY_CORPUS.length,
    modelAuthoredReview: review,
    deterministicJudgmentPerformed: false,
    deterministicRole: "schema_bounds_refs_safety_only",
    reasonCodes: ["model_authored_retrieval_context_quality_review_shape_valid"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}
