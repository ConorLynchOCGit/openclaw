import type { RuntimeWorkGraphNodeExecutor } from "../workflows/runtime-work-graph-scheduler.ts";
import type { AgentTeamRoleId } from "./agent-team-plan.ts";

export type CodingTeamSchedulerExecutorMapInput = {
  roleExecutor: (roleId: AgentTeamRoleId) => RuntimeWorkGraphNodeExecutor;
  implementationExecutor: RuntimeWorkGraphNodeExecutor;
  repairExecutor: RuntimeWorkGraphNodeExecutor;
  validationExecutor: RuntimeWorkGraphNodeExecutor;
  closeoutExecutor: RuntimeWorkGraphNodeExecutor;
  humanExecutor: RuntimeWorkGraphNodeExecutor;
};

export function buildCodingTeamSchedulerExecutorMap(
  input: CodingTeamSchedulerExecutorMapInput,
): Record<string, RuntimeWorkGraphNodeExecutor> {
  return {
    "role:test_engineer": input.roleExecutor("test_engineer"),
    "role:reviewer": input.roleExecutor("reviewer"),
    "role:observability_scribe": input.roleExecutor("observability_scribe"),
    "role:implementation_engineer": input.implementationExecutor,
    "kind:implementation": input.implementationExecutor,
    "kind:test_authoring": input.implementationExecutor,
    "kind:repair": input.repairExecutor,
    "kind:validation": input.validationExecutor,
    "kind:test_review": input.validationExecutor,
    "kind:reviewer": input.roleExecutor("reviewer"),
    "kind:observability_readback": input.roleExecutor("observability_scribe"),
    "kind:human_task": input.humanExecutor,
    "kind:closeout": input.closeoutExecutor,
  };
}
