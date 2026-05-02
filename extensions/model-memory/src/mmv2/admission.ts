import { JsonModelOutputError } from "../model-execution.ts";
import type { InterpreterSourceWindow, SemanticInterpreter } from "../semantic-interpreter.ts";
import type { ModelMemorySourceKind } from "../storage-database-contract.ts";
import {
  AdmissionDecisionBatchSchema,
  type AdmissionDecisionBatch,
  type CanonicalCandidateBatch,
  type ExistingMemorySummary,
  type RawIngestEvent,
} from "./contracts.ts";
import {
  buildAdmissionPrompt,
  buildRepairPrompt,
  type MmV2PromptResponseMode,
} from "./prompt-contracts.ts";

type AdmissionInput = {
  rawEvent: RawIngestEvent;
  sourceKind: ModelMemorySourceKind;
  sourceId: string;
  sourceWindow: InterpreterSourceWindow;
  modelId: string;
  interpreter: SemanticInterpreter;
  canonicalBatch: CanonicalCandidateBatch;
  candidateNeighborsById?: Record<string, ExistingMemorySummary[]>;
  responseMode?: MmV2PromptResponseMode;
};

type AdmissionDecisionRecord = AdmissionDecisionBatch["decisions"][number];

function extractBatch(result: Awaited<ReturnType<SemanticInterpreter["interpret"]>>): unknown {
  if (result.action === "ignore") {
    return {
      schema_version: "admission_decision.v1",
      event_id: "",
      decisions: [],
    };
  }
  return result.objects.length === 1 ? result.objects[0] : result.objects;
}

function normalizeAdmissionPayload(raw: unknown, eventId: string): unknown {
  if (Array.isArray(raw)) {
    return {
      schema_version: "admission_decision.v1",
      event_id: eventId,
      decisions: raw,
    };
  }
  if (raw && typeof raw === "object") {
    return {
      schema_version: "admission_decision.v1",
      event_id: eventId,
      ...raw,
    };
  }
  return raw;
}

const ALLOWED_ADMISSION_REASON_CODES = new Set<AdmissionDecisionRecord["reason_codes"][number]>([
  "durable",
  "useful_future_context",
  "explicit_user_statement",
  "clear_instruction",
  "canonical_source",
  "important_decision",
  "temporary",
  "duplicate_likely",
  "too_vague",
  "low_confidence",
  "sensitive",
  "embedded_component_only",
  "scope_unclear",
  "not_actionable",
  "not_memory",
]);

function clamp01(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

function sanitizeAdmissionScores(raw: unknown): AdmissionDecisionRecord["scores"] {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    future_utility: clamp01(source.future_utility, 0.5),
    durability: clamp01(source.durability, 0.5),
    confidence: clamp01(source.confidence, 0.5),
    novelty: clamp01(source.novelty, 0.5),
    scope_clarity: clamp01(source.scope_clarity, 0.5),
    sensitivity_safety: clamp01(source.sensitivity_safety, 0.8),
    specificity: clamp01(source.specificity, 0.5),
  };
}

function sanitizeAdmissionDecisionName(value: unknown): AdmissionDecisionRecord["decision"] {
  return value === "admit" || value === "reject" || value === "quarantine" || value === "embed_only"
    ? value
    : "quarantine";
}

function sanitizeAdmissionReasonCodes(value: unknown): AdmissionDecisionRecord["reason_codes"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value.filter(
        (entry): entry is AdmissionDecisionRecord["reason_codes"][number] =>
          typeof entry === "string" &&
          ALLOWED_ADMISSION_REASON_CODES.has(
            entry as AdmissionDecisionRecord["reason_codes"][number],
          ),
      ),
    ),
  );
}

function ensureAdmissionCoverage(
  batch: AdmissionDecisionBatch,
  canonicalBatch: CanonicalCandidateBatch,
): AdmissionDecisionBatch {
  const decisions: AdmissionDecisionBatch["decisions"] = [];
  const seen = new Set<string>();

  for (const decision of batch.decisions) {
    if (seen.has(decision.candidate_id)) {
      continue;
    }
    seen.add(decision.candidate_id);
    decisions.push(decision);
  }

  for (const candidate of canonicalBatch.canonical_candidates) {
    if (seen.has(candidate.candidate_id)) {
      continue;
    }
    decisions.push({
      candidate_id: candidate.candidate_id,
      decision: "quarantine",
      scores: {
        future_utility: 0.4,
        durability: 0.4,
        confidence: 0.4,
        novelty: 0.5,
        scope_clarity: 0.4,
        sensitivity_safety: 0.9,
        specificity: 0.4,
      },
      reason_codes: ["low_confidence"],
      rationale:
        "Model did not return a valid admission decision for this candidate, so MMV2 quarantined it deterministically.",
      recommended_ttl_seconds: null,
      requires_reconciliation: false,
    });
  }

  return {
    ...batch,
    decisions,
  };
}

function sanitizeAdmissionBatchUnknown(
  raw: unknown,
  eventId: string,
  canonicalBatch: CanonicalCandidateBatch,
): AdmissionDecisionBatch | null {
  let candidate = raw;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  const normalized = normalizeAdmissionPayload(candidate, eventId);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return null;
  }

  const rawDecisions = Array.isArray((normalized as { decisions?: unknown }).decisions)
    ? (normalized as { decisions: unknown[] }).decisions
    : [];
  const validCandidateIds = new Set(
    canonicalBatch.canonical_candidates.map((entry) => entry.candidate_id),
  );
  const decisions: AdmissionDecisionBatch["decisions"] = [];

  for (const rawDecision of rawDecisions) {
    if (!rawDecision || typeof rawDecision !== "object" || Array.isArray(rawDecision)) {
      continue;
    }
    const source = rawDecision as Record<string, unknown>;
    const candidateId = typeof source.candidate_id === "string" ? source.candidate_id : null;
    if (!candidateId || !validCandidateIds.has(candidateId)) {
      continue;
    }
    decisions.push({
      candidate_id: candidateId,
      decision: sanitizeAdmissionDecisionName(source.decision),
      scores: sanitizeAdmissionScores(source.scores),
      reason_codes: sanitizeAdmissionReasonCodes(source.reason_codes),
      rationale:
        typeof source.rationale === "string" && source.rationale.trim().length > 0
          ? source.rationale
          : "Admission decision was sanitized after model schema drift.",
      recommended_ttl_seconds: Number.isInteger(source.recommended_ttl_seconds)
        ? (source.recommended_ttl_seconds as number)
        : null,
      requires_reconciliation:
        typeof source.requires_reconciliation === "boolean"
          ? source.requires_reconciliation
          : false,
    });
  }

  const parsed = AdmissionDecisionBatchSchema.safeParse({
    schema_version: "admission_decision.v1",
    event_id: eventId,
    decisions,
  });
  if (!parsed.success) {
    return null;
  }
  return ensureAdmissionCoverage(parsed.data, canonicalBatch);
}

function finalizeAdmissionBatch(input: {
  canonicalBatch: CanonicalCandidateBatch;
  parsedBatch: AdmissionDecisionBatch;
  candidateNeighborsById: Record<string, ExistingMemorySummary[]>;
}): AdmissionDecisionBatch {
  return applyAdmissionGuardrails(
    input.canonicalBatch,
    applyReconciliationMetadata(
      input.canonicalBatch,
      ensureAdmissionCoverage(input.parsedBatch, input.canonicalBatch),
      input.candidateNeighborsById,
    ),
  );
}

function needsReconciliation(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
  neighbors: ExistingMemorySummary[],
): boolean {
  if (neighbors.length > 0) {
    return true;
  }
  return candidate.parent_candidate_id !== null || candidate.component_candidate_id !== null;
}

function hasSensitiveRiskFlags(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
): boolean {
  return candidate.risk_flags.some((flag) => flag !== "none" && flag !== "low_confidence");
}

function appendReasonCode(
  decision: AdmissionDecisionRecord,
  reasonCode: AdmissionDecisionRecord["reason_codes"][number],
): AdmissionDecisionRecord["reason_codes"] {
  return Array.from(new Set([...decision.reason_codes, reasonCode]));
}

function applyReconciliationMetadata(
  canonicalBatch: CanonicalCandidateBatch,
  decisions: AdmissionDecisionBatch,
  candidateNeighborsById: Record<string, ExistingMemorySummary[]>,
): AdmissionDecisionBatch {
  const candidateById = new Map(
    canonicalBatch.canonical_candidates.map((candidate) => [candidate.candidate_id, candidate]),
  );
  return {
    ...decisions,
    decisions: decisions.decisions.map((decision) => {
      const candidate = candidateById.get(decision.candidate_id);
      if (!candidate) {
        return decision;
      }
      return {
        ...decision,
        requires_reconciliation: needsReconciliation(
          candidate,
          candidateNeighborsById[decision.candidate_id] ?? [],
        ),
      };
    }),
  };
}

export function applyAdmissionGuardrails(
  canonicalBatch: CanonicalCandidateBatch,
  decisions: AdmissionDecisionBatch,
): AdmissionDecisionBatch {
  const candidateById = new Map(
    canonicalBatch.canonical_candidates.map((candidate) => [candidate.candidate_id, candidate]),
  );
  return {
    ...decisions,
    decisions: decisions.decisions.map((decision) => {
      const candidate = candidateById.get(decision.candidate_id);
      if (!candidate) {
        return { ...decision, decision: "quarantine" as const };
      }
      if (candidate.promotion === "blocked" || hasSensitiveRiskFlags(candidate)) {
        return {
          ...decision,
          decision: decision.decision === "reject" ? "reject" : "quarantine",
          reason_codes: appendReasonCode(decision, "sensitive"),
          requires_reconciliation: false,
        };
      }
      if (decision.scores.sensitivity_safety < 0.5) {
        return {
          ...decision,
          decision: "reject" as const,
          reason_codes: appendReasonCode(decision, "sensitive"),
          requires_reconciliation: false,
        };
      }
      if (candidate.unit_type === "component" && candidate.promotion === "embedded_only") {
        return {
          ...decision,
          decision: "embed_only" as const,
          reason_codes: appendReasonCode(decision, "embedded_component_only"),
          requires_reconciliation: false,
        };
      }
      return decision;
    }),
  };
}

export async function scoreAdmission(input: AdmissionInput): Promise<AdmissionDecisionBatch> {
  const candidateNeighborsById = input.candidateNeighborsById ?? {};
  const prompt = buildAdmissionPrompt({
    modelId: input.modelId,
    rawEvent: input.rawEvent,
    canonicalCandidates: input.canonicalBatch.canonical_candidates,
    responseMode: input.responseMode,
  });
  const result = await input.interpreter.interpret({
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceWindow: input.sourceWindow,
    prompt,
  });
  const rawPayload = extractBatch(result);
  const parsed = AdmissionDecisionBatchSchema.safeParse(
    normalizeAdmissionPayload(rawPayload, input.rawEvent.event_id),
  );
  if (!parsed.success) {
    const sanitized = sanitizeAdmissionBatchUnknown(
      rawPayload,
      input.rawEvent.event_id,
      input.canonicalBatch,
    );
    if (sanitized) {
      return finalizeAdmissionBatch({
        canonicalBatch: input.canonicalBatch,
        parsedBatch: sanitized,
        candidateNeighborsById,
      });
    }

    const repairPrompt = buildRepairPrompt({
      modelId: input.modelId,
      contractVersion: "mmv2-admission-repair-v1",
      originalPayload: rawPayload,
      validationErrors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
      expectedOutputShape: [
        'Top-level keys: "schema_version", "event_id", "decisions".',
        '"schema_version" must be "admission_decision.v1".',
        'Each decision must include "candidate_id", "decision", "scores", "reason_codes", "rationale", "recommended_ttl_seconds", and "requires_reconciliation".',
        '"decision" must be one of "admit", "reject", "quarantine", or "embed_only".',
      ].join("\n"),
      responseSchemaName: "admission_decision_batch",
      responseSchema: AdmissionDecisionBatchSchema,
      responseMode: input.responseMode,
    });
    const repaired = await input.interpreter.interpret({
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      sourceWindow: input.sourceWindow,
      prompt: repairPrompt,
    });
    const repairedRaw = extractBatch(repaired);
    const repairedParsed = AdmissionDecisionBatchSchema.safeParse(
      normalizeAdmissionPayload(repairedRaw, input.rawEvent.event_id),
    );
    if (!repairedParsed.success) {
      const sanitizedRepair = sanitizeAdmissionBatchUnknown(
        repairedRaw,
        input.rawEvent.event_id,
        input.canonicalBatch,
      );
      if (sanitizedRepair) {
        return finalizeAdmissionBatch({
          canonicalBatch: input.canonicalBatch,
          parsedBatch: sanitizedRepair,
          candidateNeighborsById,
        });
      }
      throw new JsonModelOutputError(
        "invalid MMV2 admission repair output",
        repairPrompt.contract,
        JSON.stringify(repairedRaw),
      );
    }
    return finalizeAdmissionBatch({
      canonicalBatch: input.canonicalBatch,
      parsedBatch: repairedParsed.data,
      candidateNeighborsById,
    });
  }
  return finalizeAdmissionBatch({
    canonicalBatch: input.canonicalBatch,
    parsedBatch: parsed.data,
    candidateNeighborsById,
  });
}

export async function scoreAdmissionRuntime(
  input: AdmissionInput,
): Promise<AdmissionDecisionBatch> {
  return scoreAdmission(input);
}
