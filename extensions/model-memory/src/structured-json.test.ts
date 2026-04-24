import { describe, expect, it } from "vitest";
import {
  extractStructuredJsonCandidate,
  parseStructuredJsonCandidate,
  stripOuterJsonCodeFence,
  tryParseFencedJsonBlock,
} from "./structured-json.ts";

describe("structured-json helpers", () => {
  it("parses fenced and mixed structured JSON output", () => {
    expect(stripOuterJsonCodeFence('```json\n{"ok":true}\n```')).toBe('{"ok":true}');
    expect(extractStructuredJsonCandidate('noise\n```json\n{"ok":true}\n```\nmore')).toBe(
      '{"ok":true}',
    );
    expect(parseStructuredJsonCandidate('prefix {"value":1} suffix')).toEqual({ value: 1 });
    expect(parseStructuredJsonCandidate("```json\n[1,2,3]\n```")).toEqual([1, 2, 3]);
  });

  it("only treats fully fenced blocks as fenced-json parse candidates", () => {
    expect(tryParseFencedJsonBlock('```json\n{"ok":true}\n```')).toEqual({ ok: true });
    expect(tryParseFencedJsonBlock('prefix ```json\n{"ok":true}\n```')).toBeNull();
    expect(tryParseFencedJsonBlock("```json\nnot-json\n```")).toBeNull();
  });
});
