import { Command } from "commander";
import type { OpenClawConfig } from "openclaw/plugin-sdk/memory-core";
import { describe, expect, it, vi } from "vitest";
import plugin, {
  buildMemoryFlushPlan,
  buildPromptSection,
  DEFAULT_MEMORY_FLUSH_FORCE_TRANSCRIPT_BYTES,
  DEFAULT_MEMORY_FLUSH_PROMPT,
  DEFAULT_MEMORY_FLUSH_SOFT_TOKENS,
} from "./index.js";
import { memoryRuntime } from "./src/runtime-provider.js";

describe("buildPromptSection", () => {
  it("returns empty when no memory tools are available", () => {
    expect(buildPromptSection({ availableTools: new Set() })).toEqual([]);
  });

  it("describes the two-step flow when both memory tools are available", () => {
    const result = buildPromptSection({
      availableTools: new Set(["memory_search", "memory_get"]),
    });
    expect(result[0]).toBe("## Memory Recall");
    expect(result[1]).toContain("run memory_search");
    expect(result[1]).toContain("then use memory_get");
    expect(result).toContain(
      "Citations: include Source: <path#line> when it helps the user verify memory snippets.",
    );
    expect(result.at(-1)).toBe("");
  });

  it("limits the guidance to memory_search when only search is available", () => {
    const result = buildPromptSection({ availableTools: new Set(["memory_search"]) });
    expect(result[0]).toBe("## Memory Recall");
    expect(result[1]).toContain("run memory_search");
    expect(result[1]).not.toContain("then use memory_get");
  });

  it("limits the guidance to memory_get when only get is available", () => {
    const result = buildPromptSection({ availableTools: new Set(["memory_get"]) });
    expect(result[0]).toBe("## Memory Recall");
    expect(result[1]).toContain("run memory_get");
    expect(result[1]).not.toContain("run memory_search");
  });

  it("includes citations-off instruction when citationsMode is off", () => {
    const result = buildPromptSection({
      availableTools: new Set(["memory_search"]),
      citationsMode: "off",
    });
    expect(result).toContain(
      "Citations are disabled: do not mention file paths or line numbers in replies unless the user explicitly asks.",
    );
  });

  it("adds durable memory guidance when middleware tools are available", () => {
    const result = buildPromptSection({
      availableTools: new Set([
        "memory_candidate_submit",
        "memory_object_search_hybrid",
        "memory_session_update",
      ]),
    });

    expect(result[0]).toBe("## Durable Memory");
    expect(result[1]).toContain("inspect existing approved memory");
    expect(result[2]).toContain("search approved durable memory before answering");
    expect(result[3]).toContain("memory_object_search_hybrid");
    expect(result[4]).toContain("directly answers the question");
    expect(result[5]).toContain("memory_candidate_submit");
    expect(result[6]).toContain("Actually, No, I meant");
    expect(result[7]).toContain("keep replies concise");
    expect(result[8]).toContain("store, remember, or save");
    expect(result[9]).toContain("plain favorite/preferred preference");
    expect(result[10]).toContain("some low-risk classes auto-promote");
    expect(result[11]).toContain("memory_session_get and memory_session_update");
    expect(result.at(-1)).toBe("");
  });

  it("combines recall and durable memory guidance when both surfaces are available", () => {
    const result = buildPromptSection({
      availableTools: new Set([
        "memory_search",
        "memory_get",
        "memory_candidate_submit",
        "memory_object_list",
      ]),
    });

    expect(result[0]).toBe("## Memory Recall");
    expect(result).toContain("## Durable Memory");
    expect(result).toContain(
      "When the user shares a recurring requirement, important correction, reusable procedure, or project improvement that should survive beyond the current turn, submit a concise candidate with memory_candidate_submit.",
    );
    expect(result).toContain(
      "Natural correction phrasing still counts: if the user says things like Actually, No, I meant, or That's not right to correct a durable preference, default, or recurring requirement, submit it as kind=correction even without an explicit save request.",
    );
    expect(result).toContain(
      "If the user states a bounded recurring response requirement in plain language, such as keep replies concise, use bullet points when listing items, use plain English, or do not use tables unless asked, submit it as a learning candidate.",
    );
    expect(result).toContain(
      "If the user explicitly asks you to store, remember, or save one of those durable items, call memory_candidate_submit before you answer unless the content is disallowed.",
    );
    expect(result).toContain(
      "Do not call memory_candidate_submit just because the user naturally states a plain favorite/preferred preference in ordinary conversation; that narrow low-risk preference class may be auto-captured already.",
    );
  });
});

describe("plugin registration", () => {
  it("registers memory tools + cli through extension-local modules", () => {
    const registerTool = vi.fn();
    const registerMemoryPromptSection = vi.fn();
    const registerMemoryFlushPlan = vi.fn();
    const registerMemoryRuntime = vi.fn();
    const registerMemoryEmbeddingProvider = vi.fn();
    const registerCli = vi.fn();
    const api = {
      registerTool,
      registerMemoryPromptSection,
      registerMemoryFlushPlan,
      registerMemoryRuntime,
      registerMemoryEmbeddingProvider,
      registerCli,
    };

    plugin.register(api as never);

    expect(registerMemoryPromptSection).toHaveBeenCalledWith(buildPromptSection);
    expect(registerMemoryFlushPlan).toHaveBeenCalledWith(buildMemoryFlushPlan);
    expect(registerMemoryRuntime).toHaveBeenCalledWith(memoryRuntime);
    expect(registerMemoryEmbeddingProvider).toHaveBeenCalledTimes(6);
    expect(registerTool).toHaveBeenCalledTimes(2);
    expect(registerTool.mock.calls[0]?.[1]).toEqual({ names: ["memory_search"] });
    expect(registerTool.mock.calls[1]?.[1]).toEqual({ names: ["memory_get"] });
    expect(registerCli).toHaveBeenCalledWith(expect.any(Function), {
      descriptors: [
        {
          name: "memory",
          description: "Search, inspect, and reindex memory files",
          hasSubcommands: true,
        },
      ],
    });

    const searchFactory = registerTool.mock.calls[0]?.[0] as
      | ((ctx: unknown) => unknown)
      | undefined;
    const getFactory = registerTool.mock.calls[1]?.[0] as ((ctx: unknown) => unknown) | undefined;
    const cliRegistrar = registerCli.mock.calls[0]?.[0] as
      | ((ctx: { program: unknown }) => void)
      | undefined;
    const ctx = { config: { plugins: {} }, sessionKey: "agent:main:slack:dm:u123" };
    const program = new Command();

    expect((searchFactory?.(ctx) as { name?: string } | null)?.name).toBe("memory_search");
    expect((getFactory?.(ctx) as { name?: string } | null)?.name).toBe("memory_get");
    expect(() => cliRegistrar?.({ program } as never)).not.toThrow();
    expect(program.commands.map((command) => command.name())).toContain("memory");
  });
});

describe("buildMemoryFlushPlan", () => {
  const cfg = {
    agents: {
      defaults: {
        userTimezone: "America/New_York",
        timeFormat: "12",
      },
    },
  } as OpenClawConfig;

  it("replaces YYYY-MM-DD using user timezone and appends current time", () => {
    const plan = buildMemoryFlushPlan({
      cfg: {
        ...cfg,
        agents: {
          ...cfg.agents,
          defaults: {
            ...cfg.agents?.defaults,
            compaction: {
              memoryFlush: {
                prompt: "Store durable notes in memory/YYYY-MM-DD.md",
              },
            },
          },
        },
      },
      nowMs: Date.UTC(2026, 1, 16, 15, 0, 0),
    });

    expect(plan?.prompt).toContain("memory/2026-02-16.md");
    expect(plan?.prompt).toContain(
      "Current time: Monday, February 16th, 2026 — 10:00 AM (America/New_York) / 2026-02-16 15:00 UTC",
    );
    expect(plan?.relativePath).toBe("memory/2026-02-16.md");
  });

  it("does not append a duplicate current time line", () => {
    const plan = buildMemoryFlushPlan({
      cfg: {
        ...cfg,
        agents: {
          ...cfg.agents,
          defaults: {
            ...cfg.agents?.defaults,
            compaction: {
              memoryFlush: {
                prompt: "Store notes.\nCurrent time: already present",
              },
            },
          },
        },
      },
      nowMs: Date.UTC(2026, 1, 16, 15, 0, 0),
    });

    expect(plan?.prompt).toContain("Current time: already present");
    expect((plan?.prompt.match(/Current time:/g) ?? []).length).toBe(1);
  });

  it("defaults to safe prompts and gating values", () => {
    const plan = buildMemoryFlushPlan();
    expect(plan).not.toBeNull();
    expect(plan?.softThresholdTokens).toBe(DEFAULT_MEMORY_FLUSH_SOFT_TOKENS);
    expect(plan?.forceFlushTranscriptBytes).toBe(DEFAULT_MEMORY_FLUSH_FORCE_TRANSCRIPT_BYTES);
    expect(plan?.prompt).toContain("memory/");
    expect(plan?.prompt).toContain("MEMORY.md");
    expect(plan?.systemPrompt).toContain("MEMORY.md");
  });

  it("respects disable flag", () => {
    expect(
      buildMemoryFlushPlan({
        cfg: {
          agents: {
            defaults: { compaction: { memoryFlush: { enabled: false } } },
          },
        },
      }),
    ).toBeNull();
  });

  it("falls back to defaults when numeric values are invalid", () => {
    const plan = buildMemoryFlushPlan({
      cfg: {
        agents: {
          defaults: {
            compaction: {
              reserveTokensFloor: Number.NaN,
              memoryFlush: {
                softThresholdTokens: -100,
              },
            },
          },
        },
      },
    });

    expect(plan?.softThresholdTokens).toBe(DEFAULT_MEMORY_FLUSH_SOFT_TOKENS);
    expect(plan?.forceFlushTranscriptBytes).toBe(DEFAULT_MEMORY_FLUSH_FORCE_TRANSCRIPT_BYTES);
    expect(plan?.reserveTokensFloor).toBe(20_000);
  });

  it("parses forceFlushTranscriptBytes from byte-size strings", () => {
    const plan = buildMemoryFlushPlan({
      cfg: {
        agents: {
          defaults: {
            compaction: {
              memoryFlush: {
                forceFlushTranscriptBytes: "3mb",
              },
            },
          },
        },
      },
    });

    expect(plan?.forceFlushTranscriptBytes).toBe(3 * 1024 * 1024);
  });

  it("keeps overwrite guards in the default prompt", () => {
    expect(DEFAULT_MEMORY_FLUSH_PROMPT).toMatch(/APPEND/i);
    expect(DEFAULT_MEMORY_FLUSH_PROMPT).toContain("do not overwrite");
    expect(DEFAULT_MEMORY_FLUSH_PROMPT).toContain("timestamped variant");
    expect(DEFAULT_MEMORY_FLUSH_PROMPT).toContain("YYYY-MM-DD.md");
  });
});
