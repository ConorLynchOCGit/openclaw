import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
      profile: "user-preference-v2",
      allowedAgents: ["chief", "main"],
    },
    autoPromotion: {
      profile: "explicit-user-preference-v1",
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
      captureClass: "explicit_preference",
      candidateKind: "learning",
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
      captureClass: "explicit_preference",
      template: "my_preferred_is",
      subject: "validation tea",
      value: "jasmine silver needle",
    });
  });

  it("matches gateway chat text with the sender metadata prelude", () => {
    expect(
      parseOrdinaryTurnAutoCapturePreference(
        [
          "Sender (untrusted metadata):",
          "```json",
          "{",
          '  "label": "openclaw-tui"',
          "}",
          "```",
          "",
          "[Sat 2026-04-04 17:39 UTC] My favorite proof infusion is cedar mint ember.",
        ].join("\n"),
        "user-preference-v2",
      ),
    ).toMatchObject({
      profile: "user-preference-v2",
      captureClass: "explicit_preference",
      template: "my_favorite_is",
      subject: "proof infusion",
      value: "cedar mint ember",
    });
  });

  it("matches a bounded correction form only in the broader profile", () => {
    expect(
      parseOrdinaryTurnAutoCapturePreference(
        "Actually, my favorite proof seed is fennel aurora.",
        "user-preference-v2",
      ),
    ).toMatchObject({
      profile: "user-preference-v2",
      captureClass: "preference_correction",
      candidateKind: "correction",
      reasonCode: "explicit_preference_correction",
      template: "my_favorite_is",
      subject: "proof seed",
      value: "fennel aurora",
    });
    expect(
      parseOrdinaryTurnAutoCapturePreference(
        "Actually, my favorite proof seed is fennel aurora.",
        "user-preference-v1",
      ),
    ).toBeNull();
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
      profile: "user-preference-v2",
      captureClass: "explicit_preference",
      template: "my_favorite_is",
      subject: "proof herb",
      value: "lemon verbena gold",
    });
  });

  it("parses the live tool-submitted preference phrasing", () => {
    expect(
      parseAutoCaptureManagedCandidateContent(
        "User preference stated explicitly: preferred slice three copper lantern is juniper amber tide.",
      ),
    ).toMatchObject({
      profile: "user-preference-v2",
      captureClass: "explicit_preference",
      template: "my_preferred_is",
      subject: "slice three copper lantern",
      value: "juniper amber tide",
    });
  });

  it("parses the live tool-submitted preference phrasing when the value is quoted", () => {
    expect(
      parseAutoCaptureManagedCandidateContent(
        'User preference: preferred slice three silver compass is "cypress ember rain".',
      ),
    ).toMatchObject({
      profile: "user-preference-v2",
      captureClass: "explicit_preference",
      template: "my_preferred_is",
      subject: "slice three silver compass",
      value: "cypress ember rain",
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
    const reviewCandidate = vi.fn(async () => ({
      accepted: true as const,
      status: "recorded" as const,
      candidateId: "memory-1",
      outcome: "accepted" as const,
      reviewId: "review-1",
      memoryObjectStateChanged: false,
      reviewState: "candidate" as const,
    }));
    const promoteToMemory = vi.fn(async () => ({
      accepted: true as const,
      status: "promoted" as const,
      candidateId: "memory-1",
      promotedMemoryObjectId: "approved-1",
      promotedMemoryKind: "project" as const,
      promotedReviewState: "approved" as const,
      sourceEventId: "event-1",
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
        submitCorrectionSuggestion: vi.fn(),
        reviewCandidate,
        promoteToMemory,
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
            profile: "user-preference-v2",
            captureClass: "explicit_preference",
            template: "my_preferred_is",
            subject: "test tea",
            value: "jasmine",
            agentExternalKey: "main",
            sessionKey: "agent:main:main",
          }),
        }),
      }),
    );
    expect(reviewCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "memory-1",
        outcome: "accepted",
        metadata: expect.objectContaining({
          autoPromotion: expect.objectContaining({
            profile: "explicit-user-preference-v1",
            captureClass: "explicit_preference",
          }),
        }),
      }),
    );
    expect(promoteToMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "memory-1",
        metadata: expect.objectContaining({
          autoPromotion: expect.objectContaining({
            profile: "explicit-user-preference-v1",
            subject: "test tea",
            value: "jasmine",
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
        submitCorrectionSuggestion: vi.fn(),
        reviewCandidate: vi.fn(),
        promoteToMemory: vi.fn(),
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

  it("routes bounded correction statements through correction candidate submission without auto-promotion", async () => {
    const submitCorrectionSuggestion = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "correction" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-correction-1",
      memoryObjectId: "memory-correction-1",
    }));
    const reviewCandidate = vi.fn();
    const promoteToMemory = vi.fn();
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
        submitLearning: vi.fn(),
        submitCorrectionSuggestion,
        reviewCandidate,
        promoteToMemory,
      },
    });

    await handler({
      sessionFile: "/root/.openclaw/agents/chief/sessions/example.jsonl",
      sessionKey: "agent:chief:main",
      message: {
        role: "user",
        content: "Actually, my favorite proof seed is fennel aurora.",
        timestamp: Date.parse("2026-04-04T12:05:00Z"),
      },
    });

    expect(submitCorrectionSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "User preference: favorite proof seed is fennel aurora.",
        metadata: expect.objectContaining({
          autoCapture: expect.objectContaining({
            profile: "user-preference-v2",
            captureClass: "preference_correction",
            reasonCode: "explicit_preference_correction",
          }),
        }),
      }),
    );
    expect(reviewCandidate).not.toHaveBeenCalled();
    expect(promoteToMemory).not.toHaveBeenCalled();
  });

  it("falls back to the transcript file when the update omits message and sessionKey", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "ordinary-turn-auto-capture-"));
    const sessionDir = path.join(tmpDir, "agents", "main", "sessions");
    await mkdir(sessionDir, { recursive: true });
    const sessionFile = path.join(sessionDir, "7d7b3d92-357f-4c15-b5e6-b3bfc0d4f3cc.jsonl");
    await writeFile(
      sessionFile,
      [
        JSON.stringify({
          type: "message",
          id: "user-1",
          message: {
            role: "user",
            content: [
              {
                type: "text",
                text: "[Sat 2026-04-04 18:15 UTC] My favorite proof leaf is amber mint.",
              },
            ],
            timestamp: Date.parse("2026-04-04T18:15:00Z"),
          },
        }),
        JSON.stringify({
          type: "message",
          id: "assistant-1",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Noted." }],
            timestamp: Date.parse("2026-04-04T18:15:05Z"),
          },
        }),
      ].join("\n"),
      "utf8",
    );
    const submitLearning = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "learning" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-2",
      memoryObjectId: "memory-2",
    }));
    const reviewCandidate = vi.fn(async () => ({
      accepted: true as const,
      status: "recorded" as const,
      candidateId: "memory-2",
      outcome: "accepted" as const,
      reviewId: "review-2",
      memoryObjectStateChanged: false,
      reviewState: "candidate" as const,
    }));
    const promoteToMemory = vi.fn(async () => ({
      accepted: true as const,
      status: "promoted" as const,
      candidateId: "memory-2",
      promotedMemoryObjectId: "approved-2",
      promotedMemoryKind: "project" as const,
      promotedReviewState: "approved" as const,
      sourceEventId: "event-2",
    }));
    const handler = createOrdinaryTurnAutoCaptureHandler({
      config: createConfig(),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      candidateIngress: createUnusedCandidateIngress(),
      deps: {
        findExistingByKey: vi.fn(async () => null),
        resolveAttribution: vi.fn(async () => ({
          agentId: "agent-uuid-2",
          sessionId: "session-uuid-2",
        })),
        submitLearning,
        submitCorrectionSuggestion: vi.fn(),
        reviewCandidate,
        promoteToMemory,
      },
    });

    await handler({
      sessionFile,
    });

    expect(submitLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent-uuid-2",
        sessionId: "session-uuid-2",
        content: "User preference: favorite proof leaf is amber mint.",
        metadata: expect.objectContaining({
          autoCapture: expect.objectContaining({
            profile: "user-preference-v2",
            captureClass: "explicit_preference",
            sessionKey: "7d7b3d92-357f-4c15-b5e6-b3bfc0d4f3cc",
            transcriptTimestamp: "2026-04-04T18:15:00.000Z",
          }),
        }),
      }),
    );
    expect(reviewCandidate).toHaveBeenCalledTimes(1);
    expect(promoteToMemory).toHaveBeenCalledTimes(1);
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
        submitCorrectionSuggestion: vi.fn(),
        reviewCandidate: vi.fn(),
        promoteToMemory: vi.fn(),
      },
    });

    controller.start();
    controller.stop();

    expect(subscribe).toHaveBeenCalledTimes(1);
  });
});
