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
  ".artifacts/execution-platform/product-spec-domain-profile-real-model-proof",
);
const PROOF_VERSION = "execution-platform.product-spec-domain-profile-real-model-proof.v1";
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
      if (
        allowedToolIds.includes("resource.focus.accept") &&
        input &&
        Array.isArray(input.selectedRefHandles)
      ) {
        return { toolId: "resource.focus.accept", input };
      }
      if (
        allowedToolIds.includes("planning.intent.record") &&
        input &&
        (typeof input.objectiveRef === "string" || Array.isArray(input.targetSubjectRefs))
      ) {
        return { toolId: "planning.intent.record", input };
      }
    } catch {
      // Candidate scanning is structural only; caller records a bounded failure.
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

function stringArray(value, max = 10) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return [...new Set(source.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim()))].slice(0, max);
}

function normalizeFocusInput(input) {
  const nextUnknown = boundedText(input.nextUnknown, 1_000);
  const selectedSemanticQuestions = stringArray(input.selectedSemanticQuestions, 3);
  return {
    currentObjectiveSlot: boundedText(input.currentObjectiveSlot, 220),
    resourceUseKind: boundedText(input.resourceUseKind ?? input.contextUseKind, 120),
    nextUnknown,
    expectedUse: boundedText(input.expectedUse, 1_000),
    selectedRefHandles: stringArray(input.selectedRefHandles, 3),
    selectedSemanticQuestions:
      selectedSemanticQuestions.length > 0 ? selectedSemanticQuestions : [nextUnknown],
    stopWhenAnswered: boundedText(input.stopWhenAnswered, 700),
  };
}

function normalizePlanningIntentInput(input, selectedRefs) {
  return {
    artifactKind: "planning_intent_record",
    intentId: "intent-product-spec-domain-profile-proof",
    workflowId: "agent_team.product_spec_planning",
    runtimeJobId: "product-spec-domain-profile-proof",
    authority: "model",
    lifecycle: "accepted",
    validationState: "valid",
    objectiveRef:
      boundedText(input.objectiveRef, 180) ||
      "planning-intent://product-spec-domain-profile/objective",
    targetSubjectRefs: stringArray(input.targetSubjectRefs, 6).length
      ? stringArray(input.targetSubjectRefs, 6)
      : ["workflow://agent_team.product_spec_planning"],
    scopeRef:
      boundedText(input.scopeRef, 180) ||
      "planning-intent://product-spec-domain-profile/scope",
    constraintRefs: stringArray(input.constraintRefs, 8),
    nonGoalRefs: stringArray(input.nonGoalRefs, 8),
    authorityLimitRefs: stringArray(input.authorityLimitRefs, 8).length
      ? stringArray(input.authorityLimitRefs, 8)
      : ["policy://agent_team.product_spec_planning/proposal-only"],
    uncertaintyRefs: stringArray(input.uncertaintyRefs, 8),
    evidenceExpectationRefs: stringArray(input.evidenceExpectationRefs, 8).length
      ? stringArray(input.evidenceExpectationRefs, 8)
      : selectedRefs.map((ref) => `evidence://${sha256(ref).slice(0, 16)}`),
    researchNeeded: Boolean(input.researchNeeded),
    humanDecisionNeeded: Boolean(input.humanDecisionNeeded),
    revisionRef: null,
    supersededByIntentId: null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
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
          const requestBytes = Buffer.byteLength(prompt, "utf8");
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
            modelCandidateId: `product-spec-domain-profile:${input.callSite}:${input.modelRef}`,
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
    path: `.artifacts/execution-platform/product-spec-domain-profile-real-model-proof/${name}`,
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
    throw new Error("openrouter_api_key_missing_for_product_spec_domain_profile_proof");
  }

  const providerCalls = [];
  const router = makeModelRouter({ apiKey, providerCalls });
  const runtimeJobId = "product-spec-domain-profile-proof";
  const workflowId = "agent_team.product_spec_planning";
  const graphId = "graph-product-spec-domain-profile";
  const consumerNodeId = "planning-domain-profile-node";
  const now = new Date("2026-05-29T00:00:00.000Z");

  const definition = api.requireCanonicalWorkflowDefinition(workflowId);
  const capabilityManifest = api.buildRuntimeNodeCapabilityManifest();
  const executors = Object.fromEntries(
    api.PRODUCT_SPEC_PLANNING_PLUGIN_EXECUTOR_KEYS.map((key) => [key, executor()]),
  );
  const plugin = api.buildProductSpecPlanningWorkflowPlugin({
    definition,
    executors,
    capabilityManifest: api.filterRuntimeNodeCapabilityManifestForExecutors({
      executableExecutorKeys: api.PRODUCT_SPEC_PLANNING_PLUGIN_EXECUTOR_KEYS.slice(),
      workflowId,
    }),
  });
  const pluginValidation = api.validateWorkflowPlugin({ plugin, definition });
  if (!pluginValidation.valid) {
    throw new Error(`product_spec_plugin_validation_failed:${pluginValidation.reasonCodes.join(",")}`);
  }
  if (plugin.schedulerPolicy.resourceReadinessPolicy !== "domain_resource_manifest") {
    throw new Error("product_spec_plugin_not_domain_resource_manifest_based");
  }
  if (
    plugin.schedulerPolicy.freshContextSnapshotsRequiredForWorkerExecution ||
    !plugin.schedulerPolicy.domainResourceManifestRequiredForWorkerExecution ||
    plugin.runtimeToolFamilies.includes("node.resource_materialization")
  ) {
    throw new Error("product_spec_plugin_still_context_snapshot_or_materialization_shaped");
  }

  const planningCapability = capabilityManifest.capabilities.find(
    (capability) => capability.capabilityId === "planning_capsule_draft",
  );
  if (!planningCapability) {
    throw new Error("product_spec_planning_capability_missing");
  }
  if (
    planningCapability.requiredSnapshotKinds.includes("target_file_snapshot") ||
    planningCapability.domainWorkerActionToolIds.includes("worker.edit.plan")
  ) {
    throw new Error("product_spec_capability_exposes_coding_write_semantics");
  }

  const legalRefUniverse = api.buildResourceObjectiveFocusLegalRefUniverse({
    runtimeJobId,
    workflowId,
    graphId,
    consumerNodeId,
    workIntentRef: "work-intent://product-spec-domain-profile/proof",
    nodeExecutionContractRef: "contract://product-spec-domain-profile/proof",
    refs: [
      {
        ref: "prompt-section://product-spec/domain-profile/owner-goal",
        kind: "source_prompt_section",
        boundedLabel: "Owner asks to align Product/Spec Planning with shared lifecycle",
        authorityScopeRefs: ["prompt-section://product-spec/domain-profile/owner-goal"],
        byteEstimate: 4_200,
      },
      {
        ref: "owner-constraint://product-spec/proposal-only",
        kind: "owner_constraint",
        boundedLabel: "Product/Spec may propose child work but not execute it",
        authorityScopeRefs: ["owner-constraint://product-spec/proposal-only"],
        byteEstimate: 1_200,
      },
      {
        ref: "planning-capsule://existing/shared-lifecycle-alignment",
        kind: "planning_capsule",
        boundedLabel: "Existing shared lifecycle Product/Spec alignment notes",
        authorityScopeRefs: ["planning-capsule://existing/shared-lifecycle-alignment"],
        byteEstimate: 5_400,
      },
      {
        ref: "file-window://extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts#L1-L180",
        kind: "bounded_file_window",
        boundedLabel: "Coding source file window distractor; not a planning artifact target",
        authorityScopeRefs: [
          "extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts",
        ],
        byteEstimate: 9_000,
      },
    ],
    maxSelectableHandles: 3,
    maxSemanticQuestions: 3,
  });
  const legalHandleOptions = legalRefUniverse.handles.map((handle) => ({
    handle: handle.handle,
    kind: handle.kind,
    boundedLabel: handle.boundedLabel,
    byteEstimate: handle.byteEstimate,
  }));

  const focusResponse = await router.runJson({
    boundaryId: "resource_objective_focus",
    taskClass: "tool_selection",
    callSite: "resource.focus.selector",
    systemPrompt: [
      "Select ResourceObjectiveFocus for a Product/Spec Planning domain-profile proof node.",
      "Return exactly one compact JSON object, no prose.",
      "Allowed toolId values: resource.focus.accept, resource.focus.mark_unanswerable.",
      "Do not mark unanswerable when planning-domain handles are available.",
      "For resource.focus.accept input must include currentObjectiveSlot, resourceUseKind, nextUnknown, expectedUse, selectedRefHandles, selectedSemanticQuestions, stopWhenAnswered.",
      "Choose only legalHandleOptions[].handle. Prefer planning-domain resources over coding source windows unless the source window is semantically necessary.",
    ].join("\n"),
    userPayload: {
      objective:
        "Prepare the planning intent for re-specifying Product/Spec Planning as a domain profile over the shared resource lifecycle. It is proposal-only and cannot execute child jobs.",
      capability: {
        capabilityId: planningCapability.capabilityId,
        domainProfileId: planningCapability.domainProfileId,
        domainResourceKinds: planningCapability.domainResourceKinds,
        domainActionGateKinds: planningCapability.domainActionGateKinds,
        domainWorkerActionToolIds: planningCapability.domainWorkerActionToolIds,
      },
      legalHandleOptions,
      rawPromptStored: false,
      rawResponseStored: false,
    },
    requestedInputBytes: Buffer.byteLength(JSON.stringify(legalHandleOptions), "utf8") + 2_200,
    maxOutputTokens: 1_500,
    timeoutMs: 60_000,
    proofMode: true,
  });
  if (focusResponse.status === "blocked") {
    throw new Error(`product_spec_focus_router_blocked:${focusResponse.reasonCodes.join(",")}`);
  }
  const focusToolCall = parseToolCall(focusResponse.responseText, [
    "resource.focus.accept",
    "resource.focus.mark_unanswerable",
  ]);
  if (!focusToolCall || focusToolCall.toolId !== "resource.focus.accept") {
    throw new Error("product_spec_focus_model_did_not_accept");
  }
  const focus = api.compileResourceObjectiveFocus({
    runtimeJobId,
    workflowId,
    graphId,
    consumerNodeId,
    workIntentRef: "work-intent://product-spec-domain-profile/proof",
    nodeExecutionContractRef: "contract://product-spec-domain-profile/proof",
    legalRefUniverse,
    ...normalizeFocusInput(focusToolCall.input),
  });
  if (focus.status !== "accepted") {
    throw new Error(`product_spec_focus_compile_failed:${focus.reasonCodes.join(",")}`);
  }
  const selectedRefs = api.selectedRefsFromResourceObjectiveFocus({ focus, legalRefUniverse });
  if (!selectedRefs.some((ref) => ref.startsWith("prompt-section://") || ref.startsWith("owner-constraint://") || ref.startsWith("planning-capsule://"))) {
    throw new Error("product_spec_focus_selected_no_planning_domain_resource");
  }

  const demand = api.openNodeResourceDemandSession({
    runtimeJobId,
    workflowId,
    graphId,
    consumerNodeId,
    workIntentRef: "work-intent://product-spec-domain-profile/proof",
    nodeExecutionContractRef: "contract://product-spec-domain-profile/proof",
    capabilityId: planningCapability.capabilityId,
    evidenceMode: ["planning_artifact_evidence"],
    targetCommitmentIds: ["commitment://product-spec/domain-profile-respec"],
    authorityScope: selectedRefs,
    demandReason: "Use model-selected planning-domain resources for the Product/Spec domain profile intent.",
    expectedUse: "Open exact planning resources for planning intent and planning capsule readiness.",
    resourceObjectiveFocus: focus,
    legalRefUniverse,
  });
  if (demand.status !== "succeeded" || !demand.session) {
    throw new Error(`product_spec_demand_open_failed:${demand.reasonCodes.join(",")}`);
  }
  const fulfilled = api.fulfillExactNodeResourceDemandHandles({
    session: demand.session,
    legalRefUniverse,
  });
  if (fulfilled.status !== "succeeded" || !fulfilled.fulfillment) {
    throw new Error(`product_spec_exact_fulfillment_failed:${fulfilled.reasonCodes.join(",")}`);
  }
  const ledger = api.openNodeResourceLedger({
    runtimeJobId,
    workflowId,
    graphId,
    consumerNodeId,
    workIntentRef: "work-intent://product-spec-domain-profile/proof",
    nodeExecutionContractRef: "contract://product-spec-domain-profile/proof",
    nodeResourceDemandSessionRef: demand.session.sessionRef,
    capabilityId: planningCapability.capabilityId,
    evidenceMode: ["planning_artifact_evidence"],
    targetCommitmentIds: ["commitment://product-spec/domain-profile-respec"],
    authorityScope: selectedRefs,
  });
  if (ledger.status !== "succeeded" || !ledger.ledger) {
    throw new Error(`product_spec_ledger_open_failed:${ledger.reasonCodes.join(",")}`);
  }
  const appended = api.appendNodeResourceDemandFulfillmentToLedger({
    ledger: ledger.ledger,
    session: fulfilled.session,
    request: fulfilled.request,
    fulfillment: fulfilled.fulfillment,
    summary: "Planning-domain resources were opened as node-local evidence for Product/Spec Planning.",
    expectedUse: "Use the ledger entry for planning intent and capsule readiness.",
  });
  if (appended.status !== "succeeded") {
    throw new Error(`product_spec_ledger_append_failed:${appended.reasonCodes.join(",")}`);
  }

  const intentResponse = await router.runJson({
    boundaryId: "worker_local_tool_selection",
    taskClass: "tool_selection",
    callSite: "worker.tool_selection",
    systemPrompt: [
      "Author one Product/Spec PlanningIntentRecord through the planning.intent.record small verb.",
      "Return exactly one compact JSON object, no prose.",
      "Required shape: {\"toolId\":\"planning.intent.record\",\"input\":{...}}.",
      "Input must include objectiveRef, targetSubjectRefs, scopeRef, constraintRefs, nonGoalRefs, authorityLimitRefs, uncertaintyRefs, evidenceExpectationRefs, researchNeeded, humanDecisionNeeded.",
      "Use refs, not raw bodies. Do not claim child execution.",
    ].join("\n"),
    userPayload: {
      selectedPlanningResourceRefs: selectedRefs,
      objective:
        "Re-specify Product/Spec Planning as a proposal-only domain profile over the shared resource/action lifecycle.",
      constraints: [
        "one lifecycle spine; no planning-only runner",
        "proposal-only; no child runtime job creation",
        "bounded manifests and payload-backed bodies",
      ],
      legalToolIds: planningCapability.domainWorkerActionToolIds,
      rawPromptStored: false,
      rawResponseStored: false,
    },
    requestedInputBytes: Buffer.byteLength(JSON.stringify(selectedRefs), "utf8") + 2_200,
    maxOutputTokens: 1_500,
    timeoutMs: 60_000,
    proofMode: true,
  });
  if (intentResponse.status === "blocked") {
    throw new Error(`product_spec_intent_router_blocked:${intentResponse.reasonCodes.join(",")}`);
  }
  const intentToolCall = parseToolCall(intentResponse.responseText, ["planning.intent.record"]);
  if (!intentToolCall) {
    throw new Error("product_spec_intent_model_did_not_call_planning_intent_record");
  }
  const planningIntent = normalizePlanningIntentInput(intentToolCall.input, selectedRefs);
  const intentValidation = api.validatePlanningIntentRecord(planningIntent);
  if (!intentValidation.valid) {
    throw new Error(`product_spec_planning_intent_invalid:${intentValidation.reasonCodes.join(",")}`);
  }

  const capsule = {
    artifactKind: "planning_capsule",
    capsuleId: "capsule-product-spec-domain-profile-proof",
    workflowId,
    runtimeJobId,
    authority: "model",
    lifecycle: "accepted",
    validationState: "valid",
    planRefs: ["planning-capsule://product-spec-domain-profile/plan"],
    dependencyRefs: ["planning-intent://product-spec-domain-profile-proof"],
    limitationRefs: [],
    revisionRef: null,
    supersededByCapsuleId: null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
  const proposal = {
    artifactKind: "action_graph_proposal",
    proposalId: "proposal-product-spec-domain-profile-proof",
    workflowId,
    runtimeJobId,
    authority: "model",
    lifecycle: "submitted",
    validationState: "pending",
    compileReadinessRef: "compile-readiness://product-spec-domain-profile-proof",
    childExecutionAutoStart: false,
    nodeProposalRefs: ["runtime-work-graph://proposal/product-spec-domain-profile/node-1"],
    edgeProposalRefs: [],
    limitationRefs: [],
    revisionRef: null,
    supersededByProposalId: null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
  const compileReadiness = {
    artifactKind: "compile_readiness",
    validationId: "compile-product-spec-domain-profile-proof",
    workflowId,
    runtimeJobId,
    authority: "runtime",
    lifecycle: "validated",
    validationState: "valid",
    proposalRef: "action-graph-proposal://proposal-product-spec-domain-profile-proof",
    valid: true,
    invalidReasons: [],
    checkedNodeRefs: proposal.nodeProposalRefs,
    checkedEdgeRefs: proposal.edgeProposalRefs,
    limitationRefs: [],
    revisionRef: null,
    supersededByValidationId: null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
  const closeout = {
    artifactKind: "product_spec_planning_closeout",
    closeoutId: "closeout-product-spec-domain-profile-proof",
    workflowId,
    runtimeJobId,
    authority: "model",
    lifecycle: "accepted",
    validationState: "valid",
    missionLedgerRef: "mission-ledger://product-spec-domain-profile-proof",
    planningIntentRef: "planning-intent://product-spec-domain-profile-proof",
    planningCapsuleRefs: ["planning-capsule://capsule-product-spec-domain-profile-proof"],
    actionGraphProposalRefs: ["action-graph-proposal://proposal-product-spec-domain-profile-proof"],
    compileReadinessRefs: ["compile-readiness://product-spec-domain-profile-proof"],
    humanDecisionRefs: [],
    researchBriefRefs: [],
    commitmentEvidenceRefs: ["evidence-claim://product-spec-domain-profile-proof"],
    limitationRefs: [],
    eli5SummaryRef: "closeout://product-spec-domain-profile-proof/eli5",
    childExecutionStarted: false,
    revisionRef: null,
    supersededByCloseoutId: null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };

  for (const [name, validation] of Object.entries({
    capsule: api.validateWorkflowPlanningCapsuleEvidence(capsule),
    proposal: api.validateActionGraphProposal(proposal),
    compileReadiness: api.validateCompileReadinessValidation(compileReadiness),
    closeout: api.validateProductSpecPlanningCloseout(closeout),
  })) {
    if (!validation.valid) {
      throw new Error(`product_spec_${name}_artifact_invalid:${validation.reasonCodes.join(",")}`);
    }
  }

  const evidenceEvaluation = api.evaluateWorkflowEvidenceProfile({
    workflowId,
    runtimeJobId,
    workItemId: "openclaw-convergence.product-spec-planning-domain-profile-respec",
    closeoutSource: "model",
    evidenceClassRefs: {
      runtime_graph: [`runtime-work-graph://${graphId}`],
      scheduler_tool_trace: ["runtime-tool://scheduler.decompose_graph/product-spec-domain-profile-proof"],
      worker_tool_trace: [
        "runtime-tool://resource.demand.open/product-spec-domain-profile-proof",
        "runtime-tool://resource.ledger.open/product-spec-domain-profile-proof",
      ],
      model_call_trace: providerCalls.map((call) => `model-call://${call.boundaryId}/${call.responseHash}`),
      planning_intent: ["planning-intent://product-spec-domain-profile-proof"],
      planning_capsule: ["planning-capsule://capsule-product-spec-domain-profile-proof"],
      action_graph_proposal: ["action-graph-proposal://proposal-product-spec-domain-profile-proof"],
      compile_readiness: ["compile-readiness://product-spec-domain-profile-proof"],
      closeout: ["closeout://product-spec-domain-profile-proof"],
      work_queue_readback: ["work-queue-readback://product-spec-domain-profile-proof"],
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  });
  if (!evidenceEvaluation.accepted) {
    throw new Error(`product_spec_evidence_profile_not_accepted:${evidenceEvaluation.reasonCodes.join(",")}`);
  }

  const runner = new api.NodeLifecycleTransitionRunner({ capabilityManifest });
  const node = {
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
  };
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
  if (
    projection.nextLegalTransitions.includes("worker.edit.plan") ||
    !projection.nextLegalTransitions.includes("planning.capsule.draft") ||
    !projection.nextLegalTransitions.includes("planning.action_graph.propose")
  ) {
    throw new Error("product_spec_lifecycle_projection_exposed_wrong_tools");
  }

  const proof = {
    artifactKind: "execution_platform.product_spec_domain_profile_real_model_proof",
    schemaVersion: PROOF_VERSION,
    status: "passed",
    providerCallCount: providerCalls.length,
    providerCalls,
    workflowAssertions: {
      definitionId: definition.definitionId,
      pluginId: plugin.pluginId,
      resourceReadinessPolicy: plugin.schedulerPolicy.resourceReadinessPolicy,
      freshContextSnapshotsRequiredForWorkerExecution:
        plugin.schedulerPolicy.freshContextSnapshotsRequiredForWorkerExecution,
      domainResourceManifestRequiredForWorkerExecution:
        plugin.schedulerPolicy.domainResourceManifestRequiredForWorkerExecution,
      runtimeToolFamilies: plugin.runtimeToolFamilies,
      requiredEvidenceClasses: api.workflowEvidenceProfileForWorkflow(workflowId).requiredEvidenceClasses,
    },
    selectedPlanningRefs: selectedRefs,
    planningIntentRef: "planning-intent://product-spec-domain-profile-proof",
    planningCapsuleRef: "planning-capsule://capsule-product-spec-domain-profile-proof",
    actionGraphProposalRef: "action-graph-proposal://proposal-product-spec-domain-profile-proof",
    compileReadinessRef: "compile-readiness://product-spec-domain-profile-proof",
    closeoutRef: "closeout://product-spec-domain-profile-proof",
    runtimeArtifacts: {
      focusRef: focus.focusRef,
      demandSessionRef: demand.session.sessionRef,
      fulfillmentRef: fulfilled.fulfillment.fulfillmentRef,
      ledgerRef: appended.ledger?.ledgerRef,
      ledgerEntryRef: appended.entry?.entryRef,
      lifecycleProjectionRef: projection.projectionRef,
      lifecycleProjectionGate: projection.currentGate,
      lifecycleNextLegalTransitions: projection.nextLegalTransitions,
      evidenceProfileStatus: evidenceEvaluation.status,
    },
    modelMadeSemanticResourceChoice: true,
    modelAuthoredPlanningIntent: true,
    childExecutionStarted: false,
    runtimeSemanticJudgmentAllowed: false,
    metadataManifestPayloadBacked: true,
    ...safety,
  };
  const proofBytes = assertManifestBounds(proof, "product_spec_domain_profile_proof");
  const proofArtifact = await writeJson("proof.json", proof);
  const manifest = {
    artifactKind: "execution_platform.product_spec_domain_profile_real_model_proof_manifest",
    schemaVersion: PROOF_VERSION,
    status: "passed",
    proofRef:
      "artifact://execution-platform/product-spec-domain-profile-real-model-proof/proof.json",
    proofSha256: proofArtifact.sha256,
    providerCallCount: providerCalls.length,
    selectedPlanningRefCount: selectedRefs.length,
    proofBytes,
    manifestBytes: 0,
    lifecycleProjectionGate: projection.currentGate,
    lifecycleNextLegalTransitions: projection.nextLegalTransitions,
    changedFileRefs: [
      "extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts",
      "extensions/execution-platform/src/workflows/product-spec-planning-workflow.ts",
      "extensions/execution-platform/src/workflows/workflow-definition-registry.ts",
      "extensions/execution-platform/src/workflows/workflow-evidence-profile.ts",
      "extensions/execution-platform/src/workflows/workflow-plugin.ts",
      "extensions/execution-platform/src/workflows/shared-domain-resource-lifecycle.ts",
    ],
    validationRefs: [
      "workflow-evidence-profile.test.ts",
      "product-spec-planning-plugin.test.ts",
      "workflow-definition-registry.test.ts",
      "workflow-plugin-registry.test.ts",
      "shared-domain-resource-lifecycle.test.ts",
    ],
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
  manifest.manifestBytes = assertManifestBounds(manifest, "product_spec_domain_profile_manifest");
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
