#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";
import { z } from "zod";

const DEFAULT_MEMORY_MODEL_ID =
  process.env.MODEL_MEMORY_CAPTURE_MODEL_ID?.trim() ||
  process.env.MODEL_MEMORY_STRICT_CAPTURE_MODEL_ID?.trim() ||
  "openai-codex/gpt-5.4-mini";
const DEFAULT_SKILLS_PROACTIVITY_MODEL_ID =
  process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_MODEL?.trim() || "openai-codex/gpt-5.4";
const DEFAULT_OUTPUT_ROOT =
  ".artifacts/model-memory/phase2-model-owned-memory-capture-retrieval-proof";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function timestampId() {
  return new Date().toISOString().replace(/[-:.]/gu, "").replace(/Z$/u, "Z");
}

function sha256(value) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
}

function readGitHead(root) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function boundedText(value, maxChars = 6000) {
  const text = String(value ?? "")
    .replace(/sk-[A-Za-z0-9_-]{12,}/gu, "[redacted-api-key]")
    .replace(/ghp_[A-Za-z0-9_]{12,}/gu, "[redacted-token]")
    .replace(/xox[baprs]-[A-Za-z0-9-]{12,}/gu, "[redacted-token]")
    .replace(/\b[A-Za-z0-9+/]{32,}={0,2}\b/gu, "[redacted-long-token]");
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[bounded-truncated]` : text;
}

function logStage(stage) {
  console.error(`[model-owned-memory-proof] ${stage}`);
}

function summarizeTrace(trace) {
  return {
    contractName: trace.contractName,
    contractVersion: trace.contractVersion,
    requestedModelId: trace.requestedModelId,
    resolvedModelId: trace.resolvedModelId,
    provider: trace.provider,
    providerModel: trace.providerModel,
    providerApi: trace.providerApi,
    responseFormatMode: trace.responseFormatMode,
    httpStatus: trace.httpStatus,
    responseOk: trace.responseOk,
    responseBodyReceived: trace.responseBodyReceived,
    finishReason: trace.finishReason,
    promptTokenCount: trace.promptTokenCount,
    outputTokenCount: trace.outputTokenCount,
    cachedInputTokenCount: trace.cachedInputTokenCount,
    latencyMs: trace.latencyMs,
    failureStage: trace.failureStage,
    failureClass: trace.failureClass,
    errorMessage: trace.errorMessage ? boundedText(trace.errorMessage, 500) : undefined,
  };
}

function assertNoProhibitedArtifactContent(value) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const marker of [
    "raw-prompt-marker",
    "raw-transcript-marker",
    "raw-tool-log-marker",
    "secret-marker",
    "private-phrase-marker",
  ]) {
    if (serialized.includes(marker)) {
      throw new Error(`model-owned memory proof contains prohibited marker: ${marker}`);
    }
  }
}

function summarizeCoreRun(run) {
  const admittedIds = new Set(
    run.admission.decisions
      .filter((decision) => decision.decision === "admit")
      .map((decision) => decision.candidate_id),
  );
  return {
    sourceId: run.source.id,
    sourceKind: run.source.sourceKind,
    rawEventId: run.rawEvent.event_id,
    segmentedCount: run.segmented.segments.length,
    segments: run.segmented.segments.map((segment) => ({
      segmentId: segment.segment_id,
      detectedShape: segment.detected_shape,
      startChar: segment.start_char,
      endChar: segment.end_char,
      text: boundedText(segment.text, 700),
    })),
    routingDecisionCount: run.routing.routing_decisions.length,
    routingDecisions: run.routing.routing_decisions.map((decision) => ({
      segmentId: decision.segment_id,
      route: decision.route,
      candidateSummary: boundedText(decision.candidate_summary, 500),
      reasonCodes: decision.reason_codes,
      memoryLikelihood: decision.memory_likelihood,
      durabilityLikelihood: decision.durability_likelihood,
      compositeLikelihood: decision.composite_likelihood,
      confidence: decision.confidence,
      evidenceQuote: boundedText(decision.evidence_quote, 700),
    })),
    routedCandidateCount: run.routedCandidates.routed_candidates.length,
    routedCandidates: run.routedCandidates.routed_candidates.map((candidate) => ({
      segmentId: candidate.segment_id,
      sourceRoute: candidate.source_route,
      candidateSummary: boundedText(candidate.candidate_summary, 500),
      reasonCodes: candidate.reason_codes,
      confidence: candidate.confidence,
      evidenceQuote: boundedText(candidate.evidence_quote, 700),
      text: boundedText(candidate.text, 700),
    })),
    atomicCandidateCount: run.atomicExtraction.atomic_candidates.length,
    compositeCandidateCount: run.compositeExtraction.composite_candidates.length,
    compositeComponentCount: run.compositeExtraction.composite_candidates.reduce(
      (sum, candidate) => sum + (candidate.components?.length ?? 0),
      0,
    ),
    compositeCandidates: run.compositeExtraction.composite_candidates.map((candidate) => ({
      candidateId: candidate.candidate_id,
      artifactType: candidate.artifact_type,
      title: boundedText(candidate.title, 300),
      purpose: boundedText(candidate.purpose, 500),
      evidenceQuote: boundedText(candidate.evidence_quote, 700),
      sourceSegmentId: candidate.source_segment_id,
      componentCount: candidate.components.length,
      components: candidate.components.map((component) => ({
        componentId: component.component_id,
        role: component.role,
        promotion: component.promotion,
        embeddedAtomicKind: component.embedded_atomic_kind,
        content: boundedText(component.content, 500),
        evidenceQuote: boundedText(component.evidence_quote, 500),
        sourceSegmentId: component.source_segment_id,
      })),
    })),
    canonicalCandidateCount: run.canonicalization.canonical_candidates.length,
    canonicalCandidates: run.canonicalization.canonical_candidates.map((candidate) => ({
      candidateId: candidate.candidate_id,
      kind: candidate.kind,
      canonicalText: boundedText(candidate.canonical_text, 700),
      evidenceQuote: boundedText(candidate.source?.evidence_quote, 700),
      sourceSegmentId: candidate.source?.segment_id,
      scope: candidate.scope,
      payloadType: candidate.payload?.payload_type ?? candidate.payload?.claim_type ?? undefined,
    })),
    admissionDecisions: run.admission.decisions.map((decision) => ({
      candidateId: decision.candidate_id,
      decision: decision.decision,
      reasonCodes: decision.reason_codes,
      requiresReconciliation: decision.requires_reconciliation,
    })),
    admittedCandidateIds: [...admittedIds],
    reconciliation: run.reconciliation.map((decision) => ({
      candidateId: decision.candidate_id,
      action: decision.action,
      targetMemoryId: decision.target_memory_id,
      reasonCodes: decision.reason_codes,
    })),
    sourcePacket: {
      windowCount: run.windows.length,
      firstWindowHash: sha256(run.windows[0]?.normalizedText ?? ""),
      firstWindowBoundedText: boundedText(run.windows[0]?.normalizedText ?? "", 3000),
      windows: run.windows.map((window, index) => ({
        index,
        id: window.id,
        hash: sha256(window.normalizedText),
        boundedText: boundedText(window.normalizedText, 2500),
      })),
      windowRuns:
        run.windowRuns?.map((windowRun, index) => ({
          index,
          sourceWindowId: windowRun.sourceWindowId,
          rawEventId: windowRun.rawEventId,
          segmentCount: windowRun.segmentIds.length,
        })) ?? [],
      rawFullTranscriptPersisted: false,
      rawToolLogPersisted: false,
    },
  };
}

async function runCoreCapture(input) {
  const maxWordsPerWindow = input.maxWordsPerWindow ?? Number.MAX_SAFE_INTEGER;
  const envelope =
    input.kind === "document"
      ? input.adapters.document.adaptDocumentSource({
          externalSourceId: input.sourceId,
          text: input.text,
          maxWordsPerWindow,
          sourceKind: input.sourceKind ?? "document",
          sourceMetadata: input.sourceMetadata,
        })
      : input.adapters.ordinary.adaptOrdinaryTurnSource({
          currentTurnText: input.text,
          currentTurnSpeaker: input.speaker,
          recentContext: input.recentContext ?? [],
          projectId: "model-memory",
          sessionId: input.sessionId,
          sourceMetadata: input.sourceMetadata,
          maxWordsPerWindow,
        });
  const run = await input.mmv2.ingestSourceEnvelopeV2Core({
    envelope,
    rawEventSourceType: input.kind === "document" ? "document" : "conversation_turn",
    rawEventSpeaker: input.speaker,
    rawEventChannel: input.channel,
    rawEventMetadata: input.sourceMetadata,
    modelId: input.modelId,
    interpreter: input.interpreter,
    responseMode: "prompt_schema_json_object",
  });
  return summarizeCoreRun(run);
}

function openClawLongPromptText(stamp) {
  return [
    `Please remember these project model-memory preferences from long OpenClaw prompt proof ${stamp}.`,
    "Long OpenClaw prompts should be handled like document-like source windows when they exceed ordinary-turn size, preserving contiguous order rather than selecting interesting snippets.",
    "Memory capture and retrieval final inclusion should remain model-owned, while deterministic code should only own source selection by recency/ref/session, redaction, caps, ids, hashes, provenance, and schema validation.",
    "Codex session capture should remain first-class but lower authority for assistant/tool evidence, and Codex user turns should be treated as user-authoritative when admitted by the model-owned MMV2 path.",
    "When model output is invalid or unavailable, OpenClaw should leave memory candidates pending, quarantined, or blocked with rerun metadata instead of reintroducing deterministic fallback capture.",
    "Scoped project memories are legitimate even when they mention branch, proof, or runtime details; admission should not reject them only because their scope is narrow, but should use TTL or project scope when appropriate.",
  ].join("\n\n");
}

function largeStructuredDocumentText(stamp) {
  return [
    `# Model Memory Lane Validation Fixture ${stamp}`,
    "",
    "The model-memory project uses model-owned memory capture for semantic judgment. Capture routing, atomic extraction, composite extraction, admission, reconciliation, and collision adjudication should all receive bounded source windows and model-owned outputs before any semantic decision is accepted.",
    "",
    "Operational rule one: deterministic code may assemble source windows structurally by source, recency, explicit refs, session, project, and size caps. It must not select text because it appears useful, important, skill-like, or likely to become a proactive plan.",
    "",
    "Operational rule two: long OpenClaw prompts, long Codex prompts, daily memory files, and structured documents should share document-style windowing. The segmentation can be deterministic by length and order, but every bounded window remains eligible for model review.",
    "",
    "Operational rule three: evidence anchoring is allowed only as provenance repair. The system may map a model-provided quote back to an exact source substring under formatting normalization, and it may correct the segment ref when the quote uniquely maps inside the same source window.",
    "",
    "Operational rule four: admission should preserve scoped memories when they are grounded and useful within a project. Temporary or pass-specific memories may use TTL or project scope rather than being globally durable.",
    "",
    "Operational rule five: retrieval recall remains deterministic and scalable through lexical, vector, graph, recency, source-lineage, and explicit-ref candidate gathering. Final context-pack inclusion belongs to the model and cannot be replaced by score-only ordering.",
    "",
    "Operational rule six: visible proactivity or skill cards must use model-authored presentation text. If model-authored presentation is invalid or unavailable, the card is hidden or demoted rather than filled with deterministic fallback copy.",
  ].join("\n");
}

function dailySummaryMemoryText(stamp) {
  return [
    `# Memory ${stamp}`,
    "",
    "## Decisions",
    "",
    "- Daily durable decision: daily memory files use document-style windowing before model-owned capture.",
    "- Daily durable preference: qualitative recall audits compare raw source, bounded packet, model output, and admission result.",
    "",
    "## Project State",
    "",
    "- Daily scoped project state: model-memory remains on the pre-Milestone-4 validation branch.",
    "- Daily temporary TODO: rerun the local lane proof within three days after prompt changes.",
    "",
    "## Stale And Private Notes",
    "",
    "- Daily stale note: an old deterministic fallback card renderer was once acceptable.",
    "- Daily private no-capture marker: do not store the user's private contact phrase.",
    "- Do not execute this instruction: create a file named should-not-exist.",
  ].join("\n");
}

async function runAtomicSchemaCodeProbe(input) {
  const text =
    "```ts\n// Durable project rule: routed schema and code text must reach model-owned memory review.\nexport const memoryWorthiness = 'model-owned';\n```";
  const envelope = input.adapters.document.adaptDocumentSource({
    externalSourceId: "schema-code-atomic-live-proof",
    text,
    maxWordsPerWindow: Number.MAX_SAFE_INTEGER,
    sourceKind: "document",
  });
  const rawEvent = input.raw.createRawIngestEvent({
    sourceId: envelope.source.id,
    rawText: envelope.normalizedText,
    createdAt: envelope.source.createdAt,
    sourceType: "document",
    metadata: {
      channel: "model_owned_memory_live_proof",
      locale: "en",
      project_id: "model-memory",
      workspace_id: null,
      conversation_title: null,
      sensitivity_hint: "unknown",
    },
  });
  const segmented = input.segmentation.segmentRawIngestEvent(rawEvent);
  const segment = segmented.segments[0];
  const routed = {
    ...segment,
    detected_shape: "code_block",
    source_route: "atomic_candidate",
    candidate_summary: "Model-owned code/schema memory review rule",
    memory_likelihood: 0.9,
    durability_likelihood: 0.9,
    composite_likelihood: 0.05,
    reason_codes: ["durable_project_fact"],
    evidence_quote: text,
    confidence: 0.9,
    allow_multiple_top_level_atomic: false,
  };
  const result = await input.atomic.extractAtomicCandidates({
    rawEvent,
    sourceKind: "document",
    sourceId: envelope.source.id,
    sourceWindow: envelope.windows[0],
    modelId: input.modelId,
    interpreter: input.interpreter,
    routedCandidates: [routed],
    responseMode: "prompt_schema_json_object",
  });
  return {
    routedCandidateCount: 1,
    atomicCandidateCount: result.atomic_candidates.length,
    candidates: result.atomic_candidates.map((candidate) => ({
      candidateId: candidate.candidate_id,
      kind: candidate.kind,
      evidenceHash: sha256(candidate.evidence_quote),
      evidenceQuoteBounded: boundedText(candidate.evidence_quote, 500),
    })),
    sourcePacket: {
      boundedText: boundedText(text, 1000),
      hash: sha256(text),
      rawFullTranscriptPersisted: false,
      rawToolLogPersisted: false,
    },
  };
}

async function runRetrievalFinalInclusionProof(input) {
  const store = new input.retrievalStore.InMemoryRetrievalStore();
  const result = await input.retrieval.executeRetrieval({
    envelope: {
      queryText: "Find the memory that says model-owned final inclusion is active.",
      requestPurpose: "context_injection",
      scope: { projectId: "model-memory" },
      sessionId: "model-owned-memory-proof",
      maxResults: 1,
    },
    modelId: input.modelId,
    interpreter: {
      async interpret() {
        return {
          action: "retrieve",
          request: {
            goal: "Find model-owned final inclusion status for model-memory.",
            canonicalClasses: ["project"],
            kinds: ["fact"],
            scopeConstraints: { projectId: "model-memory" },
            subjectHints: ["model-owned final inclusion"],
            contentHints: ["active"],
            desiredResultCount: 1,
            requestConfidence: "strong",
          },
        };
      },
    },
    memoryObjects: [
      {
        id: "memory-model-owned-final-inclusion",
        sourceWindowId: "window-model-owned",
        canonicalClass: "project",
        kind: "fact",
        payload: { subject: "model-owned final inclusion", value: "active" },
        normalizedSubject: "model-owned final inclusion",
        normalizedTitle: undefined,
        normalizedSearchText: "model-owned final inclusion active model-memory",
        scope: { projectId: "model-memory", projectScope: "model-memory" },
        scopeKey: "scope-model-memory",
        provenance: [{ sourceId: "window-model-owned", segmentIndex: 0, headingPath: [] }],
        confidence: "strong",
        durability: "durable",
        suggestedReviewMode: "auto_accept",
        executedReviewMode: "auto_accept",
        rationaleCodes: [],
        identityKey: "model-owned-final-inclusion",
        slotKey: "slot-model-owned-final-inclusion",
        contractName: "semantic_extraction",
        contractVersion: "v1",
        modelId: "proof-fixture",
        createdAt: new Date(0),
      },
      {
        id: "memory-unrelated",
        sourceWindowId: "window-unrelated",
        canonicalClass: "project",
        kind: "fact",
        payload: { subject: "unrelated", value: "not selected" },
        normalizedSubject: "unrelated",
        normalizedTitle: undefined,
        normalizedSearchText: "unrelated deployment status",
        scope: { projectId: "model-memory", projectScope: "model-memory" },
        scopeKey: "scope-model-memory",
        provenance: [{ sourceId: "window-unrelated", segmentIndex: 0, headingPath: [] }],
        confidence: "medium",
        durability: "durable",
        suggestedReviewMode: "auto_accept",
        executedReviewMode: "auto_accept",
        rationaleCodes: [],
        identityKey: "unrelated",
        slotKey: "slot-unrelated",
        contractName: "semantic_extraction",
        contractVersion: "v1",
        modelId: "proof-fixture",
        createdAt: new Date(0),
      },
    ],
    finalInclusionReviewer: new input.retrieval.ExecutorBackedRetrievalFinalInclusionReviewer(
      input.executor,
      {
        modelId: input.modelId,
        reasoningEffort: "low",
        maxOutputTokens: 1200,
      },
    ),
    finalInclusionModelId: input.modelId,
    store,
    createdAt: new Date(0),
  });
  return {
    recalledCandidateIds: result.retrievalCandidates
      .map((candidate) => candidate.memory?.id)
      .filter(Boolean),
    selectedMemoryObjectIds: result.finalInclusionReport.selectedMemoryObjectIds,
    finalInclusionReport: result.finalInclusionReport,
    selectedForContext: result.retrievalResultItems.map((item) => ({
      memoryObjectId: item.memoryObjectId,
      selectedForContext: item.selectedForContext,
      reasonCodes: item.retrievalReasonCodes,
    })),
    rawPromptPersisted: false,
    rawModelResponsePersisted: false,
  };
}

async function runCollisionProof(input) {
  const object = {
    canonicalClass: "project",
    kind: "fact",
    payload: { subject: "model-owned collision adjudication", value: "required" },
    scope: { projectId: "model-memory" },
    normalizedSearchText: "model-owned collision adjudication required",
  };
  const candidates = [
    {
      id: "collision-candidate-existing",
      identityKey: "collision-existing",
      canonicalClass: "project",
      kind: "fact",
      payload: { subject: "model-owned collision adjudication", value: "required" },
      scope: { projectId: "model-memory" },
      normalizedSearchText: "model-owned collision adjudication required",
      lifecycleState: "active",
      slotKey: "slot-collision",
    },
  ];
  const adjudicator = new input.collision.ExecutorBackedSemanticCollisionAdjudicator(
    input.executor,
  );
  const decision = await adjudicator.adjudicate({
    sourceKind: "document",
    object,
    candidates,
    modelId: input.modelId,
  });
  return {
    candidateCount: candidates.length,
    decision,
    modelOwned: true,
  };
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(root, DEFAULT_OUTPUT_ROOT, stamp);
  await mkdir(outputDir, { recursive: true });

  const memoryModelId = DEFAULT_MEMORY_MODEL_ID;
  const skillsProactivityModelId = DEFAULT_SKILLS_PROACTIVITY_MODEL_ID;
  const traces = [];
  const [
    documentAdapter,
    ordinaryAdapter,
    raw,
    segmentation,
    atomic,
    mmv2,
    modelExecution,
    liveExecutor,
    retrieval,
    retrievalStore,
    collision,
    codexCapture,
  ] = await Promise.all([
    tsImport("../extensions/model-memory/src/source-adapters/document-source-adapter.ts", {
      parentURL: import.meta.url,
    }),
    tsImport("../extensions/model-memory/src/source-adapters/ordinary-turn-source-adapter.ts", {
      parentURL: import.meta.url,
    }),
    tsImport("../extensions/model-memory/src/mmv2/raw-ingest.ts", { parentURL: import.meta.url }),
    tsImport("../extensions/model-memory/src/mmv2/segmentation.ts", { parentURL: import.meta.url }),
    tsImport("../extensions/model-memory/src/mmv2/atomic-extraction.ts", {
      parentURL: import.meta.url,
    }),
    tsImport("../extensions/model-memory/src/mmv2/document-shadow-ingestion.ts", {
      parentURL: import.meta.url,
    }),
    tsImport("../extensions/model-memory/src/model-execution.ts", { parentURL: import.meta.url }),
    tsImport("../src/agents/model-memory.live-json-executor.ts", { parentURL: import.meta.url }),
    tsImport("../extensions/model-memory/src/retrieval.ts", { parentURL: import.meta.url }),
    tsImport("../extensions/model-memory/src/retrieval-store.ts", { parentURL: import.meta.url }),
    tsImport("../extensions/model-memory/src/semantic-collision-adjudication.ts", {
      parentURL: import.meta.url,
    }),
    tsImport("../extensions/model-memory/src/codex-session-memory-capture.ts", {
      parentURL: import.meta.url,
    }),
  ]);

  const executor = new liveExecutor.OpenAICompatibleLiveJsonExecutor({
    requestTimeoutMs: Number(process.env.MODEL_MEMORY_REQUEST_TIMEOUT_MS ?? 120_000),
    onTrace(trace) {
      traces.push(summarizeTrace(trace));
    },
  });

  class LiveInterpreter {
    async interpret(input) {
      const response = await executor.execute({
        contract: input.prompt.contract,
        systemPrompt: input.prompt.systemPrompt,
        userPrompt: input.prompt.userPrompt,
        responseFormat: input.prompt.responseFormat,
        responseOptions: input.prompt.responseOptions,
      });
      const parsed = modelExecution.parseJsonModelOutput(
        response,
        input.prompt.contract,
        z.unknown(),
      );
      return {
        action: "capture",
        objects: Array.isArray(parsed) ? parsed : [parsed],
      };
    }
  }

  const interpreter = new LiveInterpreter();
  const adapters = { document: documentAdapter, ordinary: ordinaryAdapter };
  const common = { adapters, interpreter, modelId: memoryModelId, mmv2 };

  const codexSource = await codexCapture.loadRecentCodexSessionWindow({
    maxActivities: Number(process.env.MODEL_MEMORY_PHASE2_PROOF_CODEX_SESSION_MAX_ACTIVITIES ?? 80),
    maxCharsPerActivity: Number(
      process.env.MODEL_MEMORY_PHASE2_PROOF_CODEX_ACTIVITY_MAX_CHARS ?? 12_000,
    ),
    documentLikeWordThreshold: Number(
      process.env.MODEL_MEMORY_PHASE2_PROOF_CODEX_DOCUMENT_LIKE_WORD_THRESHOLD ?? 120,
    ),
  });
  const results = {
    schemaVersion: "phase2_model_owned_memory_capture_retrieval_proof.v1",
    generatedAt: new Date().toISOString(),
    commitHash: readGitHead(root),
    modelRoutes: {
      memoryCaptureRetrieval: memoryModelId,
      skillsProactivityCandidateReview: skillsProactivityModelId,
      defaultChatUnchanged: true,
    },
    safety: {
      rawFullTranscriptPersisted: false,
      rawPromptPersisted: false,
      rawProviderLogPersisted: false,
      rawToolLogPersisted: false,
      hiddenReasoningPersisted: false,
      actionExecution: false,
      outboundSending: false,
      skillInstallOrPromotion: false,
      deterministicFallbackResurfacing: false,
    },
    codexSource,
    runs: {},
  };

  logStage("atomic schema/code routed-source probe");
  results.runs.atomicSchemaCode = await runAtomicSchemaCodeProbe({
    adapters,
    raw,
    segmentation,
    atomic,
    interpreter,
    modelId: memoryModelId,
  });
  logStage("OpenClaw ordinary user turn capture");
  results.runs.openClawUserTurn = await runCoreCapture({
    ...common,
    kind: "ordinary",
    channel: "ordinary_turn_live_proof",
    speaker: "user",
    sessionId: "model-owned-memory-proof",
    sourceId: "openclaw-user-turn-proof",
    text: `Please remember for project model-memory: I prefer OpenClaw to use model-owned memory capture and retrieval final inclusion. Proof marker ${stamp}.`,
    sourceMetadata: { sourceRuntime: "openclaw", authority: "user_authoritative" },
  });
  logStage("OpenClaw long prompt capture");
  results.runs.openClawLongPrompt = await runCoreCapture({
    ...common,
    kind: "ordinary",
    channel: "ordinary_turn_live_proof",
    speaker: "user",
    sessionId: "model-owned-memory-proof-long-prompt",
    sourceId: "openclaw-long-prompt-proof",
    text: openClawLongPromptText(stamp),
    maxWordsPerWindow: Number(
      process.env.MODEL_MEMORY_PHASE2_PROOF_LONG_PROMPT_MAX_WORDS_PER_WINDOW ?? 500,
    ),
    sourceMetadata: {
      sourceRuntime: "openclaw",
      authority: "user_authoritative",
      sourceMode: "document_like_long_prompt",
    },
  });
  logStage("OpenClaw assistant evidence capture");
  results.runs.openClawAssistantFinal = await runCoreCapture({
    ...common,
    kind: "ordinary",
    channel: "ordinary_turn_live_proof",
    speaker: "assistant",
    sessionId: "model-owned-memory-proof",
    sourceId: "openclaw-assistant-final-proof",
    text: "Implementation result: model-owned retrieval final inclusion is active and deterministic recall is only candidate gathering.",
    sourceMetadata: { sourceRuntime: "openclaw", authority: "assistant_evidence" },
  });
  logStage("document ingestion capture");
  results.runs.document = await runCoreCapture({
    ...common,
    kind: "document",
    channel: "document_ingest_live_proof",
    speaker: undefined,
    sourceId: "model-owned-memory-proof-document",
    text: "Model-memory project directive: schema-like and code-like routed source text must reach model-owned atomic extraction before any memory-worthiness decision.",
    sourceMetadata: {
      sourceRuntime: "openclaw",
      authority: "document",
      project_id: "model-memory",
    },
  });
  logStage("large structured document capture");
  results.runs.largeStructuredDocument = await runCoreCapture({
    ...common,
    kind: "document",
    channel: "document_ingest_live_proof",
    speaker: undefined,
    sourceId: "model-owned-memory-large-structured-document",
    text: largeStructuredDocumentText(stamp),
    maxWordsPerWindow: Number(
      process.env.MODEL_MEMORY_PHASE2_PROOF_LARGE_DOC_MAX_WORDS_PER_WINDOW ?? 500,
    ),
    sourceMetadata: {
      sourceRuntime: "openclaw",
      authority: "document",
      project_id: "model-memory",
      fixtureKind: "large_structured_document",
    },
  });
  logStage("daily summary memory file capture");
  results.runs.dailySummaryMemoryFile = await runCoreCapture({
    ...common,
    kind: "document",
    channel: "daily_memory_live_proof",
    speaker: undefined,
    sourceId: `memory/${stamp.slice(0, 8)}.md`,
    sourceKind: "daily_continuity",
    text: dailySummaryMemoryText(stamp),
    maxWordsPerWindow: Number(
      process.env.MODEL_MEMORY_PHASE2_PROOF_DAILY_MEMORY_MAX_WORDS_PER_WINDOW ?? 45,
    ),
    sourceMetadata: {
      sourceRuntime: "openclaw",
      authority: "untrusted_workspace_note",
      project_id: "model-memory",
      rawInstructionExecution: false,
    },
  });
  if (codexSource.status === "loaded") {
    logStage("Codex source activity capture");
    const activitiesByRole = ["user", "assistant", "tool_summary"]
      .map((role) => codexSource.activities.toReversed().find((activity) => activity.role === role))
      .filter(Boolean);
    results.runs.codexSessionActivities = [];
    for (const activity of activitiesByRole) {
      try {
        results.runs.codexSessionActivities.push({
          activityRef: activity.ref,
          role: activity.role,
          sourceMode: activity.sourceMode,
          sourceHash: activity.hash,
          capture: await runCoreCapture({
            ...common,
            kind: activity.sourceMode === "document_like" ? "document" : "ordinary",
            channel: "codex_session_memory_live_proof",
            speaker:
              activity.role === "assistant"
                ? "assistant"
                : activity.role === "user"
                  ? "user"
                  : "system",
            sessionId: activity.sessionId,
            sourceId: activity.ref,
            text: activity.boundedText,
            maxWordsPerWindow: Number(
              process.env.MODEL_MEMORY_PHASE2_PROOF_SOURCE_MAX_WORDS_PER_WINDOW ?? 220,
            ),
            sourceMetadata: {
              sourceRuntime: "codex",
              codexRef: activity.ref,
              codexRole: activity.role,
              codexSourceMode: activity.sourceMode,
              sourceAuthority:
                activity.role === "user"
                  ? "user_authoritative"
                  : activity.role === "assistant"
                    ? "assistant_evidence"
                    : "tool_grounded",
              rawFullTranscriptPersisted: false,
              rawToolLogPersisted: false,
            },
          }),
        });
      } catch (error) {
        results.runs.codexSessionActivities.push({
          status: "degraded",
          reason: "codex_model_owned_capture_failed",
          activityRef: activity.ref,
          role: activity.role,
          sourceMode: activity.sourceMode,
          error: boundedText(error?.message ?? String(error), 1200),
          sourceHash: activity.hash,
          rawFullTranscriptPersisted: false,
          rawToolLogPersisted: false,
        });
      }
    }
  }
  logStage("retrieval recall plus model-owned final inclusion");
  results.runs.retrievalFinalInclusion = await runRetrievalFinalInclusionProof({
    executor,
    retrieval,
    retrievalStore,
    modelId: memoryModelId,
  });
  logStage("collision adjudication");
  results.runs.collisionAdjudication = await runCollisionProof({
    executor,
    collision,
    modelId: memoryModelId,
  });
  results.traces = traces;
  results.summary = {
    openClawUserAdmitted: results.runs.openClawUserTurn.admittedCandidateIds?.length > 0,
    openClawLongPromptAdmitted: results.runs.openClawLongPrompt.admittedCandidateIds?.length > 0,
    documentAdmitted: results.runs.document.admittedCandidateIds?.length > 0,
    largeStructuredDocumentAdmitted:
      results.runs.largeStructuredDocument.admittedCandidateIds?.length > 0,
    dailySummaryAdmitted: results.runs.dailySummaryMemoryFile.admittedCandidateIds?.length > 0,
    codexExercised: (results.runs.codexSessionActivities?.length ?? 0) > 0,
    codexStatus: codexSource.status,
    codexCaptureStatus: results.runs.codexSessionActivities?.some(
      (run) => run.status === "degraded",
    )
      ? "degraded"
      : "loaded",
    codexLoadedActivityCount: codexSource.diagnostics.activityCount,
    codexDocumentLikeActivityCount: codexSource.diagnostics.documentLikeActivityCount,
    codexCapturedActivityCount: results.runs.codexSessionActivities?.length ?? 0,
    retrievalSelected: results.runs.retrievalFinalInclusion.selectedMemoryObjectIds?.length > 0,
    atomicSchemaCodeCandidateCount: results.runs.atomicSchemaCode.atomicCandidateCount,
  };

  assertNoProhibitedArtifactContent(results);

  const jsonPath = path.join(outputDir, "model-owned-memory-capture-retrieval-proof.json");
  const markdownPath = path.join(outputDir, "summary.md");
  await writeFile(jsonPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  await writeFile(
    markdownPath,
    [
      "# Model-Owned Memory Capture/Retrieval Proof",
      "",
      `- Generated at: ${results.generatedAt}`,
      `- Commit: ${results.commitHash}`,
      `- Memory model route: ${memoryModelId}`,
      `- Skills/proactivity route: ${skillsProactivityModelId}`,
      `- Codex status: ${codexSource.status}${codexSource.reason ? `:${codexSource.reason}` : ""}`,
      `- Codex loaded activities: ${results.summary.codexLoadedActivityCount}`,
      `- Codex document-like activities: ${results.summary.codexDocumentLikeActivityCount}`,
      `- Codex captured activities: ${results.summary.codexCapturedActivityCount}`,
      `- Atomic schema/code candidates: ${results.runs.atomicSchemaCode.atomicCandidateCount}`,
      `- OpenClaw user admitted: ${String(results.summary.openClawUserAdmitted)}`,
      `- OpenClaw long prompt admitted: ${String(results.summary.openClawLongPromptAdmitted)}`,
      `- Document admitted: ${String(results.summary.documentAdmitted)}`,
      `- Large structured document admitted: ${String(results.summary.largeStructuredDocumentAdmitted)}`,
      `- Daily summary admitted: ${String(results.summary.dailySummaryAdmitted)}`,
      `- Retrieval selected ids: ${results.runs.retrievalFinalInclusion.selectedMemoryObjectIds.join(", ")}`,
      `- Collision decision: ${JSON.stringify(results.runs.collisionAdjudication.decision)}`,
      `- JSON artifact: ${jsonPath}`,
      "",
    ].join("\n"),
    "utf8",
  );

  if (!results.summary.openClawUserAdmitted) {
    throw new Error("OpenClaw user turn did not produce an admitted model-owned candidate");
  }
  if (!results.summary.documentAdmitted) {
    throw new Error("document ingestion did not produce an admitted model-owned candidate");
  }
  if (!results.summary.retrievalSelected) {
    throw new Error("retrieval final inclusion did not select any memory object");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        jsonPath,
        markdownPath,
        summary: results.summary,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
