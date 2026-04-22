import { describe, expect, it, vi } from "vitest";
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
});
