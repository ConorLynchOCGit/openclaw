import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolvePromptInput } from "../../scripts/operator-prompt-harness.mjs";

const tempPaths = [];

afterEach(() => {
  for (const filePath of tempPaths.splice(0)) {
    fs.rmSync(filePath, { force: true });
  }
});

function writeTempPrompt(text) {
  const filePath = path.join(os.tmpdir(), `openclaw-prompt-${Date.now()}-${Math.random()}.txt`);
  fs.writeFileSync(filePath, text, "utf-8");
  tempPaths.push(filePath);
  return filePath;
}

describe("operator prompt harness input", () => {
  it("reads long prompt content from file without interpreting template syntax", () => {
    const prompt = [
      "Implement the feature.",
      "```ts",
      "const example = `value ${notInterpolated}`;",
      "```",
      "Shell quotes: 'single' \"double\" $PATH $(not-run)",
    ].join("\n");
    const promptFile = writeTempPrompt(prompt);

    expect(resolvePromptInput({ promptFile })).toBe(prompt);
  });

  it("requires one byte-safe prompt source", () => {
    expect(() => resolvePromptInput({})).toThrow(/exactly one prompt source/u);
    expect(() => resolvePromptInput({ prompt: "a", promptFile: "/tmp/a" })).toThrow(
      /exactly one prompt source/u,
    );
  });
});
