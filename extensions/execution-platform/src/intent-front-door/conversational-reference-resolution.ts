import type {
  ConversationReferenceCandidate,
  ConversationReferenceResolution,
  ConversationRoutingContext,
} from "./conversation-routing-context.ts";

const REFERENCE_PATTERNS = [
  /\bthat\b/iu,
  /\bit\b/iu,
  /^\s*continue(?:\s+that|\s+it)?\s*\.?$/iu,
  /^\s*cancel\s+(?:it|that(?:\s+job)?)\s*\.?$/iu,
  /^\s*ship\s+it\s*\.?$/iu,
  /^\s*do\s+it\s*\.?$/iu,
  /^\s*retry\s+that\s*\.?$/iu,
  /^\s*approve\s+it\s*\.?$/iu,
];

export function resolveConversationalReference(input: {
  text: string;
  context: ConversationRoutingContext;
}): ConversationReferenceResolution {
  if (!isConversationalReferenceText(input.text)) {
    return resolution("not_reference", null, null, ["not_conversational_reference"], null);
  }

  const selected = selectedWorkQueueCandidate(input.context);
  if (selected?.freshness === "fresh") {
    return resolved(selected, input.text);
  }
  if (selected) {
    return resolution(
      "stale",
      selected.targetRef,
      selected.source,
      ["selected_work_queue_item_stale", "clarification_required"],
      "Which current item should this refer to?",
    );
  }

  const active = input.context.activeRuntimeJobs.filter((job) => job.freshness === "fresh");
  if (active.length === 1) {
    return resolved(
      {
        targetRef: `runtime-job://${active[0]!.runtimeJobId}`,
        targetKind: "runtime_job",
        source: "single_active_runtime_job",
        freshness: "fresh",
      },
      input.text,
    );
  }
  if (active.length > 1) {
    return resolution(
      "ambiguous",
      null,
      null,
      ["multiple_active_runtime_jobs", "clarification_required"],
      "Which active job should this refer to?",
    );
  }

  const clarification = input.context.pendingClarifications.find(
    (ref) => ref.freshness === "fresh",
  );
  if (clarification) {
    return resolved(
      {
        targetRef: clarification.targetRef,
        targetKind: "clarification",
        source: "pending_clarification",
        freshness: "fresh",
      },
      input.text,
    );
  }

  const approval = input.context.pendingApprovals.find(
    (ref) => ref.freshness === "fresh" && ref.state === "pending",
  );
  if (approval) {
    return resolved(
      {
        targetRef: approval.targetRef,
        targetKind: "approval",
        source: "pending_approval",
        freshness: "fresh",
      },
      input.text,
    );
  }

  return resolution(
    "missing_target",
    null,
    null,
    ["reference_target_missing", "clarification_required"],
    "What should this refer to?",
  );
}

export function isConversationalReferenceText(text: string): boolean {
  const trimmed = text.trim();
  return REFERENCE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function selectedWorkQueueCandidate(
  context: ConversationRoutingContext,
): ConversationReferenceCandidate | null {
  const selected = context.selectedWorkQueueItem;
  if (!selected) {
    return null;
  }
  return {
    targetRef: `work-item://${selected.workItemId}`,
    targetKind: "work_item",
    source: "selected_work_queue_item",
    freshness: selected.freshness,
  };
}

function resolved(
  candidate: ConversationReferenceCandidate,
  text: string,
): ConversationReferenceResolution {
  const reasonCodes = ["conversation_reference_resolved", `target_source_${candidate.source}`];
  if (/\b(cancel|ship|approve|retry)\b/iu.test(text)) {
    reasonCodes.push("target_resolution_only_validator_required");
  }
  return resolution("resolved", candidate.targetRef, candidate.source, reasonCodes, null);
}

function resolution(
  outcome: ConversationReferenceResolution["outcome"],
  targetRef: string | null,
  targetSource: ConversationReferenceResolution["targetSource"],
  reasonCodes: string[],
  clarificationQuestion: string | null,
): ConversationReferenceResolution {
  return {
    outcome,
    targetRef,
    targetSource,
    reasonCodes,
    clarificationQuestion,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}
