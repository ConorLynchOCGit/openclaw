#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(
  root,
  ".artifacts/execution-platform/domain-resource-small-verb-real-model-proof",
);
const PROOF_VERSION = "execution-platform.domain-resource-small-verb-real-model-proof.v1";
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

const api = await tsImport(
  path.join(root, "extensions/execution-platform/runtime-api.ts"),
  import.meta.url,
);
const { OpenRouterAgentTeamModelClient } = await tsImport(
  path.join(root, "extensions/execution-platform/src/codex-bridge/live-agent-team-runner.ts"),
  import.meta.url,
);

function sha256(value) {
  return crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function stringifyJson(value) {
  return JSON.stringify(value, null, 2);
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

function extractJsonObjectTexts(text) {
  const source = String(text ?? "").trim();
  const candidates = [];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/giu)) {
    if (match[1]?.trim()) {
      candidates.push(match[1].trim());
    }
  }
  const starts = [...source.matchAll(/\{/gu)].map((match) => match.index ?? -1);
  for (const start of starts) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
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
          candidates.push(source.slice(start, index + 1));
          break;
        }
      }
    }
  }
  return [...new Set(candidates.length ? candidates : [source])].slice(0, 20);
}

function parseToolCall(text, allowedToolIds) {
  for (const candidate of extractJsonObjectTexts(text)) {
    try {
      const parsed = JSON.parse(candidate);
      const toolId =
        typeof parsed.toolId === "string"
          ? parsed.toolId
          : typeof parsed.toolName === "string"
            ? parsed.toolName
            : null;
      const input =
        parsed.input && typeof parsed.input === "object"
          ? parsed.input
          : parsed.arguments && typeof parsed.arguments === "object"
            ? parsed.arguments
            : null;
      if (toolId && input && allowedToolIds.includes(toolId)) {
        return { toolId, input };
      }
    } catch {
      // Candidate scanning is structural only; failure is reported as a bounded proof blocker.
    }
  }
  return null;
}

function assertManifestBounds(value, label) {
  const encoded = JSON.stringify(value);
  const bytes = Buffer.byteLength(encoded, "utf8");
  if (bytes > MANIFEST_MAX_BYTES) {
    throw new Error(`${label}_manifest_overflow:${bytes}`);
  }
  for (const forbiddenKey of [
    "rawPrompt",
    "rawResponse",
    "fullBody",
    "lineNumberedContent",
    "fileContent",
    "sourceWindowContent",
    "hiddenReasoning",
    "secretValue",
  ]) {
    if (encoded.includes(`"${forbiddenKey}":`)) {
      throw new Error(`${label}_manifest_contains_forbidden_body:${forbiddenKey}`);
    }
  }
  return bytes;
}

async function writeJson(name, value) {
  await fs.mkdir(artifactDir, { recursive: true });
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const target = path.join(artifactDir, name);
  await fs.writeFile(target, body, "utf8");
  return {
    path: `.artifacts/execution-platform/domain-resource-small-verb-real-model-proof/${name}`,
    sha256: `sha256:${sha256(body)}`,
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

function nodeForProjection(input) {
  const now = new Date("2026-05-29T00:00:00.000Z");
  return {
    nodeId: input.nodeId,
    graphId: input.graphId,
    nodeKind: input.nodeKind,
    assignedRole: input.assignedRole,
    modelOrWorkerRef: "openrouter://tool-selection",
    runtimeJobId: null,
    humanTaskId: null,
    inputHandoffRefs: [],
    outputArtifactRefs: [],
    nodeStatus: "planned",
    budgetUsage: {},
    metadata: {
      capabilityId: input.capabilityId,
      nodeLifecycleProjectionGate: "worker_action_ready",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function snapshotForNode(input) {
  const now = new Date("2026-05-29T00:00:00.000Z");
  const node = nodeForProjection(input);
  return {
    graph: {
      graphId: input.graphId,
      parentWorkItemId: null,
      rootRuntimeJobId: input.runtimeJobId,
      workflowId: input.workflowId,
      orchestratorModelRef: "model://proof",
      graphStatus: "running",
      budgetLedgerRef: null,
      checkpointRefs: [],
      finalCloseoutRef: null,
      metadata: {},
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
      createdAt: now,
      updatedAt: now,
    },
    nodes: [node],
    edges: [],
    roleInvocations: [],
    handoffPackets: [],
    artifactManifests: [],
    budgetLedgers: [],
    checkpoints: [],
    humanTasks: [],
  };
}

async function main() {
  await loadEnv();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  if (!apiKey) {
    throw new Error("openrouter_api_key_missing_for_domain_resource_small_verb_proof");
  }

  const runtimeJobId = "domain-resource-small-verb-real-model";
  const workflowId = "agent_team.product_spec_planning";
  const graphId = "graph-domain-resource-small-verb";
  const nodeId = "action-graph-proposal-node";
  const capabilityManifest = api.buildRuntimeNodeCapabilityManifest();
  const planningCapability = capabilityManifest.capabilities.find(
    (capability) => capability.capabilityId === "action_graph_proposal",
  );
  const codingCapability = capabilityManifest.capabilities.find(
    (capability) => capability.capabilityId === "implementation_microtask",
  );
  if (!planningCapability || !codingCapability) {
    throw new Error("domain_resource_small_verb_required_capabilities_missing");
  }

  const runner = new api.NodeLifecycleTransitionRunner({ capabilityManifest });
  const node = nodeForProjection({
    runtimeJobId,
    workflowId,
    graphId,
    nodeId,
    nodeKind: "action_graph_compile",
    assignedRole: "product_spec_planner",
    capabilityId: planningCapability.capabilityId,
  });
  const projection = runner.project({
    graphId,
    snapshot: snapshotForNode({
      runtimeJobId,
      workflowId,
      graphId,
      nodeId,
      nodeKind: "action_graph_compile",
      assignedRole: "product_spec_planner",
      capabilityId: planningCapability.capabilityId,
    }),
    node,
  });
  const productSpecMenu = api.buildDomainResourceSmallVerbToolMenu({
    projection: {
      ...projection,
      nextLegalTransitions: [
        ...projection.nextLegalTransitions,
        "resource.selection.propose",
        "resource.ledger.report_planning_action_point",
        "worker.edit.plan",
      ],
    },
    domainProfileId: "product_spec_planning",
    capability: planningCapability,
  });
  const codingMenu = api.buildDomainResourceSmallVerbToolMenu({
    projection: {
      ...projection,
      workflowId: "agent_team.coding",
      capabilityId: codingCapability.capabilityId,
      nextLegalTransitions: [
        "worker.edit.plan",
        "worker.patch.force_author_from_plan",
        "planning.action_graph.propose",
        "resource.selection.propose",
      ],
    },
    domainProfileId: "coding",
    capability: codingCapability,
  });
  const productSpecToolIds = productSpecMenu.tools.map((tool) => tool.toolId);
  const codingToolIds = codingMenu.tools.map((tool) => tool.toolId);
  if (productSpecToolIds.includes("worker.edit.plan") || !productSpecToolIds.includes("planning.action_graph.propose")) {
    throw new Error("domain_resource_small_verb_product_spec_menu_invalid");
  }
  if (codingToolIds.includes("planning.action_graph.propose") || !codingToolIds.includes("worker.edit.plan")) {
    throw new Error("domain_resource_small_verb_coding_menu_invalid");
  }
  assertManifestBounds(productSpecMenu, "product_spec_tool_menu");
  assertManifestBounds(codingMenu, "coding_tool_menu");

  const modelPolicy = api.classifyModelTaskCall({
    taskClass: "tool_selection",
    callSite: "resource.selection",
  });
  if (!modelPolicy.selectedModelRef) {
    throw new Error("domain_resource_small_verb_model_policy_missing_model_ref");
  }
  const client = new OpenRouterAgentTeamModelClient({
    apiKey,
    retryPolicy: { maxAttempts: 2, timeoutMs: 60_000 },
    requestProfilesByModelId: {
      [modelPolicy.selectedModelRef]: {
        responseFormatMode: "prompt_only",
        reasoningMode: modelPolicy.reasoningMode === "none" ? "none" : "exclude",
        maxTokens: 1_600,
      },
    },
  });

  const taskPayload = {
    objective:
      "Create a Product/Spec Planning action graph proposal for a bounded middle-lane proof. It should propose a planning capsule review node, a compile-readiness validation node, and a closeout node, with traceable edges between them. Do not choose coding edit tools.",
    allowedToolIds: productSpecToolIds,
    productSpecToolMenu: productSpecMenu.tools.map((tool) => ({
      toolId: tool.toolId,
      toolFamily: tool.toolFamily,
      schemaRef: tool.schemaRef,
    })),
    distractorCodingToolsRejectedByRuntime: productSpecMenu.rejectedToolIds,
    availableRefs: {
      compileReadinessRef: "compile-readiness://product-spec-middle-lane/action-graph-ready",
      nodeProposalRefs: [
        "node-proposal://product-spec/planning-capsule-review",
        "node-proposal://product-spec/compile-readiness-validation",
        "node-proposal://product-spec/closeout-summary",
      ],
      edgeProposalRefs: [
        "edge-proposal://planning-capsule-review->compile-readiness-validation",
        "edge-proposal://compile-readiness-validation->closeout-summary",
      ],
      limitationRefs: ["limitation://middle-lane-not-full-product-spec-proof"],
    },
    requiredToolCallShape:
      "{\"toolId\":\"planning.action_graph.propose\",\"input\":{\"proposalId\":\"...\",\"compileReadinessRef\":\"...\",\"nodeProposalRefs\":[...],\"edgeProposalRefs\":[...]}}",
    rawPromptStored: false,
    rawResponseStored: false,
  };
  const prompt = [
    "You are exercising a Product/Spec Planning domain small-verb tool surface.",
    "Return exactly one compact JSON object and no prose.",
    "Choose only one allowed toolId from USER_PAYLOAD_JSON.allowedToolIds.",
    "For this objective the correct tool is planning.action_graph.propose.",
    "Use only refs from USER_PAYLOAD_JSON.availableRefs.",
    "Do not use coding edit tools.",
    "",
    "USER_PAYLOAD_JSON:",
    stringifyJson(taskPayload),
  ].join("\n");
  const startedAt = Date.now();
  const result = await client.callRole({
    roleId: "product_spec_planning_tool_surface",
    modelId: modelPolicy.selectedModelRef,
    modelCandidateId: `domain-resource-small-verb:${modelPolicy.selectedModelRef}`,
    prompt,
    maxTokens: 1_600,
    timeoutMs: 60_000,
    taskClass: "tool_selection",
    modelTaskCallSite: "resource.selection",
  });
  const providerCall = {
    providerPath: modelPolicy.providerPath,
    modelRef: modelPolicy.selectedModelRef,
    status: result.status,
    requestByteCount: Buffer.byteLength(prompt, "utf8"),
    responseByteCount: Buffer.byteLength(result.responseText ?? "", "utf8"),
    responseHash: result.responseHash,
    latencyMs:
      typeof result.providerResponseDiagnostics?.elapsedMs === "number"
        ? result.providerResponseDiagnostics.elapsedMs
        : Date.now() - startedAt,
    httpStatus: result.httpStatus ?? null,
    errorReasonCode: result.errorReasonCode ?? null,
    providerDiagnosticHash: `sha256:${sha256(JSON.stringify(result.providerResponseDiagnostics ?? {}))}`,
    ...safety,
  };
  if (result.status !== "succeeded") {
    throw new Error(`domain_resource_small_verb_provider_failed:${result.errorReasonCode ?? "unknown"}`);
  }

  const parsed = parseToolCall(result.responseText, productSpecToolIds);
  if (!parsed) {
    throw new Error("domain_resource_small_verb_model_tool_call_missing");
  }
  if (parsed.toolId !== "planning.action_graph.propose") {
    throw new Error(`domain_resource_small_verb_wrong_tool:${parsed.toolId}`);
  }
  const compiled = api.compilePlanningDomainSmallVerbToolOutput({
    toolId: parsed.toolId,
    volatileInput: parsed.input,
  });
  if (compiled.status !== "succeeded") {
    throw new Error(`domain_resource_small_verb_compiler_failed:${compiled.reasonCodes.join(",")}`);
  }
  const gate = api.compileDomainActionGateToolOutput({
    toolId: "domain.action_gate.evaluate",
    metadata: {
      domainActionGateRef: "domain-action-gate://product-spec-middle-lane/action-graph",
      reasonCodes: ["planning_action_graph_proposal_compiled"],
    },
  });
  if (gate.status !== "succeeded") {
    throw new Error("domain_resource_small_verb_action_gate_failed");
  }

  const proof = {
    artifactKind: "execution_platform.domain_resource_small_verb_real_model_proof",
    schemaVersion: PROOF_VERSION,
    status: "passed",
    providerCallCount: 1,
    providerCalls: [providerCall],
    productSpecMenu: {
      toolCount: productSpecMenu.toolCount,
      toolIds: productSpecToolIds,
      rejectedToolIds: productSpecMenu.rejectedToolIds,
      byteCount: productSpecMenu.byteCount,
    },
    codingMenu: {
      toolCount: codingMenu.toolCount,
      toolIds: codingToolIds,
      rejectedToolIds: codingMenu.rejectedToolIds,
      byteCount: codingMenu.byteCount,
    },
    compiledPlanningArtifact: {
      outputRef: compiled.outputRef,
      outputHash: compiled.outputHash,
      reasonCodes: compiled.reasonCodes,
      metadata: compiled.metadata,
    },
    domainActionGate: {
      outputRef: gate.outputRef,
      outputHash: gate.outputHash,
      reasonCodes: gate.reasonCodes,
    },
    modelSelectedCanonicalSmallVerb: true,
    runtimeSemanticJudgmentAllowed: false,
    metadataManifestPayloadBacked: true,
    ...safety,
  };
  const proofBytes = assertManifestBounds(proof, "domain_resource_small_verb_proof");
  const proofArtifact = await writeJson("proof.json", proof);
  const manifest = {
    artifactKind: "execution_platform.domain_resource_small_verb_real_model_proof_manifest",
    schemaVersion: PROOF_VERSION,
    status: "passed",
    proofRef: "artifact://execution-platform/domain-resource-small-verb-real-model-proof/proof.json",
    proofSha256: proofArtifact.sha256,
    providerCallCount: 1,
    providerStatus: result.status,
    selectedToolId: parsed.toolId,
    planningOutputRef: compiled.outputRef,
    domainActionGateRef: gate.outputRef,
    productSpecMenuToolCount: productSpecMenu.toolCount,
    codingMenuToolCount: codingMenu.toolCount,
    proofBytes,
    changedFileRefs: [
      "extensions/execution-platform/src/workflows/domain-resource-small-verb-tool-surface.ts",
      "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
      "extensions/execution-platform/src/model-tasks/model-task-classification.ts",
      "extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts",
    ],
    validationRefs: [
      "domain-resource-small-verb-tool-surface.test.ts",
      "scheduler-runtime-tools.test.ts",
      "model-task-classification.test.ts",
      "product-spec-planning-plugin.test.ts",
      "shared-domain-resource-lifecycle.test.ts",
    ],
    ...safety,
  };
  assertManifestBounds(manifest, "domain_resource_small_verb_manifest");
  const manifestArtifact = await writeJson("manifest.json", manifest);
  console.log(
    JSON.stringify(
      {
        status: "passed",
        proofPath: proofArtifact.path,
        manifestPath: manifestArtifact.path,
        providerCallCount: 1,
        selectedToolId: parsed.toolId,
      },
      null,
      2,
    ),
  );
}

await main();
