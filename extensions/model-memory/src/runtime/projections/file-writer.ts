export function getGeneratedZoneMarkers(blockId = "model-memory") {
  return {
    begin: `<!-- BEGIN GENERATED: ${blockId} -->`,
    end: `<!-- END GENERATED: ${blockId} -->`,
  };
}

export function renderGeneratedZone(body: string, blockId = "model-memory"): string {
  const markers = getGeneratedZoneMarkers(blockId);
  const normalizedBody = body.trimEnd();
  return `${markers.begin}\n${normalizedBody}\n${markers.end}`;
}

export function upsertGeneratedZone(
  existingContent: string | undefined,
  generatedBody: string,
  blockId = "model-memory",
): string {
  const zone = renderGeneratedZone(generatedBody, blockId);
  if (!existingContent || existingContent.trim().length === 0) {
    return `${zone}\n\n<!-- BEGIN HUMAN -->\n<!-- END HUMAN -->\n`;
  }

  const markers = getGeneratedZoneMarkers(blockId);
  const begin = existingContent.indexOf(markers.begin);
  const end = existingContent.indexOf(markers.end);

  if (begin >= 0 && end > begin) {
    const before = existingContent.slice(0, begin).trimEnd();
    const after = existingContent.slice(end + markers.end.length).trimStart();
    return [before, zone, after].filter((value) => value.length > 0).join("\n\n") + "\n";
  }

  return `${existingContent.trimEnd()}\n\n${zone}\n`;
}
