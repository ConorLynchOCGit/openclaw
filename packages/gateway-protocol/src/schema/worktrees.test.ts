import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  SessionsCreateResultSchema,
  WorktreesBranchesResultSchema,
  WorktreesListResultSchema,
  WorktreesRemoveResultSchema,
  validateSessionsCreateParams,
  validateFsListDirParams,
  validateWorktreesBranchesParams,
  validateWorktreesCreateParams,
  validateWorktreesGcParams,
  validateWorktreesListParams,
  validateWorktreesRemoveParams,
} from "../index.js";

describe("managed worktree protocol schemas", () => {
  it("accepts the additive worktree method payloads", () => {
    expect(
      validateWorktreesCreateParams({ repoRoot: "/repo", name: "task-one", baseRef: "main" }),
    ).toBe(true);
    expect(validateWorktreesRemoveParams({ id: "id", force: true })).toBe(true);
    expect(validateWorktreesGcParams({})).toBe(true);
    expect(validateWorktreesListParams({ includeTelemetry: true, includeSize: true })).toBe(true);
    expect(validateSessionsCreateParams({ agentId: "main", worktree: true })).toBe(true);
    expect(validateSessionsCreateParams({ agentId: "main", catalogId: "claude" })).toBe(true);
    expect(validateSessionsCreateParams({ agentId: "main", thinkingLevel: "high" })).toBe(true);
    expect(validateSessionsCreateParams({ agentId: "main", incognito: true })).toBe(true);
    expect(validateSessionsCreateParams({ agentId: "main", incognito: "true" })).toBe(false);
    expect(validateSessionsCreateParams({ agentId: "main", thinkingLevel: "" })).toBe(false);
    expect(
      Value.Check(SessionsCreateResultSchema, {
        ok: true,
        key: "agent:main:dashboard:test",
        runStarted: false,
        runError: { code: "INVALID_REQUEST", message: "send blocked by session policy" },
        worktree: { id: "id", path: "/worktree", branch: "openclaw/wt-test" },
      }),
    ).toBe(true);
  });

  it("accepts worktree target params on sessions.create", () => {
    expect(
      validateSessionsCreateParams({
        agentId: "main",
        worktree: true,
        worktreeBaseRef: "origin/main",
        worktreeName: "my-task",
        execNode: "macbook",
      }),
    ).toBe(true);
    expect(validateSessionsCreateParams({ agentId: "main", worktreeName: "Bad Name" })).toBe(false);
  });

  it("accepts branch listing payloads and snapshot errors", () => {
    expect(validateWorktreesBranchesParams({ repoRoot: "/repo" })).toBe(true);
    expect(
      validateWorktreesBranchesParams({ repoRoot: "/repo", includeRepositoryStatus: true }),
    ).toBe(true);
    expect(
      validateWorktreesBranchesParams({ repoRoot: "/repo", includeRepositoryStatus: false }),
    ).toBe(true);
    expect(validateWorktreesBranchesParams({})).toBe(false);
    expect(
      Value.Check(WorktreesBranchesResultSchema, {
        branches: [
          { name: "main", kind: "local" },
          { name: "feature", kind: "remote" },
        ],
        defaultBranch: "main",
        headBranch: "feature",
        repositoryStatus: "git",
      }),
    ).toBe(true);
    expect(
      Value.Check(WorktreesBranchesResultSchema, {
        branches: [],
        repositoryStatus: "not_git",
      }),
    ).toBe(true);
    expect(
      Value.Check(WorktreesBranchesResultSchema, {
        branches: [],
        repositoryStatus: "unavailable",
      }),
    ).toBe(true);
    expect(
      Value.Check(WorktreesBranchesResultSchema, {
        branches: [],
        repositoryStatus: "unknown",
      }),
    ).toBe(false);
    expect(
      Value.Check(WorktreesRemoveResultSchema, {
        removed: true,
        snapshotError: "snapshot failed: nested gitlink",
      }),
    ).toBe(true);
  });

  it("accepts Gateway and node directory-listing targets", () => {
    expect(validateFsListDirParams({ path: "/repo" })).toBe(true);
    expect(validateFsListDirParams({ nodeId: "macbook", path: "/Users/peter" })).toBe(true);
    expect(validateFsListDirParams({ nodeId: "" })).toBe(false);
  });

  it("rejects invalid names and unknown fields", () => {
    expect(validateWorktreesCreateParams({ repoRoot: "/repo", name: "Bad Name" })).toBe(false);
    expect(validateWorktreesGcParams({ unexpected: true })).toBe(false);
    expect(validateWorktreesListParams({ includeTelemetry: "yes" })).toBe(false);
  });

  it("accepts bounded opt-in worktree telemetry", () => {
    expect(
      Value.Check(WorktreesListResultSchema, {
        worktrees: [
          {
            id: "worktree-id",
            name: "task-one",
            repoFingerprint: "0123456789abcdef",
            repoRoot: "/repo",
            path: "/state/worktrees/0123456789abcdef/task-one",
            branch: "openclaw/task-one",
            baseRef: "HEAD",
            ownerKind: "session",
            ownerId: "agent:coding:session:task-one",
            createdAt: 1,
            lastActiveAt: 2,
            telemetry: {
              measuredAt: 10,
              ageMs: 9,
              idleMs: 8,
              sizeBytes: 1024,
              sizeStatus: "measured",
              lockState: "none",
              activityState: "idle",
              runLeaseActive: false,
              cleanupKind: "idle_gc",
              cleanupEligibleAt: 100,
              cleanupEligibleNow: false,
            },
          },
        ],
      }),
    ).toBe(true);
  });
});
