#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { OpenRouterAgentTeamModelClient } from "../extensions/execution-platform/src/codex-bridge/live-agent-team-runner.ts";
import {
  normalizeContextSynthesisArtifact,
  summarizeContextSynthesisArtifact,
  validateContextSynthesisArtifact,
} from "../extensions/execution-platform/src/workflows/context-synthesis.ts";

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

function boundedSafety() {
  return {
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogsStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}

function freshContextSnapshotRef(input) {
  return {
    artifactKind: "context_snapshot_ref",
    schemaVersion: "execution-platform.context-snapshot-ref.v1",
    snapshotRef: input.snapshotRef,
    sourceRef: input.sourceRef,
    sourceKind: "context_scout_handoff",
    capturedAt: "2026-05-19T00:00:00.000Z",
    repoRevision: "context-synthesis-lane-proof",
    worktreeFingerprint: "context-synthesis-lane-proof",
    sourcePromptHash: "sha256:context-synthesis-lane-proof",
    sourcePayloadHash: `sha256:${sha256(JSON.stringify(input))}`,
    runtimeJobId: "context-synthesis-lane-proof-job",
    workflowId: "agent_team.coding",
    graphId: "context-synthesis-lane-proof-graph",
    nodeId: input.nodeId,
    commitmentIds: input.commitmentIds,
    targetRefs: input.targetRefs,
    scopeSummary: input.scopeSummary,
    stalenessPolicy: "Synthetic lane proof snapshot is fresh for this bounded test.",
    expiresAt: null,
    maxAgeMs: null,
    freshnessStatus: "fresh",
    refreshRequired: false,
    refreshAction: "none",
    reasonCodes: ["context_synthesis_lane_snapshot_fresh"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
  };
}

function createSyntheticLaneInput() {
  const contextSnapshots = [
    freshContextSnapshotRef({
      snapshotRef: "context-snapshot://context-synthesis-lane-proof/workflow-registration",
      sourceRef: "runtime-job://context-synthesis-lane-proof/context-handoff/workflow-registration",
      nodeId: "context_scout-workflow-registration",
      commitmentIds: ["commitment.workflow-registration"],
      targetRefs: [
        "repo-file://extensions/execution-platform/src/workflows/workflow-definition-registry.ts",
        "repo-file://extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts",
      ],
      scopeSummary: "Fresh workflow-registration context handoff consumed by synthesis.",
    }),
    freshContextSnapshotRef({
      snapshotRef: "context-snapshot://context-synthesis-lane-proof/planning-capsule",
      sourceRef: "runtime-job://context-synthesis-lane-proof/context-handoff/planning-capsule",
      nodeId: "context_scout-planning-capsule",
      commitmentIds: ["commitment.planning-capsule"],
      targetRefs: [
        "repo-file://extensions/execution-platform/src/workflows/workflow-evidence-profile.ts",
        "repo-file://extensions/execution-platform/src/workflows",
      ],
      scopeSummary: "Fresh planning-capsule context handoff consumed by synthesis.",
    }),
    freshContextSnapshotRef({
      snapshotRef: "context-snapshot://context-synthesis-lane-proof/work-queue-readback",
      sourceRef: "runtime-job://context-synthesis-lane-proof/context-handoff/work-queue-readback",
      nodeId: "context_scout-work-queue-readback",
      commitmentIds: ["commitment.work-queue-readback"],
      targetRefs: [
        "repo-file://extensions/execution-platform/src/work-queue/execution-read-model.ts",
      ],
      scopeSummary: "Fresh Work Queue readback context handoff consumed by synthesis.",
    }),
  ];
  return {
    runtimeJobId: "runtime-job://context-synthesis-lane-proof/job",
    graphId: "context-synthesis-lane-proof-graph",
    workflowId: "agent_team.coding",
    nodeId: "context_synthesis_global_barrier",
    ownerObjectiveSummary:
      "Implement Product/Spec Planning as a production workflow plugin using the generic orchestration runtime. Preserve Mission Ledger evidence, Work Queue readback, human decision support, planning capsule lifecycle, compile-to-child-action behavior, validation, and model-authored closeout.",
    missionLedgerSummary: {
      objective: "Build a first-class Product/Spec Planning workflow without proof-only shortcuts.",
      commitments: [
        {
          commitmentId: "commitment.workflow-registration",
          title: "Register product/spec planning workflow",
          evidenceExpectations: ["workflow definition", "plugin registration", "route readiness"],
        },
        {
          commitmentId: "commitment.planning-capsule",
          title: "Implement Planning Capsule lifecycle",
          evidenceExpectations: ["draft/revision/compile artifacts", "validation refs"],
        },
        {
          commitmentId: "commitment.work-queue-readback",
          title: "Expose planning progress in Work Queue readback",
          evidenceExpectations: ["read model fields", "owner-facing ELI5", "tests"],
        },
      ],
    },
    commitmentWorkPackets: [
      {
        packetId: "packet.workflow-registration",
        commitmentId: "commitment.workflow-registration",
        exactWorkerObjective:
          "Wire agent_team.product_spec_planning into workflow definitions, plugin registry, allowed capabilities, and route readiness without running the incomplete target workflow as the executor.",
        likelyRepoAreas: [
          "extensions/execution-platform/src/workflows/workflow-definition-registry.ts",
          "extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts",
          "extensions/execution-platform/src/intent-front-door",
        ],
        requiredContextQuestions: [
          "Which workflow registry exports are authoritative?",
          "Which capability ids are executable for planning?",
        ],
        validationNeeds: ["workflow registry unit tests", "routing regression tests"],
      },
      {
        packetId: "packet.planning-capsule",
        commitmentId: "commitment.planning-capsule",
        exactWorkerObjective:
          "Implement Planning Capsule draft, revision, compile-readiness, research influence, stale external assumption fields, validation, and closeout handoff as bounded artifacts.",
        likelyRepoAreas: [
          "extensions/execution-platform/src/workflows",
          "extensions/execution-platform/src/workflows/workflow-evidence-profile.ts",
        ],
        requiredContextQuestions: [
          "Which artifact lifecycle fields are already canonical?",
          "How does closeout acceptance consume planning artifacts?",
        ],
        validationNeeds: ["planning capsule lifecycle tests", "evidence profile tests"],
      },
      {
        packetId: "packet.work-queue-readback",
        commitmentId: "commitment.work-queue-readback",
        exactWorkerObjective:
          "Add planning-mode Work Queue readback for active phase, planning capsule refs, research refs, action graph proposals, compile readiness, human decisions, child queue items, limitations, and ELI5.",
        likelyRepoAreas: [
          "extensions/execution-platform/src/work-queue/execution-read-model.ts",
          "extensions/execution-platform/src/work-queue",
        ],
        requiredContextQuestions: [
          "Which progress metadata fields are already projected?",
          "How are child Work Queue items materialized from graph nodes?",
        ],
        validationNeeds: ["execution read model tests", "child materialization tests"],
      },
    ],
    sourceContextHandoffRefs: [
      "runtime-job://context-synthesis-lane-proof/context-handoff/workflow-registration",
      "runtime-job://context-synthesis-lane-proof/context-handoff/planning-capsule",
      "runtime-job://context-synthesis-lane-proof/context-handoff/work-queue-readback",
    ],
    sourcePacketRefs: [
      "runtime-job://context-synthesis-lane-proof/packet/workflow-registration",
      "runtime-job://context-synthesis-lane-proof/packet/planning-capsule",
      "runtime-job://context-synthesis-lane-proof/packet/work-queue-readback",
    ],
    contextSnapshots,
    sourceContextSnapshotRefs: contextSnapshots.map((snapshot) => snapshot.snapshotRef),
    acceptedContextScoutNodeSummaries: [
      {
        nodeId: "context_scout-workflow-registration",
        status: "succeeded",
        commitmentIds: ["commitment.workflow-registration"],
        outputArtifactRefs: [
          "runtime-job://context-synthesis-lane-proof/context-handoff/workflow-registration",
        ],
        inputHandoffRefs: ["packet://workflow-registration"],
        verifiedFileRefs: [
          "repo-file://extensions/execution-platform/src/workflows/workflow-definition-registry.ts",
          "repo-file://extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts",
        ],
        semanticCodeIntelligenceRefs: [
          "code-intelligence://context-synthesis-lane-proof/workflow-registry-symbols",
        ],
      },
      {
        nodeId: "context_scout-planning-capsule",
        status: "succeeded",
        commitmentIds: ["commitment.planning-capsule"],
        outputArtifactRefs: [
          "runtime-job://context-synthesis-lane-proof/context-handoff/planning-capsule",
        ],
        inputHandoffRefs: ["packet://planning-capsule"],
        verifiedFileRefs: [
          "repo-file://extensions/execution-platform/src/workflows/workflow-evidence-profile.ts",
          "repo-file://extensions/execution-platform/src/workflows",
        ],
        semanticCodeIntelligenceRefs: [
          "code-intelligence://context-synthesis-lane-proof/planning-artifact-symbols",
        ],
      },
      {
        nodeId: "context_scout-work-queue-readback",
        status: "succeeded",
        commitmentIds: ["commitment.work-queue-readback"],
        outputArtifactRefs: [
          "runtime-job://context-synthesis-lane-proof/context-handoff/work-queue-readback",
        ],
        inputHandoffRefs: ["packet://work-queue-readback"],
        verifiedFileRefs: [
          "repo-file://extensions/execution-platform/src/work-queue/execution-read-model.ts",
        ],
        semanticCodeIntelligenceRefs: [
          "code-intelligence://context-synthesis-lane-proof/work-queue-readback-symbols",
        ],
      },
    ],
    expectedJsonShape: {
      synthesisId: "bounded-stable-id",
      sourcePromptRef: "prompt://source",
      sourcePromptHash: "sha256:bounded",
      semanticCodeIntelligenceRefs: ["code-intelligence://..."],
      scoutStateSummaries: [
        {
          contextHandoffRef: "runtime-job://...",
          commitmentIds: ["ledger-id"],
          status: "accepted",
          limitationSummary: null,
          verifiedFileRefs: ["repo-file://..."],
          semanticCodeIntelligenceRefs: ["code-intelligence://..."],
        },
      ],
      implementationReadiness: "ready",
      commitmentCoverage: [
        {
          commitmentId: "ledger-id",
          covered: true,
          groupIds: ["group-id"],
          contextHandoffRefs: ["runtime-job://.../context-handoff/..."],
          limitationSummary: null,
        },
      ],
      recommendedImplementationGroups: [
        {
          groupId: "worker-ready-group-id",
          title: "short title",
          objective: "exact worker objective",
          commitmentIds: ["ledger-id"],
          inputHandoffRefs: ["runtime-job://.../context-handoff/..."],
          targetRefs: ["extensions/..."],
          fileOwnershipRefs: ["extensions/..."],
          recommendedCapabilityIds: ["implementation_microtask"],
          cheaperWorkerSuitability: "why a cheaper/scoped worker can or cannot handle this group",
          codexEscalationRationale: null,
          downstreamConsumer: "validation_matrix",
          successCriteria: ["bounded success criterion"],
          expectedOutput: "bounded changed-file/evidence output expected from the worker",
          evidenceClaimExpectations: ["commitment evidence claim expected"],
          validationNeeds: ["focused validation needed"],
          reviewNeeds: ["review focus needed"],
          stopIfMissing: ["blocker that should stop implementation"],
          riskRefs: ["bounded risk or risk ref"],
          integrationRequirements: ["integration or join requirement"],
          dependsOnGroupIds: [],
          parallelizableWithGroupIds: [],
          workerFitRationale: "why this worker lane is appropriate",
        },
      ],
      dependencyMap: [
        {
          fromGroupId: "group-a",
          toGroupId: "group-b",
          dependencyKind: "handoff",
          rationale: "bounded rationale",
        },
      ],
      fileOwnershipProposals: [
        {
          groupId: "group-id",
          targetRefs: ["extensions/..."],
          ownershipRationale: "why this group owns these refs",
        },
      ],
      parallelismPlan: "bounded explanation",
      likelyValidationLanes: ["focused validation lane"],
      reviewLanes: ["review focus area"],
      integrationRequirements: ["integration/join requirement"],
      workerFitSummary: "summary of Codex vs non-Codex worker fit across groups",
      validationStrategy: ["validation strategy"],
      escalationTriggers: ["when to escalate or ask human"],
      evidenceClaimExpectations: ["bounded expectation"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    ...boundedSafety(),
  };
}

async function callSynthesisModel(client, input, modelRef, attempt, validation) {
  const prompt = [
    "You are the OpenClaw context synthesis worker.",
    "Return strict compact JSON only. Do not store raw prompts, responses, transcripts, logs, secrets, or hidden reasoning.",
    "Your job is to consume accepted Mission Ledger commitments, CommitmentWorkPackets, and context handoff refs, then create a dependency-aware implementation grouping.",
    "Do not execute implementation. Do not create runtime node ids, executor keys, graph node kinds, or runtime evidence enums.",
    "The runtime owns node envelopes, ids, edges, validation, persistence, and authority. You own semantic grouping, dependency intent, worker fit, readiness, and risks.",
    "Set implementationReadiness to ready only if each blocking commitment has enough context to form worker-ready implementation/validation/readback groups.",
    "The output must include scheduler handoff substance: implementation groups, dependencies or explicit parallelism, validation lanes, review lanes, worker-fit summary, expected outputs, validation needs, review needs, and evidence claim expectations.",
    validation
      ? `Repair only the missing synthesis fields. Failed validation reason codes: ${JSON.stringify(
          validation.reasonCodes.slice(0, 30),
        )}`
      : "",
    `Bounded input packet: ${JSON.stringify(input)}`,
  ].join("\n");
  const startedAt = Date.now();
  const response = await client.callRole({
    roleId: "orchestrator",
    modelId: modelRef,
    modelCandidateId: `context-synthesis-model-lane-${attempt}`,
    prompt,
    responseFormat: "json_object",
    maxTokens: Number(process.env.OPENCLAW_CONTEXT_SYNTHESIS_MODEL_LANE_MAX_TOKENS ?? 6_000),
    timeoutMs: Number(process.env.OPENCLAW_CONTEXT_SYNTHESIS_MODEL_LANE_TIMEOUT_MS ?? 240_000),
    maxAttempts: 1,
  });
  const latencyMs = Date.now() - startedAt;
  const parsed = parseJsonObject(response.responseText ?? "{}");
  const synthesis = normalizeContextSynthesisArtifact({
    value: parsed,
    sourceRuntimeJobId: input.runtimeJobId,
    sourceGraphId: input.graphId,
    workflowId: input.workflowId,
    sourceCommitmentIds: input.missionLedgerSummary.commitments.map(
      (commitment) => commitment.commitmentId,
    ),
    sourcePacketRefs: input.sourcePacketRefs,
    sourceContextHandoffRefs: input.sourceContextHandoffRefs,
    requiredContextSnapshotRefs: input.contextSnapshots,
    providedContextSnapshotRefs: input.contextSnapshots,
  });
  const nextValidation = validateContextSynthesisArtifact(synthesis);
  return {
    response: {
      status: response.status,
      responseHash: response.responseHash,
      usage: response.usage ?? null,
      retryEvidence: response.retryEvidence ?? null,
      providerResponseDiagnostics: response.providerResponseDiagnostics ?? null,
    },
    latencyMs,
    parsedOutputHash: sha256(JSON.stringify(parsed)),
    synthesis,
    validation: nextValidation,
  };
}

async function main() {
  await loadDotenvFiles();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const modelRef =
    process.env.OPENCLAW_CONTEXT_SYNTHESIS_MODEL_LANE_MODEL ?? "qwen/qwen3-coder-next";
  const proofId = `context-synthesis-model-lane-${Date.now().toString(36)}`;
  if (!apiKey) {
    const artifact = await writeArtifact(`${proofId}.json`, {
      artifactKind: "context_synthesis_model_lane_proof",
      proofId,
      status: "needs_review",
      providerCallMade: false,
      blocker: "OPENROUTER_API_KEY not configured in loaded environment refs.",
      ...boundedSafety(),
    });
    console.log(JSON.stringify({ status: "needs_review", ...artifact }, null, 2));
    return;
  }

  const client = new OpenRouterAgentTeamModelClient({
    apiKey,
    retryPolicy: {
      maxAttempts: 1,
      timeoutMs: Number(process.env.OPENCLAW_CONTEXT_SYNTHESIS_MODEL_LANE_TIMEOUT_MS ?? 240_000),
    },
    requestProfilesByModelId: {
      [modelRef]: {
        responseFormatMode: "prompt_only",
        reasoningMode: process.env.OPENCLAW_CONTEXT_SYNTHESIS_MODEL_LANE_REASONING ?? "none",
        maxTokens: Number(process.env.OPENCLAW_CONTEXT_SYNTHESIS_MODEL_LANE_MAX_TOKENS ?? 6_000),
      },
    },
  });
  const input = createSyntheticLaneInput();
  const promptInputHash = sha256(JSON.stringify(input));
  const attempts = [];
  let result = await callSynthesisModel(client, input, modelRef, "initial", null);
  attempts.push({
    attempt: "initial",
    response: result.response,
    latencyMs: result.latencyMs,
    parsedOutputHash: result.parsedOutputHash,
    validation: result.validation,
    summary: summarizeContextSynthesisArtifact(result.synthesis),
  });
  if (!result.validation.valid) {
    result = await callSynthesisModel(client, input, modelRef, "repair", result.validation);
    attempts.push({
      attempt: "repair",
      response: result.response,
      latencyMs: result.latencyMs,
      parsedOutputHash: result.parsedOutputHash,
      validation: result.validation,
      summary: summarizeContextSynthesisArtifact(result.synthesis),
    });
  }

  const summary = summarizeContextSynthesisArtifact(result.synthesis);
  const passed =
    result.validation.valid &&
    summary.schedulerHandoff &&
    summary.schedulerHandoff.readyForGraphCompile === true &&
    summary.implementationGroupCount >= 2 &&
    summary.sourceContextSnapshotRefs.length === input.sourceContextSnapshotRefs.length &&
    summary.likelyValidationLanes.length > 0 &&
    summary.reviewLanes.length > 0 &&
    typeof summary.workerFitSummary === "string" &&
    summary.workerFitSummary.length >= 40;
  const artifact = await writeArtifact(`${proofId}.json`, {
    artifactKind: "context_synthesis_model_lane_proof",
    proofId,
    status: passed ? "passed" : "needs_review",
    providerCallMade: true,
    modelRef,
    promptInputHash,
    attempts,
    final: {
      valid: result.validation.valid,
      reasonCodes: result.validation.reasonCodes,
      summary,
    },
    ...boundedSafety(),
  });
  console.log(
    JSON.stringify(
      {
        status: passed ? "passed" : "needs_review",
        modelRef,
        attemptCount: attempts.length,
        finalReasonCodes: result.validation.reasonCodes,
        artifactRef: artifact.artifactRef,
        artifactHash: artifact.artifactHash,
      },
      null,
      2,
    ),
  );
  if (!passed) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  const proofId = `context-synthesis-model-lane-error-${Date.now().toString(36)}`;
  const artifact = await writeArtifact(`${proofId}.json`, {
    artifactKind: "context_synthesis_model_lane_proof",
    status: "failed",
    errorMessage: error instanceof Error ? error.message : String(error),
    errorStackHash: error instanceof Error ? sha256(error.stack ?? "") : null,
    ...boundedSafety(),
  });
  console.error(JSON.stringify({ status: "failed", ...artifact }, null, 2));
  process.exitCode = 1;
});
