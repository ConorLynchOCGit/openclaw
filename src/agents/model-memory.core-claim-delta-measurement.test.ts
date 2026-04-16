import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  renderModelMemoryCoreClaimDeltaMeasurementMarkdown,
  runModelMemoryCoreClaimDeltaMeasurement,
  type ModelMemoryCoreClaimDeltaMeasurementReport,
} from "./model-memory.core-claim-delta-measurement.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      await import("node:fs/promises").then((fs) => fs.rm(dir, { recursive: true, force: true }));
    }),
  );
});

async function writeTempJson(fileName: string, value: unknown): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "model-memory-core-claim-delta-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return filePath;
}

function buildObjectRecord(input: {
  id: string;
  payload: Record<string, unknown>;
  identityKey: string;
  slotKey?: string;
}) {
  return {
    id: input.id,
    sourceWindowId: `${input.id}-window`,
    canonicalClass: "project" as const,
    kind: "rule" as const,
    payload: input.payload,
    normalizedSubject:
      typeof input.payload.subject === "string" ? input.payload.subject.toLowerCase() : undefined,
    normalizedTitle: undefined,
    normalizedSearchText: Object.values(input.payload)
      .filter((value) => typeof value === "string")
      .join(" ")
      .toLowerCase(),
    scope: { projectScope: "openclaw" },
    scopeKey: "scope-openclaw",
    provenance: [{ sourceId: `${input.id}-window`, segmentIndex: 0, headingPath: [] }],
    confidence: "strong" as const,
    durability: "durable" as const,
    suggestedReviewMode: "auto_accept" as const,
    executedReviewMode: "auto_accept" as const,
    rationaleCodes: [],
    identityKey: input.identityKey,
    slotKey: input.slotKey,
    contractName: "semantic_extraction",
    contractVersion: "v1",
    modelId: "model-001",
    createdAt: new Date(0),
    lifecycleState: "active" as const,
  };
}

describe("model-memory core claim delta measurement", () => {
  it("measures packaging-only duplicate misses and distinct-control risk", async () => {
    const objectRecord = buildObjectRecord({
      id: "memory-new",
      identityKey: "identity-new",
      payload: {
        subject: "Final docs URL reporting",
        recommendedAction: "Reply with full docs URLs in final reports.",
        avoidAction:
          "Keep them explicit and do not use root-relative links in user-facing final output.",
      },
    });
    const priorRecord = buildObjectRecord({
      id: "memory-prior",
      identityKey: "identity-prior",
      payload: {
        subject: "Docs URL output",
        recommendedAction: "Reply with full docs URLs in final reports and keep them explicit.",
        avoidAction: "Do not use root-relative links in user-facing final output.",
      },
    });
    const distinctControlRecord = buildObjectRecord({
      id: "memory-distinct",
      identityKey: "identity-distinct",
      payload: {
        subject: "Config reload behavior",
        recommendedAction:
          "Assume hybrid mode hot-applies safe changes instantly and restarts for critical changes.",
        avoidAction: "Do not expect every change to avoid restarts in hybrid mode.",
      },
    });
    const distinctWriteRecord = buildObjectRecord({
      id: "memory-distinct-new",
      identityKey: "identity-distinct-new",
      payload: {
        subject: "Hybrid reload behavior for critical vs safe changes",
        recommendedAction:
          "In hybrid mode, rely on safe changes being hot-applied instantly and critical changes triggering an automatic Gateway restart.",
      },
    });

    const duplicateAuditPath = await writeTempJson("audit.json", {
      generatedAt: "2026-04-15T00:00:00.000Z",
      currentCorpus: true,
      databaseMode: "full_corpus_proof_db",
      databaseName: "model_memory",
      proofPhaseReportPath: "proof.json",
      proofPhaseReportGeneratedAt: "2026-04-15T00:00:00.000Z",
      initialIngestionWriteEventCount: 1,
      saturationSourcePaths: ["AGENTS.md"],
      rerunEscapeCases: [
        {
          caseId: "rerun-memory-new",
          caseType: "saturation_rerun_escape",
          source: "AGENTS.md",
          sourceWindowId: "window-001",
          windowIndex: 1,
          memoryObjectId: "memory-new",
          createdAt: "1970-01-01T00:00:01.000Z",
          lifecycleState: "active",
          canonicalClass: "project",
          kind: "rule",
          scopeKey: "scope-openclaw",
          payloadSummary:
            "Final docs URL reporting | Reply with full docs URLs in final reports. | Keep them explicit and do not use root-relative links in user-facing final output.",
          supportCount: 1,
          historicalDecision: "write",
          historicalDecisionCodes: ["collision_distinct"],
          replayPathClassification: "batched_adjudication",
          missClass: "batch_attach_miss",
          sameClaimConfidence: "high",
          packagingDriftType: "field_packing_drift",
          rawScopeMatchedPriorCount: 2,
          retainedCandidateCount: 1,
          nearestPriorCandidates: [
            {
              objectId: "memory-prior",
              createdAt: "1970-01-01T00:00:00.000Z",
              lifecycleState: "active",
              supportCount: 1,
              canonicalClass: "project",
              kind: "rule",
              scopeKey: "scope-openclaw",
              payloadSummary:
                "Docs URL output | Reply with full docs URLs in final reports and keep them explicit. | Do not use root-relative links in user-facing final output.",
              normalizedSearchText: "",
              decisiveFieldAgreement: true,
              decisiveFieldSummary: "actionBundle=match",
              overlap: {
                overlapCount: 10,
                smallerCoverage: 0.95,
                largerCoverage: 0.82,
                containsOther: false,
                normalizedSubjectExact: false,
                normalizedTitleExact: false,
              },
            },
          ],
          retainedPriorCandidates: [
            {
              objectId: "memory-prior",
              createdAt: "1970-01-01T00:00:00.000Z",
              lifecycleState: "active",
              supportCount: 1,
              canonicalClass: "project",
              kind: "rule",
              scopeKey: "scope-openclaw",
              payloadSummary:
                "Docs URL output | Reply with full docs URLs in final reports and keep them explicit. | Do not use root-relative links in user-facing final output.",
              normalizedSearchText: "",
              decisiveFieldAgreement: true,
              decisiveFieldSummary: "actionBundle=match",
              overlap: {
                overlapCount: 10,
                smallerCoverage: 0.95,
                largerCoverage: 0.82,
                containsOther: false,
                normalizedSubjectExact: false,
                normalizedTitleExact: false,
              },
            },
          ],
        },
        {
          caseId: "rerun-memory-distinct-new",
          caseType: "saturation_rerun_escape",
          source: "docs/gateway/configuration.md",
          sourceWindowId: "window-002",
          windowIndex: 1,
          memoryObjectId: "memory-distinct-new",
          createdAt: "1970-01-01T00:00:02.000Z",
          lifecycleState: "active",
          canonicalClass: "project",
          kind: "rule",
          scopeKey: "scope-openclaw",
          payloadSummary:
            "Hybrid reload behavior for critical vs safe changes | In hybrid mode, rely on safe changes being hot-applied instantly and critical changes triggering an automatic Gateway restart.",
          supportCount: 1,
          historicalDecision: "write",
          historicalDecisionCodes: ["collision_distinct"],
          replayPathClassification: "batched_adjudication",
          missClass: "legit_distinct",
          sameClaimConfidence: "low",
          packagingDriftType: "extra_constraint",
          rawScopeMatchedPriorCount: 1,
          retainedCandidateCount: 1,
          nearestPriorCandidates: [
            {
              objectId: "memory-distinct",
              createdAt: "1970-01-01T00:00:00.000Z",
              lifecycleState: "active",
              supportCount: 1,
              canonicalClass: "project",
              kind: "rule",
              scopeKey: "scope-openclaw",
              payloadSummary:
                "Config reload behavior | Assume hybrid mode hot-applies safe changes instantly and restarts for critical changes. | Do not expect every change to avoid restarts in hybrid mode.",
              normalizedSearchText: "",
              decisiveFieldAgreement: false,
              decisiveFieldSummary: "recommendedAction=diff",
              overlap: {
                overlapCount: 7,
                smallerCoverage: 0.7,
                largerCoverage: 0.5,
                containsOther: false,
                normalizedSubjectExact: false,
                normalizedTitleExact: false,
              },
            },
          ],
          retainedPriorCandidates: [
            {
              objectId: "memory-distinct",
              createdAt: "1970-01-01T00:00:00.000Z",
              lifecycleState: "active",
              supportCount: 1,
              canonicalClass: "project",
              kind: "rule",
              scopeKey: "scope-openclaw",
              payloadSummary:
                "Config reload behavior | Assume hybrid mode hot-applies safe changes instantly and restarts for critical changes. | Do not expect every change to avoid restarts in hybrid mode.",
              normalizedSearchText: "",
              decisiveFieldAgreement: false,
              decisiveFieldSummary: "recommendedAction=diff",
              overlap: {
                overlapCount: 7,
                smallerCoverage: 0.7,
                largerCoverage: 0.5,
                containsOther: false,
                normalizedSubjectExact: false,
                normalizedTitleExact: false,
              },
            },
          ],
        },
      ],
      duplicateClusterCases: [],
      sampleCases: [],
      summary: {
        rerunEscapeCaseCount: 2,
        duplicateClusterCaseCount: 0,
        rerunHistoricalDecisionCounts: { write: 2 },
        rerunReplayPathCounts: { batched_adjudication: 2 },
        rerunCaseCountByKind: { rule: 2 },
        rerunMissClassCounts: { batch_attach_miss: 1, legit_distinct: 1 },
        rerunPackagingDriftTypeCounts: { field_packing_drift: 1, extra_constraint: 1 },
        rerunRetainedCandidateCount: { zero: 0, one: 2, multiple: 0 },
      },
    });

    const duplicateReviewPath = await writeTempJson("review.json", {
      generatedAt: "2026-04-15T00:00:00.000Z",
      duplicateAuditPath,
      duplicateAuditGeneratedAt: "2026-04-15T00:00:00.000Z",
      databaseMode: "full_corpus_proof_db",
      databaseName: "model_memory",
      sampleSize: 2,
      cases: [
        {
          caseId: "rerun-memory-new",
          source: "AGENTS.md",
          kind: "rule",
          payloadSummary:
            "Final docs URL reporting | Reply with full docs URLs in final reports. | Keep them explicit and do not use root-relative links in user-facing final output.",
          historicalDecision: "write",
          replayPathClassification: "batched_adjudication",
          missClass: "batch_attach_miss",
          sameClaimConfidence: "high",
          packagingDriftType: "field_packing_drift",
          topRetainedCandidates: [
            "Docs URL output | Reply with full docs URLs in final reports and keep them explicit. | Do not use root-relative links in user-facing final output.",
          ],
          reviewerLabel: "clear_duplicate_should_attach",
          rationale: "same rule body",
        },
        {
          caseId: "rerun-memory-distinct-new",
          source: "docs/gateway/configuration.md",
          kind: "rule",
          payloadSummary:
            "Hybrid reload behavior for critical vs safe changes | In hybrid mode, rely on safe changes being hot-applied instantly and critical changes triggering an automatic Gateway restart.",
          historicalDecision: "write",
          replayPathClassification: "batched_adjudication",
          missClass: "legit_distinct",
          sameClaimConfidence: "low",
          packagingDriftType: "extra_constraint",
          topRetainedCandidates: [
            "Config reload behavior | Assume hybrid mode hot-applies safe changes instantly and restarts for critical changes. | Do not expect every change to avoid restarts in hybrid mode.",
          ],
          reviewerLabel: "clear_distinct_should_stay_distinct",
          rationale: "real extra constraint",
        },
      ],
      summary: {
        clear_duplicate_should_attach: 1,
        clear_distinct_should_stay_distinct: 1,
        true_ambiguity: 0,
        needs_policy_change: 0,
      },
    });

    const report = await runModelMemoryCoreClaimDeltaMeasurement({
      runtime: {
        resolution: {
          connectionString: "postgres://example/model_memory",
          databaseName: "model_memory",
          databaseMode: "full_corpus_proof_db",
          source: "env:MODEL_MEMORY_DATABASE_URL",
          derivedFromSharedServer: false,
        },
        canonicalRepository: {
          async snapshot() {
            return {
              memoryObjects: [
                priorRecord,
                objectRecord,
                distinctControlRecord,
                distinctWriteRecord,
              ],
              supportItems: [],
              writeEvents: [],
              sourceWindows: [] as never[],
              sources: [] as never[],
            };
          },
        },
      } as never,
      duplicateAuditPath,
      duplicateReviewPath,
    });

    expect(report.measuredCaseCount).toBe(2);
    expect(report.summary.clearDuplicateShouldAttachCount).toBe(1);
    expect(report.summary.legitDistinctControlCount).toBe(1);
    expect(report.summary.clearMissesThatWouldFlip).toBe(1);
    expect(report.summary.legitDistinctControlsThatWouldBecomeRisky).toBe(0);
    expect(
      report.cases.find((caseRecord) => caseRecord.caseId === "rerun-memory-new")
        ?.wouldFlipUnderCoreClaimOnlyPackagingOnlyDrift,
    ).toBe(true);
  });

  it("renders markdown with blocker and hypothetical sections", () => {
    const report = {
      generatedAt: "2026-04-15T00:00:00.000Z",
      duplicateAuditPath: "audit.json",
      duplicateAuditGeneratedAt: "2026-04-15T00:00:00.000Z",
      duplicateReviewPath: "review.json",
      duplicateReviewGeneratedAt: "2026-04-15T00:00:00.000Z",
      databaseMode: "full_corpus_proof_db",
      databaseName: "model_memory",
      measuredCaseCount: 1,
      cases: [
        {
          caseId: "rerun-case-001",
          source: "AGENTS.md",
          kind: "rule",
          sampleRole: "reviewed_clear_duplicate_should_attach",
          reviewerLabel: "clear_duplicate_should_attach",
          historicalDecision: "write",
          replayPathClassification: "batched_adjudication",
          missClass: "batch_attach_miss",
          sameClaimConfidence: "high",
          packagingDriftType: "field_packing_drift",
          retainedCandidateCount: 1,
          currentPathBlocker: "batch_choice_or_attach_threshold",
          targetCandidateId: "memory-001",
          claimFieldComparison: {
            coreClaimFields: ["recommendedAction", "avoidAction"],
            packagingFields: ["subject"],
            matchingCoreClaimFields: ["recommendedAction", "avoidAction"],
            blockingCoreClaimFields: [],
            matchingPackagingFields: [],
            blockingPackagingFields: ["subject"],
            coreClaimMatch: true,
            coreClaimSummary: "recommendedAction=match; avoidAction=match",
            packagingSummary: "subject=diff",
          },
          deltaClass: "packaging_only_drift",
          deltaSummary: "same rule with field packing drift",
          sameClaimLeaning: true,
          dominantCoreClaimCandidateIds: ["memory-001"],
          wouldFlipUnderCoreClaimOnlyPackagingOnlyDrift: true,
          hypotheticalOutcome: "would_flip_attach_support",
        },
      ],
      summary: {
        reviewedCaseCount: 1,
        auditedOnlyCaseCount: 0,
        clearDuplicateShouldAttachCount: 1,
        legitDistinctControlCount: 0,
        ambiguityControlCount: 0,
        missesBlockedByCoreClaimFields: 0,
        missesBlockedByPackagingFields: 0,
        missesBlockedByNeitherFieldClass: 1,
        clearMissesThatWouldFlip: 1,
        legitDistinctControlsThatWouldBecomeRisky: 0,
        casesByCurrentPathBlocker: { batch_choice_or_attach_threshold: 1 },
        casesByDeltaClass: { packaging_only_drift: 1 },
        casesByReviewerLabel: { clear_duplicate_should_attach: 1 },
      },
    } satisfies ModelMemoryCoreClaimDeltaMeasurementReport;

    const markdown = renderModelMemoryCoreClaimDeltaMeasurementMarkdown(report);
    expect(markdown).toContain("# Model Memory Core Claim Delta Measurement");
    expect(markdown).toContain("Current path blocker");
    expect(markdown).toContain("Would flip under core-claim-only + packaging_only_drift");
  });
});
