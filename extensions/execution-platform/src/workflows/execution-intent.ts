import { z } from "zod";

export const EXECUTION_INTENTS = [
  "unspecified",
  "source_grounding",
  "context_supply",
  "resource_materialization",
  "source_edit",
  "validation",
  "review",
  "docs",
  "readback",
  "closeout",
  "human_decision",
] as const;

export const EVIDENCE_MODES = [
  "read_only_evidence",
  "changed_file_evidence",
  "validation_evidence",
  "review_evidence",
  "context_handoff_evidence",
  "planning_artifact_evidence",
  "human_decision_evidence",
  "closeout_evidence",
] as const;

export const ExecutionIntentSchema = z.enum(EXECUTION_INTENTS);
export const EvidenceModeSchema = z.enum(EVIDENCE_MODES);

export type ExecutionIntent = (typeof EXECUTION_INTENTS)[number];
export type EvidenceMode = (typeof EVIDENCE_MODES)[number];

type ExecutionIntentCapabilityShape = {
  capabilityId: string;
  roleClass: string;
  canEditSource: boolean;
  canInspectRepo: boolean;
  canRunValidation: boolean;
  supportedExecutionIntents: readonly ExecutionIntent[];
};

const EXECUTION_INTENT_ALIASES = new Map<string, ExecutionIntent>([
  ["source-grounding", "source_grounding"],
  ["sourceGrounding", "source_grounding"],
  ["grounding", "source_grounding"],
  ["context-supply", "context_supply"],
  ["contextSupply", "context_supply"],
  ["resource-materialization", "resource_materialization"],
  ["resourceMaterialization", "resource_materialization"],
  ["source-edit", "source_edit"],
  ["sourceEdit", "source_edit"],
  ["code_edit", "source_edit"],
  ["file_edit", "source_edit"],
  ["human-decision", "human_decision"],
  ["humanDecision", "human_decision"],
]);

function normalizedEnumToken(value: string): string {
  return value.trim().replace(/\s+/gu, "_");
}

export function normalizeExecutionIntent(value: unknown): ExecutionIntent | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const direct = ExecutionIntentSchema.safeParse(trimmed);
  if (direct.success) {
    return direct.data;
  }
  const alias = EXECUTION_INTENT_ALIASES.get(trimmed);
  if (alias) {
    return alias;
  }
  const normalized = ExecutionIntentSchema.safeParse(normalizedEnumToken(trimmed));
  return normalized.success ? normalized.data : null;
}

export function normalizeEvidenceModes(values: unknown): EvidenceMode[] {
  const source = Array.isArray(values) ? values : typeof values === "string" ? [values] : [];
  const output: EvidenceMode[] = [];
  for (const value of source) {
    if (typeof value !== "string") {
      continue;
    }
    const normalized = EvidenceModeSchema.safeParse(normalizedEnumToken(value));
    if (normalized.success && !output.includes(normalized.data)) {
      output.push(normalized.data);
    }
  }
  return output;
}

export function evidenceModesForCapability(input: {
  capability: { evidenceProducedKinds: readonly string[] };
  executionIntent?: ExecutionIntent | null;
}): EvidenceMode[] {
  const modes = new Set<EvidenceMode>();
  for (const kind of input.capability.evidenceProducedKinds) {
    if (kind === "source_change") {
      modes.add("changed_file_evidence");
    } else if (kind === "test_validation") {
      modes.add("validation_evidence");
    } else if (kind === "review") {
      modes.add("review_evidence");
    } else if (kind === "context_handoff") {
      modes.add("context_handoff_evidence");
    } else if (kind === "human_decision") {
      modes.add("human_decision_evidence");
    } else if (kind === "closeout") {
      modes.add("closeout_evidence");
    } else if (
      kind === "planning_capsule" ||
      kind === "action_graph" ||
      kind === "research_brief"
    ) {
      modes.add("planning_artifact_evidence");
    } else {
      modes.add("read_only_evidence");
    }
  }
  if (input.executionIntent === "source_grounding" || input.executionIntent === "readback") {
    modes.add("read_only_evidence");
    modes.delete("changed_file_evidence");
  }
  if (input.executionIntent === "source_edit") {
    modes.add("changed_file_evidence");
  }
  return [...modes];
}

export function executionIntentCapabilityConflict(input: {
  executionIntent: ExecutionIntent;
  capability: Pick<
    ExecutionIntentCapabilityShape,
    | "capabilityId"
    | "roleClass"
    | "canEditSource"
    | "canInspectRepo"
    | "canRunValidation"
    | "supportedExecutionIntents"
  >;
}): string | null {
  const { executionIntent, capability } = input;
  if (executionIntent === "unspecified") {
    return "execution_intent_missing";
  }
  if (capability.supportedExecutionIntents.includes(executionIntent)) {
    return null;
  }
  if (executionIntent === "source_edit" && !capability.canEditSource) {
    return "execution_intent_requires_edit_capability";
  }
  if (executionIntent === "source_grounding" && capability.canEditSource) {
    return "execution_intent_read_only_conflicts_with_edit_capability";
  }
  if (executionIntent === "validation" && !capability.canRunValidation) {
    return "execution_intent_requires_validation_capability";
  }
  if (executionIntent === "context_supply") {
    return "execution_intent_requires_context_capability";
  }
  if (executionIntent === "review" && !["review", "observability"].includes(capability.roleClass)) {
    return "execution_intent_requires_review_capability";
  }
  if (executionIntent === "readback" && capability.roleClass !== "observability") {
    return "execution_intent_requires_readback_capability";
  }
  if (executionIntent === "closeout" && capability.roleClass !== "closeout") {
    return "execution_intent_requires_closeout_capability";
  }
  return null;
}
