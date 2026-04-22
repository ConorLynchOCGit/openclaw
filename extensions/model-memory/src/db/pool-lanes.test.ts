import { describe, expect, it } from "vitest";
import {
  createModelMemoryDbLaneController,
  resolveModelMemoryDbLaneSettings,
} from "./pool-lanes.ts";

describe("model-memory DB pool lanes", () => {
  it("resolves lane and pressure env settings", () => {
    const settings = resolveModelMemoryDbLaneSettings({
      MODEL_MEMORY_DB_RETRIEVAL_LANE_CONCURRENCY: "8",
      MODEL_MEMORY_DB_CAPTURE_LANE_CONCURRENCY: "2",
      MODEL_MEMORY_DB_REBUILD_LANE_CONCURRENCY: "1",
      MODEL_MEMORY_DB_POOL_PRESSURE_WAITING_THRESHOLD: "3",
      MODEL_MEMORY_DB_POOL_PRESSURE_ACQUIRE_LATENCY_MS: "250",
    } as NodeJS.ProcessEnv);

    expect(settings.laneConcurrency).toMatchObject({
      retrieval: 8,
      capture: 2,
      rebuild: 1,
    });
    expect(settings.pressureWaitingCountThreshold).toBe(3);
    expect(settings.pressureAcquireLatencyMsThreshold).toBe(250);
  });

  it("marks background lanes deferrable under pool pressure while preserving retrieval", () => {
    const controller = createModelMemoryDbLaneController({
      pool: { totalCount: 5, idleCount: 0, waitingCount: 4 },
      settings: {
        laneConcurrency: { retrieval: 2, capture: 1, rebuild: 1, admin: 1, default: 1 },
        pressureWaitingCountThreshold: 1,
        pressureAcquireLatencyMsThreshold: 10_000,
        pressureTimeoutCountThreshold: 1,
      },
    });

    const snapshot = controller.snapshot();

    expect(snapshot.pressure).toBe(true);
    expect(snapshot.reasons).toContain("pool_waiting_count:4");
    expect(controller.shouldDeferLane("capture")).toBe(true);
    expect(controller.shouldDeferLane("rebuild")).toBe(true);
    expect(controller.shouldDeferLane("retrieval")).toBe(false);
  });

  it("serializes low-priority lanes by configured concurrency", async () => {
    const controller = createModelMemoryDbLaneController({
      settings: {
        laneConcurrency: { retrieval: 2, capture: 1, rebuild: 1, admin: 1, default: 1 },
        pressureWaitingCountThreshold: 99,
        pressureAcquireLatencyMsThreshold: 10_000,
        pressureTimeoutCountThreshold: 99,
      },
    });
    const order: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const first = controller.runWithLane("capture", async () => {
      order.push("first-start");
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      order.push("first-end");
    });
    const second = controller.runWithLane("capture", async () => {
      order.push("second-start");
    });

    await Promise.resolve();
    expect(controller.snapshot().laneStats.find((lane) => lane.lane === "capture")).toMatchObject({
      activeCount: 1,
      waitingCount: 1,
    });
    releaseFirst?.();
    await Promise.all([first, second]);

    expect(order).toEqual(["first-start", "first-end", "second-start"]);
  });
});
