import {
  resolveCodexAppServerRuntimeOptions,
  type CodexAppServerRuntimeOptions,
} from "../../../codex/src/app-server/config.ts";
import {
  type CodexServerNotification,
  type CodexThreadItem,
  type CodexThreadStartResponse,
  type CodexTurn,
  type CodexTurnStartResponse,
} from "../../../codex/src/app-server/protocol.ts";
import { getSharedCodexAppServerClient } from "../../../codex/src/app-server/shared-client.ts";
import type {
  JsonModelExecutionRequest,
  JsonModelExecutionResponse,
  JsonModelExecutor,
} from "../model-execution.ts";

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const MODEL_MEMORY_REQUEST_TIMEOUT_ENV = "MODEL_MEMORY_REQUEST_TIMEOUT_MS";

type ParsedModelRef = {
  provider: string;
  model: string;
};

type AssistantCaptureState = {
  assistantTextByItem: Map<string, string>;
  assistantItemOrder: string[];
};

export type CodexAppServerJsonExecutorOptions = {
  cwd?: string;
  requestTimeoutMs?: number;
};

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function resolveRequestTimeoutMs(
  explicitTimeoutMs: number | undefined,
  runtimeTimeoutMs: number,
): number {
  if (explicitTimeoutMs !== undefined) {
    return explicitTimeoutMs;
  }

  const envValue = readTrimmedString(process.env[MODEL_MEMORY_REQUEST_TIMEOUT_ENV]);
  if (envValue) {
    const parsed = Number.parseInt(envValue, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return Math.max(runtimeTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
}

function parseCodexModelRef(modelId: string): ParsedModelRef {
  const trimmed = modelId.trim();
  if (!trimmed) {
    throw new Error("missing model id for codex app-server execution");
  }
  const slashIndex = trimmed.indexOf("/");
  if (slashIndex === -1) {
    return {
      provider: "codex",
      model: trimmed,
    };
  }
  const provider = trimmed.slice(0, slashIndex).trim();
  const model = trimmed.slice(slashIndex + 1).trim();
  if (!provider || !model) {
    throw new Error(`invalid codex model ref: ${modelId}`);
  }
  if (provider !== "codex" && provider !== "openai-codex") {
    throw new Error(
      `codex app-server executor only supports codex or openai-codex model refs, received "${modelId}"`,
    );
  }
  return { provider, model };
}

function buildResolvedModelId(
  parsed: ParsedModelRef,
  resolvedModel: string | null | undefined,
): string {
  return `${parsed.provider}/${(resolvedModel ?? parsed.model).trim()}`;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  return typeof record[key] === "string" ? record[key] : undefined;
}

function readItem(value: unknown): CodexThreadItem | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as CodexThreadItem;
}

function rememberAssistantItem(state: AssistantCaptureState, itemId: string): void {
  if (!state.assistantItemOrder.includes(itemId)) {
    state.assistantItemOrder.push(itemId);
  }
}

function captureAssistantDelta(
  state: AssistantCaptureState,
  params: Record<string, unknown>,
): void {
  const itemId = readString(params, "itemId") ?? readString(params, "id") ?? "assistant";
  const delta = readString(params, "delta") ?? "";
  if (!delta) {
    return;
  }
  rememberAssistantItem(state, itemId);
  state.assistantTextByItem.set(itemId, `${state.assistantTextByItem.get(itemId) ?? ""}${delta}`);
}

function captureCompletedItem(state: AssistantCaptureState, params: Record<string, unknown>): void {
  const item = readItem(params.item);
  if (item?.type === "agentMessage" && typeof item.text === "string" && item.text) {
    rememberAssistantItem(state, item.id);
    state.assistantTextByItem.set(item.id, item.text);
  }
}

function captureTurnItems(state: AssistantCaptureState, turn: CodexTurn): void {
  for (const item of turn.items ?? []) {
    if (item.type === "agentMessage" && typeof item.text === "string" && item.text) {
      rememberAssistantItem(state, item.id);
      state.assistantTextByItem.set(item.id, item.text);
    }
  }
}

function readCompletedTurn(
  notification: CodexServerNotification,
  threadId: string,
  turnId: string,
): CodexTurn | null {
  if (notification.method !== "turn/completed") {
    return null;
  }
  const params = notification.params;
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return null;
  }
  const candidateThreadId = readString(params, "threadId") ?? null;
  const turn =
    "turn" in params &&
    params.turn &&
    typeof params.turn === "object" &&
    !Array.isArray(params.turn)
      ? (params.turn as CodexTurn)
      : null;
  const candidateTurnId =
    readString(params, "turnId") ?? (turn && typeof turn.id === "string" ? turn.id : null);
  if (candidateThreadId !== threadId || candidateTurnId !== turnId || !turn) {
    return null;
  }
  return turn;
}

function notificationMatchesTurn(
  notification: CodexServerNotification,
  threadId: string,
  turnId: string,
): Record<string, unknown> | null {
  const params = notification.params;
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return null;
  }
  const candidateThreadId = readString(params, "threadId") ?? null;
  const candidateTurnId = readString(params, "turnId") ?? null;
  if (candidateThreadId !== threadId || candidateTurnId !== turnId) {
    return null;
  }
  return params as Record<string, unknown>;
}

function captureAssistantNotification(
  state: AssistantCaptureState,
  notification: CodexServerNotification,
  threadId: string,
  turnId: string,
): void {
  if (notification.method === "turn/completed") {
    const turn = readCompletedTurn(notification, threadId, turnId);
    if (turn) {
      captureTurnItems(state, turn);
    }
    return;
  }

  const params = notificationMatchesTurn(notification, threadId, turnId);
  if (!params) {
    return;
  }

  if (notification.method === "item/agentMessage/delta") {
    captureAssistantDelta(state, params);
  }
  if (notification.method === "item/completed") {
    captureCompletedItem(state, params);
  }
}

function extractAssistantText(turn: CodexTurn, state: AssistantCaptureState): string {
  captureTurnItems(state, turn);
  for (const itemId of [...state.assistantItemOrder].toReversed()) {
    const text = state.assistantTextByItem.get(itemId)?.trim();
    if (text) {
      return text;
    }
  }
  if (turn.error?.message) {
    throw new Error(turn.error.message);
  }
  throw new Error("codex app-server turn completed without assistant text");
}

async function waitForCompletedTurn(input: {
  client: Awaited<ReturnType<typeof getSharedCodexAppServerClient>>;
  runtime: CodexAppServerRuntimeOptions;
  requestTimeoutMs: number;
  threadId: string;
  model: string;
  cwd: string;
  userPrompt: string;
}): Promise<{ turn: CodexTurn; assistantState: AssistantCaptureState }> {
  const pendingNotifications: CodexServerNotification[] = [];
  const assistantState: AssistantCaptureState = {
    assistantTextByItem: new Map(),
    assistantItemOrder: [],
  };
  let currentTurnId: string | null = null;
  let settled = false;
  let resolveCompletion:
    | ((result: { turn: CodexTurn; assistantState: AssistantCaptureState }) => void)
    | undefined;
  let rejectCompletion: ((error: Error) => void) | undefined;
  const completion = new Promise<{ turn: CodexTurn; assistantState: AssistantCaptureState }>(
    (resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    },
  );

  const settleTurn = (turn: CodexTurn) => {
    if (settled) {
      return;
    }
    settled = true;
    resolveCompletion?.({ turn, assistantState });
  };

  const settleError = (error: Error) => {
    if (settled) {
      return;
    }
    settled = true;
    rejectCompletion?.(error);
  };

  const removeNotificationHandler = input.client.addNotificationHandler((notification) => {
    if (settled) {
      return;
    }
    if (!currentTurnId) {
      pendingNotifications.push(notification);
      return;
    }
    captureAssistantNotification(assistantState, notification, input.threadId, currentTurnId);
    const completedTurn = readCompletedTurn(notification, input.threadId, currentTurnId);
    if (completedTurn) {
      settleTurn(completedTurn);
    }
  });

  const timeout = setTimeout(
    () => {
      settleError(new Error("codex app-server turn completion timed out"));
    },
    Math.max(100, input.requestTimeoutMs),
  );
  timeout.unref?.();

  try {
    const started = await input.client.request<CodexTurnStartResponse>(
      "turn/start",
      {
        threadId: input.threadId,
        input: [{ type: "text", text: input.userPrompt }],
        cwd: input.cwd,
        approvalPolicy: input.runtime.approvalPolicy,
        approvalsReviewer: input.runtime.approvalsReviewer,
        model: input.model,
        ...(input.runtime.serviceTier ? { serviceTier: input.runtime.serviceTier } : {}),
      },
      { timeoutMs: input.requestTimeoutMs },
    );

    currentTurnId = started.turn.id;
    if (
      started.turn.status === "completed" ||
      started.turn.status === "failed" ||
      started.turn.status === "interrupted"
    ) {
      settleTurn(started.turn);
    } else {
      for (const notification of pendingNotifications.splice(0)) {
        captureAssistantNotification(assistantState, notification, input.threadId, currentTurnId);
        const completedTurn = readCompletedTurn(notification, input.threadId, currentTurnId);
        if (completedTurn) {
          settleTurn(completedTurn);
          break;
        }
      }
    }

    return await completion;
  } finally {
    clearTimeout(timeout);
    removeNotificationHandler();
  }
}

export class CodexAppServerJsonExecutor implements JsonModelExecutor {
  private readonly runtime: CodexAppServerRuntimeOptions;
  private readonly requestTimeoutMs: number;
  private readonly cwd: string;

  constructor(options: CodexAppServerJsonExecutorOptions = {}) {
    this.runtime = resolveCodexAppServerRuntimeOptions();
    this.requestTimeoutMs = resolveRequestTimeoutMs(
      options.requestTimeoutMs,
      this.runtime.requestTimeoutMs,
    );
    this.cwd = options.cwd ?? process.cwd();
  }

  async execute(request: JsonModelExecutionRequest): Promise<JsonModelExecutionResponse> {
    const parsedModel = parseCodexModelRef(request.contract.modelId);
    const client = await getSharedCodexAppServerClient({
      startOptions: this.runtime.start,
      timeoutMs: this.requestTimeoutMs,
    });
    const threadStarted = await client.request<CodexThreadStartResponse>(
      "thread/start",
      {
        model: parsedModel.model,
        modelProvider: "openai",
        cwd: this.cwd,
        approvalPolicy: this.runtime.approvalPolicy,
        approvalsReviewer: this.runtime.approvalsReviewer,
        sandbox: this.runtime.sandbox,
        ...(this.runtime.serviceTier ? { serviceTier: this.runtime.serviceTier } : {}),
        serviceName: "OpenClaw MMV2",
        developerInstructions: request.systemPrompt,
        ephemeral: true,
        dynamicTools: [],
        experimentalRawEvents: true,
        persistExtendedHistory: false,
      },
      { timeoutMs: this.requestTimeoutMs },
    );
    const completed = await waitForCompletedTurn({
      client,
      runtime: this.runtime,
      requestTimeoutMs: this.requestTimeoutMs,
      threadId: threadStarted.thread.id,
      model: parsedModel.model,
      cwd: this.cwd,
      userPrompt: request.userPrompt,
    });

    if (completed.turn.status === "failed") {
      throw new Error(completed.turn.error?.message ?? "codex app-server turn failed");
    }
    if (completed.turn.status === "interrupted") {
      throw new Error("codex app-server turn was interrupted");
    }

    return {
      outputText: extractAssistantText(completed.turn, completed.assistantState),
      resolvedModelId: buildResolvedModelId(parsedModel, threadStarted.model),
    };
  }
}
