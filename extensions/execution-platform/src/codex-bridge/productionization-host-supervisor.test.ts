import { createServer } from "node:http";
import { Readable, Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { buildWorkQueueExecutionReadModel } from "../work-queue/execution-read-model.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { HumanOperatorTaskAdapter } from "../workflows/human-operator-task-adapter.ts";
import { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import {
  createExecutionPlatformHostRoutes,
  createProductionSupervisorConfig,
  handleExecutionPlatformDbWorkQueueHostRoute,
  handleExecutionPlatformQueueRunnerHostRoute,
  handleExecutionPlatformWorkQueueControlHostRoute,
  preflightAcpBridgeEndpoint,
  ProductionSupervisor,
  runAcpBridgeRealEndpointPilot,
  runAcpEndpointSetupPreflight,
  runAcpBridgeLoopbackPilot,
  runDeployNonProductionDryRunPilot,
  runModelPromotionRealEvalDryRunPilot,
  runOutboundStagedReadonlyPilot,
  setupApprovedLocalAcpEndpoint,
} from "./index.ts";
import { CODEX_BRIDGE_JOB_TYPE } from "./types.ts";

async function withRuntimeHarness<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    runtimeWorkGraphs: RuntimeWorkGraphRepository;
    workQueue: WorkQueueRepository;
    setNow: (next: Date) => void;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  let now = new Date("2026-05-03T12:00:00.000Z");
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => now,
      maxArtifactMetadataBytes: 256 * 1024,
    });
    const runtimeWorkGraphs = new RuntimeWorkGraphRepository(database.sql, {
      now: () => now,
    });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, {
      now: () => now,
    });
    return await work({
      runtimeJobs,
      runtimeWorkGraphs,
      workQueue,
      setNow(next) {
        now = next;
      },
    });
  } finally {
    await database.close();
  }
}

function bridgePayload() {
  return {
    family: "codex_bridge",
    executorKind: "codex_cli",
    executionMode: "fake_stream_proof",
    prompt: {},
    trustPolicy: {},
    autobailoutPolicy: {},
    supervisor: {},
    environment: {},
    workQueueLink: { workItemId: "work-item-host-supervisor" },
  };
}

class FakeRequest extends Readable {
  method = "POST";
  url = "/";

  constructor(private readonly body: unknown) {
    super();
  }

  override _read(): void {
    this.push(JSON.stringify(this.body));
    this.push(null);
  }
}

class FakeResponse extends Writable {
  statusCode = 200;
  headers = new Map<string, string | number | readonly string[]>();
  body = "";

  setHeader(name: string, value: string | number | readonly string[]): this {
    this.headers.set(name, value);
    return this;
  }

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
    callback();
  }

  override end(cb?: () => void): this;
  override end(chunk: unknown, cb?: () => void): this;
  override end(chunk: unknown, encoding: BufferEncoding, cb?: () => void): this;
  override end(
    chunkOrCallback?: unknown,
    encodingOrCallback?: BufferEncoding | (() => void),
    callback?: () => void,
  ): this {
    const chunk = typeof chunkOrCallback === "function" ? undefined : chunkOrCallback;
    if (chunk !== undefined && chunk !== null) {
      this.body +=
        typeof chunk === "string"
          ? chunk
          : Buffer.isBuffer(chunk) || chunk instanceof Uint8Array
            ? Buffer.from(chunk).toString("utf8")
            : JSON.stringify(chunk);
    }
    this.emit("finish");
    const done =
      typeof chunkOrCallback === "function"
        ? chunkOrCallback
        : typeof encodingOrCallback === "function"
          ? encodingOrCallback
          : callback;
    done?.();
    return this;
  }

  json(): unknown {
    return JSON.parse(this.body);
  }
}

async function callRoute(
  handler: (req: FakeRequest, res: FakeResponse) => Promise<boolean>,
  body: unknown,
): Promise<{ statusCode: number; json: unknown }> {
  const req = new FakeRequest(body);
  const res = new FakeResponse();
  await handler(req, res);
  return { statusCode: res.statusCode, json: res.json() };
}

describe("Execution Platform host routes and supervisor productionization", () => {
  it("wires host routes for queue runner and Work Queue controls with auth", async () => {
    await withRuntimeHarness(async ({ runtimeJobs }) => {
      await runtimeJobs.enqueueJob({
        jobId: "host-route-bridge-job",
        jobType: CODEX_BRIDGE_JOB_TYPE,
        queueName: "host-routes",
        payload: bridgePayload(),
      });
      const routes = createExecutionPlatformHostRoutes({ runtimeJobs });
      expect(routes.map((route) => route.path)).toEqual(
        expect.arrayContaining([
          "/api/execution-platform/queue-runner/run-once",
          "/api/execution-platform/work-queue/list",
          "/api/execution-platform/work-queue/detail",
          "/api/execution-platform/work-queue/delta",
          "/api/execution-platform/work-queue/human-response",
          "/api/execution-platform/work-queue/execution-control/pause",
          "/api/execution-platform/work-queue/execution-control/redirect",
          "/api/execution-platform/work-queue/execution-control/cancel",
        ]),
      );
      expect(routes.every((route) => typeof route.handler === "function")).toBe(true);
      expect(routes.every((route) => route.auth === "gateway")).toBe(true);
      expect(routes.every((route) => route.gatewayRuntimeScopeSurface === "trusted-operator")).toBe(
        true,
      );
      expect(routes.every((route) => route.match === "exact")).toBe(true);

      const rejected = await callRoute(
        (req, res) =>
          handleExecutionPlatformQueueRunnerHostRoute(req as never, res as never, { runtimeJobs }),
        { auth: { actorId: "", role: "operator", authenticated: false }, dryRun: true },
      );
      expect(rejected.statusCode).toBe(401);

      const dryRun = await callRoute(
        (req, res) =>
          handleExecutionPlatformQueueRunnerHostRoute(req as never, res as never, { runtimeJobs }),
        {
          auth: { actorId: "operator", role: "operator", authenticated: true },
          workerId: "host-route-worker",
          queueName: "host-routes",
          dryRun: true,
        },
      );
      expect(dryRun.statusCode).toBe(200);
      expect(JSON.stringify(dryRun.json)).toContain("host-route-bridge-job");

      const nativeRunBlocked = await callRoute(
        (req, res) =>
          handleExecutionPlatformQueueRunnerHostRoute(req as never, res as never, { runtimeJobs }),
        {
          auth: { actorId: "operator", role: "operator", authenticated: true },
          nativeWorkflowRunOnce: true,
          runtimeJobId: "host-route-bridge-job",
        },
      );
      expect(nativeRunBlocked.statusCode).toBe(409);
      expect(JSON.stringify(nativeRunBlocked.json)).toContain(
        "gateway_worker_run_once_disabled_by_enqueue_only_boundary",
      );

      await runtimeJobs.enqueueJob({
        jobId: "host-route-agent-team-native-job",
        jobType: "executor.agent_team",
        queueName: "agent-team",
        payload: { workflowId: "agent_team.coding" },
      });
      const configuredNativeRun = await callRoute(
        (req, res) =>
          handleExecutionPlatformQueueRunnerHostRoute(req as never, res as never, {
            runtimeJobs,
            agentTeamRuntimeRunOnce: async ({ runtimeJobId, workerId }) => ({
              claimed: true,
              completed: false,
              failed: true,
              status: "failed",
              runtimeJobId,
              teamRunId: "team-run-host-route-agent-team-native-job",
              workflowId: "agent_team.coding",
              workerId,
              reasonCodes: ["configured_gateway_agent_team_supervisor_used"],
            }),
          }),
        {
          auth: { actorId: "operator", role: "operator", authenticated: true },
          nativeWorkflowRunOnce: true,
          gatewayWorkerRunOnceProofMode: true,
          runtimeJobId: "host-route-agent-team-native-job",
        },
      );
      expect(configuredNativeRun.statusCode).toBe(200);
      expect(JSON.stringify(configuredNativeRun.json)).toContain(
        "configured_gateway_agent_team_supervisor_used",
      );
      expect(JSON.stringify(configuredNativeRun.json)).toContain(
        "team-run-host-route-agent-team-native-job",
      );

      const unconfiguredNativeRun = await callRoute(
        (req, res) =>
          handleExecutionPlatformQueueRunnerHostRoute(req as never, res as never, { runtimeJobs }),
        {
          auth: { actorId: "operator", role: "operator", authenticated: true },
          nativeWorkflowRunOnce: true,
          gatewayWorkerRunOnceProofMode: true,
          runtimeJobId: "host-route-agent-team-native-job",
        },
      );
      expect(unconfiguredNativeRun.statusCode).toBe(409);
      expect(JSON.stringify(unconfiguredNativeRun.json)).toContain(
        "configured_agent_team_supervisor_required",
      );

      const pause = await callRoute(
        (req, res) =>
          handleExecutionPlatformWorkQueueControlHostRoute("pause", req as never, res as never, {
            runtimeJobs,
          }),
        {
          auth: { actorId: "operator", role: "operator", authenticated: true },
          runtimeJobId: "host-route-bridge-job",
          sessionId: "session-host-route",
          reason: "pause through host route",
        },
      );
      expect(pause.statusCode).toBe(200);
      expect(JSON.stringify(pause.json)).toContain("pause");
    });
  });

  it("serves DB-backed Work Queue list/detail/delta and human resume routes", async () => {
    await withRuntimeHarness(async ({ runtimeJobs, runtimeWorkGraphs, workQueue }) => {
      const item = await workQueue.createWorkItem({
        workItemId: "host-route-db-work-item",
        itemType: "execution_workflow",
        title: "DB route work item",
        description: "Work Queue DB list/detail proof",
      });
      const job = await runtimeJobs.enqueueJob({
        jobId: "host-route-db-runtime-job",
        jobType: "executor.agent_team",
        workItemId: item.workItemId,
        payload: { workflowId: "agent_team.coding" },
      });
      await workQueue.createWorkRun({
        workItemId: item.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: job.jobId,
        runState: "running",
      });
      const graph = await runtimeWorkGraphs.createGraph({
        graphId: "host-route-db-graph",
        parentWorkItemId: item.workItemId,
        rootRuntimeJobId: job.jobId,
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
      });
      const human = await new HumanOperatorTaskAdapter(runtimeWorkGraphs).createTask({
        graphId: graph.graphId,
        operatorId: "owner:local",
        promptSummary: "Choose bounded test scope",
        requiredResponseShape: { type: "object" },
        blockingNodeRefs: [`runtime-work-graph://${graph.graphId}`],
      });
      await workQueue.syncRuntimeGraphNodeToWorkQueue({
        parentWorkItemId: item.workItemId,
        graphId: graph.graphId,
        nodeId: human.node.nodeId,
        nodeKind: "human_task",
        assignedRole: "human_operator",
        assignedWorkflow: "human/operator",
        queueStatus: "blocked",
        humanTaskId: human.humanTask.humanTaskId,
      });

      const dependencies = { runtimeJobs, runtimeWorkGraphs, workQueue };
      const list = await callRoute(
        (req, res) =>
          handleExecutionPlatformDbWorkQueueHostRoute(
            "list",
            req as never,
            res as never,
            dependencies,
          ),
        { bucket: "active" },
      );
      const detail = await callRoute(
        (req, res) =>
          handleExecutionPlatformDbWorkQueueHostRoute(
            "detail",
            req as never,
            res as never,
            dependencies,
          ),
        { workItemId: item.workItemId },
      );
      const resumed = await callRoute(
        (req, res) =>
          handleExecutionPlatformDbWorkQueueHostRoute(
            "human-response",
            req as never,
            res as never,
            dependencies,
          ),
        {
          parentWorkItemId: item.workItemId,
          graphId: graph.graphId,
          humanTaskId: human.humanTask.humanTaskId,
          boundedResponseRef: "owner-decision://host-route-db-work-item/resume",
        },
      );

      expect(list.statusCode).toBe(200);
      expect(JSON.stringify(list.json)).toContain("execution_platform_work_queue_db");
      expect(JSON.stringify(list.json)).toContain(item.workItemId);
      expect(detail.statusCode).toBe(200);
      expect(JSON.stringify(detail.json)).toContain("DB route work item");
      expect(JSON.stringify(detail.json)).toContain("runtimeJobIds");
      expect(resumed.statusCode).toBe(200);
      expect(JSON.stringify(resumed.json)).toContain("db_work_queue_human_response_result");
      const childTruth = await workQueue.readWorkItemTruth(
        `runtime-graph:${graph.graphId}:${human.node.nodeId}`,
      );
      expect(childTruth?.item.queueStatus).toBe("closed");
    });
  });

  it("implements a disabled-by-default supervisor with run-once parity and stale recovery", async () => {
    await withRuntimeHarness(async ({ runtimeJobs, setNow }) => {
      await runtimeJobs.enqueueJob({
        jobId: "supervisor-job",
        jobType: CODEX_BRIDGE_JOB_TYPE,
        queueName: "supervisor",
        payload: bridgePayload(),
      });
      const disabled = new ProductionSupervisor(
        runtimeJobs,
        createProductionSupervisorConfig({
          enabled: false,
          operatorKillSwitch: false,
          queueName: "supervisor",
        }),
      );
      expect((await disabled.runBounded()).refused).toBe(true);

      const supervisor = new ProductionSupervisor(
        runtimeJobs,
        createProductionSupervisorConfig({
          enabled: true,
          operatorKillSwitch: false,
          queueName: "supervisor",
          maxJobsPerInvocation: 1,
        }),
      );
      const run = await supervisor.runBounded();
      expect(run.started).toBe(true);
      expect(run.completedJobIds).toEqual(["supervisor-job"]);
      expect(run.daemonStarted).toBe(false);

      await runtimeJobs.enqueueJob({
        jobId: "supervisor-stale-job",
        jobType: CODEX_BRIDGE_JOB_TYPE,
        queueName: "supervisor",
        payload: bridgePayload(),
        leaseTimeoutMs: 10,
      });
      await runtimeJobs.claimNextJob({
        workerId: "stale-worker",
        queueName: "supervisor",
        jobTypes: [CODEX_BRIDGE_JOB_TYPE],
      });
      setNow(new Date("2026-05-03T12:00:01.000Z"));
      const recovered = await supervisor.runBounded();
      expect(recovered.recoveredJobIds).toContain("supervisor-stale-job");
    });
  });

  it("runs ACP endpoint preflight and records endpoint-unavailable without false success", async () => {
    await withRuntimeHarness(async ({ runtimeJobs, workQueue }) => {
      await workQueue.createWorkItem({
        workItemId: "work-item-host-supervisor",
        itemType: "build_plan",
        title: "ACP endpoint proof",
        description: "Runtime read model proof",
      });
      await runtimeJobs.enqueueJob({
        jobId: "acp-real-endpoint-job",
        jobType: CODEX_BRIDGE_JOB_TYPE,
        queueName: "acp-real",
        payload: bridgePayload(),
        workItemId: "work-item-host-supervisor",
      });
      await workQueue.createWorkRun({
        runId: "acp-real-endpoint-run",
        workItemId: "work-item-host-supervisor",
        executorKind: "runtime_job",
        runtimeJobId: "acp-real-endpoint-job",
        runState: "pending",
      });
      const unavailable = await preflightAcpBridgeEndpoint({ env: {} });
      expect(unavailable.endpointAvailable).toBe(false);
      const result = await runAcpBridgeLoopbackPilot({
        runtimeJobs,
        preflight: unavailable,
        request: {
          artifactKind: "acp_bridge_transport_request",
          requestId: "acp-real-endpoint-request",
          runtimeJobId: "acp-real-endpoint-job",
          sessionId: "acp-session",
          mode: "live_ready_adapter",
          objective: "ACP real endpoint readiness proof",
          authorityProfileId: "trusted-local-yolo-v1",
          providerDirectCallMade: false,
          deployPerformed: false,
          outboundSendingPerformed: false,
          modelPromotionPerformed: false,
        },
      });
      expect(result.limitation).toContain("real ACP endpoint unavailable");
      const readModel = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: "work-item-host-supervisor",
      });
      expect(readModel.runtimeJobs[0]?.artifactRefs.length).toBeGreaterThan(0);
    });
  });

  it("sets up ACP/Codex preflight from Codex auth without faking real endpoint success", async () => {
    await withRuntimeHarness(async ({ runtimeJobs }) => {
      await runtimeJobs.enqueueJob({
        jobId: "acp-codex-setup-job",
        jobType: CODEX_BRIDGE_JOB_TYPE,
        queueName: "acp-setup",
        payload: bridgePayload(),
      });
      const report = await runAcpEndpointSetupPreflight({
        reportId: "test-acp-codex-setup",
        createdAt: "2026-05-03T12:10:00.000Z",
        env: {},
        codexHome: "/tmp/codex-home-without-auth",
        runtimeJobs,
        runtimeJobId: "acp-codex-setup-job",
      });

      expect(report.fakeSuccessClaimed).toBe(false);
      expect(report.status).toBe("codex_auth_missing");
      expect(report.exactMissingValues).toEqual(
        expect.arrayContaining([
          "OPENCLAW_ACP_ENDPOINT_URL",
          "CODEX_HOME/auth.json with OpenAI Codex credentials",
        ]),
      );
      expect(JSON.stringify(report)).not.toContain("sk-");
    });
  });

  it("reports exact missing ACP endpoint when Codex auth is present", async () => {
    const codexHome = await import("node:fs/promises").then(async (fs) => {
      const os = await import("node:os");
      const path = await import("node:path");
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-codex-auth-"));
      await fs.writeFile(
        path.join(dir, "auth.json"),
        JSON.stringify({
          auth_mode: "apikey",
          OPENAI_API_KEY: "redacted-test-key",
        }),
      );
      await fs.writeFile(path.join(dir, "config.toml"), 'model = "redacted"\n');
      return dir;
    });

    const report = await runAcpEndpointSetupPreflight({
      reportId: "test-codex-auth-present",
      createdAt: "2026-05-03T12:11:00.000Z",
      env: {},
      codexHome,
    });

    expect(report.status).toBe("codex_auth_present_but_acp_endpoint_missing");
    expect(report.setupCandidate.codexAuth.authJsonPresent).toBe(true);
    expect(report.setupCandidate.codexAuth.credentialKinds).toEqual(
      expect.arrayContaining(["openai_api_key", "auth_mode:apikey"]),
    );
    expect(report.exactMissingValues).toContain("OPENCLAW_ACP_ENDPOINT_URL");
    expect(report.setupCandidate.codexAuth.secretValuesStored).toBe(false);
    expect(JSON.stringify(report)).not.toContain("redacted-test-key");
  });

  it("accepts configured ACP endpoint only when endpoint probe passes", async () => {
    const unavailable = await runAcpEndpointSetupPreflight({
      reportId: "test-acp-probe-failed",
      createdAt: "2026-05-03T12:12:00.000Z",
      endpointUrl: "http://127.0.0.1:65535/acp",
      codexAuth: {
        artifactKind: "acp_codex_auth_discovery",
        codexHome: "/tmp/codex",
        authJsonPresent: true,
        configTomlPresent: true,
        credentialKinds: ["openai_api_key"],
        authMode: "apikey",
        secretValuesRead: false,
        secretValuesStored: false,
      },
      probe: () => false,
    });
    expect(unavailable.status).toBe("acp_endpoint_unavailable");
    expect(unavailable.exactMissingValues).toEqual([]);
    expect(unavailable.endpointPreflight.blockingReasons).toContain("acp_endpoint_probe_failed");

    const available = await runAcpEndpointSetupPreflight({
      reportId: "test-acp-probe-passed",
      createdAt: "2026-05-03T12:13:00.000Z",
      endpointUrl: "http://127.0.0.1:65535/acp",
      codexAuth: {
        artifactKind: "acp_codex_auth_discovery",
        codexHome: "/tmp/codex",
        authJsonPresent: true,
        configTomlPresent: true,
        credentialKinds: ["openai_api_key"],
        authMode: "apikey",
        secretValuesRead: false,
        secretValuesStored: false,
      },
      probe: () => true,
    });
    expect(available.status).toBe("ready_for_real_acp_endpoint_run");
    expect(available.fakeSuccessClaimed).toBe(false);
    expect(available.exactMissingValues).toEqual([]);
  });

  it("sets up a local ACP endpoint only when the gateway probe passes or approved start succeeds", async () => {
    const missing = await setupApprovedLocalAcpEndpoint({
      reportId: "test-local-acp-missing",
      createdAt: "2026-05-03T12:14:00.000Z",
      env: { OPENCLAW_GATEWAY_PORT: "28789" },
      healthProbe: () => ({ ok: false, summary: "gateway stopped" }),
    });
    expect(missing.endpointReady).toBe(false);
    expect(missing.exactMissingValues).toEqual([
      "OPENCLAW_ACP_ENDPOINT_URL or running local OpenClaw gateway",
    ]);
    expect(missing.fakeSuccessClaimed).toBe(false);

    const started = await setupApprovedLocalAcpEndpoint({
      reportId: "test-local-acp-started",
      createdAt: "2026-05-03T12:15:00.000Z",
      env: { OPENCLAW_GATEWAY_PORT: "28789" },
      startApproved: true,
      startLocalGateway: async (endpointUrl) => ({
        started: true,
        endpointUrl,
        summary: "test starter started local gateway",
      }),
      healthProbe: (() => {
        let attempts = 0;
        return () => {
          attempts += 1;
          return { ok: attempts > 1, summary: attempts > 1 ? "gateway health ok" : "stopped" };
        };
      })(),
    });
    expect(started.endpointReady).toBe(true);
    expect(started.setupAction).toBe("started_approved_local_gateway");
    expect(started.recommendedEnv.OPENCLAW_ACP_ENDPOINT_URL).toBe("ws://127.0.0.1:28789");
  });

  it("runs real ACP endpoint pilot only after endpoint preflight passes and surfaces readiness", async () => {
    await withRuntimeHarness(async ({ runtimeJobs, workQueue }) => {
      await workQueue.createWorkItem({
        workItemId: "work-item-acp-real",
        itemType: "build_plan",
        title: "Real ACP endpoint proof",
        description: "Runtime read model ACP proof",
      });
      await runtimeJobs.enqueueJob({
        jobId: "acp-real-proof-job",
        jobType: CODEX_BRIDGE_JOB_TYPE,
        queueName: "acp-real",
        payload: bridgePayload(),
        workItemId: "work-item-acp-real",
      });
      await workQueue.createWorkRun({
        runId: "acp-real-proof-run",
        workItemId: "work-item-acp-real",
        executorKind: "runtime_job",
        runtimeJobId: "acp-real-proof-job",
        runState: "pending",
      });
      const unavailable = await preflightAcpBridgeEndpoint({
        endpointUrl: "ws://127.0.0.1:28789",
        probe: () => false,
      });
      await expect(
        runAcpBridgeRealEndpointPilot({
          runtimeJobs,
          preflight: unavailable,
          endpointHealthSummary: { ok: false },
          request: {
            artifactKind: "acp_bridge_transport_request",
            requestId: "acp-real-blocked-request",
            runtimeJobId: "acp-real-proof-job",
            sessionId: "acp-session",
            mode: "real_endpoint",
            objective: "ACP real endpoint readiness proof",
            authorityProfileId: "trusted-local-yolo-v1",
            providerDirectCallMade: false,
            deployPerformed: false,
            outboundSendingPerformed: false,
            modelPromotionPerformed: false,
          },
        }),
      ).rejects.toThrow(/passing endpoint preflight/);

      const available = await preflightAcpBridgeEndpoint({
        endpointUrl: "ws://127.0.0.1:28789",
        probe: () => true,
      });
      const result = await runAcpBridgeRealEndpointPilot({
        runtimeJobs,
        preflight: available,
        endpointHealthSummary: { ok: true, source: "test-gateway-health" },
        request: {
          artifactKind: "acp_bridge_transport_request",
          requestId: "acp-real-request",
          runtimeJobId: "acp-real-proof-job",
          sessionId: "acp-session",
          mode: "real_endpoint",
          objective: "ACP real endpoint readiness proof",
          authorityProfileId: "trusted-local-yolo-v1",
          providerDirectCallMade: false,
          deployPerformed: false,
          outboundSendingPerformed: false,
          modelPromotionPerformed: false,
        },
      });
      expect(result.mode).toBe("real_endpoint");
      expect(result.limitation).toBeNull();
      const readModel = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: "work-item-acp-real",
      });
      expect(readModel.runtimeJobs[0]?.authorityStatuses).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ artifactType: "acp_bridge.real_endpoint_preflight" }),
          expect.objectContaining({ artifactType: "acp_bridge.pilot_result" }),
        ]),
      );
    });
  });

  it("runs staged outbound, non-production deploy dry-run, and model promotion eval dry-run proofs", async () => {
    await withRuntimeHarness(async ({ runtimeJobs }) => {
      await runtimeJobs.enqueueJob({
        jobId: "authority-realish-job",
        jobType: CODEX_BRIDGE_JOB_TYPE,
        queueName: "authority-realish",
        payload: bridgePayload(),
      });
      const server = createServer((_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, token: "sk-redactedexamplevalue" }));
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      try {
        const address = server.address();
        const port = typeof address === "object" && address ? address.port : 0;
        const outbound = await runOutboundStagedReadonlyPilot({
          runtimeJobs,
          runtimeJobId: "authority-realish-job",
          endpointUrl: `http://127.0.0.1:${port}/status`,
        });
        expect(outbound.status).toBe("completed");
        expect(outbound.realExternalWriteOrSendPerformed).toBe(false);
        expect(outbound.responseSummary).toContain("[redacted]");
      } finally {
        server.close();
      }

      const deploy = await runDeployNonProductionDryRunPilot({
        runtimeJobs,
        runtimeJobId: "authority-realish-job",
        targetEnvironment: "staging",
        dryRunCommand: "deploy --dry-run",
      });
      expect(deploy.status).toBe("completed");
      expect(deploy.realDeployPerformed).toBe(false);

      const promotion = await runModelPromotionRealEvalDryRunPilot({
        runtimeJobs,
        runtimeJobId: "authority-realish-job",
        evalEvidenceRefs: [".artifacts/execution-platform/productionization-10-step-summary.json"],
      });
      expect(["completed", "insufficient_eval_evidence"]).toContain(promotion.status);
      expect(promotion.productionPromotionPerformed).toBe(false);
    });
  });

  it("keeps Work Queue execution actions server-truth backed and lifecycle read-only", async () => {
    const calls: string[] = [];
    const { createWorkQueueExecutionActionCallbacks } =
      await import("../../../../ui/src/ui/work-queue.ts");
    const callbacks = createWorkQueueExecutionActionCallbacks({
      pause: ({ object }) => calls.push(`pause:${object.id}`),
      redirect: ({ object, reason }) => calls.push(`redirect:${object.id}:${reason}`),
      cancel: ({ object }) => calls.push(`cancel:${object.id}`),
    });
    const object = {
      id: "work-object",
      execution: { sessionId: "session-actions" },
    } as Parameters<typeof callbacks.onPauseExecution>[0];
    await callbacks.onPauseExecution(object);
    await callbacks.onRedirectExecution(object);
    await callbacks.onCancelExecution(object);
    expect(calls).toEqual([
      "pause:work-object",
      "redirect:work-object:Redirect requested for session-actions",
      "cancel:work-object",
    ]);
  });
});
