export type EvidenceSpanAnchorResult =
  | {
      status: "anchored";
      quote: string;
      method: "exact" | "formatting_normalized_unique";
    }
  | {
      status: "unanchored";
      reason: "empty_quote" | "quote_too_large" | "no_unique_formatting_match";
    };

const DEFAULT_MAX_QUOTE_CHARS = 8_000;

function normalizeQuoteChar(char: string): string {
  switch (char) {
    case "“":
    case "”":
      return '"';
    case "‘":
    case "’":
      return "'";
    default:
      return char;
  }
}

function isWhitespace(char: string): boolean {
  return /\s/u.test(char);
}

function isLetterOrNumber(char: string | undefined): boolean {
  if (!char) {
    return false;
  }
  return /[\p{L}\p{N}]/u.test(char);
}

function shouldDropMechanicalBoundarySpace(previous: string | undefined, next: string): boolean {
  if (!isLetterOrNumber(previous) || !isLetterOrNumber(next)) {
    return false;
  }
  return /\p{L}/u.test(previous ?? "") !== /\p{L}/u.test(next);
}

function linePrefixEnd(text: string, lineStart: number): number {
  let index = lineStart;
  while (index < text.length && (text[index] === " " || text[index] === "\t")) {
    index += 1;
  }

  if (/[>]/u.test(text[index] ?? "") && isWhitespace(text[index + 1] ?? "")) {
    index += 1;
    while (index < text.length && (text[index] === " " || text[index] === "\t")) {
      index += 1;
    }
  }

  if (/[-*+]/u.test(text[index] ?? "") && isWhitespace(text[index + 1] ?? "")) {
    return index + 1;
  }

  const numbered = text.slice(index).match(/^\d{1,3}[.)]\s/u);
  if (numbered) {
    return index + numbered[0].length - 1;
  }

  return lineStart;
}

function normalizeForSpanAnchoring(input: string): {
  text: string;
  originalIndexes: number[];
} {
  const chars: string[] = [];
  const originalIndexes: number[] = [];
  let pendingSpaceIndex: number | null = null;
  let atLineStart = true;
  let index = 0;

  function append(char: string, originalIndex: number): void {
    if (pendingSpaceIndex !== null && chars.length > 0) {
      const previous = chars.at(-1);
      const normalizedChar = normalizeQuoteChar(char);
      if (!shouldDropMechanicalBoundarySpace(previous, normalizedChar)) {
        chars.push(" ");
        originalIndexes.push(pendingSpaceIndex);
      }
    }
    pendingSpaceIndex = null;
    chars.push(normalizeQuoteChar(char));
    originalIndexes.push(originalIndex);
  }

  while (index < input.length) {
    if (atLineStart) {
      const prefixEnd = linePrefixEnd(input, index);
      if (prefixEnd !== index) {
        index = prefixEnd;
      }
      while (index < input.length && (input[index] === " " || input[index] === "\t")) {
        index += 1;
      }
      atLineStart = false;
    }

    const char = input[index];
    if (char === undefined) {
      break;
    }
    if (isWhitespace(char)) {
      if (chars.length > 0 && pendingSpaceIndex === null) {
        pendingSpaceIndex = index;
      }
      if (char === "\n" || char === "\r") {
        atLineStart = true;
      }
      index += 1;
      continue;
    }
    append(char, index);
    index += 1;
  }

  return { text: chars.join(""), originalIndexes };
}

function findAllIndexes(haystack: string, needle: string): number[] {
  const indexes: number[] = [];
  let startIndex = 0;
  while (startIndex <= haystack.length) {
    const index = haystack.indexOf(needle, startIndex);
    if (index < 0) {
      break;
    }
    indexes.push(index);
    startIndex = index + 1;
  }
  return indexes;
}

function stripWrapperQuotes(value: string): string {
  return value.trim().replace(/^["'`“”]+|["'`“”]+$/gu, "");
}

export function anchorEvidenceQuoteToSourceSpan(input: {
  sourceText: string;
  evidenceQuote: string;
  maxQuoteChars?: number;
}): EvidenceSpanAnchorResult {
  const maxQuoteChars = input.maxQuoteChars ?? DEFAULT_MAX_QUOTE_CHARS;
  const candidates = [
    input.evidenceQuote,
    input.evidenceQuote.trim(),
    stripWrapperQuotes(input.evidenceQuote),
  ]
    .map((candidate) => candidate.trim())
    .filter(
      (candidate, index, values) => candidate.length > 0 && values.indexOf(candidate) === index,
    );

  if (candidates.length === 0) {
    return { status: "unanchored", reason: "empty_quote" };
  }

  for (const candidate of candidates) {
    if (candidate.length > maxQuoteChars) {
      return { status: "unanchored", reason: "quote_too_large" };
    }
    if (findAllIndexes(input.sourceText, candidate).length === 1) {
      return { status: "anchored", quote: candidate, method: "exact" };
    }
  }

  const normalizedSource = normalizeForSpanAnchoring(input.sourceText);
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeForSpanAnchoring(candidate).text;
    if (normalizedCandidate.length === 0) {
      continue;
    }
    const matches = findAllIndexes(normalizedSource.text, normalizedCandidate);
    if (matches.length !== 1) {
      continue;
    }
    const normalizedStart = matches[0];
    const normalizedEnd = normalizedStart + normalizedCandidate.length - 1;
    const originalStart = normalizedSource.originalIndexes[normalizedStart];
    const originalEnd = normalizedSource.originalIndexes[normalizedEnd];
    if (originalStart === undefined || originalEnd === undefined || originalEnd < originalStart) {
      continue;
    }
    return {
      status: "anchored",
      quote: input.sourceText.slice(originalStart, originalEnd + 1),
      method: "formatting_normalized_unique",
    };
  }

  return { status: "unanchored", reason: "no_unique_formatting_match" };
}
