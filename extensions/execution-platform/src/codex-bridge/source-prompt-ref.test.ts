import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRuntimeObjective, resolveSourcePromptText } from "./source-prompt-ref.ts";

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("source prompt ref resolution", () => {
  it("resolves a gateway chat transcript prompt by hash and length without storing raw prompt", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-source-prompt-"));
    const sessionId = "source-prompt-session";
    const prompt = [
      "Use OpenClaw to perform a long owner workflow.",
      "This tail proves workers received the full prompt: UNIQUE_LONG_PROMPT_TAIL.",
    ].join("\n");
    await fs.writeFile(
      path.join(root, `${sessionId}.jsonl`),
      `${JSON.stringify({
        type: "message",
        message: { role: "user", content: [{ type: "text", text: prompt }] },
      })}\n`,
      "utf8",
    );

    const resolved = await resolveSourcePromptText(
      {
        refKind: "gateway_chat_transcript",
        promptHash: sha256Text(prompt),
        promptLength: prompt.length,
        sessionId,
        sessionKey: "agent:main:main",
        runId: "run-1",
        sourceRoute: "ux",
        rawPromptStored: false,
      },
      { sessionSearchRoots: [root] },
    );

    expect(resolved.promptText).toBe(prompt);
    expect(resolved.evidence).toMatchObject({
      status: "resolved",
      reasonCodes: ["source_prompt_ref_resolved_from_transcript"],
      promptHash: sha256Text(prompt),
      promptLength: prompt.length,
      sessionId,
      sessionKey: "agent:main:main",
      runId: "run-1",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
  });

  it("uses the resolved prompt only as model input and keeps bounded evidence objective", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-source-objective-"));
    const sessionId = "source-objective-session";
    const prompt = "Large owner prompt.\nFULL_PROMPT_ONLY_TAIL";
    await fs.writeFile(
      path.join(root, `${sessionId}.jsonl`),
      `${JSON.stringify({
        type: "message",
        message: { role: "user", content: [{ type: "text", text: prompt }] },
      })}\n`,
      "utf8",
    );

    const resolved = await resolveRuntimeObjective(
      {
        objectiveSummary: "Large owner prompt.",
        sourcePromptRef: {
          refKind: "gateway_chat_transcript",
          promptHash: sha256Text(prompt),
          promptLength: prompt.length,
          sessionId,
          sessionKey: "agent:main:main",
          runId: "run-1",
          sourceRoute: "ux",
          rawPromptStored: false,
        },
      },
      { sessionSearchRoots: [root] },
    );

    expect(resolved.objectiveForModel).toContain("FULL_PROMPT_ONLY_TAIL");
    expect(resolved.objectiveForEvidence).toBe("Large owner prompt.");
    expect(resolved.sourcePromptResolution.status).toBe("resolved");
  });

  it("resolves native submit prompt files by hash and length for worker parity lanes", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-native-source-prompt-"));
    const runId = "native-run-1";
    const prompt = "Native submit full prompt.\nFULL_NATIVE_PROMPT_TAIL";
    await fs.writeFile(path.join(root, `${runId}.prompt.txt`), prompt, "utf8");

    const resolved = await resolveRuntimeObjective(
      {
        objectiveSummary: "Native submit full prompt.",
        sourcePromptRef: {
          refKind: "native_submit",
          promptHash: sha256Text(prompt),
          promptLength: prompt.length,
          sessionId: null,
          sessionKey: null,
          runId,
          sourceRoute: "native_submit",
          rawPromptStored: false,
        },
      },
      { sessionSearchRoots: [root] },
    );

    expect(resolved.objectiveForModel).toContain("FULL_NATIVE_PROMPT_TAIL");
    expect(resolved.objectiveForEvidence).toBe("Native submit full prompt.");
    expect(resolved.sourcePromptResolution).toMatchObject({
      status: "resolved",
      reasonCodes: ["source_prompt_ref_resolved_from_native_submit_file"],
      rawPromptStored: false,
    });
  });

  it("fails unresolved on hash mismatch without returning transcript content", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-source-mismatch-"));
    const sessionId = "source-mismatch-session";
    const prompt = "Do not return this prompt on mismatch.";
    await fs.writeFile(
      path.join(root, `${sessionId}.jsonl`),
      `${JSON.stringify({
        type: "message",
        message: { role: "user", content: [{ type: "text", text: prompt }] },
      })}\n`,
      "utf8",
    );

    const resolved = await resolveSourcePromptText(
      {
        refKind: "gateway_chat_transcript",
        promptHash: sha256Text("different"),
        promptLength: prompt.length,
        sessionId,
        sessionKey: "agent:main:main",
        runId: "run-1",
        sourceRoute: "ux",
        rawPromptStored: false,
      },
      { sessionSearchRoots: [root] },
    );

    expect(resolved.promptText).toBeNull();
    expect(resolved.evidence).toMatchObject({
      status: "unresolved",
      reasonCodes: ["source_prompt_hash_or_length_not_found"],
      rawPromptStored: false,
    });
    expect(JSON.stringify(resolved.evidence)).not.toContain("Do not return this prompt");
  });
});
