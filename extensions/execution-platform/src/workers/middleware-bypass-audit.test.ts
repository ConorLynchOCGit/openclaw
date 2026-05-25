import { describe, expect, it } from "vitest";
import {
  buildMiddlewareBypassCandidatesFromSourceFiles,
  evaluateMiddlewareBypassAudit,
} from "./middleware-bypass-audit.ts";

describe("middleware bypass audit", () => {
  it("passes approved middleware and test-only direct paths", () => {
    expect(
      evaluateMiddlewareBypassAudit([
        {
          path: "extensions/execution-platform/src/workers/middleware-worker-adapters.ts",
          kind: "model",
          liveCapable: true,
          approvedMiddlewarePath: true,
          testOnly: false,
          legacyAllowed: false,
          reason: "approved model-task middleware path",
        },
        {
          path: "extensions/execution-platform/src/model-tasks/model-task-repository.test.ts",
          kind: "model",
          liveCapable: false,
          approvedMiddlewarePath: false,
          testOnly: true,
          legacyAllowed: false,
          reason: "test fixture only",
        },
      ]),
    ).toMatchObject({
      status: "passed",
      blockedPathCount: 0,
      reasonCodes: ["middleware_bypass_audit_passed"],
    });
  });

  it("blocks unapproved live direct model/script/DB paths", () => {
    const result = evaluateMiddlewareBypassAudit([
      {
        path: "extensions/execution-platform/src/workflows/legacy-direct-model.ts",
        kind: "model",
        liveCapable: true,
        approvedMiddlewarePath: false,
        testOnly: false,
        legacyAllowed: false,
        reason: "direct live model executor",
      },
    ]);

    expect(result).toMatchObject({
      status: "blocked",
      blockedPathCount: 1,
    });
    expect(result.reasonCodes[0]).toContain("blocked_live_bypass:model");
  });

  it("requires expiry for temporary live exceptions", () => {
    expect(
      evaluateMiddlewareBypassAudit([
        {
          path: "extensions/execution-platform/src/workflows/temporary-direct-db.ts",
          kind: "db",
          liveCapable: true,
          approvedMiddlewarePath: false,
          testOnly: false,
          legacyAllowed: true,
          reason: "temporary migration compatibility",
        },
      ]),
    ).toMatchObject({
      status: "blocked",
      reasonCodes: expect.arrayContaining([
        "temporary_exception_missing_expiry:extensions/execution-platform/src/workflows/temporary-direct-db.ts",
      ]),
    });
  });

  it("extracts direct model/script/DB/work-queue bypass candidates from source shape", () => {
    const candidates = buildMiddlewareBypassCandidatesFromSourceFiles([
      {
        path: "extensions/execution-platform/src/workflows/unsafe-direct-model.ts",
        source: "const client = new OpenRouterAgentTeamModelClient({ apiKey });",
      },
      {
        path: "extensions/execution-platform/src/workers/middleware-worker-adapters.ts",
        source: "await sqlClient.query('select 1');",
      },
      {
        path: "extensions/execution-platform/src/model-tasks/model-task-repository.test.ts",
        source: "await execFile('node', ['--version']);",
      },
      {
        path: "extensions/execution-platform/src/workflows/unsafe-lifecycle.ts",
        source: "await workQueue.completeWorkQueueItemFromCloseout(input);",
      },
    ]);

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "extensions/execution-platform/src/workflows/unsafe-direct-model.ts",
          kind: "model",
          liveCapable: true,
          approvedMiddlewarePath: false,
        }),
        expect.objectContaining({
          path: "extensions/execution-platform/src/workers/middleware-worker-adapters.ts",
          kind: "db",
          approvedMiddlewarePath: true,
        }),
        expect.objectContaining({
          path: "extensions/execution-platform/src/model-tasks/model-task-repository.test.ts",
          kind: "script",
          testOnly: true,
        }),
        expect.objectContaining({
          path: "extensions/execution-platform/src/workflows/unsafe-lifecycle.ts",
          kind: "work_queue_lifecycle",
          liveCapable: true,
        }),
      ]),
    );

    const audit = evaluateMiddlewareBypassAudit(candidates);

    expect(audit.status).toBe("blocked");
    expect(audit.reasonCodes).toEqual(
      expect.arrayContaining([
        expect.stringContaining("blocked_live_bypass:model"),
        expect.stringContaining("blocked_live_bypass:work_queue_lifecycle"),
      ]),
    );
  });
});
