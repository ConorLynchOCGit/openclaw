// Webhooks tests cover http plugin behavior.
import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { createRuntimeTaskFlow } from "openclaw/plugin-sdk/plugin-test-runtime";
import { createMockServerResponse } from "openclaw/plugin-sdk/test-env";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../runtime-api.js";
import { createTaskFlowWebhookRequestHandler, type TaskFlowWebhookTarget } from "./http.js";

type BoundTaskFlow = TaskFlowWebhookTarget["taskFlow"];
type ManagedFlow = NonNullable<ReturnType<BoundTaskFlow["createManaged"]>>;

function createManagedFlow(
  target: TaskFlowWebhookTarget,
  params: Parameters<BoundTaskFlow["createManaged"]>[0],
): ManagedFlow {
  const flow = target.taskFlow.createManaged(params);
  if (!flow) {
    throw new Error("expected managed TaskFlow creation to succeed");
  }
  return flow;
}

const hoisted = vi.hoisted(() => {
  const resolveConfiguredSecretInputStringMock = vi.fn();
  return {
    resolveConfiguredSecretInputStringMock,
  };
});

vi.mock("../runtime-api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../runtime-api.js")>();
  hoisted.resolveConfiguredSecretInputStringMock.mockImplementation(
    actual.resolveConfiguredSecretInputString,
  );
  return {
    ...actual,
    resolveConfiguredSecretInputString: hoisted.resolveConfiguredSecretInputStringMock,
  };
});

type MockIncomingMessage = IncomingMessage & {
  destroyed?: boolean;
  destroy: () => MockIncomingMessage;
  socket: { remoteAddress: string };
};

let nextSessionId = 0;

function createJsonRequest(params: {
  path: string;
  secret?: string;
  body: unknown;
}): MockIncomingMessage {
  const req = new EventEmitter() as MockIncomingMessage;
  req.method = "POST";
  req.url = params.path;
  req.headers = {
    "content-type": "application/json",
    ...(params.secret ? { "x-openclaw-webhook-secret": params.secret } : {}),
  };
  req.socket = { remoteAddress: "127.0.0.1" } as MockIncomingMessage["socket"];
  req.destroyed = false;
  req.destroy = (() => {
    req.destroyed = true;
    return req;
  }) as MockIncomingMessage["destroy"];

  setImmediate(() => {
    req.emit("data", Buffer.from(JSON.stringify(params.body), "utf8"));
    req.emit("end");
  });

  return req;
}

function createHandler(): {
  handler: ReturnType<typeof createTaskFlowWebhookRequestHandler>;
  target: TaskFlowWebhookTarget;
  secret: string;
} {
  const runtime = createRuntimeTaskFlow();
  nextSessionId += 1;
  const secret = "shared-secret";
  const target: TaskFlowWebhookTarget = {
    routeId: "zapier",
    path: "/plugins/webhooks/zapier",
    secretInput: secret,
    secretConfigPath: "plugins.entries.webhooks.routes.zapier.secret",
    defaultControllerId: "webhooks/zapier",
    taskFlow: runtime.bindSession({
      sessionKey: `agent:main:webhook-test-${String(nextSessionId)}`,
    }),
  };
  const targetsByPath = new Map<string, TaskFlowWebhookTarget[]>([[target.path, [target]]]);
  return {
    handler: createTaskFlowWebhookRequestHandler({
      cfg: {} as OpenClawConfig,
      targetsByPath,
    }),
    target,
    secret,
  };
}

function createHandlerWithTarget(
  target: TaskFlowWebhookTarget,
  cfg: OpenClawConfig = {} as OpenClawConfig,
): ReturnType<typeof createTaskFlowWebhookRequestHandler> {
  const targetsByPath = new Map<string, TaskFlowWebhookTarget[]>([[target.path, [target]]]);
  return createTaskFlowWebhookRequestHandler({
    cfg,
    targetsByPath,
  });
}

async function dispatchJsonRequest(params: {
  handler: ReturnType<typeof createTaskFlowWebhookRequestHandler>;
  path: string;
  secret?: string;
  body: unknown;
}) {
  const req = createJsonRequest({
    path: params.path,
    secret: params.secret,
    body: params.body,
  });
  const res = createMockServerResponse();
  await params.handler(req, res);
  return res;
}

function parseJsonBody(res: { body?: string | Buffer | null }) {
  return JSON.parse(String(res.body ?? ""));
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("createTaskFlowWebhookRequestHandler", () => {
  it("rejects requests with the wrong secret", async () => {
    const { handler, target } = createHandler();
    const res = await dispatchJsonRequest({
      handler,
      path: target.path,
      secret: "wrong-secret",
      body: {
        action: "list_flows",
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.body).toBe("unauthorized");
    expect(target.taskFlow.list()).toStrictEqual([]);
    expect(hoisted.resolveConfiguredSecretInputStringMock).not.toHaveBeenCalled();
  });

  it("re-resolves SecretRef-backed secrets across requests", async () => {
    const runtime = createRuntimeTaskFlow();
    const target: TaskFlowWebhookTarget = {
      routeId: "cached",
      path: "/plugins/webhooks/cached",
      secretInput: {
        source: "env",
        provider: "default",
        id: "OPENCLAW_WEBHOOK_SECRET",
      },
      secretConfigPath: "plugins.entries.webhooks.routes.cached.secret",
      defaultControllerId: "webhooks/cached",
      taskFlow: runtime.bindSession({
        sessionKey: "agent:main:webhook-cached",
      }),
    };
    hoisted.resolveConfiguredSecretInputStringMock
      .mockResolvedValueOnce({ value: "shared-secret" })
      .mockResolvedValueOnce({ value: "rotated-secret" })
      .mockResolvedValueOnce({ value: "rotated-secret" });
    const handler = createHandlerWithTarget(target);

    const first = await dispatchJsonRequest({
      handler,
      path: target.path,
      secret: "shared-secret",
      body: {
        action: "list_flows",
      },
    });
    const second = await dispatchJsonRequest({
      handler,
      path: target.path,
      secret: "shared-secret",
      body: {
        action: "list_flows",
      },
    });
    const third = await dispatchJsonRequest({
      handler,
      path: target.path,
      secret: "rotated-secret",
      body: {
        action: "list_flows",
      },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(401);
    expect(second.body).toBe("unauthorized");
    expect(third.statusCode).toBe(200);
    expect(hoisted.resolveConfiguredSecretInputStringMock).toHaveBeenCalledTimes(3);
  });

  it("creates flows through the bound session and scrubs owner metadata from responses", async () => {
    const { handler, target, secret } = createHandler();
    const res = await dispatchJsonRequest({
      handler,
      path: target.path,
      secret,
      body: {
        action: "create_flow",
        goal: "Review inbound queue",
      },
    });

    expect(res.statusCode).toBe(200);
    const parsed = parseJsonBody(res);
    expect(parsed.ok).toBe(true);
    expect(parsed.result.flow.syncMode).toBe("managed");
    expect(parsed.result.flow.controllerId).toBe("webhooks/zapier");
    expect(parsed.result.flow.goal).toBe("Review inbound queue");
    expect(parsed.result.flow.ownerKey).toBeUndefined();
    expect(parsed.result.flow.requesterOrigin).toBeUndefined();
    expect(target.taskFlow.get(parsed.result.flow.flowId)?.flowId).toBe(parsed.result.flow.flowId);
  });

  it("runs child tasks and scrubs task ownership fields from responses", async () => {
    const { handler, target, secret } = createHandler();
    const flow = createManagedFlow(target, {
      controllerId: "webhooks/zapier",
      goal: "Triage inbox",
    });
    const res = await dispatchJsonRequest({
      handler,
      path: target.path,
      secret,
      body: {
        action: "run_task",
        flowId: flow.flowId,
        runtime: "acp",
        childSessionKey: "agent:main:subagent:child",
        task: "Inspect the next message batch",
        status: "running",
        startedAt: 10,
        lastEventAt: 10,
      },
    });

    expect(res.statusCode).toBe(200);
    const parsed = parseJsonBody(res);
    expect(parsed.ok).toBe(true);
    expect(parsed.result.created).toBe(true);
    expect(parsed.result.task.parentFlowId).toBe(flow.flowId);
    expect(parsed.result.task.childSessionKey).toBe("agent:main:subagent:child");
    expect(parsed.result.task.runtime).toBe("acp");
    expect(parsed.result.task.ownerKey).toBeUndefined();
    expect(parsed.result.task.requesterSessionKey).toBeUndefined();
  });

  it("returns 404 for missing flow mutations", async () => {
    const { handler, target, secret } = createHandler();
    const res = await dispatchJsonRequest({
      handler,
      path: target.path,
      secret,
      body: {
        action: "set_waiting",
        flowId: "flow-missing",
        expectedRevision: 0,
      },
    });

    expect(res.statusCode).toBe(404);
    const parsed = parseJsonBody(res);
    expect(parsed.ok).toBe(false);
    expect(parsed.code).toBe("not_found");
    expect(parsed.error).toBe("TaskFlow not found.");
    expect(parsed.result.applied).toBe(false);
    expect(parsed.result.code).toBe("not_found");
  });

  it("returns 409 for revision conflicts", async () => {
    const { handler, target, secret } = createHandler();
    const flow = createManagedFlow(target, {
      controllerId: "webhooks/zapier",
      goal: "Review inbox",
    });
    const res = await dispatchJsonRequest({
      handler,
      path: target.path,
      secret,
      body: {
        action: "set_waiting",
        flowId: flow.flowId,
        expectedRevision: flow.revision + 1,
      },
    });

    expect(res.statusCode).toBe(409);
    const parsed = parseJsonBody(res);
    expect(parsed.ok).toBe(false);
    expect(parsed.code).toBe("revision_conflict");
    expect(parsed.result.applied).toBe(false);
    expect(parsed.result.code).toBe("revision_conflict");
    expect(parsed.result.current.flowId).toBe(flow.flowId);
    expect(parsed.result.current.revision).toBe(flow.revision);
  });

  it("rejects internal runtimes and running-only metadata from external callers", async () => {
    const { handler, target, secret } = createHandler();
    const flow = createManagedFlow(target, {
      controllerId: "webhooks/zapier",
      goal: "Review inbox",
    });

    const runtimeRes = await dispatchJsonRequest({
      handler,
      path: target.path,
      secret,
      body: {
        action: "run_task",
        flowId: flow.flowId,
        runtime: "cli",
        task: "Inspect queue",
      },
    });
    expect(runtimeRes.statusCode).toBe(400);
    const runtimeParsed = parseJsonBody(runtimeRes);
    expect(runtimeParsed.ok).toBe(false);
    expect(runtimeParsed.code).toBe("invalid_request");

    const queuedMetadataRes = await dispatchJsonRequest({
      handler,
      path: target.path,
      secret,
      body: {
        action: "run_task",
        flowId: flow.flowId,
        runtime: "acp",
        task: "Inspect queue",
        startedAt: 10,
      },
    });
    expect(queuedMetadataRes.statusCode).toBe(400);
    const queuedMetadataParsed = parseJsonBody(queuedMetadataRes);
    expect(queuedMetadataParsed.ok).toBe(false);
    expect(queuedMetadataParsed.code).toBe("invalid_request");
    expect(queuedMetadataParsed.error).toBe(
      "status: status must be running when startedAt, lastEventAt, or progressSummary is provided",
    );
  });

  it("reuses the same task record when retried with the same runId", async () => {
    const { handler, target, secret } = createHandler();
    const flow = createManagedFlow(target, {
      controllerId: "webhooks/zapier",
      goal: "Triage inbox",
    });

    const first = await dispatchJsonRequest({
      handler,
      path: target.path,
      secret,
      body: {
        action: "run_task",
        flowId: flow.flowId,
        runtime: "acp",
        childSessionKey: "agent:main:subagent:child",
        runId: "retry-me",
        task: "Inspect the next message batch",
      },
    });
    const second = await dispatchJsonRequest({
      handler,
      path: target.path,
      secret,
      body: {
        action: "run_task",
        flowId: flow.flowId,
        runtime: "acp",
        childSessionKey: "agent:main:subagent:child",
        runId: "retry-me",
        task: "Inspect the next message batch",
      },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    const firstParsed = parseJsonBody(first);
    const secondParsed = parseJsonBody(second);
    expect(firstParsed.result.task.taskId).toBe(secondParsed.result.task.taskId);
    expect(target.taskFlow.getTaskSummary(flow.flowId)?.total).toBe(1);
  });

  it("preserves a collaborative refinement episode across the generic route", async () => {
    const { handler, target, secret } = createHandler();
    const candidateRecord = {
      ref: "business-ops/onboarding/examples/synthetic-company-candidate.md",
      digest: "a".repeat(64),
    };
    const proposal = {
      id: "proposal-synthetic-001",
      ref: "business-ops/onboarding/examples/proposals/synthetic-001.md",
      digest: "b".repeat(64),
    };
    const initialState = {
      schemaVersion: "openclaw.business-ops.collaborative-refinement.flow-state.v1",
      episodeId: "episode-synthetic-001",
      subject: { kind: "company", slug: "synthetic-orbit-works", scope: "company" },
      candidateRecord,
      canonicalRefs: [{ ref: "synthetic-company-canonical.md", digest: "c".repeat(64) }],
      openQuestionIds: ["source-authority", "audience-priority"],
      selectedQuestionId: "source-authority",
      proposal,
      affectedSurfaces: ["synthetic-campaign-brief"],
      evidenceSummary: {
        operator_assertion: [],
        verified_fact: [],
        public_source_evidence: [],
        observation: [],
        inference: [],
        invented_candidate: [],
        rejected_option: [],
        approved_canonical_decision: [],
        unresolved: ["source-authority"],
      },
      approvalSummary: {
        status: "not_requested",
        ownerIds: [],
        legalOwnerId: null,
        securitiesOwnerId: null,
        technicalOwnerId: null,
        rightsOwnerId: null,
        privacyOwnerId: null,
        publicationOwnerId: null,
      },
      decision: {
        id: null,
        outcome: null,
        rationale: null,
        proposalRef: proposal.ref,
        proposalDigest: proposal.digest,
      },
      proposalResult: { status: null, reason: null, currentTargetDigest: null },
      lastDecisionId: null,
      state: "collecting",
      resumeHint: "candidate-record-and-selected-question",
    };

    const createdRes = await dispatchJsonRequest({
      handler,
      path: target.path,
      secret,
      body: {
        action: "create_flow",
        goal: "Refine the synthetic company candidate",
        stateJson: initialState,
      },
    });
    expect(createdRes.statusCode).toBe(200);
    const created = parseJsonBody(createdRes).result.flow;
    expect(created.stateJson).toStrictEqual(initialState);

    const taskRes = await dispatchJsonRequest({
      handler,
      path: target.path,
      secret,
      body: {
        action: "run_task",
        flowId: created.flowId,
        runtime: "acp",
        childSessionKey: "agent:business-ops:subagent:refinement-synthetic-001",
        task: "Continue from the exact candidate and selected-question pointers",
      },
    });
    expect(taskRes.statusCode).toBe(200);
    expect(parseJsonBody(taskRes).result.task.childSessionKey).toBe(
      "agent:business-ops:subagent:refinement-synthetic-001",
    );

    const waitingRes = await dispatchJsonRequest({
      handler,
      path: target.path,
      secret,
      body: {
        action: "set_waiting",
        flowId: created.flowId,
        expectedRevision: created.revision,
        waitJson: {
          kind: "material_approval",
          proposal,
          allowedOutcomes: ["approve", "reject", "revise", "defer"],
        },
      },
    });
    expect(waitingRes.statusCode).toBe(200);
    const waiting = parseJsonBody(waitingRes).result.flow;
    expect(waiting.waitJson.proposal).toStrictEqual(proposal);

    const revisedState = {
      ...initialState,
      selectedQuestionId: "audience-priority",
      evidenceSummary: {
        operator_assertion: ["source-authority"],
        verified_fact: [],
        public_source_evidence: [],
        observation: [],
        inference: [],
        invented_candidate: [],
        rejected_option: [],
        approved_canonical_decision: [],
        unresolved: ["audience-priority"],
      },
      approvalSummary: { ...initialState.approvalSummary, status: "revision_requested" },
      lastDecisionId: "decision-synthetic-revise-001",
      state: "revision_requested",
      resumeHint: "candidate-record-and-revised-proposal",
      decision: {
        id: "decision-synthetic-revise-001",
        outcome: "revise",
        rationale: "Source authority is an assertion pending verification.",
        proposalRef: proposal.ref,
        proposalDigest: proposal.digest,
      },
      proposalResult: {
        status: "revision_needed",
        reason: "target_digest_changed",
        currentTargetDigest: "d".repeat(64),
      },
    };
    const resumedRes = await dispatchJsonRequest({
      handler,
      path: target.path,
      secret,
      body: {
        action: "resume_flow",
        flowId: created.flowId,
        expectedRevision: waiting.revision,
        stateJson: revisedState,
      },
    });
    expect(resumedRes.statusCode).toBe(200);
    const resumed = parseJsonBody(resumedRes).result.flow;
    expect(resumed.stateJson).toStrictEqual(revisedState);
    expect(resumed.stateJson.proposal).toStrictEqual(proposal);
    expect(resumed.stateJson.proposalResult.status).toBe("revision_needed");

    const staleRes = await dispatchJsonRequest({
      handler,
      path: target.path,
      secret,
      body: {
        action: "resume_flow",
        flowId: created.flowId,
        expectedRevision: waiting.revision,
        stateJson: initialState,
      },
    });
    expect(staleRes.statusCode).toBe(409);
    expect(parseJsonBody(staleRes).code).toBe("revision_conflict");

    const finishedState = {
      ...revisedState,
      approvalSummary: { ...initialState.approvalSummary, status: "deferred" },
      lastDecisionId: "decision-synthetic-defer-002",
      state: "deferred",
      decision: {
        id: "decision-synthetic-defer-002",
        outcome: "defer",
        rationale: "The target digest must be refreshed before approval.",
        proposalRef: proposal.ref,
        proposalDigest: proposal.digest,
      },
    };
    const finishedRes = await dispatchJsonRequest({
      handler,
      path: target.path,
      secret,
      body: {
        action: "finish_flow",
        flowId: created.flowId,
        expectedRevision: resumed.revision,
        stateJson: finishedState,
      },
    });
    expect(finishedRes.statusCode).toBe(200);
    const finished = parseJsonBody(finishedRes).result.flow;
    expect(finished.stateJson).toStrictEqual(finishedState);
    expect(finished.status).toBe("succeeded");
  });

  it("returns 409 when cancellation targets a terminal flow", async () => {
    const { handler, target, secret } = createHandler();
    const flow = createManagedFlow(target, {
      controllerId: "webhooks/zapier",
      goal: "Review inbox",
    });
    const finished = target.taskFlow.finish({
      flowId: flow.flowId,
      expectedRevision: flow.revision,
    });
    expect(finished.applied).toBe(true);

    const res = await dispatchJsonRequest({
      handler,
      path: target.path,
      secret,
      body: {
        action: "cancel_flow",
        flowId: flow.flowId,
      },
    });

    expect(res.statusCode).toBe(409);
    const parsed = parseJsonBody(res);
    expect(parsed.ok).toBe(false);
    expect(parsed.code).toBe("terminal");
    expect(parsed.error).toBe("Flow is already succeeded.");
    expect(parsed.result.found).toBe(true);
    expect(parsed.result.cancelled).toBe(false);
    expect(parsed.result.reason).toBe("Flow is already succeeded.");
  });
});
