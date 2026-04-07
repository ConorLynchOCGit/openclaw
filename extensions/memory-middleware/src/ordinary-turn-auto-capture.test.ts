import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { MemoryMiddlewareConfig } from "./config.js";

const storeValidatedProcedureSemanticEmbedding = vi.hoisted(() => vi.fn(async () => true));
const storeApprovedApiWorkaroundSemanticEmbedding = vi.hoisted(() => vi.fn(async () => true));
const storeApprovedEnvironmentConstraintSemanticEmbedding = vi.hoisted(() =>
  vi.fn(async () => true),
);
const storeApprovedWorkflowToolGotchaSemanticEmbedding = vi.hoisted(() => vi.fn(async () => true));
const findApprovedWorkflowPhrasePatternMatch = vi.hoisted(() => vi.fn(async () => null));
const maybeInduceWorkflowPhrasePattern = vi.hoisted(() => vi.fn(async () => ({ status: "held" })));

vi.mock("./semantic-retrieval-routing.js", () => ({
  storeApprovedApiWorkaroundSemanticEmbedding,
  storeApprovedEnvironmentConstraintSemanticEmbedding,
  storeApprovedWorkflowToolGotchaSemanticEmbedding,
  storeValidatedProcedureSemanticEmbedding,
}));
vi.mock("./workflow-phrase-induction.js", async () => {
  const actual = await vi.importActual<typeof import("./workflow-phrase-induction.js")>(
    "./workflow-phrase-induction.js",
  );
  return {
    ...actual,
    findApprovedWorkflowPhrasePatternMatch,
    maybeInduceWorkflowPhrasePattern,
  };
});

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

  it("matches an explicit project repository URL in the broader profile", () => {
    expect(
      parseOrdinaryTurnAutoCapturePreference(
        "For project atlas forge, the repository URL is https://github.com/openclaw/openclaw.",
        "user-preference-v2",
      ),
    ).toMatchObject({
      captureClass: "explicit_project_fact",
      candidateKind: "learning",
      template: "project_fact_named_scope",
      subject: "atlas forge / repository URL",
      value: "https://github.com/openclaw/openclaw",
      projectScope: "atlas forge",
      content:
        "Project fact [atlas forge]: repository URL is https://github.com/openclaw/openclaw.",
    });
  });

  it("matches an explicit project documentation URL in the broader profile", () => {
    expect(
      parseOrdinaryTurnAutoCapturePreference(
        "For project atlas forge, the documentation URL is https://docs.openclaw.ai/getting-started.",
        "user-preference-v2",
      ),
    ).toMatchObject({
      captureClass: "explicit_project_fact",
      candidateKind: "learning",
      template: "project_fact_named_scope",
      subject: "atlas forge / documentation URL",
      value: "https://docs.openclaw.ai/getting-started",
      projectScope: "atlas forge",
      content:
        "Project fact [atlas forge]: documentation URL is https://docs.openclaw.ai/getting-started.",
    });
  });

  it("matches a bounded generic project reference fact in the broader profile", () => {
    expect(
      parseOrdinaryTurnAutoCapturePreference(
        "For project atlas forge, the evidence dashboard is #atlas-rollout-evidence.",
        "user-preference-v2",
      ),
    ).toMatchObject({
      captureClass: "explicit_project_fact",
      candidateKind: "learning",
      template: "project_fact_generalized_named_scope",
      factFamily: "generalized_reference",
      subject: "atlas forge / evidence dashboard",
      value: "#atlas-rollout-evidence",
      projectScope: "atlas forge",
      content: "Project fact [atlas forge]: evidence dashboard is #atlas-rollout-evidence.",
    });
  });

  it("ignores unsupported generic repo labels in deterministic project-fact parsing", () => {
    expect(
      parseOrdinaryTurnAutoCapturePreference(
        "For project atlas forge, the repo is probably somewhere on GitHub.",
        "user-preference-v2",
      ),
    ).toBeNull();
  });

  it("ignores over-broad generic project facts in deterministic parsing", () => {
    expect(
      parseOrdinaryTurnAutoCapturePreference(
        "For project atlas forge, the rollout plan is still messy.",
        "user-preference-v2",
      ),
    ).toBeNull();
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

  it("parses project deployment URL content from the model tool path", () => {
    expect(
      parseAutoCaptureManagedCandidateContent(
        "For project cedar harbor, the deployment URL is https://cedar.example.com/app.",
      ),
    ).toMatchObject({
      captureClass: "explicit_project_fact",
      candidateKind: "learning",
      template: "project_fact_named_scope",
      subject: "cedar harbor / deployment URL",
      value: "https://cedar.example.com/app",
      projectScope: "cedar harbor",
    });
  });

  it("parses project runbook URL content from the model tool path", () => {
    expect(
      parseAutoCaptureManagedCandidateContent(
        "For project cedar harbor, the runbook URL is https://ops.example.com/runbooks/cedar.",
      ),
    ).toMatchObject({
      captureClass: "explicit_project_fact",
      candidateKind: "learning",
      template: "project_fact_named_scope",
      subject: "cedar harbor / runbook URL",
      value: "https://ops.example.com/runbooks/cedar",
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
    storeApprovedWorkflowToolGotchaSemanticEmbedding.mockClear();
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

  it("routes explicit project repository URLs through learning submission without auto-promotion", async () => {
    const submitLearning = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "learning" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-project-fact-3",
      memoryObjectId: "memory-project-fact-3",
    }));
    const inspectProjectFactLifecycle = vi.fn(async () => null);
    const handler = createOrdinaryTurnAutoCaptureHandler({
      config: createConfig(),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      candidateIngress: createUnusedCandidateIngress(),
      deps: {
        findExistingByKey: vi.fn(async () => null),
        resolveAttribution: vi.fn(async () => ({
          agentId: "agent-uuid-1",
          projectId: "project-uuid-1",
          sessionId: "session-uuid-1",
        })),
        inspectProjectFactLifecycle,
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
        content:
          "For project atlas forge, the repository URL is https://github.com/openclaw/openclaw.",
        timestamp: Date.parse("2026-04-06T12:00:00Z"),
      },
    });

    expect(submitLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        content:
          "Project fact [atlas forge]: repository URL is https://github.com/openclaw/openclaw.",
        projectId: "project-uuid-1",
        metadata: expect.objectContaining({
          category: "project_fact",
          source: "explicit_project_fact",
          autoCapture: expect.objectContaining({
            fieldKey: "repository_url",
            subject: "atlas forge / repository URL",
            value: "https://github.com/openclaw/openclaw",
          }),
        }),
      }),
    );
    expect(inspectProjectFactLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-uuid-1",
        subjectKey: expect.any(String),
      }),
    );
  });

  it("routes explicit project documentation URLs through learning submission without auto-promotion", async () => {
    const submitLearning = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "learning" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-project-fact-4",
      memoryObjectId: "memory-project-fact-4",
    }));
    const inspectProjectFactLifecycle = vi.fn(async () => null);
    const handler = createOrdinaryTurnAutoCaptureHandler({
      config: createConfig(),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      candidateIngress: createUnusedCandidateIngress(),
      deps: {
        findExistingByKey: vi.fn(async () => null),
        resolveAttribution: vi.fn(async () => ({
          agentId: "agent-uuid-1",
          projectId: "project-uuid-1",
          sessionId: "session-uuid-1",
        })),
        inspectProjectFactLifecycle,
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
        content:
          "For project atlas forge, the documentation URL is https://docs.openclaw.ai/getting-started.",
        timestamp: Date.parse("2026-04-06T12:00:00Z"),
      },
    });

    expect(submitLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        content:
          "Project fact [atlas forge]: documentation URL is https://docs.openclaw.ai/getting-started.",
        projectId: "project-uuid-1",
        metadata: expect.objectContaining({
          category: "project_fact",
          source: "explicit_project_fact",
          autoCapture: expect.objectContaining({
            fieldKey: "documentation_url",
            subject: "atlas forge / documentation URL",
            value: "https://docs.openclaw.ai/getting-started",
          }),
        }),
      }),
    );
    expect(inspectProjectFactLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-uuid-1",
        subjectKey: expect.any(String),
      }),
    );
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

  it("captures bounded generic project facts as held clusters before later evidence arrives", async () => {
    const submitLearning = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "learning" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-project-fact-generic-1",
      memoryObjectId: "memory-project-fact-generic-1",
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
          projectId: "project-uuid-1",
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
        content: "For project atlas forge, the evidence dashboard is #atlas-rollout-evidence.",
        timestamp: Date.parse("2026-04-07T08:11:00Z"),
      },
    });

    expect(submitLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Project fact [atlas forge]: evidence dashboard is #atlas-rollout-evidence.",
        projectId: "project-uuid-1",
        metadata: expect.objectContaining({
          category: "project_fact",
          source: "explicit_project_fact",
          autoCapture: expect.objectContaining({
            template: "project_fact_generalized_named_scope",
            factFamily: "generalized_reference",
            normalizedProjectScope: "atlas forge",
            normalizedSubject: "atlas forge :: evidence dashboard",
            normalizedValue: "#atlas-rollout-evidence",
          }),
          candidateLifecycle: expect.objectContaining({
            family: "project_fact",
            state: "hold_for_more_evidence",
            factFamily: "generalized_reference",
            clusterKey: expect.any(String),
          }),
        }),
      }),
    );
  });

  it("auto-promotes a held generic project-fact cluster after later compatible evidence arrives", async () => {
    const submitLearning = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "learning" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-project-fact-generic-1",
      memoryObjectId: "memory-project-fact-generic-1",
    }));
    const inspectProjectFactLifecycle = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        pendingCandidate: {
          id: "memory-project-fact-generic-1",
          sourceEventId: "event-project-fact-generic-1",
          createdAt: "2026-04-07T08:00:00.000Z",
          updatedAt: "2026-04-07T08:00:00.000Z",
          confirmationState: "hold_for_more_evidence",
        },
        activeApprovedSubjectObjectIds: [],
        pendingSubjectCandidateIds: ["memory-project-fact-generic-1"],
      });
    const reviewCandidate = vi.fn(async () => ({
      accepted: true as const,
      reviewId: "review-project-fact-generic-1",
    }));
    const promoteToMemory = vi.fn(async () => ({
      accepted: true as const,
      promotedMemoryObjectId: "memory-approved-project-fact-generic-1",
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
        content: "For project atlas forge, the evidence dashboard is #atlas-rollout-evidence.",
        timestamp: Date.parse("2026-04-07T08:00:00Z"),
      },
    });
    await handler({
      sessionFile: "/root/.openclaw/agents/chief/sessions/example.jsonl",
      sessionKey: "agent:chief:main",
      message: {
        role: "user",
        content: "For project atlas forge, the evidence dashboard is #atlas-rollout-evidence.",
        timestamp: Date.parse("2026-04-07T08:07:00Z"),
      },
    });

    expect(submitLearning).toHaveBeenCalledTimes(1);
    expect(reviewCandidate).toHaveBeenCalledTimes(1);
    expect(reviewCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          candidateConfirmation: expect.objectContaining({
            method: "generalized_cluster_auto_review",
            clusterKey: expect.any(String),
          }),
          autoPromotion: expect.objectContaining({
            profile: "project_fact_generalized_confirmation_v1",
            factFamily: "generalized_reference",
          }),
        }),
      }),
    );
    expect(promoteToMemory).toHaveBeenCalledTimes(1);
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
    storeValidatedProcedureSemanticEmbedding.mockClear();
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
    expect(storeValidatedProcedureSemanticEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({
        config: createConfig(),
        cfg: undefined,
        agentId: "main",
        sessionKey: "agent:main:main",
        procedureId: "procedure-1",
      }),
    );
  });

  it("captures a bounded workflow improvement as an improvement candidate and promotes it after later confirming evidence", async () => {
    storeApprovedEnvironmentConstraintSemanticEmbedding.mockClear();
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
    expect(storeApprovedEnvironmentConstraintSemanticEmbedding).not.toHaveBeenCalled();
    expect(storeApprovedWorkflowToolGotchaSemanticEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({
        config: createConfig(),
        cfg: undefined,
        sessionKey: "agent:main:main",
      }),
    );
  });

  it("captures a generalized workflow lesson as a held cluster and auto-promotes it after later compatible evidence", async () => {
    const submitImprovementNote = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "improvement" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-generic-improvement-1",
      memoryObjectId: "memory-generic-improvement-1",
    }));
    const reviewCandidate = vi.fn(async () => ({
      accepted: true as const,
      status: "recorded" as const,
      candidateId: "memory-generic-improvement-1",
      outcome: "accepted" as const,
      reviewId: "review-generic-improvement-1",
      memoryObjectStateChanged: false,
      reviewState: "candidate" as const,
    }));
    const promoteToMemory = vi.fn(async () => ({
      accepted: true as const,
      status: "promoted" as const,
      candidateId: "memory-generic-improvement-1",
      promotedMemoryObjectId: "approved-generic-improvement-1",
      sourceEventId: "event-generic-improvement-1",
      reviewState: "approved" as const,
    }));
    const inspectWorkflowImprovementLifecycle = vi
      .fn()
      .mockResolvedValueOnce({
        activeApprovedSubjectObjectIds: [],
        pendingSubjectCandidateIds: [],
      })
      .mockResolvedValueOnce({
        activeApprovedSubjectObjectIds: [],
        pendingSubjectCandidateIds: ["memory-generic-improvement-1"],
        pendingCandidate: {
          id: "memory-generic-improvement-1",
          createdAt: new Date(Date.now() - 10_000).toISOString(),
          updatedAt: new Date(Date.now() - 10_000).toISOString(),
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          confirmationState: "hold_for_more_evidence",
        },
      });
    const handler = createOrdinaryTurnAutoCaptureHandler({
      config: createConfig(),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      candidateIngress: createUnusedCandidateIngress(),
      deps: {
        resolveAttribution: vi.fn(async () => ({
          agentId: "agent-uuid-generic",
          sessionId: "session-uuid-generic",
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
      sessionFile: "/root/.openclaw/agents/main/sessions/workflow-improvement-generic.jsonl",
      sessionKey: "agent:main:main",
      message: {
        role: "user",
        content:
          "For release proof notes here, use bulletized proof IDs instead of paraphrased rollout summaries.",
        timestamp: Date.parse("2026-04-06T03:10:00Z"),
      },
    };

    await handler(update);
    await handler(update);

    expect(submitImprovementNote).toHaveBeenCalledTimes(1);
    expect(submitImprovementNote).toHaveBeenCalledWith(
      expect.objectContaining({
        content:
          "Workflow improvement: for release proof notes, use bulletized proof IDs instead of paraphrased rollout summaries.",
        metadata: expect.objectContaining({
          autoCapture: expect.objectContaining({
            captureClass: "workflow_generalized_guidance",
            template: "workflow_generalized_guidance",
            lessonFamily: "generalized_workflow_lesson",
            guidancePattern: "use_instead_of",
            recommendedAction: "bulletized proof IDs",
            avoidAction: "paraphrased rollout summaries",
          }),
          candidateLifecycle: expect.objectContaining({
            family: "workflow_improvement",
            state: "hold_for_more_evidence",
            lessonFamily: "generalized_workflow_lesson",
          }),
        }),
      }),
    );
    expect(reviewCandidate).toHaveBeenCalledTimes(1);
    expect(promoteToMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "memory-generic-improvement-1",
      }),
    );
  });

  it("captures a project rule as a held cluster and auto-promotes it after later compatible evidence", async () => {
    const submitImprovementNote = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "improvement" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-project-rule-1",
      memoryObjectId: "memory-project-rule-1",
    }));
    const reviewCandidate = vi.fn(async () => ({
      accepted: true as const,
      status: "recorded" as const,
      candidateId: "memory-project-rule-1",
      outcome: "accepted" as const,
      reviewId: "review-project-rule-1",
      memoryObjectStateChanged: false,
      reviewState: "candidate" as const,
    }));
    const promoteToMemory = vi.fn(async () => ({
      accepted: true as const,
      status: "promoted" as const,
      candidateId: "memory-project-rule-1",
      promotedMemoryObjectId: "approved-project-rule-1",
      sourceEventId: "event-project-rule-1",
      reviewState: "approved" as const,
    }));
    const inspectWorkflowImprovementLifecycle = vi
      .fn()
      .mockResolvedValueOnce({
        activeApprovedSubjectObjectIds: [],
        pendingSubjectCandidateIds: [],
      })
      .mockResolvedValueOnce({
        activeApprovedSubjectObjectIds: [],
        pendingSubjectCandidateIds: ["memory-project-rule-1"],
        pendingCandidate: {
          id: "memory-project-rule-1",
          createdAt: new Date(Date.now() - 10_000).toISOString(),
          updatedAt: new Date(Date.now() - 10_000).toISOString(),
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          confirmationState: "hold_for_more_evidence",
        },
      });
    const handler = createOrdinaryTurnAutoCaptureHandler({
      config: createConfig(),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      candidateIngress: createUnusedCandidateIngress(),
      deps: {
        resolveAttribution: vi.fn(async () => ({
          agentId: "agent-uuid-project-rule",
          sessionId: "session-uuid-project-rule",
          projectId: "00000000-0000-4000-8000-000000000777",
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
      sessionFile: "/root/.openclaw/agents/main/sessions/project-rule-generic.jsonl",
      sessionKey: "agent:main:main",
      message: {
        role: "user",
        content:
          "For project Atlas, use generated audit IDs for audit events instead of client timestamps.",
        timestamp: Date.parse("2026-04-06T03:12:00Z"),
      },
    };

    await handler(update);
    await handler({
      ...update,
      message: {
        role: "user",
        content:
          "For project Atlas, prefer generated audit IDs for audit events instead of client timestamps.",
        timestamp: Date.parse("2026-04-06T03:12:10Z"),
      },
    });

    expect(submitImprovementNote).toHaveBeenCalledTimes(1);
    expect(submitImprovementNote).toHaveBeenCalledWith(
      expect.objectContaining({
        content:
          "Project rule [Atlas]: for project Atlas, use generated audit IDs for audit events instead of client timestamps.",
        metadata: expect.objectContaining({
          category: "project_rule",
          source: "explicit_project_rule",
          autoCapture: expect.objectContaining({
            captureClass: "project_rule_guidance",
            template: "project_rule_guidance",
            lessonFamily: "generalized_project_rule",
            projectScope: "Atlas",
            guidancePattern: "use_instead_of",
            recommendedAction: "generated audit IDs",
            avoidAction: "client timestamps",
          }),
          candidateLifecycle: expect.objectContaining({
            family: "workflow_improvement",
            state: "hold_for_more_evidence",
            lessonFamily: "generalized_project_rule",
          }),
        }),
      }),
    );
    expect(reviewCandidate).toHaveBeenCalledTimes(1);
    expect(promoteToMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "memory-project-rule-1",
      }),
    );
  });

  it("captures an unmet need as a held cluster and auto-promotes it after later compatible evidence", async () => {
    const submitImprovementNote = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "improvement" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-unmet-need-1",
      memoryObjectId: "memory-unmet-need-1",
    }));
    const reviewCandidate = vi.fn(async () => ({
      accepted: true as const,
      status: "recorded" as const,
      candidateId: "memory-unmet-need-1",
      outcome: "accepted" as const,
      reviewId: "review-unmet-need-1",
      memoryObjectStateChanged: false,
      reviewState: "candidate" as const,
    }));
    const promoteToMemory = vi.fn(async () => ({
      accepted: true as const,
      status: "promoted" as const,
      candidateId: "memory-unmet-need-1",
      promotedMemoryObjectId: "approved-unmet-need-1",
      sourceEventId: "event-unmet-need-1",
      reviewState: "approved" as const,
    }));
    const inspectWorkflowImprovementLifecycle = vi
      .fn()
      .mockResolvedValueOnce({
        activeApprovedSubjectObjectIds: [],
        pendingSubjectCandidateIds: [],
      })
      .mockResolvedValueOnce({
        activeApprovedSubjectObjectIds: [],
        pendingSubjectCandidateIds: ["memory-unmet-need-1"],
        pendingCandidate: {
          id: "memory-unmet-need-1",
          createdAt: new Date(Date.now() - 10_000).toISOString(),
          updatedAt: new Date(Date.now() - 10_000).toISOString(),
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          confirmationState: "hold_for_more_evidence",
        },
      });
    const handler = createOrdinaryTurnAutoCaptureHandler({
      config: createConfig(),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      candidateIngress: createUnusedCandidateIngress(),
      deps: {
        resolveAttribution: vi.fn(async () => ({
          agentId: "agent-uuid-unmet-need",
          sessionId: "session-uuid-unmet-need",
          projectId: "00000000-0000-4000-8000-000000000888",
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
      sessionFile: "/root/.openclaw/agents/main/sessions/unmet-need-generic.jsonl",
      sessionKey: "agent:main:main",
      message: {
        role: "user",
        content: "For project Atlas, we need a release evidence template for rollout audits.",
        timestamp: Date.parse("2026-04-07T03:18:00Z"),
      },
    };

    await handler(update);
    await handler({
      ...update,
      message: {
        role: "user",
        content: "For project Atlas, we're missing a release evidence template for rollout audits.",
        timestamp: Date.parse("2026-04-07T03:18:10Z"),
      },
    });

    expect(submitImprovementNote).toHaveBeenCalledTimes(1);
    expect(submitImprovementNote).toHaveBeenCalledWith(
      expect.objectContaining({
        content:
          "Unmet need [Atlas]: for project Atlas, we need a release evidence template for rollout audits.",
        metadata: expect.objectContaining({
          category: "unmet_need",
          source: "explicit_unmet_need",
          autoCapture: expect.objectContaining({
            captureClass: "unmet_need_recommendation",
            template: "unmet_need_recommendation",
            lessonFamily: "generalized_unmet_need",
            projectScope: "Atlas",
            needCategory: "missing_workflow_support",
            neededCapability: "a release evidence template",
            recommendationMode: "recommendation_only",
          }),
          candidateLifecycle: expect.objectContaining({
            family: "workflow_improvement",
            state: "hold_for_more_evidence",
            lessonFamily: "generalized_unmet_need",
          }),
        }),
      }),
    );
    expect(reviewCandidate).toHaveBeenCalledTimes(1);
    expect(promoteToMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "memory-unmet-need-1",
      }),
    );
  });

  it("induces a reviewed phrase pattern when a later paraphrase hits an already approved generalized lesson", async () => {
    maybeInduceWorkflowPhrasePattern.mockClear();
    const handler = createOrdinaryTurnAutoCaptureHandler({
      config: createConfig(),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      candidateIngress: createUnusedCandidateIngress(),
      deps: {
        resolveAttribution: vi.fn(async () => ({
          agentId: "agent-uuid-generic",
          sessionId: "session-uuid-generic",
          projectId: "00000000-0000-4000-8000-000000000321",
        })),
        submitLearning: vi.fn(),
        submitCorrectionSuggestion: vi.fn(),
        submitProcedureSuggestion: vi.fn(),
        submitImprovementNote: vi.fn(),
        reviewCandidate: vi.fn(),
        promoteToMemory: vi.fn(),
        promoteToProcedureDraft: vi.fn(),
        validateProcedure: vi.fn(),
        inspectWorkflowImprovementLifecycle: vi.fn(async () => ({
          matchingApprovedObjectId: "approved-generic-improvement-1",
          activeApprovedSubjectObjectIds: ["approved-generic-improvement-1"],
          pendingSubjectCandidateIds: [],
          activeApprovedSubjectEntries: [],
          pendingSubjectCandidates: [],
        })),
      },
    });

    await handler({
      sessionFile: "/root/.openclaw/agents/main/sessions/workflow-improvement-generic.jsonl",
      sessionKey: "agent:main:main",
      message: {
        role: "user",
        content:
          "Use bulletized proof IDs for release proof notes instead of paraphrased rollout summaries.",
        timestamp: Date.parse("2026-04-06T03:11:00Z"),
      },
    });

    expect(maybeInduceWorkflowPhrasePattern).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Use bulletized proof IDs for release proof notes instead of paraphrased rollout summaries.",
        projectId: "00000000-0000-4000-8000-000000000321",
        detectionSource: "semantic",
        targetMatch: expect.objectContaining({
          lessonFamily: "generalized_workflow_lesson",
          guidancePattern: "use_instead_of",
          subject: "release proof notes",
        }),
      }),
    );
  });

  it("stores an approved environment-constraint semantic embedding after auto-promotion", async () => {
    storeApprovedEnvironmentConstraintSemanticEmbedding.mockClear();
    const reviewCandidate = vi.fn(async () => ({
      accepted: true as const,
      status: "recorded" as const,
      candidateId: "memory-improvement-env-1",
      outcome: "accepted" as const,
      reviewId: "review-improvement-env-1",
      memoryObjectStateChanged: false,
      reviewState: "candidate" as const,
    }));
    const promoteToMemory = vi.fn(async () => ({
      accepted: true as const,
      status: "promoted" as const,
      candidateId: "memory-improvement-env-1",
      promotedMemoryObjectId: "approved-environment-1",
      sourceEventId: "event-improvement-env-1",
      reviewState: "approved" as const,
    }));
    const submitImprovementNote = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "improvement" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-improvement-env-1",
      memoryObjectId: "memory-improvement-env-1",
    }));
    const inspectWorkflowImprovementLifecycle = vi
      .fn()
      .mockResolvedValueOnce({
        activeApprovedSubjectObjectIds: [],
        pendingSubjectCandidateIds: [],
      })
      .mockResolvedValueOnce({
        activeApprovedSubjectObjectIds: [],
        pendingSubjectCandidateIds: ["memory-improvement-env-1"],
        pendingCandidate: {
          id: "memory-improvement-env-1",
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
          agentId: "agent-uuid-6",
          sessionId: "session-uuid-6",
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
      sessionFile: "/root/.openclaw/agents/main/sessions/workflow-environment.jsonl",
      sessionKey: "agent:main:main",
      message: {
        role: "user",
        content: "python isn't available on this host, so use node instead.",
        timestamp: Date.parse("2026-04-06T00:20:00Z"),
      },
    };

    await handler(update);
    await handler(update);

    expect(reviewCandidate).toHaveBeenCalledTimes(1);
    expect(promoteToMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "memory-improvement-env-1",
      }),
    );
    expect(storeApprovedEnvironmentConstraintSemanticEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({
        config: createConfig(),
        cfg: undefined,
        sessionKey: "agent:main:main",
        memoryObjectId: "approved-environment-1",
      }),
    );
  });

  it("stores an approved workflow-tool-gotcha semantic embedding after auto-promotion", async () => {
    storeApprovedWorkflowToolGotchaSemanticEmbedding.mockClear();
    const reviewCandidate = vi.fn(async () => ({
      accepted: true as const,
      status: "recorded" as const,
      candidateId: "memory-improvement-tool-1",
      outcome: "accepted" as const,
      reviewId: "review-improvement-tool-1",
      memoryObjectStateChanged: false,
      reviewState: "candidate" as const,
    }));
    const promoteToMemory = vi.fn(async () => ({
      accepted: true as const,
      status: "promoted" as const,
      candidateId: "memory-improvement-tool-1",
      promotedMemoryObjectId: "approved-tool-gotcha-1",
      sourceEventId: "event-improvement-tool-1",
      reviewState: "approved" as const,
    }));
    const submitImprovementNote = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "improvement" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-improvement-tool-1",
      memoryObjectId: "memory-improvement-tool-1",
    }));
    const inspectWorkflowImprovementLifecycle = vi
      .fn()
      .mockResolvedValueOnce({
        activeApprovedSubjectObjectIds: [],
        pendingSubjectCandidateIds: [],
      })
      .mockResolvedValueOnce({
        activeApprovedSubjectObjectIds: [],
        pendingSubjectCandidateIds: ["memory-improvement-tool-1"],
        pendingCandidate: {
          id: "memory-improvement-tool-1",
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
          agentId: "agent-uuid-6",
          sessionId: "session-uuid-6",
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
      sessionFile: "/root/.openclaw/agents/main/sessions/workflow-tool.jsonl",
      sessionKey: "agent:main:main",
      message: {
        role: "user",
        content: "scripts/committer keeps commit staging scoped here.",
        timestamp: Date.parse("2026-04-06T04:20:00Z"),
      },
    };

    await handler(update);
    await handler({
      ...update,
      message: {
        ...update.message,
        content:
          'Use scripts/committer "<msg>" <file...> instead of manual git add and git commit.',
      },
    });

    expect(reviewCandidate).toHaveBeenCalledTimes(1);
    expect(promoteToMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "memory-improvement-tool-1",
      }),
    );
    expect(storeApprovedWorkflowToolGotchaSemanticEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({
        config: createConfig(),
        cfg: undefined,
        sessionKey: "agent:main:main",
        memoryObjectId: "approved-tool-gotcha-1",
      }),
    );
  });

  it("captures the docs-only validation lesson without enabling semantic fallback writes", async () => {
    storeApprovedWorkflowToolGotchaSemanticEmbedding.mockClear();
    const reviewCandidate = vi.fn(async () => ({
      accepted: true as const,
      status: "recorded" as const,
      candidateId: "memory-improvement-docs-1",
      outcome: "accepted" as const,
      reviewId: "review-improvement-docs-1",
      memoryObjectStateChanged: false,
      reviewState: "candidate" as const,
    }));
    const promoteToMemory = vi.fn(async () => ({
      accepted: true as const,
      status: "promoted" as const,
      candidateId: "memory-improvement-docs-1",
      promotedMemoryObjectId: "approved-docs-workflow-1",
      sourceEventId: "event-improvement-docs-1",
      reviewState: "approved" as const,
    }));
    const submitImprovementNote = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "improvement" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-improvement-docs-1",
      memoryObjectId: "memory-improvement-docs-1",
    }));
    const inspectWorkflowImprovementLifecycle = vi
      .fn()
      .mockResolvedValueOnce({
        activeApprovedSubjectObjectIds: [],
        pendingSubjectCandidateIds: [],
      })
      .mockResolvedValueOnce({
        activeApprovedSubjectObjectIds: [],
        pendingSubjectCandidateIds: ["memory-improvement-docs-1"],
        pendingCandidate: {
          id: "memory-improvement-docs-1",
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
          agentId: "agent-uuid-6b",
          sessionId: "session-uuid-6b",
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

    await handler({
      sessionFile: "/root/.openclaw/agents/main/sessions/workflow-docs.jsonl",
      sessionKey: "agent:main:main",
      message: {
        role: "user",
        content:
          "For docs-only work here, use pnpm check:fast instead of full pnpm check or pnpm build.",
        timestamp: Date.parse("2026-04-07T00:20:00Z"),
      },
    });
    await handler({
      sessionFile: "/root/.openclaw/agents/main/sessions/workflow-docs.jsonl",
      sessionKey: "agent:main:main",
      message: {
        role: "user",
        content:
          "Docs-only slices here should stay on pnpm check:fast and skip full pnpm check plus build replay.",
        timestamp: Date.parse("2026-04-07T00:21:00Z"),
      },
    });

    expect(submitImprovementNote).toHaveBeenCalledWith(
      expect.objectContaining({
        content:
          "Workflow improvement: for docs or process-only work, use pnpm check:fast instead of full pnpm check, pnpm build, or full pnpm test.",
        metadata: expect.objectContaining({
          autoCapture: expect.objectContaining({
            captureClass: "workflow_tool_gotcha",
            lessonKey: "docs_only_check_fast",
            toolKey: "validation_tier",
          }),
        }),
      }),
    );
    expect(reviewCandidate).toHaveBeenCalledTimes(1);
    expect(promoteToMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "memory-improvement-docs-1",
      }),
    );
    expect(storeApprovedWorkflowToolGotchaSemanticEmbedding).not.toHaveBeenCalled();
  });

  it("stores an approved API workaround semantic embedding after auto-promotion", async () => {
    storeApprovedApiWorkaroundSemanticEmbedding.mockClear();
    storeApprovedEnvironmentConstraintSemanticEmbedding.mockClear();
    storeApprovedWorkflowToolGotchaSemanticEmbedding.mockClear();
    const reviewCandidate = vi.fn(async () => ({
      accepted: true as const,
      status: "recorded" as const,
      candidateId: "memory-improvement-api-1",
      outcome: "accepted" as const,
      reviewId: "review-improvement-api-1",
      memoryObjectStateChanged: false,
      reviewState: "candidate" as const,
    }));
    const promoteToMemory = vi.fn(async () => ({
      accepted: true as const,
      status: "promoted" as const,
      candidateId: "memory-improvement-api-1",
      promotedMemoryObjectId: "approved-api-workaround-1",
      sourceEventId: "event-improvement-api-1",
      reviewState: "approved" as const,
    }));
    const submitImprovementNote = vi.fn(async () => ({
      accepted: true as const,
      status: "accepted" as const,
      kind: "improvement" as const,
      storage: "database" as const,
      reviewState: "candidate" as const,
      eventId: "event-improvement-api-1",
      memoryObjectId: "memory-improvement-api-1",
    }));
    const inspectWorkflowImprovementLifecycle = vi
      .fn()
      .mockResolvedValueOnce({
        activeApprovedSubjectObjectIds: [],
        pendingSubjectCandidateIds: [],
      })
      .mockResolvedValueOnce({
        activeApprovedSubjectObjectIds: [],
        pendingSubjectCandidateIds: ["memory-improvement-api-1"],
        pendingCandidate: {
          id: "memory-improvement-api-1",
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
          agentId: "agent-uuid-7",
          sessionId: "session-uuid-7",
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

    await handler({
      sessionFile: "/root/.openclaw/agents/main/sessions/workflow-api.jsonl",
      sessionKey: "agent:main:main",
      message: {
        role: "user",
        content:
          "OpenAI embeddings still need a real API key; Codex OAuth alone does not enable semantic memory search.",
        timestamp: Date.parse("2026-04-06T05:00:00Z"),
      },
    });
    await handler({
      sessionFile: "/root/.openclaw/agents/main/sessions/workflow-api.jsonl",
      sessionKey: "agent:main:main",
      message: {
        role: "user",
        content:
          "Codex OAuth does not help for OpenAI embeddings here; semantic memory search still needs a real OPENAI_API_KEY.",
        timestamp: Date.parse("2026-04-06T05:01:00Z"),
      },
    });

    expect(submitImprovementNote).toHaveBeenCalledWith(
      expect.objectContaining({
        content:
          "API workaround: OpenAI embeddings require a configured OPENAI_API_KEY or another embeddings provider; OpenClaw does not use openai-codex OAuth profiles directly for embeddings.",
        metadata: expect.objectContaining({
          autoCapture: expect.objectContaining({
            captureClass: "workflow_api_workaround",
            template: "workflow_api_workaround",
            lessonKey: "openai_embeddings_api_key_required",
            toolKey: "openai_embeddings",
          }),
        }),
      }),
    );
    expect(reviewCandidate).toHaveBeenCalledTimes(1);
    expect(promoteToMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "memory-improvement-api-1",
      }),
    );
    expect(storeApprovedApiWorkaroundSemanticEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({
        config: createConfig(),
        cfg: undefined,
        sessionKey: "agent:main:main",
        memoryObjectId: "approved-api-workaround-1",
      }),
    );
    expect(storeApprovedEnvironmentConstraintSemanticEmbedding).not.toHaveBeenCalled();
    expect(storeApprovedWorkflowToolGotchaSemanticEmbedding).not.toHaveBeenCalled();
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
