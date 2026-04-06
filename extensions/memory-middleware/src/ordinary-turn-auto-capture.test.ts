import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { MemoryMiddlewareConfig } from "./config.js";
import {
  createOrdinaryTurnAutoCaptureController,
  createOrdinaryTurnAutoCaptureHandler,
  parseAutoCaptureManagedCandidateContent,
  parseManagedCorrectionCandidateContent,
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
      url: "",
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

  it("matches an I meant correction form in the broader profile", () => {
    expect(
      parseOrdinaryTurnAutoCapturePreference(
        "I meant, my preferred proof lantern is amber rain.",
        "user-preference-v2",
      ),
    ).toMatchObject({
      captureClass: "preference_correction",
      candidateKind: "correction",
      template: "my_preferred_is",
      subject: "proof lantern",
      value: "amber rain",
    });
  });

  it("matches a bounded response-style requirement correction in the broader profile", () => {
    expect(
      parseOrdinaryTurnAutoCapturePreference("Actually keep replies short.", "user-preference-v2"),
    ).toMatchObject({
      captureClass: "requirement_correction",
      candidateKind: "correction",
      reasonCode: "explicit_requirement_correction",
      template: "responses_concise",
      subject: "response style",
      value: "keep responses concise",
      content: "User correction: keep responses concise.",
    });
  });

  it("matches a plain-English correction form without a required comma after No", () => {
    expect(
      parseOrdinaryTurnAutoCapturePreference(
        "No use plain English, not jargon.",
        "user-preference-v2",
      ),
    ).toMatchObject({
      captureClass: "requirement_correction",
      candidateKind: "correction",
      template: "responses_plain_english",
      subject: "response language",
      value: "use plain English",
    });
  });

  it("matches a bullet-points correction form with a for-me suffix", () => {
    expect(
      parseOrdinaryTurnAutoCapturePreference("No, use bullet points for me.", "user-preference-v2"),
    ).toMatchObject({
      captureClass: "requirement_correction",
      candidateKind: "correction",
      template: "responses_bullets",
      subject: "response format",
      value: "use bullet points when listing items",
    });
  });

  it("matches a bounded recurring response requirement in the broader profile", () => {
    expect(
      parseOrdinaryTurnAutoCapturePreference(
        "Please keep your responses concise.",
        "user-preference-v2",
      ),
    ).toMatchObject({
      captureClass: "explicit_requirement",
      candidateKind: "learning",
      template: "responses_concise",
      subject: "response style",
      value: "keep responses concise",
      content: "User requirement: keep responses concise.",
    });
  });

  it("matches a numbered-steps requirement in the broader profile", () => {
    expect(
      parseOrdinaryTurnAutoCapturePreference(
        "Please use numbered steps when giving instructions.",
        "user-preference-v2",
      ),
    ).toMatchObject({
      captureClass: "explicit_requirement",
      candidateKind: "learning",
      template: "responses_numbered_steps",
      subject: "response format",
      value: "use numbered steps when giving instructions",
      content: "User requirement: use numbered steps when giving instructions.",
    });
  });

  it("matches a bounded plain-English requirement with an explicit no-jargon tail", () => {
    expect(
      parseOrdinaryTurnAutoCapturePreference(
        "Please use plain English, not jargon.",
        "user-preference-v2",
      ),
    ).toMatchObject({
      captureClass: "explicit_requirement",
      candidateKind: "learning",
      template: "responses_plain_english",
      subject: "response language",
      value: "use plain English",
      content: "User requirement: use plain English.",
    });
  });

  it("matches a tightly bounded named project fact in the broader profile", () => {
    expect(
      parseOrdinaryTurnAutoCapturePreference(
        "For project atlas forge, the staging branch is atlas-staging.",
        "user-preference-v2",
      ),
    ).toMatchObject({
      captureClass: "explicit_project_fact",
      candidateKind: "learning",
      template: "project_fact_named_scope",
      subject: "atlas forge / staging branch",
      value: "atlas-staging",
      projectScope: "atlas forge",
      content: "Project fact [atlas forge]: staging branch is atlas-staging.",
    });
  });

  it("matches another tightly bounded named project fact field in the broader profile", () => {
    expect(
      parseOrdinaryTurnAutoCapturePreference(
        "For project atlas forge, the default branch is atlas-main.",
        "user-preference-v2",
      ),
    ).toMatchObject({
      captureClass: "explicit_project_fact",
      candidateKind: "learning",
      template: "project_fact_named_scope",
      subject: "atlas forge / default branch",
      value: "atlas-main",
      projectScope: "atlas forge",
      content: "Project fact [atlas forge]: default branch is atlas-main.",
    });
  });

  it("matches a natural project fact correction in the broader profile", () => {
    expect(
      parseOrdinaryTurnAutoCapturePreference(
        "Actually, for project atlas forge, the staging branch is atlas-green.",
        "user-preference-v2",
      ),
    ).toMatchObject({
      captureClass: "project_fact_correction",
      candidateKind: "correction",
      template: "project_fact_named_scope",
      subject: "atlas forge / staging branch",
      value: "atlas-green",
      projectScope: "atlas forge",
      content: "Project correction [atlas forge]: staging branch is atlas-green.",
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

  it("parses the managed recurring requirement content", () => {
    expect(
      parseAutoCaptureManagedCandidateContent(
        "User requirement stated explicitly: use bullet points when listing items.",
      ),
    ).toMatchObject({
      captureClass: "explicit_requirement",
      template: "responses_bullets",
      subject: "response format",
      value: "use bullet points when listing items",
    });
  });

  it("parses the live managed concise-requirement phrasing", () => {
    expect(
      parseAutoCaptureManagedCandidateContent("User prefers concise responses."),
    ).toMatchObject({
      captureClass: "explicit_requirement",
      template: "responses_concise",
      subject: "response style",
      value: "keep responses concise",
    });
  });

  it("parses the managed numbered-steps requirement content", () => {
    expect(
      parseAutoCaptureManagedCandidateContent("User prefers numbered steps for instructions."),
    ).toMatchObject({
      captureClass: "explicit_requirement",
      template: "responses_numbered_steps",
      subject: "response format",
      value: "use numbered steps when giving instructions",
    });
  });

  it("parses additional live managed requirement phrasings", () => {
    expect(
      parseAutoCaptureManagedCandidateContent(
        "User prefers numbered steps when giving instructions.",
      ),
    ).toMatchObject({
      captureClass: "explicit_requirement",
      template: "responses_numbered_steps",
      subject: "response format",
      value: "use numbered steps when giving instructions",
    });
    expect(parseAutoCaptureManagedCandidateContent("User prefers short replies.")).toMatchObject({
      captureClass: "explicit_requirement",
      template: "responses_concise",
      subject: "response style",
      value: "keep responses concise",
    });
  });

  it("parses managed named project fact content", () => {
    expect(
      parseAutoCaptureManagedCandidateContent(
        "Project fact [atlas forge]: staging branch is atlas-staging.",
      ),
    ).toMatchObject({
      captureClass: "explicit_project_fact",
      candidateKind: "learning",
      template: "project_fact_named_scope",
      subject: "atlas forge / staging branch",
      value: "atlas-staging",
      projectScope: "atlas forge",
    });
  });

  it("parses natural named project fact content from the model tool path", () => {
    expect(
      parseAutoCaptureManagedCandidateContent(
        "For project cedar harbor, the staging branch is harbor-staging.",
      ),
    ).toMatchObject({
      captureClass: "explicit_project_fact",
      candidateKind: "learning",
      template: "project_fact_named_scope",
      subject: "cedar harbor / staging branch",
      value: "harbor-staging",
      projectScope: "cedar harbor",
    });
  });

  it("parses managed correction candidate content", () => {
    expect(
      parseManagedCorrectionCandidateContent(
        "User correction: favorite proof seed is 'fennel aurora'.",
      ),
    ).toMatchObject({
      captureClass: "preference_correction",
      candidateKind: "correction",
      template: "my_favorite_is",
      subject: "proof seed",
      value: "fennel aurora",
    });
  });

  it("parses the live managed correction phrasing", () => {
    expect(
      parseManagedCorrectionCandidateContent(
        "User corrected a durable preference: preferred slice four lantern reed is moon amber pearl.",
      ),
    ).toMatchObject({
      captureClass: "preference_correction",
      candidateKind: "correction",
      template: "my_preferred_is",
      subject: "slice four lantern reed",
      value: "moon amber pearl",
    });
  });

  it("parses managed response-style requirement correction content", () => {
    expect(
      parseManagedCorrectionCandidateContent(
        "User correction: use numbered steps when giving instructions.",
      ),
    ).toMatchObject({
      captureClass: "requirement_correction",
      candidateKind: "correction",
      template: "responses_numbered_steps",
      subject: "response format",
      value: "use numbered steps when giving instructions",
    });
  });

  it("parses natural response-style correction content from the model tool path", () => {
    expect(
      parseManagedCorrectionCandidateContent("I meant plain English, not jargon."),
    ).toMatchObject({
      captureClass: "requirement_correction",
      candidateKind: "correction",
      template: "responses_plain_english",
      subject: "response language",
      value: "use plain English",
    });
  });

  it("parses additional live managed response-style correction phrasings", () => {
    expect(
      parseManagedCorrectionCandidateContent(
        "User correction to response style preference: keep replies short.",
      ),
    ).toMatchObject({
      captureClass: "requirement_correction",
      template: "responses_concise",
      subject: "response style",
      value: "keep responses concise",
    });
    expect(
      parseManagedCorrectionCandidateContent(
        "User corrected response-style preference: keep replies short.",
      ),
    ).toMatchObject({
      captureClass: "requirement_correction",
      template: "responses_concise",
      subject: "response style",
      value: "keep responses concise",
    });
    expect(
      parseManagedCorrectionCandidateContent(
        "User correction to response language preference: use plain English, not jargon.",
      ),
    ).toMatchObject({
      captureClass: "requirement_correction",
      template: "responses_plain_english",
      subject: "response language",
      value: "use plain English",
    });
    expect(
      parseManagedCorrectionCandidateContent(
        "User correction: use plain English, not jargon, when replying.",
      ),
    ).toMatchObject({
      captureClass: "requirement_correction",
      template: "responses_plain_english",
      subject: "response language",
      value: "use plain English",
    });
    expect(
      parseManagedCorrectionCandidateContent(
        "User correction to response format preference: use bullet points for me.",
      ),
    ).toMatchObject({
      captureClass: "requirement_correction",
      template: "responses_bullets",
      subject: "response format",
      value: "use bullet points when listing items",
    });
  });

  it("parses managed project fact correction content", () => {
    expect(
      parseManagedCorrectionCandidateContent(
        "Project correction [atlas forge]: staging branch is atlas-green.",
      ),
    ).toMatchObject({
      captureClass: "project_fact_correction",
      candidateKind: "correction",
      template: "project_fact_named_scope",
      subject: "atlas forge / staging branch",
      value: "atlas-green",
      projectScope: "atlas forge",
    });
  });

  it("parses natural project fact correction content from the model tool path", () => {
    expect(
      parseManagedCorrectionCandidateContent(
        "Correction: For project cedar harbor, the staging branch is harbor-green (not harbor-staging).",
      ),
    ).toMatchObject({
      captureClass: "project_fact_correction",
      candidateKind: "correction",
      template: "project_fact_named_scope",
      subject: "cedar harbor / staging branch",
      value: "harbor-green",
      projectScope: "cedar harbor",
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
        content: "User correction: favorite proof seed is fennel aurora.",
        metadata: expect.objectContaining({
          category: "user_preference_correction",
          source: "conversational_user_correction",
          subject_key: expect.any(String),
          preference_key: expect.any(String),
          autoCapture: expect.objectContaining({
            profile: "user-preference-v2",
            captureClass: "preference_correction",
            reasonCode: "explicit_preference_correction",
            captureSeam: "transcript_subscriber_fallback",
          }),
        }),
      }),
    );
    expect(reviewCandidate).not.toHaveBeenCalled();
    expect(promoteToMemory).not.toHaveBeenCalled();
  });

  it("routes bounded recurring response requirements through learning submission and auto-promotion", async () => {
    const submitLearning = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "learning" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-requirement-1",
      memoryObjectId: "memory-requirement-1",
    }));
    const reviewCandidate = vi.fn(async () => ({
      accepted: true as const,
      status: "recorded" as const,
      candidateId: "memory-requirement-1",
      outcome: "accepted" as const,
      reviewId: "review-requirement-1",
      memoryObjectStateChanged: false,
      reviewState: "candidate" as const,
    }));
    const promoteToMemory = vi.fn(async () => ({
      accepted: true as const,
      status: "promoted" as const,
      candidateId: "memory-requirement-1",
      promotedMemoryObjectId: "approved-requirement-1",
      promotedMemoryKind: "feedback" as const,
      promotedReviewState: "approved" as const,
      sourceEventId: "event-requirement-1",
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
      sessionFile: "/root/.openclaw/agents/chief/sessions/example.jsonl",
      sessionKey: "agent:chief:main",
      message: {
        role: "user",
        content: "Please keep your responses concise.",
        timestamp: Date.parse("2026-04-04T12:06:00Z"),
      },
    });

    expect(submitLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "User requirement: keep responses concise.",
        metadata: expect.objectContaining({
          autoCapture: expect.objectContaining({
            captureClass: "explicit_requirement",
            template: "responses_concise",
            captureSeam: "transcript_subscriber_fallback",
          }),
        }),
      }),
    );
    expect(reviewCandidate).toHaveBeenCalledTimes(1);
    expect(promoteToMemory).toHaveBeenCalledTimes(1);
  });

  it("routes bounded response-style corrections through correction submission with direct auto-promotion", async () => {
    const submitCorrectionSuggestion = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "correction" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-requirement-correction-1",
      memoryObjectId: "memory-requirement-correction-1",
    }));
    const reviewCandidate = vi.fn(async () => ({
      accepted: true as const,
      reviewId: "review-requirement-correction-1",
    }));
    const promoteToMemory = vi.fn(async () => ({
      accepted: true as const,
      promotedMemoryObjectId: "memory-approved-requirement-correction-1",
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
        content: "Actually keep replies short.",
        timestamp: Date.parse("2026-04-05T08:06:00Z"),
      },
    });

    expect(submitCorrectionSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "User correction: keep responses concise.",
        metadata: expect.objectContaining({
          category: "user_requirement_correction",
          source: "conversational_user_requirement_correction",
          subject_key: expect.any(String),
          autoCapture: expect.objectContaining({
            captureClass: "requirement_correction",
            template: "responses_concise",
            captureSeam: "transcript_subscriber_fallback",
          }),
        }),
      }),
    );
    expect(reviewCandidate).toHaveBeenCalledTimes(1);
    expect(promoteToMemory).toHaveBeenCalledTimes(1);
  });

  it("routes targetable response-style forget requests through bounded forget handling", async () => {
    const forgetApprovedResponseStyleBySubjectKey = vi.fn(async () => ({
      accepted: true as const,
      status: "superseded" as const,
      supersededObjectIds: ["memory-approved-no-tables-1"],
      reviewIds: ["review-forget-no-tables-1"],
    }));
    const reviewCandidate = vi.fn();
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
        inspectResponseStyleLifecycle: vi.fn(async () => ({
          activeApprovedSubjectObjectIds: ["memory-approved-no-tables-1"],
          pendingSubjectCandidateIds: [],
        })),
        forgetApprovedResponseStyleBySubjectKey,
        submitLearning: vi.fn(),
        submitCorrectionSuggestion: vi.fn(),
        reviewCandidate,
        promoteToMemory: vi.fn(),
      },
    });

    await handler({
      sessionFile: "/root/.openclaw/agents/chief/sessions/example.jsonl",
      sessionKey: "agent:chief:main",
      message: {
        role: "user",
        content: "Forget the table preference.",
        timestamp: Date.parse("2026-04-05T08:09:00Z"),
      },
    });

    expect(forgetApprovedResponseStyleBySubjectKey).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectKey: expect.any(String),
        reviewerAgentId: "agent-uuid-1",
        metadata: expect.objectContaining({
          source: "response_style_forget_request",
          subject: "response format",
        }),
      }),
    );
    expect(reviewCandidate).not.toHaveBeenCalled();
  });

  it("promotes a pending response-style candidate when later confirming evidence arrives in the recent-key window", async () => {
    const submitLearning = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "learning" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-requirement-learning-1",
      memoryObjectId: "memory-requirement-learning-1",
    }));
    const inspectResponseStyleLifecycle = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        pendingCandidate: {
          id: "memory-requirement-learning-1",
          sourceEventId: "event-requirement-learning-1",
          createdAt: "2026-04-05T08:00:00.000Z",
          updatedAt: "2026-04-05T08:00:00.000Z",
          confirmationState: "pending_confirmation",
        },
        activeApprovedSubjectObjectIds: [],
        pendingSubjectCandidateIds: ["memory-requirement-learning-1"],
      });
    const reviewCandidate = vi.fn(async () => ({
      accepted: true as const,
      reviewId: "review-requirement-learning-1",
    }));
    const promoteToMemory = vi.fn(async () => ({
      accepted: true as const,
      promotedMemoryObjectId: "memory-approved-requirement-learning-1",
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
        inspectResponseStyleLifecycle,
        submitLearning,
        submitCorrectionSuggestion: vi.fn(),
        reviewCandidate,
        promoteToMemory,
      },
    });

    await handler({
      sessionFile: "/root/.openclaw/agents/chief/sessions/example.jsonl",
      sessionKey: "agent:chief:main",
      message: {
        role: "user",
        content: "can you use bullets",
        timestamp: Date.parse("2026-04-05T08:06:00Z"),
      },
    });
    await handler({
      sessionFile: "/root/.openclaw/agents/chief/sessions/example.jsonl",
      sessionKey: "agent:chief:main",
      message: {
        role: "user",
        content: "use bullets when listing",
        timestamp: Date.parse("2026-04-05T08:07:00Z"),
      },
    });

    expect(submitLearning).toHaveBeenCalledTimes(1);
    expect(reviewCandidate).toHaveBeenCalledTimes(1);
    expect(promoteToMemory).toHaveBeenCalledTimes(1);
  });

  it("routes bounded named project facts through learning submission without auto-promotion", async () => {
    const submitLearning = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "learning" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-project-fact-1",
      memoryObjectId: "memory-project-fact-1",
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
        submitLearning,
        submitCorrectionSuggestion: vi.fn(),
        reviewCandidate,
        promoteToMemory,
      },
    });

    await handler({
      sessionFile: "/root/.openclaw/agents/chief/sessions/example.jsonl",
      sessionKey: "agent:chief:main",
      message: {
        role: "user",
        content: "For project atlas forge, the staging branch is atlas-staging.",
        timestamp: Date.parse("2026-04-04T12:07:00Z"),
      },
    });

    expect(submitLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Project fact [atlas forge]: staging branch is atlas-staging.",
        metadata: expect.objectContaining({
          category: "project_fact",
          source: "explicit_project_fact",
          subject_key: expect.any(String),
          autoCapture: expect.objectContaining({
            captureClass: "explicit_project_fact",
            captureSeam: "transcript_subscriber_fallback",
            projectScope: "atlas forge",
            subject: "atlas forge / staging branch",
            value: "atlas-staging",
          }),
        }),
      }),
    );
    expect(reviewCandidate).not.toHaveBeenCalled();
    expect(promoteToMemory).not.toHaveBeenCalled();
  });

  it("routes another bounded named project fact field through learning submission without auto-promotion", async () => {
    const submitLearning = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "learning" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-project-fact-2",
      memoryObjectId: "memory-project-fact-2",
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
        submitLearning,
        submitCorrectionSuggestion: vi.fn(),
        reviewCandidate,
        promoteToMemory,
      },
    });

    await handler({
      sessionFile: "/root/.openclaw/agents/chief/sessions/example.jsonl",
      sessionKey: "agent:chief:main",
      message: {
        role: "user",
        content: "For project atlas forge, the default branch is atlas-main.",
        timestamp: Date.parse("2026-04-05T05:00:00Z"),
      },
    });

    expect(submitLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Project fact [atlas forge]: default branch is atlas-main.",
        metadata: expect.objectContaining({
          category: "project_fact",
          source: "explicit_project_fact",
          subject_key: expect.any(String),
          autoCapture: expect.objectContaining({
            captureClass: "explicit_project_fact",
            captureSeam: "transcript_subscriber_fallback",
            projectScope: "atlas forge",
            subject: "atlas forge / default branch",
            value: "atlas-main",
          }),
        }),
      }),
    );
    expect(reviewCandidate).not.toHaveBeenCalled();
    expect(promoteToMemory).not.toHaveBeenCalled();
  });

  it("captures medium-confidence semantic project facts as pending-confirmation candidates", async () => {
    const submitLearning = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "learning" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-project-fact-semantic-1",
      memoryObjectId: "memory-project-fact-semantic-1",
    }));
    const handler = createOrdinaryTurnAutoCaptureHandler({
      config: createConfig(),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      candidateIngress: createUnusedCandidateIngress(),
      deps: {
        findExistingByKey: vi.fn(async () => null),
        inspectProjectFactLifecycle: vi.fn(async () => null),
        resolveAttribution: vi.fn(async () => ({
          agentId: "agent-uuid-1",
          sessionId: "session-uuid-1",
        })),
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
        content: "For project atlas forge, we use pnpm.",
        timestamp: Date.parse("2026-04-05T08:11:00Z"),
      },
    });

    expect(submitLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Project fact [atlas forge]: primary package manager is pnpm.",
        metadata: expect.objectContaining({
          category: "project_fact",
          source: "explicit_project_fact",
          autoCapture: expect.objectContaining({
            captureClass: "explicit_project_fact",
            captureSeam: "transcript_subscriber_fallback",
            fieldKey: "primary_package_manager",
            subject: "atlas forge / primary package manager",
            value: "pnpm",
          }),
          semanticDetection: expect.objectContaining({
            source: "project_fact_semantic_v1",
            confidence: "medium",
            fieldKey: "primary_package_manager",
          }),
          candidateLifecycle: expect.objectContaining({
            family: "project_fact",
            state: "pending_confirmation",
            confidence: "medium",
            fieldKey: "primary_package_manager",
          }),
        }),
      }),
    );
  });

  it("promotes a pending project-fact candidate when later confirming evidence arrives", async () => {
    const submitLearning = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "learning" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-project-fact-learning-1",
      memoryObjectId: "memory-project-fact-learning-1",
    }));
    const inspectProjectFactLifecycle = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        pendingCandidate: {
          id: "memory-project-fact-learning-1",
          sourceEventId: "event-project-fact-learning-1",
          createdAt: "2026-04-05T08:00:00.000Z",
          updatedAt: "2026-04-05T08:00:00.000Z",
          confirmationState: "pending_confirmation",
        },
        activeApprovedSubjectObjectIds: [],
        pendingSubjectCandidateIds: ["memory-project-fact-learning-1"],
      });
    const reviewCandidate = vi.fn(async () => ({
      accepted: true as const,
      reviewId: "review-project-fact-learning-1",
    }));
    const promoteToMemory = vi.fn(async () => ({
      accepted: true as const,
      promotedMemoryObjectId: "memory-approved-project-fact-learning-1",
    }));
    const handler = createOrdinaryTurnAutoCaptureHandler({
      config: createConfig(),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      candidateIngress: createUnusedCandidateIngress(),
      deps: {
        findExistingByKey: vi.fn(async () => null),
        inspectProjectFactLifecycle,
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
      sessionFile: "/root/.openclaw/agents/chief/sessions/example.jsonl",
      sessionKey: "agent:chief:main",
      message: {
        role: "user",
        content: "For project atlas forge, we use pnpm.",
        timestamp: Date.parse("2026-04-05T08:06:00Z"),
      },
    });
    await handler({
      sessionFile: "/root/.openclaw/agents/chief/sessions/example.jsonl",
      sessionKey: "agent:chief:main",
      message: {
        role: "user",
        content: "For project atlas forge, the package manager is pnpm.",
        timestamp: Date.parse("2026-04-05T08:07:00Z"),
      },
    });

    expect(submitLearning).toHaveBeenCalledTimes(1);
    expect(reviewCandidate).toHaveBeenCalledTimes(1);
    expect(promoteToMemory).toHaveBeenCalledTimes(1);
  });

  it("routes natural named project fact corrections through correction submission with project metadata", async () => {
    const submitCorrectionSuggestion = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "correction" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-project-correction-1",
      memoryObjectId: "memory-project-correction-1",
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
        submitLearning: vi.fn(),
        submitCorrectionSuggestion,
        reviewCandidate: vi.fn(),
        promoteToMemory: vi.fn(),
      },
    });

    await handler({
      sessionFile: "/root/.openclaw/agents/chief/sessions/example.jsonl",
      sessionKey: "agent:chief:main",
      message: {
        role: "user",
        content: "Actually, for project atlas forge, the staging branch is atlas-green.",
        timestamp: Date.parse("2026-04-04T12:08:00Z"),
      },
    });

    expect(submitCorrectionSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Project correction [atlas forge]: staging branch is atlas-green.",
        metadata: expect.objectContaining({
          category: "project_fact_correction",
          source: "conversational_project_fact_correction",
          subject_key: expect.any(String),
          autoCapture: expect.objectContaining({
            captureClass: "project_fact_correction",
            captureSeam: "transcript_subscriber_fallback",
            projectScope: "atlas forge",
            reasonCode: "explicit_project_fact_correction",
          }),
        }),
      }),
    );
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
  it("auto-promotes a bounded recurring checklist through draft and validation", async () => {
    const submitProcedureSuggestion = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "procedure" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-procedure-1",
      memoryObjectId: "memory-procedure-1",
    }));
    const reviewCandidate = vi.fn(async () => ({
      accepted: true as const,
      status: "recorded" as const,
      candidateId: "memory-procedure-1",
      outcome: "accepted" as const,
      reviewId: "review-procedure-1",
      memoryObjectStateChanged: false,
      reviewState: "candidate" as const,
    }));
    const promoteToProcedureDraft = vi.fn(async () => ({
      accepted: true as const,
      status: "promoted" as const,
      candidateId: "memory-procedure-1",
      procedureId: "procedure-1",
      procedureStatus: "draft" as const,
      sourceEventId: "event-procedure-1",
    }));
    const validateProcedure = vi.fn(async () => ({
      accepted: true as const,
      status: "validated" as const,
      procedureId: "procedure-1",
      procedureStatus: "validated" as const,
      procedureRunId: "procedure-run-1",
      sourceCandidateId: "memory-procedure-1",
    }));
    const handler = createOrdinaryTurnAutoCaptureHandler({
      config: createConfig(),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      candidateIngress: createUnusedCandidateIngress(),
      deps: {
        resolveAttribution: vi.fn(async () => ({
          agentId: "agent-uuid-3",
          sessionId: "session-uuid-3",
        })),
        submitLearning: vi.fn(),
        submitCorrectionSuggestion: vi.fn(),
        submitProcedureSuggestion,
        reviewCandidate,
        promoteToMemory: vi.fn(),
        promoteToProcedureDraft,
        validateProcedure,
        inspectRecurringProcedureLifecycle: vi.fn(async () => ({
          activeValidatedSubjectProcedureIds: [],
          pendingSubjectCandidateIds: [],
        })),
        supersedeValidatedProceduresBySubjectKey: vi.fn(async () => ({
          accepted: true as const,
          status: "already_superseded" as const,
          supersededProcedureIds: [],
        })),
      },
    });

    await handler({
      sessionFile: "/root/.openclaw/agents/main/sessions/recurring-procedure.jsonl",
      sessionKey: "agent:main:main",
      message: {
        role: "user",
        content: [
          "My deploy checklist:",
          "1. Open the canary lane.",
          "2. Verify health.",
          "3. Roll forward.",
        ].join("\n"),
        timestamp: Date.parse("2026-04-05T18:00:00Z"),
      },
    });

    expect(submitProcedureSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent-uuid-3",
        sessionId: "session-uuid-3",
        content: ["1. Open the canary lane", "2. Verify health", "3. Roll forward"].join("\n"),
        metadata: expect.objectContaining({
          autoCapture: expect.objectContaining({
            captureClass: "explicit_recurring_procedure",
            procedureKey: "deploy_checklist",
            title: "Deploy checklist",
          }),
        }),
      }),
    );
    expect(reviewCandidate).toHaveBeenCalledTimes(1);
    expect(promoteToProcedureDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "memory-procedure-1",
        title: "Deploy checklist",
      }),
    );
    expect(validateProcedure).toHaveBeenCalledWith(
      expect.objectContaining({
        procedureId: "procedure-1",
      }),
    );
  });

  it("captures a bounded workflow improvement as an improvement candidate and promotes it after later confirming evidence", async () => {
    const reviewCandidate = vi.fn(async () => ({
      accepted: true as const,
      status: "recorded" as const,
      candidateId: "memory-improvement-1",
      outcome: "accepted" as const,
      reviewId: "review-improvement-1",
      memoryObjectStateChanged: false,
      reviewState: "candidate" as const,
    }));
    const promoteToMemory = vi.fn(async () => ({
      accepted: true as const,
      status: "promoted" as const,
      candidateId: "memory-improvement-1",
      promotedMemoryObjectId: "approved-improvement-1",
      sourceEventId: "event-improvement-1",
      reviewState: "approved" as const,
    }));
    const submitImprovementNote = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "improvement" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-improvement-1",
      memoryObjectId: "memory-improvement-1",
    }));
    const inspectWorkflowImprovementLifecycle = vi
      .fn()
      .mockResolvedValueOnce({
        activeApprovedSubjectObjectIds: [],
        pendingSubjectCandidateIds: [],
      })
      .mockResolvedValueOnce({
        activeApprovedSubjectObjectIds: [],
        pendingSubjectCandidateIds: ["memory-improvement-1"],
        pendingCandidate: {
          id: "memory-improvement-1",
          createdAt: new Date(Date.now() - 10_000).toISOString(),
          updatedAt: new Date(Date.now() - 10_000).toISOString(),
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          confirmationState: "pending_confirmation",
        },
      });
    const handler = createOrdinaryTurnAutoCaptureHandler({
      config: createConfig(),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      candidateIngress: createUnusedCandidateIngress(),
      deps: {
        resolveAttribution: vi.fn(async () => ({
          agentId: "agent-uuid-4",
          sessionId: "session-uuid-4",
        })),
        submitLearning: vi.fn(),
        submitCorrectionSuggestion: vi.fn(),
        submitProcedureSuggestion: vi.fn(),
        submitImprovementNote,
        reviewCandidate,
        promoteToMemory,
        promoteToProcedureDraft: vi.fn(),
        validateProcedure: vi.fn(),
        inspectWorkflowImprovementLifecycle,
      },
    });

    const update = {
      sessionFile: "/root/.openclaw/agents/main/sessions/workflow-improvement.jsonl",
      sessionKey: "agent:main:main",
      message: {
        role: "user",
        content: "Use pnpm test -- src/foo.test.ts instead of raw vitest here.",
        timestamp: Date.parse("2026-04-05T20:10:00Z"),
      },
    };

    await handler(update);
    await handler(update);

    expect(submitImprovementNote).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent-uuid-4",
        sessionId: "session-uuid-4",
        content:
          "Workflow improvement: use pnpm test -- <path-or-filter> [vitest args...] instead of raw vitest so the repo test wrapper stays active.",
        metadata: expect.objectContaining({
          autoCapture: expect.objectContaining({
            captureClass: "workflow_tool_gotcha",
            lessonKey: "vitest_wrapper_required",
            toolKey: "vitest",
          }),
          candidateLifecycle: expect.objectContaining({
            family: "workflow_improvement",
            state: "pending_confirmation",
          }),
        }),
      }),
    );
    expect(reviewCandidate).toHaveBeenCalledTimes(1);
    expect(promoteToMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "memory-improvement-1",
      }),
    );
  });

  it("captures a bounded environment constraint as an improvement candidate", async () => {
    const submitImprovementNote = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "improvement" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-improvement-2",
      memoryObjectId: "memory-improvement-2",
    }));
    const inspectWorkflowImprovementLifecycle = vi.fn().mockResolvedValueOnce({
      activeApprovedSubjectObjectIds: [],
      pendingSubjectCandidateIds: [],
    });
    const handler = createOrdinaryTurnAutoCaptureHandler({
      config: createConfig(),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      candidateIngress: createUnusedCandidateIngress(),
      deps: {
        resolveAttribution: vi.fn(async () => ({
          agentId: "agent-uuid-5",
          sessionId: "session-uuid-5",
        })),
        submitLearning: vi.fn(async () => ({
          accepted: false as const,
          status: "failed" as const,
          kind: "learning" as const,
          reason: "unused in this test",
        })),
        submitCorrectionSuggestion: vi.fn(async () => ({
          accepted: false as const,
          status: "failed" as const,
          kind: "correction" as const,
          reason: "unused in this test",
        })),
        submitProcedureSuggestion: vi.fn(async () => ({
          accepted: false as const,
          status: "failed" as const,
          kind: "procedure" as const,
          reason: "unused in this test",
        })),
        submitImprovementNote,
        reviewCandidate: vi.fn(),
        promoteToMemory: vi.fn(),
        promoteToProcedureDraft: vi.fn(),
        validateProcedure: vi.fn(),
        inspectWorkflowImprovementLifecycle,
      },
    });

    const firstUpdate = {
      sessionFile: "/root/.openclaw/agents/main/sessions/workflow-constraint.jsonl",
      sessionKey: "agent:main:main",
      message: {
        role: "user",
        content: "python isn't available on this host, so use node instead.",
        timestamp: Date.parse("2026-04-06T00:20:00Z"),
      },
    };
    await handler(firstUpdate);

    expect(submitImprovementNote).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent-uuid-5",
        sessionId: "session-uuid-5",
        content:
          "Environment constraint: python command is not available in this environment; use node --input-type=module or tsx instead.",
        metadata: expect.objectContaining({
          autoCapture: expect.objectContaining({
            captureClass: "workflow_environment_constraint",
            template: "workflow_environment_constraint",
            lessonKey: "python_command_unavailable",
            toolKey: "python_runtime",
          }),
          candidateLifecycle: expect.objectContaining({
            family: "workflow_improvement",
            state: "pending_confirmation",
          }),
        }),
      }),
    );
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
