import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const observationCount = Number.parseInt(
  process.env.AGENCY_DATA_BENCHMARK_OBSERVATIONS ?? "100000",
  10,
);
if (!Number.isSafeInteger(observationCount) || observationCount < 1) {
  throw new Error("AGENCY_DATA_BENCHMARK_OBSERVATIONS must be a positive integer.");
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), "agency-data-jsonl-bench-"));
const file = path.join(root, "canonical.jsonl");
const before = process.memoryUsage().rss;
const start = performance.now();
let output = "";
for (let index = 0; index < observationCount; index += 1) {
  output += `${JSON.stringify({ schema_version: "agency-data/v1", object_type: "metric_observation", object_id: `bench-${index}`, tenant_id: "benchmark", subject: { entity_type: "company", entity_id: "benchmark-company" }, channel: "synthetic", source: { provider: "benchmark", auth_mode: "manual" }, source_ref: { source_id: `benchmark-${index}` }, event_at: "2026-07-16T00:00:00.000Z", recorded_at: "2026-07-16T00:00:00.000Z", account_id: "benchmark-account", metric_definition_id: "engagement-rate", metric_family: "engagement", metric_name: "rate", numerator: index % 100, denominator: 100, unit: "ratio", completeness: 1, stabilization: { state: "stabilized", as_of: "2026-07-16T00:00:00.000Z" }, privacy: { classification: "aggregate" }, method_version: "benchmark-v1", observation_at: "2026-07-16T00:00:00.000Z", distribution: "organic" })}\n`;
  if (output.length > 1024 * 1024) {
    await fs.appendFile(file, output, "utf8");
    output = "";
  }
}
if (output) {
  await fs.appendFile(file, output, "utf8");
}
const elapsedMs = performance.now() - start;
const stats = await fs.stat(file);
const after = process.memoryUsage().rss;
console.log(
  JSON.stringify({
    baseline: "plain-jsonl",
    observations: observationCount,
    elapsed_ms: Number(elapsedMs.toFixed(1)),
    rss_delta_bytes: after - before,
    file_bytes: stats.size,
  }),
);
await fs.rm(root, { recursive: true, force: true });
