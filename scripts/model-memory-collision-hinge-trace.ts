import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DatabaseMemoryObjectStore,
  type DatabaseMemoryObjectStoreObserver,
  ExecutorBackedSemanticCollisionAdjudicator,
  ExecutorBackedSemanticInterpreter,
  ingestDocumentLive,
  type CollisionAdjudicationBatchDecision,
  type CollisionCandidate,
  type ModelMemoryObject,
  type SemanticCollisionAdjudicator,
} from "../extensions/model-memory/runtime-api.js";
import {
  assessStructuralSameClaimDelta,
  describeClaimFieldComparison,
  deriveMemoryIdentity,
} from "../extensions/model-memory/src/semantic-identity.js";
import {
  buildModelMemoryCaseIdentity,
  extractPrimaryHeadingPath,
} from "../src/agents/model-memory.case-identity.js";
import { createModelMemoryDatabaseRuntime } from "../src/agents/model-memory.database.js";
import { resetModelMemoryEvidenceDatabase } from "../src/agents/model-memory.large-document-evidence.js";
import { OpenAICompatibleLiveJsonExecutor } from "../src/agents/model-memory.live-json-executor.js";
import { summarizeModelMemoryPayload } from "../src/agents/model-memory.payload-summary.js";
import {
  loadSanitizedModelMemoryRunnerConfig,
  resolveModelMemoryRunnerDatabaseMode,
  writeSanitizedModelMemoryRunnerConfig,
} from "../src/agents/model-memory.run-config.js";

const DEFAULT_MODEL_REF =
  process.env.MODEL_MEMORY_EVIDENCE_MODEL?.trim() || "openrouter/openai/gpt-5.4-nano";
const DEFAULT_CANDIDATE_MODEL_REF =
  process.env.MODEL_MEMORY_CANDIDATE_MODEL?.trim() || "openrouter/openai/gpt-5.4-nano";
const DEFAULT_REQUEST_TIMEOUT_MS =
  Number.parseInt(process.env.MODEL_MEMORY_REQUEST_TIMEOUT_MS?.trim() ?? "", 10) || 180_000;
const DEFAULT_REQUEST_SEED =
  Number.parseInt(process.env.MODEL_MEMORY_REQUEST_SEED?.trim() ?? "", 10) || 7;
const DEFAULT_MAX_WORDS_PER_WINDOW =
  Number.parseInt(process.env.MODEL_MEMORY_EVIDENCE_MAX_WORDS_PER_WINDOW?.trim() ?? "", 10) || 1500;

const SOURCE_PATHS = (
  process.env.MODEL_MEMORY_COLLISION_TRACE_SOURCES?.trim() ||
  "AGENTS.md,docs/help/testing.md,docs/gateway/configuration.md"
)
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

type CollisionGateTrace = {
  candidateId: string;
  caseIdentity: string;
  objectSummary: string;
  sourceWindowId: string;
  canonicalClass: string;
  kind: string;
  rawCandidateCount: number;
  retainedCandidateCount: number;
  prunedCandidateCount: number;
  disposition: "zero_candidate_skip" | "admitted_to_batch";
};

type CollisionBatchTrace = {
  candidateId: string;
  caseIdentity: string;
  sourceWindowId?: string;
  objectSummary: string;
  candidates: Array<{
    id: string;
    identityKey: string;
    lifecycleState?: string;
    slotKey?: string;
    normalizedSearchText: string;
    payloadSummary: string;
    coreClaimMatch: boolean;
    coreClaimSummary: string;
    blockingCoreClaimFields: string[];
    blockingPackagingFields: string[];
    deltaClass: string;
    packagingDriftType?: string;
    sameClaimLeaning: boolean;
  }>;
  decision?: CollisionAdjudicationBatchDecision;
};

type BoundedCandidateAdjudicationTrace = {
  candidateId: string;
  caseIdentity: string;
  sourceWindowId: string;
  objectSummary: string;
  candidateSource: string;
  queryText: string;
  adjudicationCandidateCount: number;
  adjudicationBatchAdmitted: boolean;
  finalLocalRouting: string;
  modelOutput?: {
    sameCoreMemory: string;
    matchedCandidateId: string;
    deltaType: string;
  };
  rawSearchResults: Array<{
    memoryObjectId: string;
    similarityScore: number;
    searchRank: number;
    canonicalClass: string;
    kind: string;
    scopeKey?: string;
    sourcePath?: string;
    sameCanonicalClass: boolean;
    sameKind: boolean;
    sameScope: boolean;
    eligibleForMergeConsideration: boolean;
    selectedForAdjudication: boolean;
  }>;
};

type HingePassTrace = {
  passLabel: "baseline" | "rerun_1" | "rerun_2";
  objectDelta: number;
  supportDelta: number;
  capturedClaimCount: number;
  writeDecisionCounts: Record<string, number>;
  collisionModelCalls: number;
  collisionGate: CollisionGateTrace[];
  collisionBatch: CollisionBatchTrace[];
  boundedCandidateAdjudication: BoundedCandidateAdjudicationTrace[];
  writeResults: Array<{
    candidateId: string;
    caseIdentity: string;
    sourceWindowId?: string;
    decision: string;
    decisionCodes: string[];
    memoryObjectId?: string;
    supportItemId?: string;
    objectSummary: string;
  }>;
};

type HingeTraceArtifact = {
  generatedAt: string;
  databaseMode: string;
  databaseName: string;
  sourcePath: string;
  modelRef: string;
  candidateModelRef: string;
  requestSeed: number;
  requestTimeoutMs: number;
  maxWordsPerWindow: number;
  passes: HingePassTrace[];
  diagnosis: {
    totalDistinctWrites: number;
    totalAttachSupports: number;
    totalConflictHoldWrites: number;
    zeroCandidateSkips: number;
    admittedToBatch: number;
    likelyHinge:
      | "deterministic_gate_too_strict"
      | "batch_adjudication_too_conservative"
      | "mixed_gate_and_adjudication_problem";
  };
};

function toArtifactSlug(sourcePath: string): string {
  return sourcePath
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function summarizeObject(object: ModelMemoryObject): string {
  return summarizeModelMemoryPayload(object);
}

function summarizeCandidate(candidate: CollisionCandidate): string {
  return summarizeModelMemoryPayload(candidate);
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function renderMarkdown(artifact: HingeTraceArtifact): string {
  const lines: string[] = [];
  lines.push("# Model Memory Collision Hinge Trace");
  lines.push("");
  lines.push(`- Source: ${artifact.sourcePath}`);
  lines.push(`- DB mode: ${artifact.databaseMode}`);
  lines.push(`- Database: ${artifact.databaseName}`);
  lines.push(`- Pass 1 model: ${artifact.candidateModelRef}`);
  lines.push(`- Pass 2 model: ${artifact.modelRef}`);
  lines.push(`- Request seed: ${artifact.requestSeed}`);
  lines.push(`- Request timeout ms: ${artifact.requestTimeoutMs}`);
  lines.push(`- Max words per window: ${artifact.maxWordsPerWindow}`);
  lines.push(`- Likely hinge: ${artifact.diagnosis.likelyHinge}`);
  lines.push(
    `- Totals: distinct=${artifact.diagnosis.totalDistinctWrites} attach_support=${artifact.diagnosis.totalAttachSupports} conflict_hold=${artifact.diagnosis.totalConflictHoldWrites} zero_candidate_skips=${artifact.diagnosis.zeroCandidateSkips} admitted_to_batch=${artifact.diagnosis.admittedToBatch}`,
  );
  lines.push("");

  for (const pass of artifact.passes) {
    lines.push(`## ${pass.passLabel}`);
    lines.push("");
    lines.push(`- Object delta: ${pass.objectDelta}`);
    lines.push(`- Support delta: ${pass.supportDelta}`);
    lines.push(`- Captured claims: ${pass.capturedClaimCount}`);
    lines.push(`- Collision model calls: ${pass.collisionModelCalls}`);
    lines.push(
      `- Bounded candidate adjudication cases: ${pass.boundedCandidateAdjudication.length}`,
    );
    lines.push(`- Write decisions: ${JSON.stringify(pass.writeDecisionCounts)}`);
    lines.push("");
    lines.push("| Candidate | Window | Gate | Raw | Kept | Pruned | Decision | Codes | Object |");
    lines.push("| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |");
    for (const gate of pass.collisionGate) {
      const batch = pass.collisionBatch.find((entry) => entry.candidateId === gate.candidateId);
      const write = pass.writeResults.find((entry) => entry.candidateId === gate.candidateId);
      lines.push(
        `| ${gate.candidateId} | ${gate.sourceWindowId} | ${gate.disposition} | ${gate.rawCandidateCount} | ${gate.retainedCandidateCount} | ${gate.prunedCandidateCount} | ${batch?.decision?.relation ?? write?.decision ?? "n/a"} | ${(write?.decisionCodes ?? []).join(", ")} | ${(write?.objectSummary ?? batch?.objectSummary ?? "").replace(/\|/g, "\\|")} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function runTraceForSource(input: { repoRoot: string; sourcePath: string }) {
  const config = await loadSanitizedModelMemoryRunnerConfig({
    purpose: `collision hinge trace for ${input.sourcePath}`,
  });
  const databaseMode = resolveModelMemoryRunnerDatabaseMode({
    defaultMode: "targeted_trace_scratch_db",
  });
  process.env.OPENCLAW_CONFIG_PATH = await writeSanitizedModelMemoryRunnerConfig({
    config,
    tempPrefix: "openclaw-model-memory-collision-hinge-",
  });
  const runtime = await createModelMemoryDatabaseRuntime({
    config,
    databaseMode,
  });

  try {
    await resetModelMemoryEvidenceDatabase(runtime);
    const text = await readFile(path.join(input.repoRoot, input.sourcePath), "utf8");
    const executor = new OpenAICompatibleLiveJsonExecutor({
      config,
      requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
      requestSeed: DEFAULT_REQUEST_SEED,
    });
    const interpreter = new ExecutorBackedSemanticInterpreter(executor);
    const baseAdjudicator = new ExecutorBackedSemanticCollisionAdjudicator(executor);

    const runPass = async (
      passLabel: HingePassTrace["passLabel"],
      traced: boolean,
    ): Promise<HingePassTrace> => {
      const before = await runtime.canonicalRepository.snapshot();
      const collisionGate: CollisionGateTrace[] = [];
      const collisionBatch: CollisionBatchTrace[] = [];
      const boundedCandidateAdjudication: BoundedCandidateAdjudicationTrace[] = [];
      let collisionModelCalls = 0;

      const collisionAdjudicator: SemanticCollisionAdjudicator = traced
        ? {
            async adjudicateBatch(batchInput) {
              collisionModelCalls += 1;
              collisionBatch.push(
                ...batchInput.requests.map((request) => ({
                  candidateId: request.candidateId,
                  caseIdentity: buildModelMemoryCaseIdentity({
                    sourcePath: input.sourcePath,
                    headingPath: extractPrimaryHeadingPath(request.object.provenance),
                    identityKey: deriveMemoryIdentity(request.object).identityKey,
                  }),
                  sourceWindowId: request.sourceWindowId,
                  objectSummary: summarizeObject(request.object),
                  candidates: request.candidates.map((candidate) => ({
                    id: candidate.id,
                    identityKey: candidate.identityKey,
                    lifecycleState: candidate.lifecycleState,
                    slotKey: candidate.slotKey,
                    normalizedSearchText: candidate.normalizedSearchText,
                    payloadSummary: summarizeCandidate(candidate),
                    coreClaimMatch: describeClaimFieldComparison(request.object, candidate)
                      .coreClaimMatch,
                    coreClaimSummary: describeClaimFieldComparison(request.object, candidate)
                      .coreClaimSummary,
                    blockingCoreClaimFields: describeClaimFieldComparison(request.object, candidate)
                      .blockingCoreClaimFields,
                    blockingPackagingFields: describeClaimFieldComparison(request.object, candidate)
                      .blockingPackagingFields,
                    deltaClass: assessStructuralSameClaimDelta(request.object, candidate)
                      .deltaClass,
                    packagingDriftType: assessStructuralSameClaimDelta(request.object, candidate)
                      .packagingDriftType,
                    sameClaimLeaning: assessStructuralSameClaimDelta(request.object, candidate)
                      .sameClaimLeaning,
                  })),
                })),
              );
              const decisions = await baseAdjudicator.adjudicateBatch(batchInput);
              for (const decision of decisions) {
                const trace = collisionBatch.find(
                  (entry) => entry.candidateId === decision.candidateId,
                );
                if (trace) {
                  trace.decision = decision;
                }
              }
              return decisions;
            },
            async adjudicate(singleInput) {
              const [decision] = await this.adjudicateBatch({
                requests: [
                  {
                    candidateId: "single",
                    sourceKind: singleInput.sourceKind,
                    sourceWindowId: undefined,
                    object: singleInput.object,
                    candidates: singleInput.candidates,
                  },
                ],
                modelId: singleInput.modelId,
                contractVersion: singleInput.contractVersion,
              });
              if (
                !decision ||
                decision.relation === "distinct" ||
                decision.relation === "conflict_hold"
              ) {
                return { relation: decision?.relation ?? "conflict_hold" };
              }
              return {
                relation: decision.relation,
                targetObjectId: decision.targetObjectId,
              };
            },
            async adjudicateBoundedCandidateBatch(batchInput) {
              collisionModelCalls += 1;
              const decisions = await baseAdjudicator.adjudicateBoundedCandidateBatch?.(batchInput);
              return decisions ?? [];
            },
          }
        : baseAdjudicator;

      const observer: DatabaseMemoryObjectStoreObserver | undefined = traced
        ? {
            onCollisionGate(event) {
              collisionGate.push({ ...event });
            },
            onBoundedCandidateAdjudication(event) {
              boundedCandidateAdjudication.push({
                candidateId: event.candidateId,
                caseIdentity: event.caseIdentity,
                sourceWindowId: event.sourceWindowId,
                objectSummary: event.objectSummary,
                candidateSource: event.candidateSource,
                queryText: event.queryText,
                adjudicationCandidateCount: event.adjudicationCandidateCount,
                adjudicationBatchAdmitted: event.adjudicationBatchAdmitted,
                finalLocalRouting: event.finalLocalRouting,
                modelOutput: event.modelOutput
                  ? {
                      sameCoreMemory: event.modelOutput.sameCoreMemory,
                      matchedCandidateId: event.modelOutput.matchedCandidateId,
                      deltaType: event.modelOutput.deltaType,
                    }
                  : undefined,
                rawSearchResults: event.rawSearchResults,
              });
            },
          }
        : undefined;

      const memoryStore = new DatabaseMemoryObjectStore(
        runtime.canonicalRepository,
        collisionAdjudicator,
        undefined,
        observer,
      );

      const result = await ingestDocumentLive({
        canonicalRepository: runtime.canonicalRepository,
        runtimeRepository: runtime.runtimeRepository,
        memoryStore,
        collisionAdjudicator,
        rebuildRuntime: false,
        ingestion: {
          document: {
            externalSourceId: input.sourcePath,
            text,
            maxWordsPerWindow: DEFAULT_MAX_WORDS_PER_WINDOW,
            sourceMetadata: {
              relativePath: input.sourcePath,
            },
          },
          modelId: DEFAULT_MODEL_REF,
          candidateModelId: DEFAULT_CANDIDATE_MODEL_REF,
          interpreter,
        },
      });

      const after = await runtime.canonicalRepository.snapshot();
      const writeResults = result.writeResults.map((entry, index) => ({
        caseIdentity: buildModelMemoryCaseIdentity({
          sourcePath: input.sourcePath,
          headingPath: extractPrimaryHeadingPath(result.capturedObjects[index].object.provenance),
          identityKey: deriveMemoryIdentity(result.capturedObjects[index].object).identityKey,
        }),
        candidateId: `candidate-${index}`,
        sourceWindowId: entry.writeEvent.sourceWindowId,
        decision: entry.decision,
        decisionCodes: entry.writeEvent.decisionCodes,
        memoryObjectId: entry.memoryObject?.id ?? entry.writeEvent.memoryObjectId,
        supportItemId: entry.supportItem?.id ?? entry.writeEvent.supportItemId,
        objectSummary: summarizeObject(result.capturedObjects[index].object),
      }));

      const stableCaseIdentityByCandidateId = new Map(
        writeResults.map((entry) => [entry.candidateId, entry.caseIdentity] as const),
      );
      for (const entry of collisionBatch) {
        stableCaseIdentityByCandidateId.set(entry.candidateId, entry.caseIdentity);
      }
      for (const entry of boundedCandidateAdjudication) {
        stableCaseIdentityByCandidateId.set(entry.candidateId, entry.caseIdentity);
      }

      return {
        passLabel,
        objectDelta: after.memoryObjects.length - before.memoryObjects.length,
        supportDelta: after.supportItems.length - before.supportItems.length,
        capturedClaimCount: result.capturedObjects.length,
        writeDecisionCounts: countBy(result.writeResults.map((entry) => entry.decision)),
        collisionModelCalls,
        collisionGate: collisionGate.map((entry) => ({
          ...entry,
          caseIdentity:
            stableCaseIdentityByCandidateId.get(entry.candidateId) ?? entry.caseIdentity,
        })),
        collisionBatch,
        boundedCandidateAdjudication: boundedCandidateAdjudication.map((entry) => ({
          ...entry,
          caseIdentity:
            stableCaseIdentityByCandidateId.get(entry.candidateId) ?? entry.caseIdentity,
        })),
        writeResults,
      };
    };

    const baseline = await runPass("baseline", false);
    const rerun1 = await runPass("rerun_1", true);
    const rerun2 = await runPass("rerun_2", true);

    const passes = [baseline, rerun1, rerun2];
    const totalDistinctWrites = passes
      .flatMap((pass) => pass.writeResults)
      .filter(
        (entry) => entry.decision === "write" && entry.decisionCodes.includes("collision_distinct"),
      ).length;
    const totalAttachSupports = passes
      .flatMap((pass) => pass.writeResults)
      .filter((entry) => entry.decision === "attach_support").length;
    const totalConflictHoldWrites = passes
      .flatMap((pass) => pass.writeResults)
      .filter(
        (entry) =>
          entry.decision === "write" && entry.decisionCodes.includes("collision_conflict_hold"),
      ).length;
    const zeroCandidateSkips = passes
      .flatMap((pass) => pass.collisionGate)
      .filter((entry) => entry.disposition === "zero_candidate_skip").length;
    const admittedToBatch = passes
      .flatMap((pass) => pass.collisionGate)
      .filter((entry) => entry.disposition === "admitted_to_batch").length;

    const artifact: HingeTraceArtifact = {
      generatedAt: new Date().toISOString(),
      databaseMode,
      databaseName: runtime.resolution.databaseName,
      sourcePath: input.sourcePath,
      modelRef: DEFAULT_MODEL_REF,
      candidateModelRef: DEFAULT_CANDIDATE_MODEL_REF,
      requestSeed: DEFAULT_REQUEST_SEED,
      requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
      maxWordsPerWindow: DEFAULT_MAX_WORDS_PER_WINDOW,
      passes,
      diagnosis: {
        totalDistinctWrites,
        totalAttachSupports,
        totalConflictHoldWrites,
        zeroCandidateSkips,
        admittedToBatch,
        likelyHinge:
          admittedToBatch > zeroCandidateSkips && totalAttachSupports === 0
            ? "batch_adjudication_too_conservative"
            : zeroCandidateSkips >= admittedToBatch
              ? "deterministic_gate_too_strict"
              : "mixed_gate_and_adjudication_problem",
      },
    };

    const evidenceDir = path.join(input.repoRoot, "docs/projects/model-memory/evidence");
    await mkdir(evidenceDir, { recursive: true });
    const slug = toArtifactSlug(input.sourcePath);
    const jsonPath = path.join(evidenceDir, `${slug}-collision-hinge-trace.json`);
    const markdownPath = path.join(evidenceDir, `${slug}-collision-hinge-trace.md`);
    await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    await writeFile(markdownPath, `${renderMarkdown(artifact)}\n`, "utf8");
    process.stdout.write(`${jsonPath}\n${markdownPath}\n`);
  } finally {
    await runtime.pool.end();
  }
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  for (const sourcePath of SOURCE_PATHS) {
    await runTraceForSource({ repoRoot, sourcePath });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
