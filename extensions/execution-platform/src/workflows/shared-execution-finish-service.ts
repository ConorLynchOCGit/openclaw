import type {
  JsonValue,
  RuntimeJobArtifact,
  RuntimeJobEvent,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import {
  buildRuntimeExecutionEventData,
  type NativeExecutionChildRelation,
  type RuntimeExecutionEventEnvelope,
} from "./native-agentic-orchestration.ts";

export type SharedExecutionFinishStatus = "completed" | "blocked" | "needs_review";

export type SharedExecutionFinishInput = {
  runtimeJobs: RuntimeJobRepository;
  runtimeJobId: string;
  sessionId: string;
  status: SharedExecutionFinishStatus;
  summary: string;
  blockerKind?: string | null;
  reason?: string | null;
  requiredEvidenceKinds?: Array<"mutation" | "validation" | "artifact" | "critic">;
};

export type SharedExecutionFinishWithEvidenceInput = SharedExecutionFinishInput & {
  evidence: SharedExecutionEvidence;
};

export type SharedExecutionEvidence = {
  evidenceRefs: string[];
  mutationRefs: string[];
  changedFileRefs: string[];
  validationRefs: string[];
  artifactRefs: string[];
  criticRefs: string[];
  childSessionRefs: string[];
  openBlockingChildSessionIds: string[];
  failedBlockingChildSessionIds: string[];
  reasonCodes: string[];
};

export type SharedExecutionFinishResult = {
  accepted: boolean;
  status: "accepted" | "rejected";
  finishStatus: SharedExecutionFinishStatus;
  runtimeJobId: string;
  sessionId: string;
  evidence: SharedExecutionEvidence;
  event: RuntimeJobEvent;
  correction: string | null;
  reasonCodes: string[];
};

type ChildSessionState = {
  relation: NativeExecutionChildRelation | null;
  terminal: boolean;
  failed: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function dataRecord(event: RuntimeJobEvent): Record<string, unknown> {
  return isRecord(event.data) ? event.data : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function eventRef(event: RuntimeJobEvent): string {
  return `runtime-job://${event.jobId}/event/${event.eventId}`;
}

function artifactRef(artifact: RuntimeJobArtifact): string {
  return `runtime-job://${artifact.jobId}/artifact/${artifact.artifactId}`;
}

function repoFileRef(path: string): string {
  return `repo-file://${path.trim()}`;
}

function eventKind(event: RuntimeJobEvent): string {
  return stringValue(dataRecord(event).eventKind) ?? event.eventType;
}

function toolName(event: RuntimeJobEvent): string | null {
  return stringValue(dataRecord(event).toolName);
}

function changedFiles(event: RuntimeJobEvent): string[] {
  const data = dataRecord(event);
  return uniqueStrings([
    ...stringArray(data.changedFiles),
    ...stringArray(data.changedFilePaths),
    ...stringArray(data.addedFilePaths),
    ...stringArray(data.modifiedFilePaths),
    ...stringArray(data.deletedFilePaths),
  ]);
}

function isMutationEvent(event: RuntimeJobEvent): boolean {
  const kind = eventKind(event);
  const tool = toolName(event);
  return (
    kind.includes("mutation") ||
    event.eventType.includes("mutation") ||
    tool === "edit" ||
    tool === "write" ||
    tool === "apply_patch" ||
    changedFiles(event).length > 0
  );
}

function isValidationEvent(event: RuntimeJobEvent): boolean {
  const kind = eventKind(event);
  const requestedAgentId = stringValue(dataRecord(event).requestedAgentId);
  return (
    kind.includes("validation") ||
    event.eventType.includes("validation") ||
    requestedAgentId === "execution-validation-scout"
  );
}

function isCriticEvent(event: RuntimeJobEvent): boolean {
  const requestedAgentId = stringValue(dataRecord(event).requestedAgentId);
  const kind = eventKind(event);
  return (
    kind.includes("critic") ||
    event.eventType.includes("critic") ||
    requestedAgentId === "execution-critic"
  );
}

function collectChildSessions(events: readonly RuntimeJobEvent[]): Map<string, ChildSessionState> {
  const children = new Map<string, ChildSessionState>();
  for (const event of events) {
    const data = dataRecord(event);
    const childSessionId = stringValue(data.childSessionId);
    if (!childSessionId) {
      continue;
    }
    const relationRaw = stringValue(data.childRelation);
    const relation: NativeExecutionChildRelation | null =
      relationRaw === "blocking" || relationRaw === "background" ? relationRaw : null;
    const kind = eventKind(event);
    const existing = children.get(childSessionId) ?? {
      relation,
      terminal: false,
      failed: false,
    };
    existing.relation = existing.relation ?? relation;
    if (
      kind === "child_session_completed" ||
      kind === "child_session_failed" ||
      kind === "child_session_canceled" ||
      event.eventType === "execution.child.completed" ||
      event.eventType === "execution.child.failed" ||
      event.eventType === "execution.child.canceled"
    ) {
      existing.terminal = true;
    }
    if (kind === "child_session_failed" || event.eventType === "execution.child.failed") {
      existing.failed = true;
    }
    children.set(childSessionId, existing);
  }
  return children;
}

export function collectSharedExecutionFinishEvidence(input: {
  runtimeJobId: string;
  events: readonly RuntimeJobEvent[];
  artifacts: readonly RuntimeJobArtifact[];
}): SharedExecutionEvidence {
  const mutationRefs: string[] = [];
  const changedFileRefs: string[] = [];
  const validationRefs: string[] = [];
  const artifactRefs = input.artifacts.map(artifactRef);
  const criticRefs: string[] = [];
  const childSessionRefs: string[] = [];
  const reasonCodes: string[] = [];

  for (const event of input.events) {
    if (isMutationEvent(event)) {
      mutationRefs.push(eventRef(event));
      changedFileRefs.push(...changedFiles(event).map(repoFileRef));
    }
    if (isValidationEvent(event)) {
      validationRefs.push(eventRef(event));
    }
    if (isCriticEvent(event)) {
      criticRefs.push(eventRef(event));
    }
    const childSessionId = stringValue(dataRecord(event).childSessionId);
    if (childSessionId) {
      childSessionRefs.push(`native-session://${childSessionId}`);
    }
  }

  const children = collectChildSessions(input.events);
  const openBlockingChildSessionIds: string[] = [];
  const failedBlockingChildSessionIds: string[] = [];
  for (const [childSessionId, state] of children.entries()) {
    if (state.relation !== "blocking") {
      continue;
    }
    if (!state.terminal) {
      openBlockingChildSessionIds.push(childSessionId);
    }
    if (state.failed) {
      failedBlockingChildSessionIds.push(childSessionId);
    }
  }

  if (mutationRefs.length > 0 || changedFileRefs.length > 0) {
    reasonCodes.push("shared_finish_mutation_evidence_attached");
  }
  if (validationRefs.length > 0) {
    reasonCodes.push("shared_finish_validation_evidence_attached");
  }
  if (artifactRefs.length > 0) {
    reasonCodes.push("shared_finish_artifact_evidence_attached");
  }
  if (criticRefs.length > 0) {
    reasonCodes.push("shared_finish_critic_evidence_attached");
  }
  if (openBlockingChildSessionIds.length > 0) {
    reasonCodes.push("shared_finish_open_blocking_children");
  }
  if (failedBlockingChildSessionIds.length > 0) {
    reasonCodes.push("shared_finish_failed_blocking_children");
  }

  const evidenceRefs = uniqueStrings([
    ...mutationRefs,
    ...changedFileRefs,
    ...validationRefs,
    ...artifactRefs,
    ...criticRefs,
    ...childSessionRefs,
  ]);
  return {
    evidenceRefs,
    mutationRefs: uniqueStrings(mutationRefs),
    changedFileRefs: uniqueStrings(changedFileRefs),
    validationRefs: uniqueStrings(validationRefs),
    artifactRefs: uniqueStrings(artifactRefs),
    criticRefs: uniqueStrings(criticRefs),
    childSessionRefs: uniqueStrings(childSessionRefs),
    openBlockingChildSessionIds: uniqueStrings(openBlockingChildSessionIds),
    failedBlockingChildSessionIds: uniqueStrings(failedBlockingChildSessionIds),
    reasonCodes: uniqueStrings(reasonCodes),
  };
}

function missingRequiredEvidence(
  evidence: SharedExecutionEvidence,
  required: readonly ("mutation" | "validation" | "artifact" | "critic")[],
): string[] {
  const missing: string[] = [];
  if (required.includes("mutation") && evidence.mutationRefs.length === 0) {
    missing.push("mutation");
  }
  if (required.includes("validation") && evidence.validationRefs.length === 0) {
    missing.push("validation");
  }
  if (required.includes("artifact") && evidence.artifactRefs.length === 0) {
    missing.push("artifact");
  }
  if (required.includes("critic") && evidence.criticRefs.length === 0) {
    missing.push("critic");
  }
  return missing;
}

function buildCorrection(input: {
  missingKinds: readonly string[];
  openChildren: readonly string[];
  failedChildren: readonly string[];
}): string | null {
  const lines: string[] = [];
  if (input.missingKinds.length > 0) {
    lines.push(
      `Finish rejected: missing required runtime evidence (${input.missingKinds.join(", ")}).`,
      "Record the missing mutation/validation/critic/artifact evidence through native tools, or finish blocked with a specific blocker.",
    );
  }
  if (input.openChildren.length > 0) {
    lines.push(
      `Finish rejected: blocking child sessions are still open (${input.openChildren.join(", ")}).`,
      "Wait for, cancel, or explicitly finish blocked on the child-session blocker.",
    );
  }
  if (input.failedChildren.length > 0) {
    lines.push(
      `Finish rejected: blocking child sessions failed (${input.failedChildren.join(", ")}).`,
      "Repair the child result or finish blocked with a specific blocker.",
    );
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

function buildFinishEventData(input: {
  runtimeJobId: string;
  sessionId: string;
  timestamp: string;
  accepted: boolean;
  finishStatus: SharedExecutionFinishStatus;
  summary: string;
  blockerKind: string | null;
  reason: string | null;
  evidence: SharedExecutionEvidence;
  correction: string | null;
  reasonCodes: string[];
}): RuntimeExecutionEventEnvelope & Record<string, JsonValue> {
  return buildRuntimeExecutionEventData({
    runtimeJobId: input.runtimeJobId,
    sessionId: input.sessionId,
    eventKind: "finish_recorded",
    parentSessionId: null,
    childSessionId: null,
    childRelation: null,
    timestamp: input.timestamp,
    extra: {
      accepted: input.accepted,
      finishStatus: input.finishStatus,
      summary: input.summary,
      blockerKind: input.blockerKind,
      reason: input.reason,
      evidenceRefs: input.evidence.evidenceRefs,
      mutationRefs: input.evidence.mutationRefs,
      validationRefs: input.evidence.validationRefs,
      artifactRefs: input.evidence.artifactRefs,
      criticRefs: input.evidence.criticRefs,
      openBlockingChildSessionIds: input.evidence.openBlockingChildSessionIds,
      failedBlockingChildSessionIds: input.evidence.failedBlockingChildSessionIds,
      correction: input.correction,
      reasonCodes: input.reasonCodes,
    },
  });
}

export async function finishSharedExecution(
  input: SharedExecutionFinishInput,
): Promise<SharedExecutionFinishResult> {
  const events = await input.runtimeJobs.listEvents(input.runtimeJobId, 1_000);
  const artifacts = await input.runtimeJobs.listArtifacts(input.runtimeJobId, { limit: 1_000 });
  const evidence = collectSharedExecutionFinishEvidence({
    runtimeJobId: input.runtimeJobId,
    events,
    artifacts,
  });
  return finishSharedExecutionWithEvidence({
    ...input,
    evidence,
  });
}

export async function finishSharedExecutionWithEvidence(
  input: SharedExecutionFinishWithEvidenceInput,
): Promise<SharedExecutionFinishResult> {
  const evidence = input.evidence;
  const requiredEvidenceKinds = input.requiredEvidenceKinds ?? [];
  const missingKinds =
    input.status === "completed" ? missingRequiredEvidence(evidence, requiredEvidenceKinds) : [];
  const shouldReject =
    input.status === "completed" &&
    (missingKinds.length > 0 ||
      evidence.openBlockingChildSessionIds.length > 0 ||
      evidence.failedBlockingChildSessionIds.length > 0);
  const correction = shouldReject
    ? buildCorrection({
        missingKinds,
        openChildren: evidence.openBlockingChildSessionIds,
        failedChildren: evidence.failedBlockingChildSessionIds,
      })
    : null;
  const reasonCodes = uniqueStrings([
    ...evidence.reasonCodes,
    shouldReject ? "shared_finish_rejected" : "shared_finish_accepted",
    ...missingKinds.map((kind) => `shared_finish_missing_${kind}_evidence`),
  ]);
  const event = await input.runtimeJobs.recordEvent({
    jobId: input.runtimeJobId,
    eventType: shouldReject ? "execution.finish.rejected" : "execution.finish.accepted",
    data: buildFinishEventData({
      runtimeJobId: input.runtimeJobId,
      sessionId: input.sessionId,
      timestamp: new Date().toISOString(),
      accepted: !shouldReject,
      finishStatus: input.status,
      summary: input.summary,
      blockerKind: input.blockerKind?.trim() || null,
      reason: input.reason?.trim() || null,
      evidence,
      correction,
      reasonCodes,
    }),
  });
  return {
    accepted: !shouldReject,
    status: shouldReject ? "rejected" : "accepted",
    finishStatus: input.status,
    runtimeJobId: input.runtimeJobId,
    sessionId: input.sessionId,
    evidence,
    event,
    correction,
    reasonCodes,
  };
}
