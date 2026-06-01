#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");

const item = {
  id: "openclaw-convergence.mandatory-context-focus-target-selection-boundary",
  rank: 146,
  title: "Mandatory Context Focus And Target Selection Boundary",
  description:
    "Make ResourceObjectiveFocus mandatory before context requirements, node-local node resource demand, and scout specialist subturns; make model-authored target selection mandatory before source-edit snapshots; permanently cut broad targetRef/likelyRepoArea/approved-scope fallbacks.",
  scope: [
    "ResourceObjectiveFocus_mandatory_before_resource_requirement",
    "ResourceObjectiveFocus_mandatory_before_node_resource_demand",
    "ResourceObjectiveFocus_mandatory_before_scout_specialist_subturn",
    "target_selection_mandatory_before_source_edit_snapshots",
    "WorkIntent_targetRefs_demoted_to_candidate_seeds",
    "no_allowed_scope_context_scout_root_fallback",
    "no_packet_likelyRepoAreas_as_scout_roots_without_focus",
    "no_graph_metadata_targetRefs_as_executable_targets",
    "manifest_only_focus_demand_ledger_target_selection_metadata",
    "real_model_middle_lane_focus_to_target_selection_gate",
  ],
  successGate:
    "Production cannot compile context requirements, node resource demands, specialist scout packets, or source-edit snapshots from broad runtime-owned refs; accepted model-authored focus and target-selection packets own relevance while runtime validates handles, authority, count, budget, storage, and lifecycle only.",
};

const sourceSpecRef =
  "docs/projects/execution-platform/specs/mandatory-context-focus-and-target-selection-boundary.md";

const governingSpecRefs = [
  sourceSpecRef,
  "docs/projects/execution-platform/specs/architecture-transition-closure-and-resource-objective-focus.md",
  "docs/projects/execution-platform/specs/node-local-node-resource-demand-and-legacy-evisceration.md",
  "docs/projects/execution-platform/specs/code-verified-product-spec-blocker-closure-plan.md",
  "docs/projects/execution-platform/specs/non-codex-tool-worker-runtime.md",
  "docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md",
  "docs/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests.md",
];

const impactedItems = [
  "openclaw-convergence.context-scout-specialist-subturn-production-closure",
  "openclaw-convergence.workintent-context-resolution-from-ledger",
  "openclaw-convergence.proof-harness-canonical-gate-rewrite",
  "openclaw-convergence.readback-rootcause-provider-heap-closure",
  "openclaw-convergence.context-synthesis-runtime-deletion-closure",
  "openclaw-convergence.legacy-proof-test-purge-closure",
  "openclaw-convergence.legacy-runtime-code-evisceration-closure",
  "openclaw-convergence.architecture-residue-source-inventory-final-gate",
  "openclaw-convergence.worker-readiness-edit-evidence-node-local-closure",
  "openclaw-convergence.blocker-closure-06-replay-and-full-proof-gates",
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

function itemMetadata() {
  return {
    artifactKind: "execution_platform.mandatory_context_focus_target_selection_queue_item",
    sourceSpecRef,
    governingSpecRefs,
    beforeProductSpec: true,
    priorityClass: "P0",
    architectureTransitionClosureTranche: true,
    contextFocusMandatory: true,
    targetSelectionMandatory: true,
    noFallbackOrSecondaryPath: true,
    scope: item.scope,
    successGate: item.successGate,
    semanticJudgmentOwner:
      "model_or_human_authored_context_focus_target_selection_context_sufficiency_edit_intent_and_closeout_judgment",
    runtimeAuthority:
      "legal_resource_universe_refs_hashes_membership_authority_counts_budgets_payload_storage_lifecycle_locks_validation_and_readback_projection",
    deterministicSemanticJudgmentAllowed: false,
    runtimeMayChooseRelevantRefs: false,
    runtimeMayPromoteBroadTargetRefsToExecutableTargets: false,
    runtimeMayFallbackToApprovedScopeAsScoutRoots: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "mandatory_context_focus_target_selection_insert_and_rerank",
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
    const existing = await sql.query(
      `
        SELECT work_item_id, queue_rank, queue_status
        FROM execution_platform.work_items
        WHERE work_item_id = $1
        FOR UPDATE
      `,
      [item.id],
    );
    const existingRow = existing.rows[0] ?? null;
    const alreadyAtHead =
      existingRow?.queue_status === "active" && Number(existingRow.queue_rank) === item.rank;

    if (!alreadyAtHead) {
      await sql.query(
        `
          UPDATE execution_platform.work_items
          SET queue_rank = queue_rank + 1,
              updated_at = $2::timestamptz
          WHERE queue_status IN ('active', 'blocked', 'needs_review')
            AND queue_rank >= $1
            AND work_item_id <> $3
        `,
        [item.rank, now, item.id],
      );
    }

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
        VALUES ($1, 'platform_hardening', $2, $3, 'draft', 'active', $4, $5::jsonb, $6::timestamptz, $6::timestamptz)
        ON CONFLICT (work_item_id) DO UPDATE
        SET item_type = EXCLUDED.item_type,
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            queue_status = CASE
              WHEN execution_platform.work_items.queue_status IN ('closed', 'archived', 'superseded')
                THEN execution_platform.work_items.queue_status
              ELSE 'active'
            END,
            queue_rank = CASE
              WHEN execution_platform.work_items.queue_status IN ('closed', 'archived', 'superseded')
                THEN execution_platform.work_items.queue_rank
              ELSE EXCLUDED.queue_rank
            END,
            metadata = COALESCE(execution_platform.work_items.metadata, '{}'::jsonb) || EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at
      `,
      [item.id, item.title, item.description, item.rank, JSON.stringify(itemMetadata()), now],
    );

    await sql.query(
      `
        UPDATE execution_platform.work_items
        SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
            updated_at = $2::timestamptz
        WHERE work_item_id = ANY($3::text[])
          AND queue_status IN ('active', 'blocked', 'needs_review')
      `,
      [
        JSON.stringify({
          sourceSpecRef,
          governingSpecRefs,
          blockedByMandatoryContextFocusTargetSelectionBoundary: true,
          mandatoryContextFocusBoundaryRef: item.id,
          noFallbackOrSecondaryPath: true,
          rawPromptStored: false,
          rawResponseStored: false,
          rawTranscriptStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawCommandLogStored: false,
          rawDbRowsStored: false,
          hiddenReasoningStored: false,
          workQueueLifecycleMutated: true,
          lifecycleMutationKind: "downstream_items_reranked_after_mandatory_context_focus_boundary",
        }),
        now,
        impactedItems,
      ],
    );

    const result = await sql.query(
      `
        SELECT work_item_id, queue_rank, queue_status, lifecycle_state, title
        FROM execution_platform.work_items
        WHERE queue_status IN ('active', 'blocked', 'needs_review')
          AND queue_rank BETWEEN 146 AND 158
        ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      `,
    );
    await sql.query("COMMIT");

    const artifact = writeArtifact("mandatory-context-focus-target-selection-queue-update.json", {
      artifactKind: "execution_platform.mandatory_context_focus_target_selection_queue_update",
      sourceSpecRef,
      governingSpecRefs,
      insertedItem: item,
      impactedItems,
      queueRows: result.rows,
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      hiddenReasoningStored: false,
      workQueueLifecycleMutated: true,
    });
    console.log(JSON.stringify({ artifact, queueRows: result.rows }, null, 2));
  } catch (error) {
    await sql.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await runtime.close?.();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
