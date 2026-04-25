import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDefaultPhase2EvalProofScenarios,
  buildPhase2EvalProof,
  writePhase2EvalProofArtifact,
} from "./phase2-eval-proof.ts";

const now = new Date("2026-04-25T00:00:00.000Z");

function report() {
  return buildPhase2EvalProof({
    mode: "explicit_proof",
    projectId: "phase2-eval-project",
    now,
  });
}

function resultById(id: string) {
  const result = report().scenarioResults.find((entry) => entry.scenarioId === id);
  if (!result) {
    throw new Error(`missing scenario result ${id}`);
  }
  return result;
}

describe("phase2 comprehensive eval proof", () => {
  it("includes all required source and no-dark-data scenario categories", () => {
    const scenarios = buildDefaultPhase2EvalProofScenarios();
    const proof = report();

    expect(proof.scenarioIds).toHaveLength(scenarios.length);
    expect(proof.scenarioTypes).toEqual(
      expect.arrayContaining([
        "explicit_user_authoritative_capture",
        "curated_authoritative_capture",
        "tool_grounded_capture",
        "researcher_report_artifact_capture",
        "researcher_report_missing_citation_reject",
        "cited_assistant_answer_capture",
        "cited_assistant_answer_prose_reject",
        "daily_continuity_capture",
        "raw_transcript_inspection_only",
        "raw_prompt_reject",
        "raw_tool_log_reject",
        "secret_private_phrase_reject",
      ]),
    );
    expect(proof.noDarkDataValidationStatus).toBe("pass");
    expect(proof.noDarkDataFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          findingId: "phase2-eval-no-dark-data",
          status: "pass",
        }),
        expect.objectContaining({
          findingId: "phase2-eval-inspection-exclusion",
          status: "pass",
        }),
      ]),
    );
  });

  it("admits authoritative and soft-source scenarios with the expected profile and tier", () => {
    expect(resultById("phase2-user-authoritative")).toMatchObject({
      admitted: true,
      sourceProfileId: "explicit_user_turn",
      authorityTier: "user_authoritative",
      memoryKind: "preference",
    });
    expect(resultById("phase2-curated-authoritative")).toMatchObject({
      admitted: true,
      sourceProfileId: "curated_repo_doc",
      authorityTier: "curated_authoritative",
      memoryKind: "procedure",
    });
    expect(resultById("phase2-tool-grounded")).toMatchObject({
      admitted: true,
      sourceProfileId: "tool_result_capture",
      authorityTier: "tool_grounded",
      memoryKind: "fact",
    });
    expect(resultById("phase2-daily-continuity")).toMatchObject({
      admitted: true,
      sourceProfileId: "daily_continuity",
      authorityTier: "cited_soft",
    });
  });

  it("enforces citation and assistant-prose authority rules for soft sources", () => {
    expect(resultById("phase2-researcher-report")).toMatchObject({
      admitted: true,
      sourceProfileId: "researcher_report_artifact",
      authorityTier: "cited_soft",
    });
    expect(resultById("phase2-researcher-report").sourceRefs).not.toHaveLength(0);
    expect(resultById("phase2-researcher-missing-citation")).toMatchObject({
      rejected: true,
      reasonCodes: ["citation_required"],
    });
    expect(resultById("phase2-cited-assistant")).toMatchObject({
      admitted: true,
      sourceProfileId: "cited_assistant_answer",
      authorityTier: "cited_soft",
    });
    expect(resultById("phase2-cited-assistant").sourceRefs).not.toHaveLength(0);
    expect(resultById("phase2-cited-assistant-prose")).toMatchObject({
      rejected: true,
      reasonCodes: ["assistant_prose_is_not_authority"],
    });
  });

  it("keeps inspection-only and hard-reject sources out of normal retrieval lanes", () => {
    const proof = report();
    expect(resultById("phase2-transcript-inspection")).toMatchObject({
      inspectionOnly: true,
      sourceProfileId: "raw_transcript",
      authorityTier: "inspection_only",
    });
    expect(resultById("phase2-prompt-reject")).toMatchObject({
      rejected: true,
      sourceProfileId: "raw_prompt",
      reasonCodes: ["hard_reject"],
    });
    expect(resultById("phase2-tool-log-reject")).toMatchObject({
      rejected: true,
      sourceProfileId: "raw_tool_log",
      reasonCodes: ["hard_reject"],
    });
    expect(resultById("phase2-sensitive-phrase-reject")).toMatchObject({
      rejected: true,
      sourceProfileId: "secret_or_private_phrase",
      reasonCodes: ["hard_reject"],
    });
    expect(
      proof.retrievalIntegrationProof?.trace.lanes.objectRetrieval.selectedMemoryIds,
    ).not.toEqual(expect.arrayContaining(["inspection-phase2-transcript-inspection"]));
    expect(proof.retrievalIntegrationProof?.exclusionReasons).toEqual(
      expect.objectContaining({
        "runtime_graph:excluded_source_authority": 1,
        "project_state_capsule:inspection_only": 1,
      }),
    );
  });

  it("runs the Slice 8 retrieval integration proof across every explicit proof lane", () => {
    const proof = report();
    expect(proof.proofReportIds).toHaveLength(1);
    expect(proof.retrievalIntegrationProof).toBeDefined();
    expect(proof.retrievalLaneCoverage).toEqual([
      "capsule_retrieval_shadow",
      "gated_capsule_context",
      "hierarchical_retrieval_shadow",
      "object_retrieval",
      "project_state_capsule",
      "projection_digest",
      "retrieval_pack_artifact",
      "runtime_graph",
    ]);
    expect(proof.retrievalIntegrationProof?.trace.lanes.gatedCapsuleContext).toMatchObject({
      mode: "explicit_injection",
      injected: true,
    });
    expect(
      proof.retrievalIntegrationProof?.trace.lanes.hierarchicalRetrievalShadow.telemetry,
    ).toMatchObject({
      mode: "shadow_report_only",
      defaultRetrievalChanged: false,
      capsuleLaneUsed: true,
      projectionLaneUsed: true,
      graphLaneUsed: true,
    });
    expect(proof.defaultRetrievalChanged).toBe(false);
    expect(proof.defaultContextInjectionChanged).toBe(false);
  });

  it("preserves lower-authority labels and blocks authority promotion by corroboration", () => {
    const proof = report();
    expect(proof.authorityTiers).toEqual([
      "cited_soft",
      "curated_authoritative",
      "inspection_only",
      "tool_grounded",
      "user_authoritative",
    ]);
    expect(proof.sourceProfileIds).toEqual(
      expect.arrayContaining([
        "tool_result_capture",
        "researcher_report_artifact",
        "cited_assistant_answer",
        "daily_continuity",
      ]),
    );
    expect(proof.authorityPromotion.corroboration).toMatchObject({
      promoted: false,
      authorityTier: "cited_soft",
      confidenceMayIncrease: true,
      reasonCode: "corroboration_does_not_promote_authority",
    });
    expect(proof.authorityPromotion.explicitUserApproval).toMatchObject({
      promoted: true,
      authorityTier: "user_authoritative",
      reasonCode: "explicit_user_approval",
    });
    expect(proof.authorityPromotion.higherAuthorityReplacement).toMatchObject({
      promoted: true,
      authorityTier: "curated_authoritative",
      reasonCode: "higher_authority_replacement",
    });
  });

  it("is deterministic and does not mutate caller inputs", () => {
    const scenarios = buildDefaultPhase2EvalProofScenarios();
    const first = buildPhase2EvalProof({
      mode: "explicit_proof",
      projectId: "phase2-eval-project",
      scenarios,
      now,
    });
    const second = buildPhase2EvalProof({
      mode: "explicit_proof",
      projectId: "phase2-eval-project",
      scenarios,
      now,
    });
    expect(first).toEqual(second);

    first.scenarioResults.length = 0;
    expect(scenarios).toHaveLength(12);
    expect(scenarios[0]?.sourceRefs).toHaveLength(1);
  });

  it("requires explicit proof mode and rejects prohibited report fields", () => {
    expect(() => buildPhase2EvalProof({ mode: "disabled", now })).toThrow(/explicit_proof/u);
    expect(() =>
      buildPhase2EvalProof({
        mode: "explicit_proof",
        now,
        [(["raw", "Prompt"] as const).join("")]: "blocked",
      } as any),
    ).toThrow(/prohibited field/u);

    const serialized = JSON.stringify(report());
    for (const marker of [
      ["raw", "-", "prompt", "-", "marker"],
      ["raw", "-", "transcript", "-", "marker"],
      ["raw", "-", "tool", "-", "log", "-", "marker"],
      ["secret", "-", "marker"],
      ["private", "-", "phrase", "-", "marker"],
    ]) {
      expect(serialized).not.toContain(marker.join(""));
    }
  });

  it("writes bounded derived eval artifacts through the shared artifact writer", async () => {
    const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), "phase2-eval-proof-"));
    const proof = report();
    const written = await writePhase2EvalProofArtifact({
      report: proof,
      artifactDir,
      artifactId: "phase2-eval-proof",
    });

    const text = await fs.readFile(written.path, "utf8");
    expect(text).toContain("phase2_eval_proof_report.v1");
    expect(text).toContain("phase2-eval-no-dark-data");
    expect(text).not.toContain((["raw", "-", "prompt", "-", "marker"] as const).join(""));
    expect(written.contentHash).toHaveLength(64);
  });
});
