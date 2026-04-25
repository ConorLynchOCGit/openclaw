#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";
import {
  DEFAULT_MAIN_SESSION_ALIAS,
  OperatorBrowserHarness,
} from "./lib/operator-browser-harness.mjs";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function timestampId() {
  return new Date().toISOString().replace(/[-:.]/g, "").replace(/Z$/, "Z");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function excerpt(value, maxChars = 480) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, maxChars - 1)}…`;
}

function assistantText(turn) {
  const transcriptText = turn?.completionEvidence?.transcript?.assistantText;
  if (typeof transcriptText === "string" && transcriptText.trim().length > 0) {
    return transcriptText;
  }
  return turn?.summary?.lastAssistantText ?? "";
}

function promptProof(label, turn, marker) {
  const text = assistantText(turn);
  return {
    label,
    runId: turn?.runId ?? null,
    sessionKey: turn?.sessionKey ?? null,
    assistantExcerpt: excerpt(text),
    assistantContainsMarker: marker ? text.includes(marker) : undefined,
    assistantTextSha256: sha256(text),
  };
}

async function queryMarkerEvidence(sqlClient, marker) {
  const result = await sqlClient.query(
    `
      SELECT
        memory_id,
        status,
        kind,
        artifact_type,
        canonical_text,
        payload,
        tags,
        source_refs,
        created_at
      FROM model_memory.durable_memories
      WHERE canonical_text ILIKE $1
         OR search_text ILIKE $1
         OR payload::text ILIKE $1
      ORDER BY created_at DESC
      LIMIT 10
    `,
    [`%${marker}%`],
  );
  return result.rows.map((row) => ({
    memoryId: row.memory_id,
    status: row.status,
    kind: row.kind,
    artifactType: row.artifact_type,
    canonicalTextExcerpt: excerpt(row.canonical_text, 260),
    payload: row.payload,
    tags: row.tags,
    sourceRefs: Array.isArray(row.source_refs)
      ? row.source_refs.map((ref) => ({
          sourceType: ref.source_type,
          sourceId: ref.source_id,
          segmentId: ref.segment_id,
          evidenceQuoteSha256: ref.evidence_quote ? sha256(ref.evidence_quote) : undefined,
        }))
      : [],
    createdAt: row.created_at?.toISOString?.() ?? String(row.created_at),
  }));
}

function assertNoProhibitedReportContent(report) {
  const serialized = JSON.stringify(report);
  for (const prohibited of [
    "raw prompt marker",
    "raw transcript marker",
    "raw tool log marker",
    "secret marker",
    "private phrase marker",
  ]) {
    if (serialized.toLowerCase().includes(prohibited)) {
      throw new Error(`proof report contains prohibited content: ${prohibited}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(root, ".artifacts/model-memory/phase2-live-ui-proof", stamp);
  await mkdir(outputDir, { recursive: true });

  const explicitMarker = `PHASE2-UI-LIVE-MEMORY-${stamp}`;
  const softMarker = `PHASE2-UI-LIVE-SOFT-${stamp}`;
  const sessionKey = process.env.MODEL_MEMORY_PHASE2_UI_PROOF_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;

  const { createModelMemoryDatabaseRuntime } = await tsImport(
    path.join(root, "src/agents/model-memory.database.ts"),
    import.meta.url,
  );
  const { loadConfig } = await tsImport(path.join(root, "src/config/config.ts"), import.meta.url);
  const config = loadConfig();

  const harness = await new OperatorBrowserHarness({ headless: true }).start();
  const turns = [];
  try {
    turns.push(
      await harness.sendPrompt("/new", {
        sessionKey,
        waitFor: "terminal",
        timeoutMs: 120_000,
      }),
    );
    turns.push(
      await harness.sendPrompt(
        `For project model-memory, please remember this exact value: ${explicitMarker}`,
        {
          sessionKey,
          waitFor: "terminal",
          timeoutMs: 180_000,
        },
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    turns.push(
      await harness.sendPrompt("/new", {
        sessionKey,
        waitFor: "terminal",
        timeoutMs: 120_000,
      }),
    );
    turns.push(
      await harness.sendPrompt(
        "Use model_memory_search to answer from MMV2 memory only. What exact value did I ask you to remember for project model-memory in the latest UI proof? Return only that value.",
        {
          sessionKey,
          waitFor: "terminal",
          timeoutMs: 180_000,
        },
      ),
    );
    turns.push(
      await harness.sendPrompt("/new", {
        sessionKey,
        waitFor: "terminal",
        timeoutMs: 120_000,
      }),
    );
    turns.push(
      await harness.sendPrompt(
        `Researcher report artifact. Cited fact: the model-memory live UI soft-source proof value is ${softMarker}. Source ref: https://example.invalid/model-memory/phase2-ui-proof/${stamp}. Treat this as cited soft evidence, not hard truth.`,
        {
          sessionKey,
          waitFor: "terminal",
          timeoutMs: 180_000,
        },
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    turns.push(
      await harness.sendPrompt("/new", {
        sessionKey,
        waitFor: "terminal",
        timeoutMs: 120_000,
      }),
    );
    turns.push(
      await harness.sendPrompt(
        "Use model_memory_search to answer from MMV2 memory only. What cited soft evidence value did the latest researcher report artifact provide for the model-memory live UI proof? Return the value and its authority tier.",
        {
          sessionKey,
          waitFor: "terminal",
          timeoutMs: 180_000,
        },
      ),
    );
  } finally {
    await harness.close();
  }

  const runtime = await createModelMemoryDatabaseRuntime({
    config,
    applyMigrations: false,
  });
  let explicitRows;
  let softRows;
  try {
    explicitRows = await queryMarkerEvidence(runtime.sqlClient, explicitMarker);
    softRows = await queryMarkerEvidence(runtime.sqlClient, softMarker);
  } finally {
    await runtime.pool.end();
  }

  const explicitRetrieval = turns[3];
  const softRetrieval = turns[7];
  const softPayload = softRows[0]?.payload ?? {};
  const report = {
    schemaVersion: "phase2_live_ui_proof.v1",
    generatedAt: new Date().toISOString(),
    sessionKey,
    markers: {
      explicitMarker,
      softMarker,
    },
    ui: {
      authReached: true,
      turns: [
        promptProof("new_before_explicit", turns[0]),
        promptProof("explicit_capture", turns[1], explicitMarker),
        promptProof("new_before_explicit_retrieval", turns[2]),
        promptProof("explicit_retrieval", explicitRetrieval, explicitMarker),
        promptProof("new_before_soft", turns[4]),
        promptProof("soft_capture", turns[5], softMarker),
        promptProof("new_before_soft_retrieval", turns[6]),
        promptProof("soft_retrieval", softRetrieval, softMarker),
      ],
    },
    backend: {
      explicitRows,
      softRows,
    },
    checks: {
      explicitDurableMemoryExists: explicitRows.length > 0,
      explicitRetrievalReturnedMarker: assistantText(explicitRetrieval).includes(explicitMarker),
      softDurableMemoryExists: softRows.length > 0,
      softAuthorityMetadataPresent:
        softPayload?.authorityTier === "cited_soft" ||
        softPayload?.sourceAuthority?.authorityTier === "cited_soft",
      softSourceProfileMetadataPresent:
        softPayload?.sourceProfileId === "researcher_report_artifact" ||
        softPayload?.sourceAuthority?.sourceProfileId === "researcher_report_artifact",
      softRetrievalReturnedMarker: assistantText(softRetrieval).includes(softMarker),
      softRetrievalLabeledLowerAuthority: /cited_soft|cited soft|lower[-\s]?authority/i.test(
        assistantText(softRetrieval),
      ),
      noDarkDataReportContent: true,
    },
  };
  assertNoProhibitedReportContent(report);

  const failures = Object.entries(report.checks)
    .filter(([, passed]) => passed !== true)
    .map(([name]) => name);
  const jsonPath = path.join(outputDir, "report.json");
  const markdownPath = path.join(outputDir, "report.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(
    markdownPath,
    [
      "# Phase 2 Live UI Proof",
      "",
      `- explicit_marker: ${explicitMarker}`,
      `- soft_marker: ${softMarker}`,
      `- explicit_rows: ${explicitRows.length}`,
      `- soft_rows: ${softRows.length}`,
      `- failures: ${failures.length ? failures.join(", ") : "none"}`,
      `- report_json: ${jsonPath}`,
    ].join("\n"),
    "utf8",
  );

  process.stdout.write(
    `${JSON.stringify({ ok: failures.length === 0, failures, jsonPath }, null, 2)}\n`,
  );
  if (failures.length > 0) {
    process.exit(1);
  }
}

await main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
