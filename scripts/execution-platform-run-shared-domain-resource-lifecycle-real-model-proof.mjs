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
  ".artifacts/execution-platform/shared-domain-resource-lifecycle-real-model-proof",
);
const PROOF_VERSION = "execution-platform.shared-domain-resource-lifecycle-real-model-proof.v1";
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
      const toolId = typeof parsed.toolId === "string" ? parsed.toolId : null;
      const input = parsed.input && typeof parsed.input === "object" ? parsed.input : null;
      if (toolId && input && allowedToolIds.includes(toolId)) {
        return { toolId, input };
      }
    } catch {
      // Continue candidate scan; parser errors are summarized by the caller.
    }
  }
  return null;
}

function boundedText(value, max = 700) {
  if (typeof value === "string") {
    return value.trim().replace(/\s+/gu, " ").slice(0, max);
  }
  if (Array.isArray(value)) {
    return value
      .filter((entry) => typeof entry === "string" && entry.trim())
      .join("; ")
      .trim()
      .replace(/\s+/gu, " ")
      .slice(0, max);
  }
  return "";
}

function stringArray(value, max = 8) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return [...new Set(source.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim()))].slice(0, max);
}

function normalizeFocusInput(input) {
  const nextUnknown = boundedText(input.nextUnknown, 1_200);
  const selectedSemanticQuestions = stringArray(input.selectedSemanticQuestions, 2);
  return {
    currentObjectiveSlot: boundedText(input.currentObjectiveSlot, 220),
    resourceUseKind: boundedText(input.resourceUseKind ?? input.contextUseKind, 120),
    nextUnknown,
    expectedUse: boundedText(input.expectedUse, 1_200),
    selectedRefHandles: stringArray(input.selectedRefHandles, 2),
    selectedSemanticQuestions:
      selectedSemanticQuestions.length > 0 ? selectedSemanticQuestions : [nextUnknown],
    stopWhenAnswered: boundedText(input.stopWhenAnswered, 700),
  };
}

function makeModelRouter({ apiKey, providerCalls }) {
  return new api.ModelTaskClientRouter({
    adapters: [
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
                responseFormatMode: "prompt_only",
                reasoningMode: input.reasoningMode === "none" ? "none" : "exclude",
                maxTokens: input.maxOutputTokens,
              },
            },
          });
          const startedAt = Date.now();
          const result = await client.callRole({
            roleId: "resource_scout",
            modelId: input.modelRef,
            modelCandidateId: `shared-domain-lifecycle:${input.callSite}:${input.modelRef}`,
            prompt: [
              input.systemPrompt,
              "",
              "USER_PAYLOAD_JSON:",
              stringifyJson(input.userPayload),
            ].join("\n"),
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

async function writeJson(name, value) {
  await fs.mkdir(artifactDir, { recursive: true });
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const target = path.join(artifactDir, name);
  await fs.writeFile(target, body, "utf8");
  return {
    path: `.artifacts/execution-platform/shared-domain-resource-lifecycle-real-model-proof/${name}`,
    sha256: `sha256:${sha256(body)}`,
    bytes: Buffer.byteLength(body, "utf8"),
  };
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

async function main() {
  await loadEnv();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  if (!apiKey) {
    throw new Error("openrouter_api_key_missing_for_shared_domain_resource_lifecycle_proof");
  }

  const providerCalls = [];
  const router = makeModelRouter({ apiKey, providerCalls });
  const runtimeJobId = "shared-domain-lifecycle-real-model";
  const workflowId = "agent_team.product_spec_planning";
  const graphId = "graph-shared-domain-lifecycle";
  const consumerNodeId = "planning-capsule-node";
  const capabilityManifest = api.buildRuntimeNodeCapabilityManifest();
  const codingCapability = capabilityManifest.capabilities.find(
    (capability) => capability.capabilityId === "implementation_microtask",
  );
  const planningCapability = capabilityManifest.capabilities.find(
    (capability) => capability.capabilityId === "planning_capsule_draft",
  );
  if (!codingCapability || !planningCapability) {
    throw new Error("shared_domain_lifecycle_required_capabilities_missing");
  }
  if (planningCapability.domainWorkerActionToolIds.includes("worker.edit.plan")) {
    throw new Error("planning_capability_exposes_coding_edit_tool");
  }

  const legalRefUniverse = api.buildResourceObjectiveFocusLegalRefUniverse({
    runtimeJobId,
    workflowId,
    graphId,
    consumerNodeId,
    workIntentRef: "work-intent://product-spec-planning/planning-capsule-node",
    nodeExecutionContractRef: "contract://product-spec-planning/planning-capsule-node",
    refs: [
      {
        ref: "prompt-section://product-spec/owner-constraints",
        kind: "source_prompt_section",
        boundedLabel: "Owner constraints from the Product/Spec prompt",
        authorityScopeRefs: ["prompt-section://product-spec/owner-constraints"],
        byteEstimate: 4_800,
      },
      {
        ref: "planning-capsule://existing/product-spec-overview",
        kind: "planning_capsule",
        boundedLabel: "Existing planning capsule overview",
        authorityScopeRefs: ["planning-capsule://existing/product-spec-overview"],
        byteEstimate: 6_200,
      },
      {
        ref: "file-window://extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts#L1-L160",
        kind: "bounded_file_window",
        boundedLabel: "Coding worker loop file window, not the planning target",
        authorityScopeRefs: [
          "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts",
        ],
        byteEstimate: 12_000,
      },
    ],
    maxSelectableHandles: 2,
    maxSemanticQuestions: 2,
  });
  const legalHandleOptions = legalRefUniverse.handles.map((handle) => ({
    handle: handle.handle,
    kind: handle.kind,
    boundedLabel: handle.boundedLabel,
    byteEstimate: handle.byteEstimate,
  }));
  const response = await router.runJson({
    boundaryId: "resource_objective_focus",
    taskClass: "tool_selection",
    callSite: "resource.focus.selector",
    systemPrompt: [
      "Select ResourceObjectiveFocus for one Product/Spec Planning node.",
      "Return exactly one compact JSON object, no prose.",
      "Allowed toolId values: resource.focus.accept, resource.focus.mark_unanswerable.",
      "Required shape: {\"toolId\":\"resource.focus.accept\",\"input\":{...}}.",
      "For resource.focus.accept input must include currentObjectiveSlot, resourceUseKind, nextUnknown, expectedUse, selectedRefHandles, selectedSemanticQuestions, stopWhenAnswered.",
      "Choose only legalHandleOptions[].handle. This is a planning-domain node, not a coding edit.",
    ].join("\n"),
    userPayload: {
      objective:
        "Draft a Product/Spec planning capsule from owner constraints and existing planning artifacts. Do not select coding file windows unless they are needed for planning-domain evidence.",
      capability: {
        capabilityId: planningCapability.capabilityId,
        domainProfileId: planningCapability.domainProfileId,
        domainResourceKinds: planningCapability.domainResourceKinds,
        domainActionGateKinds: planningCapability.domainActionGateKinds,
        domainWorkerActionToolIds: planningCapability.domainWorkerActionToolIds,
      },
      contrastCapability: {
        capabilityId: codingCapability.capabilityId,
        domainProfileId: codingCapability.domainProfileId,
        domainWorkerActionToolIds: codingCapability.domainWorkerActionToolIds,
      },
      legalHandleOptions,
      rawPromptStored: false,
      rawResponseStored: false,
    },
    requestedInputBytes: Buffer.byteLength(JSON.stringify(legalHandleOptions), "utf8") + 2_400,
    maxOutputTokens: 1_500,
    timeoutMs: 60_000,
    proofMode: true,
  });
  if (response.status === "blocked") {
    throw new Error(`shared_domain_lifecycle_model_router_blocked:${response.reasonCodes.join(",")}`);
  }
  const parsed = parseToolCall(response.responseText, [
    "resource.focus.accept",
    "resource.focus.mark_unanswerable",
  ]);
  if (!parsed || parsed.toolId !== "resource.focus.accept") {
    throw new Error("shared_domain_lifecycle_model_focus_not_accepted");
  }
  const focus = api.compileResourceObjectiveFocus({
    runtimeJobId,
    workflowId,
    graphId,
    consumerNodeId,
    workIntentRef: "work-intent://product-spec-planning/planning-capsule-node",
    nodeExecutionContractRef: "contract://product-spec-planning/planning-capsule-node",
    legalRefUniverse,
    ...normalizeFocusInput(parsed.input),
  });
  if (focus.status !== "accepted") {
    throw new Error(`shared_domain_lifecycle_focus_compile_failed:${focus.reasonCodes.join(",")}`);
  }
  const selectedRefs = api.selectedRefsFromResourceObjectiveFocus({ focus, legalRefUniverse });
  if (!selectedRefs.some((ref) => ref.startsWith("prompt-section://") || ref.startsWith("planning-capsule://"))) {
    throw new Error("shared_domain_lifecycle_model_selected_no_planning_resource");
  }
  const demand = api.openNodeResourceDemandSession({
    runtimeJobId,
    workflowId,
    graphId,
    consumerNodeId,
    workIntentRef: "work-intent://product-spec-planning/planning-capsule-node",
    nodeExecutionContractRef: "contract://product-spec-planning/planning-capsule-node",
    capabilityId: planningCapability.capabilityId,
    evidenceMode: ["planning_artifact_evidence"],
    targetCommitmentIds: ["commitment://product-spec/planning-domain-profile"],
    authorityScope: selectedRefs,
    demandReason: "Use the model-selected planning resource focus as node-local planning evidence.",
    expectedUse: "Open exact planning-domain resources for planning capsule drafting.",
    resourceObjectiveFocus: focus,
    legalRefUniverse,
  });
  if (demand.status !== "succeeded" || !demand.session) {
    throw new Error(`shared_domain_lifecycle_demand_open_failed:${demand.reasonCodes.join(",")}`);
  }
  const fulfilled = api.fulfillExactNodeResourceDemandHandles({
    session: demand.session,
    legalRefUniverse,
  });
  if (fulfilled.status !== "succeeded" || !fulfilled.fulfillment) {
    throw new Error(`shared_domain_lifecycle_exact_fulfillment_failed:${fulfilled.reasonCodes.join(",")}`);
  }
  const ledger = api.openNodeResourceLedger({
    runtimeJobId,
    workflowId,
    graphId,
    consumerNodeId,
    workIntentRef: "work-intent://product-spec-planning/planning-capsule-node",
    nodeExecutionContractRef: "contract://product-spec-planning/planning-capsule-node",
    nodeResourceDemandSessionRef: demand.session.sessionRef,
    capabilityId: planningCapability.capabilityId,
    evidenceMode: ["planning_artifact_evidence"],
    targetCommitmentIds: ["commitment://product-spec/planning-domain-profile"],
    authorityScope: selectedRefs,
  });
  if (ledger.status !== "succeeded" || !ledger.ledger) {
    throw new Error(`shared_domain_lifecycle_ledger_open_failed:${ledger.reasonCodes.join(",")}`);
  }
  const appended = api.appendNodeResourceDemandFulfillmentToLedger({
    ledger: ledger.ledger,
    session: fulfilled.session,
    request: fulfilled.request,
    fulfillment: fulfilled.fulfillment,
    summary: "Model-selected Product/Spec planning resources were opened as node-local evidence.",
    expectedUse: "Use the ledger entry for planning capsule action readiness.",
  });
  if (appended.status !== "succeeded") {
    throw new Error(`shared_domain_lifecycle_ledger_append_failed:${appended.reasonCodes.join(",")}`);
  }
  const runner = new api.NodeLifecycleTransitionRunner({ capabilityManifest });
  const now = new Date("2026-05-29T00:00:00.000Z");
  const projection = runner.project({
    graphId,
    snapshot: {
      graph: {
        graphId,
        parentWorkItemId: null,
        rootRuntimeJobId: runtimeJobId,
        workflowId,
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
      nodes: [
        {
          nodeId: consumerNodeId,
          graphId,
          nodeKind: "work_intent",
          assignedRole: "product_spec_planner",
          modelOrWorkerRef: "codex_app_server",
          runtimeJobId: null,
          humanTaskId: null,
          inputHandoffRefs: [],
          outputArtifactRefs: [],
          nodeStatus: "planned",
          budgetUsage: {},
          metadata: {
            capabilityId: planningCapability.capabilityId,
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
        },
      ],
      edges: [],
      roleInvocations: [],
      handoffPackets: [],
      artifactManifests: [],
      budgetLedgers: [],
      checkpoints: [],
      humanTasks: [],
    },
    node: {
      nodeId: consumerNodeId,
      graphId,
      nodeKind: "work_intent",
      assignedRole: "product_spec_planner",
      modelOrWorkerRef: "codex_app_server",
      runtimeJobId: null,
      humanTaskId: null,
      inputHandoffRefs: [],
      outputArtifactRefs: [],
      nodeStatus: "planned",
      budgetUsage: {},
      metadata: {
        capabilityId: planningCapability.capabilityId,
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
    },
  });
  if (
    projection.nextLegalTransitions.includes("worker.edit.plan") ||
    !projection.nextLegalTransitions.includes("planning.capsule.draft")
  ) {
    throw new Error("shared_domain_lifecycle_projection_exposed_wrong_domain_tools");
  }

  const proof = {
    artifactKind: "execution_platform.shared_domain_resource_lifecycle_real_model_proof",
    schemaVersion: PROOF_VERSION,
    status: "passed",
    providerCallCount: providerCalls.length,
    providerCalls,
    selectedPlanningRefs: selectedRefs,
    capabilityAssertions: {
      codingDomainProfileId: codingCapability.domainProfileId,
      planningDomainProfileId: planningCapability.domainProfileId,
      planningWorkerActionToolIds: planningCapability.domainWorkerActionToolIds,
      planningRequiredSnapshotKinds: planningCapability.requiredSnapshotKinds,
    },
    runtimeArtifacts: {
      focusRef: focus.focusRef,
      demandSessionRef: demand.session.sessionRef,
      fulfillmentRef: fulfilled.fulfillment.fulfillmentRef,
      ledgerRef: appended.ledger?.ledgerRef,
      ledgerEntryRef: appended.entry?.entryRef,
      lifecycleProjectionRef: projection.projectionRef,
      lifecycleProjectionGate: projection.currentGate,
      lifecycleNextLegalTransitions: projection.nextLegalTransitions,
    },
    modelMadeSemanticResourceChoice: true,
    runtimeSemanticJudgmentAllowed: false,
    metadataManifestPayloadBacked: true,
    ...safety,
  };
  const proofBytes = assertManifestBounds(proof, "shared_domain_lifecycle_proof");
  const proofArtifact = await writeJson("proof.json", proof);
  const manifest = {
    artifactKind: "execution_platform.shared_domain_resource_lifecycle_real_model_proof_manifest",
    schemaVersion: PROOF_VERSION,
    status: "passed",
    proofRef: "artifact://execution-platform/shared-domain-resource-lifecycle-real-model-proof/proof.json",
    proofSha256: proofArtifact.sha256,
    providerCallCount: providerCalls.length,
    selectedPlanningRefCount: selectedRefs.length,
    proofBytes,
    lifecycleProjectionGate: projection.currentGate,
    lifecycleNextLegalTransitions: projection.nextLegalTransitions,
    changedFileRefs: [
      "extensions/execution-platform/src/workflows/shared-domain-resource-lifecycle.ts",
      "extensions/execution-platform/src/workflows/runtime-node-capability-registry.ts",
      "extensions/execution-platform/src/workflows/resource-objective-focus.ts",
      "extensions/execution-platform/src/workflows/node-resource-demand-session.ts",
      "extensions/execution-platform/src/workflows/node-resource-ledger.ts",
      "extensions/execution-platform/src/workflows/node-lifecycle-transition-runner.ts",
    ],
    validationRefs: [
      "shared-domain-resource-lifecycle.test.ts",
      "runtime-node-capability-registry.test.ts",
      "node-resource-demand-session.test.ts",
      "node-resource-ledger.test.ts",
      "node-lifecycle-transition-runner.test.ts",
    ],
    ...safety,
  };
  assertManifestBounds(manifest, "shared_domain_lifecycle_manifest");
  const manifestArtifact = await writeJson("manifest.json", manifest);
  console.log(
    JSON.stringify(
      {
        status: "passed",
        proofPath: proofArtifact.path,
        manifestPath: manifestArtifact.path,
        providerCallCount: providerCalls.length,
        selectedPlanningRefCount: selectedRefs.length,
      },
      null,
      2,
    ),
  );
}

await main();
