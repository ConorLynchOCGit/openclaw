import { createHash } from "node:crypto";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  buildRuntimeToolDefinition,
  type RuntimeToolRegistry,
} from "../runtime-tool-call/runtime-tool-registry.ts";
import type {
  RuntimeToolExecutor,
  RuntimeToolExecutorInput,
  RuntimeToolExecutorResult,
} from "../runtime-tool-call/runtime-tool-types.ts";
import type { DbOperationPayload, DbOperationTelemetry } from "./types.ts";

export const DB_OPERATION_EXECUTE_RUNTIME_TOOL_ID = "db_operation.execute";
export const DB_OPERATION_EXECUTE_RUNTIME_TOOL_VERSION = "v1";

export type DbOperationExecuteHandlerInput = {
  operation: DbOperationPayload;
  abortSignal?: AbortSignal;
};

export type DbOperationExecuteHandlerResult = {
  output?: JsonValue;
  telemetry: DbOperationTelemetry;
  resultSummary?: string;
  resultHash?: string;
  rowCount?: number | null;
};

export type DbOperationExecuteHandler = (
  input: DbOperationExecuteHandlerInput,
) => Promise<DbOperationExecuteHandlerResult> | DbOperationExecuteHandlerResult;

export type DbOperationExecuteVolatileInput = {
  operation: DbOperationPayload;
};

export type DbOperationExecuteRuntimeToolMetadata = {
  artifactKind: "db_operation_execute_runtime_tool_metadata";
  operationName: string;
  operationKind: string;
  lane: string;
  decision: string;
  outcome: string;
  timeoutBudgetMs: number | null;
  durationMs: number | null;
  rowCount: number | null;
  resultHash: string | null;
  telemetryRef: string;
  rawRowsStored: false;
  rawDbRowsStored: false;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hasRawSqlPayloadKey(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey === "sql" ||
      normalizedKey === "rawsql" ||
      normalizedKey === "query" ||
      normalizedKey === "statement"
    ) {
      return true;
    }
    return hasRawSqlPayloadKey(nested);
  });
}

function requireDbOperationExecuteInput(
  input: RuntimeToolExecutorInput,
): DbOperationExecuteVolatileInput {
  const value = input.volatileInput;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("db_operation_execute_volatile_input_missing");
  }
  const operation = (value as Record<string, unknown>).operation as DbOperationPayload | undefined;
  if (
    !operation ||
    operation.family !== "db_operation" ||
    typeof operation.operationName !== "string" ||
    typeof operation.operationKind !== "string" ||
    typeof operation.lane !== "string" ||
    hasRawSqlPayloadKey(operation.params ?? {})
  ) {
    throw new Error("db_operation_execute_volatile_input_invalid");
  }
  return { operation };
}

export function buildDbOperationExecuteRuntimeToolDefinition() {
  return buildRuntimeToolDefinition({
    toolId: DB_OPERATION_EXECUTE_RUNTIME_TOOL_ID,
    toolVersion: DB_OPERATION_EXECUTE_RUNTIME_TOOL_VERSION,
    toolFamily: "db_operation.execute",
    executorKey: "execution-platform.db-operations.db-operation-execute",
    schemaRef: "runtime-tool://db-operation-execute/approved-operation/v1",
    authorityClass: "bounded_db_write",
    defaultTimeoutMs: 120_000,
    enabled: true,
    metadata: {
      artifactKind: "db_operation_execute_runtime_tool_definition",
      approvedHandlerRequired: true,
      arbitrarySqlPayloadAllowed: false,
      rawRowsStored: false,
      rawDbRowsStored: false,
    },
  });
}

export function createDbOperationExecuteRuntimeToolExecutor(input: {
  handlers: Record<string, DbOperationExecuteHandler>;
}): RuntimeToolExecutor {
  return {
    async execute(toolInput) {
      const { operation } = requireDbOperationExecuteInput(toolInput);
      const handler = input.handlers[operation.operationName];
      if (!handler) {
        const failed: RuntimeToolExecutorResult = {
          status: "needs_review",
          outputRef: `runtime-tool-output://${toolInput.invocationId ?? toolInput.idempotencyKey}/db-operation`,
          outputSummary: `DB operation handler is not registered: ${operation.operationName}.`,
          reasonCodes: ["db_operation_execute_handler_missing"],
          metadata: {
            artifactKind: "db_operation_execute_runtime_tool_metadata",
            operationName: operation.operationName,
            operationKind: operation.operationKind,
            lane: operation.lane,
            decision: operation.classification.decision,
            outcome: "failed",
            timeoutBudgetMs: operation.classification.timeoutBudgetMs,
            durationMs: null,
            rowCount: null,
            resultHash: null,
            telemetryRef: `runtime-tool://${toolInput.invocationId ?? toolInput.idempotencyKey}/db-operation/telemetry`,
            rawRowsStored: false,
            rawDbRowsStored: false,
          } satisfies DbOperationExecuteRuntimeToolMetadata,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawCommandLogStored: false,
          rawDbRowsStored: false,
        };
        return failed;
      }
      const result = await handler({ operation, abortSignal: toolInput.abortSignal });
      const output = result.output ?? {};
      const resultHash = result.resultHash ?? `sha256:${sha256(JSON.stringify(output))}`;
      const telemetryRef = `runtime-tool://${toolInput.invocationId ?? toolInput.idempotencyKey}/db-operation/telemetry`;
      const succeeded: RuntimeToolExecutorResult = {
        status: result.telemetry.outcome === "succeeded" ? "succeeded" : "failed",
        outputRef: `runtime-tool-output://${toolInput.invocationId ?? toolInput.idempotencyKey}/db-operation`,
        outputHash: resultHash,
        outputSummary:
          result.resultSummary ??
          `DB operation ${operation.operationName} completed with ${result.telemetry.outcome}.`,
        reasonCodes: [
          "db_operation_execute_runtime_tool_completed",
          `db_operation_outcome_${result.telemetry.outcome}`,
        ],
        metadata: {
          artifactKind: "db_operation_execute_runtime_tool_metadata",
          operationName: operation.operationName,
          operationKind: operation.operationKind,
          lane: operation.lane,
          decision: operation.classification.decision,
          outcome: result.telemetry.outcome,
          timeoutBudgetMs: result.telemetry.timeoutBudgetMs,
          durationMs: result.telemetry.durationMs,
          rowCount: result.rowCount ?? null,
          resultHash,
          resultSummary: result.resultSummary ?? null,
          output,
          telemetry: result.telemetry as unknown as JsonValue,
          telemetryRef,
          rawRowsStored: false,
          rawDbRowsStored: false,
        } satisfies DbOperationExecuteRuntimeToolMetadata & Record<string, JsonValue>,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
      };
      return succeeded;
    },
  };
}

export function registerDbOperationExecuteRuntimeTool(input: {
  registry: RuntimeToolRegistry;
  handlers: Record<string, DbOperationExecuteHandler>;
}): void {
  input.registry.register(
    buildDbOperationExecuteRuntimeToolDefinition(),
    createDbOperationExecuteRuntimeToolExecutor({ handlers: input.handlers }),
  );
}

export function dbOperationExecuteMetadataFromResult(
  result: RuntimeToolExecutorResult | null,
): (DbOperationExecuteRuntimeToolMetadata & Record<string, JsonValue>) | null {
  const metadata = result?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const record = metadata as Record<string, JsonValue>;
  return record.artifactKind === "db_operation_execute_runtime_tool_metadata"
    ? (record as DbOperationExecuteRuntimeToolMetadata & Record<string, JsonValue>)
    : null;
}
