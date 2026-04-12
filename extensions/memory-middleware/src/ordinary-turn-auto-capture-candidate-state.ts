import type {
  OrdinaryTurnAutoCaptureLane,
  OrdinaryTurnAutoCapturePosture,
} from "./ordinary-turn-auto-capture-plan-policy.js";

export function asOrdinaryTurnMetadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function readOrdinaryTurnNestedMetadataString(
  metadata: Record<string, unknown> | undefined,
  path: readonly string[],
): string | undefined {
  let current: unknown = metadata;
  for (const segment of path) {
    current = asOrdinaryTurnMetadataRecord(current)[segment];
    if (current === undefined) {
      return undefined;
    }
  }
  return typeof current === "string" && current.trim().length > 0 ? current.trim() : undefined;
}

export function readCandidateLifecycleState(
  metadata: Record<string, unknown> | undefined,
): "pending_confirmation" | "hold_for_more_evidence" | undefined {
  const state = readOrdinaryTurnNestedMetadataString(metadata, ["candidateLifecycle", "state"]);
  return state === "pending_confirmation" || state === "hold_for_more_evidence" ? state : undefined;
}

export function readCandidateOverflowMode(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  return readOrdinaryTurnNestedMetadataString(metadata, ["candidateOverflow", "mode"]);
}

export function readCandidateObservedAt(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  return (
    readOrdinaryTurnNestedMetadataString(metadata, ["candidateLifecycle", "observedAt"]) ??
    readOrdinaryTurnNestedMetadataString(metadata, ["candidateLifecycle", "firstObservedAt"])
  );
}

export function buildDeferredOverflowMetadata(params: {
  lane: OrdinaryTurnAutoCaptureLane;
  posture: OrdinaryTurnAutoCapturePosture;
  state: "pending_confirmation" | "hold_for_more_evidence";
  rank: number;
  candidatePoolSize: number;
  observedAt?: string;
  evidence: string[];
  extraLifecycle?: Record<string, unknown>;
  confirmationWindowMs?: number;
}): Record<string, unknown> {
  const observedAt = params.observedAt ?? new Date().toISOString();
  const expiresAt = new Date(
    Date.parse(observedAt) + (params.confirmationWindowMs ?? 72 * 60 * 60 * 1000),
  ).toISOString();
  return {
    candidateLifecycle: {
      family: params.lane,
      state: params.state,
      evidenceCount: 1,
      firstObservedAt: observedAt,
      observedAt,
      expiresAt,
      evidence: params.evidence,
      ...(params.extraLifecycle ?? {}),
    },
    candidateOverflow: {
      mode: "deferred_overflow",
      posture: params.posture,
      rank: params.rank,
      candidatePoolSize: params.candidatePoolSize,
      firstObservedAt: observedAt,
    },
  };
}
