import type { CalibrationReport } from "./calibration-report.ts";

export type ReadinessGateThresholds = {
  minCaptureRate: number;
  maxIgnoreRate: number;
  maxDuplicateRate: number;
  maxSupersessionRate: number;
  maxOmissionDivergenceCount: number;
};

export type ReadinessGateResult = {
  ready: boolean;
  reasons: string[];
  thresholds: ReadinessGateThresholds;
};

export const DEFAULT_READINESS_THRESHOLDS: ReadinessGateThresholds = {
  minCaptureRate: 0.2,
  maxIgnoreRate: 0.8,
  maxDuplicateRate: 0.5,
  maxSupersessionRate: 0.5,
  maxOmissionDivergenceCount: 0,
};

export function evaluateModelMemoryReadiness(input: {
  report: CalibrationReport;
  thresholds?: Partial<ReadinessGateThresholds>;
}): ReadinessGateResult {
  const thresholds = {
    ...DEFAULT_READINESS_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };
  const reasons: string[] = [];

  if (input.report.captureRate < thresholds.minCaptureRate) {
    reasons.push("capture_rate_below_threshold");
  }
  if (input.report.ignoreRate > thresholds.maxIgnoreRate) {
    reasons.push("ignore_rate_above_threshold");
  }
  if (input.report.duplicateRate > thresholds.maxDuplicateRate) {
    reasons.push("duplicate_rate_above_threshold");
  }
  if (input.report.supersessionRate > thresholds.maxSupersessionRate) {
    reasons.push("supersession_rate_above_threshold");
  }
  if (input.report.omissionDivergenceCount > thresholds.maxOmissionDivergenceCount) {
    reasons.push("omission_divergence_above_threshold");
  }

  return {
    ready: reasons.length === 0,
    reasons,
    thresholds,
  };
}
