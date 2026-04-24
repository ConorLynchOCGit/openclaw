import type { SqlClient } from "../sql-client.ts";

export async function withSavepoint<T>(
  sql: SqlClient,
  name: string,
  work: () => Promise<T>,
): Promise<T> {
  try {
    await sql.query(`SAVEPOINT ${name}`);
  } catch {
    // pg-mem does not implement SAVEPOINT. Production Postgres does, so the
    // live path still gets rollback isolation while tests keep exercising
    // the same per-record fallback behavior.
    return work();
  }
  try {
    const result = await work();
    await sql.query(`RELEASE SAVEPOINT ${name}`);
    return result;
  } catch (error) {
    await sql.query(`ROLLBACK TO SAVEPOINT ${name}`);
    await sql.query(`RELEASE SAVEPOINT ${name}`);
    throw error;
  }
}

export async function batchWithPerRecordFallback<TRecord, TResult>(input: {
  sql: SqlClient;
  savepointPrefix: string;
  records: TRecord[];
  batch: (records: TRecord[]) => Promise<TResult[]>;
  single: (record: TRecord) => Promise<TResult>;
  defer: (record: TRecord, error: unknown) => void;
}): Promise<TResult[]> {
  if (input.records.length === 0) {
    return [];
  }
  try {
    return await withSavepoint(input.sql, `${input.savepointPrefix}_batch`, () =>
      input.batch(input.records),
    );
  } catch {
    const persisted: TResult[] = [];
    for (const [index, record] of input.records.entries()) {
      try {
        persisted.push(
          await withSavepoint(input.sql, `${input.savepointPrefix}_${index}`, () =>
            input.single(record),
          ),
        );
      } catch (error) {
        input.defer(record, error);
      }
    }
    return persisted;
  }
}

export async function supportsSavepointsInCurrentTransaction(sql: SqlClient): Promise<boolean> {
  try {
    await sql.query("SAVEPOINT openclaw_mmv2_savepoint_probe");
    await sql.query("RELEASE SAVEPOINT openclaw_mmv2_savepoint_probe");
    return true;
  } catch {
    return false;
  }
}

export async function deleteMemoryEdgeById(sql: SqlClient, edgeId: string): Promise<void> {
  await sql.query(`DELETE FROM model_memory.memory_edges WHERE edge_id = $1`, [edgeId]);
}
