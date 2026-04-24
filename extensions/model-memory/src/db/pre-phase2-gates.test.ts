import { describe, expect, it } from "vitest";
import type { QueryResult, QueryResultRow } from "pg";
import {
  MODEL_MEMORY_PRE_PHASE2_SLO_DEFINITIONS,
  collectModelMemoryPgStatStatementsBaseline,
  collectModelMemoryTableMaintenanceHealth,
} from "./pre-phase2-gates.ts";
import type { SqlClient } from "./sql-client.ts";

function buildQueryResult<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return {
    command: "SELECT",
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  };
}

function makeSqlClient(params: {
  pgStatRows?: Array<Record<string, unknown>>;
  maintenanceRows?: Array<Record<string, unknown>>;
  pgStatError?: Error;
}): SqlClient {
  return {
    async query(text: string) {
      if (text.includes("FROM pg_stat_statements")) {
        if (params.pgStatError) {
          throw params.pgStatError;
        }
        return buildQueryResult(params.pgStatRows ?? []);
      }
      if (text.includes("FROM pg_class AS cls")) {
        return buildQueryResult(params.maintenanceRows ?? []);
      }
      throw new Error(`unexpected query in test: ${text}`);
    },
    async withTransaction<T>(work: (tx: SqlClient) => Promise<T>) {
      return await work(this);
    },
  };
}

describe("model-memory pre-phase-2 gate definitions", () => {
  it("defines the required operational SLO gates", () => {
    expect(MODEL_MEMORY_PRE_PHASE2_SLO_DEFINITIONS.map((entry) => entry.metricId)).toEqual([
      "capture_job_p95_latency_ms",
      "capture_failure_rate_pct",
      "pool_wait_p95_ms",
      "projection_freshness_lag_seconds",
      "retrieval_miss_rate_pct",
      "stale_projection_count",
      "provider_schema_failure_rate_pct",
      "no_dark_data_scan_failures",
    ]);
  });
});

describe("collectModelMemoryPgStatStatementsBaseline", () => {
  it("summarizes memory query families when pg_stat_statements is available", async () => {
    const baseline = await collectModelMemoryPgStatStatementsBaseline({
      sql: makeSqlClient({
        pgStatRows: [
          {
            query_id: "1",
            query:
              "SELECT * FROM runtime_context.retrieval_requests WHERE session_id = $1 ORDER BY created_at DESC",
            calls: 15,
            mean_exec_time: 1.2,
            max_exec_time: 4.8,
            rows: 15,
            shared_blks_read: 1,
            shared_blks_hit: 40,
            temp_blks_read: 0,
            temp_blks_written: 0,
          },
          {
            query:
              "INSERT INTO model_memory.memory_events (memory_event_id, memory_id) VALUES ($1, $2)",
            calls: 10,
            mean_exec_time: 2.4,
            max_exec_time: 6.2,
            rows: 10,
            shared_blks_read: 2,
            shared_blks_hit: 18,
            temp_blks_read: 0,
            temp_blks_written: 1,
          },
        ],
      }),
    });

    expect(baseline).toMatchObject({
      available: true,
      source: "pg_stat_statements",
    });
    if (!baseline.available) {
      throw new Error("baseline unexpectedly unavailable");
    }
    expect(baseline.entries[0]).toMatchObject({
      family: "retrieval_runtime",
      tables: ["runtime_context.retrieval_requests"],
    });
    expect(baseline.entries[1]).toMatchObject({
      family: "capture_persistence",
      tables: ["model_memory.memory_events"],
    });
    expect(baseline.families).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ family: "retrieval_runtime", calls: 15 }),
        expect.objectContaining({ family: "capture_persistence", calls: 10 }),
      ]),
    );
  });

  it("fails gracefully when pg_stat_statements is unavailable", async () => {
    const baseline = await collectModelMemoryPgStatStatementsBaseline({
      sql: makeSqlClient({
        pgStatError: new Error('relation "pg_stat_statements" does not exist'),
      }),
    });

    expect(baseline).toEqual({
      available: false,
      source: "pg_stat_statements",
      reason: "not_installed",
      detail: 'relation "pg_stat_statements" does not exist',
      limit: 20,
      entries: [],
      families: [],
    });
  });
});

describe("collectModelMemoryTableMaintenanceHealth", () => {
  it("classifies dead-tuple and analyze freshness risk for memory-critical tables", async () => {
    const report = await collectModelMemoryTableMaintenanceHealth({
      sql: makeSqlClient({
        maintenanceRows: [
          {
            relation_name: "model_memory.durable_memories",
            total_bytes: 104857600,
            live_tuples: 12000,
            dead_tuples: 6000,
            mods_since_analyze: 7000,
            last_vacuum: null,
            last_autovacuum: "2026-04-24T00:00:00.000Z",
            last_analyze: null,
            last_autoanalyze: null,
          },
          {
            relation_name: "runtime_context.retrieval_requests",
            total_bytes: 2097152,
            live_tuples: 500,
            dead_tuples: 5,
            mods_since_analyze: 10,
            last_vacuum: "2026-04-24T00:00:00.000Z",
            last_autovacuum: "2026-04-24T00:10:00.000Z",
            last_analyze: "2026-04-24T00:12:00.000Z",
            last_autoanalyze: "2026-04-24T00:13:00.000Z",
          },
        ],
      }),
    });

    expect(report.summary).toEqual({
      overallSeverity: "red",
      redCount: 1,
      yellowCount: 0,
      greenCount: 1,
    });
    expect(report.entries[0]).toMatchObject({
      relationName: "model_memory.durable_memories",
      deadTupleSeverity: "red",
      analyzeSeverity: "red",
      bloatRiskSeverity: "red",
      overallSeverity: "red",
    });
    expect(report.entries[1]).toMatchObject({
      relationName: "runtime_context.retrieval_requests",
      overallSeverity: "green",
    });
  });
});
