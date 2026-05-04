import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

export type SqlQueryable = {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<Row>>;
};

export interface SqlClient extends SqlQueryable {
  withTransaction<T>(work: (tx: SqlClient) => Promise<T>): Promise<T>;
}

type PgPoolLike = Pick<Pool, "connect" | "query">;
type PgClientLike = Pick<PoolClient, "query" | "release">;

function isPoolLike(value: PgPoolLike | PgClientLike): value is PgPoolLike {
  return !("release" in value);
}

export class PgSqlClient implements SqlClient {
  constructor(private readonly queryable: PgPoolLike | PgClientLike) {}

  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult<Row>> {
    return this.queryable.query(text, params);
  }

  async withTransaction<T>(work: (tx: SqlClient) => Promise<T>): Promise<T> {
    const queryable = this.queryable;
    if (!isPoolLike(queryable)) {
      return work(this);
    }

    const client = await queryable.connect();
    try {
      await client.query("BEGIN");
      const result = await work(new PgSqlClient(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
