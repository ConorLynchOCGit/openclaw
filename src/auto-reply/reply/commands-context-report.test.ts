import { describe, expect, it } from "vitest";
import { buildContextReply } from "./commands-context-report.js";
import type { HandleCommandsParams } from "./commands-types.js";

function makeParams(
  commandBodyNormalized: string,
  truncated: boolean,
  options?: { omitBootstrapLimits?: boolean },
): HandleCommandsParams {
  return {
    command: {
      commandBodyNormalized,
      channel: "telegram",
      senderIsOwner: true,
    },
    sessionKey: "agent:default:main",
    workspaceDir: "/tmp/workspace",
    contextTokens: null,
    provider: "openai",
    model: "gpt-5",
    elevated: { allowed: false },
    resolvedThinkLevel: "off",
    resolvedReasoningLevel: "off",
    sessionEntry: {
      totalTokens: 123,
      inputTokens: 100,
      outputTokens: 23,
      systemPromptReport: {
        source: "run",
        generatedAt: Date.now(),
        workspaceDir: "/tmp/workspace",
        bootstrapMaxChars: options?.omitBootstrapLimits ? undefined : 20_000,
        bootstrapTotalMaxChars: options?.omitBootstrapLimits ? undefined : 150_000,
        sandbox: { mode: "off", sandboxed: false },
        systemPrompt: {
          chars: 1_000,
          projectContextChars: 500,
          nonProjectContextChars: 500,
        },
        promptArtifacts: {
          fullSystemPromptHash: "fullhash12345678",
          fullSystemPromptChars: 1_000,
          baseSystemPromptHash: "basehash12345678",
          baseSystemPromptChars: 900,
          memoryPackPromptHash: "memhash123456789",
          memoryPackPromptChars: 100,
          injectedFilesHash: "fileshash1234567",
          injectedFilesChars: truncated ? 20_000 : 10_000,
          skillsHash: "skillshash123456",
          skillsChars: 10,
          toolsListHash: "toolslisthash12",
          toolsListChars: 10,
          toolsSchemaHash: "toolsschema1234",
          toolsSchemaChars: 20,
        },
        promptArtifactChanges: {
          comparedToGeneratedAt: Date.now() - 1_000,
          changed: true,
          changedTailOnly: false,
          stablePrefixReusable: false,
          segmentDrift: {
            stableChanged: false,
            semiStableChanged: true,
            volatileChanged: false,
          },
          reasons: ["memory_pack_segment_changed", "skills_prompt_changed"],
        },
        memoryPacks: {
          promptChars: 100,
          entries: [
            {
              kind: "user",
              title: "User Memory Pack",
              chars: 60,
              approxTokens: 15,
              hash: "memhash-user-123",
              itemCount: 2,
              omittedItemCount: 1,
            },
            {
              kind: "project",
              title: "Project Memory Pack",
              chars: 40,
              approxTokens: 10,
              hash: "memhash-project-1",
              itemCount: 1,
              omittedItemCount: 0,
            },
          ],
        },
        contextSegments: {
          totalBudgetTokens: 8_000,
          usableBudgetTokens: 5_200,
          policy: {
            reserveOutputTokens: 1_600,
            reserveToolLoopTokens: 800,
            reserveGuardTokens: 400,
            stableTargetTokens: 2_340,
            semiStableTargetTokens: 1_040,
            volatileTargetTokens: 1_820,
            overflowDegradeOrder: [
              "volatile_live_tool_results",
              "volatile_recent_messages",
              "semi_stable_memory_packs",
            ],
          },
          totals: {
            stableChars: 900,
            stableTokens: 225,
            stableHash: "stablehash123456",
            stablePressure: "within_target",
            semiStableChars: 100,
            semiStableTokens: 25,
            semiStableHash: "semihash12345678",
            semiStablePressure: "within_target",
            volatileChars: 220,
            volatileTokens: 55,
            volatileHash: "volatilehash1234",
            volatilePressure: "within_target",
          },
          segments: [
            {
              id: "base_system_prompt",
              label: "Base system prompt",
              owner: "system_prompt_builder",
              class: "stable",
              chars: 900,
              approxTokens: 225,
              hash: "stablehash123456",
              order: 0,
              budgetPressure: "within_target",
            },
            {
              id: "approved_memory_context",
              label: "Approved durable memory packs",
              owner: "memory_context_control_plane",
              class: "semi_stable",
              chars: 100,
              approxTokens: 25,
              hash: "semihash12345678",
              order: 1,
              budgetPressure: "within_target",
            },
            {
              id: "current_turn_prompt",
              label: "Current turn prompt",
              owner: "turn_input",
              class: "volatile",
              chars: 220,
              approxTokens: 55,
              hash: "volatilehash1234",
              order: 2,
              budgetPressure: "within_target",
            },
          ],
        },
        injectedWorkspaceFiles: [
          {
            name: "AGENTS.md",
            path: "/tmp/workspace/AGENTS.md",
            missing: false,
            rawChars: truncated ? 200_000 : 10_000,
            injectedChars: truncated ? 20_000 : 10_000,
            truncated,
          },
        ],
        skills: {
          promptChars: 10,
          entries: [{ name: "checks", blockChars: 10 }],
        },
        tools: {
          listChars: 10,
          schemaChars: 20,
          entries: [{ name: "read", summaryChars: 10, schemaChars: 20, propertiesCount: 1 }],
        },
      },
    },
    cfg: {},
    ctx: {},
    commandBody: "",
    commandArgs: [],
    resolvedElevatedLevel: "off",
  } as unknown as HandleCommandsParams;
}

describe("buildContextReply", () => {
  it("shows bootstrap truncation warning in list output when context exceeds configured limits", async () => {
    const result = await buildContextReply(makeParams("/context list", true));
    expect(result.text).toContain("Bootstrap max/total: 150,000 chars");
    expect(result.text).toContain("⚠ Bootstrap context is over configured limits");
    expect(result.text).toContain("Causes: 1 file(s) exceeded max/file.");
  });

  it("does not show bootstrap truncation warning when there is no truncation", async () => {
    const result = await buildContextReply(makeParams("/context list", false));
    expect(result.text).not.toContain("Bootstrap context is over configured limits");
  });

  it("falls back to config defaults when legacy reports are missing bootstrap limits", async () => {
    const result = await buildContextReply(
      makeParams("/context list", false, {
        omitBootstrapLimits: true,
      }),
    );
    expect(result.text).toContain("Bootstrap max/file: 20,000 chars");
    expect(result.text).toContain("Bootstrap max/total: 150,000 chars");
    expect(result.text).not.toContain("Bootstrap max/file: ? chars");
  });

  it("shows prompt artifact hashes and sizes in detailed output", async () => {
    const result = await buildContextReply(makeParams("/context detail", false));

    expect(result.text).toContain("Prompt artifacts:");
    expect(result.text).toContain("Memory packs total: 100 chars (~25 tok)");
    expect(result.text).toContain("Context segments:");
    expect(result.text).toContain("- stable: 900 chars (~225 tok) | within_target");
    expect(result.text).toContain(
      "- usable budget: ~5,200 tok (stable 2,340, semi-stable 1,040, volatile 1,820)",
    );
    expect(result.text).toContain(
      "- Approved durable memory packs: semi-stable | memory_context_control_plane | 100 chars (~25 tok) | within_target",
    );
    expect(result.text).toContain("- User Memory Pack: 60 chars | ~15 tok | 2 entries | omitted 1");
    expect(result.text).toContain("- full prompt: fullhash1234 | 1,000 chars");
    expect(result.text).toContain("- base prompt: basehash1234 | 900 chars");
    expect(result.text).toContain("- memory packs: memhash12345 | 100 chars");
    expect(result.text).toContain("- injected files: fileshash123 | 10,000 chars");
    expect(result.text).toContain("- tool schemas: toolsschema1 | 20 chars");
    expect(result.text).toContain(
      "Prompt drift vs previous run: changed (memory pack segment changed, skills prompt changed)",
    );
    expect(result.text).toContain(
      "Segment drift vs previous run: stable=false semi-stable=true volatile=false",
    );
    expect(result.text).toContain("Cache posture vs previous run: stable prefix changed");
  });
});
