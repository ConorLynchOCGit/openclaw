import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { proveWritableRoot } from "./runtime-writable-root-sentinel.mjs";

type WritableRootRow = {
  id: string;
  root: string;
  expectedUid: number;
  expectedGid: number;
  authority: string[];
};

type WritableRootInventory = {
  schema: "openclaw.runtime-writable-root-inventory.v1";
  generatedAt: string;
  rows: WritableRootRow[];
};

const enabled = process.env.OPENCLAW_RUN_WRITABLE_ROOT_PROOF === "1";

describe("writable-root sentinel contract", () => {
  it("fails before mutation for missing, mismatched-owner, and symlink roots", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-write-proof-contract-"));
    const target = path.join(parent, "target");
    const symlink = path.join(parent, "symlink");
    await fs.mkdir(target);
    await fs.symlink(target, symlink);

    const row = {
      id: "negative",
      expectedUid: process.getuid?.() ?? -1,
      expectedGid: process.getgid?.() ?? -1,
      authority: ["bounded negative fixture"],
    };

    try {
      await expect(
        proveWritableRoot({ ...row, root: path.join(parent, "missing") }),
      ).rejects.toThrow(/ENOENT/u);
      await expect(
        proveWritableRoot({ ...row, root: target, expectedUid: row.expectedUid + 1 }),
      ).rejects.toThrow(/owner mismatch/u);
      await expect(proveWritableRoot({ ...row, root: symlink })).rejects.toThrow(/symlink/u);

      expect(
        (await fs.readdir(target)).filter((name) => name.startsWith(".openclaw-write-proof-")),
      ).toHaveLength(0);
    } finally {
      await fs.rm(parent, { recursive: true });
    }
  });
});

describe.skipIf(!enabled)("runtime-owned writable roots", () => {
  it("passes the full sentinel cycle as the configured owner", async () => {
    const inventoryPath = process.env.OPENCLAW_WRITABLE_ROOT_INVENTORY;
    const evidencePath = process.env.OPENCLAW_WRITABLE_ROOT_EVIDENCE;
    expect(inventoryPath, "OPENCLAW_WRITABLE_ROOT_INVENTORY").toBeTruthy();
    expect(evidencePath, "OPENCLAW_WRITABLE_ROOT_EVIDENCE").toBeTruthy();

    const inventoryBytes = await fs.readFile(path.resolve(inventoryPath!), "utf8");
    const inventory = JSON.parse(inventoryBytes) as WritableRootInventory;
    expect(inventory.schema).toBe("openclaw.runtime-writable-root-inventory.v1");
    expect(inventory.rows.length).toBeGreaterThan(0);
    expect(new Set(inventory.rows.map((row) => row.id)).size).toBe(inventory.rows.length);
    expect(new Set(inventory.rows.map((row) => path.resolve(row.root))).size).toBe(
      inventory.rows.length,
    );

    const results = [];
    for (const row of inventory.rows) {
      results.push(await proveWritableRoot(row));
    }

    const evidence = {
      schema: "openclaw.runtime-writable-root-proof.v1",
      fixtureId: "FX-WRITE-01",
      inventorySha256: createHash("sha256").update(inventoryBytes).digest("hex"),
      owner: { uid: process.getuid?.(), gid: process.getgid?.() },
      result: "pass",
      rows: results,
    };
    await fs.writeFile(path.resolve(evidencePath!), `${JSON.stringify(evidence, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });

    expect(results.every((result) => result.cleanupVerified)).toBe(true);
  });
});
