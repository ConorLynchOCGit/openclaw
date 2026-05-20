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
import { closeoutCapsuleHash, validateCloseoutCapsule } from "./closeout-capsule.ts";
import type {
  CloseoutCapsuleReporterInput,
  CloseoutCapsuleReporterResult,
} from "./model-closeout-capsule-reporter.ts";

export const CLOSEOUT_GENERATE_RUNTIME_TOOL_ID = "closeout.generate";
export const CLOSEOUT_GENERATE_RUNTIME_TOOL_VERSION = "v1";

export type CloseoutGenerateReporter = {
  createCapsule(input: CloseoutCapsuleReporterInput): Promise<CloseoutCapsuleReporterResult>;
};

export type CloseoutGenerateVolatileInput = {
  closeoutInput: CloseoutCapsuleReporterInput;
};

export type CloseoutGenerateRuntimeToolMetadata = {
  artifactKind: "closeout_generate_runtime_tool_metadata";
  capsuleId: string | null;
  capsuleRef: string | null;
  capsuleHash: string | null;
  closeoutSource: "model" | "degraded_system_fallback" | "missing";
  modelRef: string | null;
  taskSuccess: string | null;
  opportunitySeedCount: number;
  roleCloseoutCount: number;
  validationBlockingReasons: string[];
  reporterReasonCodes: string[];
  closeoutTiming: JsonValue | null;
  capsule?: JsonValue;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function jsonObject(value: JsonValue | undefined): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
}

function requireCloseoutGenerateVolatileInput(
  input: RuntimeToolExecutorInput,
): CloseoutGenerateVolatileInput {
  const value = input.volatileInput;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("closeout_generate_volatile_input_missing");
  }
  const closeoutInput = (value as Record<string, unknown>).closeoutInput;
  if (!closeoutInput || typeof closeoutInput !== "object" || Array.isArray(closeoutInput)) {
    throw new Error("closeout_generate_closeout_input_missing");
  }
  return { closeoutInput: closeoutInput as CloseoutCapsuleReporterInput };
}

function closeoutRef(input: {
  runtimeJobId?: string | null;
  capsuleId: string | null;
  invocationKey: string;
}): string {
  if (input.runtimeJobId && input.capsuleId) {
    return `runtime-job://${input.runtimeJobId}/closeout-capsule/${input.capsuleId}`;
  }
  return `runtime-tool-output://${input.invocationKey}/closeout-capsule`;
}

export function buildCloseoutGenerateRuntimeToolDefinition() {
  return buildRuntimeToolDefinition({
    toolId: CLOSEOUT_GENERATE_RUNTIME_TOOL_ID,
    toolVersion: CLOSEOUT_GENERATE_RUNTIME_TOOL_VERSION,
    toolFamily: "closeout.generate",
    executorKey: "execution-platform.closeout.generate-model-authored-capsule",
    schemaRef: "runtime-tool://closeout-generate/model-authored-capsule/v1",
    authorityClass: "bounded_runtime_write",
    defaultTimeoutMs: 300_000,
    enabled: true,
    metadata: {
      artifactKind: "closeout_generate_runtime_tool_definition",
      modelAuthoredCloseoutRequired: true,
      degradedSystemCloseoutSuccessAllowed: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
  });
}

export function createCloseoutGenerateRuntimeToolExecutor(input: {
  reporter: CloseoutGenerateReporter;
}): RuntimeToolExecutor {
  return {
    async execute(toolInput) {
      const { closeoutInput } = requireCloseoutGenerateVolatileInput(toolInput);
      const reporterResult = await input.reporter.createCapsule(closeoutInput);
      const validation = validateCloseoutCapsule(reporterResult.capsule);
      const capsule = validation.capsule;
      const capsuleHash = capsule ? closeoutCapsuleHash(capsule) : null;
      const ref = closeoutRef({
        runtimeJobId: closeoutInput.factualRefs.runtimeJobId,
        capsuleId: capsule?.capsuleId ?? null,
        invocationKey: toolInput.invocationId ?? toolInput.idempotencyKey,
      });
      const modelAuthored =
        reporterResult.source === "model" &&
        capsule?.humanReport.source === "model" &&
        capsule.roleCloseouts.every((role) => role.source === "model");
      const status: RuntimeToolExecutorResult["status"] =
        validation.valid && modelAuthored ? "succeeded" : "needs_review";
      const metadataBase = jsonObject(toolInput.metadata);
      const metadata: CloseoutGenerateRuntimeToolMetadata & Record<string, JsonValue> = {
        ...metadataBase,
        artifactKind: "closeout_generate_runtime_tool_metadata",
        capsuleId: capsule?.capsuleId ?? null,
        capsuleRef: ref,
        capsuleHash: capsuleHash ? `sha256:${capsuleHash}` : null,
        closeoutSource: reporterResult.source,
        modelRef: capsule?.modelRef ?? null,
        taskSuccess: capsule?.structuredSummary.taskSuccess ?? null,
        opportunitySeedCount: capsule?.opportunitySeeds.length ?? 0,
        roleCloseoutCount: capsule?.roleCloseouts.length ?? 0,
        validationBlockingReasons: validation.blockingReasons,
        reporterReasonCodes: reporterResult.reasonCodes.slice(0, 20),
        closeoutTiming: (reporterResult.closeoutTiming ?? null) as JsonValue | null,
        ...(capsule ? { capsule: capsule as unknown as JsonValue } : {}),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      };
      return {
        status,
        outputRef: ref,
        outputHash: capsuleHash
          ? `sha256:${capsuleHash}`
          : `sha256:${sha256(JSON.stringify(metadata))}`,
        outputSummary:
          status === "succeeded"
            ? `Model-authored Closeout Capsule ${capsule?.capsuleId ?? "unknown"} generated through closeout.generate.`
            : "Closeout generation needs review because model-authored capsule evidence was missing or invalid.",
        reasonCodes: [
          "closeout_generate_runtime_tool_completed",
          ...reporterResult.reasonCodes,
          ...(modelAuthored ? ["closeout_generate_model_authored"] : []),
          ...validation.blockingReasons,
          ...(reporterResult.source !== "model" ? ["degraded_closeout_diagnostic_only"] : []),
        ],
        metadata,
        artifacts: capsule
          ? [
              {
                invocationId: toolInput.invocationId ?? toolInput.idempotencyKey,
                artifactType: "execution_platform.closeout_capsule",
                storageKind: "metadata",
                artifactRef: ref,
                contentHash: `sha256:${capsuleHash}`,
                boundedSummary: `Closeout Capsule ${capsule.capsuleId} generated through closeout.generate.`,
                metadata: {
                  capsuleId: capsule.capsuleId,
                  capsuleHash: `sha256:${capsuleHash}`,
                  modelRef: capsule.modelRef,
                  taskSuccess: capsule.structuredSummary.taskSuccess,
                  source: reporterResult.source,
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                },
                rawContentStored: false,
                rawPromptStored: false,
                rawResponseStored: false,
                rawLogsStored: false,
                secretsStored: false,
              },
            ]
          : [],
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

export function registerCloseoutGenerateRuntimeTool(input: {
  registry: RuntimeToolRegistry;
  reporter: CloseoutGenerateReporter;
}): void {
  input.registry.register(
    buildCloseoutGenerateRuntimeToolDefinition(),
    createCloseoutGenerateRuntimeToolExecutor({ reporter: input.reporter }),
  );
}

export function closeoutGenerateMetadataFromResult(
  result: RuntimeToolExecutorResult | null,
): (CloseoutGenerateRuntimeToolMetadata & Record<string, JsonValue>) | null {
  const metadata = jsonObject(result?.metadata);
  return metadata.artifactKind === "closeout_generate_runtime_tool_metadata"
    ? (metadata as CloseoutGenerateRuntimeToolMetadata & Record<string, JsonValue>)
    : null;
}
