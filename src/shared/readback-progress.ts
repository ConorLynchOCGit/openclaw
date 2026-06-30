import { isRecord } from "./safe-record.js";

/** Bounded progress evidence projected onto readback rows. */
export type ReadbackProgressProjection = {
  source: "trajectory" | "subagent-registry" | "task-run-event";
  ref: string;
  currentPhase?: string | null;
  activeLabel?: string | null;
  observedAt?: string | null;
  elapsedMs?: number | null;
  sourceEventType?: string;
  sourceEventSeq?: number;
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
  return value === "trajectory" || value === "subagent-registry" || value === "task-run-event"
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
    ...(typeof value.sourceEventType === "string"
      ? { sourceEventType: value.sourceEventType }
      : {}),
    ...(typeof value.sourceEventSeq === "number" ? { sourceEventSeq: value.sourceEventSeq } : {}),
    ...(typeof value.note === "string" || value.note === null ? { note: value.note } : {}),
    ...(pointer ? { pointer } : {}),
  };
}
