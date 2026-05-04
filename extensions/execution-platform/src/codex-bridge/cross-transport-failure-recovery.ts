import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import type { ExecutorTransportPolicyDecision } from "./executor-transport-policy.ts";

export type CrossTransportFailureKind =
  | "endpoint_unavailable"
  | "heartbeat_stale"
  | "process_failed"
  | "invalid_stream_envelope"
  | "closeout_missing";

export type CrossTransportRecoveryDecision = {
  artifactKind: "cross_transport_recovery_decision";
  runtimeJobId: string;
  failedTransport: string;
  failureKind: CrossTransportFailureKind;
  action: "retry_same_transport" | "redirect_next_turn" | "fallback_transport" | "needs_review";
  nextTransport: string | null;
  attempt: number;
  maxAttempts: number;
  reasonCodes: string[];
  runtimeTruthPreserved: true;
  closeoutRequired: true;
  falseSuccessClaimed: false;
  workQueueLifecycleMutated: false;
};

export function decideCrossTransportRecovery(input: {
  runtimeJobId: string;
  failedTransport: string;
  failureKind: CrossTransportFailureKind;
  attempt: number;
  maxAttempts: number;
  fallbackPolicy?: ExecutorTransportPolicyDecision | null;
  redirectRequested?: boolean;
}): CrossTransportRecoveryDecision {
  const reasonCodes: string[] = [input.failureKind];
  let action: CrossTransportRecoveryDecision["action"] = "needs_review";
  let nextTransport: string | null = null;

  if (input.attempt < input.maxAttempts && input.failureKind !== "closeout_missing") {
    action = "retry_same_transport";
    nextTransport = input.failedTransport;
    reasonCodes.push("bounded_retry_available");
  } else if (input.redirectRequested) {
    action = "redirect_next_turn";
    reasonCodes.push("operator_redirect_requested");
  } else if (input.fallbackPolicy?.allowed) {
    action = "fallback_transport";
    nextTransport = input.fallbackPolicy.transportKind;
    reasonCodes.push("policy_allows_fallback");
  } else {
    reasonCodes.push("human_review_required");
  }

  return {
    artifactKind: "cross_transport_recovery_decision",
    runtimeJobId: input.runtimeJobId,
    failedTransport: input.failedTransport,
    failureKind: input.failureKind,
    action,
    nextTransport,
    attempt: input.attempt,
    maxAttempts: input.maxAttempts,
    reasonCodes: [...new Set(reasonCodes)].toSorted(),
    runtimeTruthPreserved: true,
    closeoutRequired: true,
    falseSuccessClaimed: false,
    workQueueLifecycleMutated: false,
  };
}

export async function recordCrossTransportRecovery(input: {
  runtimeJobs: RuntimeJobRepository;
  decision: CrossTransportRecoveryDecision;
}): Promise<void> {
  await input.runtimeJobs.attachArtifact({
    jobId: input.decision.runtimeJobId,
    artifactType: "executor_transport.cross_transport_recovery",
    storageKind: "metadata",
    uri: `runtime-job://${input.decision.runtimeJobId}/cross-transport-recovery/${input.decision.failureKind}`,
    contentType: "application/json",
    metadata: input.decision as unknown as JsonValue,
  });
  await input.runtimeJobs.recordEvent({
    jobId: input.decision.runtimeJobId,
    eventType: "executor_transport.cross_transport_recovery_recorded",
    data: input.decision as unknown as JsonValue,
  });
}
