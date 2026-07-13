import { describe, expect, it, vi } from "vitest";
import {
  buildWorkboardHeartbeatContext,
  registerWorkboardHeartbeatContribution,
} from "./heartbeat-contribution.js";
import type { WorkboardCard } from "./types.js";

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

describe("Workboard Heartbeat contribution", () => {
  it("surfaces eligible commitments and excludes ordinary or completed cards", () => {
    const context = buildWorkboardHeartbeatContext(
      [
        card("blocked", { status: "blocked", title: "Resolve source blocker" }),
        card("review", { status: "review", title: "Review final evidence" }),
        card("target", {
          metadata: {
            businessOpsPromotion: {
              candidateId: "candidate-1",
              projectRef: "business-ops/projects/example",
              ownerMode: "human",
              decisionBoundary: "operator review",
              promotedBy: "operator",
              promotedAt: 1,
              approvalNote: "approved",
              targetWindow: "next investor update",
            },
          },
        }),
        card("ordinary"),
        card("done", { status: "done", priority: "urgent" }),
      ],
      { agentId: "main", now: 10 },
    );

    expect(context).toContain("Resolve source blocker");
    expect(context).toContain("Review final evidence");
    expect(context).toContain("next investor update");
    expect(context).not.toContain("Card ordinary");
    expect(context).not.toContain("Card done");
    expect(context).toContain("Do not claim, dispatch, schedule, or mutate");
  });

  it("respects agent scope and remains bounded", () => {
    const cards = [
      card("main", { status: "blocked", agentId: "main" }),
      card("coding", { status: "blocked", agentId: "coding" }),
      card("unassigned", { status: "blocked" }),
      ...Array.from({ length: 20 }, (_, index) =>
        card(`many-${index}`, { status: "review", agentId: "coding" }),
      ),
    ];
    const context = buildWorkboardHeartbeatContext(cards, {
      agentId: "coding",
      maxItems: 3,
      maxChars: 900,
    });

    expect(context).toContain("id=coding");
    expect(context).not.toContain("id=main");
    expect(context).not.toContain("id=unassigned");
    expect(context?.length).toBeLessThanOrEqual(900);
    expect(context?.split("\n").filter((line) => line.startsWith("- id="))).toHaveLength(3);
  });

  it("registers one read-only native hook and returns no context for an empty board", async () => {
    let handler: ((event: { agentId?: string }) => Promise<unknown>) | undefined;
    const on = vi.fn((_name, registered) => {
      handler = registered;
    });
    const list = vi.fn().mockResolvedValue([]);
    registerWorkboardHeartbeatContribution({ api: { on } as never, store: { list } as never });

    expect(on).toHaveBeenCalledWith("heartbeat_prompt_contribution", expect.any(Function));
    await expect(handler?.({ agentId: "main" })).resolves.toBeUndefined();
    expect(list).toHaveBeenCalledTimes(1);
  });
});
