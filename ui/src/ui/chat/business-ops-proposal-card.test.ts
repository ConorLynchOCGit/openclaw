import { describe, expect, it } from "vitest";
import {
  buildBusinessOpsProposalDecisionMessage,
  parseBusinessOpsProposalPresentation,
} from "./business-ops-proposal-card.js";

const presentation = {
  schema: "openclaw.business-ops.proposal-presentation.v1",
  authority: "presentation_only",
  status: "current",
  flow: { id: "flow-1", revision: 7 },
  proposal: { id: "P-1", ref: "proposal.md", digest: "a".repeat(64) },
  target: {
    ref: "target.md",
    digest: "b".repeat(64),
    anchor: "## Positioning",
    currentPassage: "Old passage.",
    proposedPassage: "New passage.",
  },
  evidenceBasis: ["E-1"],
  affectedSurfaces: ["target.md"],
  reviewerVerdict: "pass",
  unresolvedConsequences: ["Publication remains blocked."],
  allowedOutcomes: ["approve", "revise", "reject", "defer"],
};

describe("Business Ops proposal presentation", () => {
  it("accepts only the presentation-only schema", () => {
    expect(parseBusinessOpsProposalPresentation(JSON.stringify(presentation))).toEqual(
      presentation,
    );
    expect(
      parseBusinessOpsProposalPresentation(
        JSON.stringify({ ...presentation, authority: "decision_authority" }),
      ),
    ).toBeNull();
    expect(parseBusinessOpsProposalPresentation("not json")).toBeNull();
  });

  it("builds an exact proposal-bound operator message", () => {
    expect(
      buildBusinessOpsProposalDecisionMessage({
        outcome: "revise",
        flowId: "flow-1",
        flowRevision: 7,
        proposalId: "P-1",
        proposalRef: "proposal.md",
        proposalDigest: "a".repeat(64),
        targetRef: "target.md",
        targetDigest: "b".repeat(64),
        passageFeedback: "Make the second sentence more specific.",
      }),
    ).toBe(
      [
        "Business Ops proposal decision: revise",
        "TaskFlow: flow-1@7",
        "Proposal: P-1",
        "Proposal ref: proposal.md",
        `Proposal digest: ${"a".repeat(64)}`,
        "Target: target.md",
        `Target baseline digest: ${"b".repeat(64)}`,
        "Passage feedback:",
        "Make the second sentence more specific.",
      ].join("\n"),
    );
  });
});
