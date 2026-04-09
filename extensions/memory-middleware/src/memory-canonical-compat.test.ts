import { describe, expect, it } from "vitest";
import {
  buildCanonicalMemoryIngestionCandidateFromAutoCaptureMatch,
  buildCanonicalMemoryIngestionCandidateFromResolvedIngestion,
  buildCanonicalMemoryRecordFromResolvedIngestion,
  isCanonicalizableResolvedResponseStyleIngestion,
  readCanonicalFirstMetadataString,
  readCanonicalMemoryIngestionCandidateFromMetadata,
  readCanonicalMemoryRecordFromMetadata,
} from "./memory-canonical-compat.js";
import type {
  ResolvedProjectFactIngestion,
  ResolvedResponseStyleIngestion,
  ResolvedWorkflowIngestion,
} from "./memory-ingestion-resolver.js";

describe("memory-canonical-compat", () => {
  it("maps project facts into canonical project records", () => {
    const record = buildCanonicalMemoryRecordFromResolvedIngestion({
      ingestion: {
        familyId: "project_fact",
        parsed: {
          profile: "user-preference-v2",
          captureClass: "explicit_project_fact",
          candidateKind: "learning",
          reasonCode: "explicit_project_fact_statement",
          template: "project_fact_named_scope",
          subject: "atlas forge / staging branch",
          value: "atlas-staging",
          normalizedSubject: "atlas forge / staging branch",
          normalizedValue: "atlas-staging",
          content: "For project atlas forge, the staging branch is atlas-staging.",
          subjectKey: "atlas-forge:staging-branch",
          key: "project-fact-1",
          projectScope: "atlas forge",
          normalizedProjectScope: "atlas forge",
        },
        factFamily: "supported_field",
        fieldKey: "staging_branch",
        reviewMode: "pending_confirmation",
        source: "content",
        detectionSource: "semantic",
        confidence: "high",
        evidence: ["supported_field_match"],
        observedText: "For project atlas forge, the staging branch is atlas-staging.",
      } satisfies ResolvedProjectFactIngestion,
      projectId: "atlas-forge",
      captureSeam: "ordinary_turn_auto_capture",
      captureProfile: "user-preference-v2",
      sourceAgent: "main",
      sourceSession: "agent:main:main",
      sourceEvent: "event-project-fact-1",
    });

    expect(record).toMatchObject({
      kind: "project",
      scope: { kind: "project", projectId: "atlas-forge" },
      validationStatus: "pending_confirmation",
      compatibility: {
        captureCategory: "project_fact",
      },
      facets: {
        fact: true,
        project_scope: true,
        fieldKey: "staging_branch",
        factFamily: "supported_field",
      },
    });
  });

  it("maps workflow guidance into canonical feedback records", () => {
    const record = buildCanonicalMemoryRecordFromResolvedIngestion({
      ingestion: {
        captureCategory: "workflow_improvement",
        parsed: {
          profile: "user-preference-v2",
          captureClass: "workflow_generalized_guidance",
          candidateKind: "improvement",
          reasonCode: "workflow_generalized_guidance_statement",
          template: "workflow_generalized_guidance",
          lessonFamily: "generalized_workflow_lesson",
          guidancePattern: "use_instead_of",
          subject: "lazy-loading boundary",
          value: "open the affected path once after the import change",
          normalizedSubject: "lazy-loading boundary",
          normalizedValue: "open the affected path once after the import change",
          content: "If lazy-loading changed, open the affected path once.",
          subjectKey: "lazy-loading-boundary",
          key: "workflow-1",
          projectScope: "atlas forge",
          normalizedProjectScope: "atlas forge",
          recommendedAction: "use pnpm check:fast",
          normalizedRecommendedAction: "use pnpm check:fast",
        },
        lessonFamily: "generalized_workflow_lesson",
        guidancePattern: "use_instead_of",
        reviewMode: "hold_for_more_evidence",
        source: "content",
        detectionSource: "semantic",
        confidence: "medium",
        evidence: ["workflow_guidance_match"],
        observedText: "If lazy-loading changed, open the affected path once.",
      } satisfies ResolvedWorkflowIngestion,
      projectId: "atlas-forge",
      captureSeam: "memory_ingestion_resolver",
    });

    expect(record).toMatchObject({
      kind: "feedback",
      scope: { kind: "project", projectId: "atlas-forge" },
      validationStatus: "hold_for_more_evidence",
      tags: expect.arrayContaining(["workflow_improvement", "semantic_ingestion"]),
      facets: {
        workflow_guidance: true,
        validated_approach: true,
        lessonFamily: "generalized_workflow_lesson",
        guidancePattern: "use_instead_of",
      },
    });
  });

  it("keeps response-style forget actions out of canonical durable record creation", () => {
    const forgetIngestion = {
      action: "forget",
      familyId: "response_style",
      source: "content",
      detectionSource: "semantic",
      confidence: "high",
      evidence: ["forget_match"],
      subject: "responses concise",
      subjectKey: "responses_concise",
      observedText: "Stop being concise.",
    } satisfies ResolvedResponseStyleIngestion;

    expect(isCanonicalizableResolvedResponseStyleIngestion(forgetIngestion)).toBe(false);
  });

  it("wraps resolved workflow ingestions as canonical ingestion candidates", () => {
    const candidate = buildCanonicalMemoryIngestionCandidateFromResolvedIngestion({
      ingestion: {
        captureCategory: "workflow_improvement",
        parsed: {
          profile: "user-preference-v2",
          captureClass: "project_rule_guidance",
          candidateKind: "improvement",
          reasonCode: "project_rule_guidance_statement",
          template: "project_rule_guidance",
          lessonFamily: "generalized_project_rule",
          guidancePattern: "use_instead_of",
          subject: "docs localization changes",
          value: "update English docs first and rerun docs i18n",
          normalizedSubject: "docs localization changes",
          normalizedValue: "update english docs first and rerun docs i18n",
          content:
            "Update English docs first and rerun docs i18n instead of editing docs/zh-CN directly.",
          subjectKey: "docs-localization-changes",
          key: "workflow-candidate-1",
          projectScope: "OpenClaw",
          normalizedProjectScope: "openclaw",
          recommendedAction: "update English docs first and rerun docs i18n",
          normalizedRecommendedAction: "update english docs first and rerun docs i18n",
          avoidAction: "edit docs/zh-CN directly",
          normalizedAvoidAction: "edit docs/zh-cn directly",
        },
        lessonFamily: "generalized_project_rule",
        guidancePattern: "use_instead_of",
        reviewMode: "hold_for_more_evidence",
        source: "transcript",
        detectionSource: "semantic",
        confidence: "medium",
        evidence: ["project_rule_match"],
        observedText:
          "Update English docs first and rerun docs i18n instead of editing docs/zh-CN directly.",
      } satisfies ResolvedWorkflowIngestion,
      mode: "ordinary_turn",
      captureSeam: "ordinary_turn_auto_capture",
    });

    expect(candidate).toMatchObject({
      record: {
        kind: "feedback",
        facets: {
          lessonFamily: "generalized_project_rule",
          guidancePattern: "use_instead_of",
        },
      },
      identity: {
        dedupeKey: "workflow-candidate-1",
        clusterKey: "workflow-candidate-1",
        subjectKey: "docs-localization-changes",
      },
      capture: {
        mode: "ordinary_turn",
        source: "transcript",
        evidence: ["project_rule_match"],
        reviewMode: "hold_for_more_evidence",
      },
      compatibility: {
        candidateKind: "improvement",
        captureClass: "project_rule_guidance",
      },
    });
  });

  it("wraps ordinary-turn matches as canonical ingestion candidates", () => {
    const candidate = buildCanonicalMemoryIngestionCandidateFromAutoCaptureMatch({
      familyId: "workflow_improvement",
      match: {
        profile: "user-preference-v2",
        captureClass: "project_rule_guidance",
        candidateKind: "improvement",
        reasonCode: "project_rule_guidance_statement",
        template: "project_rule_guidance",
        lessonFamily: "generalized_project_rule",
        guidancePattern: "use_instead_of",
        subject: "docs localization changes",
        value: "update English docs first and rerun docs i18n",
        normalizedSubject: "docs localization changes",
        normalizedValue: "update english docs first and rerun docs i18n",
        content:
          "Update English docs first and rerun docs i18n instead of editing docs/zh-CN directly.",
        subjectKey: "docs-localization-changes",
        key: "ordinary-turn-workflow-1",
        projectScope: "OpenClaw",
        normalizedProjectScope: "openclaw",
        recommendedAction: "update English docs first and rerun docs i18n",
        normalizedRecommendedAction: "update english docs first and rerun docs i18n",
        avoidAction: "edit docs/zh-CN directly",
        normalizedAvoidAction: "edit docs/zh-cn directly",
      },
      reviewMode: "hold_for_more_evidence",
      detectionSource: "semantic",
      evidence: ["workflow_guidance_match"],
      observedText:
        "Update English docs first and rerun docs i18n instead of editing docs/zh-CN directly.",
      projectId: "openclaw",
      captureSeam: "ordinary_turn_auto_capture",
      captureProfile: "user-preference-v2",
    });

    expect(candidate).toMatchObject({
      record: {
        kind: "feedback",
        facets: {
          lessonFamily: "generalized_project_rule",
          guidancePattern: "use_instead_of",
          recommendedAction: "update English docs first and rerun docs i18n",
          avoidAction: "edit docs/zh-CN directly",
        },
      },
      identity: {
        dedupeKey: "ordinary-turn-workflow-1",
        clusterKey: "ordinary-turn-workflow-1",
        subjectKey: "docs-localization-changes",
      },
      capture: {
        mode: "ordinary_turn",
        source: "transcript",
        evidence: ["workflow_guidance_match"],
      },
      compatibility: {
        candidateKind: "improvement",
        captureClass: "project_rule_guidance",
      },
    });
  });

  it("reads canonical records from root, candidate, and promotion metadata seams", () => {
    expect(
      readCanonicalMemoryRecordFromMetadata({
        candidateMetadata: {
          canonicalIngestionCandidate: {
            record: {
              kind: "feedback",
              subject: "docs localization changes",
              statement: "update English docs first",
              tags: ["workflow_guidance", "feedback"],
              facets: {
                guidancePattern: "use_instead_of",
              },
              compatibility: {
                captureCategory: "workflow_improvement",
              },
            },
          },
        },
      }),
    ).toMatchObject({
      kind: "feedback",
      subject: "docs localization changes",
      statement: "update English docs first",
      tags: ["workflow_guidance", "feedback"],
      facets: {
        guidancePattern: "use_instead_of",
      },
      compatibility: {
        captureCategory: "workflow_improvement",
      },
    });
  });

  it("reads canonical candidate aliases before legacy auto-capture metadata", () => {
    const metadata = {
      candidateMetadata: {
        canonicalIngestionCandidate: {
          record: {
            kind: "feedback",
            subject: "docs localization changes",
            statement: "update English docs first",
            facets: {
              guidancePattern: "use_instead_of",
            },
            compatibility: {
              captureCategory: "workflow_improvement",
            },
          },
          identity: {
            dedupeKey: "workflow-candidate-1",
            subjectKey: "docs-localization-changes",
          },
          compatibility: {
            candidateKind: "improvement",
            captureClass: "project_rule_guidance",
            reasonCode: "project_rule_guidance_statement",
            template: "project_rule_guidance",
          },
        },
        autoCapture: {
          lessonKey: "legacy_should_not_win",
        },
      },
    } satisfies Record<string, unknown>;

    expect(
      readCanonicalFirstMetadataString(metadata, [
        "candidateMetadata",
        "autoCapture",
        "guidancePattern",
      ]),
    ).toBe("use_instead_of");
    expect(
      readCanonicalFirstMetadataString(metadata, ["candidateMetadata", "autoCapture", "key"]),
    ).toBe("workflow-candidate-1");
    expect(
      readCanonicalFirstMetadataString(metadata, [
        "candidateMetadata",
        "autoCapture",
        "subjectKey",
      ]),
    ).toBe("docs-localization-changes");
  });

  it("reads canonical ingestion candidate envelopes from metadata seams", () => {
    const candidate = readCanonicalMemoryIngestionCandidateFromMetadata({
      canonicalIngestionCandidate: {
        record: {
          kind: "reference",
          subject: "docs updating",
          statement: "use docs i18n after English changes",
          tags: ["reference"],
          facets: {
            guidancePattern: "use_instead_of",
          },
          compatibility: {
            captureCategory: "workflow_improvement",
          },
        },
        identity: {
          dedupeKey: "reference-1",
          subjectKey: "docs-updating",
        },
        capture: {
          mode: "candidate_improvement",
          source: "tool",
          reviewMode: "hold_for_more_evidence",
        },
        compatibility: {
          candidateKind: "improvement",
          captureClass: "project_rule_guidance",
          template: "project_rule_guidance",
          metadata: {
            lessonFamily: "generalized_project_rule",
          },
        },
      },
    });

    expect(candidate).toMatchObject({
      record: {
        kind: "reference",
        subject: "docs updating",
      },
      identity: {
        dedupeKey: "reference-1",
        subjectKey: "docs-updating",
      },
      compatibility: {
        captureClass: "project_rule_guidance",
      },
    });
  });
});
