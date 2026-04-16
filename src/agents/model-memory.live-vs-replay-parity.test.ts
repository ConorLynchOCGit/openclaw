import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  renderModelMemoryLiveVsReplayParityMarkdown,
  runModelMemoryLiveVsReplayParity,
} from "./model-memory.live-vs-replay-parity.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      await import("node:fs/promises").then((fs) => fs.rm(dir, { recursive: true, force: true }));
    }),
  );
});

async function writeTempJson(fileName: string, value: unknown): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "model-memory-live-replay-parity-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return filePath;
}

describe("model-memory live vs replay parity", () => {
  it("localizes recall divergence when live trace drops retained candidates", async () => {
    const duplicateReviewPath = await writeTempJson("review.json", {
      generatedAt: "2026-04-15T00:00:00.000Z",
      cases: [
        {
          caseId: "rerun-001",
          caseIdentity: "window-001:identity-001",
          source: "AGENTS.md",
          kind: "rule",
          payloadSummary:
            "GHSA PATCH field constraint | If updating GHSA, make separate PATCH calls instead of setting both severity and cvss_vector_string together.",
          historicalDecision: "write",
          replayPathClassification: "batched_adjudication",
          missClass: "batch_attach_miss",
          deltaClass: "packaging_only_drift",
          sameClaimConfidence: "high",
          packagingDriftType: "field_packing_drift",
          stratification: {
            sourceFamily: "AGENTS.md",
            kind: "rule",
            replayPath: "batched_adjudication",
            missClass: "batch_attach_miss",
            deltaClass: "packaging_only_drift",
            packagingDriftType: "field_packing_drift",
          },
          topRetainedCandidates: ["GHSA PATCH payload separation | Make separate calls."],
          reviewerLabel: "clear_duplicate_should_attach",
          rationale: "same rule body",
        },
      ],
      sampleSize: 1,
      summary: {
        clear_duplicate_should_attach: 1,
        clear_distinct_should_stay_distinct: 0,
        true_ambiguity: 0,
        needs_policy_change: 0,
      },
      basketComposition: {
        bySourceFamily: { "AGENTS.md": 1 },
        byKind: { rule: 1 },
        byReplayPath: { batched_adjudication: 1 },
        byMissClass: { batch_attach_miss: 1 },
        byDeltaClass: { packaging_only_drift: 1 },
        byPackagingDriftType: { field_packing_drift: 1 },
      },
    });
    const duplicateAuditPath = await writeTempJson("audit.json", {
      generatedAt: "2026-04-15T00:00:00.000Z",
      rerunEscapeCases: [
        {
          caseId: "rerun-001",
          caseIdentity: "window-001:identity-001",
          replayPathClassification: "batched_adjudication",
          retainedPriorCandidates: [
            {
              objectId: "memory-1",
              identityKey: "prior-identity-001",
              payloadSummary: "GHSA PATCH payload separation | Make separate calls.",
            },
          ],
        },
      ],
    });
    const measurementPath = await writeTempJson("measurement.json", {
      generatedAt: "2026-04-15T00:00:00.000Z",
      cases: [
        {
          caseId: "rerun-001",
          currentPathBlocker: "blocking_packaging_fields",
          deltaClass: "packaging_only_drift",
        },
      ],
    });
    const tracePath = await writeTempJson("trace.json", {
      sourcePath: "AGENTS.md",
      passes: [
        { passLabel: "baseline", collisionGate: [], collisionBatch: [], writeResults: [] },
        {
          passLabel: "rerun_1",
          collisionGate: [
            {
              candidateId: "candidate-1",
              caseIdentity: "window-001:identity-001",
              objectSummary:
                "GHSA PATCH field constraint | If updating GHSA, make separate PATCH calls instead of setting both severity and cvss_vector_string together.",
              sourceWindowId: "window-001",
              rawCandidateCount: 3,
              retainedCandidateCount: 0,
              prunedCandidateCount: 3,
              disposition: "zero_candidate_skip",
            },
          ],
          collisionBatch: [],
          writeResults: [
            {
              candidateId: "candidate-1",
              caseIdentity: "window-001:identity-001",
              sourceWindowId: "window-001",
              decision: "write",
              decisionCodes: ["collision_distinct"],
              objectSummary:
                "GHSA PATCH field constraint | If updating GHSA, make separate PATCH calls instead of setting both severity and cvss_vector_string together.",
            },
          ],
        },
      ],
    });

    const report = await runModelMemoryLiveVsReplayParity({
      duplicateReviewPath,
      duplicateAuditPath,
      coreClaimDeltaMeasurementPath: measurementPath,
      tracePaths: [tracePath],
    });

    expect(report.sampleSize).toBe(1);
    expect(report.cases[0]?.parityQuality).toBe("diverged_recall");
    expect(report.cases[0]?.localizedSeam).toBe("retained_candidate_recall");
  });

  it("renders markdown with parity summary and per-case notes", () => {
    const markdown = renderModelMemoryLiveVsReplayParityMarkdown({
      generatedAt: "2026-04-15T00:00:00.000Z",
      duplicateReviewPath: "review.json",
      duplicateReviewGeneratedAt: "2026-04-15T00:00:00.000Z",
      duplicateAuditPath: "audit.json",
      duplicateAuditGeneratedAt: "2026-04-15T00:00:00.000Z",
      coreClaimDeltaMeasurementPath: "measurement.json",
      coreClaimDeltaMeasurementGeneratedAt: "2026-04-15T00:00:00.000Z",
      tracePaths: ["trace.json"],
      sampleSize: 1,
      summary: {
        closeCount: 0,
        divergedCount: 1,
        parityByQuality: { diverged_recall: 1 },
        divergenceBySeam: { retained_candidate_recall: 1 },
      },
      cases: [
        {
          caseId: "rerun-001",
          caseIdentity: "window-001:identity-001",
          source: "AGENTS.md",
          kind: "rule",
          role: "clear_duplicate_should_attach",
          liveMatchFound: true,
          liveMatchedPassLabel: "rerun_1",
          liveTraceCandidateId: "candidate-1",
          liveGateClassification: "distinct_write",
          liveDecision: "write",
          liveRetainedCandidates: [],
          replayClassification: "batched_adjudication",
          replayCurrentPathBlocker: "blocking_packaging_fields",
          replayDeltaClass: "packaging_only_drift",
          replayRetainedCandidates: [
            { payloadSummary: "GHSA PATCH payload separation | Make separate calls." },
          ],
          retainedCountDelta: -1,
          overlappingRetainedCandidateCount: 0,
          parityQuality: "diverged_recall",
          localizedSeam: "retained_candidate_recall",
          notes: [
            "Replay retained plausible prior candidates that the live trace dropped to zero.",
          ],
        },
      ],
    });

    expect(markdown).toContain("# Model Memory Live vs Replay Parity");
    expect(markdown).toContain("Case identity");
    expect(markdown).toContain("Parity quality");
    expect(markdown).toContain("Replay retained plausible prior candidates");
  });
});
