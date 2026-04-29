import { describe, expect, it } from "vitest";
import {
  buildDeterministicJudgmentAuditReport,
  renderDeterministicJudgmentAuditMarkdown,
} from "./phase2-deterministic-judgment-audit.ts";

describe("phase2 deterministic judgment audit", () => {
  it("keeps deterministic guardrails allowed", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "guardrails.ts",
          text: [
            "const deterministicId = sha256JsonValue({ sourceRef, schemaVersion });",
            "validateSchemaAndRedactSecrets(packet);",
            "const cooldownHit = recentEpisodeKeys.includes(episodeKey);",
          ].join("\n"),
        },
      ],
    });

    expect(report.semanticJudgmentReviewCount).toBe(0);
    expect(report.allowedGuardrailCount).toBeGreaterThan(0);
    expect(report.classificationCounts.valid_guardrail).toBeGreaterThan(0);
    expect(report.aggressiveEliminationRequiredCount).toBe(0);
    expect(report.interpretation.deterministicGuardrailsRemainAllowed).toContain("hashes");
  });

  it("aggressively classifies deterministic semantic judgment for model ownership", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "bad-surfacing.ts",
          text: [
            "function classifyCandidateMeaning(text: string) { return text.includes('skill'); }",
            "const shouldSurface = topicScore > 0.7;",
            "const usefulCandidate = keywordHeuristic(candidate);",
          ].join("\n"),
        },
      ],
    });

    expect(report.semanticJudgmentReviewCount).toBeGreaterThanOrEqual(2);
    expect(report.classificationCounts.runtime_elimination_debt).toBeGreaterThanOrEqual(1);
    expect(report.aggressiveEliminationRequiredCount).toBeGreaterThanOrEqual(2);
    expect(report.findings.some((finding) => finding.matchedPattern === "classification")).toBe(
      true,
    );
    expect(
      report.findings.some((finding) => finding.matchedPattern === "keyword_topic_heuristic"),
    ).toBe(true);
  });

  it("defaults mixed runtime semantic and guardrail lines to model-owned judgment", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "mixed.ts",
          text: "const shouldSurface = validateRefsAndRankByIntent(candidate, allowedRefs);",
        },
      ],
    });

    expect(report.ambiguousReviewCount).toBe(1);
    expect(report.findings[0]?.findingClass).toBe("ambiguous_review");
    expect(report.findings[0]?.classification).toBe("runtime_elimination_debt");
    expect(report.findings[0]?.recommendedAction).toBe("move_to_model_review");
  });

  it("preserves explicit structural retrieval constraints separately from value judgment", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/runtime/retrieval/candidate-recall.ts",
          text: "const rank = `${candidate.kind}:${candidate.sourceRef}:${candidate.createdAt}`;",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("acceptable_structural_retrieval_logic");
    expect(report.findings[0]?.recommendedAction).toBe("document_guardrail");
  });

  it("marks runtime legacy fallback heuristics as remove candidates", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/legacy-fallback-registry.ts",
          text: "const shouldSurface = keywordHeuristic(topicLabel) > 0.5;",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("runtime_elimination_debt");
    expect(report.findings[0]?.recommendedAction).toBe("remove");
  });

  it("keeps harmless non-runtime fixture references out of aggressive debt", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/runtime/phase2-deterministic-judgment-audit.test.ts",
          text: "it('mentions semantic extraction fixtures', () => {});",
        },
      ],
    });

    expect(report.findings[0]?.scope).toBe("test_proof_or_script");
    expect(report.findings[0]?.classification).toBe("fixture_reference_noise");
    expect(report.nonRuntimeFindingCount).toBe(1);
    expect(report.runtimeFindingCount).toBe(0);
    expect(report.aggressiveEliminationRequiredCount).toBe(0);
  });

  it("marks tests that enshrine deterministic surfacing as debt", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/runtime/bad-surfacing.test.ts",
          text: "expect(shouldSurfaceFromKeywordScore(candidate)).toBe(true);",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("test_enshrinement_debt");
    expect(report.findings[0]?.recommendedAction).toBe("remove_or_rewrite_test");
    expect(report.testEnshrinementDebtCount).toBe(1);
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("keeps quarantine tests as guardrails when they assert absence of legacy semantics", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/runtime/retrieval/semantic-forest-quarantine.test.ts",
          text: 'expect(runtimeSource).not.toContain("semantic-collision-adjudication.ts");',
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.testEnshrinementDebtCount).toBe(0);
  });

  it("does not allow renamed signal weights to evade surfacing debt", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/runtime/renamed-helper.ts",
          text: "const shouldSurface = candidate.signalWeight > 0.72;",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("runtime_elimination_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("keeps audit scaffolding out of priority hotspots", () => {
    const auditPath = "extensions/model-memory/src/runtime/phase2-deterministic-judgment-audit.ts";
    const runtimePath = "extensions/model-memory/src/retrieval.ts";
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: auditPath,
          text: "const shouldSurface = keywordHeuristic(topicLabel) > 0.5;",
        },
        {
          path: runtimePath,
          text: "const shouldSurface = keywordHeuristic(topicLabel) > 0.5;",
        },
      ],
    });

    expect(report.priorityHotspots.map((hotspot) => hotspot.filePath)).not.toContain(auditPath);
    expect(report.priorityHotspots[0]?.filePath).toBe(runtimePath);
  });

  it("does not count comment-only prose as executable judgment debt", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "src/infra/resolve-system-bin.ts",
          text: [
            " * binaries like openssl where a compromised binary has high impact.",
            "const safePath = validateSystemBinaryPath(input);",
          ].join("\n"),
        },
      ],
    });

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.matchedPattern).toBe("schema_validation");
  });

  it("treats schema inference declarations as guardrails, not semantic debt", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/semantic-schema.ts",
          text: "export type CanonicalClass = z.infer<typeof CanonicalClassSchema>;",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.aggressiveEliminationRequiredCount).toBe(0);
  });

  it("treats declarative fallback registries as policy metadata, not fallback execution", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/legacy-fallback-registry.ts",
          text: 'surface: "semantic-collision-adjudication.ts",',
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.aggressiveEliminationRequiredCount).toBe(0);
  });

  it("does not confuse structural surface ids or scorecard names with surfacing judgment", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "src/agents/model-memory.recovery.ts",
          text: [
            'surfaceId: "capture_jobs",',
            'title: "Provider Scorecards",',
            'description: "Provider scorecard events are readable.",',
          ].join("\n"),
        },
      ],
    });

    expect(report.findings.every((finding) => finding.classification === "valid_guardrail")).toBe(
      true,
    );
    expect(report.aggressiveEliminationRequiredCount).toBe(0);
  });

  it("renders a bounded markdown inventory", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [{ path: "bad.ts", text: "const shouldSurface = keywordScore > 0;" }],
    });

    expect(renderDeterministicJudgmentAuditMarkdown(report)).toContain(
      "This is an aggressive elimination plan, not proof",
    );
  });
});
