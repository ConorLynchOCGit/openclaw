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
  "extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts",
];

const registeredBodyArtifactTypes = listRuntimeArtifactContracts()
  .filter((contract) => contract.storagePolicy === "payload_required")
  .map((contract) => contract.artifactType);

describe("runtime artifact contract registry", () => {
  it("registers the pre-proof body-bearing artifact contracts", () => {
    expect(registeredBodyArtifactTypes).toEqual(
      expect.arrayContaining([
        "execution_platform.mission_contract_ledger",
        "execution_platform.source_prompt_artifact",
        "execution_platform.source_prompt_window",
        "execution_platform.node_execution_run_record",
        "execution_platform.node_execution_snapshot",
        "execution_platform.node_agent_worker_prompt",
        "execution_platform.node_prompt_authoring_failure_diagnostic",
        "execution_platform.node_finish",
        "execution_platform.node_agent_session_trace",
        "execution_platform.node_agent_start_receipt",
        "execution_platform.action_review_artifact",
        "execution_platform.worker_edit_review_artifact",
        "execution_platform.mission_ledger_stability_diagnostic_run",
        "execution_platform.mission_ledger_stability_diagnostic_pair",
        "execution_platform.mission_ledger_stability_verdict",
        "execution_platform.fast_model.no_content_diagnostic",
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
    expect(isRuntimeArtifactPayloadRequired("execution_platform.node_execution_run_record")).toBe(
      true,
    );
    expect(isRuntimeArtifactPayloadRequired("execution_platform.node_execution_snapshot")).toBe(
      true,
    );
    expect(isRuntimeArtifactPayloadRequired("execution_platform.node_agent_worker_prompt")).toBe(
      true,
    );
    expect(getRuntimeArtifactContract("execution_platform.node_agent_worker_prompt")).toMatchObject(
      {
        storagePolicy: "payload_required",
        bodySchemaRef: "NodeAgentWorkerPrompt",
      },
    );
    expect(
      isRuntimeArtifactPayloadRequired(
        "execution_platform.node_prompt_authoring_failure_diagnostic",
      ),
    ).toBe(true);
    expect(isRuntimeArtifactPayloadRequired("execution_platform.node_finish")).toBe(true);
    expect(isRuntimeArtifactPayloadRequired("execution_platform.node_agent_session_trace")).toBe(
      true,
    );
    expect(isRuntimeArtifactPayloadRequired("execution_platform.node_agent_start_receipt")).toBe(
      true,
    );
    expect(getRuntimeArtifactContract("execution_platform.node_agent_start_receipt")).toMatchObject(
      {
        storagePolicy: "payload_required",
        bodySchemaRef: "NodeAgentStartReceipt",
      },
    );
    expect(isRuntimeArtifactPayloadRequired("execution_platform.requirement_map")).toBe(false);
    expect(isRuntimeArtifactPayloadRequired("execution.generic_orchestration_runtime_result")).toBe(
      false,
    );
    expect(isRuntimeArtifactPayloadRequired("execution_platform.source_prompt_window")).toBe(true);
    expect(getRuntimeArtifactContract("execution_platform.source_prompt_window")).toMatchObject({
      storagePolicy: "payload_required",
      bodySchemaRef: "SourcePromptWindowArtifact",
    });
    for (const retiredArtifactType of [
      "execution_platform.resource_scout_execution_packet",
      "execution_platform.resource_scope_revision.request",
      "execution_platform.resource_scope_revision.proposal",
      "execution_platform.resource_scope_revision.decision",
      "execution_platform.resource.scout.field_repair_request",
      "execution_platform.resource_handoff_packet",
      "execution_platform.resource_scope_revision_real_model_proof",
      "execution_platform.resource_frontier.request",
      "execution_platform.resource_frontier.shard_manifest",
      "execution_platform.resource_frontier.shard_handoff",
      "execution_platform.resource_frontier.shard_handoff_review",
      "execution_platform.resource_frontier.merge_packet",
      "execution_platform.resource_frontier.single_unit_blocker",
      "execution_platform.resource_requirement_packet",
      "execution_platform.resource_repair_requirement",
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
      "execution_platform.node_execution_contract",
      "execution_platform.node_execution_packet",
      "execution_platform.node_readiness_state",
      "execution_platform.node_execution_assignment",
    ]) {
      expect(getRuntimeArtifactContract(retiredArtifactType)).toBeNull();
      expect(isRuntimeArtifactPayloadRequired(retiredArtifactType)).toBe(false);
    }
    expect(
      isRuntimeArtifactPayloadRequired(
        "execution_platform.mission_ledger_stability_diagnostic_pair",
      ),
    ).toBe(true);
    expect(isRuntimeArtifactPayloadRequired("execution_platform.action_review_artifact")).toBe(
      true,
    );
    expect(isRuntimeArtifactPayloadRequired("execution_platform.worker_edit_review_artifact")).toBe(
      true,
    );
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

  it("rejects retired implementation packet artifact families", async () => {
    expect(
      getRuntimeArtifactContract("execution_platform.worker_owned_implementation_task_packet"),
    ).toBeNull();
    expect(getRuntimeArtifactContract("execution_platform.implementation_task_packet")).toBeNull();
    for (const relativePath of productionFilesThatWriteRuntimeArtifacts) {
      const source = await readFile(path.resolve(relativePath), "utf8");
      expect(source).not.toContain("execution_platform.worker_owned_implementation_task_packet");
      expect(source).not.toContain("execution_platform.implementation_task_packet");
    }
  });

  it("allows scheduler progress refs while rejecting native node bodies in manifest metadata", () => {
    expect(() =>
      assertRuntimeArtifactContractStorage({
        jobId: "job-1",
        artifactType: "agent_team.scheduler_progress",
        storageKind: "runtime-artifact-metadata",
        uri: "runtime-job://job-1/progress/1",
        contentType: "application/json",
        metadata: {
          nodeWorkerPromptRefs: ["node-agent-worker-prompt://run/hash"],
          nodeAgentTraceEventRefs: {
            workerPromptAuthoredRef: "node-agent-worker-prompt://run/hash",
            firstPlanUpdateRef:
              "openclaw-session://agent%3Aexecution-coding%3Anode%3Arun/tool/update_plan/first",
            scoutSpawnRef:
              "openclaw-session://agent%3Aexecution-coding%3Anode%3Arun/tool/task/first",
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
          nodeAgentWorkerPrompt: {
            artifactKind: "execution_platform.node_agent_worker_prompt",
            promptRef: "node-agent-worker-prompt://run/hash",
            nodeRunId: "run",
            snapshotRef: "node-execution-snapshot://run",
            promptHash: "hash",
            promptText: "Full prompt bodies must use payload storage.",
            modelRunRef: "model-run://prompt",
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
          nodeFinish: {
            artifactKind: "execution_platform.node_finish",
            nodeRunId: "run",
            status: "completed",
            summary: "Full terminal result body must use payload storage.",
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
          nodeAgentTraceManifest: {
            artifactKind: "node_agent_session_trace_manifest",
            traceRef: "node-agent-session-trace://run",
            eventRefCount: 4,
            tracePayloadRef: {
              payloadRef: "runtime-artifact-payload://job-1/node-agent-session-trace/hash",
              contentHash: "hash",
              byteCount: 1024,
            },
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
          nodeAgentTraceEventCount: 4,
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
        artifactType: "execution_platform.node_execution_snapshot",
        storageKind: "runtime-artifact-payload",
        uri: "runtime-artifact-payload://job-1/node-execution-snapshot/manifest",
        contentType: "application/json",
        metadata: {
          artifactKind: "runtime_job_artifact_payload_manifest",
          payloadRef: "runtime-artifact-payload://job-1/node-execution-snapshot/body",
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
        artifactType: "execution_platform.node_execution_snapshot",
        storageKind: "runtime-artifact-payload",
        uri: "runtime-artifact-payload://job-1/node-execution-snapshot/manifest",
        contentType: "application/json",
        metadata: {
          artifactKind: "runtime_job_artifact_payload_manifest",
          payloadRef: "runtime-artifact-payload://job-1/node-execution-snapshot/body",
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
        artifactType: "execution_platform.node_execution_snapshot",
        storageKind: "runtime-artifact-payload",
        uri: "runtime-job://job-1/node-execution-snapshot/1",
        contentType: "application/json",
        metadata: {
          artifactKind: "runtime_job_artifact_payload_manifest",
          payloadRef: "runtime-artifact-payload://job-1/node-execution-snapshot/hash",
          sha256: "hash",
          byteCount: 1024,
          nodeExecutionSnapshot: {
            snapshotKind: "node_execution_snapshot",
            snapshotRef: "runtime-work-graph://node-execution-snapshot/one",
          },
          rawPromptStored: false,
          rawResponseStored: false,
        },
      }),
    ).toThrow(/metadata manifest violation/u);

    expect(() =>
      assertRuntimeArtifactContractStorage({
        jobId: "job-1",
        artifactType: "execution_platform.node_execution_snapshot",
        storageKind: "runtime-artifact-payload",
        uri: "runtime-job://job-1/node-execution-snapshot/2",
        contentType: "application/json",
        metadata: {
          artifactKind: "runtime_job_artifact_payload_manifest",
          payloadRef: "runtime-artifact-payload://job-1/node-execution-snapshot/hash",
          sha256: "hash",
          byteCount: 1024,
          nodeExecutionSnapshotManifest: {
            snapshotRef: "runtime-work-graph://node-execution-snapshot/one",
            contentHash: "hash",
            progressiveState: "node_agent_session_ready",
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
