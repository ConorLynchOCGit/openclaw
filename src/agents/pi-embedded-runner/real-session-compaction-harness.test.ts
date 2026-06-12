import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  classifyPreSubmitPressure,
  estimatePrePromptTokens,
  resolveContextPressureBudget,
} from "../../context-engine/pressure/index.js";
import { stripToolResultDetails } from "../session-transcript-repair.js";
import {
  estimateToolResultReductionPotential,
  projectMessagesForCompactionInput,
} from "./tool-result-truncation.js";

const REAL_SESSION_PATH = path.resolve(
  process.cwd(),
  ".openclaw/runtime/agents/execution-coding/sessions/nrun_377bd8ba1abdebf8fb81.jsonl",
);

function readRealSessionMessages(): AgentMessage[] {
  const session = SessionManager.open(REAL_SESSION_PATH);
  return session
    .getBranch()
    .flatMap((entry): AgentMessage[] => (entry.type === "message" ? [entry.message] : []));
}

function textContent(message: AgentMessage): string {
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((block) => {
      if (!block || typeof block !== "object") {
        return "";
      }
      const text = (block as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .filter((text) => text.length > 0)
    .join("\n");
}

function providerVisibleTextChars(messages: AgentMessage[]): {
  total: number;
  toolText: number;
  likelySourceOrLocator: number;
} {
  let total = 0;
  let toolText = 0;
  let likelySourceOrLocator = 0;
  for (const message of messages) {
    const text = textContent(message);
    total += text.length;
    if ((message as { role?: unknown }).role === "toolResult") {
      toolText += text.length;
      if (
        text.includes("<path>") ||
        text.includes("<content>") ||
        /^\d+:/mu.test(text) ||
        /(?:^|\n).+:\d+:/u.test(text)
      ) {
        likelySourceOrLocator += text.length;
      }
    }
  }
  return { total, toolText, likelySourceOrLocator };
}

describe("real session compaction harness", () => {
  it.skipIf(!fs.existsSync(REAL_SESSION_PATH))(
    "does not pre-submit compact the recorded Kimi session under a 262K budget",
    () => {
      const messages = stripToolResultDetails(readRealSessionMessages());
      const estimatedPromptTokens = estimatePrePromptTokens({
        messages,
        systemPrompt: "implementation worker system prompt",
        prompt: "continue the Work Queue delta implementation node",
      });
      const contextTokenBudget = 262_144;
      const budget = resolveContextPressureBudget({
        contextWindowTokens: contextTokenBudget,
        reserveTokens: 20_000,
      });
      const toolResultPotential = estimateToolResultReductionPotential({
        messages,
        contextWindowTokens: contextTokenBudget,
      });
      const decision = classifyPreSubmitPressure({
        messages,
        systemPrompt: "implementation worker system prompt",
        prompt: "continue the Work Queue delta implementation node",
        budget,
        pruneReducibleChars: toolResultPotential.maxReducibleChars,
        emergencyOnly: true,
      });

      expect(estimatedPromptTokens).toBeGreaterThan(0);
      expect(decision.route).toBe("fits");
      expect(decision.shouldCompact).toBe(false);
      expect(decision.trigger).toBeNull();
    },
  );

  it.skipIf(!fs.existsSync(REAL_SESSION_PATH))(
    "strips non-model-useful details and preserves source-shaped tool text for compaction input",
    () => {
      const messages = readRealSessionMessages();
      const stripped = stripToolResultDetails(messages);
      expect(JSON.stringify(stripped)).not.toContain('"details"');

      const before = providerVisibleTextChars(stripped);
      const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-compaction-harness-"));
      const projected = projectMessagesForCompactionInput({
        messages: stripped,
        stateRoot,
        sessionKey: "agent:execution-coding:node:nrun_377bd8ba1abdebf8fb81",
      });
      const after = providerVisibleTextChars(projected.messages);

      expect(before.total).toBeGreaterThan(0);
      expect(before.toolText).toBeGreaterThan(0);
      expect(before.likelySourceOrLocator).toBeGreaterThan(0);
      expect(projected.projectedCount).toBeGreaterThan(0);
      expect(after.total).toBeLessThan(before.total);
      expect(after.likelySourceOrLocator).toBeGreaterThan(0);
    },
  );
});
