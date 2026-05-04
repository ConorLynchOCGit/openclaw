import { randomUUID } from "node:crypto";
import type { JsonValue } from "../runtime-job-repository.ts";
import { classifyDbOperation } from "./policy.ts";
import type {
  DbOperationClassification,
  DbOperationKind,
  DbOperationLane,
  DbOperationTelemetry,
  DbOperationTimeoutPolicy,
  DbPoolPressureSnapshot,
} from "./types.ts";

export class DbOperationTimeoutError extends Error {
  constructor(
    message: string,
    readonly telemetry: DbOperationTelemetry,
  ) {
    super(message);
    this.name = "DbOperationTimeoutError";
  }
}

export class DbOperationTelemetryRepository {
  private readonly telemetry: DbOperationTelemetry[] = [];

  constructor(private readonly maxEntries = 500) {}

  recordDbOperationTelemetry(
    input: Omit<DbOperationTelemetry, "telemetryId"> & { telemetryId?: string },
  ): DbOperationTelemetry {
    const entry: DbOperationTelemetry = {
      ...input,
      telemetryId: input.telemetryId ?? randomUUID(),
    };
    this.telemetry.push(entry);
    if (this.telemetry.length > this.maxEntries) {
      this.telemetry.splice(0, this.telemetry.length - this.maxEntries);
    }
    return entry;
  }

  readRecentDbOperationTelemetry(
    input: {
      limit?: number;
      operationName?: string;
      jobId?: string;
    } = {},
  ): DbOperationTelemetry[] {
    const limit = input.limit ?? 50;
    return this.telemetry
      .filter((entry) => !input.operationName || entry.operationName === input.operationName)
      .filter((entry) => !input.jobId || entry.jobId === input.jobId)
      .slice(-limit)
      .toReversed();
  }
}

export async function runShortDbOperation<T extends JsonValue>(input: {
  operationName: string;
  operationKind: DbOperationKind;
  lane: DbOperationLane;
  telemetry: DbOperationTelemetryRepository;
  execute: () => Promise<T> | T;
  now?: () => Date;
  estimatedDurationMs?: number;
  pressureSnapshot?: DbPoolPressureSnapshot;
  policy?: DbOperationTimeoutPolicy;
}): Promise<{ result: T; telemetry: DbOperationTelemetry }> {
  const now = input.now ?? (() => new Date());
  const classification = classifyDbOperation({
    operationKind: input.operationKind,
    lane: input.lane,
    estimatedDurationMs: input.estimatedDurationMs,
    pressureSnapshot: input.pressureSnapshot,
    policy: input.policy,
  });
  if (classification.decision !== "synchronous") {
    const at = now().toISOString();
    const telemetry = recordOutcome({
      telemetryRepository: input.telemetry,
      operationName: input.operationName,
      operationKind: input.operationKind,
      lane: input.lane,
      classification,
      startedAt: at,
      completedAt: at,
      durationMs: 0,
      outcome: classification.decision === "rejected" ? "rejected" : "deferred",
      pressureSnapshot: input.pressureSnapshot,
      error: { code: `db_operation_${classification.decision}`, reason: classification.reason },
    });
    throw new DbOperationTimeoutError(
      `db operation is not eligible for synchronous execution: ${classification.reason}`,
      telemetry,
    );
  }

  const startedAt = now();
  try {
    const result = await input.execute();
    const completedAt = now();
    const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());
    const common = {
      telemetryRepository: input.telemetry,
      operationName: input.operationName,
      operationKind: input.operationKind,
      lane: input.lane,
      classification,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs,
      pressureSnapshot: input.pressureSnapshot,
    };
    if (durationMs > classification.timeoutBudgetMs) {
      const telemetry = recordOutcome({
        ...common,
        outcome: "timed_out",
        error: {
          code: "db_operation_timed_out",
          timeoutBudgetMs: classification.timeoutBudgetMs,
          durationMs,
        },
      });
      throw new DbOperationTimeoutError(
        `db operation exceeded timeout budget: ${durationMs}ms > ${classification.timeoutBudgetMs}ms`,
        telemetry,
      );
    }
    return {
      result,
      telemetry: recordOutcome({
        ...common,
        outcome: "succeeded",
      }),
    };
  } catch (error) {
    if (error instanceof DbOperationTimeoutError) {
      throw error;
    }
    const completedAt = now();
    const telemetry = recordOutcome({
      telemetryRepository: input.telemetry,
      operationName: input.operationName,
      operationKind: input.operationKind,
      lane: input.lane,
      classification,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
      outcome: "failed",
      pressureSnapshot: input.pressureSnapshot,
      error: {
        code: "db_operation_failed",
        message: error instanceof Error ? error.message : String(error),
      },
    });
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { telemetry });
  }
}

function recordOutcome(input: {
  telemetryRepository: DbOperationTelemetryRepository;
  operationName: string;
  operationKind: DbOperationKind;
  lane: DbOperationLane;
  classification: DbOperationClassification;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  outcome: DbOperationTelemetry["outcome"];
  pressureSnapshot?: DbPoolPressureSnapshot;
  error?: JsonValue;
}): DbOperationTelemetry {
  return input.telemetryRepository.recordDbOperationTelemetry({
    operationName: input.operationName,
    operationKind: input.operationKind,
    lane: input.lane,
    decision: input.classification.decision,
    outcome: input.outcome,
    timeoutBudgetMs: input.classification.timeoutBudgetMs,
    durationMs: input.durationMs,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    pressureSnapshot: input.pressureSnapshot,
    classification: input.classification,
    error: input.error,
  });
}
