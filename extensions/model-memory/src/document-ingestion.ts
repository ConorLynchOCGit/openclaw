import { z } from "zod";
import {
  buildSemanticCandidateExtractionPrompt,
  buildSemanticCandidateExtractionRepairPrompt,
  buildSemanticExtractionPrompt,
  buildSemanticExtractionRepairPrompt,
} from "./semantic-extraction-prompt.ts";
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
  type DocumentSourceEnvelope,
  type DocumentSourceInput,
} from "./source-adapters/document-source-adapter.ts";

export type CapturedMemoryObject = {
  sourceWindowId: string;
  object: ModelMemoryObject;
  contractName: "semantic_extraction";
  contractVersion: string;
  modelId: string;
};

export type DocumentWindowIngestionResult =
  | {
      sourceWindowId: string;
      action: "ignore";
    }
  | {
      sourceWindowId: string;
      action: "capture";
      objects: CapturedMemoryObject[];
    }
  | {
      sourceWindowId: string;
      action: "reject";
      errors: ValidationFailure[];
      rawObjects: unknown[];
    };

export type DocumentIngestionResult = {
  source: DocumentSourceEnvelope["source"];
  windows: DocumentSourceEnvelope["windows"];
  windowResults: DocumentWindowIngestionResult[];
  capturedObjects: CapturedMemoryObject[];
};

export type DocumentIngestionInput = {
  document: DocumentSourceInput;
  modelId: string;
  candidateModelId?: string;
  interpreter: SemanticInterpreter;
  contractVersion?: string;
  candidateContractVersion?: string;
};

const CandidateTypeSchema = z.enum(["preference", "fact", "rule", "procedure", "reference"]);
const CandidateConfidenceSchema = z.enum(["weak", "medium", "strong"]);

const CandidateSupportingSpanSchema = z
  .object({
    blockId: z.string().trim().min(1).optional(),
    lineStart: z.number().int().min(1).optional(),
    lineEnd: z.number().int().min(1).optional(),
    headingPath: z.array(z.string().trim().min(1)).default([]),
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
    excerpt: string;
  }>;
};

function createValidationContext(
  sourceWindow: DocumentSourceEnvelope["windows"][number],
): SourceWindowValidationContext {
  return {
    availableBlockIds: sourceWindow.blockDescriptors.map((block) => block.id),
    lineStart: sourceWindow.lineStart,
    lineEnd: sourceWindow.lineEnd,
    headingPaths: Array.from(
      new Set(sourceWindow.blockDescriptors.map((block) => JSON.stringify(block.headingPath))),
    ).map((serialized) => JSON.parse(serialized) as string[]),
  };
}

function createCaptureObjects(
  sourceWindowId: string,
  objects: ModelMemoryObject[],
  modelId: string,
  contractVersion: string,
): CapturedMemoryObject[] {
  return objects.map((object) => ({
    sourceWindowId,
    object,
    contractName: "semantic_extraction",
    contractVersion,
    modelId,
  }));
}

function collectValidationResults(
  result: SemanticInterpreterResult,
  sourceWindow: DocumentSourceEnvelope["windows"][number],
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
  const serializedHeadingPath = JSON.stringify(span.headingPath);
  const headingPaths = context.headingPaths ?? [];
  const availableBlockIds = context.availableBlockIds ?? [];

  if (
    span.headingPath.length > 0 &&
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
  sourceWindow: DocumentSourceEnvelope["windows"][number],
): {
  blockId?: string;
  lineStart?: number;
  lineEnd?: number;
  headingPath: string[];
  excerpt: string;
} {
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
    headingPath: span.headingPath,
    excerpt: excerptFromBlock ?? excerptFromLines ?? sourceWindow.normalizedText,
  };
}

function collectCandidateObjects(
  result: SemanticInterpreterResult,
  sourceWindow: DocumentSourceEnvelope["windows"][number],
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
        buildCandidateEvidence(span, sourceWindow),
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

export async function ingestDocument(
  input: DocumentIngestionInput,
): Promise<DocumentIngestionResult> {
  const envelope = adaptDocumentSource(input.document);
  const windowResults: DocumentWindowIngestionResult[] = [];
  const capturedObjects: CapturedMemoryObject[] = [];
  const contractVersion = input.contractVersion ?? "v2-canonicalization";
  const candidateContractVersion = input.candidateContractVersion ?? "v2-candidate";
  const candidateModelId = input.candidateModelId ?? input.modelId;

  for (const sourceWindow of envelope.windows) {
    const candidatePrompt = buildSemanticCandidateExtractionPrompt({
      sourceKind: "document",
      sourceWindow,
      modelId: candidateModelId,
      contractVersion: candidateContractVersion,
    });
    const candidateInterpretation = await input.interpreter.interpret({
      sourceKind: "document",
      sourceId: envelope.source.id,
      sourceWindow,
      prompt: candidatePrompt,
    });

    let candidateCollection = collectCandidateObjects(candidateInterpretation, sourceWindow);
    if (
      candidateInterpretation.action !== "ignore" &&
      candidateCollection.acceptedCandidates.length === 0 &&
      candidateCollection.errors.length > 0
    ) {
      const repairPrompt = buildSemanticCandidateExtractionRepairPrompt({
        sourceKind: "document",
        sourceWindow,
        modelId: candidateModelId,
        previousObjects: candidateInterpretation.objects,
        validationErrors: candidateCollection.errors,
      });
      const repairedCandidateInterpretation = await input.interpreter.interpret({
        sourceKind: "document",
        sourceId: envelope.source.id,
        sourceWindow,
        prompt: repairPrompt,
      });

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
      sourceKind: "document",
      sourceWindow,
      modelId: input.modelId,
      contractVersion,
      candidates: candidateCollection.acceptedCandidates,
    });
    const interpretation = await input.interpreter.interpret({
      sourceKind: "document",
      sourceId: envelope.source.id,
      sourceWindow,
      prompt,
    });

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
        sourceKind: "document",
        sourceWindow,
        modelId: input.modelId,
        previousObjects: interpretation.objects,
        validationErrors: initialValidation.errors,
      });
      const repairedInterpretation = await input.interpreter.interpret({
        sourceKind: "document",
        sourceId: envelope.source.id,
        sourceWindow,
        prompt: repairPrompt,
      });

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
