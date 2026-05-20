import { describe, expect, it } from "vitest";
import {
  AGENT_TEAM_CODING_PLUGIN_EXECUTOR_KEYS,
  AGENT_TEAM_CODING_PLUGIN_RUNTIME_TOOL_FAMILIES,
  AGENT_TEAM_CODING_WORKFLOW_PLUGIN_ID,
  buildAgentTeamCodingWorkflowPlugin,
} from "./agent-team-coding-plugin.ts";
import type { RuntimeWorkGraphNodeExecutor } from "./runtime-work-graph-scheduler.ts";
import { requireCanonicalWorkflowDefinition } from "./workflow-definition-registry.ts";

const executor: RuntimeWorkGraphNodeExecutor = {
  execute: async () => ({
    status: "succeeded",
    outputArtifactRefs: [],
    reasonCodes: [],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  }),
};

describe("agent_team.coding workflow plugin", () => {
  it("owns production coding scheduler policy and executor requirements", () => {
    const definition = requireCanonicalWorkflowDefinition("agent_team.coding");
    const executors = Object.fromEntries(
      AGENT_TEAM_CODING_PLUGIN_EXECUTOR_KEYS.map((key) => [key, executor]),
    );
    const plugin = buildAgentTeamCodingWorkflowPlugin({ definition, executors });

    expect(plugin.pluginId).toBe(AGENT_TEAM_CODING_WORKFLOW_PLUGIN_ID);
    expect(plugin.workflowId).toBe("agent_team.coding");
    expect(plugin.definitionId).toBe(definition.definitionId);
    expect(plugin.schedulerPolicy).toMatchObject({
      requireMissionLedgerForExecutionWorkflow: true,
      requireCostAwareCapabilityPolicy: true,
      requireEvidenceClaimsForMissionLedger: true,
      requireSchedulerToolKernel: true,
      stagedSchedulerProtocolRequired: true,
      stagedGraphAcceptanceRequired: true,
      modelAuthoredWorkPacketsRequiredForComplexMission: true,
      runtimeDerivedNodeEnvelopeRequired: true,
      runtimeDerivedExpectedEvidenceRequired: true,
      modelAuthoredStructureReviewRequired: true,
      firstNodeApprovalRequired: true,
      directImplementationFirstMovePolicy: "simple_only",
      broadImplementationFirstMoveAllowed: false,
      degradedCloseoutSuccessAllowed: false,
    });
    expect(plugin.runtimeToolFamilies).toEqual(
      expect.arrayContaining(AGENT_TEAM_CODING_PLUGIN_RUNTIME_TOOL_FAMILIES),
    );
    expect(plugin.validationExpectations).toEqual(
      expect.arrayContaining([
        "workflow_evidence_profile_accepted",
        "model_authored_closeout_present",
        "completion_review_gate_accepted",
      ]),
    );
  });
});
