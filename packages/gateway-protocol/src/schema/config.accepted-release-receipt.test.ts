// Covers the opaque accepted-release selector on the typed update RPC.
import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import { UpdateRunParamsSchema } from "./config.js";

describe("UpdateRunParamsSchema accepted release receipt", () => {
  it("accepts one lowercase SHA-256 receipt ID", () => {
    expect(
      Value.Check(UpdateRunParamsSchema, {
        acceptedReleaseReceiptId: "a".repeat(64),
        timeoutMs: 30_000,
      }),
    ).toBe(true);
  });

  it.each(["", "a".repeat(63), "A".repeat(64), `../${"a".repeat(64)}`, `${"a".repeat(64)} `])(
    "rejects a non-opaque receipt selector: %j",
    (acceptedReleaseReceiptId) => {
      expect(Value.Check(UpdateRunParamsSchema, { acceptedReleaseReceiptId })).toBe(false);
    },
  );

  it("does not admit caller-supplied package identity fields", () => {
    expect(
      Value.Check(UpdateRunParamsSchema, {
        acceptedReleaseReceiptId: "a".repeat(64),
        packagePath: "/tmp/openclaw.tgz",
      }),
    ).toBe(false);
  });
});
