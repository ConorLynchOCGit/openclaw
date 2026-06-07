export type AgentTeamParallelLaneKind = "read_only" | "review" | "write";
export type AgentTeamParallelLaneStatus = "pending" | "running" | "completed" | "blocked";

export type AgentTeamParallelLane = {
  laneId: string;
  roleId: string;
  laneKind: AgentTeamParallelLaneKind;
  status: AgentTeamParallelLaneStatus;
  startedAt: string | null;
  finishedAt: string | null;
  evidenceRefs: string[];
  writeAuthorityGranted: boolean;
};

export type AgentTeamParallelPlan = {
  artifactKind: "agent_team_parallel_plan";
  teamRunId: string;
  lanes: AgentTeamParallelLane[];
  joinRequiredRoleIds: string[];
  singleWriterEnforced: boolean;
  conflictsBecomeNeedsReview: true;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type AgentTeamParallelPlanValidation = {
  valid: boolean;
  blockingReasons: string[];
  writeLaneCount: number;
};

export function createBoundedParallelAgentTeamPlan(input: {
  teamRunId: string;
  createdAt: string;
}): AgentTeamParallelPlan {
  return {
    artifactKind: "agent_team_parallel_plan",
    teamRunId: input.teamRunId,
    lanes: [
      {
        laneId: `${input.teamRunId}-context-scout`,
        roleId: "context_scout",
        laneKind: "read_only",
        status: "pending",
        startedAt: null,
        finishedAt: null,
        evidenceRefs: [],
        writeAuthorityGranted: false,
      },
      {
        laneId: `${input.teamRunId}-observability-prep`,
        roleId: "observability_scribe",
        laneKind: "read_only",
        status: "pending",
        startedAt: null,
        finishedAt: null,
        evidenceRefs: [],
        writeAuthorityGranted: false,
      },
      {
        laneId: `${input.teamRunId}-implementation`,
        roleId: "implementation_engineer",
        laneKind: "write",
        status: "pending",
        startedAt: null,
        finishedAt: null,
        evidenceRefs: [],
        writeAuthorityGranted: true,
      },
      {
        laneId: `${input.teamRunId}-security-review`,
        roleId: "security_privacy_reviewer",
        laneKind: "review",
        status: "pending",
        startedAt: null,
        finishedAt: null,
        evidenceRefs: [],
        writeAuthorityGranted: false,
      },
      {
        laneId: `${input.teamRunId}-test-assist`,
        roleId: "test_engineer",
        laneKind: "review",
        status: "pending",
        startedAt: null,
        finishedAt: null,
        evidenceRefs: [],
        writeAuthorityGranted: false,
      },
    ],
    joinRequiredRoleIds: [
      "context_scout",
      "implementation_engineer",
      "test_engineer",
      "security_privacy_reviewer",
    ],
    singleWriterEnforced: true,
    conflictsBecomeNeedsReview: true,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function validateAgentTeamParallelPlan(
  plan: AgentTeamParallelPlan,
): AgentTeamParallelPlanValidation {
  const writeLaneCount = plan.lanes.filter((lane) => lane.writeAuthorityGranted).length;
  const blockingReasons: string[] = [];
  if (writeLaneCount > 1) {
    blockingReasons.push("parallel_write_lanes_not_allowed");
  }
  if (!plan.singleWriterEnforced) {
    blockingReasons.push("single_writer_required");
  }
  for (const roleId of plan.joinRequiredRoleIds) {
    if (!plan.lanes.some((lane) => lane.roleId === roleId)) {
      blockingReasons.push(`missing_join_role:${roleId}`);
    }
  }
  return { valid: blockingReasons.length === 0, blockingReasons, writeLaneCount };
}

export function completeParallelLane(input: {
  plan: AgentTeamParallelPlan;
  laneId: string;
  completedAt: string;
  evidenceRef: string;
}): AgentTeamParallelPlan {
  return {
    ...input.plan,
    lanes: input.plan.lanes.map((lane) =>
      lane.laneId === input.laneId
        ? {
            ...lane,
            status: "completed",
            startedAt: lane.startedAt ?? input.completedAt,
            finishedAt: input.completedAt,
            evidenceRefs: [...lane.evidenceRefs, input.evidenceRef],
          }
        : lane,
    ),
  };
}
