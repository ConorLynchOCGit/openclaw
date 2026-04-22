#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";
import { z } from "zod";

const DEFAULT_MODEL_ID =
  process.env.MODEL_MEMORY_EVIDENCE_MODEL?.trim() || "openrouter/openai/gpt-5.4-nano";

const MODE_LABELS = {
  json_object: "current json_object",
  prompt_schema_json_object: "prompt-visible schema + json_object",
  strict_json_schema: "strict json_schema + provider.require_parameters",
};

const CASES = [
  {
    id: "atomic-preference-claim",
    phase: "atomic",
    text: "I prefer concise answers.",
    selectSegments(segments) {
      return segments.filter((segment) => segment.text.includes("I prefer concise answers."));
    },
    expectation(batch) {
      const candidate = batch.atomic_candidates[0];
      return (
        batch.atomic_candidates.length >= 1 &&
        candidate?.kind === "claim" &&
        candidate?.payload?.payload_type === "claim" &&
        candidate?.payload?.claim_type === "preference_state" &&
        candidate?.evidence_quote === "I prefer concise answers."
      );
    },
  },
  {
    id: "atomic-hard-directive",
    phase: "atomic",
    text: "Never deploy without user approval.",
    selectSegments(segments) {
      return segments.filter((segment) =>
        segment.text.includes("Never deploy without user approval."),
      );
    },
    expectation(batch) {
      const candidate = batch.atomic_candidates[0];
      return (
        batch.atomic_candidates.length >= 1 &&
        candidate?.kind === "directive" &&
        candidate?.payload?.payload_type === "directive" &&
        candidate?.payload?.strength === "hard_constraint" &&
        candidate?.evidence_quote === "Never deploy without user approval."
      );
    },
  },
  {
    id: "composite-procedure",
    phase: "composite",
    text: "Release checklist:\n1. Run the test suite.\n2. Ship the build.",
    selectSegments(segments) {
      return segments.filter((segment) => segment.detected_shape === "numbered_list_block");
    },
    expectation(batch) {
      const candidate = batch.composite_candidates[0];
      return (
        batch.composite_candidates.length >= 1 &&
        candidate?.artifact_type === "procedure" &&
        candidate?.components?.length >= 1 &&
        candidate.components.every((component) =>
          component.role === "step" ? component.promotion === "embedded_only" : true,
        )
      );
    },
  },
];

function getRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function readGitHead(repoRoot) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function formatTimestampForPath(isoString) {
  return isoString.replaceAll(":", "").replaceAll(".", "-");
}

function parseArgs(argv) {
  let outputRoot = null;
  let modelId = DEFAULT_MODEL_ID;
  const requestedModes = [];
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--output-root") {
      outputRoot = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (current === "--model-id") {
      modelId = argv[index + 1] ?? modelId;
      index += 1;
      continue;
    }
    if (current === "--mode") {
      const mode = argv[index + 1] ?? "";
      if (mode) {
        requestedModes.push(mode);
      }
      index += 1;
    }
  }
  return { outputRoot, modelId, requestedModes };
}

function serialize(value) {
  return JSON.stringify(value, null, 2);
}

function renderMarkdown(report) {
  const lines = [
    "# MMV2 Atomic / Composite Extraction Probe",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Commit: ${report.commitHash}`,
    `- Requested model: ${report.modelId}`,
    `- Modes: ${report.modes.join(", ")}`,
    `- Cases: ${report.results.length}`,
    "",
  ];

  for (const result of report.results) {
    lines.push(`## ${result.caseId} / ${result.mode}`);
    lines.push(`- Phase: ${result.phase}`);
    lines.push(`- Mode label: ${result.modeLabel}`);
    lines.push(`- Status: ${result.status}`);
    lines.push(`- Validation ok: ${String(result.validationOk)}`);
    lines.push(`- Expectation ok: ${String(result.expectationOk)}`);
    lines.push(`- Trace count: ${result.traceCount}`);
    if (result.error) {
      lines.push(`- Error: ${result.error}`);
    }
    if (result.summary) {
      lines.push(`- Summary: ${result.summary}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function writeArtifacts(outputRoot, report) {
  const runDir = path.join(outputRoot, formatTimestampForPath(report.generatedAt));
  await mkdir(runDir, { recursive: true });
  const reportPath = path.join(runDir, "report.json");
  const summaryPath = path.join(runDir, "summary.md");
  await writeFile(reportPath, `${serialize(report)}\n`, "utf8");
  await writeFile(summaryPath, `${renderMarkdown(report)}\n`, "utf8");
  return { runDir, reportPath, summaryPath };
}

async function main() {
  const repoRoot = getRepoRoot();
  const args = parseArgs(process.argv.slice(2));
  const modes =
    args.requestedModes.length > 0
      ? args.requestedModes
      : ["json_object", "prompt_schema_json_object", "strict_json_schema"];

  const [
    sourceAdapterExports,
    rawIngestExports,
    segmentationExports,
    atomicExports,
    compositeExports,
    modelExecutionExports,
    liveExecutorExports,
  ] = await Promise.all([
    tsImport("../extensions/model-memory/src/source-adapters/document-source-adapter.ts", {
      parentURL: import.meta.url,
    }),
    tsImport("../extensions/model-memory/src/mmv2/raw-ingest.ts", { parentURL: import.meta.url }),
    tsImport("../extensions/model-memory/src/mmv2/segmentation.ts", { parentURL: import.meta.url }),
    tsImport("../extensions/model-memory/src/mmv2/atomic-extraction.ts", {
      parentURL: import.meta.url,
    }),
    tsImport("../extensions/model-memory/src/mmv2/composite-extraction.ts", {
      parentURL: import.meta.url,
    }),
    tsImport("../extensions/model-memory/src/model-execution.ts", { parentURL: import.meta.url }),
    tsImport("../src/agents/model-memory.live-json-executor.ts", { parentURL: import.meta.url }),
  ]);

  const traces = [];
  const executor = new liveExecutorExports.OpenAICompatibleLiveJsonExecutor({
    onTrace(trace) {
      traces.push(trace);
    },
  });

  class ProbeInterpreter {
    constructor(delegate) {
      this.delegate = delegate;
    }

    async interpret(input) {
      const response = await this.delegate.execute({
        contract: input.prompt.contract,
        systemPrompt: input.prompt.systemPrompt,
        userPrompt: input.prompt.userPrompt,
        responseFormat: input.prompt.responseFormat,
        responseOptions: input.prompt.responseOptions,
      });
      const parsed = modelExecutionExports.parseJsonModelOutput(
        response,
        input.prompt.contract,
        z.unknown(),
      );
      if (Array.isArray(parsed)) {
        return { action: "capture", objects: parsed };
      }
      return { action: "capture", objects: [parsed] };
    }
  }

  const interpreter = new ProbeInterpreter(executor);
  const results = [];

  for (const mode of modes) {
    for (const testCase of CASES) {
      const envelope = sourceAdapterExports.adaptDocumentSource({
        externalSourceId: testCase.id,
        text: testCase.text,
        maxWordsPerWindow: Number.MAX_SAFE_INTEGER,
        sourceKind: "document",
      });
      const rawEvent = rawIngestExports.createRawIngestEvent({
        sourceId: envelope.source.id,
        rawText: envelope.normalizedText,
        createdAt: envelope.source.createdAt,
        sourceType: "document",
        metadata: {
          channel: "extraction_probe",
          locale: "en",
          project_id: null,
          workspace_id: null,
          conversation_title: null,
          sensitivity_hint: "unknown",
        },
      });
      const segmented = segmentationExports.segmentRawIngestEvent(rawEvent);
      const selectedSegments = testCase.selectSegments(segmented.segments);
      const traceStart = traces.length;

      try {
        const batch =
          testCase.phase === "atomic"
            ? await atomicExports.extractAtomicCandidates({
                rawEvent,
                sourceKind: "document",
                sourceId: envelope.source.id,
                sourceWindow: envelope.windows[0],
                modelId: args.modelId,
                interpreter,
                segments: selectedSegments,
                responseMode: mode,
              })
            : await compositeExports.extractCompositeCandidates({
                rawEvent,
                sourceKind: "document",
                sourceId: envelope.source.id,
                sourceWindow: envelope.windows[0],
                modelId: args.modelId,
                interpreter,
                segments: selectedSegments,
                responseMode: mode,
              });

        const traceSlice = traces.slice(traceStart);
        const expectationOk = testCase.expectation(batch);
        const summary =
          testCase.phase === "atomic"
            ? batch.atomic_candidates
                .map((candidate) => `${candidate.kind}:${candidate.evidence_quote}`)
                .join(" | ")
            : batch.composite_candidates
                .map((candidate) => `${candidate.artifact_type}:${candidate.components.length}`)
                .join(" | ");

        results.push({
          caseId: testCase.id,
          phase: testCase.phase,
          mode,
          modeLabel: MODE_LABELS[mode] ?? mode,
          status: "ok",
          validationOk: true,
          expectationOk,
          traceCount: traceSlice.length,
          traces: traceSlice,
          batch,
          summary,
          error: null,
        });
      } catch (error) {
        const traceSlice = traces.slice(traceStart);
        results.push({
          caseId: testCase.id,
          phase: testCase.phase,
          mode,
          modeLabel: MODE_LABELS[mode] ?? mode,
          status: "error",
          validationOk: false,
          expectationOk: false,
          traceCount: traceSlice.length,
          traces: traceSlice,
          batch: null,
          summary: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    commitHash: readGitHead(repoRoot),
    repoRoot,
    modelId: args.modelId,
    modes,
    results,
  };

  const artifacts = await writeArtifacts(
    args.outputRoot ?? path.join(repoRoot, ".artifacts/model-memory/mmv2/extraction-probe"),
    report,
  );

  process.stdout.write(
    `${renderMarkdown(report)}\nArtifacts:\n- ${artifacts.runDir}\n- ${artifacts.reportPath}\n- ${artifacts.summaryPath}\n`,
  );
}

await main();
