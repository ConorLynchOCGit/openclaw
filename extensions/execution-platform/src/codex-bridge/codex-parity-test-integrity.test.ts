import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createCodexParityTestIntegritySnapshot,
  decideCodexParityTestIntegrity,
} from "./codex-parity-test-integrity.ts";
import { createMainRepoHashManifest } from "./main-repo-change-evidence.ts";

const roots: string[] = [];

async function tempRoot() {
  const root = await import("node:fs/promises").then((fs) =>
    fs.mkdtemp(path.join(os.tmpdir(), "codex-test-integrity-")),
  );
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function snapshot(repoRoot: string, id: string) {
  const manifest = await createMainRepoHashManifest({
    repoRoot,
    approvedScopeRefs: ["ui"],
    manifestId: `${id}-manifest`,
  });
  return await createCodexParityTestIntegritySnapshot({ repoRoot, manifest, snapshotId: id });
}

describe("Codex parity test integrity", () => {
  it("blocks skipped suite introduction and jsdom downgrade", async () => {
    const repo = await tempRoot();
    await mkdir(path.join(repo, "ui"), { recursive: true });
    await writeFile(
      path.join(repo, "ui/work-queue.test.ts"),
      [
        "/* @vitest-environment jsdom */",
        "import { describe, expect, it } from 'vitest';",
        "describe('view', () => { it('renders', () => { expect(1).toBe(1); }); });",
      ].join("\n"),
      "utf8",
    );
    const before = await snapshot(repo, "before");
    await writeFile(
      path.join(repo, "ui/work-queue.test.ts"),
      [
        "/* @vitest-environment node */",
        "import { describe, expect, it } from 'vitest';",
        "describe.skip('view', () => { it('renders', () => { expect(1).toBe(1); }); });",
      ].join("\n"),
      "utf8",
    );
    const after = await snapshot(repo, "after");

    const decision = decideCodexParityTestIntegrity({ before, after });

    expect(decision.status).toBe("blocked");
    expect(decision.reasonCodes).toContain("describe_skip_introduced:ui/work-queue.test.ts");
    expect(decision.reasonCodes).toContain("vitest_environment_downgraded:ui/work-queue.test.ts");
    expect(decision.rawTestContentStored).toBe(false);
  });

  it("blocks touched UI tests that still contain skips or node environment", async () => {
    const repo = await tempRoot();
    await mkdir(path.join(repo, "ui"), { recursive: true });
    await writeFile(
      path.join(repo, "ui/work-queue.test.ts"),
      [
        "/* @vitest-environment node */",
        "import { describe, expect, it } from 'vitest';",
        "describe.skip('view', () => { it('renders', () => { expect(1).toBe(1); }); });",
      ].join("\n"),
      "utf8",
    );

    const before = await snapshot(repo, "before");
    const after = await snapshot(repo, "after");
    const decision = decideCodexParityTestIntegrity({
      before,
      after,
      changedFileRefs: ["ui/work-queue.test.ts"],
    });

    expect(decision.status).toBe("blocked");
    expect(decision.reasonCodes).toContain("touched_test_has_skip:ui/work-queue.test.ts");
    expect(decision.reasonCodes).toContain("touched_ui_test_requires_jsdom:ui/work-queue.test.ts");
    expect(decision.touchedTestFileRefs).toEqual(["ui/work-queue.test.ts"]);
  });

  it("accepts unchanged honest test files", async () => {
    const repo = await tempRoot();
    await mkdir(path.join(repo, "ui"), { recursive: true });
    await writeFile(
      path.join(repo, "ui/work-queue.test.ts"),
      [
        "/* @vitest-environment jsdom */",
        "import { describe, expect, it } from 'vitest';",
        "describe('view', () => { it('renders', () => { expect(1).toBe(1); }); });",
      ].join("\n"),
      "utf8",
    );

    const before = await snapshot(repo, "before");
    const after = await snapshot(repo, "after");
    const decision = decideCodexParityTestIntegrity({
      before,
      after,
      changedFileRefs: ["ui/work-queue.test.ts"],
    });

    expect(decision.status).toBe("accepted");
    expect(decision.reasonCodes).toEqual(["test_integrity_accepted"]);
  });
});
