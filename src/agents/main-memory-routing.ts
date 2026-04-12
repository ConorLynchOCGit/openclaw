import type {
  SessionMainMemoryRoutingCanonicalFacetFilter,
  SessionMainMemoryRoutingCanonicalKind,
  SessionMainMemoryRoutingDerivedView,
  SessionMainMemoryRoutingIntentSignal,
  SessionMainMemoryRoutingPromptClass,
  SessionMainMemoryRoutingReasonCode,
  SessionMainMemoryRoutingReport,
  SessionMainMemoryRoutingSelectedTarget,
} from "../config/sessions/types.js";
import { extractTextFromChatContent } from "../shared/chat-content.js";
import { resolveSourceResolutionReport } from "./source-resolution.js";

type MainMemoryIntentFeature = {
  id: SessionMainMemoryRoutingIntentSignal;
  weight: number;
  promptClass: Exclude<SessionMainMemoryRoutingPromptClass, "none" | "boundary">;
  pattern: RegExp;
  requestedKinds: readonly SessionMainMemoryRoutingCanonicalKind[];
  derivedViews: readonly SessionMainMemoryRoutingDerivedView[];
  facetFilters?: readonly SessionMainMemoryRoutingCanonicalFacetFilter[];
};

const MAIN_MEMORY_TOOL_CHOICE_APIS = new Set([
  "openai-responses",
  "openai-codex-responses",
  "azure-openai-responses",
]);

const MAIN_MEMORY_INTENT_FEATURES: readonly MainMemoryIntentFeature[] = [
  {
    id: "source_truth_lookup",
    weight: 6,
    promptClass: "source_truth_lookup",
    pattern:
      /\b(?:mounted (?:repo|project|memory) files?|curated import|imports\/|source[- ]of[- ]truth|repo-canonical|canonical memory classes?|memory-system (?:architecture|spec|roadmap)|read the mounted files)\b/i,
    requestedKinds: ["reference", "project"],
    derivedViews: ["reference_lookup", "project_rule"],
  },
  {
    id: "preflight_check",
    weight: 4,
    promptClass: "workflow_preflight",
    pattern: /\bpreflight\b/i,
    requestedKinds: ["feedback", "project"],
    derivedViews: ["workflow_guidance", "project_rule", "unmet_need"],
    facetFilters: [{ key: "workflow_guidance", value: true }],
  },
  {
    id: "before_action",
    weight: 3,
    promptClass: "workflow_preflight",
    pattern: /\bbefore i (?:land|push|commit|do|finish|wrap up|send|reply|rerun|finalize)\b/i,
    requestedKinds: ["feedback", "project"],
    derivedViews: ["workflow_guidance", "project_rule", "unmet_need"],
    facetFilters: [{ key: "workflow_guidance", value: true }],
  },
  {
    id: "watch_for",
    weight: 2,
    promptClass: "workflow_preflight",
    pattern: /\b(?:double-?check first|what should i watch for|what should i not forget)\b/i,
    requestedKinds: ["feedback", "project"],
    derivedViews: ["workflow_guidance", "project_rule", "unmet_need"],
    facetFilters: [{ key: "workflow_guidance", value: true }],
  },
  {
    id: "repo_follow_through",
    weight: 2,
    promptClass: "workflow_preflight",
    pattern: /\b(?:smallest honest preflight|repo-specific follow-?through)\b/i,
    requestedKinds: ["feedback", "project", "reference"],
    derivedViews: ["workflow_guidance", "project_rule", "project_fact"],
    facetFilters: [{ key: "workflow_guidance", value: true }],
  },
  {
    id: "command_lookup",
    weight: 3,
    promptClass: "direct_lookup",
    pattern:
      /\b(?:what should i run first|what extra check should|what command should i (?:use|run))\b/i,
    requestedKinds: ["reference", "feedback", "project"],
    derivedViews: ["procedure", "workflow_guidance", "project_rule"],
  },
  {
    id: "artifact_lookup",
    weight: 3,
    promptClass: "direct_lookup",
    pattern: /\b(?:where should .* live|what artifact should (?:i update|move with it))\b/i,
    requestedKinds: ["project", "reference", "feedback"],
    derivedViews: ["project_fact", "project_rule", "reference_lookup"],
  },
  {
    id: "terminology_lookup",
    weight: 2,
    promptClass: "direct_lookup",
    pattern: /\b(?:how should .* be written|what terminology should)\b/i,
    requestedKinds: ["reference", "feedback"],
    derivedViews: ["project_rule", "reference_lookup"],
  },
  {
    id: "boundary_lookup",
    weight: 3,
    promptClass: "direct_lookup",
    pattern: /\b(?:should (?:you|i) use .* or .*|if .* should it .* or .*)\b/i,
    requestedKinds: ["feedback", "reference", "project"],
    derivedViews: ["project_rule", "workflow_guidance", "reference_lookup"],
  },
];

type MatchedMainMemoryFeature = {
  id: SessionMainMemoryRoutingIntentSignal;
  weight: number;
  promptClass: Exclude<SessionMainMemoryRoutingPromptClass, "none" | "boundary">;
  requestedKinds: readonly SessionMainMemoryRoutingCanonicalKind[];
  derivedViews: readonly SessionMainMemoryRoutingDerivedView[];
  facetFilters: readonly SessionMainMemoryRoutingCanonicalFacetFilter[];
};

function extractMessageText(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return (
    extractTextFromChatContent(content, {
      joinWith: "\n",
      normalizeText: (text) => text.trim(),
    }) ?? ""
  ).trim();
}

function findLatestUserMessage(messages: unknown): { index: number; text: string } | null {
  if (!Array.isArray(messages)) {
    return null;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== "object") {
      continue;
    }
    if ((message as { role?: unknown }).role !== "user") {
      continue;
    }
    const text = extractMessageText((message as { content?: unknown }).content);
    if (text) {
      return { index, text };
    }
  }
  return null;
}

function hasToolLoopActivityAfterIndex(messages: unknown, index: number): boolean {
  if (!Array.isArray(messages)) {
    return false;
  }
  for (let messageIndex = index + 1; messageIndex < messages.length; messageIndex += 1) {
    const message = messages[messageIndex];
    if (!message || typeof message !== "object") {
      continue;
    }
    const role = (message as { role?: unknown }).role;
    if (role === "tool" || role === "toolResult") {
      return true;
    }
    if (role !== "assistant") {
      continue;
    }
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }
    if (
      content.some(
        (block) =>
          block && typeof block === "object" && (block as { type?: unknown }).type === "toolCall",
      )
    ) {
      return true;
    }
  }
  return false;
}

function hasToolNamed(
  tools: unknown,
  targetName: Exclude<SessionMainMemoryRoutingSelectedTarget, "none">,
): boolean {
  return Array.isArray(tools)
    ? tools.some((tool) => {
        if (!tool || typeof tool !== "object") {
          return false;
        }
        return (tool as { name?: unknown }).name === targetName;
      })
    : false;
}

function buildAvailableMemoryTools(
  tools: unknown,
): SessionMainMemoryRoutingReport["availableTools"] {
  return {
    memoryLearnedGuidancePlan: hasToolNamed(tools, "memory_learned_guidance_plan"),
    memoryObjectSearchHybrid: hasToolNamed(tools, "memory_object_search_hybrid"),
    memorySearch: hasToolNamed(tools, "memory_search"),
  };
}

function collectMatchedIntentFeatures(text: string): MatchedMainMemoryFeature[] {
  return MAIN_MEMORY_INTENT_FEATURES.flatMap((feature) =>
    feature.pattern.test(text)
      ? [
          {
            id: feature.id,
            weight: feature.weight,
            promptClass: feature.promptClass,
            requestedKinds: feature.requestedKinds,
            derivedViews: feature.derivedViews,
            facetFilters: feature.facetFilters ?? [],
          },
        ]
      : [],
  );
}

function buildCanonicalPlanFromFeatures(
  features: readonly MatchedMainMemoryFeature[],
): SessionMainMemoryRoutingReport["canonicalPlan"] {
  const requestedKinds = Array.from(new Set(features.flatMap((feature) => feature.requestedKinds)));
  const derivedViews = Array.from(new Set(features.flatMap((feature) => feature.derivedViews)));
  const facetFilters = Array.from(
    new Map(
      features.flatMap((feature) =>
        feature.facetFilters.map((filter) => [`${filter.key}:${String(filter.value)}`, filter]),
      ),
    ).values(),
  );
  const matchedSignals = features.map((feature) => feature.id);
  return {
    requestedKinds,
    derivedViews,
    facetFilters,
    matchedSignals,
  };
}

function classifyPromptFromFeatures(
  features: readonly MatchedMainMemoryFeature[],
): SessionMainMemoryRoutingPromptClass {
  if (features.length === 0) {
    return "none";
  }
  const sourceTruthScore = features
    .filter((feature) => feature.promptClass === "source_truth_lookup")
    .reduce((total, feature) => total + feature.weight, 0);
  if (sourceTruthScore > 0) {
    return "source_truth_lookup";
  }
  const scores = features.reduce(
    (totals, feature) => {
      if (feature.promptClass === "workflow_preflight") {
        totals.workflow_preflight += feature.weight;
      } else if (feature.promptClass === "direct_lookup") {
        totals.direct_lookup += feature.weight;
      }
      return totals;
    },
    { workflow_preflight: 0, direct_lookup: 0 },
  );
  if (scores.workflow_preflight === 0) {
    return "direct_lookup";
  }
  if (scores.direct_lookup === 0) {
    return "workflow_preflight";
  }
  return Math.abs(scores.workflow_preflight - scores.direct_lookup) <= 1
    ? "boundary"
    : scores.workflow_preflight > scores.direct_lookup
      ? "workflow_preflight"
      : "direct_lookup";
}

function finalizeMainMemoryRoutingDecision(
  base: Omit<
    SessionMainMemoryRoutingReport,
    "selectedTarget" | "reasonCode" | "skillSuppressionRequested"
  >,
  selectedTarget: SessionMainMemoryRoutingSelectedTarget,
  reasonCode: SessionMainMemoryRoutingReasonCode,
): SessionMainMemoryRoutingReport {
  return {
    ...base,
    selectedTarget,
    reasonCode,
    skillSuppressionRequested: selectedTarget !== "none",
  };
}

function selectPreferredToolTarget(
  promptClass: SessionMainMemoryRoutingPromptClass,
  sourceResolution: SessionMainMemoryRoutingReport["sourceResolution"],
  availableTools: SessionMainMemoryRoutingReport["availableTools"],
): {
  selectedTarget: SessionMainMemoryRoutingSelectedTarget;
  reasonCode: SessionMainMemoryRoutingReasonCode;
} {
  if (
    sourceResolution.questionKind === "implementation" ||
    sourceResolution.questionKind === "mixed" ||
    promptClass === "source_truth_lookup"
  ) {
    return {
      selectedTarget: "none",
      reasonCode: "source_truth_lookup_no_memory_pin",
    };
  }
  if (promptClass === "workflow_preflight") {
    if (availableTools.memoryLearnedGuidancePlan) {
      return {
        selectedTarget: "memory_learned_guidance_plan",
        reasonCode: "selected_learned_guidance",
      };
    }
    if (availableTools.memoryObjectSearchHybrid) {
      return {
        selectedTarget: "memory_object_search_hybrid",
        reasonCode: "learned_guidance_unavailable",
      };
    }
    if (availableTools.memorySearch) {
      return {
        selectedTarget: "memory_search",
        reasonCode: "selected_search_fallback",
      };
    }
    return { selectedTarget: "none", reasonCode: "search_unavailable" };
  }

  if (availableTools.memoryObjectSearchHybrid) {
    return { selectedTarget: "memory_object_search_hybrid", reasonCode: "selected_hybrid" };
  }
  if (availableTools.memorySearch) {
    return { selectedTarget: "memory_search", reasonCode: "selected_search_fallback" };
  }
  if (availableTools.memoryLearnedGuidancePlan) {
    return {
      selectedTarget: "memory_learned_guidance_plan",
      reasonCode: "selected_learned_guidance",
    };
  }
  return { selectedTarget: "none", reasonCode: "search_unavailable" };
}

export function resolveMainMemoryRoutingDecision(params: {
  agentId?: string;
  provider?: unknown;
  model: { api?: unknown };
  context: { messages?: unknown; tools?: unknown };
  sourceContext?: {
    bootstrapTruncated?: boolean;
    workspaceContextMissing?: boolean;
  };
  version?: string;
  commit?: string | null;
}): SessionMainMemoryRoutingReport {
  const availableTools = buildAvailableMemoryTools(params.context.tools);
  const base = {
    version: params.version,
    commit: params.commit ?? undefined,
    provider: typeof params.provider === "string" ? params.provider : undefined,
    api: typeof params.model.api === "string" ? params.model.api : undefined,
    agentId: params.agentId?.trim(),
    availableTools,
    promptClass: "none" as SessionMainMemoryRoutingPromptClass,
    sourceResolution: resolveSourceResolutionReport({ text: "" }),
    canonicalPlan: {
      requestedKinds: [] as SessionMainMemoryRoutingCanonicalKind[],
      derivedViews: [] as SessionMainMemoryRoutingDerivedView[],
      facetFilters: [] as SessionMainMemoryRoutingCanonicalFacetFilter[],
      matchedSignals: [] as SessionMainMemoryRoutingIntentSignal[],
    },
  };

  if (params.agentId?.trim() !== "main") {
    return finalizeMainMemoryRoutingDecision(base, "none", "non_main_agent");
  }
  if (typeof params.model.api !== "string" || !MAIN_MEMORY_TOOL_CHOICE_APIS.has(params.model.api)) {
    return finalizeMainMemoryRoutingDecision(base, "none", "unsupported_api");
  }

  const latestUserMessage = findLatestUserMessage(params.context.messages);
  if (!latestUserMessage) {
    return finalizeMainMemoryRoutingDecision(base, "none", "missing_user_message");
  }
  if (hasToolLoopActivityAfterIndex(params.context.messages, latestUserMessage.index)) {
    return finalizeMainMemoryRoutingDecision(base, "none", "tool_loop_started");
  }

  const matchedFeatures = collectMatchedIntentFeatures(latestUserMessage.text);
  const sourceResolution = resolveSourceResolutionReport({
    text: latestUserMessage.text,
    bootstrapTruncated: params.sourceContext?.bootstrapTruncated,
    workspaceContextMissing: params.sourceContext?.workspaceContextMissing,
  });
  const featurePromptClass = classifyPromptFromFeatures(matchedFeatures);
  const promptClass =
    sourceResolution.questionKind === "implementation" || sourceResolution.questionKind === "mixed"
      ? "source_truth_lookup"
      : featurePromptClass;
  const withPlan = {
    ...base,
    promptClass,
    sourceResolution,
    canonicalPlan: buildCanonicalPlanFromFeatures(matchedFeatures),
  };
  if (promptClass === "none") {
    return finalizeMainMemoryRoutingDecision(withPlan, "none", "classifier_no_match");
  }

  const selection = selectPreferredToolTarget(promptClass, sourceResolution, availableTools);
  return finalizeMainMemoryRoutingDecision(
    withPlan,
    selection.selectedTarget,
    selection.reasonCode,
  );
}
