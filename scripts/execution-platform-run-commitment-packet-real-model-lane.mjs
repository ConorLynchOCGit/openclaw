#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { OpenRouterAgentTeamModelClient } from "../extensions/execution-platform/src/codex-bridge/live-agent-team-runner.ts";
import { MissionContractLedgerSchema } from "../extensions/execution-platform/src/workflows/mission-contract-ledger.ts";
import {
  normalizeModelAuthoredCommitmentWorkPackets,
  summarizeCommitmentWorkPacketsForArtifact,
  validateCommitmentWorkPacketsForScheduler,
} from "../extensions/execution-platform/src/workflows/mission-work-packets.ts";

const ARTIFACT_DIR = ".artifacts/execution-platform";

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

async function loadEnvFile(filePath) {
  const text = await fs.readFile(filePath, "utf8").catch(() => "");
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^['"]|['"]$/gu, "");
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function loadDotenvFiles() {
  for (const filePath of [
    ".env",
    ".env.local",
    ".env.execution-platform-staging",
    "/root/.openclaw/.env",
  ]) {
    await loadEnvFile(path.resolve(filePath));
  }
}

async function writeArtifact(name, value) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const target = path.join(ARTIFACT_DIR, name);
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(target, body, "utf8");
  return {
    artifactRef: target,
    artifactHash: sha256(body),
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

function boundedSafety() {
  return {
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}

function parseJsonObject(text) {
  const trimmed = String(text ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "");
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("model_output_not_json_object");
  }
  return parsed;
}

function recordValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim().length > 0)
    : [];
}

function semanticDraftFromModelOutput(value) {
  const record = recordValue(value);
  const packetArrayDraft =
    Array.isArray(record.commitmentWorkPackets) && record.commitmentWorkPackets.length > 0
      ? recordValue(record.commitmentWorkPackets[0])
      : {};
  return recordValue(
    record.packetSemanticContent ??
      record.semanticPacketContent ??
      record.packetBrief ??
      record.packetDraft ??
      record.semanticDraft ??
      record.commitmentPacketDraft ??
      record.packetBriefPatch ??
      record.packetDraftPatch ??
      record.semanticPatch ??
      record.commitmentWorkPacket ??
      record.packet ??
      packetArrayDraft ??
      record,
  );
}

function missingSemanticPacketFields(draft) {
  const textFields = [
    "commitmentMeaning",
    "workerObjective",
    "contextScoutObjective",
    "implementationObjective",
    "validationObjective",
    "reviewObjective",
    "downstreamConsumer",
  ];
  const listFields = [
    "acceptanceCriteria",
    "remainingWork",
    "requiredContextQuestions",
    "expectedContextScoutOutput",
    "expectedImplementationOutput",
    "expectedValidationOutput",
    "requiredEvidenceClaimDescriptions",
    "stopIfMissing",
  ];
  const missing = [];
  for (const field of textFields) {
    if (!(typeof draft[field] === "string" && draft[field].trim().length >= 20)) {
      missing.push(field);
    }
  }
  for (const field of listFields) {
    if (stringArray(draft[field]).length === 0) {
      missing.push(field);
    }
  }
  return missing.slice(0, 20);
}

function compilePacketFromSemanticDraft({ ledger, commitmentId, draft }) {
  return normalizeModelAuthoredCommitmentWorkPackets({
    ledger,
    value: {
      commitmentWorkPackets: [
        {
          commitmentId,
          ...draft,
        },
      ],
    },
  })[0];
}

function createLedger() {
  return MissionContractLedgerSchema.parse({
    artifactKind: "mission_contract_ledger",
    schemaVersion: "execution-platform.mission-contract-ledger.v1",
    missionId: "commitment-packet-real-model-lane",
    sourceRuntimeJobId: "diagnostic.commitment-packet-real-model-lane",
    sourceWorkItemId: "diagnostic.commitment-packet-real-model-lane",
    ownerObjectiveSummary:
      "Implement Product/Spec Planning as a first-class scheduler-backed OpenClaw workflow using the generic orchestration runtime, without proof-only shortcuts.",
    blockingCommitments: [
      {
        commitmentId: "commitment.product_spec_workflow_registration",
        commitmentText:
          "Register agent_team.product_spec_planning as a production workflow definition and plugin with allowed capabilities, evidence profile, human decision policy, closeout policy, and route readiness.",
        whyItMatters:
          "The Product/Spec Planning proof can only be real if it runs through the canonical workflow/runtime definitions rather than a coding-team side effect or proof harness.",
        expectedEvidenceDescription:
          "Workflow definition, plugin registration, capability/evidence policy, route eligibility, and focused tests proving production registration.",
        acceptedEvidenceRefs: [],
        rejectedEvidenceRefs: [],
        status: "pending",
        rationale: null,
        remainingWork: [
          "Find the authoritative workflow definition registry and plugin surfaces.",
          "Identify where evidence profiles and human decision policies are attached.",
          "Add or update tests proving the workflow is selectable only through the proper executor path.",
        ],
        blocking: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    ],
    nonBlockingCommitments: [],
    explicitNonGoals: [
      "Do not deploy.",
      "Do not send outbound messages.",
      "Do not store raw prompts, raw responses, transcripts, provider logs, tool logs, secrets, or hidden reasoning.",
    ],
    safetyConstraints: [],
    prohibitedDirectiveCandidates: [],
    authorityBoundary: {
      requestedAuthority: "code_edit",
      maximumAuthority: "source_edit_and_validation_only",
      requiresApproval: false,
      approvalRefs: [],
      authorityRefs: [],
      rawPromptStored: false,
      rawResponseStored: false,
    },
    storagePolicy: {
      rawPromptStorageAllowed: false,
      rawResponseStorageAllowed: false,
      rawTranscriptStorageAllowed: false,
      rawProviderLogStorageAllowed: false,
      rawToolLogStorageAllowed: false,
      rawDbRowStorageAllowed: false,
      secretsStorageAllowed: false,
      boundedRefsOnly: true,
    },
    lifecycleBoundary: {
      workQueueLifecycleMutationAllowed: false,
      authorityGrantAllowed: false,
      deployAllowed: false,
      outboundSendAllowed: false,
      modelPromotionAllowed: false,
      runtimeJobLifecycleOwner: "runtime_jobs",
    },
    missionGate: "clear_to_execute",
    missionGateRationale: null,
    revisionProposals: [],
    ledgerStatus: "pending",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  });
}

function compactPacketAuthorContext() {
  return {
    workflowDefinitionRefs: [
      "extensions/execution-platform/src/workflows/workflow-definition-registry.ts",
      "extensions/execution-platform/src/workflows/canonical-workflow-runtime.ts",
    ],
    likelyPluginRefs: [
      "extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts",
      "extensions/execution-platform/src/workflows/workflow-evidence-profile.ts",
    ],
    readbackRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
    validationRefs: [
      "pnpm test:file extensions/execution-platform/src/workflows/workflow-definition-registry.test.ts",
      "pnpm test:file extensions/execution-platform/src/workflows/product-spec-planning-plugin.test.ts",
    ],
    promptBrief:
      "The owner wants a production Product/Spec Planning workflow with planning orchestrator, web research, planning capsule draft/revision, human planning decision, action graph proposal, compile runtime plan, planning closeout, Work Queue readback, and validation. The work must be first-class, scheduler-backed, no proof-only or fallback paths.",
  };
}

async function callModel({ client, modelRef, candidateId, prompt, maxTokens, timeoutMs }) {
  const startedAt = Date.now();
  const response = await client.callRole({
    roleId: "context_scout",
    modelId: modelRef,
    modelCandidateId: candidateId,
    prompt,
    responseFormat: "json_object",
    requestProfileOverride: {
      responseFormatMode: "prompt_only",
      reasoningMode: "none",
      maxTokens,
    },
    maxTokens,
    timeoutMs,
    maxAttempts: 1,
  });
  return {
    response,
    latencyMs: Date.now() - startedAt,
    promptBytes: Buffer.byteLength(prompt, "utf8"),
    responseBytes: Buffer.byteLength(response.responseText ?? "", "utf8"),
  };
}

async function main() {
  await loadDotenvFiles();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const laneId = `commitment-packet-real-model-lane-${Date.now().toString(36)}`;
  const modelRef =
    process.env.OPENCLAW_COMMITMENT_PACKET_REAL_MODEL_LANE_MODEL ?? "qwen/qwen3-coder-next";
  const maxTokens = Number(
    process.env.OPENCLAW_COMMITMENT_PACKET_REAL_MODEL_LANE_MAX_TOKENS ?? 2_500,
  );
  const timeoutMs = Number(
    process.env.OPENCLAW_COMMITMENT_PACKET_REAL_MODEL_LANE_TIMEOUT_MS ?? 180_000,
  );

  if (!apiKey) {
    const artifact = await writeArtifact(`${laneId}.json`, {
      artifactKind: "commitment_packet_real_model_lane",
      laneId,
      status: "needs_review",
      providerCallMade: false,
      blocker: "OPENROUTER_API_KEY not configured in loaded environment refs.",
      ...boundedSafety(),
    });
    console.log(JSON.stringify({ status: "needs_review", ...artifact }, null, 2));
    return;
  }

  const ledger = createLedger();
  const commitment = ledger.blockingCommitments[0];
  const client = new OpenRouterAgentTeamModelClient({
    apiKey,
    retryPolicy: { maxAttempts: 1, timeoutMs },
    requestProfilesByModelId: {
      [modelRef]: {
        responseFormatMode: "prompt_only",
        reasoningMode: "none",
        maxTokens,
      },
    },
  });
  const semanticPrompt = [
    "You are the OpenClaw Commitment Packet semantic-content author for one commitment.",
    "Return strict JSON only with packetSemanticContent.",
    "Do not create runtime node ids, graph node kinds, executor keys, worker refs, evidence enums, authority grants, lifecycle changes, or storage refs.",
    "Write enough operational detail for context scout, implementation, validation, and review workers to act without guessing.",
    "Required semantic fields: commitmentMeaning, workerObjective, contextScoutObjective, implementationObjective, validationObjective, reviewObjective, acceptanceCriteria, remainingWork, requiredContextQuestions, expectedContextScoutOutput, expectedImplementationOutput, expectedValidationOutput, requiredEvidenceClaimDescriptions, stopIfMissing, downstreamConsumer.",
    "Do not include raw prompt text, raw response text, transcripts, provider logs, tool logs, secrets, or hidden reasoning. Set rawPromptStored/rawResponseStored/rawProviderLogStored false.",
    JSON.stringify({
      missionBrief: {
        missionId: ledger.missionId,
        ownerObjectiveSummary: ledger.ownerObjectiveSummary,
        explicitNonGoals: ledger.explicitNonGoals,
      },
      targetCommitment: commitment,
      packetAuthorContextPack: compactPacketAuthorContext(),
      requestedShape: {
        packetSemanticContent: {
          commitmentMeaning: "specific bounded string",
          workerObjective: "specific bounded string",
          contextScoutObjective: "specific bounded string",
          implementationObjective: "specific bounded string",
          validationObjective: "specific bounded string",
          reviewObjective: "specific bounded string",
          acceptanceCriteria: ["specific bounded string"],
          remainingWork: ["specific bounded string"],
          requiredContextQuestions: ["specific bounded string"],
          allowedContextRequestHints: ["specific bounded string"],
          expectedContextScoutOutput: ["specific bounded string"],
          expectedImplementationOutput: ["specific bounded string"],
          expectedValidationOutput: ["specific bounded string"],
          expectedReviewReadbackOutput: ["specific bounded string"],
          requiredEvidenceClaimDescriptions: ["specific bounded string"],
          stopIfMissing: ["specific bounded string"],
          uncertaintiesAndRisks: ["specific bounded string"],
          downstreamConsumer: "runtime_work_graph_scheduler",
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    }),
  ].join("\n");

  const semanticCall = await callModel({
    client,
    modelRef,
    candidateId: "commitment-packet-real-model-semantic-content",
    prompt: semanticPrompt,
    maxTokens,
    timeoutMs,
  });
  if (semanticCall.response.status !== "succeeded" || !semanticCall.response.responseText) {
    const artifact = await writeArtifact(`${laneId}.json`, {
      artifactKind: "commitment_packet_real_model_lane",
      laneId,
      status: "needs_review",
      providerCallMade: true,
      modelRef,
      semanticCall: {
        status: semanticCall.response.status,
        errorReasonCode: semanticCall.response.errorReasonCode ?? null,
        latencyMs: semanticCall.latencyMs,
        promptBytes: semanticCall.promptBytes,
        responseBytes: semanticCall.responseBytes,
        usage: semanticCall.response.usage ?? null,
      },
      reasonCodes: ["semantic_content_model_call_failed"],
      ...boundedSafety(),
    });
    console.log(JSON.stringify({ status: "needs_review", ...artifact }, null, 2));
    process.exitCode = 1;
    return;
  }

  const semanticDraft = semanticDraftFromModelOutput(
    parseJsonObject(semanticCall.response.responseText),
  );
  const initialMissing = missingSemanticPacketFields(semanticDraft);
  const forcedMissingFields = ["validationObjective", "expectedValidationOutput"];
  const incompleteDraft = { ...semanticDraft };
  for (const field of forcedMissingFields) {
    delete incompleteDraft[field];
  }
  const normalizationPrompt = [
    "You are the OpenClaw Commitment Packet targeted normalizer.",
    "Return strict JSON only with packetBriefPatch. Fill only the missing fields. Do not regenerate the full packet.",
    "Do not create runtime node ids, graph node kinds, executor keys, worker refs, evidence enums, authority grants, lifecycle changes, or storage refs.",
    "Do not include raw prompt text, raw response text, transcripts, provider logs, tool logs, secrets, or hidden reasoning.",
    JSON.stringify({
      missionBrief: {
        missionId: ledger.missionId,
        ownerObjectiveSummary: ledger.ownerObjectiveSummary,
      },
      targetCommitment: commitment,
      semanticPacketContent: incompleteDraft,
      missingSemanticFields: forcedMissingFields,
      packetAuthorContextPack: compactPacketAuthorContext(),
      requestedShape: {
        packetBriefPatch: {
          validationObjective: "specific bounded string",
          expectedValidationOutput: ["specific bounded string"],
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    }),
  ].join("\n");

  const normalizationCall = await callModel({
    client,
    modelRef,
    candidateId: "commitment-packet-real-model-targeted-normalization",
    prompt: normalizationPrompt,
    maxTokens: Math.min(maxTokens, 1_400),
    timeoutMs,
  });
  const patch =
    normalizationCall.response.status === "succeeded" && normalizationCall.response.responseText
      ? semanticDraftFromModelOutput(parseJsonObject(normalizationCall.response.responseText))
      : {};
  const mergedDraft = { ...incompleteDraft, ...patch };
  const finalMissing = missingSemanticPacketFields(mergedDraft);
  const packet = compilePacketFromSemanticDraft({
    ledger,
    commitmentId: commitment.commitmentId,
    draft: mergedDraft,
  });
  const acceptedPacket = {
    ...packet,
    qualityStatus: "accepted",
  };
  const schedulerValidation = validateCommitmentWorkPacketsForScheduler({
    ledger,
    packets: [acceptedPacket],
  });
  const accepted =
    semanticCall.response.status === "succeeded" &&
    normalizationCall.response.status === "succeeded" &&
    finalMissing.length === 0 &&
    schedulerValidation.valid;
  const artifact = await writeArtifact(`${laneId}.json`, {
    artifactKind: "commitment_packet_real_model_lane",
    schemaVersion: "execution-platform.commitment-packet-real-model-lane.v1",
    laneId,
    status: accepted ? "succeeded" : "needs_review",
    providerCallMade: true,
    modelRef,
    protocol: "qwen_semantic_content_then_qwen_targeted_normalization_runtime_compiles_packet",
    semanticCall: {
      status: semanticCall.response.status,
      latencyMs: semanticCall.latencyMs,
      promptBytes: semanticCall.promptBytes,
      responseBytes: semanticCall.responseBytes,
      responseHash: semanticCall.response.responseHash,
      usage: semanticCall.response.usage ?? null,
      initialMissing,
    },
    targetedNormalizationCall: {
      status: normalizationCall.response.status,
      latencyMs: normalizationCall.latencyMs,
      promptBytes: normalizationCall.promptBytes,
      responseBytes: normalizationCall.responseBytes,
      responseHash: normalizationCall.response.responseHash,
      usage: normalizationCall.response.usage ?? null,
      forcedMissingFields,
      finalMissing,
    },
    compiledPacketSummary: summarizeCommitmentWorkPacketsForArtifact([acceptedPacket]),
    schedulerValidation,
    reasonCodes: accepted
      ? [
          "real_model_semantic_content_completed",
          "real_model_targeted_normalization_completed",
          "runtime_compiled_commitment_work_packet",
          "scheduler_packet_validation_passed",
        ]
      : [
          ...(semanticCall.response.status === "succeeded" ? [] : ["semantic_content_failed"]),
          ...(normalizationCall.response.status === "succeeded"
            ? []
            : ["targeted_normalization_failed"]),
          ...(finalMissing.length === 0
            ? []
            : finalMissing.map((field) => `semantic_field_missing:${field}`)),
          ...(schedulerValidation.valid ? [] : schedulerValidation.reasonCodes),
        ],
    ...boundedSafety(),
  });
  console.log(
    JSON.stringify(
      {
        status: accepted ? "succeeded" : "needs_review",
        artifactRef: artifact.artifactRef,
        modelRef,
        semanticLatencyMs: semanticCall.latencyMs,
        targetedNormalizationLatencyMs: normalizationCall.latencyMs,
        semanticPromptBytes: semanticCall.promptBytes,
        targetedNormalizationPromptBytes: normalizationCall.promptBytes,
        finalMissing,
        schedulerValidation,
      },
      null,
      2,
    ),
  );
  if (!accepted) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  const laneId = `commitment-packet-real-model-lane-${Date.now().toString(36)}`;
  const artifact = await writeArtifact(`${laneId}-error.json`, {
    artifactKind: "commitment_packet_real_model_lane_error",
    laneId,
    status: "failed",
    errorName: error?.name ?? "unknown_error",
    errorSummary: String(error?.message ?? error).slice(0, 700),
    ...boundedSafety(),
  });
  console.error(JSON.stringify({ status: "failed", ...artifact }, null, 2));
  process.exitCode = 1;
});
