import { describe, expect, it, vi } from "vitest";
import { createModelMemoryDbLaneController } from "./pool-lanes.ts";
import { PgSqlClient } from "./sql-client.ts";

describe("PgSqlClient", () => {
  it("does not reconnect an already-checked-out client during nested transactions", async () => {
    const clientConnect = vi.fn(async () => {
      throw new Error("client connect should not be called");
    });
    const clientQuery = vi.fn(async () => ({ rows: [] }));
    const clientRelease = vi.fn();
    const client = {
      connect: clientConnect,
      query: clientQuery,
      release: clientRelease,
    };
    const poolConnect = vi.fn(async () => client);
    const poolQuery = vi.fn(async () => ({ rows: [] }));
    const sql = new PgSqlClient({
      connect: poolConnect,
      query: poolQuery,
    } as unknown as ConstructorParameters<typeof PgSqlClient>[0]);

    await sql.withTransaction(async (tx) => {
      await tx.withTransaction(async (nestedTx) => {
        await nestedTx.query("SELECT 1");
      });
    });

    expect(poolConnect).toHaveBeenCalledTimes(1);
    expect(clientConnect).not.toHaveBeenCalled();
    expect(clientRelease).toHaveBeenCalledTimes(1);
  });

  it("runs a transaction through the configured lane without reacquiring for nested queries", async () => {
    const clientQuery = vi.fn(async () => ({ rows: [] }));
    const clientRelease = vi.fn();
    const client = {
      query: clientQuery,
      release: clientRelease,
    };
    const poolConnect = vi.fn(async () => client);
    const poolQuery = vi.fn(async () => ({ rows: [] }));
    const laneController = createModelMemoryDbLaneController({
      settings: {
        laneConcurrency: { retrieval: 2, capture: 1, rebuild: 1, admin: 1, default: 1 },
        pressureWaitingCountThreshold: 99,
        pressureAcquireLatencyMsThreshold: 10_000,
        pressureTimeoutCountThreshold: 99,
      },
    });
    const sql = new PgSqlClient(
      {
        connect: poolConnect,
        query: poolQuery,
      } as unknown as ConstructorParameters<typeof PgSqlClient>[0],
      { laneController, lane: "capture" },
    );

    await sql.withTransaction(async (tx) => {
      await tx.query("SELECT 1");
      expect(
        laneController.snapshot().laneStats.find((lane) => lane.lane === "capture"),
      ).toMatchObject({ activeCount: 1, waitingCount: 0 });
    });

    expect(poolConnect).toHaveBeenCalledTimes(1);
    expect(clientQuery).toHaveBeenCalledWith("BEGIN");
    expect(clientQuery).toHaveBeenCalledWith("SELECT 1", []);
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
    expect(clientRelease).toHaveBeenCalledTimes(1);
  });
});
