import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { compareMmV2DocumentFilePackArtifacts } from "./run-mmv2-document-file-pack.mjs";

function filePackReport(overrides = {}) {
  const document = {
    documentId: "doc-1",
    title: "Doc 1",
    path: "docs/doc-1.md",
    status: "pass",
    modelCallTraces: [
      {
        contractName: "mmv2-admission",
        contractVersion: "v1",
        promptHash: "prompt-hash",
        inputHash: "input-hash",
        normalization: { normalizedInputHash: "normalized-input-hash" },
      },
    ],
    canonicalCount: 1,
    retainedCount: 1,
    realisticWriteCount: 1,
    admissionCounts: { admit: 1 },
    reconciliationCounts: { insert_new: 1 },
    writeSimulation: {
      summary: {
        dispositionCounts: { create_new_memory: 1 },
      },
    },
    compositePolicy: {
      retainedParents: 0,
      rejectedParents: 0,
      embeddedChildCount: 0,
      promotedChildCount: 0,
      blockedChildCount: 0,
    },
  };
  return {
    summary: {
      totalDocuments: 1,
      executionFailedDocuments: 0,
      canonicalCount: 1,
      retainedCount: 1,
      realisticWriteCount: 1,
    },
    modelMetadata: overrides.modelMetadata ?? {
      requestedModelId: "model",
      resolvedModelIds: ["model"],
    },
    requestSeed: overrides.requestSeed ?? 7,
    documents: [{ ...document, ...overrides.document }],
  };
}

void test("compareMmV2DocumentFilePackArtifacts classifies variance and regressions separately", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mmv2-file-pack-"));
  const leftPath = path.join(tempDir, "left.json");
  const rightVariancePath = path.join(tempDir, "right-variance.json");
  const rightInputDriftPath = path.join(tempDir, "right-input-drift.json");
  const rightStrictnessPath = path.join(tempDir, "right-strictness.json");
  const rightRegressionPath = path.join(tempDir, "right-regression.json");

  await writeFile(leftPath, `${JSON.stringify(filePackReport(), null, 2)}\n`, "utf8");
  await writeFile(
    rightVariancePath,
    `${JSON.stringify(
      filePackReport({
        modelMetadata: { requestedModelId: "other-model", resolvedModelIds: ["other-model"] },
        document: {
          canonicalCount: 2,
          retainedCount: 2,
          realisticWriteCount: 2,
        },
      }),
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    rightInputDriftPath,
    `${JSON.stringify(
      filePackReport({
        document: {
          modelCallTraces: [
            {
              contractName: "mmv2-admission",
              contractVersion: "v1",
              promptHash: "prompt-hash-2",
              inputHash: "input-hash-2",
              normalization: { normalizedInputHash: "normalized-input-hash-2" },
            },
          ],
        },
      }),
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    rightStrictnessPath,
    `${JSON.stringify(
      filePackReport({
        document: {
          modelCallTraces: [
            {
              contractName: "mmv2-admission",
              contractVersion: "v1",
              promptHash: "prompt-hash-format-only",
              inputHash: "input-hash-format-only",
              normalization: { normalizedInputHash: "normalized-input-hash" },
            },
          ],
        },
      }),
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    rightRegressionPath,
    `${JSON.stringify(
      filePackReport({
        document: {
          canonicalCount: 2,
          retainedCount: 2,
          realisticWriteCount: 2,
        },
      }),
      null,
      2,
    )}\n`,
    "utf8",
  );

  const providerVariance = await compareMmV2DocumentFilePackArtifacts({
    leftArtifactPath: leftPath,
    rightArtifactPath: rightVariancePath,
  });
  assert.equal(providerVariance.driftedDocuments[0]?.driftClass, "provider_output_variance");
  assert.equal(providerVariance.driftCounts.provider_output_variance, 1);

  const inputDrift = await compareMmV2DocumentFilePackArtifacts({
    leftArtifactPath: leftPath,
    rightArtifactPath: rightInputDriftPath,
  });
  assert.equal(inputDrift.driftedDocuments[0]?.driftClass, "deterministic_input_drift");
  assert.equal(inputDrift.driftCounts.deterministic_input_drift, 1);

  const strictnessIssue = await compareMmV2DocumentFilePackArtifacts({
    leftArtifactPath: leftPath,
    rightArtifactPath: rightStrictnessPath,
  });
  assert.equal(strictnessIssue.driftedDocuments[0]?.driftClass, "comparator_strictness_issue");
  assert.equal(strictnessIssue.driftCounts.comparator_strictness_issue, 1);

  const semanticRegression = await compareMmV2DocumentFilePackArtifacts({
    leftArtifactPath: leftPath,
    rightArtifactPath: rightRegressionPath,
  });
  assert.equal(semanticRegression.driftedDocuments[0]?.driftClass, "real_semantic_regression");
  assert.equal(semanticRegression.driftCounts.real_semantic_regression, 1);
});
