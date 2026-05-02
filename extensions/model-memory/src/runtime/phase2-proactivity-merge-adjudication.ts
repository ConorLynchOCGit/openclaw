import { z } from "zod";
import { sha256JsonValue } from "../hashing.ts";
import type { JsonModelExecutor, JsonModelReasoningEffort } from "../model-execution.ts";
import { parseJsonModelOutput } from "../model-execution.ts";
import type {
  Phase2OpportunityLedgerLifecycleOverride,
  Phase2OpportunityLedgerSource,
} from "./phase2-proactivity-opportunity-ledger.ts";
import { buildProactivityUserFacingFocusKey } from "./proactivity-text.ts";

export const PHASE2_PROACTIVITY_MERGE_ADJUDICATION_SCHEMA_VERSION =
  "phase2_proactivity_merge_adjudication.v1" as const;

export type Phase2ProactivityMergeCandidateKind = "proactive_plan" | "skill_candidate";

export type Phase2ProactivityMergeCandidate = {
  opportunityId: string;
  candidateId: string;
  kind: Phase2ProactivityMergeCandidateKind;
  title: string;
  purpose: string;
  nextStep: string;
  evidenceRefs: string[];
  contentHashes: string[];
  generatedAt: string;
};

export type Phase2ProactivityMergeRecallRow = {
  candidate: Phase2ProactivityMergeCandidate;
  neighbors: Phase2ProactivityMergeCandidate[];
};

export type Phase2ProactivityMergePromptCandidate = {
  opportunityId: string;
  kind: Phase2ProactivityMergeCandidateKind;
  title: string;
  purpose: string;
  nextStep: string;
  generatedAt: string;
  sourceRefKeys: string[];
  contentHashKeys: string[];
};

export type Phase2ProactivityMergePromptRow = {
  candidateOpportunityId: string;
  neighborOpportunityIds: string[];
};

export type Phase2ProactivityMergePromptPacket = {
  schemaVersion: typeof PHASE2_PROACTIVITY_MERGE_ADJUDICATION_SCHEMA_VERSION;
  task: "adjudicate duplicate/merge candidates for already model-reviewed proactivity cards";
  policy: {
    deterministicRecallOnly: true;
    modelOwnsDuplicateJudgment: true;
    oneCallForAllRows: true;
    noActionExecution: true;
    noSkillInstallOrPromotion: true;
  };
  candidates: Phase2ProactivityMergePromptCandidate[];
  rows: Phase2ProactivityMergePromptRow[];
};

export type Phase2ProactivityMergeDecision = {
  candidateOpportunityId: string;
  decision: "merge_into_existing" | "distinct" | "quarantine";
  targetOpportunityId: string | null;
  rationale: string;
  confidence: "high" | "medium" | "low";
};

export type Phase2ProactivityMergeAdjudicationReport = {
  schemaVersion: typeof PHASE2_PROACTIVITY_MERGE_ADJUDICATION_SCHEMA_VERSION;
  reportId: string;
  inputHash: string;
  generatedAt: string;
  enabled: boolean;
  modelId: string | null;
  decision: "not_needed" | "model_adjudicated" | "skipped" | "model_unavailable";
  recallRows: Phase2ProactivityMergeRecallRow[];
  decisions: Phase2ProactivityMergeDecision[];
  lifecycleOverrides: Phase2OpportunityLedgerLifecycleOverride[];
  reasonCodes: string[];
  promptPersisted: false;
  rawResponsePersisted: false;
};

export type Phase2ProactivityNewOpportunityMergeDecision =
  | "distinct"
  | "merge_into_existing"
  | "quarantine"
  | "not_applicable";

export type Phase2ProactivityNewOpportunityMergeReport =
  Phase2ProactivityMergeAdjudicationReport & {
    candidateOpportunityId: string;
    acceptedForSurfacing: boolean;
    newCandidateDecision: Phase2ProactivityNewOpportunityMergeDecision;
    targetOpportunityId: string | null;
  };

export type Phase2ProactivityMergeAdjudicationCache = {
  schemaVersion: typeof PHASE2_PROACTIVITY_MERGE_ADJUDICATION_SCHEMA_VERSION;
  inputHash: string;
  modelId: string;
  generatedAt: string;
  decisions: Phase2ProactivityMergeDecision[];
  lifecycleOverrides: Phase2OpportunityLedgerLifecycleOverride[];
};

export type Phase2ProactivityMergeAdjudicationOptions = {
  enabled?: boolean;
  executor?: JsonModelExecutor | null;
  modelId?: string;
  reasoningEffort?: JsonModelReasoningEffort;
  maxOutputTokens?: number;
  now?: Date;
  maxCandidates?: number;
  maxNeighborsPerCandidate?: number;
  cachedReport?: Phase2ProactivityMergeAdjudicationCache | null;
};

const MergeAdjudicationOutputSchema = z
  .object({
    schemaVersion: z.literal(PHASE2_PROACTIVITY_MERGE_ADJUDICATION_SCHEMA_VERSION),
    decisions: z
      .array(
        z
          .object({
            candidateOpportunityId: z.string().trim().min(1).max(200),
            decision: z.enum(["merge_into_existing", "distinct", "quarantine"]),
            targetOpportunityId: z.string().trim().min(1).max(200).nullable(),
            rationale: z.string().trim().min(8).max(500),
            confidence: z.enum(["high", "medium", "low"]),
          })
          .strict(),
      )
      .max(80),
  })
  .strict();

function hash(value: unknown): string {
  return sha256JsonValue(value);
}

function unique(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].toSorted();
}

function compact(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 1).trimEnd()}.`;
}

function compactKey(value: string): string {
  return hash(value).slice(0, 12);
}

function sourceGeneratedAt(source: Phase2OpportunityLedgerSource): string {
  if ("generatedAt" in source && typeof source.generatedAt === "string") {
    return source.generatedAt;
  }
  if (
    source.sourceFamily === "skill_candidate" &&
    typeof source.skillCandidate.updatedAt === "string"
  ) {
    return source.skillCandidate.updatedAt;
  }
  return "";
}

function sourceToMergeCandidate(
  source: Phase2OpportunityLedgerSource,
): Phase2ProactivityMergeCandidate | null {
  if (!source.blockedReasonCodes.includes("model_reviewed_candidate")) {
    return null;
  }
  const kind =
    source.sourceFamily === "skill_candidate"
      ? "skill_candidate"
      : "opportunityClass" in source && source.opportunityClass === "proactive_plan"
        ? "proactive_plan"
        : null;
  if (!kind) {
    return null;
  }
  return {
    opportunityId: source.opportunityId,
    candidateId:
      source.sourceFamily === "skill_candidate"
        ? source.skillCandidate.skillCandidateId
        : source.opportunityId,
    kind,
    title: compact(source.title, 160),
    purpose: compact(source.expectedUserValue || source.whyNow, 240),
    nextStep: compact(source.proposedNextStep, 240),
    evidenceRefs: unique(source.sourceRefs).slice(0, 12),
    contentHashes: unique(source.contentHashes).slice(0, 12),
    generatedAt: sourceGeneratedAt(source),
  };
}

function recallTokens(candidate: Phase2ProactivityMergeCandidate): Set<string> {
  return new Set(
    buildProactivityUserFacingFocusKey(
      `${candidate.title}\n${candidate.purpose}\n${candidate.nextStep}`,
    )
      .split(/\s+/u)
      .filter((token) => token.length >= 3),
  );
}

function lexicalRecallScore(
  candidate: Phase2ProactivityMergeCandidate,
  neighbor: Phase2ProactivityMergeCandidate,
): number {
  const left = recallTokens(candidate);
  const right = recallTokens(neighbor);
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) {
      overlap += 1;
    }
  }
  const hashOverlap = candidate.contentHashes.some((entry) =>
    neighbor.contentHashes.includes(entry),
  )
    ? 4
    : 0;
  return overlap + hashOverlap;
}

export function buildProactivityMergeRecallRows(
  sources: Phase2OpportunityLedgerSource[],
  options: {
    maxCandidates?: number;
    maxNeighborsPerCandidate?: number;
  } = {},
): Phase2ProactivityMergeRecallRow[] {
  const maxCandidates = options.maxCandidates ?? 80;
  const maxNeighborsPerCandidate = options.maxNeighborsPerCandidate ?? 8;
  const candidates = sources
    .map(sourceToMergeCandidate)
    .filter((candidate): candidate is Phase2ProactivityMergeCandidate => candidate !== null)
    .toSorted((left, right) => left.generatedAt.localeCompare(right.generatedAt))
    .slice(-maxCandidates);
  const rows: Phase2ProactivityMergeRecallRow[] = [];
  for (const candidate of candidates) {
    const neighbors = candidates
      .filter(
        (neighbor) =>
          neighbor.opportunityId !== candidate.opportunityId &&
          neighbor.kind === candidate.kind &&
          neighbor.generatedAt <= candidate.generatedAt,
      )
      .map((neighbor) => ({
        neighbor,
        score: lexicalRecallScore(candidate, neighbor),
      }))
      .filter((entry) => entry.score > 0)
      .toSorted(
        (left, right) =>
          right.score - left.score ||
          right.neighbor.generatedAt.localeCompare(left.neighbor.generatedAt) ||
          left.neighbor.opportunityId.localeCompare(right.neighbor.opportunityId),
      )
      .map((entry) => entry.neighbor)
      .slice(0, maxNeighborsPerCandidate);
    if (neighbors.length > 0) {
      rows.push({ candidate, neighbors });
    }
  }
  return rows;
}

export function buildProactivityMergeRecallRowForCandidate(
  candidateSource: Phase2OpportunityLedgerSource,
  existingSources: Phase2OpportunityLedgerSource[],
  options: {
    maxNeighborsPerCandidate?: number;
  } = {},
): Phase2ProactivityMergeRecallRow | null {
  const candidate = sourceToMergeCandidate(candidateSource);
  if (!candidate) {
    return null;
  }
  const maxNeighborsPerCandidate = options.maxNeighborsPerCandidate ?? 8;
  const neighbors = existingSources
    .map(sourceToMergeCandidate)
    .filter((neighbor): neighbor is Phase2ProactivityMergeCandidate => neighbor !== null)
    .filter(
      (neighbor) =>
        neighbor.opportunityId !== candidate.opportunityId &&
        neighbor.kind === candidate.kind &&
        (!neighbor.generatedAt ||
          !candidate.generatedAt ||
          neighbor.generatedAt <= candidate.generatedAt),
    )
    .map((neighbor) => ({
      neighbor,
      score: lexicalRecallScore(candidate, neighbor),
    }))
    .filter((entry) => entry.score > 0)
    .toSorted(
      (left, right) =>
        right.score - left.score ||
        right.neighbor.generatedAt.localeCompare(left.neighbor.generatedAt) ||
        left.neighbor.opportunityId.localeCompare(right.neighbor.opportunityId),
    )
    .map((entry) => entry.neighbor)
    .slice(0, maxNeighborsPerCandidate);
  return { candidate, neighbors };
}

function mergePromptCandidate(
  candidate: Phase2ProactivityMergeCandidate,
): Phase2ProactivityMergePromptCandidate {
  return {
    opportunityId: candidate.opportunityId,
    kind: candidate.kind,
    title: candidate.title,
    purpose: candidate.purpose,
    nextStep: candidate.nextStep,
    generatedAt: candidate.generatedAt,
    sourceRefKeys: candidate.evidenceRefs.map(compactKey).slice(0, 6),
    contentHashKeys: candidate.contentHashes.map((entry) => entry.slice(0, 12)).slice(0, 6),
  };
}

export function buildProactivityMergePromptPacket(
  rows: Phase2ProactivityMergeRecallRow[],
): Phase2ProactivityMergePromptPacket {
  const candidatesById = new Map<string, Phase2ProactivityMergeCandidate>();
  for (const row of rows) {
    candidatesById.set(row.candidate.opportunityId, row.candidate);
    for (const neighbor of row.neighbors) {
      candidatesById.set(neighbor.opportunityId, neighbor);
    }
  }
  return {
    schemaVersion: PHASE2_PROACTIVITY_MERGE_ADJUDICATION_SCHEMA_VERSION,
    task: "adjudicate duplicate/merge candidates for already model-reviewed proactivity cards",
    policy: {
      deterministicRecallOnly: true,
      modelOwnsDuplicateJudgment: true,
      oneCallForAllRows: true,
      noActionExecution: true,
      noSkillInstallOrPromotion: true,
    },
    candidates: [...candidatesById.values()]
      .map(mergePromptCandidate)
      .toSorted((left, right) => left.generatedAt.localeCompare(right.generatedAt)),
    rows: rows.map((row) => ({
      candidateOpportunityId: row.candidate.opportunityId,
      neighborOpportunityIds: row.neighbors.map((neighbor) => neighbor.opportunityId),
    })),
  };
}

function buildUserPrompt(rows: Phase2ProactivityMergeRecallRow[]): string {
  return JSON.stringify(buildProactivityMergePromptPacket(rows));
}

function validatedDecisions(
  rows: Phase2ProactivityMergeRecallRow[],
  rawDecisions: Phase2ProactivityMergeDecision[],
): Phase2ProactivityMergeDecision[] {
  const neighborsByCandidate = new Map(
    rows.map((row) => [
      row.candidate.opportunityId,
      new Set(row.neighbors.map((neighbor) => neighbor.opportunityId)),
    ]),
  );
  return rawDecisions.filter((decision) => {
    const neighborIds = neighborsByCandidate.get(decision.candidateOpportunityId);
    if (!neighborIds) {
      return false;
    }
    if (decision.decision === "merge_into_existing") {
      return Boolean(decision.targetOpportunityId && neighborIds.has(decision.targetOpportunityId));
    }
    return decision.targetOpportunityId === null;
  });
}

function lifecycleOverridesFromDecisions(
  decisions: Phase2ProactivityMergeDecision[],
  generatedAt: string,
): Phase2OpportunityLedgerLifecycleOverride[] {
  return decisions
    .filter((decision) => decision.decision === "merge_into_existing")
    .map((decision) => ({
      opportunityId: decision.candidateOpportunityId,
      status: "superseded" as const,
      updatedAt: generatedAt,
      supersededByOpportunityId: decision.targetOpportunityId,
      resolvedByChatMessageId: null,
      dismissalCooldownUntil: null,
      plannedArtifact: null,
    }));
}

export async function adjudicateProactivityOpportunityMerges(
  sources: Phase2OpportunityLedgerSource[],
  options: Phase2ProactivityMergeAdjudicationOptions = {},
): Promise<Phase2ProactivityMergeAdjudicationReport> {
  const generatedAt = (options.now ?? new Date()).toISOString();
  const modelId = options.modelId ?? "openai-codex/gpt-5.4";
  const recallRows = buildProactivityMergeRecallRows(sources, {
    maxCandidates: options.maxCandidates,
    maxNeighborsPerCandidate: options.maxNeighborsPerCandidate,
  });
  const promptPacket = buildProactivityMergePromptPacket(recallRows);
  const inputHash = hash(promptPacket);
  const base = {
    schemaVersion: PHASE2_PROACTIVITY_MERGE_ADJUDICATION_SCHEMA_VERSION,
    reportId: hash({ generatedAt, inputHash }),
    inputHash,
    generatedAt,
    enabled: options.enabled === true,
    modelId: options.enabled === true ? modelId : null,
    recallRows,
    promptPersisted: false as const,
    rawResponsePersisted: false as const,
  };
  if (recallRows.length === 0) {
    return {
      ...base,
      decision: "not_needed",
      decisions: [],
      lifecycleOverrides: [],
      reasonCodes: ["no_recall_rows"],
    };
  }
  if (
    options.enabled === true &&
    options.cachedReport &&
    options.cachedReport.schemaVersion === PHASE2_PROACTIVITY_MERGE_ADJUDICATION_SCHEMA_VERSION &&
    options.cachedReport.inputHash === inputHash &&
    options.cachedReport.modelId === modelId
  ) {
    const cachedDecisions = validatedDecisions(recallRows, options.cachedReport.decisions);
    return {
      ...base,
      decision: "model_adjudicated",
      decisions: cachedDecisions,
      lifecycleOverrides: lifecycleOverridesFromDecisions(
        cachedDecisions,
        options.cachedReport.generatedAt,
      ),
      reasonCodes:
        cachedDecisions.length === options.cachedReport.decisions.length
          ? ["cached_model_merge_adjudication"]
          : ["cached_model_merge_adjudication_invalid_decisions_dropped"],
    };
  }
  if (options.enabled !== true || !options.executor) {
    return {
      ...base,
      decision: "skipped",
      decisions: [],
      lifecycleOverrides: [],
      reasonCodes: ["model_merge_adjudication_disabled_or_unavailable"],
    };
  }
  try {
    const response = await options.executor.execute({
      contract: {
        contractName: "phase2_proactivity_merge_adjudication",
        contractVersion: "phase2-proactivity-merge-adjudication-v1",
        modelId,
      },
      systemPrompt: [
        "You adjudicate duplicate or merge relationships among already model-reviewed OpenClaw proactivity cards.",
        "Deterministic code has only recalled possible neighbors. You own the duplicate/merge judgment.",
        "Return strict JSON only.",
        "The user packet contains one compact candidates table plus rows that reference candidates by opportunity id.",
        "For each row, decide whether the candidateOpportunityId should merge into exactly one recalled neighborOpportunityId, stay distinct, or quarantine because the relationship is ambiguous.",
        "Use merge_into_existing only when the candidate would create a redundant active proactive plan or skill card compared with one recalled neighbor.",
        "Use distinct when the cards are related but would drive different decisions, workflows, outputs, or review actions.",
        "Use quarantine when there is not enough evidence to safely decide.",
        "targetOpportunityId must be one of that row's neighbor opportunity ids for merge_into_existing, otherwise null.",
        "Do not create new candidates, install skills, promote skills, execute actions, send messages, or write canonical memory.",
      ].join("\n"),
      userPrompt: buildUserPrompt(recallRows),
      responseFormat: "json",
      responseOptions: {
        transport: {
          type: "json_schema",
          name: "phase2_proactivity_merge_adjudication",
          strict: true,
          schema: {
            type: "object",
            properties: {
              schemaVersion: {
                type: "string",
                const: PHASE2_PROACTIVITY_MERGE_ADJUDICATION_SCHEMA_VERSION,
              },
              decisions: {
                type: "array",
                maxItems: 80,
                items: {
                  type: "object",
                  properties: {
                    candidateOpportunityId: { type: "string", minLength: 1, maxLength: 200 },
                    decision: {
                      enum: ["merge_into_existing", "distinct", "quarantine"],
                    },
                    targetOpportunityId: { type: ["string", "null"], maxLength: 200 },
                    rationale: { type: "string", minLength: 8, maxLength: 500 },
                    confidence: { enum: ["high", "medium", "low"] },
                  },
                  required: [
                    "candidateOpportunityId",
                    "decision",
                    "targetOpportunityId",
                    "rationale",
                    "confidence",
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ["schemaVersion", "decisions"],
            additionalProperties: false,
          },
        },
        reasoningEffort: options.reasoningEffort ?? "medium",
        verbosity: "low",
        maxOutputTokens: options.maxOutputTokens ?? 2000,
      },
    });
    const parsed = parseJsonModelOutput(
      response,
      {
        contractName: "phase2_proactivity_merge_adjudication",
        contractVersion: "phase2-proactivity-merge-adjudication-v1",
        modelId,
      },
      MergeAdjudicationOutputSchema,
    );
    const decisions = validatedDecisions(recallRows, parsed.decisions);
    return {
      ...base,
      decision: "model_adjudicated",
      decisions,
      lifecycleOverrides: lifecycleOverridesFromDecisions(decisions, generatedAt),
      reasonCodes:
        decisions.length === parsed.decisions.length
          ? ["model_decisions_validated"]
          : ["invalid_model_decisions_dropped"],
    };
  } catch {
    return {
      ...base,
      decision: "model_unavailable",
      decisions: [],
      lifecycleOverrides: [],
      reasonCodes: ["model_merge_adjudication_failed_closed"],
    };
  }
}

export async function adjudicateNewProactivityOpportunityMerge(
  candidateSource: Phase2OpportunityLedgerSource,
  existingSources: Phase2OpportunityLedgerSource[],
  options: Phase2ProactivityMergeAdjudicationOptions = {},
): Promise<Phase2ProactivityNewOpportunityMergeReport> {
  const generatedAt = (options.now ?? new Date()).toISOString();
  const modelId = options.modelId ?? "openai-codex/gpt-5.4";
  const recallRow = buildProactivityMergeRecallRowForCandidate(candidateSource, existingSources, {
    maxNeighborsPerCandidate: options.maxNeighborsPerCandidate,
  });
  const recallRows = recallRow ? (recallRow.neighbors.length > 0 ? [recallRow] : []) : [];
  const promptPacket = buildProactivityMergePromptPacket(recallRows);
  const inputHash = hash({
    candidateOpportunityId: candidateSource.opportunityId,
    promptPacket,
  });
  const base = {
    schemaVersion: PHASE2_PROACTIVITY_MERGE_ADJUDICATION_SCHEMA_VERSION,
    reportId: hash({ generatedAt, inputHash }),
    inputHash,
    generatedAt,
    enabled: options.enabled === true,
    modelId: options.enabled === true ? modelId : null,
    recallRows,
    promptPersisted: false as const,
    rawResponsePersisted: false as const,
    candidateOpportunityId: candidateSource.opportunityId,
    targetOpportunityId: null,
  };
  if (!recallRow) {
    return {
      ...base,
      decision: "not_needed",
      decisions: [],
      lifecycleOverrides: [],
      reasonCodes: ["candidate_not_merge_adjudication_subject"],
      acceptedForSurfacing: true,
      newCandidateDecision: "not_applicable",
    };
  }
  if (recallRow.neighbors.length === 0) {
    return {
      ...base,
      decision: "not_needed",
      decisions: [
        {
          candidateOpportunityId: candidateSource.opportunityId,
          decision: "distinct",
          targetOpportunityId: null,
          rationale: "No recalled neighbor candidates were available for model merge adjudication.",
          confidence: "high",
        },
      ],
      lifecycleOverrides: [],
      reasonCodes: ["no_recalled_neighbors"],
      acceptedForSurfacing: true,
      newCandidateDecision: "distinct",
    };
  }
  if (options.enabled !== true || !options.executor) {
    return {
      ...base,
      decision: "skipped",
      decisions: [],
      lifecycleOverrides: [],
      reasonCodes: ["model_merge_adjudication_disabled_or_unavailable"],
      acceptedForSurfacing: false,
      newCandidateDecision: "quarantine",
    };
  }
  try {
    const response = await options.executor.execute({
      contract: {
        contractName: "phase2_proactivity_merge_adjudication",
        contractVersion: "phase2-proactivity-merge-adjudication-v1",
        modelId,
      },
      systemPrompt: [
        "You adjudicate whether one new already model-reviewed OpenClaw proactivity card duplicates or should merge into recalled neighbors.",
        "Deterministic code has only recalled possible neighbors. You own the duplicate/merge judgment.",
        "Return strict JSON only.",
        "For the single row, decide whether the candidateOpportunityId should merge into exactly one recalled neighborOpportunityId, stay distinct, or quarantine because the relationship is ambiguous.",
        "Use merge_into_existing only when the candidate would create a redundant active proactive plan or skill card compared with one recalled neighbor.",
        "Use distinct when the cards are related but would drive different decisions, workflows, outputs, or review actions.",
        "Use quarantine when there is not enough evidence to safely decide.",
        "targetOpportunityId must be one of that row's neighbor opportunity ids for merge_into_existing, otherwise null.",
        "Do not create new candidates, install skills, promote skills, execute actions, send messages, or write canonical memory.",
      ].join("\n"),
      userPrompt: buildUserPrompt([recallRow]),
      responseFormat: "json",
      responseOptions: {
        transport: {
          type: "json_schema",
          name: "phase2_proactivity_merge_adjudication",
          strict: true,
          schema: {
            type: "object",
            properties: {
              schemaVersion: {
                type: "string",
                const: PHASE2_PROACTIVITY_MERGE_ADJUDICATION_SCHEMA_VERSION,
              },
              decisions: {
                type: "array",
                maxItems: 1,
                items: {
                  type: "object",
                  properties: {
                    candidateOpportunityId: { type: "string", minLength: 1, maxLength: 200 },
                    decision: {
                      enum: ["merge_into_existing", "distinct", "quarantine"],
                    },
                    targetOpportunityId: { type: ["string", "null"], maxLength: 200 },
                    rationale: { type: "string", minLength: 8, maxLength: 500 },
                    confidence: { enum: ["high", "medium", "low"] },
                  },
                  required: [
                    "candidateOpportunityId",
                    "decision",
                    "targetOpportunityId",
                    "rationale",
                    "confidence",
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ["schemaVersion", "decisions"],
            additionalProperties: false,
          },
        },
        reasoningEffort: options.reasoningEffort ?? "medium",
        verbosity: "low",
        maxOutputTokens: Math.min(options.maxOutputTokens ?? 900, 900),
      },
    });
    const parsed = parseJsonModelOutput(
      response,
      {
        contractName: "phase2_proactivity_merge_adjudication",
        contractVersion: "phase2-proactivity-merge-adjudication-v1",
        modelId,
      },
      MergeAdjudicationOutputSchema,
    );
    const decisions = validatedDecisions([recallRow], parsed.decisions);
    const decision = decisions.find(
      (entry) => entry.candidateOpportunityId === candidateSource.opportunityId,
    );
    const lifecycleOverrides = lifecycleOverridesFromDecisions(decisions, generatedAt);
    if (!decision) {
      return {
        ...base,
        decision: "model_adjudicated",
        decisions: [],
        lifecycleOverrides: [],
        reasonCodes: ["model_merge_decision_missing_or_invalid"],
        acceptedForSurfacing: false,
        newCandidateDecision: "quarantine",
      };
    }
    return {
      ...base,
      decision: "model_adjudicated",
      decisions: [decision],
      lifecycleOverrides,
      reasonCodes:
        decisions.length === parsed.decisions.length
          ? ["model_decisions_validated"]
          : ["invalid_model_decisions_dropped"],
      acceptedForSurfacing: decision.decision === "distinct",
      newCandidateDecision: decision.decision,
      targetOpportunityId: decision.targetOpportunityId,
    };
  } catch {
    return {
      ...base,
      decision: "model_unavailable",
      decisions: [],
      lifecycleOverrides: [],
      reasonCodes: ["model_merge_adjudication_failed_closed"],
      acceptedForSurfacing: false,
      newCandidateDecision: "quarantine",
    };
  }
}
