#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const artifactName = "proof-hardening-06-worker-smoke-matrix-proof.json";

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const abs = path.join(artifactDir, name);
  fs.writeFileSync(abs, body, "utf8");
  return {
    path: `.artifacts/execution-platform/${name}`,
    ref: `artifact://execution-platform/${name}`,
    sha256: `sha256:${sha256(body)}`,
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

const { runWorkerSmokeMatrixProof } = await tsImport(
  path.join(root, "extensions/execution-platform/src/codex-bridge/worker-smoke-matrix.ts"),
  import.meta.url,
);

const proof = await runWorkerSmokeMatrixProof({
  runtimeJobId: "proof-hardening-06-worker-smoke-matrix",
  graphId: "proof-hardening-06-worker-smoke-matrix-graph",
});
const artifact = writeArtifact(artifactName, proof);

console.log(
  JSON.stringify(
    {
      ok: proof.pass,
      artifact,
      laneCount: proof.laneResults.length,
      scopedEditPassCount: proof.scopedEditPassCount,
      preciseBlockerPassCount: proof.preciseBlockerPassCount,
      neutralFixturePassCount: proof.neutralFixturePassCount,
      childClassesExercised: proof.childClassesExercised,
      reasonCodes: proof.reasonCodes,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
    },
    null,
    2,
  ),
);

if (!proof.pass) {
  process.exitCode = 1;
}
