import fs from "node:fs";
import { normalizeOptionalString } from "../../shared/string-coerce.js";
import { estimateTokensFromChars } from "../../utils/cjk-chars.js";

const POST_COMPACTION_LEDGER_OVERHEAD_TOKENS = 20_000;

function estimateSummaryTokens(summary: string): number | undefined {
  const tokens = estimateTokensFromChars(summary.length);
  if (!Number.isFinite(tokens) || tokens <= 0) {
    return undefined;
  }
  return Math.ceil(tokens) + POST_COMPACTION_LEDGER_OVERHEAD_TOKENS;
}

function isPositiveTokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export type PostCompactionLedgerRepairEstimate = {
  tokensAfter: number;
  source: "compaction_tokens_after" | "compaction_summary_estimate";
  compactionEntryId?: string;
  summaryChars?: number;
};

export function estimatePostCompactionLedgerRepairTokens(
  sessionFile: string | undefined,
): PostCompactionLedgerRepairEstimate | undefined {
  const file = normalizeOptionalString(sessionFile);
  if (!file || !fs.existsSync(file)) {
    return undefined;
  }

  let latest: unknown;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as { type?: unknown };
      if (parsed.type === "compaction") {
        latest = parsed;
      }
    } catch {
      continue;
    }
  }

  if (!latest || typeof latest !== "object") {
    return undefined;
  }
  const entry = latest as {
    id?: unknown;
    tokensAfter?: unknown;
    result?: { tokensAfter?: unknown };
    summary?: unknown;
  };
  const compactionEntryId = typeof entry.id === "string" ? entry.id : undefined;
  const tokensAfter = isPositiveTokenCount(entry.tokensAfter)
    ? Math.floor(entry.tokensAfter)
    : isPositiveTokenCount(entry.result?.tokensAfter)
      ? Math.floor(entry.result.tokensAfter)
      : undefined;
  if (tokensAfter !== undefined) {
    return {
      tokensAfter,
      source: "compaction_tokens_after",
      compactionEntryId,
    };
  }

  const summary = normalizeOptionalString(entry.summary);
  if (!summary) {
    return undefined;
  }
  const estimated = estimateSummaryTokens(summary);
  if (estimated === undefined) {
    return undefined;
  }
  return {
    tokensAfter: estimated,
    source: "compaction_summary_estimate",
    compactionEntryId,
    summaryChars: summary.length,
  };
}

export function isNoRealConversationCompactionSkip(reason: unknown): boolean {
  return (
    typeof reason === "string" && reason.toLowerCase().includes("no real conversation messages")
  );
}
