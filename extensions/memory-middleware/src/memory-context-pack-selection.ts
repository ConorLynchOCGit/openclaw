import type { ActiveMemorySlot } from "./active-memory-slots.js";
import type { CompiledMemoryPackPlan } from "./memory-context-pack-model.js";
import type { ActiveMemorySlotCategory } from "./memory-slot-model.js";

const DEFAULT_USER_PACK_MAX_CHARS = 600;
const DEFAULT_PROJECT_PACK_MAX_CHARS = 1_000;
const DEFAULT_PROCEDURE_PACK_MAX_CHARS = 1_000;

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
  return overlap * 40 + recencyBoost(params.slot.updatedAt, 10);
}

function selectSlotsForPack(params: {
  slots: ActiveMemorySlot[];
  score: (slot: ActiveMemorySlot) => number;
  minimumScore?: number;
}): ActiveMemorySlot[] {
  const minimumScore = params.minimumScore ?? 0;
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
    if (seenSelectionKeys.has(entry.slot.selectionKey)) {
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
      }),
    });
  }

  return plans.filter((plan) => plan.slots.length > 0);
}
