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
  recentContext?: TurnContextMessage[];
  projectId?: string;
  sessionId?: string;
  sourceMetadata?: Record<string, unknown>;
  maxWordsPerWindow?: number;
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
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\s+/g, " ").trim();
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

function buildMessageBlocks(input: OrdinaryTurnSourceInput): TurnBlockDescriptor[] {
  const messages: TurnContextMessage[] = [
    ...(input.recentContext ?? []),
    { speaker: "user", text: input.currentTurnText },
  ];

  return messages.map((message, index) => {
    const normalizedMessage = normalizeTurnText(message.text);
    const text = `${message.speaker}: ${normalizedMessage}`;
    return {
      id: buildDeterministicId("block", `${index}:${message.speaker}:${text}`),
      kind: "message",
      speaker: message.speaker,
      headingPath: [],
      lineStart: index + 1,
      lineEnd: index + 1,
      text,
    };
  });
}

function buildWindowRecord(
  sourceId: string,
  windowIndex: number,
  blockDescriptors: TurnBlockDescriptor[],
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
    createdAt: new Date(0),
  };
}

export function adaptOrdinaryTurnSource(
  input: OrdinaryTurnSourceInput,
): OrdinaryTurnSourceEnvelope {
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
    createdAt: new Date(0),
  };

  const maxWordsPerWindow = input.maxWordsPerWindow ?? DEFAULT_MAX_WORDS_PER_WINDOW;
  const windows: OrdinaryTurnSourceWindow[] = [];
  let currentBlocks: TurnBlockDescriptor[] = [];
  let currentWordCount = 0;

  const flushWindow = () => {
    if (currentBlocks.length === 0) {
      return;
    }
    windows.push(buildWindowRecord(sourceId, windows.length, currentBlocks));
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
