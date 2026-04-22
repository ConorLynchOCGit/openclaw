export type ModelMemoryDbLane = "retrieval" | "capture" | "rebuild" | "admin" | "default";

export type ModelMemoryDbLaneSettings = {
  laneConcurrency: Record<ModelMemoryDbLane, number>;
  pressureWaitingCountThreshold: number;
  pressureAcquireLatencyMsThreshold: number;
  pressureTimeoutCountThreshold: number;
};

export type ModelMemoryDbLaneSnapshot = {
  lane: ModelMemoryDbLane;
  maxConcurrency: number;
  activeCount: number;
  waitingCount: number;
  lastAcquireLatencyMs?: number;
  lastRunLatencyMs?: number;
  timeoutCount: number;
  errorCount: number;
};

export type ModelMemoryDbPoolPressureSnapshot = {
  totalCount?: number;
  idleCount?: number;
  waitingCount?: number;
  laneStats: ModelMemoryDbLaneSnapshot[];
  pressure: boolean;
  reasons: string[];
};

export type ModelMemoryDbPoolLike = {
  totalCount?: number;
  idleCount?: number;
  waitingCount?: number;
};

export type ModelMemoryDbLaneController = {
  runWithLane<T>(lane: ModelMemoryDbLane, work: () => Promise<T>): Promise<T>;
  snapshot(): ModelMemoryDbPoolPressureSnapshot;
  shouldDeferLane(lane: ModelMemoryDbLane): boolean;
};

const DEFAULT_LANE_CONCURRENCY: Record<ModelMemoryDbLane, number> = {
  retrieval: 4,
  capture: 1,
  rebuild: 1,
  admin: 1,
  default: 2,
};

function readPositiveIntegerEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  max = 256,
): number {
  const parsed = Number.parseInt(env[name]?.trim() ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

export function resolveModelMemoryDbLaneSettings(
  env: NodeJS.ProcessEnv = process.env,
): ModelMemoryDbLaneSettings {
  return {
    laneConcurrency: {
      retrieval: readPositiveIntegerEnv(
        env,
        "MODEL_MEMORY_DB_RETRIEVAL_LANE_CONCURRENCY",
        DEFAULT_LANE_CONCURRENCY.retrieval,
      ),
      capture: readPositiveIntegerEnv(
        env,
        "MODEL_MEMORY_DB_CAPTURE_LANE_CONCURRENCY",
        DEFAULT_LANE_CONCURRENCY.capture,
      ),
      rebuild: readPositiveIntegerEnv(
        env,
        "MODEL_MEMORY_DB_REBUILD_LANE_CONCURRENCY",
        DEFAULT_LANE_CONCURRENCY.rebuild,
      ),
      admin: readPositiveIntegerEnv(
        env,
        "MODEL_MEMORY_DB_ADMIN_LANE_CONCURRENCY",
        DEFAULT_LANE_CONCURRENCY.admin,
      ),
      default: readPositiveIntegerEnv(
        env,
        "MODEL_MEMORY_DB_DEFAULT_LANE_CONCURRENCY",
        DEFAULT_LANE_CONCURRENCY.default,
      ),
    },
    pressureWaitingCountThreshold: readPositiveIntegerEnv(
      env,
      "MODEL_MEMORY_DB_POOL_PRESSURE_WAITING_THRESHOLD",
      1,
    ),
    pressureAcquireLatencyMsThreshold: readPositiveIntegerEnv(
      env,
      "MODEL_MEMORY_DB_POOL_PRESSURE_ACQUIRE_LATENCY_MS",
      5_000,
      600_000,
    ),
    pressureTimeoutCountThreshold: readPositiveIntegerEnv(
      env,
      "MODEL_MEMORY_DB_POOL_PRESSURE_TIMEOUT_COUNT_THRESHOLD",
      1,
    ),
  };
}

type LaneState = {
  activeCount: number;
  waitingCount: number;
  lastAcquireLatencyMs?: number;
  lastRunLatencyMs?: number;
  timeoutCount: number;
  errorCount: number;
  waiters: Array<() => void>;
};

function createLaneState(): LaneState {
  return {
    activeCount: 0,
    waitingCount: 0,
    timeoutCount: 0,
    errorCount: 0,
    waiters: [],
  };
}

function nowMs() {
  return Date.now();
}

function isConnectionTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /timeout exceeded when trying to connect|connection timeout|pool pressure|pool_pressure/iu.test(
    message,
  );
}

export function createModelMemoryDbLaneController(input: {
  pool?: ModelMemoryDbPoolLike;
  env?: NodeJS.ProcessEnv;
  settings?: ModelMemoryDbLaneSettings;
}): ModelMemoryDbLaneController {
  const settings = input.settings ?? resolveModelMemoryDbLaneSettings(input.env);
  const lanes = new Map<ModelMemoryDbLane, LaneState>(
    (Object.keys(DEFAULT_LANE_CONCURRENCY) as ModelMemoryDbLane[]).map((lane) => [
      lane,
      createLaneState(),
    ]),
  );

  const getLane = (lane: ModelMemoryDbLane) => lanes.get(lane) ?? lanes.get("default")!;

  const snapshot = (): ModelMemoryDbPoolPressureSnapshot => {
    const laneStats = (Object.keys(DEFAULT_LANE_CONCURRENCY) as ModelMemoryDbLane[]).map(
      (lane): ModelMemoryDbLaneSnapshot => {
        const state = getLane(lane);
        return {
          lane,
          maxConcurrency: settings.laneConcurrency[lane],
          activeCount: state.activeCount,
          waitingCount: state.waitingCount,
          lastAcquireLatencyMs: state.lastAcquireLatencyMs,
          lastRunLatencyMs: state.lastRunLatencyMs,
          timeoutCount: state.timeoutCount,
          errorCount: state.errorCount,
        };
      },
    );
    const reasons: string[] = [];
    const poolWaiting = input.pool?.waitingCount ?? 0;
    if (poolWaiting >= settings.pressureWaitingCountThreshold) {
      reasons.push(`pool_waiting_count:${poolWaiting}`);
    }
    for (const lane of laneStats) {
      if (lane.waitingCount > 0) {
        reasons.push(`${lane.lane}_lane_waiting:${lane.waitingCount}`);
      }
      if (
        lane.lastAcquireLatencyMs !== undefined &&
        lane.lastAcquireLatencyMs >= settings.pressureAcquireLatencyMsThreshold
      ) {
        reasons.push(`${lane.lane}_acquire_latency_ms:${lane.lastAcquireLatencyMs}`);
      }
      if (lane.timeoutCount >= settings.pressureTimeoutCountThreshold) {
        reasons.push(`${lane.lane}_timeout_count:${lane.timeoutCount}`);
      }
    }
    return {
      totalCount: input.pool?.totalCount,
      idleCount: input.pool?.idleCount,
      waitingCount: input.pool?.waitingCount,
      laneStats,
      pressure: reasons.length > 0,
      reasons,
    };
  };

  const releaseLane = (state: LaneState) => {
    state.activeCount = Math.max(0, state.activeCount - 1);
    state.waiters.shift()?.();
  };

  return {
    async runWithLane<T>(lane: ModelMemoryDbLane, work: () => Promise<T>): Promise<T> {
      const state = getLane(lane);
      const maxConcurrency = settings.laneConcurrency[lane] ?? settings.laneConcurrency.default;
      const acquireStartedAt = nowMs();
      if (state.activeCount >= maxConcurrency) {
        state.waitingCount += 1;
        await new Promise<void>((resolve) => state.waiters.push(resolve));
        state.waitingCount = Math.max(0, state.waitingCount - 1);
      }
      state.activeCount += 1;
      state.lastAcquireLatencyMs = nowMs() - acquireStartedAt;
      const runStartedAt = nowMs();
      try {
        return await work();
      } catch (error) {
        state.errorCount += 1;
        if (isConnectionTimeoutError(error)) {
          state.timeoutCount += 1;
        }
        throw error;
      } finally {
        state.lastRunLatencyMs = nowMs() - runStartedAt;
        releaseLane(state);
      }
    },
    snapshot,
    shouldDeferLane(lane: ModelMemoryDbLane): boolean {
      if (lane === "retrieval" || lane === "admin") {
        return false;
      }
      return snapshot().pressure;
    },
  };
}
