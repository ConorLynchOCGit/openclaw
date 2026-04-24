import type { SqlClient } from "./sql-client.ts";

export type ModelMemoryPhase2GateSeverity = "green" | "yellow" | "red" | "unavailable";
export type ModelMemoryPhase2GateClass = "blocker" | "warning" | "informational";

export type ModelMemoryPrePhase2SloDefinition = {
  metricId:
    | "capture_job_p95_latency_ms"
    | "capture_failure_rate_pct"
    | "pool_wait_p95_ms"
    | "projection_freshness_lag_seconds"
    | "retrieval_miss_rate_pct"
    | "stale_projection_count"
    | "provider_schema_failure_rate_pct"
    | "no_dark_data_scan_failures";
  title: string;
  unit: "ms" | "percent" | "seconds" | "count";
  gateClass: ModelMemoryPhase2GateClass;
  description: string;
  greenThreshold: string;
  yellowThreshold?: string;
  redThreshold: string;
};

export const MODEL_MEMORY_PRE_PHASE2_SLO_DEFINITIONS: ModelMemoryPrePhase2SloDefinition[] = [
  {
    metricId: "capture_job_p95_latency_ms",
    title: "Capture Job P95 Latency",
    unit: "ms",
    gateClass: "blocker",
    description:
      "95th percentile end-to-end capture latency for ordinary-turn, tool-result, document-ingest, and import jobs.",
    greenThreshold: "<= 15000",
    yellowThreshold: "<= 45000",
    redThreshold: "> 45000",
  },
  {
    metricId: "capture_failure_rate_pct",
    title: "Capture Failure Rate By Class",
    unit: "percent",
    gateClass: "blocker",
    description:
      "Percentage of capture jobs ending in failed state after retry exhaustion, broken down by failure class.",
    greenThreshold: "< 1",
    yellowThreshold: "< 5",
    redThreshold: ">= 5",
  },
  {
    metricId: "pool_wait_p95_ms",
    title: "DB Pool Wait P95",
    unit: "ms",
    gateClass: "blocker",
    description:
      "95th percentile wait time to acquire a DB lane-backed pool slot across capture, rebuild, and retrieval work.",
    greenThreshold: "<= 250",
    yellowThreshold: "<= 1000",
    redThreshold: "> 1000",
  },
  {
    metricId: "projection_freshness_lag_seconds",
    title: "Projection Freshness Lag",
    unit: "seconds",
    gateClass: "blocker",
    description:
      "Elapsed wall-clock lag between the latest runtime-dirty write and the projection/runtime rebuild that serves retrieval.",
    greenThreshold: "<= 60",
    yellowThreshold: "<= 300",
    redThreshold: "> 300",
  },
  {
    metricId: "retrieval_miss_rate_pct",
    title: "Retrieval Miss Rate",
    unit: "percent",
    gateClass: "warning",
    description:
      "Percentage of retrieval requests that return no selected memories or projection digests after exclusion and ranking.",
    greenThreshold: "<= 25",
    yellowThreshold: "<= 40",
    redThreshold: "> 40",
  },
  {
    metricId: "stale_projection_count",
    title: "Stale Projection Count",
    unit: "count",
    gateClass: "blocker",
    description:
      "Count of projection artifacts marked stale or otherwise not fit to serve live retrieval/runtime context injection.",
    greenThreshold: "= 0",
    yellowThreshold: "<= 5",
    redThreshold: "> 5",
  },
  {
    metricId: "provider_schema_failure_rate_pct",
    title: "Provider Schema Failure Rate",
    unit: "percent",
    gateClass: "blocker",
    description:
      "Percentage of model-contract calls that fail due to schema, JSON-boundary, or contract-shape violations.",
    greenThreshold: "= 0",
    yellowThreshold: "< 1",
    redThreshold: ">= 1",
  },
  {
    metricId: "no_dark_data_scan_failures",
    title: "No-Dark-Data Scan Failures",
    unit: "count",
    gateClass: "blocker",
    description:
      "Count of operator, closeout, retrieval-pack, or proof artifacts that fail no-dark-data validation.",
    greenThreshold: "= 0",
    redThreshold: "> 0",
  },
];

export type ModelMemoryPgStatStatementsQueryFamily =
  | "capture_persistence"
  | "retrieval_runtime"
  | "projection_runtime"
  | "audit_or_ops";

export type ModelMemoryPgStatStatementsEntry = {
  queryId?: string;
  family: ModelMemoryPgStatStatementsQueryFamily;
  tables: string[];
  sample: string;
  calls: number;
  meanExecTimeMs: number;
  maxExecTimeMs: number;
  rows: number;
  sharedBlocksRead: number;
  sharedBlocksHit: number;
  tempBlocks: number;
};

export type ModelMemoryPgStatStatementsFamilySummary = {
  family: ModelMemoryPgStatStatementsQueryFamily;
  calls: number;
  meanExecTimeMs: number;
  maxExecTimeMs: number;
  rows: number;
  sharedBlocksRead: number;
  sharedBlocksHit: number;
  tempBlocks: number;
};

export type ModelMemoryPgStatStatementsBaseline =
  | {
      available: true;
      source: "pg_stat_statements";
      limit: number;
      entries: ModelMemoryPgStatStatementsEntry[];
      families: ModelMemoryPgStatStatementsFamilySummary[];
    }
  | {
      available: false;
      source: "pg_stat_statements";
      reason: "not_installed" | "not_accessible" | "query_failed" | "no_memory_queries_observed";
      detail: string;
      limit: number;
      entries: [];
      families: [];
    };

export type ModelMemoryTableMaintenanceSeverity = Exclude<
  ModelMemoryPhase2GateSeverity,
  "unavailable"
>;

export type ModelMemoryTableMaintenanceEntry = {
  relationName: string;
  totalBytes: number;
  liveTuples: number;
  deadTuples: number;
  deadTuplePct: number;
  modsSinceAnalyze: number;
  modsSinceAnalyzePct: number;
  lastVacuumAt?: string;
  lastAutovacuumAt?: string;
  lastAnalyzeAt?: string;
  lastAutoAnalyzeAt?: string;
  deadTupleSeverity: ModelMemoryTableMaintenanceSeverity;
  analyzeSeverity: ModelMemoryTableMaintenanceSeverity;
  bloatRiskSeverity: ModelMemoryTableMaintenanceSeverity;
  overallSeverity: ModelMemoryTableMaintenanceSeverity;
  reasons: string[];
};

export type ModelMemoryTableMaintenanceReport = {
  source: "pg_stat_user_tables";
  approximation: "dead_tuple_and_analyze_freshness";
  entries: ModelMemoryTableMaintenanceEntry[];
  summary: {
    overallSeverity: ModelMemoryPhase2GateSeverity;
    redCount: number;
    yellowCount: number;
    greenCount: number;
  };
};

const MEMORY_CRITICAL_RELATIONS = [
  "model_memory.memory_sources",
  "model_memory.memory_source_windows",
  "model_memory.durable_memories",
  "model_memory.memory_events",
  "model_memory.memory_edges",
  "runtime_context.active_memory_slots",
  "runtime_context.active_memory_sets",
  "runtime_context.context_artifacts",
  "runtime_context.workspace_projection_versions",
  "runtime_context.retrieval_requests",
  "runtime_context.retrieval_result_sets",
  "runtime_context.retrieval_result_items",
] as const;

function clampLimit(value: number | undefined, fallback: number, max: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.min(max, Math.trunc(value!)));
}

function normalizeSql(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function summarizeSql(text: string, maxLength = 160): string {
  const normalized = normalizeSql(text);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function extractTouchedTables(query: string): string[] {
  return [
    ...new Set(normalizeSql(query).match(/(?:model_memory|runtime_context)\.[a-z_]+/giu) ?? []),
  ]
    .map((entry) => entry.toLowerCase())
    .toSorted();
}

function classifyPgStatStatementsFamily(
  query: string,
  tables: string[],
): ModelMemoryPgStatStatementsQueryFamily {
  const normalized = query.toLowerCase();
  if (
    tables.some((table) =>
      [
        "runtime_context.retrieval_requests",
        "runtime_context.retrieval_result_sets",
        "runtime_context.retrieval_result_items",
      ].includes(table),
    )
  ) {
    return "retrieval_runtime";
  }
  if (
    tables.some((table) =>
      [
        "runtime_context.active_memory_slots",
        "runtime_context.active_memory_sets",
        "runtime_context.context_artifacts",
        "runtime_context.workspace_projection_versions",
      ].includes(table),
    )
  ) {
    return "projection_runtime";
  }
  if (
    tables.some((table) =>
      [
        "model_memory.memory_sources",
        "model_memory.memory_source_windows",
        "model_memory.durable_memories",
        "model_memory.memory_events",
        "model_memory.memory_edges",
      ].includes(table),
    )
  ) {
    return "capture_persistence";
  }
  if (normalized.includes("model_memory.") || normalized.includes("runtime_context.")) {
    return "audit_or_ops";
  }
  return "audit_or_ops";
}

function roundMs(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : 0;
}

function readInteger(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

function classifyUnavailablePgStatStatementsReason(detail: string) {
  const normalized = detail.toLowerCase();
  if (
    normalized.includes("pg_stat_statements") &&
    (normalized.includes("does not exist") || normalized.includes("not exist"))
  ) {
    return "not_installed" as const;
  }
  if (
    normalized.includes("permission denied") ||
    normalized.includes("must be superuser") ||
    normalized.includes("insufficient privilege")
  ) {
    return "not_accessible" as const;
  }
  return "query_failed" as const;
}

export async function collectModelMemoryPgStatStatementsBaseline(input: {
  sql: SqlClient;
  limit?: number;
}): Promise<ModelMemoryPgStatStatementsBaseline> {
  const limit = clampLimit(input.limit, 20, 50);
  try {
    const result = await input.sql.query<{
      query_id?: string | null;
      query: string;
      calls: number;
      mean_exec_time: number;
      max_exec_time: number;
      rows: number;
      shared_blks_read: number;
      shared_blks_hit: number;
      temp_blks_read?: number;
      temp_blks_written?: number;
    }>(
      `
        SELECT
          queryid::text AS query_id,
          query,
          calls,
          mean_exec_time,
          max_exec_time,
          rows,
          shared_blks_read,
          shared_blks_hit,
          temp_blks_read,
          temp_blks_written
        FROM pg_stat_statements
        WHERE lower(query) LIKE '%model_memory.%'
           OR lower(query) LIKE '%runtime_context.%'
        ORDER BY calls DESC, max_exec_time DESC
        LIMIT $1
      `,
      [limit],
    );
    const entries = result.rows.map((row) => {
      const tables = extractTouchedTables(row.query);
      return {
        queryId: row.query_id ?? undefined,
        family: classifyPgStatStatementsFamily(row.query, tables),
        tables,
        sample: summarizeSql(row.query),
        calls: readInteger(row.calls),
        meanExecTimeMs: roundMs(row.mean_exec_time),
        maxExecTimeMs: roundMs(row.max_exec_time),
        rows: readInteger(row.rows),
        sharedBlocksRead: readInteger(row.shared_blks_read),
        sharedBlocksHit: readInteger(row.shared_blks_hit),
        tempBlocks: readInteger(row.temp_blks_read) + readInteger(row.temp_blks_written),
      } satisfies ModelMemoryPgStatStatementsEntry;
    });

    if (entries.length === 0) {
      return {
        available: false,
        source: "pg_stat_statements",
        reason: "no_memory_queries_observed",
        detail:
          "pg_stat_statements is available but no model_memory/runtime_context query families have been observed yet.",
        limit,
        entries: [],
        families: [],
      };
    }

    const familyAccumulator = new Map<
      ModelMemoryPgStatStatementsQueryFamily,
      {
        calls: number;
        totalExecTime: number;
        maxExecTimeMs: number;
        rows: number;
        sharedBlocksRead: number;
        sharedBlocksHit: number;
        tempBlocks: number;
      }
    >();

    for (const entry of entries) {
      const current = familyAccumulator.get(entry.family) ?? {
        calls: 0,
        totalExecTime: 0,
        maxExecTimeMs: 0,
        rows: 0,
        sharedBlocksRead: 0,
        sharedBlocksHit: 0,
        tempBlocks: 0,
      };
      current.calls += entry.calls;
      current.totalExecTime += entry.meanExecTimeMs * entry.calls;
      current.maxExecTimeMs = Math.max(current.maxExecTimeMs, entry.maxExecTimeMs);
      current.rows += entry.rows;
      current.sharedBlocksRead += entry.sharedBlocksRead;
      current.sharedBlocksHit += entry.sharedBlocksHit;
      current.tempBlocks += entry.tempBlocks;
      familyAccumulator.set(entry.family, current);
    }

    const families = [...familyAccumulator.entries()]
      .map(([family, aggregate]) => ({
        family,
        calls: aggregate.calls,
        meanExecTimeMs:
          aggregate.calls > 0
            ? Math.round((aggregate.totalExecTime / aggregate.calls) * 100) / 100
            : 0,
        maxExecTimeMs: aggregate.maxExecTimeMs,
        rows: aggregate.rows,
        sharedBlocksRead: aggregate.sharedBlocksRead,
        sharedBlocksHit: aggregate.sharedBlocksHit,
        tempBlocks: aggregate.tempBlocks,
      }))
      .toSorted(
        (left, right) => right.calls - left.calls || right.maxExecTimeMs - left.maxExecTimeMs,
      );

    return {
      available: true,
      source: "pg_stat_statements",
      limit,
      entries,
      families,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      available: false,
      source: "pg_stat_statements",
      reason: classifyUnavailablePgStatStatementsReason(detail),
      detail,
      limit,
      entries: [],
      families: [],
    };
  }
}

function parseOptionalIsoString(value: unknown): string | undefined {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function classifyDeadTupleSeverity(params: {
  deadTuples: number;
  liveTuples: number;
  deadTuplePct: number;
}): ModelMemoryTableMaintenanceSeverity {
  if (params.deadTuples >= 50_000 || (params.deadTuples >= 5_000 && params.deadTuplePct >= 0.2)) {
    return "red";
  }
  if (params.deadTuples >= 10_000 || (params.deadTuples >= 1_000 && params.deadTuplePct >= 0.1)) {
    return "yellow";
  }
  return "green";
}

function classifyAnalyzeSeverity(params: {
  liveTuples: number;
  modsSinceAnalyze: number;
  modsSinceAnalyzePct: number;
  lastAnalyzeAt?: string;
  lastAutoAnalyzeAt?: string;
}): ModelMemoryTableMaintenanceSeverity {
  const hasAnalyzeTimestamp = Boolean(params.lastAnalyzeAt || params.lastAutoAnalyzeAt);
  if (
    (!hasAnalyzeTimestamp && params.liveTuples >= 10_000) ||
    (params.modsSinceAnalyze >= 10_000 && params.modsSinceAnalyzePct >= 0.5)
  ) {
    return "red";
  }
  if (
    (!hasAnalyzeTimestamp && params.liveTuples >= 1_000) ||
    (params.modsSinceAnalyze >= 1_000 && params.modsSinceAnalyzePct >= 0.2)
  ) {
    return "yellow";
  }
  return "green";
}

function classifyApproximateBloatRisk(params: {
  totalBytes: number;
  deadTuples: number;
  deadTuplePct: number;
}): ModelMemoryTableMaintenanceSeverity {
  if (
    (params.totalBytes >= 64 * 1024 * 1024 && params.deadTuplePct >= 0.2) ||
    params.deadTuples >= 50_000
  ) {
    return "red";
  }
  if (
    (params.totalBytes >= 16 * 1024 * 1024 && params.deadTuplePct >= 0.1) ||
    params.deadTuples >= 10_000
  ) {
    return "yellow";
  }
  return "green";
}

function maxSeverity(
  left: ModelMemoryTableMaintenanceSeverity,
  right: ModelMemoryTableMaintenanceSeverity,
): ModelMemoryTableMaintenanceSeverity {
  const order: Record<ModelMemoryTableMaintenanceSeverity, number> = {
    green: 0,
    yellow: 1,
    red: 2,
  };
  return order[left] >= order[right] ? left : right;
}

export async function collectModelMemoryTableMaintenanceHealth(input: {
  sql: SqlClient;
  relations?: readonly string[];
}): Promise<ModelMemoryTableMaintenanceReport> {
  const relations = [...(input.relations ?? MEMORY_CRITICAL_RELATIONS)];
  const result = await input.sql.query<{
    relation_name: string;
    total_bytes: number;
    live_tuples: number;
    dead_tuples: number;
    mods_since_analyze: number;
    last_vacuum: Date | string | null;
    last_autovacuum: Date | string | null;
    last_analyze: Date | string | null;
    last_autoanalyze: Date | string | null;
  }>(
    `
      SELECT
        format('%I.%I', ns.nspname, cls.relname) AS relation_name,
        pg_total_relation_size(cls.oid) AS total_bytes,
        COALESCE(stats.n_live_tup, 0) AS live_tuples,
        COALESCE(stats.n_dead_tup, 0) AS dead_tuples,
        COALESCE(stats.n_mod_since_analyze, 0) AS mods_since_analyze,
        stats.last_vacuum,
        stats.last_autovacuum,
        stats.last_analyze,
        stats.last_autoanalyze
      FROM pg_class AS cls
      INNER JOIN pg_namespace AS ns
        ON ns.oid = cls.relnamespace
      LEFT JOIN pg_stat_user_tables AS stats
        ON stats.relid = cls.oid
      WHERE cls.relkind = 'r'
        AND format('%I.%I', ns.nspname, cls.relname) = ANY($1::text[])
      ORDER BY pg_total_relation_size(cls.oid) DESC, relation_name ASC
    `,
    [relations],
  );

  const entries = result.rows.map((row) => {
    const liveTuples = readInteger(row.live_tuples);
    const deadTuples = readInteger(row.dead_tuples);
    const totalTuples = liveTuples + deadTuples;
    const deadTuplePct = totalTuples > 0 ? deadTuples / totalTuples : 0;
    const modsSinceAnalyze = readInteger(row.mods_since_analyze);
    const modsSinceAnalyzePct = liveTuples > 0 ? modsSinceAnalyze / liveTuples : 0;
    const lastVacuumAt = parseOptionalIsoString(row.last_vacuum);
    const lastAutovacuumAt = parseOptionalIsoString(row.last_autovacuum);
    const lastAnalyzeAt = parseOptionalIsoString(row.last_analyze);
    const lastAutoAnalyzeAt = parseOptionalIsoString(row.last_autoanalyze);
    const deadTupleSeverity = classifyDeadTupleSeverity({
      deadTuples,
      liveTuples,
      deadTuplePct,
    });
    const analyzeSeverity = classifyAnalyzeSeverity({
      liveTuples,
      modsSinceAnalyze,
      modsSinceAnalyzePct,
      lastAnalyzeAt,
      lastAutoAnalyzeAt,
    });
    const bloatRiskSeverity = classifyApproximateBloatRisk({
      totalBytes: readInteger(row.total_bytes),
      deadTuples,
      deadTuplePct,
    });
    const overallSeverity = maxSeverity(
      deadTupleSeverity,
      maxSeverity(analyzeSeverity, bloatRiskSeverity),
    );
    const reasons: string[] = [];
    if (deadTupleSeverity !== "green") {
      reasons.push(
        `dead tuples ${deadTuples} (${Math.round(deadTuplePct * 1000) / 10}% of visible tuples)`,
      );
    }
    if (analyzeSeverity !== "green") {
      if (!lastAnalyzeAt && !lastAutoAnalyzeAt) {
        reasons.push("planner stats have never been analyzed");
      } else {
        reasons.push(
          `planner stats may be stale (${modsSinceAnalyze} modifications since last analyze)`,
        );
      }
    }
    if (bloatRiskSeverity !== "green") {
      reasons.push("approximate bloat risk elevated from dead-tuple density and relation size");
    }
    return {
      relationName: row.relation_name,
      totalBytes: readInteger(row.total_bytes),
      liveTuples,
      deadTuples,
      deadTuplePct: Math.round(deadTuplePct * 10_000) / 10_000,
      modsSinceAnalyze,
      modsSinceAnalyzePct: Math.round(modsSinceAnalyzePct * 10_000) / 10_000,
      lastVacuumAt,
      lastAutovacuumAt,
      lastAnalyzeAt,
      lastAutoAnalyzeAt,
      deadTupleSeverity,
      analyzeSeverity,
      bloatRiskSeverity,
      overallSeverity,
      reasons,
    } satisfies ModelMemoryTableMaintenanceEntry;
  });

  const summary = {
    overallSeverity: entries.some((entry) => entry.overallSeverity === "red")
      ? ("red" as const)
      : entries.some((entry) => entry.overallSeverity === "yellow")
        ? ("yellow" as const)
        : ("green" as const),
    redCount: entries.filter((entry) => entry.overallSeverity === "red").length,
    yellowCount: entries.filter((entry) => entry.overallSeverity === "yellow").length,
    greenCount: entries.filter((entry) => entry.overallSeverity === "green").length,
  };

  return {
    source: "pg_stat_user_tables",
    approximation: "dead_tuple_and_analyze_freshness",
    entries,
    summary,
  };
}
