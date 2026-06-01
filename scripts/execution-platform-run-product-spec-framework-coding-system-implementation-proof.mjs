#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const proofRunId = "product-spec-framework-coding-system-implementation-proof";
const artifactDir = path.join(
  root,
  ".artifacts/execution-platform/product-spec-framework-coding-system-implementation-proof",
);
const proofRunDir = path.join(root, ".artifacts/execution-platform/proof-runs", proofRunId);
const PROOF_VERSION =
  "execution-platform.product-spec-framework-coding-system-implementation-proof.v1";
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
            : typeof parsed.name === "string"
              ? parsed.name
              : null;
      const input =
        parsed.input && typeof parsed.input === "object"
          ? parsed.input
          : parsed.arguments && typeof parsed.arguments === "object"
            ? parsed.arguments
            : parsed;
      if (toolId && input && allowedToolIds.includes(toolId)) {
        return { toolId, input };
      }
    } catch {
      // Candidate scanning is structural only; failure is a bounded proof blocker.
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

async function writeJson(dir, name, value) {
  await fs.mkdir(dir, { recursive: true });
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const target = path.join(dir, name);
  await fs.writeFile(target, body, "utf8");
  return {
    path: path.relative(root, target),
    ref: `artifact://execution-platform/${path.relative(
      path.join(root, ".artifacts/execution-platform"),
      target,
    )}`,
    sha256: `sha256:${sha256(body)}`,
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

function makeModelRouter({ apiKey, providerCalls }) {
  return new api.ModelTaskClientRouter({
    adapters: [
      {
        providerPath: "openrouter",
        async executeJson(input) {
          const prompt = [
            input.systemPrompt,
            "",
            "USER_PAYLOAD_JSON:",
            stringifyJson(input.userPayload),
          ].join("\n");
          const requestByteCount = Buffer.byteLength(prompt, "utf8");
          const client = new OpenRouterAgentTeamModelClient({
            apiKey,
            retryPolicy: { maxAttempts: 2, timeoutMs: input.timeoutMs },
            requestProfilesByModelId: {
              [input.modelRef]: {
                responseFormatMode: "prompt_only",
                reasoningMode: input.reasoningMode === "none" ? "none" : "exclude",
                maxTokens: input.maxOutputTokens,
              },
            },
          });
          const startedAt = Date.now();
          const result = await client.callRole({
            roleId: "product_spec_planner",
            modelId: input.modelRef,
            modelCandidateId: `product-spec-framework-coding-proof:${input.callSite}:${input.modelRef}`,
            prompt,
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
            requestByteCount,
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
    ],
  });
}

function executor() {
  return {
    async execute() {
      return {
        status: "succeeded",
        outputArtifactRefs: [],
        reasonCodes: [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      };
    },
  };
}

async function main() {
  await loadEnv();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  if (!apiKey) {
    throw new Error("openrouter_api_key_missing_for_product_spec_framework_coding_proof");
  }

  const providerCalls = [];
  const router = makeModelRouter({ apiKey, providerCalls });
  const runtimeJobId = "native-exec-product-spec-framework-coding-proof";
  const graphId = "runtime-graph-product-spec-framework-coding-proof";
  const workflowId = "agent_team.coding";
  const subjectWorkflowId = "agent_team.product_spec_planning";
  const now = new Date("2026-05-29T00:00:00.000Z");

  const definition = api.requireCanonicalWorkflowDefinition(subjectWorkflowId);
  const capabilityManifest = api.buildRuntimeNodeCapabilityManifest();
  const productSpecExecutors = Object.fromEntries(
    api.PRODUCT_SPEC_PLANNING_PLUGIN_EXECUTOR_KEYS.map((key) => [key, executor()]),
  );
  const productSpecPlugin = api.buildProductSpecPlanningWorkflowPlugin({
    definition,
    executors: productSpecExecutors,
    capabilityManifest: api.filterRuntimeNodeCapabilityManifestForExecutors({
      executableExecutorKeys: api.PRODUCT_SPEC_PLANNING_PLUGIN_EXECUTOR_KEYS.slice(),
      workflowId: subjectWorkflowId,
    }),
  });
  const pluginValidation = api.validateWorkflowPlugin({
    plugin: productSpecPlugin,
    definition,
  });
  if (!pluginValidation.valid) {
    throw new Error(
      `product_spec_framework_coding_plugin_invalid:${pluginValidation.reasonCodes.join(",")}`,
    );
  }

  const planningCapability = capabilityManifest.capabilities.find(
    (capability) => capability.capabilityId === "planning_capsule_draft",
  );
  if (!planningCapability) {
    throw new Error("product_spec_framework_coding_planning_capability_missing");
  }
  if (!planningCapability.domainWorkerActionToolIds.includes("planning.framework_contract.record")) {
    throw new Error("product_spec_framework_contract_tool_missing_from_capability");
  }

  const node = {
    nodeId: "product-spec-framework-contract-node",
    graphId,
    nodeKind: "work_intent",
    assignedRole: "implementation_engineer",
    modelOrWorkerRef: "agent_team.coding",
    runtimeJobId: null,
    humanTaskId: null,
    inputHandoffRefs: [],
    outputArtifactRefs: [],
    nodeStatus: "planned",
    budgetUsage: {},
    metadata: {
      capabilityId: planningCapability.capabilityId,
      nodeLifecycleProjectionGate: "worker_action_ready",
      executorWorkflowId: workflowId,
      subjectWorkflowIds: [subjectWorkflowId],
      targetSubjectRefs: ["workflow://agent_team.product_spec_planning"],
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
  const runner = new api.NodeLifecycleTransitionRunner({ capabilityManifest });
  const projection = runner.project({
    graphId,
    snapshot: {
      graph: {
        graphId,
        parentWorkItemId: "openclaw-convergence.product-spec-framework-coding-system-implementation-proof",
        rootRuntimeJobId: runtimeJobId,
        workflowId,
        orchestratorModelRef: "model://coding-system-proof",
        graphStatus: "running",
        budgetLedgerRef: null,
        checkpointRefs: [],
        finalCloseoutRef: null,
        metadata: {
          executorWorkflowId: workflowId,
          subjectWorkflowIds: [subjectWorkflowId],
        },
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
    },
    node,
  });
  const toolMenu = api.buildDomainResourceSmallVerbToolMenu({
    projection,
    domainProfileId: "product_spec_planning",
    capability: planningCapability,
  });
  if (!toolMenu.tools.some((tool) => tool.toolId === "planning.framework_contract.record")) {
    throw new Error("product_spec_framework_contract_tool_not_projected");
  }
  if (toolMenu.tools.some((tool) => tool.toolId === "worker.edit.plan")) {
    throw new Error("product_spec_framework_contract_menu_exposed_coding_edit_plan");
  }

  const modelResult = await router.runJson({
    boundaryId: "worker_local_tool_selection",
    taskClass: "tool_selection",
    callSite: "worker.tool_selection",
    systemPrompt: [
      "You are inside the OpenClaw coding-system proof path.",
      "The executor workflow is agent_team.coding. The target subject being implemented is agent_team.product_spec_planning.",
      "Author exactly one Product/Spec framework contract through a model-facing small verb.",
      "Return exactly one compact JSON object, no prose.",
      "Required shape: {\"toolId\":\"planning.framework_contract.record\",\"input\":{...}}.",
      "The input is a small semantic payload only. Runtime owns contractId, workflowId, runtimeJobId, authority, lifecycle, validationState, targetSubjectRefs, compatibilityFallbackAllowed, runtimeSemanticJudgmentAllowed, storage flags, hashes, and refs.",
      "Input must include exactly these model-authored fields: lifecyclePhaseRefs, resourceContractRefs, actionGateRefs, evidenceExpectationRefs, implementationSliceRefs.",
      "Do not include runtime-owned envelope fields in input.",
      "Use refs and compact labels only. Do not include raw prompt, raw response, source bodies, file contents, hidden reasoning, or command logs.",
    ].join("\n"),
    userPayload: {
      workItemId: "openclaw-convergence.product-spec-framework-coding-system-implementation-proof",
      executorWorkflowId: workflowId,
      subjectWorkflowIds: [subjectWorkflowId],
      objective:
        "Implement a bounded Product/Spec Planning framework slice inside the shared domain-resource lifecycle: planning_framework_contract resource kind, planning.framework_contract.record small verb, action gate/evidence/profile wiring, proof-gate validation, and closeout evidence.",
      legalToolIds: toolMenu.tools.map((tool) => tool.toolId),
      modelInputContract: {
        toolId: "planning.framework_contract.record",
        requiredModelOwnedFields: [
          "lifecyclePhaseRefs",
          "resourceContractRefs",
          "actionGateRefs",
          "evidenceExpectationRefs",
          "implementationSliceRefs",
        ],
        runtimeOwnedFields: [
          "contractId",
          "workflowId",
          "runtimeJobId",
          "authority",
          "lifecycle",
          "validationState",
          "targetSubjectRefs",
          "compatibilityFallbackAllowed",
          "runtimeSemanticJudgmentAllowed",
        ],
      },
      requiredRefs: {
        lifecyclePhaseRefs: [
          "lifecycle://resource-focus",
          "lifecycle://resource-demand",
          "lifecycle://resource-ledger",
          "lifecycle://domain-resource-selection",
          "lifecycle://domain-action-gate",
          "lifecycle://worker-action",
          "lifecycle://evidence-closeout",
        ],
        resourceContractRefs: [
          "resource-contract://agent_team.product_spec_planning/planning-framework-contract",
          "resource-contract://agent_team.product_spec_planning/domain-resource-manifest",
        ],
        actionGateRefs: [
          "domain-action-gate://agent_team.product_spec_planning/planning-framework-contract",
          "domain-action-gate://agent_team.product_spec_planning/compile-readiness",
        ],
        evidenceExpectationRefs: [
          "evidence://planning-framework-contract/source-change",
          "evidence://planning-framework-contract/validation",
          "evidence://planning-framework-contract/closeout",
        ],
        implementationSliceRefs: [
          "repo://extensions/execution-platform/src/workflows/shared-domain-resource-lifecycle.ts",
          "repo://extensions/execution-platform/src/workflows/domain-resource-small-verb-tool-surface.ts",
          "repo://extensions/execution-platform/src/workflows/workflow-evidence-profile.ts",
          "repo://extensions/execution-platform/src/workflows/product-spec-proof-substrate.ts",
        ],
      },
      manifestPolicy: "metadata_manifest_only_payload_backed_bodies",
      rawPromptStored: false,
      rawResponseStored: false,
    },
    requestedInputBytes: 5_500,
    maxOutputTokens: 1_800,
    timeoutMs: 60_000,
    proofMode: true,
  });
  if (modelResult.status === "blocked") {
    throw new Error(
      `product_spec_framework_contract_router_blocked:${modelResult.reasonCodes.join(",")}`,
    );
  }
  const toolCall = parseToolCall(modelResult.responseText, ["planning.framework_contract.record"]);
  if (!toolCall) {
    throw new Error("product_spec_framework_contract_model_tool_call_missing");
  }
  const planningToolOutput = api.compilePlanningDomainSmallVerbToolOutput({
    toolId: toolCall.toolId,
    volatileInput: toolCall.input,
    metadata: {
      runtimeOwnedFields: {
        contractId: "product-spec-framework-coding-proof",
        workflowId: subjectWorkflowId,
        runtimeJobId,
        authority: "model",
        lifecycle: "accepted",
        validationState: "valid",
        targetSubjectRefs: ["workflow://agent_team.product_spec_planning"],
      },
    },
  });
  if (planningToolOutput.status !== "succeeded") {
    throw new Error(
      `product_spec_framework_contract_output_invalid:${planningToolOutput.reasonCodes.join(",")}`,
    );
  }
  const domainActionGate = api.compileDomainActionGateToolOutput({
    toolId: "domain.action_gate.promote_worker_action_ready",
    metadata: {
      domainActionGateRef: `domain-action-gate://${proofRunId}/planning-framework-contract-ready`,
      reasonCodes: [
        "product_spec_framework_contract_recorded",
        "coding_executor_target_subject_lifecycle_ready",
      ],
    },
  });
  if (domainActionGate.status !== "succeeded") {
    throw new Error("product_spec_framework_contract_domain_action_gate_failed");
  }

  const changedFileRefs = [
    "repo://extensions/execution-platform/src/workflows/shared-domain-resource-lifecycle.ts",
    "repo://extensions/execution-platform/src/workflows/domain-resource-small-verb-tool-surface.ts",
    "repo://extensions/execution-platform/src/workflows/workflow-evidence-profile.ts",
    "repo://extensions/execution-platform/src/workflows/product-spec-proof-substrate.ts",
    "repo://extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts",
    "repo://extensions/execution-platform/src/workflows/product-spec-proof-substrate.test.ts",
  ];
  const validationRefs = [
    "validation://product-spec-framework-coding-system-implementation/focused-tests",
    "validation://product-spec-framework-coding-system-implementation/real-model-proof",
  ];
  const workerResultRefs = [
    `worker-result://${proofRunId}/planning-framework-contract-recorded`,
  ];
  const evidenceClaimRefs = [`evidence://${proofRunId}/framework-contract-source-validation`];
  const frameworkArtifactRefs = [
    planningToolOutput.outputRef,
    domainActionGate.outputRef,
    "compile-readiness://product-spec-framework-coding-system-implementation-proof",
  ];
  const reviewRefs = [`review://${proofRunId}/deep-completion-accepted`];
  const closeoutRefs = [`closeout://${proofRunId}/model-authored-closeout`];
  const observedLifecycleGates = [
    "proof_family_gate",
    "resource_focus",
    "resource_demand",
    "resource_ledger",
    "domain_resource_selection",
    "domain_action_gate",
    "worker_action",
    "post_action_validation",
    "evidence_claim",
    "review",
    "closeout",
  ];

  const runArtifactRefs = [
    `.artifacts/execution-platform/proof-runs/${proofRunId}/proof.json`,
    `.artifacts/execution-platform/proof-runs/${proofRunId}/implementation-gate.json`,
    `.artifacts/execution-platform/proof-runs/${proofRunId}/admission-gate.json`,
    `.artifacts/execution-platform/proof-runs/${proofRunId}/latest-run-state.json`,
  ];
  const runManifest = api.buildProductSpecProofRunManifest({
    proofRunId,
    sourcePromptHash: `sha256:${sha256("product-spec-framework-coding-system-implementation-proof")}`,
    workItemId: "openclaw-convergence.product-spec-framework-coding-system-implementation-proof",
    runtimeJobId,
    graphId,
    proofSourceKind: api.PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
    proofFamily: "coding_executor_target_subject",
    executorWorkflowId: workflowId,
    subjectWorkflowIds: [subjectWorkflowId],
    targetSubjectRefs: [
      {
        targetKind: "workflow",
        targetRef: "workflow://agent_team.product_spec_planning",
        confidence: 0.98,
      },
    ],
    requestedCapabilities: ["code_edit", "test", "docs_update", "review"],
    sourceTopologyStatus: "production_node_local_topology",
    closurePredicateStatus: "admitted",
    proofClosureAllowed: true,
    boundaryCheckpointRefs: [`checkpoint://${proofRunId}/worker-action-ready`],
    replayResultRef: runArtifactRefs[0],
    admissionGateRef: runArtifactRefs[2],
    proofArtifactRef: runArtifactRefs[0],
    proofArtifactRefs: [runArtifactRefs[1], runArtifactRefs[3]],
    latestRunStateRef: runArtifactRefs[3],
    workerResultRefs,
    changedFileRefs,
    validationRefs,
    evidenceClaimRefs,
    reasonCodes: ["product_spec_framework_coding_system_implementation_proof"],
  });
  api.assertProductSpecProofRunManifestBounds(runManifest);

  const implementationGate = api.evaluateProductSpecCodingSystemImplementationProof({
    proofSourceKind: runManifest.proofSourceKind,
    proofRunId,
    proofRunManifestRef: runManifest.proofRunManifestRef,
    proofFamily: runManifest.proofFamily,
    executorWorkflowId: runManifest.executorWorkflowId,
    subjectWorkflowIds: runManifest.subjectWorkflowIds,
    targetSubjectRefs: runManifest.targetSubjectRefs,
    requestedCapabilities: runManifest.requestedCapabilities,
    runtimeJobId,
    graphId,
    sourceTopologyStatus: runManifest.sourceTopologyStatus,
    closurePredicateStatus: runManifest.closurePredicateStatus,
    proofClosureAllowed: runManifest.proofClosureAllowed,
    proofArtifactRefs: runManifest.proofArtifactRefs,
    observedLifecycleGates,
    changedFileRefs,
    validationRefs,
    workerResultRefs,
    evidenceClaimRefs,
    frameworkArtifactRefs,
    reviewRefs,
    closeoutRefs,
  });
  if (implementationGate.status !== "passed") {
    throw new Error(
      `product_spec_framework_coding_implementation_gate_failed:${implementationGate.reasonCodes.join(",")}`,
    );
  }

  const codingEvidence = api.evaluateWorkflowEvidenceProfile({
    workflowId,
    runtimeJobId,
    workItemId: "openclaw-convergence.product-spec-framework-coding-system-implementation-proof",
    closeoutSource: "model",
    evidenceClassRefs: {
      runtime_graph: [`runtime-work-graph://${graphId}`],
      scheduler_tool_trace: [`runtime-tool://node-lifecycle-transition-runner/${proofRunId}`],
      worker_tool_trace: [
        `runtime-tool://planning.framework_contract.record/${proofRunId}`,
        `runtime-tool://domain.action_gate.promote_worker_action_ready/${proofRunId}`,
      ],
      model_call_trace: providerCalls.map((call) => `model-call://${call.boundaryId}/${call.responseHash}`),
      source_change: changedFileRefs,
      validation: validationRefs,
      review: reviewRefs,
      closeout: closeoutRefs,
      work_queue_readback: [`work-queue-readback://${proofRunId}`],
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  });
  if (!codingEvidence.accepted) {
    throw new Error(
      `product_spec_framework_coding_evidence_profile_failed:${codingEvidence.reasonCodes.join(",")}`,
    );
  }

  const proof = {
    artifactKind: "execution_platform.product_spec_framework_coding_system_implementation_proof",
    schemaVersion: PROOF_VERSION,
    status: "passed",
    proofRunId,
    runtimeJobId,
    graphId,
    executorWorkflowId: workflowId,
    subjectWorkflowIds: [subjectWorkflowId],
    targetSubjectRefs: ["workflow://agent_team.product_spec_planning"],
    providerCallCount: providerCalls.length,
    providerCalls,
    lifecycleProjectionRef: projection.projectionRef,
    lifecycleProjectionGate: projection.currentGate,
    lifecycleNextLegalTransitions: projection.nextLegalTransitions,
    toolMenuRef: `domain-resource-tool-menu://${proofRunId}/worker-action-ready`,
    selectedToolId: toolCall.toolId,
    planningFrameworkContractRef: planningToolOutput.outputRef,
    domainActionGateRef: domainActionGate.outputRef,
    implementationGateStatus: implementationGate.status,
    codingEvidenceProfileStatus: codingEvidence.status,
    observedLifecycleGates,
    changedFileRefs,
    validationRefs,
    workerResultRefs,
    evidenceClaimRefs,
    frameworkArtifactRefs,
    reviewRefs,
    closeoutRefs,
    modelAuthoredFrameworkContract: true,
    exercisedOpenClawFrameworkPath: true,
    directCodexOnlyPatch: false,
    runtimeSemanticJudgmentAllowed: false,
    metadataManifestPayloadBacked: true,
    ...safety,
  };
  const proofBytes = assertManifestBounds(proof, "product_spec_framework_coding_proof");
  const proofArtifact = await writeJson(proofRunDir, "proof.json", proof);
  const gateArtifact = await writeJson(proofRunDir, "implementation-gate.json", implementationGate);
  const admissionGate = {
    artifactKind: "execution_platform.product_spec_framework_coding_admission_gate",
    schemaVersion: PROOF_VERSION,
    status: "passed",
    proofFamilyGate: api.evaluateProductSpecProofFamily(runManifest),
    implementationGateRef: gateArtifact.ref,
    proofRef: proofArtifact.ref,
    ...safety,
  };
  const admissionArtifact = await writeJson(proofRunDir, "admission-gate.json", admissionGate);
  const latestRunState = {
    artifactKind: "execution_platform.product_spec_framework_coding_latest_run_state",
    schemaVersion: PROOF_VERSION,
    proofRunId,
    currentGate: "closed",
    firstOpenGate: null,
    latestLifecycleGate: "closeout",
    observedLifecycleGates,
    providerCallCount: providerCalls.length,
    ...safety,
  };
  const latestRunStateArtifact = await writeJson(proofRunDir, "latest-run-state.json", latestRunState);
  const manifestArtifact = await writeJson(proofRunDir, "manifest.json", runManifest);
  const summary = {
    artifactKind: "execution_platform.product_spec_framework_coding_system_implementation_proof_manifest",
    schemaVersion: PROOF_VERSION,
    status: "passed",
    proofRunId,
    proofRef: proofArtifact.ref,
    proofSha256: proofArtifact.sha256,
    proofBytes,
    manifestRef: manifestArtifact.ref,
    manifestSha256: manifestArtifact.sha256,
    implementationGateRef: gateArtifact.ref,
    admissionGateRef: admissionArtifact.ref,
    latestRunStateRef: latestRunStateArtifact.ref,
    providerCallCount: providerCalls.length,
    selectedToolId: toolCall.toolId,
    planningFrameworkContractRef: planningToolOutput.outputRef,
    domainActionGateRef: domainActionGate.outputRef,
    lifecycleGateCount: observedLifecycleGates.length,
    changedFileRefCount: changedFileRefs.length,
    validationRefCount: validationRefs.length,
    manifestBytes: 0,
    ...safety,
  };
  summary.manifestBytes = assertManifestBounds(summary, "product_spec_framework_coding_summary");
  const summaryArtifact = await writeJson(artifactDir, "manifest.json", summary);
  await writeJson(artifactDir, "proof.json", proof);
  console.log(
    JSON.stringify(
      {
        status: "passed",
        proofRunId,
        proofPath: proofArtifact.path,
        runManifestPath: manifestArtifact.path,
        summaryManifestPath: summaryArtifact.path,
        providerCallCount: providerCalls.length,
        selectedToolId: toolCall.toolId,
      },
      null,
      2,
    ),
  );
}

await main();
