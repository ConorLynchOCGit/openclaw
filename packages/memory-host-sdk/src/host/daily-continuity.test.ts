import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  listDailyMemoryLeafFiles,
  renderDailyContinuityBody,
  syncDailyContinuityFile,
} from "./daily-continuity.js";

describe("daily continuity", () => {
  let tmpDir = "";

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-daily-continuity-"));
    await fs.mkdir(path.join(tmpDir, "memory"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("lists only raw daily leaves for the requested date", async () => {
    await fs.writeFile(path.join(tmpDir, "memory", "2026-04-10-alpha.md"), "a", "utf-8");
    await fs.writeFile(path.join(tmpDir, "memory", "2026-04-10.md"), "compiled", "utf-8");
    await fs.writeFile(path.join(tmpDir, "memory", "2026-04-11-beta.md"), "b", "utf-8");

    expect(
      await listDailyMemoryLeafFiles({
        workspaceDir: tmpDir,
        date: "2026-04-10",
      }),
    ).toEqual(["2026-04-10-alpha.md"]);
  });

  it("renders a deterministic combined continuity view", () => {
    const body = renderDailyContinuityBody({
      date: "2026-04-10",
      leaves: [
        {
          fileName: "2026-04-10-0900.md",
          content: "# Session\nalpha",
        },
      ],
    });

    expect(body).toContain("# Daily Continuity: 2026-04-10");
    expect(body).toContain("2026-04-10-0900.md");
    expect(body).toContain("# Session\nalpha");
  });

  it("writes an exact-day continuity file without deleting raw leaves", async () => {
    await fs.writeFile(
      path.join(tmpDir, "memory", "2026-04-10-0900.md"),
      "# Session\nalpha",
      "utf-8",
    );
    await fs.writeFile(
      path.join(tmpDir, "memory", "2026-04-10-1030.md"),
      "# Session\nbeta",
      "utf-8",
    );

    const result = await syncDailyContinuityFile({
      workspaceDir: tmpDir,
      date: "2026-04-10",
      write: true,
    });

    const compiled = await fs.readFile(path.join(tmpDir, "memory", "2026-04-10.md"), "utf-8");
    expect(result.leafCount).toBe(2);
    expect(compiled).toContain("2026-04-10-0900.md");
    expect(compiled).toContain("2026-04-10-1030.md");
    await expect(
      fs.readFile(path.join(tmpDir, "memory", "2026-04-10-0900.md"), "utf-8"),
    ).resolves.toContain("alpha");
  });
});
