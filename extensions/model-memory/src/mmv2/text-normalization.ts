export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

export function ensureSentence(text: string): string {
  const normalized = normalizeWhitespace(text);
  if (normalized.length === 0) {
    return normalized;
  }
  return /[.!?]$/u.test(normalized) ? normalized : `${normalized}.`;
}
