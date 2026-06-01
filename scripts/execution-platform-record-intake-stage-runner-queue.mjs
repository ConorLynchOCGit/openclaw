#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");

const sourceSpecRefs = [
  "docs/projects/execution-platform/specs/obligation-graph-scheduler-intake.md",
  "docs/projects/execution-platform/specs/pre-product-spec-proof-stabilization-plan.md",
  "docs/projects/execution-platform/CURRENT_SLICE.md",
  "docs/projects/execution-platform/STATUS.md",
  "docs/projects/execution-platform/DECISIONS.md",
];

const intakeItem = {
  id: "openclaw-convergence.intake-stage-runner-obligation-graph-scheduler-intake",
  rank: 158,
  title: "IntakeStageRunner ObligationGraph Scheduler Intake",
  description:
    "Extract prompt/source intake through Mission Ledger and ObligationGraph into a single IntakeStageRunner owner before scheduler WorkIntent planning. Mission Ledger creation/replay, ObligationGraph authoring, small-verb repair, bounded diagnostics, accepted graph persistence, and scheduler-ready intake are runner-owned. Delete staged Mission Ledger diagnostic code, env flags, artifact contracts, queue seed entries, tests, and proof paths so no alternate pre-scheduler owner can reappear.",
  itemType: "platform_hardening",
  priorityClass: "P0",
  scope: [
    "intake_stage_runner",
    "mission_ledger_single_pass_creation",
    "accepted_mission_ledger_replay",
    "obligation_graph_small_verb_authoring",
    "obligation_graph_tool_shape_repair",
    "scheduler_ready_workintent_seed",
    "staged_mission_ledger_deletion",
    "queue_seed_residue_deletion",
    "artifact_contract_residue_deletion",
    "manifest_metadata_payload_overflow_guard",
  ],
  successGate:
    "DynamicAgentTeamGraphRunner delegates pre-scheduler intake to IntakeStageRunner. Mission Ledger and ObligationGraph authoring call sites live only in IntakeStageRunner. Direct graph JSON cannot bypass ObligationGraph small verbs. Staged Mission Ledger imports, env flags, artifact contracts, queue seed items, tests, and docs are deleted or explicitly historical. Scheduler receives accepted ObligationGraph, not CommitmentWorkPacket fanout.",
};

const retiredItemId = "openclaw-convergence.staged-mission-ledger-obligation-candidate-compiler";

const preProofOrder = [
  intakeItem.id,
  "openclaw-convergence.node-lifecycle-transition-ownership-consolidation",
  "openclaw-convergence.shared-domain-resource-lifecycle-contract-refactor",
  "openclaw-convergence.product-spec-planning-domain-profile-respec",
  "openclaw-convergence.domain-resource-small-verb-tool-surface",
  "openclaw-convergence.capability-manifest-domain-lifecycle-upgrade",
  "openclaw-convergence.proof-framework-executor-subject-split",
  "openclaw-convergence.product-spec-framework-coding-system-implementation-proof",
  "openclaw-convergence.source-inventory-domain-lifecycle-residue-gate",
  "openclaw-convergence.active-queue-34",
];

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

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
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
    if (!fs.existsSync(resolvedPath)) {
      continue;
    }
    for (const line of fs.readFileSync(resolvedPath, "utf8").split(/\r?\n/u)) {
      const parsed = parseDotenvLine(line);
      if (parsed && !process.env[parsed[0]]) {
        process.env[parsed[0]] = parsed[1];
      }
    }
  }
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

function intakeMetadata() {
  return {
    artifactKind: "execution_platform.intake_stage_runner_queue_item",
    sourceSpecRefs,
    beforeProductSpecProof: true,
    priorityClass: intakeItem.priorityClass,
    tranche: "intake_stage_runner_obligation_graph_scheduler_intake",
    scope: intakeItem.scope,
    successGate: intakeItem.successGate,
    canonicalOwner: "IntakeStageRunner",
    ownedStages: [
      "mission_ledger_single_pass_creation",
      "accepted_mission_ledger_checkpoint_replay",
      "obligation_graph_authoring",
      "obligation_graph_tool_shape_repair",
      "obligation_graph_artifact_persistence",
      "scheduler_ready_intake_gate",
    ],
    deletedAlternateOwner: retiredItemId,
    compatibilityFallbackAllowed: false,
    stagedMissionLedgerDiagnosticAllowed: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "intake_stage_runner_insert_retire_staged_item_and_rerank",
  };
}

async function main() {
  loadDotenvFiles();
  const api = await executionPlatformRuntimeApi();
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const sql = runtime.sqlClient;
  const now = new Date().toISOString();

  try {
    await sql.query("BEGIN");

    await sql.query(
      `
        INSERT INTO execution_platform.work_items (
          work_item_id,
          item_type,
          title,
          description,
          lifecycle_state,
          queue_status,
          queue_rank,
          metadata,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, 'draft', 'active', $5, $6::jsonb, $7::timestamptz, $7::timestamptz)
        ON CONFLICT (work_item_id) DO UPDATE
        SET item_type = EXCLUDED.item_type,
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            queue_status = CASE
              WHEN execution_platform.work_items.queue_status IN ('closed','archived','superseded')
                THEN execution_platform.work_items.queue_status
              ELSE 'active'
            END,
            queue_rank = CASE
              WHEN execution_platform.work_items.queue_status IN ('closed','archived','superseded')
                THEN execution_platform.work_items.queue_rank
              ELSE EXCLUDED.queue_rank
            END,
            metadata = COALESCE(execution_platform.work_items.metadata, '{}'::jsonb) || EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at
      `,
      [
        intakeItem.id,
        intakeItem.itemType,
        intakeItem.title,
        intakeItem.description,
        intakeItem.rank,
        JSON.stringify(intakeMetadata()),
        now,
      ],
    );

    await sql.query(
      `
        UPDATE execution_platform.work_items
        SET queue_status = 'superseded',
            lifecycle_state = 'canceled',
            closed_at = COALESCE(closed_at, $2::timestamptz),
            queue_rank = NULL,
            metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
            updated_at = $2::timestamptz
        WHERE work_item_id = $1
      `,
      [
        retiredItemId,
        now,
        JSON.stringify({
          supersededBy: intakeItem.id,
          supersededReason:
            "Staged Mission Ledger diagnostic experiment was deleted; IntakeStageRunner owns pre-scheduler Mission Ledger and ObligationGraph intake.",
          sourceSpecRefs,
          workQueueLifecycleMutated: true,
          lifecycleMutationKind: "staged_mission_ledger_item_retired_by_intake_stage_runner",
        }),
      ],
    );

    for (const [index, id] of preProofOrder.entries()) {
      await sql.query(
        `
          UPDATE execution_platform.work_items
          SET queue_rank = $1,
              metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
              updated_at = $3::timestamptz
          WHERE work_item_id = $4
            AND queue_status IN ('active','blocked','needs_review')
        `,
        [
          intakeItem.rank + index,
          JSON.stringify({
            preProductSpecProofOrder: index + 1,
            orderedByIntakeStageRunner: true,
            requiredPredecessorItemIds: index === 0 ? [] : preProofOrder.slice(0, index),
            sourceSpecRefs,
            workQueueLifecycleMutated: true,
            lifecycleMutationKind: "intake_stage_runner_preproof_rerank",
          }),
          now,
          id,
        ],
      );
    }

    const activeRows = await sql.query(
      `
        SELECT work_item_id
        FROM execution_platform.work_items
        WHERE queue_status IN ('active','blocked','needs_review')
        ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      `,
    );
    const managedIds = new Set(preProofOrder);
    const remaining = activeRows.rows
      .map((row) => row.work_item_id)
      .filter((id) => !managedIds.has(id));
    for (const [index, id] of [...preProofOrder, ...remaining].entries()) {
      await sql.query(
        `
          UPDATE execution_platform.work_items
          SET queue_rank = $1,
              updated_at = $2::timestamptz
          WHERE work_item_id = $3
            AND queue_status IN ('active','blocked','needs_review')
        `,
        [intakeItem.rank + index, now, id],
      );
    }

    const topRows = await sql.query(
      `
        SELECT work_item_id, title, queue_status, lifecycle_state, queue_rank
        FROM execution_platform.work_items
        WHERE queue_status IN ('active','blocked','needs_review')
          AND work_item_id LIKE 'openclaw-convergence.%'
        ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
        LIMIT 24
      `,
    );
    const retiredRows = await sql.query(
      `
        SELECT work_item_id, title, queue_status, lifecycle_state, queue_rank
        FROM execution_platform.work_items
        WHERE work_item_id = $1
      `,
      [retiredItemId],
    );

    const artifact = writeArtifact("intake-stage-runner-queue-update.json", {
      artifactKind: "execution_platform.intake_stage_runner_queue_update",
      databaseName: runtime.resolution.databaseName,
      sourceSpecRefs,
      insertedItemId: intakeItem.id,
      retiredItemId,
      preProofOrder,
      topActiveItems: topRows.rows,
      retiredItems: retiredRows.rows,
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      hiddenReasoningStored: false,
      workQueueLifecycleMutated: true,
      lifecycleMutationKind: "intake_stage_runner_insert_retire_staged_item_and_rerank",
    });

    await sql.query("COMMIT");
    console.log(
      JSON.stringify(
        {
          ok: true,
          artifact,
          insertedItemId: intakeItem.id,
          retiredItem: retiredRows.rows[0] ?? null,
          topActiveItems: topRows.rows,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await sql.query("ROLLBACK");
    throw error;
  } finally {
    await runtime.pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
