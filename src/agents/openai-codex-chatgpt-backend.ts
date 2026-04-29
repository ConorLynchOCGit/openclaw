export const OPENAI_CODEX_CHATGPT_BASE_URL = "https://chatgpt.com/backend-api";
export const OPENAI_CODEX_CHATGPT_LEGACY_BASE_URL = "https://chatgpt.com/backend-api/v1";

export type OpenAICodexChatGptResponsesPayload = {
  model?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: {
      cached_tokens?: number;
    };
  };
  error?: {
    message?: string;
  };
};

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function isOpenAICodexChatGptBaseUrl(baseUrl?: string | null): boolean {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    return false;
  }
  return /^https?:\/\/chatgpt\.com\/backend-api(?:\/v1)?(?:\/codex\/responses)?$/iu.test(
    stripTrailingSlash(baseUrl),
  );
}

export function normalizeOpenAICodexChatGptBaseUrl(baseUrl?: string | null): string | undefined {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    return undefined;
  }
  return isOpenAICodexChatGptBaseUrl(baseUrl)
    ? OPENAI_CODEX_CHATGPT_BASE_URL
    : stripTrailingSlash(baseUrl);
}

export function resolveOpenAICodexChatGptResponsesUrl(baseUrl: string): string {
  const normalized = normalizeOpenAICodexChatGptBaseUrl(baseUrl) ?? stripTrailingSlash(baseUrl);
  if (/\/codex\/responses$/iu.test(normalized)) {
    return normalized;
  }
  return `${normalized}/codex/responses`;
}

export function buildOpenAICodexChatGptJsonCueText(
  userPrompt: string,
  responseFormatMode: "json_object" | "json_schema",
): string {
  if (responseFormatMode !== "json_object") {
    return userPrompt;
  }
  if (/\bjson\b/iu.test(userPrompt)) {
    return userPrompt;
  }
  return `JSON response required.\n\n${userPrompt}`;
}

export function parseOpenAICodexChatGptSseResponse(
  rawText: string,
): OpenAICodexChatGptResponsesPayload {
  let model: string | undefined;
  let outputText = "";
  let output: OpenAICodexChatGptResponsesPayload["output"] | undefined;
  let usage: OpenAICodexChatGptResponsesPayload["usage"] | undefined;
  let errorMessage: string | undefined;

  for (const block of rawText.split(/\r?\n\r?\n+/u)) {
    const trimmed = block.trim();
    if (!trimmed) {
      continue;
    }
    const lines = trimmed.split(/\r?\n/u);
    let eventType: string | undefined;
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventType = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
      }
    }
    if (dataLines.length === 0) {
      continue;
    }
    const dataText = dataLines.join("\n");
    if (!dataText || dataText === "[DONE]") {
      continue;
    }
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(dataText) as Record<string, unknown>;
    } catch {
      continue;
    }

    const type =
      readTrimmedString(eventType) ?? readTrimmedString((payload as { type?: unknown }).type);
    if (type === "response.output_text.delta" || type === "response.refusal.delta") {
      outputText += readNonEmptyString((payload as { delta?: unknown }).delta) ?? "";
      continue;
    }

    const response =
      payload && typeof payload.response === "object" && payload.response !== null
        ? (payload.response as Record<string, unknown>)
        : undefined;
    if (response) {
      model = readTrimmedString(response.model) ?? model;
      if (Array.isArray(response.output)) {
        output = response.output as OpenAICodexChatGptResponsesPayload["output"];
      }
      if (response.usage && typeof response.usage === "object") {
        usage = response.usage as OpenAICodexChatGptResponsesPayload["usage"];
      }
      const completedOutputText = readTrimmedString(
        (response as { output_text?: unknown }).output_text,
      );
      if (completedOutputText) {
        outputText = completedOutputText;
      }
      const responseError =
        response.error && typeof response.error === "object"
          ? (response.error as { message?: unknown }).message
          : undefined;
      errorMessage =
        readTrimmedString(responseError) ??
        readTrimmedString(
          (response.incomplete_details as { reason?: unknown } | undefined)?.reason,
        ) ??
        errorMessage;
    }

    if (type === "error") {
      errorMessage =
        readTrimmedString((payload as { message?: unknown }).message) ??
        readTrimmedString((payload.error as { message?: unknown } | undefined)?.message) ??
        errorMessage;
    }
  }

  return {
    ...(model ? { model } : {}),
    ...(outputText ? { output_text: outputText } : {}),
    ...(output ? { output } : {}),
    ...(usage ? { usage } : {}),
    ...(errorMessage ? { error: { message: errorMessage } } : {}),
  };
}

export async function readOpenAICodexChatGptSseText(response: Response): Promise<string> {
  if (!response.body) {
    return await response.text();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let rawText = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      rawText += decoder.decode(value, { stream: true });
      if (
        rawText.includes("event: response.completed") ||
        rawText.includes("event: response.failed") ||
        rawText.includes("event: error")
      ) {
        break;
      }
    }
    rawText += decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return rawText;
}
