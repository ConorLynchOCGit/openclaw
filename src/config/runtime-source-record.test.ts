import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyRuntimePath,
  createRuntimeSourceRecord,
  detectRuntimeSourceDrift,
  hashRuntimeSourceBytes,
  resolveRuntimePath,
  runtimeFilePolicy,
  validateRuntimeSourceRecord,
} from "./runtime-source-record.js";

const runtimeHome = "/root/.openclaw";

describe("RuntimeSourceRecord", () => {
  it("creates minimal materialization records with content hashes", () => {
    const record = createRuntimeSourceRecord({
      runtimePath: "/root/.openclaw/agents/execution-coding/agent/IDENTITY.md",
      sourcePath:
        "/root/services/openclaw-roles/live/docs/agents/execution-coding/runtime/IDENTITY.md",
      sourceCommit: "abc123",
      afterContent: "identity body",
      mode: "materialized",
    });

    expect(record).toEqual({
      runtimePath: "/root/.openclaw/agents/execution-coding/agent/IDENTITY.md",
      sourcePath:
        "/root/services/openclaw-roles/live/docs/agents/execution-coding/runtime/IDENTITY.md",
      sourceCommit: "abc123",
      afterHash: hashRuntimeSourceBytes("identity body"),
      mode: "materialized",
      reconciled: true,
    });
    expect(validateRuntimeSourceRecord(record)).toEqual([]);
  });

  it("requires source provenance for materialized records", () => {
    const record = createRuntimeSourceRecord({
      runtimePath: "/root/.openclaw/agents/execution-coding/agent/IDENTITY.md",
      afterContent: "identity body",
      mode: "materialized",
    });

    expect(validateRuntimeSourceRecord(record)).toContain(
      "materialized records require sourcePath",
    );
  });

  it("records hot patches as unreconciled by default and detects later drift", () => {
    const record = createRuntimeSourceRecord({
      runtimePath: "/root/.openclaw/openclaw.json",
      beforeContent: '{"old":true}',
      afterContent: '{"new":true}',
      mode: "hot_patch",
    });

    expect(record.reconciled).toBe(false);
    expect(validateRuntimeSourceRecord(record)).toEqual([]);
    expect(detectRuntimeSourceDrift(record, '{"new":true}')).toEqual({
      status: "clean",
      expectedHash: hashRuntimeSourceBytes('{"new":true}'),
      currentHash: hashRuntimeSourceBytes('{"new":true}'),
    });
    expect(detectRuntimeSourceDrift(record, '{"newer":true}')).toEqual({
      status: "drifted",
      expectedHash: hashRuntimeSourceBytes('{"new":true}'),
      currentHash: hashRuntimeSourceBytes('{"newer":true}'),
    });
  });
});

describe("runtime path aliases", () => {
  it("canonicalizes container runtime-home aliases instead of treating them as source truth", () => {
    const resolved = resolveRuntimePath(
      "/home/node/.openclaw/agents/execution-coding/agent/IDENTITY.md",
      { runtimeHome },
    );

    expect(resolved).toEqual({
      inputPath: "/home/node/.openclaw/agents/execution-coding/agent/IDENTITY.md",
      canonicalPath: "/root/.openclaw/agents/execution-coding/agent/IDENTITY.md",
      isAlias: true,
      alias: {
        aliasPath: "/home/node/.openclaw",
        canonicalPath: "/root/.openclaw",
        label: "container-runtime-home-alias",
      },
    });
  });

  it("supports explicit compatibility aliases without making them canonical roots", () => {
    const resolved = resolveRuntimePath(
      "/runtime/import/agents/execution-coding/agent/IDENTITY.md",
      {
        runtimeHome,
        aliases: [
          {
            aliasPath: "/runtime/import",
            canonicalPath: runtimeHome,
            label: "test-import-alias",
          },
        ],
      },
    );

    expect(resolved.canonicalPath).toBe(
      path.join(runtimeHome, "agents", "execution-coding", "agent", "IDENTITY.md"),
    );
    expect(resolved.isAlias).toBe(true);
    expect(resolved.alias?.label).toBe("test-import-alias");
  });
});

describe("runtime file classes", () => {
  it("classifies source-materialized files from the source inventory", () => {
    const runtimePath = "/root/.openclaw/agents/execution-coding/agent/IDENTITY.md";
    const classification = classifyRuntimePath(runtimePath, {
      runtimeHome,
      sourceMaterializedPaths: [runtimePath],
    });

    expect(classification.fileClass).toBe("source_materialized");
    expect(runtimeFilePolicy(classification.fileClass)).toEqual({
      canInspect: true,
      canEdit: true,
      editMode: "hot_patch",
    });
  });

  it("allows local config override edits but denies secrets, sessions, logs, and generated artifacts", () => {
    expect(
      runtimeFilePolicy(
        classifyRuntimePath("/root/.openclaw/openclaw.json", { runtimeHome }).fileClass,
      ),
    ).toEqual({
      canInspect: true,
      canEdit: true,
      editMode: "local_override",
    });
    expect(
      runtimeFilePolicy(classifyRuntimePath("/root/.openclaw/.env", { runtimeHome }).fileClass),
    ).toEqual({
      canInspect: false,
      canEdit: false,
    });
    expect(
      runtimeFilePolicy(
        classifyRuntimePath("/root/.openclaw/agents/main/sessions/sessions.json", { runtimeHome })
          .fileClass,
      ),
    ).toEqual({
      canInspect: true,
      canEdit: false,
    });
    expect(
      runtimeFilePolicy(
        classifyRuntimePath("/root/.openclaw/logs/gateway.log", { runtimeHome }).fileClass,
      ),
    ).toEqual({
      canInspect: true,
      canEdit: false,
    });
    expect(
      runtimeFilePolicy(
        classifyRuntimePath("/root/.openclaw/workspace/.openclaw/artifacts/run.json", {
          runtimeHome,
        }).fileClass,
      ),
    ).toEqual({
      canInspect: true,
      canEdit: false,
    });
  });
});
