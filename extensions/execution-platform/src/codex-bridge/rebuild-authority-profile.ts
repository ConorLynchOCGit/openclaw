import { spawn as nodeSpawn } from "node:child_process";
import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";

export type RebuildAuthorityProfile = {
  artifactKind: "codex_bridge_rebuild_authority_profile";
  profileId: string;
  profileVersion: "v1" | "v2";
  explicitRebuildCommands: string[];
  allowedRebuildTarget: string;
  maxAttempts: number;
  timeoutMs: number;
  maxOutputBytes: number;
  failureCaptureRequired: true;
  recoveryStateRequired: true;
  bailoutBoundary: string;
  rollbackPlanRequired: true;
  hiddenRebuildsAllowed: false;
  runawayLoopAllowed: false;
  deployAllowed: false;
  installAllowed: false;
  outboundSendingAllowed: false;
  modelPromotionAllowed: false;
};

export type RebuildAuthorityValidation = {
  artifactKind: "codex_bridge_rebuild_authority_validation";
  profileId: string;
  valid: boolean;
  blockingReasons: string[];
};

export type RebuildCommandResult = {
  artifactKind: "codex_bridge_rebuild_command_result";
  profileId: string;
  command: string;
  attempt: number;
  status: "succeeded" | "failed" | "timed_out" | "refused";
  exitCode: number | null;
  outputPreview: string | null;
  failureCaptured: boolean;
  bailoutBoundaryReached: boolean;
  deployPerformed: false;
  installPerformed: false;
  outboundSendingPerformed: false;
  modelPromotionPerformed: false;
};

export type RebuildCommandRunner = (input: {
  command: string;
  cwd: string;
  timeoutMs: number;
  maxOutputBytes: number;
}) => Promise<{
  status: "succeeded" | "failed" | "timed_out";
  exitCode: number | null;
  outputPreview: string | null;
}>;

export function createRebuildAuthorityProfile(
  input: Partial<
    Pick<
      RebuildAuthorityProfile,
      | "profileId"
      | "explicitRebuildCommands"
      | "allowedRebuildTarget"
      | "maxAttempts"
      | "timeoutMs"
      | "maxOutputBytes"
      | "bailoutBoundary"
    >
  > = {},
): RebuildAuthorityProfile {
  return {
    artifactKind: "codex_bridge_rebuild_authority_profile",
    profileId: input.profileId ?? "rebuild-authority-v2",
    profileVersion: "v2",
    explicitRebuildCommands: input.explicitRebuildCommands ?? ["pnpm tsgo:full"],
    allowedRebuildTarget: input.allowedRebuildTarget ?? "typecheck",
    maxAttempts: input.maxAttempts ?? 1,
    timeoutMs: input.timeoutMs ?? 300_000,
    maxOutputBytes: input.maxOutputBytes ?? 512 * 1024,
    failureCaptureRequired: true,
    recoveryStateRequired: true,
    bailoutBoundary: input.bailoutBoundary ?? "stop_after_max_attempts_and_record_needs_review",
    rollbackPlanRequired: true,
    hiddenRebuildsAllowed: false,
    runawayLoopAllowed: false,
    deployAllowed: false,
    installAllowed: false,
    outboundSendingAllowed: false,
    modelPromotionAllowed: false,
  };
}

export function validateRebuildAuthorityProfile(
  profile: RebuildAuthorityProfile,
): RebuildAuthorityValidation {
  const reasons: string[] = [];
  if (profile.explicitRebuildCommands.length === 0) {
    reasons.push("explicit_rebuild_command_required");
  }
  if (profile.explicitRebuildCommands.some((command) => !command.trim())) {
    reasons.push("blank_rebuild_command");
  }
  if (!Number.isInteger(profile.maxAttempts) || profile.maxAttempts <= 0) {
    reasons.push("invalid_max_attempts");
  }
  if (profile.maxAttempts > 3) {
    reasons.push("unbounded_rebuild_retries_not_allowed");
  }
  if (!Number.isInteger(profile.timeoutMs) || profile.timeoutMs <= 0) {
    reasons.push("invalid_timeout_ms");
  }
  if (profile.hiddenRebuildsAllowed) {
    reasons.push("hidden_rebuilds_not_allowed");
  }
  if (profile.runawayLoopAllowed) {
    reasons.push("runaway_loop_not_allowed");
  }
  if (
    !profile.rollbackPlanRequired ||
    !profile.failureCaptureRequired ||
    !profile.recoveryStateRequired
  ) {
    reasons.push("rollback_failure_capture_and_recovery_state_required");
  }
  if (profile.deployAllowed) {
    reasons.push("deploy_not_allowed");
  }
  if (profile.installAllowed) {
    reasons.push("install_not_allowed");
  }
  if (profile.outboundSendingAllowed) {
    reasons.push("outbound_sending_not_allowed");
  }
  if (profile.modelPromotionAllowed) {
    reasons.push("model_promotion_not_allowed");
  }
  return {
    artifactKind: "codex_bridge_rebuild_authority_validation",
    profileId: profile.profileId,
    valid: reasons.length === 0,
    blockingReasons: reasons,
  };
}

export const defaultRebuildCommandRunner: RebuildCommandRunner = async (input) => {
  const [command, ...args] = input.command.split(/\s+/u);
  if (!command) {
    return { status: "failed", exitCode: null, outputPreview: "empty command" };
  }
  return new Promise((resolve) => {
    const controller = new AbortController();
    let timedOut = false;
    let output = "";
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, input.timeoutMs);
    const child = nodeSpawn(command, args, {
      cwd: input.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      signal: controller.signal,
      env: { PATH: process.env.PATH ?? "" },
    });
    const append = (chunk: Buffer | string) => {
      output += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
      if (Buffer.byteLength(output, "utf8") > input.maxOutputBytes) {
        output = output.slice(0, input.maxOutputBytes);
        child.kill("SIGTERM");
      }
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        status: timedOut ? "timed_out" : "failed",
        exitCode: null,
        outputPreview: error instanceof Error ? error.message : String(error),
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        status: timedOut ? "timed_out" : code === 0 ? "succeeded" : "failed",
        exitCode: typeof code === "number" ? code : null,
        outputPreview: output || null,
      });
    });
  });
};

export async function runControlledRebuild(input: {
  profile: RebuildAuthorityProfile;
  command: string;
  cwd: string;
  runtimeJobs?: RuntimeJobRepository;
  runtimeJobId?: string;
  runner?: RebuildCommandRunner;
}): Promise<RebuildCommandResult> {
  const validation = validateRebuildAuthorityProfile(input.profile);
  const commandAllowed = input.profile.explicitRebuildCommands.includes(input.command);
  if (!validation.valid || !commandAllowed) {
    return {
      artifactKind: "codex_bridge_rebuild_command_result",
      profileId: input.profile.profileId,
      command: input.command,
      attempt: 0,
      status: "refused",
      exitCode: null,
      outputPreview: validation.blockingReasons
        .concat(commandAllowed ? [] : ["command_not_allowlisted"])
        .join(", "),
      failureCaptured: true,
      bailoutBoundaryReached: true,
      deployPerformed: false,
      installPerformed: false,
      outboundSendingPerformed: false,
      modelPromotionPerformed: false,
    };
  }
  const runner = input.runner ?? defaultRebuildCommandRunner;
  const raw = await runner({
    command: input.command,
    cwd: input.cwd,
    timeoutMs: input.profile.timeoutMs,
    maxOutputBytes: input.profile.maxOutputBytes,
  });
  const result: RebuildCommandResult = {
    artifactKind: "codex_bridge_rebuild_command_result",
    profileId: input.profile.profileId,
    command: input.command,
    attempt: 1,
    status: raw.status,
    exitCode: raw.exitCode,
    outputPreview: raw.outputPreview,
    failureCaptured: raw.status !== "succeeded",
    bailoutBoundaryReached: raw.status !== "succeeded",
    deployPerformed: false,
    installPerformed: false,
    outboundSendingPerformed: false,
    modelPromotionPerformed: false,
  };
  if (input.runtimeJobs && input.runtimeJobId) {
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "codex_bridge.rebuild_command_result",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/codex-bridge/rebuild/${input.profile.profileId}`,
      contentType: "application/json",
      metadata: result as unknown as JsonValue,
    });
    await input.runtimeJobs.recordEvent({
      jobId: input.runtimeJobId,
      eventType: "codex_bridge.rebuild_command_recorded",
      data: {
        profileId: input.profile.profileId,
        status: result.status,
        bailoutBoundaryReached: result.bailoutBoundaryReached,
      },
    });
  }
  return result;
}
