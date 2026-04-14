function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }
  return value as T;
}

export function readString(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

export function readOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return readString(value);
}

export function readNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

export function readOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return readNumber(value);
}

export function readBoolean(value: unknown): boolean {
  return typeof value === "boolean" ? value : value === "true";
}

export function readDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(readString(value));
}

export function readStringArray(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((entry) => readString(entry));
  }
  return parseJson<string[]>(value, []);
}

export function readObject(value: unknown): Record<string, unknown> {
  return parseJson<Record<string, unknown>>(value, {});
}

export function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  return parseJson<Array<Record<string, unknown>>>(value, []);
}
