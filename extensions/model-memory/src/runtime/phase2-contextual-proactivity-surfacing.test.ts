import { describe, expect, it } from "vitest";
import {
  assertPhase2ContextualProactivitySurfacingReport,
  buildPhase2ContextualProactivitySurfacingReport,
  writePhase2ContextualProactivitySurfacingArtifact,
} from "./phase2-contextual-proactivity-surfacing.ts";

describe("phase2 contextual proactivity surfacing", () => {
  it("supports required lanes and surfaces exact active context matches", async () => {
    const report = await buildPhase2ContextualProactivitySurfacingReport({
      lane: "context_surface",
    });
    assertPhase2ContextualProactivitySurfacingReport(report);
    expect(report.supportedLanes).toEqual(["must_surface", "context_surface", "background_only"]);
    expect(report.contextualCards).toHaveLength(1);
    expect(report.relevanceDecisions[0]?.relevanceExplanation).toContain(
      "matches project openclaw-platform / session main",
    );
  });

  it("keeps background or non-matching candidates in the inbox", async () => {
    const background = await buildPhase2ContextualProactivitySurfacingReport({
      forceBackgroundOnly: true,
    });
    expect(background.contextualCards).toHaveLength(0);
    expect(background.relevanceDecisions[0]?.inboxOnly).toBe(true);

    const unknownSession = await buildPhase2ContextualProactivitySurfacingReport({
      forceUnknownSession: true,
    });
    expect(unknownSession.contextualCards).toHaveLength(0);
    expect(unknownSession.relevanceDecisions[0]?.blockedReasonCodes).toContain(
      "typed_context_overlap_required",
    );
  });

  it("suppresses stale, repeated, or wildcard scoped candidates", async () => {
    const stale = await buildPhase2ContextualProactivitySurfacingReport({ forceStale: true });
    expect(stale.contextualCards).toHaveLength(0);
    expect(stale.suppressionDecisions[0]?.reasonCodes).toContain("stale_candidate");

    const repeated = await buildPhase2ContextualProactivitySurfacingReport({
      forceRepeated: true,
    });
    expect(repeated.contextualCards).toHaveLength(0);
    expect(repeated.suppressionDecisions[0]?.reasonCodes).toContain("repeated_candidate");

    const wildcard = await buildPhase2ContextualProactivitySurfacingReport({
      forceWildcardScope: true,
    });
    expect(wildcard.decision).toBe("blocked");
    expect(wildcard.relevanceDecisions[0]?.blockedReasonCodes).toContain("wildcard_scope_rejected");
  });

  it("writes bounded artifacts without prohibited content", async () => {
    const report = await buildPhase2ContextualProactivitySurfacingReport({
      lane: "must_surface",
    });
    const artifact = await writePhase2ContextualProactivitySurfacingArtifact({
      report,
      artifactDir: ".artifacts/test/model-memory/phase2-contextual-proactivity-surfacing-test",
    });
    expect(artifact.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify({ report, artifact }).toLowerCase()).not.toContain("raw-prompt-marker");
  });
});
