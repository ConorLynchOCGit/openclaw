import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { ContextScoutToolLoopRun } from "./context-scout-tool-loop.ts";
import { validateContextScoutToolLoopForImplementation } from "./context-scout-tool-loop.ts";
import type { MissionContractLedger } from "./mission-contract-ledger.ts";
import type {
  CommitmentPacketQualityReview,
  CommitmentWorkPacket,
} from "./mission-work-packets.ts";
import { validateCommitmentWorkPacketsForScheduler } from "./mission-work-packets.ts";
import type { TeamGraphEdge, TeamGraphNode } from "./runtime-work-graph.ts";
import type { SourcePromptContextIndex } from "./source-prompt-context.ts";

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const stringList = (maxItems: number, maxChars = 260) =>
  z.array(boundedString(maxChars)).max(maxItems);

export const PRE_PROOF_MISSION_PACKET_GRAPH_LANE_ARTIFACT_TYPE =
  "execution_platform.pre_proof_mission_packet_graph_lane";

export const PreProofMissionLedgerQualityReviewSchema = z
  .object({
    artifactKind: z.literal("pre_proof_mission_ledger_quality_review"),
    schemaVersion: z.literal("execution-platform.pre-proof-mission-ledger-quality-review.v1"),
    reviewSource: z.literal("model_authored"),
    reviewRef: boundedString(320),
    missionId: boundedString(160),
    status: z.enum(["accepted", "needs_repair", "rejected"]),
    objectivePreserved: z.boolean(),
    commitmentsActionable: z.boolean(),
    constraintsBounded: z.boolean(),
    evidenceExpectationsClear: z.boolean(),
    reviewerSummary: boundedString(1_500),
    missingInformation: stringList(16, 700),
    repairInstructions: stringList(16, 700),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type PreProofMissionLedgerQualityReview = z.infer<
  typeof PreProofMissionLedgerQualityReviewSchema
>;

export const PreProofContextScoutReadinessReviewSchema = z
  .object({
    artifactKind: z.literal("pre_proof_context_scout_readiness_review"),
    schemaVersion: z.literal("execution-platform.pre-proof-context-scout-readiness-review.v1"),
    reviewSource: z.literal("model_authored"),
    reviewRef: boundedString(320),
    missionId: boundedString(160),
    status: z.enum(["accepted", "needs_repair", "rejected"]),
    contextScoutCanStart: z.boolean(),
    verifiedRefsEnoughForFirstScout: z.boolean(),
    promptExcerptPolicyClear: z.boolean(),
    handoffUsefulForScheduler: z.boolean(),
    reviewerSummary: boundedString(1_500),
    missingInformation: stringList(16, 700),
    repairInstructions: stringList(16, 700),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
  })
  .strict();

export type PreProofContextScoutReadinessReview = z.infer<
  typeof PreProofContextScoutReadinessReviewSchema
>;

export const PreProofStagedGraphQualityReviewSchema = z
  .object({
    artifactKind: z.literal("pre_proof_staged_scheduler_graph_quality_review"),
    schemaVersion: z.literal("execution-platform.pre-proof-staged-graph-quality-review.v1"),
    reviewSource: z.literal("model_authored"),
    reviewRef: boundedString(320),
    missionId: boundedString(160),
    graphId: boundedString(180),
    status: z.enum(["accepted", "needs_repair", "rejected"]),
    graphCoversCommitments: z.boolean(),
    graphHasEdgesOrParallelJustification: z.boolean(),
    costAwareCapabilityChoicesUseful: z.boolean(),
    firstNodeSafeBeforeImplementation: z.boolean(),
    workerHandoffsClear: z.boolean(),
    reviewerSummary: boundedString(1_500),
    missingInformation: stringList(16, 700),
    repairInstructions: stringList(16, 700),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type PreProofStagedGraphQualityReview = z.infer<
  typeof PreProofStagedGraphQualityReviewSchema
>;

export const PreProofMissionPacketGraphLaneQualityReviewSchema = z
  .object({
    artifactKind: z.literal("pre_proof_mission_packet_graph_lane_quality_review"),
    schemaVersion: z.literal("execution-platform.pre-proof-mission-packet-graph-lane-review.v1"),
    reviewSource: z.literal("model_authored"),
    reviewRef: boundedString(320),
    missionId: boundedString(160),
    graphId: boundedString(180),
    status: z.enum(["accepted", "needs_repair", "rejected"]),
    missionLedgerPassed: z.boolean(),
    packetsPassed: z.boolean(),
    contextScoutReadinessPassed: z.boolean(),
    graphCompilePassed: z.boolean(),
    workQueueChildMaterializationPassed: z.boolean(),
    stoppedBeforeImplementation: z.boolean(),
    readyForFullProductSpecProof: z.boolean(),
    reviewerSummary: boundedString(1_500),
    missingInformation: stringList(24, 700),
    repairInstructions: stringList(24, 700),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
  })
  .strict();

export type PreProofMissionPacketGraphLaneQualityReview = z.infer<
  typeof PreProofMissionPacketGraphLaneQualityReviewSchema
>;

export type PreProofLaneValidationInput = {
  sourcePromptIndex: SourcePromptContextIndex;
  ledger: MissionContractLedger;
  ledgerQualityReview: PreProofMissionLedgerQualityReview;
  packets: CommitmentWorkPacket[];
  packetQualityReview: CommitmentPacketQualityReview;
  contextScoutReadiness: ContextScoutToolLoopRun;
  contextScoutReadinessReview: PreProofContextScoutReadinessReview;
  graphQualityReview: PreProofStagedGraphQualityReview;
  laneQualityReview: PreProofMissionPacketGraphLaneQualityReview;
  graphNodes: TeamGraphNode[];
  graphEdges: TeamGraphEdge[];
  workQueueChildItemIds: string[];
  executedNodeIds: string[];
};

export type PreProofLaneValidationResult = {
  accepted: boolean;
  reasonCodes: string[];
  sourcePromptHash: string;
  missionId: string;
  graphId: string;
  nodeCount: number;
  edgeCount: number;
  workQueueChildCount: number;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
};

function openBlockingCommitmentIds(ledger: MissionContractLedger): string[] {
  return ledger.blockingCommitments
    .filter((commitment) => commitment.status !== "satisfied")
    .map((commitment) => commitment.commitmentId);
}

function commitmentIdsCoveredByNodes(nodes: TeamGraphNode[]): Set<string> {
  const covered = new Set<string>();
  for (const node of nodes) {
    const metadata =
      node.metadata && typeof node.metadata === "object" && !Array.isArray(node.metadata)
        ? (node.metadata as Record<string, unknown>)
        : {};
    const commitmentIds = [
      ...(Array.isArray(metadata.commitmentIds) ? metadata.commitmentIds : []),
      ...(Array.isArray(metadata.commitmentIdsAdvanced) ? metadata.commitmentIdsAdvanced : []),
      ...(Array.isArray(metadata.targetCommitmentIds) ? metadata.targetCommitmentIds : []),
    ];
    for (const commitmentId of commitmentIds) {
      if (typeof commitmentId === "string" && commitmentId.trim()) {
        covered.add(commitmentId);
      }
    }
  }
  return covered;
}

export function validatePreProofMissionPacketGraphLane(
  input: PreProofLaneValidationInput,
): PreProofLaneValidationResult {
  const reasonCodes: string[] = [];
  if (input.sourcePromptIndex.resolutionStatus !== "resolved") {
    reasonCodes.push(`source_prompt_not_resolved:${input.sourcePromptIndex.resolutionStatus}`);
  }
  if (input.ledger.missionGate !== "clear_to_execute") {
    reasonCodes.push(`mission_gate_not_clear:${input.ledger.missionGate}`);
  }
  if (input.ledgerQualityReview.status !== "accepted") {
    reasonCodes.push(`mission_ledger_quality_not_accepted:${input.ledgerQualityReview.status}`);
  }
  if (
    !input.ledgerQualityReview.objectivePreserved ||
    !input.ledgerQualityReview.commitmentsActionable ||
    !input.ledgerQualityReview.constraintsBounded ||
    !input.ledgerQualityReview.evidenceExpectationsClear
  ) {
    reasonCodes.push("mission_ledger_quality_flags_not_all_true");
  }

  const packetValidation = validateCommitmentWorkPacketsForScheduler({
    packets: input.packets,
    ledger: input.ledger,
  });
  if (!packetValidation.valid) {
    reasonCodes.push(...packetValidation.reasonCodes);
  }
  if (input.packetQualityReview.status !== "accepted") {
    reasonCodes.push(`packet_quality_review_not_accepted:${input.packetQualityReview.status}`);
  }
  if (input.packets.length < input.ledger.blockingCommitments.length) {
    reasonCodes.push("packet_count_less_than_blocking_commitments");
  }

  const contextValidation = validateContextScoutToolLoopForImplementation(
    input.contextScoutReadiness,
  );
  if (!contextValidation.valid) {
    reasonCodes.push(...contextValidation.reasonCodes);
  }
  if (input.contextScoutReadinessReview.status !== "accepted") {
    reasonCodes.push(
      `context_scout_readiness_review_not_accepted:${input.contextScoutReadinessReview.status}`,
    );
  }
  if (
    !input.contextScoutReadinessReview.contextScoutCanStart ||
    !input.contextScoutReadinessReview.verifiedRefsEnoughForFirstScout ||
    !input.contextScoutReadinessReview.promptExcerptPolicyClear ||
    !input.contextScoutReadinessReview.handoffUsefulForScheduler
  ) {
    reasonCodes.push("context_scout_readiness_flags_not_all_true");
  }

  if (input.graphQualityReview.status !== "accepted") {
    reasonCodes.push(`graph_quality_review_not_accepted:${input.graphQualityReview.status}`);
  }
  if (
    !input.graphQualityReview.graphCoversCommitments ||
    !input.graphQualityReview.graphHasEdgesOrParallelJustification ||
    !input.graphQualityReview.costAwareCapabilityChoicesUseful ||
    !input.graphQualityReview.firstNodeSafeBeforeImplementation ||
    !input.graphQualityReview.workerHandoffsClear
  ) {
    reasonCodes.push("graph_quality_flags_not_all_true");
  }
  if (input.graphNodes.length === 0) {
    reasonCodes.push("graph_nodes_missing");
  }
  if (input.graphEdges.length === 0) {
    reasonCodes.push("graph_edges_missing");
  }
  const coveredCommitments = commitmentIdsCoveredByNodes(input.graphNodes);
  for (const commitmentId of openBlockingCommitmentIds(input.ledger)) {
    if (!coveredCommitments.has(commitmentId)) {
      reasonCodes.push(`graph_node_commitment_coverage_missing:${commitmentId}`);
    }
  }

  if (input.workQueueChildItemIds.length < input.graphNodes.length) {
    reasonCodes.push("work_queue_child_materialization_incomplete");
  }
  if (input.executedNodeIds.length > 0) {
    reasonCodes.push("pre_proof_lane_executed_nodes_unexpected");
  }
  if (input.laneQualityReview.status !== "accepted") {
    reasonCodes.push(`lane_quality_review_not_accepted:${input.laneQualityReview.status}`);
  }
  if (
    !input.laneQualityReview.missionLedgerPassed ||
    !input.laneQualityReview.packetsPassed ||
    !input.laneQualityReview.contextScoutReadinessPassed ||
    !input.laneQualityReview.graphCompilePassed ||
    !input.laneQualityReview.workQueueChildMaterializationPassed ||
    !input.laneQualityReview.stoppedBeforeImplementation ||
    !input.laneQualityReview.readyForFullProductSpecProof
  ) {
    reasonCodes.push("lane_quality_flags_not_all_true");
  }

  return {
    accepted: reasonCodes.length === 0,
    reasonCodes,
    sourcePromptHash: input.sourcePromptIndex.promptHash,
    missionId: input.ledger.missionId,
    graphId: input.graphQualityReview.graphId,
    nodeCount: input.graphNodes.length,
    edgeCount: input.graphEdges.length,
    workQueueChildCount: input.workQueueChildItemIds.length,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
}

export function summarizePreProofMissionPacketGraphLane(input: {
  validation: PreProofLaneValidationResult;
  ledgerReview: PreProofMissionLedgerQualityReview;
  packetReview: CommitmentPacketQualityReview;
  contextReview: PreProofContextScoutReadinessReview;
  graphReview: PreProofStagedGraphQualityReview;
  laneReview: PreProofMissionPacketGraphLaneQualityReview;
  workQueueChildItemIds: string[];
}): JsonValue {
  return {
    artifactKind: PRE_PROOF_MISSION_PACKET_GRAPH_LANE_ARTIFACT_TYPE,
    status: input.validation.accepted ? "passed" : "needs_review",
    reasonCodes: input.validation.reasonCodes,
    sourcePromptHash: input.validation.sourcePromptHash,
    missionId: input.validation.missionId,
    graphId: input.validation.graphId,
    nodeCount: input.validation.nodeCount,
    edgeCount: input.validation.edgeCount,
    workQueueChildCount: input.validation.workQueueChildCount,
    workQueueChildItemIds: input.workQueueChildItemIds,
    reviewRefs: [
      input.ledgerReview.reviewRef,
      input.packetReview.reviewRef,
      input.contextReview.reviewRef,
      input.graphReview.reviewRef,
      input.laneReview.reviewRef,
    ],
    readyForFullProductSpecProof:
      input.validation.accepted && input.laneReview.readyForFullProductSpecProof,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    rawDbRowsStored: false,
  } satisfies JsonValue;
}
