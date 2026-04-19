import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DatabaseMemoryObjectStore,
  type DatabaseMemoryObjectStoreObserver,
} from "../extensions/model-memory/src/db/database-memory-object-store.ts";
import {
  ingestDocument,
  type CapturedMemoryObject,
} from "../extensions/model-memory/src/document-ingestion.ts";
import type {
  JsonModelExecutionRequest,
  JsonModelExecutionResponse,
  JsonModelExecutor,
} from "../extensions/model-memory/src/model-execution.ts";
import { buildHarnessProjectionOutputs } from "../extensions/model-memory/src/openclaw-runtime-adapters.ts";
import { ExecutorBackedSemanticInterpreter } from "../extensions/model-memory/src/real-semantic-interpreter.ts";
import type {
  WorkspaceProjectionTargetRecord,
  WorkspaceProjectionVersionRecord,
} from "../extensions/model-memory/src/runtime-read-models.ts";
import { rebuildDerivedRuntimeState } from "../extensions/model-memory/src/runtime-rebuild-orchestrator.ts";
import {
  ExecutorBackedSemanticCollisionAdjudicator,
  type BoundedCandidateAdjudicationBatchDecision,
  type CollisionAdjudicationBatchDecision,
  type CollisionAdjudicationDecision,
  type CollisionAdjudicationRequest,
  type SemanticCollisionAdjudicator,
} from "../extensions/model-memory/src/semantic-collision-adjudication.ts";
import type {
  SemanticInterpreter,
  SemanticInterpreterInput,
  SemanticInterpreterResult,
} from "../extensions/model-memory/src/semantic-interpreter.ts";
import type { ModelMemoryObject } from "../extensions/model-memory/src/semantic-schema.ts";
import { createModelMemoryDatabaseRuntime } from "../src/agents/model-memory.database.ts";
import { resetModelMemoryEvidenceDatabase } from "../src/agents/model-memory.large-document-evidence.ts";
import { OpenAICompatibleLiveJsonExecutor } from "../src/agents/model-memory.live-json-executor.ts";
import {
  loadSanitizedModelMemoryRunnerConfig,
  resolveModelMemoryRunnerDatabaseMode,
  writeSanitizedModelMemoryRunnerConfig,
} from "../src/agents/model-memory.run-config.ts";
import type { OpenClawConfig } from "../src/config/config.ts";

type CorpusDocument = {
  id: string;
  relativePath: string;
  rationale: string;
  semanticMix: string;
  expectedDominantKinds: string[];
  mustCaptureClaims: string[];
};

type VariantId =
  | "baseline"
  | "variant_a_prompt_simplification"
  | "variant_b_schema_plus_prompt_simplification";

type StageName =
  | "pass_1_candidate"
  | "pass_1_repair"
  | "pass_2_canonicalization"
  | "pass_2_repair"
  | "write_path_collision_adjudication";

type StageTrace = {
  sourcePath: string;
  sourceWindowId: string;
  windowIndex: number;
  stage: StageName;
  contractVersion: string;
  modelId: string;
  promptChars: number;
  action?: "capture" | "ignore";
  objectCount?: number;
  candidateTypeCounts?: Record<string, number>;
  kindCounts?: Record<string, number>;
  canonicalClassCounts?: Record<string, number>;
  rawObjects?: unknown[];
  error?: string;
};

type CollisionTrace = {
  sourcePath: string;
  sourceWindowId: string;
  candidateId?: string;
  requestCount?: number;
  candidateCount?: number;
  decisions?: CollisionAdjudicationBatchDecision[];
  error?: string;
};

type CollisionGateTrace = {
  sourcePath: string;
  sourceWindowId: string;
  candidateId: string;
  canonicalClass: string;
  kind: string;
  rawCandidateCount: number;
  retainedCandidateCount: number;
  prunedCandidateCount: number;
  disposition: string;
};

type BoundedAdjudicationTrace = {
  sourcePath: string;
  sourceWindowId: string;
  candidateId: string;
  canonicalClass: string;
  kind: string;
  candidateSource: string;
  adjudicationCandidateCount: number;
  adjudicationBatchAdmitted: boolean;
  finalLocalRouting: string;
  modelOutput?: BoundedCandidateAdjudicationBatchDecision;
};

type WriteDecisionSummary = {
  decision: string;
  decisionCodes: string[];
  memoryObjectId?: string;
  lifecycleState?: string;
};

type DocumentVariantResult = {
  sourcePath: string;
  rationale: string;
  semanticMix: string;
  expectedDominantKinds: string[];
  mustCaptureClaims: string[];
  lineCount: number;
  windowCount: number;
  candidateCountByType: Record<string, number>;
  canonicalizedCountByKind: Record<string, number>;
  canonicalizedCountByCanonicalClass: Record<string, number>;
  validationRejectCount: number;
  validationRejectReasons: string[];
  repairInvocations: Record<string, number>;
  writeDecisionCounts: Record<string, number>;
  adjudicationOutcomeCounts: Record<string, number>;
  collisionGateTotals: {
    rawCandidateCount: number;
    retainedCandidateCount: number;
    prunedCandidateCount: number;
  };
  boundedAdjudicationRoutes: Record<string, number>;
  finalActiveObjectDeltaByKind: Record<string, number>;
  finalActiveObjectDeltaByCanonicalClass: Record<string, number>;
  memoryProjection: {
    relativePath?: string;
    changed: boolean;
    lineCount: number;
    bulletCount: number;
    contentExcerpt?: string;
  };
  acceptedObjects: Array<{
    sourceWindowId: string;
    kind: string;
    canonicalClass: string;
    payload: Record<string, unknown>;
  }>;
  stageTraces: StageTrace[];
  collisionTraces: CollisionTrace[];
  collisionGates: CollisionGateTrace[];
  boundedAdjudications: BoundedAdjudicationTrace[];
  writeDecisions: WriteDecisionSummary[];
};

type VariantResult = {
  variantId: VariantId;
  hypothesis: string;
  simplificationTested: string;
  filesChanged: string[];
  intentionallyNotChanged: string[];
  modelId: string;
  candidateModelId: string;
  requestSeed?: number;
  requestTimeoutMs: number;
  maxWordsPerWindow: number;
  documents: DocumentVariantResult[];
  totals: {
    windowCount: number;
    candidateCountByType: Record<string, number>;
    canonicalizedCountByKind: Record<string, number>;
    canonicalizedCountByCanonicalClass: Record<string, number>;
    validationRejectCount: number;
    writeDecisionCounts: Record<string, number>;
    adjudicationOutcomeCounts: Record<string, number>;
    finalActiveObjectCountByKind: Record<string, number>;
  };
};

type BenchmarkReport = {
  generatedAt: string;
  repoRoot: string;
  modelId: string;
  candidateModelId: string;
  requestSeed?: number;
  requestTimeoutMs: number;
  maxWordsPerWindow: number;
  corpus: CorpusDocument[];
  variants: VariantResult[];
};

type VariantDefinition = {
  id: VariantId;
  hypothesis: string;
  simplificationTested: string;
  filesChanged: string[];
  intentionallyNotChanged: string[];
  transformPrompt?: (input: {
    stage: StageName;
    sourcePath: string;
    request: JsonModelExecutionRequest;
  }) => JsonModelExecutionRequest;
  transformResult?: (input: {
    stage: StageName;
    sourcePath: string;
    result: SemanticInterpreterResult;
    sourceKind: string;
  }) => SemanticInterpreterResult;
};

const DEFAULT_MODEL_ID = "openrouter/openai/gpt-5.4-nano";
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_REQUEST_SEED = 7;
const DEFAULT_MAX_WORDS_PER_WINDOW = 1500;
const DEFAULT_OUTPUT_DIR = "docs/projects/model-memory/evidence/rule-vs-fact-benchmark";

const CORPUS: CorpusDocument[] = [
  {
    id: "system-memory",
    relativePath: "docs/system/memory.md",
    rationale: "System recall index with explicit memory-layer policy and workspace inventory.",
    semanticMix: "Topology facts plus durable memory-layer rules.",
    expectedDominantKinds: ["fact", "rule", "reference"],
    mustCaptureClaims: [
      "System Memory is the workspace recall index for OpenClaw.",
      "Generated memory must not flatten authored docs.",
      "The memory layers include human-owned sources, DB-backed model-memory projection, and daily memory files as an ingestion layer.",
    ],
  },
  {
    id: "system-deployment",
    relativePath: "docs/system/deployment.md",
    rationale:
      "Deployment policy surface with strong normative language and stable operational facts.",
    semanticMix: "Rules first, then deployment facts and references.",
    expectedDominantKinds: ["rule", "fact", "reference"],
    mustCaptureClaims: [
      "OpenClaw should converge toward one canonical repo checkout, runtime container, and runtime image.",
      "Deployment sprawl is drift, not harmless clutter.",
      "Active runtime assets must not be pruned casually.",
    ],
  },
  {
    id: "architecture-overview",
    relativePath: "docs/projects/model-memory/specs/architecture-overview.md",
    rationale:
      "Core model-memory architecture doc that mixes descriptive pipeline facts with explicit non-goals.",
    semanticMix: "Architecture facts plus some boundary rules.",
    expectedDominantKinds: ["fact", "rule", "reference"],
    mustCaptureClaims: [
      "The runtime pipeline is identical for supported source types after source adaptation.",
      "Semantic truth lives only in canonical memory objects.",
      "Detector-era modules and family registries are non-goals.",
    ],
  },
  {
    id: "kind-primary-schema-migration",
    relativePath: "docs/projects/model-memory/specs/kind-primary-schema-migration.md",
    rationale: "Direct test of class-vs-kind semantics and migration rules.",
    semanticMix: "Schema migration rules with supporting facts.",
    expectedDominantKinds: ["rule", "fact"],
    mustCaptureClaims: [
      "Kind should become the primary semantic discriminator.",
      "CanonicalClass should be secondary or derived.",
      "Phase 2 should begin by keeping both fields while demoting class logically.",
    ],
  },
  {
    id: "document-read-ingest-arbitration",
    relativePath: "docs/projects/model-memory/specs/document-read-and-ingest-arbitration.md",
    rationale:
      "Strong normative contract around read-vs-ingest arbitration with bounded scope rules.",
    semanticMix: "Rules, procedures, and system-behavior facts.",
    expectedDominantKinds: ["rule", "procedure", "fact"],
    mustCaptureClaims: [
      "Use the paginated reader first for immediate answerability.",
      "Trigger ingest only when there is clear value beyond the current answer.",
      "The current implementation only applies to host-side reads inside the active workspace root.",
    ],
  },
  {
    id: "runtime-project-surfaces",
    relativePath: "docs/projects/workspace-topology/runtime-project-surfaces.md",
    rationale: "Topology policy with canonical project list and compatibility-alias rules.",
    semanticMix: "Project-structure facts and resolution rules.",
    expectedDominantKinds: ["fact", "rule", "reference"],
    mustCaptureClaims: [
      "Docs/projects surfaces are the only canonical project workspaces.",
      "Workspace projects should usually be import-backed compatibility aliases.",
      "Projects/ops is the justified writable exception.",
    ],
  },
  {
    id: "github-automation",
    relativePath: "docs/projects/deployment-topology/github-automation.md",
    rationale: "Automation lane with stable asset references and live-contract rules.",
    semanticMix: "Automation facts and operational rules.",
    expectedDominantKinds: ["fact", "rule", "reference"],
    mustCaptureClaims: [
      "The GitHub digest lane is scoped to openclaw/openclaw.",
      "The live webhook-ingest workflow is published and active on the public Funnel endpoint.",
      "Future restoration work should extend this lane from committed assets rather than runtime-only host survival.",
    ],
  },
  {
    id: "skill-vetting-report-contract",
    relativePath:
      "docs/projects/skills-system/skill-vetting/specs/operator-vetting-report-contract.md",
    rationale: "Dense normative contract with explicit required fields and required sections.",
    semanticMix: "Rules first, with some reference facts.",
    expectedDominantKinds: ["rule", "reference"],
    mustCaptureClaims: [
      "Every external skill review must end in a durable operator-facing report.",
      "The report must live under docs/projects/skills-system/skill-vetting/reports.",
      "Runtime surface proof must record availability and proof commands for openclaw and clawhub surfaces.",
    ],
  },
  {
    id: "web-research-delegation",
    relativePath: "docs/projects/web-stack/web_research_delegation_spec.md",
    rationale: "Delegation policy doc with clear when-to / when-not-to routing rules.",
    semanticMix: "Delegation rules, procedural request shape, and a few reference facts.",
    expectedDominantKinds: ["rule", "procedure", "reference"],
    mustCaptureClaims: [
      "Web-researcher is the designated external public-web retrieval surface.",
      "Explicit URL or read-this-page tasks should default to a fresh temporary web-researcher session.",
      "Delegation requests should be bounded and include objective, required_fields, and desired_output_shape.",
    ],
  },
  {
    id: "routing-implementation-checklist",
    relativePath: "docs/projects/intake-routing/ROUTING_IMPLEMENTATION_CHECKLIST.md",
    rationale:
      "Checklist-heavy document that should stress procedure capture and rule vs fact separation.",
    semanticMix: "Procedures with some gating rules and deployment facts.",
    expectedDominantKinds: ["procedure", "rule", "fact"],
    mustCaptureClaims: [
      "The checklist must be executed in order with verification gates before proceeding.",
      "Step 1 requires applying and verifying the intake routing schema SQL.",
      "Step 2 requires importing the Intake Router workflow into n8n but not activating it yet.",
    ],
  },
];

const VARIANTS: VariantDefinition[] = [
  {
    id: "baseline",
    hypothesis:
      "Current live prompts and canonicalization behavior continue to undercapture rules relative to facts.",
    simplificationTested: "None. This preserves the current live path.",
    filesChanged: [],
    intentionallyNotChanged: [
      "No prompt text changes.",
      "No canonicalClass derivation.",
      "No payload normalization.",
      "No write-path simplification.",
    ],
  },
  {
    id: "variant_a_prompt_simplification",
    hypothesis:
      "Rule undercapture is primarily upstream and improves if candidate extraction and canonicalization treat kind as primary and normativity as first-class.",
    simplificationTested:
      "Prompt-only simplification: classify by kind first, prefer rule for normative text, and treat canonicalClass as secondary bookkeeping.",
    filesChanged: [
      "semantic_extraction prompt contract at candidate stage",
      "semantic_extraction prompt contract at canonicalization stage",
    ],
    intentionallyNotChanged: [
      "No schema changes.",
      "No validator changes.",
      "No write-policy changes.",
      "No collision-logic changes.",
    ],
    transformPrompt(input) {
      const extraLines =
        input.stage === "pass_1_candidate" || input.stage === "pass_1_repair"
          ? [
              "Classify by kind first, not by canonicalClass.",
              "For document sources, treat requirements, prohibitions, defaults, gates, allowed/forbidden conditions, and operator contracts as rule candidates.",
              "Facts are descriptive state. Rules prescribe required or preferred behavior.",
              "If text is normative and durable, prefer rule over fact.",
              "Do not demote normative statements to fact just because they describe a project surface or deployment surface.",
            ]
          : [
              "Choose kind first and treat canonicalClass as secondary bookkeeping.",
              "If candidateType=rule and the cited evidence is normative, imperative, prohibitive, default-setting, or gate-setting, keep kind=rule.",
              "If rule field splitting is uncertain, put the core directive in recommendedAction instead of downgrading to fact.",
              "Choose the simplest valid canonicalClass only after kind is settled.",
            ];
      return {
        ...input.request,
        contract: {
          ...input.request.contract,
          contractVersion: `${input.request.contract.contractVersion}@${input.stage}@variant-a`,
        },
        systemPrompt: `${input.request.systemPrompt}\n${extraLines.join("\n")}`,
      };
    },
  },
  {
    id: "variant_b_schema_plus_prompt_simplification",
    hypothesis:
      "A bounded canonicalization simplification helps beyond prompt-only changes by removing the model burden of class assignment and normalizing brittle rule payload output.",
    simplificationTested:
      "Prompt simplification plus a canonicalization normalizer that derives canonicalClass from kind/sourceKind and repairs minimal rule payload shape.",
    filesChanged: [
      "semantic_extraction prompt contract at candidate stage",
      "semantic_extraction prompt contract at canonicalization stage",
      "benchmark-only canonicalization normalizer",
    ],
    intentionallyNotChanged: [
      "No production schema migration.",
      "No database write-policy changes.",
      "No collision-logic changes.",
      "No new deterministic heuristics beyond bounded canonicalization normalization.",
    ],
    transformPrompt(input) {
      const request = VARIANTS[1]?.transformPrompt?.(input) ?? input.request;
      return {
        ...request,
        contract: {
          ...request.contract,
          contractVersion: `${input.request.contract.contractVersion}@${input.stage}@variant-b`,
        },
      };
    },
    transformResult(input) {
      if (input.result.action !== "capture") {
        return input.result;
      }
      if (input.stage === "pass_1_candidate" || input.stage === "pass_1_repair") {
        return {
          ...input.result,
          objects: input.result.objects.map((entry) => normalizeCandidateObject(entry)),
        };
      }
      if (input.stage !== "pass_2_canonicalization" && input.stage !== "pass_2_repair") {
        return input.result;
      }
      return {
        ...input.result,
        objects: input.result.objects.map((entry) =>
          normalizeCanonicalizedObject(entry, input.sourceKind),
        ),
      };
    },
  },
];

function countBy<T extends string>(values: T[]): Record<string, number> {
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

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function countLines(text: string): number {
  return text.length === 0 ? 0 : text.split(/\r?\n/).length;
}

function excerpt(text: string, maxLength = 240): string | undefined {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3)}...`;
}

function parseArgs(argv: string[]) {
  const selectedVariants: VariantId[] = [];
  let limit: number | undefined;
  let outputDir = DEFAULT_OUTPUT_DIR;
  let maxWordsPerWindow = DEFAULT_MAX_WORDS_PER_WINDOW;
  let modelId = DEFAULT_MODEL_ID;
  let candidateModelId = DEFAULT_MODEL_ID;
  let requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS;
  let requestSeed = DEFAULT_REQUEST_SEED;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--variant" && next) {
      if (isVariantId(next)) {
        selectedVariants.push(next);
      }
      index += 1;
      continue;
    }
    if (arg === "--limit" && next) {
      limit = Number.parseInt(next, 10);
      index += 1;
      continue;
    }
    if (arg === "--output-dir" && next) {
      outputDir = next;
      index += 1;
      continue;
    }
    if (arg === "--max-words-per-window" && next) {
      maxWordsPerWindow = Number.parseInt(next, 10);
      index += 1;
      continue;
    }
    if (arg === "--model" && next) {
      modelId = next;
      index += 1;
      continue;
    }
    if (arg === "--candidate-model" && next) {
      candidateModelId = next;
      index += 1;
      continue;
    }
    if (arg === "--request-timeout-ms" && next) {
      requestTimeoutMs = Number.parseInt(next, 10);
      index += 1;
      continue;
    }
    if (arg === "--request-seed" && next) {
      requestSeed = Number.parseInt(next, 10);
      index += 1;
      continue;
    }
  }

  return {
    variants:
      selectedVariants.length > 0 ? selectedVariants : VARIANTS.map((variant) => variant.id),
    limit,
    outputDir,
    maxWordsPerWindow,
    modelId,
    candidateModelId,
    requestTimeoutMs,
    requestSeed,
  };
}

function isVariantId(value: string): value is VariantId {
  return VARIANTS.some((variant) => variant.id === value);
}

function mapContractVersionToStage(contractVersion: string): StageName {
  if (contractVersion.startsWith("v2-candidate-repair")) {
    return "pass_1_repair";
  }
  if (contractVersion.startsWith("v2-candidate")) {
    return "pass_1_candidate";
  }
  if (contractVersion.startsWith("v2-canonicalization-repair")) {
    return "pass_2_repair";
  }
  if (contractVersion.startsWith("v2-canonicalization")) {
    return "pass_2_canonicalization";
  }
  return "write_path_collision_adjudication";
}

function countCandidateTypes(objects: unknown[]): Record<string, number> {
  return countBy(
    objects
      .map((entry) =>
        entry && typeof entry === "object"
          ? readString((entry as Record<string, unknown>).candidateType)
          : undefined,
      )
      .filter((value): value is string => Boolean(value)),
  );
}

function countKinds(objects: unknown[]): Record<string, number> {
  return countBy(
    objects
      .map((entry) =>
        entry && typeof entry === "object"
          ? readString((entry as Record<string, unknown>).kind)
          : undefined,
      )
      .filter((value): value is string => Boolean(value)),
  );
}

function countCanonicalClasses(objects: unknown[]): Record<string, number> {
  return countBy(
    objects
      .map((entry) =>
        entry && typeof entry === "object"
          ? readString((entry as Record<string, unknown>).canonicalClass)
          : undefined,
      )
      .filter((value): value is string => Boolean(value)),
  );
}

function deriveCanonicalClassFromKind(kind: string, _sourceKind: string): string | undefined {
  if (kind === "preference") {
    return "user";
  }
  if (kind === "fact") {
    return "project";
  }
  if (kind === "rule") {
    return "project";
  }
  if (kind === "procedure") {
    return "feedback";
  }
  if (kind === "reference") {
    return "reference";
  }
  return undefined;
}

function normalizeCandidateConfidence(value: unknown): "weak" | "medium" | "strong" | undefined {
  if (value === "weak" || value === "medium" || value === "strong") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 0.85) {
      return "strong";
    }
    if (value >= 0.55) {
      return "medium";
    }
    return "weak";
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return normalizeCandidateConfidence(parsed);
    }
  }
  return undefined;
}

function normalizeCandidateObject(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }
  const record = { ...(raw as Record<string, unknown>) };
  const normalizedConfidence = normalizeCandidateConfidence(record.confidence);
  if (normalizedConfidence) {
    record.confidence = normalizedConfidence;
  }
  if (record.shouldStore === "true") {
    record.shouldStore = true;
  }
  if (record.shouldStore === "false") {
    record.shouldStore = false;
  }
  return record;
}

function normalizeCanonicalizedObject(raw: unknown, sourceKind: string): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }
  const record = { ...(raw as Record<string, unknown>) };
  const kind = readString(record.kind);
  if (!kind) {
    return record;
  }
  const derivedCanonicalClass = deriveCanonicalClassFromKind(kind, sourceKind);
  if (derivedCanonicalClass) {
    record.canonicalClass = derivedCanonicalClass;
  }
  if (kind !== "rule") {
    return record;
  }
  const payload =
    record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
      ? { ...(record.payload as Record<string, unknown>) }
      : undefined;
  if (!payload) {
    return record;
  }
  const hasActionField =
    readString(payload.recommendedAction) ||
    readString(payload.avoidAction) ||
    readString(payload.neededCapability);
  if (hasActionField) {
    record.payload = payload;
    return record;
  }
  const fallback =
    readString(payload.instruction) ||
    readString(payload.value) ||
    readString(payload.statement) ||
    readString((record as Record<string, unknown>).claim);
  const subject = readString(payload.subject);
  if (subject && fallback) {
    payload.recommendedAction = fallback;
    delete payload.value;
    delete payload.instruction;
    delete payload.statement;
    record.payload = payload;
  }
  return record;
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

class VariantExecutor implements JsonModelExecutor {
  constructor(
    private readonly base: OpenAICompatibleLiveJsonExecutor,
    private readonly variant: VariantDefinition,
    private readonly traceSink: (trace: StageTrace) => void,
    private readonly context: { sourcePath: string; sourceWindowId: string; windowIndex: number },
  ) {}

  async execute(request: JsonModelExecutionRequest): Promise<JsonModelExecutionResponse> {
    const stage = mapContractVersionToStage(request.contract.contractVersion);
    const transformedRequest = this.variant.transformPrompt
      ? this.variant.transformPrompt({
          stage,
          sourcePath: this.context.sourcePath,
          request,
        })
      : request;
    this.traceSink({
      sourcePath: this.context.sourcePath,
      sourceWindowId: this.context.sourceWindowId,
      windowIndex: this.context.windowIndex,
      stage,
      contractVersion: transformedRequest.contract.contractVersion,
      modelId: transformedRequest.contract.modelId,
      promptChars: transformedRequest.systemPrompt.length + transformedRequest.userPrompt.length,
    });
    return this.base.execute(transformedRequest);
  }
}

class VariantTracingInterpreter implements SemanticInterpreter {
  constructor(
    private readonly createBaseExecutor: (context: {
      sourcePath: string;
      sourceWindowId: string;
      windowIndex: number;
    }) => JsonModelExecutor,
    private readonly variant: VariantDefinition,
    private readonly traceSink: (trace: StageTrace) => void,
    private readonly sourcePathForWindow: (sourceWindowId: string) => string,
  ) {}

  async interpret(input: SemanticInterpreterInput): Promise<SemanticInterpreterResult> {
    const stage = mapContractVersionToStage(input.prompt.contract.contractVersion);
    const base = new ExecutorBackedSemanticInterpreter(
      this.createBaseExecutor({
        sourcePath: this.sourcePathForWindow(input.sourceWindow.id),
        sourceWindowId: input.sourceWindow.id,
        windowIndex: input.sourceWindow.windowIndex,
      }),
    );
    try {
      const result = await base.interpret(input);
      const transformed = this.variant.transformResult
        ? this.variant.transformResult({
            stage,
            sourcePath: this.sourcePathForWindow(input.sourceWindow.id),
            result,
            sourceKind: input.sourceKind,
          })
        : result;
      this.traceSink({
        sourcePath: this.sourcePathForWindow(input.sourceWindow.id),
        sourceWindowId: input.sourceWindow.id,
        windowIndex: input.sourceWindow.windowIndex,
        stage,
        contractVersion: input.prompt.contract.contractVersion,
        modelId: input.prompt.contract.modelId,
        promptChars: input.prompt.systemPrompt.length + input.prompt.userPrompt.length,
        action: transformed.action,
        objectCount: transformed.action === "capture" ? transformed.objects.length : 0,
        candidateTypeCounts:
          transformed.action === "capture" &&
          (stage === "pass_1_candidate" || stage === "pass_1_repair")
            ? countCandidateTypes(transformed.objects)
            : undefined,
        kindCounts:
          transformed.action === "capture" &&
          (stage === "pass_2_canonicalization" || stage === "pass_2_repair")
            ? countKinds(transformed.objects)
            : undefined,
        canonicalClassCounts:
          transformed.action === "capture" &&
          (stage === "pass_2_canonicalization" || stage === "pass_2_repair")
            ? countCanonicalClasses(transformed.objects)
            : undefined,
        rawObjects: transformed.action === "capture" ? transformed.objects : undefined,
      });
      return transformed;
    } catch (error) {
      this.traceSink({
        sourcePath: this.sourcePathForWindow(input.sourceWindow.id),
        sourceWindowId: input.sourceWindow.id,
        windowIndex: input.sourceWindow.windowIndex,
        stage,
        contractVersion: input.prompt.contract.contractVersion,
        modelId: input.prompt.contract.modelId,
        promptChars: input.prompt.systemPrompt.length + input.prompt.userPrompt.length,
        error: stringifyError(error),
      });
      throw error;
    }
  }
}

class VariantTracingCollisionAdjudicator implements SemanticCollisionAdjudicator {
  constructor(
    private readonly base: SemanticCollisionAdjudicator,
    private readonly traceSink: (trace: CollisionTrace) => void,
  ) {}

  async adjudicate(input: {
    sourceKind: string;
    object: ModelMemoryObject;
    candidates: Array<{
      id: string;
      identityKey: string;
      canonicalClass: string;
      kind: string;
      payload: Record<string, unknown>;
      scope: Record<string, unknown>;
      normalizedSearchText: string;
      lifecycleState: string;
      slotKey?: string;
    }>;
    modelId: string;
    contractVersion?: string;
  }): Promise<CollisionAdjudicationDecision> {
    const [result] = await this.adjudicateBatch({
      requests: [
        {
          candidateId: "single",
          sourceKind: input.sourceKind,
          object: input.object,
          candidates: input.candidates,
        },
      ],
      modelId: input.modelId,
      contractVersion: input.contractVersion,
    });
    if (!result || result.relation === "distinct" || result.relation === "conflict_hold") {
      return { relation: result?.relation ?? "conflict_hold" };
    }
    return { relation: result.relation, targetObjectId: result.targetObjectId };
  }

  async adjudicateBatch(input: {
    requests: CollisionAdjudicationRequest[];
    modelId: string;
    contractVersion?: string;
  }): Promise<CollisionAdjudicationBatchDecision[]> {
    const decisions = await this.base.adjudicateBatch(input);
    for (const request of input.requests) {
      this.traceSink({
        sourcePath: "unknown",
        sourceWindowId: request.sourceWindowId ?? "unknown",
        candidateId: request.candidateId,
        requestCount: input.requests.length,
        candidateCount: request.candidates.length,
        decisions: decisions.filter((decision) => decision.candidateId === request.candidateId),
      });
    }
    return decisions;
  }

  async adjudicateBoundedCandidateBatch(input: {
    requests: Array<{
      candidateId: string;
      sourceKind: string;
      sourceWindowId?: string;
      sourcePath?: string;
      object: ModelMemoryObject;
      candidates: Array<{
        adjudicationCandidateId: string;
        id: string;
        identityKey: string;
        canonicalClass: string;
        kind: string;
        payload: Record<string, unknown>;
        scope?: Record<string, unknown>;
        normalizedSearchText: string;
        lifecycleState: string;
        slotKey?: string;
        candidateSource: "retained_structural" | "raw_text_fallback";
        similarityScore: number;
        scopeKey?: string;
        sameCanonicalClass: boolean;
        sameKind: boolean;
        sameScope: boolean;
        sourcePath?: string;
      }>;
    }>;
    modelId: string;
    contractVersion?: string;
  }): Promise<BoundedCandidateAdjudicationBatchDecision[]> {
    if (!this.base.adjudicateBoundedCandidateBatch) {
      return [];
    }
    return this.base.adjudicateBoundedCandidateBatch(input);
  }

  async adjudicateZeroCandidateRecoveryBatch(input: {
    requests: Array<{
      candidateId: string;
      sourceKind: string;
      sourceWindowId?: string;
      sourcePath?: string;
      object: ModelMemoryObject;
      candidates: Array<{
        adjudicationCandidateId: string;
        id: string;
        identityKey: string;
        canonicalClass: string;
        kind: string;
        payload: Record<string, unknown>;
        scope?: Record<string, unknown>;
        normalizedSearchText: string;
        lifecycleState: string;
        slotKey?: string;
        candidateSource: "retained_structural" | "raw_text_fallback";
        similarityScore: number;
        scopeKey?: string;
        sameCanonicalClass: boolean;
        sameKind: boolean;
        sameScope: boolean;
        sourcePath?: string;
      }>;
    }>;
    modelId: string;
    contractVersion?: string;
  }): Promise<BoundedCandidateAdjudicationBatchDecision[]> {
    if (!this.base.adjudicateZeroCandidateRecoveryBatch) {
      return [];
    }
    return this.base.adjudicateZeroCandidateRecoveryBatch(input);
  }
}

function getMemoryProjection(input: {
  projectionTargets: WorkspaceProjectionTargetRecord[];
  projectionVersions: WorkspaceProjectionVersionRecord[];
  projectionOutputs: Record<string, string>;
}) {
  const outputs = buildHarnessProjectionOutputs(input);
  const memoryProjection =
    outputs.find((entry) => path.basename(entry.relativePath).toLowerCase() === "memory.md") ??
    outputs.find((entry) => entry.relativePath.toLowerCase().includes("memory.md"));
  const content = memoryProjection?.content ?? "";
  return {
    relativePath: memoryProjection?.relativePath,
    changed: Boolean(memoryProjection && content.trim().length > 0),
    lineCount: content ? countLines(content) : 0,
    bulletCount: content.split("\n").filter((line) => line.trim().startsWith("- ")).length,
    contentExcerpt: excerpt(content),
  };
}

async function runVariant(input: {
  repoRoot: string;
  config: OpenClawConfig;
  databaseMode: "full_corpus_proof_db" | "targeted_trace_scratch_db";
  corpus: CorpusDocument[];
  variant: VariantDefinition;
  modelId: string;
  candidateModelId: string;
  requestTimeoutMs: number;
  requestSeed?: number;
  maxWordsPerWindow: number;
}): Promise<VariantResult> {
  process.stderr.write(
    `[rule-vs-fact-benchmark] variant=${input.variant.id} dbMode=${input.databaseMode} corpus=${input.corpus.length}\n`,
  );
  const runtime = await createModelMemoryDatabaseRuntime({
    config: input.config,
    databaseMode: input.databaseMode,
  });
  try {
    await resetModelMemoryEvidenceDatabase(runtime);
    const executor = new OpenAICompatibleLiveJsonExecutor({
      config: input.config,
      requestTimeoutMs: input.requestTimeoutMs,
      requestSeed: input.requestSeed,
    });

    const docResults: DocumentVariantResult[] = [];

    for (const corpusDoc of input.corpus) {
      process.stderr.write(
        `[rule-vs-fact-benchmark] variant=${input.variant.id} source=${corpusDoc.relativePath}\n`,
      );
      const absolutePath = path.join(input.repoRoot, corpusDoc.relativePath);
      const text = await readFile(absolutePath, "utf8");
      const stageTraces: StageTrace[] = [];
      const collisionTraces: CollisionTrace[] = [];
      const collisionGates: CollisionGateTrace[] = [];
      const boundedAdjudications: BoundedAdjudicationTrace[] = [];
      const sourcePathByWindowId = new Map<string, string>();

      const tracingInterpreter = new VariantTracingInterpreter(
        (context) =>
          new VariantExecutor(executor, input.variant, (trace) => stageTraces.push(trace), context),
        input.variant,
        (trace) => stageTraces.push(trace),
        (sourceWindowId) => sourcePathByWindowId.get(sourceWindowId) ?? corpusDoc.relativePath,
      );

      const baseCollisionAdjudicator = new ExecutorBackedSemanticCollisionAdjudicator(
        new VariantExecutor(executor, input.variant, (trace) => stageTraces.push(trace), {
          sourcePath: corpusDoc.relativePath,
          sourceWindowId: "collision-adjudication",
          windowIndex: -1,
        }),
      );
      const tracingCollisionAdjudicator = new VariantTracingCollisionAdjudicator(
        baseCollisionAdjudicator,
        (trace) => collisionTraces.push({ ...trace, sourcePath: corpusDoc.relativePath }),
      );

      const storeObserver: DatabaseMemoryObjectStoreObserver = {
        onCollisionGate(event) {
          collisionGates.push({
            sourcePath: corpusDoc.relativePath,
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
        onBoundedCandidateAdjudication(event) {
          boundedAdjudications.push({
            sourcePath: corpusDoc.relativePath,
            sourceWindowId: event.sourceWindowId,
            candidateId: event.candidateId,
            canonicalClass: event.canonicalClass,
            kind: event.kind,
            candidateSource: event.candidateSource,
            adjudicationCandidateCount: event.adjudicationCandidateCount,
            adjudicationBatchAdmitted: event.adjudicationBatchAdmitted,
            finalLocalRouting: event.finalLocalRouting,
            modelOutput: event.modelOutput,
          });
        },
      };

      const memoryStore = new DatabaseMemoryObjectStore(
        runtime.canonicalRepository,
        tracingCollisionAdjudicator,
        undefined,
        storeObserver,
      );

      const preObjects = await runtime.canonicalRepository.listMemoryObjects();
      const preActiveByKind = countBy(
        preObjects
          .filter((record) => record.lifecycleState === "active")
          .map((record) => record.kind),
      );
      const preActiveByClass = countBy(
        preObjects
          .filter((record) => record.lifecycleState === "active")
          .map((record) => record.canonicalClass),
      );

      const ingestion = await ingestDocument({
        document: {
          externalSourceId: corpusDoc.relativePath,
          text,
          sourceKind: "document",
          sourceMetadata: {
            relativePath: corpusDoc.relativePath,
            benchmarkCorpusId: corpusDoc.id,
            benchmarkVariant: input.variant.id,
          },
          maxWordsPerWindow: input.maxWordsPerWindow,
        },
        modelId: input.modelId,
        candidateModelId: input.candidateModelId,
        interpreter: tracingInterpreter,
      });

      for (const window of ingestion.windows) {
        sourcePathByWindowId.set(window.id, corpusDoc.relativePath);
      }

      await runtime.canonicalRepository.persistSource(ingestion.source);
      await runtime.canonicalRepository.persistSourceWindows(ingestion.windows);
      const writeResults = await memoryStore.writeCapturedObjects(
        ingestion.capturedObjects.map((entry): CapturedMemoryObject => entry),
      );
      const rebuild = await rebuildDerivedRuntimeState({
        canonicalRepository: runtime.canonicalRepository,
        runtimeRepository: runtime.runtimeRepository,
      });

      const postObjects = rebuild.memoryObjects;
      const postActiveByKind = countBy(
        postObjects
          .filter((record) => record.lifecycleState === "active")
          .map((record) => record.kind),
      );
      const postActiveByClass = countBy(
        postObjects
          .filter((record) => record.lifecycleState === "active")
          .map((record) => record.canonicalClass),
      );
      const finalActiveObjectDeltaByKind: Record<string, number> = {};
      for (const key of new Set([
        ...Object.keys(preActiveByKind),
        ...Object.keys(postActiveByKind),
      ])) {
        finalActiveObjectDeltaByKind[key] =
          (postActiveByKind[key] ?? 0) - (preActiveByKind[key] ?? 0);
      }
      const finalActiveObjectDeltaByCanonicalClass: Record<string, number> = {};
      for (const key of new Set([
        ...Object.keys(preActiveByClass),
        ...Object.keys(postActiveByClass),
      ])) {
        finalActiveObjectDeltaByCanonicalClass[key] =
          (postActiveByClass[key] ?? 0) - (preActiveByClass[key] ?? 0);
      }

      const validationRejectReasons = ingestion.windowResults.flatMap((windowResult) =>
        windowResult.action === "reject" ? windowResult.errors.map((error) => error.message) : [],
      );
      const repairInvocations = countBy(
        stageTraces
          .map((trace) => trace.stage)
          .filter((stage) => stage === "pass_1_repair" || stage === "pass_2_repair"),
      );
      const candidateCountByType = stageTraces
        .filter((trace) => trace.stage === "pass_1_candidate" || trace.stage === "pass_1_repair")
        .reduce<Record<string, number>>(
          (counts, trace) => mergeCounts(counts, trace.candidateTypeCounts ?? {}),
          {},
        );
      const canonicalizedCountByKind = countBy(
        ingestion.capturedObjects.map((entry) => entry.object.kind),
      );
      const canonicalizedCountByCanonicalClass = countBy(
        ingestion.capturedObjects.map((entry) => entry.object.canonicalClass),
      );
      const adjudicationOutcomeCounts = countBy([
        ...collisionTraces.flatMap((trace) =>
          (trace.decisions ?? []).map((decision) => decision.relation),
        ),
        ...boundedAdjudications.map((trace) => trace.finalLocalRouting),
      ]);
      const writeDecisionCounts = countBy(writeResults.map((result) => result.decision));
      const collisionGateTotals = collisionGates.reduce(
        (totals, trace) => ({
          rawCandidateCount: totals.rawCandidateCount + trace.rawCandidateCount,
          retainedCandidateCount: totals.retainedCandidateCount + trace.retainedCandidateCount,
          prunedCandidateCount: totals.prunedCandidateCount + trace.prunedCandidateCount,
        }),
        { rawCandidateCount: 0, retainedCandidateCount: 0, prunedCandidateCount: 0 },
      );

      docResults.push({
        sourcePath: corpusDoc.relativePath,
        rationale: corpusDoc.rationale,
        semanticMix: corpusDoc.semanticMix,
        expectedDominantKinds: corpusDoc.expectedDominantKinds,
        mustCaptureClaims: corpusDoc.mustCaptureClaims,
        lineCount: countLines(text),
        windowCount: ingestion.windows.length,
        candidateCountByType,
        canonicalizedCountByKind,
        canonicalizedCountByCanonicalClass,
        validationRejectCount: validationRejectReasons.length,
        validationRejectReasons,
        repairInvocations,
        writeDecisionCounts,
        adjudicationOutcomeCounts,
        collisionGateTotals,
        boundedAdjudicationRoutes: countBy(
          boundedAdjudications.map((trace) => trace.finalLocalRouting),
        ),
        finalActiveObjectDeltaByKind,
        finalActiveObjectDeltaByCanonicalClass,
        memoryProjection: getMemoryProjection({
          projectionTargets: rebuild.projectionTargets,
          projectionVersions: rebuild.projectionVersions,
          projectionOutputs: rebuild.projectionOutputs,
        }),
        acceptedObjects: ingestion.capturedObjects.map((entry) => ({
          sourceWindowId: entry.sourceWindowId,
          kind: entry.object.kind,
          canonicalClass: entry.object.canonicalClass,
          payload: entry.object.payload as Record<string, unknown>,
        })),
        stageTraces,
        collisionTraces,
        collisionGates,
        boundedAdjudications,
        writeDecisions: writeResults.map((result) => ({
          decision: result.decision,
          decisionCodes: result.writeEvent.decisionCodes,
          memoryObjectId: result.memoryObject?.id ?? result.writeEvent.memoryObjectId ?? undefined,
          lifecycleState: result.memoryObject?.lifecycleState,
        })),
      });
    }

    return {
      variantId: input.variant.id,
      hypothesis: input.variant.hypothesis,
      simplificationTested: input.variant.simplificationTested,
      filesChanged: input.variant.filesChanged,
      intentionallyNotChanged: input.variant.intentionallyNotChanged,
      modelId: input.modelId,
      candidateModelId: input.candidateModelId,
      requestSeed: input.requestSeed,
      requestTimeoutMs: input.requestTimeoutMs,
      maxWordsPerWindow: input.maxWordsPerWindow,
      documents: docResults,
      totals: {
        windowCount: docResults.reduce((total, doc) => total + doc.windowCount, 0),
        candidateCountByType: docResults.reduce<Record<string, number>>(
          (counts, doc) => mergeCounts(counts, doc.candidateCountByType),
          {},
        ),
        canonicalizedCountByKind: docResults.reduce<Record<string, number>>(
          (counts, doc) => mergeCounts(counts, doc.canonicalizedCountByKind),
          {},
        ),
        canonicalizedCountByCanonicalClass: docResults.reduce<Record<string, number>>(
          (counts, doc) => mergeCounts(counts, doc.canonicalizedCountByCanonicalClass),
          {},
        ),
        validationRejectCount: docResults.reduce(
          (total, doc) => total + doc.validationRejectCount,
          0,
        ),
        writeDecisionCounts: docResults.reduce<Record<string, number>>(
          (counts, doc) => mergeCounts(counts, doc.writeDecisionCounts),
          {},
        ),
        adjudicationOutcomeCounts: docResults.reduce<Record<string, number>>(
          (counts, doc) => mergeCounts(counts, doc.adjudicationOutcomeCounts),
          {},
        ),
        finalActiveObjectCountByKind: docResults.reduce<Record<string, number>>(
          (counts, doc) => mergeCounts(counts, doc.finalActiveObjectDeltaByKind),
          {},
        ),
      },
    };
  } finally {
    await runtime.pool.end();
  }
}

function toMarkdown(report: BenchmarkReport): string {
  const lines: string[] = [
    "---",
    'summary: "Stage-by-stage benchmark results for rule-vs-fact document-ingest variants."',
    'title: "Rule Vs Fact Benchmark Results"',
    "---",
    "",
    "# Rule Vs Fact Benchmark Results",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    `Model: \`${report.modelId}\``,
    `Candidate model: \`${report.candidateModelId}\``,
    `Request seed: \`${report.requestSeed ?? "none"}\``,
    `Request timeout: \`${report.requestTimeoutMs}\` ms`,
    `Max words per window: \`${report.maxWordsPerWindow}\``,
    "",
    "## Corpus",
    "",
  ];

  for (const doc of report.corpus) {
    lines.push(`- \`${doc.relativePath}\``);
    lines.push(`  - why: ${doc.rationale}`);
    lines.push(`  - semantic mix: ${doc.semanticMix}`);
    lines.push(`  - expected dominant kinds: ${doc.expectedDominantKinds.join(", ")}`);
    lines.push(`  - must capture: ${doc.mustCaptureClaims.join(" | ")}`);
  }

  for (const variant of report.variants) {
    lines.push("", `## ${variant.variantId}`, "");
    lines.push(`- hypothesis: ${variant.hypothesis}`);
    lines.push(`- simplification tested: ${variant.simplificationTested}`);
    lines.push(`- total windows: ${variant.totals.windowCount}`);
    lines.push(
      `- candidate counts by type: ${JSON.stringify(variant.totals.candidateCountByType)}`,
    );
    lines.push(
      `- canonicalized counts by kind: ${JSON.stringify(variant.totals.canonicalizedCountByKind)}`,
    );
    lines.push(`- validation rejects: ${variant.totals.validationRejectCount}`);
    lines.push(`- write decisions: ${JSON.stringify(variant.totals.writeDecisionCounts)}`);
    lines.push(
      `- adjudication outcomes: ${JSON.stringify(variant.totals.adjudicationOutcomeCounts)}`,
    );
    lines.push("");
    lines.push(
      "| document | windows | pass1 candidates | accepted kinds | accepted classes | rejects | writes | active delta | memory projection |",
    );
    lines.push("| --- | ---: | --- | --- | --- | ---: | --- | --- | --- |");
    for (const doc of variant.documents) {
      lines.push(
        `| \`${doc.sourcePath}\` | ${doc.windowCount} | \`${JSON.stringify(doc.candidateCountByType)}\` | \`${JSON.stringify(doc.canonicalizedCountByKind)}\` | \`${JSON.stringify(doc.canonicalizedCountByCanonicalClass)}\` | ${doc.validationRejectCount} | \`${JSON.stringify(doc.writeDecisionCounts)}\` | \`${JSON.stringify(doc.finalActiveObjectDeltaByKind)}\` | \`${doc.memoryProjection.relativePath ?? "none"} (${doc.memoryProjection.bulletCount} bullets)\` |`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const args = parseArgs(process.argv.slice(2));
  const config = await loadSanitizedModelMemoryRunnerConfig({
    purpose: "rule-vs-fact benchmark",
  });
  const databaseMode = resolveModelMemoryRunnerDatabaseMode({
    defaultMode: "targeted_trace_scratch_db",
  });
  process.env.OPENCLAW_CONFIG_PATH = await writeSanitizedModelMemoryRunnerConfig({
    config,
    tempPrefix: "openclaw-model-memory-rule-vs-fact-",
  });
  const selectedCorpus = typeof args.limit === "number" ? CORPUS.slice(0, args.limit) : CORPUS;
  const selectedVariants = VARIANTS.filter((variant) => args.variants.includes(variant.id));

  const report: BenchmarkReport = {
    generatedAt: new Date().toISOString(),
    repoRoot,
    modelId: args.modelId,
    candidateModelId: args.candidateModelId,
    requestSeed: args.requestSeed,
    requestTimeoutMs: args.requestTimeoutMs,
    maxWordsPerWindow: args.maxWordsPerWindow,
    corpus: selectedCorpus,
    variants: [],
  };

  for (const variant of selectedVariants) {
    process.stderr.write(`[rule-vs-fact-benchmark] start=${variant.id}\n`);
    report.variants.push(
      await runVariant({
        repoRoot,
        config,
        databaseMode,
        corpus: selectedCorpus,
        variant,
        modelId: args.modelId,
        candidateModelId: args.candidateModelId,
        requestTimeoutMs: args.requestTimeoutMs,
        requestSeed: args.requestSeed,
        maxWordsPerWindow: args.maxWordsPerWindow,
      }),
    );
  }

  const outputDir = path.join(repoRoot, args.outputDir);
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "benchmark-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(path.join(outputDir, "benchmark-report.md"), toMarkdown(report));

  console.log(
    JSON.stringify(
      {
        outputDir: path.relative(repoRoot, outputDir),
        variants: report.variants.map((variant) => variant.variantId),
        corpusCount: report.corpus.length,
      },
      null,
      2,
    ),
  );
}

await main();
