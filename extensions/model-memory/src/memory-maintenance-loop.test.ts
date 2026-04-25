import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  advanceMemoryMaintenanceCandidateLifecycle,
  buildMemoryMaintenanceReport,
  createMemoryMaintenanceCandidate,
  onMemoryMaintenanceEvent,
  runDailyMemoryMaintenance,
  runHeartbeatMemoryMaintenance,
  writeMemoryMaintenanceReport,
} from "./memory-maintenance-loop.ts";

describe("memory-maintenance-loop", () => {
  const createdAt = new Date("2026-04-25T00:00:00.000Z");

  it("creates candidates with a 30-day active and 90-day archived lifecycle", () => {
    const candidate = createMemoryMaintenanceCandidate({
      candidateType: "soft_source_consolidation",
      sourceRefs: [{ sourceId: "src-soft", sourceProfileId: "cited_assistant_answer" }],
      reasonCodes: ["soft_source_needs_consolidation"],
      createdAt,
    });

    expect(candidate.status).toBe("active");
    expect(candidate.activeUntil).toBe("2026-05-25T00:00:00.000Z");
    expect(candidate.archivedUntil).toBe("2026-08-23T00:00:00.000Z");

    expect(
      advanceMemoryMaintenanceCandidateLifecycle(candidate, new Date("2026-05-26T00:00:00.000Z"))
        .status,
    ).toBe("archived");
    expect(
      advanceMemoryMaintenanceCandidateLifecycle(candidate, new Date("2026-08-24T00:00:00.000Z"))
        .status,
    ).toBe("expired");
  });

  it("keeps pinned candidates active past normal expiry", () => {
    const candidate = createMemoryMaintenanceCandidate({
      candidateType: "source_authority_review",
      sourceRefs: [{ sourceId: "src-soft", authorityTier: "cited_soft" }],
      reasonCodes: ["authority_conflict"],
      createdAt,
      pinned: true,
    });

    expect(
      advanceMemoryMaintenanceCandidateLifecycle(candidate, new Date("2026-12-01T00:00:00.000Z"))
        .status,
    ).toBe("active");
  });

  it("builds memory-event reports without mutating semantic truth", () => {
    const result = onMemoryMaintenanceEvent({
      eventId: "evt-1",
      occurredAt: createdAt,
      sourceRefs: [{ memoryId: "mem-1", sourceProfileId: "tool_result_capture" }],
      affectedTargets: [
        {
          targetType: "projection",
          targetId: "project-state",
          dirty: true,
          reasonCodes: ["memory_event_dirty_target"],
          sourceRefs: [{ memoryId: "mem-1", contentHash: "hash-1" }],
        },
      ],
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.derivedRefreshRecords).toHaveLength(1);
    expect(result.report).toMatchObject({
      schema_version: "memory_maintenance_report.v1",
      trigger: "memory_event",
      mode: "shadow_report_only",
      counts: {
        candidates_total: 1,
        derived_refresh_records: 1,
      },
    });
  });

  it("runs heartbeat and daily sweep entrypoints over candidate lifecycle state", () => {
    const candidate = createMemoryMaintenanceCandidate({
      candidateType: "privacy_safety",
      sourceRefs: [{ sourceId: "src-risk", contentHash: "hash-risk" }],
      reasonCodes: ["privacy_redacted_finding"],
      createdAt,
    });

    expect(
      runHeartbeatMemoryMaintenance({
        candidates: [candidate],
        now: new Date("2026-04-26T00:00:00.000Z"),
      }),
    ).toMatchObject({
      trigger: "heartbeat",
      counts: {
        candidates_active: 1,
        privacy_safety_candidates: 1,
      },
    });

    expect(
      runDailyMemoryMaintenance({
        candidates: [candidate],
        now: new Date("2026-05-26T00:00:00.000Z"),
      }),
    ).toMatchObject({
      trigger: "daily_sweep",
      counts: {
        candidates_archived: 1,
      },
    });
  });

  it("excludes raw prompt, transcript, tool log, secret, and private phrase content from reports", () => {
    const forbidden = [
      "raw-prompt-never-write",
      "full-transcript-never-write",
      "raw-tool-log-never-write",
      "secret-never-write",
      "private-phrase-never-write",
    ];
    const report = buildMemoryMaintenanceReport({
      trigger: "daily_sweep",
      generatedAt: createdAt,
      candidates: [
        createMemoryMaintenanceCandidate({
          candidateType: "privacy_safety",
          sourceRefs: [{ sourceId: "src-redacted", contentHash: "hash-redacted" }],
          reasonCodes: ["privacy_redacted_finding", "inspection_only_excluded"],
          createdAt,
        }),
      ],
    });
    const serialized = JSON.stringify(report);

    for (const value of forbidden) {
      expect(serialized).not.toContain(value);
    }
    expect(report.no_dark_data_scan.prohibited_fields_excluded).toEqual([
      "raw_prompts",
      "full_transcripts",
      "raw_tool_logs",
      "secrets",
      "private_phrases",
      "hostile_imperative_text",
    ]);
  });

  it("writes bounded report artifacts with safe ids and hashes", async () => {
    const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), "memory-maintenance-"));
    const report = buildMemoryMaintenanceReport({
      trigger: "heartbeat",
      generatedAt: createdAt,
      candidates: [
        createMemoryMaintenanceCandidate({
          candidateType: "cache_projection",
          sourceRefs: [{ artifactPath: ".artifacts/model-memory/projection.json" }],
          reasonCodes: ["cache_or_projection_churn"],
          createdAt,
        }),
      ],
    });

    const written = await writeMemoryMaintenanceReport({
      artifactDir,
      reportId: "heartbeat report",
      report,
    });

    expect(path.basename(written.path)).toBe("heartbeat-report.maintenance.json");
    expect(written.contentHash).toHaveLength(64);
    const serialized = await fs.readFile(written.path, "utf8");
    expect(JSON.parse(serialized)).toMatchObject({
      schema_version: "memory_maintenance_report.v1",
      mode: "shadow_report_only",
    });
  });
});
