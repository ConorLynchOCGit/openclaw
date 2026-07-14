import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBusinessOpsProposalTool } from "./business-ops-proposal-tool.js";

const workspaces: string[] = [];
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

async function fixture() {
  const workspaceDir = await mkdtemp(join(tmpdir(), "openclaw-business-ops-proposal-"));
  workspaces.push(workspaceDir);
  const proposalText = [
    "# Proposal",
    "",
    "P-1",
    "A sharper replacement.",
    "E-1: operator assertion",
    "target.md",
    "revise then approve",
    "Publication approval remains separate.",
    "",
  ].join("\n");
  const targetText = "# Voice\n\n## Positioning\n\nOld passage.\n";
  await writeFile(join(workspaceDir, "proposal.md"), proposalText);
  await writeFile(join(workspaceDir, "target.md"), targetText);
  const proposalDigest = digest(proposalText);
  const targetDigest = digest(targetText);
  const flow = {
    flowId: "flow-1",
    revision: 7,
    status: "waiting",
    stateJson: {
      state: "waiting_approval",
      proposal: { id: "P-1", ref: "proposal.md", digest: proposalDigest },
      canonicalRefs: [{ ref: "target.md", digest: targetDigest }],
    },
  };
  const tool = createBusinessOpsProposalTool({
    workspaceDir,
    taskFlow: { get: () => flow } as never,
  });
  const params = {
    flowId: "flow-1",
    flowRevision: 7,
    proposalId: "P-1",
    proposalRef: "proposal.md",
    proposalDigest,
    targetRef: "target.md",
    targetDigest,
    anchor: "## Positioning",
    currentPassage: "Old passage.",
    proposedPassage: "A sharper replacement.",
    evidenceBasis: ["E-1: operator assertion"],
    affectedSurfaces: ["target.md"],
    reviewerVerdict: "revise then approve",
    unresolvedConsequences: ["Publication approval remains separate."],
  };
  return { tool, params };
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("business_ops_present_proposal", () => {
  it("returns an actionable presentation only when TaskFlow and artifact pointers are current", async () => {
    const { tool, params } = await fixture();
    const result = await tool.execute("call-1", params);
    const presentation = result.details as Record<string, unknown>;

    expect(presentation).toMatchObject({
      schema: "openclaw.business-ops.proposal-presentation.v1",
      authority: "presentation_only",
      status: "current",
      allowedOutcomes: ["approve", "revise", "reject", "defer"],
      failedChecks: [],
      recoveryHint: null,
    });
    expect(JSON.parse(result.content[0]?.text ?? "{}")).toEqual(presentation);
  });

  it("renders stale proposals non-actionable instead of recording a decision", async () => {
    const { tool, params } = await fixture();
    const result = await tool.execute("call-2", { ...params, flowRevision: 6 });

    expect(result.details).toMatchObject({
      authority: "presentation_only",
      status: "superseded_or_stale",
      allowedOutcomes: [],
      checks: { flowRevision: false },
      failedChecks: ["flowRevision"],
      recoveryHint:
        "Reload the current TaskFlow revision and digest-bound artifacts before presenting again.",
    });
  });

  it("does not present model-supplied prose that is absent from the digest-bound proposal", async () => {
    const { tool, params } = await fixture();
    const result = await tool.execute("call-unbound-prose", {
      ...params,
      proposedPassage: "A replacement that is not in the proposal artifact.",
    });

    expect(result.details).toMatchObject({
      status: "superseded_or_stale",
      allowedOutcomes: [],
      checks: { proposedPassage: false },
      failedChecks: ["proposedPassage"],
      recoveryHint:
        "Retry with exact verbatim excerpts already present in the digest-bound proposal and target artifacts; do not rewrite an artifact to satisfy presentation.",
    });
  });

  it("identifies paraphrased proposal metadata so the caller can retry from exact excerpts", async () => {
    const { tool, params } = await fixture();
    const result = await tool.execute("call-paraphrased-metadata", {
      ...params,
      evidenceBasis: ["Evidence E-1 says this is an operator assertion."],
      affectedSurfaces: ["The affected surface is target.md."],
      unresolvedConsequences: ["Publication approval still needs review."],
    });

    expect(result.details).toMatchObject({
      status: "superseded_or_stale",
      failedChecks: [
        "proposalEvidence",
        "proposalAffectedSurfaces",
        "proposalUnresolvedConsequences",
      ],
      missingProposalContentIndexes: {
        evidenceBasis: [0],
        affectedSurfaces: [0],
        reviewerVerdict: false,
        unresolvedConsequences: [0],
      },
    });
  });

  it("describes proposal-content parameters as exact artifact excerpts", async () => {
    const { tool } = await fixture();
    const schema = tool.parameters as {
      properties: Record<string, { description?: string }>;
    };

    expect(schema.properties.evidenceBasis?.description).toContain("Exact verbatim");
    expect(schema.properties.affectedSurfaces?.description).toContain("Exact verbatim");
    expect(schema.properties.unresolvedConsequences?.description).toContain("Exact verbatim");
  });

  it("rejects absolute and escaping artifact paths", async () => {
    const { tool, params } = await fixture();

    await expect(tool.execute("call-3", { ...params, proposalRef: "/etc/passwd" })).rejects.toThrow(
      "workspace-relative",
    );
    await expect(
      tool.execute("call-4", { ...params, proposalRef: "../outside.md" }),
    ).rejects.toThrow();
  });
});
