import { describe, expect, it } from "vitest";
import {
  buildPassingGoldenCorpusProposalFixtures,
  buildPhase2CandidateReviewGoldenCorpus,
} from "./phase2-candidate-review-golden-corpus.ts";
import {
  renderCandidateReviewValidationMarkdown,
  validateCandidateReviewGoldenCorpus,
  type CandidateReviewSuppressedProposal,
} from "./phase2-candidate-review-validation.ts";

describe("phase2 candidate review validation", () => {
  it("passes the golden corpus when expected high-value proposals are present", () => {
    const report = validateCandidateReviewGoldenCorpus({
      generatedAt: "2026-04-29T00:00:00.000Z",
      cases: buildPhase2CandidateReviewGoldenCorpus(),
      proposalsByCaseId: buildPassingGoldenCorpusProposalFixtures(),
    });

    expect(report.failCount).toBe(0);
    expect(report.aggregateRecall).toBe(1);
    expect(report.aggregatePrecision).toBe(1);
    expect(report.validationPolicy.noGatewayRebuildRequired).toBe(true);
  });

  it("attributes missing expected candidates to packet quality when the packet is too thin", () => {
    const [testCase] = buildPhase2CandidateReviewGoldenCorpus();
    const thinCase = {
      ...testCase,
      packet: {
        ...testCase.packet,
        episodeTurns: testCase.packet.episodeTurns.slice(0, 1),
        packetQuality: {
          ...testCase.packet.packetQuality,
          status: "degraded" as const,
          reasonCodes: ["episode_turns_missing"],
          openClawTurnCount: 1,
          codexTurnCount: 0,
          assistantFinalCount: 0,
        },
      },
    };

    const report = validateCandidateReviewGoldenCorpus({
      generatedAt: "2026-04-29T00:00:00.000Z",
      cases: [thinCase],
      proposalsByCaseId: { [thinCase.caseId]: [] },
    });

    expect(report.failCount).toBe(1);
    expect(report.results[0]?.expectationResults[0]?.failureSeam).toBe("packet_too_thin");
  });

  it("attributes missing expected candidates to the model when packet quality is sufficient", () => {
    const [testCase] = buildPhase2CandidateReviewGoldenCorpus();

    const report = validateCandidateReviewGoldenCorpus({
      generatedAt: "2026-04-29T00:00:00.000Z",
      cases: [testCase],
      proposalsByCaseId: { [testCase.caseId]: [] },
    });

    expect(report.failCount).toBe(1);
    expect(report.results[0]?.expectationResults[0]?.failureSeam).toBe(
      "model_missed_expected_candidate",
    );
  });

  it("attributes expected candidates to post-model validation when suppressed", () => {
    const [testCase] = buildPhase2CandidateReviewGoldenCorpus();
    const suppressed: CandidateReviewSuppressedProposal[] = [
      {
        proposalKind: "proactive_plan",
        title: "Verify route isolation",
        reasonCodes: ["copy_lacks_word_spacing"],
        evidenceRefs: ["chat://golden/user/route-concern"],
      },
    ];

    const report = validateCandidateReviewGoldenCorpus({
      generatedAt: "2026-04-29T00:00:00.000Z",
      cases: [testCase],
      proposalsByCaseId: { [testCase.caseId]: [] },
      suppressedProposalsByCaseId: { [testCase.caseId]: suppressed },
    });

    expect(report.results[0]?.expectationResults[0]?.failureSeam).toBe(
      "post_model_validation_suppressed",
    );
  });

  it("fails weak episodes when a candidate surfaces anyway", () => {
    const cases = buildPhase2CandidateReviewGoldenCorpus();
    const weakCase = cases.find((testCase) => testCase.caseId === "weak_tiny_cleanup_episode");
    const proposals = buildPassingGoldenCorpusProposalFixtures();
    expect(weakCase).toBeDefined();
    const report = validateCandidateReviewGoldenCorpus({
      generatedAt: "2026-04-29T00:00:00.000Z",
      cases: [weakCase!],
      proposalsByCaseId: {
        weak_tiny_cleanup_episode: proposals.route_and_packet_audit_episode.slice(0, 1),
      },
    });

    expect(report.failCount).toBe(1);
    expect(report.results[0]?.reasonCodes).toContain("expected_no_surface_candidates");
  });

  it("flags unsupported existing-skill enhancement claims", () => {
    const cases = buildPhase2CandidateReviewGoldenCorpus();
    const enhancementCase = cases.find(
      (testCase) => testCase.caseId === "existing_skill_enhancement_episode",
    );
    const proposals = buildPassingGoldenCorpusProposalFixtures();
    const badProposal = {
      ...proposals.existing_skill_enhancement_episode[0]!,
      suggestedExistingSkillName: "missing-skill",
    };

    const report = validateCandidateReviewGoldenCorpus({
      generatedAt: "2026-04-29T00:00:00.000Z",
      cases: [enhancementCase!],
      proposalsByCaseId: {
        existing_skill_enhancement_episode: [badProposal],
      },
    });

    expect(report.failCount).toBe(1);
    expect(report.results[0]?.reasonCodes).toContain("unsupported_existing_skill_enhancement");
  });

  it("keeps a known skill-shaped Codex episode in the candidate review proof matrix", () => {
    const cases = buildPhase2CandidateReviewGoldenCorpus();
    const skillDropoffCase = cases.find(
      (testCase) => testCase.caseId === "skill_dropoff_known_skill_shape_codex_episode",
    );
    const proposals = buildPassingGoldenCorpusProposalFixtures();

    expect(skillDropoffCase).toBeDefined();
    expect(skillDropoffCase?.packet.packetQuality.codexTurnCount).toBeGreaterThan(0);
    expect(skillDropoffCase?.packet.codexActivitySummary.status).toBe("loaded");
    expect(skillDropoffCase?.packet.codexActivitySummary.validationFailures).toHaveLength(1);
    expect(
      skillDropoffCase?.packet.episodeTurns.some((turn) => turn.ref.startsWith("codex://")),
    ).toBe(true);

    const report = validateCandidateReviewGoldenCorpus({
      generatedAt: "2026-04-29T00:00:00.000Z",
      cases: [skillDropoffCase!],
      proposalsByCaseId: {
        skill_dropoff_known_skill_shape_codex_episode:
          proposals.skill_dropoff_known_skill_shape_codex_episode,
      },
    });

    expect(report.failCount).toBe(0);
    expect(report.results[0]?.surfacedProposalCount).toBe(1);
    expect(
      proposals.skill_dropoff_known_skill_shape_codex_episode[0]?.evidenceRefs.some((ref) =>
        ref.startsWith("codex://"),
      ),
    ).toBe(true);
  });

  it("renders a local validation markdown report", () => {
    const report = validateCandidateReviewGoldenCorpus({
      generatedAt: "2026-04-29T00:00:00.000Z",
      cases: buildPhase2CandidateReviewGoldenCorpus(),
      proposalsByCaseId: buildPassingGoldenCorpusProposalFixtures(),
    });

    expect(renderCandidateReviewValidationMarkdown(report)).toContain(
      "does not require a gateway rebuild",
    );
  });
});
