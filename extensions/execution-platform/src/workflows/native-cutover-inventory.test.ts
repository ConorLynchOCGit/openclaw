import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

describe("native execution cutover inventory", () => {
  it("keeps normal gateway execution off run-once compatibility surfaces", () => {
    const gatewayHttp = readRepoFile("src/gateway/execution-platform-http.ts");
    const chat = readRepoFile("src/gateway/server-methods/chat.ts");
    const workflowIndex = readRepoFile("extensions/execution-platform/src/workflows/index.ts");
    const codexBridgeIndex = readRepoFile(
      "extensions/execution-platform/src/codex-bridge/index.ts",
    );

    for (const source of [gatewayHttp, chat]) {
      expect(source).not.toContain("/api/execution-platform/queue-runner/run-once");
      expect(source).not.toContain("runGatewayAgentTeamRuntimeJobOnce");
      expect(source).not.toContain("runGatewayNativeExecutionSessionRuntimeJobOnce");
      expect(source).not.toContain("runGatewayNativeExecutionSessionRuntimeJob(");
      expect(source).not.toContain("ProductionWorkflowExecutionFactory");
      expect(source).not.toContain("agentTeamRuntimeRunOnce");
      expect(source).not.toContain("nativeExecutionSessionRuntimeRunOnce");
    }
    expect(gatewayHttp).not.toContain("class ResidentNativeExecutionWorkerSupervisor");
    expect(gatewayHttp).not.toContain("runGatewayNativeExecutionSessionRuntimeJob");
    expect(codexBridgeIndex).not.toContain("queued-bridge-runner");
    expect(codexBridgeIndex).not.toContain("production-supervisor");
    expect(codexBridgeIndex).not.toContain("always-on-supervisor-boundary");
    expect(workflowIndex).not.toContain("./node-agent-session.ts");
    expect(
      fs.existsSync(
        path.join(REPO_ROOT, "extensions/execution-platform/src/workflows/node-agent-session.ts"),
      ),
    ).toBe(false);
    for (const relativePath of [
      "extensions/execution-platform/src/codex-bridge/queued-bridge-runner.ts",
      "extensions/execution-platform/src/codex-bridge/queued-bridge-runner-command.ts",
      "extensions/execution-platform/src/codex-bridge/queued-bridge-runner-endpoint.ts",
      "extensions/execution-platform/src/codex-bridge/production-supervisor.ts",
      "extensions/execution-platform/src/codex-bridge/production-supervisor-design.ts",
      "extensions/execution-platform/src/codex-bridge/always-on-supervisor-boundary.ts",
      "extensions/execution-platform/src/codex-bridge/coding-team-runtime-job-runner.ts",
      "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts",
      "extensions/execution-platform/src/codex-bridge/coding-team-runtime-adapter.ts",
      "extensions/execution-platform/src/codex-bridge/coding-team-runtime-adapter.test.ts",
      "scripts/execution-platform-run-queued-bridge-once.mjs",
      "scripts/execution-platform-run-autonomy-90-production-pass.mjs",
      "scripts/execution-platform-run-production-autonomy-hardening-pass.mjs",
    ]) {
      expect(fs.existsSync(path.join(REPO_ROOT, relativePath))).toBe(false);
    }
    expect(
      fs.existsSync(
        path.join(
          REPO_ROOT,
          "extensions/execution-platform/src/workflows/node-agent-session.test.ts",
        ),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(
          REPO_ROOT,
          "extensions/execution-platform/src/workflows/node-execution-snapshot.ts",
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(REPO_ROOT, "extensions/execution-platform/src/workflows/node-finish-tool.ts"),
      ),
    ).toBe(true);
  });

  it("keeps resident native dispatch in the resident supervisor service", () => {
    const residentSupervisor = readRepoFile(
      "src/gateway/resident-native-execution-worker-supervisor.ts",
    );

    expect(residentSupervisor).toContain("class ResidentNativeExecutionWorkerSupervisor");
    expect(residentSupervisor).toContain("runNativeExecutionSessionRuntimeJob");
    expect(residentSupervisor).toContain("native-execution-session-runtime-job.js");
    expect(residentSupervisor).not.toContain("execution-platform-agent-team-runner.js");
    expect(residentSupervisor).toContain(
      "native_execution_child_session_scheduled_by_resident_supervisor",
    );
    expect(
      fs.existsSync(path.join(REPO_ROOT, "src/gateway/execution-platform-agent-team-runner.ts")),
    ).toBe(false);
  });

  it("inverts AgentRuntimeCore away from the legacy embedded runner entrypoint", () => {
    const core = readRepoFile("src/agents/agent-runtime-core.ts");
    const interactionRuntime = readRepoFile("src/agents/interaction-runtime.ts");
    const agentRuntime = readRepoFile("src/agents/openclaw-agent-runtime.ts");
    const runtimeProviderCapability = readRepoFile("src/agents/runtime-provider-capability.ts");
    const runtimeContracts = readRepoFile("src/agents/openclaw-agent-runtime-contracts.ts");
    const codexRunAttempt = readRepoFile("extensions/codex/src/app-server/run-attempt.ts");
    const nativeRpc = readRepoFile(
      "extensions/execution-platform/src/intent-routing/native-execution-rpc.ts",
    );
    const interactionAttemptImplementation = readRepoFile(
      "src/agents/interaction-attempt-runtime/attempt.ts",
    );
    const preparedContext = readRepoFile("src/agents/agent-runtime-prepared-context.ts");
    const embeddedRunParams = readRepoFile("src/agents/pi-embedded-runner/run/params.ts");
    const attemptSessionRuntime = readRepoFile("src/agents/session-runtime/attempt-session.ts");
    const attemptToolRuntime = readRepoFile("src/agents/attempt-tool-runtime.ts");
    const attemptPromptRuntime = readRepoFile("src/agents/attempt-prompt-runtime.ts");
    const contextManagerRuntime = readRepoFile("src/agents/context-manager-runtime.ts");
    const builtinPiHarness = readRepoFile("src/agents/harness/builtin-pi.ts");
    const legacyRunWrapper = readRepoFile("src/agents/pi-embedded-runner/run.ts");
    const nativeRunner = readRepoFile("src/gateway/native-execution-session-runtime-job.ts");
    const agentRunRequest = readRepoFile("src/agents/agent-run-request.ts");
    const authController = readRepoFile("src/agents/pi-embedded-runner/run/auth-controller.ts");
    const agentRuntimeInvocation = readRepoFile("src/agents/agent-runtime-invocation.ts");

    expect(core).not.toContain("pi-embedded-runner/run.js");
    expect(core).not.toContain("runEmbeddedPiAgentCore");
    expect(core).not.toContain("RunEmbeddedPiAgentParams");
    expect(agentRunRequest).not.toContain("RunEmbeddedPiAgentParams");
    expect(agentRunRequest).not.toContain("pi-embedded-runner/run/params");
    expect(agentRunRequest).toContain("export type AgentRunTrigger");
    expect(agentRuntimeInvocation).not.toContain("RunEmbeddedPiAgentParams");
    expect(agentRuntimeInvocation).not.toContain("pi-embedded-runner/run/params");
    expect(agentRuntimeInvocation).toContain("openclaw-agent-runtime-contracts.js");
    expect(agentRuntimeInvocation).not.toContain("runtime-provider-capability.js");
    expect(agentRuntimeInvocation).toContain("AgentRuntimeInvocationInputParams");
    expect(authController).not.toContain("RunEmbeddedPiAgentParams");
    expect(authController).not.toContain("./params.js");
    expect(core).toContain("AgentRuntimeInvocation");
    expect(core).toContain("AgentTurn");
    expect(core).not.toContain("embeddedParamsFromAgentRuntimeInvocation");
    const legacyInteractionRuntimePath = path.join(
      REPO_ROOT,
      "src/agents/pi-embedded-runner/interaction-runtime.ts",
    );
    expect(fs.existsSync(legacyInteractionRuntimePath)).toBe(false);
    expect(core).not.toContain(
      'import { runEmbeddedPiAgentInteractionRuntime } from "./pi-embedded-runner/interaction-runtime.js"',
    );
    expect(core).not.toContain(
      'import { runEmbeddedAttemptWithBackend } from "./pi-embedded-runner/run/backend.js"',
    );
    expect(core).not.toContain("pi-embedded-runner/run/backend.js");
    expect(core).not.toContain("provider-client-runtime.js");
    expect(core).not.toContain("runAgentProviderAttempt");
    expect(fs.existsSync(path.join(REPO_ROOT, "src/agents/provider-client-runtime.ts"))).toBe(
      false,
    );
    expect(core).toContain("interaction_attempt_runtime");
    expect(core).not.toContain("embedded_attempt_backend");
    expect(core).toContain("agent-runtime-prepared-context.js");
    expect(core).not.toContain('RunEmbeddedPiAgentParams["agentRuntimeCore"]');
    expect(core).not.toContain('"wrapped"');
    expect(core).not.toContain('"not_extracted"');
    expect(core).not.toContain('"embedded_runner"');
    expect(fs.existsSync(path.join(REPO_ROOT, "src/agents/runtime-agent-executor.ts"))).toBe(false);
    expect(nativeRunner).toContain("input.agentRuntime.runAcceptedNativeExecution");
    expect(nativeRunner).not.toContain("new RuntimeAgentExecutor");
    expect(nativeRunner).not.toContain("RunEmbeddedPiAgentParams");
    expect(nativeRunner).not.toContain("prepareNativeExecutionRun({");
    expect(nativeRunner).not.toContain("invocation: preparedRun.invocation");
    expect(nativeRunner).not.toContain("params: preparedRun.params");
    expect(nativeRunner).not.toContain("request: preparedRun.request");
    expect(nativeRunner).toContain("collectSharedExecutionFinishEvidence");
    expect(nativeRunner).toContain("reduceNativeExecutionTurn");
    expect(nativeRunner).toContain("execution.turn.reduced");
    expect(nativeRunner).toContain("turn_reduced");
    expect(nativeRunner).toContain("needs_review_no_required_closeout");
    expect(nativeRunner).toContain("wait_on_blocking_child");
    expect(nativeRunner).toContain("child_session_started");
    expect(preparedContext).toContain("export type AgentRuntimePreparedContext");
    expect(preparedContext).toContain('requestShape: "openclaw.agent-run-request.v1"');
    expect(preparedContext).toContain('adapter: "interaction_attempt_runtime"');
    expect(preparedContext).toContain("providerCapability:");
    expect(preparedContext).toContain("runTurn: (input:");
    expect(preparedContext).toContain("openclaw-agent-runtime-contracts.js");
    expect(preparedContext).not.toContain("runtime-provider-capability.js");
    expect(preparedContext).not.toContain("ProviderRuntimeLease");
    expect(preparedContext).not.toContain("providerLease");
    expect(runtimeContracts).toContain("export type RuntimeGeneration");
    expect(runtimeContracts).toContain("export type OpenClawAcceptedAgentRun");
    expect(runtimeContracts).toContain("export type AgentRuntimeProviderCapability");
    expect(runtimeContracts).not.toContain("openclaw-agent-runtime");
    expect(runtimeContracts).not.toContain("runtime-provider-capability");
    expect(runtimeContracts).not.toContain("agent-runtime-core");
    expect(runtimeContracts).not.toContain("interaction-runtime");
    expect(runtimeContracts).not.toContain("runCodexAppServerAttempt");
    expect(runtimeContracts).not.toContain("createAgentRuntimeProviderCapability");
    expect(embeddedRunParams).not.toContain("agentRuntimeCore?:");
    expect(embeddedRunParams).not.toContain("providerRuntimeLease");
    expect(embeddedRunParams).not.toContain('owner: "agent_runtime_core"');
    expect(agentRuntimeInvocation).not.toContain("providerRuntimeLease");
    expect(attemptSessionRuntime).toContain("acquireAttemptSessionLockRuntime");
    expect(attemptSessionRuntime).toContain("openAttemptSessionTranscriptRuntime");
    expect(attemptSessionRuntime).toContain("acquireSessionWriteLock");
    expect(attemptSessionRuntime).toContain("SessionManager.open");
    expect(attemptSessionRuntime).toContain("resolveTranscriptPolicy");
    expect(attemptSessionRuntime).toContain("prepareSessionManagerForRun");
    expect(interactionAttemptImplementation).toContain("acquireAttemptSessionLockRuntime");
    expect(interactionAttemptImplementation).toContain("openAttemptSessionTranscriptRuntime");
    expect(interactionAttemptImplementation).not.toContain("SessionManager.open");
    expect(interactionAttemptImplementation).not.toContain("acquireSessionWriteLock");
    expect(interactionAttemptImplementation).not.toContain("resolveTranscriptPolicy({");
    expect(interactionAttemptImplementation).not.toContain("prepareSessionManagerForRun({");
    expect(attemptToolRuntime).toContain("buildAttemptToolRuntime");
    expect(attemptToolRuntime).toContain("createOpenClawCodingTools");
    expect(attemptToolRuntime).toContain("nativeExecutionSession: params.nativeExecutionSession");
    expect(attemptToolRuntime).toContain("normalizeProviderToolSchemas");
    expect(attemptToolRuntime).toContain("getOrCreateSessionMcpRuntime");
    expect(attemptToolRuntime).toContain("createBundleLspToolRuntime");
    expect(attemptToolRuntime).toContain("collectAllowedToolNames");
    expect(attemptToolRuntime).toContain("filterEffectiveToolsForNodeAgentNativeTaskMode");
    expect(interactionAttemptImplementation).toContain("buildAttemptToolRuntime");
    expect(interactionAttemptImplementation).not.toContain("createOpenClawCodingTools({");
    expect(interactionAttemptImplementation).not.toContain("normalizeProviderToolSchemas({");
    expect(interactionAttemptImplementation).not.toContain("getOrCreateSessionMcpRuntime({");
    expect(interactionAttemptImplementation).not.toContain("createBundleLspToolRuntime({");
    expect(interactionAttemptImplementation).not.toContain("collectAllowedToolNames({");
    expect(attemptPromptRuntime).toContain("buildAttemptPromptRuntime");
    expect(attemptPromptRuntime).toContain("buildEmbeddedSystemPrompt");
    expect(attemptPromptRuntime).toContain("buildSystemPromptReport");
    expect(attemptPromptRuntime).toContain("resolveProviderSystemPromptContribution");
    expect(attemptPromptRuntime).toContain("transformProviderSystemPrompt");
    expect(attemptPromptRuntime).toContain("resolvePromptProfileForAgent");
    expect(interactionAttemptImplementation).toContain("buildAttemptPromptRuntime");
    expect(interactionAttemptImplementation).not.toContain("buildEmbeddedSystemPrompt({");
    expect(interactionAttemptImplementation).not.toContain("buildSystemPromptReport({");
    expect(interactionAttemptImplementation).not.toContain(
      "resolveProviderSystemPromptContribution({",
    );
    expect(interactionAttemptImplementation).not.toContain("transformProviderSystemPrompt({");
    expect(contextManagerRuntime).toContain("runBeforeSubmitContextPressure");
    expect(contextManagerRuntime).toContain("createContextPressureController");
    expect(contextManagerRuntime).toContain("estimateToolResultReductionPotential");
    expect(contextManagerRuntime).toContain("truncateOversizedToolResultsInSessionManager");
    expect(contextManagerRuntime).toContain("resolveAutoCompactionCustomInstructions");
    expect(contextManagerRuntime).toContain("readCompactionRepairWindow");
    expect(contextManagerRuntime).toContain("buildAttemptContextRuntimeContext");
    expect(contextManagerRuntime).toContain("finalizeAttemptContextManagerTurn");
    expect(contextManagerRuntime).toContain("finalizeAttemptContextEngineTurn");
    expect(contextManagerRuntime).toContain("runContextEngineMaintenance");
    expect(contextManagerRuntime).toContain("runActualUsageContextPressure");
    expect(contextManagerRuntime).toContain("contextPressure.afterTurn({");
    expect(contextManagerRuntime).toContain('reason: "actual_usage"');
    expect(contextManagerRuntime).toContain("runTimeoutHighUsageContextPressure");
    expect(contextManagerRuntime).toContain('trigger: "timeout_high_usage"');
    expect(contextManagerRuntime).toContain("runPostCompactionSideEffects");
    expect(contextManagerRuntime).toContain("runProviderOverflowContextPressure");
    expect(contextManagerRuntime).toContain('trigger: "provider_overflow"');
    expect(contextManagerRuntime).toContain("runOverflowToolResultFallbackTruncation");
    expect(contextManagerRuntime).toContain("sessionLikelyHasOversizedToolResults");
    expect(contextManagerRuntime).toContain("truncateOversizedToolResultsInSession");
    expect(contextManagerRuntime).toContain("export type ContextManagerRunParams");
    expect(contextManagerRuntime).not.toContain("RunEmbeddedPiAgentParams");
    expect(contextManagerRuntime).not.toContain("pi-embedded-runner/run/params");
    expect(interactionAttemptImplementation).toContain("runBeforeSubmitContextPressure");
    expect(interactionAttemptImplementation).toContain("finalizeAttemptContextManagerTurn");
    expect(interactionAttemptImplementation).toContain("buildAttemptContextRuntimeContext");
    expect(interactionAttemptImplementation).not.toContain("createContextPressureController");
    expect(interactionAttemptImplementation).not.toContain("shouldPreferActualUsageCompaction");
    expect(interactionAttemptImplementation).not.toContain("estimateToolResultReductionPotential");
    expect(interactionAttemptImplementation).not.toContain("contextPressure.beforeSubmit({");
    expect(interactionAttemptImplementation).not.toContain("finalizeAttemptContextEngineTurn({");
    expect(interactionAttemptImplementation).not.toContain("runContextEngineMaintenance({");
    expect(interactionAttemptImplementation).not.toContain("buildAfterTurnRuntimeContext({");
    expect(interactionRuntime).toContain("resolveAutoCompactionCustomInstructions");
    expect(interactionRuntime).toContain("runActualUsageContextPressure");
    expect(interactionRuntime).toContain("runTimeoutHighUsageContextPressure");
    expect(interactionRuntime).toContain("runProviderOverflowContextPressure");
    expect(interactionRuntime).toContain("runOverflowToolResultFallbackTruncation");
    expect(interactionRuntime).not.toContain("contextPressure.afterTurn({");
    expect(interactionRuntime).not.toContain("contextPressure.recover({");
    expect(interactionRuntime).not.toContain("buildEmbeddedCompactionRuntimeContext");
    expect(interactionRuntime).not.toContain("runContextEngineMaintenance");
    expect(interactionRuntime).not.toContain("estimateProviderVisibleContextBreakdown");
    expect(interactionRuntime).not.toContain("toContextPressureBreakdown");
    expect(interactionRuntime).not.toContain('trigger: "timeout_high_usage"');
    expect(interactionRuntime).not.toContain('trigger: "provider_overflow"');
    expect(interactionRuntime).not.toContain("truncateOversizedToolResultsInSession");
    expect(interactionRuntime).not.toContain("sessionLikelyHasOversizedToolResults");
    expect(interactionRuntime).not.toContain("pruneToolOutputsForContextPressure");
    expect(interactionRuntime).not.toContain("executionNodeContinuationStrategy");
    expect(interactionRuntime).not.toContain("readCompactionRepairWindow");
    expect(interactionRuntime).not.toContain("runPostCompactionSideEffects");
    expect(interactionRuntime).not.toContain("NODE_WORKER_COMPACTION_CONTINUATION_INSTRUCTION");
    expect(interactionRuntime).not.toContain("COMPACTION_REPAIR_WINDOW_CONTEXT_LINES");
    expect(interactionRuntime).not.toContain("providerRuntimeLease");
    expect(interactionRuntime).not.toContain("provider_runtime_lease_consumed");
    expect(interactionRuntime).not.toContain("before_attempt_backend");
    expect(interactionRuntime).toContain("provider_turn_entering");
    expect(interactionRuntime).toContain("runtimeJobEnvelopeOwnsPostTurnReduction");
    expect(interactionRuntime).toContain("runtime_job_envelope_reduction_requested");
    expect(interactionRuntime).toContain("!runtimeJobEnvelopeOwnsPostTurnReduction");
    expect(authController).not.toContain("providerRuntimeLease");
    expect(agentRuntime).toContain("createAgentRuntimeProviderCapability");
    expect(agentRuntime).not.toContain("prepareProviderRuntimeLease");
    expect(agentRuntime).toContain("providerCapability");
    expect(core).toContain("providerCapability.runTurn");
    expect(core).toContain("providerCapability: profile.providerCapability");
    expect(core).not.toContain("turnDriver");
    expect(agentRuntime).not.toContain("turnDriver");
    expect(fs.existsSync(path.join(REPO_ROOT, "src/agents/runtime-turn-driver.ts"))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, "src/agents/provider-runtime/lease.ts"))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, "src/agents/provider-runtime/lease.test.ts"))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(REPO_ROOT, "src/agents/provider-runtime/registry.ts"))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(REPO_ROOT, "src/agents/provider-runtime/types.ts"))).toBe(false);
    expect(
      fs.existsSync(path.join(REPO_ROOT, "extensions/codex/src/provider-runtime-adapter.ts")),
    ).toBe(false);
    expect(runtimeProviderCapability).toContain("runCodexAppServerAttempt");
    expect(runtimeProviderCapability).toContain("runInteractionAttempt");
    expect(runtimeProviderCapability).toContain("listCodexAppServerModels");
    expect(runtimeProviderCapability).toContain("AgentRuntimeProviderCapabilityNotReadyError");
    expect(runtimeProviderCapability).toContain("provider_capability_entered");
    expect(runtimeProviderCapability).not.toContain("ProviderRuntimeLease");
    expect(runtimeProviderCapability).not.toContain("runAgentHarnessAttemptWithFallback");
    expect(runtimeProviderCapability).not.toContain("getAgentHarness");
    expect(runtimeProviderCapability).not.toContain("selectAgentHarness");
    for (const stage of ["provider_capability_entered", "agent_turn_completed"]) {
      expect(runtimeProviderCapability).toContain(stage);
      expect(nativeRpc).toContain(stage);
    }
    for (const stage of [
      "provider_capability_entered",
      "provider_client_starting",
      "provider_client_ready",
      "thread_binding_started",
      "thread_binding_ready",
      "provider_request_started",
      "model_stream_started",
      "tool_call_started",
      "tool_call_completed",
      "model_stream_completed",
      "agent_turn_failed",
    ].filter((stage) => stage !== "provider_capability_entered")) {
      expect(codexRunAttempt).toContain(stage);
      expect(nativeRpc).toContain(stage);
    }
    expect(fs.existsSync(path.join(REPO_ROOT, "src/agents/pi-agent-attempt-runtime.ts"))).toBe(
      false,
    );
    expect(
      fs.existsSync(path.join(REPO_ROOT, "src/agents/pi-agent-attempt-runtime/attempt.ts")),
    ).toBe(false);
    expect(interactionAttemptImplementation).toContain(
      "export async function runInteractionAttempt",
    );
    expect(interactionAttemptImplementation).not.toContain("runEmbeddedAttempt");
    expect(
      fs.existsSync(path.join(REPO_ROOT, "src/agents/pi-embedded-runner/run/attempt.ts")),
    ).toBe(false);
    expect(builtinPiHarness).toContain("runInteractionAttempt");
    expect(builtinPiHarness).not.toContain("runPiAgentAttempt");
    expect(builtinPiHarness).not.toContain("pi-embedded-runner/run/attempt.js");
    expect(
      fs.existsSync(path.join(REPO_ROOT, "src/agents/pi-embedded-runner/run/backend.ts")),
    ).toBe(false);
    expect(core).toContain("runInteractionRuntime");
    expect(core).not.toContain("runEmbeddedPiAgentInteractionRuntime");
    expect(interactionRuntime).not.toContain("runEmbeddedPiAgentCore");
    expect(interactionRuntime).not.toContain("embeddedParamsFromAgentRuntimeInvocation");
    expect(interactionRuntime).toContain("export async function runInteractionRuntime");
    expect(interactionRuntime).not.toContain("runEmbeddedPiAgentInteractionRuntime");
    expect(interactionRuntime).not.toContain("RunEmbeddedPiAgentParams");
    expect(interactionRuntime).not.toContain("pi-embedded-runner/run/params");
    expect(legacyRunWrapper).not.toContain("RuntimeAgentExecutor");
    expect(legacyRunWrapper).toContain("DefaultAgentRuntimeCore");
    expect(legacyRunWrapper).not.toContain("runEmbeddedPiAgentCore");
  });

  it("documents the OpenClaw-native RuntimeJob envelope reducer as a proof blocker", () => {
    const spec = readRepoFile(
      "docs/projects/execution-platform/specs/openclaw-final-native-agent-runtime-cutover.md",
    );

    expect(spec).toContain(
      "OpenClaw-Native Lifecycle Correction: RuntimeJob Reduces Existing Turn Facts",
    );
    expect(spec).toContain("Fast Cutover Plan: RuntimeJob Envelope Reducer");
    expect(spec).toContain(
      "After `agent_turn_completed`, the RuntimeJob envelope must synchronously reduce the existing OpenClaw turn facts.",
    );
    expect(spec).toContain(
      "turn ended\n-> reducer runs immediately\n-> job transitions deterministically",
    );
    expect(spec).toContain("This is now a hard blocker before the next proof.");
  });

  it("keeps InteractionRuntime caller-owned and free of foreground command lanes", () => {
    const interactionRuntime = readRepoFile("src/agents/interaction-runtime.ts");
    const agentTurn = readRepoFile("src/agents/agent-turn.ts");
    const core = readRepoFile("src/agents/agent-runtime-core.ts");

    expect(interactionRuntime).not.toContain("enqueueCommandInLane");
    expect(interactionRuntime).not.toContain("resolveGlobalLane");
    expect(interactionRuntime).not.toContain("resolveSessionLane");
    expect(interactionRuntime).not.toContain("resolveSessionKeyForRequest");
    expect(interactionRuntime).not.toContain("resolveStoredSessionKeyForSessionId");
    expect(interactionRuntime).not.toContain("backfillSessionKey");
    expect(interactionRuntime).not.toContain("ensureRuntimePluginsLoaded");
    expect(interactionRuntime).not.toContain("ensureOpenClawModelsJson");
    expect(interactionRuntime).not.toContain("resolveRunWorkspaceDir");
    expect(interactionRuntime).not.toContain("resolveContextRuntime");
    expect(interactionRuntime).not.toContain("discoverAuthStorage");
    expect(interactionRuntime).not.toContain("discoverModels");
    expect(interactionRuntime).not.toContain("resolveModelAsync");
    expect(interactionRuntime).not.toContain("resolveHookModelSelection");
    expect(interactionRuntime).not.toContain("resolveEffectiveRuntimeModel");
    expect(interactionRuntime).not.toContain("ensureAuthProfileStore");
    expect(interactionRuntime).not.toContain("resolveAuthProfileOrder");
    expect(interactionRuntime).not.toContain("resolveAuthProfileEligibility");
    expect(interactionRuntime).not.toContain('from "./run/backend.js"');
    expect(interactionRuntime).not.toContain("runEmbeddedAttemptWithBackend");
    expect(interactionRuntime).not.toContain("command_queue");
    expect(interactionRuntime).not.toContain("params.agentRuntimeCore");
    expect(interactionRuntime).not.toContain("DefaultAgentRuntimeCore");
    expect(interactionRuntime).not.toContain("agent-runtime-core.js");
    expect(interactionRuntime).not.toContain("createNativeRunChildTask");
    expect(interactionRuntime).not.toContain("resolveLiveToolResultMaxChars");
    expect(core).toContain("createNativeRunChildTask");
    expect(core).toContain("resolveLiveToolResultMaxChars");
    expect(interactionRuntime).not.toContain("before_session_lane_enqueue");
    expect(interactionRuntime).not.toContain("before_global_lane_enqueue");
    expect(interactionRuntime).not.toContain("entered_session_lane");
    expect(interactionRuntime).not.toContain("entered_global_lane");
    expect(interactionRuntime).toContain("caller_owned_scheduler_entered");
    expect(interactionRuntime).toContain("interaction_runtime_entered");
    expect(interactionRuntime).not.toContain("executionClass:");
    expect(agentTurn).toContain('"subagent_child"');
  });

  it("keeps session identity repair in SessionRuntime and AgentRuntimeCore", () => {
    const core = readRepoFile("src/agents/agent-runtime-core.ts");
    const sessionKey = readRepoFile("src/agents/session-runtime/session-key.ts");

    expect(core).toContain("resolveEffectiveSessionKey");
    expect(sessionKey).toContain("resolveSessionKeyForRequest");
    expect(sessionKey).toContain("resolveStoredSessionKeyForSessionId");
    expect(sessionKey).toContain("Read-only sessionKey repair");
  });

  it("keeps workspace/plugin/models admission in RunEnvironment", () => {
    const core = readRepoFile("src/agents/agent-runtime-core.ts");
    const runEnvironment = readRepoFile("src/agents/run-environment.ts");

    expect(core).toContain("DefaultAgentRunEnvironmentService");
    expect(core).toContain("run_environment");
    expect(runEnvironment).toContain("resolveRunWorkspaceDir");
    expect(runEnvironment).toContain("ensureRuntimePluginsLoaded");
    expect(runEnvironment).toContain("ensureOpenClawModelsJson");
    expect(runEnvironment).toContain("modelsJsonStatus");
    expect(runEnvironment).toContain("runtimePluginsStatus");
    expect(runEnvironment).toContain("skipped_not_requested");
  });

  it("keeps model registry, model resolution, and profile candidate setup in ModelAuthRuntime", () => {
    const core = readRepoFile("src/agents/agent-runtime-core.ts");
    const modelAuthRuntime = readRepoFile("src/agents/model-auth-runtime.ts");

    expect(core).toContain("prepareModelAuthRuntime");
    expect(core).toContain("model_auth_preparing");
    expect(core).toContain("model_auth_prepared");
    expect(modelAuthRuntime).toContain("resolveHookModelSelection");
    expect(modelAuthRuntime).toContain("discoverAuthStorage");
    expect(modelAuthRuntime).toContain("discoverModels");
    expect(modelAuthRuntime).toContain("resolveModelAsync");
    expect(modelAuthRuntime).toContain("findAdmittedRuntimeModel");
    expect(modelAuthRuntime).toContain("admittedRuntime");
    expect(modelAuthRuntime).toContain("resolveEffectiveRuntimeModel");
    expect(modelAuthRuntime).toContain("ensureAuthProfileStore");
    expect(modelAuthRuntime).toContain("shouldLoadAuthProfileStore");
    expect(modelAuthRuntime).toContain("resolveAuthProfileOrder");
  });

  it("keeps native front-door admission independent from legacy compatibility gates", () => {
    const gatewayHttp = readRepoFile("src/gateway/execution-platform-http.ts");
    const chat = readRepoFile("src/gateway/server-methods/chat.ts");

    expect(gatewayHttp).not.toContain("legacy_front_door_execution_compatibility");
    expect(chat).not.toContain("legacyCompatibilityDecision");
  });

  it("removes run-once from native gateway host routes", () => {
    const hostRoutes = readRepoFile(
      "extensions/execution-platform/src/codex-bridge/host-routes.ts",
    );

    expect(hostRoutes).not.toContain("queue-runner/run-once");
    expect(hostRoutes).not.toContain("ProductionWorkflowExecutionFactory");
    expect(hostRoutes).not.toContain("nativeWorkflowRunOnce");
    expect(hostRoutes).not.toContain("gatewayWorkerRunOnceProofMode");
  });

  it("keeps native RPC and proof harness as start/status/control surfaces without proof preflight", () => {
    const nativeRpc = readRepoFile(
      "extensions/execution-platform/src/intent-routing/native-execution-rpc.ts",
    );
    const proofHarness = readRepoFile(
      "scripts/execution-platform-run-native-orchestration-proof.mjs",
    );

    for (const source of [nativeRpc, proofHarness]) {
      expect(source).not.toContain("runGatewayAgentTeamRuntimeJob");
      expect(source).not.toContain("runGatewayNativeExecutionSessionRuntimeJob");
      expect(source).not.toContain("runEmbeddedPiAgent");
      expect(source).not.toContain("queue-runner/run-once");
      expect(source).not.toContain("ProductionWorkflowExecutionFactory");
      expect(source).not.toContain("RuntimeJobOnce");
    }
    expect(proofHarness).toContain("/api/execution-platform/execution/native-readyz");
    expect(proofHarness).not.toContain("/api/execution-platform/execution/preflight");
    expect(proofHarness).not.toContain("gateway_native_preflight");
    expect(proofHarness).not.toContain("admission_preflight");
    expect(proofHarness).toContain("/api/execution-platform/execution/start-session");
    expect(proofHarness).toContain("/api/execution-platform/execution/status");
    expect(proofHarness).toContain("/api/execution-platform/execution/apply-control");
    expect(proofHarness).toContain("/api/execution-platform/execution/closeout");
  });

  it("keeps obsolete Product/Spec replay scripts deleted", () => {
    expect(
      fs.existsSync(
        path.join(REPO_ROOT, "scripts/execution-platform-run-product-spec-boundary-replay.mjs"),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(REPO_ROOT, "scripts/execution-platform-run-product-spec-checkpointed-test.mjs"),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(
          REPO_ROOT,
          "src/scripts/execution-platform-boundary-replay-terminalization.test.ts",
        ),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(
          REPO_ROOT,
          "scripts/execution-platform-record-product-spec-proof-substrate-scrub-queue.mjs",
        ),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(
          REPO_ROOT,
          "scripts/execution-platform-record-boundary-replay-checkpoints-closeout.mjs",
        ),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(
          REPO_ROOT,
          "scripts/execution-platform-run-proof-framework-executor-subject-split-real-model-proof.mjs",
        ),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(
          REPO_ROOT,
          "extensions/execution-platform/src/workflows/product-spec-proof-substrate.ts",
        ),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(
          REPO_ROOT,
          "extensions/execution-platform/src/workflows/product-spec-proof-substrate.test.ts",
        ),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(
          REPO_ROOT,
          "extensions/execution-platform/src/workflows/boundary-replay-proof-gate.ts",
        ),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(
          REPO_ROOT,
          "extensions/execution-platform/src/workflows/boundary-replay-proof-gate.test.ts",
        ),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(
          REPO_ROOT,
          "extensions/execution-platform/src/workflows/production-workflow-execution-factory.ts",
        ),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(
          REPO_ROOT,
          "extensions/execution-platform/src/workflows/production-workflow-execution-factory.test.ts",
        ),
      ),
    ).toBe(false);
  });

  it("keeps native child session launch inside resident RuntimeGeneration", () => {
    const nativeRunner = readRepoFile("src/gateway/native-execution-session-runtime-job.ts");
    const startService = readRepoFile("src/gateway/native-execution-start-service.ts");
    const agentRuntime = readRepoFile("src/agents/openclaw-agent-runtime.ts");
    const nativeContracts = readRepoFile(
      "extensions/execution-platform/src/workflows/native-agentic-orchestration.ts",
    );

    expect(nativeRunner).toContain("input.agentRuntime.acceptNativeExecutionSession");
    expect(nativeRunner).toContain("commitAcceptedNativeExecutionJob");
    expect(nativeRunner).not.toContain("startNativeExecutionSession(");
    expect(nativeRunner).not.toContain("deriveChild(admissionSnapshot");
    expect(nativeRunner).not.toContain("commitAdmittedNativeExecutionJob");
    expect(nativeRunner).not.toContain("ensureAdmissionSnapshotCommitEvidence");
    expect(nativeRunner).not.toContain("execution.admission.consumed");
    expect(startService).toContain("commitAcceptedNativeExecutionJob");
    expect(startService).toContain("this.agentRuntime.acceptNativeExecutionSession");
    expect(startService).not.toContain("startNativeExecutionSession(");
    expect(startService).not.toContain("this.admission.commit");
    expect(startService).not.toContain("NativeAdmissionService");
    expect(startService).not.toContain("commitAdmittedNativeExecutionJob");
    expect(startService).not.toContain("NativeExecutionAdmittedRuntimeSnapshot");
    expect(startService).not.toContain("native-execution-admission");
    expect(nativeContracts).not.toContain("export async function startNativeExecutionSession");
    expect(nativeContracts).not.toContain("createNativeExecutionSessionStartTool");
    expect(nativeContracts).not.toContain("resumeRuntimeJobId");
    expect(nativeContracts).not.toContain("resumeRequestId");
    expect(nativeRunner).not.toContain("native execution job has no committed admission snapshot");
    expect(agentRuntime).toContain("export class OpenClawAgentRuntime");
    expect(agentRuntime).toContain("static async build");
    expect(agentRuntime).toContain("acceptNativeExecutionSession");
    expect(agentRuntime).not.toContain("prepareNativeExecutionRun");
    expect(agentRuntime).toContain("buildAcceptedTurn");
    expect(agentRuntime).toContain("runAcceptedNativeExecution");
    expect(agentRuntime).toContain("DefaultAgentRuntimeCore");
    expect(agentRuntime).not.toContain("AgentRuntimeExecutionContext");
    expect(agentRuntime).not.toContain("RuntimeAgentExecutor");
    expect(agentRuntime).not.toContain("RunEmbeddedPiAgentParams");
  });

  it("keeps native runtime construction in RuntimeGeneration, not worker/start/proof paths", () => {
    const nativeRunner = readRepoFile("src/gateway/native-execution-session-runtime-job.ts");
    const startService = readRepoFile("src/gateway/native-execution-start-service.ts");
    const proofHarness = readRepoFile(
      "scripts/execution-platform-run-native-orchestration-proof.mjs",
    );
    const agentRuntime = readRepoFile("src/agents/openclaw-agent-runtime.ts");
    const admittedCatalog = readRepoFile("src/agents/admitted-model-catalog-runtime.ts");

    expect(startService).not.toContain("discoverAgentModelRuntime");
    expect(nativeRunner).not.toContain("discoverAgentModelRuntime");
    expect(startService).not.toContain("createAdmittedModelCatalogRuntime");
    expect(startService).not.toContain("getReadinessCatalogRuntime");
    expect(nativeRunner).not.toContain("createAdmittedModelRegistryFromModels");
    expect(nativeRunner).not.toContain("discoverAuthStorage");
    expect(nativeRunner).not.toContain("resolveRuntimeAgentWorkspaceRoots");
    expect(nativeRunner).not.toContain("resolveAgentEffectiveModelPrimary");
    expect(nativeRunner).not.toContain("prepareProviderRuntimeLease");
    expect(startService).not.toContain("prepareProviderRuntimeLease");
    expect(startService).not.toContain("createAdmittedModelCatalogRuntime");
    expect(startService).not.toContain("discoverAuthStorage");
    expect(proofHarness).not.toContain("providerRuntimeLease");
    expect(proofHarness).not.toContain("runtimeSnapshotId");
    expect(agentRuntime).toContain("createAdmittedModelCatalogRuntime");
    expect(agentRuntime).toContain("createAgentRuntimeProviderCapability");
    expect(agentRuntime).not.toContain("prepareProviderRuntimeLease");
    expect(agentRuntime).toContain('modelRegistryAuthority: "admitted_catalog"');
    expect(agentRuntime).toContain("allowDynamicLookup: false");
    expect(admittedCatalog).toContain("modelRegistryAuthority?:");
    expect(admittedCatalog).toContain("createAdmittedModelCatalogRuntime");
    expect(admittedCatalog).toContain("discoverImplicitProviders: false");
    expect(admittedCatalog).toContain("modelsJsonAuthority: false");
  });

  it("keeps provider subprocess state inside the OpenClaw-owned runtime home", () => {
    const compose = readRepoFile("docker-compose.yml");
    const codexConfig = readRepoFile("extensions/codex/src/app-server/config.ts");
    const codexTransport = readRepoFile("extensions/codex/src/app-server/transport-stdio.ts");
    const runtimeHome = readRepoFile("src/agents/openclaw-runtime-home.ts");
    const reconcileRuntimeHome = readRepoFile("scripts/docker/reconcile-runtime-home.sh");
    const reloadGateway = readRepoFile("scripts/docker/reload-gateway-dist.sh");
    const rebuildGateway = readRepoFile("scripts/docker/rebuild-gateway.sh");

    expect(compose).toContain("OPENCLAW_RUNTIME_HOME: /home/node/.openclaw/runtime");
    expect(compose).toContain("CODEX_HOME: /home/node/.openclaw/runtime/providers/codex");
    expect(compose).toContain(
      "MODEL_MEMORY_PHASE2_CODEX_SESSION_ROOT: ${MODEL_MEMORY_PHASE2_CODEX_SESSION_ROOT:-/home/node/.openclaw/runtime/providers/codex/sessions}",
    );
    expect(compose).toContain(
      "MODEL_MEMORY_PHASE2_CODEX_HISTORY_PATH: ${MODEL_MEMORY_PHASE2_CODEX_HISTORY_PATH:-/home/node/.openclaw/runtime/providers/codex/history.jsonl}",
    );
    expect(compose).not.toContain("/home/node/.openclaw/external-auth/codex");
    expect(compose).not.toContain("OPENCLAW_CODEX_SESSION_DIR");
    expect(compose).not.toContain("OPENCLAW_CODEX_HISTORY_FILE");

    expect(runtimeHome).toContain("export function resolveOpenClawRuntimeHome");
    expect(runtimeHome).toContain("export function buildOpenClawProviderProcessEnv");
    expect(runtimeHome).toContain("OPENCLAW_RUNTIME_HOME");
    expect(runtimeHome).toContain("CODEX_HOME: resolved.providerHome");

    expect(codexConfig).toContain("buildOpenClawProviderProcessEnv");
    expect(codexConfig).toContain('buildOpenClawProviderProcessEnv("codex"');
    expect(codexTransport).toContain("...options.env");
    expect(codexTransport).not.toContain("CODEX_HOME");
    expect(codexTransport).not.toContain("external-auth");

    expect(reconcileRuntimeHome).toContain("OPENCLAW_RUNTIME_HOME_HOST");
    expect(reconcileRuntimeHome).toContain("OPENCLAW_CODEX_IMPORT_DIR");
    expect(reconcileRuntimeHome).toContain("providerHomes");
    expect(reconcileRuntimeHome).toContain("rawProviderLogStored");
    expect(reloadGateway).toContain("reconcile-runtime-home.sh");
    expect(rebuildGateway).toContain("reconcile-runtime-home.sh");
  });

  it("removes admitted snapshot vocabulary from production native public surfaces", () => {
    const nativeRpc = readRepoFile(
      "extensions/execution-platform/src/intent-routing/native-execution-rpc.ts",
    );
    const nativeWorkflow = readRepoFile(
      "extensions/execution-platform/src/workflows/native-agentic-orchestration.ts",
    );
    const startService = readRepoFile("src/gateway/native-execution-start-service.ts");

    for (const source of [nativeRpc, nativeWorkflow, startService]) {
      expect(source).not.toContain("openclaw.admitted_agent_run");
      expect(source).not.toContain("admitted_runtime_snapshot");
      expect(source).not.toContain("runtimeSnapshotId");
      expect(source).not.toContain("snapshotState");
      expect(source).not.toContain("admittedRequestParameterSummary");
      expect(source).not.toContain("nativeExecutionAdmissionStableWorldHash");
      expect(source).not.toContain("NativeExecutionAdmittedRuntimeSnapshot");
    }
  });

  it("keeps native model-facing handoff and start tool free of retired deterministic products", () => {
    const nativeRpc = readRepoFile(
      "extensions/execution-platform/src/intent-routing/native-execution-rpc.ts",
    );
    const startTool = readRepoFile("src/agents/tools/start-execution-session-tool.ts");
    const modelVisibleSources = [nativeRpc, startTool];

    for (const source of modelVisibleSources) {
      expect(source).not.toContain("RequirementMap");
      expect(source).not.toContain("SchedulerGraphPatch");
      expect(source).not.toContain("route schemas");
      expect(source).not.toContain("work orders");
    }
  });
});
