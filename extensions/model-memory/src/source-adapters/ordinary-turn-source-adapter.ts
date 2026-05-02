import { createHash } from "node:crypto";
import { buildDeterministicUuid } from "../deterministic-uuid.ts";
import type {
  ModelMemorySourceRecord,
  ModelMemorySourceWindowRecord,
} from "../storage-database-contract.ts";

export type TurnSpeaker = "user" | "assistant" | "system";

export type TurnContextMessage = {
  speaker: TurnSpeaker;
  text: string;
};

export type TurnBlockDescriptor = {
  id: string;
  kind: "message";
  speaker: TurnSpeaker;
  headingPath: [];
  lineStart: number;
  lineEnd: number;
  text: string;
};

export type OrdinaryTurnSourceInput = {
  currentTurnText: string;
  currentTurnSpeaker?: TurnSpeaker;
  recentContext?: TurnContextMessage[];
  projectId?: string;
  sessionId?: string;
  sourceMetadata?: Record<string, unknown>;
  maxWordsPerWindow?: number;
  createdAt?: Date;
};

export type OrdinaryTurnSourceWindow = Omit<ModelMemorySourceWindowRecord, "blockDescriptors"> & {
  blockDescriptors: TurnBlockDescriptor[];
};

export type OrdinaryTurnSourceEnvelope = {
  source: ModelMemorySourceRecord;
  normalizedText: string;
  windows: OrdinaryTurnSourceWindow[];
};

const DEFAULT_MAX_WORDS_PER_WINDOW = 320;

function hashValue(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function buildDeterministicId(prefix: string, input: string): string {
  return buildDeterministicUuid(prefix, input);
}

function normalizeTurnText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

function redactTurnBlockText(block: TurnBlockDescriptor): string {
  return `${block.speaker}: [redacted ordinary_turn_message sha256=${hashValue(block.text)} chars=${block.text.length}]`;
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

function buildMessageBlocks(input: OrdinaryTurnSourceInput): TurnBlockDescriptor[] {
  const messages: TurnContextMessage[] = [
    ...(input.recentContext ?? []),
    { speaker: input.currentTurnSpeaker ?? "user", text: input.currentTurnText },
  ];
  const maxWordsPerBlock = input.maxWordsPerWindow ?? DEFAULT_MAX_WORDS_PER_WINDOW;
  const blocks: TurnBlockDescriptor[] = [];

  for (const [messageIndex, message] of messages.entries()) {
    const normalizedMessage = normalizeTurnText(message.text);
    const chunks = splitTextByWordLimit(normalizedMessage, Math.max(maxWordsPerBlock - 1, 1));
    for (const [chunkIndex, chunk] of chunks.entries()) {
      const text = `${message.speaker}: ${chunk}`;
      blocks.push({
        id: buildDeterministicId(
          "block",
          `${messageIndex}:${chunkIndex}:${message.speaker}:${text}`,
        ),
        kind: "message",
        speaker: message.speaker,
        headingPath: [],
        lineStart: blocks.length + 1,
        lineEnd: blocks.length + 1,
        text,
      });
    }
  }

  return blocks;
}

function buildWindowRecord(
  sourceId: string,
  windowIndex: number,
  blockDescriptors: TurnBlockDescriptor[],
  createdAt: Date,
): OrdinaryTurnSourceWindow {
  const normalizedText = blockDescriptors.map((block) => block.text).join("\n");
  const normalizedFingerprint = hashValue(
    JSON.stringify({
      sourceId,
      windowIndex,
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
    headingPath: [],
    blockDescriptors,
    lineStart: blockDescriptors[0]?.lineStart,
    lineEnd: blockDescriptors[blockDescriptors.length - 1]?.lineEnd,
    createdAt,
  };
}

export function adaptOrdinaryTurnSource(
  input: OrdinaryTurnSourceInput,
): OrdinaryTurnSourceEnvelope {
  const createdAt = input.createdAt ?? new Date();
  const blocks = buildMessageBlocks(input);
  const normalizedText = blocks.map((block) => block.text).join("\n");
  const sourceFingerprint = hashValue(
    JSON.stringify({
      sourceKind: "ordinary_turn",
      normalizedText,
      projectId: input.projectId ?? null,
      sessionId: input.sessionId ?? null,
      sourceMetadata: input.sourceMetadata ?? {},
    }),
  );
  const sourceId = buildDeterministicId("source", sourceFingerprint);
  const source: ModelMemorySourceRecord = {
    id: sourceId,
    sourceKind: "ordinary_turn",
    sourceFingerprint,
    projectId: input.projectId,
    sessionId: input.sessionId,
    sourceMetadata: input.sourceMetadata ?? {},
    createdAt,
  };

  const maxWordsPerWindow = input.maxWordsPerWindow ?? DEFAULT_MAX_WORDS_PER_WINDOW;
  const windows: OrdinaryTurnSourceWindow[] = [];
  let currentBlocks: TurnBlockDescriptor[] = [];
  let currentWordCount = 0;

  const flushWindow = () => {
    if (currentBlocks.length === 0) {
      return;
    }
    windows.push(buildWindowRecord(sourceId, windows.length, currentBlocks, createdAt));
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

export function redactOrdinaryTurnSourceEnvelopeForPersistence(
  envelope: OrdinaryTurnSourceEnvelope,
): OrdinaryTurnSourceEnvelope {
  const originalNormalizedTextHash = hashValue(envelope.normalizedText);
  const windows = envelope.windows.map((window) => {
    const blockDescriptors = window.blockDescriptors.map((block) => ({
      ...block,
      text: redactTurnBlockText(block),
    }));
    const normalizedText = `[redacted ordinary_turn_window sha256=${hashValue(
      window.normalizedText,
    )} blocks=${blockDescriptors.length}]`;
    return {
      ...window,
      normalizedText,
      normalizedFingerprint: hashValue(
        JSON.stringify({
          id: window.id,
          sourceId: window.sourceId,
          windowIndex: window.windowIndex,
          normalizedText,
        }),
      ),
      tokenEstimate: countWords(normalizedText),
      blockDescriptors,
    };
  });

  return {
    ...envelope,
    source: {
      ...envelope.source,
      sourceMetadata: {
        ...envelope.source.sourceMetadata,
        rawContentPersisted: false,
        ordinaryTurnTextSha256: originalNormalizedTextHash,
        ordinaryTurnCharCount: envelope.normalizedText.length,
      },
    },
    normalizedText: `[redacted ordinary_turn_source sha256=${originalNormalizedTextHash} windows=${windows.length}]`,
    windows,
  };
}
