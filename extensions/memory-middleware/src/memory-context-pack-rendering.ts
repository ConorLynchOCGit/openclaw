import type { ActiveMemorySlot } from "./active-memory-slots.js";
import {
  estimateMemoryContextTokens,
  hashMemoryContextText,
  type CompiledMemoryPack,
  type CompiledMemoryPackPlan,
  type CompiledMemoryPromptContext,
} from "./memory-context-pack-model.js";

function trimSlotTextsToBudget(params: { slots: ActiveMemorySlot[]; maxChars: number }): {
  kept: ActiveMemorySlot[];
  omitted: ActiveMemorySlot[];
} {
  const kept: ActiveMemorySlot[] = [];
  let used = 0;
  for (const slot of params.slots) {
    const line = `- ${slot.promptText}`;
    const projected = used === 0 ? line.length : used + 1 + line.length;
    if (kept.length > 0 && projected > params.maxChars) {
      break;
    }
    if (kept.length === 0 && line.length > params.maxChars) {
      kept.push({
        ...slot,
        promptText: `${slot.promptText.slice(0, Math.max(0, params.maxChars - 5)).trimEnd()}...`,
      });
      break;
    }
    kept.push(slot);
    used = projected;
  }
  return {
    kept,
    omitted: params.slots.slice(kept.length),
  };
}

export function renderCompiledMemoryPack(plan: CompiledMemoryPackPlan): CompiledMemoryPack | null {
  if (plan.slots.length === 0) {
    return null;
  }
  const trimmed = trimSlotTextsToBudget({
    slots: plan.slots,
    maxChars: plan.maxChars,
  });
  const lines = [`## ${plan.title}`, "", ...trimmed.kept.map((slot) => `- ${slot.promptText}`)];
  if (trimmed.omitted.length > 0) {
    lines.push(
      "",
      `- Lower-priority active entries omitted to stay within the prompt budget (${String(trimmed.omitted.length)} more).`,
    );
  }
  const text = lines.join("\n");
  return {
    kind: plan.kind,
    title: plan.title,
    text,
    hash: hashMemoryContextText(text),
    chars: text.length,
    approxTokens: estimateMemoryContextTokens(text.length),
    slotKeys: trimmed.kept.map((slot) => slot.slotKey),
    semanticKeys: trimmed.kept.map((slot) => slot.semanticKey),
    omittedSlotKeys: trimmed.omitted.map((slot) => slot.slotKey),
    sourceIds: [...new Set(trimmed.kept.flatMap((slot) => slot.sourceIds))].sort((a, b) =>
      a.localeCompare(b),
    ),
  };
}

export function renderCompiledMemoryPromptContext(
  packs: CompiledMemoryPack[],
): CompiledMemoryPromptContext | null {
  if (packs.length === 0) {
    return null;
  }
  const text = [
    "## Approved Durable Memory Context",
    "",
    "Use these compiled approved-memory packs as standing context. If the live turn includes newer explicit instructions, follow the live turn.",
    "",
    ...packs.map((pack) => pack.text),
  ].join("\n");

  return {
    text,
    hash: hashMemoryContextText(text),
    packs,
    attachedSlotCount: packs.reduce((sum, pack) => sum + pack.slotKeys.length, 0),
    omittedSlotCount: packs.reduce((sum, pack) => sum + pack.omittedSlotKeys.length, 0),
  };
}
