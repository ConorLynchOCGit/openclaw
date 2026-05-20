export type RuntimeWorkGraphSchedulerSnapshotSummary = {
  workflowId: string;
  graphStatus: string;
  nodeSummaries: Array<{
    nodeId: string;
    nodeKind: string;
    assignedRole: string;
    nodeStatus: string;
    capabilityId?: string | null;
    metadataCapabilityId?: string | null;
    executorKey?: string | null;
    commitmentIdsAdvanced?: string[];
    downstreamConsumer?: string | null;
    inputHandoffRefs?: string[];
    noContextNeededRationale?: string | null;
    outputArtifactRefs: string[];
    contextSynthesisRef?: string | null;
    contextSynthesisStatus?: string | null;
    contextSynthesisAccepted?: boolean;
    lastStatusReasonCodes?: string[];
    lastRepairClassificationRef?: string | null;
    lastRepairFailureClass?: string | null;
    lastRepairStrategy?: string | null;
    lastRepairBoundary?: string | null;
    highCapabilityEscalationRequired?: boolean;
  }>;
  edgeSummaries?: Array<{
    edgeId: string;
    fromNodeId: string | null;
    toNodeId: string | null;
    edgeKind: string;
  }>;
  edgeCount: number;
  humanTaskCount: number;
  latestCheckpointKinds: string[];
};
