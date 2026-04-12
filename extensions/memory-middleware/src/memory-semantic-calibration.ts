import type { MemorySemanticBenchmarkReport } from "./memory-live-benchmark.js";

export type MemorySemanticCalibrationThresholds = {
  minPassingCaseRate: number;
  maxBlockingIssues: number;
  maxMinorIssues: number;
};

export type MemorySemanticCalibrationResult = {
  thresholds: MemorySemanticCalibrationThresholds;
  passRate: number;
  blockingIssueCount: number;
  minorIssueCount: number;
  ready: boolean;
  reasons: string[];
};

export const DEFAULT_MEMORY_SEMANTIC_CALIBRATION_THRESHOLDS: MemorySemanticCalibrationThresholds = {
  minPassingCaseRate: 0.9,
  maxBlockingIssues: 0,
  maxMinorIssues: 4,
};

export function evaluateMemorySemanticCalibration(params: {
  report: MemorySemanticBenchmarkReport;
  thresholds?: Partial<MemorySemanticCalibrationThresholds>;
}): MemorySemanticCalibrationResult {
  const thresholds: MemorySemanticCalibrationThresholds = {
    ...DEFAULT_MEMORY_SEMANTIC_CALIBRATION_THRESHOLDS,
    ...params.thresholds,
  };
  const totalCases = params.report.caseResults.length;
  const passingCases = params.report.caseResults.filter((result) => result.pass).length;
  const passRate = totalCases > 0 ? passingCases / totalCases : 0;
  const blockingIssueCount = params.report.readiness.blockingIssueCount;
  const minorIssueCount = params.report.readiness.minorIssueCount;
  const reasons: string[] = [];

  if (passRate < thresholds.minPassingCaseRate) {
    reasons.push(
      `pass rate ${passRate.toFixed(2)} is below threshold ${thresholds.minPassingCaseRate.toFixed(2)}`,
    );
  }
  if (blockingIssueCount > thresholds.maxBlockingIssues) {
    reasons.push(
      `blocking issue count ${blockingIssueCount} exceeds threshold ${thresholds.maxBlockingIssues}`,
    );
  }
  if (minorIssueCount > thresholds.maxMinorIssues) {
    reasons.push(
      `minor issue count ${minorIssueCount} exceeds threshold ${thresholds.maxMinorIssues}`,
    );
  }

  return {
    thresholds,
    passRate,
    blockingIssueCount,
    minorIssueCount,
    ready: reasons.length === 0,
    reasons,
  };
}
