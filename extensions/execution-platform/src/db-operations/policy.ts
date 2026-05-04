import type {
  DbOperationClassification,
  DbOperationKind,
  DbOperationLane,
  DbOperationLanePolicy,
  DbOperationTimeoutPolicy,
  DbPoolPressureClassification,
  DbPoolPressureSnapshot,
} from "./types.ts";

const DEFAULT_TIMEOUT_POLICY: DbOperationTimeoutPolicy = {
  interactive: {
    synchronousTimeoutMs: 1_500,
    durableAfterMs: 5_000,
    maxPoolUtilization: 0.85,
    maxWaitingCount: 2,
    rejectPoolUtilization: 0.98,
  },
  background: {
    synchronousTimeoutMs: 5_000,
    durableAfterMs: 30_000,
    maxPoolUtilization: 0.9,
    maxWaitingCount: 5,
    rejectPoolUtilization: 0.99,
  },
  maintenance: {
    synchronousTimeoutMs: 10_000,
    durableAfterMs: 15_000,
    maxPoolUtilization: 0.8,
    maxWaitingCount: 3,
    rejectPoolUtilization: 0.95,
  },
  migration: {
    synchronousTimeoutMs: 10_000,
    durableAfterMs: 10_000,
    maxPoolUtilization: 0.75,
    maxWaitingCount: 1,
    rejectPoolUtilization: 0.9,
  },
  analytics: {
    synchronousTimeoutMs: 8_000,
    durableAfterMs: 20_000,
    maxPoolUtilization: 0.85,
    maxWaitingCount: 4,
    rejectPoolUtilization: 0.97,
  },
};

const LONG_OPERATION_KINDS = new Set<DbOperationKind>([
  "long_read",
  "maintenance",
  "migration",
  "batch",
]);

export function createDbOperationLaneTimeoutPolicy(
  overrides: Partial<Record<DbOperationLane, Partial<DbOperationLanePolicy>>> = {},
): DbOperationTimeoutPolicy {
  return {
    interactive: { ...DEFAULT_TIMEOUT_POLICY.interactive, ...overrides.interactive },
    background: { ...DEFAULT_TIMEOUT_POLICY.background, ...overrides.background },
    maintenance: { ...DEFAULT_TIMEOUT_POLICY.maintenance, ...overrides.maintenance },
    migration: { ...DEFAULT_TIMEOUT_POLICY.migration, ...overrides.migration },
    analytics: { ...DEFAULT_TIMEOUT_POLICY.analytics, ...overrides.analytics },
  };
}

export function classifyPoolPressureDeferral(
  pressure: DbPoolPressureSnapshot,
  lanePolicy: DbOperationLanePolicy,
): DbPoolPressureClassification {
  if (pressure.utilization >= lanePolicy.rejectPoolUtilization) {
    return {
      decision: "reject",
      reason: "pool utilization exceeds rejection threshold",
      pressure,
    };
  }
  if (
    pressure.utilization >= lanePolicy.maxPoolUtilization ||
    pressure.waitingCount > lanePolicy.maxWaitingCount
  ) {
    return {
      decision: "defer",
      reason: "pool pressure exceeds lane deferral policy",
      pressure,
    };
  }
  return {
    decision: "allow",
    reason: "pool pressure is within lane policy",
    pressure,
  };
}

export function classifyDbOperation(input: {
  operationKind: DbOperationKind;
  lane: DbOperationLane;
  estimatedDurationMs?: number;
  pressureSnapshot?: DbPoolPressureSnapshot;
  policy?: DbOperationTimeoutPolicy;
}): DbOperationClassification {
  const policy = input.policy ?? createDbOperationLaneTimeoutPolicy();
  const lanePolicy = policy[input.lane];
  const pressure = input.pressureSnapshot
    ? classifyPoolPressureDeferral(input.pressureSnapshot, lanePolicy)
    : undefined;
  if (pressure?.decision === "reject") {
    return {
      decision: "rejected",
      reason: pressure.reason,
      lane: input.lane,
      operationKind: input.operationKind,
      timeoutBudgetMs: lanePolicy.synchronousTimeoutMs,
      durableAfterMs: lanePolicy.durableAfterMs,
      pressure,
    };
  }
  if (pressure?.decision === "defer") {
    return {
      decision: "deferred",
      reason: pressure.reason,
      lane: input.lane,
      operationKind: input.operationKind,
      timeoutBudgetMs: lanePolicy.synchronousTimeoutMs,
      durableAfterMs: lanePolicy.durableAfterMs,
      pressure,
    };
  }
  if (input.lane === "interactive" && input.operationKind === "migration") {
    return {
      decision: "rejected",
      reason: "migration operations are not allowed on the interactive lane",
      lane: input.lane,
      operationKind: input.operationKind,
      timeoutBudgetMs: lanePolicy.synchronousTimeoutMs,
      durableAfterMs: lanePolicy.durableAfterMs,
      pressure,
    };
  }
  if (
    LONG_OPERATION_KINDS.has(input.operationKind) ||
    (input.estimatedDurationMs ?? 0) > lanePolicy.durableAfterMs
  ) {
    return {
      decision: "durable",
      reason: "operation should run as a durable runtime job",
      lane: input.lane,
      operationKind: input.operationKind,
      timeoutBudgetMs: lanePolicy.synchronousTimeoutMs,
      durableAfterMs: lanePolicy.durableAfterMs,
      pressure,
    };
  }
  return {
    decision: "synchronous",
    reason: "operation is within synchronous lane policy",
    lane: input.lane,
    operationKind: input.operationKind,
    timeoutBudgetMs: lanePolicy.synchronousTimeoutMs,
    durableAfterMs: lanePolicy.durableAfterMs,
    pressure,
  };
}
