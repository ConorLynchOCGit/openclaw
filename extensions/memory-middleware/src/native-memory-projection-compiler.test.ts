import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  renderProjectionBody,
  resolveProjectionBlockId,
  resolveProjectionOutputPath,
  syncProjectionFile,
  trimProjectionCandidatesToBudget,
} from "./native-memory-projection-compiler.js";
import type { NativeMemoryProjectionCandidate } from "./native-memory-projection-eligibility.js";

describe("native memory projection compiler", () => {
  let tmpDir = "";

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-native-memory-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function createCandidate(
    overrides: Partial<NativeMemoryProjectionCandidate> = {},
  ): NativeMemoryProjectionCandidate {
    return {
      sourceId: "memory-1",
      sourceKind: "user",
      target: "user-profile",
      priority: 100,
      text: "Prefer concise answers",
      updatedAt: "2026-04-10T03:00:00.000Z",
      ...overrides,
    };
  }

  it("resolves deterministic block ids and output paths", () => {
    expect(resolveProjectionBlockId({ target: "memory-digest" })).toBe(
      "memory-projection:memory-digest",
    );
    expect(resolveProjectionOutputPath({ target: "memory-digest" })).toBe("MEMORY.md");
    expect(resolveProjectionOutputPath({ target: "daily-continuity", date: "2026-04-10" })).toBe(
      "memory/2026-04-10.md",
    );
  });

  it("trims candidates to a prompt budget deterministically", () => {
    const { kept, omittedCount } = trimProjectionCandidatesToBudget({
      candidates: [
        createCandidate({ text: "A".repeat(30) }),
        createCandidate({ sourceId: "memory-2", text: "B".repeat(30) }),
      ],
      maxChars: 35,
    });

    expect(kept).toHaveLength(1);
    expect(omittedCount).toBe(1);
  });

  it("renders deterministic projection bodies", () => {
    expect(
      renderProjectionBody({
        title: "Compiled User Memory",
        items: ["Prefer concise answers"],
        omittedCount: 1,
      }),
    ).toContain("Compiled User Memory");
  });

  it("preserves manual sections while writing generated blocks", async () => {
    const filePath = path.join(tmpDir, "USER.md");
    await fs.writeFile(filePath, "# USER\n\nManual section\n", "utf-8");

    const result = await syncProjectionFile({
      workspaceDir: tmpDir,
      target: { target: "user-profile" },
      body: renderProjectionBody({
        title: "Compiled User Memory",
        items: ["Prefer concise answers"],
      }),
      write: true,
    });

    const persisted = await fs.readFile(filePath, "utf-8");
    expect(result.changed).toBe(true);
    expect(persisted).toContain("Manual section");
    expect(persisted).toContain("Prefer concise answers");
  });

  it("becomes a clean no-op when the generated output is unchanged", async () => {
    const body = renderProjectionBody({
      title: "Compiled Memory Digest",
      items: ["Project fact: docs/zh-CN stays generated"],
    });

    await syncProjectionFile({
      workspaceDir: tmpDir,
      target: { target: "memory-digest" },
      body,
      write: true,
    });

    const second = await syncProjectionFile({
      workspaceDir: tmpDir,
      target: { target: "memory-digest" },
      body,
      write: true,
    });

    expect(second.changed).toBe(false);
    expect(second.wroteFile).toBe(false);
  });
});
