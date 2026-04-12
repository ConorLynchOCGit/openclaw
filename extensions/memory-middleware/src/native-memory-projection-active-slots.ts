import type { ActiveMemorySlot } from "./active-memory-slots.js";
import type { MemoryObjectKind } from "./db/runtime.js";
import type {
  NativeMemoryProjectionCandidate,
  SharedBootstrapProjectionTarget,
} from "./native-memory-projection-eligibility.js";

function rankProjectionCandidates(
  candidates: NativeMemoryProjectionCandidate[],
): NativeMemoryProjectionCandidate[] {
  const seen = new Set<string>();
  const ranked = candidates.toSorted(
    (left, right) =>
      right.priority - left.priority ||
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
      left.sourceId.localeCompare(right.sourceId),
  );
  return ranked.filter((candidate) => {
    const key = `${candidate.target}\u0000${candidate.text.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function resolveActiveSlotProjectionPriority(params: {
  slot: ActiveMemorySlot;
  target: SharedBootstrapProjectionTarget;
}): number {
  const base =
    params.target === "user-profile" ? 300 : params.target === "tool-preferences" ? 220 : 180;
  const categoryBoost =
    params.slot.category === "user_correction"
      ? 24
      : params.slot.category === "workflow_guidance"
        ? 20
        : params.slot.category === "project_rule"
          ? 16
          : params.slot.category === "project_fact" || params.slot.category === "unmet_need"
            ? 10
            : 0;
  return base + categoryBoost + Math.round(params.slot.confidence * 100);
}

export function buildNativeMemoryProjectionCandidateFromActiveSlot(
  slot: ActiveMemorySlot,
): NativeMemoryProjectionCandidate | null {
  const target = slot.projectionTargets[0];
  if (!target) {
    return null;
  }
  return {
    sourceId: slot.primarySourceId,
    sourceKind:
      slot.sourceMemoryKind === "procedure"
        ? "reference"
        : (slot.sourceMemoryKind as MemoryObjectKind),
    target,
    priority: resolveActiveSlotProjectionPriority({ slot, target }),
    text: slot.promptText,
    updatedAt: slot.updatedAt,
    ...(slot.projectSlug ? { projectId: slot.projectSlug } : {}),
  };
}

export function buildNativeMemoryProjectionCandidatesFromActiveSlots(
  slots: ActiveMemorySlot[],
): NativeMemoryProjectionCandidate[] {
  return rankProjectionCandidates(
    slots
      .map(buildNativeMemoryProjectionCandidateFromActiveSlot)
      .filter((candidate): candidate is NativeMemoryProjectionCandidate => candidate !== null),
  );
}
