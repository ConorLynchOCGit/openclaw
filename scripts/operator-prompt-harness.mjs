#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_MAIN_SESSION_ALIAS,
  OperatorBrowserHarness,
} from "./lib/operator-browser-harness.mjs";

function parseArgs(argv) {
  const options = {
    sessionKey: DEFAULT_MAIN_SESSION_ALIAS,
    prompt: null,
    promptFile: null,
    promptStdin: false,
    waitFor: "terminal",
    json: false,
    headless: true,
    timeoutMs: undefined,
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
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--timeout") {
      const raw = argv[index + 1];
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.timeoutMs = parsed;
      }
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
      "Usage: node scripts/operator-prompt-harness.mjs --session <session-key> (--prompt <text> | --prompt-file <path> | --stdin) [options]",
      "",
      "Options:",
      "  --session <key>      Session alias or canonical session key. Default: main",
      "  --prompt <text>      Prompt to send through the authenticated Control UI",
      "  --prompt-file <path> Read prompt bytes from a UTF-8 file; safest for long prompts/code fences",
      "  --stdin              Read prompt bytes from stdin; safest for generated prompts",
      "  --wait-for <mode>    terminal | progress. Default: terminal",
      "  --timeout <ms>       Wait timeout in milliseconds for prompt completion/progress",
      "  --json               Emit structured JSON",
      "  --headful            Run Playwright headful instead of headless",
      "  -h, --help           Show this help",
    ].join("\n"),
  );
}

export function resolvePromptInput(options) {
  const sources = [
    typeof options.prompt === "string" ? "prompt" : null,
    typeof options.promptFile === "string" ? "prompt-file" : null,
    options.promptStdin ? "stdin" : null,
  ].filter(Boolean);
  if (sources.length !== 1) {
    throw new Error("exactly one prompt source is required: --prompt, --prompt-file, or --stdin");
  }
  if (typeof options.promptFile === "string") {
    return fs.readFileSync(options.promptFile, "utf-8");
  }
  if (options.promptStdin) {
    return fs.readFileSync(0, "utf-8");
  }
  return options.prompt;
}

function renderTextResult(result) {
  const selected = result.after?.selectorOptions?.find((entry) => entry.selected) ?? null;
  const lastTwo = Array.isArray(result.after?.transcriptGroups)
    ? result.after.transcriptGroups.slice(-2)
    : [];
  return [
    `session: ${result.sessionKey}`,
    `selected: ${selected?.label ?? "(unknown)"}`,
    `prompt: ${result.prompt}`,
    `assistant: ${result.summary?.lastAssistantText ?? ""}`,
    `groups: ${result.summary?.transcriptGroupCount ?? 0}`,
    "",
    ...lastTwo.map(
      (group) => `[${group.roleClass}] ${group.senderName || "unknown"}: ${group.text || ""}`,
    ),
  ].join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    process.exit(0);
  }
  let prompt;
  try {
    prompt = resolvePromptInput(options);
  } catch (error) {
    printHelp();
    process.stderr.write(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
  if (!["terminal", "progress"].includes(options.waitFor)) {
    throw new Error(`unsupported --wait-for mode: ${options.waitFor}`);
  }

  const harness = await new OperatorBrowserHarness({ headless: options.headless }).start();
  try {
    const result = await harness.sendPrompt(prompt, {
      sessionKey: options.sessionKey,
      waitFor: options.waitFor,
      timeoutMs: options.timeoutMs,
    });
    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    process.stdout.write(`${renderTextResult(result)}\n`);
  } finally {
    await harness.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
