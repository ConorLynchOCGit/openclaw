import type { ActiveMemorySlot } from "./active-memory-slots.js";
import type { CompiledMemoryPackPlan } from "./memory-context-pack-model.js";
import type { ActiveMemorySlotCategory } from "./memory-slot-model.js";

const DEFAULT_USER_PACK_MAX_CHARS = 600;
const DEFAULT_PROJECT_PACK_MAX_CHARS = 1_000;
const DEFAULT_PROCEDURE_PACK_MAX_CHARS = 1_000;
const DEFAULT_USER_PACK_MAX_SLOTS = 4;
const DEFAULT_PROJECT_PACK_MAX_SLOTS = 5;
const DEFAULT_PROCEDURE_PACK_MAX_SLOTS = 2;

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .split(/\s+/u)
      .map((part) => normalizeToken(part))
      .filter((part) => part.length >= 3),
  );
}

function daysOld(updatedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(updatedAt)) / 86_400_000));
}

function recencyBoost(updatedAt: string, max = 20): number {
  return Math.max(0, max - daysOld(updatedAt));
}

function slotVisibleToAgent(slot: ActiveMemorySlot, agentId: string | undefined): boolean {
  if (slot.scopeKind !== "agent") {
    return true;
  }
  if (!agentId || !slot.agentKey) {
    return false;
  }
  return slot.agentKey === agentId;
}

function directiveStrengthScore(slot: ActiveMemorySlot): number {
  const promptTokens = tokenize(slot.promptText);
  const tokenCount = promptTokens.size;
  const fieldKeyBoost = typeof slot.facets.fieldKey === "string" ? 14 : 0;
  const templateBoost = typeof slot.compatibilityTemplate === "string" ? 12 : 0;
  const actionBoost =
    typeof slot.facets.recommendedAction === "string"
      ? typeof slot.facets.avoidAction === "string"
        ? 26
        : 16
      : 0;
  const conditionalBoost =
    slot.promptText.includes(" instead of ") || slot.promptText.includes(" unless ")
      ? 12
      : slot.promptText.includes(" when ")
        ? 8
        : 0;
  const tokenWindowBoost =
    tokenCount <= 2
      ? -24
      : tokenCount <= 4
        ? -8
        : tokenCount <= 14
          ? 10
          : tokenCount <= 22
            ? 2
            : -8;
  return fieldKeyBoost + templateBoost + actionBoost + conditionalBoost + tokenWindowBoost;
}

function selectionScopeKey(slot: ActiveMemorySlot): string {
  return [
    slot.category,
    slot.scopeKind,
    slot.projectSlug ?? "",
    slot.agentKey ?? "",
    slot.sessionKey ?? "",
  ].join("|");
}

function countTokenOverlap(left: Set<string>, right: Set<string>): number {
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) {
      overlap += 1;
    }
  }
  return overlap;
}

function isSemanticallyRedundant(params: {
  candidate: ActiveMemorySlot;
  selected: ActiveMemorySlot;
}): boolean {
  if (selectionScopeKey(params.candidate) !== selectionScopeKey(params.selected)) {
    return false;
  }
  if (
    params.candidate.subject &&
    params.selected.subject &&
    normalizeToken(params.candidate.subject) !== normalizeToken(params.selected.subject)
  ) {
    return false;
  }
  const candidateTokens = tokenize(params.candidate.promptText);
  const selectedTokens = tokenize(params.selected.promptText);
  if (candidateTokens.size === 0 || selectedTokens.size === 0) {
    return false;
  }
  const overlap = countTokenOverlap(candidateTokens, selectedTokens);
  const smallerTokenSet = Math.min(candidateTokens.size, selectedTokens.size);
  if (overlap < 3 || smallerTokenSet === 0) {
    return false;
  }
  const overlapRatio = overlap / smallerTokenSet;
  const sharedTags = params.candidate.tags.some((tag) => params.selected.tags.includes(tag));
  return (
    overlapRatio >= 0.8 &&
    (sharedTags || params.candidate.semanticKey === params.selected.semanticKey)
  );
}

function scoreUserSlot(slot: ActiveMemorySlot): number {
  const categoryBoost =
    slot.category === "user_correction" ? 220 : slot.category === "user_preference" ? 180 : 0;
  const conciseDirectiveBoost =
    slot.promptText.length <= 80 ? 24 : slot.promptText.length <= 140 ? 10 : -10;
  const styleBoost = slot.tags.includes("response_style") ? 18 : 0;
  return (
    categoryBoost +
    conciseDirectiveBoost +
    styleBoost +
    directiveStrengthScore(slot) +
    recencyBoost(slot.updatedAt, 18) +
    Math.round(slot.confidence * 100)
  );
}

function scoreProjectSlot(params: { slot: ActiveMemorySlot; promptTokens: Set<string> }): number {
  const slotTokens = tokenize(params.slot.searchText);
  let overlap = 0;
  for (const token of slotTokens) {
    if (params.promptTokens.has(token)) {
      overlap += 1;
    }
  }

  const categoryBoost =
    params.slot.category === "project_rule"
      ? 80
      : params.slot.category === "workflow_guidance"
        ? 75
        : params.slot.category === "project_fact"
          ? 55
          : params.slot.category === "unmet_need"
            ? 40
            : 0;
  const scopeBoost = params.slot.projectScoped ? 25 : 0;
  const subjectBoost = params.slot.subject
    ? params.promptTokens.has(normalizeToken(params.slot.subject))
      ? 16
      : 0
    : 0;
  const conciseDirectiveBoost =
    params.slot.promptText.length <= 120 ? 12 : params.slot.promptText.length <= 220 ? 4 : -8;
  return (
    overlap * 35 +
    categoryBoost +
    scopeBoost +
    subjectBoost +
    conciseDirectiveBoost +
    directiveStrengthScore(params.slot) +
    recencyBoost(params.slot.updatedAt, 14)
  );
}

function scoreProcedureSlot(params: { slot: ActiveMemorySlot; promptTokens: Set<string> }): number {
  const slotTokens = tokenize(params.slot.searchText);
  let overlap = 0;
  for (const token of slotTokens) {
    if (params.promptTokens.has(token)) {
      overlap += 1;
    }
  }
  return (
    overlap * 40 + directiveStrengthScore(params.slot) + recencyBoost(params.slot.updatedAt, 10)
  );
}

function selectSlotsForPack(params: {
  slots: ActiveMemorySlot[];
  score: (slot: ActiveMemorySlot) => number;
  minimumScore?: number;
  maxSlots?: number;
}): ActiveMemorySlot[] {
  const minimumScore = params.minimumScore ?? 0;
  const maxSlots = params.maxSlots ?? Number.POSITIVE_INFINITY;
  const ranked = params.slots
    .map((slot) => ({ slot, score: params.score(slot) }))
    .filter((entry) => entry.score > minimumScore)
    .toSorted(
      (left, right) =>
        right.score - left.score ||
        Date.parse(right.slot.updatedAt) - Date.parse(left.slot.updatedAt) ||
        left.slot.slotKey.localeCompare(right.slot.slotKey),
    );
  const seenSelectionKeys = new Set<string>();
  const selected: ActiveMemorySlot[] = [];
  for (const entry of ranked) {
    if (selected.length >= maxSlots) {
      break;
    }
    if (seenSelectionKeys.has(entry.slot.selectionKey)) {
      continue;
    }
    if (
      selected.some((chosen) =>
        isSemanticallyRedundant({ candidate: entry.slot, selected: chosen }),
      )
    ) {
      continue;
    }
    seenSelectionKeys.add(entry.slot.selectionKey);
    selected.push(entry.slot);
  }
  return selected;
}

function isUserPackCategory(category: ActiveMemorySlotCategory): boolean {
  return category === "user_preference" || category === "user_correction";
}

function isProjectPackCategory(category: ActiveMemorySlotCategory): boolean {
  return (
    category === "project_fact" ||
    category === "project_rule" ||
    category === "workflow_guidance" ||
    category === "unmet_need"
  );
}

function isProcedurePackCategory(category: ActiveMemorySlotCategory): boolean {
  return category === "procedure";
}

export function selectCompiledMemoryPackPlans(params: {
  slots: ActiveMemorySlot[];
  prompt: string;
  agentId?: string;
  includeProcedures?: boolean;
}): CompiledMemoryPackPlan[] {
  const promptTokens = tokenize(params.prompt);
  const visibleSlots = params.slots.filter((slot) => slotVisibleToAgent(slot, params.agentId));

  const plans: CompiledMemoryPackPlan[] = [
    {
      kind: "user",
      title: "User Memory Pack",
      maxChars: DEFAULT_USER_PACK_MAX_CHARS,
      slots: selectSlotsForPack({
        slots: visibleSlots.filter(
          (slot) =>
            !slot.projectScoped &&
            slot.scopeKind !== "session" &&
            isUserPackCategory(slot.category),
        ),
        score: scoreUserSlot,
        maxSlots: DEFAULT_USER_PACK_MAX_SLOTS,
      }),
    },
    {
      kind: "project",
      title: "Project Memory Pack",
      maxChars: DEFAULT_PROJECT_PACK_MAX_CHARS,
      slots: selectSlotsForPack({
        slots: visibleSlots.filter(
          (slot) =>
            slot.scopeKind !== "session" &&
            (slot.projectScoped || isProjectPackCategory(slot.category)),
        ),
        score: (slot) =>
          scoreProjectSlot({
            slot,
            promptTokens,
          }),
        minimumScore: 34,
        maxSlots: DEFAULT_PROJECT_PACK_MAX_SLOTS,
      }),
    },
  ];

  if (params.includeProcedures) {
    plans.push({
      kind: "procedure",
      title: "Procedure Memory Pack",
      maxChars: DEFAULT_PROCEDURE_PACK_MAX_CHARS,
      slots: selectSlotsForPack({
        slots: visibleSlots.filter((slot) => isProcedurePackCategory(slot.category)),
        score: (slot) =>
          scoreProcedureSlot({
            slot,
            promptTokens,
          }),
        minimumScore: 70,
        maxSlots: DEFAULT_PROCEDURE_PACK_MAX_SLOTS,
      }),
    });
  }

  return plans.filter((plan) => plan.slots.length > 0);
}
