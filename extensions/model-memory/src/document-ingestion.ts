import { z } from "zod";
import type {
  CapturedMemoryObject,
  DocumentIngestionInput,
  DocumentIngestionResult,
  DocumentWindowIngestionResult,
  IngestionSourceWindow,
  SharedIngestionResult,
} from "./document-ingestion-contracts.ts";
import { buildHeadingPathOptions, buildHeadingPathRefLookup } from "./heading-paths.ts";
import { ingestDocumentV2ForLivePath } from "./mmv2/live-document-ingestion.ts";
import { JsonModelOutputError } from "./model-execution.ts";
import {
  buildSemanticCandidateExtractionPrompt,
  buildSemanticCandidateExtractionRepairPrompt,
  buildSemanticExtractionPrompt,
  buildSemanticExtractionRepairPrompt,
} from "./semantic-extraction-prompt.ts";
export type {
  CapturedMemoryObject,
  DocumentIngestionInput,
  DocumentIngestionResult,
  DocumentWindowIngestionResult,
  IngestionBlockDescriptor,
  IngestionSourceWindow,
  SharedIngestionResult,
} from "./document-ingestion-contracts.ts";
import type { SemanticInterpreter, SemanticInterpreterResult } from "./semantic-interpreter.ts";
import type { ModelMemoryObject } from "./semantic-schema.ts";
import type {
  SourceWindowValidationContext,
  ValidationFailure,
  ValidationResult,
} from "./semantic-validator.ts";
import { validateMemoryObject } from "./semantic-validator.ts";
import {
  adaptDocumentSource,
  type DocumentSourceInput,
} from "./source-adapters/document-source-adapter.ts";
import type { ModelMemorySourceKind } from "./storage-database-contract.ts";

type IngestionSourceEnvelope<
  TSource extends { id: string; sourceKind: ModelMemorySourceKind },
  TWindow extends IngestionSourceWindow,
> = {
  source: TSource;
  windows: TWindow[];
};

export const DOCUMENT_INGEST_ENGINE_ENV = "MODEL_MEMORY_DOCUMENT_INGEST_ENGINE";

export type DocumentIngestEngine = "v1" | "mmv2";

const CandidateTypeSchema = z.enum(["preference", "fact", "rule", "procedure", "reference"]);
const CandidateConfidenceSchema = z.enum(["weak", "medium", "strong"]);

const CandidateSupportingSpanSchema = z
  .object({
    blockId: z.string().trim().min(1).optional(),
    lineStart: z.number().int().min(1).optional(),
    lineEnd: z.number().int().min(1).optional(),
    headingPath: z.array(z.string().trim().min(1)).default([]),
    headingPathRef: z.string().trim().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.blockId && value.lineStart === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "candidate supporting span requires blockId or lineStart",
        path: ["blockId"],
      });
    }
    if ((value.lineStart === undefined) !== (value.lineEnd === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "candidate lineStart and lineEnd must be provided together",
        path: ["lineStart"],
      });
    }
    if (
      value.lineStart !== undefined &&
      value.lineEnd !== undefined &&
      value.lineEnd < value.lineStart
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "candidate lineEnd must be greater than or equal to lineStart",
        path: ["lineEnd"],
      });
    }
  });

const CandidateMemoryObjectSchema = z
  .object({
    candidateType: CandidateTypeSchema,
    claim: z.string().trim().min(1),
    supportingSpans: z.array(CandidateSupportingSpanSchema).min(1),
    confidence: CandidateConfidenceSchema,
    shouldStore: z.boolean(),
  })
  .strict();

type CandidateSupportingSpan = z.infer<typeof CandidateSupportingSpanSchema>;
type CandidateMemoryObject = z.infer<typeof CandidateMemoryObjectSchema>;
type CandidateWithEvidence = CandidateMemoryObject & {
  candidateId: string;
  supportingEvidence: Array<{
    blockId?: string;
    lineStart?: number;
    lineEnd?: number;
    headingPath: string[];
    headingPathRef?: string;
    excerpt: string;
  }>;
};

type DocumentIngestionStage =
  | "pass_1_candidate"
  | "pass_1_repair"
  | "pass_2_canonicalization"
  | "pass_2_repair";

function createValidationContext(
  sourceWindow: IngestionSourceWindow,
): SourceWindowValidationContext {
  const headingPathOptions = buildHeadingPathOptions(
    Array.from(
      new Set(sourceWindow.blockDescriptors.map((block) => JSON.stringify(block.headingPath))),
    ).map((serialized) => JSON.parse(serialized) as string[]),
  );

  return {
    availableBlockIds: sourceWindow.blockDescriptors.map((block) => block.id),
    lineStart: sourceWindow.lineStart,
    lineEnd: sourceWindow.lineEnd,
    headingPaths: headingPathOptions.map((option) => option.headingPath),
    headingPathRefs: buildHeadingPathRefLookup(headingPathOptions),
  };
}

function createCaptureObjects(
  sourceWindowId: string,
  sourceKind: ModelMemorySourceKind,
  objects: ModelMemoryObject[],
  modelId: string,
  contractVersion: string,
): CapturedMemoryObject[] {
  return objects.map((object) => ({
    sourceWindowId,
    sourceKind,
    object,
    contractName: "semantic_extraction",
    contractVersion,
    modelId,
  }));
}

function collectValidationResults(
  result: SemanticInterpreterResult,
  sourceWindow: IngestionSourceWindow,
): {
  acceptedObjects: ModelMemoryObject[];
  errors: ValidationFailure[];
  validations: Array<{ rawObject: unknown; validation: ValidationResult }>;
} {
  if (result.action === "ignore") {
    return { acceptedObjects: [], errors: [], validations: [] };
  }

  const context = createValidationContext(sourceWindow);
  const acceptedObjects: ModelMemoryObject[] = [];
  const errors: ValidationFailure[] = [];
  const validations: Array<{ rawObject: unknown; validation: ValidationResult }> = [];

  for (const rawObject of result.objects) {
    const validation = validateMemoryObject(rawObject, context);
    validations.push({ rawObject, validation });
    if (validation.status === "accept") {
      acceptedObjects.push(validation.object);
      continue;
    }
    errors.push(...validation.errors);
  }

  return {
    acceptedObjects,
    errors,
    validations,
  };
}

function canAttemptStructuralRepair(validations: Array<{ validation: ValidationResult }>): boolean {
  return validations.some(({ validation }) => validation.status !== "accept");
}

function normalizeCandidateClaim(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function validateCandidateSupportingSpan(
  span: CandidateSupportingSpan,
  context: SourceWindowValidationContext,
): ValidationFailure[] {
  const errors: ValidationFailure[] = [];
  const resolvedHeadingPath = resolveHeadingPathFromRef(
    span.headingPath,
    span.headingPathRef,
    context,
    "supportingSpans.headingPathRef",
  );
  const headingPath = resolvedHeadingPath.headingPath;
  const serializedHeadingPath = JSON.stringify(headingPath);
  const headingPaths = context.headingPaths ?? [];
  const availableBlockIds = context.availableBlockIds ?? [];

  if (resolvedHeadingPath.error) {
    errors.push(resolvedHeadingPath.error);
  }

  if (
    headingPath.length > 0 &&
    !headingPaths.some((entry) => JSON.stringify(entry) === serializedHeadingPath)
  ) {
    errors.push({
      path: "supportingSpans.headingPath",
      message: `candidate headingPath ${serializedHeadingPath} does not exist in source window`,
    });
  }

  if (span.blockId && !availableBlockIds.includes(span.blockId)) {
    errors.push({
      path: "supportingSpans.blockId",
      message: `candidate blockId ${span.blockId} does not exist in source window`,
    });
  }

  if (
    span.lineStart !== undefined &&
    context.lineStart !== undefined &&
    span.lineStart < context.lineStart
  ) {
    errors.push({
      path: "supportingSpans.lineStart",
      message: `candidate lineStart ${span.lineStart} is outside source window`,
    });
  }

  if (
    span.lineEnd !== undefined &&
    context.lineEnd !== undefined &&
    span.lineEnd > context.lineEnd
  ) {
    errors.push({
      path: "supportingSpans.lineEnd",
      message: `candidate lineEnd ${span.lineEnd} is outside source window`,
    });
  }

  return errors;
}

function buildCandidateEvidence(
  span: CandidateSupportingSpan,
  sourceWindow: IngestionSourceWindow,
  context: SourceWindowValidationContext,
): {
  blockId?: string;
  lineStart?: number;
  lineEnd?: number;
  headingPath: string[];
  headingPathRef?: string;
  excerpt: string;
} {
  const resolvedHeadingPath = resolveHeadingPathFromRef(
    span.headingPath,
    span.headingPathRef,
    context,
    "supportingSpans.headingPathRef",
  );
  const excerptFromBlock = span.blockId
    ? sourceWindow.blockDescriptors.find((block) => block.id === span.blockId)?.text
    : undefined;
  const excerptFromLines =
    span.lineStart !== undefined && span.lineEnd !== undefined
      ? sourceWindow.normalizedText
          .split("\n")
          .slice(
            span.lineStart - (sourceWindow.lineStart ?? 1),
            span.lineEnd - (sourceWindow.lineStart ?? 1) + 1,
          )
          .join("\n")
          .trim()
      : undefined;

  return {
    blockId: span.blockId,
    lineStart: span.lineStart,
    lineEnd: span.lineEnd,
    headingPath: resolvedHeadingPath.headingPath,
    headingPathRef: span.headingPathRef,
    excerpt: excerptFromBlock ?? excerptFromLines ?? sourceWindow.normalizedText,
  };
}

function resolveHeadingPathFromRef(
  headingPath: string[],
  headingPathRef: string | undefined,
  context: SourceWindowValidationContext,
  path: string,
): { headingPath: string[]; error?: ValidationFailure } {
  if (headingPath.length > 0 || !headingPathRef) {
    return { headingPath };
  }

  const resolvedHeadingPath = context.headingPathRefs?.[headingPathRef];
  if (!resolvedHeadingPath) {
    return {
      headingPath,
      error: {
        path,
        message: `candidate headingPathRef ${headingPathRef} does not exist in source window`,
      },
    };
  }

  return { headingPath: resolvedHeadingPath };
}

function formatInterpreterError(error: unknown): string {
  if (error instanceof JsonModelOutputError) {
    return `${error.name}: ${error.message}`;
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function isRetryableInterpreterError(error: unknown): boolean {
  if (error instanceof JsonModelOutputError) {
    return true;
  }
  return error instanceof Error && error.name === "AbortError";
}

async function interpretWithContainment(input: {
  interpreter: SemanticInterpreter;
  sourceKind: ModelMemorySourceKind;
  sourceId: string;
  sourceWindow: IngestionSourceWindow;
  prompt: ReturnType<
    | typeof buildSemanticCandidateExtractionPrompt
    | typeof buildSemanticCandidateExtractionRepairPrompt
    | typeof buildSemanticExtractionPrompt
    | typeof buildSemanticExtractionRepairPrompt
  >;
  stage: DocumentIngestionStage;
}): Promise<
  | { ok: true; interpretation: SemanticInterpreterResult }
  | { ok: false; errors: ValidationFailure[]; rawObjects: unknown[] }
> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return {
        ok: true,
        interpretation: await input.interpreter.interpret({
          sourceKind: input.sourceKind,
          sourceId: input.sourceId,
          sourceWindow: input.sourceWindow,
          prompt: input.prompt,
        }),
      };
    } catch (error) {
      lastError = error;
      if (!(attempt === 0 && isRetryableInterpreterError(error))) {
        break;
      }
    }
  }

  return {
    ok: false,
    errors: [
      {
        path: input.stage,
        message: `interpreter error: ${formatInterpreterError(lastError)}`,
      },
    ],
    rawObjects: [],
  };
}

function collectCandidateObjects(
  result: SemanticInterpreterResult,
  sourceWindow: IngestionSourceWindow,
): {
  acceptedCandidates: CandidateWithEvidence[];
  errors: ValidationFailure[];
} {
  if (result.action === "ignore") {
    return {
      acceptedCandidates: [],
      errors: [],
    };
  }

  const context = createValidationContext(sourceWindow);
  const acceptedCandidates: CandidateWithEvidence[] = [];
  const errors: ValidationFailure[] = [];

  for (const [index, rawObject] of result.objects.entries()) {
    const parsedCandidate = CandidateMemoryObjectSchema.safeParse(rawObject);
    if (!parsedCandidate.success) {
      errors.push(
        ...parsedCandidate.error.issues.map((issue) => ({
          path: `candidate.${issue.path.join(".") || "root"}`,
          message: issue.message,
        })),
      );
      continue;
    }

    const candidate = parsedCandidate.data;
    const spanErrors = candidate.supportingSpans.flatMap((span) =>
      validateCandidateSupportingSpan(span, context),
    );
    if (spanErrors.length > 0) {
      errors.push(...spanErrors);
      continue;
    }
    if (!candidate.shouldStore) {
      continue;
    }

    acceptedCandidates.push({
      ...candidate,
      candidateId: `candidate-${index}`,
      supportingEvidence: candidate.supportingSpans.map((span) =>
        buildCandidateEvidence(span, sourceWindow, context),
      ),
    });
  }

  const dedupedCandidates = new Map<string, CandidateWithEvidence>();
  for (const candidate of acceptedCandidates) {
    const dedupeKey = `${candidate.candidateType}|${normalizeCandidateClaim(candidate.claim)}`;
    if (!dedupedCandidates.has(dedupeKey)) {
      dedupedCandidates.set(dedupeKey, candidate);
    }
  }

  return {
    acceptedCandidates: Array.from(dedupedCandidates.values()),
    errors,
  };
}

export async function ingestSourceEnvelope<
  TSource extends { id: string; sourceKind: ModelMemorySourceKind },
  TWindow extends IngestionSourceWindow,
>(input: {
  envelope: IngestionSourceEnvelope<TSource, TWindow>;
  modelId: string;
  candidateModelId?: string;
  interpreter: SemanticInterpreter;
  contractVersion?: string;
  candidateContractVersion?: string;
}): Promise<SharedIngestionResult<TSource, TWindow>> {
  const envelope = input.envelope;
  const windowResults: DocumentWindowIngestionResult[] = [];
  const capturedObjects: CapturedMemoryObject[] = [];
  const contractVersion = input.contractVersion ?? "v2-canonicalization";
  const candidateContractVersion = input.candidateContractVersion ?? "v2-candidate";
  const candidateModelId = input.candidateModelId ?? input.modelId;

  for (const sourceWindow of envelope.windows) {
    const candidatePrompt = buildSemanticCandidateExtractionPrompt({
      sourceKind: envelope.source.sourceKind,
      sourceWindow,
      modelId: candidateModelId,
      contractVersion: candidateContractVersion,
    });
    const candidateAttempt = await interpretWithContainment({
      interpreter: input.interpreter,
      sourceKind: envelope.source.sourceKind,
      sourceId: envelope.source.id,
      sourceWindow,
      prompt: candidatePrompt,
      stage: "pass_1_candidate",
    });
    if (!candidateAttempt.ok) {
      windowResults.push({
        sourceWindowId: sourceWindow.id,
        action: "reject",
        errors: candidateAttempt.errors,
        rawObjects: candidateAttempt.rawObjects,
      });
      continue;
    }
    const candidateInterpretation = candidateAttempt.interpretation;

    let candidateCollection = collectCandidateObjects(candidateInterpretation, sourceWindow);
    if (
      candidateInterpretation.action !== "ignore" &&
      candidateCollection.acceptedCandidates.length === 0 &&
      candidateCollection.errors.length > 0
    ) {
      const repairPrompt = buildSemanticCandidateExtractionRepairPrompt({
        sourceKind: envelope.source.sourceKind,
        sourceWindow,
        modelId: candidateModelId,
        previousObjects: candidateInterpretation.objects,
        validationErrors: candidateCollection.errors,
      });
      const repairedCandidateAttempt = await interpretWithContainment({
        interpreter: input.interpreter,
        sourceKind: envelope.source.sourceKind,
        sourceId: envelope.source.id,
        sourceWindow,
        prompt: repairPrompt,
        stage: "pass_1_repair",
      });
      if (!repairedCandidateAttempt.ok) {
        windowResults.push({
          sourceWindowId: sourceWindow.id,
          action: "reject",
          errors: repairedCandidateAttempt.errors,
          rawObjects: repairedCandidateAttempt.rawObjects,
        });
        continue;
      }
      const repairedCandidateInterpretation = repairedCandidateAttempt.interpretation;

      if (repairedCandidateInterpretation.action === "ignore") {
        windowResults.push({
          sourceWindowId: sourceWindow.id,
          action: "ignore",
        });
        continue;
      }

      candidateCollection = collectCandidateObjects(repairedCandidateInterpretation, sourceWindow);
      if (candidateCollection.errors.length > 0) {
        windowResults.push({
          sourceWindowId: sourceWindow.id,
          action: "reject",
          errors: candidateCollection.errors,
          rawObjects: repairedCandidateInterpretation.objects,
        });
        continue;
      }
    }

    if (
      candidateInterpretation.action === "ignore" ||
      candidateCollection.acceptedCandidates.length === 0
    ) {
      if (candidateCollection.errors.length > 0) {
        windowResults.push({
          sourceWindowId: sourceWindow.id,
          action: "reject",
          errors: candidateCollection.errors,
          rawObjects:
            candidateInterpretation.action === "capture" ? candidateInterpretation.objects : [],
        });
        continue;
      }

      windowResults.push({
        sourceWindowId: sourceWindow.id,
        action: "ignore",
      });
      continue;
    }

    const prompt = buildSemanticExtractionPrompt({
      sourceKind: envelope.source.sourceKind,
      sourceWindow,
      modelId: input.modelId,
      contractVersion,
      candidates: candidateCollection.acceptedCandidates,
    });
    const canonicalAttempt = await interpretWithContainment({
      interpreter: input.interpreter,
      sourceKind: envelope.source.sourceKind,
      sourceId: envelope.source.id,
      sourceWindow,
      prompt,
      stage: "pass_2_canonicalization",
    });
    if (!canonicalAttempt.ok) {
      windowResults.push({
        sourceWindowId: sourceWindow.id,
        action: "reject",
        errors: canonicalAttempt.errors,
        rawObjects: canonicalAttempt.rawObjects,
      });
      continue;
    }
    const interpretation = canonicalAttempt.interpretation;

    if (interpretation.action === "ignore") {
      windowResults.push({
        sourceWindowId: sourceWindow.id,
        action: "ignore",
      });
      continue;
    }

    const initialValidation = collectValidationResults(interpretation, sourceWindow);
    // Keep valid canonical objects when they already exist and only pay for a
    // repair pass when the window would otherwise produce no accepted output.
    if (initialValidation.errors.length === 0 || initialValidation.acceptedObjects.length > 0) {
      const accepted = createCaptureObjects(
        sourceWindow.id,
        envelope.source.sourceKind,
        initialValidation.acceptedObjects,
        prompt.contract.modelId,
        prompt.contract.contractVersion,
      );
      capturedObjects.push(...accepted);
      windowResults.push({
        sourceWindowId: sourceWindow.id,
        action: "capture",
        objects: accepted,
      });
      continue;
    }

    if (canAttemptStructuralRepair(initialValidation.validations)) {
      const repairPrompt = buildSemanticExtractionRepairPrompt({
        sourceKind: envelope.source.sourceKind,
        sourceWindow,
        modelId: input.modelId,
        previousObjects: interpretation.objects,
        validationErrors: initialValidation.errors,
      });
      const repairedAttempt = await interpretWithContainment({
        interpreter: input.interpreter,
        sourceKind: envelope.source.sourceKind,
        sourceId: envelope.source.id,
        sourceWindow,
        prompt: repairPrompt,
        stage: "pass_2_repair",
      });
      if (!repairedAttempt.ok) {
        windowResults.push({
          sourceWindowId: sourceWindow.id,
          action: "reject",
          errors: repairedAttempt.errors,
          rawObjects: repairedAttempt.rawObjects,
        });
        continue;
      }
      const repairedInterpretation = repairedAttempt.interpretation;

      if (repairedInterpretation.action === "ignore") {
        windowResults.push({
          sourceWindowId: sourceWindow.id,
          action: "ignore",
        });
        continue;
      }

      const repairedValidation = collectValidationResults(repairedInterpretation, sourceWindow);
      if (repairedValidation.errors.length === 0) {
        const accepted = createCaptureObjects(
          sourceWindow.id,
          envelope.source.sourceKind,
          repairedValidation.acceptedObjects,
          repairPrompt.contract.modelId,
          repairPrompt.contract.contractVersion,
        );
        capturedObjects.push(...accepted);
        windowResults.push({
          sourceWindowId: sourceWindow.id,
          action: "capture",
          objects: accepted,
        });
        continue;
      }

      windowResults.push({
        sourceWindowId: sourceWindow.id,
        action: "reject",
        errors: repairedValidation.errors,
        rawObjects: repairedInterpretation.objects,
      });
      continue;
    }

    const { errors } = initialValidation;
    if (errors.length > 0) {
      windowResults.push({
        sourceWindowId: sourceWindow.id,
        action: "reject",
        errors,
        rawObjects: interpretation.objects,
      });
      continue;
    }
  }

  return {
    source: envelope.source,
    windows: envelope.windows,
    windowResults,
    capturedObjects,
  };
}

export async function ingestDocument(
  input: DocumentIngestionInput,
): Promise<DocumentIngestionResult> {
  const envelope = adaptDocumentSource(input.document);
  return ingestSourceEnvelope({
    envelope,
    modelId: input.modelId,
    candidateModelId: input.candidateModelId,
    interpreter: input.interpreter,
    contractVersion: input.contractVersion,
    candidateContractVersion: input.candidateContractVersion,
  });
}

function readDocumentIngestEngineOverride(): string | undefined {
  const rawValue = process.env[DOCUMENT_INGEST_ENGINE_ENV];
  if (typeof rawValue !== "string") {
    return undefined;
  }
  const normalized = rawValue.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

export function resolveLiveDocumentIngestEngine(input: {
  sourceKind?: DocumentSourceInput["sourceKind"];
}): DocumentIngestEngine {
  if ((input.sourceKind ?? "document") !== "document") {
    return "v1";
  }

  const override = readDocumentIngestEngineOverride();
  if (!override || override === "mmv2") {
    return "mmv2";
  }
  if (override === "v1" || override === "legacy") {
    return "v1";
  }

  throw new Error(
    `Unsupported ${DOCUMENT_INGEST_ENGINE_ENV} value: ${override}. Expected mmv2 or v1.`,
  );
}

export async function ingestDocumentForLivePath(
  input: DocumentIngestionInput,
): Promise<DocumentIngestionResult> {
  const engine = resolveLiveDocumentIngestEngine({
    sourceKind: input.document.sourceKind,
  });
  if (engine === "v1") {
    return ingestDocument(input);
  }
  return ingestDocumentV2ForLivePath(input);
}
