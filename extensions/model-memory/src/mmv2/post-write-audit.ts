import { PostWriteAuditSchema, type PostWriteAudit } from "./contracts.ts";
import type { ShadowMemoryBatch } from "./recording.ts";

export function runPostWriteAudit(input: ShadowMemoryBatch & { eventId: string }): PostWriteAudit {
  const errors: Array<{ memory_id: string | null; error_code: string; message: string }> = [];
  const warnings: Array<{ memory_id: string | null; warning_code: string; message: string }> = [];

  for (const memory of input.durableMemories) {
    if (memory.unit_type === "atomic" && memory.kind === null) {
      errors.push({
        memory_id: memory.memory_id,
        error_code: "atomic_kind_missing",
        message: "Active atomic memory must retain a non-null kind.",
      });
    }
    if (memory.unit_type === "composite" && memory.artifact_type === null) {
      errors.push({
        memory_id: memory.memory_id,
        error_code: "composite_artifact_missing",
        message: "Active composite memory must retain a non-null artifact_type.",
      });
    }
    if (memory.payload.promotion === "blocked") {
      errors.push({
        memory_id: memory.memory_id,
        error_code: "blocked_memory_active",
        message: "Blocked content must not survive as active durable memory.",
      });
    }
  }

  return PostWriteAuditSchema.parse({
    schema_version: "post_write_audit.v1",
    event_id: input.eventId,
    audit_status: errors.length > 0 ? "fail" : warnings.length > 0 ? "pass_with_warnings" : "pass",
    checked_memory_ids: input.durableMemories.map((memory) => memory.memory_id),
    errors,
    warnings,
  });
}
