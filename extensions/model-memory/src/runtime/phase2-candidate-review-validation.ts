import { sha256JsonValue } from "../hashing.ts";
import type {
  CandidateReviewProposal,
  CandidateReviewProposalKind,
  ProactivityReviewEpisodePacket,
} from "./phase2-model-reviewed-candidate-discovery.ts";

export const CANDIDATE_REVIEW_VALIDATION_SCHEMA_VERSION =
  "candidate_review_validation_report.v1" as const;

export type GoldenCandidateExpectation = {
  expectationId: string;
  proposalKind: CandidateReviewProposalKind;
  allowedProposalKinds?: CandidateReviewProposalKind[];
  requiredConcepts: string[];
  minMatchedConcepts?: number;
  expectedDisposition: "surface" | "demote";
};

export type GoldenCandidateReviewCase = {
  caseId: string;
  description: string;
  packet: ProactivityReviewEpisodePacket;
  expectations: GoldenCandidateExpectation[];
  expectNoSurfaceCandidates?: boolean;
};

export type CandidateReviewSuppressedProposal = {
  proposalKind: CandidateReviewProposalKind;
  title: string;
  reasonCodes: string[];
  evidenceRefs: string[];
};

export type CandidateReviewValidationFailureSeam =
  | "candidate_present"
  | "packet_too_thin"
  | "model_missed_expected_candidate"
  | "post_model_validation_suppressed"
  | "unexpected_candidate"
  | "no_candidate_expected";

export type CandidateReviewExpectationResult = {
  expectationId: string;
  status: "pass" | "fail";
  failureSeam: CandidateReviewValidationFailureSeam;
  matchedProposalTitle?: string;
  matchedConcepts: string[];
  missingConcepts: string[];
  reasonCodes: string[];
};

export type CandidateReviewCaseValidationResult = {
  caseId: string;
  status: "pass" | "fail";
  packetQualityStatus: "pass" | "degraded";
  packetQualityReasonCodes: string[];
  expectedCount: number;
  proposalCount: number;
  surfacedProposalCount: number;
  expectationResults: CandidateReviewExpectationResult[];
  unexpectedProposalTitles: string[];
  precision: number;
  recall: number;
  usefulness: "strong" | "mixed" | "weak";
  reasonCodes: string[];
};

export type CandidateReviewValidationReport = {
  schemaVersion: typeof CANDIDATE_REVIEW_VALIDATION_SCHEMA_VERSION;
  generatedAt: string;
  caseCount: number;
  passCount: number;
  failCount: number;
  aggregateRecall: number;
  aggregatePrecision: number;
  falseNegativeSeams: Record<CandidateReviewValidationFailureSeam, number>;
  reportHash: string;
  results: CandidateReviewCaseValidationResult[];
  validationPolicy: {
    noGatewayRebuildRequired: true;
    qualitativeReviewRequired: true;
    deterministicComparisonIsNotSemanticTruth: true;
  };
};

function normalizeWords(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, " ")
      .split(/\s+/u)
      .filter((word) => word.length >= 3),
  );
}

function proposalSearchText(proposal: CandidateReviewProposal): string {
  return [
    proposal.title,
    proposal.purpose,
    proposal.recommendedNextStep,
    proposal.expectedUserValue,
    proposal.whyHighImpact,
    proposal.suggestedSkillName,
    proposal.suggestedExistingSkillName,
  ]
    .filter(Boolean)
    .join(" ");
}

function conceptMatched(proposalWords: Set<string>, concept: string): boolean {
  const conceptWords = [...normalizeWords(concept)];
  if (conceptWords.length === 0) {
    return false;
  }
  return conceptWords.every((word) => proposalWords.has(word));
}

function matchedConcepts(
  proposal: CandidateReviewProposal,
  expectation: GoldenCandidateExpectation,
): string[] {
  const words = normalizeWords(proposalSearchText(proposal));
  return expectation.requiredConcepts.filter((concept) => conceptMatched(words, concept));
}

function findExpectedProposal(input: {
  expectation: GoldenCandidateExpectation;
  proposals: CandidateReviewProposal[];
}): { proposal: CandidateReviewProposal; concepts: string[] } | null {
  const minMatched =
    input.expectation.minMatchedConcepts ??
    Math.max(1, Math.min(input.expectation.requiredConcepts.length, 2));
  const allowedKinds = new Set([
    input.expectation.proposalKind,
    ...(input.expectation.allowedProposalKinds ?? []),
  ]);
  let best: { proposal: CandidateReviewProposal; concepts: string[] } | null = null;
  for (const proposal of input.proposals) {
    if (!allowedKinds.has(proposal.proposalKind)) {
      continue;
    }
    const concepts = matchedConcepts(proposal, input.expectation);
    if (concepts.length < minMatched) {
      continue;
    }
    if (!best || concepts.length > best.concepts.length) {
      best = { proposal, concepts };
    }
  }
  return best;
}

function packetTooThin(packet: ProactivityReviewEpisodePacket): boolean {
  return (
    packet.packetQuality.status === "degraded" ||
    packet.packetQuality.openClawTurnCount + packet.packetQuality.codexTurnCount < 3 ||
    packet.packetQuality.assistantFinalCount === 0 ||
    !packet.packetQuality.contiguousWindowPresent
  );
}

function suppressedExpectedProposal(input: {
  expectation: GoldenCandidateExpectation;
  suppressedProposals: CandidateReviewSuppressedProposal[];
}): CandidateReviewSuppressedProposal | null {
  const allowedKinds = new Set([
    input.expectation.proposalKind,
    ...(input.expectation.allowedProposalKinds ?? []),
  ]);
  return (
    input.suppressedProposals.find((proposal) => {
      if (!allowedKinds.has(proposal.proposalKind)) {
        return false;
      }
      const words = normalizeWords(proposal.title);
      return input.expectation.requiredConcepts.some((concept) =>
        [...normalizeWords(concept)].some((word) => words.has(word)),
      );
    }) ?? null
  );
}

function proposalHasPostModelProblem(
  proposal: CandidateReviewProposal,
  packet: ProactivityReviewEpisodePacket,
): string[] {
  const reasons: string[] = [];
  const loadedSkillNames = new Set(
    packet.existingContext.loadedSkills.map((skill) => skill.name.toLowerCase()),
  );
  const visible = `${proposal.title}\n${proposal.purpose}\n${proposal.recommendedNextStep}`;
  if (/[a-z]{32,}/u.test(visible)) {
    reasons.push("copy_lacks_word_spacing");
  }
  if (
    [proposal.title, proposal.purpose, proposal.recommendedNextStep].some((field) =>
      /(?:[,;:]|\b(?:and|or|with|from|to|for|because|whether|between))$/iu.test(field.trim()),
    )
  ) {
    reasons.push("clipped_candidate_copy");
  }
  if (/\b(install|promote|send|execute)\b/iu.test(proposal.recommendedNextStep)) {
    reasons.push("unsafe_action_claim");
  }
  if (proposal.evidenceRefs.length === 0) {
    reasons.push("missing_evidence_refs");
  }
  if (
    proposal.proposalKind === "existing_skill_enhancement" &&
    (!proposal.suggestedExistingSkillName ||
      !loadedSkillNames.has(proposal.suggestedExistingSkillName.toLowerCase()))
  ) {
    reasons.push("unsupported_existing_skill_enhancement");
  }
  return reasons;
}

function scoreUsefulness(result: CandidateReviewCaseValidationResult): "strong" | "mixed" | "weak" {
  if (result.status === "pass" && result.recall >= 0.8 && result.precision >= 0.67) {
    return "strong";
  }
  if (result.recall >= 0.5 || result.precision >= 0.5) {
    return "mixed";
  }
  return "weak";
}

function validateOneCase(input: {
  testCase: GoldenCandidateReviewCase;
  proposals: CandidateReviewProposal[];
  suppressedProposals: CandidateReviewSuppressedProposal[];
}): CandidateReviewCaseValidationResult {
  const surfacedProposals = input.proposals.filter((proposal) => proposal.shouldSurface);
  const expectationResults: CandidateReviewExpectationResult[] = [];

  for (const expectation of input.testCase.expectations) {
    const candidatePool =
      expectation.expectedDisposition === "surface" ? surfacedProposals : input.proposals;
    const match = findExpectedProposal({ expectation, proposals: candidatePool });
    if (match) {
      expectationResults.push({
        expectationId: expectation.expectationId,
        status: "pass",
        failureSeam: "candidate_present",
        matchedProposalTitle: match.proposal.title,
        matchedConcepts: match.concepts,
        missingConcepts: expectation.requiredConcepts.filter(
          (concept) => !match.concepts.includes(concept),
        ),
        reasonCodes: proposalHasPostModelProblem(match.proposal, input.testCase.packet),
      });
      continue;
    }

    const suppressed = suppressedExpectedProposal({
      expectation,
      suppressedProposals: input.suppressedProposals,
    });
    const failureSeam: CandidateReviewValidationFailureSeam = suppressed
      ? "post_model_validation_suppressed"
      : packetTooThin(input.testCase.packet)
        ? "packet_too_thin"
        : "model_missed_expected_candidate";
    expectationResults.push({
      expectationId: expectation.expectationId,
      status: "fail",
      failureSeam,
      matchedConcepts: [],
      missingConcepts: expectation.requiredConcepts,
      reasonCodes: suppressed?.reasonCodes ?? [],
    });
  }

  const expectedSurfaceCount = input.testCase.expectations.filter(
    (expectation) => expectation.expectedDisposition === "surface",
  ).length;
  const unexpectedProposalTitles =
    input.testCase.expectations.length === 0
      ? surfacedProposals.map((proposal) => proposal.title)
      : surfacedProposals
          .filter(
            (proposal) =>
              !input.testCase.expectations.some(
                (expectation) =>
                  expectation.expectedDisposition === "surface" &&
                  findExpectedProposal({ expectation, proposals: [proposal] }),
              ),
          )
          .map((proposal) => proposal.title);
  const passedExpectations = expectationResults.filter((result) => result.status === "pass").length;
  const recall =
    input.testCase.expectations.length === 0
      ? surfacedProposals.length === 0
        ? 1
        : 0
      : passedExpectations / input.testCase.expectations.length;
  const precision =
    surfacedProposals.length === 0
      ? expectedSurfaceCount === 0
        ? 1
        : 0
      : Math.max(0, surfacedProposals.length - unexpectedProposalTitles.length) /
        surfacedProposals.length;
  const noCandidateFailure =
    input.testCase.expectNoSurfaceCandidates === true && surfacedProposals.length > 0;
  const postModelProblems = surfacedProposals.flatMap((proposal) =>
    proposalHasPostModelProblem(proposal, input.testCase.packet),
  );
  const status =
    expectationResults.every((result) => result.status === "pass") &&
    unexpectedProposalTitles.length === 0 &&
    postModelProblems.length === 0 &&
    !noCandidateFailure
      ? "pass"
      : "fail";
  const baseResult: CandidateReviewCaseValidationResult = {
    caseId: input.testCase.caseId,
    status,
    packetQualityStatus: input.testCase.packet.packetQuality.status,
    packetQualityReasonCodes: input.testCase.packet.packetQuality.reasonCodes,
    expectedCount: input.testCase.expectations.length,
    proposalCount: input.proposals.length,
    surfacedProposalCount: surfacedProposals.length,
    expectationResults,
    unexpectedProposalTitles,
    precision,
    recall,
    usefulness: "weak",
    reasonCodes: [
      ...new Set([
        ...input.testCase.packet.packetQuality.reasonCodes,
        ...postModelProblems,
        ...(noCandidateFailure ? ["expected_no_surface_candidates"] : []),
        ...(unexpectedProposalTitles.length > 0 ? ["unexpected_surface_candidate"] : []),
      ]),
    ],
  };
  return { ...baseResult, usefulness: scoreUsefulness(baseResult) };
}

export function validateCandidateReviewGoldenCorpus(input: {
  cases: GoldenCandidateReviewCase[];
  proposalsByCaseId: Record<string, CandidateReviewProposal[]>;
  suppressedProposalsByCaseId?: Record<string, CandidateReviewSuppressedProposal[]>;
  generatedAt?: string;
}): CandidateReviewValidationReport {
  const results = input.cases.map((testCase) =>
    validateOneCase({
      testCase,
      proposals: input.proposalsByCaseId[testCase.caseId] ?? [],
      suppressedProposals: input.suppressedProposalsByCaseId?.[testCase.caseId] ?? [],
    }),
  );
  const passCount = results.filter((result) => result.status === "pass").length;
  const falseNegativeSeams: Record<CandidateReviewValidationFailureSeam, number> = {
    candidate_present: 0,
    packet_too_thin: 0,
    model_missed_expected_candidate: 0,
    post_model_validation_suppressed: 0,
    unexpected_candidate: 0,
    no_candidate_expected: 0,
  };
  for (const result of results) {
    for (const expectationResult of result.expectationResults) {
      falseNegativeSeams[expectationResult.failureSeam] += 1;
    }
    if (result.unexpectedProposalTitles.length > 0) {
      falseNegativeSeams.unexpected_candidate += result.unexpectedProposalTitles.length;
    }
    if (result.expectedCount === 0 && result.surfacedProposalCount === 0) {
      falseNegativeSeams.no_candidate_expected += 1;
    }
  }
  const aggregateRecall =
    results.length === 0
      ? 1
      : results.reduce((sum, result) => sum + result.recall, 0) / results.length;
  const aggregatePrecision =
    results.length === 0
      ? 1
      : results.reduce((sum, result) => sum + result.precision, 0) / results.length;
  const reportWithoutHash = {
    schemaVersion: CANDIDATE_REVIEW_VALIDATION_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    caseCount: input.cases.length,
    passCount,
    failCount: results.length - passCount,
    aggregateRecall,
    aggregatePrecision,
    falseNegativeSeams,
    results,
    validationPolicy: {
      noGatewayRebuildRequired: true as const,
      qualitativeReviewRequired: true as const,
      deterministicComparisonIsNotSemanticTruth: true as const,
    },
  };
  return {
    ...reportWithoutHash,
    reportHash: sha256JsonValue(reportWithoutHash),
  };
}

export function renderCandidateReviewValidationMarkdown(
  report: CandidateReviewValidationReport,
): string {
  const lines = [
    "# Candidate Review Validation",
    "",
    `Generated: ${report.generatedAt}`,
    `Cases: ${report.caseCount}`,
    `Pass: ${report.passCount}`,
    `Fail: ${report.failCount}`,
    `Aggregate recall: ${report.aggregateRecall.toFixed(2)}`,
    `Aggregate precision: ${report.aggregatePrecision.toFixed(2)}`,
    `Report hash: ${report.reportHash}`,
    "",
    "This is a local function-level validation pass. It does not require a gateway rebuild.",
    "The deterministic comparison is a harness, not semantic truth; final quality still needs model/human review.",
    "",
    "## Cases",
    "",
  ];

  for (const result of report.results) {
    lines.push(
      `- ${result.status} ${result.caseId}: recall=${result.recall.toFixed(2)} precision=${result.precision.toFixed(2)} usefulness=${result.usefulness}`,
    );
    for (const expectation of result.expectationResults) {
      lines.push(
        `- ${expectation.status} ${expectation.expectationId}: seam=${expectation.failureSeam} match=${expectation.matchedProposalTitle ?? "none"}`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}
