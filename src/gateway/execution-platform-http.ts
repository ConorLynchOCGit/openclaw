import type { IncomingMessage, ServerResponse } from "node:http";
import {
  buildExecutionPlatformFeatureFlagRegistry,
  createExecutionPlatformDatabaseRuntime,
  createExecutionPlatformHostRoutes,
  evaluateExecutionPlatformFlag,
  LiveStructuredModelIntentRouterProvider,
  OpenRouterIntentFrontDoorRouterClient,
  ROUTER_MODEL_POLICY_VERSION,
  RuntimeToolKernel,
  RuntimeToolRegistry,
  RuntimeToolTraceRepository,
  resolveLiveRouterModelPolicy,
  NativeExecutionRpcService,
  ModelCloseoutCapsuleReporter,
  registerCloseoutFinalizationRuntimeTools,
  registerCloseoutGenerateRuntimeTool,
  registerRouterFrontDoorRuntimeTools,
  registerValidationQaRuntimeTools,
  RuntimeJobRepository,
  RuntimeWorkGraphRepository,
  WorkQueueEventStore,
  WorkQueueRepository,
  createFileGatewaySubmitDiagnosticsSink,
  type LiveRouterModelPolicy,
  type LiveRouterReasoningEffort,
  type RouterModelCandidateRef,
} from "../../extensions/execution-platform/runtime-api.js";
import { CodexAppServerJsonExecutor } from "../../extensions/model-memory/src/mmv2/codex-app-server-json-executor.js";
import { OpenClawAgentRuntime } from "../agents/openclaw-agent-runtime.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { AuthorizedGatewayHttpRequest } from "./http-utils.js";
import { NativeExecutionStartService } from "./native-execution-start-service.js";
import { ResidentNativeExecutionWorkerSupervisor } from "./resident-native-execution-worker-supervisor.js";

type ExecutionPlatformRouteRuntime = {
  runtimeJobs: RuntimeJobRepository;
  runtimeWorkGraphs: RuntimeWorkGraphRepository;
  workQueueEvents: WorkQueueEventStore;
  workQueue: WorkQueueRepository;
  nativeExecutionRpc: NativeExecutionRpcService;
  runtimeToolKernel: RuntimeToolKernel;
  agentRuntime?: OpenClawAgentRuntime;
  nativeExecutionWorkerSupervisor?: ResidentNativeExecutionWorkerSupervisor;
  shutdown?: () => Promise<void>;
};

let runtimePromise: Promise<ExecutionPlatformRouteRuntime> | null = null;

function writeJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name.toLowerCase()];
  return Array.isArray(raw) ? raw[0] : raw;
}

function boundedHeader(req: IncomingMessage, name: string): string | null {
  const raw = headerValue(req, name)?.trim();
  if (!raw || raw.length > 160) {
    return null;
  }
  return raw;
}

function configValue(config: OpenClawConfig, name: string): string | null {
  const inline = config.env?.vars?.[name];
  if (typeof inline === "string" && inline.trim()) {
    return inline.trim();
  }
  const direct = config.env?.[name];
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }
  const processValue = process.env[name];
  return typeof processValue === "string" && processValue.trim() ? processValue.trim() : null;
}

function configBoolean(config: OpenClawConfig, name: string): boolean {
  const value = configValue(config, name)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function numberConfig(config: OpenClawConfig, name: string, fallback: number): number {
  const parsed = Number(configValue(config, name));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function reasoningConfig(
  config: OpenClawConfig,
  name: string,
  fallback: LiveRouterReasoningEffort,
) {
  const value = configValue(config, name);
  return value === "none" ||
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh"
    ? value
    : fallback;
}

function speedConfig(
  config: OpenClawConfig,
  name: string,
  fallback: "latency" | "throughput" | null,
) {
  const value = configValue(config, name);
  return value === "latency" || value === "throughput" ? value : fallback;
}

function routerCandidate(input: {
  provider: string;
  model: string | null;
  family: RouterModelCandidateRef["family"];
  policyRef: string | null;
  capabilities: RouterModelCandidateRef["capabilities"];
}): RouterModelCandidateRef | null {
  return input.model
    ? {
        provider: input.provider,
        model: input.model,
        family: input.family,
        capabilities: input.capabilities,
        status: "enabled",
        policyRef: input.policyRef ?? input.model,
      }
    : null;
}

export function createGatewayStructuredRouterProvider(config: OpenClawConfig) {
  const flagRegistry = buildExecutionPlatformFeatureFlagRegistry({
    config,
    env: process.env,
    scope: "owner_only",
  });
  const enableDecision = evaluateExecutionPlatformFlag(
    flagRegistry,
    "live_structured_router_provider",
    { critical: true },
  );
  const killSwitchDecision = evaluateExecutionPlatformFlag(
    flagRegistry,
    "live_router_kill_switch",
    {
      critical: true,
    },
  );
  const nativeSubmitDecision = evaluateExecutionPlatformFlag(
    flagRegistry,
    "native_execution_submit_front_door",
    { critical: true },
  );
  if (!enableDecision.allowed || !killSwitchDecision.allowed || !nativeSubmitDecision.allowed) {
    return null;
  }
  const providerProfileRef = configValue(
    config,
    "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_PROVIDER_PROFILE",
  );
  const routerPolicyRef = configValue(config, "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_POLICY_REF");
  const apiKey = configValue(config, "OPENROUTER_API_KEY");
  const advancedModelRef =
    configValue(config, "OPENCLAW_INTENT_FRONT_DOOR_ADVANCED_ROUTER_MODEL_REF") ??
    configValue(config, "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_MODEL_REF") ??
    "qwen/qwen3-coder-next";
  const requiredAdvancedModelRef = configValue(
    config,
    "OPENCLAW_INTENT_FRONT_DOOR_ADVANCED_ROUTER_REQUIRED_MODEL_REF",
  );
  if (requiredAdvancedModelRef && advancedModelRef !== requiredAdvancedModelRef) {
    console.warn(
      JSON.stringify({
        event: "execution_platform_front_door_model_policy_mismatch",
        expectedModelRef: requiredAdvancedModelRef,
        configuredModelRef: advancedModelRef,
        reasonCode: "front_door_advanced_router_model_policy_mismatch",
      }),
    );
    return null;
  }
  const advancedPolicy: LiveRouterModelPolicy = {
    artifactKind: "intent_front_door_live_router_model_policy",
    policyId: routerPolicyRef ?? "router-policy://intent-front-door/live-router/native-tool",
    routerPolicyVersion: ROUTER_MODEL_POLICY_VERSION,
    routerProviderProfile: {
      providerRef:
        providerProfileRef ?? "provider-profile://intent-front-door/router/openrouter/native-tool",
      providerKind: "openrouter",
      baseUrlRef: "provider-base-url://openrouter/default",
      timeoutMs: numberConfig(
        config,
        "OPENCLAW_INTENT_FRONT_DOOR_ADVANCED_ROUTER_TIMEOUT_MS",
        90_000,
      ),
      maxAttempts: 1,
      maxTokens: numberConfig(
        config,
        "OPENCLAW_INTENT_FRONT_DOOR_ADVANCED_ROUTER_MAX_TOKENS",
        2_000,
      ),
      reasoningEffort: reasoningConfig(
        config,
        "OPENCLAW_INTENT_FRONT_DOOR_ADVANCED_ROUTER_REASONING_EFFORT",
        "none",
      ),
      speedPreference: speedConfig(
        config,
        "OPENCLAW_INTENT_FRONT_DOOR_ADVANCED_ROUTER_SPEED_PREFERENCE",
        "latency",
      ),
    },
    routerModelRef: advancedModelRef,
    routerPolicyRef: routerPolicyRef ?? "router-policy://intent-front-door/live-router/native-tool",
    modelRosterRef:
      configValue(config, "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_MODEL_ROSTER_REF") ??
      "model-roster://intent-front-door/router/live",
    requiredCapabilities: ["tool_calling"],
    fallbackModelRef: null,
    escalationModelRef: null,
    killSwitchRef:
      configValue(config, "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_KILL_SWITCH_REF") ??
      "kill-switch://intent-front-door/live-router",
    killSwitchActive: configBoolean(config, "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_KILL_SWITCH_ACTIVE"),
    latencyBudget: { targetMs: 60_000, maxMs: 600_000 },
    costBudget: { maxEstimatedUsdPerRoute: 0.05 },
    reliabilityRequirement: {
      minSuccessRate: 0.98,
      maxNoContentRate: 0.02,
      maxRateLimitRate: 0.02,
    },
    status: configBoolean(config, "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_SUSPENDED")
      ? "suspended"
      : "enabled",
  };
  const advancedCandidate = routerCandidate({
    provider: "openrouter",
    model: advancedModelRef,
    family: "OpenRouter-hosted candidates",
    policyRef: advancedModelRef,
    capabilities: ["tool_calling", "reasoning", "large_context"],
  });
  const advancedDecision = resolveLiveRouterModelPolicy({
    policy: advancedPolicy,
    candidates: advancedCandidate ? [advancedCandidate] : [],
    providerSecretConfigured: Boolean(apiKey),
  });
  if (!advancedDecision.allowed || !apiKey) {
    return null;
  }
  return new LiveStructuredModelIntentRouterProvider({
    policyDecision: advancedDecision,
    client: new OpenRouterIntentFrontDoorRouterClient({
      apiKey,
      retryPolicy: {
        timeoutMs: advancedPolicy.routerProviderProfile?.timeoutMs ?? 90_000,
        maxAttempts: advancedPolicy.routerProviderProfile?.maxAttempts ?? 1,
      },
    }),
  });
}

function resolveNativeHttpAuthContext(
  req: IncomingMessage,
  requestAuth?: AuthorizedGatewayHttpRequest | null,
) {
  if (!requestAuth) {
    return undefined;
  }
  return {
    authenticated: true,
    actorId:
      boundedHeader(req, "x-openclaw-actor-id") ??
      boundedHeader(req, "x-openclaw-operator-id") ??
      "gateway-http-operator",
    role: "operator" as const,
    sessionId:
      boundedHeader(req, "x-openclaw-session-id") ??
      boundedHeader(req, "x-openclaw-session-key") ??
      null,
    sourceRoute:
      boundedHeader(req, "x-openclaw-source-route") === "ux"
        ? ("ux" as const)
        : boundedHeader(req, "x-openclaw-source-route") === "terminal"
          ? ("terminal" as const)
          : boundedHeader(req, "x-openclaw-source-route") === "work_queue"
            ? ("work_queue" as const)
            : ("http" as const),
  };
}

export function shouldHandleExecutionPlatformPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/execution-platform/execution/") ||
    pathname.startsWith("/api/execution-platform/work-queue/")
  );
}

export async function getExecutionPlatformRuntime(
  config: OpenClawConfig,
): Promise<ExecutionPlatformRouteRuntime> {
  runtimePromise ??= (async () => {
    const database = await createExecutionPlatformDatabaseRuntime({
      config,
      applyMigrations: true,
    });
    const runtimeJobs = new RuntimeJobRepository(database.sqlClient, { claimStrategy: "basic" });
    const runtimeWorkGraphs = new RuntimeWorkGraphRepository(database.sqlClient);
    const runtimeToolTraces = new RuntimeToolTraceRepository(database.sqlClient);
    const runtimeToolRegistry = new RuntimeToolRegistry();
    registerRouterFrontDoorRuntimeTools({ registry: runtimeToolRegistry });
    registerValidationQaRuntimeTools({ registry: runtimeToolRegistry });
    registerCloseoutFinalizationRuntimeTools({ registry: runtimeToolRegistry });
    registerCloseoutGenerateRuntimeTool({
      registry: runtimeToolRegistry,
      reporter: new ModelCloseoutCapsuleReporter({
        executor: new CodexAppServerJsonExecutor({
          cwd: process.cwd(),
          requestTimeoutMs: 300_000,
          reasoningEffort: "medium",
        }),
        modelId: "openai-codex/gpt-5.5",
        reasoningEffort: "medium",
        maxOutputTokens: 12_000,
      }),
    });
    const runtimeToolKernel = new RuntimeToolKernel({
      registry: runtimeToolRegistry,
      traces: runtimeToolTraces,
    });
    const workQueueEvents = new WorkQueueEventStore(database.sqlClient);
    const workQueue = new WorkQueueRepository(database.sqlClient, runtimeJobs, {
      eventStore: workQueueEvents,
    });
    const agentRuntime = await OpenClawAgentRuntime.build({ config });
    const nativeExecutionWorkerSupervisor = new ResidentNativeExecutionWorkerSupervisor({
      runtimeJobs,
      workQueue,
      agentRuntime,
    });
    const nativeExecutionStartService = new NativeExecutionStartService({ agentRuntime });
    const nativeExecutionRpc = new NativeExecutionRpcService({
      runtimeJobs,
      workQueue,
      runtimeToolKernel,
      nativeReadiness: () => nativeExecutionStartService.readiness(),
      preflightExecutionSession: (input) => nativeExecutionStartService.preflight(input),
      startExecutionSession: (input) => nativeExecutionStartService.start(input),
      structuredRouterProvider: createGatewayStructuredRouterProvider(config) ?? undefined,
      submitDiagnosticsSink: createFileGatewaySubmitDiagnosticsSink({
        rootDir: process.cwd(),
      }),
      launchNativeExecutionSession: async ({ workerId, queueName }) => {
        nativeExecutionWorkerSupervisor.wakeQueue({ workerId, queueName });
      },
    });
    return {
      runtimeJobs,
      runtimeWorkGraphs,
      runtimeToolKernel,
      workQueueEvents,
      workQueue,
      agentRuntime,
      nativeExecutionRpc,
      nativeExecutionWorkerSupervisor,
      shutdown: async () => {
        await nativeExecutionWorkerSupervisor.drain();
        runtimePromise = null;
        await database.pool.end();
      },
    };
  })().catch((error) => {
    runtimePromise = null;
    throw error;
  });
  return runtimePromise;
}

export async function handleExecutionPlatformHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  params: {
    config: OpenClawConfig;
    runtime?: ExecutionPlatformRouteRuntime;
    requestAuth?: AuthorizedGatewayHttpRequest | null;
  },
): Promise<boolean> {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  if (!shouldHandleExecutionPlatformPath(pathname)) {
    return false;
  }
  try {
    const runtime = params.runtime ?? (await getExecutionPlatformRuntime(params.config));
    const route = createExecutionPlatformHostRoutes({
      runtimeJobs: runtime.runtimeJobs,
      runtimeWorkGraphs: runtime.runtimeWorkGraphs,
      workQueue: runtime.workQueue,
      nativeExecutionRpc: runtime.nativeExecutionRpc,
      nativeHttpAuth: resolveNativeHttpAuthContext(req, params.requestAuth),
    }).find((route) => route.path === pathname);
    if (!route) {
      writeJson(res, 404, { error: "execution_platform_route_not_registered" });
      return true;
    }
    return route.handler(req, res);
  } catch (error) {
    writeJson(res, 503, {
      error: "execution_platform_runtime_unavailable",
      reason: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}
