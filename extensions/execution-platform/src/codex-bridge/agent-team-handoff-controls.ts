import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import type { AgentTeamRoleId } from "./agent-team-plan.ts";

export type AgentTeamHandoffControlKind = "pause" | "redirect" | "cancel";
export type AgentTeamHandoffControlStatus = "recorded" | "applied" | "rejected";

export type AgentTeamHandoffControlCommand = {
  artifactKind: "agent_team_handoff_control";
  commandId: string;
  runtimeJobId: string;
  teamRunId: string;
  commandKind: AgentTeamHandoffControlKind;
  targetHandoffId: string;
  actor: string;
  reason: string;
  status: AgentTeamHandoffControlStatus;
  nextRole: AgentTeamRoleId | null;
  redirectPayloadSummary: string | null;
  liveProcessSignalSent: false;
  promptInjectedIntoLiveProcess: false;
  workQueueLifecycleMutated: false;
};

function unsafeRedirect(value: unknown): boolean {
  return /raw[-_ ]?(prompt|transcript|log)|secret-marker|work queue lifecycle|deploy|model promotion/iu.test(
    JSON.stringify(value),
  );
}

export function applyAgentTeamHandoffControl(input: {
  commandId: string;
  runtimeJobId: string;
  teamRunId: string;
  commandKind: AgentTeamHandoffControlKind;
  targetHandoffId: string;
  actor: string;
  reason: string;
  nextRole?: AgentTeamRoleId | null;
  redirectPayloadSummary?: string | null;
}): AgentTeamHandoffControlCommand {
  const rejected =
    input.commandKind === "redirect" &&
    unsafeRedirect({
      reason: input.reason,
      redirectPayloadSummary: input.redirectPayloadSummary,
      nextRole: input.nextRole,
    });
  return {
    artifactKind: "agent_team_handoff_control",
    commandId: input.commandId,
    runtimeJobId: input.runtimeJobId,
    teamRunId: input.teamRunId,
    commandKind: input.commandKind,
    targetHandoffId: input.targetHandoffId,
    actor: input.actor,
    reason: input.reason,
    status: rejected ? "rejected" : "applied",
    nextRole: input.commandKind === "cancel" || rejected ? null : (input.nextRole ?? null),
    redirectPayloadSummary:
      input.commandKind === "redirect" && !rejected ? (input.redirectPayloadSummary ?? "") : null,
    liveProcessSignalSent: false,
    promptInjectedIntoLiveProcess: false,
    workQueueLifecycleMutated: false,
  };
}

export async function recordAgentTeamHandoffControl(input: {
  runtimeJobs: RuntimeJobRepository;
  command: AgentTeamHandoffControlCommand;
}): Promise<void> {
  const metadata = input.command as unknown as JsonValue;
  await input.runtimeJobs.attachArtifact({
    jobId: input.command.runtimeJobId,
    artifactType: "agent_team.handoff_control",
    storageKind: "metadata",
    uri: `runtime-job://${input.command.runtimeJobId}/agent-team/handoff-control/${input.command.commandId}`,
    contentType: "application/json",
    sizeBytes: Buffer.byteLength(JSON.stringify(metadata), "utf8"),
    metadata,
  });
  await input.runtimeJobs.recordEvent({
    jobId: input.command.runtimeJobId,
    eventType: "agent_team.handoff_control_applied",
    data: {
      commandId: input.command.commandId,
      commandKind: input.command.commandKind,
      status: input.command.status,
      targetHandoffId: input.command.targetHandoffId,
    },
  });
}
