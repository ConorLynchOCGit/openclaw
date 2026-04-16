import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { normalizeIdentityText } from "../plugin-sdk/model-memory.js";
import type {
  ModelMemoryObjectRecord,
  ModelMemorySourceRecord,
  ModelMemorySourceWindowRecord,
  ModelMemorySupportItemRecord,
} from "../plugin-sdk/model-memory.js";
import { createModelMemoryDatabaseRuntime } from "./model-memory.database.ts";
import { summarizeModelMemoryPayload } from "./model-memory.payload-summary.ts";

type CollisionGateEvent = {
  sourceWindowId: string;
  candidateId: string;
  caseIdentity: string;
  objectSummary: string;
  canonicalClass: string;
  kind: string;
  rawCandidateCount: number;
  retainedCandidateCount: number;
  prunedCandidateCount: number;
  disposition: "zero_candidate_skip" | "admitted_to_batch";
};

type CollisionWriteResult = {
  caseIdentity: string;
  candidateId: string;
  normalizedSearchText?: string;
  objectSummary: string;
};

type CollisionTracePass = {
  passLabel: string;
  collisionGate?: CollisionGateEvent[];
  writeResults?: CollisionWriteResult[];
};

type CollisionTraceArtifact = {
  sourcePath: string;
  passes: CollisionTracePass[];
};

export type ManualSampleSeed = {
  caseIdentity: string;
  rationale: string;
  acceptableMatchObjectIds: string[];
};

type SearchHitRecord = {
  memoryObjectId: string;
  sourcePath: string;
  kind: string;
  lifecycleState: string;
  identityKey: string;
  similarityScore: number;
  payloadSummary: string;
};

type SampleCaseReport = {
  caseIdentity: string;
  sourcePath: string;
  kind: string;
  passLabel: string;
  queryText: string;
  payloadSummary: string;
  rationale: string;
  acceptableMatchObjectIds: string[];
  acceptableMatchRanks: number[];
  bestAcceptableRank?: number;
  topWrongScore?: number;
  bestAcceptableScore?: number;
  scoreGapVsTopWrong?: number;
  hits: {
    top1: boolean;
    top5: boolean;
    top10: boolean;
    present: boolean;
  };
  topResults: SearchHitRecord[];
};

export type ZeroCandidateTextSearchDiagnosticReport = {
  generatedAt: string;
  databaseMode: "full_corpus_proof_db";
  databaseName: string;
  tracePaths: string[];
  similarityMethod: "normalized_search_text_jaccard";
  sampleSelectionPolicy: "manual_zero_candidate_subset_with_known_legitimate_prior_match";
  caveats: string[];
  sampleSize: number;
  cases: SampleCaseReport[];
  summary: {
    top1HitRate: number;
    top5HitRate: number;
    top10HitRate: number;
    medianBestAcceptableRank?: number;
    scoreGapVsTopWrong: {
      median?: number;
      minimum?: number;
      maximum?: number;
    };
    sourceBreakdown: Record<string, number>;
    kindBreakdown: Record<string, number>;
  };
};

const TRACE_PATHS = [
  "docs/projects/model-memory/evidence/agents-md-collision-hinge-trace.json",
  "docs/projects/model-memory/evidence/docs-help-testing-md-collision-hinge-trace.json",
  "docs/projects/model-memory/evidence/docs-gateway-configuration-md-collision-hinge-trace.json",
] as const;

export const ZERO_CANDIDATE_DIAGNOSTIC_MANUAL_SAMPLE_SEEDS: ManualSampleSeed[] = [
  {
    caseIdentity:
      "AGENTS.md::repository guidelines>agent-specific notes::rule_eabbb6f9bb488fd6e6bab059",
    rationale: "Same git-stash safety rule with wrapper drift and minor phrasing variants.",
    acceptableMatchObjectIds: [
      "f740613e-6c42-5641-b118-19a3a7a5b2cf",
      "39716c81-23a4-554f-b92c-81d1a092ae96",
      "8b5d7b1d-95f0-55c9-9d2c-4545723af9e2",
      "2a55202d-21f9-5d64-8491-a40de6857ac8",
      "c707d4a6-1a53-54a7-98cf-d41d0099707d",
    ],
  },
  {
    caseIdentity: "AGENTS.md::repository guidelines::rule_f67f93a93d02482c2704962b",
    rationale: "Same repo-root-relative chat file-reference instruction.",
    acceptableMatchObjectIds: [
      "f8780804-3a2e-55ba-aaef-366d3dd8efee",
      "38e8f026-5f46-5da5-844c-c97d8e941fe2",
      "28f04856-2992-5fed-a6a7-6969f131aa81",
      "de8384a6-d968-54ff-8d0c-28eeca75cee8",
      "f8a9d7f3-b2e7-543b-be9b-28a05edee096",
    ],
  },
  {
    caseIdentity: "AGENTS.md::repository guidelines::rule_83e2a6cb39432e4e63f350e1",
    rationale: "Same GitHub comment newline footgun with very small wording drift.",
    acceptableMatchObjectIds: [
      "fcab991c-dcd4-5ec8-877c-e1a2bdab5085",
      "7c12dee6-283f-546a-9c02-fd09ad1c21bc",
      "220bb2ff-d4ca-501b-b9c2-242a25ae3be1",
      "fe46b3a8-a367-5d62-87bd-daf7c49cbf5b",
      "8d0abbb3-c745-5aaf-b749-cb81b117e83d",
    ],
  },
  {
    caseIdentity: "AGENTS.md::repository guidelines::rule_43ab90f9752c4c91c241ebfb",
    rationale: "Same gh comment heredoc rule with shell-char wording variants.",
    acceptableMatchObjectIds: [
      "9b224f6a-de22-599d-8547-b5e954b06480",
      "325ee2ee-61b5-5039-bcfb-8a883ee50dd8",
      "098ba11a-a3ff-5396-b0a8-f85288f251ef",
      "a0f4ac61-b957-59b3-b9e6-7c9783dc9f3b",
      "4872b6d9-a9e3-55a3-bebc-9d80c34fa59d",
    ],
  },
  {
    caseIdentity: "AGENTS.md::repository guidelines::rule_2e678dfb95e76f7e7e10631b",
    rationale: "Same GitHub auto-linking rule for issue and PR refs.",
    acceptableMatchObjectIds: [
      "62d8fe25-f2b0-5ad9-9148-da726ceb4b43",
      "ec7d26dc-5aa2-5574-a49c-90e2037bf2c3",
      "bc3ea28d-b76f-50ad-94d4-af79a4316bc7",
      "9d542ccd-9029-56b8-af6d-a1c922d212ce",
      "6309a792-60eb-5094-a562-f9003738b761",
    ],
  },
  {
    caseIdentity: "AGENTS.md::repository guidelines::rule_282aef84b05161eb6568bda9",
    rationale: "Same SECURITY.md-before-triage rule.",
    acceptableMatchObjectIds: [
      "97271931-6cbd-58b2-87a6-680f14d491d0",
      "273ff03b-4847-5720-bc37-ea038a67a0e0",
      "4192b3b6-5337-5f4c-9b90-32653c342c9b",
      "06afd31c-34d2-5a01-b023-63fb9a8f2f93",
      "cb3fe85b-392e-5e94-b9ba-0875774b7f03",
    ],
  },
  {
    caseIdentity:
      "AGENTS.md::repository guidelines>docs linking (mintlify)::rule_dddba40ed323f7cd8f8d0a8f",
    rationale: "Same Mintlify internal-link formatting rule.",
    acceptableMatchObjectIds: [
      "8774f6cc-4d0f-5455-bfd4-486b66c07ced",
      "b31cbadb-852a-5653-93d0-aca2cd6f38bf",
      "f2db1527-c9ad-56a7-b8d3-eae4a20a5410",
      "ab55df8b-dd5b-51fb-9e27-a3d9e79690e9",
      "4fbc43af-3b1c-5916-9eb2-61282cb50078",
    ],
  },
  {
    caseIdentity:
      "AGENTS.md::repository guidelines>docs i18n (zh-cn)::rule_565a38e86b5a10702df6d642",
    rationale: "Same docs i18n pipeline rule with minor wrapper differences.",
    acceptableMatchObjectIds: [
      "47f4a8d0-cdc2-54dc-ad85-25151cbe48e7",
      "a372b39f-fda2-57c7-b7d2-73cd93c0ee5a",
      "47a30382-5eb9-5383-8e6b-6e2302cd62df",
      "01fa971c-a1ca-5c0b-b3f0-0a2e192b1d83",
      "da3490ab-35cd-53ea-ac39-85715fe07fa1",
    ],
  },
  {
    caseIdentity:
      "AGENTS.md::repository guidelines>coding style & naming conventions::rule_34c67c9d0913f7e0c68cb2b4",
    rationale: "Same post-build dynamic-import warning check rule.",
    acceptableMatchObjectIds: [
      "03bcf0f1-c316-508f-9a41-54dc6ff157d8",
      "1f7250e3-364a-58da-a05b-eb775d4c8a25",
    ],
  },
  {
    caseIdentity:
      "AGENTS.md::repository guidelines>coding style & naming conventions::rule_5b79eb6877949ef825171a6d",
    rationale: "Same dynamic import guardrail against mixing lazy and static imports.",
    acceptableMatchObjectIds: [
      "04f8b22f-87ce-54da-8fac-703629e650d1",
      "c71bb912-93b9-5518-8a13-ff981c2fcd68",
      "479d80cc-53a1-57b0-8c76-30b34a88205c",
    ],
  },
  {
    caseIdentity:
      "docs/help/testing.md::testing>test suites (what runs where)>e2e (gateway smoke)::fact_78d43f721f3e7e7cf8832e3c",
    rationale: "Same E2E suite command/config/workers claim.",
    acceptableMatchObjectIds: [
      "91e727ef-0d5b-552f-8752-91cda839ef94",
      "449a9afd-1a22-513e-a35d-77d0b826dd7d",
      "d7a4c2a7-325c-5ad5-b8d2-86e78f1a0955",
      "c1656377-8e01-5543-a559-f863b625e32b",
    ],
  },
  {
    caseIdentity: "docs/help/testing.md::testing>quick start::rule_9fa49b077c8adffa027205e7",
    rationale: "Same default full-gate-before-push guidance.",
    acceptableMatchObjectIds: [
      "571675ba-16a8-5c60-9e8c-b10bc6db9bb0",
      "34453d0c-1495-5a3b-9219-6b6ec8dadf8f",
      "cc0e6736-f8f9-5e74-8f6c-80a9d2897f63",
      "ed6a4c2f-c7f9-584b-8b6e-3b67ebf2de33",
      "3d628807-8c9e-52b6-b46c-3eb25a9eb260",
    ],
  },
  {
    caseIdentity:
      "docs/help/testing.md::testing>test suites (what runs where)>live (real providers + real models)::fact_5e9c427da71dd00365de513b",
    rationale: "Same live-credential sourcing and key-rotation behavior.",
    acceptableMatchObjectIds: [
      "cec1d130-ceae-5042-b468-61b1b9128806",
      "cea5a3a4-f532-5f23-9c93-aa7bc14513c6",
      "32b03114-a937-500c-9939-c9f3192ad4c1",
      "a55be222-191e-53b9-beaf-359290f51946",
      "70e07c1b-860a-5740-a09e-2614b0301097",
    ],
  },
  {
    caseIdentity:
      "docs/help/testing.md::testing>live: model smoke (profile keys)::fact_7199ff3c3213422d715ec69e",
    rationale: "Same two-layer live model smoke split.",
    acceptableMatchObjectIds: [
      "9fe78fe9-3b3f-55eb-9e90-5ada852549ed",
      "e3530a8e-83a9-5536-8b05-b7198d3c05c2",
      "b603bf56-1ef9-5861-b7fa-a182361b8b1e",
      "43fa8976-b1e3-5b60-88f5-752be798f521",
      "0f1a11dd-fb49-50d8-8b2f-0fe56681912f",
    ],
  },
  {
    caseIdentity:
      "docs/help/testing.md::testing>live: model matrix (what we cover)>baseline: tool calling (read + optional exec)::rule_8803dfefb47bcdd7510b7e17",
    rationale: "Same live model-matrix coverage rule for tools plus image.",
    acceptableMatchObjectIds: [
      "3ac2db64-81b5-501d-8818-78f07da9d9a8",
      "4bb7ea6c-318c-57f2-aa98-0b6c0643ae55",
      "e22d1cc6-a94b-5e27-b648-2d68845ebb86",
      "5a4d3b1c-efca-5e26-8524-0877e64836df",
      "9e1e97f9-d41f-579b-9aea-5565fc5d430a",
    ],
  },
  {
    caseIdentity:
      "docs/help/testing.md::testing>credentials (never commit)::rule_0ec4b28b41694187496e1933",
    rationale: "Same live-test credential handling rule.",
    acceptableMatchObjectIds: [
      "096c0f61-d8df-5f20-a637-8c253aa1d603",
      "f88e5225-9826-50da-abd7-36f4ff18611e",
      "f5f98b07-33cd-5753-b75d-b5a64f6f9a2c",
      "79ba850b-288b-584e-865e-50d11b080df8",
      "1b8b0a62-8415-526b-8e55-62388a6bf61a",
    ],
  },
  {
    caseIdentity:
      "docs/help/testing.md::testing>adding regressions (guidance)::rule_a272d18843d1e18ea7ec5676",
    rationale: "Same guidance on adding regressions after live provider/model issues.",
    acceptableMatchObjectIds: [
      "43ff40f3-93c1-5285-ba8c-4941529d8fbe",
      "7b61d8bb-eb05-5c2a-9079-5e8c6aea9bc4",
      "affd4617-3fe4-5e9b-8f77-5413969beb7c",
      "a1ab18fe-16e7-5a0c-94a1-7177b606d9b1",
      "18432d70-c7ac-58ce-985c-198138dcaad1",
    ],
  },
  {
    caseIdentity:
      "docs/gateway/configuration.md::configuration>config hot reload>reload modes::fact_7f6d833c0c17e1f3b567194b",
    rationale: "Same hybrid-mode hot reload behavior.",
    acceptableMatchObjectIds: [
      "71256a06-22bc-509d-a679-25c6d4e21856",
      "e1cb73a5-dcb3-5347-a6a4-28a2206ee368",
      "827f8a60-18ac-5e15-8d81-19e2ac59a88c",
      "af166c5e-fe93-51e6-8d1f-c01b63b1d292",
      "93704543-7ecd-5cfe-ab23-bc8bf58dc815",
    ],
  },
  {
    caseIdentity:
      "docs/gateway/configuration.md::configuration>config hot reload>what hot-applies vs what needs a restart::rule_9af72a04af91ec2bf8dd3aef",
    rationale: "Same restart-required field guidance in hot reload.",
    acceptableMatchObjectIds: [
      "e8995751-48cd-54e6-a550-16df7b37adfa",
      "b3ad0ed0-9944-538b-ade7-77fba26f2adc",
      "efe67500-1465-5f1d-a499-fe3c87a901d1",
      "64225398-59d3-513d-b6f0-08bba1149976",
      "f32156b2-727f-5114-87c8-085627b03e97",
    ],
  },
  {
    caseIdentity:
      "docs/gateway/configuration.md::configuration>config rpc (programmatic updates)::rule_828eac884ae0bf3757a16df3",
    rationale: "Same config.patch JSON merge patch semantics.",
    acceptableMatchObjectIds: [
      "4ab4b574-c3d2-5606-bac3-beada538852b",
      "d7b2b3a3-5d10-5c89-9ecc-b30fc5a8cb82",
      "660e6ac4-2043-50e6-a41f-10c478f1bf13",
      "029d06b9-f07f-5ba6-8200-bddb65a758a7",
      "7d78f756-8f20-5754-aa35-c7cf4dd3a41d",
    ],
  },
];

type EnrichedStoredObject = {
  record: ModelMemoryObjectRecord;
  sourcePath: string;
  payloadSummary: string;
};

function tokenize(value: string): string[] {
  return normalizeIdentityText(value)
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
}

function jaccardSimilarity(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (leftTokens.size === 0 && rightTokens.size === 0) {
    return 1;
  }
  const union = new Set([...leftTokens, ...rightTokens]);
  if (union.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }
  return overlap / union.size;
}

function summarizePayload(record: Pick<ModelMemoryObjectRecord, "kind" | "payload">): string {
  return summarizeModelMemoryPayload(record).replaceAll(" -> ", " | ");
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function median(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = [...values].toSorted((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[midpoint];
  }
  return Number(((sorted[midpoint - 1] + sorted[midpoint]) / 2).toFixed(2));
}

function buildZeroCandidateDiagnosticId(caseIdentity: string): string {
  return createHash("sha256").update(caseIdentity).digest("hex").slice(0, 12);
}

async function readCollisionTrace(path: string): Promise<CollisionTraceArtifact> {
  return JSON.parse(await readFile(path, "utf8")) as CollisionTraceArtifact;
}

async function loadStoredObjects(): Promise<{
  databaseName: string;
  objects: EnrichedStoredObject[];
}> {
  const runtime = await createModelMemoryDatabaseRuntime({
    databaseMode: "full_corpus_proof_db",
  });
  try {
    const [objects, supportItems, windows, sources] = await Promise.all([
      runtime.canonicalRepository.listMemoryObjects(),
      runtime.canonicalRepository.listSupportItems(),
      runtime.canonicalRepository.listSourceWindows(),
      runtime.canonicalRepository.listSources(),
    ]);

    const supportItemsByObjectId = new Map<string, ModelMemorySupportItemRecord[]>();
    for (const supportItem of supportItems) {
      const existing = supportItemsByObjectId.get(supportItem.memoryObjectId) ?? [];
      existing.push(supportItem);
      supportItemsByObjectId.set(supportItem.memoryObjectId, existing);
    }

    const windowById = new Map<string, ModelMemorySourceWindowRecord>(
      windows.map((window) => [window.id, window]),
    );
    const sourceById = new Map<string, ModelMemorySourceRecord>(
      sources.map((source) => [source.id, source]),
    );

    const resolveSourcePath = (record: ModelMemoryObjectRecord): string => {
      const candidateWindowIds = [
        record.sourceWindowId,
        ...(supportItemsByObjectId.get(record.id) ?? []).map((item) => item.sourceWindowId),
      ].filter((value): value is string => Boolean(value));

      for (const windowId of candidateWindowIds) {
        const window = windowById.get(windowId);
        const source = window ? sourceById.get(window.sourceId) : undefined;
        const sourcePath =
          typeof source?.sourceMetadata.relativePath === "string"
            ? source.sourceMetadata.relativePath
            : source?.externalSourceId;
        if (sourcePath) {
          return sourcePath;
        }
      }
      return "unknown";
    };

    return {
      databaseName: runtime.resolution.databaseName,
      objects: objects.map((record) => ({
        record,
        sourcePath: resolveSourcePath(record),
        payloadSummary: summarizePayload(record),
      })),
    };
  } finally {
    await runtime.pool.end();
  }
}

function buildTraceCaseIndex(traceArtifacts: CollisionTraceArtifact[]): Map<
  string,
  {
    sourcePath: string;
    kind: string;
    passLabel: string;
    queryText: string;
    payloadSummary: string;
  }
> {
  const caseIndex = new Map<
    string,
    {
      sourcePath: string;
      kind: string;
      passLabel: string;
      queryText: string;
      payloadSummary: string;
    }
  >();

  for (const trace of traceArtifacts) {
    for (const pass of trace.passes) {
      for (const gate of pass.collisionGate ?? []) {
        if (gate.disposition !== "zero_candidate_skip") {
          continue;
        }
        const writeResult = (pass.writeResults ?? []).find(
          (result) =>
            result.caseIdentity === gate.caseIdentity || result.candidateId === gate.candidateId,
        );
        caseIndex.set(gate.caseIdentity, {
          sourcePath: trace.sourcePath,
          kind: gate.kind,
          passLabel: pass.passLabel,
          queryText: writeResult?.normalizedSearchText ?? gate.objectSummary,
          payloadSummary: gate.objectSummary,
        });
      }
    }
  }
  return caseIndex;
}

export async function generateZeroCandidateTextSearchDiagnostic(): Promise<ZeroCandidateTextSearchDiagnosticReport> {
  const traceArtifacts = await Promise.all(TRACE_PATHS.map((path) => readCollisionTrace(path)));
  const caseIndex = buildTraceCaseIndex(traceArtifacts);
  const { databaseName, objects } = await loadStoredObjects();

  const cases: SampleCaseReport[] = ZERO_CANDIDATE_DIAGNOSTIC_MANUAL_SAMPLE_SEEDS.map((seed) => {
    const traceCase = caseIndex.get(seed.caseIdentity);
    if (!traceCase) {
      throw new Error(
        `Manual zero-candidate sample case not found in current traces: ${seed.caseIdentity}`,
      );
    }

    const rankedResults = objects
      .map((storedObject) => ({
        memoryObjectId: storedObject.record.id,
        sourcePath: storedObject.sourcePath,
        kind: storedObject.record.kind,
        lifecycleState: storedObject.record.lifecycleState ?? "active",
        identityKey: storedObject.record.identityKey,
        similarityScore: Number(
          jaccardSimilarity(traceCase.queryText, storedObject.record.normalizedSearchText).toFixed(
            4,
          ),
        ),
        payloadSummary: storedObject.payloadSummary,
      }))
      .toSorted((left, right) => {
        if (right.similarityScore !== left.similarityScore) {
          return right.similarityScore - left.similarityScore;
        }
        return left.memoryObjectId.localeCompare(right.memoryObjectId);
      })
      .slice(0, 10);

    const acceptableMatchRanks = rankedResults
      .map((result, index) =>
        seed.acceptableMatchObjectIds.includes(result.memoryObjectId) ? index + 1 : undefined,
      )
      .filter((rank): rank is number => Boolean(rank));
    const bestAcceptableRank =
      acceptableMatchRanks.length > 0 ? Math.min(...acceptableMatchRanks) : undefined;
    const bestAcceptableScore = rankedResults.find((result) =>
      seed.acceptableMatchObjectIds.includes(result.memoryObjectId),
    )?.similarityScore;
    const topWrongScore = rankedResults.find(
      (result) => !seed.acceptableMatchObjectIds.includes(result.memoryObjectId),
    )?.similarityScore;

    return {
      caseIdentity: seed.caseIdentity,
      sourcePath: traceCase.sourcePath,
      kind: traceCase.kind,
      passLabel: traceCase.passLabel,
      queryText: traceCase.queryText,
      payloadSummary: traceCase.payloadSummary,
      rationale: seed.rationale,
      acceptableMatchObjectIds: seed.acceptableMatchObjectIds,
      acceptableMatchRanks,
      bestAcceptableRank,
      topWrongScore,
      bestAcceptableScore,
      scoreGapVsTopWrong:
        bestAcceptableScore === undefined || topWrongScore === undefined
          ? undefined
          : Number((bestAcceptableScore - topWrongScore).toFixed(4)),
      hits: {
        top1: bestAcceptableRank === 1,
        top5: bestAcceptableRank !== undefined && bestAcceptableRank <= 5,
        top10: bestAcceptableRank !== undefined && bestAcceptableRank <= 10,
        present: bestAcceptableRank !== undefined,
      },
      topResults: rankedResults,
    };
  });

  const top1Hits = cases.filter((caseRecord) => caseRecord.hits.top1).length;
  const top5Hits = cases.filter((caseRecord) => caseRecord.hits.top5).length;
  const top10Hits = cases.filter((caseRecord) => caseRecord.hits.top10).length;
  const bestRanks = cases
    .map((caseRecord) => caseRecord.bestAcceptableRank)
    .filter((rank): rank is number => typeof rank === "number");
  const scoreGaps = cases
    .map((caseRecord) => caseRecord.scoreGapVsTopWrong)
    .filter((gap): gap is number => typeof gap === "number");

  return {
    generatedAt: new Date().toISOString(),
    databaseMode: "full_corpus_proof_db",
    databaseName,
    tracePaths: [...TRACE_PATHS],
    similarityMethod: "normalized_search_text_jaccard",
    sampleSelectionPolicy: "manual_zero_candidate_subset_with_known_legitimate_prior_match",
    caveats: [
      "Diagnostic only. The search drops class, kind, scope, and decisive-field gates and therefore must not become merge authority.",
      "The 20-case sample is a manually adjudicated subset of current zero-candidate skips chosen because a legitimate prior match was visible on qualitative review.",
      "A hit means a legitimate prior object surfaced in the raw text ranking, not that deterministic attach would be safe without structural delta checks.",
    ],
    sampleSize: cases.length,
    cases,
    summary: {
      top1HitRate: Number((top1Hits / cases.length).toFixed(4)),
      top5HitRate: Number((top5Hits / cases.length).toFixed(4)),
      top10HitRate: Number((top10Hits / cases.length).toFixed(4)),
      medianBestAcceptableRank: median(bestRanks),
      scoreGapVsTopWrong: {
        median: median(scoreGaps),
        minimum: scoreGaps.length > 0 ? Number(Math.min(...scoreGaps).toFixed(4)) : undefined,
        maximum: scoreGaps.length > 0 ? Number(Math.max(...scoreGaps).toFixed(4)) : undefined,
      },
      sourceBreakdown: countBy(cases.map((caseRecord) => caseRecord.sourcePath)),
      kindBreakdown: countBy(cases.map((caseRecord) => caseRecord.kind)),
    },
  };
}

export function renderZeroCandidateTextSearchDiagnosticMarkdown(
  report: ZeroCandidateTextSearchDiagnosticReport,
): string {
  const lines: string[] = [];
  lines.push("# Zero-Candidate Text Search Diagnostic");
  lines.push("");
  lines.push("- Database mode: `full_corpus_proof_db`");
  lines.push(`- Database name: \`${report.databaseName}\``);
  lines.push(`- Similarity method: \`${report.similarityMethod}\``);
  lines.push(`- Sample size: \`${report.sampleSize}\``);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Top-1 hit rate: ${(report.summary.top1HitRate * 100).toFixed(1)}%`);
  lines.push(`- Top-5 hit rate: ${(report.summary.top5HitRate * 100).toFixed(1)}%`);
  lines.push(`- Top-10 hit rate: ${(report.summary.top10HitRate * 100).toFixed(1)}%`);
  lines.push(`- Median best acceptable rank: ${report.summary.medianBestAcceptableRank ?? "n/a"}`);
  lines.push(
    `- Median score gap (best acceptable minus top wrong): ${report.summary.scoreGapVsTopWrong.median ?? "n/a"}`,
  );
  lines.push("");
  lines.push("### Source breakdown");
  lines.push("");
  for (const [sourcePath, count] of Object.entries(report.summary.sourceBreakdown)) {
    lines.push(`- ${sourcePath}: ${count}`);
  }
  lines.push("");
  lines.push("### Kind breakdown");
  lines.push("");
  for (const [kind, count] of Object.entries(report.summary.kindBreakdown)) {
    lines.push(`- ${kind}: ${count}`);
  }
  lines.push("");
  lines.push("## Caveats");
  lines.push("");
  for (const caveat of report.caveats) {
    lines.push(`- ${caveat}`);
  }
  lines.push("");
  lines.push("## Sample cases");
  lines.push("");

  for (const caseRecord of report.cases) {
    lines.push(`### ${buildZeroCandidateDiagnosticId(caseRecord.caseIdentity)}`);
    lines.push("");
    lines.push(`- Case identity: \`${caseRecord.caseIdentity}\``);
    lines.push(`- Source: \`${caseRecord.sourcePath}\``);
    lines.push(`- Kind: \`${caseRecord.kind}\``);
    lines.push(`- Trace pass: \`${caseRecord.passLabel}\``);
    lines.push(`- Payload summary: ${caseRecord.payloadSummary}`);
    lines.push(`- Manual rationale: ${caseRecord.rationale}`);
    lines.push(
      `- Best acceptable rank: ${caseRecord.bestAcceptableRank ?? "not present in top 10"}`,
    );
    lines.push(
      `- Hits: top1=${caseRecord.hits.top1} top5=${caseRecord.hits.top5} top10=${caseRecord.hits.top10}`,
    );
    lines.push(`- Score gap vs top wrong: ${caseRecord.scoreGapVsTopWrong ?? "n/a"}`);
    lines.push("");
    lines.push("Top results:");
    lines.push("");
    for (const [index, result] of caseRecord.topResults.entries()) {
      const acceptable = caseRecord.acceptableMatchObjectIds.includes(result.memoryObjectId);
      lines.push(
        `${index + 1}. [${acceptable ? "acceptable" : "wrong"}] score=${result.similarityScore} object=${result.memoryObjectId} source=${result.sourcePath} kind=${result.kind} state=${result.lifecycleState}`,
      );
      lines.push(`   - ${result.payloadSummary}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
