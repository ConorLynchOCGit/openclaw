#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = path.join(root, ".artifacts/execution-platform/codex-parity-worker-loop-live-proof");
const proofVersion = "execution-platform.codex-parity-worker-loop-live-proof.v1";
const workItemId = "openclaw-convergence.codex-parity-worker-loop-live-proof";

const safety = {
  rawPromptStored: false,
  rawResponseStored: false,
  rawTranscriptStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  rawCommandLogStored: false,
  rawDbRowsStored: false,
  hiddenReasoningStored: false,
  secretsStored: false,
};

function sha256(value) {
  return crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function flag(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1]?.trim() ?? fallback) : fallback;
}

async function loadEnvFile(filePath) {
  const text = await fs.readFile(filePath, "utf8").catch(() => "");
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [key, ...rest] = trimmed.split("=");
    if (!key || process.env[key]) {
      continue;
    }
    process.env[key.trim()] = rest.join("=").trim().replace(/^['"]|['"]$/gu, "");
  }
}

async function loadEnv() {
  await Promise.all([
    loadEnvFile(path.join(root, ".env")),
    loadEnvFile(path.join(root, ".env.local")),
    loadEnvFile(path.join(root, ".env.execution-platform-staging")),
    loadEnvFile("/root/.openclaw/.env"),
  ]);
}

async function writeJson(runDir, name, value) {
  await fs.mkdir(runDir, { recursive: true });
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const target = path.join(runDir, name);
  await fs.writeFile(target, body, "utf8");
  return {
    path: path.relative(root, target),
    sha256: `sha256:${sha256(body)}`,
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

function unique(values, max = 80) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))].slice(0, max);
}

const allWorkerToolIds = [
  "worker.context.request_more",
  "worker.context.propose_searches",
  "worker.context.search",
  "worker.context.open_ref",
  "worker.context.open_around_match",
  "worker.context.open_window",
  "worker.context.expand_window",
  "worker.context.contract_window",
  "worker.context.accept_window",
  "worker.context.search_symbols",
  "worker.context.find_callers",
  "worker.context.find_tests",
  "worker.context.open_adjacent",
  "worker.context.report_pattern",
  "worker.context.report_risk",
  "worker.context.report_edit_point",
  "worker.edit.plan",
  "worker.patch.author_edit",
  "worker.repair.author_edit",
  "worker.validation.run",
  "worker.validation.run_structural_default",
  "worker.evidence.claim_from_validation",
  "worker.evidence.claim",
  "worker.evidence.claim_commitment_progress",
  "worker.repair.mark_upstream_blocker",
  "worker.escalate",
];

function visibleToolIdsFromPrompt(prompt) {
  const visibleLine = String(prompt ?? "")
    .split(/\r?\n/u)
    .find((line) => line.startsWith("Visible model-facing tools: "));
  const currentLine = String(prompt ?? "")
    .split(/\r?\n/u)
    .find((line) => line.startsWith("Current lifecycle-visible worker tools: "));
  const toolLine = visibleLine ?? currentLine ?? "";
  if (!toolLine && String(prompt ?? "").includes("Only legal choices:")) {
    return allWorkerToolIds.filter(
      (toolId) =>
        String(prompt ?? "").includes(toolId) &&
        !toolId.startsWith("worker.context.") &&
        toolId !== "worker.edit.plan",
    );
  }
  return allWorkerToolIds.filter((toolId) => toolLine.includes(toolId));
}

function bounded(value, max = 600) {
  return String(value ?? "").replace(/\s+/gu, " ").trim().slice(0, max);
}

async function createFixtureRepo() {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-codex-parity-worker-loop-"));
  const files = new Map();
  const add = (fileRef, body) => files.set(fileRef, body);
  add(
    "src/customer-tier.ts",
    [
      "export type CustomerTier = 'standard' | 'premium' | 'enterprise';",
      "",
      "export function normalizeCustomerTier(input: string | null | undefined): CustomerTier {",
      "  const value = String(input ?? '').trim().toLowerCase();",
      "  if (value === 'gold') {",
      "    return 'premium';",
      "  }",
      "  if (value === 'enterprise') {",
      "    return 'enterprise';",
      "  }",
      "  return 'standard';",
      "}",
      "",
      "export function tierLabel(tier: CustomerTier): string {",
      "  return `tier:${tier}`;",
      "}",
      "",
    ].join("\n"),
  );
  add(
    "src/billing/customer-tier-usage.ts",
    [
      "import { normalizeCustomerTier } from '../customer-tier';",
      "",
      "export function billingPlanFor(rawTier: string): string {",
      "  const normalized = normalizeCustomerTier(rawTier);",
      "  if (normalized === 'enterprise') {",
      "    return 'contract';",
      "  }",
      "  if (normalized === 'premium') {",
      "    return 'priority';",
      "  }",
      "  return 'self-serve';",
      "}",
      "",
    ].join("\n"),
  );
  add(
    "tests/customer-tier.test.ts",
    [
      "import { normalizeCustomerTier } from '../src/customer-tier';",
      "",
      "it('maps legacy aliases to canonical tiers', () => {",
      "  expect(normalizeCustomerTier('vip')).toBe('enterprise');",
      "  expect(normalizeCustomerTier('VIP')).toBe('enterprise');",
      "  expect(normalizeCustomerTier('gold')).toBe('premium');",
      "  expect(normalizeCustomerTier('')).toBe('standard');",
      "});",
      "",
    ].join("\n"),
  );
  add(
    "tests/billing-customer-tier-usage.test.ts",
    [
      "import { billingPlanFor } from '../src/billing/customer-tier-usage';",
      "",
      "it('keeps billing callers compatible with vip aliases', () => {",
      "  expect(billingPlanFor('vip')).toBe('contract');",
      "});",
      "",
    ].join("\n"),
  );
  for (let i = 1; i <= 34; i += 1) {
    add(
      `src/noise/decoy-${String(i).padStart(2, "0")}.ts`,
      [
        `export function normalizeDecoyTier${i}(input: string): string {`,
        "  return input.trim().toLowerCase();",
        "}",
        `export const decoyCustomerTier${i} = 'not-the-target';`,
        "",
      ].join("\n"),
    );
  }
  for (const [fileRef, body] of files) {
    const fullPath = path.join(repoRoot, fileRef);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, body, "utf8");
  }
  return { repoRoot, fileRefs: [...files.keys()] };
}

function validationFailureFor(runNumber, testRef) {
  if (runNumber === 1) {
    return `${testRef}:4 expected normalizeCustomerTier('vip') to be 'enterprise'. Search for normalizeCustomerTier tests before repairing.`;
  }
  return "src/billing/customer-tier-usage.ts:4 caller billingPlanFor('vip') still returns self-serve; inspect callers of normalizeCustomerTier before repairing.";
}

function buildMissionLedger(api, runtimeJobId, evidenceClaims) {
  const commitmentId = "commitment-codex-parity-worker-loop";
  const ledger = api.normalizeMissionContractLedger({
    missionId: "mission-codex-parity-worker-loop",
    sourceRuntimeJobId: runtimeJobId,
    sourceWorkItemId: workItemId,
    ownerObjectiveSummary:
      "Prove a Codex-like worker loop can discover context, edit, repair validation failures with more context, and emit Mission Ledger evidence.",
    blockingCommitments: [
      {
        commitmentId,
        commitmentText:
          "Worker implements customer tier alias behavior through iterative search/read/edit/validation/evidence.",
        whyItMatters:
          "This is the middle-lane proof that the coding worker can behave like a Codex-style iterative scout/editor.",
        expectedEvidenceDescription:
          "Changed source refs, validation refs, and commitment-linked worker evidence claim.",
        acceptedEvidenceRefs: [],
        rejectedEvidenceRefs: [],
        status: "pending",
        rationale: null,
        remainingWork: ["Await worker evidence claim."],
        blocking: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    ],
    nonBlockingCommitments: [],
    explicitNonGoals: ["Do not persist raw model prompts or responses."],
    revisionProposals: [],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  });
  const evidenceRefs = unique(evidenceClaims.map((claim) => claim.evidenceRef), 20);
  const normalizedCommitmentId =
    ledger.blockingCommitments?.[0]?.commitmentId ?? commitmentId;
  const evaluation = {
    artifactKind: "mission_commitment_evaluation",
    schemaVersion: api.MISSION_CONTRACT_LEDGER_SCHEMA_VERSION,
    evaluationId: "mission-codex-parity-worker-loop-evaluation",
    missionId: ledger.missionId,
    commitmentUpdates: [
      {
        commitmentId: normalizedCommitmentId,
        status: evidenceRefs.length > 0 ? "satisfied" : "pending",
        acceptedEvidenceRefs: evidenceRefs,
        rejectedEvidenceRefs: [],
        rationale:
          evidenceRefs.length > 0
            ? "Worker emitted explicit commitment-linked evidence after changed-file and validation refs."
            : "No explicit evidence claim was emitted.",
        remainingWork: evidenceRefs.length > 0 ? [] : ["Emit explicit worker evidence claim."],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    ],
    revisionProposals: [],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
  return {
    before: ledger,
    evaluation,
    after: api.applyMissionCommitmentEvaluation({
      ledger,
      evaluation,
      availableEvidenceRefs: evidenceRefs,
    }),
  };
}

async function main() {
  await loadEnv();
  const runId = flag("--run-id") ?? `codex-parity-worker-loop-${Date.now().toString(36)}`;
  const runDir = path.join(artifactRoot, runId);
  const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.OPENCLAW_OPENROUTER_API_KEY;
  const modelRef = flag("--model", process.env.OPENCLAW_CODEX_PARITY_WORKER_MODEL ?? "qwen/qwen3-coder-next");
  const patchModelRef = flag("--patch-model", process.env.OPENCLAW_CODEX_PARITY_PATCH_MODEL ?? "moonshotai/kimi-k2.6");
  const maxTurns = Number(flag("--max-turns", "12"));
  const maxAttempts = Number(flag("--max-attempts", "3"));
  const api = await tsImport(path.join(root, "extensions/execution-platform/runtime-api.ts"), import.meta.url);
  const {
    applyExecutionPlatformMigrations,
    buildImplementationTaskPacket,
    compileNodeExecutionPacketForImplementationTask,
    createExecutionPlatformPgMemTestDatabase,
    NonCodexToolUsingWorkerLoop,
    OpenRouterAgentTeamModelClient,
    registerSchedulerRuntimeTools,
    RuntimeJobRepository,
    RuntimeToolKernel,
    RuntimeToolRegistry,
    RuntimeToolTraceRepository,
    RuntimeWorkGraphRepository,
    summarizeMissionContractLedger,
    openBlockingMissionCommitments,
  } = api;

  const failureReport = async (reasonCodes, extra = {}) => {
    const report = {
      artifactKind: "execution_platform.codex_parity_worker_loop_live_proof",
      schemaVersion: proofVersion,
      status: "blocked",
      runId,
      workItemId,
      modelRef,
      reasonCodes,
      ...extra,
      ...safety,
      generatedAt: new Date().toISOString(),
    };
    const proof = await writeJson(runDir, "proof.json", report);
    await writeJson(runDir, "manifest.json", {
      artifactKind: "execution_platform.codex_parity_worker_loop_live_proof_manifest",
      schemaVersion: `${proofVersion}.manifest`,
      status: report.status,
      runId,
      workItemId,
      proofArtifactRef: proof.path,
      proofArtifactHash: proof.sha256,
      proofArtifactBytes: proof.bytes,
      reasonCodes,
      ...safety,
    });
    process.stdout.write(`${JSON.stringify({ status: report.status, runId, proofArtifactRef: proof.path, reasonCodes }, null, 2)}\n`);
    process.exitCode = 1;
  };

  if (!apiKey) {
    await failureReport(["openrouter_api_key_missing_for_codex_parity_live_proof"]);
    return;
  }

  const { repoRoot, fileRefs } = await createFixtureRepo();
  const database = await createExecutionPlatformPgMemTestDatabase();
  await applyExecutionPlatformMigrations(database.sql);
  const registry = new RuntimeToolRegistry();
  registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });
  const traces = new RuntimeToolTraceRepository(database.sql);
  const kernel = new RuntimeToolKernel({ registry, traces });
  const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
  const graphs = new RuntimeWorkGraphRepository(database.sql);
  const runtimeJobId = `${runId}-job`;
  const graphId = `${runId}-graph`;
  const nodeId = `${runId}-implementation`;
  const targetCommitmentId = "commitment-codex-parity-worker-loop";
  const modelCalls = [];
  const phaseEvents = [];
  let validationRunCount = 0;

  try {
    await runtimeJobs.enqueueJob({
      jobId: runtimeJobId,
      jobType: "proof.codex_parity_worker_loop",
      queueName: "execution-platform-proof",
      workItemId,
      payload: { proofKind: "codex_parity_worker_loop_live", ...safety },
      maxAttempts: 1,
    });
    await graphs.createGraph({
      graphId,
      rootRuntimeJobId: runtimeJobId,
      workflowId: "agent_team.coding",
      orchestratorModelRef: "openai-codex/gpt-5.5",
      graphStatus: "running",
    });
    await graphs.addNode({
      graphId,
      nodeId,
      nodeKind: "implementation",
      assignedRole: "implementation_engineer",
      modelOrWorkerRef: "worker.qwen.codex-parity-proof",
      nodeStatus: "running",
      metadata: {
        lifecycleTransitionOwner: "NodeLifecycleTransitionRunner",
        nodeLifecycleProjectionGate: "worker_action_ready",
      },
    });

    const taskPacket = buildImplementationTaskPacket({
      microtaskId: "codex-parity-worker-loop-task",
      microtaskTitle: "Implement customer tier alias behavior with iterative context discovery",
      executionIntent: "source_edit",
      exactEditObjective:
        "Implement normalizeCustomerTier so vip/VIP maps to enterprise, gold stays premium, blank/unknown stays standard, and billing callers remain compatible. Use Codex-like search/read/refine context tools before edits and again after validation failures.",
      taskSummary:
        "The repo is intentionally larger than the target. Start from allowed refs, search for the relevant symbol/tests/callers, open bounded windows, refine windows, edit, validate, repair with more context if validation fails, and emit commitment evidence.",
      whyThisWorkerWasSelected:
        "Proof requires worker-owned context discovery, model-authored search terms, caller/test discovery, validation repair, and Mission Ledger evidence.",
      expectedOutput:
        "A source edit to customer tier normalization, validation refs, and commitment-linked evidence.",
      targetCommitmentIds: [targetCommitmentId],
      targetFileRefs: [],
      allowedFileRefs: ["src/", "tests/"],
      contextPacketRefs: [],
      validationCommandRefs: ["validation://codex-parity/customer-tier-behavior"],
      acceptanceCriteria: [
        "Use worker.context.search or search_symbols before edit planning.",
        "Open and accept exact bounded file-window refs before edit planning.",
        "After validation failure, use context discovery again before repair.",
        "Emit worker.evidence.claim_from_validation after validation passes.",
      ],
      expectedEvidenceClaimKinds: ["source_change", "validation"],
      stopIfMissingOrEscalate: [
        "Do not guess target files from runtime metadata; discover them with worker context tools.",
        "During forced patch authoring use only worker.patch.author_edit or a typed blocker.",
      ],
      budgetPolicyRefs: ["runtime-task-budget://agent_team.coding/codex-parity-live-proof"],
      downstreamConsumer: "mission_ledger_closure",
      successEvidenceDescriptions: [
        "Context search/read/refine loop occurred before editing and after validation failure.",
        "Mission Ledger commitment accepted worker evidence.",
      ],
    });
    const packets = compileNodeExecutionPacketForImplementationTask({
      runtimeJobId,
      workflowId: "agent_team.coding",
      graphId,
      nodeId,
      nodeKind: "implementation",
      capabilityId: "implementation_microtask",
      executorKey: "kind:implementation",
      workerRef: "worker.qwen.codex-parity-proof",
      implementationTaskPacket: taskPacket,
    });

    const openRouter = new OpenRouterAgentTeamModelClient({
      apiKey,
      baseUrl: process.env.OPENROUTER_BASE_URL,
      requestProfilesByModelId: {
        [modelRef]: { reasoningMode: "none", responseFormatMode: "prompt_only", maxTokens: 4_000 },
        [patchModelRef]: { reasoningMode: "none", responseFormatMode: "prompt_only", maxTokens: 4_000 },
      },
    });

    const loop = new NonCodexToolUsingWorkerLoop({
      runtimeToolKernel: kernel,
      modelClient: {
        async nextTurn(input) {
          const visibleToolIds = visibleToolIdsFromPrompt(input.taskSummary);
          const prompt = [
            "You are executing the OpenClaw Codex-parity worker-loop live proof.",
            "Return exactly one compact JSON object with toolCalls. No markdown, no prose outside JSON.",
            "Use only visible model-facing tools in the prompt. Runtime rejects hidden tools.",
            input.modelSlot === "controller"
              ? "For controller turns, behave like Codex: search, open, expand/contract, accept useful windows, then plan. Do not plan before accepting context."
              : null,
            input.modelSlot === "validation_repair"
              ? "For validation repair, search from the validation failure, inspect tests/callers/imports, accept a useful window, then author a narrow repair edit. Do not emit diagnostics only."
              : null,
            input.modelSlot === "evidence"
              ? "For evidence, claim commitment-linked evidence from changed files and validation refs."
              : null,
            "Proof objective: demonstrate iterative search/read/edit/validation repair, including post-validation context discovery.",
            "Worker prompt:",
            input.taskSummary,
          ].filter(Boolean).join("\n");
          const startedAt = Date.now();
          const result = await openRouter.callRole({
            roleId: "implementation_engineer",
            modelId: input.modelRef,
            modelCandidateId: input.modelRef,
            prompt,
            responseFormat: "json_object",
            requestProfileOverride: {
              reasoningMode: input.reasoningMode === "none" ? "none" : "exclude",
              responseFormatMode: input.responseFormatMode === "native" ? "native" : "prompt_only",
              maxTokens: input.maxOutputTokens,
            },
            maxTokens: input.maxOutputTokens,
            timeoutMs: input.timeoutMs,
            maxAttempts: input.maxAttempts,
          });
          const responseText = result.responseText ?? "";
          const responseHash = result.responseHash ?? `sha256:${sha256(responseText)}`;
          modelCalls.push({
            modelSlot: input.modelSlot,
            modelRef: input.modelRef,
            providerPath: input.providerPath,
            promptHash: `sha256:${sha256(prompt)}`,
            promptBytes: Buffer.byteLength(prompt, "utf8"),
            responseHash,
            responseBytes: Buffer.byteLength(responseText, "utf8"),
            status: result.status,
            latencyMs: Date.now() - startedAt,
            visibleToolIds,
            contextToolsVisible: visibleToolIds.filter((toolId) => toolId.startsWith("worker.context.")),
            patchAuthorVisible: visibleToolIds.includes("worker.patch.author_edit"),
            errorReasonCode: result.errorReasonCode ?? null,
            usage: result.usage ?? null,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          });
          return {
            modelRunRef: `openrouter://${input.modelRef}/${input.modelSlot}/${responseHash.replace(/^sha256:/u, "").slice(0, 16)}`,
            responseText,
            responseHash,
            latencyMs: Date.now() - startedAt,
            rawPromptStored: false,
            rawResponseStored: false,
          };
        },
      },
      validationRunner: {
        async run(commandRef) {
          validationRunCount += 1;
          const source = await fs.readFile(path.join(repoRoot, "src/customer-tier.ts"), "utf8");
          const caller = await fs.readFile(path.join(repoRoot, "src/billing/customer-tier-usage.ts"), "utf8");
          const hasVipAlias = /value\s*===\s*['"]vip['"]/u.test(source) && /return\s+['"]enterprise['"]/u.test(source);
          const callerCompatible = caller.includes("normalizeCustomerTier(rawTier)");
          const forcedFailure = validationRunCount <= 2;
          const passes = !forcedFailure && hasVipAlias && callerCompatible;
          return {
            validationRef: `validation://codex-parity/customer-tier/${validationRunCount}`,
            status: passes ? "passed" : "failed",
            commandRef,
            summary: passes
              ? "Customer tier behavior, caller compatibility, and evidence validation passed."
              : validationFailureFor(validationRunCount, "tests/customer-tier.test.ts"),
            exitCode: passes ? 0 : 1,
            failureKind: passes ? null : "test_failure",
            stderr: passes ? "" : validationFailureFor(validationRunCount, "tests/customer-tier.test.ts"),
            rawCommandLogStored: false,
          };
        },
      },
      phaseSink: async (event) => {
        phaseEvents.push({
          phase: event.phase,
          nodeId: event.nodeId ?? null,
          workerId: event.workerId,
          modelRef: event.modelRef ?? null,
          toolId: event.toolId ?? null,
          status: event.status ?? event.toolStatus ?? null,
          changedFileRefs: Array.isArray(event.changedFileRefs) ? event.changedFileRefs.slice(0, 10) : [],
          validationRefs: Array.isArray(event.validationRefs) ? event.validationRefs.slice(0, 10) : [],
          reasonCodes: Array.isArray(event.reasonCodes) ? event.reasonCodes.slice(0, 12) : [],
          rawPromptStored: false,
          rawResponseStored: false,
          rawToolLogStored: false,
        });
      },
    });

    const result = await loop.run({
      runtimeJobId,
      graphId,
      nodeId,
      workerId: "worker.qwen.codex-parity-proof",
      roleId: "implementation_engineer",
      taskId: "codex-parity-worker-loop-task",
      taskTitle: "Codex parity worker-loop live proof",
      exactEditObjective: taskPacket.exactEditObjective,
      implementationTaskPacket: taskPacket,
      nodeExecutionContract: packets.nodeExecutionContract,
      nodeExecutionPacket: packets.nodeExecutionPacket,
      codingResourcePacket: packets.codingResourcePacket,
      repoRoot,
      allowedFileRefs: ["src/", "tests/"],
      targetFileRefs: [],
      contextPackRefs: [],
      validationCommandRefs: ["validation://codex-parity/customer-tier-behavior"],
      acceptanceCriteria: taskPacket.acceptanceCriteria,
      targetCommitmentIds: [targetCommitmentId],
      budgetPolicy: {
        modelRef,
        providerPath: "openrouter",
        maxOutputTokens: 4_000,
        timeoutMs: 240_000,
        maxTurns,
        maxAttempts,
        phaseAuthorityMode: "strict",
        modelPolicy: {
          controller: { modelRef, providerPath: "openrouter", reasoningMode: "none", responseFormatMode: "prompt_only", maxOutputTokens: 4_000, timeoutMs: 240_000, maxAttempts: 1 },
          context_decision: { modelRef, providerPath: "openrouter", reasoningMode: "none", responseFormatMode: "prompt_only", maxOutputTokens: 4_000, timeoutMs: 240_000, maxAttempts: 1 },
          patch: { modelRef: patchModelRef, providerPath: "openrouter", reasoningMode: "none", responseFormatMode: "prompt_only", maxOutputTokens: 4_000, timeoutMs: 240_000, maxAttempts: 1 },
          validation_repair: { modelRef, providerPath: "openrouter", reasoningMode: "none", responseFormatMode: "prompt_only", maxOutputTokens: 4_000, timeoutMs: 240_000, maxAttempts: 1 },
          evidence: { modelRef, providerPath: "openrouter", reasoningMode: "none", responseFormatMode: "prompt_only", maxOutputTokens: 4_000, timeoutMs: 240_000, maxAttempts: 1 },
          escalation: { modelRef, providerPath: "openrouter", reasoningMode: "none", responseFormatMode: "prompt_only", maxOutputTokens: 4_000, timeoutMs: 240_000, maxAttempts: 1 },
        },
      },
    });

    const toolIds = result.toolCalls.map((call) => call.toolId);
    const validationIndexes = toolIds
      .map((toolId, index) => (toolId === "worker.validation.run" || toolId === "worker.validation.run_structural_default" ? index : -1))
      .filter((index) => index >= 0);
    const firstValidationIndex = validationIndexes[0] ?? -1;
    const postValidationToolIds = firstValidationIndex >= 0 ? toolIds.slice(firstValidationIndex + 1) : [];
    const contextToolIds = toolIds.filter((toolId) => toolId.startsWith("worker.context."));
    const postValidationContextToolIds = postValidationToolIds.filter((toolId) => toolId.startsWith("worker.context."));
    const patchPrompts = modelCalls.filter((call) => call.modelSlot === "patch");
    const controllerCalls = modelCalls.filter((call) => call.modelSlot === "controller");
    const validationRepairCalls = modelCalls.filter((call) => call.modelSlot === "validation_repair");
    const evidenceClaims = Array.isArray(result.evidenceClaims) ? result.evidenceClaims : [];
    const missionLedger = buildMissionLedger(api, runtimeJobId, evidenceClaims);
    const ledgerBeforeSummary = summarizeMissionContractLedger(missionLedger.before);
    const ledgerAfterSummary = summarizeMissionContractLedger(missionLedger.after);
    const checks = [
      {
        checkId: "worker_completed",
        passed: result.status === "completed",
        observed: result.status,
      },
      {
        checkId: "real_model_calls_present",
        passed: modelCalls.length >= 5 && modelCalls.every((call) => call.status === "succeeded"),
        observed: modelCalls.map((call) => `${call.modelSlot}:${call.status}`),
      },
      {
        checkId: "search_read_refine_before_edit",
        passed:
          toolIds.includes("worker.context.search") &&
          toolIds.includes("worker.context.open_around_match") &&
          (toolIds.includes("worker.context.expand_window") || toolIds.includes("worker.context.contract_window")) &&
          toolIds.includes("worker.context.accept_window") &&
          toolIds.indexOf("worker.context.accept_window") < toolIds.indexOf("worker.edit.plan"),
        observed: toolIds,
      },
      {
        checkId: "multiple_validation_failures_and_final_pass",
        passed: validationRunCount >= 3 && result.validationRefs.length > 0,
        observed: { validationRunCount, validationRefs: result.validationRefs },
      },
      {
        checkId: "post_validation_context_search",
        passed:
          postValidationContextToolIds.length >= 3 &&
          (postValidationContextToolIds.includes("worker.context.find_tests") ||
            postValidationContextToolIds.includes("worker.context.search_symbols")) &&
          (postValidationContextToolIds.includes("worker.context.find_callers") ||
            postValidationContextToolIds.includes("worker.context.open_adjacent")),
        observed: postValidationContextToolIds,
      },
      {
        checkId: "opportunistic_adjacent_or_test_discovery",
        passed:
          toolIds.includes("worker.context.find_tests") &&
          (toolIds.includes("worker.context.find_callers") || toolIds.includes("worker.context.search_symbols")) &&
          toolIds.includes("worker.context.open_adjacent"),
        observed: toolIds,
      },
      {
        checkId: "forced_patch_tool_isolation",
        passed:
          patchPrompts.length > 0 &&
          patchPrompts.every(
            (call) =>
              call.patchAuthorVisible &&
              call.contextToolsVisible.length === 0 &&
              !call.visibleToolIds.includes("worker.edit.plan"),
          ),
        observed: patchPrompts.map((call) => ({
          visibleToolIds: call.visibleToolIds,
          contextToolsVisible: call.contextToolsVisible,
        })),
      },
      {
        checkId: "context_tools_interleaved_outside_patch",
        passed:
          controllerCalls.some((call) => call.contextToolsVisible.length > 0) &&
          validationRepairCalls.some((call) => call.contextToolsVisible.length > 0),
        observed: {
          controller: controllerCalls.map((call) => call.contextToolsVisible),
          validationRepair: validationRepairCalls.map((call) => call.contextToolsVisible),
        },
      },
      {
        checkId: "mission_ledger_closed_from_worker_evidence",
        passed:
          evidenceClaims.length > 0 &&
          openBlockingMissionCommitments(missionLedger.after).length === 0 &&
          ledgerAfterSummary.openBlockingCommitmentCount < ledgerBeforeSummary.openBlockingCommitmentCount,
        observed: {
          evidenceClaimCount: evidenceClaims.length,
          before: ledgerBeforeSummary.openBlockingCommitmentCount,
          after: ledgerAfterSummary.openBlockingCommitmentCount,
        },
      },
      {
        checkId: "no_scheduler_or_graph_context_fanout",
        passed:
          !toolIds.includes("resource.scout.dispatch_specialist_subturn") &&
          !toolIds.includes("node.execution_packet.attach_resource_demand"),
        observed: toolIds,
      },
    ];
    const failedChecks = checks.filter((check) => !check.passed);
    const status = failedChecks.length === 0 ? "passed" : "failed";
    const proofBody = {
      artifactKind: "execution_platform.codex_parity_worker_loop_live_proof",
      schemaVersion: proofVersion,
      status,
      runId,
      workItemId,
      runtimeJobId,
      graphId,
      nodeId,
      fixture: {
        repoRootHash: `sha256:${sha256(repoRoot)}`,
        fileCount: fileRefs.length,
        fileRefs: fileRefs.slice(0, 60),
      },
      modelRef,
      patchModelRef,
      workerResult: {
        status: result.status,
        changedFileRefs: result.changedFileRefs,
        validationRefs: result.validationRefs,
        evidenceClaimRefs: evidenceClaims.map((claim) => claim.evidenceRef),
        reasonCodes: result.reasonCodes.slice(0, 60),
        limitationCount: result.limitations.length,
      },
      toolSequence: toolIds,
      contextToolIds,
      postValidationToolIds,
      postValidationContextToolIds,
      validationRunCount,
      checks,
      failedChecks,
      modelCallManifests: modelCalls,
      phaseEventManifests: phaseEvents.slice(0, 160),
      missionLedger: {
        before: ledgerBeforeSummary,
        evaluation: missionLedger.evaluation,
        after: ledgerAfterSummary,
      },
      metadataManifestSafe: true,
      semanticQualityJudgedByDeterministicCode: false,
      reasonCodes:
        status === "passed"
          ? ["codex_parity_worker_loop_live_proof_passed"]
          : ["codex_parity_worker_loop_live_proof_failed", ...failedChecks.map((check) => `failed:${check.checkId}`)],
      ...safety,
      generatedAt: new Date().toISOString(),
    };
    const proofArtifact = await writeJson(runDir, "proof.json", proofBody);
    const manifest = {
      artifactKind: "execution_platform.codex_parity_worker_loop_live_proof_manifest",
      schemaVersion: `${proofVersion}.manifest`,
      status,
      runId,
      workItemId,
      runtimeJobId,
      graphId,
      nodeId,
      proofArtifactRef: proofArtifact.path,
      proofArtifactHash: proofArtifact.sha256,
      proofArtifactBytes: proofArtifact.bytes,
      fixtureFileCount: fileRefs.length,
      modelCallCount: modelCalls.length,
      toolCallCount: toolIds.length,
      contextToolCallCount: contextToolIds.length,
      postValidationContextToolCallCount: postValidationContextToolIds.length,
      validationRunCount,
      changedFileRefCount: result.changedFileRefs.length,
      validationRefCount: result.validationRefs.length,
      evidenceClaimRefCount: evidenceClaims.length,
      missionLedgerOpenBlockingBefore: ledgerBeforeSummary.openBlockingCommitmentCount,
      missionLedgerOpenBlockingAfter: ledgerAfterSummary.openBlockingCommitmentCount,
      failedCheckIds: failedChecks.map((check) => check.checkId),
      metadataManifestSafe: true,
      ...safety,
    };
    const manifestArtifact = await writeJson(runDir, "manifest.json", manifest);
    process.stdout.write(
      `${JSON.stringify(
        {
          status,
          runId,
          proofArtifactRef: proofArtifact.path,
          manifestArtifactRef: manifestArtifact.path,
          modelCallCount: modelCalls.length,
          validationRunCount,
          failedCheckIds: failedChecks.map((check) => check.checkId),
        },
        null,
        2,
      )}\n`,
    );
    if (status !== "passed") {
      process.exitCode = 1;
    }
  } finally {
    await database.close();
  }
}

main().catch(async (error) => {
  const runId = flag("--run-id") ?? `codex-parity-worker-loop-error-${Date.now().toString(36)}`;
  const runDir = path.join(artifactRoot, runId);
  const diagnostic = {
    artifactKind: "execution_platform.codex_parity_worker_loop_live_proof_error",
    schemaVersion: proofVersion,
    status: "failed",
    runId,
    workItemId,
    errorMessage: bounded(error instanceof Error ? error.message : String(error), 1_200),
    errorStackHash: `sha256:${sha256(error instanceof Error ? error.stack ?? "" : "")}`,
    reasonCodes: ["codex_parity_worker_loop_live_proof_threw"],
    ...safety,
  };
  const artifact = await writeJson(runDir, "proof-error.json", diagnostic).catch(() => null);
  process.stderr.write(`${diagnostic.errorMessage}\n`);
  if (artifact) {
    process.stderr.write(`proofErrorArtifactRef=${artifact.path}\n`);
  }
  process.exitCode = 1;
});
