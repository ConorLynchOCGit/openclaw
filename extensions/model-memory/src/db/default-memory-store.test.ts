import { describe, expect, it } from "vitest";
import { ModelMemoryCanonicalRepository } from "./canonical-repository.ts";
import {
  MODEL_MEMORY_LEGACY_CAPTURED_OBJECT_WRITE_FALLBACK_ENV,
  isLegacyCapturedObjectWriteFallbackEnabled,
} from "./captured-object-write-compatibility.ts";
import { createDefaultMemoryObjectStore } from "./default-memory-store.ts";

function legacyRepository(): ModelMemoryCanonicalRepository {
  return new ModelMemoryCanonicalRepository({
    async query() {
      throw new Error("database should not be queried by this test");
    },
    async withTransaction(work) {
      return work(this);
    },
  });
}

describe("createDefaultMemoryObjectStore", () => {
  it("fails closed instead of silently constructing legacy captured-object write fallback", () => {
    expect(() =>
      createDefaultMemoryObjectStore({
        canonicalRepository: legacyRepository(),
        env: {},
      }),
    ).toThrow(/legacy captured-object write compatibility/i);
  });

  it("allows the legacy captured-object fallback only behind an explicit flag", () => {
    const store = createDefaultMemoryObjectStore({
      canonicalRepository: legacyRepository(),
      env: { [MODEL_MEMORY_LEGACY_CAPTURED_OBJECT_WRITE_FALLBACK_ENV]: "true" },
    });

    expect(isLegacyCapturedObjectWriteFallbackEnabled({ env: {} })).toBe(false);
    expect(
      isLegacyCapturedObjectWriteFallbackEnabled({
        env: { [MODEL_MEMORY_LEGACY_CAPTURED_OBJECT_WRITE_FALLBACK_ENV]: "true" },
      }),
    ).toBe(true);
    expect(typeof store.writeCapturedObjects).toBe("function");
  });

  it("still selects MMV2-native compatibility only for MMV2-aware repositories", () => {
    const repository = legacyRepository() as ModelMemoryCanonicalRepository & {
      listDurableMemories(): Promise<[]>;
    };
    repository.listDurableMemories = async () => [];

    const store = createDefaultMemoryObjectStore({
      canonicalRepository: repository as never,
      env: {},
    });

    expect(typeof store.writeCapturedObjects).toBe("function");
  });
});
