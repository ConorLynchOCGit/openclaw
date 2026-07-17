import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  resolveAgentCompactionRuntimeConfig,
  resolveAgentCompactionRuntimePolicy,
} from "./agent-compaction-config.js";

describe("resolveAgentCompactionRuntimeConfig", () => {
  const cfg: OpenClawConfig = {
    agents: {
      defaults: {
        compaction: {
          keepRecentTokens: 12_000,
          midTurnPrecheck: { enabled: true },
          memoryFlush: { enabled: true, softThresholdTokens: 8_000 },
        },
      },
      list: [
        {
          id: "business-ops",
          compaction: {
            keepRecentTokens: 6_000,
            truncateAfterCompaction: true,
            maxActiveTranscriptBytes: "512kb",
            memoryFlush: { enabled: false },
          },
        },
        { id: "planning" },
      ],
    },
  };

  it("merges the active agent override over native defaults", () => {
    const result = resolveAgentCompactionRuntimeConfig({ cfg, agentId: "business-ops" });
    expect(result.agents?.defaults?.compaction).toMatchObject({
      keepRecentTokens: 6_000,
      midTurnPrecheck: { enabled: true },
      truncateAfterCompaction: true,
      maxActiveTranscriptBytes: "512kb",
      memoryFlush: { enabled: false, softThresholdTokens: 8_000 },
    });
  });

  it("leaves other agents on the original config object", () => {
    expect(resolveAgentCompactionRuntimeConfig({ cfg, agentId: "planning" })).toBe(cfg);
  });

  it("projects agent instructions into the effective native compaction policy", () => {
    const withInstructions: OpenClawConfig = {
      ...cfg,
      agents: {
        ...cfg.agents,
        list: [
          ...(cfg.agents?.list ?? []),
          {
            id: "reviewer",
            compaction: {
              recentTurnsPreserve: 1,
              customInstructions: "Preserve the terminal verdict and dispositions.",
            },
          },
        ],
      },
    };

    const result = resolveAgentCompactionRuntimePolicy({
      cfg: withInstructions,
      agentId: "reviewer",
    });

    expect(result.config.agents?.defaults?.compaction).toMatchObject({
      keepRecentTokens: 12_000,
      recentTurnsPreserve: 1,
    });
    expect(result.customInstructions).toBe("Preserve the terminal verdict and dispositions.");
  });

  it("keeps explicit call instructions authoritative over the agent default", () => {
    const result = resolveAgentCompactionRuntimePolicy({
      cfg: {
        agents: {
          defaults: { compaction: { customInstructions: "default" } },
        },
      },
      customInstructions: " explicit ",
    });

    expect(result.customInstructions).toBe("explicit");
  });
});
