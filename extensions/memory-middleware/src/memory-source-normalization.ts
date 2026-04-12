import { createHash } from "node:crypto";

export type NormalizedMemorySourceKind =
  | "document"
  | "transcript"
  | "tool_result"
  | "summary"
  | "workspace_excerpt"
  | "retrieved_memory";

export type MemoryContextRole =
  | "system"
  | "user"
  | "assistant"
  | "tool"
  | "tool_use"
  | "tool_result";

export type NormalizedTranscriptContextEntry = {
  role: MemoryContextRole;
  text: string;
  timestamp?: number;
};

export type NormalizedMemorySource = {
  kind: NormalizedMemorySourceKind;
  sourceId: string;
  path?: string;
  sessionKey?: string;
  projectId?: string;
  agentId?: string;
  sourceClass?: string;
  toolName?: string;
  retrievalKey?: string;
  summaryKind?: string;
  workspacePath?: string;
};

export type MemorySourceEnvelope = NormalizedMemorySource;

export type MemoryProvenanceAnchor =
  | {
      kind: "segment";
      segmentIndex: number;
    }
  | {
      kind: "line_range";
      lineStart: number;
      lineEnd: number;
    }
  | {
      kind: "char_range";
      charStart: number;
      charEnd: number;
    }
  | {
      kind: "message";
      messageTimestamp: string;
    };

export type MemoryProvenanceRegion = {
  source: MemorySourceEnvelope;
  headingPath: string[];
  anchors: MemoryProvenanceAnchor[];
  lineStart?: number;
  lineEnd?: number;
  charStart?: number;
  charEnd?: number;
  segmentIndex?: number;
  messageTimestamp?: string;
};

export type MemoryScopeEnvelope = {
  headingPath: string[];
  projectScope?: string;
  workflowScope?: string;
  explicitScopeMarkers: string[];
  contextualScopeMarkers: string[];
  parentContext: NormalizedTranscriptContextEntry[];
};

export type MemoryBlockListKind = "none" | "ordered" | "unordered" | "checklist";

export type NormalizedMemoryBlock = {
  id: string;
  source: MemorySourceEnvelope;
  blockText: string;
  headingPath: string[];
  listKind: MemoryBlockListKind;
  structuredChildren: string[];
  scope: MemoryScopeEnvelope;
  provenance: MemoryProvenanceRegion;
};

type DocumentLogicalLine = {
  number: number;
  text: string;
  indent: number;
  listKind: MemoryBlockListKind;
};

const STANDALONE_LINE_CLUSTER_MAX_CHARS = 48;
const STANDALONE_LINE_CLUSTER_MAX_LINES = 8;

export function normalizeMemoryText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function trimBlock(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function endsSentence(value: string): boolean {
  return /[.!?`)]$/.test(value.trim());
}

function buildBlockId(sourceId: string, region: MemoryProvenanceRegion, text: string): string {
  return createHash("sha256")
    .update(
      [
        sourceId,
        String(region.segmentIndex ?? ""),
        String(region.lineStart ?? ""),
        String(region.lineEnd ?? ""),
        String(region.charStart ?? ""),
        String(region.charEnd ?? ""),
        region.headingPath.join(">"),
        text,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 16);
}

function readLeadingIndent(value: string): number {
  const match = value.match(/^\s*/);
  return match?.[0].length ?? 0;
}

function stripListMarker(value: string): { text: string; listKind: MemoryBlockListKind } | null {
  const ordered = value.match(/^\s*\d+[.)]\s+(.+)$/);
  if (ordered?.[1]) {
    return { text: trimBlock(ordered[1]), listKind: "ordered" };
  }
  const checklist = value.match(/^\s*[-*]\s+\[(?: |x|X)\]\s+(.+)$/);
  if (checklist?.[1]) {
    return { text: trimBlock(checklist[1]), listKind: "checklist" };
  }
  const unordered = value.match(/^\s*[-*]\s+(.+)$/);
  if (unordered?.[1]) {
    return { text: trimBlock(unordered[1]), listKind: "unordered" };
  }
  return null;
}

function appendContinuation(base: string, addition: string): string {
  const trimmed = trimBlock(addition);
  if (!trimmed) {
    return base;
  }
  return `${base.trimEnd()} ${trimmed}`;
}

function buildScopeEnvelope(params: {
  headingPath: string[];
  projectScope?: string;
  workflowScope?: string;
  contextualScopeMarkers?: string[];
  parentContext?: NormalizedTranscriptContextEntry[];
}): MemoryScopeEnvelope {
  return {
    headingPath: [...params.headingPath],
    ...(params.projectScope ? { projectScope: params.projectScope } : {}),
    ...(params.workflowScope ? { workflowScope: params.workflowScope } : {}),
    explicitScopeMarkers: [...params.headingPath],
    contextualScopeMarkers: [...(params.contextualScopeMarkers ?? [])],
    parentContext: [...(params.parentContext ?? [])],
  };
}

function buildProvenanceRegion(params: {
  source: MemorySourceEnvelope;
  headingPath: string[];
  lineStart?: number;
  lineEnd?: number;
  charStart?: number;
  charEnd?: number;
  segmentIndex?: number;
  messageTimestamp?: string;
}): MemoryProvenanceRegion {
  const anchors: MemoryProvenanceAnchor[] = [];
  if (typeof params.segmentIndex === "number") {
    anchors.push({ kind: "segment", segmentIndex: params.segmentIndex });
  }
  if (typeof params.lineStart === "number" && typeof params.lineEnd === "number") {
    anchors.push({
      kind: "line_range",
      lineStart: params.lineStart,
      lineEnd: params.lineEnd,
    });
  }
  if (typeof params.charStart === "number" && typeof params.charEnd === "number") {
    anchors.push({
      kind: "char_range",
      charStart: params.charStart,
      charEnd: params.charEnd,
    });
  }
  if (typeof params.messageTimestamp === "string" && params.messageTimestamp.trim()) {
    anchors.push({
      kind: "message",
      messageTimestamp: params.messageTimestamp,
    });
  }
  return {
    source: params.source,
    headingPath: [...params.headingPath],
    anchors,
    ...(typeof params.lineStart === "number" ? { lineStart: params.lineStart } : {}),
    ...(typeof params.lineEnd === "number" ? { lineEnd: params.lineEnd } : {}),
    ...(typeof params.charStart === "number" ? { charStart: params.charStart } : {}),
    ...(typeof params.charEnd === "number" ? { charEnd: params.charEnd } : {}),
    ...(typeof params.segmentIndex === "number" ? { segmentIndex: params.segmentIndex } : {}),
    ...(typeof params.messageTimestamp === "string" && params.messageTimestamp.trim()
      ? { messageTimestamp: params.messageTimestamp }
      : {}),
  };
}

function buildDocumentLogicalLines(
  blockLines: Array<{ number: number; text: string }>,
): DocumentLogicalLine[] {
  const logicalLines: DocumentLogicalLine[] = [];
  for (const line of blockLines) {
    const previous = logicalLines.at(-1);
    const list = stripListMarker(line.text);
    const indent = readLeadingIndent(line.text);
    if (list) {
      if (previous && previous.listKind !== "none" && indent > previous.indent) {
        previous.text = appendContinuation(previous.text, list.text);
        continue;
      }
      logicalLines.push({
        number: line.number,
        text: list.text,
        indent,
        listKind: list.listKind,
      });
      continue;
    }
    const trimmed = trimBlock(line.text);
    if (!trimmed) {
      continue;
    }
    const previousText = previous ? trimBlock(previous.text) : "";
    const shortStandaloneNeighbor =
      previous &&
      previous.listKind === "none" &&
      indent === previous.indent &&
      previousText.length > 0 &&
      ((previousText.length <= STANDALONE_LINE_CLUSTER_MAX_CHARS &&
        trimmed.length <= STANDALONE_LINE_CLUSTER_MAX_CHARS) ||
        endsSentence(previousText));
    if (
      previous &&
      !shortStandaloneNeighbor &&
      (previous.listKind === "none" || indent > previous.indent)
    ) {
      previous.text = appendContinuation(previous.text, trimmed);
      continue;
    }
    logicalLines.push({
      number: line.number,
      text: trimmed,
      indent,
      listKind: "none",
    });
  }
  return logicalLines;
}

function shouldEmitStandaloneLineBlocks(logicalLines: DocumentLogicalLine[]): boolean {
  if (logicalLines.length < 2 || logicalLines.length > STANDALONE_LINE_CLUSTER_MAX_LINES) {
    return false;
  }
  return logicalLines.every(
    (line) =>
      line.listKind === "none" &&
      trimBlock(line.text).length > 0 &&
      (trimBlock(line.text).length <= STANDALONE_LINE_CLUSTER_MAX_CHARS ||
        endsSentence(trimBlock(line.text))),
  );
}

function splitByCharWindow(
  text: string,
  maxChars: number,
): Array<{ text: string; charStart: number }> {
  if (text.length <= maxChars) {
    return [{ text, charStart: 0 }];
  }
  const parts: Array<{ text: string; charStart: number }> = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxChars);
    if (end < text.length) {
      const boundary = text.lastIndexOf("\n", end);
      if (boundary > start + Math.floor(maxChars / 3)) {
        end = boundary;
      }
    }
    const chunk = trimBlock(text.slice(start, end));
    if (chunk) {
      const rawChunkStart = text.indexOf(chunk, start);
      parts.push({
        text: chunk,
        charStart: rawChunkStart >= start ? rawChunkStart : start,
      });
    }
    start = end + 1;
  }
  return parts;
}

function buildDocumentBlocksForSection(params: {
  source: MemorySourceEnvelope;
  headingPath: string[];
  bodyLines: Array<{ number: number; text: string }>;
  maxBlockChars: number;
  projectScope?: string;
}): NormalizedMemoryBlock[] {
  const blocks: NormalizedMemoryBlock[] = [];
  let blockLines: Array<{ number: number; text: string }> = [];
  let nextSegmentIndex = 0;

  const flush = () => {
    if (blockLines.length === 0) {
      return;
    }
    const logicalLines = buildDocumentLogicalLines(blockLines);
    const lineStart = blockLines[0]?.number;
    const lineEnd = blockLines.at(-1)?.number;
    const listLines = logicalLines.filter((line) => line.listKind !== "none");
    const dominantListKind =
      listLines.length > 0 && listLines.length === logicalLines.length
        ? (listLines[0]?.listKind ?? "none")
        : "none";
    const structuredChildren = logicalLines.map((line) => line.text);
    const blockText =
      dominantListKind === "none"
        ? trimBlock(blockLines.map((line) => line.text).join("\n"))
        : trimBlock(structuredChildren.join("\n"));
    if (!blockText) {
      blockLines = [];
      return;
    }

    const pushBlock = (paramsForBlock: {
      text: string;
      lineStart?: number;
      lineEnd?: number;
      charStart?: number;
      charEnd?: number;
      listKind: MemoryBlockListKind;
      structuredChildren: string[];
    }) => {
      nextSegmentIndex += 1;
      const provenance = buildProvenanceRegion({
        source: params.source,
        headingPath: params.headingPath,
        lineStart: paramsForBlock.lineStart,
        lineEnd: paramsForBlock.lineEnd,
        charStart: paramsForBlock.charStart,
        charEnd: paramsForBlock.charEnd,
        segmentIndex: nextSegmentIndex,
      });
      blocks.push({
        id: buildBlockId(params.source.sourceId, provenance, paramsForBlock.text),
        source: params.source,
        blockText: paramsForBlock.text,
        headingPath: [...params.headingPath],
        listKind: paramsForBlock.listKind,
        structuredChildren: [...paramsForBlock.structuredChildren],
        scope: buildScopeEnvelope({
          headingPath: params.headingPath,
          projectScope: params.projectScope,
        }),
        provenance,
      });
    };

    if (dominantListKind !== "none") {
      pushBlock({
        text: blockText,
        lineStart,
        lineEnd,
        listKind: dominantListKind,
        structuredChildren,
      });
      for (const logicalLine of logicalLines) {
        const childText = trimBlock(logicalLine.text);
        if (!childText) {
          continue;
        }
        pushBlock({
          text: childText,
          lineStart: logicalLine.number,
          lineEnd: logicalLine.number,
          listKind: "none",
          structuredChildren: [childText],
        });
      }
      blockLines = [];
      return;
    }

    if (shouldEmitStandaloneLineBlocks(logicalLines)) {
      for (const logicalLine of logicalLines) {
        const childText = trimBlock(logicalLine.text);
        if (!childText) {
          continue;
        }
        pushBlock({
          text: childText,
          lineStart: logicalLine.number,
          lineEnd: logicalLine.number,
          listKind: "none",
          structuredChildren: [childText],
        });
      }
      blockLines = [];
      return;
    }

    for (const chunk of splitByCharWindow(blockText, params.maxBlockChars)) {
      pushBlock({
        text: chunk.text,
        lineStart,
        lineEnd,
        charStart: chunk.charStart,
        charEnd: chunk.charStart + chunk.text.length,
        listKind: "none",
        structuredChildren: [chunk.text],
      });
    }

    blockLines = [];
  };

  for (const line of params.bodyLines) {
    if (line.text.trim().length === 0) {
      flush();
      continue;
    }
    blockLines.push(line);
  }
  flush();
  return blocks;
}

export function normalizeDocumentMemorySource(params: {
  source: MemorySourceEnvelope;
  content: string;
  maxBlockChars: number;
  projectScope?: string;
}): NormalizedMemoryBlock[] {
  const lines = normalizeMemoryText(params.content).split("\n");
  const headingPath: Array<{ level: number; text: string }> = [];
  const blocks: NormalizedMemoryBlock[] = [];
  let sectionLines: Array<{ number: number; text: string }> = [];

  const flush = () => {
    if (sectionLines.length === 0) {
      return;
    }
    blocks.push(
      ...buildDocumentBlocksForSection({
        source: params.source,
        headingPath: headingPath.map((entry) => entry.text),
        bodyLines: sectionLines,
        maxBlockChars: params.maxBlockChars,
        projectScope: params.projectScope,
      }),
    );
    sectionLines = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (headingMatch) {
      flush();
      const level = headingMatch[1].length;
      const text = trimBlock(headingMatch[2] ?? "");
      while (headingPath.length > 0 && (headingPath.at(-1)?.level ?? 0) >= level) {
        headingPath.pop();
      }
      if (text) {
        headingPath.push({ level, text });
      }
      continue;
    }
    sectionLines.push({ number: index + 1, text: line });
  }
  flush();
  return blocks;
}

function readTranscriptListKind(lines: string[]): MemoryBlockListKind {
  const markers = lines
    .map((line) => stripListMarker(line)?.listKind ?? null)
    .filter((kind): kind is Exclude<MemoryBlockListKind, "none"> => kind !== null);
  if (markers.length < 2) {
    return "none";
  }
  return markers[0] ?? "none";
}

export function normalizeTranscriptMemorySource(params: {
  source: MemorySourceEnvelope;
  text: string;
  parentContext: NormalizedTranscriptContextEntry[];
  maxSegments: number;
  timestamp?: string;
  projectScope?: string;
  workflowScope?: string;
  contextualScopeMarkers?: string[];
}): NormalizedMemoryBlock[] {
  const cleaned = normalizeMemoryText(params.text).trim();
  if (!cleaned) {
    return [];
  }
  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const rawBlocks = paragraphs.length > 0 ? paragraphs : [cleaned];

  return rawBlocks.slice(0, Math.max(1, params.maxSegments)).map((rawBlock, index) => {
    const blockLines = rawBlock
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const firstListLineIndex = blockLines.findIndex((line) => stripListMarker(line));
    const titleLine =
      firstListLineIndex === 1
        ? trimBlock(blockLines[0] ?? "")
            .replace(/[:.]$/g, "")
            .trim()
        : "";
    const bodyLines = titleLine && firstListLineIndex === 1 ? blockLines.slice(1) : [...blockLines];
    const listKind = readTranscriptListKind(bodyLines);
    const structuredChildren =
      listKind === "none"
        ? [trimBlock(bodyLines.join("\n"))].filter(Boolean)
        : bodyLines
            .map((line) => stripListMarker(line)?.text ?? "")
            .filter(Boolean)
            .map((line) => trimBlock(line))
            .filter(Boolean);
    const blockText =
      listKind === "none"
        ? trimBlock(bodyLines.join("\n"))
        : trimBlock(structuredChildren.join("\n"));
    const headingPath = titleLine ? [titleLine] : [];
    const provenance = buildProvenanceRegion({
      source: params.source,
      headingPath,
      segmentIndex: index + 1,
      ...(params.timestamp ? { messageTimestamp: params.timestamp } : {}),
    });
    return {
      id: buildBlockId(params.source.sourceId, provenance, blockText),
      source: params.source,
      blockText,
      headingPath,
      listKind,
      structuredChildren,
      scope: buildScopeEnvelope({
        headingPath,
        projectScope: params.projectScope,
        workflowScope: params.workflowScope,
        contextualScopeMarkers: params.contextualScopeMarkers,
        parentContext: params.parentContext,
      }),
      provenance,
    };
  });
}
