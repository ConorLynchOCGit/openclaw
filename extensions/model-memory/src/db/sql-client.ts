import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import type {
  ModelMemoryDbLane,
  ModelMemoryDbLaneController,
  ModelMemoryDbPoolPressureSnapshot,
} from "./pool-lanes.ts";

export type SqlQueryable = {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<Row>>;
};

export interface SqlClient extends SqlQueryable {
  withTransaction<T>(work: (tx: SqlClient) => Promise<T>): Promise<T>;
  withLane?(lane: ModelMemoryDbLane): SqlClient;
  getPoolPressureSnapshot?(): ModelMemoryDbPoolPressureSnapshot;
  shouldDeferLane?(lane: ModelMemoryDbLane): boolean;
}

type PgPoolLike = Pick<Pool, "connect" | "query">;
type PgClientLike = Pick<PoolClient, "query" | "release">;

function isPoolLike(value: PgPoolLike | PgClientLike): value is PgPoolLike {
  return !("release" in value);
}

export class PgSqlClient implements SqlClient {
  constructor(
    private readonly queryable: PgPoolLike | PgClientLike,
    private readonly options: {
      lane?: ModelMemoryDbLane;
      laneController?: ModelMemoryDbLaneController;
      laneHeld?: boolean;
    } = {},
  ) {}

  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult<Row>> {
    if (this.options.laneController && !this.options.laneHeld) {
      return this.options.laneController.runWithLane(this.options.lane ?? "default", () =>
        this.queryable.query(text, params),
      );
    }
    return this.queryable.query(text, params);
  }

  async withTransaction<T>(work: (tx: SqlClient) => Promise<T>): Promise<T> {
    const queryable = this.queryable;
    if (!isPoolLike(queryable)) {
      return work(this);
    }

    const run = async () => {
      const client = await queryable.connect();
      try {
        await client.query("BEGIN");
        const result = await work(
          new PgSqlClient(client, {
            ...this.options,
            laneHeld: true,
          }),
        );
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    };
    if (this.options.laneController && !this.options.laneHeld) {
      return this.options.laneController.runWithLane(this.options.lane ?? "default", run);
    }
    return run();
  }

  withLane(lane: ModelMemoryDbLane): SqlClient {
    return new PgSqlClient(this.queryable, {
      ...this.options,
      lane,
    });
  }

  getPoolPressureSnapshot(): ModelMemoryDbPoolPressureSnapshot {
    return (
      this.options.laneController?.snapshot() ?? {
        laneStats: [],
        pressure: false,
        reasons: [],
      }
    );
  }

  shouldDeferLane(lane: ModelMemoryDbLane): boolean {
    return this.options.laneController?.shouldDeferLane(lane) ?? false;
  }
}

export function withSqlClientLane(sql: SqlClient, lane: ModelMemoryDbLane): SqlClient {
  return sql.withLane?.(lane) ?? sql;
}
