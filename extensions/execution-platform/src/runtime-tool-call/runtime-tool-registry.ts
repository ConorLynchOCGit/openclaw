import type {
  RuntimeToolDefinition,
  RuntimeToolExecutor,
  RuntimeToolFamily,
} from "./runtime-tool-types.ts";

const TOOL_ID_PATTERN = /^[a-z][a-z0-9_.:-]{2,120}$/u;
const TOOL_VERSION_PATTERN = /^v[0-9]+(?:\.[0-9]+){0,2}$/u;

export type RegisteredRuntimeTool = {
  definition: RuntimeToolDefinition;
  executor?: RuntimeToolExecutor;
};

export class RuntimeToolRegistry {
  private readonly tools = new Map<string, RegisteredRuntimeTool>();

  register(definition: RuntimeToolDefinition, executor?: RuntimeToolExecutor): void {
    validateRuntimeToolDefinition(definition);
    const key = toolDefinitionKey(definition.toolId, definition.toolVersion);
    const existing = this.tools.get(key);
    if (existing && JSON.stringify(existing.definition) !== JSON.stringify(definition)) {
      throw new Error(
        `runtime_tool_definition_conflict:${definition.toolId}:${definition.toolVersion}`,
      );
    }
    this.tools.set(key, { definition, executor });
  }

  get(toolId: string, toolVersion = "v1"): RegisteredRuntimeTool | null {
    return this.tools.get(toolDefinitionKey(toolId, toolVersion)) ?? null;
  }

  require(toolId: string, toolVersion = "v1"): RegisteredRuntimeTool {
    const tool = this.get(toolId, toolVersion);
    if (!tool) {
      throw new Error(`runtime_tool_not_registered:${toolId}:${toolVersion}`);
    }
    if (!tool.definition.enabled) {
      throw new Error(`runtime_tool_disabled:${toolId}:${toolVersion}`);
    }
    return tool;
  }

  list(input: { family?: RuntimeToolFamily; enabledOnly?: boolean } = {}): RuntimeToolDefinition[] {
    return [...this.tools.values()]
      .map((tool) => tool.definition)
      .filter((definition) => !input.family || definition.toolFamily === input.family)
      .filter((definition) => input.enabledOnly !== true || definition.enabled)
      .toSorted((left, right) => left.toolId.localeCompare(right.toolId));
  }
}

export function toolDefinitionKey(toolId: string, toolVersion: string): string {
  return `${toolId}@${toolVersion}`;
}

export function validateRuntimeToolDefinition(definition: RuntimeToolDefinition): void {
  if (!TOOL_ID_PATTERN.test(definition.toolId)) {
    throw new Error(`runtime_tool_invalid_tool_id:${definition.toolId}`);
  }
  if (!TOOL_VERSION_PATTERN.test(definition.toolVersion)) {
    throw new Error(`runtime_tool_invalid_version:${definition.toolVersion}`);
  }
  if (!definition.executorKey.trim()) {
    throw new Error("runtime_tool_executor_key_missing");
  }
  if (!definition.schemaRef.trim()) {
    throw new Error("runtime_tool_schema_ref_missing");
  }
  if (
    definition.defaultTimeoutMs !== undefined &&
    definition.defaultTimeoutMs !== null &&
    (!Number.isFinite(definition.defaultTimeoutMs) || definition.defaultTimeoutMs < 0)
  ) {
    throw new Error(`runtime_tool_invalid_default_timeout:${definition.toolId}`);
  }
  const flags = definition as unknown as Record<string, unknown>;
  const storageFlags = definition.storagePolicy as unknown as Record<string, unknown>;
  if (
    flags.rawPromptStored === true ||
    flags.rawResponseStored === true ||
    flags.rawTranscriptStored === true ||
    flags.rawLogsStored === true ||
    flags.secretsStored === true ||
    storageFlags.rawPromptStored === true ||
    storageFlags.rawResponseStored === true ||
    storageFlags.rawTranscriptStored === true ||
    storageFlags.rawProviderLogStored === true ||
    storageFlags.rawToolLogStored === true ||
    storageFlags.rawCommandLogStored === true ||
    storageFlags.rawDbRowsStored === true ||
    storageFlags.secretsStored === true
  ) {
    throw new Error("runtime_tool_raw_storage_rejected");
  }
}

export const DEFAULT_RUNTIME_TOOL_STORAGE_POLICY = {
  maxInputSummaryChars: 1_200,
  maxOutputSummaryChars: 1_200,
  maxEventSummaryChars: 800,
  rawPromptStored: false,
  rawResponseStored: false,
  rawTranscriptStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  rawCommandLogStored: false,
  rawDbRowsStored: false,
  secretsStored: false,
} as const;

export function buildRuntimeToolDefinition(
  input: Omit<
    RuntimeToolDefinition,
    | "storagePolicy"
    | "rawPromptStored"
    | "rawResponseStored"
    | "rawTranscriptStored"
    | "rawLogsStored"
    | "secretsStored"
  > &
    Partial<Pick<RuntimeToolDefinition, "storagePolicy">>,
): RuntimeToolDefinition {
  return {
    ...input,
    defaultTimeoutMs: input.defaultTimeoutMs ?? null,
    storagePolicy: input.storagePolicy ?? DEFAULT_RUNTIME_TOOL_STORAGE_POLICY,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
    secretsStored: false,
  };
}
