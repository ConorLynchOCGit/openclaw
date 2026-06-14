import { createHash } from "node:crypto";
import type { AgentRunRequest } from "../../../../src/agents/agent-run-request.js";
import type { OpenClawAcceptedAgentRun } from "../../../../src/agents/openclaw-agent-runtime-contracts.js";
import { commitAcceptedNativeExecutionJob } from "../../../../src/gateway/native-execution-start-service.js";
import {
  buildNativeExecutionTaskMessage,
  normalizeStartExecutionSessionVisibleInput,
  type StartNativeExecutionSessionInput,
  type StartNativeExecutionSessionResult,
} from "./native-agentic-orchestration.ts";

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sessionSlugFromHash(hash: string): string {
  return `native_exec_${hash.slice(0, 32)}`;
}

export async function startAcceptedNativeExecutionSessionForTest(
  input: StartNativeExecutionSessionInput,
): Promise<StartNativeExecutionSessionResult> {
  const request = normalizeStartExecutionSessionVisibleInput(input.request);
  const runtimeGenerationId = "runtime-generation:test";
  const agentId = input.runtime?.agentProfile?.trim() || "execution-orchestrator";
  const parentSessionId = input.runtime?.parentSessionId?.trim() || null;
  const childRelation =
    input.runtime?.childRelation === "blocking" || input.runtime?.childRelation === "background"
      ? input.runtime.childRelation
      : null;
  const requestHash = stableHash({
    runtimeGenerationId,
    objective: request.objective,
    refs: request.refs,
    constraints: request.constraints,
    validationSignal: request.validationSignal,
    parentRuntimeJobId: input.runtime?.parentRuntimeJobId ?? null,
    parentSessionId,
    childRelation,
    agentId,
  });
  const sessionId = input.runtime?.sessionId?.trim() || sessionSlugFromHash(requestHash);
  const taskMessage = buildNativeExecutionTaskMessage({
    sessionId,
    agentProfile: agentId,
    request,
  });
  const runRequest: AgentRunRequest = {
    agentId,
    input: { prompt: taskMessage.text, trigger: "manual" },
    promptProfile: agentId,
    toolPolicy: null,
    modelProfile: null,
    workspace: {
      canonicalSourceRoot: "/repo",
      runtimeWorkspaceDir: "/runtime/workspace",
      transcriptRoot: "/runtime/transcripts",
      artifactRoot: "/runtime/artifacts",
    },
    transcript: {
      sessionId,
      sessionKey: sessionId,
      sessionFile: `/runtime/transcripts/${sessionId}.jsonl`,
    },
    metadata: {
      artifactKind: "openclaw.accepted_agent_run",
      runtimeGenerationId,
      envelope: parentSessionId ? "child_agent" : "runtime_job",
      policyRef: null,
      configSnapshotId: "config:test",
      catalogSnapshotId: "catalog:test",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
  };
  const accepted: OpenClawAcceptedAgentRun = {
    artifactKind: "openclaw.accepted_agent_run",
    schemaVersion: "openclaw.accepted-agent-run.v1",
    runtimeGenerationId,
    agentId,
    envelope: parentSessionId ? "child_agent" : "runtime_job",
    policyRef: null,
    sessionId,
    parentSessionId,
    childRelation,
    request,
    taskMessage,
    runRequest,
    idempotencyScope: input.runtime?.idempotencyScope ?? "openclaw.accepted_agent_run.test",
    idempotencyKey: `${
      input.runtime?.idempotencyKey ?? `native-execution:${requestHash}`
    }:runtime-generation:${runtimeGenerationId}`,
    metadata: {
      configSnapshotId: "config:test",
      catalogSnapshotId: "catalog:test",
      promptProfileHash: "prompt:test",
      toolPolicyHash: "tools:test",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    secretsStored: false,
  };
  const result = await commitAcceptedNativeExecutionJob({
    runtimeJobs: input.runtimeJobs,
    accepted,
    runtime: input.runtime,
    now: input.now,
  });
  await input.ensureSession?.({
    runtimeJobId: result.runtimeJobId,
    sessionId,
    agentProfile: agentId,
    taskMessage,
    refs: request.refs,
    parentSessionId,
    childRelation,
  });
  return result;
}
