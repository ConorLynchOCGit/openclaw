import { isRecord } from "./safe-record.js";

/** Bounded progress evidence projected onto readback rows. */
export type ReadbackProgressProjection = {
  source: "trajectory" | "subagent-registry" | "task-run-event" | "task-registry";
  ref: string;
  currentPhase?: string | null;
  activeLabel?: string | null;
  observedAt?: string | null;
  elapsedMs?: number | null;
  durationMs?: number | null;
  sourceEventType?: string;
  sourceEventSeq?: number;
  toolName?: string | null;
  command?: string | null;
  exitCode?: number | null;
  validationClass?: string | null;
  outputSummary?: string | null;
  repairAction?: string | null;
  childRole?: string | null;
  childAgentPath?: string | null;
  childPhase?: string | null;
  spawnReason?: string | null;
  diffReviewed?: boolean | null;
  note?: string | null;
  pointer?: {
    kind: "artifact" | "inspect-next" | "session" | "task" | "trajectory";
    ref: string;
    label?: string;
  };
  derivedBy: string;
  bounded: true;
};

function normalizeSource(value: unknown): ReadbackProgressProjection["source"] | undefined {
  return value === "trajectory" ||
    value === "subagent-registry" ||
    value === "task-run-event" ||
    value === "task-registry"
    ? value
    : undefined;
}

function normalizePointer(value: unknown): ReadbackProgressProjection["pointer"] | undefined {
  if (!isRecord(value) || typeof value.ref !== "string") {
    return undefined;
  }
  if (
    value.kind !== "artifact" &&
    value.kind !== "inspect-next" &&
    value.kind !== "session" &&
    value.kind !== "task" &&
    value.kind !== "trajectory"
  ) {
    return undefined;
  }
  return {
    kind: value.kind,
    ref: value.ref,
    ...(typeof value.label === "string" ? { label: value.label } : {}),
  };
}

export function normalizeReadbackProgressProjection(
  value: unknown,
): ReadbackProgressProjection | undefined {
  if (!isRecord(value) || value.bounded !== true || typeof value.ref !== "string") {
    return undefined;
  }
  const source = normalizeSource(value.source);
  if (!source || typeof value.derivedBy !== "string" || !value.derivedBy.trim()) {
    return undefined;
  }
  const pointer = normalizePointer(value.pointer);
  return {
    source,
    ref: value.ref,
    derivedBy: value.derivedBy,
    bounded: true,
    ...(typeof value.currentPhase === "string" || value.currentPhase === null
      ? { currentPhase: value.currentPhase }
      : {}),
    ...(typeof value.activeLabel === "string" || value.activeLabel === null
      ? { activeLabel: value.activeLabel }
      : {}),
    ...(typeof value.observedAt === "string" || value.observedAt === null
      ? { observedAt: value.observedAt }
      : {}),
    ...(typeof value.elapsedMs === "number" || value.elapsedMs === null
      ? { elapsedMs: value.elapsedMs }
      : {}),
    ...(typeof value.durationMs === "number" || value.durationMs === null
      ? { durationMs: value.durationMs }
      : {}),
    ...(typeof value.sourceEventType === "string"
      ? { sourceEventType: value.sourceEventType }
      : {}),
    ...(typeof value.sourceEventSeq === "number" ? { sourceEventSeq: value.sourceEventSeq } : {}),
    ...(typeof value.toolName === "string" || value.toolName === null
      ? { toolName: value.toolName }
      : {}),
    ...(typeof value.command === "string" || value.command === null
      ? { command: value.command }
      : {}),
    ...(typeof value.exitCode === "number" || value.exitCode === null
      ? { exitCode: value.exitCode }
      : {}),
    ...(typeof value.validationClass === "string" || value.validationClass === null
      ? { validationClass: value.validationClass }
      : {}),
    ...(typeof value.outputSummary === "string" || value.outputSummary === null
      ? { outputSummary: value.outputSummary }
      : {}),
    ...(typeof value.repairAction === "string" || value.repairAction === null
      ? { repairAction: value.repairAction }
      : {}),
    ...(typeof value.childRole === "string" || value.childRole === null
      ? { childRole: value.childRole }
      : {}),
    ...(typeof value.childAgentPath === "string" || value.childAgentPath === null
      ? { childAgentPath: value.childAgentPath }
      : {}),
    ...(typeof value.childPhase === "string" || value.childPhase === null
      ? { childPhase: value.childPhase }
      : {}),
    ...(typeof value.spawnReason === "string" || value.spawnReason === null
      ? { spawnReason: value.spawnReason }
      : {}),
    ...(typeof value.diffReviewed === "boolean" || value.diffReviewed === null
      ? { diffReviewed: value.diffReviewed }
      : {}),
    ...(typeof value.note === "string" || value.note === null ? { note: value.note } : {}),
    ...(pointer ? { pointer } : {}),
  };
}
