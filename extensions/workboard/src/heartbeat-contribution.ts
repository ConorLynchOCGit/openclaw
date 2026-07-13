import type { OpenClawPluginApi } from "../api.js";
import type { WorkboardStore } from "./store.js";
import type { WorkboardCard } from "./types.js";

const DEFAULT_MAX_ITEMS = 6;
const DEFAULT_MAX_CHARS = 3_500;

type HeartbeatCandidate = {
  card: WorkboardCard;
  reason: "blocked" | "review" | "stale" | "target-window" | "scheduled-ready" | "priority";
  nextAction: string;
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
      nextAction: "Review the blocker, then unblock or revise the commitment.",
      rank: 0,
    };
  }
  if (card.status === "review") {
    return {
      card,
      reason: "review",
      nextAction: "Review completion evidence and accept or return the work.",
      rank: 1,
    };
  }
  if (
    card.metadata?.stale ||
    card.metadata?.diagnostics?.some((item) =>
      ["running_without_heartbeat", "blocked_too_long", "orphaned_session"].includes(item.kind),
    )
  ) {
    return {
      card,
      reason: "stale",
      nextAction: "Inspect linked execution evidence, then refresh or reassign the commitment.",
      rank: 2,
    };
  }
  const scheduledAt = card.metadata?.automation?.scheduledAt;
  if (card.status === "scheduled" && scheduledAt !== undefined && scheduledAt <= now) {
    return {
      card,
      reason: "scheduled-ready",
      nextAction: "Review the elapsed execution hold; scheduling remains owned by Workboard/cron.",
      rank: 3,
    };
  }
  if (card.metadata?.businessOpsPromotion?.targetWindow) {
    return {
      card,
      reason: "target-window",
      nextAction: "Review the target window and choose the next commitment action.",
      rank: 4,
    };
  }
  if (card.priority === "urgent" || card.priority === "high") {
    return {
      card,
      reason: "priority",
      nextAction: "Review priority, owner, and the next bounded action.",
      rank: card.priority === "urgent" ? 5 : 6,
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

function singleLine(value: string, maxChars: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maxChars);
}

function renderCandidate(candidate: HeartbeatCandidate): string {
  const card = candidate.card;
  const owner = card.agentId ?? card.metadata?.businessOpsPromotion?.ownerMode ?? "unassigned";
  const targetWindow = card.metadata?.businessOpsPromotion?.targetWindow ?? "none";
  return [
    `- id=${card.id}`,
    `title=${JSON.stringify(singleLine(card.title, 180))}`,
    `owner=${owner}`,
    `status=${card.status}`,
    `targetWindow=${JSON.stringify(singleLine(targetWindow, 160))}`,
    `reason=${candidate.reason}`,
    `next=${JSON.stringify(candidate.nextAction)}`,
  ].join(" ");
}

export function buildWorkboardHeartbeatContext(
  cards: readonly WorkboardCard[],
  options: WorkboardHeartbeatProjectionOptions = {},
): string | undefined {
  const now = options.now ?? Date.now();
  const maxItems = Math.max(1, Math.min(12, Math.trunc(options.maxItems ?? DEFAULT_MAX_ITEMS)));
  const maxChars = Math.max(
    512,
    Math.min(8_000, Math.trunc(options.maxChars ?? DEFAULT_MAX_CHARS)),
  );
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
    "Read-only context. Do not claim, dispatch, schedule, or mutate cards from this contribution.",
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
