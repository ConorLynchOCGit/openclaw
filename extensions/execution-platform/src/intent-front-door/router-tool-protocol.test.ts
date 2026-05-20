import { describe, expect, it } from "vitest";
import { ROUTER_FRONT_DOOR_RUNTIME_TOOL_IDS } from "./router-runtime-tools.ts";
import { createBaseCanonicalRouterOutput, createCanonicalRouterAction } from "./router-schema.ts";
import {
  buildRouterFrontDoorToolProtocolResult,
  assertRouterFrontDoorToolProtocolCanCompile,
} from "./router-tool-protocol.ts";

const output = createBaseCanonicalRouterOutput({
  route: "workflow_execution",
  responseMode: "create_runtime_job",
  executeNow: true,
  executorWorkflowId: "agent_team.coding",
  workflowId: "agent_team.coding",
  jobType: "executor.agent_team",
  objectiveSummary: "Implement a workflow surface.",
  requestedCapabilities: ["code_edit", "test", "review", "closeout"],
  requestedActions: [createCanonicalRouterAction("code_edit", "bounded source edit", 0.95)],
  constraints: [
    {
      constraintKind: "safety_boundary",
      objectSummary: "Do not deploy or store raw logs.",
      confidence: 0.99,
    },
  ],
  sideEffectClass: "code_edit",
});

describe("router front-door tool protocol", () => {
  it("compiles staged router tool traces into a bounded Mission Ledger handoff", () => {
    const protocol = buildRouterFrontDoorToolProtocolResult({
      requestId: "native-exec-router-test",
      promptHash: "a".repeat(64),
      routerOutput: output,
      validation: null,
      toolInvocations: ROUTER_FRONT_DOOR_RUNTIME_TOOL_IDS.map((toolId) => ({
        toolId,
        invocationRef: `runtime-tool://${toolId}`,
        status: "succeeded",
        outputRef: `runtime-tool-output://${toolId}`,
        reasonCodes: [`${toolId.replaceAll(".", "_")}_recorded`],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      })),
    });

    expect(protocol.status).toBe("succeeded");
    expect(protocol.phaseStatuses.map((phase) => phase.toolId)).toEqual([
      ...ROUTER_FRONT_DOOR_RUNTIME_TOOL_IDS,
    ]);
    expect(protocol.missionLedgerHandoffRef).toBe(
      "mission-ledger-handoff://native-exec-router-test#aaaaaaaaaaaaaaaa",
    );
    expect(protocol.constraintSummaries[0]?.constraintKind).toBe("safety_boundary");
    expect(protocol.rawPromptStored).toBe(false);
    expect(() => assertRouterFrontDoorToolProtocolCanCompile(protocol)).not.toThrow();
  });

  it("rejects protocol artifacts that claim raw storage or authority", () => {
    const protocol = buildRouterFrontDoorToolProtocolResult({
      requestId: "native-exec-router-test",
      promptHash: "b".repeat(64),
      routerOutput: output,
      toolInvocations: [],
    });
    expect(() =>
      assertRouterFrontDoorToolProtocolCanCompile({
        ...protocol,
        rawPromptStored: true as false,
      }),
    ).toThrow(/raw storage rejected/u);
    expect(() =>
      assertRouterFrontDoorToolProtocolCanCompile({
        ...protocol,
        authorityGranted: true as false,
      }),
    ).toThrow(/cannot grant authority/u);
  });
});
