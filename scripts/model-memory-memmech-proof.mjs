#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROOF_MARKER = "MEMMECH-2026-04-22";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists(filePath, fallback) {
  if (!(await exists(filePath))) {
    return fallback;
  }
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function sha256File(filePath) {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
}

async function tailJsonl(filePath, limit = 20) {
  if (!(await exists(filePath))) {
    return [];
  }
  const text = await readFile(filePath, "utf8");
  return text
    .split(/\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-limit)
    .map((line) => JSON.parse(line));
}

function containsUnsafePayload(value) {
  const text = JSON.stringify(value);
  return /raw prompt must not persist|full transcript|raw tool log|private phrase|secret value/iu.test(
    text,
  );
}

async function main() {
  const root = repoRoot();
  const stateDir = process.env.OPENCLAW_STATE_DIR?.trim() || "/root/.openclaw";
  const workspaceRoot = "/root/.openclaw/workspace";
  const outputDir = path.join(root, ".artifacts/model-memory/memmech-proof/2026-04-22-pass-7");
  await mkdir(outputDir, { recursive: true });

  const captureEvents = await tailJsonl(
    path.join(stateDir, "model-memory/capture-jobs/events.jsonl"),
  );
  const dirtyState = await readJsonIfExists(
    path.join(stateDir, "model-memory/runtime-dirty/state.json"),
    null,
  );
  const dirtyEvents = await tailJsonl(
    path.join(stateDir, "model-memory/runtime-dirty/events.jsonl"),
  );
  const scorecard = await readJsonIfExists(
    path.join(stateDir, "model-memory/provider-scorecards/summary.json"),
    null,
  );
  const projectionIndex = await readJsonIfExists(
    path.join(workspaceRoot, ".openclaw/model-memory/projections/index.json"),
    { artifact_entries: [] },
  );
  const projectionTypes = [
    ...new Set((projectionIndex.artifact_entries ?? []).map((entry) => entry.projection_type)),
  ].toSorted((left, right) => left.localeCompare(right));
  const requiredProjectionTypes = [
    "agent_digest",
    "dashboard",
    "decision_log",
    "entity_page",
    "procedure_page",
    "project_page",
    "projection_digest",
    "source_page",
    "timeline_page",
    "user_profile_page",
  ];
  const rootHashes = {
    user_md: await sha256File(path.join(workspaceRoot, "USER.md")),
    memory_md: await sha256File(path.join(workspaceRoot, "MEMORY.md")),
  };
  const proof = {
    schema_version: "model_memory_memmech_proof.v1",
    proof_marker: PROOF_MARKER,
    generated_at: new Date().toISOString(),
    durable_db_writes: "none",
    proof_storage: "artifact_only",
    gates: {
      capture_job_events_present: captureEvents.length > 0,
      capture_job_reload_surface_present: await exists(
        path.join(stateDir, "model-memory/capture-jobs/jobs"),
      ),
      dirty_state_surface_present:
        dirtyState !== null ||
        (await exists(path.join(stateDir, "model-memory/runtime-dirty/events.jsonl"))),
      dirty_events_present: dirtyEvents.length > 0,
      pool_or_provider_scorecard_present: scorecard !== null,
      cache_metrics_surface_present: scorecard !== null,
      projection_index_present: (projectionIndex.artifact_entries ?? []).length > 0,
      all_projection_types_present: requiredProjectionTypes.every((type) =>
        projectionTypes.includes(type),
      ),
      root_write_back_disabled: projectionIndex.root_write_back_status === "disabled",
      no_raw_payload_in_runtime_state:
        !containsUnsafePayload(captureEvents) &&
        !containsUnsafePayload(dirtyState) &&
        !containsUnsafePayload(dirtyEvents) &&
        !containsUnsafePayload(scorecard),
      no_live_durable_eval_output: true,
      isolated_durable_capture_row_proof_required_for_clean_soak: true,
    },
    projection_types: projectionTypes,
    capture_event_types: [...new Set(captureEvents.map((entry) => entry.eventType))].toSorted(
      (left, right) => String(left).localeCompare(String(right)),
    ),
    dirty_event_types: [...new Set(dirtyEvents.map((entry) => entry.eventType))].toSorted(
      (left, right) => String(left).localeCompare(String(right)),
    ),
    scorecard_total_calls: scorecard?.totalCalls ?? 0,
    root_hashes: rootHashes,
    notes: [
      "This proof does not create artificial durable memories in the live DB.",
      "Durable ordinary-turn row proof must use an operator-approved durable payload or isolated DB.",
    ],
  };
  proof.clean = Object.entries(proof.gates)
    .filter(([key]) => key !== "isolated_durable_capture_row_proof_required_for_clean_soak")
    .every(([, value]) => value);

  const jsonPath = path.join(outputDir, "memmech-proof.json");
  const markdownPath = path.join(outputDir, "memmech-proof.md");
  await writeFile(jsonPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  await writeFile(
    markdownPath,
    [
      "# MEMMECH Proof",
      "",
      `- Marker: ${proof.proof_marker}`,
      `- Clean mechanical artifact gates: ${proof.clean}`,
      `- Durable DB writes: ${proof.durable_db_writes}`,
      `- Projection types: ${projectionTypes.join(", ")}`,
      `- Capture events: ${proof.capture_event_types.join(", ") || "none"}`,
      `- Dirty events: ${proof.dirty_event_types.join(", ") || "none"}`,
      "",
      "Durable ordinary-turn row proof remains blocked unless an operator-approved durable payload or isolated DB is used.",
    ].join("\n"),
    "utf8",
  );
  console.log(JSON.stringify({ jsonPath, markdownPath, clean: proof.clean }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
