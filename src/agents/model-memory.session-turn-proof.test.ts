import { describe, expect, it } from "vitest";
import type { ModelMemoryDatabaseRuntime } from "./model-memory.database.ts";
import {
  mapSessionTurnProofContractVersion,
  shouldUseMmV2SessionTurnProofInterpreter,
} from "./model-memory.session-turn-proof.ts";

describe("model-memory session-turn proof helpers", () => {
  it("maps MMV2 atomic and repair contracts to truthful trace stages", () => {
    expect(mapSessionTurnProofContractVersion("mmv2-atomic-extraction-v1")).toBe(
      "pass_1_candidate",
    );
    expect(mapSessionTurnProofContractVersion("mmv2-atomic-repair-v1")).toBe("pass_1_repair");
    expect(mapSessionTurnProofContractVersion("mmv2-canonicalization-repair-v1")).toBe(
      "pass_2_repair",
    );
  });

  it("selects the MMV2 interpreter only when the runtime exposes MMV2 live storage", () => {
    const mmv2Runtime = {
      storageEngine: "mmv2",
      canonicalRepository: {
        listExistingMemorySummaries: async () => [],
        persistLiveMemoryBatch: async () => ({}),
      },
    } as unknown as ModelMemoryDatabaseRuntime;
    const legacyRuntime = {
      storageEngine: "legacy",
      canonicalRepository: {
        listExistingMemorySummaries: async () => [],
        persistLiveMemoryBatch: async () => ({}),
      },
    } as unknown as ModelMemoryDatabaseRuntime;

    expect(shouldUseMmV2SessionTurnProofInterpreter(mmv2Runtime)).toBe(true);
    expect(shouldUseMmV2SessionTurnProofInterpreter(legacyRuntime)).toBe(false);
  });
});
