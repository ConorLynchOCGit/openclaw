import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHashGatedImportStore } from "./hash-gated-import.ts";

describe("hash-gated memory imports", () => {
  let tempDir: string;
  let sourcePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "hash-gated-import-"));
    sourcePath = path.join(tempDir, "MEMORY.md");
    await writeFile(sourcePath, "Human-owned memory file\n- stable fact\n", "utf8");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("imports changed content once and skips unchanged hashes without storing raw file text", async () => {
    const store = createHashGatedImportStore({ baseDir: path.join(tempDir, "state") });
    const onChanged = vi.fn(async () => ({
      sourceId: "source-memory-md",
      memoryIds: ["memory-1"],
      eventIds: ["event-1"],
    }));

    const first = await store.evaluate({
      source: {
        sourceId: "root-memory-md",
        sourceType: "root_memory_md",
        absolutePath: sourcePath,
        authority: "root_compatibility",
        importedBy: "test",
      },
      importedAt: new Date("2026-04-23T00:00:00.000Z"),
      onChanged,
    });
    const second = await store.evaluate({
      source: {
        sourceId: "root-memory-md",
        sourceType: "root_memory_md",
        absolutePath: sourcePath,
        authority: "root_compatibility",
        importedBy: "test",
      },
      importedAt: new Date("2026-04-23T00:01:00.000Z"),
      onChanged,
    });

    expect(first.status).toBe("written");
    expect(second.status).toBe("skipped");
    expect(onChanged).toHaveBeenCalledTimes(1);
    const stateText = await readFile(path.join(tempDir, "state/state.json"), "utf8");
    const eventText = await readFile(path.join(tempDir, "state/events.jsonl"), "utf8");
    expect(stateText).toContain("model_memory_hash_gated_import_state.v1");
    expect(eventText).toContain("import_written");
    expect(eventText).toContain("import_skipped");
    expect(stateText).not.toContain("Human-owned memory file");
    expect(eventText).not.toContain("stable fact");
    expect(JSON.parse(stateText).records[0]).toMatchObject({
      source_id: "root-memory-md",
      source_type: "root_memory_md",
      raw_content_persisted: false,
      generated_root_write_back: false,
      import_count: 1,
    });
  });

  it("reimports changed content and records safe provenance metadata only", async () => {
    const store = createHashGatedImportStore({ baseDir: path.join(tempDir, "state") });
    const source = {
      sourceId: "daily-note",
      sourceType: "daily_note" as const,
      absolutePath: sourcePath,
      authority: "workspace_note" as const,
      importedBy: "test",
    };

    await store.evaluate({ source });
    await writeFile(sourcePath, "Human-owned memory file\n- changed fact\n", "utf8");
    const result = await store.evaluate({ source });

    expect(result.status).toBe("written");
    const records = await store.readState();
    expect(records[0]?.import_count).toBe(2);
    expect(records[0]?.bounded_evidence_hashes[0]).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(records)).not.toContain("changed fact");
  });
});
