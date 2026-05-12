import { describe, expect, it } from "vitest";
import {
  SKILLIFIER_RUNTIME_JOB_TYPE,
  SKILLIFIER_WORKFLOW_ID,
  skillifierRuntimeWorkflowContract,
} from "./skillifier-runtime-workflow.ts";
import { validateExecutionWorkflowContract } from "./workflow-contract.ts";
import {
  DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
  getWorkflowContract,
  validateWorkflowRegistry,
} from "./workflow-registry.ts";

describe("Skillifier runtime workflow contract", () => {
  it("defines a first-class runtime workflow with no lifecycle or side-effect authority", () => {
    expect(validateExecutionWorkflowContract(skillifierRuntimeWorkflowContract)).toEqual({
      valid: true,
      reasonCodes: [],
    });
    expect(skillifierRuntimeWorkflowContract).toMatchObject({
      workflowId: SKILLIFIER_WORKFLOW_ID,
      jobType: SKILLIFIER_RUNTIME_JOB_TYPE,
      status: "enabled",
      workQueueProjection: { lifecycleMutationAllowed: false },
      storagePolicy: {
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
      },
      productionSideEffectPolicy: {
        productionDeployAllowed: false,
        externalOutboundWriteAllowed: false,
        productionModelPromotionAllowed: false,
      },
    });
  });

  it("is registered for routing and worker readiness without raw storage", () => {
    expect(
      getWorkflowContract(DEFAULT_EXECUTION_WORKFLOW_REGISTRY, SKILLIFIER_WORKFLOW_ID),
    ).toEqual(skillifierRuntimeWorkflowContract);
    expect(validateWorkflowRegistry(DEFAULT_EXECUTION_WORKFLOW_REGISTRY)).toEqual({
      valid: true,
      reasonCodes: [],
    });
    expect(JSON.stringify(skillifierRuntimeWorkflowContract)).not.toContain(
      'rawTranscriptStored":true',
    );
  });
});
