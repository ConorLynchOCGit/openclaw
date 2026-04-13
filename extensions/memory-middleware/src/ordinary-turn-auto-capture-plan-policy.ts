import type { OrdinaryTurnAutoCaptureMatch } from "./memory-ingestion-types.js";

export type OrdinaryTurnAutoCaptureCompatibilityLane =
  | "preference"
  | "response_style"
  | "project_fact"
  | "recurring_procedure"
  | "workflow_improvement";

/**
 * Deprecated alias while downstream runtime wiring migrates away from lane-shaped naming.
 * These values are compatibility routing labels, not canonical memory classes.
 */
export type OrdinaryTurnAutoCaptureLane = OrdinaryTurnAutoCaptureCompatibilityLane;

export type OrdinaryTurnAutoCapturePosture = "default" | "bulk";

export type OrdinaryTurnAutoCaptureSubmissionMode = "immediate" | "deferred_overflow";

export type OrdinaryTurnAutoCaptureTurnState = {
  acceptedKeys: Set<string>;
  deferredKeys: Set<string>;
  immediateLaneCounts: Map<OrdinaryTurnAutoCaptureCompatibilityLane, number>;
};

export type OrdinaryTurnAutoCapturePlan =
  | {
      kind: "response_style_forget";
      key: string;
      compatibilityLane: "response_style";
      subjectKey: string;
      segmentIndex: number;
      score: number;
      rankSignals: string[];
      supportsDeferredOverflow: false;
      run(params: {
        submissionMode: OrdinaryTurnAutoCaptureSubmissionMode;
        turnState: OrdinaryTurnAutoCaptureTurnState;
        posture: OrdinaryTurnAutoCapturePosture;
        rank: number;
        candidatePoolSize: number;
      }): Promise<boolean>;
    }
  | {
      kind: "capture";
      key: string;
      compatibilityLane: OrdinaryTurnAutoCaptureCompatibilityLane;
      subjectKey: string;
      segmentIndex: number;
      score: number;
      rankSignals: string[];
      supportsDeferredOverflow: boolean;
      run(params: {
        submissionMode: OrdinaryTurnAutoCaptureSubmissionMode;
        turnState: OrdinaryTurnAutoCaptureTurnState;
        posture: OrdinaryTurnAutoCapturePosture;
        rank: number;
        candidatePoolSize: number;
      }): Promise<boolean>;
    };

export const AUTO_CAPTURE_LANE_LIMITS: Record<
  OrdinaryTurnAutoCapturePosture,
  Record<OrdinaryTurnAutoCaptureCompatibilityLane, number>
> = {
  default: {
    preference: 2,
    response_style: 2,
    project_fact: 2,
    recurring_procedure: 1,
    workflow_improvement: 1,
  },
  bulk: {
    preference: 4,
    response_style: 3,
    project_fact: 4,
    recurring_procedure: 2,
    workflow_improvement: 2,
  },
};

export const AUTO_CAPTURE_LANE_BASE_SCORES: Record<
  OrdinaryTurnAutoCaptureCompatibilityLane,
  { score: number; signal: string }
> = {
  preference: { score: 400, signal: "profile:preference" },
  project_fact: { score: 360, signal: "profile:project_fact" },
  response_style: { score: 320, signal: "profile:response_style" },
  recurring_procedure: { score: 280, signal: "profile:recurring_procedure" },
  workflow_improvement: { score: 240, signal: "profile:workflow_improvement" },
};

export function createOrdinaryTurnAutoCaptureTurnState(): OrdinaryTurnAutoCaptureTurnState {
  return {
    acceptedKeys: new Set<string>(),
    deferredKeys: new Set<string>(),
    immediateLaneCounts: new Map<OrdinaryTurnAutoCaptureCompatibilityLane, number>(),
  };
}

export function hasReachedMultiCaptureTurnLimit(params: {
  turnState: OrdinaryTurnAutoCaptureTurnState;
  posture?: OrdinaryTurnAutoCapturePosture;
}): boolean {
  return (
    params.turnState.acceptedKeys.size >= resolveImmediateCaptureLimit(params.posture ?? "default")
  );
}

export function markTurnAcceptedCaptureForLane(
  turnState: OrdinaryTurnAutoCaptureTurnState,
  key: string,
  compatibilityLane: OrdinaryTurnAutoCaptureCompatibilityLane,
): void {
  turnState.acceptedKeys.add(key);
  turnState.immediateLaneCounts.set(
    compatibilityLane,
    (turnState.immediateLaneCounts.get(compatibilityLane) ?? 0) + 1,
  );
}

export function markTurnDeferredOverflow(
  turnState: OrdinaryTurnAutoCaptureTurnState,
  key: string,
): void {
  turnState.deferredKeys.add(key);
}

export function resolveImmediateCaptureLimit(posture: OrdinaryTurnAutoCapturePosture): number {
  return posture === "bulk" ? 6 : 3;
}

export function resolveDeferredOverflowLimit(posture: OrdinaryTurnAutoCapturePosture): number {
  return posture === "bulk" ? 24 : 8;
}

export function hasImmediateLaneCapacity(params: {
  turnState: OrdinaryTurnAutoCaptureTurnState;
  posture: OrdinaryTurnAutoCapturePosture;
  compatibilityLane: OrdinaryTurnAutoCaptureCompatibilityLane;
}): boolean {
  return (
    (params.turnState.immediateLaneCounts.get(params.compatibilityLane) ?? 0) <
    AUTO_CAPTURE_LANE_LIMITS[params.posture][params.compatibilityLane]
  );
}

export function resolveCapturePlanPosture(params: {
  text: string;
  captureSegments: readonly string[];
  candidatePlanCount: number;
  explicitCandidateCount: number;
  hasExplicitMemoryRequest: (text: string) => boolean;
}): OrdinaryTurnAutoCapturePosture {
  if (params.hasExplicitMemoryRequest(params.text)) {
    return "bulk";
  }
  if (params.explicitCandidateCount >= 6) {
    return "bulk";
  }
  if (params.candidatePlanCount >= 8 && params.captureSegments.length >= 6) {
    return "bulk";
  }
  return "default";
}

export function resolveCapturePlanBaseScore(plan: OrdinaryTurnAutoCapturePlan): {
  score: number;
  signals: string[];
} {
  if (plan.kind === "response_style_forget") {
    return {
      score: 10_000,
      signals: ["response_style_forget"],
    };
  }
  const laneScore = AUTO_CAPTURE_LANE_BASE_SCORES[plan.compatibilityLane];
  return { score: laneScore.score, signals: [laneScore.signal] };
}

export function applyCapturePlanDecisionScore(params: {
  score: number;
  signals: string[];
  detectionSource?: "deterministic" | "semantic";
  confidence?: "high" | "medium" | "low";
  reviewMode?: "direct" | "pending_confirmation" | "hold_for_more_evidence";
  captureClass?: string;
  candidateKind?: OrdinaryTurnAutoCaptureMatch["candidateKind"];
}): { score: number; signals: string[] } {
  const signals = [...params.signals];
  let score = params.score;
  if (params.detectionSource === "deterministic") {
    score += 70;
    signals.push("detection:deterministic");
  } else if (params.detectionSource === "semantic") {
    score += 35;
    signals.push("detection:semantic");
  }
  if (params.confidence === "high") {
    score += 45;
    signals.push("confidence:high");
  } else if (params.confidence === "medium") {
    score += 20;
    signals.push("confidence:medium");
  }
  if (params.reviewMode === "direct") {
    score += 35;
    signals.push("review:direct");
  } else if (params.reviewMode === "pending_confirmation") {
    score += 15;
    signals.push("review:pending_confirmation");
  } else if (params.reviewMode === "hold_for_more_evidence") {
    signals.push("review:hold_for_more_evidence");
  }
  if (params.candidateKind === "correction") {
    score += 25;
    signals.push("candidate:correction");
  }
  if (params.captureClass?.startsWith("explicit_")) {
    score += 25;
    signals.push("capture:explicit");
  }
  if (params.captureClass?.includes("correction")) {
    score += 20;
    signals.push("capture:correction");
  }
  return {
    score,
    signals,
  };
}
