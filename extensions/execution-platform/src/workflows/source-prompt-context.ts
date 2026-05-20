import { createHash } from "node:crypto";
import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  createContextSnapshotRef,
  deriveContextSnapshotRefsFromSourcePromptIndex,
  type ContextSnapshotRef,
} from "./context-snapshot.ts";

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

function excerptRef(input: { promptHash: string; sectionId: string; start: number; end: number }) {
  return `source-prompt://${input.promptHash.slice(0, 16)}/${input.sectionId}/${input.start}-${input.end}`;
}

export const SourcePromptSectionSchema = z
  .object({
    sectionId: boundedString(120),
    sectionRef: boundedString(260),
    startOffset: z.number().int().min(0),
    endOffset: z.number().int().min(0),
    charLength: z.number().int().min(0),
    heading: z.string().max(240).nullable(),
    boundedSummary: z.string().max(500),
    rawPromptStored: z.literal(false),
  })
  .strict();

export type SourcePromptSection = z.infer<typeof SourcePromptSectionSchema>;

export const SourcePromptContextIndexSchema = z
  .object({
    artifactKind: z.literal("source_prompt_context_index"),
    schemaVersion: z.literal("execution-platform.source-prompt-context-index.v1"),
    promptHash: boundedString(90),
    promptLength: z.number().int().min(0),
    resolutionStatus: z.enum(["not_present", "resolved", "unresolved", "unsupported"]),
    reasonCodes: z.array(boundedString(160)).max(24),
    sections: z.array(SourcePromptSectionSchema).max(80),
    contextSnapshotRefs: z.array(z.unknown()).max(120).default([]),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type SourcePromptContextIndex = z.infer<typeof SourcePromptContextIndexSchema>;

export const SourcePromptExcerptRequestSchema = z
  .object({
    requestId: boundedString(160),
    commitmentId: boundedString(160),
    sectionRef: boundedString(260),
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
    sectionRef: boundedString(260),
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

function splitPromptSections(
  promptText: string,
): Array<{ start: number; end: number; heading: string | null }> {
  const headingMatches = [
    ...promptText.matchAll(/(?:^|\n)(#{1,6}\s+[^\n]+|[A-Z][^\n]{3,120}:\s*)/gu),
  ];
  if (headingMatches.length === 0) {
    const sections: Array<{ start: number; end: number; heading: string | null }> = [];
    const chunkSize = 4_000;
    for (let start = 0; start < promptText.length; start += chunkSize) {
      sections.push({ start, end: Math.min(promptText.length, start + chunkSize), heading: null });
    }
    return sections;
  }
  return headingMatches.map((match, index) => {
    const start = match.index ?? 0;
    const next = headingMatches[index + 1]?.index ?? promptText.length;
    return {
      start,
      end: next,
      heading: bounded(match[1] ?? null, 220) || null,
    };
  });
}

export function buildSourcePromptContextIndex(input: {
  promptText: string | null;
  resolution: SourcePromptResolutionEvidence;
  maxSections?: number;
}): SourcePromptContextIndex {
  const promptText = input.promptText ?? "";
  const promptHash =
    input.resolution.promptHash ?? (promptText ? sha256Text(promptText) : "missing");
  const promptLength = input.resolution.promptLength ?? promptText.length;
  const sections =
    input.resolution.status === "resolved" && promptText
      ? splitPromptSections(promptText)
          .slice(0, input.maxSections ?? 60)
          .map((section, index) => {
            const sectionText = promptText.slice(section.start, section.end);
            const sectionId = `section-${String(index + 1).padStart(3, "0")}`;
            const body = {
              sectionId,
              sectionRef: excerptRef({
                promptHash,
                sectionId,
                start: section.start,
                end: section.end,
              }),
              startOffset: section.start,
              endOffset: section.end,
              charLength: section.end - section.start,
              heading: section.heading,
              boundedSummary: bounded(sectionText, 500),
              rawPromptStored: false as const,
            };
            return SourcePromptSectionSchema.parse(body);
          })
      : [];
  const parsed = SourcePromptContextIndexSchema.parse({
    artifactKind: "source_prompt_context_index",
    schemaVersion: "execution-platform.source-prompt-context-index.v1",
    promptHash,
    promptLength,
    resolutionStatus: input.resolution.status,
    reasonCodes: input.resolution.reasonCodes.slice(0, 24),
    sections,
    contextSnapshotRefs: [],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });
  return SourcePromptContextIndexSchema.parse({
    ...parsed,
    contextSnapshotRefs:
      parsed.resolutionStatus === "resolved"
        ? deriveContextSnapshotRefsFromSourcePromptIndex({
            sourceRef: `source-prompt://${promptHash.slice(0, 16)}/index`,
            promptHash,
            promptLength,
            sectionRefs: parsed.sections.map((section) => section.sectionRef),
          })
        : [],
  });
}

export function summarizeSourcePromptContextIndex(index: SourcePromptContextIndex): JsonValue {
  return {
    artifactKind: index.artifactKind,
    promptHash: index.promptHash,
    promptLength: index.promptLength,
    resolutionStatus: index.resolutionStatus,
    reasonCodes: index.reasonCodes,
    sections: index.sections.map((section) => ({
      sectionId: section.sectionId,
      sectionRef: section.sectionRef,
      charLength: section.charLength,
      heading: section.heading,
      boundedSummary: section.boundedSummary,
      rawPromptStored: false,
    })),
    contextSnapshotRefs: (index.contextSnapshotRefs as ContextSnapshotRef[]).map((ref) => ({
      snapshotRef: ref.snapshotRef,
      sourceRef: ref.sourceRef,
      sourceKind: ref.sourceKind,
      freshnessStatus: ref.freshnessStatus,
      sourcePromptHash: ref.sourcePromptHash,
      refreshRequired: ref.refreshRequired,
      refreshAction: ref.refreshAction,
    })),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  } satisfies JsonValue;
}

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
        sectionRef:
          typeof request.sectionRef === "string" && request.sectionRef.trim()
            ? request.sectionRef
            : "missing-section-ref",
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
  index: SourcePromptContextIndex;
  promptText: string | null;
  request: SourcePromptExcerptRequest;
}): SourcePromptExcerptResult {
  const section = input.index.sections.find(
    (candidate) => candidate.sectionRef === input.request.sectionRef,
  );
  if (!section || input.index.resolutionStatus !== "resolved" || !input.promptText) {
    return {
      volatileExcerptText: null,
      decision: SourcePromptExcerptDecisionSchema.parse({
        artifactKind: "source_prompt_excerpt_decision",
        schemaVersion: "execution-platform.source-prompt-excerpt-decision.v1",
        requestId: input.request.requestId,
        status: "denied",
        promptHash: input.index.promptHash,
        promptLength: input.index.promptLength,
        sectionRef: input.request.sectionRef,
        excerptRef: null,
        excerptHash: null,
        excerptLength: 0,
        boundedExcerptSummary: "",
        reasonCodes: ["source_prompt_excerpt_section_unavailable"],
        contextSnapshotRefs: [
          createContextSnapshotRef({
            sourceRef: input.request.sectionRef,
            sourceKind: "source_prompt_excerpt",
            sourcePromptHash: input.index.promptHash,
            commitmentIds: [input.request.commitmentId],
            scopeSummary: "Requested source prompt excerpt was unavailable.",
            stalenessPolicy:
              "Missing source prompt excerpt blocks downstream work that requires original prompt context.",
            freshnessStatus: "missing",
            refreshRequired: true,
            refreshAction: "request_excerpt",
            reasonCodes: ["context_snapshot_source_prompt_excerpt_missing"],
          }),
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      }),
    };
  }
  const excerptText = input.promptText
    .slice(
      section.startOffset,
      Math.min(section.endOffset, section.startOffset + input.request.maxChars),
    )
    .trim();
  const excerptHash = sha256Text(excerptText);
  const providedExcerptRef = excerptRef({
    promptHash: input.index.promptHash,
    sectionId: section.sectionId,
    start: section.startOffset,
    end: Math.min(section.endOffset, section.startOffset + input.request.maxChars),
  });
  return {
    volatileExcerptText: excerptText,
    decision: SourcePromptExcerptDecisionSchema.parse({
      artifactKind: "source_prompt_excerpt_decision",
      schemaVersion: "execution-platform.source-prompt-excerpt-decision.v1",
      requestId: input.request.requestId,
      status: "provided",
      promptHash: input.index.promptHash,
      promptLength: input.index.promptLength,
      sectionRef: input.request.sectionRef,
      excerptRef: providedExcerptRef,
      excerptHash,
      excerptLength: excerptText.length,
      boundedExcerptSummary: bounded(excerptText, 700),
      reasonCodes: ["source_prompt_excerpt_provided_bounded"],
      contextSnapshotRefs: [
        createContextSnapshotRef({
          sourceRef: providedExcerptRef,
          sourceKind: "source_prompt_excerpt",
          sourcePromptHash: input.index.promptHash,
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
