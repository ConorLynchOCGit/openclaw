import type { JsonValue } from "../runtime-job-repository.ts";
import { buildRuntimeToolDefinition } from "../runtime-tool-call/runtime-tool-registry.ts";
import type {
  RuntimeToolExecutor,
  RuntimeToolExecutorResult,
} from "../runtime-tool-call/runtime-tool-types.ts";
import {
  CodeIntelligenceService,
  createCodeIntelligenceService,
  type CodeIntelligenceServiceOptions,
} from "./code-intelligence-service.ts";
import {
  CODE_INTELLIGENCE_RUNTIME_TOOL_IDS,
  type CodeIntelligenceQuery,
  type CodeIntelligenceRuntimeToolId,
} from "./types.ts";

const CODE_INTELLIGENCE_TOOL_ID_SET = new Set<string>(CODE_INTELLIGENCE_RUNTIME_TOOL_IDS);

export function isCodeIntelligenceRuntimeToolId(
  toolId: string,
): toolId is CodeIntelligenceRuntimeToolId {
  return CODE_INTELLIGENCE_TOOL_ID_SET.has(toolId);
}

export function buildCodeIntelligenceRuntimeToolDefinition(toolId: CodeIntelligenceRuntimeToolId) {
  return buildRuntimeToolDefinition({
    toolId,
    toolVersion: "v1",
    toolFamily: "code_intelligence.query",
    executorKey: `code-intelligence.${toolId}`,
    schemaRef: `runtime-tool://code-intelligence/${toolId.replace(/^code\./u, "").replaceAll("_", "-")}/v1`,
    authorityClass: "read_only",
    defaultTimeoutMs: 60_000,
    enabled: true,
    metadata: {
      semanticModeDisclosure:
        "TS/JS semantic mode is served by the TypeScript language-service backend when available; structural parser output is explicit degraded mode.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    },
  });
}

export function createCodeIntelligenceRuntimeToolExecutor(
  input: {
    service?: CodeIntelligenceService;
    serviceOptions?: CodeIntelligenceServiceOptions;
  } = {},
): RuntimeToolExecutor {
  const service =
    input.service ??
    createCodeIntelligenceService({
      rootDir: input.serviceOptions?.rootDir ?? process.cwd(),
      ...(input.serviceOptions?.maxFiles === undefined
        ? {}
        : { maxFiles: input.serviceOptions.maxFiles }),
      ...(input.serviceOptions?.semanticMode === undefined
        ? {}
        : { semanticMode: input.serviceOptions.semanticMode }),
    });
  return {
    async execute(invocation): Promise<RuntimeToolExecutorResult> {
      const toolId = invocation.toolId;
      if (!isCodeIntelligenceRuntimeToolId(toolId)) {
        return {
          status: "failed",
          outputRef: null,
          outputHash: null,
          outputSummary: `Unsupported code intelligence tool id: ${toolId}`,
          reasonCodes: ["code_intelligence_tool_id_invalid"],
          metadata: {
            toolId,
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
            secretsStored: false,
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawCommandLogStored: false,
          rawDbRowsStored: false,
        };
      }
      const query = extractQuery(invocation.volatileInput, invocation.metadata);
      const result = await service.runTool(toolId, query);
      return {
        status: result.status,
        outputRef: result.outputRef,
        outputHash: result.outputHash,
        outputSummary: result.summary,
        reasonCodes: result.reasonCodes,
        artifacts: [
          {
            invocationId: invocation.invocationId ?? `pending:${toolId}`,
            artifactType: "code_intelligence_result",
            storageKind: "metadata",
            artifactRef: result.outputRef,
            contentHash: result.outputHash,
            boundedSummary: result.summary,
            metadata: boundedResultMetadata(result),
            rawContentStored: false,
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
            secretsStored: false,
          },
        ],
        metadata: boundedResultMetadata(result),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
      };
    },
  };
}

function extractQuery(
  volatileInput: unknown,
  metadata: JsonValue | undefined,
): CodeIntelligenceQuery {
  const volatileRecord = asRecord(volatileInput) ?? {};
  const metadataRecord = asRecord(metadata) ?? {};
  const nested =
    asRecord(volatileRecord.codeIntelligenceQuery) ??
    asRecord(volatileRecord.query) ??
    asRecord(metadataRecord.codeIntelligenceQuery) ??
    asRecord(metadataRecord.query);
  const source = nested ?? volatileRecord ?? metadataRecord ?? {};
  return {
    query: stringValue(source.query),
    symbolName: stringValue(source.symbolName),
    filePath: stringValue(source.filePath),
    filePaths: stringArrayValue(source.filePaths),
    targetFilePath: stringValue(source.targetFilePath),
    targetSymbol: stringValue(source.targetSymbol),
    newName: stringValue(source.newName),
    limit: numberValue(source.limit),
  };
}

function boundedResultMetadata(result: {
  artifactKind: string;
  toolId: string;
  status: string;
  semanticMode: string;
  backendId: string;
  backendHealthRef: string;
  workspaceSnapshotRef: string;
  semanticConfidence: string;
  fallbackUsed: boolean;
  fallbackReasonCodes: string[];
  diagnosticVersionRef: string | null;
  projectConfigRefs: string[];
  limitations: string[];
  backendLatencyMs: number | null;
  resultCounts: JsonValue;
  outputRef: string;
  outputHash: string;
  summary: string;
  reasonCodes: string[];
  queriedFileRefs: string[];
  symbolRefs: string[];
  diagnosticRefs: string[];
  relatedTestRefs: string[];
  impactRefs: string[];
  staleRefBlockers: string[];
  symbols: JsonValue[];
  locations: JsonValue[];
  diagnostics: JsonValue[];
  importGraph: JsonValue[];
  relatedTests: JsonValue[];
  codeActions: JsonValue[];
  metadata: Record<string, JsonValue>;
}): JsonValue {
  return {
    artifactKind: result.artifactKind,
    toolId: result.toolId,
    status: result.status,
    semanticMode: result.semanticMode,
    backendId: result.backendId,
    backendHealthRef: result.backendHealthRef,
    workspaceSnapshotRef: result.workspaceSnapshotRef,
    semanticConfidence: result.semanticConfidence,
    fallbackUsed: result.fallbackUsed,
    fallbackReasonCodes: result.fallbackReasonCodes.slice(0, 20),
    diagnosticVersionRef: result.diagnosticVersionRef,
    projectConfigRefs: result.projectConfigRefs.slice(0, 20),
    limitations: result.limitations.slice(0, 20),
    backendLatencyMs: result.backendLatencyMs,
    resultCounts: result.resultCounts as unknown as JsonValue,
    outputRef: result.outputRef,
    outputHash: result.outputHash,
    summary: result.summary,
    reasonCodes: result.reasonCodes.slice(0, 20),
    queriedFileRefs: result.queriedFileRefs.slice(0, 40),
    symbolRefs: result.symbolRefs.slice(0, 40),
    diagnosticRefs: result.diagnosticRefs.slice(0, 40),
    relatedTestRefs: result.relatedTestRefs.slice(0, 40),
    impactRefs: result.impactRefs.slice(0, 40),
    staleRefBlockers: result.staleRefBlockers.slice(0, 20),
    symbolCount: result.symbols.length,
    locationCount: result.locations.length,
    diagnosticCount: result.diagnostics.length,
    importEdgeCount: result.importGraph.length,
    relatedTestCount: result.relatedTests.length,
    codeActionCount: result.codeActions.length,
    resultPreview: {
      symbols: result.symbols.slice(0, 12),
      locations: result.locations.slice(0, 12),
      diagnostics: result.diagnostics.slice(0, 12),
      importGraph: result.importGraph.slice(0, 12),
      relatedTests: result.relatedTests.slice(0, 12),
      codeActions: result.codeActions.slice(0, 12),
    },
    sourceMetadata: result.metadata,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    rawLogsStored: false,
    secretsStored: false,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArrayValue(value: unknown): string[] | null {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : null;
}
