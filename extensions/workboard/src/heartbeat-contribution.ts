import type { WorkboardCard } from "@openclaw/workboard-contract";
import type { OpenClawPluginApi } from "../api.js";
import type { WorkboardStore } from "./store.js";

const DEFAULT_MAX_ITEMS = 6;
const DEFAULT_MAX_CHARS = 3_500;

type HeartbeatReason =
  | "blocked"
  | "review"
  | "stale"
  | "due-scheduled"
  | "urgent"
  | "high-priority";

type HeartbeatCandidate = {
  card: WorkboardCard;
  reason: HeartbeatReason;
  nextOperatorAction: string;
  rank: number;
};

export type WorkboardHeartbeatProjectionOptions = {
  agentId?: string;
  now?: number;
  maxItems?: number;
  maxChars?: number;
};

function heartbeatCandidate(card: WorkboardCard, now: number): HeartbeatCandidate | undefined {
  if (card.status === "done" || card.metadata?.archivedAt) {
    return undefined;
  }
  if (card.status === "blocked") {
    return {
      card,
      reason: "blocked",
      nextOperatorAction: "Review the blocker and decide the operator-owned resolution.",
      rank: 0,
    };
  }
  if (card.status === "review") {
    return {
      card,
      reason: "review",
      nextOperatorAction: "Review the completion evidence and accept or return the work.",
      rank: 1,
    };
  }
  if (
    card.metadata?.stale ||
    card.metadata?.diagnostics?.some((diagnostic) =>
      ["running_without_heartbeat", "blocked_too_long", "orphaned_session"].includes(
        diagnostic.kind,
      ),
    )
  ) {
    return {
      card,
      reason: "stale",
      nextOperatorAction:
        "Inspect linked session or run evidence and decide whether operator intervention is needed.",
      rank: 2,
    };
  }
  const scheduledAt = card.metadata?.automation?.scheduledAt;
  if (card.status === "scheduled" && scheduledAt !== undefined && scheduledAt <= now) {
    return {
      card,
      reason: "due-scheduled",
      nextOperatorAction:
        "Review why the scheduled time elapsed and decide the next operator-owned step.",
      rank: 3,
    };
  }
  if (card.priority === "urgent") {
    return {
      card,
      reason: "urgent",
      nextOperatorAction: "Confirm the owner and choose the next bounded action.",
      rank: 4,
    };
  }
  if (card.priority === "high") {
    return {
      card,
      reason: "high-priority",
      nextOperatorAction: "Review the owner and next bounded action.",
      rank: 5,
    };
  }
  return undefined;
}

function cardIsInAgentScope(card: WorkboardCard, agentId: string | undefined): boolean {
  if (!agentId || agentId === "main") {
    return !card.agentId || card.agentId === agentId;
  }
  return card.agentId === agentId;
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.trunc(value)))
    : fallback;
}

function singleLine(value: string, maxChars: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maxChars);
}

function renderCandidate(candidate: HeartbeatCandidate): string {
  const card = candidate.card;
  return [
    `- id=${JSON.stringify(singleLine(card.id, 120))}`,
    `title=${JSON.stringify(singleLine(card.title, 180))}`,
    `owner=${JSON.stringify(singleLine(card.agentId ?? "unassigned", 120))}`,
    `status=${card.status}`,
    `priority=${card.priority}`,
    `reason=${candidate.reason}`,
    `nextOperatorAction=${JSON.stringify(candidate.nextOperatorAction)}`,
  ].join(" ");
}

export function buildWorkboardHeartbeatContext(
  cards: readonly WorkboardCard[],
  options: WorkboardHeartbeatProjectionOptions = {},
): string | undefined {
  const now = options.now ?? Date.now();
  const maxItems = boundedInteger(options.maxItems, DEFAULT_MAX_ITEMS, 1, 12);
  const maxChars = boundedInteger(options.maxChars, DEFAULT_MAX_CHARS, 512, 8_000);
  const candidates = cards
    .filter((card) => cardIsInAgentScope(card, options.agentId))
    .flatMap((card) => {
      const candidate = heartbeatCandidate(card, now);
      return candidate ? [candidate] : [];
    })
    .toSorted(
      (left, right) =>
        left.rank - right.rank ||
        left.card.updatedAt - right.card.updatedAt ||
        left.card.id.localeCompare(right.card.id),
    );
  if (candidates.length === 0) {
    return undefined;
  }

  const lines = [
    "## Workboard Commitments",
    "Read-only context. Surface these cards and their next operator action; do not claim, dispatch, schedule, update, or otherwise mutate Workboard cards.",
  ];
  for (const candidate of candidates.slice(0, maxItems)) {
    const line = renderCandidate(candidate);
    if ([...lines, line].join("\n").length > maxChars) {
      break;
    }
    lines.push(line);
  }
  return lines.length > 2 ? lines.join("\n") : undefined;
}

export function registerWorkboardHeartbeatContribution(params: {
  api: Pick<OpenClawPluginApi, "on">;
  store: Pick<WorkboardStore, "list">;
}): void {
  params.api.on("heartbeat_prompt_contribution", async (event) => {
    const context = buildWorkboardHeartbeatContext(await params.store.list(), {
      agentId: event.agentId,
    });
    return context ? { appendContext: context } : undefined;
  });
}
