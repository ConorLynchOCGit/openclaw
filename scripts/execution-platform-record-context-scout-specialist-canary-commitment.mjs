#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.context-scout-specialist-subturn-production-closure";

const description =
  "Convert scout execution from default graph node to optional consumer-bound specialist subturn. Simple node resource demands are fulfilled by repo/file/test/memory tools; scout runs only when the node needs deeper exploration. Closure must include a non-trivial real-model canary proving model-authored discovery and target narrowing from a larger legal-ref universe without runtime-seeded target files.";

const scope = [
  "context_scout_specialist_subturn",
  "consumer_bound_scout_dispatch",
  "direct_node_resource_demand_fulfillment",
  "specialist_scout_handoff_to_NodeResourceDemandSession",
  "NodeResourceLedger_append_from_scout",
  "middle_lane_real_model_broad_legal_ref_universe",
  "model_authored_resource_objective_focus",
  "model_authored_node_resource_demand_from_focus",
  "model_authored_target_selection_from_ledger_evidence",
  "runtime_must_not_seed_known_target_files",
];

const successGate =
  "Context scout is no longer default graph glue; when used, it is a subturn bound to a specific NodeResourceDemandSession and returns ledger entries to that consumer node. A real-model middle-lane canary must prove broad legal refs -> model-authored focus -> node-local demand/scout -> ledger evidence -> model-authored target selection, with manifest-only metadata and no runtime-seeded target refs.";

const middleLaneCanary = {
  required: true,
  proofKind: "real_model_middle_lane_discovery_target_narrowing",
  representativeOf:
    "Product/Spec larger-universe target discovery risk without full Product/Spec prompt",
  requiredFlow: [
    "broad_legal_ref_universe",
    "model_authored_resource_objective_focus",
    "node_local_node_resource_demand_or_consumer_bound_scout_subturn",
    "NodeResourceLedger_payload_backed_evidence",
    "model_authored_target_selection_from_ledger_evidence",
    "runtime_validated_implementation_context_ready_or_precise_target_selection_blocker",
  ],
  forbidden: [
    "runtime_seeded_known_target_files",
    "graph_level_context_scout_fanout",
    "retired_global_context_coordination_path",
    "stale_resource_fulfillment_gate",
    "metadata_context_blob_overflow",
  ],
  runtimeAuthority:
    "legal_ref_universe_authority_bounds_budgets_refs_hashes_manifest_storage_lifecycle_validation_only",
  semanticJudgmentOwner:
    "model_authored_focus_node_resource_demand_handoff_substance_and_target_selection",
};

function parseDotenvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }
  const equalIndex = trimmed.indexOf("=");
  if (equalIndex === -1) {
    return null;
  }
  const key = trimmed.slice(0, equalIndex).trim();
  let value = trimmed.slice(equalIndex + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return key ? [key, value] : null;
}

function loadDotenvFiles() {
  for (const filePath of [
    ".env",
    ".env.local",
    ".env.execution-platform-staging",
    "/root/.openclaw/.env",
  ]) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
      const parsed = parseDotenvLine(line);
      if (parsed && !process.env[parsed[0]]) {
        process.env[parsed[0]] = parsed[1];
      }
    }
  }
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  const absolutePath = path.join(artifactDir, name);
  fs.writeFileSync(absolutePath, body, "utf8");
  return {
    path: path.relative(root, absolutePath),
    ref: `artifact://execution-platform/${name}`,
    sha256: `sha256:${sha256(body)}`,
  };
}

async function executionPlatformRuntimeApi() {
  return await tsImport(
    path.join(root, "extensions/execution-platform/src/db/runtime.ts"),
    import.meta.url,
  );
}

async function main() {
  loadDotenvFiles();
  const api = await executionPlatformRuntimeApi();
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const metadata = {
    scope,
    successGate,
    middleLaneCanary,
    noRuntimeSeededTargetFiles: true,
    broadLegalRefUniverseCanaryRequired: true,
    manifestOnlyMetadataRequired: true,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind:
      "context_scout_specialist_subturn_middle_lane_canary_commitment_update",
  };

  try {
    await runtime.sqlClient.query("BEGIN");
    await runtime.sqlClient.query(
      `
        UPDATE execution_platform.work_items
        SET description = $1,
            metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
            updated_at = now()
        WHERE work_item_id = $3
      `,
      [description, JSON.stringify(metadata), workItemId],
    );
    const result = await runtime.sqlClient.query(
      `
        SELECT
          work_item_id,
          queue_rank,
          queue_status,
          lifecycle_state,
          title,
          description,
          metadata->'scope' AS scope,
          metadata->>'successGate' AS success_gate,
          metadata->'middleLaneCanary' AS middle_lane_canary
        FROM execution_platform.work_items
        WHERE work_item_id = $1
      `,
      [workItemId],
    );
    await runtime.sqlClient.query("COMMIT");

    const artifact = writeArtifact(
      "context-scout-specialist-subturn-middle-lane-canary-commitment-update.json",
      {
        artifactKind: "execution_platform.work_queue_item_commitment_update",
        workItemId,
        rows: result.rows,
        rawDbRowsStored: false,
        rawPromptStored: false,
        rawResponseStored: false,
      },
    );
    console.log(JSON.stringify({ status: "updated", artifact, row: result.rows[0] }, null, 2));
  } catch (error) {
    await runtime.sqlClient.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await runtime.close?.();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
  });
