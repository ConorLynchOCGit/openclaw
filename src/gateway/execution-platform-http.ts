import type { IncomingMessage, ServerResponse } from "node:http";
import {
  buildExecutionPlatformFeatureFlagRegistry,
  createExecutionPlatformDatabaseRuntime,
  createExecutionPlatformHostRoutes,
  evaluateExecutionPlatformFlag,
  CodexAppServerIntentFrontDoorRouterClient,
  LiveStructuredModelIntentRouterProvider,
  LiveSimpleTriageRouterProvider,
  OpenRouterIntentFrontDoorRouterClient,
  OpenRouterSimpleTriageModelClient,
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
  registerSchedulerRuntimeTools,
  registerValidationQaRuntimeTools,
  RuntimeJobRepository,
  RuntimeWorkGraphRepository,
  TwoLaneStructuredModelIntentRouterProvider,
  WorkQueueEventStore,
  WorkQueueRepository,
  type LiveRouterModelPolicy,
  type RouterModelCandidateRef,
} from "../../extensions/execution-platform/runtime-api.js";
import { CodexAppServerJsonExecutor } from "../../extensions/model-memory/src/mmv2/codex-app-server-json-executor.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { runGatewayAgentTeamRuntimeJobOnce } from "./execution-platform-agent-team-runner.js";
import type { AuthorizedGatewayHttpRequest } from "./http-utils.js";

type ExecutionPlatformRouteRuntime = {
  runtimeJobs: RuntimeJobRepository;
  runtimeWorkGraphs: RuntimeWorkGraphRepository;
  workQueueEvents: WorkQueueEventStore;
  workQueue: WorkQueueRepository;
  nativeExecutionRpc: NativeExecutionRpcService;
  runtimeToolKernel: RuntimeToolKernel;
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
  fallback: "low" | "medium" | "high",
) {
  const value = configValue(config, name);
  return value === "low" || value === "medium" || value === "high" ? value : fallback;
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
  const ownerCanaryDecision = evaluateExecutionPlatformFlag(
    flagRegistry,
    "two_lane_router_owner_canary",
    { critical: true },
  );
  const nativeSubmitDecision = evaluateExecutionPlatformFlag(
    flagRegistry,
    "native_execution_submit_front_door",
    { critical: true },
  );
  if (
    !enableDecision.allowed ||
    !killSwitchDecision.allowed ||
    !ownerCanaryDecision.allowed ||
    !nativeSubmitDecision.allowed
  ) {
    return null;
  }
  const providerProfileRef = configValue(
    config,
    "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_PROVIDER_PROFILE",
  );
  const routerModelRef = configValue(config, "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_MODEL_REF");
  const routerPolicyRef = configValue(config, "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_POLICY_REF");
  const fallbackModelRef = configValue(
    config,
    "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_FALLBACK_MODEL_REF",
  );
  const escalationModelRef = configValue(
    config,
    "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_ESCALATION_MODEL_REF",
  );
  const apiKey = configValue(config, "OPENROUTER_API_KEY");
  const triageModelRef =
    configValue(config, "OPENCLAW_INTENT_FRONT_DOOR_TRIAGE_ROUTER_MODEL_REF") ??
    "deepseek/deepseek-v4-flash";
  const advancedModelRef =
    configValue(config, "OPENCLAW_INTENT_FRONT_DOOR_ADVANCED_ROUTER_MODEL_REF") ??
    "openai-codex/gpt-5.5";
  const requiredAdvancedModelRef =
    configValue(config, "OPENCLAW_INTENT_FRONT_DOOR_ADVANCED_ROUTER_REQUIRED_MODEL_REF") ??
    "openai-codex/gpt-5.5";
  if (advancedModelRef !== requiredAdvancedModelRef) {
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
  const triagePolicy: LiveRouterModelPolicy = {
    artifactKind: "intent_front_door_live_router_model_policy",
    policyId: "router-policy://intent-front-door/live-router/simple-triage",
    routerPolicyVersion: ROUTER_MODEL_POLICY_VERSION,
    routerProviderProfile: providerProfileRef
      ? {
          providerRef: "provider-profile://intent-front-door/router/openrouter/simple-triage",
          providerKind: "openrouter",
          baseUrlRef: "provider-base-url://openrouter/default",
          timeoutMs: numberConfig(
            config,
            "OPENCLAW_INTENT_FRONT_DOOR_TRIAGE_ROUTER_TIMEOUT_MS",
            90_000,
          ),
          maxAttempts: numberConfig(
            config,
            "OPENCLAW_INTENT_FRONT_DOOR_TRIAGE_ROUTER_MAX_ATTEMPTS",
            2,
          ),
          maxTokens: numberConfig(
            config,
            "OPENCLAW_INTENT_FRONT_DOOR_TRIAGE_ROUTER_MAX_TOKENS",
            600,
          ),
          reasoningEffort: reasoningConfig(
            config,
            "OPENCLAW_INTENT_FRONT_DOOR_TRIAGE_ROUTER_REASONING_EFFORT",
            "low",
          ),
          speedPreference: speedConfig(
            config,
            "OPENCLAW_INTENT_FRONT_DOOR_TRIAGE_ROUTER_SPEED_PREFERENCE",
            "latency",
          ),
        }
      : null,
    routerModelRef: triageModelRef,
    routerPolicyRef: "router-policy://intent-front-door/live-router/simple-triage",
    modelRosterRef:
      configValue(config, "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_MODEL_ROSTER_REF") ??
      "model-roster://intent-front-door/router/live",
    requiredCapabilities: ["structured_json", "json_schema"],
    fallbackModelRef: null,
    escalationModelRef: null,
    killSwitchRef:
      configValue(config, "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_KILL_SWITCH_REF") ??
      "kill-switch://intent-front-door/live-router",
    killSwitchActive: configBoolean(config, "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_KILL_SWITCH_ACTIVE"),
    latencyBudget: { targetMs: 2_000, maxMs: 90_000 },
    costBudget: { maxEstimatedUsdPerRoute: 0.005 },
    reliabilityRequirement: {
      minSuccessRate: 0.995,
      maxNoContentRate: 0.005,
      maxRateLimitRate: 0.01,
    },
    status: configBoolean(config, "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_SUSPENDED")
      ? "suspended"
      : "enabled",
  };
  const advancedPolicy: LiveRouterModelPolicy = {
    artifactKind: "intent_front_door_live_router_model_policy",
    policyId: "router-policy://intent-front-door/live-router/advanced",
    routerPolicyVersion: ROUTER_MODEL_POLICY_VERSION,
    routerProviderProfile: {
      providerRef: "provider-profile://intent-front-door/router/codex-app-server/advanced",
      providerKind: "approved_model_routing_client",
      baseUrlRef: "provider-base-url://codex-app-server/default",
      timeoutMs: numberConfig(
        config,
        "OPENCLAW_INTENT_FRONT_DOOR_ADVANCED_ROUTER_TIMEOUT_MS",
        600_000,
      ),
      maxAttempts: 1,
      maxTokens: numberConfig(
        config,
        "OPENCLAW_INTENT_FRONT_DOOR_ADVANCED_ROUTER_MAX_TOKENS",
        8_000,
      ),
      reasoningEffort: reasoningConfig(
        config,
        "OPENCLAW_INTENT_FRONT_DOOR_ADVANCED_ROUTER_REASONING_EFFORT",
        "medium",
      ),
      speedPreference: speedConfig(
        config,
        "OPENCLAW_INTENT_FRONT_DOOR_ADVANCED_ROUTER_SPEED_PREFERENCE",
        "throughput",
      ),
    },
    routerModelRef: advancedModelRef,
    routerPolicyRef: "router-policy://intent-front-door/live-router/advanced",
    modelRosterRef:
      configValue(config, "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_MODEL_ROSTER_REF") ??
      "model-roster://intent-front-door/router/live",
    requiredCapabilities: ["structured_json", "json_schema", "reasoning", "large_context"],
    fallbackModelRef:
      configValue(config, "OPENCLAW_INTENT_FRONT_DOOR_ADVANCED_ROUTER_FALLBACK_MODEL_REF") ??
      "openai-codex/gpt-5.5",
    escalationModelRef: escalationModelRef ?? advancedModelRef,
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
  const legacySinglePassPolicy: LiveRouterModelPolicy = {
    artifactKind: "intent_front_door_live_router_model_policy",
    policyId: routerPolicyRef ?? "router-policy://intent-front-door/live-router/missing",
    routerPolicyVersion: ROUTER_MODEL_POLICY_VERSION,
    routerProviderProfile: providerProfileRef
      ? {
          providerRef: providerProfileRef,
          providerKind: "openrouter",
          baseUrlRef: "provider-base-url://openrouter/default",
          timeoutMs: numberConfig(config, "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_TIMEOUT_MS", 10_000),
          maxAttempts: numberConfig(config, "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_MAX_ATTEMPTS", 1),
          maxTokens: numberConfig(config, "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_MAX_TOKENS", 1_500),
          reasoningEffort: reasoningConfig(
            config,
            "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_REASONING_EFFORT",
            "low",
          ),
          speedPreference: speedConfig(
            config,
            "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_SPEED_PREFERENCE",
            null,
          ),
        }
      : null,
    routerModelRef,
    routerPolicyRef,
    modelRosterRef:
      configValue(config, "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_MODEL_ROSTER_REF") ??
      "model-roster://intent-front-door/router/live",
    requiredCapabilities: ["structured_json", "json_schema"],
    fallbackModelRef,
    escalationModelRef,
    killSwitchRef:
      configValue(config, "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_KILL_SWITCH_REF") ??
      "kill-switch://intent-front-door/live-router",
    killSwitchActive: configBoolean(config, "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_KILL_SWITCH_ACTIVE"),
    latencyBudget: { targetMs: 1_000, maxMs: 5_000 },
    costBudget: { maxEstimatedUsdPerRoute: 0.005 },
    reliabilityRequirement: {
      minSuccessRate: 0.995,
      maxNoContentRate: 0.005,
      maxRateLimitRate: 0.01,
    },
    status: configBoolean(config, "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_SUSPENDED")
      ? "suspended"
      : "enabled",
  };
  const triageCandidate = routerCandidate({
    provider: "openrouter",
    model: triageModelRef,
    family: "OpenRouter-hosted candidates",
    policyRef: triageModelRef,
    capabilities: ["structured_json", "json_schema", "low_cost"],
  });
  const advancedCandidate = routerCandidate({
    provider: advancedModelRef.startsWith("openai-codex/") ? "openai-codex" : "codex",
    model: advancedModelRef,
    family: "OpenAI-Codex",
    policyRef: advancedModelRef,
    capabilities: ["structured_json", "json_schema", "reasoning", "large_context"],
  });
  const legacyCandidate = routerCandidate({
    provider: "openrouter",
    model: routerModelRef,
    family: "OpenRouter-hosted candidates",
    policyRef: routerModelRef,
    capabilities: ["structured_json", "json_schema", "low_cost"],
  });
  const triageDecision = resolveLiveRouterModelPolicy({
    policy: triagePolicy,
    candidates: triageCandidate ? [triageCandidate] : [],
    providerSecretConfigured: Boolean(apiKey),
  });
  const advancedDecision = resolveLiveRouterModelPolicy({
    policy: advancedPolicy,
    candidates: advancedCandidate ? [advancedCandidate] : [],
    providerSecretConfigured: true,
  });
  if (triageDecision.allowed && advancedDecision.allowed && apiKey) {
    return new TwoLaneStructuredModelIntentRouterProvider({
      promptLengthAdvancedThreshold: numberConfig(
        config,
        "OPENCLAW_INTENT_FRONT_DOOR_LONG_PROMPT_ADVANCED_THRESHOLD",
        8_000,
      ),
      triageProvider: new LiveSimpleTriageRouterProvider({
        policyDecision: triageDecision,
        client: new OpenRouterSimpleTriageModelClient({
          apiKey,
          retryPolicy: {
            timeoutMs: triagePolicy.routerProviderProfile?.timeoutMs ?? 90_000,
            maxAttempts: triagePolicy.routerProviderProfile?.maxAttempts ?? 2,
          },
        }),
      }),
      advancedProvider: new LiveStructuredModelIntentRouterProvider({
        policyDecision: advancedDecision,
        client: new CodexAppServerIntentFrontDoorRouterClient({
          requestTimeoutMs: advancedPolicy.routerProviderProfile?.timeoutMs ?? 600_000,
          cwd: "/root/services/openclaw-roles/live",
        }),
      }),
    });
  }

  const legacyDecision = resolveLiveRouterModelPolicy({
    policy: legacySinglePassPolicy,
    candidates: legacyCandidate ? [legacyCandidate] : [],
    providerSecretConfigured: Boolean(apiKey),
  });
  if (!legacyDecision.allowed || !apiKey) {
    return null;
  }
  return new LiveStructuredModelIntentRouterProvider({
    policyDecision: legacyDecision,
    client: new OpenRouterIntentFrontDoorRouterClient({
      apiKey,
      retryPolicy: {
        timeoutMs: legacySinglePassPolicy.routerProviderProfile?.timeoutMs ?? 10_000,
        maxAttempts: legacySinglePassPolicy.routerProviderProfile?.maxAttempts ?? 1,
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
    pathname.startsWith("/api/execution-platform/work-queue/") ||
    pathname === "/api/execution-platform/queue-runner/run-once"
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
    registerSchedulerRuntimeTools({ registry: runtimeToolRegistry, includeWorkerInvoke: true });
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
    const nativeExecutionRpc = new NativeExecutionRpcService({
      runtimeJobs,
      workQueue,
      runtimeToolKernel,
      structuredRouterProvider: createGatewayStructuredRouterProvider(config) ?? undefined,
    });
    return {
      runtimeJobs,
      runtimeWorkGraphs,
      runtimeToolKernel,
      workQueueEvents,
      workQueue,
      nativeExecutionRpc,
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
      runtimeToolKernel: runtime.runtimeToolKernel,
      workQueue: runtime.workQueue,
      nativeExecutionRpc: runtime.nativeExecutionRpc,
      nativeHttpAuth: resolveNativeHttpAuthContext(req, params.requestAuth),
      agentTeamRuntimeRunOnce: ({ runtimeJobId, workerId, queueName }) =>
        runGatewayAgentTeamRuntimeJobOnce({
          runtimeJobs: runtime.runtimeJobs,
          runtimeWorkGraphs: runtime.runtimeWorkGraphs,
          runtimeToolKernel: runtime.runtimeToolKernel,
          workQueue: runtime.workQueue,
          runtimeJobId,
          workerId,
          queueName,
        }),
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
