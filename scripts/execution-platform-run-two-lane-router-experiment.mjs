import fs from "node:fs";
import path from "node:path";
import { buildExecutionPlatformFeatureFlagRegistry } from "../extensions/execution-platform/src/config/feature-flag-registry.ts";
import {
  LiveSimpleTriageRouterProvider,
  LiveStructuredModelIntentRouterProvider,
  CodexAppServerIntentFrontDoorRouterClient,
  OpenRouterIntentFrontDoorRouterClient,
  OpenRouterSimpleTriageModelClient,
  ROUTER_MODEL_POLICY_VERSION,
  ROUTING_EVAL_CORPUS,
  createSimpleTriageRouterOutput,
  evaluateTwoLaneRouterOwnerCanaryReadiness,
  parseSimpleTriageRouterOutput,
  resolveLiveRouterModelPolicy,
  runTwoLaneRouterEval,
} from "../extensions/execution-platform/src/intent-front-door/index.ts";

const ARTIFACT_DIR = ".artifacts/execution-platform";
const SUBSET_CATEGORIES = new Set([
  "chat_only",
  "how_would_you",
  "have_the_team",
  "do_not_send",
  "deploy_if_policy_permits",
  "research_then_implement",
  "cancel_that_job",
  "continue",
  "ship_it",
  "slash_protocol",
]);

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 || !process.argv[index + 1] ? fallback : process.argv[index + 1];
}

function hasArg(name) {
  return process.argv.includes(name);
}

function parseDotenvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }
  const equalIndex = trimmed.indexOf("=");
  if (equalIndex === -1) {
    return null;
  }
  const key = trimmed.slice(0, equalIndex).trim();
  let value = trimmed.slice(equalIndex + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return key ? [key, value] : null;
}

function loadDotenvFiles() {
  for (const filePath of [
    ".env",
    ".env.local",
    ".env.execution-platform-staging",
    "/root/.openclaw/.env",
  ]) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
      const parsed = parseDotenvLine(line);
      if (parsed && !process.env[parsed[0]]) {
        process.env[parsed[0]] = parsed[1];
      }
    }
  }
}

function writeArtifact(name, value) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(ARTIFACT_DIR, name), `${JSON.stringify(value, null, 2)}\n`);
}

function artifactName(prefix, suffix) {
  return `${prefix}-${suffix}`;
}

function modelPolicy(input) {
  const policy = {
    artifactKind: "intent_front_door_live_router_model_policy",
    policyId: input.policyId,
    routerPolicyVersion: ROUTER_MODEL_POLICY_VERSION,
    routerProviderProfile: {
      providerRef: input.providerRef,
      providerKind: input.providerKind ?? "openrouter",
      baseUrlRef:
        input.providerKind === "approved_model_routing_client"
          ? "provider-base-url://codex-app-server"
          : "provider-base-url://openrouter/default",
      timeoutMs: input.timeoutMs,
      maxAttempts: input.maxAttempts,
      maxTokens: input.maxTokens,
      reasoningEffort: input.reasoningEffort,
      speedPreference: input.speedPreference,
    },
    routerModelRef: input.modelRef,
    routerPolicyRef: input.routerPolicyRef,
    modelRosterRef: "model-roster://intent-front-door/two-lane-router/live-shadow",
    requiredCapabilities: ["structured_json", "json_schema"],
    fallbackModelRef: input.fallbackModelRef,
    escalationModelRef: input.escalationModelRef,
    killSwitchRef: "kill-switch://intent-front-door/two-lane-router",
    killSwitchActive: false,
    latencyBudget: { targetMs: input.timeoutMs / 4, maxMs: input.timeoutMs },
    costBudget: { maxEstimatedUsdPerRoute: 0.05 },
    reliabilityRequirement: {
      minSuccessRate: 0.95,
      maxNoContentRate: 0.05,
      maxRateLimitRate: 0.05,
    },
    status: "enabled",
  };
  return resolveLiveRouterModelPolicy({
    policy,
    candidates: [
      {
        provider: providerFromModelRef(input.modelRef),
        model: input.modelRef,
        family:
          input.providerKind === "approved_model_routing_client"
            ? "Codex app-server two-lane router candidate"
            : "OpenRouter-hosted two-lane router candidate",
        capabilities: ["structured_json", "json_schema", "low_cost"],
        status: "enabled",
        policyRef: input.modelRef,
      },
    ],
    providerSecretConfigured: input.providerSecretConfigured,
  });
}

function providerFromModelRef(modelRef) {
  const slashIndex = modelRef.indexOf("/");
  return slashIndex === -1 ? "openrouter" : modelRef.slice(0, slashIndex);
}

function isCodexModel(modelRef) {
  const provider = providerFromModelRef(modelRef);
  return provider === "codex" || provider === "openai-codex";
}

function codexAuthConfigured() {
  return fs.existsSync("/root/.openclaw/external-auth/codex/auth.json");
}

function expectedLane(evalCase) {
  if (evalCase.category === "slash_protocol") {
    return "protocol_pre_gate_bypass";
  }
  if (["chat_response", "status_response", "plan_only"].includes(evalCase.expected.route)) {
    return "chat_send";
  }
  return "advanced_intent_front_door";
}

function fixtureTriageProvider(corpus) {
  return {
    async route(request) {
      const evalCase = corpus.find((item) => request.requestId.endsWith(item.evalCaseId));
      const lane = expectedLane(evalCase ?? corpus[0]);
      const output = createSimpleTriageRouterOutput({
        lane: lane === "chat_send" ? "chat_send" : "advanced_intent_front_door",
        confidence: 0.99,
        reasonCodes: ["fixture_two_lane_triage"],
        boundedRationale: "Fixture lane from eval metadata.",
      });
      return {
        artifactKind: "simple_triage_router_provider_response",
        providerVersion: "intent-front-door.simple-triage-router-provider.v1",
        parseResult: parseSimpleTriageRouterOutput(output),
        output,
        providerRef: "provider-profile://fixture-triage",
        modelRef: "model://fixture-triage",
        routerModelPolicyRef: "router-policy://fixture-triage",
        providerCallMade: false,
        latencyMs: 0,
        estimatedCostUsd: null,
        retryCount: 0,
        degradationState: "healthy",
        reasonCodes: ["fixture_two_lane_triage"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        runtimeJobsCreated: false,
        authorityGranted: false,
        workQueueLifecycleMutated: false,
        modelPromotionPerformed: false,
      };
    },
  };
}

function fixtureAdvancedProvider(corpus) {
  return {
    async route(request) {
      const evalCase = corpus.find((item) => request.requestId.includes(item.evalCaseId));
      return {
        output: evalCase?.routerOutput ?? corpus[0].routerOutput,
        providerRef: "provider-profile://fixture-advanced",
        modelCandidateId: "model://fixture-advanced",
        providerCallMade: false,
        latencyMs: 0,
        estimatedCostUsd: null,
        retryCount: 0,
        reasonCodes: ["fixture_two_lane_advanced"],
      };
    },
  };
}

function liveProviders(settings) {
  const advancedUsesCodex = isCodexModel(settings.advancedModel);
  const triageDecision = modelPolicy({
    policyId: "intent-front-door.two-lane.triage.v4-flash",
    providerRef: "provider-profile://intent-front-door/two-lane/triage-v4-flash",
    modelRef: settings.triageModel,
    routerPolicyRef: "router-policy://intent-front-door/two-lane/triage-v4-flash",
    fallbackModelRef: settings.advancedModel,
    escalationModelRef: settings.advancedModel,
    timeoutMs: settings.triageTimeoutMs,
    maxAttempts: settings.maxAttempts,
    maxTokens: settings.triageMaxTokens,
    reasoningEffort: settings.triageReasoning,
    speedPreference: settings.speedPreference,
    providerSecretConfigured: Boolean(process.env.OPENROUTER_API_KEY),
  });
  const advancedDecision = modelPolicy({
    policyId: "intent-front-door.two-lane.advanced",
    providerRef: advancedUsesCodex
      ? "provider-profile://intent-front-door/two-lane/advanced/codex-app-server"
      : "provider-profile://intent-front-door/two-lane/advanced",
    providerKind: advancedUsesCodex ? "approved_model_routing_client" : "openrouter",
    modelRef: settings.advancedModel,
    routerPolicyRef: "router-policy://intent-front-door/two-lane/advanced",
    fallbackModelRef: settings.triageModel,
    escalationModelRef: settings.advancedModel,
    timeoutMs: settings.advancedTimeoutMs,
    maxAttempts: settings.maxAttempts,
    maxTokens: settings.advancedMaxTokens,
    reasoningEffort: settings.advancedReasoning,
    speedPreference: settings.speedPreference,
    providerSecretConfigured: advancedUsesCodex
      ? codexAuthConfigured()
      : Boolean(process.env.OPENROUTER_API_KEY),
  });
  if (!process.env.OPENROUTER_API_KEY || !triageDecision.allowed || !advancedDecision.allowed) {
    return { triageDecision, advancedDecision, triageProvider: null, advancedProvider: null };
  }
  const retryPolicy = {
    maxAttempts: settings.maxAttempts,
    retryableHttpStatuses: [429, 503],
    baseDelayMs: 750,
    maxDelayMs: 8_000,
    jitterMs: 250,
    rateLimitCooldownMs: 4_000,
  };
  return {
    triageDecision,
    advancedDecision,
    triageProvider: new LiveSimpleTriageRouterProvider({
      policyDecision: triageDecision,
      client: new OpenRouterSimpleTriageModelClient({
        apiKey: process.env.OPENROUTER_API_KEY,
        retryPolicy: { ...retryPolicy, timeoutMs: settings.triageTimeoutMs },
      }),
    }),
    advancedProvider: new LiveStructuredModelIntentRouterProvider({
      policyDecision: advancedDecision,
      client: advancedUsesCodex
        ? new CodexAppServerIntentFrontDoorRouterClient({
            requestTimeoutMs: settings.advancedTimeoutMs,
            cwd: process.cwd(),
          })
        : new OpenRouterIntentFrontDoorRouterClient({
            apiKey: process.env.OPENROUTER_API_KEY,
            retryPolicy: { ...retryPolicy, timeoutMs: settings.advancedTimeoutMs },
          }),
    }),
  };
}

function liveProviderConfigAvailable(settings) {
  if (!process.env.OPENROUTER_API_KEY) {
    return false;
  }
  return isCodexModel(settings.advancedModel) ? codexAuthConfigured() : true;
}

function boundedArtifact(input) {
  return {
    artifactKind: "two_lane_router_eval_artifact",
    generatedAt: new Date().toISOString(),
    mode: input.mode,
    ownerCanaryReadiness: input.ownerCanaryReadiness ?? null,
    triageModelRef: input.triageModelRef,
    advancedModelRef: input.advancedModelRef,
    providerPath: input.providerPath,
    settings: input.settings ?? null,
    routerPolicyRefs: input.routerPolicyRefs,
    laneAccuracy: input.run.laneAccuracy,
    protocolBypassCount: input.run.protocolPreGateBypassCount,
    advancedRouterAvoidedCount: input.run.advancedRouterAvoidedCount,
    unsafeChatFalseAllows: input.run.unsafeChatFalseAllows,
    hardSafetyFailures: input.run.hardSafetyFailures,
    chatFalseAllows: input.run.chatFalseAllows,
    advancedFalseBlocks: input.run.advancedFalseBlocks,
    conservativeFalseBlocks: input.run.conservativeFalseBlocks,
    productQualityMisses: input.run.productQualityMisses,
    exactRouteMismatchesWhereAdvancedRan: input.run.exactRouteMismatchesWhereAdvancedRan,
    routeFamilyMismatchesWhereAdvancedRan: input.run.routeFamilyMismatchesWhereAdvancedRan,
    exactRouteAccuracyWhereAdvancedRan: input.run.exactRouteAccuracyWhereAdvancedRan,
    routeFamilyAccuracyWhereAdvancedRan: input.run.routeFamilyAccuracyWhereAdvancedRan,
    triageSchemaFailures: input.run.triageSchemaFailures,
    providerNoContentCount: input.run.triageProviderNoContentCount,
    providerRateLimitCount: input.run.triageProviderRateLimitCount,
    providerUnavailableCount: input.run.triageProviderUnavailableCount,
    latencyMs: input.run.latencyMs,
    boundedCaseSummaries: input.run.caseResults.map((result) => ({
      evalCaseId: result.evalCaseId,
      category: result.category,
      expectedLane: result.expectedLane,
      actualLane: result.actualLane,
      laneMatched: result.laneMatched,
      advancedRouterAttempted: result.advancedRouterAttempted,
      advancedExactRouteMatched: result.advancedExactRouteMatched,
      advancedRouteFamilyMatched: result.advancedRouteFamilyMatched,
      unsafeChatFalseAllow: result.unsafeChatFalseAllow,
      conservativeFalseBlock: result.conservativeFalseBlock,
      hardSafetyFailure: result.hardSafetyFailure,
      productQualityMiss: result.productQualityMiss,
      reasonCodes: result.reasonCodes.slice(0, 20),
    })),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    runtimeJobsCreated: false,
    authorityGranted: false,
    controlsApplied: false,
    workQueueLifecycleMutated: false,
    modelPromotionPerformed: false,
    result: input.run,
  };
}

function blockedOwnerCanaryArtifact(input) {
  return {
    artifactKind: "two_lane_router_owner_canary_blocker",
    generatedAt: new Date().toISOString(),
    mode: input.mode,
    settings: input.settings,
    readiness: input.readiness,
    blocker: input.readiness.status,
    reasonCodes: input.readiness.reasonCodes,
    providerCallsMade: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    runtimeJobsCreated: false,
    authorityGranted: false,
    controlsApplied: false,
    workQueueLifecycleMutated: false,
    modelPromotionPerformed: false,
  };
}

async function main() {
  loadDotenvFiles();
  const ownerCanaryMode = hasArg("--owner-canary");
  const dryRunMode = hasArg("--dry-run") || hasArg("--static-only");
  const settings = {
    triageModel: argValue("--triage-model", "deepseek/deepseek-v4-flash"),
    advancedModel: argValue("--advanced-model", "deepseek/deepseek-v4-pro"),
    triageReasoning: argValue("--triage-reasoning", "low"),
    advancedReasoning: argValue("--advanced-reasoning", "medium"),
    speedPreference: argValue("--speed", "latency"),
    triageMaxTokens: Number(argValue("--triage-max-tokens", "600")),
    advancedMaxTokens: Number(argValue("--advanced-max-tokens", "2200")),
    triageTimeoutMs: Number(argValue("--triage-timeout-ms", "90000")),
    advancedTimeoutMs: Number(argValue("--advanced-timeout-ms", "240000")),
    maxAttempts: Number(argValue("--max-attempts", "2")),
  };
  const artifactPrefix = argValue(
    "--artifact-prefix",
    ownerCanaryMode ? "two-lane-owner-canary" : "two-lane-router",
  );
  const corpus = ROUTING_EVAL_CORPUS;
  const subset = corpus.filter((evalCase) => SUBSET_CATEGORIES.has(evalCase.category));
  const registry = buildExecutionPlatformFeatureFlagRegistry({
    env: process.env,
    scope: "owner_only",
  });
  const ownerCanaryReadiness = ownerCanaryMode
    ? evaluateTwoLaneRouterOwnerCanaryReadiness({
        registry,
        liveProviderRequired: !dryRunMode,
        providerConfigAvailable: !dryRunMode ? liveProviderConfigAvailable(settings) : null,
      })
    : null;

  if (ownerCanaryMode && !ownerCanaryReadiness.allowed) {
    writeArtifact(
      artifactName(artifactPrefix, "live-blocker.json"),
      blockedOwnerCanaryArtifact({
        mode: dryRunMode ? "owner_canary_dry_run_blocked" : "owner_canary_live_blocked",
        settings,
        readiness: ownerCanaryReadiness,
      }),
    );
    return;
  }

  const staticRun = await runTwoLaneRouterEval({
    evalRunId: `two-lane-static:${Date.now()}`,
    corpus,
    triageProvider: fixtureTriageProvider(corpus),
    advancedRouterProvider: fixtureAdvancedProvider(corpus),
  });
  writeArtifact(
    artifactName(artifactPrefix, "static-eval.json"),
    boundedArtifact({
      mode: "static_fixture",
      ownerCanaryReadiness,
      run: staticRun,
      triageModelRef: "model://fixture-triage",
      advancedModelRef: "model://fixture-advanced",
      providerPath: "fixture",
      settings: null,
      routerPolicyRefs: ["router-policy://fixture-triage", "router-policy://fixture-advanced"],
    }),
  );

  if (dryRunMode) {
    return;
  }

  const { triageDecision, advancedDecision, triageProvider, advancedProvider } =
    liveProviders(settings);
  if (!triageProvider || !advancedProvider) {
    const readiness =
      ownerCanaryReadiness ??
      evaluateTwoLaneRouterOwnerCanaryReadiness({
        registry,
        liveProviderRequired: true,
        providerConfigAvailable: false,
      });
    writeArtifact(
      artifactName(artifactPrefix, "live-blocker.json"),
      blockedOwnerCanaryArtifact({
        mode: "live_provider_config_or_policy_missing",
        settings: { ...settings, triageDecision, advancedDecision },
        readiness: {
          ...readiness,
          allowed: false,
          status: "blocked_config_missing",
          reasonCodes: [
            ...readiness.reasonCodes,
            "live_provider_config_or_policy_missing",
            ...triageDecision.reasonCodes,
            ...advancedDecision.reasonCodes,
          ].slice(0, 40),
        },
      }),
    );
    return;
  }

  const liveSubsetRun = await runTwoLaneRouterEval({
    evalRunId: `two-lane-live-subset:${Date.now()}`,
    corpus: subset,
    triageProvider,
    advancedRouterProvider: advancedProvider,
  });
  writeArtifact(
    artifactName(artifactPrefix, "live-subset-eval.json"),
    boundedArtifact({
      mode: "live_subset",
      ownerCanaryReadiness,
      run: liveSubsetRun,
      triageModelRef: settings.triageModel,
      advancedModelRef: settings.advancedModel,
      providerPath: advancedDecision.providerKind ?? "unknown",
      settings,
      routerPolicyRefs: [triageDecision.routerPolicyRef, advancedDecision.routerPolicyRef].filter(
        Boolean,
      ),
    }),
  );

  const fullRuns = [];
  const runFullCorpus =
    hasArg("--full-corpus") ||
    (!ownerCanaryMode && !hasArg("--subset") && !hasArg("--subset-only"));
  if (
    runFullCorpus &&
    !hasArg("--subset-only") &&
    liveSubsetRun.unsafeChatFalseAllows === 0 &&
    liveSubsetRun.triageSchemaFailures === 0
  ) {
    const repeatCount = Number(argValue("--full-runs", "1"));
    for (let index = 1; index <= repeatCount; index += 1) {
      const run = await runTwoLaneRouterEval({
        evalRunId: `two-lane-live-full-${index}:${Date.now()}`,
        corpus,
        triageProvider,
        advancedRouterProvider: advancedProvider,
      });
      fullRuns.push(run);
      writeArtifact(
        artifactName(artifactPrefix, `live-full-corpus-run-${index}.json`),
        boundedArtifact({
          mode: `live_full_corpus_run_${index}`,
          ownerCanaryReadiness,
          run,
          triageModelRef: settings.triageModel,
          advancedModelRef: settings.advancedModel,
          providerPath: advancedDecision.providerKind ?? "unknown",
          settings,
          routerPolicyRefs: [
            triageDecision.routerPolicyRef,
            advancedDecision.routerPolicyRef,
          ].filter(Boolean),
        }),
      );
    }
  }

  writeArtifact(artifactName(artifactPrefix, "experiment-comparison.json"), {
    artifactKind: "two_lane_router_experiment_comparison",
    generatedAt: new Date().toISOString(),
    ownerCanaryReadiness,
    settings,
    staticRun: {
      laneAccuracy: staticRun.laneAccuracy,
      advancedRouterAvoidedCount: staticRun.advancedRouterAvoidedCount,
      unsafeChatFalseAllows: staticRun.unsafeChatFalseAllows,
      hardSafetyFailures: staticRun.hardSafetyFailures,
      productQualityMisses: staticRun.productQualityMisses,
    },
    liveSubsetRun: {
      laneAccuracy: liveSubsetRun.laneAccuracy,
      advancedRouterAvoidedCount: liveSubsetRun.advancedRouterAvoidedCount,
      unsafeChatFalseAllows: liveSubsetRun.unsafeChatFalseAllows,
      hardSafetyFailures: liveSubsetRun.hardSafetyFailures,
      conservativeFalseBlocks: liveSubsetRun.conservativeFalseBlocks,
      productQualityMisses: liveSubsetRun.productQualityMisses,
      latencyMs: liveSubsetRun.latencyMs,
    },
    fullRuns: fullRuns.map((run) => ({
      laneAccuracy: run.laneAccuracy,
      advancedRouterAvoidedCount: run.advancedRouterAvoidedCount,
      unsafeChatFalseAllows: run.unsafeChatFalseAllows,
      hardSafetyFailures: run.hardSafetyFailures,
      conservativeFalseBlocks: run.conservativeFalseBlocks,
      productQualityMisses: run.productQualityMisses,
      exactRouteAccuracyWhereAdvancedRan: run.exactRouteAccuracyWhereAdvancedRan,
      routeFamilyAccuracyWhereAdvancedRan: run.routeFamilyAccuracyWhereAdvancedRan,
      latencyMs: run.latencyMs,
      status: run.status,
    })),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    runtimeJobsCreated: false,
    authorityGranted: false,
    controlsApplied: false,
    workQueueLifecycleMutated: false,
    modelPromotionPerformed: false,
  });
}

await main();
