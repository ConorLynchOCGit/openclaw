import { createHash } from "node:crypto";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { SessionSystemPromptReport } from "../config/sessions/types.js";

const DEFAULT_OUTPUT_RESERVE_RATIO = 0.2;
const DEFAULT_TOOL_LOOP_RESERVE_RATIO = 0.1;
const DEFAULT_GUARD_RESERVE_RATIO = 0.05;
const DEFAULT_STABLE_RATIO = 0.45;
const DEFAULT_SEMI_STABLE_RATIO = 0.2;
const DEFAULT_VOLATILE_RATIO = 0.35;

type ContextSegments = NonNullable<SessionSystemPromptReport["contextSegments"]>;
type SegmentClass = ContextSegments["segments"][number]["class"];
type SegmentBudgetPressure = ContextSegments["segments"][number]["budgetPressure"];
type PlannedSegment = ContextSegments["segments"][number];
type OmittedSegments = NonNullable<ContextSegments["omittedSegments"]>;
type OmittedSegment = OmittedSegments[number];

export type BuildContextSegmentPlanParams = {
  baseSystemPrompt: string;
  approvedMemoryContextText?: string;
  contextEngineSystemPromptAddition?: string;
  hookPrependSystemContext?: string;
  hookAppendSystemContext?: string;
  hookSystemPromptOverride?: string;
  promptPrependContext?: string;
  currentPrompt?: string;
  messages?: AgentMessage[];
  tokenBudget?: number;
};

function normalizeText(value: string | undefined): string {
  return value?.trim() ?? "";
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function hashSegmentList(segments: PlannedSegment[]): string {
  return hashText(
    segments.map((segment) => `${segment.id}:${segment.hash}:${segment.chars}`).join("|"),
  );
}

export function estimatePromptSegmentTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

function buildMessageDigest(messages: AgentMessage[]): { chars: number; hash: string } {
  const normalized = messages.map((message) => {
    const role = typeof message.role === "string" ? message.role : "unknown";
    const payload = "content" in message ? message.content : message;
    let content = "";
    if (typeof payload === "string") {
      content = payload;
    } else {
      try {
        content = JSON.stringify(payload ?? null);
      } catch {
        content = "[unserializable-message]";
      }
    }
    return `${role}:${content}`;
  });
  const joined = normalized.join("\n");
  return {
    chars: joined.length,
    hash: hashText(joined),
  };
}

function classifyHookSystemContext(text: string): {
  label: string;
  owner: string;
  class: SegmentClass;
} {
  if (
    text.includes("## Approved Durable Memory Context") ||
    text.includes("## User Memory Pack") ||
    text.includes("## Project Memory Pack") ||
    text.includes("## Procedure Memory Pack")
  ) {
    return {
      label: "Approved durable memory packs",
      owner: "memory_context_control_plane",
      class: "semi_stable",
    };
  }
  return {
    label: "Hook system context",
    owner: "plugin_hook",
    class: "volatile",
  };
}

function classifyHookPromptContext(text: string): {
  label: string;
  owner: string;
  class: SegmentClass;
} {
  if (
    text.includes("## Approved Durable Memory Context") ||
    text.includes("## User Memory Pack") ||
    text.includes("## Project Memory Pack") ||
    text.includes("## Procedure Memory Pack")
  ) {
    return {
      label: "Approved durable memory packs",
      owner: "memory_context_control_plane",
      class: "semi_stable",
    };
  }
  return {
    label: "Prompt prepend context",
    owner: "plugin_hook",
    class: "volatile",
  };
}

function resolveBudgetPolicy(tokenBudget: number | undefined) {
  if (!tokenBudget || !Number.isFinite(tokenBudget) || tokenBudget <= 0) {
    return {
      totalBudgetTokens: undefined,
      usableBudgetTokens: undefined,
      reserveOutputTokens: undefined,
      reserveToolLoopTokens: undefined,
      reserveGuardTokens: undefined,
      stableTargetTokens: undefined,
      semiStableTargetTokens: undefined,
      volatileTargetTokens: undefined,
    };
  }
  const reserveOutputTokens = Math.floor(tokenBudget * DEFAULT_OUTPUT_RESERVE_RATIO);
  const reserveToolLoopTokens = Math.floor(tokenBudget * DEFAULT_TOOL_LOOP_RESERVE_RATIO);
  const reserveGuardTokens = Math.floor(tokenBudget * DEFAULT_GUARD_RESERVE_RATIO);
  const usableBudgetTokens = Math.max(
    0,
    tokenBudget - reserveOutputTokens - reserveToolLoopTokens - reserveGuardTokens,
  );
  return {
    totalBudgetTokens: tokenBudget,
    usableBudgetTokens,
    reserveOutputTokens,
    reserveToolLoopTokens,
    reserveGuardTokens,
    stableTargetTokens: Math.floor(usableBudgetTokens * DEFAULT_STABLE_RATIO),
    semiStableTargetTokens: Math.floor(usableBudgetTokens * DEFAULT_SEMI_STABLE_RATIO),
    volatileTargetTokens: Math.floor(usableBudgetTokens * DEFAULT_VOLATILE_RATIO),
  };
}

function resolveBudgetPressure(params: {
  actualTokens: number;
  targetTokens: number | undefined;
}): SegmentBudgetPressure {
  if (!params.targetTokens || params.targetTokens <= 0) {
    return "unknown";
  }
  return params.actualTokens > params.targetTokens ? "over_target" : "within_target";
}

function withBudgetPressure(
  segments: PlannedSegment[],
  klass: SegmentClass,
  pressure: SegmentBudgetPressure,
): PlannedSegment[] {
  return segments.map((segment) =>
    segment.class === klass ? { ...segment, budgetPressure: pressure } : segment,
  );
}

function createSegment(params: {
  id: string;
  label: string;
  owner: string;
  class: SegmentClass;
  order: number;
  text: string;
}): PlannedSegment {
  return {
    id: params.id,
    label: params.label,
    owner: params.owner,
    class: params.class,
    order: params.order,
    chars: params.text.length,
    approxTokens: estimatePromptSegmentTokens(params.text.length),
    hash: hashText(params.text),
    budgetPressure: "unknown",
  };
}

export function buildContextSegmentPlan(
  params: BuildContextSegmentPlanParams,
): SessionSystemPromptReport["contextSegments"] {
  const baseSystemPrompt = normalizeText(params.baseSystemPrompt);
  const approvedMemoryContextText = normalizeText(params.approvedMemoryContextText);
  const contextEngineSystemPromptAddition = normalizeText(params.contextEngineSystemPromptAddition);
  const hookPrependSystemContext = normalizeText(params.hookPrependSystemContext);
  const hookAppendSystemContext = normalizeText(params.hookAppendSystemContext);
  const hookSystemPromptOverride = normalizeText(params.hookSystemPromptOverride);
  const promptPrependContext = normalizeText(params.promptPrependContext);
  const currentPrompt = normalizeText(params.currentPrompt);
  const budgetPolicy = resolveBudgetPolicy(params.tokenBudget);
  const overflowDegradeOrder = [
    "volatile_live_tool_results",
    "volatile_recent_messages",
    "volatile_prompt_prefix",
    "semi_stable_workspace_excerpts",
    "semi_stable_memory_packs",
    "semi_stable_summary",
    "stable_bootstrap",
  ];

  let order = 0;
  const segments: PlannedSegment[] = [];
  const omittedSegments: OmittedSegment[] = [];
  const prependCarriesMemoryPacks =
    classifyHookPromptContext(promptPrependContext).owner === "memory_context_control_plane";

  if (hookSystemPromptOverride) {
    if (baseSystemPrompt) {
      omittedSegments.push({
        id: "base_system_prompt",
        label: "Base system prompt",
        class: "stable",
        reason: "replaced_by_hook_system_prompt_override",
      });
    }
    if (approvedMemoryContextText) {
      omittedSegments.push({
        id: "approved_memory_context",
        label: "Approved durable memory packs",
        class: "semi_stable",
        reason: "replaced_by_hook_system_prompt_override",
      });
    }
    segments.push(
      createSegment({
        id: "hook_system_prompt_override",
        label: "Hook system prompt override",
        owner: "plugin_hook",
        class: "volatile",
        order: order++,
        text: hookSystemPromptOverride,
      }),
    );
  } else {
    if (contextEngineSystemPromptAddition) {
      segments.push(
        createSegment({
          id: "context_engine_system_addition",
          label: "Context-engine system addition",
          owner: "context_engine",
          class: "semi_stable",
          order: order++,
          text: contextEngineSystemPromptAddition,
        }),
      );
    }
    if (hookPrependSystemContext) {
      const classification = classifyHookSystemContext(hookPrependSystemContext);
      segments.push(
        createSegment({
          id:
            classification.owner === "memory_context_control_plane"
              ? "approved_memory_context_prepend"
              : "hook_system_context_prepend",
          label: classification.label,
          owner: classification.owner,
          class: classification.class,
          order: order++,
          text: hookPrependSystemContext,
        }),
      );
    }
    if (baseSystemPrompt) {
      segments.push(
        createSegment({
          id: "base_system_prompt",
          label: "Base system prompt",
          owner: "system_prompt_builder",
          class: "stable",
          order: order++,
          text: baseSystemPrompt,
        }),
      );
    }
    const appendCarriesMemoryPacks =
      classifyHookSystemContext(hookAppendSystemContext).owner === "memory_context_control_plane";
    if (approvedMemoryContextText && !appendCarriesMemoryPacks && !prependCarriesMemoryPacks) {
      segments.push(
        createSegment({
          id: "approved_memory_context",
          label: "Approved durable memory packs",
          owner: "memory_context_control_plane",
          class: "semi_stable",
          order: order++,
          text: approvedMemoryContextText,
        }),
      );
    }
    if (hookAppendSystemContext) {
      const classification = classifyHookSystemContext(hookAppendSystemContext);
      segments.push(
        createSegment({
          id:
            classification.owner === "memory_context_control_plane"
              ? "approved_memory_context"
              : "hook_system_context_append",
          label: classification.label,
          owner: classification.owner,
          class: classification.class,
          order: order++,
          text: hookAppendSystemContext,
        }),
      );
    }
  }

  if (promptPrependContext) {
    const classification = classifyHookPromptContext(promptPrependContext);
    segments.push(
      createSegment({
        id:
          classification.owner === "memory_context_control_plane"
            ? "approved_memory_context_prompt"
            : "prompt_prepend_context",
        label: classification.label,
        owner: classification.owner,
        class: classification.class,
        order: order++,
        text: promptPrependContext,
      }),
    );
  }

  if (params.messages && params.messages.length > 0) {
    const digest = buildMessageDigest(params.messages);
    segments.push({
      id: "recent_messages",
      label: "Recent conversation state",
      owner: "runner_history",
      class: "volatile",
      order: order++,
      chars: digest.chars,
      approxTokens: estimatePromptSegmentTokens(digest.chars),
      hash: digest.hash,
      budgetPressure: "unknown",
    });
  }

  if (currentPrompt) {
    segments.push(
      createSegment({
        id: "current_turn_prompt",
        label: "Current turn prompt",
        owner: "turn_input",
        class: "volatile",
        order: order++,
        text: currentPrompt,
      }),
    );
  }

  const stableSegments = segments.filter((segment) => segment.class === "stable");
  const semiStableSegments = segments.filter((segment) => segment.class === "semi_stable");
  const volatileSegments = segments.filter((segment) => segment.class === "volatile");

  const stableTokens = stableSegments.reduce((sum, segment) => sum + segment.approxTokens, 0);
  const semiStableTokens = semiStableSegments.reduce(
    (sum, segment) => sum + segment.approxTokens,
    0,
  );
  const volatileTokens = volatileSegments.reduce((sum, segment) => sum + segment.approxTokens, 0);

  const stablePressure = resolveBudgetPressure({
    actualTokens: stableTokens,
    targetTokens: budgetPolicy.stableTargetTokens,
  });
  const semiStablePressure = resolveBudgetPressure({
    actualTokens: semiStableTokens,
    targetTokens: budgetPolicy.semiStableTargetTokens,
  });
  const volatilePressure = resolveBudgetPressure({
    actualTokens: volatileTokens,
    targetTokens: budgetPolicy.volatileTargetTokens,
  });

  const budgetedSegments = withBudgetPressure(
    withBudgetPressure(
      withBudgetPressure(segments, "stable", stablePressure),
      "semi_stable",
      semiStablePressure,
    ),
    "volatile",
    volatilePressure,
  );

  return {
    totalBudgetTokens: budgetPolicy.totalBudgetTokens,
    usableBudgetTokens: budgetPolicy.usableBudgetTokens,
    policy: {
      reserveOutputTokens: budgetPolicy.reserveOutputTokens,
      reserveToolLoopTokens: budgetPolicy.reserveToolLoopTokens,
      reserveGuardTokens: budgetPolicy.reserveGuardTokens,
      stableTargetTokens: budgetPolicy.stableTargetTokens,
      semiStableTargetTokens: budgetPolicy.semiStableTargetTokens,
      volatileTargetTokens: budgetPolicy.volatileTargetTokens,
      overflowDegradeOrder,
    },
    totals: {
      stableChars: stableSegments.reduce((sum, segment) => sum + segment.chars, 0),
      stableTokens,
      stableHash: hashSegmentList(stableSegments),
      stablePressure,
      semiStableChars: semiStableSegments.reduce((sum, segment) => sum + segment.chars, 0),
      semiStableTokens,
      semiStableHash: hashSegmentList(semiStableSegments),
      semiStablePressure: semiStablePressure,
      volatileChars: volatileSegments.reduce((sum, segment) => sum + segment.chars, 0),
      volatileTokens,
      volatileHash: hashSegmentList(volatileSegments),
      volatilePressure,
    },
    segments: budgetedSegments,
    ...(omittedSegments.length > 0 ? { omittedSegments } : {}),
  };
}
