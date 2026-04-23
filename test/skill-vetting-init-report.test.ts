import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];
const scriptPath = path.resolve("skills/skill-vetting/scripts/init_vetting_report.sh");

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

async function makeTempWorkspace() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-skill-vetting-report-"));
  tempDirs.push(dir);
  return dir;
}

describe("skill-vetting report init", () => {
  it("writes reports to the writable operator workspace report root by default", async () => {
    const workspace = await makeTempWorkspace();

    const { stdout } = await execFileAsync("bash", [scriptPath, "safe-skill", "1.0.0"], {
      env: {
        ...process.env,
        OPENCLAW_WORKSPACE_DIR: workspace,
      },
    });
    const outputPath = stdout.trim();

    expect(outputPath).toBe(
      path.join(
        workspace,
        "docs/projects/skills-system/skill-vetting/reports/2026-04-23-safe-skill-review.md",
      ),
    );
    await expect(fs.readFile(outputPath, "utf8")).resolves.toContain("safe-skill");
    expect(outputPath).not.toContain("imports/product_live/content");
  });

  it("rejects traversal-like slugs before creating report files", async () => {
    const workspace = await makeTempWorkspace();

    await expect(
      execFileAsync("bash", [scriptPath, "../bad"], {
        env: {
          ...process.env,
          OPENCLAW_WORKSPACE_DIR: workspace,
        },
      }),
    ).rejects.toThrow();
  });
});
