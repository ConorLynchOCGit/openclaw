// Native backup recovery proof: verify and restore only into disposable roots.
import fs from "node:fs/promises";
import path from "node:path";
import * as tar from "tar";
import { describe, expect, it } from "vitest";
import { createBackupArchive } from "../infra/backup-create.js";
import { requireNodeSqlite } from "../infra/node-sqlite.js";
import type { RuntimeEnv } from "../runtime.js";
import {
  closeOpenClawStateDatabase,
  openOpenClawStateDatabase,
} from "../state/openclaw-state-db.js";
import { withOpenClawTestState } from "../test-utils/openclaw-test-state.js";
import { backupVerifyCommand } from "./backup-verify.js";

const quietRuntime: RuntimeEnv = {
  log: () => {},
  error: () => {},
  exit: () => {},
};

describe("native backup disposable restore", () => {
  it("restores durable config, state, SQLite, and workspace bytes without volatile queues", async () => {
    await withOpenClawTestState(
      {
        layout: "split",
        prefix: "openclaw-backup-restore-",
        scenario: "minimal",
      },
      async (state) => {
        const outputDir = state.path("backups");
        const restoreDir = state.path("restore");
        await fs.mkdir(outputDir, { recursive: true });
        await fs.mkdir(restoreDir, { recursive: true });
        await state.writeConfig({
          agents: {
            entries: { main: { default: true, workspace: state.workspaceDir } },
          },
        });
        await state.writeText("durable/runtime-receipt.json", '{"generation":"fixture"}\n');
        await state.writeJson("delivery-queue/pending.json", { id: "volatile" });
        await fs.writeFile(path.join(state.workspaceDir, "durable.md"), "durable workspace\n");
        await fs.symlink("durable.md", path.join(state.workspaceDir, "current.md"));

        const { db } = openOpenClawStateDatabase({ env: state.env });
        db.exec("CREATE TABLE IF NOT EXISTS recovery_fixture (value TEXT NOT NULL);");
        db.prepare("INSERT INTO recovery_fixture (value) VALUES (?)").run("durable-row");
        closeOpenClawStateDatabase();

        const created = await createBackupArchive({
          output: outputDir,
          includeWorkspace: true,
          nowMs: Date.UTC(2026, 6, 24, 10, 30, 0),
        });
        const verified = await backupVerifyCommand(quietRuntime, {
          archive: created.archivePath,
        });

        await tar.x({
          file: created.archivePath,
          gzip: true,
          cwd: restoreDir,
          preserveOwner: false,
          strict: true,
        });

        const configAsset = created.assets.find((asset) => asset.kind === "config");
        const stateAsset = created.assets.find((asset) => asset.kind === "state");
        const workspaceAsset = created.assets.find((asset) => asset.kind === "workspace");
        expect(configAsset).toBeDefined();
        expect(stateAsset).toBeDefined();
        expect(workspaceAsset).toBeDefined();
        const restoredConfigPath = path.join(restoreDir, configAsset!.archivePath);
        const restoredStateDir = path.join(restoreDir, stateAsset!.archivePath);
        const restoredWorkspaceDir = path.join(restoreDir, workspaceAsset!.archivePath);

        await expect(fs.readFile(restoredConfigPath, "utf8")).resolves.toContain('"workspace"');
        await expect(
          fs.readFile(path.join(restoredStateDir, "durable", "runtime-receipt.json"), "utf8"),
        ).resolves.toContain("fixture");
        await expect(
          fs.access(path.join(restoredStateDir, "delivery-queue", "pending.json")),
        ).rejects.toThrow();
        await expect(
          fs.readFile(path.join(restoredWorkspaceDir, "durable.md"), "utf8"),
        ).resolves.toBe("durable workspace\n");
        await expect(fs.readlink(path.join(restoredWorkspaceDir, "current.md"))).resolves.toBe(
          "durable.md",
        );

        const sqlitePath = path.join(restoredStateDir, "state", "openclaw.sqlite");
        const sqlite = requireNodeSqlite();
        const restoredDb = new sqlite.DatabaseSync(sqlitePath, { readOnly: true });
        try {
          expect(restoredDb.prepare("PRAGMA integrity_check").get()).toEqual({
            integrity_check: "ok",
          });
          expect(restoredDb.prepare("SELECT value FROM recovery_fixture").get()).toEqual({
            value: "durable-row",
          });
        } finally {
          restoredDb.close();
        }

        expect(verified.ok).toBe(true);
        expect(verified.archiveRoot).toBe(created.archiveRoot);
      },
    );
  });
});
