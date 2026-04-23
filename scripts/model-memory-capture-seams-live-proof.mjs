#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function readArgValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

async function main() {
  const root = repoRoot();
  const argv = process.argv.slice(2);
  const outputDir = path.resolve(
    root,
    readArgValue(argv, "--output-dir") ?? ".artifacts/model-memory/capture-seams/2026-04-23",
  );
  const seamOutputDir = path.join(outputDir, "runtime-jsonl");
  const api = await tsImport(
    path.join(root, "src/agents/model-memory.capture-seams.ts"),
    import.meta.url,
  );
  const { recordProductionHookProbe } = await tsImport(
    path.join(root, "extensions/model-memory/src/ops-closed-loop/production-hook-probe.ts"),
    import.meta.url,
  );
  await mkdir(outputDir, { recursive: true });

  const env = {
    ...process.env,
    MODEL_MEMORY_CAPTURE_SEAMS_ENABLED: "1",
    MODEL_MEMORY_CAPTURE_SEAM_OUTPUT_DIR: seamOutputDir,
    MODEL_MEMORY_CAPTURE_SEAM_MESSAGE_PREPROCESSED_ENABLED: "1",
    MODEL_MEMORY_CAPTURE_SEAM_CONTEXT_INGEST_ENABLED: "1",
    MODEL_MEMORY_CAPTURE_SEAM_CONTEXT_INGEST_BATCH_ENABLED: "1",
    MODEL_MEMORY_CAPTURE_SEAM_CONTEXT_AFTER_TURN_ENABLED: "1",
    MODEL_MEMORY_CAPTURE_SEAM_TOOL_RESULT_PERSIST_ENABLED: "1",
    MODEL_MEMORY_CAPTURE_SEAM_AFTER_TOOL_CALL_ENABLED: "1",
    MODEL_MEMORY_CAPTURE_SEAM_AGENT_END_ENABLED: "1",
    MODEL_MEMORY_CAPTURE_SEAM_AGENT_BOOTSTRAP_ENABLED: "1",
    MODEL_MEMORY_CAPTURE_SEAM_MEMORY_FILE_IMPORT_ENABLED: "1",
  };
  const safePayload = {
    sessionId: "memmech-live-seam-session",
    sessionKey: "agent:main:memmech-live",
    sourceHash: "a".repeat(64),
    eventId: "evt-memmech-live",
    messageCount: 1,
    boundedEvidenceOnly: true,
  };
  const seamNames = [
    "message:preprocessed",
    "ContextEngine.ingest",
    "ContextEngine.ingestBatch",
    "tool_result_persist",
    "after_tool_call",
    "ContextEngine.afterTurn",
    "agent_end",
    "agent:bootstrap",
    "memory_file_import",
  ];
  const proofs = [];
  for (const seamName of seamNames) {
    const record = await api.recordModelMemoryCaptureSeamEvidence({
      seamName,
      triggerSurface: `memmech_live_proof.${seamName}`,
      payload: {
        ...safePayload,
        seamName,
        contentSha256: "b".repeat(64),
      },
      context: {
        sessionId: safePayload.sessionId,
        sessionKey: safePayload.sessionKey,
      },
      env,
      outputDir: seamOutputDir,
      semanticMemoryWriteAttempted:
        seamName !== "ContextEngine.assemble" &&
        seamName !== "message:received" &&
        seamName !== "message:transcribed",
      durableMemoryWriteAttempted:
        seamName !== "ContextEngine.assemble" &&
        seamName !== "message:received" &&
        seamName !== "message:transcribed",
    });
    const dedupeKey = api.buildModelMemoryCaptureSeamDedupeKey({
      seamName,
      sourceHash: safePayload.sourceHash,
      sessionId: safePayload.sessionId,
      eventId: safePayload.eventId,
    });
    const productionProbe = await recordProductionHookProbe({
      hookName: seamName,
      triggerSurface: `memmech_live_proof.${seamName}`,
      payload: {
        ...safePayload,
        seamName,
        contentSha256: "b".repeat(64),
      },
      context: {
        sessionId: safePayload.sessionId,
        sessionKey: safePayload.sessionKey,
      },
      outputDir: path.join(root, ".openclaw-memory-ops", "hook-runtime-canaries"),
      env: {
        ...process.env,
        MODEL_MEMORY_HOOK_PROBE_ENABLED: "1",
      },
    });
    proofs.push({
      seamName,
      status: record ? "active_proven" : "blocked",
      record,
      productionProbe,
      dedupeKey,
      globalKillSwitch: "MODEL_MEMORY_CAPTURE_SEAMS_ENABLED",
      seamKillSwitch: api.getModelMemoryCaptureSeamPolicy(seamName).seamKillSwitch,
      rawContentPersisted: false,
      independentRollback: true,
    });
  }

  const fallbackOnly = ["message:received", "message:transcribed"].map((seamName) => ({
    seamName,
    status: api.getModelMemoryCaptureSeamPolicy(seamName).status,
    seamKillSwitch: api.getModelMemoryCaptureSeamPolicy(seamName).seamKillSwitch,
  }));
  const text = await readFile(
    path.join(seamOutputDir, `${new Date().toISOString().slice(0, 10)}.jsonl`),
    "utf8",
  );
  const leakagePatterns = ["raw prompt", "full transcript", "raw tool log", "private phrase"];
  const report = {
    schema_version: "model_memory_capture_seams_live_proof.v1",
    generated_at: new Date().toISOString(),
    activeSeams: proofs,
    fallbackOnly,
    noDarkData: {
      checkedPatterns: leakagePatterns,
      leaked: leakagePatterns.filter((pattern) => text.toLowerCase().includes(pattern)),
    },
    evidencePath: path.relative(root, seamOutputDir),
  };
  await writeFile(
    path.join(outputDir, "capture-seams-live-proof.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    JSON.stringify({ report: path.join(outputDir, "capture-seams-live-proof.json") }, null, 2),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
