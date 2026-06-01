import { describe, expect, it } from "vitest";
import {
  ActionReviewArtifactSchema,
  WORKER_EDIT_REVIEW_ARTIFACT_SCHEMA_VERSION,
  WorkerEditReviewArtifactSchema,
  buildActionReviewArtifact,
  buildWorkerEditReviewArtifact,
  renderWorkerEditDiffExcerpt,
} from "./action-review-artifacts.ts";

describe("action review artifacts", () => {
  it("builds a neutral action review artifact for non-coding workflows", () => {
    const artifact = buildActionReviewArtifact({
      runtimeJobId: "job-action-review",
      workflowId: "workflow.generic",
      graphId: "graph-generic",
      branchId: "branch-1",
      nodeId: "node-1",
      workerId: "worker.generic",
      roleId: "planner",
      capabilityId: "planning_capsule",
      taskId: "task-1",
      actionKind: "planning.decision",
      actionStatus: "applied",
      reviewState: "pending_model_or_human_review",
      authorityScopeRefs: ["authority://planning"],
      nodeExecutionContractRef: "contract://node-1",
      nodeExecutionContractHash: "sha256:contract",
      nodeExecutionPacketRef: "packet://node-1",
      nodeExecutionPacketHash: "sha256:packet",
      domainResourcePacketRef: "resource://node-1",
      domainResourcePacketHash: "sha256:resource",
      domainResourceSelectionPacketRef: null,
      domainResourceSelectionPacketHash: null,
      validationRefs: ["validation://planning/schema"],
      evidenceClaimRefs: ["evidence://planning/claim"],
      rollbackMode: "not_applicable",
      rollbackResultRefs: [],
      reviewDecisionRefs: [],
      payloadRefs: ["artifact://planning/decision"],
      payloadHashes: ["sha256:payload"],
      payloadCounts: { decisionCount: 1 },
      boundedSummary: "Planner proposed an action graph decision.",
      reasonCodes: ["action_review_artifact_persisted"],
    });

    expect(ActionReviewArtifactSchema.parse(artifact)).toMatchObject({
      artifactKind: "action_review_artifact",
      actionKind: "planning.decision",
      actionStatus: "applied",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
    });
    expect(artifact.artifactRef).toMatch(/^action-review:\/\//u);
    expect(artifact.artifactHash).toMatch(/^sha256:/u);
  });

  it("builds a worker edit review artifact with bounded diff evidence", () => {
    const operations = [
      {
        operationId: "op-1",
        path: "src/example.ts",
        operation: "replace_text",
        occurrenceIndex: 1,
        startLine: 10,
        endLine: 11,
        rationale: "Replace stale behavior with the accepted plan output.",
        oldTextHash: "sha256:old",
        newTextHash: "sha256:new",
        contentHash: null,
        unifiedDiffHash: null,
        oldTextPreview: "return 'before';",
        newTextPreview: "return 'after';",
        contentPreview: null,
        unifiedDiffPreview: null,
        contextBeforePreview: "function run() {",
        contextAfterPreview: "}",
        rawPromptStored: false as const,
        rawResponseStored: false as const,
        rawProviderLogStored: false as const,
        rawToolLogStored: false as const,
      },
    ];
    const excerpt = renderWorkerEditDiffExcerpt({
      changedFileRefs: ["src/example.ts"],
      operations,
      maxChars: 12_000,
    });
    const artifact = buildWorkerEditReviewArtifact({
      runtimeJobId: "job-worker-review",
      workflowId: "agent_team.coding",
      graphId: "graph-coding",
      branchId: "branch-1",
      nodeId: "node-implementation",
      workerId: "worker.kimi.file-implementation",
      roleId: "implementation_engineer",
      capabilityId: "implementation_microtask",
      taskId: "task-implementation",
      actionStatus: "rolled_back",
      reviewState: "pending_model_or_human_review",
      authorityScopeRefs: ["src/example.ts"],
      nodeExecutionContractRef: "contract://node-implementation",
      nodeExecutionContractHash: "sha256:contract",
      nodeExecutionPacketRef: "packet://node-implementation",
      nodeExecutionPacketHash: "sha256:packet",
      domainResourcePacketRef: "resource://node-implementation",
      domainResourcePacketHash: "sha256:resource",
      domainResourceSelectionPacketRef: "domain-resource-selection://node-implementation",
      domainResourceSelectionPacketHash: "sha256:target",
      validationRefs: ["validation://diff-check"],
      evidenceClaimRefs: ["worker-evidence://claim-1"],
      rollbackMode: "rolled_back",
      rollbackResultRefs: ["rollback://node-implementation/1"],
      reviewDecisionRefs: [],
      payloadRefs: ["transaction://node-implementation/1"],
      payloadHashes: ["sha256:diff"],
      payloadCounts: {
        changedFileRefCount: 1,
        validationRefCount: 1,
        operationCount: 1,
      },
      boundedSummary: "Worker changed src/example.ts and rolled it back for review.",
      reasonCodes: ["worker_edit_review_artifact_persisted"],
      changedFileRefs: ["src/example.ts"],
      beforeSnapshotRefs: ["snapshot://src/example.ts/before"],
      afterSnapshotRefs: ["snapshot://src/example.ts/after"],
      beforeAfterHashes: ["sha256:before-after"],
      diffHash: "sha256:diff",
      boundedUnifiedDiffExcerpt: excerpt,
      boundedDiffPayloadRef: null,
      diffPartPayloadRefs: [],
      editTransactionRefs: ["transaction://node-implementation/1"],
      rejectedOperationRefs: [],
      rejectedOperationReasonCodes: [],
      operations,
    });

    expect(WorkerEditReviewArtifactSchema.parse(artifact)).toMatchObject({
      artifactKind: "worker_edit_review_artifact",
      schemaVersion: WORKER_EDIT_REVIEW_ARTIFACT_SCHEMA_VERSION,
      actionKind: "coding.worker_edit",
      actionStatus: "rolled_back",
      changedFileRefs: ["src/example.ts"],
      validationRefs: ["validation://diff-check"],
      rollbackMode: "rolled_back",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
    });
    expect(artifact.artifactRef).toMatch(/^worker-edit-review:\/\//u);
    expect(artifact.boundedDiffPayloadRef).toBe(`${artifact.artifactRef}#bounded-diff-excerpt`);
    expect(artifact.boundedUnifiedDiffExcerpt).toContain("--- src/example.ts");
    expect(artifact.operations[0]?.oldTextPreview).toBe("return 'before';");
  });
});
