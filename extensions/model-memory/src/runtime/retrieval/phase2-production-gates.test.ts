import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPhase2EvalProof } from "../../proof/phase2-eval-proof.ts";
import { buildPhase2UiRuntimeProofCoverage } from "../../proof/phase2-ui-runtime-proof-coverage.ts";
import {
  buildPhase2ProductionGatePolicyReport,
  createDefaultPhase2ProductionGatePolicy,
  evaluatePhase2ProductionGate,
  validatePhase2ProductionGatePrerequisites,
  writePhase2ProductionGatePolicyReportArtifact,
  type Phase2ProductionCapability,
  type Phase2ProductionGateInput,
  type Phase2ProductionGateMode,
  type Phase2ProductionGatePolicy,
  type Phase2ProductionGatePrerequisiteReport,
} from "./phase2-production-gates.ts";

const now = new Date("2026-04-25T00:00:00.000Z");
const projectScope = "phase2-production-gate-project";

function proofPrerequisites(): Phase2ProductionGatePrerequisiteReport {
  const evalProof = buildPhase2EvalProof({
    mode: "explicit_proof",
    projectId: projectScope,
    now,
  });
  const retrievalIntegrationProof = evalProof.retrievalIntegrationProof;
  if (!retrievalIntegrationProof) {
    throw new Error("expected eval proof to include Slice 8 retrieval integration proof");
  }
  return validatePhase2ProductionGatePrerequisites({
    retrievalIntegrationProof,
    evalProof,
    uiRuntimeProof: buildPhase2UiRuntimeProofCoverage({
      mode: "explicit_operator_proof",
      projectId: projectScope,
      now,
    }),
  });
}

function policyWithMode(mode: Phase2ProductionGateMode): Phase2ProductionGatePolicy {
  const policy = createDefaultPhase2ProductionGatePolicy();
  return {
    ...policy,
    capabilityModes: Object.fromEntries(
      Object.keys(policy.capabilityModes).map((capability) => [capability, mode]),
    ) as Record<Phase2ProductionCapability, Phase2ProductionGateMode>,
  };
}

describe("phase2 production retrieval gate policy", () => {
  it("keeps every capability disabled or shadow-only by default", () => {
    const policy = createDefaultPhase2ProductionGatePolicy();

    expect(Object.values(policy.capabilityModes)).toEqual(
      expect.arrayContaining(["disabled", "shadow_report_only"]),
    );
    expect(Object.values(policy.capabilityModes)).not.toContain("controlled_production");
    expect(Object.values(policy.capabilityModes)).not.toContain("operator_enabled");

    const results = Object.keys(policy.capabilityModes).map((capability) =>
      evaluatePhase2ProductionGate({
        capability: capability as Phase2ProductionCapability,
        policy,
        projectScope,
        sourceProfileIds: ["explicit_user_turn"],
        authorityTiers: ["user_authoritative"],
        noDarkDataStatus: "pass",
      }),
    );
    expect(results.every((result) => !result.allowed)).toBe(true);
    expect(results.map((result) => result.decision)).toEqual(
      expect.arrayContaining(["denied", "shadow_only"]),
    );
  });

  it("allows explicit eval without changing default retrieval or context flags", () => {
    const result = evaluatePhase2ProductionGate({
      capability: "project_state_capsule_context",
      requestedMode: "explicit_eval",
      explicitEvalEnabled: true,
      projectScope,
      sourceProfileIds: ["explicit_user_turn"],
      authorityTiers: ["user_authoritative"],
      noDarkDataStatus: "pass",
      contentHashes: ["hash-capsule-context"],
    });

    expect(result).toMatchObject({
      effectiveMode: "explicit_eval",
      decision: "allowed",
      allowed: true,
      defaultRetrievalChanged: false,
      defaultContextInjectionChanged: false,
    });
    expect(result.reasonCodes).toEqual(expect.arrayContaining(["explicit_eval_allowed"]));
    expect(result.reasonCodes).toEqual(expect.arrayContaining(["context_injection_not_default"]));
  });

  it("requires an explicit operator flag for operator-enabled mode", () => {
    const result = evaluatePhase2ProductionGate({
      capability: "project_state_capsule_retrieval",
      requestedMode: "operator_enabled",
      projectScope,
      sourceProfileIds: ["explicit_user_turn"],
      authorityTiers: ["user_authoritative"],
      noDarkDataStatus: "pass",
      proofPrerequisites: proofPrerequisites(),
    });

    expect(result).toMatchObject({
      decision: "explicit_operator_required",
      allowed: false,
    });
    expect(result.reasonCodes).toEqual(expect.arrayContaining(["operator_override_missing"]));
  });

  it("allows controlled production only when Slice 8, Slice 9, and UI proof prerequisites pass", () => {
    const prereq = proofPrerequisites();
    const result = evaluatePhase2ProductionGate({
      capability: "runtime_graph_reads",
      requestedMode: "controlled_production",
      projectScope,
      sourceProfileIds: ["explicit_user_turn"],
      authorityTiers: ["user_authoritative"],
      noDarkDataStatus: "pass",
      proofPrerequisites: prereq,
    });

    expect(prereq).toMatchObject({
      status: "pass",
      noDarkDataStatus: "pass",
      defaultRetrievalChanged: false,
      defaultContextInjectionChanged: false,
    });
    expect(prereq.selectedLanes).toEqual(
      expect.arrayContaining([
        "object_retrieval",
        "projection_digest",
        "runtime_graph",
        "project_state_capsule",
        "capsule_retrieval_shadow",
        "gated_capsule_context",
        "hierarchical_retrieval_shadow",
        "retrieval_pack_artifact",
      ]),
    );
    expect(result).toMatchObject({
      decision: "allowed",
      allowed: true,
    });
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining(["controlled_production_allowed", "graph_reads_read_only"]),
    );
    expect(result.proofHashes.length).toBeGreaterThan(0);
  });

  it("blocks controlled production when proof reports are missing or failed", () => {
    const missing = evaluatePhase2ProductionGate({
      capability: "project_state_capsule_retrieval",
      requestedMode: "controlled_production",
      projectScope,
      sourceProfileIds: ["explicit_user_turn"],
      authorityTiers: ["user_authoritative"],
      noDarkDataStatus: "pass",
    });
    const failedPrereq = {
      ...proofPrerequisites(),
      status: "fail" as const,
      failedChecks: ["forced_failure"],
    };
    const failed = evaluatePhase2ProductionGate({
      capability: "project_state_capsule_retrieval",
      requestedMode: "controlled_production",
      projectScope,
      sourceProfileIds: ["explicit_user_turn"],
      authorityTiers: ["user_authoritative"],
      noDarkDataStatus: "pass",
      proofPrerequisites: failedPrereq,
    });

    expect(missing).toMatchObject({
      decision: "proof_required",
      allowed: false,
    });
    expect(missing.reasonCodes).toEqual(expect.arrayContaining(["proof_prerequisites_missing"]));
    expect(failed).toMatchObject({
      decision: "proof_required",
      allowed: false,
    });
    expect(failed.reasonCodes).toEqual(expect.arrayContaining(["proof_prerequisites_failed"]));
  });

  it("blocks no-dark-data, inspection-only, stale, conflict, budget, and missing metadata cases", () => {
    const prereq = proofPrerequisites();
    const base = {
      requestedMode: "controlled_production" as const,
      projectScope,
      noDarkDataStatus: "pass" as const,
      proofPrerequisites: prereq,
    };

    expect(
      evaluatePhase2ProductionGate({
        ...base,
        capability: "runtime_graph_reads",
        sourceProfileIds: ["explicit_user_turn"],
        authorityTiers: ["user_authoritative"],
        noDarkDataStatus: "fail",
      }),
    ).toMatchObject({ decision: "blocked_no_dark_data", allowed: false });

    expect(
      evaluatePhase2ProductionGate({
        ...base,
        capability: "runtime_graph_reads",
        sourceProfileIds: ["raw_transcript"],
        authorityTiers: ["inspection_only"],
      }),
    ).toMatchObject({ decision: "blocked_inspection_only", allowed: false });

    expect(
      evaluatePhase2ProductionGate({
        ...base,
        capability: "project_state_capsule_context",
        sourceProfileIds: ["explicit_user_turn"],
        authorityTiers: ["user_authoritative"],
        freshnessStatus: "stale",
      }),
    ).toMatchObject({ decision: "blocked_stale", allowed: false });

    expect(
      evaluatePhase2ProductionGate({
        ...base,
        capability: "project_state_capsule_context",
        sourceProfileIds: ["explicit_user_turn"],
        authorityTiers: ["user_authoritative"],
        conflictMarkers: ["conflict-marker"],
      }),
    ).toMatchObject({ decision: "blocked_conflict", allowed: false });

    expect(
      evaluatePhase2ProductionGate({
        ...base,
        capability: "hierarchical_retrieval",
        sourceProfileIds: ["explicit_user_turn"],
        authorityTiers: ["user_authoritative"],
        budget: { subqueryCount: 6 },
      }),
    ).toMatchObject({ decision: "blocked_budget", allowed: false });

    expect(
      evaluatePhase2ProductionGate({
        ...base,
        capability: "soft_source_runtime_ingestion",
        sourceProfileIds: [],
        authorityTiers: ["cited_soft"],
      }),
    ).toMatchObject({ decision: "blocked_missing_authority_metadata", allowed: false });

    expect(
      evaluatePhase2ProductionGate({
        ...base,
        capability: "non_user_prompt_ingestion",
        sourceProfileIds: ["tool_result_capture"],
        authorityTiers: [],
      }),
    ).toMatchObject({ decision: "blocked_missing_authority_metadata", allowed: false });
  });

  it("preserves lower-authority soft-source status without promotion by corroboration", () => {
    const result = evaluatePhase2ProductionGate({
      capability: "soft_source_runtime_ingestion",
      requestedMode: "controlled_production",
      sourceProfileIds: ["researcher_report_artifact", "cited_assistant_answer"],
      authorityTiers: ["cited_soft"],
      noDarkDataStatus: "pass",
      proofPrerequisites: proofPrerequisites(),
    });

    expect(result).toMatchObject({
      decision: "allowed",
      allowed: true,
      authorityTiers: ["cited_soft"],
    });
    expect(result.reasonCodes).toEqual(expect.arrayContaining(["lower_authority_preserved"]));
    expect(result.reasonCodes).not.toContain("promoted_by_corroboration" as never);
  });

  it("does not allow capsule context or hierarchical retrieval by default", () => {
    const policy = createDefaultPhase2ProductionGatePolicy();

    const capsuleContext = evaluatePhase2ProductionGate({
      capability: "project_state_capsule_context",
      policy,
      projectScope,
      sourceProfileIds: ["explicit_user_turn"],
      authorityTiers: ["user_authoritative"],
      noDarkDataStatus: "pass",
    });
    const hierarchical = evaluatePhase2ProductionGate({
      capability: "hierarchical_retrieval",
      policy,
      projectScope,
      sourceProfileIds: ["explicit_user_turn"],
      authorityTiers: ["user_authoritative"],
      noDarkDataStatus: "pass",
    });

    expect(capsuleContext).toMatchObject({ decision: "denied", allowed: false });
    expect(hierarchical).toMatchObject({ decision: "denied", allowed: false });
    expect(capsuleContext.reasonCodes).toEqual(
      expect.arrayContaining(["context_injection_not_default"]),
    );
    expect(hierarchical.reasonCodes).toEqual(
      expect.arrayContaining(["hierarchical_fanout_not_default"]),
    );
  });

  it("requires project scope for scoped retrieval capabilities", () => {
    const result = evaluatePhase2ProductionGate({
      capability: "runtime_graph_reads",
      requestedMode: "controlled_production",
      sourceProfileIds: ["explicit_user_turn"],
      authorityTiers: ["user_authoritative"],
      noDarkDataStatus: "pass",
      proofPrerequisites: proofPrerequisites(),
    });

    expect(result).toMatchObject({
      decision: "blocked_missing_scope",
      allowed: false,
    });
  });

  it("emits deterministic gate ids, telemetry, proof hashes, and bounded reports", async () => {
    const prereq = proofPrerequisites();
    const input: Phase2ProductionGateInput = {
      capability: "runtime_graph_reads",
      requestedMode: "controlled_production",
      projectScope,
      sourceProfileIds: ["explicit_user_turn"],
      authorityTiers: ["user_authoritative"],
      noDarkDataStatus: "pass",
      proofPrerequisites: prereq,
    };
    const first = evaluatePhase2ProductionGate(input);
    const second = evaluatePhase2ProductionGate(input);

    expect(first).toEqual(second);
    expect(first.telemetry).toMatchObject({
      gateId: first.gateId,
      decision: "allowed",
      readOnly: true,
      defaultRetrievalChanged: false,
      defaultContextInjectionChanged: false,
    });
    expect(first.proofHashes.length).toBeGreaterThan(0);

    const report = buildPhase2ProductionGatePolicyReport({
      results: [
        first,
        evaluatePhase2ProductionGate({
          capability: "project_state_capsule_retrieval",
          policy: policyWithMode("shadow_report_only"),
          projectScope,
          sourceProfileIds: ["explicit_user_turn"],
          authorityTiers: ["user_authoritative"],
          noDarkDataStatus: "pass",
        }),
      ],
      prerequisiteReport: prereq,
      now,
    });
    expect(report).toMatchObject({
      allowedCount: 1,
      shadowOnlyCount: 1,
      defaultRetrievalChanged: false,
      defaultContextInjectionChanged: false,
    });

    const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), "phase2-production-gate-"));
    const written = await writePhase2ProductionGatePolicyReportArtifact({ report, artifactDir });
    const parsed = JSON.parse(await fs.readFile(written.path, "utf8"));
    expect(parsed.reportId).toBe(report.reportId);
    expect(written.contentHash).toBeTruthy();
  });

  it("rejects prohibited raw-content fields and marker content", () => {
    expect(() =>
      evaluatePhase2ProductionGate({
        capability: "runtime_graph_reads",
        projectScope,
        sourceProfileIds: ["explicit_user_turn"],
        authorityTiers: ["user_authoritative"],
        noDarkDataStatus: "pass",
        [(["raw", "Prompt"] as const).join("")]: "blocked",
      } as any),
    ).toThrow(/prohibited field/u);

    const serialized = JSON.stringify(
      evaluatePhase2ProductionGate({
        capability: "runtime_graph_reads",
        projectScope,
        sourceProfileIds: ["explicit_user_turn"],
        authorityTiers: ["user_authoritative"],
        noDarkDataStatus: "pass",
      }),
    );
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
});
