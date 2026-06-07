import { createHash } from "node:crypto";
import type {
  DynamicCodingTeamModelCallProgressEvent,
  DynamicCodingTeamModelClient,
  DynamicCodingTeamToolTurnResult,
} from "../codex-bridge/dynamic-coding-team-orchestrator.ts";
import type { ModelTaskClass } from "../model-tasks/model-task-classification.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { SchedulerModelCallEnvelopeBase } from "./scheduler-model-call-envelope.ts";

export type ModelToolTurnOwner = "router" | "intake" | "scheduler" | "node_lifecycle";

export type ModelToolTurnTransportRequirement =
  | "native_single_tool"
  | "native_multi_tool_turn"
  | "parallel_native_tool_sessions"
  | "long_lived_worker_tools";

export type ModelToolTurnParallelismPolicy =
  | "single_turn_multi_tool"
  | "parallel_focused_sessions"
  | "sequential_repair";

export type ModelToolTurnProviderPath = "openrouter" | "codex_app_server";

export type ModelToolTurnToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonValue;
};

export type ModelToolTurnRequest = {
  owner: ModelToolTurnOwner;
  phaseId: string;
  modelRef: string;
  providerPath: string;
  systemPrompt: string;
  userPayload: JsonValue;
  providerMessages?: JsonValue[] | null;
  tools: ModelToolTurnToolDefinition[];
  allowedToolNames: string[];
  requiredToolName?: string | null;
  requiredTransport: ModelToolTurnTransportRequirement;
  parallelismPolicy: ModelToolTurnParallelismPolicy;
  maxAcceptedToolCalls: number;
  maxOutputTokens: number;
  timeoutMs: number;
  maxAttempts?: number;
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  taskClass?: ModelTaskClass;
  modelTaskCallSite: string;
  telemetryBudget?: {
    inlineToolCallNameLimit?: number;
    inlineRejectedCallLimit?: number;
  };
  progress?: {
    spanId?: string;
    objectiveSummary?: string | null;
    reasonCodes?: string[];
    schedulerEnvelope?: SchedulerModelCallEnvelopeBase | null;
    onEvent?: (event: DynamicCodingTeamModelCallProgressEvent) => void | Promise<void>;
  };
};

export type ModelTextTurnRequest = {
  owner: ModelToolTurnOwner;
  phaseId: string;
  resultMode: "text";
  modelRef: string;
  providerPath: string;
  systemPrompt: string;
  userPayload: JsonValue;
  providerMessages?: JsonValue[] | null;
  maxOutputTokens: number;
  timeoutMs: number;
  maxAttempts?: number;
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  taskClass?: ModelTaskClass;
  modelTaskCallSite: string;
  progress?: {
    spanId?: string;
    objectiveSummary?: string | null;
    reasonCodes?: string[];
    schedulerEnvelope?: SchedulerModelCallEnvelopeBase | null;
    onEvent?: (event: DynamicCodingTeamModelCallProgressEvent) => void | Promise<void>;
  };
};

export type ModelToolTurnResult = {
  resultMode: "tools";
  status: "completed";
  acceptedToolCalls: Array<{
    toolName: string;
    toolArguments: unknown;
    callId: string | null;
  }>;
  rejectedToolCalls: Array<{
    toolName: string;
    reason: string;
    callId: string | null;
  }>;
  omittedToolCallCount: number;
  providerDiagnostics: JsonValue;
  modelRunRef: string;
  responseHash: string;
  latencyMs: number;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ModelTextTurnResult = {
  resultMode: "text";
  status: "completed";
  text: string;
  providerDiagnostics: JsonValue;
  modelRunRef: string;
  responseHash: string;
  latencyMs: number;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ModelTurnRequest =
  | (ModelToolTurnRequest & { resultMode?: "tools" })
  | ModelTextTurnRequest;

export type ModelTurnResult = ModelToolTurnResult | ModelTextTurnResult;

export type DynamicCodingTeamTextTurnResult = {
  modelRunRef: string;
  responseText: string | null;
  responseHash: string;
  latencyMs: number;
  providerDiagnostics?: JsonValue | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored?: false;
};

export type ProviderToolTurnModelClient = Pick<
  DynamicCodingTeamModelClient,
  "executeProviderToolTurn"
>;

export type ProviderTextTurnModelClient = {
  executeProviderTextTurn?(
    input: Omit<ModelTextTurnRequest, "resultMode">,
  ): Promise<DynamicCodingTeamTextTurnResult>;
};

export type ProviderModelTurnClient = Partial<ProviderToolTurnModelClient> &
  ProviderTextTurnModelClient;

export class ModelTextTurnEmptyResponseError extends Error {
  readonly owner: ModelToolTurnOwner;
  readonly phaseId: string;
  readonly modelRef: string;
  readonly providerPath: string;
  readonly modelRunRef: string;
  readonly responseHash: string;
  readonly latencyMs: number;
  readonly providerDiagnostics: JsonValue | null;
  readonly rawPromptStored = false;
  readonly rawResponseStored = false;
  readonly rawProviderLogStored = false;

  constructor(input: { request: ModelTextTurnRequest; response: DynamicCodingTeamTextTurnResult }) {
    super(`model_text_turn_empty_response:${input.request.owner}:${input.request.phaseId}`);
    this.name = "ModelTextTurnEmptyResponseError";
    this.owner = input.request.owner;
    this.phaseId = input.request.phaseId;
    this.modelRef = input.request.modelRef;
    this.providerPath = input.request.providerPath;
    this.modelRunRef = input.response.modelRunRef;
    this.responseHash = input.response.responseHash;
    this.latencyMs = input.response.latencyMs;
    this.providerDiagnostics = input.response.providerDiagnostics ?? null;
  }
}

export type ProviderToolCallableClient = {
  callRole?(input: {
    roleId: string;
    modelId: string;
    modelCandidateId: string;
    prompt: string;
    responseFormat?: "json_object";
    requestProfileOverride?: {
      responseFormatMode?: "native" | "prompt_only" | "auto";
      reasoningMode?: "exclude" | "omit" | "none";
      reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
      maxTokens?: number;
    };
    maxTokens?: number;
    timeoutMs?: number;
    maxAttempts?: number;
    reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
    taskClass?: ModelTaskClass;
    modelTaskCallSite?: string;
  }): Promise<{
    status?: string;
    responseText?: string | null;
    responseHash?: string | null;
    errorReasonCode?: string | null;
    httpStatus?: number | null;
    providerResponseDiagnostics?: JsonValue | null;
  }>;
  callTools(input: {
    roleId: string;
    modelId: string;
    modelCandidateId: string;
    prompt: string;
    tools: ModelToolTurnToolDefinition[];
    allowedToolNames: string[];
    requiredToolName?: string | null;
    maxAcceptedToolCalls?: number | null;
    maxTokens?: number;
    timeoutMs?: number;
    maxAttempts?: number;
    reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
    taskClass?: ModelTaskClass;
    modelTaskCallSite?: string;
  }): Promise<{
    status?: string;
    responseHash?: string | null;
    toolCalls?: DynamicCodingTeamToolTurnResult["toolCalls"] | null;
    errorReasonCode?: string | null;
    httpStatus?: number | null;
    providerResponseDiagnostics?: JsonValue | null;
  }>;
};

type OpenRouterToolCall = {
  id?: string | null;
  type?: string | null;
  function?: {
    name?: string | null;
    arguments?: unknown;
  } | null;
};

function readOpenRouterToolCalls(message: unknown): DynamicCodingTeamToolTurnResult["toolCalls"] {
  const record =
    message && typeof message === "object" && !Array.isArray(message)
      ? (message as Record<string, unknown>)
      : {};
  const rawToolCalls = Array.isArray(record.tool_calls) ? record.tool_calls : [];
  return rawToolCalls.flatMap((rawCall, index) => {
    if (!rawCall || typeof rawCall !== "object" || Array.isArray(rawCall)) {
      return [];
    }
    const call = rawCall as OpenRouterToolCall;
    const functionRecord =
      call.function && typeof call.function === "object" && !Array.isArray(call.function)
        ? call.function
        : {};
    const toolName =
      typeof functionRecord.name === "string" && functionRecord.name.trim()
        ? functionRecord.name.trim()
        : null;
    if (!toolName) {
      return [];
    }
    const rawArguments = functionRecord.arguments;
    let toolArguments: unknown = {};
    if (typeof rawArguments === "string" && rawArguments.trim()) {
      try {
        toolArguments = JSON.parse(rawArguments);
      } catch {
        toolArguments = { rawArguments };
      }
    } else if (rawArguments && typeof rawArguments === "object" && !Array.isArray(rawArguments)) {
      toolArguments = rawArguments;
    }
    return [
      {
        toolName,
        toolArguments,
        callId:
          typeof call.id === "string" && call.id.trim()
            ? call.id.trim()
            : `openrouter-tool-${index + 1}`,
      },
    ];
  });
}

function openRouterReasoningFor(
  effort: ModelToolTurnRequest["reasoningEffort"],
): JsonValue | undefined {
  if (!effort) {
    return undefined;
  }
  if (effort === "none") {
    return { effort: "none", exclude: true };
  }
  return { effort, exclude: false };
}

function openRouterProviderMessages(request: {
  systemPrompt: string;
  userPayload: JsonValue;
  providerMessages?: JsonValue[] | null;
}): JsonValue[] {
  if (Array.isArray(request.providerMessages) && request.providerMessages.length > 0) {
    return request.providerMessages;
  }
  return [
    { role: "system", content: request.systemPrompt },
    {
      role: "user",
      content: [
        "User payload JSON:",
        JSON.stringify(request.userPayload, null, 2),
        "Call one or more provided tools. Do not answer with prose or JSON outside provider tool calls.",
      ].join("\n\n"),
    },
  ];
}

function openRouterTextProviderMessages(request: {
  systemPrompt: string;
  userPayload: JsonValue;
  providerMessages?: JsonValue[] | null;
}): JsonValue[] {
  if (Array.isArray(request.providerMessages) && request.providerMessages.length > 0) {
    return request.providerMessages;
  }
  return [
    { role: "system", content: request.systemPrompt },
    {
      role: "user",
      content: [
        "User payload JSON:",
        JSON.stringify(request.userPayload, null, 2),
        "Return only the requested prose text. Do not wrap it in JSON and do not call tools.",
      ].join("\n\n"),
    },
  ];
}

export function buildOpenRouterProviderToolTurnBody(request: {
  modelRef: string;
  systemPrompt: string;
  userPayload: JsonValue;
  providerMessages?: JsonValue[] | null;
  tools: ModelToolTurnToolDefinition[];
  requiredToolName?: string | null;
  maxAcceptedToolCalls?: number | null;
  maxOutputTokens: number;
  reasoningEffort?: ModelToolTurnRequest["reasoningEffort"];
}): JsonValue {
  const body: Record<string, JsonValue> = {
    model: request.modelRef,
    messages: openRouterProviderMessages(request),
    temperature: 0,
    max_tokens: request.maxOutputTokens,
    tools: request.tools.map(
      (tool): JsonValue => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }),
    ),
    tool_choice: request.requiredToolName
      ? { type: "function", function: { name: request.requiredToolName } }
      : "required",
    parallel_tool_calls: (request.maxAcceptedToolCalls ?? 1) > 1,
  };
  const reasoning = openRouterReasoningFor(request.reasoningEffort);
  if (reasoning !== undefined) {
    body.reasoning = reasoning;
  }
  return body;
}

export function buildOpenRouterProviderTextTurnBody(request: {
  modelRef: string;
  systemPrompt: string;
  userPayload: JsonValue;
  providerMessages?: JsonValue[] | null;
  maxOutputTokens: number;
  reasoningEffort?: ModelTextTurnRequest["reasoningEffort"];
}): JsonValue {
  const body: Record<string, JsonValue> = {
    model: request.modelRef,
    messages: openRouterTextProviderMessages(request),
    temperature: 0,
    max_tokens: request.maxOutputTokens,
  };
  const reasoning = openRouterReasoningFor(request.reasoningEffort);
  if (reasoning !== undefined) {
    body.reasoning = reasoning;
  }
  return body;
}

export function createOpenRouterFetchProviderToolTurnTransport(input: {
  apiKey: string;
  baseUrl?: string | null;
  fetchImpl?: typeof fetch;
  referer?: string;
  title?: string;
}): ProviderModelTurnClient {
  return {
    executeProviderTextTurn: async (request) => {
      const startedAt = Date.now();
      const fetchImpl = input.fetchImpl ?? fetch;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
      try {
        const body = buildOpenRouterProviderTextTurnBody({
          modelRef: request.modelRef,
          systemPrompt: request.systemPrompt,
          userPayload: request.userPayload,
          providerMessages: request.providerMessages,
          maxOutputTokens: request.maxOutputTokens,
          reasoningEffort: request.reasoningEffort,
        });
        const response = await fetchImpl(
          `${input.baseUrl ?? "https://openrouter.ai/api/v1"}/chat/completions`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${input.apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": input.referer ?? "https://openclaw.local/execution-platform",
              "X-Title": input.title ?? "OpenClaw Execution Platform Provider Text Transport",
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          },
        );
        const providerBody = (await response.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;
        const choice = Array.isArray(providerBody?.choices)
          ? (providerBody.choices[0] as Record<string, unknown> | undefined)
          : undefined;
        const message =
          choice && typeof choice === "object"
            ? (choice.message as Record<string, unknown> | undefined)
            : undefined;
        const responseText =
          response.ok && typeof message?.content === "string" ? message.content : null;
        const responseHash = stableToolTransportHash(
          JSON.stringify({
            status: response.status,
            model: providerBody?.model ?? request.modelRef,
            contentHash: responseText ? stableToolTransportHash(responseText) : null,
            finishReason: choice?.finish_reason ?? null,
          }),
        );
        return {
          modelRunRef: `openrouter-fetch-provider-text-turn://${request.modelRef}/${responseHash.slice(0, 20)}`,
          responseText,
          responseHash,
          latencyMs: Math.max(0, Date.now() - startedAt),
          providerDiagnostics: {
            artifactKind: "provider_text_turn_transport_diagnostics",
            providerKind: "openrouter",
            providerPath: "openrouter",
            modelRef: request.modelRef,
            resolvedModelRef: typeof providerBody?.model === "string" ? providerBody.model : null,
            httpStatus: response.status,
            ok: response.ok,
            responseTextPresent: Boolean(responseText?.trim()),
            finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
            usage:
              providerBody?.usage && typeof providerBody.usage === "object"
                ? (providerBody.usage as JsonValue)
                : null,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
    executeProviderToolTurn: async (request) => {
      const startedAt = Date.now();
      const fetchImpl = input.fetchImpl ?? fetch;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
      try {
        const body = buildOpenRouterProviderToolTurnBody({
          modelRef: request.modelRef,
          systemPrompt: request.systemPrompt,
          userPayload: request.userPayload,
          providerMessages: request.providerMessages,
          tools: request.tools,
          requiredToolName: request.requiredToolName ?? null,
          maxAcceptedToolCalls: request.maxAcceptedToolCalls ?? 1,
          maxOutputTokens: request.maxOutputTokens,
          reasoningEffort: request.reasoningEffort,
        });
        const response = await fetchImpl(
          `${input.baseUrl ?? "https://openrouter.ai/api/v1"}/chat/completions`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${input.apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": input.referer ?? "https://openclaw.local/execution-platform",
              "X-Title": input.title ?? "OpenClaw Execution Platform Provider Tool Transport",
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          },
        );
        const providerBody = (await response.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;
        const choice = Array.isArray(providerBody?.choices)
          ? (providerBody.choices[0] as Record<string, unknown> | undefined)
          : undefined;
        const message =
          choice && typeof choice === "object"
            ? (choice.message as Record<string, unknown> | undefined)
            : undefined;
        const toolCalls = response.ok ? readOpenRouterToolCalls(message) : [];
        const responseHash = stableToolTransportHash(
          JSON.stringify({
            status: response.status,
            model: providerBody?.model ?? request.modelRef,
            toolCalls,
            finishReason: choice?.finish_reason ?? null,
          }),
        );
        return {
          modelRunRef: `openrouter-fetch-provider-tool-turn://${request.modelRef}/${responseHash.slice(0, 20)}`,
          toolCalls,
          responseHash,
          latencyMs: Math.max(0, Date.now() - startedAt),
          providerDiagnostics: {
            artifactKind: "provider_tool_turn_transport_diagnostics",
            providerKind: "openrouter",
            providerPath: "openrouter",
            modelRef: request.modelRef,
            resolvedModelRef: typeof providerBody?.model === "string" ? providerBody.model : null,
            httpStatus: response.status,
            ok: response.ok,
            toolCallCount: toolCalls.length,
            finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
            usage:
              providerBody?.usage && typeof providerBody.usage === "object"
                ? (providerBody.usage as JsonValue)
                : null,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function stableToolTransportHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createOpenRouterProviderModelTurnTransport(input: {
  client?: ProviderToolCallableClient | null;
  defaultRoleId?: string;
}): ProviderModelTurnClient | null {
  const client = input.client;
  if (!client?.callRole && !client?.callTools) {
    return null;
  }
  const defaultRoleId = input.defaultRoleId ?? "implementation_engineer";
  const textClient = createOpenRouterProviderTextTurnClient({
    client,
    defaultRoleId,
  });
  const transport: ProviderModelTurnClient = {
    ...textClient,
  };
  if (client.callTools) {
    transport.executeProviderToolTurn = async (request) => {
      const startedAt = Date.now();
      const prompt = [
        request.systemPrompt.trim(),
        "",
        "User payload:",
        JSON.stringify(request.userPayload, null, 2),
      ].join("\n");
      const result = await client.callTools({
        roleId: defaultRoleId,
        modelId: request.modelRef,
        modelCandidateId: request.modelRef,
        prompt,
        tools: request.tools,
        allowedToolNames: request.allowedToolNames,
        requiredToolName: request.requiredToolName ?? null,
        maxAcceptedToolCalls: request.maxAcceptedToolCalls ?? 1,
        maxTokens: request.maxOutputTokens,
        timeoutMs: request.timeoutMs,
        maxAttempts: request.maxAttempts,
        reasoningEffort: request.reasoningEffort,
        taskClass: request.taskClass,
        modelTaskCallSite: request.modelTaskCallSite,
      });
      const responseHash =
        result.responseHash ??
        stableToolTransportHash(
          JSON.stringify({
            toolCalls: result.toolCalls ?? [],
            errorReasonCode: result.errorReasonCode ?? null,
            status: result.status ?? null,
          }),
        );
      return {
        modelRunRef: `openrouter-provider-tool-turn://${request.modelRef}/${responseHash.slice(0, 20)}`,
        toolCalls: result.toolCalls ?? [],
        responseHash,
        latencyMs: Math.max(0, Date.now() - startedAt),
        providerDiagnostics: {
          artifactKind: "provider_tool_turn_transport_diagnostics",
          status: result.status ?? null,
          providerPath: request.providerPath,
          modelRef: request.modelRef,
          roleId: defaultRoleId,
          toolCallCount: result.toolCalls?.length ?? 0,
          errorReasonCode: result.errorReasonCode ?? null,
          httpStatus: result.httpStatus ?? null,
          providerResponseDiagnostics: result.providerResponseDiagnostics ?? null,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      };
    };
  }
  return transport;
}

export function createOpenRouterProviderTextTurnClient(input: {
  client?: Pick<ProviderToolCallableClient, "callRole"> | null;
  defaultRoleId?: string;
}): ProviderTextTurnModelClient | null {
  const client = input.client;
  if (!client?.callRole) {
    return null;
  }
  const defaultRoleId = input.defaultRoleId ?? "implementation_engineer";
  return {
    executeProviderTextTurn: async (request) => {
      const startedAt = Date.now();
      const prompt = [
        request.systemPrompt.trim(),
        "",
        "User payload:",
        JSON.stringify(request.userPayload, null, 2),
      ].join("\n");
      const result = await client.callRole!({
        roleId: defaultRoleId,
        modelId: request.modelRef,
        modelCandidateId: request.modelRef,
        prompt,
        requestProfileOverride: {
          responseFormatMode: "prompt_only",
        },
        maxTokens: request.maxOutputTokens,
        timeoutMs: request.timeoutMs,
        maxAttempts: request.maxAttempts,
        reasoningEffort: request.reasoningEffort,
        taskClass: request.taskClass,
        modelTaskCallSite: request.modelTaskCallSite,
      });
      const responseText = typeof result.responseText === "string" ? result.responseText : null;
      const responseHash =
        result.responseHash ??
        stableToolTransportHash(
          JSON.stringify({
            responseTextHash: responseText ? stableToolTransportHash(responseText) : null,
            errorReasonCode: result.errorReasonCode ?? null,
            status: result.status ?? null,
          }),
        );
      return {
        modelRunRef: `openrouter-provider-text-turn://${request.modelRef}/${responseHash.slice(0, 20)}`,
        responseText,
        responseHash,
        latencyMs: Math.max(0, Date.now() - startedAt),
        providerDiagnostics: {
          artifactKind: "provider_text_turn_transport_diagnostics",
          status: result.status ?? null,
          providerPath: request.providerPath,
          modelRef: request.modelRef,
          roleId: defaultRoleId,
          responseTextPresent: Boolean(responseText?.trim()),
          errorReasonCode: result.errorReasonCode ?? null,
          httpStatus: result.httpStatus ?? null,
          providerResponseDiagnostics: result.providerResponseDiagnostics ?? null,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      };
    },
  };
}

export function providerSupportsModelToolTransport(input: {
  providerPath: string;
  requiredTransport: ModelToolTurnTransportRequirement;
}): boolean {
  if (input.providerPath === "openrouter") {
    return (
      input.requiredTransport === "native_single_tool" ||
      input.requiredTransport === "native_multi_tool_turn" ||
      input.requiredTransport === "parallel_native_tool_sessions"
    );
  }
  if (input.providerPath === "codex_app_server") {
    return (
      input.requiredTransport === "native_single_tool" ||
      input.requiredTransport === "native_multi_tool_turn"
    );
  }
  return false;
}

export function assertModelToolTransportSupported(input: {
  providerPath: string;
  requiredTransport: ModelToolTurnTransportRequirement;
  phaseId: string;
}): void {
  if (providerSupportsModelToolTransport(input)) {
    return;
  }
  throw new Error(
    `model_tool_turn_provider_unsupported:${input.phaseId}:${input.providerPath}:${input.requiredTransport}`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function executeProviderToolTurn(input: {
  modelClient: Pick<DynamicCodingTeamModelClient, "executeProviderToolTurn"> | null;
  request: ModelToolTurnRequest;
}): Promise<DynamicCodingTeamToolTurnResult> {
  const request = input.request;
  if (!input.modelClient?.executeProviderToolTurn) {
    throw new Error(`provider_tool_turn_client_missing:${request.owner}:${request.phaseId}`);
  }
  assertModelToolTransportSupported({
    providerPath: request.providerPath,
    requiredTransport: request.requiredTransport,
    phaseId: request.phaseId,
  });
  return input.modelClient.executeProviderToolTurn({
    modelRef: request.modelRef,
    providerPath: request.providerPath,
    systemPrompt: request.systemPrompt,
    userPayload: request.userPayload,
    providerMessages: request.providerMessages ?? null,
    tools: request.tools,
    allowedToolNames: request.allowedToolNames,
    requiredToolName: request.requiredToolName ?? null,
    maxAcceptedToolCalls: Math.max(1, Math.min(64, request.maxAcceptedToolCalls)),
    maxOutputTokens: request.maxOutputTokens,
    timeoutMs: request.timeoutMs,
    maxAttempts: request.maxAttempts,
    reasoningEffort: request.reasoningEffort,
    taskClass: request.taskClass,
    modelTaskCallSite: request.modelTaskCallSite,
    progress: request.progress,
  });
}

export async function executeProviderTextTurn(input: {
  modelClient: ProviderTextTurnModelClient | null;
  request: ModelTextTurnRequest;
}): Promise<DynamicCodingTeamTextTurnResult> {
  const request = input.request;
  if (!input.modelClient?.executeProviderTextTurn) {
    throw new Error(`provider_text_turn_client_missing:${request.owner}:${request.phaseId}`);
  }
  return input.modelClient.executeProviderTextTurn({
    owner: request.owner,
    phaseId: request.phaseId,
    modelRef: request.modelRef,
    providerPath: request.providerPath,
    systemPrompt: request.systemPrompt,
    userPayload: request.userPayload,
    providerMessages: request.providerMessages ?? null,
    maxOutputTokens: request.maxOutputTokens,
    timeoutMs: request.timeoutMs,
    maxAttempts: request.maxAttempts,
    reasoningEffort: request.reasoningEffort,
    taskClass: request.taskClass,
    modelTaskCallSite: request.modelTaskCallSite,
    progress: request.progress,
  });
}

async function executeModelToolTurnCore(input: {
  modelClient: Pick<DynamicCodingTeamModelClient, "executeProviderToolTurn"> | null;
  request: ModelToolTurnRequest;
}): Promise<ModelToolTurnResult> {
  const request = input.request;
  const allowed = new Set(request.allowedToolNames);
  const maxAcceptedToolCalls = Math.max(1, Math.min(64, request.maxAcceptedToolCalls));
  const response = await executeProviderToolTurn({
    modelClient: input.modelClient,
    request: {
      ...request,
      maxAcceptedToolCalls,
    },
  });
  const acceptedToolCalls: ModelToolTurnResult["acceptedToolCalls"] = [];
  const rejectedToolCalls: ModelToolTurnResult["rejectedToolCalls"] = [];
  let omittedToolCallCount = 0;
  for (const call of response.toolCalls) {
    const reason =
      request.requiredToolName && call.toolName !== request.requiredToolName
        ? "required_tool_mismatch"
        : !allowed.has(call.toolName)
          ? "tool_not_allowed_for_phase"
          : acceptedToolCalls.length >= maxAcceptedToolCalls
            ? "max_accepted_tool_calls_exceeded"
            : null;
    if (reason) {
      rejectedToolCalls.push({
        toolName: call.toolName,
        reason,
        callId: call.callId ?? null,
      });
      continue;
    }
    acceptedToolCalls.push({
      toolName: call.toolName,
      toolArguments: isRecord(call.toolArguments) ? call.toolArguments : call.toolArguments,
      callId: call.callId ?? null,
    });
  }
  omittedToolCallCount = Math.max(
    0,
    response.toolCalls.length - acceptedToolCalls.length - rejectedToolCalls.length,
  );
  if (acceptedToolCalls.length === 0) {
    throw new Error(`model_tool_turn_no_accepted_tools:${request.owner}:${request.phaseId}`);
  }
  return {
    resultMode: "tools",
    status: "completed",
    acceptedToolCalls,
    rejectedToolCalls,
    omittedToolCallCount,
    providerDiagnostics: {
      artifactKind: "model_tool_turn_provider_diagnostics",
      owner: request.owner,
      phaseId: request.phaseId,
      modelRef: request.modelRef,
      providerPath: request.providerPath,
      requiredTransport: request.requiredTransport,
      parallelismPolicy: request.parallelismPolicy,
      providerAdapterDiagnostics: response.providerDiagnostics ?? null,
      acceptedToolCallCount: acceptedToolCalls.length,
      rejectedToolCallCount: rejectedToolCalls.length,
      omittedToolCallCount,
      acceptedToolNames: acceptedToolCalls
        .map((call) => call.toolName)
        .slice(0, request.telemetryBudget?.inlineToolCallNameLimit ?? 32),
      rejectedToolNames: rejectedToolCalls
        .map((call) => call.toolName)
        .slice(0, request.telemetryBudget?.inlineRejectedCallLimit ?? 16),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    modelRunRef: response.modelRunRef,
    responseHash: response.responseHash,
    latencyMs: response.latencyMs,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

async function executeModelTextTurnCore(input: {
  modelClient: ProviderTextTurnModelClient | null;
  request: ModelTextTurnRequest;
}): Promise<ModelTextTurnResult> {
  const request = input.request;
  const response = await executeProviderTextTurn({
    modelClient: input.modelClient,
    request,
  });
  const text = typeof response.responseText === "string" ? response.responseText.trim() : "";
  if (!text) {
    throw new ModelTextTurnEmptyResponseError({ request, response });
  }
  return {
    resultMode: "text",
    status: "completed",
    text,
    providerDiagnostics: {
      artifactKind: "model_text_turn_provider_diagnostics",
      owner: request.owner,
      phaseId: request.phaseId,
      modelRef: request.modelRef,
      providerPath: request.providerPath,
      resultMode: "text",
      providerAdapterDiagnostics: response.providerDiagnostics ?? null,
      responseTextPresent: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    modelRunRef: response.modelRunRef,
    responseHash: response.responseHash,
    latencyMs: response.latencyMs,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export async function executeModelTurn(input: {
  modelClient: ProviderModelTurnClient | null;
  request: ModelTurnRequest;
}): Promise<ModelTurnResult> {
  if (input.request.resultMode === "text") {
    return executeModelTextTurnCore({
      modelClient: input.modelClient,
      request: input.request,
    });
  }
  const toolModelClient = input.modelClient?.executeProviderToolTurn
    ? (input.modelClient as ProviderToolTurnModelClient)
    : null;
  return executeModelToolTurnCore({
    modelClient: toolModelClient,
    request: input.request,
  });
}

export async function executeModelToolTurn(input: {
  modelClient: Pick<DynamicCodingTeamModelClient, "executeProviderToolTurn"> | null;
  request: ModelToolTurnRequest;
}): Promise<ModelToolTurnResult> {
  const result = await executeModelTurn({
    modelClient: input.modelClient,
    request: { ...input.request, resultMode: "tools" },
  });
  if (result.resultMode !== "tools") {
    throw new Error(
      `model_tool_turn_unexpected_text_result:${input.request.owner}:${input.request.phaseId}`,
    );
  }
  return result;
}

export async function executeModelToolTurnsInParallel(input: {
  modelClientFactory: () => DynamicCodingTeamModelClient | null;
  requests: ModelToolTurnRequest[];
}): Promise<ModelToolTurnResult[]> {
  return Promise.all(
    input.requests.map(async (request) => {
      const modelClient = input.modelClientFactory();
      try {
        return await executeModelToolTurn({ modelClient, request });
      } finally {
        const close = (modelClient as { close?: () => void } | null)?.close;
        if (typeof close === "function") {
          close.call(modelClient);
        }
      }
    }),
  );
}
