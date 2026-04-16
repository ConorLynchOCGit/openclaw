import { createHash } from "node:crypto";

function hashHex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function formatUuidFromHex(hex: string): string {
  const digits = hex.slice(0, 32).split("");

  // Stamp the UUID as a deterministic, namespaced v5-style identifier.
  digits[12] = "5";
  digits[16] = ((Number.parseInt(digits[16] ?? "0", 16) & 0x3) | 0x8).toString(16);

  return [
    digits.slice(0, 8).join(""),
    digits.slice(8, 12).join(""),
    digits.slice(12, 16).join(""),
    digits.slice(16, 20).join(""),
    digits.slice(20, 32).join(""),
  ].join("-");
}

export function buildDeterministicUuid(namespace: string, input: string): string {
  return formatUuidFromHex(hashHex(`${namespace}:${input}`));
}
