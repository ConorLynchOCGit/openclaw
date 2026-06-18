/**
 * Compact runtime receipt for agent/subagent launches.
 *
 * The receipt is evidence about the native launch path. It is not a policy
 * engine and must not store prompts, transcripts, tool logs, or provider
 * payloads.
 */
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";

export type AgentRunReceiptPhase = "resolved" | "finalized";
export type AgentRunReceiptTerminalStatus = "succeeded" | "failed" | "timed_out" | "cancelled";

export type AgentRunReceiptSource = {
  kind: "chat" | "gateway" | "plugin" | "subagent" | "taskflow" | "lobster" | "codex" | "unknown";
  id?: string;
  hook?: string;
};

export type AgentRunReceiptRuntimeRef = {
  model: string;
  runtime: "openclaw" | "codex" | "unknown";
  workspace?: string;
  contextMode?: string;
};

export type AgentRunReceiptAttemptsSummary = {
  count: number;
  finalAttempt?: number;
};

export type AgentRunReceipt = {
  phase: AgentRunReceiptPhase;
  terminalStatus?: AgentRunReceiptTerminalStatus;
  source: AgentRunReceiptSource;
  targetAgentId?: string;
  requested?: {
    model?: string;
  };
  resolved: AgentRunReceiptRuntimeRef;
  final?: Omit<AgentRunReceiptRuntimeRef, "workspace">;
  attemptsSummary?: AgentRunReceiptAttemptsSummary;
  fallback: {
    used: boolean;
    reason?: string;
  };
};

export function formatRunReceiptModelRef(params: {
  provider?: string;
  model?: string;
}): string | undefined {
  const provider = normalizeOptionalString(params.provider);
  const model = normalizeOptionalString(params.model);
  if (!model) {
    return undefined;
  }
  if (!provider || model.startsWith(`${provider}/`)) {
    return model;
  }
  return `${provider}/${model}`;
}

export function createResolvedAgentRunReceipt(params: {
  source: AgentRunReceiptSource;
  targetAgentId?: string;
  requestedProvider?: string;
  requestedModel?: string;
  resolvedProvider?: string;
  resolvedModel: string;
  runtime?: AgentRunReceiptRuntimeRef["runtime"];
  workspace?: string;
  contextMode?: string;
}): AgentRunReceipt {
  const requestedModel = formatRunReceiptModelRef({
    provider: params.requestedProvider,
    model: params.requestedModel,
  });
  const resolvedModel =
    formatRunReceiptModelRef({
      provider: params.resolvedProvider,
      model: params.resolvedModel,
    }) ?? params.resolvedModel;
  return {
    phase: "resolved",
    source: params.source,
    ...(normalizeOptionalString(params.targetAgentId)
      ? { targetAgentId: normalizeOptionalString(params.targetAgentId) }
      : {}),
    ...(requestedModel ? { requested: { model: requestedModel } } : {}),
    resolved: {
      model: resolvedModel,
      runtime: params.runtime ?? "openclaw",
      ...(normalizeOptionalString(params.workspace)
        ? { workspace: normalizeOptionalString(params.workspace) }
        : {}),
      ...(normalizeOptionalString(params.contextMode)
        ? { contextMode: normalizeOptionalString(params.contextMode) }
        : {}),
    },
    fallback: {
      used: false,
    },
  };
}

export function finalizeAgentRunReceipt(
  receipt: AgentRunReceipt,
  params: {
    finalProvider?: string;
    finalModel?: string;
    runtime?: AgentRunReceiptRuntimeRef["runtime"];
    contextMode?: string;
    terminalStatus?: AgentRunReceiptTerminalStatus;
    fallbackReason?: string | null;
  },
): AgentRunReceipt {
  const finalModel =
    formatRunReceiptModelRef({
      provider: params.finalProvider,
      model: params.finalModel,
    }) ?? receipt.resolved.model;
  const fallbackReason = normalizeOptionalString(params.fallbackReason);
  const fallbackUsed = Boolean(fallbackReason) || finalModel !== receipt.resolved.model;
  return {
    ...receipt,
    phase: "finalized",
    ...(params.terminalStatus ? { terminalStatus: params.terminalStatus } : {}),
    final: {
      model: finalModel,
      runtime: params.runtime ?? receipt.resolved.runtime,
      ...(normalizeOptionalString(params.contextMode)
        ? { contextMode: normalizeOptionalString(params.contextMode) }
        : receipt.resolved.contextMode
          ? { contextMode: receipt.resolved.contextMode }
          : {}),
    },
    fallback: {
      used: fallbackUsed,
      ...(fallbackUsed ? { reason: fallbackReason ?? "final_model_differs_from_resolved" } : {}),
    },
  };
}

function parseReceiptRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function parseReceiptRuntimeRef(value: unknown): AgentRunReceiptRuntimeRef | undefined {
  const record = parseReceiptRecord(value);
  const model = normalizeOptionalString(record?.model);
  const runtime = normalizeOptionalString(record?.runtime);
  if (!model || (runtime !== "openclaw" && runtime !== "codex" && runtime !== "unknown")) {
    return undefined;
  }
  return {
    model,
    runtime,
    ...(normalizeOptionalString(record?.workspace)
      ? { workspace: normalizeOptionalString(record?.workspace) }
      : {}),
    ...(normalizeOptionalString(record?.contextMode)
      ? { contextMode: normalizeOptionalString(record?.contextMode) }
      : {}),
  };
}

function parseReceiptTerminalStatus(value: unknown): AgentRunReceiptTerminalStatus | undefined {
  return value === "succeeded" ||
    value === "failed" ||
    value === "timed_out" ||
    value === "cancelled"
    ? value
    : undefined;
}

function parseReceiptRequested(value: unknown): AgentRunReceipt["requested"] | undefined {
  const record = parseReceiptRecord(value);
  const model = normalizeOptionalString(record?.model);
  return model ? { model } : undefined;
}

function parseReceiptAttemptsSummary(value: unknown): AgentRunReceiptAttemptsSummary | undefined {
  const record = parseReceiptRecord(value);
  const count = typeof record?.count === "number" && record.count >= 0 ? record.count : undefined;
  if (count === undefined) {
    return undefined;
  }
  const finalAttempt =
    typeof record?.finalAttempt === "number" && record.finalAttempt >= 0
      ? record.finalAttempt
      : undefined;
  return {
    count,
    ...(finalAttempt !== undefined ? { finalAttempt } : {}),
  };
}

export function parseAgentRunReceiptJson(
  value: string | null | undefined,
): AgentRunReceipt | undefined {
  if (!value) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }
  const record = parseReceiptRecord(parsed);
  if (!record || (record.phase !== "resolved" && record.phase !== "finalized")) {
    return undefined;
  }
  const sourceRecord = parseReceiptRecord(record.source);
  const sourceKind = normalizeOptionalString(sourceRecord?.kind);
  if (
    sourceKind !== "chat" &&
    sourceKind !== "gateway" &&
    sourceKind !== "plugin" &&
    sourceKind !== "subagent" &&
    sourceKind !== "taskflow" &&
    sourceKind !== "lobster" &&
    sourceKind !== "codex" &&
    sourceKind !== "unknown"
  ) {
    return undefined;
  }
  const resolved = parseReceiptRuntimeRef(record.resolved);
  if (!resolved) {
    return undefined;
  }
  const final = parseReceiptRuntimeRef(record.final);
  const requested = parseReceiptRequested(record.requested);
  const attemptsSummary = parseReceiptAttemptsSummary(record.attemptsSummary);
  const fallbackRecord = parseReceiptRecord(record.fallback);
  const fallbackUsed = fallbackRecord?.used === true;
  return {
    phase: record.phase,
    ...(parseReceiptTerminalStatus(record.terminalStatus)
      ? { terminalStatus: parseReceiptTerminalStatus(record.terminalStatus) }
      : {}),
    source: {
      kind: sourceKind,
      ...(normalizeOptionalString(sourceRecord?.id)
        ? { id: normalizeOptionalString(sourceRecord?.id) }
        : {}),
      ...(normalizeOptionalString(sourceRecord?.hook)
        ? { hook: normalizeOptionalString(sourceRecord?.hook) }
        : {}),
    },
    ...(normalizeOptionalString(record.targetAgentId)
      ? { targetAgentId: normalizeOptionalString(record.targetAgentId) }
      : {}),
    ...(requested ? { requested } : {}),
    resolved,
    ...(final ? { final } : {}),
    ...(attemptsSummary ? { attemptsSummary } : {}),
    fallback: {
      used: fallbackUsed,
      ...(fallbackUsed && normalizeOptionalString(fallbackRecord?.reason)
        ? { reason: normalizeOptionalString(fallbackRecord?.reason) }
        : {}),
    },
  };
}
