import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  estimatePostCompactionLedgerRepairTokens,
  isNoRealConversationCompactionSkip,
} from "./compaction-token-repair.js";

describe("compaction token ledger repair", () => {
  let rootDir = "";

  afterEach(async () => {
    if (rootDir) {
      await fs.rm(rootDir, { recursive: true, force: true });
      rootDir = "";
    }
  });

  async function writeTranscript(lines: unknown[]) {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-compaction-ledger-"));
    const sessionFile = path.join(rootDir, "session.jsonl");
    await fs.writeFile(
      sessionFile,
      lines.map((line) => JSON.stringify(line)).join("\n") + "\n",
      "utf8",
    );
    return sessionFile;
  }

  it("prefers explicit tokensAfter from the latest compaction entry", async () => {
    const sessionFile = await writeTranscript([
      { type: "compaction", id: "old", tokensAfter: 42_000 },
      { type: "compaction", id: "new", tokensAfter: 12_000 },
    ]);

    expect(estimatePostCompactionLedgerRepairTokens(sessionFile)).toEqual({
      tokensAfter: 12_000,
      source: "compaction_tokens_after",
      compactionEntryId: "new",
    });
  });

  it("estimates bounded tokens from a summary when tokensAfter is absent", async () => {
    const sessionFile = await writeTranscript([
      {
        type: "compaction",
        id: "summary-only",
        summary: "bounded summary ".repeat(200),
      },
    ]);

    const estimate = estimatePostCompactionLedgerRepairTokens(sessionFile);
    expect(estimate).toMatchObject({
      source: "compaction_summary_estimate",
      compactionEntryId: "summary-only",
      summaryChars: expect.any(Number),
    });
    expect(estimate?.tokensAfter).toBeGreaterThan(20_000);
  });

  it("recognizes no-real-conversation compaction skips", () => {
    expect(isNoRealConversationCompactionSkip("no real conversation messages")).toBe(true);
    expect(isNoRealConversationCompactionSkip("below threshold")).toBe(false);
  });
});
