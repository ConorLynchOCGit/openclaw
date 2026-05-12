import fs from "node:fs";
import path from "node:path";
import {
  LiveStructuredModelIntentRouterProvider,
  OpenRouterIntentFrontDoorRouterClient,
  ROUTER_MODEL_POLICY_VERSION,
  ROUTING_EVAL_CORPUS,
  resolveLiveRouterModelPolicy,
  runRouterLiveShadowEval,
} from "../extensions/execution-platform/src/intent-front-door/index.ts";

const ARTIFACT_DIR = ".artifacts/execution-platform";
const MODEL_REF = "deepseek/deepseek-v4-flash";
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
]);

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    return fallback;
  }
  return process.argv[index + 1];
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
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/u)) {
      const parsed = parseDotenvLine(line);
      if (parsed && !process.env[parsed[0]]) {
        process.env[parsed[0]] = parsed[1];
      }
    }
  }
}

function writeArtifact(fileName, value) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(ARTIFACT_DIR, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

function artifactName(prefix, suffix) {
  return `${prefix}-${suffix}`;
}

function policyDecision(input) {
  const policy = {
    artifactKind: "intent_front_door_live_router_model_policy",
    policyId: "intent-front-door.live-router.v4-flash-shadow",
    routerPolicyVersion: ROUTER_MODEL_POLICY_VERSION,
    routerProviderProfile: {
      providerRef: "provider-profile://intent-front-door/router/openrouter-v4-flash-shadow",
      providerKind: "openrouter",
      baseUrlRef: "provider-base-url://openrouter/default",
      timeoutMs: input.timeoutMs,
      maxAttempts: input.maxAttempts,
      maxTokens: input.maxTokens,
      reasoningEffort: input.reasoningEffort,
      speedPreference: input.speedPreference,
    },
    routerModelRef: MODEL_REF,
    routerPolicyRef: "router-policy://intent-front-door/v4-flash-shadow",
    modelRosterRef: "model-roster://intent-front-door/router/live-shadow",
    requiredCapabilities: ["structured_json", "json_schema"],
    fallbackModelRef: "deepseek/deepseek-v4-pro",
    escalationModelRef: "deepseek/deepseek-v4-pro",
    killSwitchRef: "kill-switch://intent-front-door/live-router",
    killSwitchActive: false,
    latencyBudget: { targetMs: 30_000, maxMs: input.timeoutMs },
    costBudget: { maxEstimatedUsdPerRoute: 0.02 },
    reliabilityRequirement: {
      minSuccessRate: 0.95,
      maxNoContentRate: 0.05,
      maxRateLimitRate: 0.05,
    },
    status: "enabled",
  };
  const candidate = {
    provider: "openrouter",
    model: MODEL_REF,
    family: "OpenRouter-hosted DeepSeek V4 Flash",
    capabilities: ["structured_json", "json_schema", "low_cost"],
    status: "enabled",
    policyRef: MODEL_REF,
  };
  return resolveLiveRouterModelPolicy({
    policy,
    candidates: [candidate],
    providerSecretConfigured: Boolean(process.env.OPENROUTER_API_KEY),
  });
}

function createProvider(input) {
  const decision = policyDecision(input);
  if (!decision.allowed || !process.env.OPENROUTER_API_KEY) {
    return { decision, provider: null };
  }
  return {
    decision,
    provider: new LiveStructuredModelIntentRouterProvider({
      policyDecision: decision,
      client: new OpenRouterIntentFrontDoorRouterClient({
        apiKey: process.env.OPENROUTER_API_KEY,
        retryPolicy: {
          timeoutMs: input.timeoutMs,
          maxAttempts: input.maxAttempts,
          retryableHttpStatuses: [429, 503],
        },
      }),
    }),
  };
}

function boundedRunArtifact(input) {
  return {
    artifactKind: "v4_flash_router_shadow_eval_result",
    generatedAt: new Date().toISOString(),
    mode: input.mode,
    modelRef: MODEL_REF,
    providerRef: input.run.providerProfileRef,
    routerPolicyRef: input.run.routerPolicyRef,
    timeoutMs: input.settings.timeoutMs,
    retryPolicy: {
      maxAttempts: input.settings.maxAttempts,
      retryOnlyFor: [
        "openrouter_no_content",
        "openrouter_http_429",
        "openrouter_http_503",
        "openrouter_network_timeout",
      ],
    },
    reasoningSetting: input.settings.reasoningEffort,
    speedSetting: input.settings.speedPreference,
    maxTokens: input.settings.maxTokens,
    exactRouteAccuracy: input.run.routeAccuracy,
    routeFamilyAccuracy: input.run.routeFamilyAccuracy,
    schemaFailures: input.run.schemaFailureCount,
    falseAllows: input.run.falseAllows,
    falseBlocks: input.run.falseBlocks,
    highRiskFalseAllows: input.run.highRiskFalseAllows,
    clarificationMismatches: input.run.clarificationMismatches,
    providerNoContentCount: input.run.providerNoContentCount,
    providerRateLimitCount: input.run.providerRateLimitCount,
    providerUnavailableCount: input.run.providerUnavailableCount,
    retryCounts: input.run.caseResults.map((result) => ({
      evalCaseId: result.evalCaseId,
      reasonCodes: result.reasonCodes.filter((reason) => reason.startsWith("openrouter_")),
    })),
    latencyMs: input.run.latencyMs,
    boundedCaseRouteSummaries: input.run.caseResults.map((result) => ({
      evalCaseId: result.evalCaseId,
      category: result.category,
      expectedRoute: result.expectedRoute,
      actualRoute: result.actualRoute,
      expectedRouteFamily: result.expectedRouteFamily,
      actualRouteFamily: result.actualRouteFamily,
      routeMatched: result.routeMatched,
      routeFamilyMatched: result.routeFamilyMatched,
      schemaValid: result.schemaValid,
      falseAllow: result.falseAllow,
      falseBlock: result.falseBlock,
      highRiskFalseAllow: result.highRiskFalseAllow,
      selfCheckEnabled: result.selfCheckEnabled,
      firstPassRoute: result.firstPassRoute,
      secondPassRoute: result.secondPassRoute,
      selfCheckChangedRoute: result.selfCheckChangedRoute,
      latencyMs: result.latencyMs,
      reasonCodes: result.reasonCodes.slice(0, 20),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    })),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    runtimeJobsCreated: false,
    authorityGranted: false,
    workQueueLifecycleMutated: false,
    modelPromotionPerformed: false,
    result: input.run,
  };
}

function runPassesPromotionHardGates(run) {
  return (
    run.schemaFailureCount === 0 &&
    run.falseAllows === 0 &&
    run.highRiskFalseAllows === 0 &&
    run.runtimeJobsCreated === false &&
    run.authorityGranted === false &&
    run.workQueueLifecycleMutated === false &&
    run.rawPromptStored === false &&
    run.rawResponseStored === false &&
    run.rawProviderLogStored === false
  );
}

async function runEval(input) {
  const { decision, provider } = createProvider(input.settings);
  const run = await runRouterLiveShadowEval({
    evalRunId: input.evalRunId,
    corpus: input.corpus,
    provider,
    selfCheckProvider: provider,
    selfCheckEnabled: input.selfCheckEnabled,
    policyDecision: decision,
    liveCallsEnabled: true,
    routerConfigVersion: `intent-front-door.v4-flash.${input.selfCheckEnabled ? "two-pass" : "single-pass"}.v1`,
  });
  const artifact = boundedRunArtifact({
    mode: input.mode,
    run,
    settings: input.settings,
  });
  writeArtifact(input.artifactName, artifact);
  return run;
}

async function main() {
  loadDotenvFiles();
  const settings = {
    timeoutMs: Number(argValue("--timeout-ms", "240000")),
    maxAttempts: Number(argValue("--max-attempts", "2")),
    reasoningEffort: argValue("--reasoning", "low"),
    speedPreference: argValue("--speed", "latency"),
    maxTokens: Number(argValue("--max-tokens", "2200")),
  };
  const artifactPrefix = argValue("--artifact-prefix", "v4-flash");
  const fullRuns = Number(argValue("--full-runs", "3"));
  const corpus = ROUTING_EVAL_CORPUS;
  const subset = corpus.filter((evalCase) => SUBSET_CATEGORIES.has(evalCase.category));
  const completed = [];

  if (!process.env.OPENROUTER_API_KEY) {
    const blocker = {
      artifactKind: "v4_flash_router_experiment_blocker",
      generatedAt: new Date().toISOString(),
      blocker: "OPENROUTER_API_KEY_missing",
      approvedProviderPathUsed: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      runtimeJobsCreated: false,
      authorityGranted: false,
      workQueueLifecycleMutated: false,
      modelPromotionPerformed: false,
    };
    writeArtifact(artifactName(artifactPrefix, "router-experiment-comparison.json"), blocker);
    return;
  }

  const singleSubset = hasArg("--full-only")
    ? null
    : await runEval({
        mode: "single_pass_subset",
        evalRunId: `v4-flash-single-subset:${Date.now()}`,
        corpus: subset,
        selfCheckEnabled: false,
        settings,
        artifactName: artifactName(artifactPrefix, "single-pass-subset-eval.json"),
      });
  if (singleSubset) {
    completed.push({
      artifact: artifactName(artifactPrefix, "single-pass-subset-eval.json"),
      run: singleSubset,
    });
  }

  const twoPassSubset = hasArg("--full-only")
    ? null
    : await runEval({
        mode: "two_pass_subset",
        evalRunId: `v4-flash-two-pass-subset:${Date.now()}`,
        corpus: subset,
        selfCheckEnabled: true,
        settings,
        artifactName: artifactName(artifactPrefix, "two-pass-subset-eval.json"),
      });
  if (twoPassSubset) {
    completed.push({
      artifact: artifactName(artifactPrefix, "two-pass-subset-eval.json"),
      run: twoPassSubset,
    });
  }

  const singleSubsetPasses =
    hasArg("--full-only") ||
    (singleSubset !== null &&
      singleSubset.schemaFailureCount === 0 &&
      singleSubset.falseAllows === 0 &&
      singleSubset.highRiskFalseAllows === 0 &&
      !singleSubset.blockedConfigMissing);
  const twoPassSubsetPasses =
    hasArg("--full-only") ||
    (twoPassSubset !== null &&
      twoPassSubset.schemaFailureCount === 0 &&
      twoPassSubset.falseAllows === 0 &&
      twoPassSubset.highRiskFalseAllows === 0 &&
      !twoPassSubset.blockedConfigMissing);
  const subsetPasses = singleSubsetPasses && twoPassSubsetPasses;

  if (singleSubsetPasses && !hasArg("--subset-only")) {
    for (let index = 1; index <= fullRuns; index += 1) {
      const single = await runEval({
        mode: `single_pass_full_corpus_run_${index}`,
        evalRunId: `v4-flash-single-full-${index}:${Date.now()}`,
        corpus,
        selfCheckEnabled: false,
        settings,
        artifactName: artifactName(artifactPrefix, `single-pass-full-corpus-run-${index}.json`),
      });
      completed.push({
        artifact: artifactName(artifactPrefix, `single-pass-full-corpus-run-${index}.json`),
        run: single,
      });
      if (!twoPassSubsetPasses || hasArg("--skip-two-pass-full")) {
        continue;
      }
      const twoPass = await runEval({
        mode: `two_pass_full_corpus_run_${index}`,
        evalRunId: `v4-flash-two-pass-full-${index}:${Date.now()}`,
        corpus,
        selfCheckEnabled: true,
        settings,
        artifactName: artifactName(artifactPrefix, `two-pass-full-corpus-run-${index}.json`),
      });
      completed.push({
        artifact: artifactName(artifactPrefix, `two-pass-full-corpus-run-${index}.json`),
        run: twoPass,
      });
    }
  }

  const best = completed
    .filter((item) => item.run.corpusSubsetSize === corpus.length)
    .toSorted((left, right) => {
      if (right.run.routeAccuracy !== left.run.routeAccuracy) {
        return right.run.routeAccuracy - left.run.routeAccuracy;
      }
      return right.run.routeFamilyAccuracy - left.run.routeFamilyAccuracy;
    })[0];

  const comparison = {
    artifactKind: "v4_flash_router_experiment_comparison",
    generatedAt: new Date().toISOString(),
    modelRef: MODEL_REF,
    settings,
    subsetPasses,
    fullRunsRequested: fullRuns,
    completedRuns: completed.map((item) => ({
      artifact: item.artifact,
      corpusSubsetSize: item.run.corpusSubsetSize,
      exactRouteAccuracy: item.run.routeAccuracy,
      routeFamilyAccuracy: item.run.routeFamilyAccuracy,
      schemaFailures: item.run.schemaFailureCount,
      falseAllows: item.run.falseAllows,
      falseBlocks: item.run.falseBlocks,
      highRiskFalseAllows: item.run.highRiskFalseAllows,
      providerNoContentCount: item.run.providerNoContentCount,
      providerRateLimitCount: item.run.providerRateLimitCount,
      providerUnavailableCount: item.run.providerUnavailableCount,
      latencyMs: item.run.latencyMs,
      selfCheckUsed: item.run.caseResults.some((result) => result.selfCheckEnabled),
      status: item.run.status,
    })),
    bestFullRunArtifact: best?.artifact ?? null,
    bestFullRunPassesHardGates: best ? runPassesPromotionHardGates(best.run) : false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    runtimeJobsCreated: false,
    authorityGranted: false,
    workQueueLifecycleMutated: false,
    modelPromotionPerformed: false,
  };
  writeArtifact(artifactName(artifactPrefix, "router-experiment-comparison.json"), comparison);
}

await main();
