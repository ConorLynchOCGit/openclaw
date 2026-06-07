import { createHash } from "node:crypto";
import { z } from "zod";
import { createContextSnapshotRef } from "./context-snapshot.ts";

export const SOURCE_PROMPT_ARTIFACT_TYPE = "execution_platform.source_prompt_artifact";
export const SOURCE_PROMPT_WINDOW_ARTIFACT_TYPE = "execution_platform.source_prompt_window";

type SourcePromptResolutionEvidence = {
  status: "not_present" | "resolved" | "unresolved" | "unsupported";
  reasonCodes: string[];
  promptHash: string | null;
  promptLength: number | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

const boundedString = (max: number) => z.string().trim().min(1).max(max);

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function bounded(value: string | null | undefined, max = 1_000): string {
  return (value ?? "").trim().replace(/\s+/gu, " ").slice(0, max);
}

function excerptRef(input: { promptHash: string; start: number; end: number }) {
  return `source-prompt://${input.promptHash.slice(0, 16)}/body/${input.start}-${input.end}`;
}

export const SourcePromptArtifactSchema = z
  .object({
    artifactKind: z.literal("source_prompt_artifact"),
    schemaVersion: z.literal("execution-platform.source-prompt-artifact.v1"),
    promptHash: boundedString(90),
    promptLength: z.number().int().min(0),
    sourcePromptBodyRef: boundedString(320),
    boundedPreview: z.string().max(1_000),
    resolutionStatus: z.enum(["not_present", "resolved", "unresolved", "unsupported"]),
    reasonCodes: z.array(boundedString(160)).max(24),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type SourcePromptArtifact = z.infer<typeof SourcePromptArtifactSchema>;

export const SourcePromptWindowArtifactSchema = z
  .object({
    artifactKind: z.literal("source_prompt_window"),
    schemaVersion: z.literal("execution-platform.source-prompt-window.v1"),
    windowRef: boundedString(420),
    sourcePromptBodyRef: boundedString(320),
    sourcePromptHash: boundedString(90),
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    promptLength: z.number().int().min(0),
    text: z.string().max(8_000),
    textHash: boundedString(90),
    byteCount: z.number().int().min(0),
    boundarySensitive: z.boolean(),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
  })
  .strict();

export type SourcePromptWindowArtifact = z.infer<typeof SourcePromptWindowArtifactSchema>;

export function buildSourcePromptArtifact(input: {
  promptText: string | null;
  resolution: SourcePromptResolutionEvidence;
}): SourcePromptArtifact {
  const promptText = input.promptText ?? "";
  const promptHash =
    input.resolution.promptHash ?? (promptText ? sha256Text(promptText) : "missing");
  const promptLength = input.resolution.promptLength ?? promptText.length;
  return SourcePromptArtifactSchema.parse({
    artifactKind: "source_prompt_artifact",
    schemaVersion: "execution-platform.source-prompt-artifact.v1",
    promptHash,
    promptLength,
    sourcePromptBodyRef: `source-prompt://${promptHash.slice(0, 16)}/body`,
    boundedPreview: bounded(promptText, 1_000),
    resolutionStatus: input.resolution.status,
    reasonCodes: input.resolution.reasonCodes.slice(0, 24),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });
}

export function buildSourcePromptWindowArtifact(input: {
  windowRef: string;
  sourcePromptBodyRef: string;
  sourcePromptHash: string;
  start: number;
  end: number;
  promptLength: number;
  text: string;
  boundarySensitive: boolean;
}): SourcePromptWindowArtifact {
  const start = Math.max(0, Math.min(input.start, input.promptLength));
  const end = Math.max(start, Math.min(input.end, input.promptLength));
  const text = input.text.slice(0, 8_000);
  return SourcePromptWindowArtifactSchema.parse({
    artifactKind: "source_prompt_window",
    schemaVersion: "execution-platform.source-prompt-window.v1",
    windowRef: input.windowRef,
    sourcePromptBodyRef: input.sourcePromptBodyRef,
    sourcePromptHash: input.sourcePromptHash,
    start,
    end,
    promptLength: input.promptLength,
    text,
    textHash: sha256Text(text),
    byteCount: Buffer.byteLength(text, "utf8"),
    boundarySensitive: input.boundarySensitive,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  });
}

export const SourcePromptExcerptRequestSchema = z
  .object({
    requestId: boundedString(160),
    commitmentId: boundedString(160),
    sourcePromptBodyRef: boundedString(320),
    reason: boundedString(700),
    maxChars: z.number().int().min(200).max(4_000),
    downstreamConsumer: boundedString(260),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type SourcePromptExcerptRequest = z.infer<typeof SourcePromptExcerptRequestSchema>;

export const SourcePromptExcerptDecisionSchema = z
  .object({
    artifactKind: z.literal("source_prompt_excerpt_decision"),
    schemaVersion: z.literal("execution-platform.source-prompt-excerpt-decision.v1"),
    requestId: boundedString(160),
    status: z.enum(["provided", "denied"]),
    promptHash: boundedString(90),
    promptLength: z.number().int().min(0),
    sourcePromptBodyRef: boundedString(320),
    excerptRef: boundedString(320).nullable(),
    excerptHash: boundedString(90).nullable(),
    excerptLength: z.number().int().min(0),
    boundedExcerptSummary: z.string().max(700),
    reasonCodes: z.array(boundedString(180)).max(16),
    contextSnapshotRefs: z.array(z.unknown()).max(24).default([]),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type SourcePromptExcerptDecision = z.infer<typeof SourcePromptExcerptDecisionSchema>;

export type SourcePromptExcerptResult = {
  decision: SourcePromptExcerptDecision;
  volatileExcerptText: string | null;
};

export function normalizeSourcePromptExcerptRequests(value: unknown): SourcePromptExcerptRequest[] {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const rawRequests = Array.isArray(record.sourcePromptExcerptRequests)
    ? record.sourcePromptExcerptRequests
    : [];
  return rawRequests
    .map((raw, index) => {
      const request =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {};
      return SourcePromptExcerptRequestSchema.safeParse({
        requestId:
          typeof request.requestId === "string" && request.requestId.trim()
            ? request.requestId
            : `source-prompt-excerpt-${index + 1}`,
        commitmentId:
          typeof request.commitmentId === "string" && request.commitmentId.trim()
            ? request.commitmentId
            : "unknown",
        sourcePromptBodyRef:
          typeof request.sourcePromptBodyRef === "string" && request.sourcePromptBodyRef.trim()
            ? request.sourcePromptBodyRef
            : "missing-source-prompt-body-ref",
        reason:
          typeof request.reason === "string" && request.reason.trim()
            ? request.reason
            : "Need bounded original prompt context for delegated work.",
        maxChars:
          typeof request.maxChars === "number" && Number.isFinite(request.maxChars)
            ? Math.min(4_000, Math.max(200, Math.trunc(request.maxChars)))
            : 1_500,
        downstreamConsumer:
          typeof request.downstreamConsumer === "string" && request.downstreamConsumer.trim()
            ? request.downstreamConsumer
            : "context_scout",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      });
    })
    .filter((result): result is z.ZodSafeParseSuccess<SourcePromptExcerptRequest> => result.success)
    .map((result) => result.data)
    .slice(0, 4);
}

export function fulfillSourcePromptExcerptRequest(input: {
  artifact: SourcePromptArtifact;
  promptText: string | null;
  request: SourcePromptExcerptRequest;
}): SourcePromptExcerptResult {
  if (
    input.artifact.resolutionStatus !== "resolved" ||
    !input.promptText ||
    input.request.sourcePromptBodyRef !== input.artifact.sourcePromptBodyRef
  ) {
    return {
      volatileExcerptText: null,
      decision: SourcePromptExcerptDecisionSchema.parse({
        artifactKind: "source_prompt_excerpt_decision",
        schemaVersion: "execution-platform.source-prompt-excerpt-decision.v1",
        requestId: input.request.requestId,
        status: "denied",
        promptHash: input.artifact.promptHash,
        promptLength: input.artifact.promptLength,
        sourcePromptBodyRef: input.request.sourcePromptBodyRef,
        excerptRef: null,
        excerptHash: null,
        excerptLength: 0,
        boundedExcerptSummary: "",
        reasonCodes: ["source_prompt_excerpt_body_unavailable"],
        contextSnapshotRefs: [
          createContextSnapshotRef({
            sourceRef: input.request.sourcePromptBodyRef,
            sourceKind: "source_prompt_excerpt",
            sourcePromptHash: input.artifact.promptHash,
            commitmentIds: [input.request.commitmentId],
            scopeSummary: "Requested source prompt excerpt was unavailable.",
            stalenessPolicy:
              "Missing source prompt excerpt blocks downstream work that requires original prompt context.",
            freshnessStatus: "missing",
            refreshRequired: true,
            refreshAction: "request_excerpt",
            reasonCodes: ["context_snapshot_source_prompt_body_excerpt_missing"],
          }),
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      }),
    };
  }
  const excerptText = input.promptText
    .slice(0, Math.min(input.promptText.length, input.request.maxChars))
    .trim();
  const excerptHash = sha256Text(excerptText);
  const providedExcerptRef = excerptRef({
    promptHash: input.artifact.promptHash,
    start: 0,
    end: Math.min(input.promptText.length, input.request.maxChars),
  });
  return {
    volatileExcerptText: excerptText,
    decision: SourcePromptExcerptDecisionSchema.parse({
      artifactKind: "source_prompt_excerpt_decision",
      schemaVersion: "execution-platform.source-prompt-excerpt-decision.v1",
      requestId: input.request.requestId,
      status: "provided",
      promptHash: input.artifact.promptHash,
      promptLength: input.artifact.promptLength,
      sourcePromptBodyRef: input.request.sourcePromptBodyRef,
      excerptRef: providedExcerptRef,
      excerptHash,
      excerptLength: excerptText.length,
      boundedExcerptSummary: bounded(excerptText, 700),
      reasonCodes: ["source_prompt_excerpt_provided_bounded"],
      contextSnapshotRefs: [
        createContextSnapshotRef({
          sourceRef: providedExcerptRef,
          sourceKind: "source_prompt_excerpt",
          sourcePromptHash: input.artifact.promptHash,
          commitmentIds: [input.request.commitmentId],
          scopeSummary: bounded(excerptText, 700),
          reasonCodes: ["context_snapshot_source_prompt_excerpt_provided"],
        }),
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    }),
  };
}
