import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  WorktreesBranchesResultSchema,
  WorktreesRemoveResultSchema,
  validateWorktreesBranchesParams,
  validateWorktreesCreateParams,
  validateWorktreesGcParams,
  validateWorktreesRemoveParams,
} from "../index.js";

describe("managed worktree protocol schemas", () => {
  it("accepts the additive worktree method payloads", () => {
    expect(
      validateWorktreesCreateParams({ repoRoot: "/repo", name: "task-one", baseRef: "main" }),
    ).toBe(true);
    expect(validateWorktreesRemoveParams({ id: "id", force: true })).toBe(true);
    expect(validateWorktreesGcParams({})).toBe(true);
  });

  it("accepts branch listing payloads and snapshot errors", () => {
    expect(validateWorktreesBranchesParams({ repoRoot: "/repo" })).toBe(true);
    expect(validateWorktreesBranchesParams({})).toBe(false);
    expect(
      Value.Check(WorktreesBranchesResultSchema, {
        branches: [
          { name: "main", kind: "local" },
          { name: "feature", kind: "remote" },
        ],
        defaultBranch: "main",
        headBranch: "feature",
      }),
    ).toBe(true);
    expect(
      Value.Check(WorktreesRemoveResultSchema, {
        removed: true,
        snapshotError: "snapshot failed: nested gitlink",
      }),
    ).toBe(true);
  });

  it("rejects invalid names and unknown fields", () => {
    expect(validateWorktreesCreateParams({ repoRoot: "/repo", name: "Bad Name" })).toBe(false);
    expect(validateWorktreesGcParams({ unexpected: true })).toBe(false);
  });
});
