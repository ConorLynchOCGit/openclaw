import type { RequiredProviderContextAdmission } from "../system-prompt-report.js";
import {
  buildChildBootstrapAdmission,
  buildParentVisibleChildResult,
  classifyChildBootstrapAdmissionFailure,
  resolveRequiredChildBootstrapAdmissionSources,
  type RequiredChildBootstrapAdmissionSources,
} from "../tools/native-task-tool.js";
import type {
  NativeTaskChildStartFailureKind,
  NativeTaskForegroundResult,
  NativeTaskRunChildTask,
} from "./native-task-types.js";
import {
  createNativeRunChildSession,
  type NativeChildSessionFailureKind,
  type NativeChildSessionParentContext,
  type NativeChildSessionRunAgent,
} from "./run-child.js";

function buildRequiredChildProviderContextAdmission(params: {
  sources: RequiredChildBootstrapAdmissionSources;
}): RequiredProviderContextAdmission {
  return {
    workspaceFileNames: params.sources.requiredCanonicalDocPaths,
    skillNames: params.sources.requiredSkillNames,
    skillSources: params.sources.requiredSkillSources,
    rejectTruncatedWorkspaceFiles: true,
  };
}

function mapChildSessionFailureKind(
  kind: NativeChildSessionFailureKind | undefined,
): NativeTaskChildStartFailureKind | undefined {
  if (kind === "provider_model_failure") {
    return "child_provider_model_failure";
  }
  if (kind === "session_lock_failed") {
    return "child_session_lock_failed";
  }
  if (kind === "run_error") {
    return "child_run_error";
  }
  return undefined;
}

function buildLaunchBlockedResult(params: {
  childAgentId: string;
  parentToolCallId: string;
  error: string;
}): NativeTaskForegroundResult {
  const now = Date.now();
  const token = (params.parentToolCallId || "unknown")
    .replace(/[^a-zA-Z0-9_.:-]/gu, "-")
    .slice(0, 80);
  return {
    status: "error",
    foreground: true,
    childSessionKey: `agent:${params.childAgentId}:subagent:launch-blocked-${token}`,
    runId: `launch_blocked_${token}`,
    waitStatus: "error",
    startedAt: now,
    endedAt: now,
    error: params.error,
    resultDeliveredToParentContext: false,
    childStartFailureKind: "child_launch_blocked",
  };
}

export function createNativeRunChildTask(params: {
  parentContext: NativeChildSessionParentContext;
  resolvedWorkspace: string;
  runAgent: NativeChildSessionRunAgent;
}): NativeTaskRunChildTask {
  const runChildSession = createNativeRunChildSession({
    parentContext: params.parentContext,
    resolvedWorkspace: params.resolvedWorkspace,
    runAgent: params.runAgent,
  });
  return async (taskParams) => {
    const requiredBootstrapSources = await resolveRequiredChildBootstrapAdmissionSources(
      taskParams.childAgentId,
    );
    if (requiredBootstrapSources.registryContractIssues.length > 0) {
      return buildLaunchBlockedResult({
        childAgentId: taskParams.childAgentId,
        parentToolCallId: taskParams.parentToolCallId,
        error: `task child agent registry contract incomplete: ${requiredBootstrapSources.registryContractIssues.join(", ")}`,
      });
    }
    const childSession = await runChildSession({
      parentSessionKey: taskParams.parentSessionKey,
      parentToolCallId: taskParams.parentToolCallId,
      childAgentId: taskParams.childAgentId,
      task: taskParams.task,
      ...(taskParams.label ? { label: taskParams.label } : {}),
      ...(typeof taskParams.runTimeoutSeconds === "number"
        ? { runTimeoutSeconds: taskParams.runTimeoutSeconds }
        : {}),
      requiredProviderContextAdmission: buildRequiredChildProviderContextAdmission({
        sources: requiredBootstrapSources,
      }),
    });
    const boundedResult = buildParentVisibleChildResult(
      childSession.resultText,
      taskParams.parentVisibleResultMaxChars,
    );
    const childBootstrapAdmission = buildChildBootstrapAdmission({
      childSessionKey: childSession.childSessionKey,
      childAgentId: taskParams.childAgentId,
      report: childSession.providerContextReport ?? null,
      requiredCanonicalDocNames: requiredBootstrapSources.requiredCanonicalDocNames,
      requiredCanonicalDocPaths: requiredBootstrapSources.requiredCanonicalDocPaths,
      requiredSkillNames: requiredBootstrapSources.requiredSkillNames,
      requiredSkillSources: requiredBootstrapSources.requiredSkillSources,
      requiredToolNames: requiredBootstrapSources.requiredToolNames,
      forbiddenToolNames: requiredBootstrapSources.forbiddenToolNames,
    });
    const bootstrapFailureKind = classifyChildBootstrapAdmissionFailure(childBootstrapAdmission);
    const resultFailureKind =
      boundedResult.resultOversized === true
        ? "child_result_oversized"
        : !boundedResult.resultText?.trim()
          ? "child_run_error"
          : undefined;
    const runFailureKind = mapChildSessionFailureKind(childSession.failureKind);
    const childStartFailureKind = bootstrapFailureKind ?? resultFailureKind ?? runFailureKind;
    const status = childStartFailureKind ? "error" : "completed";
    return {
      status,
      foreground: true,
      childSessionKey: childSession.childSessionKey,
      runId: childSession.runId,
      waitStatus: status === "completed" ? "ok" : "error",
      startedAt: childSession.startedAt,
      endedAt: childSession.endedAt,
      ...(childSession.error ? { error: childSession.error } : {}),
      ...boundedResult,
      resultDeliveredToParentContext:
        status === "completed" &&
        boundedResult.resultOversized !== true &&
        Boolean(boundedResult.resultText?.trim()),
      childBootstrapAdmission,
      ...(childStartFailureKind ? { childStartFailureKind } : {}),
    };
  };
}
