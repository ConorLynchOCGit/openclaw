import { z } from "zod";
import {
  type JsonModelExecutor,
  parseJsonModelOutput,
} from "../../../model-memory/src/model-execution.ts";
import {
  MEMORY_CAPTURE_QUALITY_CORPUS,
  type MemoryCaptureQualityCase,
} from "./memory-capture-quality-corpus.ts";

export const MemoryCaptureModelQualityReviewSchema = z
  .object({
    schemaVersion: z.literal("model-memory.capture-quality-review.v1"),
    reviewerModelRef: z.string().trim().min(1),
    qualityDecision: z.enum(["passed", "needs_review", "failed"]),
    humanReadableAssessment: z.string().trim().min(1).max(4_000),
    captureQualityAssessment: z.string().trim().min(1).max(2_000),
    missedMemoryRisks: z.array(z.string().trim().min(1).max(240)).max(12),
    junkCaptureRisks: z.array(z.string().trim().min(1).max(240)).max(12),
    contradictionHandlingAssessment: z.string().trim().min(1).max(1_200),
    salienceAssessment: z.string().trim().min(1).max(1_200),
    recommendedNextStep: z.string().trim().min(1).max(1_200),
    evidenceRefs: z.array(z.string().trim().min(1).max(240)).min(1).max(24),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    workQueueLifecycleMutated: z.literal(false),
  })
  .strict();

export type MemoryCaptureModelQualityReview = z.infer<typeof MemoryCaptureModelQualityReviewSchema>;

export type MemoryCaptureQualityReviewResult = {
  artifactKind: "memory_capture_quality_model_review";
  status: "passed" | "needs_review" | "failed";
  corpusVersion: "model-memory.capture-quality.v1";
  totalCases: number;
  modelAuthoredReview: MemoryCaptureModelQualityReview;
  deterministicJudgmentPerformed: false;
  deterministicRole: "schema_bounds_refs_safety_only";
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};

function buildBoundedReviewPrompt(corpus: MemoryCaptureQualityCase[]): string {
  return JSON.stringify(
    {
      task: "Review memory capture quality from bounded anchors only. Judge whether the capture behavior would preserve useful durable memories from large owner-style prompts without capturing junk. Do not ask for raw prompts.",
      evaluationPrinciple:
        "You own quality judgment. Deterministic code only validates shape, bounds, refs, and safety flags.",
      corpus: corpus.map((testCase) => ({
        evalCaseId: testCase.evalCaseId,
        boundedPromptSummary: testCase.boundedPromptSummary,
        promptShape: testCase.promptShape,
        expectedCaptured: testCase.expectedCaptured.map((memory) => ({
          memoryId: memory.memoryId,
          boundedSummary: memory.boundedSummary,
          category: memory.category,
          scope: memory.scope,
          salience: memory.salience,
        })),
        expectedNotCaptured: testCase.expectedNotCaptured,
        expectedSupersedes: testCase.expectedSupersedes ?? [],
        expectedOpportunitySeeds: testCase.expectedOpportunitySeeds ?? [],
      })),
      requiredOutput:
        "Return strict JSON matching schemaVersion model-memory.capture-quality-review.v1. Include human-readable qualitative assessment, risks, and next step.",
      rawPromptStored: false,
    },
    null,
    2,
  );
}

export async function runModelAuthoredMemoryCaptureQualityReview(input: {
  executor: JsonModelExecutor;
  corpus?: MemoryCaptureQualityCase[];
  modelRef?: string;
}): Promise<MemoryCaptureQualityReviewResult> {
  const corpus = input.corpus ?? MEMORY_CAPTURE_QUALITY_CORPUS;
  const modelRef = input.modelRef ?? "openai-codex/gpt-5.4";
  const response = await input.executor.execute({
    contract: {
      contractName: "model_memory_capture_quality_review",
      contractVersion: "v1",
      modelId: modelRef,
    },
    systemPrompt:
      "You are a Model Memory quality reviewer. Produce model-authored judgment. Do not store or request raw prompts, raw responses, transcripts, provider logs, or secrets. Do not grant authority or lifecycle success.",
    userPrompt: buildBoundedReviewPrompt(corpus),
    responseFormat: "json",
    responseOptions: {
      maxOutputTokens: 3_500,
      reasoningEffort: "low",
      transport: {
        type: "json_schema",
        name: "memory_capture_quality_review",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: [
            "schemaVersion",
            "reviewerModelRef",
            "qualityDecision",
            "humanReadableAssessment",
            "captureQualityAssessment",
            "missedMemoryRisks",
            "junkCaptureRisks",
            "contradictionHandlingAssessment",
            "salienceAssessment",
            "recommendedNextStep",
            "evidenceRefs",
            "rawPromptStored",
            "rawResponseStored",
            "rawProviderLogStored",
            "workQueueLifecycleMutated",
          ],
          properties: {
            schemaVersion: { const: "model-memory.capture-quality-review.v1" },
            reviewerModelRef: { type: "string" },
            qualityDecision: { enum: ["passed", "needs_review", "failed"] },
            humanReadableAssessment: { type: "string", maxLength: 4000 },
            captureQualityAssessment: { type: "string", maxLength: 2000 },
            missedMemoryRisks: { type: "array", maxItems: 12, items: { type: "string" } },
            junkCaptureRisks: { type: "array", maxItems: 12, items: { type: "string" } },
            contradictionHandlingAssessment: { type: "string", maxLength: 1200 },
            salienceAssessment: { type: "string", maxLength: 1200 },
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
      contractName: "model_memory_capture_quality_review",
      contractVersion: "v1",
      modelId: modelRef,
    },
    MemoryCaptureModelQualityReviewSchema,
  );
  return {
    artifactKind: "memory_capture_quality_model_review",
    status: review.qualityDecision,
    corpusVersion: "model-memory.capture-quality.v1",
    totalCases: corpus.length,
    modelAuthoredReview: review,
    deterministicJudgmentPerformed: false,
    deterministicRole: "schema_bounds_refs_safety_only",
    reasonCodes:
      review.qualityDecision === "passed"
        ? ["model_authored_capture_quality_review_passed"]
        : ["model_authored_capture_quality_review_requires_attention"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function validateModelAuthoredMemoryCaptureQualityReview(input: {
  review: unknown;
  totalCases?: number;
}): MemoryCaptureQualityReviewResult {
  const review = MemoryCaptureModelQualityReviewSchema.parse(input.review);
  return {
    artifactKind: "memory_capture_quality_model_review",
    status: review.qualityDecision,
    corpusVersion: "model-memory.capture-quality.v1",
    totalCases: input.totalCases ?? MEMORY_CAPTURE_QUALITY_CORPUS.length,
    modelAuthoredReview: review,
    deterministicJudgmentPerformed: false,
    deterministicRole: "schema_bounds_refs_safety_only",
    reasonCodes: ["model_authored_capture_quality_review_shape_valid"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}
