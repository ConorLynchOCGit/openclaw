import type { RuntimeJobArtifact, RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  applyCommitmentPacketQualityReview,
  CommitmentWorkPacketSchema,
  normalizeCommitmentPacketQualityReview,
  summarizeCommitmentPacketQualityReviewForArtifact,
  type CommitmentPacketQualityReview,
  type CommitmentWorkPacket,
} from "../workflows/mission-work-packets.ts";

export type CommitmentPacketReviewBoundaryReviewer = (input: {
  runtimeJobId: string;
  packets: CommitmentWorkPacket[];
  priorReview: CommitmentPacketQualityReview | null;
}) => Promise<unknown>;

export type CommitmentPacketReviewBoundaryRepairer = (input: {
  runtimeJobId: string;
  packet: CommitmentWorkPacket;
  packetReview: CommitmentPacketQualityReview["packetReviews"][number];
}) => Promise<CommitmentWorkPacket>;

export type CommitmentPacketReviewBoundaryReplayResult = {
  artifactKind: "commitment_packet_review_boundary_replay_result";
  status: "succeeded" | "needs_review" | "failed";
  runtimeJobId: string;
  packetCount: number;
  initialReviewRef: string | null;
  finalReviewRef: string | null;
  blockingRepairCommitmentIds: string[];
  acceptedWithLimitationsCommitmentIds: string[];
  reasonCodes: string[];
  routerRerun: false;
  missionLedgerRerun: false;
  packetAuthorRerun: false;
  schedulerRerun: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  workQueueLifecycleMutated: false;
};

async function packetsFromArtifacts(input: {
  runtimeJobs: RuntimeJobRepository;
  artifacts: RuntimeJobArtifact[];
}): Promise<CommitmentWorkPacket[]> {
  const packets = await Promise.all(
    input.artifacts
      .filter((artifact) =>
        [
          "execution_platform.commitment_work_packet.pre_review",
          "execution_platform.commitment_work_packet.post_review",
          "execution_platform.commitment_work_packet.post_repair",
          "execution_platform.commitment_work_packet",
        ].includes(artifact.artifactType),
      )
      .map(async (artifact) => {
        const hydrated = await input.runtimeJobs.hydrateRuntimeArtifactByContract(artifact);
        const parsed = CommitmentWorkPacketSchema.safeParse(hydrated.body);
        return parsed.success ? parsed.data : null;
      }),
  );
  const parsedPackets = packets.filter((packet): packet is CommitmentWorkPacket => Boolean(packet));
  const byCommitment = new Map<string, CommitmentWorkPacket>();
  for (const packet of parsedPackets) {
    if (!byCommitment.has(packet.commitmentId)) {
      byCommitment.set(packet.commitmentId, packet);
    }
  }
  return [...byCommitment.values()].toSorted((left, right) =>
    left.commitmentId.localeCompare(right.commitmentId),
  );
}

function result(
  input: Omit<CommitmentPacketReviewBoundaryReplayResult, "artifactKind">,
): CommitmentPacketReviewBoundaryReplayResult {
  return {
    artifactKind: "commitment_packet_review_boundary_replay_result",
    ...input,
  };
}

export async function runCommitmentPacketReviewBoundaryReplay(input: {
  runtimeJobs: RuntimeJobRepository;
  runtimeJobId: string;
  reviewer: CommitmentPacketReviewBoundaryReviewer;
  repairer?: CommitmentPacketReviewBoundaryRepairer | null;
}): Promise<CommitmentPacketReviewBoundaryReplayResult> {
  const job = await input.runtimeJobs.getJob(input.runtimeJobId);
  if (!job) {
    return result({
      status: "failed",
      runtimeJobId: input.runtimeJobId,
      packetCount: 0,
      initialReviewRef: null,
      finalReviewRef: null,
      blockingRepairCommitmentIds: [],
      acceptedWithLimitationsCommitmentIds: [],
      reasonCodes: ["packet_review_boundary_runtime_job_missing"],
      routerRerun: false,
      missionLedgerRerun: false,
      packetAuthorRerun: false,
      schedulerRerun: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      workQueueLifecycleMutated: false,
    });
  }
  const artifacts = await input.runtimeJobs.listArtifacts(job.jobId);
  const packets = await packetsFromArtifacts({ runtimeJobs: input.runtimeJobs, artifacts });
  if (packets.length === 0) {
    return result({
      status: "needs_review",
      runtimeJobId: job.jobId,
      packetCount: 0,
      initialReviewRef: null,
      finalReviewRef: null,
      blockingRepairCommitmentIds: [],
      acceptedWithLimitationsCommitmentIds: [],
      reasonCodes: ["packet_review_boundary_pre_review_packets_missing"],
      routerRerun: false,
      missionLedgerRerun: false,
      packetAuthorRerun: false,
      schedulerRerun: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      workQueueLifecycleMutated: false,
    });
  }
  const initialReview = normalizeCommitmentPacketQualityReview({
    value: await input.reviewer({ runtimeJobId: job.jobId, packets, priorReview: null }),
    missionId: packets[0]?.missionId ?? job.jobId,
    packets,
  });
  const initialReviewRef = `runtime-job://${job.jobId}/commitment-packet-review-boundary/initial/${initialReview.reviewId}`;
  await input.runtimeJobs.attachArtifact({
    jobId: job.jobId,
    artifactType: "execution_platform.commitment_packet_quality_review.boundary_initial",
    storageKind: "metadata",
    uri: initialReviewRef,
    contentType: "application/json",
    metadata: summarizeCommitmentPacketQualityReviewForArtifact(initialReview),
  });
  const blockingReviews = initialReview.packetReviews.filter(
    (review) => review.blockingRepairRequired,
  );
  let finalReview = initialReview;
  let finalReviewRef = initialReviewRef;
  let finalPackets = applyCommitmentPacketQualityReview({ packets, review: initialReview });
  if (blockingReviews.length > 0 && input.repairer) {
    const packetByCommitment = new Map(packets.map((packet) => [packet.commitmentId, packet]));
    const repairedPackets = await Promise.all(
      blockingReviews.map(async (packetReview) => {
        const packet = packetByCommitment.get(packetReview.commitmentId);
        return packet ? input.repairer!({ runtimeJobId: job.jobId, packet, packetReview }) : null;
      }),
    );
    const repairedByCommitment = new Map(
      repairedPackets
        .filter((packet): packet is CommitmentWorkPacket => Boolean(packet))
        .map((packet) => [packet.commitmentId, packet]),
    );
    const mergedPackets = packets.map(
      (packet) => repairedByCommitment.get(packet.commitmentId) ?? packet,
    );
    finalReview = normalizeCommitmentPacketQualityReview({
      value: await input.reviewer({
        runtimeJobId: job.jobId,
        packets: mergedPackets,
        priorReview: initialReview,
      }),
      missionId: packets[0]?.missionId ?? job.jobId,
      packets: mergedPackets,
    });
    finalPackets = applyCommitmentPacketQualityReview({
      packets: mergedPackets,
      review: finalReview,
    });
    finalReviewRef = `runtime-job://${job.jobId}/commitment-packet-review-boundary/final/${finalReview.reviewId}`;
    await input.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "execution_platform.commitment_packet_quality_review.boundary_final",
      storageKind: "metadata",
      uri: finalReviewRef,
      contentType: "application/json",
      metadata: summarizeCommitmentPacketQualityReviewForArtifact(finalReview),
    });
  }
  const finalBlocking = finalReview.packetReviews
    .filter((review) => review.blockingRepairRequired)
    .map((review) => review.commitmentId);
  return result({
    status: finalBlocking.length === 0 ? "succeeded" : "needs_review",
    runtimeJobId: job.jobId,
    packetCount: finalPackets.length,
    initialReviewRef,
    finalReviewRef,
    blockingRepairCommitmentIds: finalBlocking,
    acceptedWithLimitationsCommitmentIds: finalPackets
      .filter((packet) => packet.qualityStatus === "accepted_with_limitations")
      .map((packet) => packet.commitmentId),
    reasonCodes: [
      "packet_review_boundary_replayed",
      finalBlocking.length === 0
        ? "packet_review_boundary_no_blocking_repairs_remaining"
        : "packet_review_boundary_blocking_repairs_remaining",
    ],
    routerRerun: false,
    missionLedgerRerun: false,
    packetAuthorRerun: false,
    schedulerRerun: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    workQueueLifecycleMutated: false,
  });
}
