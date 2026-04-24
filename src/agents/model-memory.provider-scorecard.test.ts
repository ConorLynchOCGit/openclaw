import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createModelMemoryProviderScorecardStore } from "./model-memory.provider-scorecard.js";

async function withTempScorecardStore<T>(
  run: (params: {
    baseDir: string;
    store: ReturnType<typeof createModelMemoryProviderScorecardStore>;
  }) => Promise<T>,
) {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-provider-scorecard-"));
  try {
    const store = createModelMemoryProviderScorecardStore({ baseDir });
    return await run({ baseDir, store });
  } finally {
    await fs.rm(baseDir, { recursive: true, force: true });
  }
}

describe("model-memory provider scorecards", () => {
  it("quarantines corrupt scorecard history and preserves valid entries", async () => {
    await withTempScorecardStore(async ({ baseDir, store }) => {
      const eventsPath = path.join(baseDir, "events.jsonl");
      await fs.mkdir(baseDir, { recursive: true, mode: 0o700 });
      await fs.writeFile(
        eventsPath,
        [
          JSON.stringify({
            observedAt: "2026-04-24T00:00:00.000Z",
            status: "success",
            requestedModelId: "openai-codex/gpt-5.4-mini",
            provider: "openai",
            providerModel: "gpt-5.4-mini",
            rawContentPersisted: false,
            containsPromptText: false,
            containsTranscript: false,
            containsRawToolLog: false,
          }),
          '{"observedAt":"2026-04-24T00:01:00.000Z"',
          "",
        ].join("\n"),
        "utf8",
      );

      const events = await store.readEvents();

      expect(events).toHaveLength(1);
      expect(events[0]?.provider).toBe("openai");
      const quarantineDirEntries = await fs.readdir(path.join(baseDir, "quarantine", "events"));
      expect(quarantineDirEntries.length).toBe(1);
      expect(await fs.readFile(eventsPath, "utf8")).toContain('"provider":"openai"');
    });
  });
});
