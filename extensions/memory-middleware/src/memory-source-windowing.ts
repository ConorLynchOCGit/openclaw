import { createHash } from "node:crypto";
import type {
  MemoryBlockListKind,
  MemoryProvenanceAnchor,
  MemoryProvenanceRegion,
  MemoryScopeEnvelope,
  MemorySourceEnvelope,
  NormalizedMemoryBlock,
} from "./memory-source-normalization.js";

export type NormalizedMemorySourceWindow = {
  id: string;
  source: MemorySourceEnvelope;
  headingPath: string[];
  blocks: NormalizedMemoryBlock[];
  windowText: string;
  listKinds: MemoryBlockListKind[];
  scope: MemoryScopeEnvelope;
  provenance: MemoryProvenanceRegion;
};

function commonHeadingPath(blocks: NormalizedMemoryBlock[]): string[] {
  const first = blocks[0]?.headingPath ?? [];
  let prefix = [...first];
  for (const block of blocks.slice(1)) {
    while (prefix.length > 0 && prefix.some((entry, index) => block.headingPath[index] !== entry)) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}

function mergeScope(blocks: NormalizedMemoryBlock[], headingPath: string[]): MemoryScopeEnvelope {
  const explicitScopeMarkers = new Set<string>(headingPath);
  const contextualScopeMarkers = new Set<string>();
  const parentContext: MemoryScopeEnvelope["parentContext"] = [];
  let projectScope: string | undefined;
  let workflowScope: string | undefined;

  for (const block of blocks) {
    projectScope ??= block.scope.projectScope;
    workflowScope ??= block.scope.workflowScope;
    for (const marker of block.scope.explicitScopeMarkers) {
      explicitScopeMarkers.add(marker);
    }
    for (const marker of block.scope.contextualScopeMarkers) {
      contextualScopeMarkers.add(marker);
    }
    for (const entry of block.scope.parentContext) {
      if (
        !parentContext.some(
          (existing) => existing.role === entry.role && existing.text === entry.text,
        )
      ) {
        parentContext.push(entry);
      }
    }
  }

  return {
    headingPath,
    ...(projectScope ? { projectScope } : {}),
    ...(workflowScope ? { workflowScope } : {}),
    explicitScopeMarkers: [...explicitScopeMarkers],
    contextualScopeMarkers: [...contextualScopeMarkers],
    parentContext,
  };
}

function mergeAnchors(blocks: NormalizedMemoryBlock[]): MemoryProvenanceAnchor[] {
  const seen = new Set<string>();
  const anchors: MemoryProvenanceAnchor[] = [];
  for (const block of blocks) {
    for (const anchor of block.provenance.anchors) {
      const key = JSON.stringify(anchor);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      anchors.push(anchor);
    }
  }
  return anchors;
}

function buildWindowProvenance(
  source: MemorySourceEnvelope,
  headingPath: string[],
  blocks: NormalizedMemoryBlock[],
): MemoryProvenanceRegion {
  const lineStarts = blocks
    .map((block) => block.provenance.lineStart)
    .filter((value): value is number => typeof value === "number");
  const lineEnds = blocks
    .map((block) => block.provenance.lineEnd)
    .filter((value): value is number => typeof value === "number");
  const charStarts = blocks
    .map((block) => block.provenance.charStart)
    .filter((value): value is number => typeof value === "number");
  const charEnds = blocks
    .map((block) => block.provenance.charEnd)
    .filter((value): value is number => typeof value === "number");
  const messageTimestamp =
    blocks.find((block) => typeof block.provenance.messageTimestamp === "string")?.provenance
      .messageTimestamp ?? undefined;

  return {
    source,
    headingPath,
    anchors: mergeAnchors(blocks),
    ...(lineStarts.length > 0 ? { lineStart: Math.min(...lineStarts) } : {}),
    ...(lineEnds.length > 0 ? { lineEnd: Math.max(...lineEnds) } : {}),
    ...(charStarts.length > 0 ? { charStart: Math.min(...charStarts) } : {}),
    ...(charEnds.length > 0 ? { charEnd: Math.max(...charEnds) } : {}),
    ...(typeof blocks[0]?.provenance.segmentIndex === "number"
      ? { segmentIndex: blocks[0].provenance.segmentIndex }
      : {}),
    ...(messageTimestamp ? { messageTimestamp } : {}),
  };
}

function buildWindowId(sourceId: string, blocks: NormalizedMemoryBlock[], text: string): string {
  return createHash("sha256")
    .update([sourceId, blocks.map((block) => block.id).join("|"), text].join("|"))
    .digest("hex")
    .slice(0, 16);
}

function buildWindow(blocks: NormalizedMemoryBlock[]): NormalizedMemorySourceWindow {
  const source = blocks[0]?.source;
  if (!source) {
    throw new Error("cannot build memory source window from an empty block set");
  }
  const headingPath = commonHeadingPath(blocks);
  const windowText = blocks
    .map((block) => block.blockText)
    .join("\n\n")
    .trim();
  const provenance = buildWindowProvenance(source, headingPath, blocks);
  return {
    id: buildWindowId(source.sourceId, blocks, windowText),
    source,
    headingPath,
    blocks,
    windowText,
    listKinds: [...new Set(blocks.map((block) => block.listKind))],
    scope: mergeScope(blocks, headingPath),
    provenance,
  };
}

function shouldMergeWindowBlocks(params: {
  current: NormalizedMemoryBlock[];
  next: NormalizedMemoryBlock;
  maxWindowChars: number;
  maxBlocksPerWindow: number;
}): boolean {
  if (params.current.length === 0) {
    return true;
  }
  if (params.current.length >= params.maxBlocksPerWindow) {
    return false;
  }
  const currentChars = params.current.reduce((sum, block) => sum + block.blockText.length, 0);
  const nextChars = params.next.blockText.length + (params.current.length > 0 ? 2 : 0);
  if (currentChars + nextChars > params.maxWindowChars) {
    return false;
  }
  const currentHeading = params.current[0]?.headingPath.join(" > ") ?? "";
  const nextHeading = params.next.headingPath.join(" > ");
  return currentHeading === nextHeading;
}

export function buildMemorySourceWindows(params: {
  blocks: NormalizedMemoryBlock[];
  maxWindowChars: number;
  maxBlocksPerWindow?: number;
}): NormalizedMemorySourceWindow[] {
  const maxBlocksPerWindow = params.maxBlocksPerWindow ?? 6;
  const windows: NormalizedMemorySourceWindow[] = [];
  let current: NormalizedMemoryBlock[] = [];

  const flush = () => {
    if (current.length === 0) {
      return;
    }
    windows.push(buildWindow(current));
    current = [];
  };

  for (const block of params.blocks) {
    if (
      !shouldMergeWindowBlocks({
        current,
        next: block,
        maxWindowChars: params.maxWindowChars,
        maxBlocksPerWindow,
      })
    ) {
      flush();
    }
    current.push(block);
  }
  flush();
  return windows;
}
