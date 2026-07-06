/**
 * Tests single-row session cache behavior in gateway session utilities.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { resetConfigRuntimeState, setRuntimeConfigSnapshot } from "../config/config.js";
import type { OpenClawConfig } from "../config/config.js";
import {
  resolveStorePath,
  saveSessionStore,
  updateSessionStore,
  type SessionEntry,
} from "../config/sessions.js";
import { resetPluginRuntimeStateForTest } from "../plugins/runtime.js";
import { withStateDirEnv } from "../test-helpers/state-dir-env.js";

const subagentRegistryReadMock = vi.hoisted(() => {
  let runsByChildSessionKey = new Map<string, Record<string, unknown>>();
  const buildSubagentRunReadIndex = vi.fn(() => {
    const runsByControllerSessionKey = new Map<string, Record<string, unknown>[]>();
    for (const entry of runsByChildSessionKey.values()) {
      const controllerSessionKey =
        typeof entry.controllerSessionKey === "string"
          ? entry.controllerSessionKey
          : typeof entry.requesterSessionKey === "string"
            ? entry.requesterSessionKey
            : undefined;
      if (!controllerSessionKey) {
        continue;
      }
      const runs = runsByControllerSessionKey.get(controllerSessionKey) ?? [];
      runs.push(entry);
      runsByControllerSessionKey.set(controllerSessionKey, runs);
    }
    return {
      runsByControllerSessionKey,
      getDisplaySubagentRun: vi.fn(
        (childSessionKey: string) => runsByChildSessionKey.get(childSessionKey) ?? null,
      ),
      countActiveDescendantRuns: vi.fn(() => 0),
    };
  });
  return {
    buildSubagentRunReadIndex,
    countActiveDescendantRuns: vi.fn(() => 0),
    getSessionDisplaySubagentRunByChildSessionKey: vi.fn(
      (childSessionKey: string) => runsByChildSessionKey.get(childSessionKey) ?? null,
    ),
    getSubagentSessionRuntimeMs: vi.fn(() => undefined),
    getSubagentSessionStartedAt: vi.fn(() => undefined),
    isSubagentRunLive: vi.fn(() => false),
    listSubagentRunsForController: vi.fn((controllerSessionKey: string) =>
      [...runsByChildSessionKey.values()].filter((entry) => {
        const controller =
          typeof entry.controllerSessionKey === "string"
            ? entry.controllerSessionKey
            : typeof entry.requesterSessionKey === "string"
              ? entry.requesterSessionKey
              : undefined;
        return controller === controllerSessionKey;
      }),
    ),
    resolveSubagentSessionStatus: vi.fn(() => undefined),
    setSubagentRunsForTest: (runs: Record<string, unknown>[]) => {
      runsByChildSessionKey = new Map(
        runs
          .filter((entry) => typeof entry.childSessionKey === "string")
          .map((entry) => [entry.childSessionKey as string, entry]),
      );
    },
  };
});

vi.mock("../agents/subagent-registry-read.js", () => subagentRegistryReadMock);

import { loadGatewaySessionRow } from "./session-utils.js";

const MAIN_AGENT_ID = "main";
const TEST_MODEL = "openai/gpt-5.4";

type SingleRowCacheContext = {
  now: number;
  storePath: string;
};

type MovingChildFixture = {
  oldParent: string;
  newParent: string;
  child: string;
  store: Record<string, SessionEntry>;
};

async function withSingleRowCacheStore(
  statePrefix: string,
  workspace: string,
  run: (context: SingleRowCacheContext) => Promise<void>,
): Promise<void> {
  await withStateDirEnv(statePrefix, async () => {
    const cfg: OpenClawConfig = {
      agents: {
        list: [
          {
            id: MAIN_AGENT_ID,
            default: true,
            workspace,
          },
        ],
        defaults: { model: { primary: TEST_MODEL } },
      },
    } as OpenClawConfig;
    setRuntimeConfigSnapshot(cfg, cfg);
    await run({
      now: Math.floor(Date.now() / 1_000) * 1_000 + 100,
      storePath: resolveStorePath(cfg.session?.store, { agentId: MAIN_AGENT_ID }),
    });
  });
}

function parentSession(sessionId: string, now: number): SessionEntry {
  return {
    sessionId,
    updatedAt: now,
  };
}

function runningChildSession(
  sessionId: string,
  parentSessionKey: string,
  now: number,
): SessionEntry {
  return {
    sessionId,
    parentSessionKey,
    updatedAt: now,
    status: "running",
  };
}

function setSubagentControllerRun(
  childSessionKey: string,
  controllerSessionKey: string,
  createdAt: number,
): void {
  subagentRegistryReadMock.setSubagentRunsForTest([
    {
      childSessionKey,
      controllerSessionKey,
      requesterSessionKey: controllerSessionKey,
      createdAt,
    },
  ]);
}

function createMovingChildFixture(now: number): MovingChildFixture {
  const oldParent = "agent:main:subagent:parent-old";
  const newParent = "agent:main:subagent:parent-new";
  const child = "agent:main:subagent:child";
  return {
    oldParent,
    newParent,
    child,
    store: {
      [oldParent]: parentSession("parent-old", now),
      [newParent]: parentSession("parent-new", now),
      [child]: runningChildSession("child", oldParent, now),
    },
  };
}

function expectChildMovedToNewParent(fixture: MovingChildFixture, now: number): void {
  expect(
    loadGatewaySessionRow(fixture.oldParent, { now: now + 50 })?.childSessions,
  ).toBeUndefined();
  expect(loadGatewaySessionRow(fixture.newParent, { now: now + 50 })?.childSessions).toEqual([
    fixture.child,
  ]);
  expect(subagentRegistryReadMock.buildSubagentRunReadIndex).not.toHaveBeenCalled();
}

describe("single gateway session row child-session cache", () => {
  afterEach(() => {
    resetConfigRuntimeState();
    resetPluginRuntimeStateForTest();
    subagentRegistryReadMock.setSubagentRunsForTest([]);
    vi.clearAllMocks();
  });

  test("shares the child-session index across repeated single-row loads for the same store", async () => {
    await withSingleRowCacheStore(
      "openclaw-single-row-cache-",
      "/tmp/openclaw-single-row-cache",
      async ({ now, storePath }) => {
        const store: Record<string, SessionEntry> = {
          "agent:main:subagent:parent-a": parentSession("parent-a", now),
          "agent:main:subagent:child-a": runningChildSession(
            "child-a",
            "agent:main:subagent:parent-a",
            now,
          ),
          "agent:main:subagent:parent-b": parentSession("parent-b", now),
          "agent:main:subagent:child-b": runningChildSession(
            "child-b",
            "agent:main:subagent:parent-b",
            now,
          ),
        };
        await saveSessionStore(storePath, store);

        const rowA = loadGatewaySessionRow("agent:main:subagent:parent-a", { now });
        const rowB = loadGatewaySessionRow("agent:main:subagent:parent-b", { now: now + 50 });
        const rowAAfterWindow = loadGatewaySessionRow("agent:main:subagent:parent-a", {
          now: now + 1_500,
        });

        expect(rowA?.childSessions).toEqual(["agent:main:subagent:child-a"]);
        expect(rowB?.childSessions).toEqual(["agent:main:subagent:child-b"]);
        expect(rowAAfterWindow?.childSessions).toEqual(["agent:main:subagent:child-a"]);
        expect(subagentRegistryReadMock.buildSubagentRunReadIndex).not.toHaveBeenCalled();
      },
    );
  });

  test("ignores subagent registry ownership while reusing store child candidates", async () => {
    await withSingleRowCacheStore(
      "openclaw-single-row-cache-fresh-registry-",
      "/tmp/openclaw-single-row-cache-fresh-registry",
      async ({ now, storePath }) => {
        const fixture = createMovingChildFixture(now);
        await saveSessionStore(storePath, fixture.store);

        setSubagentControllerRun(fixture.child, fixture.oldParent, now);
        expect(loadGatewaySessionRow(fixture.oldParent, { now })?.childSessions).toEqual([
          fixture.child,
        ]);

        setSubagentControllerRun(fixture.child, fixture.newParent, now + 25);
        expect(loadGatewaySessionRow(fixture.oldParent, { now: now + 50 })?.childSessions).toEqual([
          fixture.child,
        ]);
        expect(
          loadGatewaySessionRow(fixture.newParent, { now: now + 50 })?.childSessions,
        ).toBeUndefined();
        expect(subagentRegistryReadMock.buildSubagentRunReadIndex).not.toHaveBeenCalled();
      },
    );
  });

  test("rebuilds store child candidates after same-object session store writes", async () => {
    await withSingleRowCacheStore(
      "openclaw-single-row-cache-write-version-",
      "/tmp/openclaw-single-row-cache-write-version",
      async ({ now, storePath }) => {
        const fixture = createMovingChildFixture(now);
        await saveSessionStore(storePath, fixture.store);

        expect(loadGatewaySessionRow(fixture.oldParent, { now })?.childSessions).toEqual([
          fixture.child,
        ]);
        await updateSessionStore(
          storePath,
          (cachedStore) => {
            const childEntry = cachedStore[fixture.child];
            if (childEntry) {
              childEntry.parentSessionKey = fixture.newParent;
              childEntry.updatedAt = now + 25;
            }
          },
          { skipMaintenance: true, takeCacheOwnership: true },
        );

        expectChildMovedToNewParent(fixture, now);
      },
    );
  });

  test("single session detail traverses native lineage across agent stores", async () => {
    await withStateDirEnv("openclaw-single-row-cross-agent-lineage-", async ({ stateDir }) => {
      const workspace = "/tmp/openclaw-single-row-cross-agent-lineage";
      const cfg: OpenClawConfig = {
        session: {
          store: path.join(stateDir, "agents/{agentId}/sessions/sessions.json"),
        },
        agents: {
          list: [
            {
              id: "main",
              default: true,
              workspace,
            },
            {
              id: "planning",
              workspace,
            },
            {
              id: "reviewer",
              workspace,
            },
          ],
          defaults: { model: { primary: TEST_MODEL } },
        },
      } as OpenClawConfig;
      setRuntimeConfigSnapshot(cfg, cfg);
      const now = Date.UTC(2026, 6, 1, 0, 3, 0);
      const mainKey = "agent:main:phase0z-topology-check";
      const planningKey = "agent:planning:subagent:planning-child";
      const reviewerKey = "agent:reviewer:subagent:reviewer-grandchild";
      const mainSessionId = "main-cross-agent-lineage";
      const planningSessionId = "planning-cross-agent-lineage";
      const reviewerSessionId = "reviewer-cross-agent-lineage";
      const mainStorePath = resolveStorePath(cfg.session?.store, { agentId: "main" });
      const planningStorePath = resolveStorePath(cfg.session?.store, { agentId: "planning" });
      const reviewerStorePath = resolveStorePath(cfg.session?.store, { agentId: "reviewer" });
      const mainSessionFile = path.join(path.dirname(mainStorePath), `${mainSessionId}.jsonl`);
      const mainTrajectoryFile = path.join(
        path.dirname(mainStorePath),
        `${mainSessionId}.trajectory.jsonl`,
      );
      const planningSessionFile = path.join(
        path.dirname(planningStorePath),
        `${planningSessionId}.jsonl`,
      );
      const reviewerSessionFile = path.join(
        path.dirname(reviewerStorePath),
        `${reviewerSessionId}.jsonl`,
      );
      const reviewerTrajectoryFile = path.join(
        path.dirname(reviewerStorePath),
        `${reviewerSessionId}.trajectory.jsonl`,
      );
      fs.mkdirSync(path.dirname(mainStorePath), { recursive: true });
      fs.mkdirSync(path.dirname(planningStorePath), { recursive: true });
      fs.mkdirSync(path.dirname(reviewerStorePath), { recursive: true });
      fs.writeFileSync(mainSessionFile, "", "utf8");
      fs.writeFileSync(planningSessionFile, "", "utf8");
      fs.writeFileSync(reviewerSessionFile, "", "utf8");
      fs.writeFileSync(
        mainTrajectoryFile,
        `${JSON.stringify({
          traceSchema: "openclaw-trajectory",
          sessionId: mainSessionId,
          type: "agent.tool",
          ts: "2026-07-01T00:01:00.000Z",
          seq: 2,
          sourceSeq: 12,
          data: {
            phase: "start",
            name: "task",
            childRole: "planning",
          },
        })}\n`,
        "utf8",
      );
      fs.writeFileSync(
        reviewerTrajectoryFile,
        `${JSON.stringify({
          traceSchema: "openclaw-trajectory",
          sessionId: reviewerSessionId,
          type: "agent.tool",
          ts: "2026-07-01T00:02:10.000Z",
          seq: 5,
          sourceSeq: 30,
          data: {
            phase: "start",
            name: "read",
          },
        })}\n`,
        "utf8",
      );
      await saveSessionStore(mainStorePath, {
        [mainKey]: {
          sessionId: mainSessionId,
          sessionFile: mainSessionFile,
          status: "running",
          updatedAt: now - 180_000,
          startedAt: now - 200_000,
        },
      });
      await saveSessionStore(planningStorePath, {
        [planningKey]: {
          sessionId: planningSessionId,
          sessionFile: planningSessionFile,
          status: "running",
          spawnedBy: mainKey,
          parentSessionKey: mainKey,
          updatedAt: now - 120_000,
          startedAt: now - 150_000,
        },
      });
      await saveSessionStore(reviewerStorePath, {
        [reviewerKey]: {
          sessionId: reviewerSessionId,
          sessionFile: reviewerSessionFile,
          status: "running",
          spawnedBy: planningKey,
          parentSessionKey: planningKey,
          updatedAt: now - 30_000,
          startedAt: now - 60_000,
        },
      });

      const row = loadGatewaySessionRow(mainKey, { now });

      expect(row?.childSessions).toEqual([planningKey]);
      expect(row?.activeProgress).toMatchObject({
        source: "trajectory",
        ref: `session:${reviewerSessionId}`,
        currentPhase: "start",
        activeLabel: "read",
        sourceEventType: "agent.tool",
        sourceEventSeq: 30,
        toolName: "read",
        pointer: {
          kind: "session",
          ref: reviewerKey,
          label: "active child session",
        },
        derivedBy: "readLatestTrajectoryProgressProjection",
        bounded: true,
      });
      expect(row?.updatedAt).toBe(now - 180_000);
      expect(row?.lastObservedActivityAt).toBe(Date.parse("2026-07-01T00:02:10.000Z"));
      expect(row?.lastObservedActivitySource).toBe("descendant");
    });
  });
});
