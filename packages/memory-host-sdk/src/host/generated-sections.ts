const GENERATED_SECTION_MARKER_PREFIX = "OPENCLAW:MEMORY-PROJECTION";
const START_MARKER_KIND = "START";
const END_MARKER_KIND = "END";

function buildMarker(
  kind: typeof START_MARKER_KIND | typeof END_MARKER_KIND,
  blockId: string,
): string {
  return `<!-- ${GENERATED_SECTION_MARKER_PREFIX}:${kind} ${blockId} -->`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeGeneratedBody(body: string): string {
  const trimmed = body.replace(/\r\n/g, "\n").trim();
  return trimmed ? `${trimmed}\n` : "";
}

function normalizePersistedContent(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n").trimEnd();
  return normalized ? `${normalized}\n` : "";
}

export function buildGeneratedSectionMarkers(blockId: string): {
  start: string;
  end: string;
} {
  return {
    start: buildMarker(START_MARKER_KIND, blockId),
    end: buildMarker(END_MARKER_KIND, blockId),
  };
}

export function renderGeneratedSectionBlock(params: { blockId: string; body: string }): string {
  const markers = buildGeneratedSectionMarkers(params.blockId);
  return `${markers.start}\n${normalizeGeneratedBody(params.body)}${markers.end}`;
}

export function upsertGeneratedSectionBlock(params: {
  content: string;
  blockId: string;
  body: string;
}): {
  content: string;
  changed: boolean;
} {
  const normalizedInput = normalizePersistedContent(params.content);
  const block = renderGeneratedSectionBlock({
    blockId: params.blockId,
    body: params.body,
  });
  const markers = buildGeneratedSectionMarkers(params.blockId);
  const completeBlockPattern = new RegExp(
    `${escapeRegExp(markers.start)}\\n?[\\s\\S]*?${escapeRegExp(markers.end)}`,
    "m",
  );

  let nextContent: string;
  if (completeBlockPattern.test(normalizedInput)) {
    nextContent = normalizedInput.replace(completeBlockPattern, block);
  } else {
    const startIndex = normalizedInput.indexOf(markers.start);
    if (startIndex >= 0) {
      nextContent = `${normalizedInput.slice(0, startIndex).trimEnd()}\n\n${block}\n`;
    } else if (normalizedInput.length === 0) {
      nextContent = `${block}\n`;
    } else {
      nextContent = `${normalizedInput.trimEnd()}\n\n${block}\n`;
    }
  }

  return {
    content: nextContent,
    changed: nextContent !== normalizedInput,
  };
}

export function stripGeneratedSectionBlocks(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n");
  const stripped = normalized.replace(
    /<!-- OPENCLAW:MEMORY-PROJECTION:START [^\n]+ -->\n?[\s\S]*?<!-- OPENCLAW:MEMORY-PROJECTION:END [^\n]+ -->\n?/g,
    "",
  );
  return stripped.replace(/\n{3,}/g, "\n\n").trim();
}

export function containsGeneratedSectionBlock(content: string, blockId: string): boolean {
  const markers = buildGeneratedSectionMarkers(blockId);
  return (
    content.includes(markers.start) &&
    content.includes(markers.end) &&
    content.indexOf(markers.start) < content.indexOf(markers.end)
  );
}
