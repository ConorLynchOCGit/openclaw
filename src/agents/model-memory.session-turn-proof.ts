import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  JsonModelExecutionRequest,
  JsonModelExecutionResponse,
  JsonModelExecutor,
  ModelMemoryObject,
  SemanticCollisionAdjudicator,
  SemanticInterpreter,
  SemanticInterpreterInput,
  SemanticInterpreterResult,
  CollisionAdjudicationBatchDecision,
  CollisionAdjudicationDecision,
  CollisionAdjudicationRequest,
  CollisionCandidate,
  DatabaseMemoryObjectStoreObserver,
} from "../../extensions/model-memory/runtime-api.ts";
import {
  adaptOrdinaryTurnSource,
  captureOrdinaryTurnLive,
  DatabaseMemoryObjectStore,
  ExecutorBackedSemanticCollisionAdjudicator,
  ExecutorBackedSemanticInterpreter,
} from "../../extensions/model-memory/runtime-api.ts";
import type { ModelMemoryDatabaseRuntime } from "./model-memory.database.ts";
import { resetModelMemoryEvidenceDatabase } from "./model-memory.large-document-evidence.ts";
import { OpenAICompatibleLiveJsonExecutor } from "./model-memory.live-json-executor.ts";

export const SESSION_TURN_PROOF_MODEL_REF = "openrouter/openai/gpt-5.4-nano";
export const SESSION_TURN_PROOF_REQUEST_TIMEOUT_MS = 180_000;
export const SESSION_TURN_PROOF_REQUEST_SEED = 7;
export const SESSION_TURN_PROOF_MAX_WORDS_PER_WINDOW = 1500;

export type SessionTurnProofPrompt = {
  id: string;
  order: number;
  title: string;
  text: string;
  selectionReason: string;
};

export const SESSION_TURN_PROOF_PROMPTS: SessionTurnProofPrompt[] = [
  {
    id: "prompt-001-ingestion-quality-phase",
    order: 1,
    title: "Ingestion Quality Phase",
    text: "We now need to thoroughly test document ingestion with the new features, including human adjudicated test output. Then we should push through testing all of the other features in the memory / context engine / cache stack.",
    selectionReason:
      "Direct request to move from architecture to ingestion quality and downstream proof.",
  },
  {
    id: "prompt-002-agents-stage-visibility",
    order: 2,
    title: "Stage Visibility Request",
    text: "We need to determine why the writes aren't happening. We need to see granular emission at each stage - each window and each stage (pass 1, pass 1 repair, pass 2, pass 2 repair). And we need to know that the prompt was submitted successfully, and that the model actually returned a result. Lets focus all of our testing JUST on agents.md for now. Lets start with GPT 5.4 nano on both passes because we know its the fastest model.",
    selectionReason: "Explicit instrumentation request with concrete model and scope constraints.",
  },
  {
    id: "prompt-003-bounded-collision-question",
    order: 3,
    title: "Collision Adjudication Efficiency",
    text: '"every write candidate runs bounded collision adjudication" if we are doing search and match and then duplicate adjudication deterministically later, why do we need to have each object with its own model prompt doing bounded collision adjudication? That is not efficient.',
    selectionReason:
      "Direct architectural question about deterministic gating versus model adjudication.",
  },
  {
    id: "prompt-004-batched-residual-spec",
    order: 4,
    title: "Batched Residual Adjudication Spec",
    text: 'Write a spec for this: " If you want, I can next turn this into a concrete deterministic gate for collision recall so the write path only calls the model on the small ambiguous remainder instead of all 18." Update the docs with it. We should explore adjudicating ALL of the remaining objects in a single pass. That reduces to one additional model call on a tiny set of objects. If resolution on it isn\'t perfect, I think we have to accept memory loss vs trying to over optimize for perfect capture or risk allowing extra junk into the db. Then write the prompt for building that adjudication change and for the next Agents.md test.',
    selectionReason:
      "Rich operator instruction about spec, docs, and batched adjudication tradeoffs.",
  },
  {
    id: "prompt-005-priority-top10",
    order: 5,
    title: "Priority Top 10 Ingestion",
    text: "Pick a basket of 10 documents from the top of our priority ingestion list. Run ingestion on those.",
    selectionReason: "Simple imperative ingestion request from the same project lane.",
  },
  {
    id: "prompt-006-nano-default",
    order: 6,
    title: "Nano Default Posture",
    text: "Just to be clear - the default for ALL runs and all versions of the system should be nano/nano not mini. Adjust any documentation or actual code that has mini as teh default for any passes.",
    selectionReason: "Clear default-runtime policy instruction with documentation and code impact.",
  },
  {
    id: "prompt-007-updated-proof-standard",
    order: 7,
    title: "Revised Proof Standard",
    text: "Rerun stable will never be true because of model constraints. If we accept that limitation on the model, what is a reasonable updated proof standard?",
    selectionReason:
      "High-level proof-standard question that should surface durable policy claims if the turn lane works.",
  },
  {
    id: "prompt-008-remaining-121",
    order: 8,
    title: "Remaining 121 Population",
    text: "Run the document ingestor across the remaining 121 documents we haven't read yet.",
    selectionReason: "Direct operator request for large-batch ingestion execution.",
  },
  {
    id: "prompt-009-tool-surface-question",
    order: 9,
    title: "Callable Tool Surface",
    text: "Is the document ingestor now a callable tool in OpenClaw? I know the framework was built.",
    selectionReason: "Operator-facing product question about the new ingestion surface.",
  },
  {
    id: "prompt-010-tool-and-turn-proof-request",
    order: 10,
    title: "Tool Registration And Turn Proof",
    text: 'Do this: "  If you want this to be callable from OpenClaw itself, the next step is to add one of these surfaces: - an agent tool registration in the clean-room package". Then we need to do some test runs of the prompt/turn ingestion lane. I want you to take 10 prompts I have actually given you in this session and test them with the system. Write the strict prompt for the above.',
    selectionReason:
      "Current operator request that combines tool registration with turn-ingestion proof.",
  },
];

type TraceStage =
  | "ordinary_turn_extraction"
  | "pass_1_candidate"
  | "pass_1_repair"
  | "pass_2_canonicalization"
  | "pass_2_repair"
  | "write_path_collision_adjudication";

type PromptTraceEvent =
  | {
      type: "source_windows_ready";
      elapsedMs: number;
      promptId: string;
      totalWindows: number;
      windows: Array<{
        sourceWindowId: string;
        windowIndex: number;
        tokenEstimate: number;
      }>;
    }
  | {
      type: "stage_begin";
      elapsedMs: number;
      promptId: string;
      sourceWindowId: string;
      windowIndex: number;
      stage: TraceStage;
      contractVersion: string;
      modelId: string;
      promptChars: number;
    }
  | {
      type: "http_request";
      elapsedMs: number;
      promptId: string;
      sourceWindowId?: string;
      windowIndex?: number;
      stage?: TraceStage;
      submitted: boolean;
      method: string;
      url: string;
    }
  | {
      type: "http_response";
      elapsedMs: number;
      promptId: string;
      sourceWindowId?: string;
      windowIndex?: number;
      stage?: TraceStage;
      status: number;
      ok: boolean;
    }
  | {
      type: "executor_success";
      elapsedMs: number;
      promptId: string;
      sourceWindowId: string;
      windowIndex: number;
      stage: TraceStage;
      contractVersion: string;
      requestedModelId: string;
      resolvedModelId?: string;
      outputChars: number;
    }
  | {
      type: "executor_error";
      elapsedMs: number;
      promptId: string;
      sourceWindowId: string;
      windowIndex: number;
      stage: TraceStage;
      contractVersion: string;
      requestedModelId: string;
      error: string;
    }
  | {
      type: "interpreter_result";
      elapsedMs: number;
      promptId: string;
      sourceWindowId: string;
      windowIndex: number;
      stage: TraceStage;
      contractVersion: string;
      action: SemanticInterpreterResult["action"];
      objectCount: number;
    }
  | {
      type: "interpreter_error";
      elapsedMs: number;
      promptId: string;
      sourceWindowId: string;
      windowIndex: number;
      stage: TraceStage;
      contractVersion: string;
      error: string;
    }
  | {
      type: "window_result";
      elapsedMs: number;
      promptId: string;
      sourceWindowId: string;
      action: "ignore" | "capture" | "reject";
      objectCount: number;
      rejectReasons: string[];
    }
  | {
      type: "write_result";
      elapsedMs: number;
      promptId: string;
      sourceWindowId: string;
      decision: string;
      decisionCodes: string[];
      memoryObjectId?: string;
      supportItemId?: string;
      lifecycleState?: string;
    }
  | {
      type: "collision_gate";
      elapsedMs: number;
      promptId: string;
      sourceWindowId: string;
      candidateId: string;
      canonicalClass: string;
      kind: string;
      rawCandidateCount: number;
      retainedCandidateCount: number;
      prunedCandidateCount: number;
      disposition: "zero_candidate_skip" | "admitted_to_batch";
    }
  | {
      type: "collision_begin";
      elapsedMs: number;
      promptId: string;
      sourceWindowIds: string[];
      stage: "write_path_collision_adjudication";
      requestCount: number;
      candidateCount: number;
      modelId: string;
    }
  | {
      type: "collision_result";
      elapsedMs: number;
      promptId: string;
      sourceWindowId: string;
      stage: "write_path_collision_adjudication";
      candidateId: string;
      relation: CollisionAdjudicationDecision["relation"];
      targetObjectId?: string;
    };

type ActiveRequestContext = {
  promptId: string;
  sourceWindowId: string;
  windowIndex: number;
  stage: TraceStage;
  contractVersion: string;
  modelId: string;
};

export type SessionTurnPromptRunReport = {
  promptId: string;
  order: number;
  title: string;
  text: string;
  sourceId?: string;
  sourceWindowCount: number;
  status: "completed" | "failed";
  capturedClaimCount: number;
  ignoredWindowCount: number;
  rejectedWindowCount: number;
  writeDecisionCounts: Record<string, number>;
  lifecycleCounts: Record<string, number>;
  rejectReasons: string[];
  traces: PromptTraceEvent[];
  errorMessage?: string;
};

export type SessionTurnProofReport = {
  generatedAt: string;
  modelRef: string;
  candidateModelRef: string;
  requestSeed: number;
  requestTimeoutMs: number;
  maxWordsPerWindow: number;
  prompts: SessionTurnProofPrompt[];
  promptRuns: SessionTurnPromptRunReport[];
  totals: {
    promptsAttempted: number;
    promptsCompleted: number;
    promptsFailed: number;
    capturedClaimCount: number;
    ignoredWindowCount: number;
    rejectedWindowCount: number;
    writeDecisionCounts: Record<string, number>;
    lifecycleCounts: Record<string, number>;
    rejectReasons: string[];
  };
  finalSnapshot: {
    sourceCount: number;
    sourceWindowCount: number;
    memoryObjectCount: number;
    supportItemCount: number;
    writeEventCount: number;
    lifecycleCounts: Record<string, number>;
  };
};

function mapContractVersion(contractVersion: string): TraceStage {
  if (contractVersion === "v1") {
    return "ordinary_turn_extraction";
  }
  if (contractVersion === "v2-candidate") {
    return "pass_1_candidate";
  }
  if (contractVersion === "v2-candidate-repair") {
    return "pass_1_repair";
  }
  if (contractVersion === "v2-canonicalization-repair") {
    return "pass_2_repair";
  }
  return "pass_2_canonicalization";
}

function summarizeTraceStages(traces: PromptTraceEvent[]): string {
  const stageCounts: Record<string, number> = {};
  let httpSuccessCount = 0;
  let httpFailureCount = 0;
  let ignoreCount = 0;
  let captureCount = 0;
  let rejectCount = 0;

  for (const trace of traces) {
    if (trace.type === "stage_begin") {
      stageCounts[trace.stage] = (stageCounts[trace.stage] ?? 0) + 1;
    }
    if (trace.type === "http_response") {
      if (trace.ok) {
        httpSuccessCount += 1;
      } else {
        httpFailureCount += 1;
      }
    }
    if (trace.type === "window_result") {
      if (trace.action === "ignore") {
        ignoreCount += 1;
      } else if (trace.action === "capture") {
        captureCount += 1;
      } else if (trace.action === "reject") {
        rejectCount += 1;
      }
    }
  }

  const parts = [
    ...Object.entries(stageCounts).map(([stage, count]) => `stage:${stage}=${count}`),
    `http_ok=${httpSuccessCount}`,
  ];
  if (httpFailureCount > 0) {
    parts.push(`http_not_ok=${httpFailureCount}`);
  }
  parts.push(`ignore=${ignoreCount}`);
  if (captureCount > 0) {
    parts.push(`capture=${captureCount}`);
  }
  if (rejectCount > 0) {
    parts.push(`reject=${rejectCount}`);
  }
  return parts.join(", ");
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  return String(error);
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function mergeCounts(
  left: Record<string, number>,
  right: Record<string, number>,
): Record<string, number> {
  const merged: Record<string, number> = { ...left };
  for (const [key, value] of Object.entries(right)) {
    merged[key] = (merged[key] ?? 0) + value;
  }
  return merged;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].toSorted((left, right) => left.localeCompare(right));
}

function countLifecycle(values: Array<string | undefined>): Record<string, number> {
  return countBy(values.map((value) => value ?? "unknown"));
}

export async function executeSessionTurnProof(input: {
  runtime: ModelMemoryDatabaseRuntime;
  config?: Record<string, unknown>;
  modelRef?: string;
  candidateModelRef?: string;
  requestSeed?: number;
  requestTimeoutMs?: number;
  maxWordsPerWindow?: number;
  prompts?: SessionTurnProofPrompt[];
  onProgress?: (message: string) => void | Promise<void>;
}): Promise<SessionTurnProofReport> {
  const modelRef = input.modelRef ?? SESSION_TURN_PROOF_MODEL_REF;
  const candidateModelRef = input.candidateModelRef ?? SESSION_TURN_PROOF_MODEL_REF;
  const requestSeed = input.requestSeed ?? SESSION_TURN_PROOF_REQUEST_SEED;
  const requestTimeoutMs = input.requestTimeoutMs ?? SESSION_TURN_PROOF_REQUEST_TIMEOUT_MS;
  const maxWordsPerWindow = input.maxWordsPerWindow ?? SESSION_TURN_PROOF_MAX_WORDS_PER_WINDOW;
  const prompts = input.prompts ?? SESSION_TURN_PROOF_PROMPTS;

  await resetModelMemoryEvidenceDatabase(input.runtime);

  let activeContext: ActiveRequestContext | undefined;
  let currentPromptId: string | undefined;
  const promptTraces = new Map<string, PromptTraceEvent[]>();
  const pushTrace = (
    promptId: string,
    event: Record<string, unknown> & { type: PromptTraceEvent["type"] },
  ) => {
    const traces = promptTraces.get(promptId) ?? [];
    traces.push({
      ...event,
      promptId,
      elapsedMs: Date.now() - startedAtByPrompt.get(promptId)!,
    } as PromptTraceEvent);
    promptTraces.set(promptId, traces);
  };
  const startedAtByPrompt = new Map<string, number>();

  const tracingFetch: typeof fetch = async (url, init) => {
    const promptId = activeContext?.promptId ?? "unknown";
    pushTrace(promptId, {
      type: "http_request",
      sourceWindowId: activeContext?.sourceWindowId,
      windowIndex: activeContext?.windowIndex,
      stage: activeContext?.stage,
      submitted: true,
      method: init?.method ?? "GET",
      url: typeof url === "string" ? url : url instanceof URL ? url.href : url.url,
    });
    const response = await fetch(url, init);
    pushTrace(promptId, {
      type: "http_response",
      sourceWindowId: activeContext?.sourceWindowId,
      windowIndex: activeContext?.windowIndex,
      stage: activeContext?.stage,
      status: response.status,
      ok: response.ok,
    });
    return response;
  };

  class TracingExecutor implements JsonModelExecutor {
    constructor(private readonly base: OpenAICompatibleLiveJsonExecutor) {}

    async execute(request: JsonModelExecutionRequest): Promise<JsonModelExecutionResponse> {
      try {
        const response = await this.base.execute(request);
        pushTrace(activeContext?.promptId ?? "unknown", {
          type: "executor_success",
          sourceWindowId: activeContext?.sourceWindowId ?? "unknown",
          windowIndex: activeContext?.windowIndex ?? -1,
          stage: activeContext?.stage ?? mapContractVersion(request.contract.contractVersion),
          contractVersion: request.contract.contractVersion,
          requestedModelId: request.contract.modelId,
          resolvedModelId: response.resolvedModelId,
          outputChars: response.outputText.length,
        });
        return response;
      } catch (error) {
        pushTrace(activeContext?.promptId ?? "unknown", {
          type: "executor_error",
          sourceWindowId: activeContext?.sourceWindowId ?? "unknown",
          windowIndex: activeContext?.windowIndex ?? -1,
          stage: activeContext?.stage ?? mapContractVersion(request.contract.contractVersion),
          contractVersion: request.contract.contractVersion,
          requestedModelId: request.contract.modelId,
          error: stringifyError(error),
        });
        throw error;
      }
    }
  }

  class TracingInterpreter implements SemanticInterpreter {
    constructor(private readonly base: SemanticInterpreter) {}

    async interpret(inputValue: SemanticInterpreterInput): Promise<SemanticInterpreterResult> {
      const stage = mapContractVersion(inputValue.prompt.contract.contractVersion);
      activeContext = {
        promptId: currentPromptId ?? "unknown",
        sourceWindowId: inputValue.sourceWindow.id,
        windowIndex: inputValue.sourceWindow.windowIndex,
        stage,
        contractVersion: inputValue.prompt.contract.contractVersion,
        modelId: inputValue.prompt.contract.modelId,
      };
      pushTrace(activeContext.promptId, {
        type: "stage_begin",
        sourceWindowId: inputValue.sourceWindow.id,
        windowIndex: inputValue.sourceWindow.windowIndex,
        stage,
        contractVersion: inputValue.prompt.contract.contractVersion,
        modelId: inputValue.prompt.contract.modelId,
        promptChars: inputValue.prompt.systemPrompt.length + inputValue.prompt.userPrompt.length,
      });
      try {
        const result = await this.base.interpret(inputValue);
        pushTrace(activeContext.promptId, {
          type: "interpreter_result",
          sourceWindowId: inputValue.sourceWindow.id,
          windowIndex: inputValue.sourceWindow.windowIndex,
          stage,
          contractVersion: inputValue.prompt.contract.contractVersion,
          action: result.action,
          objectCount: result.action === "capture" ? result.objects.length : 0,
        });
        return result;
      } catch (error) {
        pushTrace(activeContext.promptId, {
          type: "interpreter_error",
          sourceWindowId: inputValue.sourceWindow.id,
          windowIndex: inputValue.sourceWindow.windowIndex,
          stage,
          contractVersion: inputValue.prompt.contract.contractVersion,
          error: stringifyError(error),
        });
        throw error;
      } finally {
        activeContext = undefined;
      }
    }
  }

  class TracingCollisionAdjudicator implements SemanticCollisionAdjudicator {
    constructor(private readonly base: SemanticCollisionAdjudicator) {}

    async adjudicate(inputValue: {
      sourceKind: string;
      object: ModelMemoryObject;
      candidates: CollisionCandidate[];
      modelId: string;
      contractVersion?: string;
    }): Promise<CollisionAdjudicationDecision> {
      const [result] = await this.adjudicateBatch({
        requests: [
          {
            candidateId: "single",
            sourceKind: inputValue.sourceKind,
            sourceWindowId: activeContext?.sourceWindowId,
            object: inputValue.object,
            candidates: inputValue.candidates,
          },
        ],
        modelId: inputValue.modelId,
        contractVersion: inputValue.contractVersion,
      });
      if (!result || result.relation === "distinct" || result.relation === "conflict_hold") {
        return { relation: result?.relation ?? "conflict_hold" };
      }
      return {
        relation: result.relation,
        targetObjectId: result.targetObjectId,
      };
    }

    async adjudicateBatch(inputValue: {
      requests: CollisionAdjudicationRequest[];
      modelId: string;
      contractVersion?: string;
    }): Promise<CollisionAdjudicationBatchDecision[]> {
      if (inputValue.requests.length === 0) {
        return [];
      }
      const promptId = activeContext?.promptId ?? "unknown";
      const previousContext = activeContext;
      activeContext = {
        promptId,
        sourceWindowId: inputValue.requests[0]?.sourceWindowId ?? "unknown",
        windowIndex: previousContext?.windowIndex ?? -1,
        stage: "write_path_collision_adjudication",
        contractVersion: inputValue.contractVersion ?? "v2-batch",
        modelId: inputValue.modelId,
      };
      pushTrace(promptId, {
        type: "collision_begin",
        sourceWindowIds: inputValue.requests.map((request) => request.sourceWindowId ?? "unknown"),
        stage: "write_path_collision_adjudication",
        requestCount: inputValue.requests.length,
        candidateCount: inputValue.requests.reduce(
          (total, request) => total + request.candidates.length,
          0,
        ),
        modelId: inputValue.modelId,
      });
      try {
        const results = await this.base.adjudicateBatch(inputValue);
        for (const result of results) {
          const request = inputValue.requests.find(
            (entry) => entry.candidateId === result.candidateId,
          );
          pushTrace(promptId, {
            type: "collision_result",
            sourceWindowId: request?.sourceWindowId ?? "unknown",
            stage: "write_path_collision_adjudication",
            candidateId: result.candidateId,
            relation: result.relation,
            targetObjectId: "targetObjectId" in result ? result.targetObjectId : undefined,
          });
        }
        return results;
      } finally {
        activeContext = previousContext;
      }
    }
  }

  const executor = new TracingExecutor(
    new OpenAICompatibleLiveJsonExecutor({
      config: input.config as never,
      requestTimeoutMs,
      requestSeed,
      fetchImpl: tracingFetch,
    }),
  );
  const interpreter = new TracingInterpreter(new ExecutorBackedSemanticInterpreter(executor));
  const collisionAdjudicator = new TracingCollisionAdjudicator(
    new ExecutorBackedSemanticCollisionAdjudicator(executor),
  );
  const promptRuns: SessionTurnPromptRunReport[] = [];

  for (const prompt of prompts) {
    startedAtByPrompt.set(prompt.id, Date.now());
    promptTraces.set(prompt.id, []);
    currentPromptId = prompt.id;
    await input.onProgress?.(`capturing prompt ${prompt.order}/${prompts.length}: ${prompt.id}`);

    const turnInput = {
      currentTurnText: prompt.text,
      sessionId: "model-memory-session-turn-proof",
      projectId: "openclaw",
      sourceMetadata: {
        promptId: prompt.id,
        promptOrder: prompt.order,
        sourceSurface: "session_turn_proof",
      },
      maxWordsPerWindow,
    } as const;
    const envelope = adaptOrdinaryTurnSource(turnInput);
    pushTrace(prompt.id, {
      type: "source_windows_ready",
      totalWindows: envelope.windows.length,
      windows: envelope.windows.map((window) => ({
        sourceWindowId: window.id,
        windowIndex: window.windowIndex,
        tokenEstimate: window.tokenEstimate,
      })),
    });

    const storeObserver: DatabaseMemoryObjectStoreObserver = {
      onCollisionGate(event) {
        pushTrace(prompt.id, {
          type: "collision_gate",
          sourceWindowId: event.sourceWindowId,
          candidateId: event.candidateId,
          canonicalClass: event.canonicalClass,
          kind: event.kind,
          rawCandidateCount: event.rawCandidateCount,
          retainedCandidateCount: event.retainedCandidateCount,
          prunedCandidateCount: event.prunedCandidateCount,
          disposition: event.disposition,
        });
      },
    };

    const memoryStore = new DatabaseMemoryObjectStore(
      input.runtime.canonicalRepository,
      collisionAdjudicator,
      undefined,
      storeObserver,
    );

    try {
      const result = await captureOrdinaryTurnLive({
        canonicalRepository: input.runtime.canonicalRepository,
        runtimeRepository: input.runtime.runtimeRepository,
        memoryStore,
        collisionAdjudicator,
        rebuildRuntime: false,
        capture: {
          turn: turnInput,
          modelId: modelRef,
          interpreter,
        },
      });

      for (const windowResult of result.windowResults) {
        pushTrace(prompt.id, {
          type: "window_result",
          sourceWindowId: windowResult.sourceWindowId,
          action: windowResult.action,
          objectCount: windowResult.action === "capture" ? windowResult.objects.length : 0,
          rejectReasons:
            windowResult.action === "reject"
              ? windowResult.errors.map((error) => error.message)
              : [],
        });
      }

      for (const writeResult of result.writeResults) {
        pushTrace(prompt.id, {
          type: "write_result",
          sourceWindowId: writeResult.writeEvent.sourceWindowId,
          decision: writeResult.decision,
          decisionCodes: writeResult.writeEvent.decisionCodes,
          memoryObjectId: writeResult.memoryObject?.id ?? writeResult.writeEvent.memoryObjectId,
          supportItemId: writeResult.supportItem?.id ?? writeResult.writeEvent.supportItemId,
          lifecycleState: writeResult.memoryObject?.lifecycleState,
        });
      }

      promptRuns.push({
        promptId: prompt.id,
        order: prompt.order,
        title: prompt.title,
        text: prompt.text,
        sourceId: result.source.id,
        sourceWindowCount: result.windows.length,
        status: "completed",
        capturedClaimCount: result.capturedObjects.length,
        ignoredWindowCount: result.windowResults.filter((entry) => entry.action === "ignore")
          .length,
        rejectedWindowCount: result.windowResults.filter((entry) => entry.action === "reject")
          .length,
        writeDecisionCounts: countBy(result.writeResults.map((entry) => entry.decision)),
        lifecycleCounts: countLifecycle(
          result.writeResults.map((entry) => entry.memoryObject?.lifecycleState),
        ),
        rejectReasons: uniqueSorted(
          result.windowResults.flatMap((entry) =>
            entry.action === "reject" ? entry.errors.map((error) => error.message) : [],
          ),
        ),
        traces: promptTraces.get(prompt.id) ?? [],
      });
    } catch (error) {
      promptRuns.push({
        promptId: prompt.id,
        order: prompt.order,
        title: prompt.title,
        text: prompt.text,
        sourceWindowCount: 0,
        status: "failed",
        capturedClaimCount: 0,
        ignoredWindowCount: 0,
        rejectedWindowCount: 0,
        writeDecisionCounts: {},
        lifecycleCounts: {},
        rejectReasons: [],
        traces: promptTraces.get(prompt.id) ?? [],
        errorMessage: stringifyError(error),
      });
    }
    currentPromptId = undefined;
  }

  const snapshot = await input.runtime.canonicalRepository.snapshot();
  const totals = promptRuns.reduce(
    (acc, run) => ({
      promptsAttempted: acc.promptsAttempted + 1,
      promptsCompleted: acc.promptsCompleted + (run.status === "completed" ? 1 : 0),
      promptsFailed: acc.promptsFailed + (run.status === "failed" ? 1 : 0),
      capturedClaimCount: acc.capturedClaimCount + run.capturedClaimCount,
      ignoredWindowCount: acc.ignoredWindowCount + run.ignoredWindowCount,
      rejectedWindowCount: acc.rejectedWindowCount + run.rejectedWindowCount,
      writeDecisionCounts: mergeCounts(acc.writeDecisionCounts, run.writeDecisionCounts),
      lifecycleCounts: mergeCounts(acc.lifecycleCounts, run.lifecycleCounts),
      rejectReasons: uniqueSorted([...acc.rejectReasons, ...run.rejectReasons]),
    }),
    {
      promptsAttempted: 0,
      promptsCompleted: 0,
      promptsFailed: 0,
      capturedClaimCount: 0,
      ignoredWindowCount: 0,
      rejectedWindowCount: 0,
      writeDecisionCounts: {} as Record<string, number>,
      lifecycleCounts: {} as Record<string, number>,
      rejectReasons: [] as string[],
    },
  );

  return {
    generatedAt: new Date().toISOString(),
    modelRef,
    candidateModelRef,
    requestSeed,
    requestTimeoutMs,
    maxWordsPerWindow,
    prompts,
    promptRuns,
    totals,
    finalSnapshot: {
      sourceCount: snapshot.sources.length,
      sourceWindowCount: snapshot.sourceWindows.length,
      memoryObjectCount: snapshot.memoryObjects.length,
      supportItemCount: snapshot.supportItems.length,
      writeEventCount: snapshot.writeEvents.length,
      lifecycleCounts: countBy(
        snapshot.memoryObjects.map((record) => record.lifecycleState ?? "active"),
      ),
    },
  };
}

export function renderSessionTurnProofPromptsMarkdown(prompts: SessionTurnProofPrompt[]): string {
  const lines: string[] = [];
  lines.push("# Session Turn Proof Prompts");
  lines.push("");
  for (const prompt of prompts) {
    lines.push(`## ${prompt.order}. ${prompt.title}`);
    lines.push("");
    lines.push(`- Prompt ID: ${prompt.id}`);
    lines.push(`- Selection reason: ${prompt.selectionReason}`);
    lines.push("");
    lines.push("```text");
    lines.push(prompt.text);
    lines.push("```");
    lines.push("");
  }
  return lines.join("\n");
}

export function renderSessionTurnProofMarkdown(report: SessionTurnProofReport): string {
  const lines: string[] = [];
  lines.push("# Session Turn Proof");
  lines.push("");
  lines.push(`- Pass 1 model: ${report.candidateModelRef}`);
  lines.push(`- Pass 2 model: ${report.modelRef}`);
  lines.push(`- Request seed: ${report.requestSeed}`);
  lines.push(`- Request timeout ms: ${report.requestTimeoutMs}`);
  lines.push(`- Max words per window: ${report.maxWordsPerWindow}`);
  lines.push(`- Prompts attempted: ${report.totals.promptsAttempted}`);
  lines.push(`- Prompts completed: ${report.totals.promptsCompleted}`);
  lines.push(`- Prompts failed: ${report.totals.promptsFailed}`);
  lines.push(`- Captured claims: ${report.totals.capturedClaimCount}`);
  lines.push(`- Ignored windows: ${report.totals.ignoredWindowCount}`);
  lines.push(`- Rejected windows: ${report.totals.rejectedWindowCount}`);
  lines.push("");
  lines.push("The ordinary-turn lane now reuses the shared two-pass ingestion framework.");
  lines.push(
    "These artifacts therefore show pass-1 candidate extraction, optional pass-1 repair, pass-2 canonicalization, optional pass-2 repair, plus any write-path collision events that actually occurred.",
  );
  lines.push("");
  lines.push("## Prompt Results");
  lines.push("");
  lines.push("| Prompt | Status | Windows | Captured | Decisions | Trace Summary | Rejects |");
  lines.push("| --- | --- | ---: | ---: | --- | --- | --- |");
  for (const run of report.promptRuns) {
    lines.push(
      `| ${run.promptId} | ${run.status} | ${run.sourceWindowCount} | ${run.capturedClaimCount} | ${JSON.stringify(run.writeDecisionCounts)} | ${summarizeTraceStages(run.traces)} | ${run.rejectReasons.join("; ")} |`,
    );
  }
  lines.push("");
  lines.push("## Final Snapshot");
  lines.push("");
  lines.push(`- Sources: ${report.finalSnapshot.sourceCount}`);
  lines.push(`- Source windows: ${report.finalSnapshot.sourceWindowCount}`);
  lines.push(`- Memory objects: ${report.finalSnapshot.memoryObjectCount}`);
  lines.push(`- Support items: ${report.finalSnapshot.supportItemCount}`);
  lines.push(`- Write events: ${report.finalSnapshot.writeEventCount}`);
  lines.push(`- Lifecycle counts: ${JSON.stringify(report.finalSnapshot.lifecycleCounts)}`);
  lines.push("");
  return lines.join("\n");
}

export async function writeSessionTurnProofArtifacts(input: {
  repoRoot: string;
  prompts?: SessionTurnProofPrompt[];
  report: SessionTurnProofReport;
}): Promise<{
  promptsJsonPath: string;
  promptsMarkdownPath: string;
  reportJsonPath: string;
  reportMarkdownPath: string;
}> {
  const prompts = input.prompts ?? SESSION_TURN_PROOF_PROMPTS;
  const evidenceDir = path.join(input.repoRoot, "docs/projects/model-memory/evidence");
  await mkdir(evidenceDir, { recursive: true });

  const promptsJsonPath = path.join(evidenceDir, "session-turn-proof-prompts.json");
  const promptsMarkdownPath = path.join(evidenceDir, "session-turn-proof-prompts.md");
  const reportJsonPath = path.join(evidenceDir, "session-turn-proof-nano-nano.json");
  const reportMarkdownPath = path.join(evidenceDir, "session-turn-proof-nano-nano.md");

  await writeFile(promptsJsonPath, `${JSON.stringify({ prompts }, null, 2)}\n`, "utf8");
  await writeFile(
    promptsMarkdownPath,
    `${renderSessionTurnProofPromptsMarkdown(prompts)}\n`,
    "utf8",
  );
  await writeFile(reportJsonPath, `${JSON.stringify(input.report, null, 2)}\n`, "utf8");
  await writeFile(reportMarkdownPath, `${renderSessionTurnProofMarkdown(input.report)}\n`, "utf8");

  return {
    promptsJsonPath,
    promptsMarkdownPath,
    reportJsonPath,
    reportMarkdownPath,
  };
}
