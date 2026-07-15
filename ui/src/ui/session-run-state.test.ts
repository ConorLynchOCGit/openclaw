// Control UI tests cover session run state behavior.
import { describe, expect, it } from "vitest";
import { isSessionRunActive } from "./session-run-state.ts";

describe("isSessionRunActive", () => {
  it("uses explicit live-run state over stale running status", () => {
    expect(isSessionRunActive({ status: "running", hasActiveRun: false })).toBe(false);
    expect(isSessionRunActive({ status: "running", hasActiveRun: true })).toBe(true);
  });

  it("keeps explicit descendant activity authoritative over an outer terminal status", () => {
    expect(isSessionRunActive({ status: "done", hasActiveSubagentRun: true })).toBe(true);
    expect(isSessionRunActive({ status: "failed", hasActiveSubagentRun: true })).toBe(true);
    expect(isSessionRunActive({ status: "killed", hasActiveSubagentRun: true })).toBe(true);
    expect(isSessionRunActive({ status: "timeout", hasActiveSubagentRun: true })).toBe(true);
  });

  it("keeps terminal status settled when no active run remains", () => {
    expect(isSessionRunActive({ status: "done", hasActiveRun: false })).toBe(false);
    expect(isSessionRunActive({ status: "failed", hasActiveRun: false })).toBe(false);
    expect(isSessionRunActive({ status: "done", hasActiveRun: true })).toBe(false);
  });

  it("keeps legacy running status active when no live-run flag exists", () => {
    expect(isSessionRunActive({ status: "running" })).toBe(true);
    expect(isSessionRunActive({ hasActiveRun: true })).toBe(true);
  });
});
