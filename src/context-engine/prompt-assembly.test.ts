import { describe, expect, it } from "vitest";
import { composeContextPromptAssembly } from "./prompt-assembly.js";

describe("composeContextPromptAssembly", () => {
  it("combines context-engine additions and hook context into one managed prompt shape", () => {
    const result = composeContextPromptAssembly({
      baseSystemPrompt: "Base system prompt",
      basePrompt: "Current user turn",
      contextEngineSystemPromptAddition: "Session summary",
      hookPrependSystemContext: "Prepended system context",
      hookAppendSystemContext: "Appended system context",
      hookPrependContext: "Prompt prefix",
    });

    expect(result.systemPrompt).toBe(
      [
        "Prepended system context",
        "Session summary",
        "Base system prompt",
        "Appended system context",
      ].join("\n\n"),
    );
    expect(result.prompt).toBe(["Prompt prefix", "Current user turn"].join("\n\n"));
  });

  it("lets a hook override replace the assembled system prompt while keeping prompt-prefix injection", () => {
    const result = composeContextPromptAssembly({
      baseSystemPrompt: "Base system prompt",
      basePrompt: "Current user turn",
      contextEngineSystemPromptAddition: "Session summary",
      hookSystemPromptOverride: "Dynamic system override",
      hookPrependContext: "Prompt prefix",
    });

    expect(result.systemPrompt).toBe("Dynamic system override");
    expect(result.prompt).toBe(["Prompt prefix", "Current user turn"].join("\n\n"));
  });
});
