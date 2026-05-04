import {
  CodexBridgeControlBridgeRepository,
  type CodexBridgeRedirectPromptMetadata,
} from "../codex-bridge/control-bridge.ts";
import type { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  WorkQueueExecutionControlApi,
  type WorkQueueExecutionControlApiResult,
} from "./execution-control-api.ts";

export type WorkQueueExecutionControlEndpointAuth = {
  actorId: string;
  authenticated: boolean;
  role: "operator" | "admin" | "service";
};

export type WorkQueueExecutionControlEndpointRequest = {
  auth: WorkQueueExecutionControlEndpointAuth;
  runtimeJobs: RuntimeJobRepository;
  workItemId?: string | null;
  runtimeJobId: string;
  sessionId: string;
  reason: string;
  redirectPrompt?: CodexBridgeRedirectPromptMetadata;
  cancelRuntimeJob?: boolean;
};

export type WorkQueueExecutionControlEndpointResult = {
  artifactKind: "work_queue_execution_control_endpoint_result";
  accepted: boolean;
  commandKind: "pause" | "redirect" | "cancel";
  result: WorkQueueExecutionControlApiResult | null;
  blockingReasons: string[];
  lifecycleMutationAllowed: false;
  workQueueLifecycleMutated: false;
};

function validateAuth(auth: WorkQueueExecutionControlEndpointAuth): string[] {
  const reasons: string[] = [];
  if (!auth.authenticated) {
    reasons.push("operator_authentication_required");
  }
  if (!auth.actorId.trim()) {
    reasons.push("operator_actor_id_required");
  }
  if (auth.role !== "operator" && auth.role !== "admin" && auth.role !== "service") {
    reasons.push("operator_or_service_role_required");
  }
  return reasons;
}

async function handleControl(
  commandKind: "pause" | "redirect" | "cancel",
  request: WorkQueueExecutionControlEndpointRequest,
): Promise<WorkQueueExecutionControlEndpointResult> {
  const authReasons = validateAuth(request.auth);
  if (authReasons.length > 0) {
    return {
      artifactKind: "work_queue_execution_control_endpoint_result",
      accepted: false,
      commandKind,
      result: null,
      blockingReasons: authReasons,
      lifecycleMutationAllowed: false,
      workQueueLifecycleMutated: false,
    };
  }
  const api = new WorkQueueExecutionControlApi();
  const controlBridge = new CodexBridgeControlBridgeRepository(request.runtimeJobs);
  const base = {
    controlBridge,
    workItemId: request.workItemId,
    runtimeJobId: request.runtimeJobId,
    sessionId: request.sessionId,
    actor: request.auth.actorId,
    reason: request.reason,
  };
  const result =
    commandKind === "pause"
      ? await api.pause(base)
      : commandKind === "redirect"
        ? await api.redirect({
            ...base,
            redirectPrompt: request.redirectPrompt ?? {
              objective: request.reason,
              scope: ["."],
              nonGoals: ["Do not mutate Work Queue lifecycle."],
              repoPath: "/root/services/openclaw-roles/live",
              workspaceDocsPath: "/root/.openclaw/workspace/docs/projects/execution-platform",
            },
          })
        : await api.cancel({ ...base, cancelRuntimeJob: request.cancelRuntimeJob });
  return {
    artifactKind: "work_queue_execution_control_endpoint_result",
    accepted: true,
    commandKind,
    result,
    blockingReasons: [],
    lifecycleMutationAllowed: false,
    workQueueLifecycleMutated: false,
  };
}

export async function handleWorkQueuePauseExecutionEndpoint(
  request: WorkQueueExecutionControlEndpointRequest,
): Promise<WorkQueueExecutionControlEndpointResult> {
  return handleControl("pause", request);
}

export async function handleWorkQueueRedirectExecutionEndpoint(
  request: WorkQueueExecutionControlEndpointRequest,
): Promise<WorkQueueExecutionControlEndpointResult> {
  return handleControl("redirect", request);
}

export async function handleWorkQueueCancelExecutionEndpoint(
  request: WorkQueueExecutionControlEndpointRequest,
): Promise<WorkQueueExecutionControlEndpointResult> {
  return handleControl("cancel", request);
}
