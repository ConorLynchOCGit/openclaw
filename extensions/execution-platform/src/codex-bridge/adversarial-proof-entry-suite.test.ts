import { describe, expect, it } from "vitest";
import {
  ADVERSARIAL_PROOF_ENTRY_CASE_IDS,
  runAdversarialProofEntrySuite,
} from "./adversarial-proof-entry-suite.ts";

describe("adversarial proof-entry suite", () => {
  it("fails safely across all required dangerous proof-entry cases", async () => {
    const proof = await runAdversarialProofEntrySuite({
      runtimeJobId: "test-adversarial-proof-entry",
      graphId: "test-adversarial-proof-entry-graph",
    });

    expect(proof.pass).toBe(true);
    expect(proof.caseIdsExercised.toSorted()).toEqual(
      [...ADVERSARIAL_PROOF_ENTRY_CASE_IDS].toSorted(),
    );
    expect(proof.passedCaseCount).toBe(ADVERSARIAL_PROOF_ENTRY_CASE_IDS.length);
    expect(proof.failedCaseCount).toBe(0);
    expect(proof.providerInvocationCount).toBe(0);
    expect(proof.authoritySurfaceRetirementGate).toBe("passed");
    expect(proof.generalitySentinel).toBe("passed");
    expect(proof.capabilityManifestConformance).toBe("passed");
    expect(proof.reasonCodes).toContain("adversarial_proof_entry_suite_passed");
    expect(proof.rawPromptStored).toBe(false);
    expect(proof.rawResponseStored).toBe(false);
    expect(proof.rawProviderLogStored).toBe(false);
    expect(proof.rawToolLogStored).toBe(false);
    expect(proof.hiddenReasoningStored).toBe(false);

    const byCase = new Map(proof.caseResults.map((result) => [result.caseId, result]));
    expect(byCase.get("stale_child_replay")?.reasonCodes).toEqual(
      expect.arrayContaining([
        "child_epoch_superseded_not_executable",
        "child_epoch_boundary_epoch_mismatch",
      ]),
    );
    expect(byCase.get("missing_contract_body")?.reasonCodes).toContain(
      "node_execution_contract_body_missing",
    );
    expect(byCase.get("resource_repair_without_requirement")?.reasonCodes).toEqual(
      expect.arrayContaining([
        "resource_repair_requirement_packet_ref_missing",
        "resource_repair_consumer_edge_missing",
      ]),
    );
    expect(byCase.get("domain_resource_selection_over_budget")?.reasonCodes).toContain(
      "domain_resource_selection_payload_over_budget",
    );
    expect(
      byCase.get("accepted_with_limitations_without_consumer_waiver")?.reasonCodes,
    ).toContain("node_readiness_context_limitation_waiver_missing");
    expect(byCase.get("worker_edit_rollback_review")?.reviewArtifactRefs.length).toBeGreaterThan(
      0,
    );
    expect(byCase.get("sibling_branch_failure_isolation")?.siblingEvidenceSurvived).toBe(true);
    expect(byCase.get("provider_routing_contradiction")?.reasonCodes).toEqual(
      expect.arrayContaining([
        "model_policy_provider_path_mismatch",
        "model_policy_model_ref_not_allowed",
      ]),
    );
    expect(byCase.get("semantic_lexical_trap")?.reasonCodes).toContain(
      "adversarial_semantic_lexical_trap_passed",
    );
    expect(byCase.get("non_coding_domain_fixture")?.reviewArtifactRefs[0]).toMatch(
      /^action-review:\/\//u,
    );
    expect(byCase.get("capability_manifest_default_trap")?.reasonCodes.some((code) =>
      code.startsWith("work_intent_selected_capability_unknown:"),
    )).toBe(true);

    for (const result of proof.caseResults) {
      expect(result.status).toBe("passed");
      expect(result.authorityWidened).toBe(false);
      expect(result.executableFrontierOpened).toBe(false);
      expect(result.semanticRuntimeJudgmentUsed).toBe(false);
      expect(result.rawPromptStored).toBe(false);
      expect(result.rawResponseStored).toBe(false);
      expect(result.rawProviderLogStored).toBe(false);
      expect(result.rawToolLogStored).toBe(false);
      expect(result.rawDbRowsStored).toBe(false);
      expect(result.proofToolInvocationRefs.length).toBeGreaterThan(0);
    }
  }, 30_000);
});
