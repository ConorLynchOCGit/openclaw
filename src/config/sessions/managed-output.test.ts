import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createManagedToolOutputStreamSync,
  persistManagedToolOutputSync,
  readManagedToolOutputRefSync,
} from "./managed-output.js";

describe("managed tool output", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-managed-output-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persists full output under stateRoot and returns a native managed-output ref", () => {
    const result = persistManagedToolOutputSync({
      stateRoot: tmpDir,
      sessionKey: "agent:execution-validation-scout:subagent:test",
      toolCallId: "call-1",
      toolName: "exec",
      text: "full validation output",
      outputKind: "aggregated",
      reason: "test",
      now: Date.UTC(2026, 5, 8),
    });

    expect(result).toMatchObject({
      ref: expect.stringContaining("openclaw-managed-output://"),
      byteCount: Buffer.byteLength("full validation output", "utf8"),
      textHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });

    const outputFiles = fs
      .readdirSync(path.join(tmpDir, "managed-tool-output", "2026-06-08"))
      .toSorted();
    expect(outputFiles).toEqual([
      expect.stringMatching(/\.json$/),
      expect.stringMatching(/\.txt$/),
    ]);
    const textPath = path.join(
      tmpDir,
      "managed-tool-output",
      "2026-06-08",
      outputFiles.find((file) => file.endsWith(".txt")) ?? "",
    );
    expect(fs.readFileSync(textPath, "utf8")).toBe("full validation output");
  });

  it("does not fabricate a ref when stateRoot is unavailable", () => {
    expect(
      persistManagedToolOutputSync({
        stateRoot: null,
        toolName: "exec",
        text: "output",
      }),
    ).toBeNull();
  });

  it("reads bounded byte windows back from a native managed-output ref", () => {
    const text = "0123456789".repeat(1_000);
    const persisted = persistManagedToolOutputSync({
      stateRoot: tmpDir,
      sessionKey: "agent:execution-coding:session:test",
      toolCallId: "call-readback",
      toolName: "read",
      text,
      outputKind: "tool_result",
      now: Date.UTC(2026, 5, 8),
    });

    const first = readManagedToolOutputRefSync({
      stateRoot: tmpDir,
      ref: persisted?.ref ?? "",
      maxBytes: 1_000,
    });
    expect(first).toMatchObject({
      offsetBytes: 0,
      returnedBytes: 1_000,
      totalBytes: Buffer.byteLength(text, "utf8"),
      nextOffsetBytes: 1_000,
      truncated: true,
    });
    expect(first?.text).toBe(text.slice(0, 1_000));

    const second = readManagedToolOutputRefSync({
      stateRoot: tmpDir,
      ref: persisted?.ref ?? "",
      offsetBytes: first?.nextOffsetBytes ?? 0,
      maxBytes: 1_000,
    });
    expect(second?.offsetBytes).toBe(1_000);
    expect(second?.text).toBe(text.slice(1_000, 2_000));
  });

  it("supports streaming output and final metadata without loading full text into memory", () => {
    const stream = createManagedToolOutputStreamSync({
      stateRoot: tmpDir,
      sessionKey: "agent:execution-validation-scout:subagent:test",
      toolCallId: "call-stream",
      toolName: "process",
      outputKind: "process_stream",
      now: Date.UTC(2026, 5, 8),
    });

    expect(stream?.ref).toContain("openclaw-managed-output://");
    stream?.append("one\n");
    stream?.append("two\n");
    const result = stream?.finalize();

    expect(result).toMatchObject({
      byteCount: Buffer.byteLength("one\ntwo\n", "utf8"),
      textHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(fs.readFileSync(stream?.outputPath ?? "", "utf8")).toBe("one\ntwo\n");
    expect(fs.readFileSync(stream?.metadataPath ?? "", "utf8")).toContain('"toolName": "process"');
  });

  it("can discard unused streams before metadata is finalized", () => {
    const stream = createManagedToolOutputStreamSync({
      stateRoot: tmpDir,
      toolName: "process",
      now: Date.UTC(2026, 5, 8),
    });

    stream?.append("small output");
    const outputPath = stream?.outputPath ?? "";
    expect(fs.existsSync(outputPath)).toBe(true);
    stream?.discard();
    expect(fs.existsSync(outputPath)).toBe(false);
    expect(fs.existsSync(stream?.metadataPath ?? "")).toBe(false);
  });
});
