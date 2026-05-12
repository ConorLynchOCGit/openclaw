export const MIDDLEWARE_BYPASS_AUDIT_VERSION = "execution-platform.middleware-bypass-audit.v1";

export type MiddlewareBypassKind = "model" | "script" | "db" | "work_queue_lifecycle";

export type MiddlewareBypassCandidate = {
  path: string;
  kind: MiddlewareBypassKind;
  liveCapable: boolean;
  approvedMiddlewarePath: boolean;
  testOnly: boolean;
  legacyAllowed: boolean;
  reason: string;
  expirySlice?: string | null;
};

export type MiddlewareBypassAuditResult = {
  artifactKind: "middleware_bypass_audit_result";
  auditVersion: typeof MIDDLEWARE_BYPASS_AUDIT_VERSION;
  status: "passed" | "needs_review" | "blocked";
  approvedPathCount: number;
  blockedPathCount: number;
  temporaryExceptionCount: number;
  blockedPaths: MiddlewareBypassCandidate[];
  temporaryExceptions: MiddlewareBypassCandidate[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  workQueueLifecycleMutated: false;
};

export function evaluateMiddlewareBypassAudit(
  candidates: MiddlewareBypassCandidate[],
): MiddlewareBypassAuditResult {
  const liveBypasses = candidates.filter(
    (candidate) =>
      candidate.liveCapable &&
      !candidate.approvedMiddlewarePath &&
      !candidate.testOnly &&
      !candidate.legacyAllowed,
  );
  const temporaryExceptions = candidates.filter(
    (candidate) =>
      candidate.liveCapable &&
      !candidate.approvedMiddlewarePath &&
      !candidate.testOnly &&
      candidate.legacyAllowed,
  );
  const missingExpiry = temporaryExceptions.filter((candidate) => !candidate.expirySlice);
  const reasonCodes = [
    ...liveBypasses.map((candidate) => `blocked_live_bypass:${candidate.kind}:${candidate.path}`),
    ...missingExpiry.map((candidate) => `temporary_exception_missing_expiry:${candidate.path}`),
    ...(temporaryExceptions.length > 0 ? ["temporary_middleware_exceptions_present"] : []),
  ].slice(0, 80);
  const blocked = liveBypasses.length > 0 || missingExpiry.length > 0;
  return {
    artifactKind: "middleware_bypass_audit_result",
    auditVersion: MIDDLEWARE_BYPASS_AUDIT_VERSION,
    status: blocked ? "blocked" : temporaryExceptions.length > 0 ? "needs_review" : "passed",
    approvedPathCount: candidates.filter((candidate) => candidate.approvedMiddlewarePath).length,
    blockedPathCount: liveBypasses.length,
    temporaryExceptionCount: temporaryExceptions.length,
    blockedPaths: liveBypasses.slice(0, 40),
    temporaryExceptions: temporaryExceptions.slice(0, 40),
    reasonCodes:
      blocked || temporaryExceptions.length > 0 ? reasonCodes : ["middleware_bypass_audit_passed"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: false,
  };
}
