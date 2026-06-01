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
  ".artifacts/execution-platform/proof-framework-executor-subject-split-real-model-proof",
);
const proofRunsDir = path.join(root, ".artifacts/execution-platform/proof-runs");
const PROOF_VERSION = "execution-platform.proof-framework-executor-subject-split-real-model.v1";
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

function parseDecision(text) {
  for (const candidate of extractJsonObjectTexts(text)) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed.decisions)) {
        return parsed;
      }
    } catch {
      // Keep this structural only; the proof records a bounded blocker on failure.
    }
  }
  return null;
}

function decisionFor(parsed, slotId) {
  return parsed.decisions.find(
    (decision) => decision && typeof decision === "object" && decision.slotId === slotId,
  );
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
    path: `.artifacts/execution-platform/proof-framework-executor-subject-split-real-model-proof/${name}`,
    sha256: `sha256:${sha256(body)}`,
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

async function writeProofRunManifest(manifest) {
  const target = path.join(proofRunsDir, manifest.proofRunId, "manifest.json");
  const body = `${JSON.stringify(manifest, null, 2)}\n`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, body, "utf8");
  return {
    path: `.artifacts/execution-platform/proof-runs/${manifest.proofRunId}/manifest.json`,
    sha256: `sha256:${sha256(body)}`,
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

function buildRunManifest({
  proofRunId,
  proofFamily,
  executorWorkflowId,
  subjectWorkflowIds,
  targetSubjectRefs,
  requestedCapabilities,
}) {
  const proofRunManifestRef = `.artifacts/execution-platform/proof-runs/${proofRunId}/manifest.json`;
  const proofArtifactRef = `.artifacts/execution-platform/proof-runs/${proofRunId}/proof-family-gate.json`;
  const manifest = api.buildProductSpecProofRunManifest({
    proofRunId,
    proofRunManifestRef,
    proofFamily,
    executorWorkflowId,
    subjectWorkflowIds,
    targetSubjectRefs,
    requestedCapabilities,
    runtimeJobId: `proof-family-real-model-${proofRunId}`,
    graphId: `proof-family-real-model-graph-${proofRunId}`,
    proofSourceKind: api.PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
    sourceTopologyStatus: "production_node_local_topology",
    closurePredicateStatus: "admitted",
    proofClosureAllowed: true,
    boundaryCheckpointRefs: [`checkpoint://${proofRunId}/router-payload`],
    replayResultRef: proofArtifactRef,
    admissionGateRef: `.artifacts/execution-platform/proof-runs/${proofRunId}/admission-gate.json`,
    proofArtifactRef,
    validationRefs: [`validation://${proofRunId}/family-gate-passed`],
    evidenceClaimRefs: [`evidence://${proofRunId}/executor-subject-family`],
    reasonCodes: ["proof_framework_executor_subject_split_real_model_family_gate"],
  });
  api.assertProductSpecProofRunManifestBounds(manifest);
  return manifest;
}

async function main() {
  await loadEnv();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  if (!apiKey) {
    throw new Error("openrouter_api_key_missing_for_proof_framework_executor_subject_split");
  }

  const proofCases = [
    {
      slotId: "coding_implements_product_spec_framework",
      ownerPrompt:
        "Implement and harden the Product/Spec Planning workflow plugin, updating source, tests, runtime gates, proof manifests, and closeout evidence. The executor is the coding team; Product/Spec Planning is the target subject being implemented.",
      allowedFamilies: ["coding_executor_target_subject"],
      requiredExecutorWorkflowIds: ["agent_team.coding"],
      requiredSubjectWorkflowIds: ["agent_team.product_spec_planning"],
      requiredCapabilities: ["code_edit", "test"],
    },
    {
      slotId: "product_spec_planning_generates_planning_artifacts",
      ownerPrompt:
        "Run the Product/Spec Planning workflow to produce a planning capsule, obligation graph, action graph, risks, and acceptance criteria for a new feature. It must not edit source files or expose patch tools.",
      allowedFamilies: ["product_spec_planning_executor"],
      requiredExecutorWorkflowIds: ["agent_team.product_spec_planning"],
      requiredSubjectWorkflowIds: [],
      requiredCapabilities: ["planning"],
    },
  ];

  const userPayload = {
    objective:
      "Classify two Product/Spec-related proof jobs into executor/subject proof families. Choose only from the compact menu. Runtime will validate structure, refs, and capability authority only.",
    proofFamilies: [
      {
        proofFamily: "coding_executor_target_subject",
        executorWorkflowId: "agent_team.coding",
        targetSubjectWorkflowId: "agent_team.product_spec_planning",
        requiredCapabilities: ["code_edit", "test"],
        blockedCapabilities: [],
      },
      {
        proofFamily: "product_spec_planning_executor",
        executorWorkflowId: "agent_team.product_spec_planning",
        targetSubjectWorkflowId: null,
        requiredCapabilities: ["planning"],
        blockedCapabilities: ["code_edit", "source_edit", "test", "docs_update", "review"],
      },
    ],
    slots: proofCases.map((proofCase) => ({
      slotId: proofCase.slotId,
      ownerPrompt: proofCase.ownerPrompt,
      allowedFamilies: proofCase.allowedFamilies,
      requiredExecutorWorkflowIds: proofCase.requiredExecutorWorkflowIds,
      requiredSubjectWorkflowIds: proofCase.requiredSubjectWorkflowIds,
      requiredCapabilities: proofCase.requiredCapabilities,
    })),
    requiredOutputShape:
      "{\"decisions\":[{\"slotId\":\"...\",\"proofFamily\":\"...\",\"executorWorkflowId\":\"...\",\"subjectWorkflowIds\":[\"...\"],\"targetSubjectRefs\":[{\"targetKind\":\"workflow\",\"targetRef\":\"workflow://...\",\"confidence\":0.95}],\"requestedCapabilities\":[\"...\"],\"rationale\":\"bounded\"}]}",
    ...safety,
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
            "Use only proof family, executor workflow, subject workflow, and capability values present in USER_PAYLOAD_JSON.",
            "Do not classify source-edit implementation as Product/Spec Planning executor.",
            "Do not expose coding capabilities for Product/Spec Planning executor.",
            "",
            "USER_PAYLOAD_JSON:",
            stringifyJson(input.userPayload),
          ].join("\n");
          const startedAt = Date.now();
          const result = await client.callRole({
            roleId: "scheduler_capability_selection",
            modelId: input.modelRef,
            modelCandidateId: `proof-framework-executor-subject-split:${input.modelRef}`,
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
      "You are classifying Product/Spec proof executor/subject families from a compact menu. Make semantic choices; runtime validates structure, refs, authority, and storage only.",
    userPayload,
    requestedInputBytes,
    maxOutputTokens: 1_200,
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
    throw new Error(`proof_framework_executor_subject_split_provider_failed:${result.reasonCodes.join(",")}`);
  }

  const parsed = parseDecision(result.responseText);
  if (!parsed) {
    throw new Error("proof_framework_executor_subject_split_model_decision_missing");
  }
  const decisions = proofCases.map((proofCase) => {
    const decision = decisionFor(parsed, proofCase.slotId);
    if (!decision) {
      throw new Error(`proof_framework_executor_subject_split_slot_missing:${proofCase.slotId}`);
    }
    const gate = api.evaluateProductSpecProofFamily(decision);
    if (gate.status !== "passed") {
      throw new Error(
        `proof_framework_executor_subject_split_family_gate_failed:${proofCase.slotId}:${gate.reasonCodes.join(",")}`,
      );
    }
    return {
      slotId: proofCase.slotId,
      proofFamily: gate.proofFamily,
      executorWorkflowId: gate.executorWorkflowId,
      subjectWorkflowIds: gate.subjectWorkflowIds,
      targetSubjectRefs: gate.targetSubjectRefs,
      requestedCapabilities: gate.requestedCapabilities,
      gateStatus: gate.status,
      reasonCodes: gate.reasonCodes,
    };
  });

  const codingDecision = decisions.find(
    (decision) => decision.slotId === "coding_implements_product_spec_framework",
  );
  const planningDecision = decisions.find(
    (decision) => decision.slotId === "product_spec_planning_generates_planning_artifacts",
  );
  if (codingDecision?.proofFamily !== "coding_executor_target_subject") {
    throw new Error(`proof_framework_executor_subject_split_wrong_coding_family:${codingDecision?.proofFamily}`);
  }
  if (planningDecision?.proofFamily !== "product_spec_planning_executor") {
    throw new Error(
      `proof_framework_executor_subject_split_wrong_planning_family:${planningDecision?.proofFamily}`,
    );
  }

  const codingManifest = buildRunManifest({
    proofRunId: "proof-framework-executor-subject-split-coding",
    ...codingDecision,
  });
  const planningManifest = buildRunManifest({
    proofRunId: "proof-framework-executor-subject-split-planning",
    ...planningDecision,
  });
  const codingManifestArtifact = await writeProofRunManifest(codingManifest);
  const planningManifestArtifact = await writeProofRunManifest(planningManifest);

  const proof = {
    artifactKind: "execution_platform.proof_framework_executor_subject_split_real_model_proof",
    schemaVersion: PROOF_VERSION,
    status: "passed",
    providerCallCount: 1,
    providerCalls: [providerCall],
    requestedInputBytes,
    modelDecisionCount: decisions.length,
    decisions,
    codingFamilyGatePassed: codingDecision.proofFamily === "coding_executor_target_subject",
    planningFamilyGatePassed: planningDecision.proofFamily === "product_spec_planning_executor",
    runScopedManifests: [
      {
        proofRunId: codingManifest.proofRunId,
        proofRunManifestRef: codingManifest.proofRunManifestRef,
        proofSourceClassification: codingManifest.proofSourceClassification,
        manifestArtifact: codingManifestArtifact,
      },
      {
        proofRunId: planningManifest.proofRunId,
        proofRunManifestRef: planningManifest.proofRunManifestRef,
        proofSourceClassification: planningManifest.proofSourceClassification,
        manifestArtifact: planningManifestArtifact,
      },
    ],
    metadataManifestPayloadBacked: true,
    ...safety,
  };
  const proofBytes = assertManifestBounds(proof, "proof_framework_executor_subject_split_proof");
  const proofArtifact = await writeJson("proof.json", proof);
  const manifest = {
    artifactKind: "execution_platform.proof_framework_executor_subject_split_real_model_manifest",
    schemaVersion: PROOF_VERSION,
    status: "passed",
    proofRef:
      "artifact://execution-platform/proof-framework-executor-subject-split-real-model-proof/proof.json",
    proofSha256: proofArtifact.sha256,
    providerCallCount: 1,
    providerStatus: result.status,
    selectedProofFamilies: decisions.map((decision) => decision.proofFamily),
    codingManifestRef: codingManifest.proofRunManifestRef,
    planningManifestRef: planningManifest.proofRunManifestRef,
    requestedInputBytes,
    proofBytes,
    validationRefs: [
      "product-spec-proof-substrate.test.ts",
      "boundary-replay-proof-gate.test.ts",
    ],
    ...safety,
  };
  assertManifestBounds(manifest, "proof_framework_executor_subject_split_manifest");
  const manifestArtifact = await writeJson("manifest.json", manifest);
  console.log(
    JSON.stringify(
      {
        status: "passed",
        proofPath: proofArtifact.path,
        manifestPath: manifestArtifact.path,
        selectedProofFamilies: manifest.selectedProofFamilies,
        codingManifestRef: codingManifest.proofRunManifestRef,
        planningManifestRef: planningManifest.proofRunManifestRef,
      },
      null,
      2,
    ),
  );
}

await main();
