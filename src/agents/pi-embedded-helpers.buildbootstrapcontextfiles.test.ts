import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import {
  buildBootstrapContextFiles,
  DEFAULT_BOOTSTRAP_MAX_CHARS,
  DEFAULT_BOOTSTRAP_PROMPT_TRUNCATION_WARNING_MODE,
  DEFAULT_BOOTSTRAP_TOTAL_MAX_CHARS,
  ensureSessionHeader,
  normalizeBootstrapFileContentForInjection,
  resolveBootstrapMaxChars,
  resolveBootstrapPromptTruncationWarningMode,
  resolveBootstrapTotalMaxChars,
} from "./pi-embedded-helpers.js";
import type { WorkspaceBootstrapFile } from "./workspace.js";
import { DEFAULT_AGENTS_FILENAME } from "./workspace.js";

const makeFile = (overrides: Partial<WorkspaceBootstrapFile>): WorkspaceBootstrapFile => ({
  name: DEFAULT_AGENTS_FILENAME,
  path: "/tmp/AGENTS.md",
  content: "",
  missing: false,
  ...overrides,
});

const createLargeBootstrapFiles = (): WorkspaceBootstrapFile[] => [
  makeFile({ name: "AGENTS.md", content: "a".repeat(10_000) }),
  makeFile({ name: "SOUL.md", path: "/tmp/SOUL.md", content: "b".repeat(10_000) }),
  makeFile({ name: "USER.md", path: "/tmp/USER.md", content: "c".repeat(10_000) }),
];

describe("ensureSessionHeader", () => {
  it("creates transcript files with restrictive permissions", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-session-header-"));
    try {
      const sessionFile = path.join(tempDir, "nested", "session.jsonl");
      await ensureSessionHeader({ sessionFile, sessionId: "session-1", cwd: tempDir });

      expect((await fs.stat(path.dirname(sessionFile))).mode & 0o777).toBe(0o700);
      expect((await fs.stat(sessionFile)).mode & 0o777).toBe(0o600);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe("buildBootstrapContextFiles", () => {
  it("keeps missing markers", () => {
    const files = [makeFile({ missing: true, content: undefined })];
    expect(buildBootstrapContextFiles(files)).toEqual([
      {
        path: "/tmp/AGENTS.md",
        content: "[MISSING] Expected at: /tmp/AGENTS.md",
      },
    ]);
  });
  it("skips empty or whitespace-only content", () => {
    const files = [makeFile({ content: "   \n  " })];
    expect(buildBootstrapContextFiles(files)).toEqual([]);
  });
  it("truncates large bootstrap content", () => {
    const head = `HEAD-${"a".repeat(600)}`;
    const tail = `${"b".repeat(300)}-TAIL`;
    const long = `${head}${tail}`;
    const files = [makeFile({ name: "TOOLS.md", content: long })];
    const warnings: string[] = [];
    const maxChars = 200;
    const expectedTailChars = Math.floor(maxChars * 0.2);
    const [result] = buildBootstrapContextFiles(files, {
      maxChars,
      warn: (message) => warnings.push(message),
    });
    expect(result?.content).toContain("[...truncated, read TOOLS.md for full content...]");
    expect(result?.content.length).toBeLessThan(long.length);
    expect(result?.content.startsWith(long.slice(0, 120))).toBe(true);
    expect(result?.content.endsWith(long.slice(-expectedTailChars))).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("TOOLS.md");
    expect(warnings[0]).toContain("limit 200");
  });
  it("keeps content under the default limit", () => {
    const long = "a".repeat(DEFAULT_BOOTSTRAP_MAX_CHARS - 10);
    const files = [makeFile({ content: long })];
    const [result] = buildBootstrapContextFiles(files);
    expect(result?.content).toBe(long);
    expect(result?.content).not.toContain("[...truncated, read AGENTS.md for full content...]");
  });

  it("keeps live-scale AGENTS.md and MEMORY.md content under the default limits", () => {
    const files = [
      makeFile({ name: "AGENTS.md", content: "a".repeat(15_159) }),
      makeFile({ name: "MEMORY.md", path: "/tmp/MEMORY.md", content: "b".repeat(24_875) }),
    ];

    const result = buildBootstrapContextFiles(files);

    expect(result).toHaveLength(2);
    expect(result[0]?.content).toHaveLength(15_159);
    expect(result[1]?.content).toHaveLength(24_875);
    expect(result[0]?.content).not.toContain("[...truncated, read AGENTS.md for full content...]");
    expect(result[1]?.content).not.toContain("[...truncated, read MEMORY.md for full content...]");
  });

  it("strips generated MEMORY.md scaffolding from injected bootstrap content", () => {
    const memoryContent = [
      "<!-- BEGIN GENERATED: model-memory -->",
      "# MEMORY.md",
      "",
      "## Standing Context",
      "- generated",
      "<!-- END GENERATED: model-memory -->",
      "",
      "<!-- BEGIN GENERATED: openclaw-canonical -->",
      "## Workspace Recall Index",
      "- generated",
      "<!-- END GENERATED: openclaw-canonical -->",
      "",
      "# MEMORY.md",
      "",
      "## Long-Term Context",
      "- durable human note",
    ].join("\n");

    expect(
      normalizeBootstrapFileContentForInjection({
        name: "MEMORY.md",
        content: memoryContent,
      }),
    ).toBe(["# MEMORY.md", "", "## Long-Term Context", "- durable human note"].join("\n"));
  });

  it("strips generated USER.md projection blocks from injected bootstrap content", () => {
    const userContent = [
      "# USER.md",
      "",
      "## Human Profile",
      "- durable user note",
      "",
      "<!-- OPENCLAW:MEMORY-PROJECTION:START memory-projection:user-profile -->",
      "- old generated preference",
      "<!-- OPENCLAW:MEMORY-PROJECTION:END memory-projection:user-profile -->",
      "",
      "<!-- BEGIN GENERATED: model-memory -->",
      "- generated preference",
      "<!-- END GENERATED: model-memory -->",
      "",
      "<!-- BEGIN GENERATED: openclaw-canonical -->",
      "- artifact pointer",
      "<!-- END GENERATED: openclaw-canonical -->",
    ].join("\n");

    expect(
      normalizeBootstrapFileContentForInjection({
        name: "USER.md",
        content: userContent,
      }),
    ).toBe(["# USER.md", "", "## Human Profile", "- durable user note"].join("\n"));
  });

  it("keeps curated MEMORY.md bootstrap content without truncation once generated blocks are stripped", () => {
    const generatedBlock = [
      "<!-- BEGIN GENERATED: model-memory -->",
      "# MEMORY.md",
      "",
      "## Standing Context",
      `- ${"g".repeat(40_000)}`,
      "<!-- END GENERATED: model-memory -->",
      "",
      "<!-- BEGIN GENERATED: openclaw-canonical -->",
      "## Workspace Recall Index",
      `- ${"h".repeat(10_000)}`,
      "<!-- END GENERATED: openclaw-canonical -->",
      "",
    ].join("\n");
    const curatedBlock = ["# MEMORY.md", "", "## Long-Term Context", `- ${"c".repeat(5_000)}`].join(
      "\n",
    );
    const warnings: string[] = [];

    const result = buildBootstrapContextFiles(
      [
        makeFile({
          name: "MEMORY.md",
          path: "/tmp/MEMORY.md",
          content: `${generatedBlock}${curatedBlock}`,
        }),
      ],
      { warn: (message) => warnings.push(message) },
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.content).toBe(curatedBlock);
    expect(warnings).toEqual([]);
  });

  it("keeps total injected bootstrap characters under the new default total cap", () => {
    const files = createLargeBootstrapFiles();
    const result = buildBootstrapContextFiles(files);
    const totalChars = result.reduce((sum, entry) => sum + entry.content.length, 0);
    expect(totalChars).toBeLessThanOrEqual(DEFAULT_BOOTSTRAP_TOTAL_MAX_CHARS);
    expect(result).toHaveLength(3);
    expect(result[2]?.content).toBe("c".repeat(10_000));
  });

  it("caps total injected bootstrap characters when totalMaxChars is configured", () => {
    const files = createLargeBootstrapFiles();
    const result = buildBootstrapContextFiles(files, { totalMaxChars: 24_000 });
    const totalChars = result.reduce((sum, entry) => sum + entry.content.length, 0);
    expect(totalChars).toBeLessThanOrEqual(24_000);
    expect(result).toHaveLength(3);
    expect(result[2]?.content).toContain("[...truncated, read USER.md for full content...]");
  });

  it("enforces strict total cap even when truncation markers are present", () => {
    const files = [
      makeFile({ name: "AGENTS.md", content: "a".repeat(1_000) }),
      makeFile({ name: "SOUL.md", path: "/tmp/SOUL.md", content: "b".repeat(1_000) }),
    ];
    const result = buildBootstrapContextFiles(files, {
      maxChars: 100,
      totalMaxChars: 150,
    });
    const totalChars = result.reduce((sum, entry) => sum + entry.content.length, 0);
    expect(totalChars).toBeLessThanOrEqual(150);
  });

  it("skips bootstrap injection when remaining total budget is too small", () => {
    const files = [makeFile({ name: "AGENTS.md", content: "a".repeat(1_000) })];
    const result = buildBootstrapContextFiles(files, {
      maxChars: 200,
      totalMaxChars: 40,
    });
    expect(result).toEqual([]);
  });

  it("keeps missing markers under small total budgets", () => {
    const files = [makeFile({ missing: true, content: undefined })];
    const result = buildBootstrapContextFiles(files, {
      totalMaxChars: 20,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.content.length).toBeLessThanOrEqual(20);
    expect(result[0]?.content.startsWith("[MISSING]")).toBe(true);
  });

  it("skips files with missing or invalid paths and emits warnings", () => {
    const malformedMissingPath = {
      name: "SKILL-SECURITY.md",
      missing: false,
      content: "secret",
    } as unknown as WorkspaceBootstrapFile;
    const malformedNonStringPath = {
      name: "SKILL-SECURITY.md",
      path: 123,
      missing: false,
      content: "secret",
    } as unknown as WorkspaceBootstrapFile;
    const malformedWhitespacePath = {
      name: "SKILL-SECURITY.md",
      path: "   ",
      missing: false,
      content: "secret",
    } as unknown as WorkspaceBootstrapFile;
    const good = makeFile({ content: "hello" });
    const warnings: string[] = [];
    const result = buildBootstrapContextFiles(
      [malformedMissingPath, malformedNonStringPath, malformedWhitespacePath, good],
      {
        warn: (msg) => warnings.push(msg),
      },
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.path).toBe("/tmp/AGENTS.md");
    expect(warnings).toHaveLength(3);
    expect(warnings.every((warning) => warning.includes('missing or invalid "path" field'))).toBe(
      true,
    );
  });
});

type BootstrapLimitResolverCase = {
  name: "bootstrapMaxChars" | "bootstrapTotalMaxChars";
  resolve: (cfg?: OpenClawConfig) => number;
  defaultValue: number;
};

const BOOTSTRAP_LIMIT_RESOLVERS: BootstrapLimitResolverCase[] = [
  {
    name: "bootstrapMaxChars",
    resolve: resolveBootstrapMaxChars,
    defaultValue: DEFAULT_BOOTSTRAP_MAX_CHARS,
  },
  {
    name: "bootstrapTotalMaxChars",
    resolve: resolveBootstrapTotalMaxChars,
    defaultValue: DEFAULT_BOOTSTRAP_TOTAL_MAX_CHARS,
  },
];

describe("bootstrap limit resolvers", () => {
  it("return defaults when unset", () => {
    for (const resolver of BOOTSTRAP_LIMIT_RESOLVERS) {
      expect(resolver.resolve()).toBe(resolver.defaultValue);
    }
  });

  it("use configured values when valid", () => {
    for (const resolver of BOOTSTRAP_LIMIT_RESOLVERS) {
      const cfg = {
        agents: { defaults: { [resolver.name]: 12345 } },
      } as OpenClawConfig;
      expect(resolver.resolve(cfg)).toBe(12345);
    }
  });

  it("fall back when values are invalid", () => {
    for (const resolver of BOOTSTRAP_LIMIT_RESOLVERS) {
      const cfg = {
        agents: { defaults: { [resolver.name]: -1 } },
      } as OpenClawConfig;
      expect(resolver.resolve(cfg)).toBe(resolver.defaultValue);
    }
  });
});

describe("resolveBootstrapPromptTruncationWarningMode", () => {
  it("defaults to once", () => {
    expect(resolveBootstrapPromptTruncationWarningMode()).toBe(
      DEFAULT_BOOTSTRAP_PROMPT_TRUNCATION_WARNING_MODE,
    );
  });

  it("accepts explicit valid modes", () => {
    expect(
      resolveBootstrapPromptTruncationWarningMode({
        agents: { defaults: { bootstrapPromptTruncationWarning: "off" } },
      } as OpenClawConfig),
    ).toBe("off");
    expect(
      resolveBootstrapPromptTruncationWarningMode({
        agents: { defaults: { bootstrapPromptTruncationWarning: "always" } },
      } as OpenClawConfig),
    ).toBe("always");
  });

  it("falls back to default for invalid values", () => {
    expect(
      resolveBootstrapPromptTruncationWarningMode({
        agents: { defaults: { bootstrapPromptTruncationWarning: "invalid" } },
      } as unknown as OpenClawConfig),
    ).toBe(DEFAULT_BOOTSTRAP_PROMPT_TRUNCATION_WARNING_MODE);
  });
});
