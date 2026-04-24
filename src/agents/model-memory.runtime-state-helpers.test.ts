import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendJsonLine,
  mergeSanitizedIdLists,
  readBooleanEnvFlag,
  readPositiveIntegerFromEnvValue,
  sanitizeIdList,
  sanitizeSafeSegment,
  writeJsonAtomic,
} from "./model-memory/runtime-state-helpers.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      await fs.rm(dir, { recursive: true, force: true });
    }),
  );
});

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-runtime-state-helpers-"));
  tempDirs.push(dir);
  return dir;
}

describe("model-memory runtime state helpers", () => {
  it("sanitizes safe segments and merges bounded id lists", () => {
    expect(sanitizeSafeSegment(" agent:main:main ")).toBe("agent:main:main");
    expect(sanitizeSafeSegment("not safe!")).toBeUndefined();
    expect(
      sanitizeIdList([" memory-2 ", "bad id!", "memory-1", "memory-1"], {
        maxEntries: 3,
      }),
    ).toEqual(["memory-2", "memory-1", "memory-1"]);
    expect(mergeSanitizedIdLists(["memory-2", "bad id!"], ["memory-1", "memory-2"])).toEqual([
      "memory-1",
      "memory-2",
    ]);
  });

  it("parses bounded integer and boolean env values with safe fallbacks", () => {
    expect(readPositiveIntegerFromEnvValue("7", 3, 10)).toBe(7);
    expect(readPositiveIntegerFromEnvValue("0", 3, 10)).toBe(1);
    expect(readPositiveIntegerFromEnvValue("999", 3, 10)).toBe(10);
    expect(readPositiveIntegerFromEnvValue("bad", 3, 10)).toBe(3);

    expect(readBooleanEnvFlag("true", false)).toBe(true);
    expect(readBooleanEnvFlag("Off", true)).toBe(false);
    expect(readBooleanEnvFlag(undefined, true)).toBe(true);
    expect(readBooleanEnvFlag("not-a-bool", false)).toBe(false);
  });

  it("writes JSON atomically and appends JSONL records", async () => {
    const dir = await makeTempDir();
    const jsonPath = path.join(dir, "state.json");
    const jsonlPath = path.join(dir, "events.jsonl");

    await writeJsonAtomic(jsonPath, { status: "clean", count: 1 });
    await appendJsonLine(jsonlPath, { event: "one" });
    await appendJsonLine(jsonlPath, { event: "two" });

    await expect(fs.readFile(jsonPath, "utf8")).resolves.toContain('"status": "clean"');
    await expect(fs.readFile(jsonlPath, "utf8")).resolves.toBe(
      `${JSON.stringify({ event: "one" })}\n${JSON.stringify({ event: "two" })}\n`,
    );
  });
});
