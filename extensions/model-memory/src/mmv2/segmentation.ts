import { createHash } from "node:crypto";
import { buildDeterministicUuid } from "../deterministic-uuid.ts";
import {
  SegmentedIngestEventSchema,
  SegmentedIngestSegmentSchema,
  type RawIngestEvent,
  type SegmentedIngestEvent,
  type SegmentedIngestSegment,
} from "./contracts.ts";
import {
  isBulletLine,
  isHeadingLine,
  isIndentedContinuationLine,
  isNumberedLine,
  parseStructuredList,
} from "./structural-markdown.ts";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function lineOffsets(text: string): number[] {
  const offsets = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

type LineRecord = { text: string; start: number; end: number; lineNumber: number };

function getLines(text: string): LineRecord[] {
  const offsets = lineOffsets(text);
  return text.split("\n").map((line, index) => ({
    text: line,
    start: offsets[index] ?? 0,
    end: (offsets[index] ?? 0) + line.length,
    lineNumber: index + 1,
  }));
}

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

function isFenceLine(line: string): boolean {
  return /^\s*```/.test(line);
}

function paragraphSentenceRanges(
  text: string,
): Array<{ start: number; end: number; text: string }> {
  const ranges: Array<{ start: number; end: number; text: string }> = [];
  const matcher = /[\s\S]+?(?:[.!?](?=\s|$)|$)/g;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(text)) !== null) {
    const sentence = match[0].trim();
    if (!sentence) {
      continue;
    }
    const leadingTrim = match[0].indexOf(sentence);
    const start = match.index + (leadingTrim >= 0 ? leadingTrim : 0);
    ranges.push({
      start,
      end: start + sentence.length,
      text: sentence,
    });
  }
  return ranges;
}

export function detectSegmentShape(text: string): SegmentedIngestSegment["detected_shape"] {
  const trimmed = text.trim();
  if (!trimmed) {
    return "unknown";
  }
  if (/^#{1,6}\s+\S[\s\S]*\n.+/.test(trimmed)) {
    return "heading_plus_body";
  }
  const parsedList = parseStructuredList(trimmed);
  if (parsedList?.kind === "numbered") {
    return "numbered_list_block";
  }
  if (parsedList?.kind === "bullet") {
    return "bullet_list_block";
  }
  if (trimmed.startsWith(">")) {
    return "quote_block";
  }
  if (trimmed.includes("\n")) {
    return "paragraph";
  }
  return "sentence";
}

function createSegment(
  eventId: string,
  text: string,
  start: number,
  end: number,
  localBefore: string,
  localAfter: string,
  detectedShape?: SegmentedIngestSegment["detected_shape"],
): SegmentedIngestSegment {
  return SegmentedIngestSegmentSchema.parse({
    segment_id: buildDeterministicUuid("mmv2-segment", `${eventId}:${start}:${end}:${text}`),
    start_char: start,
    end_char: end,
    text,
    detected_shape: detectedShape ?? detectSegmentShape(text),
    local_context_before: localBefore,
    local_context_after: localAfter,
  });
}

export function segmentRawIngestEvent(event: RawIngestEvent): SegmentedIngestEvent {
  const lines = getLines(event.raw_text);
  const segments: SegmentedIngestSegment[] = [];

  let index = 0;
  while (index < lines.length) {
    const current = lines[index];
    if (isBlank(current.text)) {
      index += 1;
      continue;
    }

    const previousNonBlank = [...lines]
      .slice(0, index)
      .toReversed()
      .find((line) => !isBlank(line.text));
    const nextNonBlank = lines.slice(index + 1).find((line) => !isBlank(line.text));
    const localBefore = previousNonBlank?.text ?? "";
    const localAfter = nextNonBlank?.text ?? "";

    if (isHeadingLine(current.text)) {
      let endIndex = index;
      while (
        endIndex + 1 < lines.length &&
        !isBlank(lines[endIndex + 1].text) &&
        !isHeadingLine(lines[endIndex + 1].text) &&
        !isFenceLine(lines[endIndex + 1].text)
      ) {
        endIndex += 1;
      }
      if (endIndex > index) {
        const text = event.raw_text.slice(current.start, lines[endIndex].end);
        segments.push(
          createSegment(
            event.event_id,
            text,
            current.start,
            lines[endIndex].end,
            localBefore,
            localAfter,
            "heading_plus_body",
          ),
        );
      }
      index += 1;
      continue;
    }

    if (isFenceLine(current.text)) {
      let endIndex = index;
      while (endIndex + 1 < lines.length) {
        endIndex += 1;
        if (isFenceLine(lines[endIndex].text)) {
          break;
        }
      }
      const text = event.raw_text.slice(current.start, lines[endIndex].end);
      segments.push(
        createSegment(
          event.event_id,
          text,
          current.start,
          lines[endIndex].end,
          localBefore,
          localAfter,
          "code_block",
        ),
      );
      index = endIndex + 1;
      continue;
    }

    if (isNumberedLine(current.text) || isBulletLine(current.text)) {
      const matcher = isNumberedLine(current.text) ? isNumberedLine : isBulletLine;
      let endIndex = index;
      while (endIndex + 1 < lines.length) {
        const nextLine = lines[endIndex + 1];
        if (isBlank(nextLine.text) || isHeadingLine(nextLine.text)) {
          break;
        }
        if (matcher(nextLine.text) || isIndentedContinuationLine(nextLine.text)) {
          endIndex += 1;
          continue;
        }
        break;
      }
      const text = event.raw_text.slice(current.start, lines[endIndex].end);
      segments.push(
        createSegment(
          event.event_id,
          text,
          current.start,
          lines[endIndex].end,
          localBefore,
          localAfter,
          isNumberedLine(current.text) ? "numbered_list_block" : "bullet_list_block",
        ),
      );
      index = endIndex + 1;
      continue;
    }

    let endIndex = index;
    while (
      endIndex + 1 < lines.length &&
      !isBlank(lines[endIndex + 1].text) &&
      !isHeadingLine(lines[endIndex + 1].text) &&
      !isFenceLine(lines[endIndex + 1].text) &&
      !isNumberedLine(lines[endIndex + 1].text) &&
      !isBulletLine(lines[endIndex + 1].text)
    ) {
      endIndex += 1;
    }
    const paragraphText = event.raw_text.slice(current.start, lines[endIndex].end);
    const paragraphSegment = createSegment(
      event.event_id,
      paragraphText,
      current.start,
      lines[endIndex].end,
      localBefore,
      localAfter,
      "paragraph",
    );
    segments.push(paragraphSegment);

    for (const sentence of paragraphSentenceRanges(paragraphText)) {
      if (sentence.text === paragraphText.trim()) {
        continue;
      }
      segments.push(
        createSegment(
          event.event_id,
          sentence.text,
          current.start + sentence.start,
          current.start + sentence.end,
          localBefore,
          localAfter,
          "sentence",
        ),
      );
    }

    index = endIndex + 1;
  }

  const uniqueSegments = Array.from(
    new Map(
      segments.map((segment) => [
        `${segment.start_char}:${segment.end_char}:${segment.detected_shape}`,
        segment,
      ]),
    ).values(),
  ).toSorted((left, right) => left.start_char - right.start_char || left.end_char - right.end_char);

  return SegmentedIngestEventSchema.parse({
    event_id: event.event_id,
    schema_version: "segmented_ingest.v1",
    raw_text_sha256: sha256(event.raw_text),
    segments: uniqueSegments,
  });
}
