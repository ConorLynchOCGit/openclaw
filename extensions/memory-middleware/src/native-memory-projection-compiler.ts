import fs from "node:fs/promises";
import path from "node:path";
import {
  buildGeneratedSectionMarkers,
  containsGeneratedSectionBlock,
  upsertGeneratedSectionBlock,
} from "openclaw/plugin-sdk/memory-core-host-runtime-files";
import type { NativeMemoryProjectionCandidate } from "./native-memory-projection-eligibility.js";
import {
  resolveNativeMemoryProjectionRelativePath,
  type ProjectProjectionFilename,
  type NativeMemoryProjectionTarget,
} from "./native-memory-surfaces.js";

export const NATIVE_MEMORY_PROJECTION_CHAR_BUDGETS = {
  "user-profile": 2400,
  "tool-preferences": 2200,
  "memory-digest": 1800,
  "project-memory-digest": 3200,
  "daily-continuity": 16000,
} as const satisfies Record<NativeMemoryProjectionTarget, number>;

type SharedProjectionRenderableTarget = Extract<
  NativeMemoryProjectionTarget,
  "user-profile" | "tool-preferences" | "memory-digest" | "project-memory-digest"
>;

export type NativeMemoryProjectionFileTarget =
  | {
      target: SharedProjectionRenderableTarget;
      projectSlug?: string;
      projectFileName?: ProjectProjectionFilename;
    }
  | {
      target: "daily-continuity";
      date: string;
    };

export type NativeMemoryProjectionSyncResult = {
  target: NativeMemoryProjectionTarget;
  relPath: string;
  blockId: string;
  changed: boolean;
  wroteFile: boolean;
  changeKind:
    | "unchanged"
    | "created_file"
    | "inserted_block"
    | "updated_block"
    | "recovered_partial_block";
  generatedChars: number;
};

export function resolveProjectionBlockId(target: NativeMemoryProjectionFileTarget): string {
  if (target.target === "project-memory-digest") {
    if (!target.projectSlug) {
      throw new Error("project-memory-digest block id requires a projectSlug");
    }
    return `memory-projection:${target.target}:${target.projectSlug}`;
  }
  return target.target === "daily-continuity"
    ? `memory-projection:${target.target}:${target.date}`
    : `memory-projection:${target.target}`;
}

export function resolveProjectionOutputPath(target: NativeMemoryProjectionFileTarget): string {
  return resolveNativeMemoryProjectionRelativePath(target);
}

export function trimProjectionCandidatesToBudget(params: {
  candidates: NativeMemoryProjectionCandidate[];
  maxChars: number;
}): {
  kept: NativeMemoryProjectionCandidate[];
  omitted: NativeMemoryProjectionCandidate[];
  omittedCount: number;
} {
  const kept: NativeMemoryProjectionCandidate[] = [];
  let used = 0;
  for (const candidate of params.candidates) {
    const line = `- ${candidate.text}`;
    const projected = used === 0 ? line.length : used + 1 + line.length;
    if (kept.length > 0 && projected > params.maxChars) {
      break;
    }
    if (kept.length === 0 && line.length > params.maxChars) {
      kept.push({
        ...candidate,
        text: `${candidate.text.slice(0, Math.max(0, params.maxChars - 5)).trimEnd()}...`,
      });
      used = `- ${kept[0].text}`.length;
      break;
    }
    kept.push(candidate);
    used = projected;
  }

  return {
    kept,
    omitted: params.candidates.slice(kept.length),
    omittedCount: Math.max(0, params.candidates.length - kept.length),
  };
}

export function renderProjectionBody(params: {
  title: string;
  items: string[];
  omittedCount?: number;
}): string {
  const lines = [`## ${params.title}`, ""];
  if (params.items.length === 0) {
    lines.push("- No eligible approved memory is currently projected.");
  } else {
    lines.push(...params.items.map((item) => `- ${item}`));
  }
  if ((params.omittedCount ?? 0) > 0) {
    lines.push(
      "",
      `- Additional eligible entries omitted to stay within the prompt budget (${String(params.omittedCount)} more).`,
    );
  }
  return lines.join("\n");
}

export async function syncProjectionFile(params: {
  workspaceDir: string;
  target: NativeMemoryProjectionFileTarget;
  body: string;
  write: boolean;
}): Promise<NativeMemoryProjectionSyncResult> {
  const relPath = resolveProjectionOutputPath(params.target);
  const filePath = path.join(params.workspaceDir, relPath);
  const blockId = resolveProjectionBlockId(params.target);
  const markers = buildGeneratedSectionMarkers(blockId);
  let existing = "";
  try {
    existing = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const next = upsertGeneratedSectionBlock({
    content: existing,
    blockId,
    body: params.body,
  });
  const hadCompleteBlock = containsGeneratedSectionBlock(existing, blockId);
  const hadPartialBlock =
    !hadCompleteBlock && (existing.includes(markers.start) || existing.includes(markers.end));
  const changeKind = !next.changed
    ? "unchanged"
    : existing.length === 0
      ? "created_file"
      : hadCompleteBlock
        ? "updated_block"
        : hadPartialBlock
          ? "recovered_partial_block"
          : "inserted_block";

  if (params.write && next.changed) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, next.content, "utf-8");
  }

  return {
    target: params.target.target,
    relPath,
    blockId,
    changed: next.changed,
    wroteFile: params.write && next.changed,
    changeKind,
    generatedChars: params.body.length,
  };
}
