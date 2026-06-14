import { describe, expect, it, vi } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import {
  createBaseCanonicalRouterOutput,
  createCanonicalRouterAction,
  InMemoryRoutingTelemetryStore,
  type CanonicalRouterOutput,
  type StructuredModelIntentRouterProvider,
} from "../intent-front-door/index.ts";
import { listKnownProtocolSlashCommands } from "../intent-front-door/protocol-pre-gate.ts";
import {
  RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { NATIVE_EXECUTION_SESSION_JOB_TYPE } from "../workflows/native-agentic-orchestration.ts";
import { startAcceptedNativeExecutionSessionForTest } from "../workflows/native-execution-test-fixtures.ts";
import {
  NativeExecutionRpcService,
  type NativeExecutionRpcDependencies,
} from "./native-execution-rpc.ts";

describe("native execution rpc", () => {
  function fixedFrontDoorProvider(
    output: CanonicalRouterOutput,
  ): StructuredModelIntentRouterProvider {
    return {
      async route() {
        return {
          output,
          providerRef: "fixture://structured-front-door",
          modelCandidateId: "fixture-router",
          providerCallMade: false,
          reasonCodes: ["fixture_structured_router"],
        };
      },
    };
  }

  function sequenceFrontDoorProvider(outputs: unknown[]): StructuredModelIntentRouterProvider & {
    requests: unknown[];
  } {
    const requests: unknown[] = [];
    return {
      requests,
      async route(request) {
        requests.push(request);
        const output = outputs[Math.min(requests.length - 1, outputs.length - 1)];
        return {
          output,
          providerRef: "fixture://structured-front-door",
          modelCandidateId: "fixture-router",
          providerCallMade: false,
          reasonCodes: [`fixture_structured_router_call_${requests.length}`],
        };
      },
    };
  }

  function createNativeExecutionRpcServiceForTest(
    dependencies: NativeExecutionRpcDependencies,
  ): NativeExecutionRpcService {
    return new NativeExecutionRpcService({
      startExecutionSession: async (input) => startAcceptedNativeExecutionSessionForTest(input),
      ...dependencies,
    });
  }

  it("pre-gates slash commands, empty prompts, and unauthenticated submits before router calls", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const rpc = createNativeExecutionRpcServiceForTest({
        runtimeJobs,
      });

      const compact = await rpc.submit({
        prompt: "/compact now",
        auth: { actorId: "operator", authenticated: true, role: "operator" },
      });
      expect(compact.accepted).toBe(false);
      expect(compact.reasonCodes).toEqual(
        expect.arrayContaining([
          "protocol_command_bypassed_execution_submit",
          "protocol_command_compact",
        ]),
      );
      expect(compact.frontDoorSubmitDiagnosticsManifest?.status).toBe("rejected");
      expect(compact.frontDoorSubmitDiagnosticsManifest?.promptByteLength).toBe(
        Buffer.byteLength("/compact now", "utf8"),
      );
      expect(compact.frontDoorSubmitDiagnosticsManifest?.rawPromptStored).toBe(false);
      expect(compact.frontDoorSubmitDiagnostics?.map((phase) => phase.phase)).toEqual(
        expect.arrayContaining(["submit_started", "protocol_pregate_completed"]),
      );
      expect(compact.frontDoorMemoryPolicy?.decision).toBe("no_memory");
      expect(compact.frontDoorMemoryPolicy?.reasonCodes).toContain(
        "protocol_pregate_bypasses_memory_retrieval",
      );

      const newSession = await rpc.submit({
        prompt: "/new",
        auth: { actorId: "operator", authenticated: true, role: "operator" },
      });
      expect(newSession.accepted).toBe(false);
      expect(newSession.reasonCodes).toContain("protocol_command_new");

      const empty = await rpc.submit({
        prompt: "   ",
        auth: { actorId: "operator", authenticated: true, role: "operator" },
      });
      expect(empty.accepted).toBe(false);
      expect(empty.reasonCodes).toContain("empty_input");

      const unauthenticated = await rpc.submit({
        prompt: "Have the coding team add a small regression test.",
        auth: { actorId: "operator", authenticated: false, role: "operator" },
      });
      expect(unauthenticated.accepted).toBe(false);
      expect(unauthenticated.statusCode).toBe(401);
      expect(unauthenticated.reasonCodes).toContain("authenticated_operator_required");
      expect(unauthenticated.frontDoorSubmitDiagnosticsManifest?.status).toBe("rejected");
      expect(unauthenticated.frontDoorSubmitDiagnosticsManifest?.reasonCodes).toEqual(
        expect.arrayContaining(["authenticated_operator_required"]),
      );

      expect(await runtimeJobs.listRecentJobs()).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("pre-gates UI controls away from execution.submit", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const rpc = createNativeExecutionRpcServiceForTest({
        runtimeJobs,
      });
      const submit = await rpc.submit({
        prompt: "",
        auth: { actorId: "operator", authenticated: true, role: "operator" },
        uiControl: { control: "cancel", targetRef: "runtime-job://example" },
      });
      expect(submit.accepted).toBe(false);
      expect(submit.reasonCodes).toEqual(
        expect.arrayContaining(["ui_control_bypassed_execution_submit", "ui_control_cancel"]),
      );
      expect(await runtimeJobs.listRecentJobs()).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("records accepted Work Queue controls as native session-tree control events", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const started = await startAcceptedNativeExecutionSessionForTest({
        runtimeJobs,
        request: {
          objective: "Execute native session control proof.",
          refs: ["work-queue://item/control-proof"],
        },
      });
      const rpc = createNativeExecutionRpcServiceForTest({
        runtimeJobs,
      });

      const decision = await rpc.applyControl({
        actionKind: "redirect",
        actionId: "redirect-1",
        workItemId: "control-proof",
        runtimeJobId: started.runtimeJobId,
        auth: { actorId: "operator", authenticated: true, role: "operator" },
        metadata: {
          redirectMessage: "Use the native execution orchestrator.",
        },
      });

      expect(decision.accepted).toBe(true);
      const events = await runtimeJobs.listEvents(started.runtimeJobId, 20);
      const nativeControl = events.find(
        (event) => event.eventType === "execution.control.redirect",
      );
      expect(nativeControl?.data).toMatchObject({
        schemaVersion: "openclaw.runtime-execution-event-envelope.v1",
        runtimeJobId: started.runtimeJobId,
        sessionId: started.sessionId,
        eventKind: "control_recorded",
        controlKind: "redirect",
        redirectMessage: "Use the native execution orchestrator.",
        workQueueLifecycleMutationAllowed: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawToolLogStored: false,
      });
    } finally {
      await db.close();
    }
  });

  it("starts a native execution session directly without the free-form front door", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const launchCalls: Array<{
        runtimeJobId: string;
        sessionId: string;
        agentProfile: string;
        queueName: string;
        workerId: string;
      }> = [];
      const rpc = createNativeExecutionRpcServiceForTest({
        runtimeJobs,
        startExecutionSession: async (input) => startAcceptedNativeExecutionSessionForTest(input),
        launchNativeExecutionSession: async (input) => {
          launchCalls.push(input);
        },
      });

      const result = await rpc.startSession({
        request: {
          objective: "Execute the runtime artifact retention policy work item.",
          refs: ["work-queue://item/runtime-artifact-retention"],
          constraints: ["Do not mutate Work Queue lifecycle."],
          validationSignal: "Run the focused runtime artifact tests.",
        },
        auth: {
          actorId: "operator",
          authenticated: true,
          role: "operator",
          sourceRoute: "service",
        },
        workItemId: "runtime-artifact-retention",
        queueName: "native-execution",
        agentProfile: "execution-orchestrator",
        idempotencyKey: "native-start-proof",
      });

      expect(result).toMatchObject({
        accepted: true,
        status: "accepted",
        statusCode: 202,
        jobType: "openclaw.accepted_agent_run",
        queueName: "native-execution",
        agentProfile: "execution-orchestrator",
        launch: {
          status: "scheduled",
          queueName: "native-execution",
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutated: false,
        },
        rawPromptStored: false,
        rawResponseStored: false,
        workQueueLifecycleMutated: false,
      });
      expect(result.runtimeJobId).toBeTruthy();
      expect(result.sessionId).toBeTruthy();
      expect(result.reasonCodes).toContain("native_execution_session_started");
      expect(result.reasonCodes).toContain("native_execution_session_launch_scheduled");
      expect(launchCalls).toEqual([
        expect.objectContaining({
          runtimeJobId: result.runtimeJobId,
          sessionId: result.sessionId,
          agentProfile: "execution-orchestrator",
          queueName: "native-execution",
        }),
      ]);
      const job = await runtimeJobs.getJob(result.runtimeJobId!);
      expect(job?.jobType).toBe("openclaw.accepted_agent_run");
      expect(JSON.stringify(job?.payload)).not.toContain("RequirementMap");
      expect(JSON.stringify(job?.payload)).not.toContain("SchedulerGraphPatch");
      const events = await runtimeJobs.listEvents(result.runtimeJobId!, 20);
      expect(events.some((event) => event.eventType === "execution.session.started")).toBe(true);
      const dispatchEvent = events.find(
        (event) =>
          event.eventType === "execution.launch.timing" &&
          JSON.stringify(event.data).includes("runtime_worker_dispatch_scheduled"),
      );
      expect(dispatchEvent?.data).toMatchObject({
        schemaVersion: "openclaw.runtime-execution-event-envelope.v1",
        runtimeJobId: result.runtimeJobId,
        sessionId: result.sessionId,
        eventKind: "launch_timing_recorded",
        extra: {
          stage: "runtime_worker_dispatch_scheduled",
          schedulerClass: "runtime_worker_supervisor",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
      });

      await runtimeJobs.recordEvent({
        jobId: result.runtimeJobId!,
        eventType: "execution.launch.timing",
        data: {
          extra: {
            stage: "executor_entered",
            elapsedMs: 10,
            executionClass: "native_runtime_job",
            schedulerClass: "runtime_agent_executor",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          },
        },
      });
      await runtimeJobs.recordEvent({
        jobId: result.runtimeJobId!,
        eventType: "execution.launch.timing",
        data: {
          extra: {
            stage: "model_stream_started",
            elapsedMs: 120,
            provider: "openrouter",
            modelId: "moonshotai/kimi-k2.6",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          },
        },
      });
      const status = await rpc.status(result.runtimeJobId!);
      expect(status).toMatchObject({
        runtimeJobId: result.runtimeJobId,
        runtimeJobState: "pending",
        live: {
          currentPhase: "model_active",
          latestLaunchPhase: "model_active",
          providerRequestSeen: true,
          modelActivitySeen: true,
          rawPromptStored: false,
          rawProviderLogStored: false,
          diagnostics: {
            latestStageLabel: "model_stream_started",
            rawPromptStored: false,
          },
        },
      });
      expect(JSON.stringify(status)).not.toContain(
        "Execute the runtime artifact retention policy work item.",
      );
    } finally {
      await db.close();
    }
  });

  it("fails closed when native start is not composed with the admitted start service", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const rpc = new NativeExecutionRpcService({
        runtimeJobs,
      });

      const result = await rpc.startSession({
        request: {
          objective: "Execute the runtime artifact retention policy work item.",
          refs: ["work-queue://item/runtime-artifact-retention"],
        },
        auth: {
          actorId: "operator",
          authenticated: true,
          role: "operator",
          sourceRoute: "service",
        },
        workItemId: "runtime-artifact-retention",
        queueName: "native-execution",
        agentProfile: "execution-orchestrator",
        idempotencyKey: "native-start-proof",
      });

      expect(result).toMatchObject({
        accepted: false,
        status: "rejected",
        statusCode: 503,
        reasonCodes: ["native_execution_start_session_not_configured"],
      });
      expect(await runtimeJobs.listRecentJobs()).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("preflights a native execution session without enqueueing or launching", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const preflightCalls: unknown[] = [];
      const rpc = createNativeExecutionRpcServiceForTest({
        runtimeJobs,
        preflightExecutionSession: async (input) => {
          preflightCalls.push(input);
          return {
            artifactKind: "openclaw.runtime_generation.acceptance",
            accepted: true,
            runtimeGenerationId: "runtime-generation:test",
            error: null,
            reasonCodes: ["runtime_generation_acceptance_passed"],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
            secretsStored: false,
          };
        },
      });

      const result = await rpc.preflightSession({
        request: {
          objective: "Execute the runtime artifact retention policy work item.",
          refs: ["work-queue://item/runtime-artifact-retention"],
          constraints: ["Do not mutate Work Queue lifecycle."],
          validationSignal: "Run the focused runtime artifact tests.",
        },
        auth: {
          actorId: "operator",
          authenticated: true,
          role: "operator",
          sourceRoute: "service",
        },
        workItemId: "runtime-artifact-retention",
        queueName: "native-execution",
        agentProfile: "execution-orchestrator",
        idempotencyKey: "native-preflight-proof",
      });

      expect(result).toMatchObject({
        artifactKind: "native_execution_preflight_session_result",
        accepted: true,
        status: "accepted",
        statusCode: 200,
        runtimeGenerationId: "runtime-generation:test",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        secretsStored: false,
        workQueueLifecycleMutated: false,
      });
      expect(result.reasonCodes).toEqual(
        expect.arrayContaining(["runtime_generation_acceptance_passed"]),
      );
      expect(preflightCalls).toHaveLength(1);
      expect(await runtimeJobs.listRecentJobs()).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("returns native-readyz diagnostics without creating runtime jobs", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const nativeReadiness = vi.fn(async () => ({
        artifactKind: "openclaw.native_execution.readiness",
        schemaVersion: "openclaw.native-execution.readiness.v1",
        accepted: true,
        status: "ready",
        runtimeUid: 1000,
        runtimeGid: 1000,
        configPath: "/home/node/.openclaw/config.json5",
        configSnapshotId: "config:test",
        catalogSnapshotId: "catalog-readiness:test",
        runtimeRoots: {
          canonicalSourceRoot: "/repo",
          runtimeWorkspaceDir: "/runtime/workspace",
          transcriptRoot: "/runtime/transcripts",
          artifactRoot: "/runtime/artifacts",
        },
        agentChecks: [],
        assetChecks: [],
        reasonCodes: ["native_execution_ready"],
        nativeDoctorReadOnly: true,
        providerCatalogRefreshed: false,
        runtimeJobCreated: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        secretsStored: false,
      }));
      const rpc = createNativeExecutionRpcServiceForTest({
        runtimeJobs,
        nativeReadiness,
      });

      const result = await rpc.nativeReady({
        actorId: "operator",
        authenticated: true,
        role: "operator",
        sourceRoute: "service",
      });

      expect(result).toMatchObject({
        artifactKind: "openclaw.native_execution.readiness",
        accepted: true,
        status: "ready",
        nativeDoctorReadOnly: true,
        providerCatalogRefreshed: false,
        runtimeJobCreated: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        secretsStored: false,
      });
      expect(nativeReadiness).toHaveBeenCalledTimes(1);
      expect(await runtimeJobs.listRecentJobs()).toHaveLength(0);

      const rejected = await rpc.nativeReady({
        actorId: "anonymous",
        authenticated: false,
        role: "operator",
      });
      expect(rejected).toMatchObject({
        accepted: false,
        status: "not_ready",
        reasonCodes: ["authenticated_operator_required"],
        runtimeJobCreated: false,
      });
      expect(nativeReadiness).toHaveBeenCalledTimes(1);
    } finally {
      await db.close();
    }
  });

  it("pre-gates every known slash command away from execution.submit", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const rpc = createNativeExecutionRpcServiceForTest({
        runtimeJobs,
      });
      for (const command of listKnownProtocolSlashCommands()) {
        const name = command.names[0] ?? command.key;
        const submit = await rpc.submit({
          prompt: `/${name} bounded-arg`,
          auth: { actorId: "operator", authenticated: true, role: "operator" },
        });
        expect(submit.accepted, command.key).toBe(false);
        expect(submit.reasonCodes, command.key).toEqual(
          expect.arrayContaining([
            "protocol_command_bypassed_execution_submit",
            `protocol_command_${command.key}`,
          ]),
        );
      }
      const unknown = await rpc.submit({
        prompt: "/not-a-real-command build this",
        auth: { actorId: "operator", authenticated: true, role: "operator" },
      });
      expect(unknown.accepted).toBe(false);
      expect(unknown.reasonCodes).toEqual(
        expect.arrayContaining(["protocol_command_bypassed_execution_submit"]),
      );
      expect(await runtimeJobs.listRecentJobs()).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("requires the structured front-door router for free-form submit when no legacy fixture is supplied", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const rpc = createNativeExecutionRpcServiceForTest({ runtimeJobs });
      const submit = await rpc.submit({
        prompt: "Have the team fix a small issue.",
        auth: {
          actorId: "operator",
          authenticated: true,
          role: "operator",
          sessionId: "session-1",
        },
      });

      expect(submit.accepted).toBe(false);
      expect(submit.statusCode).toBe(503);
      expect(submit.reasonCodes).toEqual(
        expect.arrayContaining(["structured_model_intent_router_provider_not_configured"]),
      );
      expect(await runtimeJobs.listRecentJobs()).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("routes accepted front-door coding output into a bounded runtime job request", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const routingTelemetryStore = new InMemoryRoutingTelemetryStore();
      const output = createBaseCanonicalRouterOutput({
        route: "workflow_execution",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
        confidence: 0.95,
        objectiveSummary: "Run bounded coding workflow.",
        requestedActions: [
          createCanonicalRouterAction("code_edit", "bounded edit", 0.95),
          createCanonicalRouterAction("test", "focused tests", 0.95),
          createCanonicalRouterAction("review", "review result", 0.95),
          createCanonicalRouterAction("closeout", "closeout", 0.95),
        ],
        requestedAuthority: "local_yolo",
        sideEffectClass: "code_edit",
        riskClass: "medium",
      });
      const rpc = createNativeExecutionRpcServiceForTest({
        runtimeJobs,
        routingTelemetryStore,
        structuredRouterProvider: fixedFrontDoorProvider(output),
      });
      const submit = await rpc.submit({
        prompt: "Use the full team to improve bounded readback.",
        auth: {
          actorId: "operator",
          authenticated: true,
          role: "operator",
          sessionId: "session-1",
        },
        workItemId: "work-item-front-door",
        sourcePromptRef: {
          refKind: "gateway_chat_transcript",
          sessionKey: "agent:main:main",
          sessionId: "session-1",
          runId: "run-front-door",
          sourceRoute: "ux",
          rawPromptStored: false,
        },
      });

      expect(submit.accepted).toBe(true);
      expect(submit.workflowId).toBe("agent_team.coding");
      expect(submit.frontDoorCompiledRequest?.artifactKind).toBe(
        "front_door_compiled_runtime_job_request",
      );
      expect(submit.frontDoorMemoryPolicy?.decision).toBe("runtime_context_refs_only");
      expect(submit.frontDoorSubmitDiagnostics?.map((entry) => entry.phase)).toEqual(
        expect.arrayContaining([
          "submit_started",
          "protocol_pregate_completed",
          "workflow_summary_index_built",
          "conversation_context_built",
          "workflow_candidates_selected",
          "before_router_model_call",
          "after_router_model_call",
          "front_door_request_compiled",
          "native_execution_dispatch_checked",
          "before_native_execution_session_start",
          "after_native_execution_session_start",
          "before_front_door_artifact_attachment",
          "after_front_door_artifact_attachment",
        ]),
      );
      expect(submit.frontDoorSubmitDiagnostics?.[0]?.rawPromptStored).toBe(false);
      expect(submit.frontDoorSubmitDiagnosticsManifest).toMatchObject({
        status: "accepted",
        runtimeJobId: submit.runtimeJobId,
        rawPromptStored: false,
        rawResponseStored: false,
        hiddenReasoningStored: false,
      });
      expect(submit.frontDoorSubmitDiagnosticsManifest?.bodyByteCount).toBeGreaterThan(0);
      expect(submit.frontDoorSubmitDiagnosticsManifest?.manifestJsonByteCount).toBeLessThanOrEqual(
        16 * 1024,
      );
      expect(submit.frontDoorSubmitDiagnosticsManifest?.maxRouterPayloadBytes).toBeGreaterThan(0);
      expect(submit.rawPromptStored).toBe(false);
      expect(submit.workQueueLifecycleMutated).toBe(false);

      const jobs = await runtimeJobs.listRecentJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0]?.payload).toMatchObject({
        artifactKind: "openclaw.accepted_agent_run",
        objective: expect.stringContaining("Run bounded coding workflow."),
        refs: expect.arrayContaining([
          expect.objectContaining({
            ref: "gateway-chat-transcript://session-1/run-front-door",
            kind: "gateway_chat_transcript",
          }),
          expect.objectContaining({
            ref: `runtime-job://${submit.runtimeJobId}/execution/front-door/native-handoff`,
            kind: "front_door_native_handoff",
          }),
        ]),
        rawPromptStored: false,
        rawResponseStored: false,
      });
      expect(jobs[0]?.jobType).toBe(NATIVE_EXECUTION_SESSION_JOB_TYPE);
      expect(submit.sessionId).toBeTruthy();
      expect(submit.agentProfile).toBe("execution-orchestrator");
      expect(submit.nativeExecutionLaunch).toMatchObject({
        status: "not_configured",
        rawPromptStored: false,
        rawResponseStored: false,
      });
      const artifacts = await runtimeJobs.listArtifacts(submit.runtimeJobId ?? "");
      expect(artifacts.map((artifact) => artifact.artifactType)).toEqual(
        expect.arrayContaining([
          "execution.front_door.router_result",
          "execution.front_door.validation",
          "execution.front_door.native_handoff",
          "execution.front_door.compiled_request",
          "execution.front_door.memory_policy",
          "execution.front_door.submit_heap_diagnostics",
        ]),
      );
      const nativeHandoffArtifact = artifacts.find(
        (artifact) => artifact.artifactType === "execution.front_door.native_handoff",
      );
      expect(nativeHandoffArtifact?.metadata).toMatchObject({
        artifactKind: "execution.front_door.native_handoff",
        schemaVersion: "openclaw.front-door.native-handoff.v1",
        rawPromptStored: false,
        rawResponseStored: false,
        routingContext: {
          frontDoorWorkflowHint: "agent_team.coding",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      expect(JSON.stringify(nativeHandoffArtifact?.metadata)).not.toContain("RequirementMap");
      expect(JSON.stringify(nativeHandoffArtifact?.metadata)).not.toContain("SchedulerGraphPatch");
      const diagnosticsArtifact = artifacts.find(
        (artifact) => artifact.artifactType === "execution.front_door.submit_heap_diagnostics",
      );
      expect(diagnosticsArtifact?.storageKind).toBe(RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND);
      expect(diagnosticsArtifact?.metadata).toMatchObject({
        storageKind: RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      });
      const hydratedDiagnostics = diagnosticsArtifact
        ? await runtimeJobs.hydrateJsonPayloadArtifact(diagnosticsArtifact)
        : null;
      expect(hydratedDiagnostics?.body).toMatchObject({
        artifactKind: "execution.front_door.submit_diagnostics_body",
        status: "accepted",
        rawPromptStored: false,
        hiddenReasoningStored: false,
      });
      const telemetry = routingTelemetryStore.list();
      expect(telemetry).toHaveLength(1);
      expect(telemetry[0]?.route).toBe("workflow_execution");
      expect(telemetry[0]?.promptHash).toBeTruthy();
      expect(telemetry[0]?.rawPromptStored).toBe(false);
      expect(telemetry[0]?.rawResponseStored).toBe(false);
      expect(telemetry[0]?.rawProviderLogStored).toBe(false);
    } finally {
      await db.close();
    }
  });

  it("does not run blocked-route repair after the first native route decision", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const blocked = createBaseCanonicalRouterOutput({
        route: "blocked",
        responseMode: "block",
        executeNow: false,
        confidence: 0.82,
        objectiveSummary: "Blocked after misreading guardrails as requested actions.",
        reasonCodes: ["prohibited_constraint_misread"],
      });
      const provider = sequenceFrontDoorProvider([blocked]);
      const rpc = createNativeExecutionRpcServiceForTest({
        runtimeJobs,
        structuredRouterProvider: provider,
      });

      const submit = await rpc.submit({
        prompt:
          "Implement the next bounded platform slice. Do not deploy, send outbound messages, promote models, grant authority, or mutate lifecycle truth.",
        auth: {
          actorId: "operator",
          authenticated: true,
          role: "operator",
          sessionId: "session-1",
        },
      });

      expect(provider.requests).toHaveLength(1);
      expect(submit.accepted).toBe(false);
      expect(submit.runtimeJobId).toBeNull();
      expect(submit.frontDoorSubmitDiagnostics?.map((phase) => phase.phase)).toEqual(
        expect.not.arrayContaining([
          "before_blocked_route_repair_model_call",
          "after_blocked_route_repair_model_call",
        ]),
      );
      expect(submit.frontDoorRouterResult?.output?.route).toBe("blocked");
      expect(submit.frontDoorRouterResult?.metadata.reasonCodes).toEqual(
        expect.not.arrayContaining(["blocked_route_repair_attempted"]),
      );
      expect(await runtimeJobs.listRecentJobs()).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("keeps a blocked route blocked when model-level repair confirms the primary request is prohibited", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const blocked = createBaseCanonicalRouterOutput({
        route: "blocked",
        responseMode: "block",
        executeNow: false,
        confidence: 0.95,
        objectiveSummary: "Primary request asks for direct lifecycle mutation.",
        requestedActions: [createCanonicalRouterAction("work_queue_control", "mark succeeded", 1)],
        reasonCodes: ["direct_lifecycle_mutation_requested"],
      });
      const provider = sequenceFrontDoorProvider([blocked]);
      const rpc = createNativeExecutionRpcServiceForTest({
        runtimeJobs,
        structuredRouterProvider: provider,
      });

      const submit = await rpc.submit({
        prompt: "Mark that runtime job succeeded without runtime evidence.",
        auth: {
          actorId: "operator",
          authenticated: true,
          role: "operator",
          sessionId: "session-1",
        },
      });

      expect(provider.requests).toHaveLength(1);
      expect(submit.accepted).toBe(false);
      expect(submit.reasonCodes).toContain("router_route_blocked");
      expect(await runtimeJobs.listRecentJobs()).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("repairs requested/negated action conflicts with model-level action separation", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const conflicted = createBaseCanonicalRouterOutput({
        route: "workflow_execution",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
        confidence: 0.92,
        objectiveSummary: "Run bounded implementation without deploying.",
        requestedActions: [
          createCanonicalRouterAction("code_edit", "bounded local edit", 0.95),
          createCanonicalRouterAction("deploy", "do not deploy", 0.7),
        ],
        negatedActions: [createCanonicalRouterAction("deploy", "do not deploy", 1)],
        requestedAuthority: "local_yolo",
        sideEffectClass: "code_edit",
      });
      const repaired = createBaseCanonicalRouterOutput({
        route: "workflow_execution",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
        confidence: 0.96,
        objectiveSummary: "Run bounded implementation while preserving the deployment constraint.",
        requestedActions: [
          createCanonicalRouterAction("code_edit", "bounded local edit", 0.96),
          createCanonicalRouterAction("test", "focused validation", 0.95),
          createCanonicalRouterAction("closeout", "bounded closeout", 0.95),
        ],
        negatedActions: [createCanonicalRouterAction("deploy", "do not deploy", 1)],
        requestedAuthority: "local_yolo",
        sideEffectClass: "code_edit",
        reasonCodes: ["action_separation_repaired_constraint_action"],
      });
      const provider = sequenceFrontDoorProvider([conflicted, repaired]);
      const rpc = createNativeExecutionRpcServiceForTest({
        runtimeJobs,
        structuredRouterProvider: provider,
      });

      const submit = await rpc.submit({
        prompt: "Have the team make a bounded local improvement. Do not deploy.",
        auth: {
          actorId: "operator",
          authenticated: true,
          role: "operator",
          sessionId: "session-1",
        },
      });

      expect(provider.requests).toHaveLength(2);
      expect(JSON.stringify(provider.requests[1])).toContain("action_separation_repair_attempted");
      expect(submit.accepted).toBe(true);
      expect(submit.runtimeJobId).toBeTruthy();
      expect(submit.frontDoorSubmitDiagnostics?.map((phase) => phase.phase)).toEqual(
        expect.arrayContaining([
          "before_action_semantics_repair_model_call",
          "after_action_semantics_repair_model_call",
        ]),
      );
      expect(
        submit.frontDoorRouterResult?.output?.requestedActions.map((action) => action.action),
      ).not.toContain("deploy");
      expect(
        submit.frontDoorRouterResult?.output?.negatedActions.map((action) => action.action),
      ).toContain("deploy");
      expect(submit.frontDoorRouterResult?.metadata.reasonCodes).toEqual(
        expect.arrayContaining(["action_separation_repair_attempted"]),
      );
      expect(await runtimeJobs.listRecentJobs()).toHaveLength(1);
    } finally {
      await db.close();
    }
  });

  it("keeps action-separation conflict as clarification when model repair confirms true conflict", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const conflicted = createBaseCanonicalRouterOutput({
        route: "workflow_execution",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
        confidence: 0.7,
        objectiveSummary: "Ambiguous request both asks and forbids deploy.",
        requestedActions: [createCanonicalRouterAction("deploy", "deploy", 0.7)],
        negatedActions: [createCanonicalRouterAction("deploy", "do not deploy", 1)],
        requestedAuthority: "local_yolo",
        sideEffectClass: "production_side_effect",
      });
      const clarified = createBaseCanonicalRouterOutput({
        route: "clarification_required",
        responseMode: "ask_clarification",
        executeNow: false,
        confidence: 0.6,
        objectiveSummary: "Clarify whether deploy is desired or forbidden.",
        ambiguity: {
          ambiguous: true,
          missingInputs: ["deploy_intent"],
          conflictingInstructions: ["deploy", "do not deploy"],
          clarificationQuestion: "Should deployment be skipped or requested under policy?",
        },
        reasonCodes: ["true_requested_negated_action_conflict"],
      });
      const provider = sequenceFrontDoorProvider([conflicted, clarified]);
      const rpc = createNativeExecutionRpcServiceForTest({
        runtimeJobs,
        structuredRouterProvider: provider,
      });

      const submit = await rpc.submit({
        prompt: "Deploy this, but do not deploy it.",
        auth: {
          actorId: "operator",
          authenticated: true,
          role: "operator",
          sessionId: "session-1",
        },
      });

      expect(provider.requests).toHaveLength(2);
      expect(submit.accepted).toBe(false);
      expect(submit.frontDoorClarification?.outcome).toBe("clarification_required");
      expect(submit.reasonCodes).toEqual(
        expect.arrayContaining(["router_route_clarification_required"]),
      );
      expect(await runtimeJobs.listRecentJobs()).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("does not let legacy worker adapter readiness block native-session submit", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const output = createBaseCanonicalRouterOutput({
        route: "workflow_execution",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
        confidence: 0.95,
        objectiveSummary: "Run bounded coding workflow.",
        requestedActions: [createCanonicalRouterAction("code_edit", "bounded edit", 0.95)],
        requestedAuthority: "local_yolo",
        sideEffectClass: "code_edit",
      });
      const rpc = createNativeExecutionRpcServiceForTest({
        runtimeJobs,
        structuredRouterProvider: fixedFrontDoorProvider(output),
      });

      const submit = await rpc.submit({
        prompt: "Have the team make a bounded coding change.",
        auth: {
          actorId: "operator",
          authenticated: true,
          role: "operator",
          sessionId: "session-1",
        },
      });

      expect(submit.accepted).toBe(true);
      expect(submit.statusCode).toBe(202);
      expect(submit.runtimeJobId).toBeTruthy();
      expect(submit.jobType).toBe(NATIVE_EXECUTION_SESSION_JOB_TYPE);
      expect(submit.reasonCodes).toEqual(
        expect.arrayContaining(["native_submit_front_door_native_execution_session_started"]),
      );
      expect(await runtimeJobs.listRecentJobs()).toHaveLength(1);
    } finally {
      await db.close();
    }
  });

  it("keeps legacy worker contract state out of native-session submit", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const output = createBaseCanonicalRouterOutput({
        route: "workflow_execution",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
        confidence: 0.95,
        objectiveSummary: "Run bounded coding workflow.",
        requestedActions: [createCanonicalRouterAction("code_edit", "bounded edit", 0.95)],
        requestedAuthority: "local_yolo",
        sideEffectClass: "code_edit",
      });
      const rpc = createNativeExecutionRpcServiceForTest({
        runtimeJobs,
        structuredRouterProvider: fixedFrontDoorProvider(output),
      });

      const submit = await rpc.submit({
        prompt: "Have the team make a bounded coding change.",
        auth: {
          actorId: "operator",
          authenticated: true,
          role: "operator",
          sessionId: "session-1",
        },
      });

      expect(submit.accepted).toBe(true);
      const artifacts = await runtimeJobs.listArtifacts(submit.runtimeJobId ?? "");
      expect(artifacts.map((artifact) => artifact.artifactType)).not.toContain(
        "execution.worker_contract_state",
      );
      await expect(runtimeJobs.listEvents(submit.runtimeJobId ?? "")).resolves.toEqual(
        expect.not.arrayContaining([
          expect.objectContaining({ eventType: "execution.worker_dispatch_pending" }),
        ]),
      );
    } finally {
      await db.close();
    }
  });

  it("preserves chat, plan-only, and clarification routes without runtime jobs", async () => {
    const cases = [
      createBaseCanonicalRouterOutput({
        route: "chat_response",
        responseMode: "answer_in_chat",
        confidence: 0.99,
        objectiveSummary: "Answer directly.",
      }),
      createBaseCanonicalRouterOutput({
        route: "plan_only",
        responseMode: "create_plan_only",
        confidence: 0.99,
        objectiveSummary: "Return bounded plan only.",
        requestedActions: [createCanonicalRouterAction("plan", "bounded plan", 0.99)],
      }),
      createBaseCanonicalRouterOutput({
        route: "clarification_required",
        responseMode: "ask_clarification",
        confidence: 0.2,
        objectiveSummary: "Clarify target.",
        ambiguity: {
          ambiguous: true,
          missingInputs: ["target"],
          conflictingInstructions: [],
          clarificationQuestion: "Which target should I use?",
        },
      }),
    ];
    for (const output of cases) {
      const db = await createExecutionPlatformPgMemTestDatabase();
      try {
        await applyExecutionPlatformMigrations(db.sql);
        const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
        const rpc = createNativeExecutionRpcServiceForTest({
          runtimeJobs,
          structuredRouterProvider: fixedFrontDoorProvider(output),
        });
        const submit = await rpc.submit({
          prompt: "bounded prompt",
          auth: {
            actorId: "operator",
            authenticated: true,
            role: "operator",
            sessionId: "session-1",
          },
        });

        expect(submit.accepted).toBe(false);
        expect(submit.runtimeJobId).toBeNull();
        expect(submit.rawPromptStored).toBe(false);
        expect(await runtimeJobs.listRecentJobs()).toHaveLength(0);
        if (output.route === "clarification_required") {
          expect(submit.frontDoorClarification?.outcome).toBe("clarification_required");
        }
      } finally {
        await db.close();
      }
    }
  });

  it("front-door submit preserves negation and conditional deploy safety", async () => {
    const blockedSend = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      responseMode: "create_runtime_job",
      executeNow: true,
      workflowId: "agent_team.coding",
      jobType: "executor.agent_team",
      confidence: 0.95,
      objectiveSummary: "Improve outbound readback without sending.",
      requestedActions: [createCanonicalRouterAction("outbound_send", "send notice", 0.8)],
      negatedActions: [createCanonicalRouterAction("outbound_send", "do not send", 1)],
      requestedAuthority: "local_yolo",
      sideEffectClass: "code_edit",
    });
    const deployHeld = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      responseMode: "create_runtime_job",
      executeNow: true,
      workflowId: "agent_team.coding",
      jobType: "executor.agent_team",
      confidence: 0.95,
      objectiveSummary: "Edit and deploy if policy permits.",
      requestedActions: [createCanonicalRouterAction("code_edit", "edit", 0.95)],
      conditionalActions: [createCanonicalRouterAction("deploy", "deploy if policy permits", 0.9)],
      requestedAuthority: "local_yolo",
      sideEffectClass: "code_edit",
    });
    const deployBoundaryConflict = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      responseMode: "create_runtime_job",
      executeNow: true,
      workflowId: "agent_team.coding",
      jobType: "executor.agent_team",
      confidence: 0.95,
      objectiveSummary: "Edit owner-local code while holding deployment boundary.",
      requestedActions: [
        createCanonicalRouterAction("code_edit", "edit", 0.95),
        createCanonicalRouterAction("deploy", "production release", 0.7),
      ],
      negatedActions: [createCanonicalRouterAction("deploy", "deployment boundary", 1)],
      requestedAuthority: "local_yolo",
      sideEffectClass: "code_edit",
    });

    for (const [output, expected] of [
      [blockedSend, "clarification_gate_required"],
      [deployHeld, "native_submit_front_door_native_execution_session_started"],
      [deployBoundaryConflict, "requested_action_conflicts_with_negation:deploy"],
    ] as const) {
      const db = await createExecutionPlatformPgMemTestDatabase();
      try {
        await applyExecutionPlatformMigrations(db.sql);
        const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
        const rpc = createNativeExecutionRpcServiceForTest({
          runtimeJobs,
          structuredRouterProvider: fixedFrontDoorProvider(output),
        });
        const submit = await rpc.submit({
          prompt: "bounded prompt",
          auth: {
            actorId: "operator",
            authenticated: true,
            role: "operator",
            sessionId: "session-1",
          },
        });

        expect(submit.reasonCodes).toContain(expected);
        if (output === blockedSend || output === deployBoundaryConflict) {
          expect(submit.accepted).toBe(false);
          expect(await runtimeJobs.listRecentJobs()).toHaveLength(0);
        } else {
          expect(submit.accepted).toBe(true);
          const compiledActions = submit.frontDoorCompiledRequest?.compiledActions ?? [];
          expect(compiledActions.map((action) => action.action)).toEqual(["code_edit"]);
        }
      } finally {
        await db.close();
      }
    }
  });

  it("front-door submit preserves executor-subject plan boundaries without blocking primary planning work", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const output = createBaseCanonicalRouterOutput({
        route: "workflow_execution",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "agent_team.coding",
        executorWorkflowId: "agent_team.coding",
        jobType: "executor.agent_team",
        confidence: 0.96,
        objectiveSummary:
          "Implement the Product/Spec Planning workflow through the coding executor.",
        requestedActions: [
          createCanonicalRouterAction(
            "plan",
            "Read source specs and plan implementation/proof work through the coding executor.",
            0.95,
          ),
          createCanonicalRouterAction("code_edit", "Implement the workflow upgrade.", 0.95),
          createCanonicalRouterAction("test", "Run focused validation.", 0.95),
        ],
        negatedActions: [
          createCanonicalRouterAction(
            "plan",
            "Do not route the implementation prompt into the incomplete Product/Spec Planning workflow itself as executor.",
            0.99,
          ),
        ],
        constraints: [
          {
            constraintKind: "executor_subject_separation",
            objectSummary:
              "The coding executor implements Product/Spec Planning; the target workflow is subject metadata.",
            confidence: 0.99,
          },
        ],
        subjectWorkflowIds: ["agent_team.product_spec_planning"],
        targetSubjectRefs: [
          {
            targetKind: "workflow",
            targetRef: "agent_team.product_spec_planning",
            confidence: 0.99,
          },
        ],
        requestedAuthority: "local_yolo",
        sideEffectClass: "code_edit",
        reasonCodes: ["invalid_negated_action_repaired_to_constraint_scoped_plan_action"],
      });
      const rpc = createNativeExecutionRpcServiceForTest({
        runtimeJobs,
        structuredRouterProvider: fixedFrontDoorProvider(output),
      });

      const submit = await rpc.submit({
        prompt:
          "Implement Product/Spec Planning through the coding team. Do not route this into Product/Spec Planning itself.",
        auth: {
          actorId: "operator",
          authenticated: true,
          role: "operator",
          sessionId: "session-1",
        },
      });

      expect(submit.accepted).toBe(true);
      expect(submit.reasonCodes).toContain(
        "native_submit_front_door_native_execution_session_started",
      );
      expect(
        submit.frontDoorCompiledRequest?.compiledActions.map((action) => action.action),
      ).toEqual(["plan", "code_edit", "test"]);
      expect(await runtimeJobs.listRecentJobs()).toHaveLength(1);
    } finally {
      await db.close();
    }
  });

  it("front-door submit compiles multi-intent plan and child handoff refs", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const output = createBaseCanonicalRouterOutput({
        route: "multi_workflow_plan",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
        confidence: 0.92,
        objectiveSummary: "Research current docs then implement a bounded change.",
        requestedActions: [
          createCanonicalRouterAction("research", "bounded child research", 0.92),
          createCanonicalRouterAction("code_edit", "bounded implementation", 0.92),
        ],
        requestedAuthority: "local_yolo",
        sideEffectClass: "code_edit",
        childWorkflowRequests: [
          {
            childWorkflowId: "single_agent.web_research",
            requirement: "mandatory",
            reasonCodes: ["research_child_required"],
            requestedAuthority: "outbound_readonly",
            boundedInputSummary: "Verify current docs with bounded citations.",
            rawPromptStored: false,
            rawResponseStored: false,
          },
        ],
        multiIntentPlan: [
          {
            order: 1,
            route: "research_only",
            workflowId: "single_agent.web_research",
            objectiveSummary: "Research bounded current facts.",
            dependsOnStep: null,
            authorityProfile: "outbound_readonly",
          },
          {
            order: 2,
            route: "workflow_execution",
            workflowId: "agent_team.coding",
            objectiveSummary: "Implement after research.",
            dependsOnStep: 1,
            authorityProfile: "local_yolo",
          },
        ],
      });
      const rpc = createNativeExecutionRpcServiceForTest({
        runtimeJobs,
        structuredRouterProvider: fixedFrontDoorProvider(output),
      });
      const submit = await rpc.submit({
        prompt: "Research then implement.",
        auth: {
          actorId: "operator",
          authenticated: true,
          role: "operator",
          sessionId: "session-1",
        },
      });

      expect(submit.accepted).toBe(true);
      expect(submit.frontDoorMultiIntentPlan?.outcome).toBe("compiled");
      const artifacts = await runtimeJobs.listArtifacts(submit.runtimeJobId ?? "");
      expect(artifacts.map((artifact) => artifact.artifactType)).toEqual(
        expect.arrayContaining([
          "execution.front_door.multi_intent_plan",
          "execution.front_door.child_handoffs",
        ]),
      );
      expect(JSON.stringify(artifacts)).not.toContain('rawPromptStored":true');
    } finally {
      await db.close();
    }
  });

  it("does not run executor capability repair after a correct thin router decision", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const codingExecutor = createBaseCanonicalRouterOutput({
        route: "workflow_execution",
        responseMode: "create_runtime_job",
        executeNow: true,
        executorWorkflowId: "agent_team.coding",
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
        confidence: 0.94,
        objectiveSummary: "Implement a production workflow upgrade.",
        requestedCapabilities: [],
        requestedActions: [],
        subjectWorkflowIds: ["agent_team.product_spec_planning"],
        targetSubjectRefs: [
          {
            targetKind: "workflow",
            targetRef: "workflow://agent_team.product_spec_planning",
            confidence: 0.95,
          },
        ],
        sideEffectClass: "code_edit",
        reasonCodes: ["router_primary_outcome:implement_existing_system"],
      });
      const provider = sequenceFrontDoorProvider([codingExecutor]);
      const rpc = createNativeExecutionRpcServiceForTest({
        runtimeJobs,
        structuredRouterProvider: provider,
      });
      const submit = await rpc.submit({
        prompt: "Implement the Product/Spec Planning Production Upgrade.",
        auth: {
          actorId: "operator",
          authenticated: true,
          role: "operator",
          sessionId: "session-1",
        },
      });

      expect(submit.accepted).toBe(true);
      expect(provider.requests).toHaveLength(1);
      expect(submit.workflowId).toBe("agent_team.coding");
      expect(submit.frontDoorCompiledRequest).toMatchObject({
        executorWorkflowId: "agent_team.coding",
        subjectWorkflowIds: ["agent_team.product_spec_planning"],
      });
      const artifacts = await runtimeJobs.listArtifacts(submit.runtimeJobId ?? "");
      expect(JSON.stringify(artifacts)).toContain("workflow://agent_team.product_spec_planning");
    } finally {
      await db.close();
    }
  });

  it("blocks internally consistent routes that violate an intake route contract without rerouting", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const planningRoute = createBaseCanonicalRouterOutput({
        route: "workflow_execution",
        responseMode: "create_runtime_job",
        executeNow: true,
        executorWorkflowId: "agent_team.product_spec_planning",
        workflowId: "agent_team.product_spec_planning",
        jobType: "executor.workflow",
        confidence: 0.94,
        objectiveSummary: "Produce planning artifacts for the Product/Spec workflow.",
        requestedCapabilities: ["plan", "action_graph_proposal", "runtime_job_compile", "closeout"],
        requestedActions: [createCanonicalRouterAction("plan", "produce planning output", 0.94)],
        subjectWorkflowIds: ["agent_team.product_spec_planning"],
        targetSubjectRefs: [
          {
            targetKind: "workflow",
            targetRef: "workflow://agent_team.product_spec_planning",
            confidence: 0.95,
          },
        ],
        requestedAuthority: "local_yolo",
        sideEffectClass: "read_only",
        reasonCodes: ["router_primary_outcome:produce_plan"],
      });
      const provider = sequenceFrontDoorProvider([planningRoute]);
      const rpc = createNativeExecutionRpcServiceForTest({
        runtimeJobs,
        structuredRouterProvider: provider,
      });
      const submit = await rpc.submit({
        prompt: "Execute this proof lane by implementing the Product/Spec workflow.",
        auth: {
          actorId: "operator",
          authenticated: true,
          role: "operator",
          sessionId: "session-1",
        },
        intakeRouteContract: {
          artifactKind: "intake_route_contract",
          schemaVersion: "intent-front-door.intake-route-contract.v1",
          contractId: "test-intake-contract",
          expectedPrimaryOutcomeKinds: ["implement_existing_system", "prove_existing_system"],
          requiredExecutorCapabilities: ["code_edit", "test", "review", "closeout"],
          requiredRequestedActions: ["code_edit", "test", "review", "closeout"],
          expectedSubjectKinds: ["workflow"],
          reasonCodes: ["test_requires_coding_executor_capability_profile"],
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });

      expect(submit.accepted).toBe(false);
      expect(provider.requests).toHaveLength(1);
      expect(JSON.stringify(provider.requests[0])).not.toContain(
        "intake_route_contract_repair_attempted",
      );
      expect(submit.workflowId).toBe("agent_team.product_spec_planning");
      expect(submit.reasonCodes).toEqual(
        expect.arrayContaining([
          "intake_route_contract_primary_outcome_mismatch",
          "intake_route_contract_executor_capability_missing:code_edit",
          "intake_route_contract_executor_capability_missing:test",
        ]),
      );
      expect(submit.frontDoorSubmitDiagnostics?.map((phase) => phase.phase)).not.toEqual(
        expect.arrayContaining([
          "before_intake_route_contract_repair_model_call",
          "after_intake_route_contract_repair_model_call",
        ]),
      );
      expect(await runtimeJobs.listRecentJobs()).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("rejects runtime-backed controls when the linked runtime job is missing", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const workQueue = new WorkQueueRepository(db.sql, runtimeJobs);
      const workItem = await workQueue.createWorkItem({
        workItemId: "work-item-native-missing-runtime",
        itemType: "execution_workflow",
        title: "Native missing runtime control",
      });
      const rpc = createNativeExecutionRpcServiceForTest({
        runtimeJobs,
        workQueue,
      });

      const control = await rpc.applyControl({
        actionKind: "cancel",
        actionId: "native-missing-runtime-cancel",
        workItemId: workItem.workItemId,
        runtimeJobId: "missing-runtime-job",
        auth: { actorId: "operator", authenticated: true, role: "operator" },
      });

      expect(control).toMatchObject({
        accepted: false,
        status: "rejected",
        runtimeBacked: false,
        workQueueLifecycleMutated: false,
        uiMutationAllowed: false,
      });
      expect(control.reasonCodes).toContain("linked_runtime_job_not_found");
      const projection = await rpc.readWorkQueueProjection(workItem.workItemId);
      expect(JSON.stringify(projection)).not.toContain("missing-runtime-job");
    } finally {
      await db.close();
    }
  });

  it("applies cancel controls to runtime job truth instead of only recording UI evidence", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const workQueue = new WorkQueueRepository(db.sql, runtimeJobs);
      const workItem = await workQueue.createWorkItem({
        workItemId: "work-item-native-cancel-runtime",
        itemType: "execution_workflow",
        title: "Native runtime cancel control",
      });
      const job = await runtimeJobs.enqueueJob({
        jobId: "runtime-job-native-cancel",
        jobType: "agent_team.coding",
        queueName: "agent-team",
        workItemId: workItem.workItemId,
        payload: {},
      });
      const rpc = createNativeExecutionRpcServiceForTest({
        runtimeJobs,
        workQueue,
      });

      const control = await rpc.applyControl({
        actionKind: "cancel",
        actionId: "native-runtime-cancel",
        workItemId: workItem.workItemId,
        runtimeJobId: job.jobId,
        auth: { actorId: "operator", authenticated: true, role: "operator" },
      });
      const canceled = await runtimeJobs.getJob(job.jobId);
      const events = await runtimeJobs.listEvents(job.jobId, 20);

      expect(control.accepted).toBe(true);
      expect(canceled?.state).toBe("canceled");
      expect(events.map((event) => event.eventType)).toEqual(
        expect.arrayContaining(["work_queue.execution_action_recorded", "job.canceled"]),
      );
    } finally {
      await db.close();
    }
  });
});
