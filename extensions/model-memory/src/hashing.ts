import { createHash } from "node:crypto";

export function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function sha256JsonValue(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return sha256Text(text ?? "");
}
