import type { WorkboardCard } from "@openclaw/workboard-contract";
import { describe, expect, it, vi } from "vitest";
import {
  buildWorkboardHeartbeatContext,
  registerWorkboardHeartbeatContribution,
} from "./heartbeat-contribution.js";

function card(id: string, patch: Partial<WorkboardCard> = {}): WorkboardCard {
  return {
    id,
    title: `Card ${id}`,
    status: "todo",
    priority: "normal",
    labels: [],
    position: 1,
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  };
}

function contributionLines(context: string | undefined): string[] {
  return context?.split("\n").filter((line) => line.startsWith("- id=")) ?? [];
}

describe("Workboard heartbeat contribution", () => {
  it("selects and ranks the six requested attention classes", () => {
    const now = 10_000;
    const context = buildWorkboardHeartbeatContext(
      [
        card("high", { priority: "high" }),
        card("ordinary"),
        card("urgent", { priority: "urgent" }),
        card("future", {
          status: "scheduled",
          metadata: { automation: { scheduledAt: now + 1 } },
        }),
        card("due", {
          status: "scheduled",
          metadata: { automation: { scheduledAt: now } },
        }),
        card("stale", {
          status: "running",
          metadata: { stale: { detectedAt: now - 1, reason: "heartbeat elapsed" } },
        }),
        card("review", { status: "review" }),
        card("blocked", { status: "blocked" }),
        card("done", { status: "done", priority: "urgent" }),
        card("archived", {
          status: "blocked",
          metadata: { archivedAt: now - 1 },
        }),
      ],
      { agentId: "main", now },
    );

    expect(contributionLines(context)).toEqual([
      expect.stringContaining('id="blocked"'),
      expect.stringContaining('id="review"'),
      expect.stringContaining('id="stale"'),
      expect.stringContaining('id="due"'),
      expect.stringContaining('id="urgent"'),
      expect.stringContaining('id="high"'),
    ]);
    expect(context).toContain("nextOperatorAction=");
    expect(context).toContain("do not claim, dispatch, schedule, update, or otherwise mutate");
    expect(context).not.toContain('id="ordinary"');
    expect(context).not.toContain('id="future"');
    expect(context).not.toContain('id="done"');
    expect(context).not.toContain('id="archived"');
  });

  it("uses stale diagnostics and applies the strongest matching reason", () => {
    const context = buildWorkboardHeartbeatContext(
      [
        card("diagnostic", {
          status: "running",
          priority: "urgent",
          metadata: {
            diagnostics: [
              {
                kind: "running_without_heartbeat",
                severity: "warning",
                title: "Heartbeat overdue",
                detail: "No recent worker heartbeat.",
                firstSeenAt: 1,
                lastSeenAt: 2,
                count: 1,
                actions: [],
              },
            ],
          },
        }),
        card("due-urgent", {
          status: "scheduled",
          priority: "urgent",
          metadata: { automation: { scheduledAt: 2 } },
        }),
        card("blocked-high", { status: "blocked", priority: "high" }),
      ],
      { agentId: "main", now: 2 },
    );

    expect(context).toContain('id="diagnostic"');
    expect(context).toContain("reason=stale");
    expect(context).toContain('id="due-urgent"');
    expect(context).toContain("reason=due-scheduled");
    expect(context).toContain('id="blocked-high"');
    expect(context).toContain("reason=blocked");
  });

  it("respects agent scope and both contribution bounds", () => {
    const cards = [
      card("main", { status: "blocked", agentId: "main" }),
      card("unassigned", { status: "blocked" }),
      ...Array.from({ length: 20 }, (_, index) =>
        card(`coding-${index}`, {
          status: "review",
          agentId: "coding",
          title: `Review ${"long ".repeat(20)}${index}`,
        }),
      ),
    ];
    const context = buildWorkboardHeartbeatContext(cards, {
      agentId: "coding",
      maxItems: 3,
      maxChars: 1_200,
    });

    expect(context).not.toContain('id="main"');
    expect(context).not.toContain('id="unassigned"');
    expect(context?.length).toBeLessThanOrEqual(1_200);
    expect(contributionLines(context)).toHaveLength(3);
  });

  it("registers one native hook, reads once, and never calls mutation methods", async () => {
    type Handler = (event: { agentId?: string }) => Promise<{ appendContext?: string } | undefined>;
    let handler: Handler | undefined;
    const on = vi.fn((_name: string, registered: Handler) => {
      handler = registered;
    });
    const list = vi
      .fn()
      .mockResolvedValueOnce([card("main-card", { status: "blocked", agentId: "main" })])
      .mockResolvedValueOnce([]);
    const dispatch = vi.fn();
    const update = vi.fn();
    registerWorkboardHeartbeatContribution({
      api: { on } as never,
      store: { list, dispatch, update } as never,
    });

    expect(on).toHaveBeenCalledTimes(1);
    expect(on).toHaveBeenCalledWith("heartbeat_prompt_contribution", expect.any(Function));
    expect(handler).toBeTypeOf("function");

    const invoke = handler as Handler;
    await expect(invoke({ agentId: "main" })).resolves.toEqual({
      appendContext: expect.stringContaining('id="main-card"'),
    });
    await expect(invoke({ agentId: "main" })).resolves.toBeUndefined();
    expect(list).toHaveBeenCalledTimes(2);
    expect(dispatch).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
