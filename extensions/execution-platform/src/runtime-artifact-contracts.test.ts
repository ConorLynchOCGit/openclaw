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
        "execution_platform.commitment_work_packet",
        "execution_platform.commitment_work_packet.pre_review",
        "execution_platform.commitment_work_packet.post_review",
        "execution_platform.commitment_work_packet.post_repair",
        "execution_platform.commitment_work_packet.replay",
        "execution_platform.context_scout_execution_packet",
        "execution_platform.context_handoff_packet",
        "execution_platform.context_broker.request",
        "execution_platform.implementation_context_packet",
        "execution_platform.implementation_resource_materialization_result",
        "execution_platform.implementation_task_packet",
        "execution_platform.coding_resource_packet",
        "execution_platform.node_execution_packet",
        "execution_platform.node_readiness_state",
        "execution.generic_orchestration_runtime_result",
        "execution_platform.mission_ledger_stability_diagnostic_run",
        "execution_platform.mission_ledger_stability_diagnostic_pair",
        "execution_platform.mission_ledger_stability_verdict",
        "execution_platform.commitment_packet.semantic_brief",
        "execution_platform.commitment_packet.field_completion",
        "execution_platform.commitment_packet_fanout_diagnostics",
        "execution_platform.fast_model.no_content_diagnostic",
        "execution_platform.runtime_graph_patch",
      ]),
    );
    expect(getRuntimeArtifactContract("agent_team.scheduler_progress")).toMatchObject({
      storagePolicy: "metadata_manifest_only",
    });
    expect(getRuntimeArtifactContract("execution_platform.latest_run_state")).toMatchObject({
      storagePolicy: "metadata_manifest_only",
    });
    expect(isRuntimeArtifactPayloadRequired("execution_platform.node_execution_packet")).toBe(true);
    expect(
      isRuntimeArtifactPayloadRequired(
        "execution_platform.mission_ledger_stability_diagnostic_pair",
      ),
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
            packetRefs: ["runtime-work-graph://commitment-work-packet/one"],
            packets: [
              {
                packetRef: "runtime-work-graph://commitment-work-packet/one",
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
          commitmentWorkPackets: [
            {
              packetKind: "commitment_work_packet",
              packetRef: "runtime-work-graph://commitment-work-packet/one",
              commitmentId: "one",
            },
          ],
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
            artifactKind: "context_broker_request",
            requestRef: "runtime-job://job-1/context-broker/request-1",
            semanticQuestion: "Find missing context.",
          },
          rawPromptStored: false,
          rawResponseStored: false,
        },
      }),
    ).toThrow(/metadata manifest violation/u);
  });
});
