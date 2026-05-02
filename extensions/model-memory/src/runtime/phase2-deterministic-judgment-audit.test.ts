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

  it("allows hybrid retrieval lexical graph and recency signals as recall mechanics", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/runtime/retrieval/candidate-recall.ts",
          text: [
            "const lexicalScore = lexicalMatch(query, candidate.searchText);",
            "const graphScore = graphNeighborIds.has(candidate.id) ? 1 : 0;",
            "const recencyScore = recencyBucket(candidate.updatedAt);",
            "return rankRetrievalCandidates(candidates, { lexicalScore, graphScore, recencyScore });",
          ].join("\n"),
        },
      ],
    });

    expect(report.findings.length).toBeGreaterThan(0);
    expect(
      report.findings.every(
        (finding) => finding.classification === "acceptable_structural_retrieval_logic",
      ),
    ).toBe(true);
    expect(report.aggressiveEliminationRequiredCount).toBe(0);
  });

  it("does not allow retrieval-style scores to become proactivity or card value judgment", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/runtime/phase2-product-proactivity-presentation.ts",
          text: "const shouldSurface = lexicalScore + recencyScore > 0.8;",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("runtime_elimination_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
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

  it("allows model-owned memory proof fixture text without allowing runtime judgment", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "scripts/model-memory-phase2-model-owned-memory-capture-retrieval-proof.mjs",
          text: [
            '"Operational rule one: deterministic code may assemble source windows structurally by source, recency, explicit refs, session, project, and size caps. It must not select text because it appears useful."',
            '"Operational rule five: retrieval recall remains deterministic and scalable. Final context-pack inclusion belongs to the model."',
          ].join("\n"),
        },
        {
          path: "src/infra/model-memory-codex-capture-runtime.ts",
          text: "class CodexCaptureLiveInterpreter implements SemanticInterpreter { async interpret(input: SemanticInterpreterInput) {} }",
        },
        {
          path: "extensions/model-memory/src/runtime/phase2-product-proactivity-presentation.ts",
          text: "const shouldSurface = usefulScore > 0.8;",
        },
      ],
    });

    const proofFindings = report.findings.filter((finding) =>
      finding.filePath.includes(
        "scripts/model-memory-phase2-model-owned-memory-capture-retrieval-proof.mjs",
      ),
    );
    const hookFindings = report.findings.filter((finding) =>
      finding.filePath.includes("src/infra/model-memory-codex-capture-runtime.ts"),
    );
    expect(proofFindings.length).toBeGreaterThan(0);
    expect(hookFindings.length).toBeGreaterThan(0);
    expect(
      proofFindings.every((finding) => finding.classification === "fixture_reference_noise"),
    ).toBe(true);
    expect(hookFindings.every((finding) => finding.classification === "valid_guardrail")).toBe(
      true,
    );
    expect(
      report.findings.some(
        (finding) =>
          finding.filePath.includes("phase2-product-proactivity-presentation.ts") &&
          finding.classification === "runtime_elimination_debt",
      ),
    ).toBe(true);
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
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

  it("allows UI transport fixtures without allowing deterministic UI surfacing assertions", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "ui/src/ui/views/dreaming.test.ts",
          text: 'topicKey: "topic/travel",',
        },
        {
          path: "ui/src/ui/controllers/skills.test.ts",
          text: "results: [{ score: 1, slug: 'github', displayName: 'GitHub' }],",
        },
        {
          path: "ui/src/ui/views/dreaming.test.ts",
          text: "expect(shouldSurfaceFromTopicKey(item.topicKey)).toBe(true);",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("valid_guardrail");
    expect(report.findings[2]?.classification).toBe("test_enshrinement_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows feedback control-plane tests without allowing feedback-based candidate authority", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/runtime/phase2-proactivity-feedback-loop.test.ts",
          text: 'const report = await buildPhase2ProactivityFeedbackReport({ controls: ["useful"] });',
        },
        {
          path: "extensions/model-memory/src/runtime/phase2-proactivity-feedback-loop.test.ts",
          text: "expect(shouldSurfaceFromUsefulFeedback(report)).toBe(true);",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("test_enshrinement_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows bad-card rejection fixtures without accepting those fragments", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/runtime/phase2-user-facing-proactivity-briefs.test.ts",
          text: '"Question worth asking before current skillifier outputs already include multiple draft artifact.",',
        },
        {
          path: "extensions/model-memory/src/runtime/phase2-user-facing-proactivity-briefs.test.ts",
          text: "expect(primaryTitle).toBe('Question worth asking before current skillifier outputs');",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("test_enshrinement_debt");
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
    expect(
      report.findings
        .filter((finding) => finding.filePath === auditPath)
        .every((finding) => finding.classification === "valid_guardrail"),
    ).toBe(true);
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

  it("allows large-document proof classifications when they only select proof corpora", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "src/agents/model-memory.population-wave.ts",
          text: 'classification: "primary_large_source_proof_input" as const,',
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.aggressiveEliminationRequiredCount).toBe(0);
  });

  it("allows model interpreter plumbing without allowing runtime keyword surfacing", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/document-ingestion.ts",
          text: 'contractName: "semantic_extraction",',
        },
        {
          path: "extensions/model-memory/src/runtime/phase2-product-proactivity-presentation.ts",
          text: "const shouldSurface = keywordHeuristic(topicLabel) > 0.5;",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("runtime_elimination_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows MMV2 model-owned pipeline plumbing without allowing deterministic meaning checks", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/mmv2/document-shadow-ingestion.ts",
          text: "interpreter: SemanticInterpreter;",
        },
        {
          path: "extensions/model-memory/src/mmv2/file-pack-runner.ts",
          text: "class MmV2ExecutorBackedInterpreter implements SemanticInterpreter {}",
        },
        {
          path: "extensions/model-memory/src/mmv2/document-shadow-ingestion.ts",
          text: "const shouldSurface = keywordHeuristic(topicLabel) > 0.5;",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("valid_guardrail");
    expect(report.findings[2]?.classification).toBe("runtime_elimination_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows document ingestion operational failure taxonomy without allowing candidate value judgment", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/admin/document-ingestion-runner-service.ts",
          text: "return classifyMemoryIngestionFailure(message);",
        },
        {
          path: "extensions/model-memory/src/admin/document-ingestion-runner-service.ts",
          text: "const shouldSurface = keywordHeuristic(topicLabel) > 0.5;",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("runtime_elimination_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("does not treat Telegram topic routing tests as semantic topic heuristics", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "src/infra/heartbeat-runner.ghost-reminder.test.ts",
          text: '"telegram:-1003774691294:topic:47",',
        },
        {
          path: "extensions/model-memory/src/runtime/bad-surfacing.test.ts",
          text: "expect(shouldSurfaceFromTopic(candidate.topicKey)).toBe(true);",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("test_enshrinement_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows UI attachment MIME normalization without allowing semantic surfacing inference", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "ui/src/ui/chat/message-normalizer.ts",
          text: "const inferred = inferAttachmentKind(segment.url);",
        },
        {
          path: "ui/src/ui/chat/message-normalizer.ts",
          text: "const shouldSurface = inferTopicValue(message) > 0.5;",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("runtime_elimination_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows UI tool-output metadata inference without allowing tool-card surfacing judgment", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "ui/src/ui/chat/tool-cards.ts",
          text: "outputMeta: extractToolOutputMeta(m) ?? inferToolOutputMetaFromText(text),",
        },
        {
          path: "ui/src/ui/chat/tool-cards.ts",
          text: "const shouldSurface = inferTopicValue(message) > 0.5;",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("runtime_elimination_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows model-memory export and proof plumbing without hiding runtime judgment", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/index.ts",
          text: 'export * from "./semantic-interpreter.ts";',
        },
        {
          path: "src/agents/model-memory.session-turn-proof.ts",
          text: "interpreter: SemanticInterpreter;",
        },
        {
          path: "extensions/model-memory/src/index.ts",
          text: "const shouldSurface = semanticScore > 0.7;",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("valid_guardrail");
    expect(report.findings[2]?.classification).toBe("runtime_elimination_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows reviewed benchmark labels after semantic fallback behavior is removed", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "src/agents/model-memory.duplicate-benchmark.ts",
          text: "semanticSeeds: DuplicateBenchmarkSemanticSeed[];",
        },
        {
          path: "src/agents/model-memory.duplicate-benchmark.ts",
          text: "const shouldSurface = semanticScore > 0.78;",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("runtime_elimination_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows MMV2 prompt/reconciliation plumbing without allowing fuzzy supersession", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/mmv2/proof-prompt-normalization.ts",
          text: "prompt: SemanticExtractionPrompt;",
        },
        {
          path: "extensions/model-memory/src/mmv2/reconciliation.ts",
          text: '"without superseding by semantic similarity",',
        },
        {
          path: "extensions/model-memory/src/mmv2/reconciliation.ts",
          text: "if (semanticSimilarity(candidate, neighbor) > 0.8) return supersede;",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("valid_guardrail");
    expect(report.findings[2]?.classification).toBe("runtime_elimination_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows operational/model plumbing while still flagging live value decisions", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "src/agents/model-memory/live-runtime/json.ts",
          text: "export class ExecutorBackedMmV2SemanticInterpreter implements SemanticInterpreter {}",
        },
        {
          path: "extensions/model-memory/src/runtime/phase2-real-memory-proactivity-candidates.ts",
          text: "semanticSimilarityTruthAllowed: false;",
        },
        {
          path: "extensions/model-memory/src/runtime/phase2-proactivity-inbox.ts",
          text: 'opportunityStatus?: "surfaced";',
        },
        {
          path: "extensions/model-memory/src/runtime/phase2-proactivity-inbox.ts",
          text: "const shouldSurface = usefulScore > 0.8;",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("valid_guardrail");
    expect(report.findings[2]?.classification).toBe("valid_guardrail");
    expect(report.findings[3]?.classification).toBe("runtime_elimination_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
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

  it("allows report-only agents without allowing production pack inclusion scores", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "src/agents/model-memory.retrieval-package-review.ts",
          text: "score: entry.score,",
        },
        {
          path: "extensions/model-memory/src/runtime/context-pack-selector.ts",
          text: "const includeInPack = candidate.score > 0.7;",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("runtime_elimination_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows retrieval model-plan plumbing without allowing card surfacing intent checks", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/runtime/retrieval/types.ts",
          text: "intent: string;",
        },
        {
          path: "extensions/model-memory/src/runtime/phase2-product-proactivity-presentation.ts",
          text: "const shouldSurface = candidate.intent === 'skill';",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("acceptable_structural_retrieval_logic");
    expect(report.findings[1]?.classification).toBe("runtime_elimination_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows semantic module imports without allowing imported helpers to decide truth", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/memory-object-store.ts",
          text: 'import { deriveMemoryIdentity } from "./semantic-identity.ts";',
        },
        {
          path: "extensions/model-memory/src/memory-object-store.ts",
          text: "const shouldSurface = deriveMemoryIdentity(candidate).identityKey === prior.identityKey;",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("runtime_elimination_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows disabled semantic-authority policy flags without allowing policy bypasses", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/runtime/phase2-live-proactivity-signals.ts",
          text: "semanticSimilarityTruthAllowed: false;",
        },
        {
          path: "extensions/model-memory/src/runtime/phase2-live-proactivity-signals.ts",
          text: "const shouldSurface = topicParser(signal).score > 0.5;",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("runtime_elimination_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows operational failure taxonomy without allowing quality classification", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/mmv2/proof-runner-core.ts",
          text: "function classifyRunnerError(error: unknown) { return 'provider_boundary'; }",
        },
        {
          path: "extensions/model-memory/src/mmv2/proof-runner-core.ts",
          text: "function classifyCandidateQuality(candidate: Candidate) { return candidate.score > 0.8 ? 'good' : 'bad'; }",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("runtime_elimination_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows model-reviewed proposal fields without allowing deterministic proposal surfacing", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/runtime/phase2-model-reviewed-candidate-discovery.ts",
          text: "shouldSurface: boolean;",
        },
        {
          path: "extensions/model-memory/src/runtime/phase2-model-reviewed-candidate-discovery.ts",
          text: "const shouldSurface = lexicalScore + recencyScore > 0.75;",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("runtime_elimination_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows model-reviewed proposal fixtures without allowing test-only surfacing authority", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/runtime/phase2-model-reviewed-candidate-discovery.test.ts",
          text: "shouldSurface: true,",
        },
        {
          path: "extensions/model-memory/src/runtime/phase2-model-reviewed-candidate-discovery.test.ts",
          text: "expect(shouldSurfaceFromQualityScore(candidate)).toBe(true);",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("test_enshrinement_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows proactivity artifact names without allowing deterministic surfacing assertions", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/runtime/phase2-product-proactivity-presentation.test.ts",
          text: 'expect(markdown).toContain("Product Proactivity Presentation");',
        },
        {
          path: "extensions/model-memory/src/runtime/phase2-product-proactivity-presentation.test.ts",
          text: "expect(shouldSurfaceFromKeywordScore(candidate)).toBe(true);",
        },
      ],
    });

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.classification).toBe("test_enshrinement_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows structural source-authority tests without allowing source authority as value gate", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/source-authority.test.ts",
          text: 'it("classifies explicit live user turns as user-authoritative source metadata", () => {});',
        },
        {
          path: "extensions/model-memory/src/source-authority.test.ts",
          text: "expect(shouldSurfaceFromSourceAuthority(metadata)).toBe(true);",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("test_enshrinement_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows operational taxonomy tests without allowing candidate quality classification", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/benchmark/benchmark-runner.test.ts",
          text: 'it("classifies nano route failures separately from model-quality failures", () => {});',
        },
        {
          path: "extensions/model-memory/src/benchmark/benchmark-runner.test.ts",
          text: "expect(candidate.score > 0.7).toBe(true);",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("test_enshrinement_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows diagnostic score fixtures without allowing score-threshold authority", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "src/agents/model-memory.zero-candidate-text-search-diagnostic.test.ts",
          text: 'expect(markdown).toContain("[acceptable] score=0.76 object=obj-1");',
        },
        {
          path: "src/agents/model-memory.zero-candidate-text-search-diagnostic.test.ts",
          text: "expect(candidate.score > 0.7).toBe(true);",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("test_enshrinement_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows model-review prompt questions without allowing deterministic answers", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "scripts/model-memory-model-driven-packet-experiment.mjs",
          text: '"4. Bootstrap usability: would this be clearly more useful than a long raw projection during bootstrap?",',
        },
        {
          path: "scripts/model-memory-model-driven-packet-experiment.mjs",
          text: "expect(shouldSurfaceFromBootstrapUsefulness(score)).toBe(true);",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("fixture_reference_noise");
    expect(report.findings[1]?.classification).toBe("test_enshrinement_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows retrieval prompt fixtures without allowing intent-based inclusion authority", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/retrieval-request-interpreter.test.ts",
          text: 'expect(prompt.systemPrompt).toContain("Do not return fields like intent");',
        },
        {
          path: "extensions/model-memory/src/retrieval-request-interpreter.test.ts",
          text: "expect(includeBecauseIntent(candidate.intent)).toBe(true);",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("acceptable_structural_retrieval_logic");
    expect(report.findings[1]?.classification).toBe("test_enshrinement_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows no-semantic-authority assertions without allowing semantic gates", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/runtime/phase2-live-proactivity-signals.test.ts",
          text: "expect(report.policy.semanticSimilarityTruthAllowed).toBe(false);",
        },
        {
          path: "extensions/model-memory/src/runtime/phase2-live-proactivity-signals.test.ts",
          text: "expect(shouldSurfaceFromSemanticScore(candidate)).toBe(true);",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("test_enshrinement_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows handoff fixture labels without allowing handoff usefulness gates", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/runtime/phase2-proactive-planning-handoff-quality.test.ts",
          text: 'it("maps intent CTAs to useful expected output contracts", () => {});',
        },
        {
          path: "extensions/model-memory/src/runtime/phase2-proactive-planning-handoff-quality.test.ts",
          text: "expect(shouldSurfaceFromHandoffUsefulness(payload)).toBe(true);",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("test_enshrinement_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows comparison fixture labels without allowing comparison to decide surfacing", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/runtime-comparison.test.ts",
          text: 'it("classifies divergence, duplicate deltas, and supersession deltas object-natively", () => {});',
        },
        {
          path: "extensions/model-memory/src/runtime-comparison.test.ts",
          text: "expect(shouldSurfaceFromComparisonDelta(comparison)).toBe(true);",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("test_enshrinement_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows proactivity fixture copy without allowing fixture copy as visible fallback", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/runtime/phase2-proactivity-growth-loops.test.ts",
          text: '"Makes normal workflow generate useful proactive items without inbox fishing.",',
        },
        {
          path: "extensions/model-memory/src/runtime/phase2-proactivity-growth-loops.test.ts",
          text: "expect(primaryCardCopy).toBe('Makes normal workflow generate useful proactive items without inbox fishing.');",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("test_enshrinement_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows prompt/status plumbing without allowing deterministic value gates", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/runtime/phase2-proactivity-opportunity-ledger.ts",
          text: '| "surfaced"',
        },
        {
          path: "src/infra/model-memory-proactivity-runtime.ts",
          text: "import { classifySystemEventForProactivity } from './phase2-live-signal-coverage-expansion.js';",
        },
        {
          path: "extensions/model-memory/src/runtime/phase2-proactivity-opportunity-ledger.ts",
          text: "const shouldSurface = candidate.qualityScore > 0.8;",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("valid_guardrail");
    expect(report.findings[2]?.classification).toBe("runtime_elimination_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows explicit no-pruning policy without allowing semantic pruning authority", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/codex-session-memory-capture.ts",
          text: "semanticPruning: false;",
        },
        {
          path: "extensions/model-memory/src/codex-session-memory-capture.test.ts",
          text: 'it("loads recent contiguous Codex session activities without semantic pruning", async () => {});',
        },
        {
          path: "extensions/model-memory/src/codex-session-memory-capture.ts",
          text: "const include = semanticPruning === true && candidate.semanticScore > 0.8;",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("valid_guardrail");
    expect(report.findings[2]?.classification).toBe("runtime_elimination_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows live memory source-authority plumbing without allowing source-topic surfacing", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "src/agents/model-memory/live-runtime/assistant-turn-capture.ts",
          text: "const sourceAuthority = classifyLiveTurnSourceAuthority(userText);",
        },
        {
          path: "src/agents/model-memory/live-runtime/assistant-turn-capture.ts",
          text: "const shouldSurface = userText.includes('skill');",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("runtime_elimination_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows write-simulation accounting keys without allowing key-based supersession", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "extensions/model-memory/src/mmv2/write-simulation.ts",
          text: "semanticKey: createCanonicalSemanticKey(candidate),",
        },
        {
          path: "extensions/model-memory/src/mmv2/reconciliation.ts",
          text: "if (candidate.semanticKey === prior.semanticKey) return supersede;",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("runtime_elimination_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
  });

  it("allows UI navigation inference without allowing UI usefulness labels as authority", () => {
    const report = buildDeterministicJudgmentAuditReport({
      generatedAt: "2026-04-29T00:00:00.000Z",
      files: [
        {
          path: "ui/src/ui/app-settings.ts",
          text: "return inferBasePathFromPathname(window.location.pathname);",
        },
        {
          path: "ui/src/ui/views/dreaming.ts",
          text: "const shouldSurface = usefulScore > 0.7;",
        },
      ],
    });

    expect(report.findings[0]?.classification).toBe("valid_guardrail");
    expect(report.findings[1]?.classification).toBe("runtime_elimination_debt");
    expect(report.aggressiveEliminationRequiredCount).toBe(1);
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
