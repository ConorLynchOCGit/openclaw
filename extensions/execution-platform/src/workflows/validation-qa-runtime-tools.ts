import { createHash } from "node:crypto";
import type { JsonValue } from "../runtime-job-repository.ts";
import type {
  RuntimeToolKernel,
  RuntimeToolKernelInvokeResult,
} from "../runtime-tool-call/runtime-tool-kernel.ts";
import {
  buildRuntimeToolDefinition,
  type RuntimeToolRegistry,
} from "../runtime-tool-call/runtime-tool-registry.ts";
import type {
  RuntimeToolAuthorityClass,
  RuntimeToolExecutor,
  RuntimeToolFamily,
  RuntimeToolStatus,
} from "../runtime-tool-call/runtime-tool-types.ts";

export const VALIDATION_QA_RUNTIME_TOOL_IDS = [
  "validation.plan",
  "validation.select_commands",
  "validation.run_command",
  "validation.summarize_result",
  "validation.classify_failure",
  "validation.map_failure_to_commitments",
  "validation.propose_repair_plan",
  "validation.review_coverage",
  "validation.accept_validation_evidence",
  "qa.review_work_product",
  "qa.review_evidence_sufficiency",
] as const;

export type ValidationQaRuntimeToolId = (typeof VALIDATION_QA_RUNTIME_TOOL_IDS)[number];

export type ValidationQaRuntimeToolInvocationSummary = {
  toolId: ValidationQaRuntimeToolId;
  invocationRef: string;
  status: RuntimeToolStatus;
  outputRef: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
};

export type ValidationQaEvidencePacket = {
  packetRef: string;
  runtimeJobId: string;
  graphId: string;
  nodeId: string;
  commitmentIds: string[];
  validationTaskPacketRef: string | null;
  validationEvidenceRefs: string[];
  validationToolInvocationRefs: string[];
  failureClassificationRefs: string[];
  failureCommitmentMapRefs: string[];
  qaReviewRefs: string[];
  repairPlanRefs: string[];
  repairNodeRefs: string[];
  repairHandoffRefs: string[];
  status: "accepted" | "needs_review";
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogsStored: false;
  workQueueLifecycleMutated: false;
  authorityGranted: false;
};

export type ApprovedValidationCommandKind =
  | "pnpm_test_file"
  | "pnpm_tsgo_fast"
  | "pnpm_tsgo_full"
  | "external_runtime_ref";

export type ApprovedValidationCommandDefinition = {
  commandRef: string;
  commandKind: ApprovedValidationCommandKind;
  executable: "pnpm" | "external";
  args: string[];
  purposeSummary: string;
  commandHash: string;
  timeoutMs: number | null;
  rawCommandLogStored: false;
  rawStdoutStored: false;
  rawStderrStored: false;
};

export type ValidationTaskPacket = {
  packetKind: "validation_task_packet";
  schemaVersion: "execution-platform.validation-task-packet.v2";
  packetId: string;
  packetRef: string;
  runtimeJobId: string;
  graphId: string;
  nodeId: string;
  workflowId: string;
  targetCommitmentIds: string[];
  missionLedgerRefs: string[];
  commitmentWorkPacketRefs: string[];
  contextSnapshotRefs: string[];
  exactValidationObjective: string;
  whyValidationIsNeededNow: string;
  approvedValidationCommandRefs: string[];
  approvedValidationCommands: ApprovedValidationCommandDefinition[];
  commandSummaries: string[];
  targetFileRefs: string[];
  changedFileRefs: string[];
  contextRefs: string[];
  implementationOutputRefs: string[];
  expectedEvidenceClasses: string[];
  failureMappingExpectations: string[];
  repairHandoffExpectations: string[];
  downstreamConsumer: string;
  timeoutBudgetPolicyRefs: string[];
  stopOrEscalationConditions: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  workQueueLifecycleMutated: false;
  authorityGranted: false;
};

export type ValidationTaskPacketValidation = {
  valid: boolean;
  status: "ready" | "needs_review";
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

const VALIDATION_QA_TOOL_FAMILIES: Record<
  ValidationQaRuntimeToolId,
  { family: RuntimeToolFamily; authorityClass: RuntimeToolAuthorityClass; schemaRef: string }
> = {
  "validation.plan": {
    family: "validation.plan",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://validation/plan/v1",
  },
  "validation.select_commands": {
    family: "validation.plan",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://validation/select-commands/v1",
  },
  "validation.run_command": {
    family: "validation.run",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://validation/run-command/v1",
  },
  "validation.summarize_result": {
    family: "validation.result",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://validation/summarize-result/v1",
  },
  "validation.classify_failure": {
    family: "validation.review",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://validation/classify-failure/v1",
  },
  "validation.map_failure_to_commitments": {
    family: "validation.review",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://validation/map-failure-to-commitments/v1",
  },
  "validation.propose_repair_plan": {
    family: "validation.review",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://validation/propose-repair-plan/v1",
  },
  "validation.review_coverage": {
    family: "validation.review",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://validation/review-coverage/v1",
  },
  "validation.accept_validation_evidence": {
    family: "validation.result",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://validation/accept-validation-evidence/v1",
  },
  "qa.review_work_product": {
    family: "qa.review",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://qa/review-work-product/v1",
  },
  "qa.review_evidence_sufficiency": {
    family: "qa.review",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://qa/review-evidence-sufficiency/v1",
  },
};

function boundedSummary(value: string): string {
  return value.trim().slice(0, 1_200);
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function bounded(value: string | null | undefined, max = 1_200): string {
  return (value ?? "").trim().replace(/\s+/gu, " ").slice(0, max);
}

function unique(values: Array<string | null | undefined>, max: number, maxChars = 260): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
    .map((value) => bounded(value, maxChars))
    .slice(0, max);
}

function jsonObject(value: JsonValue | undefined): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
}

function stringArray(value: JsonValue | undefined, maxItems: number): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.length > 0)
        .slice(0, maxItems)
    : [];
}

function approvedCommandRef(value: JsonValue | undefined): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const trimmed = value.trim();
  return /^(?:validation-command|script|script-job|pnpm:test-file|command-ref):\/\//u.test(trimmed)
    ? trimmed
    : null;
}

function isApprovedCommandRef(value: string): boolean {
  return /^(?:validation-command|script|script-job|pnpm:test-file|command-ref):\/\//u.test(value);
}

function isSafeRepoPath(value: string): boolean {
  return (
    value.length > 0 && !value.startsWith("/") && !value.includes("..") && !/[;&|`$<>]/u.test(value)
  );
}

export function approvedValidationCommandDefinitionFor(
  commandRef: string,
): ApprovedValidationCommandDefinition | null {
  const trimmed = bounded(commandRef, 600);
  if (!trimmed) {
    return null;
  }
  const hashValue = hash(trimmed);
  if (isApprovedCommandRef(trimmed)) {
    return {
      commandRef: trimmed,
      commandKind: trimmed.startsWith("pnpm:test-file://")
        ? "pnpm_test_file"
        : "external_runtime_ref",
      executable: "external",
      args: [],
      purposeSummary: `Approved runtime validation command ref ${trimmed}.`,
      commandHash: `sha256:${hashValue}`,
      timeoutMs: null,
      rawCommandLogStored: false,
      rawStdoutStored: false,
      rawStderrStored: false,
    };
  }
  const parts = trimmed.split(/\s+/u);
  if (parts[0] === "pnpm" && parts[1] === "test:file" && parts.length >= 3) {
    const fileArgs = parts.slice(2);
    if (fileArgs.every(isSafeRepoPath)) {
      return {
        commandRef: `validation-command://${hashValue.slice(0, 16)}`,
        commandKind: "pnpm_test_file",
        executable: "pnpm",
        args: ["test:file", ...fileArgs],
        purposeSummary: `Run focused test files: ${fileArgs.slice(0, 5).join(", ")}.`,
        commandHash: `sha256:${hashValue}`,
        timeoutMs: 240_000,
        rawCommandLogStored: false,
        rawStdoutStored: false,
        rawStderrStored: false,
      };
    }
  }
  if (
    parts[0] === "pnpm" &&
    (parts[1] === "tsgo:fast" || parts[1] === "tsgo:full") &&
    parts.length === 2
  ) {
    return {
      commandRef: `validation-command://${hashValue.slice(0, 16)}`,
      commandKind: parts[1] === "tsgo:fast" ? "pnpm_tsgo_fast" : "pnpm_tsgo_full",
      executable: "pnpm",
      args: [parts[1]],
      purposeSummary: `Run ${parts[1]} type validation.`,
      commandHash: `sha256:${hashValue}`,
      timeoutMs: parts[1] === "tsgo:fast" ? 240_000 : 480_000,
      rawCommandLogStored: false,
      rawStdoutStored: false,
      rawStderrStored: false,
    };
  }
  return null;
}

export function validationCommandRefFor(commandRef: string): string {
  return approvedValidationCommandDefinitionFor(commandRef)?.commandRef ?? "";
}

export function buildValidationTaskPacket(input: {
  packetId?: string;
  runtimeJobId: string;
  graphId: string;
  nodeId: string;
  workflowId?: string;
  targetCommitmentIds: string[];
  missionLedgerRefs?: string[];
  commitmentWorkPacketRefs?: string[];
  contextSnapshotRefs?: string[];
  exactValidationObjective: string;
  whyValidationIsNeededNow?: string;
  validationCommandRefs: string[];
  targetFileRefs?: string[];
  changedFileRefs?: string[];
  contextRefs?: string[];
  implementationOutputRefs?: string[];
  expectedEvidenceClasses?: string[];
  failureMappingExpectations?: string[];
  repairHandoffExpectations?: string[];
  downstreamConsumer?: string;
  timeoutBudgetPolicyRefs?: string[];
  stopOrEscalationConditions?: string[];
}): ValidationTaskPacket {
  const packetId = bounded(
    input.packetId ?? `${input.graphId}:${input.nodeId}:validation-task`,
    180,
  );
  const approvedValidationCommands = input.validationCommandRefs
    .map((commandRef) => approvedValidationCommandDefinitionFor(commandRef))
    .filter((command): command is ApprovedValidationCommandDefinition => Boolean(command))
    .filter(
      (command, index, commands) =>
        commands.findIndex((candidate) => candidate.commandRef === command.commandRef) === index,
    )
    .slice(0, 16);
  const approvedValidationCommandRefs = approvedValidationCommands.map(
    (command) => command.commandRef,
  );
  const commandSummaries = unique(
    approvedValidationCommands.map((command) => command.purposeSummary),
    16,
    500,
  );
  const base = {
    packetKind: "validation_task_packet" as const,
    schemaVersion: "execution-platform.validation-task-packet.v2" as const,
    packetId,
    packetRef: "pending",
    runtimeJobId: bounded(input.runtimeJobId, 180),
    graphId: bounded(input.graphId, 180),
    nodeId: bounded(input.nodeId, 180),
    workflowId: bounded(input.workflowId ?? "agent_team.coding", 180),
    targetCommitmentIds: unique(input.targetCommitmentIds, 20, 160),
    missionLedgerRefs: unique(input.missionLedgerRefs ?? [], 20, 260),
    commitmentWorkPacketRefs: unique(input.commitmentWorkPacketRefs ?? [], 40, 260),
    contextSnapshotRefs: unique(input.contextSnapshotRefs ?? [], 40, 260),
    exactValidationObjective: bounded(input.exactValidationObjective, 1_500),
    whyValidationIsNeededNow: bounded(
      input.whyValidationIsNeededNow ??
        "Validation is required to produce accepted Mission Ledger evidence before closeout.",
      1_200,
    ),
    approvedValidationCommandRefs,
    approvedValidationCommands,
    commandSummaries,
    targetFileRefs: unique(input.targetFileRefs ?? [], 40, 260),
    changedFileRefs: unique(input.changedFileRefs ?? [], 40, 260),
    contextRefs: unique(input.contextRefs ?? [], 40, 260),
    implementationOutputRefs: unique(input.implementationOutputRefs ?? [], 40, 260),
    expectedEvidenceClasses: unique(input.expectedEvidenceClasses ?? ["test_validation"], 12, 120),
    failureMappingExpectations: unique(
      input.failureMappingExpectations ?? [
        "Map failed validation refs to the commitments they block.",
      ],
      12,
      700,
    ),
    repairHandoffExpectations: unique(
      input.repairHandoffExpectations ?? [
        "Create repair work with failed validation refs, commitment ids, changed file refs, and bounded failure summary.",
      ],
      12,
      700,
    ),
    downstreamConsumer: bounded(input.downstreamConsumer ?? "mission_ledger_and_closeout", 260),
    timeoutBudgetPolicyRefs: unique(input.timeoutBudgetPolicyRefs ?? [], 12, 260),
    stopOrEscalationConditions: unique(
      input.stopOrEscalationConditions ?? [
        "Stop as needs_review when no approved validation command refs exist.",
        "Create same-job repair work for recoverable failures.",
      ],
      12,
      700,
    ),
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawCommandLogStored: false as const,
    rawDbRowsStored: false as const,
    workQueueLifecycleMutated: false as const,
    authorityGranted: false as const,
  };
  return {
    ...base,
    packetRef: `runtime-work-graph://validation-task-packet/${packetId}/${hash(JSON.stringify(base)).slice(0, 16)}`,
  };
}

export function validateValidationTaskPacket(
  packet: ValidationTaskPacket,
): ValidationTaskPacketValidation {
  const reasonCodes: string[] = [];
  if (!packet.exactValidationObjective.trim()) {
    reasonCodes.push("validation_task_packet_objective_missing");
  }
  if (packet.targetCommitmentIds.length === 0) {
    reasonCodes.push("validation_task_packet_commitment_ids_missing");
  }
  if (packet.approvedValidationCommandRefs.length === 0) {
    reasonCodes.push("validation_task_packet_command_refs_missing");
  }
  if (packet.approvedValidationCommands.length === 0) {
    reasonCodes.push("validation_task_packet_command_definitions_missing");
  }
  for (const commandRef of packet.approvedValidationCommandRefs) {
    if (!approvedCommandRef(commandRef as JsonValue)) {
      reasonCodes.push("validation_task_packet_command_ref_not_approved");
      break;
    }
  }
  for (const command of packet.approvedValidationCommands) {
    if (!approvedCommandRef(command.commandRef as JsonValue)) {
      reasonCodes.push("validation_task_packet_command_definition_ref_not_approved");
      break;
    }
    if (command.executable === "pnpm" && command.args.length === 0) {
      reasonCodes.push("validation_task_packet_command_definition_args_missing");
      break;
    }
    if (command.rawCommandLogStored || command.rawStdoutStored || command.rawStderrStored) {
      reasonCodes.push("validation_task_packet_command_definition_raw_storage_flag_invalid");
      break;
    }
  }
  if (
    packet.rawPromptStored ||
    packet.rawResponseStored ||
    packet.rawProviderLogStored ||
    packet.rawToolLogStored ||
    packet.rawCommandLogStored ||
    packet.rawDbRowsStored
  ) {
    reasonCodes.push("validation_task_packet_raw_storage_flag_invalid");
  }
  return {
    valid: reasonCodes.length === 0,
    status: reasonCodes.length === 0 ? "ready" : "needs_review",
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function defaultValidationQaToolExecutor(toolId: ValidationQaRuntimeToolId): RuntimeToolExecutor {
  return {
    async execute(input) {
      const metadata = jsonObject(input.metadata);
      if (toolId === "validation.select_commands") {
        const commands = Array.isArray(metadata.approvedValidationCommands)
          ? metadata.approvedValidationCommands
          : [];
        if (commands.length === 0) {
          return {
            status: "needs_review",
            outputRef: `runtime-tool-output://${input.invocationId ?? toolId}`,
            outputHash: `validation-tool:${toolId}:${input.idempotencyKey}:needs-review`,
            outputSummary:
              "Validation command selection needs approved runtime command definitions.",
            errorCode: "validation_select_commands_definitions_missing",
            errorSummary:
              "validation.select_commands requires approvedValidationCommands from the validation task packet.",
            reasonCodes: ["validation_select_commands_definitions_missing"],
            metadata: {
              validationQaRuntimeToolRecorded: true,
              rawCommandLogsStored: false,
              rawPromptStored: false,
              rawResponseStored: false,
            } as JsonValue,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
            rawCommandLogStored: false,
            rawDbRowsStored: false,
          };
        }
      }

      if (toolId === "validation.run_command") {
        const commandRef =
          approvedCommandRef(metadata.approvedCommandRef) ??
          approvedCommandRef(metadata.commandRef);
        const commandDefinition = jsonObject(metadata.approvedCommandDefinition);
        if (!commandRef) {
          return {
            status: "needs_review",
            outputRef: `runtime-tool-output://${input.invocationId ?? toolId}`,
            outputHash: `validation-tool:${toolId}:${input.idempotencyKey}:needs-review`,
            outputSummary:
              "Validation command execution was not accepted because an approved bounded command ref was missing.",
            errorCode: "validation_run_command_approved_command_ref_missing",
            errorSummary:
              "validation.run_command requires a command ref such as validation-command:// or script://.",
            reasonCodes: ["validation_run_command_approved_command_ref_missing"],
            metadata: {
              validationQaRuntimeToolRecorded: true,
              rawCommandLogsStored: false,
              rawPromptStored: false,
              rawResponseStored: false,
            } as JsonValue,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
            rawCommandLogStored: false,
            rawDbRowsStored: false,
          };
        }
        if (
          !commandDefinition.commandRef ||
          commandDefinition.commandRef !== commandRef ||
          commandDefinition.rawCommandLogStored === true ||
          commandDefinition.rawStdoutStored === true ||
          commandDefinition.rawStderrStored === true
        ) {
          return {
            status: "needs_review",
            outputRef: `runtime-tool-output://${input.invocationId ?? toolId}`,
            outputHash: `validation-tool:${toolId}:${input.idempotencyKey}:needs-review`,
            outputSummary:
              "Validation command execution was not accepted because the approved command definition was missing or unsafe.",
            errorCode: "validation_run_command_definition_missing",
            errorSummary:
              "validation.run_command requires the runtime-owned approved command definition for the command ref.",
            reasonCodes: ["validation_run_command_definition_missing"],
            metadata: {
              validationQaRuntimeToolRecorded: true,
              rawCommandLogsStored: false,
              rawPromptStored: false,
              rawResponseStored: false,
            } as JsonValue,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
            rawCommandLogStored: false,
            rawDbRowsStored: false,
          };
        }
      }

      if (toolId === "validation.accept_validation_evidence") {
        const refs = stringArray(metadata.validationEvidenceRefs, 20);
        const toolRefs = stringArray(metadata.validationToolInvocationRefs, 20);
        if (refs.length === 0 || toolRefs.length === 0) {
          return {
            status: "needs_review",
            outputRef: `runtime-tool-output://${input.invocationId ?? toolId}`,
            outputHash: `validation-tool:${toolId}:${input.idempotencyKey}:needs-review`,
            outputSummary:
              "Validation evidence could not be accepted without validation refs and runtime tool invocation refs.",
            errorCode: "validation_evidence_packet_refs_missing",
            errorSummary:
              "Accepted validation evidence requires bounded validation refs and runtime tool refs.",
            reasonCodes: ["validation_evidence_packet_refs_missing"],
            metadata: {
              validationQaRuntimeToolRecorded: true,
              rawCommandLogsStored: false,
              rawPromptStored: false,
              rawResponseStored: false,
            } as JsonValue,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
            rawCommandLogStored: false,
            rawDbRowsStored: false,
          };
        }
      }

      return {
        status: "succeeded",
        outputRef: `runtime-tool-output://${input.invocationId ?? toolId}`,
        outputHash: `validation-tool:${toolId}:${input.idempotencyKey}`,
        outputSummary: boundedSummary(
          `${toolId} recorded bounded validation/QA operation evidence.`,
        ),
        reasonCodes: [`${toolId.replaceAll(".", "_")}_recorded`],
        metadata: {
          ...metadata,
          validationQaRuntimeToolRecorded: true,
          rawCommandLogsStored: false,
          rawPromptStored: false,
          rawResponseStored: false,
        } as JsonValue,
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

export function buildValidationQaRuntimeToolDefinition(toolId: ValidationQaRuntimeToolId) {
  const config = VALIDATION_QA_TOOL_FAMILIES[toolId];
  return buildRuntimeToolDefinition({
    toolId,
    toolVersion: "v1",
    toolFamily: config.family,
    executorKey: `validation-qa.${toolId}`,
    schemaRef: config.schemaRef,
    authorityClass: config.authorityClass,
    defaultTimeoutMs: 120_000,
    enabled: true,
  });
}

export function registerValidationQaRuntimeTools(input: { registry: RuntimeToolRegistry }): void {
  for (const toolId of VALIDATION_QA_RUNTIME_TOOL_IDS) {
    input.registry.register(
      buildValidationQaRuntimeToolDefinition(toolId),
      defaultValidationQaToolExecutor(toolId),
    );
  }
}

export async function invokeValidationQaRuntimeTool(input: {
  kernel: RuntimeToolKernel;
  toolId: ValidationQaRuntimeToolId;
  runtimeJobId?: string | null;
  graphId: string;
  nodeId?: string | null;
  roleRef?: string | null;
  modelRef?: string | null;
  idempotencyKey: string;
  inputRef?: string | null;
  inputHash?: string | null;
  inputSummary: string;
  metadata?: JsonValue;
}): Promise<ValidationQaRuntimeToolInvocationSummary> {
  const result: RuntimeToolKernelInvokeResult = await input.kernel.invoke({
    toolId: input.toolId,
    runtimeJobId: input.runtimeJobId ?? null,
    graphId: input.graphId,
    nodeId: input.nodeId ?? null,
    roleRef: input.roleRef ?? null,
    modelRef: input.modelRef ?? null,
    idempotencyScope: `validation-qa:${input.graphId}`,
    idempotencyKey: input.idempotencyKey,
    inputRef: input.inputRef ?? null,
    inputHash: input.inputHash ?? null,
    inputSummary: boundedSummary(input.inputSummary),
    metadata: input.metadata ?? null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
    authorityGranted: false,
    controlsApplied: false,
    workQueueLifecycleMutated: false,
    runtimeLifecycleMutated: false,
  });
  return {
    toolId: input.toolId,
    invocationRef: result.invocationRef,
    status: result.invocation.status,
    outputRef: result.invocation.outputRef,
    reasonCodes: result.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
  };
}

export function buildValidationQaEvidencePacket(input: {
  packetRef: string;
  runtimeJobId: string;
  graphId: string;
  nodeId: string;
  commitmentIds: string[];
  validationTaskPacketRef?: string | null;
  validationEvidenceRefs: string[];
  validationToolInvocationRefs: string[];
  failureClassificationRefs?: string[];
  failureCommitmentMapRefs?: string[];
  qaReviewRefs?: string[];
  repairPlanRefs?: string[];
  repairNodeRefs?: string[];
  repairHandoffRefs?: string[];
  status: "accepted" | "needs_review";
  reasonCodes?: string[];
}): ValidationQaEvidencePacket {
  return {
    packetRef: input.packetRef,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    nodeId: input.nodeId,
    commitmentIds: [...new Set(input.commitmentIds)].slice(0, 20),
    validationTaskPacketRef: input.validationTaskPacketRef ?? null,
    validationEvidenceRefs: [...new Set(input.validationEvidenceRefs)].slice(0, 20),
    validationToolInvocationRefs: [...new Set(input.validationToolInvocationRefs)].slice(0, 30),
    failureClassificationRefs: [...new Set(input.failureClassificationRefs ?? [])].slice(0, 20),
    failureCommitmentMapRefs: [...new Set(input.failureCommitmentMapRefs ?? [])].slice(0, 20),
    qaReviewRefs: [...new Set(input.qaReviewRefs ?? [])].slice(0, 20),
    repairPlanRefs: [...new Set(input.repairPlanRefs ?? [])].slice(0, 20),
    repairNodeRefs: [...new Set(input.repairNodeRefs ?? [])].slice(0, 20),
    repairHandoffRefs: [...new Set(input.repairHandoffRefs ?? [])].slice(0, 20),
    status: input.status,
    reasonCodes: [...new Set(input.reasonCodes ?? [])].slice(0, 20),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogsStored: false,
    workQueueLifecycleMutated: false,
    authorityGranted: false,
  };
}

export function assertValidationQaEvidencePacketCanClose(packet: ValidationQaEvidencePacket): void {
  if (packet.status !== "accepted") {
    throw new Error("validation_qa_packet_not_accepted");
  }
  if (packet.commitmentIds.length === 0) {
    throw new Error("validation_qa_packet_commitment_ids_missing");
  }
  if (packet.validationEvidenceRefs.length === 0) {
    throw new Error("validation_qa_packet_validation_refs_missing");
  }
  if (packet.validationToolInvocationRefs.length === 0) {
    throw new Error("validation_qa_packet_tool_refs_missing");
  }
}
