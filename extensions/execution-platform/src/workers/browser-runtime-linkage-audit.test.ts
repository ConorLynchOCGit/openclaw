import { describe, expect, it } from "vitest";
import { auditBrowserPromptRuntimeLinkage } from "./browser-runtime-linkage-audit.ts";

describe("browser prompt runtime linkage audit", () => {
  it("passes execution linkage only when runtime, worker, Work Queue, and closeout refs are present", () => {
    expect(
      auditBrowserPromptRuntimeLinkage({
        promptKind: "execution",
        runtimeJobId: "runtime-job-1",
        workflowId: "agent_team.coding",
        workerContractState: {
          contractState: "shadow",
          workerAdapterId: "worker.acp-codex.coding",
        },
        closeoutCapsule: {
          humanReport: { source: "model", reportMarkdown: "done" },
        },
        workQueueProjection: {
          latestRuntimeJobId: "runtime-job-1",
        },
      }),
    ).toMatchObject({
      passed: true,
      reasonCodes: ["browser_runtime_linkage_passed"],
    });
    expect(
      auditBrowserPromptRuntimeLinkage({
        promptKind: "execution",
        runtimeJobId: "runtime-job-1",
        workflowId: "agent_team.coding",
      }),
    ).toMatchObject({
      passed: false,
      reasonCodes: expect.arrayContaining([
        "execution_prompt_missing_worker_contract_state",
        "execution_prompt_missing_work_queue_projection",
        "execution_prompt_missing_closeout_capsule",
      ]),
    });
  });

  it("keeps chat, plan-only, and slash prompts away from runtime execution", () => {
    expect(
      auditBrowserPromptRuntimeLinkage({
        promptKind: "chat",
        runtimeJobCreated: false,
      }),
    ).toMatchObject({ passed: true });
    expect(
      auditBrowserPromptRuntimeLinkage({
        promptKind: "plan_only",
        runtimeJobId: "unexpected",
        runtimeJobCreated: true,
      }),
    ).toMatchObject({
      passed: false,
      reasonCodes: ["non_execution_prompt_created_runtime_job"],
    });
    expect(
      auditBrowserPromptRuntimeLinkage({
        promptKind: "slash",
        slashBypassedModelRouting: true,
      }),
    ).toMatchObject({ passed: true });
  });

  it("treats raw storage or lifecycle mutation as audit failures", () => {
    expect(
      auditBrowserPromptRuntimeLinkage({
        promptKind: "control",
        workQueueLifecycleMutated: true,
        rawPromptStored: true,
      }),
    ).toMatchObject({
      passed: false,
      reasonCodes: expect.arrayContaining([
        "raw_storage_flag_present",
        "work_queue_lifecycle_mutated",
        "control_prompt_mutated_lifecycle",
      ]),
    });
  });
});
