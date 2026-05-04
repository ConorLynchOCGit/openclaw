import {
  CodexBridgeControlBridgeRepository,
  type CodexBridgeControlCommand,
  type CodexBridgeRedirectPromptMetadata,
} from "../codex-bridge/control-bridge.ts";
import type { JsonValue } from "../runtime-job-repository.ts";

export type WorkQueueExecutionControlApiResult = {
  artifactKind: "work_queue_execution_control_api_result";
  workItemId: string | null;
  runtimeJobId: string;
  sessionId: string;
  command: CodexBridgeControlCommand;
  workQueueLifecycleMutated: false;
  lifecycleMutationAllowed: false;
};

export type WorkQueueExecutionControlApiInput = {
  controlBridge: CodexBridgeControlBridgeRepository;
  workItemId?: string | null;
  runtimeJobId: string;
  sessionId: string;
  actor: string;
  reason: string;
};

function assertNoWorkQueueLifecycleMutation(value: {
  reason?: string;
  redirectPrompt?: CodexBridgeRedirectPromptMetadata;
}): void {
  const serialized = JSON.stringify({
    reason: value.reason,
    redirectPrompt: value.redirectPrompt,
  })
    .toLowerCase()
    .replace(/\bdo not\b[^."]*work queue[^."]*lifecycle[^."]*/gu, "")
    .replace(/\bno\b[^."]*work queue[^."]*lifecycle[^."]*/gu, "");
  if (
    /work queue lifecycle.+(running|succeeded|failed|canceled)/u.test(serialized) ||
    /mutate.+work queue.+lifecycle/u.test(serialized)
  ) {
    throw new Error("work queue execution controls cannot mutate lifecycle directly");
  }
}

export class WorkQueueExecutionControlApi {
  async pause(
    input: WorkQueueExecutionControlApiInput,
  ): Promise<WorkQueueExecutionControlApiResult> {
    assertNoWorkQueueLifecycleMutation(input);
    const command = await input.controlBridge.createPauseCommand(input);
    const recorded = await input.controlBridge.recordControlCommand({ command });
    return this.result(input, recorded);
  }

  async redirect(
    input: WorkQueueExecutionControlApiInput & {
      redirectPrompt: CodexBridgeRedirectPromptMetadata;
    },
  ): Promise<WorkQueueExecutionControlApiResult> {
    assertNoWorkQueueLifecycleMutation(input);
    const command = await input.controlBridge.createRedirectCommand(input);
    const recorded = await input.controlBridge.recordControlCommand({ command });
    return this.result(input, recorded);
  }

  async cancel(
    input: WorkQueueExecutionControlApiInput & { cancelRuntimeJob?: boolean },
  ): Promise<WorkQueueExecutionControlApiResult> {
    assertNoWorkQueueLifecycleMutation(input);
    const command = await input.controlBridge.createCancelCommand(input);
    const recorded = await input.controlBridge.recordControlCommand({
      command,
      cancelRuntimeJob: input.cancelRuntimeJob,
    });
    return this.result(input, recorded);
  }

  private result(
    input: WorkQueueExecutionControlApiInput,
    command: CodexBridgeControlCommand,
  ): WorkQueueExecutionControlApiResult {
    return {
      artifactKind: "work_queue_execution_control_api_result",
      workItemId: input.workItemId ?? null,
      runtimeJobId: input.runtimeJobId,
      sessionId: input.sessionId,
      command,
      workQueueLifecycleMutated: false,
      lifecycleMutationAllowed: false,
    };
  }
}

export function summarizeWorkQueueExecutionControlApiResult(
  result: WorkQueueExecutionControlApiResult,
): JsonValue {
  return {
    workItemId: result.workItemId,
    runtimeJobId: result.runtimeJobId,
    sessionId: result.sessionId,
    commandId: result.command.commandId,
    commandKind: result.command.commandKind,
    status: result.command.status,
    workQueueLifecycleMutated: false,
    lifecycleMutationAllowed: false,
  };
}
