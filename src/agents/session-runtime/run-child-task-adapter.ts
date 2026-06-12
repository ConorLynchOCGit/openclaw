import { resolveStateDir } from "../../config/paths.js";
import { persistManagedToolOutputSync } from "../../config/sessions/managed-output.js";
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
  if (kind === "provider_response_timeout") {
    return "child_provider_response_timeout";
  }
  if (kind === "no_progress_timeout") {
    return "child_no_progress_timeout";
  }
  if (kind === "repeated_low_value_progress") {
    return "child_repeated_low_value_progress";
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
      ...(requiredBootstrapSources.requiredSkillsSnapshot
        ? { requiredSkillsSnapshot: requiredBootstrapSources.requiredSkillsSnapshot }
        : {}),
    });
    const boundedResult = buildParentVisibleChildResult(
      childSession.resultText,
      taskParams.parentVisibleResultMaxChars,
    );
    const childTimedOutAfterVisibleProgress =
      (childSession.failureKind === "provider_response_timeout" ||
        childSession.failureKind === "repeated_low_value_progress") &&
      Boolean(boundedResult.resultText?.trim()) &&
      boundedResult.resultDeliveryStatus !== "rejected";
    const progressResult =
      childTimedOutAfterVisibleProgress && boundedResult.resultText?.trim()
        ? buildParentVisibleChildResult(
            [
              "Partial child result delivered after child progress timeout. The child produced bounded parent-visible output before the run stopped; use it only if it is enough for the next safe parent decision, otherwise ask a narrower follow-up.",
              "",
              boundedResult.resultText.trim(),
            ].join("\n"),
            taskParams.parentVisibleResultMaxChars,
          )
        : boundedResult;
    const managedOutput =
      progressResult.resultDeliveryStatus === "projected" && childSession.resultText?.trim()
        ? persistManagedToolOutputSync({
            stateRoot: resolveStateDir(process.env),
            sessionKey: childSession.childSessionKey,
            toolCallId: taskParams.parentToolCallId,
            toolName: "task",
            text: childSession.resultText,
            outputKind: "child_task_result",
            reason: "child_result_projected",
          })
        : null;
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
      progressResult.resultDeliveryStatus === "rejected"
        ? "child_result_unshaped"
        : !progressResult.resultText?.trim()
          ? "child_run_error"
          : undefined;
    const runFailureKind = childTimedOutAfterVisibleProgress
      ? undefined
      : mapChildSessionFailureKind(childSession.failureKind);
    const childStartFailureKind = runFailureKind ?? bootstrapFailureKind ?? resultFailureKind;
    const status = childStartFailureKind ? "error" : "completed";
    return {
      status,
      foreground: true,
      childSessionKey: childSession.childSessionKey,
      runId: childSession.runId,
      ...(childSession.provider ? { childProvider: childSession.provider } : {}),
      ...(childSession.model ? { childModel: childSession.model } : {}),
      waitStatus: status === "completed" ? "ok" : "error",
      startedAt: childSession.startedAt,
      endedAt: childSession.endedAt,
      ...(childSession.error && !childTimedOutAfterVisibleProgress
        ? { error: childSession.error }
        : {}),
      ...progressResult,
      ...(childTimedOutAfterVisibleProgress
        ? { childProgressOutcome: "child_partial_context_returned" as const }
        : {}),
      ...(managedOutput
        ? {
            managedOutputRef: managedOutput.ref,
            managedOutputBytes: managedOutput.byteCount,
            managedOutputHash: managedOutput.textHash,
          }
        : {}),
      resultDeliveredToParentContext:
        status === "completed" && Boolean(progressResult.resultText?.trim()),
      childBootstrapAdmission,
      ...(childStartFailureKind ? { childStartFailureKind } : {}),
    };
  };
}
