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
import type { ScriptJobDefinition, ScriptJobPayload, ValidationLaneEvidence } from "./types.ts";

export const SCRIPT_EXECUTE_RUNTIME_TOOL_ID = "script.execute";
export const SCRIPT_EXECUTE_RUNTIME_TOOL_VERSION = "v1";

export type ScriptExecuteHandlerInput = {
  definition: ScriptJobDefinition;
  script: ScriptJobPayload;
  abortSignal?: AbortSignal;
};

export type ScriptExecuteHandlerResult = {
  output?: JsonValue;
  exitCode?: number;
  validationEvidence?: ValidationLaneEvidence;
  commandRef?: string | null;
  durationMs?: number;
  stdoutBytes?: number;
  stderrBytes?: number;
  stdoutSha256?: string;
  stderrSha256?: string;
  timedOut?: boolean;
  artifactRefs?: string[];
};

export type ScriptExecuteHandler = (
  input: ScriptExecuteHandlerInput,
) => Promise<ScriptExecuteHandlerResult> | ScriptExecuteHandlerResult;

export type ScriptExecuteVolatileInput = {
  definition: ScriptJobDefinition;
  script: ScriptJobPayload;
};

export type ScriptExecuteRuntimeToolMetadata = {
  artifactKind: "script_execute_runtime_tool_metadata";
  scriptId: string;
  handlerId: string;
  lane: string;
  commandRef: string | null;
  exitCode: number | null;
  durationMs: number | null;
  stdoutBytes: number | null;
  stderrBytes: number | null;
  stdoutSha256: string | null;
  stderrSha256: string | null;
  timedOut: boolean;
  validationRefs: string[];
  rawStdoutStored: false;
  rawStderrStored: false;
  rawCommandLogStored: false;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function requireScriptExecuteInput(input: RuntimeToolExecutorInput): ScriptExecuteVolatileInput {
  const value = input.volatileInput;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("script_execute_volatile_input_missing");
  }
  const record = value as Record<string, unknown>;
  const definition = record.definition as ScriptJobDefinition | undefined;
  const script = record.script as ScriptJobPayload | undefined;
  if (
    !definition ||
    !script ||
    typeof definition.scriptId !== "string" ||
    typeof definition.handlerId !== "string" ||
    typeof script.scriptId !== "string" ||
    definition.scriptId !== script.scriptId ||
    definition.shellExecutionAllowed ||
    script.definitionSnapshot.shellExecutionAllowed
  ) {
    throw new Error("script_execute_volatile_input_invalid");
  }
  return { definition, script };
}

export function buildScriptExecuteRuntimeToolDefinition() {
  return buildRuntimeToolDefinition({
    toolId: SCRIPT_EXECUTE_RUNTIME_TOOL_ID,
    toolVersion: SCRIPT_EXECUTE_RUNTIME_TOOL_VERSION,
    toolFamily: "script.execute",
    executorKey: "execution-platform.script-jobs.script-execute",
    schemaRef: "runtime-tool://script-execute/allowlisted-handler/v1",
    authorityClass: "bounded_runtime_write",
    defaultTimeoutMs: 120_000,
    enabled: true,
    metadata: {
      artifactKind: "script_execute_runtime_tool_definition",
      allowlistedHandlerRequired: true,
      arbitraryCommandPayloadAllowed: false,
      rawStdoutStored: false,
      rawStderrStored: false,
      rawCommandLogStored: false,
    },
  });
}

export function createScriptExecuteRuntimeToolExecutor(input: {
  handlers: Record<string, ScriptExecuteHandler>;
}): RuntimeToolExecutor {
  return {
    async execute(toolInput) {
      const { definition, script } = requireScriptExecuteInput(toolInput);
      const handler = input.handlers[definition.handlerId];
      if (!handler) {
        const failed: RuntimeToolExecutorResult = {
          status: "needs_review",
          outputRef: `runtime-tool-output://${toolInput.invocationId ?? toolInput.idempotencyKey}/script`,
          outputSummary: `Script handler is not registered: ${definition.handlerId}.`,
          reasonCodes: ["script_execute_handler_missing"],
          metadata: {
            artifactKind: "script_execute_runtime_tool_metadata",
            scriptId: definition.scriptId,
            handlerId: definition.handlerId,
            lane: script.lane,
            commandRef: null,
            exitCode: null,
            durationMs: null,
            stdoutBytes: null,
            stderrBytes: null,
            stdoutSha256: null,
            stderrSha256: null,
            timedOut: false,
            validationRefs: [],
            rawStdoutStored: false,
            rawStderrStored: false,
            rawCommandLogStored: false,
          } satisfies ScriptExecuteRuntimeToolMetadata,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawCommandLogStored: false,
          rawDbRowsStored: false,
        };
        return failed;
      }
      const startedAt = Date.now();
      const result = await handler({
        definition,
        script,
        abortSignal: toolInput.abortSignal,
      });
      const durationMs = result.durationMs ?? Math.max(0, Date.now() - startedAt);
      const validationRefs = result.validationEvidence?.artifactRefs.slice(0, 10) ?? [];
      const exitCode = result.exitCode ?? 0;
      const outputSummary =
        exitCode === 0 && !result.timedOut
          ? `Script ${definition.scriptId} completed through script.execute.`
          : `Script ${definition.scriptId} failed or timed out through script.execute.`;
      const outputHash = `sha256:${sha256(JSON.stringify(result.output ?? {}))}`;
      const succeeded: RuntimeToolExecutorResult = {
        status: exitCode === 0 && !result.timedOut ? "succeeded" : "failed",
        outputRef: `runtime-tool-output://${toolInput.invocationId ?? toolInput.idempotencyKey}/script`,
        outputHash,
        outputSummary,
        reasonCodes: [
          "script_execute_runtime_tool_completed",
          ...(result.timedOut ? ["script_execute_timed_out"] : []),
          ...(exitCode === 0 ? ["script_execute_exit_zero"] : ["script_execute_exit_nonzero"]),
        ],
        metadata: {
          artifactKind: "script_execute_runtime_tool_metadata",
          scriptId: definition.scriptId,
          handlerId: definition.handlerId,
          lane: script.lane,
          commandRef: result.commandRef ?? null,
          exitCode,
          durationMs,
          stdoutBytes: result.stdoutBytes ?? null,
          stderrBytes: result.stderrBytes ?? null,
          stdoutSha256: result.stdoutSha256 ?? null,
          stderrSha256: result.stderrSha256 ?? null,
          timedOut: Boolean(result.timedOut),
          validationRefs,
          output: result.output ?? {},
          validationEvidence: (result.validationEvidence ?? null) as JsonValue,
          rawStdoutStored: false,
          rawStderrStored: false,
          rawCommandLogStored: false,
        } satisfies ScriptExecuteRuntimeToolMetadata & Record<string, JsonValue>,
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

export function registerScriptExecuteRuntimeTool(input: {
  registry: RuntimeToolRegistry;
  handlers: Record<string, ScriptExecuteHandler>;
}): void {
  input.registry.register(
    buildScriptExecuteRuntimeToolDefinition(),
    createScriptExecuteRuntimeToolExecutor({ handlers: input.handlers }),
  );
}

export function scriptExecuteMetadataFromResult(
  result: RuntimeToolExecutorResult | null,
): (ScriptExecuteRuntimeToolMetadata & Record<string, JsonValue>) | null {
  const metadata = result?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const record = metadata as Record<string, JsonValue>;
  return record.artifactKind === "script_execute_runtime_tool_metadata"
    ? (record as ScriptExecuteRuntimeToolMetadata & Record<string, JsonValue>)
    : null;
}
