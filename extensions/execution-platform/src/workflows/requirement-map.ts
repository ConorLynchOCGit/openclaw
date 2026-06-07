import { createHash } from "node:crypto";
import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";

export const REQUIREMENT_MAP_ARTIFACT_TYPE = "execution_platform.requirement_map";
export const REQUIREMENT_MAP_SCHEMA_VERSION = "execution-platform.requirement-map.v2";

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const boundedStringArray = (maxItems: number, maxChars = 400) =>
  z.array(z.string().trim().min(1).max(maxChars)).max(maxItems).default([]);

export const RequirementRoleSchema = z.enum([
  "runnable_work",
  "validation",
  "review",
  "closeout",
  "constraint",
  "non_goal",
  "context",
]);

export type RequirementRole = z.infer<typeof RequirementRoleSchema>;

export const RequirementCoverageSchema = z
  .object({
    status: z.literal("complete"),
    promptLength: z.number().int().min(0),
    windowCount: z.number().int().min(1),
    coveredWindowCount: z.number().int().min(0),
    candidateCount: z.number().int().min(0),
    requirementCount: z.number().int().min(1),
    retiredCandidateCount: z.number().int().min(0),
    coverageHash: boundedString(90),
  })
  .strict();

export type RequirementCoverage = z.infer<typeof RequirementCoverageSchema>;

export const RequirementSchema = z
  .object({
    requirementId: boundedString(120),
    text: boundedString(2_000),
    role: RequirementRoleSchema,
    sourceRefs: boundedStringArray(20, 420),
  })
  .strict();

export type Requirement = z.infer<typeof RequirementSchema>;

export const RequirementMapSchema = z
  .object({
    artifactKind: z.literal("requirement_map"),
    schemaVersion: z.literal(REQUIREMENT_MAP_SCHEMA_VERSION),
    mapId: boundedString(180),
    mapRef: boundedString(420),
    mapHash: boundedString(90),
    sourcePromptBodyRef: boundedString(360),
    sourcePromptHash: boundedString(90),
    sourcePromptLength: z.number().int().min(0),
    requirements: z.array(RequirementSchema).min(1).max(160),
    coverage: RequirementCoverageSchema,
    reasonCodes: boundedStringArray(120, 240),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
  })
  .strict();

export type RequirementMap = z.infer<typeof RequirementMapSchema>;

export const REQUIREMENT_NATIVE_TOOL_IDS = [
  "requirement.record_candidate",
  "requirement.record_no_requirement",
  "source_prompt.expand_window",
  "source_prompt.open_adjacent",
  "requirement.merge",
  "requirement.split",
  "requirement.retire",
  "requirement.promote",
  "requirement.set_role",
  "requirement.attach_source_ref",
] as const;

export type RequirementNativeToolId = (typeof REQUIREMENT_NATIVE_TOOL_IDS)[number];

export type RequirementNativeToolDefinition = {
  name: string;
  canonicalToolId: RequirementNativeToolId;
  description: string;
  inputSchema: JsonValue;
};

export type RequirementToolCall = {
  tool: RequirementNativeToolId;
  input: Record<string, unknown>;
};

export type RequirementPromptWindow = {
  windowRef: string;
  sourcePromptBodyRef: string;
  promptHash: string;
  start: number;
  end: number;
  text: string;
  boundarySensitive: boolean;
};

export type RequirementCandidate = {
  candidateId: string;
  text: string;
  sourceRefs: string[];
  sourceWindowRefs: string[];
  retired: boolean;
  noRequirement: false;
};

export type RequirementCandidateCluster = {
  clusterId: string;
  sourceWindowRefs: string[];
  candidateIds: string[];
  sourceRefs: string[];
  candidateCount: number;
};

export type RequirementNoRequirementReceipt = {
  receiptId: string;
  sourceWindowRef: string;
  reason: string;
  noRequirement: true;
};

export type RequirementPromotion = {
  promotionId: string;
  sourceCandidateIds: string[];
  text: string;
  role: RequirementRole | null;
  sourceRefs: string[];
};

export type RequirementCoverageDraft = {
  windows: RequirementPromptWindow[];
  candidates: RequirementCandidate[];
  noRequirementReceipts: RequirementNoRequirementReceipt[];
  promotions: RequirementPromotion[];
  retiredCandidateIds: string[];
  appliedToolNames: string[];
  rejectedToolCalls: Array<{ tool: string; reason: string }>;
  reasonCodes: string[];
};

export type RequirementToolCompileResult = {
  status: "accepted" | "blocked";
  requirementMap: RequirementMap | null;
  draft: RequirementCoverageDraft;
  drafts: RequirementPromotion[];
  appliedToolNames: string[];
  rejectedToolCalls: Array<{ tool: string; reason: string }>;
  missingFieldsByPromotionId: Record<string, string[]>;
  blockedPromotionIds: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type RequirementMapSummary = {
  mapRef: string;
  sourcePromptBodyRef: string;
  sourcePromptHash: string;
  sourcePromptLength: number;
  coverage: RequirementCoverage;
  requirementCount: number;
  runnableRequirementCount: number;
  validationRequirementCount: number;
  reviewRequirementCount: number;
  closeoutRequirementCount: number;
  constraintCount: number;
  contextRequirementCount: number;
  requirements: Array<{
    requirementId: string;
    text: string;
    role: RequirementRole;
    sourceRefs: string[];
    sourceRefCount: number;
    evidenceKinds: string[];
  }>;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type RequirementMapManifestSummary = {
  mapRef: string;
  sourcePromptBodyRef: string;
  sourcePromptHash: string;
  sourcePromptLength: number;
  coverage: RequirementCoverage;
  requirementCount: number;
  runnableRequirementCount: number;
  validationRequirementCount: number;
  reviewRequirementCount: number;
  closeoutRequirementCount: number;
  constraintCount: number;
  contextRequirementCount: number;
  requirementIds: string[];
  sourceRefCount: number;
  rawPromptStored: false;
  rawResponseStored: false;
};

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown, maxItems = 24): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            .map((item) => item.trim()),
        ),
      ].slice(0, maxItems)
    : [];
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) {
      return value;
    }
  }
  return "";
}

function firstStringArray(
  record: Record<string, unknown>,
  keys: readonly string[],
  maxItems = 24,
): string[] {
  for (const key of keys) {
    const values = stringArray(record[key], maxItems);
    if (values.length > 0) {
      return values;
    }
  }
  return [];
}

function uniqueStrings(values: Array<string | null | undefined>, maxItems = 80): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
    .map((value) => value.trim())
    .slice(0, maxItems);
}

export function normalizeRequirementRole(value: unknown): RequirementRole | null {
  const raw = stringValue(value).toLowerCase().replace(/\s+/gu, "_");
  if (!raw) {
    return null;
  }
  if (RequirementRoleSchema.safeParse(raw).success) {
    return raw as RequirementRole;
  }
  if (["implementation", "source_edit", "edit", "executable", "worker", "coding"].includes(raw)) {
    return "runnable_work";
  }
  if (
    ["test", "tests", "test_authoring", "qa", "quality", "proof", "evidence_requirement"].includes(
      raw,
    )
  ) {
    return "validation";
  }
  if (["reviewer", "review_node"].includes(raw)) {
    return "review";
  }
  if (["summary", "finalize", "finalization"].includes(raw)) {
    return "closeout";
  }
  if (["non-goal", "not_goal"].includes(raw)) {
    return "non_goal";
  }
  if (["grounding", "read_only", "read_only_grounding", "source_grounding"].includes(raw)) {
    return "context";
  }
  return null;
}

export function roleDefaultEvidenceKinds(role: RequirementRole): string[] {
  switch (role) {
    case "runnable_work":
      return ["source_change", "validation_result", "worker_evidence"];
    case "validation":
      return ["validation_result"];
    case "review":
      return ["review_evidence"];
    case "closeout":
      return ["closeout_summary"];
    case "constraint":
      return ["constraint_compliance"];
    case "non_goal":
      return ["non_goal_respected"];
    case "context":
      return ["grounding_evidence"];
  }
  return [];
}

export function requirementProviderToolName(toolId: RequirementNativeToolId): string {
  return toolId.replace(/[^a-zA-Z0-9_-]/gu, "_").slice(0, 64);
}

export function requirementCanonicalToolIdFromProviderName(
  providerToolName: string,
): RequirementNativeToolId | null {
  for (const toolId of REQUIREMENT_NATIVE_TOOL_IDS) {
    if (requirementProviderToolName(toolId) === providerToolName) {
      return toolId;
    }
  }
  return null;
}

function stringSchema(description?: string): JsonValue {
  return {
    type: "string",
    ...(description ? { description } : {}),
  };
}

function stringArraySchema(description?: string): JsonValue {
  return { type: "array", items: stringSchema(description) };
}

function toolProperties(toolId: RequirementNativeToolId): Record<string, JsonValue> {
  const common: Record<string, JsonValue> = {
    text: stringSchema("A compact operator requirement or candidate, not a full prompt section."),
    evidenceExcerpt: stringSchema("A copied prompt excerpt visible in this bounded window."),
    reason: stringSchema("Short rationale for this small-verb call."),
    direction: stringSchema("Use previous or next when requesting adjacent prompt context."),
    candidateId: stringSchema("Runtime candidate id from prior RequirementMap extraction."),
    candidateIds: stringArraySchema("Runtime candidate ids from prior RequirementMap extraction."),
    sourceCandidateIds: stringArraySchema("Runtime candidate ids to merge or promote."),
    targetCandidateId: stringSchema("Runtime candidate id that should receive merged content."),
    role: stringSchema(`One of: ${RequirementRoleSchema.options.join(", ")}.`),
    promotionId: stringSchema("Runtime promotion id from RequirementMap compile diagnostics."),
    sourceRef: stringSchema("A source-prompt range ref already known to runtime."),
  };
  if (toolId === "requirement.split") {
    common.requirements = {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          text: stringSchema("One compact split requirement."),
          role: stringSchema(`One of: ${RequirementRoleSchema.options.join(", ")}.`),
        },
      },
    };
  }
  return common;
}

function softToolGuidance(toolId: RequirementNativeToolId): string {
  const guidance: Record<RequirementNativeToolId, string> = {
    "requirement.record_candidate":
      "Prefer fields text and evidenceExcerpt. Keep text compact and copy evidenceExcerpt from the visible window.",
    "requirement.record_no_requirement":
      "Prefer field reason with a short explanation of why the visible window has no operator requirement.",
    "source_prompt.expand_window":
      "Prefer field reason when the visible window is cut off or lacks enough neighboring text.",
    "source_prompt.open_adjacent":
      "Prefer fields direction and reason. Direction should be previous or next.",
    "requirement.merge": "Prefer fields targetCandidateId and sourceCandidateIds.",
    "requirement.split":
      "Prefer fields candidateId and requirements; each split requirement should include text and role.",
    "requirement.retire": "Prefer fields candidateId and reason.",
    "requirement.promote":
      "Prefer fields candidateIds, text, and role. Runtime validates source refs and final artifact shape after the tool call.",
    "requirement.set_role": "Prefer fields promotionId and role.",
    "requirement.attach_source_ref": "Prefer fields promotionId and sourceRef.",
  };
  return guidance[toolId];
}

export function requirementNativeToolDefinitions(
  allowedToolIds: readonly RequirementNativeToolId[],
): RequirementNativeToolDefinition[] {
  return allowedToolIds.map((toolId) => ({
    name: requirementProviderToolName(toolId),
    canonicalToolId: toolId,
    description: `Call ${toolId} as a provider-native RequirementMap small verb. ${softToolGuidance(toolId)} Runtime owns hard validation, ids, refs, hashes, storage, coverage, and submit.`,
    inputSchema: {
      type: "object",
      additionalProperties: true,
      properties: toolProperties(toolId),
    },
  }));
}

export function requirementToolCallFromNativeToolCall(input: {
  providerToolName: string;
  toolArguments: unknown;
}): RequirementToolCall | null {
  const tool = requirementCanonicalToolIdFromProviderName(input.providerToolName);
  if (!tool) {
    return null;
  }
  return { tool, input: asRecord(input.toolArguments) };
}

function sourcePromptRangeRef(input: { promptHash: string; start: number; end: number }): string {
  return `source-prompt://${input.promptHash.slice(0, 16)}/body/${input.start}-${input.end}`;
}

function boundarySensitive(
  text: string,
  start: number,
  end: number,
  promptLength: number,
): boolean {
  const startsMidToken = start > 0 && Boolean(text[0]) && !/[\s#>*\-`]/u.test(text[0]);
  const endsMidToken =
    end < promptLength &&
    Boolean(text[text.length - 1]) &&
    !/[\s.!?;:)\]}`]/u.test(text[text.length - 1]!);
  const codeFenceCount = (text.match(/```/gu) ?? []).length;
  return startsMidToken || endsMidToken || codeFenceCount % 2 === 1;
}

function preferBoundary(text: string, desiredEnd: number, minimumEnd: number): number {
  const probes = ["\n\n", "\n#", "\n-", "\n*", "\n1.", "\n```"];
  for (const probe of probes) {
    const index = text.lastIndexOf(probe, desiredEnd);
    if (index >= minimumEnd) {
      return index + (probe === "\n\n" ? 2 : 1);
    }
  }
  return desiredEnd;
}

export function buildRequirementPromptWindows(input: {
  promptText: string;
  promptHash: string;
  sourcePromptBodyRef: string;
  windowChars?: number;
  overlapChars?: number;
}): RequirementPromptWindow[] {
  const promptText = input.promptText;
  const windowChars = Math.max(2_000, input.windowChars ?? 3_000);
  const overlapChars = Math.max(200, Math.min(windowChars - 1, input.overlapChars ?? 700));
  if (promptText.length <= windowChars) {
    return [
      {
        windowRef: sourcePromptRangeRef({
          promptHash: input.promptHash,
          start: 0,
          end: promptText.length,
        }),
        sourcePromptBodyRef: input.sourcePromptBodyRef,
        promptHash: input.promptHash,
        start: 0,
        end: promptText.length,
        text: promptText,
        boundarySensitive: false,
      },
    ];
  }
  const windows: RequirementPromptWindow[] = [];
  let start = 0;
  while (start < promptText.length) {
    const desiredEnd = Math.min(promptText.length, start + windowChars);
    const minimumEnd = Math.min(promptText.length, start + Math.floor(windowChars * 0.65));
    const end =
      desiredEnd >= promptText.length
        ? promptText.length
        : preferBoundary(promptText, desiredEnd, minimumEnd);
    const text = promptText.slice(start, end);
    windows.push({
      windowRef: sourcePromptRangeRef({ promptHash: input.promptHash, start, end }),
      sourcePromptBodyRef: input.sourcePromptBodyRef,
      promptHash: input.promptHash,
      start,
      end,
      text,
      boundarySensitive: boundarySensitive(text, start, end, promptText.length),
    });
    if (end >= promptText.length) {
      break;
    }
    start = Math.max(0, end - overlapChars);
  }
  return windows;
}

function normalizeWithMap(value: string): { normalized: string; indexMap: number[] } {
  let normalized = "";
  const indexMap: number[] = [];
  let previousWhitespace = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (/\s/u.test(char)) {
      if (!previousWhitespace) {
        normalized += " ";
        indexMap.push(index);
        previousWhitespace = true;
      }
      continue;
    }
    normalized += char.toLowerCase();
    indexMap.push(index);
    previousWhitespace = false;
  }
  return { normalized: normalized.trim(), indexMap };
}

export function anchorEvidenceExcerpt(input: {
  window: RequirementPromptWindow;
  evidenceExcerpt: string;
}): { sourceRef: string; start: number; end: number } | null {
  const excerpt = input.evidenceExcerpt.trim();
  if (!excerpt) {
    return null;
  }
  const exactIndex = input.window.text.indexOf(excerpt);
  if (exactIndex >= 0) {
    const start = input.window.start + exactIndex;
    const end = start + excerpt.length;
    return {
      sourceRef: sourcePromptRangeRef({ promptHash: input.window.promptHash, start, end }),
      start,
      end,
    };
  }
  const windowNormalized = normalizeWithMap(input.window.text);
  const excerptNormalized = normalizeWithMap(excerpt).normalized;
  if (!excerptNormalized) {
    return null;
  }
  const normalizedIndex = windowNormalized.normalized.indexOf(excerptNormalized);
  if (normalizedIndex >= 0) {
    const localStart = windowNormalized.indexMap[normalizedIndex] ?? 0;
    const localEnd =
      (windowNormalized.indexMap[normalizedIndex + excerptNormalized.length - 1] ?? localStart) + 1;
    const start = input.window.start + localStart;
    const end = input.window.start + localEnd;
    return {
      sourceRef: sourcePromptRangeRef({ promptHash: input.window.promptHash, start, end }),
      start,
      end,
    };
  }
  return null;
}

export function createRequirementCoverageDraft(
  windows: RequirementPromptWindow[],
): RequirementCoverageDraft {
  return {
    windows,
    candidates: [],
    noRequirementReceipts: [],
    promotions: [],
    retiredCandidateIds: [],
    appliedToolNames: [],
    rejectedToolCalls: [],
    reasonCodes: ["requirement_map_coverage_started"],
  };
}

function candidateById(
  draft: RequirementCoverageDraft,
  candidateId: string,
): RequirementCandidate | null {
  return draft.candidates.find((candidate) => candidate.candidateId === candidateId) ?? null;
}

function promotionById(
  draft: RequirementCoverageDraft,
  promotionId: string,
): RequirementPromotion | null {
  return draft.promotions.find((promotion) => promotion.promotionId === promotionId) ?? null;
}

function runtimeProcessArtifactText(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    /\bproduce\s+(a\s+)?requirementmap\b/u.test(normalized) ||
    /\bcreate\s+(a\s+)?requirementmap\b/u.test(normalized) ||
    /\bsourcepromptartifact\b/u.test(normalized) ||
    /\bcoverage ledger\b/u.test(normalized) ||
    /\bscheduler graph\b/u.test(normalized)
  );
}

export function applyRequirementExtractionToolCalls(input: {
  draft: RequirementCoverageDraft;
  window: RequirementPromptWindow;
  calls: RequirementToolCall[];
}): RequirementCoverageDraft {
  const draft = input.draft;
  for (const call of input.calls) {
    draft.appliedToolNames.push(call.tool);
    const record = call.input;
    if (call.tool === "requirement.record_candidate") {
      const text = firstString(record, ["text", "candidateText", "requirementText"]);
      const evidenceExcerpt = firstString(record, ["evidenceExcerpt", "quote", "sourceExcerpt"]);
      if (!text || !evidenceExcerpt) {
        draft.rejectedToolCalls.push({
          tool: call.tool,
          reason: "candidate_text_or_evidence_missing",
        });
        continue;
      }
      const anchored = anchorEvidenceExcerpt({ window: input.window, evidenceExcerpt });
      if (!anchored) {
        draft.rejectedToolCalls.push({
          tool: call.tool,
          reason: "candidate_evidence_anchor_failed",
        });
        continue;
      }
      const candidateId = `cand-${String(draft.candidates.length + 1).padStart(4, "0")}`;
      draft.candidates.push({
        candidateId,
        text,
        sourceRefs: [anchored.sourceRef],
        sourceWindowRefs: [input.window.windowRef],
        retired: false,
        noRequirement: false,
      });
      continue;
    }
    if (call.tool === "requirement.record_no_requirement") {
      const reason =
        firstString(record, ["reason", "rationale"]) ||
        "Model found no operator obligation in this window.";
      if (
        !draft.noRequirementReceipts.some(
          (receipt) => receipt.sourceWindowRef === input.window.windowRef,
        )
      ) {
        draft.noRequirementReceipts.push({
          receiptId: `no-req-${String(draft.noRequirementReceipts.length + 1).padStart(4, "0")}`,
          sourceWindowRef: input.window.windowRef,
          reason,
          noRequirement: true,
        });
      }
      continue;
    }
    if (
      call.tool === "source_prompt.expand_window" ||
      call.tool === "source_prompt.open_adjacent"
    ) {
      draft.reasonCodes.push(`requirement_window_navigation_requested:${call.tool}`);
      continue;
    }
    draft.rejectedToolCalls.push({
      tool: call.tool,
      reason: "tool_not_allowed_in_extraction_phase",
    });
  }
  return draft;
}

export function applyRequirementConsolidationToolCalls(input: {
  draft: RequirementCoverageDraft;
  calls: RequirementToolCall[];
}): RequirementCoverageDraft {
  const draft = input.draft;
  for (const call of input.calls) {
    draft.appliedToolNames.push(call.tool);
    const record = call.input;
    if (call.tool === "requirement.retire") {
      const candidateId = firstString(record, ["candidateId", "id"]);
      const candidate = candidateById(draft, candidateId);
      if (!candidate) {
        draft.rejectedToolCalls.push({ tool: call.tool, reason: "retire_candidate_unknown" });
        continue;
      }
      candidate.retired = true;
      draft.retiredCandidateIds = uniqueStrings([
        ...draft.retiredCandidateIds,
        candidate.candidateId,
      ]);
      continue;
    }
    if (call.tool === "requirement.merge") {
      const targetId = firstString(record, ["targetCandidateId", "targetId"]);
      const sourceIds = firstStringArray(record, ["sourceCandidateIds", "candidateIds"], 24);
      const target = candidateById(draft, targetId);
      if (!target || sourceIds.length === 0) {
        draft.rejectedToolCalls.push({ tool: call.tool, reason: "merge_candidate_unknown" });
        continue;
      }
      for (const sourceId of sourceIds) {
        const source = candidateById(draft, sourceId);
        if (!source || source.candidateId === target.candidateId) {
          continue;
        }
        target.text = `${target.text}\n${source.text}`.slice(0, 2_000);
        target.sourceRefs = uniqueStrings([...target.sourceRefs, ...source.sourceRefs], 20);
        target.sourceWindowRefs = uniqueStrings(
          [...target.sourceWindowRefs, ...source.sourceWindowRefs],
          20,
        );
        source.retired = true;
        draft.retiredCandidateIds = uniqueStrings([
          ...draft.retiredCandidateIds,
          source.candidateId,
        ]);
      }
      continue;
    }
    if (call.tool === "requirement.split") {
      const candidateId = firstString(record, ["candidateId", "id"]);
      const source = candidateById(draft, candidateId);
      const rows = Array.isArray(record.requirements) ? record.requirements : [];
      if (!source || rows.length === 0) {
        draft.rejectedToolCalls.push({
          tool: call.tool,
          reason: "split_candidate_unknown_or_empty",
        });
        continue;
      }
      source.retired = true;
      draft.retiredCandidateIds = uniqueStrings([...draft.retiredCandidateIds, source.candidateId]);
      for (const row of rows) {
        const rowRecord = asRecord(row);
        const text = firstString(rowRecord, ["text", "requirementText"]);
        const role = normalizeRequirementRole(rowRecord.role ?? rowRecord.kind);
        if (!text || !role) {
          draft.rejectedToolCalls.push({
            tool: call.tool,
            reason: "split_requirement_missing_text_or_role",
          });
          continue;
        }
        draft.promotions.push({
          promotionId: `promo-${String(draft.promotions.length + 1).padStart(4, "0")}`,
          sourceCandidateIds: [source.candidateId],
          text,
          role,
          sourceRefs: source.sourceRefs,
        });
      }
      continue;
    }
    if (call.tool === "requirement.promote") {
      const candidateIds = firstStringArray(call.input, ["candidateIds", "sourceCandidateIds"], 24);
      const candidates = candidateIds
        .map((id) => candidateById(draft, id))
        .filter((item): item is RequirementCandidate => Boolean(item));
      const text = firstString(record, ["text", "requirementText"]);
      const role = normalizeRequirementRole(record.role ?? record.kind);
      if (candidates.length === 0 || !text || !role) {
        draft.rejectedToolCalls.push({
          tool: call.tool,
          reason: "promotion_missing_candidate_text_or_role",
        });
        continue;
      }
      draft.promotions.push({
        promotionId: `promo-${String(draft.promotions.length + 1).padStart(4, "0")}`,
        sourceCandidateIds: candidates.map((candidate) => candidate.candidateId),
        text,
        role,
        sourceRefs: uniqueStrings(
          candidates.flatMap((candidate) => candidate.sourceRefs),
          20,
        ),
      });
      continue;
    }
    draft.rejectedToolCalls.push({
      tool: call.tool,
      reason: "tool_not_allowed_in_consolidation_phase",
    });
  }
  return draft;
}

export function applyRequirementRepairToolCalls(input: {
  draft: RequirementCoverageDraft;
  calls: RequirementToolCall[];
}): RequirementCoverageDraft {
  const draft = input.draft;
  for (const call of input.calls) {
    draft.appliedToolNames.push(call.tool);
    const record = call.input;
    const promotionId = firstString(record, ["promotionId", "requirementId", "id"]);
    const promotion = promotionById(draft, promotionId);
    if (!promotion) {
      draft.rejectedToolCalls.push({ tool: call.tool, reason: "repair_promotion_unknown" });
      continue;
    }
    if (call.tool === "requirement.set_role") {
      const role = normalizeRequirementRole(record.role ?? record.kind);
      if (role) {
        promotion.role = role;
      } else {
        draft.rejectedToolCalls.push({ tool: call.tool, reason: "repair_role_invalid" });
      }
      continue;
    }
    if (call.tool === "requirement.attach_source_ref") {
      const sourceRef = firstString(record, ["sourceRef", "sourceRefs"]);
      const knownRefs = new Set(draft.candidates.flatMap((candidate) => candidate.sourceRefs));
      if (sourceRef && knownRefs.has(sourceRef)) {
        promotion.sourceRefs = uniqueStrings([...promotion.sourceRefs, sourceRef], 20);
      } else {
        draft.rejectedToolCalls.push({
          tool: call.tool,
          reason: "repair_source_ref_not_runtime_created",
        });
      }
      continue;
    }
    draft.rejectedToolCalls.push({ tool: call.tool, reason: "tool_not_allowed_in_repair_phase" });
  }
  return draft;
}

function coveredWindowRefs(draft: RequirementCoverageDraft): Set<string> {
  return new Set([
    ...draft.noRequirementReceipts.map((receipt) => receipt.sourceWindowRef),
    ...draft.candidates.flatMap((candidate) => candidate.sourceWindowRefs),
    ...draft.windows
      .filter((window) => window.text.trim().length === 0)
      .map((window) => window.windowRef),
  ]);
}

function coverageHashFor(input: {
  windows: RequirementPromptWindow[];
  candidates: RequirementCandidate[];
  noRequirementReceipts: RequirementNoRequirementReceipt[];
  promotions: RequirementPromotion[];
}): string {
  return `sha256:${sha256Text(
    stableJson({
      windows: input.windows.map((window) => [window.windowRef, window.start, window.end]),
      candidates: input.candidates.map((candidate) => [
        candidate.candidateId,
        candidate.text,
        candidate.sourceRefs,
        candidate.retired,
      ]),
      noRequirementReceipts: input.noRequirementReceipts.map((receipt) => [
        receipt.sourceWindowRef,
        receipt.reason,
      ]),
      promotions: input.promotions.map((promotion) => [
        promotion.text,
        promotion.role,
        promotion.sourceRefs,
      ]),
    }),
  )}`;
}

export function compileRequirementMapFromCoverage(input: {
  mapId: string;
  mapRefPrefix: string;
  sourcePromptBodyRef: string;
  sourcePromptHash: string;
  sourcePromptLength: number;
  draft: RequirementCoverageDraft;
}): RequirementToolCompileResult {
  const covered = coveredWindowRefs(input.draft);
  const missingFieldsByPromotionId: Record<string, string[]> = {};
  const blockedPromotionIds: string[] = [];
  const uncoveredWindowRefs = input.draft.windows
    .filter((window) => !covered.has(window.windowRef))
    .map((window) => window.windowRef);
  for (const promotion of input.draft.promotions) {
    const missing: string[] = [];
    if (!promotion.text) {
      missing.push("text");
    } else if (promotion.text.trim().length > 2_000) {
      missing.push("text_too_long");
    }
    if (!promotion.role) {
      missing.push("role");
    }
    if (promotion.sourceRefs.length === 0) {
      missing.push("sourceRefs");
    }
    if (promotion.sourceRefs.some((sourceRef) => sourceRef.trim().length > 420)) {
      missing.push("sourceRef_too_long");
    }
    if (promotion.role === "runnable_work" && runtimeProcessArtifactText(promotion.text)) {
      missing.push("not_runtime_process_artifact");
    }
    if (missing.length > 0) {
      missingFieldsByPromotionId[promotion.promotionId] = missing;
    }
  }
  const reasonCodes = uniqueStrings(
    [
      "requirement_map_compile_attempted",
      ...input.draft.appliedToolNames.map((tool) => `requirement_tool_applied:${tool}`),
      ...input.draft.rejectedToolCalls.map(
        (rejected) => `requirement_tool_rejected:${rejected.tool}:${rejected.reason}`,
      ),
      ...(uncoveredWindowRefs.length > 0 ? ["requirement_map_uncovered_prompt_windows"] : []),
      ...(input.draft.promotions.length === 0 ? ["requirement_map_no_promoted_requirements"] : []),
      ...(Object.values(missingFieldsByPromotionId).some((fields) =>
        fields.includes("not_runtime_process_artifact"),
      )
        ? ["requirement_rejected_runtime_process_artifact"]
        : []),
      ...(Object.values(missingFieldsByPromotionId).some((fields) =>
        fields.some((field) => field.endsWith("_too_long")),
      )
        ? ["requirement_map_field_too_long"]
        : []),
      ...uncoveredWindowRefs.map((windowRef) => `requirement_window_uncovered:${windowRef}`),
      ...Object.entries(missingFieldsByPromotionId).flatMap(([promotionId, fields]) =>
        fields.map((field) => `requirement_missing:${promotionId}:${field}`),
      ),
    ],
    120,
  );
  const coverageHash = coverageHashFor(input.draft);
  const coverage = {
    status: "complete" as const,
    promptLength: input.sourcePromptLength,
    windowCount: input.draft.windows.length,
    coveredWindowCount: covered.size,
    candidateCount: input.draft.candidates.length,
    requirementCount: input.draft.promotions.length,
    retiredCandidateCount: input.draft.retiredCandidateIds.length,
    coverageHash,
  };
  const accepted =
    uncoveredWindowRefs.length === 0 &&
    input.draft.promotions.length > 0 &&
    Object.keys(missingFieldsByPromotionId).length === 0;
  if (!accepted) {
    return {
      status: "blocked",
      requirementMap: null,
      draft: input.draft,
      drafts: input.draft.promotions,
      appliedToolNames: input.draft.appliedToolNames,
      rejectedToolCalls: input.draft.rejectedToolCalls,
      missingFieldsByPromotionId,
      blockedPromotionIds,
      reasonCodes: [...reasonCodes, "requirement_map_blocked"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }
  const requirements = input.draft.promotions.map((promotion, index) => {
    const role = promotion.role!;
    return {
      requirementId: `req-${String(index + 1).padStart(3, "0")}`,
      text: promotion.text,
      role,
      sourceRefs: promotion.sourceRefs,
    };
  });
  const parsedRequirements: Requirement[] = [];
  const schemaMissingFieldsByPromotionId: Record<string, string[]> = {};
  for (let index = 0; index < requirements.length; index += 1) {
    const parsed = RequirementSchema.safeParse(requirements[index]);
    if (parsed.success) {
      parsedRequirements.push(parsed.data);
      continue;
    }
    const promotionId =
      input.draft.promotions[index]?.promotionId ?? `promo-${String(index + 1).padStart(4, "0")}`;
    schemaMissingFieldsByPromotionId[promotionId] = parsed.error.issues
      .map((issue) => {
        const path = issue.path.join(".") || "requirement";
        return issue.code === "too_big" ? `${path}_too_long` : `${path}_${issue.code}`;
      })
      .slice(0, 12);
  }
  if (Object.keys(schemaMissingFieldsByPromotionId).length > 0) {
    return {
      status: "blocked",
      requirementMap: null,
      draft: input.draft,
      drafts: input.draft.promotions,
      appliedToolNames: input.draft.appliedToolNames,
      rejectedToolCalls: input.draft.rejectedToolCalls,
      missingFieldsByPromotionId: {
        ...missingFieldsByPromotionId,
        ...schemaMissingFieldsByPromotionId,
      },
      blockedPromotionIds: uniqueStrings(Object.keys(schemaMissingFieldsByPromotionId), 32),
      reasonCodes: uniqueStrings(
        [
          ...reasonCodes,
          "requirement_map_schema_blocked",
          "requirement_map_field_too_long",
          ...Object.entries(schemaMissingFieldsByPromotionId).flatMap(([promotionId, fields]) =>
            fields.map((field) => `requirement_missing:${promotionId}:${field}`),
          ),
          "requirement_map_blocked",
        ],
        120,
      ),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }
  const mapHash = sha256Text(
    stableJson({
      mapId: input.mapId,
      sourcePromptHash: input.sourcePromptHash,
      sourcePromptLength: input.sourcePromptLength,
      requirements: parsedRequirements,
      coverage,
    }),
  );
  const parsedRequirementMap = RequirementMapSchema.safeParse({
    artifactKind: "requirement_map",
    schemaVersion: REQUIREMENT_MAP_SCHEMA_VERSION,
    mapId: input.mapId,
    mapRef: `${input.mapRefPrefix}/${mapHash.slice(0, 16)}`,
    mapHash: `sha256:${mapHash}`,
    sourcePromptBodyRef: input.sourcePromptBodyRef,
    sourcePromptHash: input.sourcePromptHash,
    sourcePromptLength: input.sourcePromptLength,
    requirements: parsedRequirements,
    coverage,
    reasonCodes: [...reasonCodes, "requirement_map_accepted"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  });
  if (!parsedRequirementMap.success) {
    return {
      status: "blocked",
      requirementMap: null,
      draft: input.draft,
      drafts: input.draft.promotions,
      appliedToolNames: input.draft.appliedToolNames,
      rejectedToolCalls: input.draft.rejectedToolCalls,
      missingFieldsByPromotionId,
      blockedPromotionIds,
      reasonCodes: uniqueStrings(
        [
          ...reasonCodes,
          "requirement_map_schema_blocked",
          ...parsedRequirementMap.error.issues.map(
            (issue) =>
              `requirement_map_schema_issue:${issue.path.join(".") || "requirement_map"}:${issue.code}`,
          ),
          "requirement_map_blocked",
        ],
        120,
      ),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }
  const requirementMap = parsedRequirementMap.data;
  return {
    status: "accepted",
    requirementMap,
    draft: input.draft,
    drafts: input.draft.promotions,
    appliedToolNames: input.draft.appliedToolNames,
    rejectedToolCalls: input.draft.rejectedToolCalls,
    missingFieldsByPromotionId,
    blockedPromotionIds,
    reasonCodes: requirementMap.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function summarizeRequirementMapForScheduler(
  requirementMap: RequirementMap | null,
): RequirementMapSummary | null {
  if (!requirementMap) {
    return null;
  }
  return {
    mapRef: requirementMap.mapRef,
    sourcePromptBodyRef: requirementMap.sourcePromptBodyRef,
    sourcePromptHash: requirementMap.sourcePromptHash,
    sourcePromptLength: requirementMap.sourcePromptLength,
    coverage: requirementMap.coverage,
    requirementCount: requirementMap.requirements.length,
    runnableRequirementCount: requirementMap.requirements.filter(
      (requirement) => requirement.role === "runnable_work",
    ).length,
    validationRequirementCount: requirementMap.requirements.filter(
      (requirement) => requirement.role === "validation",
    ).length,
    reviewRequirementCount: requirementMap.requirements.filter(
      (requirement) => requirement.role === "review",
    ).length,
    closeoutRequirementCount: requirementMap.requirements.filter(
      (requirement) => requirement.role === "closeout",
    ).length,
    constraintCount: requirementMap.requirements.filter(
      (requirement) => requirement.role === "constraint" || requirement.role === "non_goal",
    ).length,
    contextRequirementCount: requirementMap.requirements.filter(
      (requirement) => requirement.role === "context",
    ).length,
    requirements: requirementMap.requirements.map((requirement) => ({
      requirementId: requirement.requirementId,
      text: requirement.text,
      role: requirement.role,
      sourceRefs: requirement.sourceRefs,
      sourceRefCount: requirement.sourceRefs.length,
      evidenceKinds: roleDefaultEvidenceKinds(requirement.role),
    })),
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function summarizeRequirementMapForManifest(
  requirementMap: RequirementMap | null,
): RequirementMapManifestSummary | null {
  if (!requirementMap) {
    return null;
  }
  const schedulerSummary = summarizeRequirementMapForScheduler(requirementMap);
  if (!schedulerSummary) {
    return null;
  }
  return {
    mapRef: schedulerSummary.mapRef,
    sourcePromptBodyRef: schedulerSummary.sourcePromptBodyRef,
    sourcePromptHash: schedulerSummary.sourcePromptHash,
    sourcePromptLength: schedulerSummary.sourcePromptLength,
    coverage: schedulerSummary.coverage,
    requirementCount: schedulerSummary.requirementCount,
    runnableRequirementCount: schedulerSummary.runnableRequirementCount,
    validationRequirementCount: schedulerSummary.validationRequirementCount,
    reviewRequirementCount: schedulerSummary.reviewRequirementCount,
    closeoutRequirementCount: schedulerSummary.closeoutRequirementCount,
    constraintCount: schedulerSummary.constraintCount,
    contextRequirementCount: schedulerSummary.contextRequirementCount,
    requirementIds: requirementMap.requirements
      .map((requirement) => requirement.requirementId)
      .slice(0, 160),
    sourceRefCount: uniqueStrings(
      requirementMap.requirements.flatMap((requirement) => requirement.sourceRefs),
      800,
    ).length,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function clusterRequirementCandidatesBySourceWindow(input: {
  draft: RequirementCoverageDraft;
  maxCandidatesPerCluster?: number;
}): RequirementCandidateCluster[] {
  const maxCandidatesPerCluster = Math.max(1, Math.min(48, input.maxCandidatesPerCluster ?? 18));
  const clusters = new Map<string, RequirementCandidateCluster>();
  const orderedWindowRefs = input.draft.windows.map((window) => window.windowRef);
  for (const windowRef of orderedWindowRefs) {
    clusters.set(windowRef, {
      clusterId: `requirement-candidate-cluster:${String(clusters.size + 1).padStart(4, "0")}`,
      sourceWindowRefs: [windowRef],
      candidateIds: [],
      sourceRefs: [],
      candidateCount: 0,
    });
  }
  for (const candidate of input.draft.candidates) {
    if (candidate.retired) {
      continue;
    }
    const sourceWindowRef =
      candidate.sourceWindowRefs.find((ref) => clusters.has(ref)) ??
      candidate.sourceWindowRefs[0] ??
      "requirement-candidate-cluster:unanchored";
    const existing = clusters.get(sourceWindowRef) ?? {
      clusterId: `requirement-candidate-cluster:${String(clusters.size + 1).padStart(4, "0")}`,
      sourceWindowRefs: sourceWindowRef ? [sourceWindowRef] : [],
      candidateIds: [],
      sourceRefs: [],
      candidateCount: 0,
    };
    if (existing.candidateIds.length >= maxCandidatesPerCluster) {
      const spillKey = `${sourceWindowRef}:spill:${Math.floor(
        existing.candidateIds.length / maxCandidatesPerCluster,
      )}`;
      const spill = clusters.get(spillKey) ?? {
        clusterId: `${existing.clusterId}:spill:${String(clusters.size + 1).padStart(4, "0")}`,
        sourceWindowRefs: existing.sourceWindowRefs,
        candidateIds: [],
        sourceRefs: [],
        candidateCount: 0,
      };
      spill.candidateIds.push(candidate.candidateId);
      spill.sourceRefs = uniqueStrings([...spill.sourceRefs, ...candidate.sourceRefs], 120);
      spill.candidateCount = spill.candidateIds.length;
      clusters.set(spillKey, spill);
      continue;
    }
    existing.candidateIds.push(candidate.candidateId);
    existing.sourceRefs = uniqueStrings([...existing.sourceRefs, ...candidate.sourceRefs], 120);
    existing.candidateCount = existing.candidateIds.length;
    clusters.set(sourceWindowRef, existing);
  }
  return [...clusters.values()].filter((cluster) => cluster.candidateCount > 0);
}

export function requirementMapSchedulerRunnableIds(
  requirementMap: RequirementMap | null,
): string[] {
  return (requirementMap?.requirements ?? [])
    .filter((requirement) =>
      ["runnable_work", "validation", "review", "closeout", "context"].includes(requirement.role),
    )
    .map((requirement) => requirement.requirementId);
}
