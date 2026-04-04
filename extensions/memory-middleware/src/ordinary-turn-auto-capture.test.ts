import { describe, expect, it, vi } from "vitest";
import type { MemoryMiddlewareConfig } from "./config.js";
import {
  createOrdinaryTurnAutoCaptureController,
  createOrdinaryTurnAutoCaptureHandler,
  parseAutoCaptureManagedCandidateContent,
  parseOrdinaryTurnAutoCapturePreference,
} from "./ordinary-turn-auto-capture.js";

function createUnusedCandidateIngress() {
  return {
    submitLearning: vi.fn(async () => ({
      accepted: false as const,
      status: "disabled" as const,
      kind: "learning" as const,
      reason: "unused",
    })),
    submitCorrectionSuggestion: vi.fn(async () => ({
      accepted: false as const,
      status: "disabled" as const,
      kind: "correction" as const,
      reason: "unused",
    })),
    submitProcedureSuggestion: vi.fn(async () => ({
      accepted: false as const,
      status: "disabled" as const,
      kind: "procedure" as const,
      reason: "unused",
    })),
    submitImprovementNote: vi.fn(async () => ({
      accepted: false as const,
      status: "disabled" as const,
      kind: "improvement" as const,
      reason: "unused",
    })),
  };
}

function createConfig(): MemoryMiddlewareConfig {
  return {
    database: {
      driver: "postgres",
      schema: "memory_middleware",
      url: "postgres://user:pass@example.com/db",
    },
    candidateIngress: {
      mode: "submit-review-only",
    },
    memoryObjectQuery: {
      mode: "read-only",
    },
    backgroundJobs: {
      inspectionMode: "disabled",
      advisorySchedulingMode: "disabled",
      executeSchedulingMode: "disabled",
      advisoryJobClasses: ["proactive_plan"],
      executeJobClasses: ["proactive_execute_run_drift_check"],
    },
    autoCapture: {
      profile: "user-preference-v1",
      allowedAgents: ["chief", "main"],
    },
  };
}

describe("parseOrdinaryTurnAutoCapturePreference", () => {
  it("matches a narrow explicit preference statement", () => {
    expect(
      parseOrdinaryTurnAutoCapturePreference("My preferred test tea is jasmine."),
    ).toMatchObject({
      profile: "user-preference-v1",
      template: "my_preferred_is",
      subject: "test tea",
      value: "jasmine",
      content: "User preference: preferred test tea is jasmine.",
    });
  });

  it("matches transcript text with a leading timestamp prefix", () => {
    expect(
      parseOrdinaryTurnAutoCapturePreference(
        "[Sat 2026-04-04 15:05 UTC] My preferred validation tea is jasmine silver needle.",
      ),
    ).toMatchObject({
      profile: "user-preference-v1",
      template: "my_preferred_is",
      subject: "validation tea",
      value: "jasmine silver needle",
    });
  });

  it("rejects explicit memory requests", () => {
    expect(
      parseOrdinaryTurnAutoCapturePreference("Remember that my preferred tea is jasmine."),
    ).toBeNull();
  });

  it("rejects procedure-like subjects", () => {
    expect(
      parseOrdinaryTurnAutoCapturePreference("My favorite workflow is running approvals first."),
    ).toBeNull();
  });

  it("rejects sensitive values", () => {
    expect(parseOrdinaryTurnAutoCapturePreference("My preferred token is abc123.")).toBeNull();
  });

  it("parses managed candidate content for the same bounded preference class", () => {
    expect(
      parseAutoCaptureManagedCandidateContent("User's favorite proof herb is lemon verbena gold."),
    ).toMatchObject({
      profile: "user-preference-v1",
      template: "my_favorite_is",
      subject: "proof herb",
      value: "lemon verbena gold",
    });
  });
});

describe("createOrdinaryTurnAutoCaptureHandler", () => {
  it("submits a bounded candidate for a matching user turn", async () => {
    const submitLearning = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "learning" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-1",
      memoryObjectId: "memory-1",
    }));
    const handler = createOrdinaryTurnAutoCaptureHandler({
      config: createConfig(),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      candidateIngress: createUnusedCandidateIngress(),
      deps: {
        findExistingByKey: vi.fn(async () => null),
        resolveAttribution: vi.fn(async () => ({
          agentId: "agent-uuid-1",
          sessionId: "session-uuid-1",
        })),
        submitLearning,
      },
    });

    await handler({
      sessionFile: "/root/.openclaw/agents/main/sessions/example.jsonl",
      sessionKey: "agent:main:main",
      message: {
        role: "user",
        content: "My preferred test tea is jasmine.",
        timestamp: Date.parse("2026-04-04T12:00:00Z"),
      },
    });

    expect(submitLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent-uuid-1",
        sessionId: "session-uuid-1",
        content: "User preference: preferred test tea is jasmine.",
        metadata: expect.objectContaining({
          autoCapture: expect.objectContaining({
            profile: "user-preference-v1",
            template: "my_preferred_is",
            subject: "test tea",
            value: "jasmine",
            agentExternalKey: "main",
            sessionKey: "agent:main:main",
          }),
        }),
      }),
    );
  });

  it("skips disallowed agents and duplicate keys", async () => {
    const submitLearning = vi.fn();
    const handler = createOrdinaryTurnAutoCaptureHandler({
      config: createConfig(),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      candidateIngress: createUnusedCandidateIngress(),
      deps: {
        findExistingByKey: vi.fn(async () => ({
          id: "memory-1",
          reviewState: "candidate",
        })),
        resolveAttribution: vi.fn(),
        submitLearning,
      },
    });

    await handler({
      sessionFile: "/root/.openclaw/agents/chief/sessions/example.jsonl",
      sessionKey: "agent:chief:main",
      message: {
        role: "user",
        content: "My favorite color is orange.",
      },
    });

    await handler({
      sessionFile: "/root/.openclaw/agents/builder/sessions/example.jsonl",
      sessionKey: "agent:builder:main",
      message: {
        role: "user",
        content: "My favorite color is orange.",
      },
    });

    expect(submitLearning).not.toHaveBeenCalled();
  });
});

describe("createOrdinaryTurnAutoCaptureController", () => {
  it("subscribes only when the profile is enabled", () => {
    const subscribe = vi.fn(() => vi.fn());
    const controller = createOrdinaryTurnAutoCaptureController({
      config: createConfig(),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      candidateIngress: createUnusedCandidateIngress(),
      subscribe,
      deps: {
        findExistingByKey: vi.fn(async () => null),
        resolveAttribution: vi.fn(async () => null),
        submitLearning: vi.fn(),
      },
    });

    controller.start();
    controller.stop();

    expect(subscribe).toHaveBeenCalledTimes(1);
  });
});
