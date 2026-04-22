export function normalizeRetrievalText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^a-z0-9_./:#-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
