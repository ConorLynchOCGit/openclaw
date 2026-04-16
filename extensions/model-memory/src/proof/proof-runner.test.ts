import { describe, expect, it } from "vitest";
import { DOCUMENT_PROOF_CASES, ORDINARY_TURN_PROOF_CASES } from "./proof-corpus.ts";
import { runAuditedProofCorpus } from "./proof-runner.ts";

describe("proof runner", () => {
  it("executes the audited document corpus against canonical expected objects", async () => {
    const { results } = await runAuditedProofCorpus(DOCUMENT_PROOF_CASES);
    expect(results).toHaveLength(DOCUMENT_PROOF_CASES.length);
    expect(results.every((result) => result.pass)).toBe(true);
  });

  it("executes the audited ordinary-turn corpus against canonical expected objects", async () => {
    const { results } = await runAuditedProofCorpus(ORDINARY_TURN_PROOF_CASES);
    expect(results).toHaveLength(ORDINARY_TURN_PROOF_CASES.length);
    expect(results.every((result) => result.pass)).toBe(true);
    expect(results.find((result) => result.caseId === "turn-007-duplicate")?.writeDecision).toBe(
      "attach_support",
    );
    expect(results.find((result) => result.caseId === "turn-008-supersession")?.writeDecision).toBe(
      "supersede",
    );
  });
});
