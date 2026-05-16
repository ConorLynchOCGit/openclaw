import { describe, expect, it } from "vitest";
import { AgentTeamQueuedRunner } from "../codex-bridge/agent-team-queued-runner.ts";
import { closeoutCapsuleToLegacyHumanSummary } from "../codex-bridge/closeout-capsule.ts";
import { WorkflowQueuedRunner } from "../codex-bridge/workflow-queued-runner.ts";
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
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { buildWorkQueueExecutionReadModel } from "../work-queue/execution-read-model.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { buildDefaultWorkflowWorkerAdapterRegistry } from "../workers/index.ts";
import { createModelAuthoredCloseoutCapsuleFixture } from "../workers/test-closeout-capsule-fixture.ts";
import {
  HeuristicIntentRouterProvider,
  type IntentRouterProvider,
} from "./model-assisted-intent-router.ts";
import { NativeExecutionRpcService } from "./native-execution-rpc.ts";

describe("native execution rpc", () => {
  function modelCloseoutReporterFixture() {
    return {
      async createCapsule(input: {
        factualRefs: {
          runtimeJobId: string;
          teamRunId?: string | null;
          workflowId?: string | null;
        };
      }) {
        const capsule = createModelAuthoredCloseoutCapsuleFixture({
          runtimeJobId: input.factualRefs.runtimeJobId,
          teamRunId: input.factualRefs.teamRunId ?? null,
          workflowId: input.factualRefs.workflowId ?? "agent_team.coding",
        });
        return {
          source: "model" as const,
          capsule,
          legacyHumanSummary: closeoutCapsuleToLegacyHumanSummary(capsule),
          reasonCodes: ["fixture_model_closeout_created"],
          rawPromptStored: false as const,
          rawResponseStored: false as const,
          rawProviderLogStored: false as const,
        };
      },
    };
  }

  function legacyTestFixtureProvider() {
    return new HeuristicIntentRouterProvider({
      enabled: true,
      allowHighRiskOrControlRoutes: true,
      fallbackLabel: "test-fixture-legacy-semantic-router",
    });
  }

  function throwingProvider(): IntentRouterProvider {
    return {
      async route() {
        throw new Error("router provider should not be called");
      },
    };
  }

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

  it("pre-gates slash commands, empty prompts, and unauthenticated submits before router calls", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const rpc = new NativeExecutionRpcService({
        runtimeJobs,
        intentRouterProvider: throwingProvider(),
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
      const rpc = new NativeExecutionRpcService({
        runtimeJobs,
        intentRouterProvider: throwingProvider(),
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

  it("pre-gates every known slash command away from execution.submit", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const rpc = new NativeExecutionRpcService({
        runtimeJobs,
        intentRouterProvider: throwingProvider(),
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
      const rpc = new NativeExecutionRpcService({ runtimeJobs });
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
      const rpc = new NativeExecutionRpcService({
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
      expect(submit.rawPromptStored).toBe(false);
      expect(submit.workQueueLifecycleMutated).toBe(false);

      const jobs = await runtimeJobs.listRecentJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0]?.payload).toMatchObject({
        workflowId: "agent_team.coding",
        sourcePromptRef: {
          refKind: "gateway_chat_transcript",
          promptHash: submit.frontDoorCompiledRequest?.promptHash,
          promptLength: "Use the full team to improve bounded readback.".length,
          sessionKey: "agent:main:main",
          sessionId: "session-1",
          runId: "run-front-door",
          sourceRoute: "ux",
          rawPromptStored: false,
        },
        rawPromptStored: false,
        rawResponseStored: false,
        workQueueLifecycleMutated: false,
      });
      const artifacts = await runtimeJobs.listArtifacts(submit.runtimeJobId ?? "");
      expect(artifacts.map((artifact) => artifact.artifactType)).toEqual(
        expect.arrayContaining([
          "execution.front_door.router_result",
          "execution.front_door.validation",
          "execution.front_door.compiled_request",
          "execution.front_door.memory_policy",
        ]),
      );
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

  it("repairs a blocked route with a general model-level constraint review before validation", async () => {
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
      const repaired = createBaseCanonicalRouterOutput({
        route: "workflow_execution",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
        confidence: 0.95,
        objectiveSummary: "Run bounded local implementation with safety constraints.",
        requestedActions: [
          createCanonicalRouterAction("code_edit", "bounded local edit", 0.95),
          createCanonicalRouterAction("test", "focused validation", 0.95),
          createCanonicalRouterAction("closeout", "bounded closeout", 0.95),
        ],
        negatedActions: [
          createCanonicalRouterAction("deploy", "do not deploy", 1),
          createCanonicalRouterAction("outbound_send", "do not send outbound messages", 1),
          createCanonicalRouterAction("model_promotion", "do not promote models", 1),
        ],
        requestedAuthority: "local_yolo",
        sideEffectClass: "code_edit",
        riskClass: "medium",
        reasonCodes: ["blocked_route_repaired_constraint_misread"],
      });
      const provider = sequenceFrontDoorProvider([blocked, repaired]);
      const rpc = new NativeExecutionRpcService({
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

      expect(provider.requests).toHaveLength(2);
      expect(JSON.stringify(provider.requests[1])).toContain("blocked_route_repair_attempted");
      expect(submit.accepted).toBe(true);
      expect(submit.runtimeJobId).toBeTruthy();
      expect(submit.frontDoorRouterResult?.output?.route).toBe("workflow_execution");
      expect(submit.frontDoorRouterResult?.metadata.reasonCodes).toEqual(
        expect.arrayContaining(["blocked_route_repair_attempted"]),
      );
      expect(await runtimeJobs.listRecentJobs()).toHaveLength(1);
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
      const provider = sequenceFrontDoorProvider([blocked, blocked]);
      const rpc = new NativeExecutionRpcService({
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

      expect(provider.requests).toHaveLength(2);
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
      const rpc = new NativeExecutionRpcService({
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
      const rpc = new NativeExecutionRpcService({
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

  it("blocks runtime enqueue when worker adapter contract is not live", async () => {
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
      const rpc = new NativeExecutionRpcService({
        runtimeJobs,
        structuredRouterProvider: fixedFrontDoorProvider(output),
        workerAdapterRegistry: buildDefaultWorkflowWorkerAdapterRegistry({
          generatedAt: "2026-05-08T00:00:00.000Z",
        }),
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

      expect(submit.accepted).toBe(false);
      expect(submit.statusCode).toBe(409);
      expect(submit.runtimeJobId).toBeNull();
      expect(submit.workerContractState).toBe("blocked_no_worker");
      expect(submit.reasonCodes).toEqual(
        expect.arrayContaining(["worker_contract_state_blocked_no_worker_blocks_enqueue"]),
      );
      expect(await runtimeJobs.listRecentJobs()).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("records worker contract state when enqueue is allowed", async () => {
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
      const rpc = new NativeExecutionRpcService({
        runtimeJobs,
        structuredRouterProvider: fixedFrontDoorProvider(output),
        workerAdapterRegistry: buildDefaultWorkflowWorkerAdapterRegistry({
          generatedAt: "2026-05-08T00:00:00.000Z",
          contractStateByWorkflowId: { "agent_team.coding": "shadow" },
          adapterIdByWorkflowId: { "agent_team.coding": "worker.acp-codex.coding" },
        }),
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
      expect(submit.workerContractState).toBe("shadow");
      expect(submit.workerAdapterId).toBe("worker.acp-codex.coding");
      const artifacts = await runtimeJobs.listArtifacts(submit.runtimeJobId ?? "");
      expect(artifacts.map((artifact) => artifact.artifactType)).toContain(
        "execution.worker_contract_state",
      );
      await expect(runtimeJobs.listEvents(submit.runtimeJobId ?? "")).resolves.toEqual(
        expect.arrayContaining([
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
        const rpc = new NativeExecutionRpcService({
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
      [blockedSend, "requested_and_negated_action_conflict"],
      [deployHeld, "native_submit_front_door_job_enqueued"],
      [deployBoundaryConflict, "side_effect_boundary_conflict_suppressed_by_primary_work"],
    ] as const) {
      const db = await createExecutionPlatformPgMemTestDatabase();
      try {
        await applyExecutionPlatformMigrations(db.sql);
        const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
        const rpc = new NativeExecutionRpcService({
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
        if (output === blockedSend) {
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
      const rpc = new NativeExecutionRpcService({
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

  it("submits natural language through intent router and rejects legacy agent-team dispatch without dynamic scheduler dependencies", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const workQueue = new WorkQueueRepository(db.sql, runtimeJobs);
      const workItem = await workQueue.createWorkItem({
        workItemId: "work-item-native-exec",
        itemType: "execution_workflow",
        title: "Native execution workflow",
      });
      const rpc = new NativeExecutionRpcService({
        runtimeJobs,
        workQueue,
        intentRouterProvider: legacyTestFixtureProvider(),
      });
      const submit = await rpc.submit({
        prompt: "Have the coding team add a small regression test and close it out.",
        auth: { actorId: "operator", authenticated: true, role: "operator" },
        workItemId: workItem.workItemId,
      });
      expect(submit.accepted).toBe(true);
      expect(submit.workflowId).toBe("agent_team.coding");
      expect(submit.jobType).toBe("executor.agent_team");
      expect(submit.runtimeJobId).toBeTruthy();
      expect(submit.rawPromptStored).toBe(false);

      const runner = new AgentTeamQueuedRunner({
        runtimeJobs,
        workerId: "agent-team-worker",
        queueName: "agent-team",
        closeoutReporter: modelCloseoutReporterFixture(),
      });
      const run = await runner.runOnce();
      expect(run.completed).toBe(false);
      expect(run.failed).toBe(true);
      expect(run.failure?.message).toContain("dynamic_runtime_work_graph_required");

      const readModel = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: workItem.workItemId,
      });
      expect(readModel.runtimeJobs[0]?.workflow.workflowId).toBe("agent_team.coding");
      expect(readModel.runtimeJobs[0]?.workflow.workQueueLifecycleMutationAllowed).toBe(false);
      expect(readModel.runtimeJobs[0]?.runtimeJobState).not.toBe("succeeded");
      const closeout = await rpc.readCloseout(submit.runtimeJobId ?? "");
      expect(closeout).toMatchObject({
        closeoutRefs: [],
        closeoutCapsule: null,
        humanCloseoutSummary: null,
      });
    } finally {
      await db.close();
    }
  });

  it("rejects unsafe prompts without runtime lifecycle mutation", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const rpc = new NativeExecutionRpcService({
        runtimeJobs,
        intentRouterProvider: legacyTestFixtureProvider(),
      });
      const submit = await rpc.submit({
        prompt: "Deploy this to production.",
        auth: { actorId: "operator", authenticated: true, role: "operator" },
      });
      expect(submit.accepted).toBe(false);
      expect(submit.runtimeJobId).toBeNull();
      expect(submit.reasonCodes).toContain("production_deploy_locked");
      expect(submit.workQueueLifecycleMutated).toBe(false);
    } finally {
      await db.close();
    }
  });

  it("submits web research through generic workflow dispatch and applies native controls", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const workQueue = new WorkQueueRepository(db.sql, runtimeJobs);
      const workItem = await workQueue.createWorkItem({
        workItemId: "work-item-native-research",
        itemType: "execution_workflow",
        title: "Native research workflow",
      });
      const rpc = new NativeExecutionRpcService({
        runtimeJobs,
        workQueue,
        intentRouterProvider: legacyTestFixtureProvider(),
      });
      const submit = await rpc.submit({
        prompt: "Research current OpenAI structured output docs.",
        auth: { actorId: "operator", authenticated: true, role: "operator" },
        workItemId: workItem.workItemId,
      });
      expect(submit.accepted).toBe(true);
      expect(submit.workflowId).toBe("single_agent.web_research");
      expect(submit.runtimeJobId).toBeTruthy();
      if (!submit.runtimeJobId) {
        throw new Error("research runtime job id missing");
      }
      const control = await rpc.applyControl({
        actionKind: "retry",
        actionId: "native-research-retry",
        workItemId: workItem.workItemId,
        runtimeJobId: submit.runtimeJobId,
        auth: { actorId: "operator", authenticated: true, role: "operator" },
      });
      expect(control.accepted).toBe(true);
      const runner = new WorkflowQueuedRunner({
        runtimeJobs,
        workerId: "generic-workflow-worker",
        queueName: "agent-team",
        closeoutReporter: modelCloseoutReporterFixture(),
      });
      const run = await runner.runOnce();
      expect(run.completed).toBe(true);
      expect(run.workflowId).toBe("single_agent.web_research");
      const projection = await rpc.readWorkQueueProjection(workItem.workItemId);
      expect(JSON.stringify(projection)).toContain("single_agent.web_research");
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
      const rpc = new NativeExecutionRpcService({
        runtimeJobs,
        workQueue,
        intentRouterProvider: legacyTestFixtureProvider(),
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
      const rpc = new NativeExecutionRpcService({
        runtimeJobs,
        workQueue,
        intentRouterProvider: legacyTestFixtureProvider(),
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
