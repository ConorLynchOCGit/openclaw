import type { CodexBridgeControlBridgeRepository } from "./control-bridge.ts";
import type { CodexBridgeControlCommand } from "./control-bridge.ts";

export type LiveControlApplicationResult = {
  artifactKind: "codex_bridge_live_control_application";
  runtimeJobId: string;
  sessionId: string;
  commandId: string;
  commandKind: CodexBridgeControlCommand["commandKind"];
  appliedAt: string;
  launchAllowed: boolean;
  liveProcessSignalSent: boolean;
  promptInjectedIntoLiveProcess: boolean;
  appliedEffect:
    | "live_launch_paused_before_process_start"
    | "redirect_materialized_before_process_start"
    | "live_launch_canceled_before_process_start"
    | "running_process_canceled";
  redirectedPromptObjective: string | null;
  workQueueLifecycleMutated: false;
};

export type LiveControlDuringExecutionDecision = {
  commandId: string;
  commandKind: CodexBridgeControlCommand["commandKind"];
  reason: string;
  supportedEffect:
    | "pause_running_process_for_operator"
    | "cancel_running_process"
    | "redirect_requires_stop_and_next_turn"
    | "none";
  promptInjectedIntoLiveProcess: false;
};

export type ApplyControlBeforeLaunchInput = {
  controlBridge: CodexBridgeControlBridgeRepository;
  command: CodexBridgeControlCommand;
  now?: () => Date;
};

export async function applyControlCommandBeforeLaunch(
  input: ApplyControlBeforeLaunchInput,
): Promise<LiveControlApplicationResult> {
  const appliedAt = (input.now ?? (() => new Date()))().toISOString();
  let appliedEffect: LiveControlApplicationResult["appliedEffect"];
  let launchAllowed: boolean;
  let promptInjectedIntoLiveProcess = false;
  let redirectedPromptObjective: string | null = null;
  if (input.command.commandKind === "pause") {
    appliedEffect = "live_launch_paused_before_process_start";
    launchAllowed = false;
  } else if (input.command.commandKind === "redirect") {
    appliedEffect = "redirect_materialized_before_process_start";
    launchAllowed = true;
    promptInjectedIntoLiveProcess = true;
    redirectedPromptObjective = input.command.redirectPrompt?.objective ?? null;
  } else {
    appliedEffect = "live_launch_canceled_before_process_start";
    launchAllowed = false;
  }
  await input.controlBridge.markControlCommandApplied({
    runtimeJobId: input.command.runtimeJobId,
    commandId: input.command.commandId,
    actualEffect: appliedEffect,
  });
  return {
    artifactKind: "codex_bridge_live_control_application",
    runtimeJobId: input.command.runtimeJobId,
    sessionId: input.command.sessionId,
    commandId: input.command.commandId,
    commandKind: input.command.commandKind,
    appliedAt,
    launchAllowed,
    liveProcessSignalSent: false,
    promptInjectedIntoLiveProcess,
    appliedEffect,
    redirectedPromptObjective,
    workQueueLifecycleMutated: false,
  };
}

export function createLiveControlAbortController(): {
  controller: AbortController;
  cancelFromControlCommand: (command: CodexBridgeControlCommand) => LiveControlApplicationResult;
} {
  const controller = new AbortController();
  return {
    controller,
    cancelFromControlCommand(command) {
      if (command.commandKind !== "cancel") {
        throw new Error("only cancel commands can abort a running live process");
      }
      controller.abort();
      return {
        artifactKind: "codex_bridge_live_control_application",
        runtimeJobId: command.runtimeJobId,
        sessionId: command.sessionId,
        commandId: command.commandId,
        commandKind: command.commandKind,
        appliedAt: new Date().toISOString(),
        launchAllowed: false,
        liveProcessSignalSent: true,
        promptInjectedIntoLiveProcess: false,
        appliedEffect: "running_process_canceled",
        redirectedPromptObjective: null,
        workQueueLifecycleMutated: false,
      };
    },
  };
}

export async function pollLatestControlForRunningExecution(input: {
  controlBridge: CodexBridgeControlBridgeRepository;
  runtimeJobId: string;
  sessionId: string;
}): Promise<LiveControlDuringExecutionDecision | null> {
  const state = await input.controlBridge.readLatestControlState({
    runtimeJobId: input.runtimeJobId,
    sessionId: input.sessionId,
  });
  const command = state.pendingCommands.at(-1) ?? null;
  if (!command) {
    return null;
  }
  if (command.commandKind === "cancel") {
    await input.controlBridge.acknowledgeControlCommand({
      runtimeJobId: input.runtimeJobId,
      commandId: command.commandId,
      actor: "live-control-loop",
    });
    await input.controlBridge.markControlCommandApplied({
      runtimeJobId: input.runtimeJobId,
      commandId: command.commandId,
      actualEffect: "running_process_canceled",
    });
    return {
      commandId: command.commandId,
      commandKind: command.commandKind,
      reason: command.reason,
      supportedEffect: "cancel_running_process",
      promptInjectedIntoLiveProcess: false,
    };
  }
  if (command.commandKind === "pause") {
    await input.controlBridge.acknowledgeControlCommand({
      runtimeJobId: input.runtimeJobId,
      commandId: command.commandId,
      actor: "live-control-loop",
    });
    await input.controlBridge.markControlCommandApplied({
      runtimeJobId: input.runtimeJobId,
      commandId: command.commandId,
      actualEffect: "pause_running_process_for_operator",
    });
    return {
      commandId: command.commandId,
      commandKind: command.commandKind,
      reason: command.reason,
      supportedEffect: "pause_running_process_for_operator",
      promptInjectedIntoLiveProcess: false,
    };
  }
  await input.controlBridge.acknowledgeControlCommand({
    runtimeJobId: input.runtimeJobId,
    commandId: command.commandId,
    actor: "live-control-loop",
  });
  await input.controlBridge.markControlCommandApplied({
    runtimeJobId: input.runtimeJobId,
    commandId: command.commandId,
    actualEffect: "redirect_requires_stop_and_next_turn",
  });
  return {
    commandId: command.commandId,
    commandKind: command.commandKind,
    reason: command.reason,
    supportedEffect: "redirect_requires_stop_and_next_turn",
    promptInjectedIntoLiveProcess: false,
  };
}
