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
    outputArtifactRefs: string[];
  }>;
  edgeCount: number;
  humanTaskCount: number;
  latestCheckpointKinds: string[];
};
