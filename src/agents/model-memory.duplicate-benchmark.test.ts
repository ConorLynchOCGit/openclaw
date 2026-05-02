import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  runModelMemoryDuplicateBenchmark,
  type ModelMemoryDuplicateBenchmarkReport,
} from "./model-memory.duplicate-benchmark.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      await import("node:fs/promises").then((fs) => fs.rm(dir, { recursive: true, force: true }));
    }),
  );
});

async function writeTempJson(fileName: string, value: unknown): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "model-memory-duplicate-benchmark-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return filePath;
}

function buildAuditCase() {
  return {
    caseId: "rerun-f995f462-6fbb-5ac2-97df-16e41ec5efbc",
    caseType: "saturation_rerun_escape",
    source: "AGENTS.md",
    sourceWindowId: "window-001",
    windowIndex: 1,
    memoryObjectId: "memory-001",
    createdAt: "1970-01-01T00:00:01.000Z",
    lifecycleState: "active",
    canonicalClass: "project",
    kind: "rule",
    scopeKey: "scope-001",
    payloadSummary:
      "Stash/WIP safety | Do not create/apply/drop git stash entries unless explicitly requested. | Assume other agents may be working and keep unrelated WIP untouched.",
    supportCount: 1,
    historicalDecision: "write",
    historicalDecisionCodes: ["collision_distinct"],
    replayPathClassification: "batched_adjudication",
    missClass: "batch_attach_miss",
    sameClaimConfidence: "high",
    packagingDriftType: "subject_drift",
    rawScopeMatchedPriorCount: 2,
    retainedCandidateCount: 1,
    nearestPriorCandidates: [
      {
        objectId: "prior-001",
        createdAt: "1970-01-01T00:00:00.000Z",
        lifecycleState: "active",
        supportCount: 1,
        canonicalClass: "project",
        kind: "rule",
        scopeKey: "scope-001",
        payloadSummary:
          "Stash safety rule | Do not create/apply/drop git stash entries unless explicitly requested. | Assume other agents may be working and keep unrelated WIP untouched.",
        normalizedSearchText: "",
        decisiveFieldAgreement: true,
        decisiveFieldSummary: "actionBundle=match",
        overlap: {
          overlapCount: 9,
          smallerCoverage: 0.9,
          largerCoverage: 0.82,
          containsOther: false,
          normalizedSubjectExact: false,
          normalizedTitleExact: false,
        },
      },
    ],
    retainedPriorCandidates: [],
  };
}

describe("model-memory duplicate benchmark", () => {
  it("bootstraps semantic seeds from legacy reviewed case ids", async () => {
    const auditPath = await writeTempJson("audit.json", {
      generatedAt: "2026-04-15T00:00:00.000Z",
      currentCorpus: true,
      databaseMode: "full_corpus_proof_db",
      databaseName: "model_memory",
      proofPhaseReportPath: "proof.json",
      proofPhaseReportGeneratedAt: "2026-04-15T00:00:00.000Z",
      initialIngestionWriteEventCount: 1,
      saturationSourcePaths: ["AGENTS.md"],
      rerunEscapeCases: [buildAuditCase()],
      duplicateClusterCases: [],
      sampleCases: [],
      summary: {
        rerunEscapeCaseCount: 1,
        duplicateClusterCaseCount: 0,
        rerunHistoricalDecisionCounts: { write: 1 },
        rerunReplayPathCounts: { batched_adjudication: 1 },
        rerunCaseCountByKind: { rule: 1 },
        rerunMissClassCounts: { batch_attach_miss: 1 },
        rerunPackagingDriftTypeCounts: { subject_drift: 1 },
        rerunRetainedCandidateCount: { zero: 0, one: 1, multiple: 0 },
      },
    });

    const report = await runModelMemoryDuplicateBenchmark({
      duplicateAuditPath: auditPath,
    });

    expect(report.semanticSeeds.length).toBeGreaterThan(0);
    expect(report.rerunReviewedCases).toHaveLength(1);
    expect(report.rerunReviewedCases[0]?.adjudicatedLabel).toBe("should_attach_support");
  });

  it("does not resolve reviewed seeds through token-similarity fallback", async () => {
    const auditCase = buildAuditCase();
    auditCase.caseId = "rerun-new-object-id";
    auditCase.payloadSummary =
      "Multi-agent stash/WIP safety | Do not create/apply/drop git stash entries unless explicitly requested. | Assume other agents may be working and keep unrelated WIP untouched.";

    const auditPath = await writeTempJson("audit.json", {
      generatedAt: "2026-04-15T00:00:00.000Z",
      currentCorpus: true,
      databaseMode: "full_corpus_proof_db",
      databaseName: "model_memory",
      proofPhaseReportPath: "proof.json",
      proofPhaseReportGeneratedAt: "2026-04-15T00:00:00.000Z",
      initialIngestionWriteEventCount: 1,
      saturationSourcePaths: ["AGENTS.md"],
      rerunEscapeCases: [auditCase],
      duplicateClusterCases: [],
      sampleCases: [],
      summary: {
        rerunEscapeCaseCount: 1,
        duplicateClusterCaseCount: 0,
        rerunHistoricalDecisionCounts: { write: 1 },
        rerunReplayPathCounts: { batched_adjudication: 1 },
        rerunCaseCountByKind: { rule: 1 },
        rerunMissClassCounts: { batch_attach_miss: 1 },
        rerunPackagingDriftTypeCounts: { subject_drift: 1 },
        rerunRetainedCandidateCount: { zero: 0, one: 1, multiple: 0 },
      },
    });
    const priorBenchmark = {
      generatedAt: "2026-04-15T00:00:00.000Z",
      duplicateAuditPath: auditPath,
      duplicateAuditGeneratedAt: "2026-04-15T00:00:00.000Z",
      seedStrategy: "semantic_fingerprint_v1",
      semanticSeeds: [
        {
          seedId: "seed-rule-stash",
          from: "rerun_escape",
          source: "AGENTS.md",
          kind: "rule",
          payloadSummaryHash: "seed-hash",
          payloadSummaryPreview:
            "Stash/WIP safety | Do not create/apply/drop git stash entries unless explicitly requested. | Assume other agents may be working and keep unrelated WIP untouched.",
          topPriorCandidateSummaryHash: "prior-hash",
          topPriorCandidateSummaryPreview:
            "Stash safety rule | Do not create/apply/drop git stash entries unless explicitly requested. | Assume other agents may be working and keep unrelated WIP untouched.",
          adjudicatedLabel: "should_attach_support",
          rationale: ["same rule body with subject drift"],
        },
      ],
      rerunReviewedCases: [],
      clusterCorroborationCases: [],
      unresolvedSemanticSeedIds: [],
      missingBootstrapRerunCaseIds: [],
      missingBootstrapClusterCaseIds: [],
      summary: {
        rerunSampleSize: 0,
        clusterCorroborationSize: 0,
        rerunHistoricalWriteCaseCount: 0,
        rerunHistoricalSupersedeCaseCount: 0,
        rerunLabelCounts: {},
        clusterLabelCounts: {},
        reviewBasketComposition: {},
        falseDistinctRateOnReruns: 0,
        trueDistinctRateOnReruns: 0,
        attachSupportMissRateOnReruns: 0,
        falseSupersedeRateOnReruns: 0,
        falseDistinctRateIntervalOnReruns: { lower: 0, upper: 0, sampleSize: 0 },
        trueDistinctRateIntervalOnReruns: { lower: 0, upper: 0, sampleSize: 0 },
        attachSupportMissRateIntervalOnReruns: { lower: 0, upper: 0, sampleSize: 0 },
      },
    } satisfies Partial<ModelMemoryDuplicateBenchmarkReport>;
    const priorBenchmarkPath = await writeTempJson("benchmark.json", priorBenchmark);

    const report = await runModelMemoryDuplicateBenchmark({
      duplicateAuditPath: auditPath,
      priorBenchmarkPath,
    });

    expect(report.rerunReviewedCases).toHaveLength(0);
    expect(report.unresolvedSemanticSeedIds).toEqual(["seed-rule-stash"]);
  });

  it("does not create benchmark labels from the current audit without review seeds", async () => {
    const auditCase = buildAuditCase();
    auditCase.caseId = "rerun-current-audit-case";
    auditCase.missClass = "legit_distinct";
    auditCase.sameClaimConfidence = "low";

    const clusterCase = {
      caseId: "cluster-current-audit-case",
      caseType: "duplicate_cluster_candidate",
      similarity: 0.88,
      olderObjectId: "older-001",
      newerObjectId: "newer-001",
      canonicalClass: "project",
      kind: "rule",
      scopeKey: "scope-001",
      olderPayloadSummary:
        "Stash safety rule | Do not create/apply/drop git stash entries unless explicitly requested.",
      newerPayloadSummary:
        "Do not create/apply/drop git stash entries unless explicitly requested.",
      overlap: {
        overlapCount: 8,
        smallerCoverage: 1,
        largerCoverage: 0.8,
        containsOther: false,
        normalizedSubjectExact: false,
        normalizedTitleExact: false,
      },
      newerObjectSource: "AGENTS.md",
      newerHistoricalDecision: "write",
      newerHistoricalDecisionCodes: ["collision_conflict_hold"],
      olderSupportCount: 1,
      newerSupportCount: 1,
    };

    const auditPath = await writeTempJson("audit.json", {
      generatedAt: "2026-04-15T00:00:00.000Z",
      currentCorpus: true,
      databaseMode: "full_corpus_proof_db",
      databaseName: "model_memory",
      proofPhaseReportPath: "proof.json",
      proofPhaseReportGeneratedAt: "2026-04-15T00:00:00.000Z",
      initialIngestionWriteEventCount: 1,
      saturationSourcePaths: ["AGENTS.md"],
      rerunEscapeCases: [auditCase],
      duplicateClusterCases: [clusterCase],
      sampleCases: [],
      summary: {
        rerunEscapeCaseCount: 1,
        duplicateClusterCaseCount: 1,
        rerunHistoricalDecisionCounts: { write: 1 },
        rerunReplayPathCounts: { batched_adjudication: 1 },
        rerunCaseCountByKind: { rule: 1 },
        rerunMissClassCounts: { legit_distinct: 1 },
        rerunPackagingDriftTypeCounts: {},
        rerunRetainedCandidateCount: { zero: 0, one: 1, multiple: 0 },
      },
    });

    const report = await runModelMemoryDuplicateBenchmark({
      duplicateAuditPath: auditPath,
    });

    expect(report.seedBootstrapMode).toBe("no_reviewed_seeds");
    expect(report.semanticSeeds).toHaveLength(0);
    expect(report.rerunReviewedCases).toHaveLength(0);
    expect(report.clusterCorroborationCases).toHaveLength(0);
  });
});
