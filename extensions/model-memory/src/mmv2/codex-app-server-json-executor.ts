import {
  clearSharedCodexAppServerClient,
  resolveCodexAppServerRuntimeOptions,
  type CodexAppServerRuntimeOptions,
  type CodexDynamicToolSpec,
  type CodexDynamicToolCallParams,
  type JsonValue,
  type CodexServerNotification,
  type CodexThreadItem,
  type CodexThreadStartResponse,
  type CodexTurn,
  type CodexTurnStartResponse,
  getSharedCodexAppServerClient,
} from "../../../codex/runtime-api.ts";
import type {
  JsonModelExecutionRequest,
  JsonModelExecutionResponse,
  JsonModelExecutor,
  JsonModelReasoningEffort,
  JsonModelToolTurnExecutionRequest,
  JsonModelToolTurnExecutionResponse,
} from "../model-execution.ts";

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const MODEL_MEMORY_REQUEST_TIMEOUT_ENV = "MODEL_MEMORY_REQUEST_TIMEOUT_MS";
const MODEL_MEMORY_CODEX_REASONING_EFFORT_ENV = "MODEL_MEMORY_CODEX_REASONING_EFFORT";

type ParsedModelRef = {
  provider: string;
  model: string;
};

type AssistantCaptureState = {
  assistantTextByItem: Map<string, string>;
  assistantItemOrder: string[];
};

type CapturedDynamicToolCall = {
  toolName: string;
  toolArguments: unknown;
  callId: string;
};

export type CodexAppServerJsonExecutorOptions = {
  cwd?: string;
  requestTimeoutMs?: number;
  serviceTier?: string;
  reasoningEffort?: JsonModelReasoningEffort;
};

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function resolveCodexReasoningEffort(
  requested: JsonModelReasoningEffort | undefined,
): "minimal" | "low" | "medium" | "high" | "xhigh" | undefined {
  if (
    requested === "minimal" ||
    requested === "low" ||
    requested === "medium" ||
    requested === "high" ||
    requested === "xhigh"
  ) {
    return requested;
  }
  return undefined;
}

function readReasoningEffort(value: unknown): JsonModelReasoningEffort | undefined {
  return value === "none" ||
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh"
    ? value
    : undefined;
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

function readDynamicToolCallParams(value: unknown): CodexDynamicToolCallParams | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const threadId = readString(record, "threadId");
  const turnId = readString(record, "turnId");
  const callId = readString(record, "callId");
  const tool = readString(record, "tool");
  if (!threadId || !turnId || !callId || !tool) {
    return null;
  }
  return {
    threadId,
    turnId,
    callId,
    tool,
    arguments: record.arguments as CodexDynamicToolCallParams["arguments"],
  };
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

function buildCodexDeveloperInstructions(request: JsonModelExecutionRequest): string {
  const transport = request.responseOptions?.transport;
  const schemaInstruction =
    transport?.type === "json_schema"
      ? [
          "Structured output contract:",
          `- contract: ${request.contract.contractName}/${request.contract.contractVersion}`,
          `- schema name: ${transport.name}`,
          `- strict: ${transport.strict ?? true}`,
          "Return exactly one JSON object matching this JSON Schema. Do not wrap the JSON in markdown.",
          JSON.stringify(transport.schema),
        ].join("\n")
      : [
          "Structured output contract:",
          `- contract: ${request.contract.contractName}/${request.contract.contractVersion}`,
          "Return exactly one compact JSON object. Do not wrap the JSON in markdown.",
        ].join("\n");

  return [request.systemPrompt, schemaInstruction].filter((section) => section.trim()).join("\n\n");
}

function buildCodexToolDeveloperInstructions(request: JsonModelToolTurnExecutionRequest): string {
  const allowedToolNames = request.allowedToolNames ?? request.tools.map((tool) => tool.name);
  const requiredToolName = request.requiredToolName ?? null;
  const maxAcceptedToolCalls =
    "maxAcceptedToolCalls" in request && typeof request.maxAcceptedToolCalls === "number"
      ? request.maxAcceptedToolCalls
      : 1;
  return [
    request.systemPrompt,
    "Tool execution contract:",
    `- contract: ${request.contract.contractName}/${request.contract.contractVersion}`,
    requiredToolName
      ? `- required tool: ${requiredToolName}`
      : `- allowed tools: ${allowedToolNames.join(", ")}`,
    maxAcceptedToolCalls <= 1
      ? requiredToolName
        ? "- Call exactly the required dynamic tool with arguments matching its input schema."
        : "- Call exactly one allowed dynamic tool with arguments matching its input schema."
      : `- Call one or more allowed dynamic tools as needed for this phase, up to ${maxAcceptedToolCalls} accepted calls.`,
    "- Do not answer with prose or a JSON draft instead of calling the tool.",
    "- If the requested action is impossible, call an allowed typed blocker/action tool permitted by the tool schema.",
  ]
    .filter((section) => section.trim())
    .join("\n\n");
}

function buildCodexDynamicTools(
  request: JsonModelToolTurnExecutionRequest,
): CodexDynamicToolSpec[] {
  return request.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema as JsonValue,
  }));
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
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
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
      input.client.close();
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
        ...(input.reasoningEffort ? { effort: input.reasoningEffort } : {}),
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
  private readonly defaultReasoningEffort?: JsonModelReasoningEffort;

  constructor(options: CodexAppServerJsonExecutorOptions = {}) {
    const runtime = resolveCodexAppServerRuntimeOptions();
    this.runtime = {
      ...runtime,
      ...(readTrimmedString(options.serviceTier) ? { serviceTier: options.serviceTier } : {}),
    };
    this.requestTimeoutMs = resolveRequestTimeoutMs(
      options.requestTimeoutMs,
      this.runtime.requestTimeoutMs,
    );
    this.cwd = options.cwd ?? process.cwd();
    this.defaultReasoningEffort =
      options.reasoningEffort ??
      readReasoningEffort(process.env[MODEL_MEMORY_CODEX_REASONING_EFFORT_ENV]);
  }

  close(): void {
    clearSharedCodexAppServerClient();
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
        developerInstructions: buildCodexDeveloperInstructions(request),
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
      reasoningEffort: resolveCodexReasoningEffort(
        request.responseOptions?.reasoningEffort ?? this.defaultReasoningEffort,
      ),
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

  async executeTools(
    request: JsonModelToolTurnExecutionRequest,
  ): Promise<JsonModelToolTurnExecutionResponse> {
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
        developerInstructions: buildCodexToolDeveloperInstructions(request),
        ephemeral: true,
        dynamicTools: buildCodexDynamicTools(request),
        experimentalRawEvents: true,
        persistExtendedHistory: false,
      },
      { timeoutMs: this.requestTimeoutMs },
    );
    const capturedToolCalls: CapturedDynamicToolCall[] = [];
    const maxAcceptedToolCalls = Math.max(1, Math.min(64, request.maxAcceptedToolCalls ?? 1));
    const requestCleanup = client.addRequestHandler((rpcRequest) => {
      if (rpcRequest.method !== "item/tool/call") {
        return undefined;
      }
      const call = readDynamicToolCallParams(rpcRequest.params);
      if (!call || call.threadId !== threadStarted.thread.id) {
        return undefined;
      }
      const allowedToolNames = new Set(
        request.allowedToolNames ?? request.tools.map((tool) => tool.name),
      );
      const success =
        (request.requiredToolName ? call.tool === request.requiredToolName : true) &&
        allowedToolNames.has(call.tool) &&
        capturedToolCalls.length < maxAcceptedToolCalls;
      const rejectedBecauseSurplus = capturedToolCalls.length >= maxAcceptedToolCalls;
      if (success) {
        capturedToolCalls.push({
          toolName: call.tool,
          toolArguments: call.arguments ?? {},
          callId: call.callId,
        });
      }
      return {
        success,
        contentItems: [
          {
            type: "inputText",
            text: success
              ? `Captured ${call.tool} tool call ${call.callId}.`
              : rejectedBecauseSurplus
                ? `Rejected surplus tool ${call.tool}; maximum accepted calls for this phase is ${maxAcceptedToolCalls}.`
                : `Rejected unexpected tool ${call.tool}; allowed ${[...allowedToolNames].join(", ")}.`,
          },
        ],
      };
    });
    try {
      const completed = await waitForCompletedTurn({
        client,
        runtime: this.runtime,
        requestTimeoutMs: this.requestTimeoutMs,
        threadId: threadStarted.thread.id,
        model: parsedModel.model,
        cwd: this.cwd,
        userPrompt: request.userPrompt,
        reasoningEffort: resolveCodexReasoningEffort(
          request.responseOptions?.reasoningEffort ?? this.defaultReasoningEffort,
        ),
      });
      if (completed.turn.status === "failed") {
        throw new Error(completed.turn.error?.message ?? "codex app-server tool turn failed");
      }
      if (completed.turn.status === "interrupted") {
        throw new Error("codex app-server tool turn was interrupted");
      }
      if (capturedToolCalls.length === 0) {
        throw new Error("codex app-server completed without required dynamic tool call");
      }
      return {
        toolCalls: capturedToolCalls.map((call) => ({
          toolName: call.toolName,
          toolArguments: call.toolArguments,
          callId: call.callId,
        })),
        outputText: JSON.stringify({
          toolCalls: capturedToolCalls.map((call) => ({
            toolName: call.toolName,
            toolArguments: call.toolArguments,
            callId: call.callId,
          })),
        }),
        resolvedModelId: buildResolvedModelId(parsedModel, threadStarted.model),
      };
    } finally {
      requestCleanup();
    }
  }
}
