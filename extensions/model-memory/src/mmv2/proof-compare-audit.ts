import type { PostWriteAudit } from "./contracts.ts";
import {
  createPhaseMismatch,
  finalizePhaseResult,
  type MmV2PhaseComparisonResult,
} from "./proof-compare-shared.ts";
import type { MmV2AuditExpectation } from "./proof-corpus.ts";

export function compareAuditPhase(
  audit: PostWriteAudit,
  expectation?: MmV2AuditExpectation,
): MmV2PhaseComparisonResult {
  const mismatches = [];

  if (expectation?.auditStatus !== undefined && audit.audit_status !== expectation.auditStatus) {
    mismatches.push(
      createPhaseMismatch(
        "audit",
        "audit_status_mismatch",
        "Audit status did not match expectation.",
        expectation.auditStatus,
        audit.audit_status,
      ),
    );
  }
  for (const code of expectation?.errorCodesInclude ?? []) {
    if (!audit.errors.some((error) => error.error_code === code)) {
      mismatches.push(
        createPhaseMismatch(
          "audit",
          "missing_audit_error_code",
          "Expected audit error code was not present.",
          code,
          audit.errors.map((error) => error.error_code),
        ),
      );
    }
  }
  for (const code of expectation?.warningCodesInclude ?? []) {
    if (!audit.warnings.some((warning) => warning.warning_code === code)) {
      mismatches.push(
        createPhaseMismatch(
          "audit",
          "missing_audit_warning_code",
          "Expected audit warning code was not present.",
          code,
          audit.warnings.map((warning) => warning.warning_code),
        ),
      );
    }
  }

  return finalizePhaseResult({
    phase: "audit",
    mismatches,
    actualCount: audit.checked_memory_ids.length,
    expectedCount: undefined,
  });
}
