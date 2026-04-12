import { describe, expect, it } from "vitest";
import type { SessionSystemPromptReport } from "../config/sessions/types.js";
import {
  annotatePromptArtifactChanges,
  resolvePromptArtifactChanges,
} from "./system-prompt-artifacts.js";

function makeReport(
  promptArtifacts: NonNullable<SessionSystemPromptReport["promptArtifacts"]>,
): SessionSystemPromptReport {
  return {
    source: "run",
    generatedAt: 123,
    systemPrompt: {
      chars: promptArtifacts.fullSystemPromptChars,
      projectContextChars: 0,
      nonProjectContextChars: promptArtifacts.fullSystemPromptChars,
    },
    promptArtifacts,
    contextSegments: {
      policy: {
        overflowDegradeOrder: [],
      },
      totals: {
        stableChars: 80,
        stableTokens: 20,
        stableHash: "stable-a",
        stablePressure: "within_target",
        semiStableChars: 20,
        semiStableTokens: 5,
        semiStableHash: "semi-a",
        semiStablePressure: "within_target",
        volatileChars: 0,
        volatileTokens: 0,
        volatileHash: "volatile-a",
        volatilePressure: "unknown",
      },
      segments: [],
    },
    injectedWorkspaceFiles: [],
    skills: { promptChars: 0, entries: [] },
    tools: { listChars: 0, schemaChars: 0, entries: [] },
  };
}

describe("system prompt artifacts", () => {
  it("reports stable prompt artifacts when hashes match", () => {
    const previous = makeReport({
      fullSystemPromptHash: "full-a",
      fullSystemPromptChars: 100,
      baseSystemPromptHash: "base-a",
      baseSystemPromptChars: 80,
      memoryPackPromptHash: "memory-a",
      memoryPackPromptChars: 20,
      injectedFilesHash: "inject-a",
      injectedFilesChars: 12,
      skillsHash: "skills-a",
      skillsChars: 5,
      toolsListHash: "tools-list-a",
      toolsListChars: 6,
      toolsSchemaHash: "tools-schema-a",
      toolsSchemaChars: 18,
    });

    const current = makeReport({
      ...previous.promptArtifacts!,
      fullSystemPromptHash: "full-b",
    });

    expect(resolvePromptArtifactChanges({ current, previous })).toEqual({
      comparedToGeneratedAt: 123,
      changed: false,
      changedTailOnly: false,
      stablePrefixReusable: true,
      segmentDrift: {
        stableChanged: false,
        semiStableChanged: false,
        volatileChanged: false,
      },
      reasons: [],
    });
  });

  it("reports memory-pack and skills changes when hashes differ", () => {
    const previous = makeReport({
      fullSystemPromptHash: "full-a",
      fullSystemPromptChars: 100,
      baseSystemPromptHash: "base-a",
      baseSystemPromptChars: 80,
      memoryPackPromptHash: "memory-a",
      memoryPackPromptChars: 20,
      injectedFilesHash: "inject-a",
      injectedFilesChars: 12,
      skillsHash: "skills-a",
      skillsChars: 5,
      toolsListHash: "tools-list-a",
      toolsListChars: 6,
      toolsSchemaHash: "tools-schema-a",
      toolsSchemaChars: 18,
    });
    const current = makeReport({
      ...previous.promptArtifacts!,
      fullSystemPromptHash: "full-b",
      memoryPackPromptHash: "memory-b",
      skillsHash: "skills-b",
    });
    current.contextSegments = {
      ...current.contextSegments!,
      totals: {
        ...current.contextSegments!.totals,
        semiStableHash: "semi-b",
      },
    };

    expect(annotatePromptArtifactChanges({ current, previous })?.promptArtifactChanges).toEqual({
      comparedToGeneratedAt: 123,
      changed: true,
      changedTailOnly: false,
      stablePrefixReusable: false,
      segmentDrift: {
        stableChanged: false,
        semiStableChanged: true,
        volatileChanged: false,
      },
      reasons: ["memory_pack_segment_changed", "skills_prompt_changed"],
    });
  });

  it("reports memory-pack presence changes when packs are added or removed", () => {
    const previous = makeReport({
      fullSystemPromptHash: "full-a",
      fullSystemPromptChars: 100,
      baseSystemPromptHash: "base-a",
      baseSystemPromptChars: 100,
      injectedFilesHash: "inject-a",
      injectedFilesChars: 12,
      skillsHash: "skills-a",
      skillsChars: 5,
      toolsListHash: "tools-list-a",
      toolsListChars: 6,
      toolsSchemaHash: "tools-schema-a",
      toolsSchemaChars: 18,
    });
    const current = makeReport({
      ...previous.promptArtifacts!,
      fullSystemPromptHash: "full-b",
      memoryPackPromptHash: "memory-b",
      memoryPackPromptChars: 20,
    });

    expect(annotatePromptArtifactChanges({ current, previous })?.promptArtifactChanges).toEqual({
      comparedToGeneratedAt: 123,
      changed: true,
      changedTailOnly: true,
      stablePrefixReusable: true,
      segmentDrift: {
        stableChanged: false,
        semiStableChanged: false,
        volatileChanged: false,
      },
      reasons: ["memory_pack_presence_changed"],
    });
  });
});
