type PayloadCarrier = {
  kind: string;
  payload: Record<string, unknown>;
};

function summarizeScalar(value: unknown): string | undefined {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

export function summarizeModelMemoryValue(value: unknown, fallback = ""): string {
  const scalar = summarizeScalar(value);
  if (scalar !== undefined) {
    return scalar;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => summarizeScalar(entry))
      .filter((entry): entry is string => entry !== undefined);
    if (parts.length > 0) {
      return parts.join(", ");
    }
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return fallback;
}

function summarizeParts(values: unknown[]): string[] {
  return values
    .map((value) => summarizeScalar(value))
    .filter((value): value is string => value !== undefined);
}

export function summarizeModelMemoryPayload(record: PayloadCarrier): string {
  if (record.kind === "fact") {
    return `${summarizeModelMemoryValue(record.payload.subject, "fact")}: ${summarizeModelMemoryValue(record.payload.value)}`.trim();
  }
  if (record.kind === "preference") {
    const summary = summarizeParts([
      record.payload.subject,
      record.payload.instruction,
      record.payload.operation,
    ]).join(" | ");
    return (
      summary ||
      summarizeModelMemoryValue(record.payload.instruction ?? record.payload.subject, "preference")
    );
  }
  if (record.kind === "rule") {
    return summarizeParts([
      record.payload.subject,
      record.payload.recommendedAction,
      record.payload.avoidAction,
      record.payload.neededCapability,
    ]).join(" | ");
  }
  if (record.kind === "procedure") {
    const steps = Array.isArray(record.payload.steps)
      ? record.payload.steps
          .map((step) => summarizeModelMemoryValue(step))
          .filter((step) => step.length > 0)
      : [];
    return [summarizeModelMemoryValue(record.payload.title, "procedure"), ...steps].join(" -> ");
  }
  return (
    summarizeParts([
      record.payload.task,
      record.payload.primaryResource,
      ...(Array.isArray(record.payload.companionResources)
        ? record.payload.companionResources
        : []),
    ]).join(" | ") ||
    summarizeModelMemoryValue(record.payload.task ?? record.payload.primaryResource, "reference")
  );
}
