#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  DEFAULT_MAIN_SESSION_ALIAS,
  OperatorBrowserHarness,
} from "./lib/operator-browser-harness.mjs";
import { resolvePromptInput } from "./operator-prompt-harness.mjs";

function parseArgs(argv) {
  const options = {
    sessionKey: DEFAULT_MAIN_SESSION_ALIAS,
    prompt: null,
    promptFile: null,
    promptStdin: false,
    waitFor: "progress",
    timeoutMs: undefined,
    headless: true,
    artifact: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--session") {
      options.sessionKey = argv[index + 1] ?? options.sessionKey;
      index += 1;
      continue;
    }
    if (arg === "--prompt") {
      options.prompt = argv[index + 1] ?? options.prompt;
      index += 1;
      continue;
    }
    if (arg === "--prompt-file") {
      options.promptFile = argv[index + 1] ?? options.promptFile;
      index += 1;
      continue;
    }
    if (arg === "--stdin") {
      options.promptStdin = true;
      continue;
    }
    if (arg === "--wait-for") {
      options.waitFor = argv[index + 1] ?? options.waitFor;
      index += 1;
      continue;
    }
    if (arg === "--timeout") {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.timeoutMs = parsed;
      }
      index += 1;
      continue;
    }
    if (arg === "--artifact") {
      options.artifact = argv[index + 1] ?? options.artifact;
      index += 1;
      continue;
    }
    if (arg === "--headful") {
      options.headless = false;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
  }
  return options;
}

function printHelp() {
  process.stdout.write(
    [
      "Usage: node scripts/openclaw-submit-prompt-via-ux.mjs (--prompt-file <path> | --stdin | --prompt <text>) [options]",
      "",
      "Preferred for long prompts: --prompt-file <path> or --stdin.",
      "The prompt is treated as UTF-8 data and is never embedded in shell or JavaScript source.",
      "",
      "Options:",
      "  --session <key>      Session alias or canonical session key. Default: main",
      "  --wait-for <mode>    terminal | progress. Default: progress",
      "  --timeout <ms>       Wait timeout in milliseconds",
      "  --artifact <path>    Write bounded submission artifact JSON",
      "  --headful            Run Playwright headful instead of headless",
      "  -h, --help           Show this help",
    ].join("\n"),
  );
}

function hashText(text) {
  return crypto.createHash("sha256").update(text, "utf-8").digest("hex");
}

function boundedSubmissionArtifact(params) {
  const result = params.result ?? {};
  return {
    artifactKind: "openclaw.ux_prompt_submission.v1",
    sessionKey: params.sessionKey,
    submittedAt: new Date(params.submittedAtMs).toISOString(),
    promptHash: params.promptHash,
    promptLength: params.promptLength,
    promptSourceKind: params.promptSourceKind,
    waitFor: params.waitFor,
    result: {
      sessionKey: result.sessionKey ?? null,
      effectiveSessionKey: result.effectiveSessionKey ?? null,
      promptRun: result.promptRun
        ? {
            runId: result.promptRun.runId ?? null,
            method: result.promptRun.method ?? null,
            hasPromptHashMatch: result.promptRun.hasPromptHashMatch ?? null,
          }
        : null,
      completionEvidence: result.completionEvidence ?? null,
      summary: result.summary
        ? {
            transcriptGroupCount: result.summary.transcriptGroupCount ?? null,
            lastAssistantTextLength:
              typeof result.summary.lastAssistantText === "string"
                ? result.summary.lastAssistantText.length
                : 0,
          }
        : null,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const prompt = resolvePromptInput(options);
  if (!["terminal", "progress"].includes(options.waitFor)) {
    throw new Error(`unsupported --wait-for mode: ${options.waitFor}`);
  }
  const submittedAtMs = Date.now();
  const harness = await new OperatorBrowserHarness({ headless: options.headless }).start();
  try {
    const result = await harness.sendPrompt(prompt, {
      sessionKey: options.sessionKey,
      waitFor: options.waitFor,
      timeoutMs: options.timeoutMs,
    });
    const artifact = boundedSubmissionArtifact({
      sessionKey: options.sessionKey,
      submittedAtMs,
      promptHash: hashText(prompt),
      promptLength: prompt.length,
      promptSourceKind: options.promptFile ? "file" : options.promptStdin ? "stdin" : "argv",
      waitFor: options.waitFor,
      result,
    });
    if (options.artifact) {
      fs.mkdirSync(path.dirname(options.artifact), { recursive: true });
      fs.writeFileSync(options.artifact, `${JSON.stringify(artifact, null, 2)}\n`);
    }
    process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
  } finally {
    await harness.close();
  }
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
