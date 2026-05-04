import type { JsonValue } from "../runtime-job-repository.ts";
import {
  runQueuedBridgeRunnerCommand,
  type QueuedBridgeRunnerCommandInput,
  type QueuedBridgeRunnerCommandResult,
} from "./queued-bridge-runner-command.ts";

export type QueueRunnerEndpointAuth = {
  actorId: string;
  role: "operator" | "admin" | "service";
  authenticated: boolean;
};

export type QueueRunnerEndpointRequest = Omit<
  QueuedBridgeRunnerCommandInput,
  "workerId" | "dryRun"
> & {
  auth: QueueRunnerEndpointAuth;
  workerId?: string;
  dryRun?: boolean;
  maxRuntimeMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
};

export type QueueRunnerEndpointResult = {
  artifactKind: "codex_bridge_queue_runner_endpoint_result";
  accepted: boolean;
  authActorId: string | null;
  blockingReasons: string[];
  commandResult: QueuedBridgeRunnerCommandResult | null;
  boundedProof: JsonValue;
  daemonStarted: false;
  schedulerStarted: false;
  workQueueLifecycleMutated: false;
};

export function validateQueueRunnerEndpointAuth(auth: QueueRunnerEndpointAuth | null | undefined): {
  valid: boolean;
  blockingReasons: string[];
} {
  const reasons: string[] = [];
  if (!auth?.authenticated) {
    reasons.push("operator_authentication_required");
  }
  if (auth && auth.role !== "operator" && auth.role !== "admin" && auth.role !== "service") {
    reasons.push("operator_or_service_role_required");
  }
  if (!auth?.actorId?.trim()) {
    reasons.push("operator_actor_id_required");
  }
  return { valid: reasons.length === 0, blockingReasons: reasons };
}

export async function handleQueueRunnerRunOnceEndpoint(
  request: QueueRunnerEndpointRequest,
): Promise<QueueRunnerEndpointResult> {
  const auth = validateQueueRunnerEndpointAuth(request.auth);
  if (!auth.valid) {
    return {
      artifactKind: "codex_bridge_queue_runner_endpoint_result",
      accepted: false,
      authActorId: request.auth?.actorId ?? null,
      blockingReasons: auth.blockingReasons,
      commandResult: null,
      boundedProof: {
        blockingReasons: auth.blockingReasons,
        daemonStarted: false,
        schedulerStarted: false,
        workQueueLifecycleMutated: false,
      },
      daemonStarted: false,
      schedulerStarted: false,
      workQueueLifecycleMutated: false,
    };
  }

  const commandResult = await runQueuedBridgeRunnerCommand({
    ...request,
    workerId: request.workerId ?? `operator:${request.auth.actorId}`,
    dryRun: request.dryRun ?? false,
  });
  return {
    artifactKind: "codex_bridge_queue_runner_endpoint_result",
    accepted: true,
    authActorId: request.auth.actorId,
    blockingReasons: [],
    commandResult,
    boundedProof: {
      workerId: commandResult.workerId,
      queueName: commandResult.queueName,
      runtimeJobIdFilter: commandResult.runtimeJobIdFilter,
      dryRun: commandResult.dryRun,
      eligibleRuntimeJobCount: commandResult.eligibleRuntimeJobIds.length,
      claimed: commandResult.runOnceResult?.claimed ?? false,
      completed: commandResult.runOnceResult?.completed ?? false,
      failed: commandResult.runOnceResult?.failed ?? false,
      daemonStarted: false,
      schedulerStarted: false,
      workQueueLifecycleMutated: false,
    },
    daemonStarted: false,
    schedulerStarted: false,
    workQueueLifecycleMutated: false,
  };
}
