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

export type MiddlewareBypassSourceFile = {
  path: string;
  source: string;
};

const APPROVED_MIDDLEWARE_PATH_FRAGMENTS = [
  "/workers/middleware-worker-adapters.ts",
  "/model-tasks/model-task-repository.ts",
  "/script-jobs/script-job-repository.ts",
  "/db-operations/db-operation-repository.ts",
  "/runtime-tool-call/runtime-tool-kernel.ts",
];

const TEST_OR_DIAGNOSTIC_PATH_PATTERNS = [
  /\.test\.[cm]?[jt]sx?$/u,
  /\/__fixtures__\//u,
  /\/fixtures\//u,
  /^scripts\/execution-platform-.*(?:proof|diagnostic|record|replay).*\.mjs$/u,
];

const BYPASS_SOURCE_PATTERNS: Array<{
  kind: MiddlewareBypassKind;
  pattern: RegExp;
  reason: string;
}> = [
  {
    kind: "model",
    pattern:
      /\b(?:new\s+OpenRouterAgentTeamModelClient|new\s+CodexAppServerJsonExecutor|fetch\s*\([^)]*openrouter)/su,
    reason: "direct model/provider executor shape detected outside model-task middleware",
  },
  {
    kind: "script",
    pattern: /\b(?:execFile|spawn|exec)\s*\(/u,
    reason: "direct script execution shape detected outside script-job middleware",
  },
  {
    kind: "db",
    pattern: /\b(?:sql\.query|sqlClient\.query|database\.sql\.query)\s*\(/u,
    reason: "direct DB operation shape detected outside DB-operation middleware",
  },
  {
    kind: "work_queue_lifecycle",
    pattern:
      /\b(?:completeWorkQueueItemFromCloseout|archiveGeneratedItems|markWorkItem|queue_status\s*=)\b/u,
    reason:
      "direct Work Queue lifecycle mutation shape detected outside approved lifecycle control",
  },
];

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

export function buildMiddlewareBypassCandidatesFromSourceFiles(
  files: MiddlewareBypassSourceFile[],
): MiddlewareBypassCandidate[] {
  const candidates: MiddlewareBypassCandidate[] = [];
  for (const file of files) {
    const path = normalizePath(file.path);
    const testOnly = TEST_OR_DIAGNOSTIC_PATH_PATTERNS.some((pattern) => pattern.test(path));
    const liveCapable = !testOnly;
    const approvedMiddlewarePath = APPROVED_MIDDLEWARE_PATH_FRAGMENTS.some((fragment) =>
      `/${path}`.includes(fragment),
    );
    for (const sourcePattern of BYPASS_SOURCE_PATTERNS) {
      if (!sourcePattern.pattern.test(file.source)) {
        continue;
      }
      candidates.push({
        path,
        kind: sourcePattern.kind,
        liveCapable,
        approvedMiddlewarePath,
        testOnly,
        legacyAllowed: false,
        reason: sourcePattern.reason,
      });
    }
  }
  return candidates;
}

function normalizePath(input: string): string {
  return input.replaceAll("\\", "/").replace(/^\.?\//u, "");
}
