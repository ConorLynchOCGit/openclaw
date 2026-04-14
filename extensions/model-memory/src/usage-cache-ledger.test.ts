import { describe, expect, it } from "vitest";
import { buildContextRunLedger } from "./usage-cache-ledger.ts";

describe("usage cache ledger", () => {
  it("records stable, semi-stable, and volatile hashes deterministically", () => {
    const first = buildContextRunLedger({
      sessionId: "session-001",
      agentId: "agent-main",
      provider: "openai",
      model: "gpt-5.4",
      stableSegments: [{ segmentType: "bootstrap", sourceKind: "projection", text: "stable" }],
      semiStableSegments: [{ segmentType: "user_pack", sourceKind: "artifact", text: "semi" }],
      volatileSegments: [{ segmentType: "recent_turns", sourceKind: "turns", text: "volatile" }],
    });
    const second = buildContextRunLedger({
      sessionId: "session-001",
      agentId: "agent-main",
      provider: "openai",
      model: "gpt-5.4",
      stableSegments: [{ segmentType: "bootstrap", sourceKind: "projection", text: "stable" }],
      semiStableSegments: [{ segmentType: "user_pack", sourceKind: "artifact", text: "semi" }],
      volatileSegments: [{ segmentType: "recent_turns", sourceKind: "turns", text: "volatile" }],
    });

    expect(first.run.stableLayerHash).toBe(second.run.stableLayerHash);
    expect(first.run.semiStableLayerHash).toBe(second.run.semiStableLayerHash);
    expect(first.run.volatileLayerHash).toBe(second.run.volatileLayerHash);
    expect(first.segments).toHaveLength(3);
  });
});
