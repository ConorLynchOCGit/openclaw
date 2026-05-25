import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../..");
const replayScriptPath = resolve(
  repoRoot,
  "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
);

function replayScriptSource(): string {
  return readFileSync(replayScriptPath, "utf8");
}

function functionBody(source: string, functionName: string): string {
  const start = source.indexOf(`async function ${functionName}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  expect(nextFunction).toBeGreaterThan(start);
  return source.slice(start, nextFunction);
}

describe("Product/Spec boundary replay topology", () => {
  it("does not inject context_synthesis into accepted-context replay graphs by default", () => {
    const body = functionBody(replayScriptSource(), "createReplayGraphFromParallelContext");

    expect(body).toContain("scheduler_first_accepted_context_supply");
    expect(body).toContain("contextSynthesisDefaultDisabled");
    expect(body).not.toContain('nodeKind: "context_synthesis"');
    expect(body).not.toContain("runtimeOwnedReplaySynthesisBarrier");
  });

  it("marks after-context-synthesis replay as explicit diagnostic-only", () => {
    const source = replayScriptSource();

    expect(source).toContain('boundary === "after-context-synthesis"');
    expect(source).toContain("legacy_context_synthesis_boundary_diagnostic_only");
    expect(source).toContain("--allow-legacy-diagnostic-boundary");
    expect(source).toContain("OPENCLAW_ALLOW_LEGACY_CONTEXT_SYNTHESIS_REPLAY");
  });

  it("does not let accepted context synthesis satisfy production graph-selection replay readiness", () => {
    const source = replayScriptSource();

    expect(source).not.toContain(
      "accepted_context_synthesis_or_node_scoped_context_required_before_",
    );
    expect(source).toContain(
      "accepted_node_scoped_context_required_before_after_graph_selection_replay",
    );
    expect(source).toContain(
      "accepted_context_synthesis_required_before_after_context_synthesis_diagnostic_replay",
    );
    expect(source).toContain("context_synthesis result, treat it as coordination evidence only");
    expect(source).toContain(
      "must not be transformed directly into implementation/validation/review/readback/closeout executable nodes",
    );
  });
});
