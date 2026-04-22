export function normalizeStructuralWhitespace(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

export function isHeadingLine(line: string): boolean {
  return /^#{1,6}\s+\S/.test(line.trim());
}

export function isBulletLine(line: string): boolean {
  return /^\s*[-*•]\s+\S/.test(line);
}

export function isNumberedLine(line: string): boolean {
  return /^\s*\d+[.)]\s+\S/.test(line);
}

export function isIndentedContinuationLine(line: string): boolean {
  return (
    /^[ \t]{2,}\S/.test(line) &&
    !isBulletLine(line) &&
    !isNumberedLine(line) &&
    !isHeadingLine(line)
  );
}

export function stripListMarker(line: string): string {
  return line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();
}

export function extractHeadingText(line: string): string {
  return line
    .replace(/^#{1,6}\s*/, "")
    .trim()
    .replace(/:\s*$/u, "");
}

export type ParsedStructuredListItem = {
  rawText: string;
  content: string;
};

export type ParsedStructuredList = {
  kind: "bullet" | "numbered";
  items: ParsedStructuredListItem[];
};

export function parseStructuredList(text: string): ParsedStructuredList | null {
  const lines = text.split("\n");
  let kind: ParsedStructuredList["kind"] | null = null;
  let currentItemLines: string[] = [];
  const items: ParsedStructuredListItem[] = [];

  function flushCurrentItem(): void {
    if (currentItemLines.length === 0) {
      return;
    }
    const [firstLine, ...continuationLines] = currentItemLines;
    const content = normalizeStructuralWhitespace(
      [
        stripListMarker(firstLine),
        ...continuationLines.map((line) => normalizeStructuralWhitespace(line)),
      ].join(" "),
    );
    if (content.length > 0) {
      items.push({
        rawText: currentItemLines.join("\n"),
        content,
      });
    }
    currentItemLines = [];
  }

  for (const line of lines) {
    if (line.trim().length === 0) {
      if (kind !== null && currentItemLines.length > 0) {
        break;
      }
      continue;
    }

    if (kind === null) {
      if (isHeadingLine(line)) {
        continue;
      }
      if (isBulletLine(line)) {
        kind = "bullet";
        currentItemLines = [line];
        continue;
      }
      if (isNumberedLine(line)) {
        kind = "numbered";
        currentItemLines = [line];
        continue;
      }
      continue;
    }

    const startsSameKindItem = kind === "bullet" ? isBulletLine(line) : isNumberedLine(line);
    if (startsSameKindItem) {
      flushCurrentItem();
      currentItemLines = [line];
      continue;
    }

    if (isIndentedContinuationLine(line)) {
      currentItemLines.push(line);
      continue;
    }

    break;
  }

  flushCurrentItem();

  return kind && items.length > 0 ? { kind, items } : null;
}
