import { createHash } from "node:crypto";

export type NormalizedMemorySourceKind = "document" | "transcript";

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
};

export type MemoryProvenanceRegion = {
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

export type MemoryBlockType =
  | "response_style_candidate"
  | "project_fact_candidate"
  | "procedure_candidate"
  | "workflow_routing_candidate"
  | "ignore";

export type NormalizedMemoryBlock = {
  id: string;
  source: NormalizedMemorySource;
  blockText: string;
  headingPath: string[];
  listKind: MemoryBlockListKind;
  structuredChildren: string[];
  scope: MemoryScopeEnvelope;
  provenance: MemoryProvenanceRegion;
};

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

function looksStandaloneMemoryLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  return (
    /[.!?]$/.test(trimmed) ||
    /^(?:for project|for [a-z0-9][a-z0-9 -]{0,47} docs|use |trust |don't |do not |please |plain |plz |shorter |my )/i.test(
      trimmed,
    )
  );
}

function shouldSplitBlockByLine(blockLines: Array<{ number: number; text: string }>): boolean {
  if (blockLines.length <= 1) {
    return false;
  }
  if (blockLines.some((line) => /^(?:\s*[-*]|\s*\d+[.)])\s+/.test(line.text))) {
    return false;
  }
  for (let index = 0; index < blockLines.length - 1; index += 1) {
    const current = blockLines[index]?.text.trim() ?? "";
    const next = blockLines[index + 1]?.text.trim() ?? "";
    if (
      current &&
      next &&
      current.length >= 24 &&
      !/[.!?:;]$/.test(current) &&
      !/^(?:[-*]|\d+[.)])\s+/.test(next) &&
      (/\b(?:in|and|or|the|a|an|to|for|of|with|when)\b$/i.test(current) ||
        /^\[/.test(next) ||
        /^(?:and|or|the|a|an|to|for|of|with|when|repo's)\b/i.test(next))
    ) {
      return false;
    }
  }
  return (
    blockLines.every((line) => line.text.trim().length > 0 && line.text.trim().length <= 220) &&
    blockLines.filter((line) => looksStandaloneMemoryLine(line.text)).length >= 2
  );
}

function buildScopeEnvelope(params: {
  headingPath: string[];
  projectScope?: string;
  contextualScopeMarkers?: string[];
  parentContext?: NormalizedTranscriptContextEntry[];
  workflowScope?: string;
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

type DocumentLogicalLine = {
  number: number;
  text: string;
  indent: number;
  listKind: MemoryBlockListKind;
};

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
    if (previous) {
      if (previous.listKind === "none") {
        previous.text = appendContinuation(previous.text, trimmed);
        continue;
      }
      if (indent > previous.indent) {
        previous.text = appendContinuation(previous.text, trimmed);
        continue;
      }
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

function buildDocumentBlocksForSection(params: {
  source: NormalizedMemorySource;
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
    if (shouldSplitBlockByLine(blockLines)) {
      for (const line of blockLines) {
        const blockText = trimBlock(line.text);
        if (!blockText) {
          continue;
        }
        nextSegmentIndex += 1;
        const provenance: MemoryProvenanceRegion = {
          lineStart: line.number,
          lineEnd: line.number,
          segmentIndex: nextSegmentIndex,
        };
        blocks.push({
          id: buildBlockId(params.source.sourceId, provenance, blockText),
          source: params.source,
          blockText,
          headingPath: [...params.headingPath],
          listKind: "none",
          structuredChildren: [blockText],
          scope: buildScopeEnvelope({
            headingPath: params.headingPath,
            projectScope: params.projectScope,
          }),
          provenance,
        });
      }
      blockLines = [];
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
    nextSegmentIndex += 1;
    const provenance: MemoryProvenanceRegion = {
      lineStart,
      lineEnd,
      segmentIndex: nextSegmentIndex,
    };
    if (dominantListKind !== "none" || blockText.length <= params.maxBlockChars) {
      blocks.push({
        id: buildBlockId(params.source.sourceId, provenance, blockText),
        source: params.source,
        blockText,
        headingPath: [...params.headingPath],
        listKind: dominantListKind,
        structuredChildren,
        scope: buildScopeEnvelope({
          headingPath: params.headingPath,
          projectScope: params.projectScope,
        }),
        provenance,
      });
      if (dominantListKind !== "none") {
        for (const logicalLine of logicalLines) {
          const childText = trimBlock(logicalLine.text);
          if (!childText) {
            continue;
          }
          nextSegmentIndex += 1;
          const childProvenance: MemoryProvenanceRegion = {
            lineStart: logicalLine.number,
            lineEnd: logicalLine.number,
            segmentIndex: nextSegmentIndex,
          };
          blocks.push({
            id: buildBlockId(params.source.sourceId, childProvenance, childText),
            source: params.source,
            blockText: childText,
            headingPath: [...params.headingPath],
            listKind: "none",
            structuredChildren: [childText],
            scope: buildScopeEnvelope({
              headingPath: params.headingPath,
              projectScope: params.projectScope,
            }),
            provenance: childProvenance,
          });
        }
      }
      blockLines = [];
      return;
    }
    let charOffset = 0;
    for (const chunk of blockText.split("\n")) {
      const text = trimBlock(chunk);
      if (!text) {
        continue;
      }
      const chunkRegion: MemoryProvenanceRegion = {
        ...provenance,
        charStart: charOffset,
        charEnd: charOffset + text.length,
      };
      blocks.push({
        id: buildBlockId(params.source.sourceId, chunkRegion, text),
        source: params.source,
        blockText: text,
        headingPath: [...params.headingPath],
        listKind: dominantListKind,
        structuredChildren: dominantListKind === "none" ? [] : [text],
        scope: buildScopeEnvelope({
          headingPath: params.headingPath,
          projectScope: params.projectScope,
        }),
        provenance: chunkRegion,
      });
      charOffset += chunk.length + 1;
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
  source: NormalizedMemorySource;
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

export function normalizeTranscriptMemorySource(params: {
  source: NormalizedMemorySource;
  text: string;
  parentContext: NormalizedTranscriptContextEntry[];
  maxSegments: number;
  timestamp?: string;
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
  const contextualScopeMarkers = params.parentContext
    .map((entry) => entry.text.trim())
    .filter(Boolean)
    .slice(-4);
  const inferredProjectScope = [...params.parentContext]
    .reverse()
    .map((entry) => {
      const projectMatch = entry.text.match(/^For project ([a-z0-9][a-z0-9 /_-]{1,80}?)[,.:]/i);
      if (projectMatch?.[1]) {
        return normalizeMemoryText(projectMatch[1]).trim();
      }
      const docsMatch = entry.text.match(/^For ([a-z0-9][a-z0-9 /_-]{1,80}?) docs[,.:]/i);
      return docsMatch?.[1] ? normalizeMemoryText(docsMatch[1]).trim() : null;
    })
    .find((value): value is string => Boolean(value));

  return rawBlocks.slice(0, Math.max(1, params.maxSegments)).map((blockText, index) => {
    const blockLines = blockText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const firstListLineIndex = blockLines.findIndex((line) => stripListMarker(line));
    const leadingTitleLine =
      firstListLineIndex === 1
        ? trimBlock(blockLines[0] ?? "")
            .replace(/[:.]$/g, "")
            .trim()
        : "";
    const normalizedListBody =
      leadingTitleLine && firstListLineIndex === 1 ? blockLines.slice(1).join("\n") : blockText;
    const listMatches = normalizedListBody.match(/(?:^|\n)\s*(?:[-*]|\d+[.)])\s+\S+/gm) ?? [];
    const listKind: MemoryBlockListKind =
      listMatches.length >= 2
        ? /^\s*\d+[.)]\s+/m.test(normalizedListBody)
          ? "ordered"
          : "unordered"
        : "none";
    const provenance: MemoryProvenanceRegion = {
      segmentIndex: index + 1,
      ...(params.timestamp ? { messageTimestamp: params.timestamp } : {}),
    };
    return {
      id: buildBlockId(params.source.sourceId, provenance, blockText),
      source: params.source,
      blockText: trimBlock(normalizedListBody),
      headingPath: leadingTitleLine ? [leadingTitleLine] : [],
      listKind,
      structuredChildren:
        listKind === "none"
          ? []
          : normalizedListBody
              .split("\n")
              .map((line) => stripListMarker(line)?.text ?? "")
              .filter(Boolean),
      scope: buildScopeEnvelope({
        headingPath: leadingTitleLine ? [leadingTitleLine] : [],
        ...(inferredProjectScope ? { projectScope: inferredProjectScope } : {}),
        contextualScopeMarkers,
        parentContext: params.parentContext,
      }),
      provenance,
    };
  });
}

export function typeNormalizedMemoryBlock(block: NormalizedMemoryBlock): MemoryBlockType {
  const text = block.blockText.trim().toLowerCase();
  if (!text) {
    return "ignore";
  }
  if (
    block.listKind !== "none" ||
    /\b(?:phase order|checklist|steps?|procedure|gate)\b/.test(text)
  ) {
    return "procedure_candidate";
  }
  if (
    /\b(?:plain english|avoid jargon|bullet points|numbered steps|do not use tables|keep responses concise|keep it short|shorter replies|start with the direct answer)\b/.test(
      text,
    ) ||
    (/\b(?:file|files|path|paths)\b/.test(text) &&
      /\b(?:refer|reference|referencing|relative)\b/.test(text))
  ) {
    return "response_style_candidate";
  }
  if (
    /\b(?:default branch|staging branch|repository url|deployment url|documentation url|runbook url|primary package manager|primary environment)\b/.test(
      text,
    )
  ) {
    return "project_fact_candidate";
  }
  if (
    /^(?:use|trust|avoid|do not|don't|update|follow|run|treat|keep)\b/.test(text) ||
    /^for [a-z0-9][a-z0-9 /_-]{1,80} docs,\s*(?:use|trust|avoid|do not|don't|update|follow|run|treat|keep)\b/.test(
      text,
    ) ||
    /^for project [a-z0-9][a-z0-9 /_-]{1,80},\s*we(?:'re| are)\s+missing\b/.test(text) ||
    /^for project [a-z0-9][a-z0-9 /_-]{1,80},\s*we need\b/.test(text) ||
    /\b(?:workflow|runbook|landing gate|release policy|testing|readyz|healthz)\b/.test(text) ||
    /(?:\bpnpm\b|scripts\/committer|git diff --check|fast_commit)/.test(text)
  ) {
    return "workflow_routing_candidate";
  }
  return "ignore";
}
