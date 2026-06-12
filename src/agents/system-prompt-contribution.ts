import { createHash } from "node:crypto";

export type ProviderSystemPromptSectionId =
  | "identity"
  | "interaction_style"
  | "tool_call_style"
  | "execution_bias"
  | "execution_contract";

export type ProviderSystemPromptContribution = {
  /**
   * Cache-stable provider guidance inserted above the system-prompt cache boundary.
   *
   * Use this for static provider/model-family instructions that should preserve
   * KV cache reuse across turns.
   */
  stablePrefix?: string;
  /**
   * Provider guidance inserted below the cache boundary.
   *
   * Use this only for genuinely dynamic text that is expected to vary across
   * runs or sessions.
   */
  dynamicSuffix?: string;
  /**
   * Whole-section replacements for selected core prompt sections.
   *
   * Values should contain the complete rendered section, including any desired
   * heading such as `## Tool Call Style`.
   */
  sectionOverrides?: Partial<Record<ProviderSystemPromptSectionId, string>>;
};

type ProviderPromptContributionResolutionInput = {
  provider: string;
  modelId: string;
  agentId?: string;
  promptProfile?: string;
};

export type ProviderSystemPromptContributionReceipt = {
  systemPromptHash: string;
  systemPromptBytes: number;
  rawSystemPromptStored: false;
  promptMode?: string;
  promptProfile?: string;
  includedSectionIds?: string[];
  sectionByteCounts?: Record<string, number>;
  genericAssistantBytes?: number;
  executionContractBytes?: number;
  providerContributionBytes?: number;
  kimiExecutionContractPresent?: boolean;
  injectedExecutionDocs?: string[];
  kimiImplementationWorkerPrompt:
    | {
        required: true;
        present: boolean;
        contributionHash: string;
        contributionBytes: number;
      }
    | {
        required: false;
        present: false;
      };
};

function normalizePromptContributionId(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function stablePromptContributionHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isKimiImplementationWorker(params: ProviderPromptContributionResolutionInput): boolean {
  if (normalizePromptContributionId(params.agentId) !== "execution-coding") {
    return false;
  }
  const provider = normalizePromptContributionId(params.provider);
  const modelId = normalizePromptContributionId(params.modelId);
  if (!modelId) {
    return false;
  }
  if (provider === "openrouter") {
    return /(?:^|\/)moonshotai\/kimi-k2(?:[.-]\d+)?(?:$|[:/@_-])/u.test(`openrouter/${modelId}`);
  }
  if (provider === "moonshot") {
    return /(?:^|\/)kimi-k2(?:[.-]\d+)?(?:$|[:/@_-])/u.test(modelId);
  }
  if (provider === "kimi" || provider === "kimi-code" || provider === "kimi-coding") {
    return /\b(?:kimi|k2)\b/u.test(modelId);
  }
  return false;
}

export const KIMI_IMPLEMENTATION_WORKER_IDENTITY_SECTION = [
  "## Identity",
  "",
  "You are an implementation worker. Your job is to make accepted source edits for this node, then finish through node_finish. You are not here to complete an architecture audit.",
].join("\n");

export const KIMI_IMPLEMENTATION_WORKER_EXECUTION_CONTRACT_SECTION = [
  "## Execution Contract",
  "",
  "Your only goal is accepted source edits for this node, then node_finish.",
  "",
  "Start with a provisional patch hypothesis: target files, target symbols, patch shape, and validation signal. Use source tools only to ground that hypothesis enough to edit.",
  "",
  "For large TypeScript files, derive LSP queries from task names, file names, exported types, functions, interfaces, tests, and likely PascalCase/camelCase symbols.",
  "",
  "Use lsp documentSymbol, workspaceSymbol, or file-scoped grep before walking read windows.",
  "",
  "Path-only read of a large file floods context and jeopardizes completion. Use it at most once. After that, use LSP/query, file-scoped grep, or read with explicit offset and limit.",
  "",
  "When target files, target symbols, patch shape, and validation signal are known, make the largest currently-grounded coherent vertical edit batch.",
  "",
  "If only part is grounded, edit that part now and let validation drive repair.",
  "",
  "Local uncertainty is not a blocker. Validation and edit failures are how you discover the next missing fact.",
  "",
  "Once production code is visible, edit production first. Add or adjust tests after the first production edit unless the task is explicitly test-only.",
  "",
  "Code is not changed until the edit tool runs. Use edit as the primary implementation action.",
].join("\n");

export const KIMI_IMPLEMENTATION_WORKER_TOOL_CALL_STYLE_SECTION = [
  "## Tool Call Style",
  "",
  "Call tools directly when the next action is clear. Keep narration short.",
  "",
  "Use direct read/grep/glob/lsp for exact local navigation. Use task only for open-ended exploration or validation.",
  "",
  "After the target file, target symbol, patch shape, and validation signal are nameable, the next action should be edit. Do not take another context-acquisition turn unless one specific missing symbol, line window, or validation error blocks the edit.",
].join("\n");

function promptSectionIdFromHeading(heading: string): string {
  return heading
    .replace(/^#+\s*/u, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

function analyzePromptSections(systemPrompt: string): {
  includedSectionIds: string[];
  sectionByteCounts: Record<string, number>;
} {
  const matches = Array.from(systemPrompt.matchAll(/^(#{1,3})\s+(.+)$/gmu));
  if (matches.length === 0) {
    return {
      includedSectionIds: [],
      sectionByteCounts: {},
    };
  }
  const sectionByteCounts: Record<string, number> = {};
  for (const [index, match] of matches.entries()) {
    const heading = match[2] ?? "";
    const id = promptSectionIdFromHeading(heading);
    if (!id) {
      continue;
    }
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? systemPrompt.length;
    sectionByteCounts[id] =
      (sectionByteCounts[id] ?? 0) + Buffer.byteLength(systemPrompt.slice(start, end), "utf8");
  }
  return {
    includedSectionIds: Object.keys(sectionByteCounts),
    sectionByteCounts,
  };
}

function countPromptBytesForSections(
  sectionByteCounts: Record<string, number>,
  sectionIds: readonly string[],
): number {
  return sectionIds.reduce((total, id) => total + (sectionByteCounts[id] ?? 0), 0);
}

function collectInjectedExecutionDocs(systemPrompt: string): string[] {
  const docs = new Set<string>();
  for (const match of systemPrompt.matchAll(/^##\s+(docs\/agents\/execution-[^\n]+)$/gmu)) {
    if (match[1]) {
      docs.add(match[1].trim());
    }
  }
  return Array.from(docs).toSorted();
}

export function resolveBuiltInProviderSystemPromptContribution(
  params: ProviderPromptContributionResolutionInput,
): ProviderSystemPromptContribution | undefined {
  if (!isKimiImplementationWorker(params)) {
    return undefined;
  }
  if (params.promptProfile !== "execution_worker") {
    return undefined;
  }
  return {
    sectionOverrides: {
      identity: KIMI_IMPLEMENTATION_WORKER_IDENTITY_SECTION,
      execution_contract: KIMI_IMPLEMENTATION_WORKER_EXECUTION_CONTRACT_SECTION,
      tool_call_style: KIMI_IMPLEMENTATION_WORKER_TOOL_CALL_STYLE_SECTION,
    },
  };
}

export function buildProviderSystemPromptContributionReceipt(params: {
  systemPrompt: string;
  provider?: string;
  modelId?: string;
  agentId?: string;
  promptMode?: string;
  promptProfile?: string;
}): ProviderSystemPromptContributionReceipt {
  const expectedKimiContribution = resolveBuiltInProviderSystemPromptContribution({
    provider: params.provider ?? "",
    modelId: params.modelId ?? "",
    agentId: params.agentId,
    promptProfile: params.promptProfile,
  });
  const expectedStablePrefix = expectedKimiContribution?.stablePrefix;
  const expectedExecutionContract =
    expectedKimiContribution?.sectionOverrides?.execution_contract ??
    (params.promptProfile === "execution_worker"
      ? KIMI_IMPLEMENTATION_WORKER_EXECUTION_CONTRACT_SECTION
      : undefined);
  const sectionAnalysis = analyzePromptSections(params.systemPrompt);
  const genericAssistantBytes = countPromptBytesForSections(sectionAnalysis.sectionByteCounts, [
    "messaging",
    "web_browsing",
    "control_ui_embed",
    "voice_tts",
    "openclaw_self_update",
    "openclaw_cli_quick_reference",
    "silent_replies",
    "documentation",
    "model_aliases",
    "assistant_output_directives",
  ]);
  const executionContractBytes = countPromptBytesForSections(sectionAnalysis.sectionByteCounts, [
    "execution_contract",
    "kimi_implementation_worker",
  ]);
  const providerContributionBytes =
    (expectedStablePrefix ? Buffer.byteLength(expectedStablePrefix, "utf8") : 0) +
    (expectedExecutionContract ? Buffer.byteLength(expectedExecutionContract, "utf8") : 0);
  const kimiExecutionContractPresent =
    Boolean(expectedExecutionContract && params.systemPrompt.includes(expectedExecutionContract)) ||
    Boolean(expectedStablePrefix && params.systemPrompt.includes(expectedStablePrefix));
  return {
    systemPromptHash: stablePromptContributionHash(params.systemPrompt),
    systemPromptBytes: Buffer.byteLength(params.systemPrompt, "utf8"),
    rawSystemPromptStored: false,
    promptMode: params.promptMode,
    promptProfile: params.promptProfile,
    includedSectionIds: sectionAnalysis.includedSectionIds,
    sectionByteCounts: sectionAnalysis.sectionByteCounts,
    genericAssistantBytes,
    executionContractBytes,
    providerContributionBytes,
    kimiExecutionContractPresent,
    injectedExecutionDocs: collectInjectedExecutionDocs(params.systemPrompt),
    kimiImplementationWorkerPrompt: expectedKimiContribution
      ? {
          required: true,
          present: kimiExecutionContractPresent,
          contributionHash: stablePromptContributionHash(
            expectedStablePrefix ?? expectedExecutionContract ?? "",
          ),
          contributionBytes: providerContributionBytes,
        }
      : {
          required: false,
          present: false,
        },
  };
}

function mergePromptBlocks(first?: string, second?: string): string | undefined {
  const normalizedFirst = first?.trim();
  const normalizedSecond = second?.trim();
  if (normalizedFirst && normalizedSecond) {
    return `${normalizedFirst}\n\n${normalizedSecond}`;
  }
  return normalizedFirst || normalizedSecond || undefined;
}

export function mergeProviderSystemPromptContributions(
  base: ProviderSystemPromptContribution | undefined,
  override: ProviderSystemPromptContribution | undefined,
): ProviderSystemPromptContribution | undefined {
  if (!base) {
    return override;
  }
  if (!override) {
    return base;
  }
  const merged: ProviderSystemPromptContribution = {
    stablePrefix: mergePromptBlocks(base.stablePrefix, override.stablePrefix),
    dynamicSuffix: mergePromptBlocks(base.dynamicSuffix, override.dynamicSuffix),
    sectionOverrides: {
      ...base.sectionOverrides,
      ...override.sectionOverrides,
    },
  };
  if (!merged.stablePrefix) {
    delete merged.stablePrefix;
  }
  if (!merged.dynamicSuffix) {
    delete merged.dynamicSuffix;
  }
  if (Object.keys(merged.sectionOverrides ?? {}).length === 0) {
    delete merged.sectionOverrides;
  }
  return merged;
}
