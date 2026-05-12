import { createHash } from "node:crypto";

export type CodexParityValidationCommand = {
  commandRef: string;
  approvedCommandId: string;
  required: boolean;
};

export type CodexParityValidationRecord = {
  commandRef: string;
  approvedCommandId: string;
  status: "passed" | "failed" | "skipped";
  exitCode: number | null;
  durationMs: number;
  boundedSummary: string;
  outputHash: string | null;
  skippedReason: string | null;
  rawCommandLogStored: false;
};

export type CodexParityValidationAccounting = {
  artifactKind: "codex_parity_validation_accounting";
  requiredValidationCount: number;
  recordedValidationCount: number;
  skippedValidationCount: number;
  unknownValidationCount: number;
  allRequiredValidationStatesKnown: boolean;
  allRequiredValidationAccepted: boolean;
  records: CodexParityValidationRecord[];
  reasonCodes: string[];
  rawCommandLogsStored: false;
};

export type CodexParityValidationRunner = (
  command: CodexParityValidationCommand,
) => Promise<CodexParityValidationRecord>;

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createCodexParityValidationRecord(input: {
  commandRef: string;
  approvedCommandId: string;
  status: "passed" | "failed" | "skipped";
  exitCode?: number | null;
  durationMs?: number;
  boundedSummary: string;
  rawOutput?: string | null;
  skippedReason?: string | null;
}): CodexParityValidationRecord {
  return {
    commandRef: input.commandRef,
    approvedCommandId: input.approvedCommandId,
    status: input.status,
    exitCode: input.exitCode ?? null,
    durationMs: input.durationMs ?? 0,
    boundedSummary: input.boundedSummary.trim().slice(0, 600),
    outputHash: input.rawOutput ? sha256Text(input.rawOutput) : null,
    skippedReason:
      input.status === "skipped" ? (input.skippedReason ?? "validation_skipped") : null,
    rawCommandLogStored: false,
  };
}

export async function runCodexParityValidationAccounting(input: {
  requiredCommands: CodexParityValidationCommand[];
  runner: CodexParityValidationRunner;
}): Promise<CodexParityValidationAccounting> {
  const records: CodexParityValidationRecord[] = [];
  for (const command of input.requiredCommands) {
    records.push(await input.runner(command));
  }
  return buildCodexParityValidationAccounting({
    requiredCommands: input.requiredCommands,
    records,
  });
}

export function buildCodexParityValidationAccounting(input: {
  requiredCommands: CodexParityValidationCommand[];
  records: CodexParityValidationRecord[];
}): CodexParityValidationAccounting {
  const recordsById = new Map(input.records.map((record) => [record.approvedCommandId, record]));
  const required = input.requiredCommands.filter((command) => command.required);
  const unknown = required.filter((command) => !recordsById.has(command.approvedCommandId));
  const requiredRecords = required
    .map((command) => recordsById.get(command.approvedCommandId))
    .filter((record): record is CodexParityValidationRecord => Boolean(record));
  const allRequiredValidationAccepted =
    unknown.length === 0 && requiredRecords.every((record) => record.status === "passed");
  const reasonCodes = [
    ...(unknown.length > 0 ? ["required_validation_state_unknown"] : []),
    ...requiredRecords
      .filter((record) => record.status === "failed")
      .map((record) => `validation_failed:${record.approvedCommandId}`),
    ...requiredRecords
      .filter((record) => record.status === "skipped")
      .map((record) => `validation_skipped:${record.approvedCommandId}`),
    ...(allRequiredValidationAccepted ? ["all_required_validation_states_known"] : []),
  ];
  return {
    artifactKind: "codex_parity_validation_accounting",
    requiredValidationCount: required.length,
    recordedValidationCount: input.records.length,
    skippedValidationCount: input.records.filter((record) => record.status === "skipped").length,
    unknownValidationCount: unknown.length,
    allRequiredValidationStatesKnown: unknown.length === 0,
    allRequiredValidationAccepted,
    records: input.records,
    reasonCodes,
    rawCommandLogsStored: false,
  };
}
