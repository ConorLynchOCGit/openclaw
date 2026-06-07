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
  ".artifacts/execution-platform/capability-manifest-domain-lifecycle-real-model-proof",
);
const PROOF_VERSION = "execution-platform.capability-manifest-domain-lifecycle-real-model-proof.v1";
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
  return crypto
    .createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
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

function parseDecision(text) {
  for (const candidate of extractJsonObjectTexts(text)) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed.decisions)) {
        return parsed;
      }
    } catch {
      // Structural parser only; proof reports a bounded blocker below.
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
    path: `.artifacts/execution-platform/capability-manifest-domain-lifecycle-real-model-proof/${name}`,
    sha256: `sha256:${sha256(body)}`,
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

function compactCandidate(capability) {
  return {
    capabilityId: capability.capabilityId,
    displayName: capability.displayName,
    workflowId: capability.workflowId,
    roleClass: capability.roleClass,
    supportedExecutionIntents: capability.supportedExecutionIntents,
    domainProfileId: capability.domainProfileId,
    domainWorkerActionToolIds: capability.domainWorkerActionToolIds.slice(0, 8),
    requiresResources: capability.requiresResources,
    requiredResourcePacketKind: capability.requiredResourcePacketKind,
    requiredNodeExecutionPacket: capability.requiredNodeExecutionPacket,
    requiredSnapshotKinds: capability.requiredSnapshotKinds,
    requiredEvidenceClaimKinds: capability.requiredEvidenceClaimKinds,
    costClass: capability.costClass,
    latencyClass: capability.latencyClass,
  };
}

function selectedDecision(parsed, slotId) {
  return parsed.decisions.find(
    (decision) => decision && typeof decision === "object" && decision.slotId === slotId,
  );
}

async function main() {
  await loadEnv();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  if (!apiKey) {
    throw new Error("openrouter_api_key_missing_for_capability_manifest_domain_lifecycle_proof");
  }

  const manifest = api.buildRuntimeNodeCapabilityManifest();
  const modelMenu = api.runtimeNodeCapabilityManifestForModel();
  const modelMenuBytes = Buffer.byteLength(JSON.stringify(modelMenu), "utf8");
  if (modelMenuBytes > MANIFEST_MAX_BYTES) {
    throw new Error(`capability_model_menu_overflow:${modelMenuBytes}`);
  }

  const candidateIds = [
    "implementation_microtask",
    "implementation_complex",
    "validation_run",
    "planning_capsule_draft",
    "action_graph_proposal",
    "human_planning_decision",
    "coding_closeout",
  ];
  const candidates = candidateIds
    .map((capabilityId) =>
      manifest.capabilities.find((capability) => capability.capabilityId === capabilityId),
    )
    .filter(Boolean)
    .map(compactCandidate);

  const userPayload = {
    objective:
      "Select production runtime capabilities for two middle-lane work intents. One intent is a bounded coding source edit requiring snapshots and validation. The other intent is a Product/Spec Planning action-graph compilation that must not expose source-edit or patch tools.",
    allowedCapabilityIds: candidates.map((candidate) => candidate.capabilityId),
    capabilityMenu: candidates,
    slots: [
      {
        slotId: "coding_source_edit",
        workflowId: "agent_team.coding",
        executionIntent: "source_edit",
        requiredSourceMaterialKinds: ["candidate_resource_refs"],
        requiredEvidenceKinds: ["source_change"],
      },
      {
        slotId: "product_spec_action_graph",
        workflowId: "agent_team.product_spec_planning",
        executionIntent: "domain_action",
        requiredSourceMaterialKinds: ["planning_domain_resource_refs"],
        requiredEvidenceKinds: ["action_graph"],
      },
    ],
    requiredOutputShape:
      '{"decisions":[{"slotId":"coding_source_edit","capabilityId":"...","rationale":"bounded"},{"slotId":"product_spec_action_graph","capabilityId":"...","rationale":"bounded"}]}',
    rawPromptStored: false,
    rawResponseStored: false,
  };

  const requestedInputBytes = Buffer.byteLength(JSON.stringify(userPayload), "utf8");
  const router = new api.ModelTaskClientRouter({
    adapters: [
      {
        providerPath: "openrouter",
        async executeJson(input) {
          const client = new OpenRouterAgentTeamModelClient({
            apiKey,
            retryPolicy: { maxAttempts: 2, timeoutMs: input.timeoutMs },
            requestProfilesByModelId: {
              [input.modelRef]: {
                responseFormatMode:
                  input.responseFormatMode === "prompt_only_json" ? "prompt_only" : "json_object",
                reasoningMode: input.reasoningMode ?? "none",
                maxTokens: input.maxOutputTokens,
              },
            },
          });
          const prompt = [
            input.systemPrompt,
            "Return exactly one compact JSON object and no prose.",
            "Use only capability ids from userPayload.allowedCapabilityIds.",
            "Do not choose source-edit capabilities for Product/Spec Planning.",
            "",
            "USER_PAYLOAD_JSON:",
            stringifyJson(input.userPayload),
          ].join("\n");
          const startedAt = Date.now();
          const result = await client.callRole({
            roleId: "scheduler_capability_selection",
            modelId: input.modelRef,
            modelCandidateId: `capability-manifest-domain-lifecycle:${input.modelRef}`,
            prompt,
            maxTokens: input.maxOutputTokens,
            timeoutMs: input.timeoutMs,
            taskClass: input.taskClass,
            modelTaskCallSite: input.callSite,
          });
          return {
            status: result.status,
            responseText: result.responseText,
            responseHash: result.responseHash,
            latencyMs:
              typeof result.providerResponseDiagnostics?.elapsedMs === "number"
                ? result.providerResponseDiagnostics.elapsedMs
                : Date.now() - startedAt,
            httpStatus: result.httpStatus ?? null,
            errorReasonCode: result.errorReasonCode ?? null,
            usage: result.usage ?? null,
            providerResponseDiagnostics: {
              modelRef: input.modelRef,
              providerPath: input.providerPath,
              requestByteCount: Buffer.byteLength(prompt, "utf8"),
              responseByteCount: Buffer.byteLength(result.responseText ?? "", "utf8"),
              responseHash: result.responseHash,
              latencyMs: Date.now() - startedAt,
              httpStatus: result.httpStatus ?? null,
              errorReasonCode: result.errorReasonCode ?? null,
              diagnosticsHash: `sha256:${sha256(JSON.stringify(result.providerResponseDiagnostics ?? {}))}`,
              ...safety,
            },
          };
        },
      },
    ],
  });

  const result = await router.runJson({
    boundaryId: "scheduler_capability_selection",
    taskClass: "tool_selection",
    callSite: "scheduler.capability_selection",
    systemPrompt:
      "You are selecting capability ids from a compact runtime manifest. Make semantic choices; runtime will validate only structure, refs, authority, and lifecycle support.",
    userPayload,
    requestedInputBytes,
    maxOutputTokens: 1_000,
    timeoutMs: 60_000,
    proofMode: true,
  });

  const providerCall = {
    providerPath: "openrouter",
    status: result.status,
    classification: result.classification,
    requestByteCount: requestedInputBytes,
    responseByteCount: Buffer.byteLength(result.responseText ?? "", "utf8"),
    responseHash: result.responseHash,
    latencyMs: result.latencyMs,
    providerDiagnosticHash: `sha256:${sha256(JSON.stringify(result.providerResponseDiagnostics ?? {}))}`,
    reasonCodes: result.reasonCodes,
    ...safety,
  };
  if (result.status !== "succeeded") {
    throw new Error(
      `capability_manifest_domain_lifecycle_provider_failed:${result.reasonCodes.join(",")}`,
    );
  }

  const parsed = parseDecision(result.responseText);
  if (!parsed) {
    throw new Error("capability_manifest_domain_lifecycle_model_decision_missing");
  }
  const codingDecision = selectedDecision(parsed, "coding_source_edit");
  const planningDecision = selectedDecision(parsed, "product_spec_action_graph");
  if (!codingDecision || !planningDecision) {
    throw new Error("capability_manifest_domain_lifecycle_slot_decision_missing");
  }
  if (
    !["implementation_microtask", "implementation_complex"].includes(codingDecision.capabilityId)
  ) {
    throw new Error(
      `capability_manifest_domain_lifecycle_wrong_coding_capability:${codingDecision.capabilityId}`,
    );
  }
  if (!["action_graph_proposal"].includes(planningDecision.capabilityId)) {
    throw new Error(
      `capability_manifest_domain_lifecycle_wrong_planning_capability:${planningDecision.capabilityId}`,
    );
  }

  const codingValidation = api.compileCapabilityManifestRuntimeToolOutput({
    toolId: "capability.validate_intent",
    metadata: {
      capabilityId: codingDecision.capabilityId,
      workflowId: "agent_team.coding",
      phase: "execution",
      executionIntent: "source_edit",
      requiredSourceMaterialKinds: ["candidate_resource_refs"],
      requiredEvidenceKinds: ["source_change"],
    },
  });
  const planningValidation = api.compileCapabilityManifestRuntimeToolOutput({
    toolId: "capability.validate_intent",
    metadata: {
      capabilityId: planningDecision.capabilityId,
      workflowId: "agent_team.product_spec_planning",
      phase: "execution",
      executionIntent: "domain_action",
      requiredSourceMaterialKinds: ["planning_domain_resource_refs"],
      requiredEvidenceKinds: ["action_graph"],
    },
  });
  const codingResources = api.compileCapabilityManifestRuntimeToolOutput({
    toolId: "capability.require_resources",
    metadata: { capabilityId: codingDecision.capabilityId },
  });
  const planningTransitions = api.compileCapabilityManifestRuntimeToolOutput({
    toolId: "capability.list_legal_transitions",
    metadata: { capabilityId: planningDecision.capabilityId },
  });

  for (const [label, output] of [
    ["codingValidation", codingValidation],
    ["planningValidation", planningValidation],
    ["codingResources", codingResources],
    ["planningTransitions", planningTransitions],
  ]) {
    if (output.status !== "succeeded") {
      throw new Error(`${label}_not_succeeded:${output.reasonCodes.join(",")}`);
    }
    assertManifestBounds(output.metadata, label);
  }

  const proof = {
    artifactKind: "execution_platform.capability_manifest_domain_lifecycle_real_model_proof",
    schemaVersion: PROOF_VERSION,
    status: "passed",
    providerCallCount: 1,
    providerCalls: [providerCall],
    modelMenuBytes,
    requestedInputBytes,
    selectedCapabilityIds: {
      codingSourceEdit: codingDecision.capabilityId,
      productSpecActionGraph: planningDecision.capabilityId,
    },
    capabilityToolOutputs: {
      codingValidation: {
        outputRef: codingValidation.outputRef,
        outputHash: codingValidation.outputHash,
        reasonCodes: codingValidation.reasonCodes,
      },
      planningValidation: {
        outputRef: planningValidation.outputRef,
        outputHash: planningValidation.outputHash,
        reasonCodes: planningValidation.reasonCodes,
      },
      codingResources: {
        outputRef: codingResources.outputRef,
        outputHash: codingResources.outputHash,
        reasonCodes: codingResources.reasonCodes,
      },
      planningTransitions: {
        outputRef: planningTransitions.outputRef,
        outputHash: planningTransitions.outputHash,
        reasonCodes: planningTransitions.reasonCodes,
      },
    },
    productSpecPlanningDidNotSelectCodingEditCapability: true,
    codingSelectedSourceEditCapability: true,
    runtimeSemanticJudgmentAllowed: false,
    metadataManifestPayloadBacked: true,
    ...safety,
  };
  const proofBytes = assertManifestBounds(proof, "capability_manifest_domain_lifecycle_proof");
  const proofArtifact = await writeJson("proof.json", proof);
  const manifestArtifactBody = {
    artifactKind:
      "execution_platform.capability_manifest_domain_lifecycle_real_model_proof_manifest",
    schemaVersion: PROOF_VERSION,
    status: "passed",
    proofRef:
      "artifact://execution-platform/capability-manifest-domain-lifecycle-real-model-proof/proof.json",
    proofSha256: proofArtifact.sha256,
    providerCallCount: 1,
    providerStatus: result.status,
    selectedCodingCapabilityId: codingDecision.capabilityId,
    selectedPlanningCapabilityId: planningDecision.capabilityId,
    modelMenuBytes,
    requestedInputBytes,
    proofBytes,
    changedFileRefs: [
      "extensions/execution-platform/src/workflows/capability-manifest-domain-lifecycle.ts",
      "extensions/execution-platform/src/workflows/runtime-node-capability-registry.ts",
      "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
    ],
    validationRefs: [
      "capability-manifest-domain-lifecycle.test.ts",
      "runtime-node-capability-registry.test.ts",
      "scheduler-runtime-tools.test.ts",
    ],
    ...safety,
  };
  assertManifestBounds(manifestArtifactBody, "capability_manifest_domain_lifecycle_manifest");
  const manifestArtifact = await writeJson("manifest.json", manifestArtifactBody);
  console.log(
    JSON.stringify(
      {
        status: "passed",
        proofPath: proofArtifact.path,
        manifestPath: manifestArtifact.path,
        selectedCodingCapabilityId: codingDecision.capabilityId,
        selectedPlanningCapabilityId: planningDecision.capabilityId,
        modelMenuBytes,
      },
      null,
      2,
    ),
  );
}

await main();
