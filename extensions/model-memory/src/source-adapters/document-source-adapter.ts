import { createHash } from "node:crypto";
import { buildDeterministicUuid } from "../deterministic-uuid.ts";
import type {
  ModelMemorySourceKind,
  ModelMemorySourceRecord,
  ModelMemorySourceWindowRecord,
} from "../storage-database-contract.ts";

export type DocumentBlockKind = "heading" | "paragraph" | "list_item";

export type DocumentBlockDescriptor = {
  id: string;
  kind: DocumentBlockKind;
  headingPath: string[];
  lineStart: number;
  lineEnd: number;
  text: string;
  splitFromBlockId?: string;
};

export type DocumentSourceInput = {
  externalSourceId: string;
  text: string;
  projectId?: string;
  sourceMetadata?: Record<string, unknown>;
  maxWordsPerWindow?: number;
  sourceKind?: Extract<ModelMemorySourceKind, "document" | "daily_continuity">;
  createdAt?: Date;
};

export type DocumentSourceWindow = Omit<ModelMemorySourceWindowRecord, "blockDescriptors"> & {
  blockDescriptors: DocumentBlockDescriptor[];
};

export type DocumentSourceEnvelope = {
  source: ModelMemorySourceRecord;
  normalizedText: string;
  windows: DocumentSourceWindow[];
};

const DEFAULT_MAX_WORDS_PER_WINDOW = 220;

function hashValue(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function buildDeterministicId(prefix: string, input: string): string {
  return buildDeterministicUuid(prefix, input);
}

function normalizeDocumentText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isHeading(line: string): RegExpMatchArray | null {
  return line.match(/^(#{1,6})\s+(.+?)\s*$/);
}

function isListItem(line: string): RegExpMatchArray | null {
  return line.match(/^\s*(?:[-*]|\d+\.)\s+(.+?)\s*$/);
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

function splitTextByWordLimit(text: string, maxWords: number): string[] {
  if (maxWords <= 0 || countWords(text) <= maxWords) {
    return [text];
  }
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += maxWords) {
    chunks.push(words.slice(index, index + maxWords).join(" "));
  }
  return chunks.length > 0 ? chunks : [text];
}

function splitOversizedBlocks(
  blocks: DocumentBlockDescriptor[],
  maxWordsPerWindow: number,
): DocumentBlockDescriptor[] {
  return blocks.flatMap((block) => {
    const chunks = splitTextByWordLimit(block.text, maxWordsPerWindow);
    if (chunks.length === 1) {
      return [block];
    }
    return chunks.map((chunk, index) => ({
      ...block,
      id: buildDeterministicId("block", `${block.id}:chunk:${index}:${chunk}`),
      text: chunk,
      splitFromBlockId: block.id,
    }));
  });
}

function createHeadingPath(currentHeadingPath: string[], level: number, text: string): string[] {
  const nextPath = currentHeadingPath.slice(0, Math.max(level - 1, 0));
  nextPath[level - 1] = text;
  return nextPath;
}

function buildBlockDescriptors(normalizedText: string): DocumentBlockDescriptor[] {
  const lines = normalizedText.split("\n");
  const blocks: DocumentBlockDescriptor[] = [];
  let headingPath: string[] = [];
  let paragraphLines: Array<{ text: string; lineNumber: number }> = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    const start = paragraphLines[0];
    const end = paragraphLines[paragraphLines.length - 1];
    const text = paragraphLines.map((line) => line.text.trim()).join(" ");
    blocks.push({
      id: buildDeterministicId("block", `paragraph:${start.lineNumber}:${end.lineNumber}:${text}`),
      kind: "paragraph",
      headingPath: headingPath.slice(),
      lineStart: start.lineNumber,
      lineEnd: end.lineNumber,
      text,
    });
    paragraphLines = [];
  };

  for (const [index, rawLine] of lines.entries()) {
    const lineNumber = index + 1;
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    const headingMatch = isHeading(trimmed);
    if (headingMatch) {
      flushParagraph();
      headingPath = createHeadingPath(headingPath, headingMatch[1].length, headingMatch[2].trim());
      blocks.push({
        id: buildDeterministicId("block", `heading:${lineNumber}:${headingPath.join(">")}`),
        kind: "heading",
        headingPath: headingPath.slice(),
        lineStart: lineNumber,
        lineEnd: lineNumber,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    const listMatch = isListItem(trimmed);
    if (listMatch) {
      flushParagraph();
      blocks.push({
        id: buildDeterministicId("block", `list:${lineNumber}:${listMatch[1].trim()}`),
        kind: "list_item",
        headingPath: headingPath.slice(),
        lineStart: lineNumber,
        lineEnd: lineNumber,
        text: listMatch[1].trim(),
      });
      continue;
    }

    paragraphLines.push({ text: rawLine, lineNumber });
  }

  flushParagraph();
  return blocks;
}

function buildWindowRecord(
  sourceId: string,
  windowIndex: number,
  blockDescriptors: DocumentBlockDescriptor[],
  normalizedLines: string[],
  createdAt: Date,
): DocumentSourceWindow {
  const lineStart = blockDescriptors[0]?.lineStart;
  const lineEnd = blockDescriptors[blockDescriptors.length - 1]?.lineEnd;
  const containsSplitBlock = blockDescriptors.some((block) => block.splitFromBlockId);
  const normalizedText =
    !containsSplitBlock && lineStart !== undefined && lineEnd !== undefined
      ? normalizedLines
          .slice(lineStart - 1, lineEnd)
          .join("\n")
          .trim()
      : blockDescriptors.map((block) => block.text).join("\n");
  const headingPath =
    blockDescriptors.find((block) => block.headingPath.length > 0)?.headingPath ?? [];
  const normalizedFingerprint = hashValue(
    JSON.stringify({
      sourceId,
      windowIndex,
      headingPath,
      blockIds: blockDescriptors.map((block) => block.id),
      normalizedText,
    }),
  );

  return {
    id: buildDeterministicId("window", `${sourceId}:${windowIndex}:${normalizedFingerprint}`),
    sourceId,
    windowIndex,
    normalizedText,
    normalizedFingerprint,
    tokenEstimate: countWords(normalizedText),
    headingPath,
    blockDescriptors,
    lineStart,
    lineEnd,
    createdAt,
  };
}

export function adaptDocumentSource(input: DocumentSourceInput): DocumentSourceEnvelope {
  const createdAt = input.createdAt ?? new Date();
  const normalizedText = normalizeDocumentText(input.text);
  const normalizedLines = normalizedText.split("\n");
  const maxWordsPerWindow = input.maxWordsPerWindow ?? DEFAULT_MAX_WORDS_PER_WINDOW;
  const blocks = splitOversizedBlocks(buildBlockDescriptors(normalizedText), maxWordsPerWindow);
  const sourceKind = input.sourceKind ?? "document";
  const sourceFingerprint = hashValue(
    JSON.stringify({
      sourceKind,
      externalSourceId: input.externalSourceId,
      projectId: input.projectId ?? null,
      normalizedText,
      sourceMetadata: input.sourceMetadata ?? {},
    }),
  );
  const sourceId = buildDeterministicId("source", sourceFingerprint);
  const source: ModelMemorySourceRecord = {
    id: sourceId,
    sourceKind,
    externalSourceId: input.externalSourceId,
    sourceFingerprint,
    projectId: input.projectId,
    sourceMetadata: input.sourceMetadata ?? {},
    createdAt,
  };

  if (blocks.length === 0) {
    return {
      source,
      normalizedText,
      windows: [
        buildWindowRecord(
          sourceId,
          0,
          [
            {
              id: buildDeterministicId("block", `${sourceId}:empty`),
              kind: "paragraph",
              headingPath: [],
              lineStart: 1,
              lineEnd: 1,
              text: normalizedText,
            },
          ],
          normalizedLines,
          createdAt,
        ),
      ],
    };
  }

  const windows: DocumentSourceWindow[] = [];
  let currentBlocks: DocumentBlockDescriptor[] = [];
  let currentWordCount = 0;

  const flushWindow = () => {
    if (currentBlocks.length === 0) {
      return;
    }
    windows.push(
      buildWindowRecord(sourceId, windows.length, currentBlocks, normalizedLines, createdAt),
    );
    currentBlocks = [];
    currentWordCount = 0;
  };

  for (const block of blocks) {
    const blockWords = countWords(block.text);
    if (currentBlocks.length > 0 && currentWordCount + blockWords > maxWordsPerWindow) {
      flushWindow();
    }
    currentBlocks.push(block);
    currentWordCount += blockWords;
  }

  flushWindow();

  return {
    source,
    normalizedText,
    windows,
  };
}
