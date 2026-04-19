import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runMmV2DocumentCorpus } from "./run-mmv2-document-corpus.mjs";

void test("runMmV2DocumentCorpus writes disposable report artifacts", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "mmv2-corpus-"));
  const result = await runMmV2DocumentCorpus({
    outputRoot,
    commandArgv: [
      "node",
      "scripts/run-mmv2-document-corpus.mjs",
      "--case",
      "mmv2-doc-001-preference-claim",
    ],
    args: {
      outputRoot,
      caseIds: ["mmv2-doc-001-preference-claim"],
    },
  });

  assert.equal(result.report.summary.totalCases, 1);
  assert.equal(result.report.summary.failedCases, 0);
  assert.ok(result.artifacts.runDir.startsWith(outputRoot));
  assert.equal(
    JSON.parse(await readFile(result.artifacts.summaryJsonPath, "utf8")).summary.totalCases,
    1,
  );
  assert.match(
    await readFile(result.artifacts.summaryMarkdownPath, "utf8"),
    /MMV2 Document Corpus Evaluation/u,
  );
});
