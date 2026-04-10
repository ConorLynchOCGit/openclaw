import { describe, expect, it } from "vitest";
import {
  classifyNativeMemorySurface,
  COMPILER_MANAGED_NATIVE_BOOTSTRAP_FILENAMES,
  HUMAN_AUTHORED_NATIVE_BOOTSTRAP_FILENAMES,
  isCompilerManagedNativeProjectionPath,
  isRawDailyMemoryLeafPath,
  resolveNativeMemoryProjectionRelativePath,
} from "./native-memory-surfaces.js";

describe("native memory surfaces", () => {
  it("keeps the compiler-managed bootstrap targets explicit", () => {
    expect(COMPILER_MANAGED_NATIVE_BOOTSTRAP_FILENAMES).toEqual([
      "USER.md",
      "TOOLS.md",
      "MEMORY.md",
    ]);
    expect(HUMAN_AUTHORED_NATIVE_BOOTSTRAP_FILENAMES).toContain("SOUL.md");
  });

  it("resolves deterministic relative paths for projection targets", () => {
    expect(
      resolveNativeMemoryProjectionRelativePath({
        target: "user-profile",
      }),
    ).toBe("USER.md");
    expect(
      resolveNativeMemoryProjectionRelativePath({
        target: "daily-continuity",
        date: "2026-04-10",
      }),
    ).toBe("memory/2026-04-10.md");
    expect(
      resolveNativeMemoryProjectionRelativePath({
        target: "project-memory-digest",
        projectSlug: "maintenance",
      }),
    ).toBe("projects/maintenance/INDEX.md");
    expect(
      resolveNativeMemoryProjectionRelativePath({
        target: "project-memory-digest",
        projectSlug: "maintenance",
        projectFileName: "MEMORY.md",
      }),
    ).toBe("projects/maintenance/MEMORY.md");
  });

  it("classifies compiler-managed and human-authored surfaces", () => {
    expect(classifyNativeMemorySurface("MEMORY.md")).toBe("compiled-bootstrap-projection");
    expect(classifyNativeMemorySurface("SOUL.md")).toBe("human-authored-bootstrap");
    expect(classifyNativeMemorySurface("projects/maintenance/MEMORY.md")).toBe(
      "compiled-project-projection",
    );
    expect(classifyNativeMemorySurface("projects/maintenance/INDEX.md")).toBe(
      "compiled-project-projection",
    );
    expect(classifyNativeMemorySurface("memory/2026-04-10.md")).toBe("compiled-daily-continuity");
    expect(classifyNativeMemorySurface("memory/2026-04-10-0901.md")).toBe("raw-daily-leaf");
    expect(classifyNativeMemorySurface("archives/daily_memory_evidence/2026-04-10.md")).toBe(
      "operator-review-evidence",
    );
  });

  it("recognizes compiler-managed projection paths and raw daily leaves", () => {
    expect(isCompilerManagedNativeProjectionPath("USER.md")).toBe(true);
    expect(isCompilerManagedNativeProjectionPath("projects/maintenance/MEMORY.md")).toBe(true);
    expect(isCompilerManagedNativeProjectionPath("projects/maintenance/INDEX.md")).toBe(true);
    expect(isCompilerManagedNativeProjectionPath("memory/2026-04-10.md")).toBe(true);
    expect(isCompilerManagedNativeProjectionPath("SOUL.md")).toBe(false);
    expect(isRawDailyMemoryLeafPath("memory/2026-04-10-foo.md")).toBe(true);
    expect(isRawDailyMemoryLeafPath("memory/2026-04-10.md")).toBe(false);
  });
});
