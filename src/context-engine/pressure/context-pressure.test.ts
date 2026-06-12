import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it, vi } from "vitest";
import { registerContextEngine } from "../registry.js";
import { resolveContextRuntime } from "../runtime.js";
import type { CompactResult, ContextEngine } from "../types.js";
import {
  CONTEXT_PRESSURE_DECISION_EVENT_TYPE,
  createContextPressureController,
  executionNodeContinuationStrategy,
  renderContinuationPacket,
  resolveContextPressureBudget,
  shouldPreferActualUsageCompaction,
  usageSnapshotFromNormalizedUsage,
} from "./index.js";

let counter = 1;

function makeMessage(text: string): AgentMessage {
  return {
    role: "toolResult",
    toolCallId: `call_${counter}`,
    toolName: "read",
    content: [{ type: "text", text }],
    isError: false,
    timestamp: counter++,
  } as AgentMessage;
}

function makeEngine(params?: {
  id?: string;
  compact?: (args: Record<string, unknown>) => Promise<CompactResult>;
}): ContextEngine {
  return {
    info: { id: params?.id ?? `test-engine-${counter++}`, name: "Test Context Engine" },
    async ingest() {
      return { ingested: true };
    },
    async assemble(assembleParams) {
      return { messages: assembleParams.messages, estimatedTokens: 0 };
    },
    async compact(args) {
      if (params?.compact) {
        return params.compact(args as Record<string, unknown>);
      }
      return {
        ok: true,
        compacted: true,
        result: {
          summary: "summary",
          tokensBefore: 100,
          tokensAfter: 40,
        },
      };
    },
  };
}

describe("context pressure runtime", () => {
  it("resolves context runtime with engine and pressure controller", async () => {
    const engineId = `pressure-runtime-${Date.now()}-${counter++}`;
    registerContextEngine(engineId, () => makeEngine({ id: engineId }));

    const runtime = await resolveContextRuntime({
      plugins: { slots: { contextEngine: engineId } },
    });

    expect(runtime.engine.info.id).toBe(engineId);
    expect(runtime.engine.info.contextPolicy).toEqual({
      summarization: "engine",
      pressure: "openclaw",
    });
    expect(typeof runtime.pressure.beforeSubmit).toBe("function");
    expect(typeof runtime.pressure.afterTurn).toBe("function");
    expect(typeof runtime.pressure.recover).toBe("function");
  });

  it("uses bounded reserve math for context pressure budgets", () => {
    expect(
      resolveContextPressureBudget({ contextWindowTokens: 16_000, reserveTokens: 20_000 }),
    ).toEqual({
      contextWindowTokens: 16_000,
      reserveTokens: 8_000,
      usableTokens: 8_000,
    });
  });

  it("keeps modest estimate-only overflow proceeding in emergency-only mode", async () => {
    const pressure = createContextPressureController();
    const outcome = await pressure.beforeSubmit({
      messages: [makeMessage("token-ish content ".repeat(16_000))],
      systemPrompt: "sys",
      prompt: "hello",
      contextWindowTokens: 100_000,
      reserveTokens: 45_000,
      preferActualUsageCompaction: true,
      pruneReducibleChars: 0,
    });

    expect(outcome.action).toBe("proceed");
    expect(outcome.decision.action).toBe("proceed");
    expect(outcome.decision.estimate?.emergencyOnly).toBe(true);
  });

  it("routes pre-submit truncate-only pressure through prune_retry", async () => {
    const pressure = createContextPressureController();
    const prune = vi.fn(() => ({ truncated: true, truncatedCount: 2 }));

    const outcome = await pressure.beforeSubmit({
      messages: [makeMessage("source line\n".repeat(8_000))],
      systemPrompt: "sys",
      prompt: "hello",
      contextWindowTokens: 1_000,
      reserveTokens: 100,
      pruneReducibleChars: 10_000_000,
      truncateToolResults: prune,
    });

    expect(prune).toHaveBeenCalledTimes(1);
    expect(outcome.action).toBe("prune_retry");
    expect(outcome.decision.prune?.truncatedCount).toBe(2);
  });

  it("runs prune before summary recovery", async () => {
    const pressure = createContextPressureController();
    const order: string[] = [];
    const compact = vi.fn(async () => {
      order.push("compact");
      return { ok: true, compacted: true, result: { tokensBefore: 10, tokensAfter: 5 } };
    });
    const outcome = await pressure.recover({
      trigger: "provider_overflow",
      sessionId: "s",
      sessionFile: "/tmp/session.jsonl",
      contextEngine: makeEngine({ compact }),
      contextWindowTokens: 10_000,
      prune: async () => {
        order.push("prune");
        return { truncated: false, reason: "none" };
      },
    });

    expect(outcome.action).toBe("summary_retry");
    expect(order).toEqual(["prune", "compact"]);
    expect(compact).toHaveBeenCalledTimes(1);
  });

  it("does not summarize after a successful prune", async () => {
    const pressure = createContextPressureController();
    const compact = vi.fn(async () => ({
      ok: true,
      compacted: true,
      result: { tokensBefore: 10, tokensAfter: 5 },
    }));
    const outcome = await pressure.recover({
      trigger: "timeout_high_usage",
      sessionId: "s",
      sessionFile: "/tmp/session.jsonl",
      contextEngine: makeEngine({ compact }),
      contextWindowTokens: 10_000,
      prune: async () => ({ truncated: true, truncatedCount: 1 }),
    });

    expect(outcome.action).toBe("prune_retry");
    expect(compact).not.toHaveBeenCalled();
  });

  it("uses provider prompt tokens for actual-usage pressure", async () => {
    const pressure = createContextPressureController();
    const compact = vi.fn(async () => ({
      ok: true,
      compacted: true,
      result: { tokensBefore: 10_000, tokensAfter: 4_000 },
    }));
    const outcome = await pressure.afterTurn({
      sessionId: "s",
      sessionFile: "/tmp/session.jsonl",
      contextEngine: makeEngine({ compact }),
      contextWindowTokens: 1_000,
      usage: { source: "provider", promptTokens: 950, totalTokens: 1_200 },
      prune: async () => ({ truncated: false }),
    });

    expect(outcome.action).toBe("summary_retry");
    expect(compact).toHaveBeenCalledTimes(1);
    expect(outcome.decision.usage?.promptTokens).toBe(950);
  });

  it("leaves actual-usage turn alone when provider prompt tokens fit", async () => {
    const pressure = createContextPressureController();
    const compact = vi.fn();
    const outcome = await pressure.afterTurn({
      sessionId: "s",
      sessionFile: "/tmp/session.jsonl",
      contextEngine: makeEngine({ compact }),
      contextWindowTokens: 1_000,
      usage: { source: "provider", promptTokens: 500 },
    });

    expect(outcome.action).toBe("proceed");
    expect(compact).not.toHaveBeenCalled();
  });

  it("builds constrained execution continuation packets", async () => {
    const packet = await executionNodeContinuationStrategy.build({
      trigger: "actual_usage",
      objective: "fix the node",
      nodeTrace: {
        changedFiles: ["src/a.ts"],
        firstEditLine: 42,
        latestDiagnostics: ["src/a.ts:42: missing symbol"],
      },
      readSourceWindow: async ({ path, line }) => `${line}: const value = 1; // ${path}`,
    });
    const rendered = renderContinuationPacket(packet);

    expect(packet.changedFiles).toEqual(["src/a.ts"]);
    expect(packet.sourceWindows?.[0]?.content).toContain("const value");
    expect(rendered).toContain("<repair_windows>");
    expect(rendered).not.toContain("file_graph");
    expect(rendered).not.toContain("workingContext");
  });

  it("emits one canonical telemetry event with optional fields omitted when absent", async () => {
    const pressure = createContextPressureController();
    const events: Record<string, unknown>[] = [];
    await pressure.afterTurn({
      sessionId: "s",
      sessionFile: "/tmp/session.jsonl",
      contextEngine: makeEngine(),
      contextWindowTokens: 1_000,
      usage: { source: "provider", promptTokens: 100 },
      emit: (event) => {
        events.push(event);
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe(CONTEXT_PRESSURE_DECISION_EVENT_TYPE);
    expect(events[0]?.trigger).toBe("actual_usage");
    expect(events[0]?.action).toBe("proceed");
    expect(events[0]).not.toHaveProperty("route");
    expect(events[0]).not.toHaveProperty("triggerReason");
  });

  it("detects OpenRouter/Kimi paths as actual-usage-preferred", () => {
    expect(
      shouldPreferActualUsageCompaction({
        provider: "openrouter",
        modelId: "moonshotai/kimi-k2.6",
        model: {},
      }),
    ).toBe(true);
    expect(
      shouldPreferActualUsageCompaction({
        provider: "kimi",
        modelId: "kimi/kimi-for-coding",
        model: {},
      }),
    ).toBe(true);
    expect(
      shouldPreferActualUsageCompaction({
        provider: "local",
        modelId: "other",
        model: { compat: { supportsUsageInStreaming: true } },
      }),
    ).toBe(true);
  });

  it("normalizes usage snapshots for pressure decisions", () => {
    expect(
      usageSnapshotFromNormalizedUsage({ input: 10, cacheRead: 5, cacheWrite: 2, total: 30 }),
    ).toEqual({
      source: "provider",
      promptTokens: 17,
      totalTokens: 30,
      cacheRead: 5,
      cacheWrite: 2,
    });
  });
});
