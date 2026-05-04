import { randomUUID } from "node:crypto";
import type { JsonValue } from "../runtime-job-repository.ts";
import { listFutureSubagentRoleContracts } from "./roles.ts";
import type {
  AlternativeModelCandidate,
  ShadowEvalCandidateOutput,
  ShadowEvalFixture,
  ShadowEvalScorecard,
  SoakFloodFixtureBatch,
} from "./types.ts";

function requireRole(roleId: string): void {
  if (!listFutureSubagentRoleContracts().some((role) => role.roleId === roleId)) {
    throw new Error(`unknown subagent role: ${roleId}`);
  }
}

export function createShadowEvalFixture(input: {
  fixtureId?: string;
  roleId: string;
  objective: string;
  input: JsonValue;
  expectedOutputKinds: string[];
  frontierBaselineRef?: string;
}): ShadowEvalFixture {
  requireRole(input.roleId);
  return {
    fixtureId: input.fixtureId ?? randomUUID(),
    roleId: input.roleId,
    objective: input.objective,
    input: input.input,
    expectedOutputKinds: input.expectedOutputKinds,
    frontierBaselineRef: input.frontierBaselineRef,
    noProviderCallMade: true,
  };
}

export function createSoakFloodFixtureBatch(input: {
  batchId?: string;
  roleId: string;
  fixtureCount: number;
  purpose: string;
  candidateFamilies: AlternativeModelCandidate["family"][];
}): SoakFloodFixtureBatch {
  requireRole(input.roleId);
  if (!Number.isInteger(input.fixtureCount) || input.fixtureCount <= 0) {
    throw new Error("fixtureCount must be a positive integer");
  }
  return {
    batchId: input.batchId ?? randomUUID(),
    roleId: input.roleId,
    fixtureCount: input.fixtureCount,
    purpose: input.purpose,
    candidateFamilies: input.candidateFamilies,
    noProviderCallMade: true,
  };
}

export function summarizeSoakFloodFixtureBatch(batch: SoakFloodFixtureBatch) {
  return {
    batchId: batch.batchId,
    roleId: batch.roleId,
    fixtureCount: batch.fixtureCount,
    candidateFamilies: batch.candidateFamilies,
    noProviderCallMade: true as const,
    liveAuthorityGranted: false as const,
  };
}

function outputHasKind(output: JsonValue, kind: string): boolean {
  if (typeof output !== "object" || output === null || Array.isArray(output)) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(output, kind);
}

export function scoreSuppliedShadowEvalOutput(
  fixture: ShadowEvalFixture,
  candidateOutput: ShadowEvalCandidateOutput,
): ShadowEvalScorecard {
  if (fixture.fixtureId !== candidateOutput.fixtureId) {
    throw new Error("candidate output fixtureId does not match fixture");
  }
  const expectedOutputKindsPresent = fixture.expectedOutputKinds.every((kind) =>
    outputHasKind(candidateOutput.output, kind),
  );
  const noteScore = Math.min(candidateOutput.reviewNotes.length * 10, 30);
  const score = expectedOutputKindsPresent ? 70 + noteScore : noteScore;
  return {
    fixtureId: fixture.fixtureId,
    roleId: fixture.roleId,
    candidate: candidateOutput.candidate,
    score,
    passed: score >= 70,
    structuralChecks: {
      expectedOutputKindsPresent,
    },
    qualitativeNotes: candidateOutput.reviewNotes,
    promotionRecommendation:
      score >= 90
        ? "promote_for_role_review"
        : score >= 70
          ? "continue_shadow_eval"
          : "do_not_promote",
    liveAuthorityGranted: false,
    noProviderCallMade: true,
  };
}
