import { describe, expect, it } from "vitest";
import * as runtimeApi from "./index.ts";

describe("codex bridge runtime API export hygiene", () => {
  it("does not expose retired proof runners or low-level patch adapters as production runtime APIs", () => {
    const exported = runtimeApi as Record<string, unknown>;

    expect(exported.WorkflowQueuedRunner).toBeUndefined();
    expect(exported.AgentTeamQueuedRunner).toBeUndefined();
    expect(exported.runCodingTeamLivePilot).toBeUndefined();
    expect(exported.createContextScoutArtifact).toBeUndefined();
    expect(exported.KimiFileImplementationAdapter).toBeUndefined();
    expect(exported.KimiMicrotaskImplementationExecutor).toBeUndefined();
    expect(exported.CodingTeamRuntimeJobRunner).toBeTypeOf("function");
  });
});
