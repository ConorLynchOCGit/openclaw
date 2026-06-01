import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertRuntimeArtifactContractStorage,
  getRuntimeArtifactContract,
  isRuntimeArtifactPayloadRequired,
  listRuntimeArtifactContracts,
} from "./runtime-artifact-contracts.ts";

const productionFilesThatWriteRuntimeArtifacts = [
  "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
  "extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts",
];

const registeredBodyArtifactTypes = listRuntimeArtifactContracts()
  .filter((contract) => contract.storagePolicy === "payload_required")
  .map((contract) => contract.artifactType);

describe("runtime artifact contract registry", () => {
  it("registers the pre-proof body-bearing artifact contracts", () => {
    expect(registeredBodyArtifactTypes).toEqual(
      expect.arrayContaining([
        "execution_platform.resource_scout_execution_packet",
        "execution_platform.resource_frontier.request",
        "execution_platform.resource_frontier.shard_manifest",
        "execution_platform.resource_frontier.shard_handoff",
        "execution_platform.resource_frontier.shard_handoff_review",
        "execution_platform.resource_frontier.merge_packet",
        "execution_platform.resource_frontier.single_unit_blocker",
        "execution_platform.resource_scope_revision.request",
        "execution_platform.resource_scope_revision.proposal",
        "execution_platform.resource_scope_revision.decision",
        "execution_platform.resource.scout.field_repair_request",
        "execution_platform.resource_scope_revision_real_model_proof",
        "execution_platform.resource_repair_requirement",
        "execution_platform.resource_handoff_packet",
        "execution_platform.resource_broker.request",
        "execution_platform.resource_objective_focus",
        "execution_platform.resource_objective_focus.legal_ref_universe",
        "execution_platform.node_resource_demand.session",
        "execution_platform.node_resource_demand.request",
        "execution_platform.node_resource_demand.fulfillment",
        "execution_platform.node_resource_demand.blocker",
        "execution_platform.resource.scout.specialist_subturn_request",
        "execution_platform.resource.scout.specialist_handoff",
        "execution_platform.resource.scout.specialist_result",
        "execution_platform.node_resource_ledger",
        "execution_platform.node_resource_ledger.entry",
        "execution_platform.work_intent.context_satisfaction_state",
        "execution_platform.resource_frontier_shard_real_model_proof",
        "execution_platform.implementation_context_packet",
        "execution_platform.resource_selection_packet",
        "execution_platform.resource_selection_handle_manifest",
        "execution_platform.resource_selection_field_repair_request",
        "execution_platform.domain_resource_selection_packet",
        "execution_platform.domain_resource_selection_request",
        "execution_platform.domain_resource_selection_proposal",
        "execution_platform.domain_resource_selection_decision",
        "execution_platform.domain_resource_selection_real_model_proof",
        "execution_platform.implementation_resource_materialization_result",
        "execution_platform.implementation_task_packet",
        "execution_platform.coding_resource_packet",
        "execution_platform.node_execution_packet",
        "execution_platform.node_readiness_state",
        "execution_platform.action_review_artifact",
        "execution_platform.worker_edit_review_artifact",
        "execution.generic_orchestration_runtime_result",
        "execution_platform.mission_ledger_stability_diagnostic_run",
        "execution_platform.mission_ledger_stability_diagnostic_pair",
        "execution_platform.mission_ledger_stability_verdict",
        "execution_platform.fast_model.no_content_diagnostic",
        "execution_platform.architecture_residue_source_inventory",
        "execution_platform.architecture_residue_model_audit",
        "execution_platform.runtime_graph_patch",
        "execution_platform.provider_diagnostics.response_shape",
        "execution_platform.proof_environment.heap_phase_snapshot",
      ]),
    );
    expect(getRuntimeArtifactContract("agent_team.scheduler_progress")).toMatchObject({
      storagePolicy: "metadata_manifest_only",
    });
    expect(getRuntimeArtifactContract("execution_platform.latest_run_state")).toMatchObject({
      storagePolicy: "metadata_manifest_only",
    });
    expect(isRuntimeArtifactPayloadRequired("execution_platform.node_execution_packet")).toBe(true);
    expect(isRuntimeArtifactPayloadRequired("execution_platform.resource_repair_requirement")).toBe(
      true,
    );
    expect(
      isRuntimeArtifactPayloadRequired("execution_platform.resource_scope_revision.request"),
    ).toBe(true);
    expect(
      isRuntimeArtifactPayloadRequired("execution_platform.resource_scope_revision.decision"),
    ).toBe(true);
    expect(isRuntimeArtifactPayloadRequired("execution_platform.resource_objective_focus")).toBe(
      true,
    );
    expect(
      isRuntimeArtifactPayloadRequired(
        "execution_platform.resource_objective_focus.legal_ref_universe",
      ),
    ).toBe(true);
    expect(isRuntimeArtifactPayloadRequired("execution_platform.node_resource_demand.session")).toBe(
      true,
    );
    expect(isRuntimeArtifactPayloadRequired("execution_platform.node_resource_demand.request")).toBe(
      true,
    );
    expect(
      isRuntimeArtifactPayloadRequired(
        "execution_platform.resource.scout.specialist_subturn_request",
      ),
    ).toBe(true);
    expect(
      isRuntimeArtifactPayloadRequired("execution_platform.resource.scout.specialist_handoff"),
    ).toBe(true);
    expect(isRuntimeArtifactPayloadRequired("execution_platform.node_resource_ledger")).toBe(true);
    expect(isRuntimeArtifactPayloadRequired("execution_platform.node_resource_ledger.entry")).toBe(
      true,
    );
    expect(isRuntimeArtifactPayloadRequired("execution_platform.domain_resource_selection_packet")).toBe(
      true,
    );
    expect(isRuntimeArtifactPayloadRequired("execution_platform.domain_resource_selection_request")).toBe(
      true,
    );
    expect(isRuntimeArtifactPayloadRequired("execution_platform.domain_resource_selection_decision")).toBe(
      true,
    );
    expect(isRuntimeArtifactPayloadRequired("execution_platform.resource_selection_packet")).toBe(
      true,
    );
    expect(
      isRuntimeArtifactPayloadRequired(
        "execution_platform.resource_selection_field_repair_request",
      ),
    ).toBe(true);
    expect(
      isRuntimeArtifactPayloadRequired(
        "execution_platform.mission_ledger_stability_diagnostic_pair",
      ),
    ).toBe(true);
    expect(isRuntimeArtifactPayloadRequired("execution_platform.action_review_artifact")).toBe(
      true,
    );
    expect(
      isRuntimeArtifactPayloadRequired("execution_platform.worker_edit_review_artifact"),
    ).toBe(true);
    expect(
      isRuntimeArtifactPayloadRequired("execution_platform.architecture_residue_source_inventory"),
    ).toBe(true);
    expect(
      isRuntimeArtifactPayloadRequired("execution_platform.architecture_residue_model_audit"),
    ).toBe(true);
    expect(
      isRuntimeArtifactPayloadRequired("execution_platform.provider_diagnostics.response_shape"),
    ).toBe(true);
    expect(
      isRuntimeArtifactPayloadRequired("execution_platform.proof_environment.heap_phase_snapshot"),
    ).toBe(true);
  });

  it("keeps production body-bearing artifact writes on the contract attach path", async () => {
    for (const relativePath of productionFilesThatWriteRuntimeArtifacts) {
      const source = await readFile(path.resolve(relativePath), "utf8");
      for (const artifactType of registeredBodyArtifactTypes) {
        const directAttachNeedle = `attachArtifact({`;
        const artifactNeedle = `artifactType: "${artifactType}"`;
        const directAttachIndex = source.indexOf(directAttachNeedle);
        const artifactIndex = source.indexOf(artifactNeedle);
        if (directAttachIndex >= 0 && artifactIndex >= 0) {
          const beforeArtifact = source.slice(Math.max(0, artifactIndex - 240), artifactIndex);
          expect(beforeArtifact).not.toContain(directAttachNeedle);
        }
      }
    }
  });

  it("allows scheduler progress packet summaries while rejecting packet bodies in manifest metadata", () => {
    expect(() =>
      assertRuntimeArtifactContractStorage({
        jobId: "job-1",
        artifactType: "agent_team.scheduler_progress",
        storageKind: "runtime-artifact-metadata",
        uri: "runtime-job://job-1/progress/1",
        contentType: "application/json",
        metadata: {
          commitmentWorkPacketSummaries: {
            packetCount: 1,
            packetRefs: ["runtime-work-graph://source-contract/one"],
            packets: [
              {
                packetRef: "runtime-work-graph://source-contract/one",
                commitmentId: "one",
                workerObjective: "Bounded summary only.",
              },
            ],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      }),
    ).not.toThrow();

    expect(() =>
      assertRuntimeArtifactContractStorage({
        jobId: "job-1",
        artifactType: "agent_team.scheduler_progress",
        storageKind: "runtime-artifact-metadata",
        uri: "runtime-job://job-1/progress/2",
        contentType: "application/json",
        metadata: {
          implementationTaskPacket: {
            packetKind: "implementation_task_packet",
            packetRef: "runtime-work-graph://implementation-task-packet/one",
          },
          rawPromptStored: false,
          rawResponseStored: false,
        },
      }),
    ).toThrow(/metadata manifest violation/u);

    expect(() =>
      assertRuntimeArtifactContractStorage({
        jobId: "job-1",
        artifactType: "agent_team.scheduler_progress",
        storageKind: "runtime-artifact-metadata",
        uri: "runtime-job://job-1/progress/3",
        contentType: "application/json",
        metadata: {
          contextBrokerRequest: {
            artifactKind: "resource_broker_request",
            requestRef: "runtime-job://job-1/context-broker/request-1",
            semanticQuestion: "Find missing context.",
          },
          rawPromptStored: false,
          rawResponseStored: false,
        },
      }),
    ).toThrow(/metadata manifest violation/u);

    expect(() =>
      assertRuntimeArtifactContractStorage({
        jobId: "job-1",
        artifactType: "agent_team.scheduler_progress",
        storageKind: "runtime-artifact-metadata",
        uri: "runtime-job://job-1/progress/4",
        contentType: "application/json",
        metadata: {
          nodeResourceDemandSession: {
            artifactKind: "node_resource_demand_session",
            sessionRef: "runtime-job://job-1/node-resource-demand/session-1",
            demandReason: "Full node resource demand bodies must use payload storage.",
          },
          rawPromptStored: false,
          rawResponseStored: false,
        },
      }),
    ).toThrow(/metadata manifest violation/u);

    expect(() =>
      assertRuntimeArtifactContractStorage({
        jobId: "job-1",
        artifactType: "agent_team.scheduler_progress",
        storageKind: "runtime-artifact-metadata",
        uri: "runtime-job://job-1/progress/5",
        contentType: "application/json",
        metadata: {
          nodeResourceLedger: {
            artifactKind: "node_resource_ledger",
            ledgerRef: "runtime-job://job-1/node-resource-ledger/impl-1",
            entryRefs: ["runtime-job://job-1/node-resource-ledger/impl-1/entry/one"],
          },
          rawPromptStored: false,
          rawResponseStored: false,
        },
      }),
    ).toThrow(/metadata manifest violation/u);

    expect(() =>
      assertRuntimeArtifactContractStorage({
        jobId: "job-1",
        artifactType: "agent_team.scheduler_progress",
        storageKind: "runtime-artifact-metadata",
        uri: "runtime-job://job-1/progress/6",
        contentType: "application/json",
        metadata: {
          nodeResourceLedgerEntry: {
            artifactKind: "node_resource_ledger_entry",
            entryRef: "runtime-job://job-1/node-resource-ledger/impl-1/entry/one",
            details: "Substantive model-authored context must be payload-backed.",
          },
          rawPromptStored: false,
          rawResponseStored: false,
        },
      }),
    ).toThrow(/metadata manifest violation/u);

    expect(() =>
      assertRuntimeArtifactContractStorage({
        jobId: "job-1",
        artifactType: "agent_team.scheduler_progress",
        storageKind: "runtime-artifact-metadata",
        uri: "runtime-job://job-1/progress/7",
        contentType: "application/json",
        metadata: {
          resourceObjectiveFocus: {
            artifactKind: "resource_objective_focus",
            focusRef: "runtime-job://job-1/resource-objective-focus/graph/impl/focus-1",
            nextUnknown: "Substantive model-authored focus belongs in payload storage.",
          },
          rawPromptStored: false,
          rawResponseStored: false,
        },
      }),
    ).toThrow(/metadata manifest violation/u);

    expect(() =>
      assertRuntimeArtifactContractStorage({
        jobId: "job-1",
        artifactType: "agent_team.scheduler_progress",
        storageKind: "runtime-artifact-metadata",
        uri: "runtime-job://job-1/progress/8",
        contentType: "application/json",
        metadata: {
          resourceObjectiveFocusManifest: {
            artifactKind: "resource_objective_focus_manifest",
            focusRef: "runtime-job://job-1/resource-objective-focus/graph/impl/focus-1",
            focusHash: "hash",
            selectedRefHandleCount: 2,
            selectedSemanticQuestionCount: 1,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
          nodeResourceLedgerManifest: {
            artifactKind: "node_resource_ledger_manifest",
            ledgerRef: "runtime-job://job-1/node-resource-ledger/impl-1",
            entryCount: 2,
            entryPayloadRefCount: 2,
            ledgerPayloadRef: {
              payloadRef: "runtime-artifact-payload://job-1/node-resource-ledger/hash",
              contentHash: "hash",
              byteCount: 1024,
            },
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
          nodeResourceLedgerEntryCount: 2,
          rawPromptStored: false,
          rawResponseStored: false,
        },
      }),
    ).not.toThrow();
  });

  it("allows body-like names as numeric manifest counts without allowing embedded bodies", () => {
    expect(() =>
      assertRuntimeArtifactContractStorage({
        jobId: "job-1",
        artifactType: "execution_platform.implementation_context_packet",
        storageKind: "runtime-artifact-payload",
        uri: "runtime-artifact-payload://job-1/implementation-context/manifest",
        contentType: "application/json",
        metadata: {
          artifactKind: "runtime_job_artifact_payload_manifest",
          payloadRef: "runtime-artifact-payload://job-1/implementation-context/body",
          inputCounts: {
            targetFileSnapshots: 2,
            fileSnapshots: 2,
          },
          outputCounts: {
            taskPackets: 1,
          },
          maxBounds: {
            targetFileSnapshots: 8,
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawDbRowsStored: false,
          secretsStored: false,
        },
      }),
    ).not.toThrow();

    expect(() =>
      assertRuntimeArtifactContractStorage({
        jobId: "job-1",
        artifactType: "execution_platform.implementation_context_packet",
        storageKind: "runtime-artifact-payload",
        uri: "runtime-artifact-payload://job-1/implementation-context/manifest",
        contentType: "application/json",
        metadata: {
          artifactKind: "runtime_job_artifact_payload_manifest",
          payloadRef: "runtime-artifact-payload://job-1/implementation-context/body",
          inputCounts: {
            targetFileSnapshots: [{ path: "src/file.ts", content: "embedded body" }],
          },
          rawPromptStored: false,
          rawResponseStored: false,
        },
      }),
    ).toThrow(/metadata manifest violation/u);

    expect(() =>
      assertRuntimeArtifactContractStorage({
        jobId: "job-1",
        artifactType: "agent_team.scheduler_progress",
        storageKind: "runtime-artifact-metadata",
        uri: "runtime-job://job-1/progress/4",
        contentType: "application/json",
        metadata: {
          architectureResidueInventoryReport: {
            survivorRefs: [{ file: "extensions/execution-platform/src/example.ts" }],
          },
          rawPromptStored: false,
          rawResponseStored: false,
        },
      }),
    ).toThrow(/metadata manifest violation/u);
  });

  it("rejects body-like keys in payload-required artifact metadata", () => {
    expect(() =>
      assertRuntimeArtifactContractStorage({
        jobId: "job-1",
        artifactType: "execution_platform.node_execution_packet",
        storageKind: "runtime-artifact-payload",
        uri: "runtime-job://job-1/node-execution-packet/1",
        contentType: "application/json",
        metadata: {
          artifactKind: "runtime_job_artifact_payload_manifest",
          payloadRef: "runtime-artifact-payload://job-1/node-execution-packet/hash",
          sha256: "hash",
          byteCount: 1024,
          nodeExecutionPacket: {
            packetKind: "node_execution_packet",
            packetRef: "runtime-work-graph://node-execution-packet/one",
          },
          rawPromptStored: false,
          rawResponseStored: false,
        },
      }),
    ).toThrow(/metadata manifest violation/u);

    expect(() =>
      assertRuntimeArtifactContractStorage({
        jobId: "job-1",
        artifactType: "execution_platform.node_execution_packet",
        storageKind: "runtime-artifact-payload",
        uri: "runtime-job://job-1/node-execution-packet/2",
        contentType: "application/json",
        metadata: {
          artifactKind: "runtime_job_artifact_payload_manifest",
          payloadRef: "runtime-artifact-payload://job-1/node-execution-packet/hash",
          sha256: "hash",
          byteCount: 1024,
          nodeExecutionPacketManifest: {
            packetRef: "runtime-work-graph://node-execution-packet/one",
            contentHash: "hash",
            progressiveState: "worker_action_ready",
            actionGateStatus: "ready",
          },
          rawPromptStored: false,
          rawResponseStored: false,
        },
      }),
    ).not.toThrow();

    expect(() =>
      assertRuntimeArtifactContractStorage({
        jobId: "job-1",
        artifactType: "execution_platform.worker_edit_review_artifact",
        storageKind: "runtime-artifact-payload",
        uri: "runtime-job://job-1/worker/metadata/1",
        contentType: "application/json",
        metadata: {
          artifactKind: "runtime_job_artifact_payload_manifest",
          payloadRef: "runtime-artifact-payload://job-1/worker/hash",
          sha256: "hash",
          byteCount: 2048,
          snapshots: [
            {
              fileRef: "src/example.ts",
              lineNumberedContent: "1| full content body",
            },
          ],
          rawPromptStored: false,
          rawResponseStored: false,
        },
      }),
    ).toThrow(/metadata manifest violation/u);
  });
});
