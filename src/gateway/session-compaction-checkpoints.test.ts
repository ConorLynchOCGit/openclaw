import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AssistantMessage, UserMessage } from "@mariozechner/pi-ai";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, test } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  captureCompactionCheckpointSnapshot,
  cleanupCompactionCheckpointSnapshot,
  persistSessionCompactionCheckpoint,
} from "./session-compaction-checkpoints.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("session-compaction-checkpoints", () => {
  test("capture stores the copied pre-compaction transcript path and cleanup removes only the copy", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-checkpoint-"));
    tempDirs.push(dir);

    const session = SessionManager.create(dir, dir);
    const userMessage: UserMessage = {
      role: "user",
      content: "before compaction",
      timestamp: Date.now(),
    };
    const assistantMessage: AssistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: "working on it" }],
      api: "responses",
      provider: "openai",
      model: "gpt-test",
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0,
        },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    };
    session.appendMessage(userMessage);
    session.appendMessage(assistantMessage);

    const sessionFile = session.getSessionFile();
    const leafId = session.getLeafId();
    expect(sessionFile).toBeTruthy();
    expect(leafId).toBeTruthy();

    const originalBefore = await fs.readFile(sessionFile!, "utf-8");
    const snapshot = captureCompactionCheckpointSnapshot({
      sessionManager: session,
      sessionFile: sessionFile!,
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.leafId).toBe(leafId);
    expect(snapshot?.sessionFile).not.toBe(sessionFile);
    expect(snapshot?.sessionFile).toContain(".checkpoint.");
    expect(fsSync.existsSync(snapshot!.sessionFile)).toBe(true);
    expect(await fs.readFile(snapshot!.sessionFile, "utf-8")).toBe(originalBefore);

    session.appendCompaction("checkpoint summary", leafId!, 123, { ok: true });

    expect(await fs.readFile(snapshot!.sessionFile, "utf-8")).toBe(originalBefore);
    expect(await fs.readFile(sessionFile!, "utf-8")).not.toBe(originalBefore);

    await cleanupCompactionCheckpointSnapshot(snapshot);

    expect(fsSync.existsSync(snapshot!.sessionFile)).toBe(false);
    expect(fsSync.existsSync(sessionFile!)).toBe(true);
  });

  test("persist prunes generated snapshot files when checkpoint metadata exceeds retention cap", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-checkpoint-prune-"));
    tempDirs.push(root);
    const agentDir = path.join(root, "agents", "main", "agent");
    const sessionsDir = path.join(root, "agents", "main", "sessions");
    const storePath = path.join(sessionsDir, "sessions.json");
    const sessionFile = path.join(sessionsDir, "main.jsonl");
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.mkdir(agentDir, { recursive: true });
    await fs.writeFile(sessionFile, "{}\n", "utf8");
    await fs.writeFile(
      storePath,
      `${JSON.stringify({
        "agent:main:main": {
          sessionId: "main-session",
          sessionFile,
          updatedAt: 1,
        },
      })}\n`,
      "utf8",
    );
    const cfg = {
      agents: {
        list: [{ id: "main", agentDir }],
      },
    } as OpenClawConfig;

    const snapshotFiles: string[] = [];
    for (let index = 0; index < 7; index += 1) {
      const snapshotFile = path.join(sessionsDir, `main.checkpoint.${index}.jsonl`);
      snapshotFiles.push(snapshotFile);
      await fs.writeFile(snapshotFile, `checkpoint ${index}\n`, "utf8");
      const persisted = await persistSessionCompactionCheckpoint({
        cfg,
        sessionKey: "agent:main:main",
        sessionId: "main-session",
        reason: "manual",
        snapshot: {
          sessionId: `snapshot-${index}`,
          sessionFile: snapshotFile,
          leafId: `leaf-${index}`,
        },
        createdAt: index + 1,
      });
      expect(persisted).not.toBeNull();
    }

    const store = JSON.parse(await fs.readFile(storePath, "utf8")) as {
      "agent:main:main"?: {
        compactionCheckpoints?: Array<{ preCompaction?: { sessionFile?: string } }>;
      };
    };
    const retained = store["agent:main:main"]?.compactionCheckpoints ?? [];
    expect(retained).toHaveLength(5);
    expect(await fs.stat(snapshotFiles[0]).catch(() => null)).toBeNull();
    expect(await fs.stat(snapshotFiles[1]).catch(() => null)).toBeNull();
    await expect(fs.stat(snapshotFiles[2])).resolves.toBeTruthy();
    await expect(fs.stat(snapshotFiles[6])).resolves.toBeTruthy();
    expect(retained.map((checkpoint) => checkpoint.preCompaction?.sessionFile)).toEqual(
      snapshotFiles.slice(2),
    );
  });
});
