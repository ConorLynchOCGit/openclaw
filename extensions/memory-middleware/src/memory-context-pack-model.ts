import { createHash } from "node:crypto";
import type { ActiveMemorySlot } from "./active-memory-slots.js";

export type CompiledMemoryPackKind = "user" | "project" | "procedure";

export type CompiledMemoryPackPlan = {
  kind: CompiledMemoryPackKind;
  title: string;
  maxChars: number;
  slots: ActiveMemorySlot[];
};

export type CompiledMemoryPack = {
  kind: CompiledMemoryPackKind;
  title: string;
  text: string;
  hash: string;
  chars: number;
  approxTokens: number;
  slotKeys: string[];
  semanticKeys: string[];
  omittedSlotKeys: string[];
  sourceIds: string[];
};

export type CompiledMemoryPromptContext = {
  text: string;
  hash: string;
  packs: CompiledMemoryPack[];
  attachedSlotCount: number;
  omittedSlotCount: number;
};

export function hashMemoryContextText(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function estimateMemoryContextTokens(chars: number): number {
  return Math.ceil(chars / 4);
}
