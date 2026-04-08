import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryMiddlewareConfig } from "./config.js";
import type { ApprovedResponseStylePhrasePatternMatch } from "./response-style-phrase-induction.js";
import type { ApprovedWorkflowPhrasePatternMatch } from "./workflow-phrase-induction.js";

const findApprovedWorkflowPhrasePatternMatch = vi.hoisted(() =>
  vi.fn<() => Promise<ApprovedWorkflowPhrasePatternMatch | null>>(async () => null),
);
const findApprovedResponseStylePhrasePatternMatch = vi.hoisted(() =>
  vi.fn<() => Promise<ApprovedResponseStylePhrasePatternMatch | null>>(async () => null),
);

vi.mock("./workflow-phrase-induction.js", async () => {
  const actual = await vi.importActual<typeof import("./workflow-phrase-induction.js")>(
    "./workflow-phrase-induction.js",
  );
  return {
    ...actual,
    findApprovedWorkflowPhrasePatternMatch,
  };
});
vi.mock("./response-style-phrase-induction.js", async () => {
  const actual = await vi.importActual<typeof import("./response-style-phrase-induction.js")>(
    "./response-style-phrase-induction.js",
  );
  return {
    ...actual,
    findApprovedResponseStylePhrasePatternMatch,
  };
});

import {
  resolveProjectFactIngestion,
  resolveRecurringProcedureIngestion,
  resolveResponseStyleIngestion,
  resolveWorkflowImprovementIngestion,
} from "./memory-ingestion-resolver.js";

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

describe("resolveWorkflowImprovementIngestion", () => {
  beforeEach(() => {
    findApprovedWorkflowPhrasePatternMatch.mockReset();
    findApprovedWorkflowPhrasePatternMatch.mockResolvedValue(null);
    findApprovedResponseStylePhrasePatternMatch.mockReset();
    findApprovedResponseStylePhrasePatternMatch.mockResolvedValue(null);
  });

  it("resolves response-style tool learning through the shared control plane", async () => {
    await expect(
      resolveResponseStyleIngestion({
        config: createConfig(),
        content: "User requirement: use plain English.",
        primarySource: "content",
        mode: "candidate_learning",
        allowPhrasePatternMatch: true,
      }),
    ).resolves.toMatchObject({
      action: "capture",
      familyId: "response_style",
      source: "content",
      detectionSource: "deterministic",
      reviewMode: "direct",
      parsed: {
        captureClass: "explicit_requirement",
        template: "responses_plain_english",
      },
    });
  });

  it("resolves project-fact correction from raw fallback through the shared control plane", async () => {
    await expect(
      resolveProjectFactIngestion({
        content: "Please save this correction.",
        primarySource: "content",
        rawCandidates: ["Actually, for project atlas forge, the staging branch is atlas-green."],
        mode: "candidate_correction",
      }),
    ).resolves.toMatchObject({
      familyId: "project_fact",
      source: "raw",
      detectionSource: "deterministic",
      reviewMode: "pending_confirmation",
      factFamily: "supported_field",
      fieldKey: "staging_branch",
      parsed: {
        captureClass: "project_fact_correction",
        template: "project_fact_named_scope",
        projectScope: "atlas forge",
      },
    });
  });

  it("resolves recurring procedures from raw fallback through the shared control plane", async () => {
    await expect(
      resolveRecurringProcedureIngestion({
        content: "Store this checklist.",
        primarySource: "content",
        rawCandidates: [
          [
            "My deploy checklist:",
            "1. Open the canary lane.",
            "2. Verify health.",
            "3. Watch the error budget.",
          ].join("\n"),
        ],
      }),
    ).resolves.toMatchObject({
      familyId: "recurring_procedure",
      source: "raw",
      detectionSource: "semantic",
      parsed: {
        captureClass: "explicit_recurring_procedure",
        procedureKey: "deploy_checklist",
      },
    });
  });

  it("resolves project-rule guidance from transcript content", async () => {
    await expect(
      resolveWorkflowImprovementIngestion({
        config: createConfig(),
        content:
          "For project Atlas, use generated audit IDs for audit events instead of client timestamps.",
        primarySource: "transcript",
        allowPhrasePatternMatch: false,
      }),
    ).resolves.toMatchObject({
      familyId: "project_rule",
      lessonFamily: "generalized_project_rule",
      source: "transcript",
      detectionSource: "semantic",
      reviewMode: "hold_for_more_evidence",
      parsed: {
        captureClass: "project_rule_guidance",
        projectScope: "Atlas",
        guidancePattern: "use_instead_of",
        recommendedAction: "generated audit IDs",
        avoidAction: "client timestamps",
      },
    });
    expect(findApprovedWorkflowPhrasePatternMatch).not.toHaveBeenCalled();
  });

  it("falls back to raw unmet-need text when content does not resolve", async () => {
    await expect(
      resolveWorkflowImprovementIngestion({
        config: createConfig(),
        content: "Please store this note.",
        primarySource: "content",
        rawCandidates: [
          "For project Atlas, we need a release evidence template for rollout audits.",
        ],
        allowPhrasePatternMatch: false,
      }),
    ).resolves.toMatchObject({
      familyId: "unmet_need",
      lessonFamily: "generalized_unmet_need",
      source: "raw",
      detectionSource: "semantic",
      reviewMode: "hold_for_more_evidence",
      observedText: "For project Atlas, we need a release evidence template for rollout audits.",
      parsed: {
        captureClass: "unmet_need_recommendation",
        projectScope: "Atlas",
        neededCapability: "a release evidence template",
      },
    });
  });

  it("uses approved phrase matches only when phrase-pattern resolution is enabled", async () => {
    findApprovedWorkflowPhrasePatternMatch.mockResolvedValue({
      approvedObjectId: "approved-pattern-1",
      normalizedPhrase:
        "for release proof notes should i list proof ids as bullets instead of paraphrasing rollout summaries?",
      match: {
        captureClass: "workflow_generalized_guidance",
        candidateKind: "improvement",
        reasonCode: "workflow_generalized_guidance_statement",
        template: "workflow_generalized_guidance",
        lessonFamily: "generalized_workflow_lesson",
        guidancePattern: "use_instead_of",
        subject: "release proof notes",
        value:
          "for release proof notes, use bulletized proof IDs instead of paraphrased rollout summaries",
        normalizedSubject: "release proof notes",
        normalizedValue:
          "for release proof notes, use bulletized proof ids instead of paraphrased rollout summaries",
        content:
          "Workflow improvement: for release proof notes, use bulletized proof IDs instead of paraphrased rollout summaries.",
        subjectKey: "subject-key-1",
        key: "cluster-key-1",
        recommendedAction: "bulletized proof IDs",
        normalizedRecommendedAction: "bulletized proof ids",
        avoidAction: "paraphrased rollout summaries",
        normalizedAvoidAction: "paraphrased rollout summaries",
      },
    } satisfies ApprovedWorkflowPhrasePatternMatch);

    await expect(
      resolveWorkflowImprovementIngestion({
        config: createConfig(),
        content:
          "For release proof notes, should I list proof IDs as bullets instead of paraphrasing rollout summaries?",
        primarySource: "content",
        projectId: "00000000-0000-4000-8000-000000000123",
        allowPhrasePatternMatch: true,
      }),
    ).resolves.toMatchObject({
      familyId: "workflow_improvement",
      detectionSource: "deterministic",
      source: "content",
      evidence: ["approved_phrase_pattern_match"],
      parsed: {
        captureClass: "workflow_generalized_guidance",
        guidancePattern: "use_instead_of",
      },
    });

    expect(findApprovedWorkflowPhrasePatternMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "For release proof notes, should I list proof IDs as bullets instead of paraphrasing rollout summaries?",
        projectId: "00000000-0000-4000-8000-000000000123",
      }),
    );
  });
});
