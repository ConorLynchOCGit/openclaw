#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, ".artifacts/execution-platform/runtime-node-readiness-transition");
fs.mkdirSync(outDir, { recursive: true });

const args = [
  "test:file",
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
  "--",
  "-t",
  "retired runAfterAdd first-node approval creates prerequisites instead of running work-intent implementation",
];

const startedAt = Date.now();
const result = spawnSync("pnpm", args, {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 2_000_000,
});
const completedAt = Date.now();
const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
const outputHash = createHash("sha256").update(output).digest("hex");
const passed = result.status === 0;

const artifact = {
  artifactKind: "runtime_node_readiness_transition_proof",
  schemaVersion: "execution-platform.runtime-node-readiness-transition-proof.v1",
  status: passed ? "passed" : "failed",
  command: "pnpm test:file <runtime-work-graph-scheduler.test.ts> -- -t <transition proof>",
  exitCode: result.status,
  durationMs: completedAt - startedAt,
  proofTarget:
    "runAfterAdd implementation work-intent nodes create context prerequisites and do not invoke workers before transition readiness.",
  expectedProofSignals: [
    "node_context_supply_required_before_execution",
    "runtime_node_transition_prerequisite_created_before_execution",
    "scheduler.evaluate_frontier_readiness",
    "scheduler.approve_and_run_first_node absent",
    "implementation executor not called",
  ],
  outputHash,
  outputByteCount: Buffer.byteLength(output, "utf8"),
  outputStored: false,
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  rawCommandLogStored: false,
};

fs.writeFileSync(path.join(outDir, "proof.json"), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify(artifact, null, 2));
process.exit(passed ? 0 : 1);
