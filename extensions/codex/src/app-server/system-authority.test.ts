import type { SessionEntry } from "openclaw/plugin-sdk/session-store-runtime";
import { describe, expect, it } from "vitest";
import {
  assertCodexSystemThreadResponse,
  assertCodexSystemV2Model,
  resolveCodexSystemFixedEnvironment,
  resolveCodexSystemThreadContext,
} from "./system-authority.js";

const SOURCE_OBJECT = "a".repeat(40);
const WORKTREE = "/tmp/openclaw-state/worktrees/system-change-a";
const CODEX_HOME = "/tmp/openclaw-codex-home/generation-a";

function createSessionEntry(): SessionEntry {
  return {
    spawnedCwd: WORKTREE,
    worktree: {
      id: "worktree-a",
      branch: "openclaw/system-change-a",
      repoRoot: "/srv/openclaw/source-anchor",
      kind: "system-change",
      baseRef: SOURCE_OBJECT,
    },
    codexSystemAuthority: {
      schemaVersion: 1,
      releaseManifestDigest: "b".repeat(64),
      expectedServerVersion: "0.144.1",
      codexHome: CODEX_HOME,
      permissionProfile: "openclaw-system-change",
      capabilityEnvironments: [
        {
          environmentId: "generation-capabilities",
          cwd: "/opt/openclaw/capabilities/generation-a",
        },
      ],
      selectedCapabilityRoots: [
        {
          id: "system-skills",
          location: {
            type: "environment",
            environmentId: "generation-capabilities",
            path: "/opt/openclaw/capabilities/generation-a/skills",
          },
        },
      ],
      v2ModelIds: ["gpt-5.4-codex"],
      config: {
        project_doc_max_bytes: 0,
        developer_instructions: "Generation-N immutable developer instructions.",
        "features.multi_agent": false,
        "features.multi_agent_v2.enabled": true,
        "shell_environment_policy.set": resolveCodexSystemFixedEnvironment(CODEX_HOME),
      },
    },
  } as SessionEntry;
}

describe("Codex system generation authority", () => {
  it("resolves immutable thread and process authority from the managed session", () => {
    const context = resolveCodexSystemThreadContext({
      sessionEntry: createSessionEntry(),
      agentId: "coding",
      cwd: WORKTREE,
    });

    expect(context).toMatchObject({
      processProfile: {
        expectedServerVersion: "0.144.1",
        codexHome: "/tmp/openclaw-codex-home/generation-a",
      },
      environments: [
        { environmentId: "worktree", cwd: WORKTREE },
        {
          environmentId: "generation-capabilities",
          cwd: "/opt/openclaw/capabilities/generation-a",
        },
      ],
    });
    expect(context?.authority.selectedCapabilityRoots).toEqual(
      createSessionEntry().codexSystemAuthority?.selectedCapabilityRoots,
    );
    expect(context?.fingerprint).toBe("b".repeat(64));
    expect(context?.processProfile.key).toBe("b".repeat(64));
    const sharedHeavyCheckLock = createSessionEntry();
    sharedHeavyCheckLock.codexSystemAuthority!.config["shell_environment_policy.set"] = {
      ...resolveCodexSystemFixedEnvironment(CODEX_HOME),
      OPENCLAW_HEAVY_CHECK_LOCK_SCOPE: "shared",
    };
    expect(() =>
      resolveCodexSystemThreadContext({
        sessionEntry: sharedHeavyCheckLock,
        agentId: "coding",
        cwd: WORKTREE,
      }),
    ).toThrow("invalid fixed shell environment: OPENCLAW_HEAVY_CHECK_LOCK_SCOPE");

    const ambientNpmCache = createSessionEntry();
    ambientNpmCache.codexSystemAuthority!.config["shell_environment_policy.set"] = {
      ...resolveCodexSystemFixedEnvironment(CODEX_HOME),
      NPM_CONFIG_CACHE: "/srv/openclaw-next/.npm",
    };
    expect(() =>
      resolveCodexSystemThreadContext({
        sessionEntry: ambientNpmCache,
        agentId: "coding",
        cwd: WORKTREE,
      }),
    ).toThrow("invalid fixed shell environment: NPM_CONFIG_CACHE");
    assertCodexSystemV2Model(context!, "gpt-5.4-codex");
    expect(() => assertCodexSystemV2Model(context!, "gpt-5.4-mini")).toThrow(
      "not declared multi-agent V2",
    );
  });

  it("rejects cwd and immutable-root boundary mismatches", () => {
    expect(() =>
      resolveCodexSystemThreadContext({
        sessionEntry: createSessionEntry(),
        agentId: "coding",
        cwd: "/tmp/foreign-worktree",
      }),
    ).toThrow("cwd does not match");

    const overlappingHome = createSessionEntry();
    overlappingHome.codexSystemAuthority!.codexHome = "/tmp/openclaw-state";
    expect(() =>
      resolveCodexSystemThreadContext({
        sessionEntry: overlappingHome,
        agentId: "coding",
        cwd: WORKTREE,
      }),
    ).toThrow("requires an external absolute CODEX_HOME");

    const overlappingCapability = createSessionEntry();
    overlappingCapability.codexSystemAuthority!.capabilityEnvironments[0]!.cwd =
      "/tmp/openclaw-state";
    expect(() =>
      resolveCodexSystemThreadContext({
        sessionEntry: overlappingCapability,
        agentId: "coding",
        cwd: WORKTREE,
      }),
    ).toThrow("invalid capability environment");
  });

  it("requires truthful native start and resume readback", () => {
    const context = resolveCodexSystemThreadContext({
      sessionEntry: createSessionEntry(),
      agentId: "coding",
      cwd: WORKTREE,
    })!;
    const response = {
      thread: { id: "thread-a", items: [], cwd: WORKTREE },
      model: "gpt-5.4-codex",
      cwd: WORKTREE,
      runtimeWorkspaceRoots: [WORKTREE],
      instructionSources: [],
      activePermissionProfile: { id: "openclaw-system-change" },
    };

    expect(() =>
      assertCodexSystemThreadResponse({
        response,
        context,
        cwd: WORKTREE,
        action: "start",
      }),
    ).not.toThrow();
    expect(() =>
      assertCodexSystemThreadResponse({
        response: { ...response, instructionSources: [`${WORKTREE}/AGENTS.md`] },
        context,
        cwd: WORKTREE,
        action: "resume",
      }),
    ).toThrow("loaded editable project instructions");
  });
});
