import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import type { CommitmentWorkPacket } from "../workflows/mission-work-packets.ts";
import { runCommitmentPacketReviewBoundaryReplay } from "./commitment-packet-review-boundary-replay.ts";

function packet(input: Partial<CommitmentWorkPacket> = {}): CommitmentWorkPacket {
  return {
    packetKind: "commitment_work_packet",
    schemaVersion: "execution-platform.commitment-work-packet.v1",
    authoringSource: "model_authored",
    qualityStatus: "unreviewed",
    packetId: "packet-1",
    packetRef: "runtime-work-graph://packet/1",
    missionId: "mission-1",
    commitmentId: "commitment-1",
    commitmentText: "Implement Product/Spec Planning scheduler support.",
    commitmentMeaning: "The workflow must run through canonical scheduler nodes.",
    ownerIntentSummary: "Owner wants production-grade planning workflow support.",
    whyItMatters: "This is the next proof item.",
    workerObjective: "Implement the scheduler-backed workflow, tests, readback, and closeout.",
    contextScoutObjective: "Find workflow registry, scheduler, and readback files.",
    implementationObjective: "Wire the workflow and add tests.",
    validationObjective: "Run focused scheduler and readback tests.",
    reviewObjective: "Review implementation against Mission Ledger evidence.",
    expectedEvidenceDescriptions: ["Source edits and validation refs."],
    expectedEvidenceKinds: ["source_change", "test_validation"],
    acceptanceCriteria: ["Workflow is scheduler-backed."],
    remainingWork: ["Add workflow plugin"],
    relevantConstraints: ["No raw storage."],
    explicitNonGoals: ["No deploy."],
    likelyRepoAreas: ["extensions/execution-platform/src/workflows/"],
    requiredContextQuestions: ["Which files define workflow plugins?"],
    allowedContextRequestHints: ["Request bounded source-prompt excerpts if needed."],
    expectedContextScoutOutput: ["Verified repo files."],
    expectedImplementationOutput: ["Source edits."],
    expectedValidationOutput: ["Focused tests pass."],
    expectedReviewReadbackOutput: ["Human-readable readback."],
    requiredEvidenceClaimDescriptions: ["Evidence maps to commitment-1."],
    stopIfMissing: ["Stop if workflow files cannot be verified."],
    packetQualityReviewRefs: [],
    uncertaintiesAndRisks: [],
    downstreamConsumer: "runtime_work_graph_scheduler",
    requiredContextSnapshotRefs: [],
    providedContextSnapshotRefs: [],
    staleContextSnapshotRefs: [],
    missingContextSnapshotRefs: [],
    rejectedContextSnapshotRefs: [],
    contextFreshnessStatus: "fresh",
    contextRefreshAction: "none",
    contextFreshnessSummary:
      "No context snapshot contract is required for this packet replay fixture.",
    rawFileContentStored: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    ...input,
    synthesisImplementationGroups: input.synthesisImplementationGroups ?? [],
    synthesisDependencies: input.synthesisDependencies ?? [],
    synthesisRisks: input.synthesisRisks ?? [],
    synthesisValidationStrategy: input.synthesisValidationStrategy ?? [],
    synthesisEscalationTriggers: input.synthesisEscalationTriggers ?? [],
    synthesisQualityReviewed: input.synthesisQualityReviewed ?? false,
    synthesisQualityGatePassed: input.synthesisQualityGatePassed ?? false,
    synthesisHasNonRuntimeContextSource: input.synthesisHasNonRuntimeContextSource ?? false,
  };
}

async function withRuntimeJobs<T>(work: (runtimeJobs: RuntimeJobRepository) => Promise<T>) {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    return await work(new RuntimeJobRepository(database.sql, { claimStrategy: "basic" }));
  } finally {
    await database.close();
  }
}

describe("commitment packet review boundary replay", () => {
  it("replays packet review from pre-review packet artifacts without rerunning prior boundaries", async () => {
    await withRuntimeJobs(async (runtimeJobs) => {
      await runtimeJobs.enqueueJob({
        jobId: "job-packet-review",
        jobType: "executor.agent_team",
        payload: { workflowId: "agent_team.coding", rawPromptStored: false },
      });
      const preReviewPacket = packet();
      await runtimeJobs.attachRuntimeArtifactByContract({
        jobId: "job-packet-review",
        artifactType: "execution_platform.commitment_work_packet.pre_review",
        uri: "runtime-job://job-packet-review/pre-review/commitment-1",
        body: preReviewPacket,
        boundedSummary: preReviewPacket.workerObjective,
        targetCommitmentIds: [preReviewPacket.commitmentId],
        resourcePacketKind: "commitment_work_packet",
        readinessStatus: preReviewPacket.qualityStatus,
        reasonCodes: ["commitment_work_packet_pre_review_test_fixture"],
        metadata: {
          artifactKind: "execution_platform.commitment_work_packet.pre_review",
          commitmentId: preReviewPacket.commitmentId,
          packetRef: preReviewPacket.packetRef,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });

      const result = await runCommitmentPacketReviewBoundaryReplay({
        runtimeJobs,
        runtimeJobId: "job-packet-review",
        async reviewer() {
          return {
            status: "accepted_with_limitations",
            packetReviews: [
              {
                commitmentId: "commitment-1",
                status: "needs_review_nonblocking",
                specificEnoughForContextScout: true,
                specificEnoughForImplementation: true,
                specificEnoughForValidation: true,
                specificEnoughForReview: true,
                preservesOwnerIntent: true,
                blockingRepairRequired: false,
                missingInformation: ["Context scout should verify exact file names."],
                repairInstructions: [],
                insufficientFields: [
                  {
                    path: "likelyRepoAreas",
                    whyInsufficient: "Repo areas are hypotheses, not verified files.",
                    blocking: false,
                  },
                ],
              },
            ],
            reviewerSummary: "Good enough to start; exact files can be discovered.",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          };
        },
      });
      const artifacts = await runtimeJobs.listArtifacts("job-packet-review");

      expect(result.status).toBe("succeeded");
      expect(result.packetAuthorRerun).toBe(false);
      expect(result.schedulerRerun).toBe(false);
      expect(result.acceptedWithLimitationsCommitmentIds).toEqual(["commitment-1"]);
      expect(
        artifacts.some(
          (artifact) =>
            artifact.artifactType ===
            "execution_platform.commitment_packet_quality_review.boundary_initial",
        ),
      ).toBe(true);
    });
  });

  it("repairs only blocking packet review defects", async () => {
    await withRuntimeJobs(async (runtimeJobs) => {
      await runtimeJobs.enqueueJob({
        jobId: "job-packet-review-repair",
        jobType: "executor.agent_team",
        payload: { workflowId: "agent_team.coding", rawPromptStored: false },
      });
      const preReviewPacket = packet({
        contextScoutObjective: "Find context.",
        requiredContextQuestions: ["What files matter?"],
      });
      await runtimeJobs.attachRuntimeArtifactByContract({
        jobId: "job-packet-review-repair",
        artifactType: "execution_platform.commitment_work_packet.pre_review",
        uri: "runtime-job://job-packet-review-repair/pre-review/commitment-1",
        body: preReviewPacket,
        boundedSummary: preReviewPacket.workerObjective,
        targetCommitmentIds: [preReviewPacket.commitmentId],
        resourcePacketKind: "commitment_work_packet",
        readinessStatus: preReviewPacket.qualityStatus,
        reasonCodes: ["commitment_work_packet_pre_review_test_fixture"],
        metadata: {
          artifactKind: "execution_platform.commitment_work_packet.pre_review",
          commitmentId: preReviewPacket.commitmentId,
          packetRef: preReviewPacket.packetRef,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      let reviewCount = 0;

      const result = await runCommitmentPacketReviewBoundaryReplay({
        runtimeJobs,
        runtimeJobId: "job-packet-review-repair",
        async reviewer({ priorReview }) {
          reviewCount += 1;
          return priorReview
            ? {
                status: "accepted",
                packetReviews: [
                  {
                    commitmentId: "commitment-1",
                    status: "accepted",
                    specificEnoughForContextScout: true,
                    specificEnoughForImplementation: true,
                    specificEnoughForValidation: true,
                    specificEnoughForReview: true,
                    preservesOwnerIntent: true,
                    blockingRepairRequired: false,
                    missingInformation: [],
                    repairInstructions: [],
                    insufficientFields: [],
                  },
                ],
                reviewerSummary: "Repaired packet is worker-ready.",
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              }
            : {
                status: "needs_repair_blocking",
                packetReviews: [
                  {
                    commitmentId: "commitment-1",
                    status: "needs_repair_blocking",
                    specificEnoughForContextScout: false,
                    specificEnoughForImplementation: true,
                    specificEnoughForValidation: true,
                    specificEnoughForReview: true,
                    preservesOwnerIntent: true,
                    blockingRepairRequired: true,
                    missingInformation: ["Context scout objective is too generic."],
                    repairInstructions: ["Add concrete context questions and stop conditions."],
                    insufficientFields: [
                      {
                        path: "contextScoutObjective",
                        whyInsufficient: "Too generic for context scout execution.",
                        blocking: true,
                      },
                    ],
                  },
                ],
                reviewerSummary: "Blocking repair required.",
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              };
        },
        async repairer({ packet: originalPacket }) {
          return packet({
            ...originalPacket,
            contextScoutObjective:
              "Find workflow registry, scheduler runner, packet review, and readback files.",
            requiredContextQuestions: [
              "Which files register workflow definitions?",
              "Which files execute scheduler nodes?",
            ],
          });
        },
      });

      expect(reviewCount).toBe(2);
      expect(result.status).toBe("succeeded");
      expect(result.blockingRepairCommitmentIds).toEqual([]);
    });
  });
});
