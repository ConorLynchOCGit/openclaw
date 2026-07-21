import type { SessionEntry } from "openclaw/plugin-sdk/session-store-runtime";
import { describe, expect, it } from "vitest";
import {
  assertCodexSystemThreadResponse,
  assertCodexSystemV2Model,
  buildCodexSystemThreadContext,
  resolveCodexSystemFixedEnvironment,
  resolveCodexSystemProcessContext,
} from "./system-authority.js";
import type { CodexLoadedSystemProfile } from "./system-profile.js";

const SOURCE_OBJECT = "a".repeat(40);
const WORKTREE = "/tmp/openclaw-state/worktrees/system-change-a";
const STATE_DIR = "/tmp/openclaw-state";
const PROFILE_DIR = "/opt/openclaw/codex-system-profile";

function createSessionEntry(): SessionEntry {
  return {
    spawnedCwd: WORKTREE,
    worktree: {
      id: "worktree-a",
      branch: "openclaw/system-change-a",
      repoRoot: "/var/lib/openclaw/source-anchor",
      kind: "system-change",
      baseRef: SOURCE_OBJECT,
    },
  } as SessionEntry;
}

function createProfile(): CodexLoadedSystemProfile {
  return {
    profileDir: PROFILE_DIR,
    projectDir: `${PROFILE_DIR}/project`,
    configLayerVersion: "profile-v1",
    agentNames: ["codex_reviewer", "implementer"],
    config: {
      project_doc_max_bytes: 0,
      developer_instructions: "Generation-N immutable developer instructions.",
      default_permissions: "openclaw-system-change",
      features: {
        multi_agent: false,
        multi_agent_v2: { enabled: true },
      },
      permissions: {
        "openclaw-system-change": { extends: ":workspace" },
      },
    },
    selectedCapabilityRoots: [
      {
        id: "system-skills",
        location: {
          type: "environment",
          environmentId: "local",
          path: `${PROFILE_DIR}/skills`,
        },
      },
    ],
  };
}

function createContext() {
  const processContext = resolveCodexSystemProcessContext({
    sessionEntry: createSessionEntry(),
    agentId: "coding",
    cwd: WORKTREE,
    env: { OPENCLAW_STATE_DIR: STATE_DIR },
  });
  if (!processContext) {
    throw new Error("expected system process context");
  }
  return buildCodexSystemThreadContext({ processContext, profile: createProfile() });
}

describe("Codex system generation authority", () => {
  it("resolves process identity from the session and thread authority from the package profile", () => {
    const context = createContext();
    const codexHome = `${STATE_DIR}/codex/generations/${SOURCE_OBJECT}`;

    expect(context).toMatchObject({
      fingerprint: SOURCE_OBJECT,
      processProfile: {
        key: SOURCE_OBJECT,
        codexHome,
      },
      environments: [{ environmentId: "local", cwd: WORKTREE }],
      authority: {
        permissionProfile: "openclaw-system-change",
      },
    });
    expect(context.authority.selectedCapabilityRoots).toEqual(
      createProfile().selectedCapabilityRoots,
    );
    expect(context.authority.config).toMatchObject({
      project_doc_max_bytes: 0,
      projects: { [WORKTREE]: { trust_level: "untrusted" } },
      shell_environment_policy: {
        set: resolveCodexSystemFixedEnvironment(codexHome),
      },
    });
    expect(() => assertCodexSystemV2Model(context, "gpt-5.6-sol")).not.toThrow();
    expect(() => assertCodexSystemV2Model(context, undefined)).toThrow(
      "model selection is missing",
    );
  });

  it("rejects cwd, agent, release, and profile boundary mismatches", () => {
    expect(() =>
      resolveCodexSystemProcessContext({
        sessionEntry: createSessionEntry(),
        agentId: "coding",
        cwd: "/tmp/foreign-worktree",
        env: { OPENCLAW_STATE_DIR: STATE_DIR },
      }),
    ).toThrow("cwd does not match");

    expect(() =>
      resolveCodexSystemProcessContext({
        sessionEntry: createSessionEntry(),
        agentId: "planning",
        cwd: WORKTREE,
        env: { OPENCLAW_STATE_DIR: STATE_DIR },
      }),
    ).toThrow("only run through the Coding agent");

    const missingRelease = createSessionEntry();
    delete missingRelease.worktree?.baseRef;
    expect(() =>
      resolveCodexSystemProcessContext({
        sessionEntry: missingRelease,
        agentId: "coding",
        cwd: WORKTREE,
        env: { OPENCLAW_STATE_DIR: STATE_DIR },
      }),
    ).toThrow("missing its source commit");

    const processContext = resolveCodexSystemProcessContext({
      sessionEntry: createSessionEntry(),
      agentId: "coding",
      cwd: WORKTREE,
      env: { OPENCLAW_STATE_DIR: STATE_DIR },
    })!;
    const editableCapability = createProfile();
    editableCapability.selectedCapabilityRoots[0].location.path = `${WORKTREE}/skills`;
    expect(() =>
      buildCodexSystemThreadContext({ processContext, profile: editableCapability }),
    ).toThrow("invalid capability root");
  });

  it("requires truthful native start and resume readback", () => {
    const context = createContext();
    const response = {
      thread: { id: "thread-a", items: [], cwd: WORKTREE },
      model: "gpt-5.6-sol",
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
