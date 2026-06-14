import { describe, expect, it } from "vitest";
import {
  genericWorkflowNodeResultFromRuntime,
  validateGenericWorkflowNodeResult,
  workflowEvidenceClassRefsFromNodeResults,
} from "./workflow-node-execution.ts";

describe("generic workflow node execution result", () => {
  it("accepts bounded evidence claims mapped to known commitments", () => {
    const result = genericWorkflowNodeResultFromRuntime({
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-1",
      nodeKind: "implementation",
      roleClass: "implementation",
      capabilityId: "implementation_standard",
      executorKey: "kind:implementation",
      workerRef: "agent.execution-coding.native-node-session",
      runtimeToolInvocationRefs: ["runtime-tool://worker.invoke/invocation-1"],
      result: {
        status: "succeeded",
        outputArtifactRefs: ["repo://file.ts#sha256:abc"],
        changedFileRefs: ["repo://file.ts#sha256:abc"],
        validationRefs: ["validation://focused-test"],
        reasonCodes: ["implementation_completed"],
        evidenceClaims: [
          {
            commitmentId: "commitment-1",
            evidenceRef: "repo://file.ts#sha256:abc",
            evidenceKind: "source_change",
            validationPhase: "post_action_validation",
            claimSummary: "Implemented the scoped source edit.",
            limitations: [],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawDbRowsStored: false,
        workQueueLifecycleMutated: false,
      },
    });

    expect(result).toMatchObject({
      nodeExecutionId: "node-execution:graph-1:node-1",
      executorKey: "kind:implementation",
      workerRef: "agent.execution-coding.native-node-session",
      runtimeToolInvocationRefs: ["runtime-tool://worker.invoke/invocation-1"],
      changedFileRefs: ["repo://file.ts#sha256:abc"],
      validationRefs: ["validation://focused-test"],
    });
    expect(result.evidenceClaims[0]).toMatchObject({
      evidenceClaimId: "evidence-claim:graph-1:node-1:commitment-1:1",
      producedByNodeId: "node-1",
      producedByCapabilityId: "implementation_standard",
      producedByExecutorKey: "kind:implementation",
      changedFileRefs: ["repo://file.ts#sha256:abc"],
      validationRefs: ["validation://focused-test"],
      validationPhase: "post_action_validation",
      rawToolLogStored: false,
      rawDbRowsStored: false,
      authorityGranted: false,
      workQueueLifecycleMutated: false,
    });
    expect(
      validateGenericWorkflowNodeResult({
        result,
        knownCommitmentIds: ["commitment-1"],
        evidenceClaimsRequired: true,
      }),
    ).toMatchObject({ valid: true });
  });

  it("rejects raw storage and unknown commitment claims", () => {
    const result = genericWorkflowNodeResultFromRuntime({
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-1",
      nodeKind: "reviewer",
      roleClass: "review",
      result: {
        status: "succeeded",
        outputArtifactRefs: ["review://model-run-1"],
        reasonCodes: ["review_completed"],
        evidenceClaims: [
          {
            commitmentId: "unknown",
            evidenceRef: "review://model-run-1",
            evidenceKind: "review",
            validationPhase: "review_validation",
            claimSummary: "Reviewed the work.",
            limitations: [],
            rawPromptStored: true as false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawDbRowsStored: false,
        workQueueLifecycleMutated: false,
      },
    });

    const validation = validateGenericWorkflowNodeResult({
      result,
      knownCommitmentIds: ["commitment-1"],
      evidenceClaimsRequired: true,
    });

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toEqual(
      expect.arrayContaining([
        "generic_node_result_unknown_commitment:unknown",
        "generic_node_result_evidence_claim_raw_storage_rejected",
      ]),
    );
  });

  it("rejects succeeded node results without required evidence claims or output refs", () => {
    const result = genericWorkflowNodeResultFromRuntime({
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-1",
      nodeKind: "implementation",
      roleClass: "implementation",
      result: {
        status: "succeeded",
        outputArtifactRefs: [],
        reasonCodes: ["process_completed"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      },
    });

    const validation = validateGenericWorkflowNodeResult({
      result,
      knownCommitmentIds: ["commitment-1"],
      evidenceClaimsRequired: true,
    });

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toEqual(
      expect.arrayContaining([
        "generic_node_result_evidence_claims_required",
        "generic_node_result_success_requires_output_ref",
      ]),
    );
  });

  it("rejects authority and lifecycle mutations in node results and claims", () => {
    const result = genericWorkflowNodeResultFromRuntime({
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-1",
      nodeKind: "implementation",
      roleClass: "implementation",
      result: {
        status: "succeeded",
        outputArtifactRefs: ["repo://file.ts#sha256:abc"],
        reasonCodes: ["implementation_completed"],
        evidenceClaims: [
          {
            commitmentId: "commitment-1",
            evidenceRef: "repo://file.ts#sha256:abc",
            evidenceKind: "source_change",
            validationPhase: "post_action_validation",
            claimSummary: "Implemented the scoped source edit.",
            limitations: [],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            authorityGranted: true,
          } as never,
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        authorityGranted: true,
        workQueueLifecycleMutated: false,
      } as never,
    });

    const validation = validateGenericWorkflowNodeResult({
      result: {
        ...result,
        authorityGranted: true as false,
      },
      knownCommitmentIds: ["commitment-1"],
      evidenceClaimsRequired: true,
    });

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toEqual(
      expect.arrayContaining([
        "generic_node_result_authority_or_lifecycle_mutation_rejected",
        "generic_node_result_evidence_claim_authority_or_lifecycle_rejected",
      ]),
    );
  });

  it("rejects pre-proof validation as implementation source-change evidence", () => {
    const result = genericWorkflowNodeResultFromRuntime({
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-1",
      nodeKind: "implementation",
      roleClass: "implementation",
      result: {
        status: "succeeded",
        outputArtifactRefs: ["repo://file.ts#sha256:abc"],
        changedFileRefs: ["repo://file.ts#sha256:abc"],
        validationRefs: ["validation://pre-proof"],
        reasonCodes: ["pre_proof_check_recorded"],
        evidenceClaims: [
          {
            commitmentId: "commitment-1",
            evidenceRef: "repo://file.ts#sha256:abc",
            evidenceKind: "source_change",
            validationPhase: "pre_proof_validation",
            claimSummary: "A pre-proof check claimed implementation progress.",
            limitations: [],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      },
    });

    const validation = validateGenericWorkflowNodeResult({
      result,
      knownCommitmentIds: ["commitment-1"],
      evidenceClaimsRequired: true,
    });

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toEqual(
      expect.arrayContaining([
        `generic_node_result_evidence_claim_validation_phase_incompatible:${result.evidenceClaims[0]?.evidenceClaimId}`,
        "validation_phase_source_change_requires_worker_post_edit_validation",
      ]),
    );
  });

  it("derives workflow evidence class refs from canonical node results", () => {
    const result = genericWorkflowNodeResultFromRuntime({
      workflowId: "agent_team.architecture_red_team",
      graphId: "graph-1",
      nodeId: "node-1",
      nodeKind: "planning_capsule",
      roleClass: "planning",
      result: {
        status: "succeeded",
        outputArtifactRefs: ["artifact://planning-capsule/1"],
        reasonCodes: ["planning_capsule_created"],
        evidenceClaims: [
          {
            commitmentId: "commitment-1",
            evidenceRef: "artifact://planning-capsule/1",
            evidenceKind: "planning_capsule",
            validationPhase: "pre_execution_validation",
            claimSummary: "Created the bounded planning capsule.",
            limitations: [],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      },
    });

    expect(workflowEvidenceClassRefsFromNodeResults([result])).toMatchObject({
      planning_capsule: ["artifact://planning-capsule/1"],
    });
  });
});
