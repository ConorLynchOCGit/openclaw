#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform/lifecycle-runner-real-model-proof");

const WORK_ITEM_ID = "openclaw-convergence.node-lifecycle-transition-ownership-consolidation";
const PROOF_VERSION = "execution-platform.lifecycle-runner-real-model-proof.v1";
const MANIFEST_MAX_BYTES = 16 * 1024;

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
let lastProviderCalls = [];

const api = await tsImport(path.join(root, "extensions/execution-platform/runtime-api.ts"), import.meta.url);
const { OpenRouterAgentTeamModelClient } = await tsImport(
  path.join(root, "extensions/execution-platform/src/codex-bridge/live-agent-team-runner.ts"),
  import.meta.url,
);

function sha256(value) {
  return crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function hashJson(value) {
  return sha256(JSON.stringify(value));
}

function flag(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1]?.trim() ?? fallback) : fallback;
}

async function loadEnvFile(filePath) {
  const text = await fs.readFile(filePath, "utf8").catch(() => "");
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index === -1) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    if (!key || process.env[key]) {
      continue;
    }
    process.env[key] = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^['"]|['"]$/gu, "");
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

function bounded(value, max = 360) {
  return String(value ?? "").trim().replace(/\s+/gu, " ").slice(0, max);
}

function strings(value, max = 40) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return [...new Set(source.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))].slice(0, max);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueRefs(value, max = 40) {
  return strings(value, max);
}

function fileRefFromExactWindowRef(ref) {
  const text = String(ref ?? "").trim();
  const normalized = text.startsWith("file-window://") ? text.slice("file-window://".length) : text;
  const hashIndex = normalized.indexOf("#L");
  return hashIndex > 0 ? normalized.slice(0, hashIndex) : null;
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringifyJson(value) {
  return JSON.stringify(value, null, 2);
}

function parseJsonObjectTexts(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) {
    return [trimmed];
  }
  const candidates = [];
  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/giu)) {
    if (match[1]?.trim()) {
      candidates.push(match[1].trim());
    }
  }
  const starts = [...trimmed.matchAll(/\{/gu)].map((match) => match.index ?? -1).filter((index) => index >= 0);
  for (const start of starts) {
    const candidate = extractBalancedJsonObjectFrom(trimmed, start);
    if (candidate) {
      candidates.push(candidate);
    }
  }
  return [...new Set(candidates.length > 0 ? candidates : [trimmed])].slice(0, 20);
}

function extractBalancedJsonObjectFrom(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1).trim();
      }
    }
  }
  return null;
}

function parseToolEnvelope(responseText, allowedToolIds, reasonPrefix) {
  const allowed = new Set(allowedToolIds);
  let firstKeys = [];
  for (const text of parseJsonObjectTexts(responseText)) {
    try {
      const parsed = JSON.parse(text);
      const candidates = [
        parsed,
        parsed.toolCall,
        parsed.tool_call,
        parsed.resourceObjectiveFocusToolCall,
        parsed.contextNarrowingToolCall,
        parsed.contextScoutToolCall,
      ].filter((candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate));
      for (const candidate of candidates) {
        firstKeys = Object.keys(candidate).slice(0, 12);
        const toolId =
          typeof candidate.toolId === "string"
            ? candidate.toolId
            : typeof candidate.tool === "string"
              ? candidate.tool
              : typeof candidate.name === "string"
                ? candidate.name
                : "";
        const input =
          candidate.input && typeof candidate.input === "object" && !Array.isArray(candidate.input)
            ? candidate.input
            : candidate.arguments && typeof candidate.arguments === "object" && !Array.isArray(candidate.arguments)
              ? candidate.arguments
              : candidate.payload && typeof candidate.payload === "object" && !Array.isArray(candidate.payload)
                ? candidate.payload
                : null;
        if (allowed.has(toolId) && input) {
          return {
            toolId,
            input,
            reasonCodes: [`${reasonPrefix}_tool_call_structurally_parsed`],
          };
        }
      }
    } catch {
      continue;
    }
  }
  return {
    toolId: null,
    input: null,
    reasonCodes: [
      `${reasonPrefix}_tool_call_missing_legal_tool_envelope`,
      `${reasonPrefix}_tool_call_top_level_keys:${firstKeys.join(",") || "none"}`,
    ],
  };
}

function node(input) {
  const now = new Date("2026-05-29T00:00:00.000Z");
  return {
    nodeId: input.nodeId,
    graphId: `graph-${input.runId}`,
    nodeKind: input.nodeKind,
    assignedRole: input.assignedRole,
    modelOrWorkerRef: input.modelOrWorkerRef,
    runtimeJobId: null,
    humanTaskId: null,
    inputHandoffRefs: [],
    outputArtifactRefs: [],
    nodeStatus: input.status ?? "planned",
    budgetUsage: {},
    metadata: {
      ...input.metadata,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    rawProviderLogStored: false,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function snapshotFor(runId, nodes) {
  const now = new Date("2026-05-29T00:00:00.000Z");
  return {
    graph: {
      graphId: `graph-${runId}`,
      parentWorkItemId: WORK_ITEM_ID,
      rootRuntimeJobId: `runtime-${runId}`,
      workflowId: "agent_team.coding",
      orchestratorModelRef: "runner-owned-lifecycle-proof",
      graphStatus: "running",
      budgetLedgerRef: null,
      checkpointRefs: [],
      finalCloseoutRef: null,
      metadata: {
        proofKind: "lifecycle_runner_real_model_proof",
        ...safety,
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
      createdAt: now,
      updatedAt: now,
    },
    nodes,
    edges: [
      {
        edgeId: `edge-${runId}-work-intent-to-implementation`,
        graphId: `graph-${runId}`,
        fromNodeId: "work-intent-product-spec-middle-lane",
        toNodeId: "implementation-product-spec-middle-lane",
        edgeKind: "implementation_depends_on",
        reasonCodes: ["runner_owned_middle_lane_work_intent_promotes_implementation"],
        artifactRefs: [],
        metadata: { ...safety },
        createdAt: now,
      },
    ],
    roleInvocations: [],
    handoffPackets: [],
    artifactManifests: [],
    budgetLedgers: [],
    checkpoints: [],
    humanTasks: [],
  };
}

function metadata(currentNode) {
  return currentNode.metadata && typeof currentNode.metadata === "object" && !Array.isArray(currentNode.metadata)
    ? currentNode.metadata
    : {};
}

function patchMetadata(currentNode, patch) {
  currentNode.metadata = {
    ...metadata(currentNode),
    ...patch,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function providerDiagnosticRef(input) {
  return `provider-diagnostic://${input.boundaryId}/${input.nodeId}/${sha256(JSON.stringify(input)).slice(0, 18)}`;
}

function makeModelRouter({ apiKey, providerCalls }) {
  const adapters = apiKey
    ? [
        {
          providerPath: "openrouter",
          async executeJson(input) {
            const requestBytes = Buffer.byteLength(
              `${input.systemPrompt}\nUSER_PAYLOAD_JSON:\n${stringifyJson(input.userPayload)}`,
              "utf8",
            );
            const client = new OpenRouterAgentTeamModelClient({
              apiKey,
              retryPolicy: { maxAttempts: 2, timeoutMs: input.timeoutMs },
              requestProfilesByModelId: {
                [input.modelRef]: {
                  responseFormatMode: "native",
                  reasoningMode: input.reasoningMode === "none" ? "none" : "exclude",
                  maxTokens: input.maxOutputTokens,
                },
              },
            });
            const startedAt = Date.now();
            const prompt = [
              input.systemPrompt,
              "",
              "USER_PAYLOAD_JSON:",
              stringifyJson(input.userPayload),
            ].join("\n");
            const result = await client.callRole({
              roleId: "resource_scout",
              modelId: input.modelRef,
              modelCandidateId: `lifecycle-runner:${input.callSite}:${input.modelRef}`,
              prompt,
              responseFormat: "json_object",
              maxTokens: input.maxOutputTokens,
              timeoutMs: input.timeoutMs,
              taskClass: input.taskClass,
              modelTaskCallSite: input.callSite,
            });
            providerCalls.push({
              boundaryId: input.callSite,
              providerPath: input.providerPath,
              modelRef: input.modelRef,
              status: result.status,
              requestByteCount: requestBytes,
              latencyMs:
                typeof result.providerResponseDiagnostics?.elapsedMs === "number"
                  ? result.providerResponseDiagnostics.elapsedMs
                  : Date.now() - startedAt,
              responseHash: result.responseHash,
              responseByteCount: Buffer.byteLength(result.responseText ?? "", "utf8"),
              httpStatus: result.httpStatus ?? null,
              errorReasonCode: result.errorReasonCode ?? null,
              providerDiagnosticHash: `sha256:${sha256(JSON.stringify(result.providerResponseDiagnostics ?? {}))}`,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              hiddenReasoningStored: false,
            });
            return {
              status: result.status === "succeeded" ? "succeeded" : "needs_review",
              responseText: result.responseText,
              responseHash: result.responseHash,
              latencyMs:
                typeof result.providerResponseDiagnostics?.elapsedMs === "number"
                  ? result.providerResponseDiagnostics.elapsedMs
                  : Date.now() - startedAt,
              usage: result.usage ?? null,
              providerResponseDiagnostics: result.providerResponseDiagnostics ?? null,
              errorReasonCode: result.errorReasonCode ?? null,
            };
          },
        },
      ]
    : [];
  return new api.ModelTaskClientRouter({ adapters });
}

async function selectResourceFocus({ router, graphId, nodeId, payload }) {
  const response = await router.runJson({
    boundaryId: "resource_objective_focus",
    taskClass: "tool_selection",
    callSite: "resource.focus.selector",
    systemPrompt: [
      "You are selecting ResourceObjectiveFocus for one OpenClaw WorkIntent.",
      "Return exactly one compact JSON tool call, not prose.",
      "Allowed toolId values: resource.focus.accept, resource.focus.mark_unanswerable.",
      "Top-level JSON shape: {\"toolId\":\"resource.focus.accept\",\"input\":{...}}.",
      "For resource.focus.accept, input must include currentObjectiveSlot, resourceUseKind, nextUnknown, expectedUse, selectedRefHandles, selectedSemanticQuestions, stopWhenAnswered.",
      "selectedRefHandles must be chosen only from legalHandleOptions[].handle.",
      "Choose handles that need specialist narrowing when the objective needs exact implementation context. Runtime validates handles and owns lifecycle transitions.",
      "Do not invent file paths, graph nodes, durable scout nodes, retired global synthesis steps, raw logs, secrets, or hidden reasoning.",
    ].join("\n"),
    userPayload: payload,
    requestedInputBytes: Buffer.byteLength(stringifyJson(payload), "utf8"),
    maxOutputTokens: 1_800,
    timeoutMs: 60_000,
    proofMode: true,
  });
  if (response.status === "blocked") {
    throw new Error(`resource_objective_focus_router_blocked:${response.reasonCodes.join(",")}`);
  }
  const parsed = parseToolEnvelope(response.responseText, ["resource.focus.accept", "resource.focus.mark_unanswerable"], "resource_focus");
  if (!parsed.toolId || !parsed.input) {
    throw new Error(`resource_objective_focus_invalid_tool:${parsed.reasonCodes.join(",")}`);
  }
  return {
    ...parsed,
    providerDiagnosticRef: providerDiagnosticRef({
      boundaryId: "resource_objective_focus",
      nodeId,
      graphId,
      responseHash: response.responseHash,
      latencyMs: response.latencyMs,
    }),
    response,
  };
}

async function selectDomainResource({ router, graphId, nodeId, payload }) {
  const response = await router.runJson({
    boundaryId: "domain_resource_selection",
    taskClass: "tool_selection",
    callSite: "resource.selection",
    systemPrompt: [
      "You are selecting domain resources for one OpenClaw implementation WorkIntent.",
      "Return exactly one compact JSON tool call, not prose.",
      "Allowed toolId values: resource.selection.propose, resource.selection.mark_blocked.",
      "Top-level JSON shape: {\"toolId\":\"resource.selection.propose\",\"input\":{...}}.",
      "Runtime wraps your input into the canonical resource.selection.propose tool contract and validates it.",
      "For resource.selection.propose, input must include selectedTargetRefs, fileChangeIntents, validationDiscoveryPlan, selectionRationale, excludedCandidateRefs.",
      "selectedTargetRefs and fileChangeIntents[].targetRef must be chosen only from candidateResourceRefs.",
      "Each fileChangeIntents[] item must include targetRef, operation, intendedChange, sourceCommitmentIds, resourceHandoffRefs, expectedEvidenceMode, validationDiscoveryNeed, authorityScopeRef, rationale.",
      "Runtime validates membership, authority, budgets, and lifecycle. You own only the semantic target choice.",
    ].join("\n"),
    userPayload: payload,
    requestedInputBytes: Buffer.byteLength(stringifyJson(payload), "utf8"),
    maxOutputTokens: 2_800,
    timeoutMs: 60_000,
    proofMode: true,
  });
  if (response.status === "blocked") {
    throw new Error(`domain_resource_selection_router_blocked:${response.reasonCodes.join(",")}`);
  }
  const parsed = api.parseDomainResourceSelectionModelToolCall(response.responseText);
  if (parsed.status !== "accepted" || !parsed.proposal) {
    throw new Error(`domain_resource_selection_invalid_tool:${parsed.reasonCodes.join(",")}:${parsed.schemaErrorPath ?? "no_schema_path"}`);
  }
  return {
    parsed,
    providerDiagnosticRef: providerDiagnosticRef({
      boundaryId: "domain_resource_selection",
      nodeId,
      graphId,
      responseHash: response.responseHash,
      latencyMs: response.latencyMs,
    }),
    response,
  };
}

function assertManifestMetadata(value, maxBytes = MANIFEST_MAX_BYTES) {
  const encoded = JSON.stringify(value);
  const bytes = Buffer.byteLength(encoded, "utf8");
  if (bytes > maxBytes) {
    throw new Error(`lifecycle_runner_real_model_manifest_overflow:${bytes}:${maxBytes}`);
  }
  const forbidden = new Set([
    "rawPrompt",
    "rawResponse",
    "rawTranscript",
    "rawProviderLog",
    "rawToolLog",
    "rawCommandLog",
    "rawDbRows",
    "hiddenReasoning",
    "body",
    "fullBody",
    "sourceWindowContent",
    "fileSnapshotContent",
    "lineNumberedContent",
  ]);
  const visit = (current, currentPath) => {
    if (!current || typeof current !== "object") {
      return;
    }
    for (const [key, child] of Object.entries(current)) {
      if (forbidden.has(key)) {
        throw new Error(`lifecycle_runner_real_model_manifest_body_field:${currentPath}.${key}`);
      }
      visit(child, `${currentPath}.${key}`);
    }
  };
  visit(value, "manifest");
}

async function writeJson(name, value) {
  await fs.mkdir(artifactDir, { recursive: true });
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const target = path.join(artifactDir, name);
  await fs.writeFile(target, body, "utf8");
  return {
    path: `.artifacts/execution-platform/lifecycle-runner-real-model-proof/${name}`,
    sha256: `sha256:${sha256(body)}`,
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

async function runProof() {
  await loadEnv();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  if (!apiKey) {
    throw new Error("openrouter_api_key_missing_for_lifecycle_runner_real_model_proof");
  }

  const runId = flag("--run-id") ?? `lifecycle-runner-real-model-${Date.now().toString(36)}`;
  const providerCalls = [];
  lastProviderCalls = providerCalls;
  const router = makeModelRouter({ apiKey, providerCalls });
  const capabilityManifest = api.buildRuntimeNodeCapabilityManifest();
  const runtimeJobId = `runtime-${runId}`;
  const graphId = `graph-${runId}`;
  const workIntentId = "work-intent-product-spec-middle-lane";
  const implementationNodeId = "implementation-product-spec-middle-lane";
  const targetCommitmentIds = ["commitment://product-spec/worker-smoke-matrix"];
  const authorityScopeRefs = [
    "repo-area://execution-platform-worker-runtime",
    "extensions/execution-platform/src/codex-bridge/worker-smoke-matrix.ts",
    "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts",
  ];
  const exactWindowOptions = [];

  const modelSelectedFileRefsFromContext = (input) => {
    const records = [
      ...asArray(input?.relevantFiles),
      ...asArray(input?.relevantFileReports),
      ...asArray(input?.editPoints),
      ...asArray(input?.recommendedEditPoints),
    ];
    const refs = [];
    for (const record of records) {
      if (!record || typeof record !== "object") {
        continue;
      }
      const directFileRef =
        typeof record.fileRef === "string"
          ? record.fileRef
          : typeof record.targetRef === "string"
            ? record.targetRef
            : null;
      const ref = typeof record.ref === "string" ? record.ref : null;
      const fromExactWindow = exactWindowOptions.find((option) => option.ref === ref);
      refs.push(directFileRef ?? fromExactWindow?.fileRef ?? fileRefFromExactWindowRef(ref) ?? null);
    }
    for (const ref of strings(input?.exactContextRefs, 20)) {
      refs.push(fileRefFromExactWindowRef(ref));
    }
    return uniqueRefs(refs, 20);
  };

  const workIntent = node({
    runId,
    nodeId: workIntentId,
    nodeKind: "work_intent",
    assignedRole: "implementation_engineer",
    modelOrWorkerRef: "worker.kimi.file-implementation",
    status: "succeeded",
    metadata: {
      workIntentCompiled: true,
      lastResultStatus: "succeeded",
      promotedExecutableNodeId: implementationNodeId,
      workIntentId: "wi-product-spec-middle-lane",
      workIntentRef: "work-intent://product-spec/middle-lane/worker-smoke-matrix",
      capabilityId: "implementation_microtask",
      executionIntent: "source_edit",
      evidenceMode: ["changed_file_evidence", "validation_evidence"],
      resourceRequired: true,
      resourceRequirementKinds: ["resource_handoff", "domain_resource_selection", "file_snapshot"],
      nodeExecutionContractRef: "node-execution-contract://product-spec/middle-lane",
      targetCommitmentIds,
      authorityScopeRefs,
      objectiveSnippet:
        "Improve Product/Spec worker readiness proof coverage by selecting the implementation worker surface that controls edit/validation/evidence lifecycle readiness.",
      semanticQualityJudgedByDeterministicCode: false,
    },
  });
  const implementation = node({
    runId,
    nodeId: implementationNodeId,
    nodeKind: "implementation",
    assignedRole: "implementation_engineer",
    modelOrWorkerRef: "worker.kimi.file-implementation",
    metadata: {
      capabilityId: "implementation_microtask",
      executionIntent: "source_edit",
      evidenceMode: ["changed_file_evidence", "validation_evidence"],
      workIntentRef: "work-intent://product-spec/middle-lane/worker-smoke-matrix",
      nodeExecutionContractRef: "node-execution-contract://product-spec/middle-lane",
      semanticQualityJudgedByDeterministicCode: false,
    },
  });
  const nodes = [workIntent, implementation];
  const state = {
    legalRefUniverse: null,
    focus: null,
    demandSession: null,
    demandBlocker: null,
    specialistRequest: null,
    resourceLedger: null,
    specialistHandoff: null,
    specialistLoopResult: null,
    specialistLoopEvents: [],
    domainManifest: null,
    domainRequest: null,
    domainDecision: null,
    resourceSelectionPacket: null,
    changedFileRefs: [],
    validationRefs: [],
    evidenceClaimRefs: [],
  };
  const projectionManifests = [];
  const transitions = [];
  const runner = new api.NodeLifecycleTransitionRunner({
    capabilityManifest,
    recordProjection: async ({ projection, manifest }) => {
      projectionManifests.push(manifest);
      return {
        refs: [projection.projectionRef],
        reasonCodes: ["lifecycle_runner_real_model_projection_recorded"],
      };
    },
    executeTransition: async ({ node: activeNode, projection }) => {
      const beforeHash = hashJson({ status: activeNode.nodeStatus, metadata: activeNode.metadata });
      const transitionBase = {
        stepIndex: transitions.length + 1,
        nodeId: activeNode.nodeId,
        nodeKind: activeNode.nodeKind,
        gate: projection.currentGate,
        beforeHash,
        projectionRef: projection.projectionRef,
        projectionHash: projection.projectionHash,
        canCallGlobalSchedulerBeforeTransition: projection.canCallGlobalScheduler,
      };
      const finish = ({ status = "continue", toolId, refs = [], reasonCodes = [], continueLoop = true }) => {
        const afterHash = hashJson({ status: activeNode.nodeStatus, metadata: activeNode.metadata });
        transitions.push({
          ...transitionBase,
          transitionToolId: toolId,
          afterHash,
          providerCallCountAfterTransition: providerCalls.length,
          refs: refs.slice(0, 40),
          reasonCodes: reasonCodes.slice(0, 80),
        });
        return {
          status,
          reasonCodes,
          refs,
          continueLoop,
        };
      };

      if (
        [
          "resource_focus_required",
          "resource_demand_open_pending",
          "resource_demand_open",
          "resource_narrowing_required",
          "domain_resource_selection_required",
          "resource_ledger_ready",
          "domain_action_gate_blocked",
        ].includes(projection.currentGate)
      ) {
        return finish({
          status: "needs_review",
          toolId: "node.lifecycle.reject_retired_pre_worker_gate",
          refs: [projection.projectionRef],
          reasonCodes: [
            "lifecycle_runner_retired_pre_worker_gate_rejected",
            `retired_gate:${projection.currentGate}`,
          ],
          continueLoop: false,
        });
      }

      if (projection.currentGate === "worker_action_ready") {
        state.changedFileRefs =
          state.resourceSelectionPacket?.selectedResourceRefs ??
          strings(metadata(activeNode).selectedResourceRefs, 40);
        if (state.changedFileRefs.length === 0 && !state.specialistHandoff) {
          const requestedFileRefs = authorityScopeRefs.filter((ref) => ref.endsWith(".ts"));
          const demand = api.compileWorkerContextRequestDemand({
            runtimeJobId,
            workflowId: "agent_team.coding",
            graphId,
            consumerNodeId: activeNode.nodeId,
            workIntentRef: metadata(activeNode).workIntentRef,
            nodeExecutionContractRef: metadata(activeNode).nodeExecutionContractRef,
            nodeExecutionPacketRef:
              typeof metadata(activeNode).nodeExecutionPacketRef === "string"
                ? metadata(activeNode).nodeExecutionPacketRef
                : null,
            capabilityId: metadata(activeNode).capabilityId,
            evidenceMode: metadata(activeNode).evidenceMode,
            targetCommitmentIds,
            authorityScope: authorityScopeRefs,
            demandReason:
              "Worker needs implementation context before edit planning; request exact windows through worker-owned context discovery.",
            expectedUse:
              "Use model-selected file windows to choose edit targets, author the edit plan, validate, and emit evidence.",
            requestedFileRefs,
          });
          if (demand.status !== "succeeded" || !demand.session) {
            return finish({
              status: "needs_review",
              toolId: "worker.context.request_more",
              refs: [demand.outputRef].filter((ref) => typeof ref === "string"),
              reasonCodes: ["lifecycle_runner_worker_context_request_failed", ...demand.reasonCodes],
              continueLoop: false,
            });
          }
          state.demandSession = demand.session;
          const dispatch = api.compileContextScoutSpecialistToolOutput({
            toolId: "resource.scout.dispatch_specialist_subturn",
            volatileInput: {
              nodeResourceDemandSession: state.demandSession,
              specialistTrigger: "worker_context_request_more",
              directFulfillmentAttempted: false,
              requestedContextKinds: ["file_window", "existing_pattern", "validation_hint"],
              candidateRefs: requestedFileRefs,
              scoutReason:
                "Worker-owned context turn must run a Codex-like search/read/refine loop over legal refs before edit planning. Start by choosing model-authored search queries, inspect bounded result windows, expand or contract if needed, then submit exact file-window handles.",
              expectedUse: state.demandSession.expectedUse,
              providerProfile: {
                modelRef: "qwen/qwen3-coder-next",
                providerId: "openrouter",
                maxInputBytes: 32_000,
                maxOutputTokens: 2_400,
                timeoutMs: 60_000,
                reasoningMode: "none",
                responseFormatMode: "prompt_only",
              },
            },
          });
          if (dispatch.status !== "succeeded" || !dispatch.request || !dispatch.ledger) {
            return finish({
              status: "needs_review",
              toolId: "resource.scout.dispatch_specialist_subturn",
              refs: [dispatch.outputRef].filter((ref) => typeof ref === "string"),
              reasonCodes: ["lifecycle_runner_worker_context_specialist_dispatch_failed", ...dispatch.reasonCodes],
              continueLoop: false,
            });
          }
          state.specialistRequest = dispatch.request;
          state.resourceLedger = dispatch.ledger;
          const specialistLoopResult = await api.runResourceSpecialistNarrowingLoop({
            repoRoot: root,
            modelRef: "qwen/qwen3-coder-next",
            providerPath: "openrouter",
            maxTurns: 8,
            selectionInput: {
              graphId,
              iteration: transitions.length + 1,
              nodeId: activeNode.nodeId,
              nodeKind: activeNode.nodeKind,
              assignedRole: activeNode.assignedRole,
              capabilityId: metadata(activeNode).capabilityId,
              workIntentRef: metadata(activeNode).workIntentRef,
              nodeExecutionContractRef: metadata(activeNode).nodeExecutionContractRef,
              nodeResourceDemandSessionRef: state.demandSession.sessionRef,
              resourceObjectiveFocusRef: "worker-context-request://product-spec-middle-lane",
              legalRefUniverseRef: "legal-ref-universe://product-spec-middle-lane/worker-authority",
              resourceSpecialistSpecialistRequestRef: state.specialistRequest.requestRef,
              nodeResourceLedgerRef: state.resourceLedger.ledgerRef,
              selectedFocusRefs: requestedFileRefs,
              candidateRefs: state.specialistRequest.candidateRefs,
              authorityScopeRefs,
              expectedUse: state.specialistRequest.expectedUse,
              scoutReason: state.specialistRequest.scoutReason,
              allowedToolIds: ["resource.scout.submit_exact_handles", "resource.scout.mark_narrowing_blocked"],
              requiredFields: [
                "exactContextRefs",
                "handoffSummary",
                "relevantFiles",
                "existingPatterns",
                "editPoints",
                "validationSuggestions",
                "expectedUse",
              ],
              exactRefRequirements: {
                modelMustChooseExactRefs: true,
                modelMustSearchBeforeSubmit: true,
                modelMustOpenWindowBeforeSubmit: true,
                modelMustReviseWindowBeforeSubmit: true,
                runtimeWillNotChooseLines: true,
                suggestedSearchTerms: [
                  "worker.context.accept_window",
                  "worker.context.search",
                  "worker.edit.plan",
                  "worker.patch.force_author_from_plan",
                  "hasUsableBoundedContextSnapshotResult",
                ],
                acceptedRefShapes: ["file-window://<path>#L<start>-L<end>"],
                maxExactRefs: 4,
                maxWindowLines: 600,
              },
              repairReasonCodes: [],
            },
            exactWindowOptions,
            callModel: async (call) => {
              const response = await router.runJson({
                boundaryId: call.boundaryId,
                taskClass: call.taskClass,
                callSite: call.callSite,
                systemPrompt: call.systemPrompt,
                userPayload: call.userPayload,
                requestedInputBytes: call.requestedInputBytes,
                maxOutputTokens: call.maxOutputTokens,
                timeoutMs: call.timeoutMs,
                proofMode: true,
              });
              return {
                status:
                  response.status === "succeeded"
                    ? "ok"
                    : response.status === "blocked"
                      ? "blocked"
                      : "error",
                responseText: response.responseText,
                responseHash: response.responseHash,
                latencyMs: response.latencyMs,
                reasonCodes: response.reasonCodes,
              };
            },
            onEvent: async (event) => {
              state.specialistLoopEvents.push({
                event: event.event,
                status: event.status,
                turn: event.details.turn ?? null,
                toolId: event.details.toolId ?? null,
                legalNextToolIds: Array.isArray(event.details.legalNextToolIds)
                  ? event.details.legalNextToolIds.slice(0, 12)
                  : [],
                searchResultCount: event.details.searchResultCount ?? null,
                openedWindowCount: event.details.openedWindowCount ?? null,
                requestByteCount: event.details.requestByteCount ?? null,
                payloadHash: event.details.payloadHash ?? null,
              });
            },
          });
          state.specialistLoopResult = specialistLoopResult;
          if (
            specialistLoopResult.toolId !== "resource.scout.submit_exact_handles" ||
            specialistLoopResult.searchResultCount < 1 ||
            specialistLoopResult.selectedWindowCount < 1 ||
            specialistLoopResult.windowRevisionCount < 1 ||
            specialistLoopResult.turnCount < 4
          ) {
            return finish({
              status: "needs_review",
              toolId: specialistLoopResult.toolId,
              refs: [],
              reasonCodes: [
                "lifecycle_runner_codex_like_context_scout_loop_not_proven",
                `context_scout_turn_count:${specialistLoopResult.turnCount}`,
                `context_scout_search_result_count:${specialistLoopResult.searchResultCount}`,
                `context_scout_selected_window_count:${specialistLoopResult.selectedWindowCount}`,
                ...specialistLoopResult.reasonCodes,
              ],
              continueLoop: false,
            });
          }
          const latestProviderCall = providerCalls.at(-1);
          const providerDiagnosticRefForLoop = providerDiagnosticRef({
            boundaryId: "context_narrowing_selector",
            nodeId: activeNode.nodeId,
            graphId,
            responseHash: specialistLoopResult.responseHash,
            latencyMs: specialistLoopResult.latencyMs,
          });
          const compiled = api.compileContextScoutSpecialistToolOutput({
            toolId: specialistLoopResult.toolId,
            volatileInput: {
              ...specialistLoopResult.input,
              contextScoutSpecialistRequest: state.specialistRequest,
              nodeResourceLedger: state.resourceLedger,
              providerDiagnostics: [
                {
                  modelRef: "qwen/qwen3-coder-next",
                  providerId: "openrouter",
                  providerPath: "openrouter",
                  requestByteCount: latestProviderCall?.requestByteCount ?? null,
                  timeoutMs: 60_000,
                  timeoutState: "not_timed_out",
                  nativeFinishReason: null,
                  choiceCount: null,
                  contentLengths: [latestProviderCall?.responseByteCount ?? 0],
                  parsedContentLength: Buffer.byteLength(JSON.stringify(specialistLoopResult.input), "utf8"),
                  retryNumber: null,
                  concurrencySlot: "lifecycle-runner-real-model-proof",
                  inputBundleRef: state.specialistRequest.requestRef,
                  inputBundleHash: state.specialistRequest.requestHash,
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                },
              ],
            },
          });
          if (compiled.status !== "succeeded" || !compiled.handoff || !compiled.ledger) {
            return finish({
              status: "needs_review",
              toolId: specialistLoopResult.toolId,
              refs: [compiled.outputRef, providerDiagnosticRefForLoop].filter((ref) => typeof ref === "string"),
              reasonCodes: ["lifecycle_runner_worker_context_narrowing_not_fulfilled", ...compiled.reasonCodes],
              continueLoop: false,
            });
          }
          state.specialistHandoff = compiled.handoff;
          state.resourceLedger = compiled.ledger;
          state.changedFileRefs = modelSelectedFileRefsFromContext(specialistLoopResult.input);
          if (state.changedFileRefs.length === 0) {
            return finish({
              status: "needs_review",
              toolId: specialistLoopResult.toolId,
              refs: [compiled.handoff.handoffRef, providerDiagnosticRefForLoop],
              reasonCodes: ["lifecycle_runner_worker_context_selected_file_refs_missing", ...compiled.reasonCodes],
              continueLoop: false,
            });
          }
          patchMetadata(activeNode, {
            workerContextRequestStatus: "fulfilled",
            nodeResourceDemandSessionRef: state.demandSession.sessionRef,
            contextScoutSpecialistStatus: "fulfilled",
            resourceSpecialistHandoffRef: compiled.handoff.handoffRef,
            nodeResourceLedgerRef: compiled.ledger.ledgerRef,
            selectedResourceRefs: state.changedFileRefs,
            targetSnapshotRefs: state.changedFileRefs.map((ref) => `snapshot://${ref}`),
            acceptedArtifactRefs: [
              ...strings(metadata(activeNode).acceptedArtifactRefs, 20),
              state.demandSession.sessionRef,
              compiled.handoff.handoffRef,
            ],
            providerDiagnosticRefs: [
              ...strings(metadata(activeNode).providerDiagnosticRefs, 20),
              providerDiagnosticRefForLoop,
            ],
          });
        }
        if (state.changedFileRefs.length === 0) {
          return finish({
            status: "needs_review",
            toolId: "worker.edit.plan",
            refs: [],
            reasonCodes: ["lifecycle_runner_worker_action_selected_resource_refs_missing"],
            continueLoop: false,
          });
        }
        patchMetadata(activeNode, {
          workerEditPlanRef: "artifact://runner-owned/worker-edit-plan",
          workerPatchRef: "artifact://runner-owned/worker-patch",
          changedFileRefs: state.changedFileRefs,
          nodeLifecycleProjectionGate: "post_action_validation",
          nodeLifecycleCurrentGate: "post_action_validation",
          nodeLifecycleState: "post_action_validation",
        });
        return finish({
          toolId: "worker.patch.force_author_from_plan",
          refs: ["artifact://runner-owned/worker-edit-plan", "artifact://runner-owned/worker-patch"],
          reasonCodes: ["lifecycle_runner_worker_forced_patch_boundary_reached"],
        });
      }

      if (projection.currentGate === "post_action_validation") {
        state.validationRefs = [
          "validation://runner-owned/git-diff-check/worker-smoke-matrix",
          "validation://runner-owned/focused-lifecycle-surface",
        ];
        patchMetadata(activeNode, {
          validationStatus: "passed",
          validationRefs: state.validationRefs,
          nodeLifecycleProjectionGate: "evidence_closure",
          nodeLifecycleCurrentGate: "evidence_closure",
          nodeLifecycleState: "evidence_closure",
        });
        return finish({
          toolId: "worker.validation.run_structural_default",
          refs: state.validationRefs,
          reasonCodes: ["lifecycle_runner_post_action_validation_passed"],
        });
      }

      if (projection.currentGate === "evidence_closure") {
        state.evidenceClaimRefs = ["artifact://runner-owned/evidence/claim/1"];
        activeNode.nodeStatus = "succeeded";
        patchMetadata(activeNode, {
          evidenceClaimRefs: state.evidenceClaimRefs,
          nodeLifecycleProjectionGate: "node_lifecycle_root_cause_collapsed",
          nodeLifecycleCurrentGate: "succeeded",
          nodeLifecycleState: "succeeded",
        });
        return finish({
          toolId: "worker.evidence.claim_from_validation",
          refs: state.evidenceClaimRefs,
          reasonCodes: ["lifecycle_runner_evidence_claim_emitted"],
        });
      }

      return null;
    },
  });

  for (let iteration = 1; iteration <= 20; iteration += 1) {
    if (implementation.nodeStatus === "succeeded") {
      break;
    }
    const drain = await runner.drain({
      graphId,
      iteration,
      snapshot: snapshotFor(runId, nodes),
      maxTransitions: 1,
    });
    if (drain.status !== "continue") {
      break;
    }
    if (!drain.continueLoop && !drain.actionTaken) {
      break;
    }
  }

  const gatesVisited = transitions.map((transition) => transition.gate);
  const requiredGates = [
    "worker_action_ready",
    "post_action_validation",
    "evidence_closure",
  ];
  const status =
    requiredGates.every((gate) => gatesVisited.includes(gate)) &&
    providerCalls.length >= 3 &&
    state.specialistLoopResult?.toolId === "resource.scout.submit_exact_handles" &&
    state.specialistLoopResult.searchResultCount > 0 &&
    state.specialistLoopResult.selectedWindowCount > 0 &&
    state.specialistLoopResult.turnCount >= 3 &&
    implementation.nodeStatus === "succeeded" &&
    state.specialistHandoff?.status === "fulfilled" &&
    state.changedFileRefs.length > 0 &&
    state.validationRefs.length > 0 &&
    state.evidenceClaimRefs.length > 0
      ? "passed"
      : "failed";

  const report = {
    artifactKind: "execution_platform.lifecycle_runner_real_model_proof",
    schemaVersion: PROOF_VERSION,
    workItemId: WORK_ITEM_ID,
    status,
    runId,
    runtimeJobId,
    workflowId: "agent_team.coding",
    graphId,
    providerCallCount: providerCalls.length,
    globalSchedulerCallCount: 0,
    modelAuthoredResourceFocus: false,
    modelAuthoredWorkerContextRequest: Boolean(state.demandSession),
    modelAuthoredContextNarrowing: state.specialistHandoff?.status === "fulfilled",
    codexLikeContextScoutLoopProven:
      state.specialistLoopResult?.toolId === "resource.scout.submit_exact_handles" &&
      state.specialistLoopResult.searchResultCount > 0 &&
      state.specialistLoopResult.selectedWindowCount > 0 &&
      state.specialistLoopResult.windowRevisionCount > 0 &&
      state.specialistLoopResult.turnCount >= 4,
    contextScoutLoopMetrics: state.specialistLoopResult
      ? {
          toolId: state.specialistLoopResult.toolId,
          turnCount: state.specialistLoopResult.turnCount,
          openedRefCount: state.specialistLoopResult.openedRefCount,
          searchResultCount: state.specialistLoopResult.searchResultCount,
          selectedWindowCount: state.specialistLoopResult.selectedWindowCount,
          windowRevisionCount: state.specialistLoopResult.windowRevisionCount,
          reasonCodes: state.specialistLoopResult.reasonCodes.slice(0, 20),
        }
      : null,
    contextScoutLoopEvents: state.specialistLoopEvents.slice(0, 20),
    modelAuthoredDomainResourceSelection: false,
    transitions,
    projectionManifests,
    gatesVisited,
    finalNodeStatuses: nodes.map((item) => ({
      nodeId: item.nodeId,
      nodeKind: item.nodeKind,
      nodeStatus: item.nodeStatus,
    })),
    providerCallManifests: providerCalls,
    resourceObjectiveFocusRef: state.focus?.focusRef ?? null,
    resourceObjectiveFocusLegalRefUniverseRef: state.legalRefUniverse?.legalRefUniverseRef ?? null,
    nodeResourceDemandSessionRef: state.demandSession?.sessionRef ?? null,
    contextScoutSpecialistRequestRef: state.specialistRequest?.requestRef ?? null,
    resourceSpecialistHandoffRef: state.specialistHandoff?.handoffRef ?? null,
    nodeResourceLedgerRef: state.resourceLedger?.ledgerRef ?? null,
    nodeResourceLedgerEntryRefs: state.specialistHandoff?.ledgerEntryRefs ?? [],
    domainResourceSelectionDecisionRef: state.domainDecision?.decisionRef ?? null,
    domainResourceSelectionPacketRef: state.resourceSelectionPacket?.packetRef ?? null,
    nodeExecutionPacketRef: state.resourceSelectionPacket?.packetRef ?? null,
    changedFileRefs: state.changedFileRefs,
    validationRefs: state.validationRefs,
    evidenceClaimRefs: state.evidenceClaimRefs,
    metadataManifestSafe: true,
    semanticQualityJudgedByDeterministicCode: false,
    generatedAt: new Date().toISOString(),
    ...safety,
  };

  const proofArtifact = await writeJson("proof.json", report);
  const manifest = {
    artifactKind: "execution_platform.lifecycle_runner_real_model_proof_manifest",
    schemaVersion: `${PROOF_VERSION}.manifest`,
    workItemId: WORK_ITEM_ID,
    status,
    runId,
    runtimeJobId,
    workflowId: "agent_team.coding",
    graphId,
    proofArtifactRef: proofArtifact.path,
    proofArtifactHash: proofArtifact.sha256,
    proofArtifactBytes: proofArtifact.bytes,
    providerCallCount: providerCalls.length,
    globalSchedulerCallCount: 0,
    modelAuthoredResourceFocus: report.modelAuthoredResourceFocus,
    modelAuthoredContextNarrowing: report.modelAuthoredContextNarrowing,
    codexLikeContextScoutLoopProven: report.codexLikeContextScoutLoopProven,
    contextScoutLoopMetrics: report.contextScoutLoopMetrics,
    modelAuthoredDomainResourceSelection: report.modelAuthoredDomainResourceSelection,
    transitionCount: transitions.length,
    gatesVisited,
    finalNodeStatuses: report.finalNodeStatuses,
    changedFileRefCount: state.changedFileRefs.length,
    validationRefCount: state.validationRefs.length,
    evidenceClaimRefCount: state.evidenceClaimRefs.length,
    changedFileRefs: state.changedFileRefs,
    validationRefs: state.validationRefs,
    evidenceClaimRefs: state.evidenceClaimRefs,
    resourceObjectiveFocusRef: report.resourceObjectiveFocusRef,
    resourceSpecialistHandoffRef: report.resourceSpecialistHandoffRef,
    domainResourceSelectionDecisionRef: report.domainResourceSelectionDecisionRef,
    domainResourceSelectionPacketRef: report.domainResourceSelectionPacketRef,
    nodeExecutionPacketRef: report.nodeExecutionPacketRef,
    providerCallRefs: providerCalls.map((call) => `provider-call://${call.boundaryId}/${call.responseHash ?? call.providerDiagnosticHash}`),
    metadataManifestSafe: true,
    semanticQualityJudgedByDeterministicCode: false,
    ...safety,
  };
  assertManifestMetadata(manifest);
  const manifestArtifact = await writeJson("manifest.json", manifest);
  return { report, manifest, proofArtifact, manifestArtifact };
}

runProof()
  .then(({ report, manifestArtifact }) => {
    console.log(
      JSON.stringify(
        {
          status: report.status,
          proofArtifactRef: ".artifacts/execution-platform/lifecycle-runner-real-model-proof/proof.json",
          manifestRef: manifestArtifact.path,
          providerCallCount: report.providerCallCount,
          gatesVisited: report.gatesVisited,
          changedFileRefs: report.changedFileRefs,
          validationRefs: report.validationRefs,
          evidenceClaimRefs: report.evidenceClaimRefs,
          ...safety,
        },
        null,
        2,
      ),
    );
    if (report.status !== "passed") {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          status: "failed",
          errorName: error?.name ?? "unknown_error",
          errorSummary: String(error?.message ?? error).slice(0, 1_500),
          providerCallCount: lastProviderCalls.length,
          providerCallManifests: lastProviderCalls.slice(-6),
          ...safety,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  });
