import { createHash } from "node:crypto";
import type { PluginStateKeyedStore } from "openclaw/plugin-sdk/plugin-state-runtime";
import { describe, expect, it } from "vitest";
import { XResearchAdmission } from "./x-research-admission.js";

function memoryStore<T>(): PluginStateKeyedStore<T> {
  const values = new Map<string, T>();
  return {
    async register(key, value) {
      values.set(key, value);
    },
    async registerIfAbsent(key, value) {
      if (values.has(key)) {
        return false;
      }
      values.set(key, value);
      return true;
    },
    async update(key, fn) {
      const next = fn(values.get(key));
      if (next === undefined) {
        return false;
      }
      values.set(key, next);
      return true;
    },
    async lookup(key) {
      return values.get(key);
    },
    async consume(key) {
      const value = values.get(key);
      values.delete(key);
      return value;
    },
    async delete(key) {
      return values.delete(key);
    },
    async entries() {
      return Array.from(values, ([key, value]) => ({ key, value, createdAt: 0 }));
    },
    async clear() {
      values.clear();
    },
  };
}

const identity = {
  runId: "run-1",
  sessionKey: "agent:x:subagent:child",
  sessionId: "session-1",
  agentId: "x-researcher",
  modelProviderId: "openrouter",
  modelId: "x-ai/grok-4.5",
  workspaceDir: "/tmp/x",
  prompt: "research",
};
const priceAuthority = {
  version: "x-research-prices.v1",
  source: "operator-approved-price-table",
  asOf: "1970-01-01T00:00:00.000Z",
  expiresAt: "2099-01-01T00:00:00.000Z",
  postUsd: 0.005,
  userUsd: 0.01,
  recentCountUsd: 0.005,
  allCountUsd: 0.01,
  fullGrokStageUsd: {
    question_discovery: 0.65,
    question_verified_analysis: 0.75,
    topic_discovery: 0.7,
    influence_discovery: 0.85,
    influence_challenge: 0.75,
    format_analysis: 0.8,
  },
  reducedGrokStageUsd: {
    question_discovery: 0.45,
    topic_discovery: 0.45,
    influence_discovery: 0.55,
  },
};
const proofAuthority = {
  runtimeVersion: "bf1daab125c541cb2becc43b4dcda65c78280dd0",
  sourceRef: "bf1daab125c541cb2becc43b4dcda65c78280dd0",
  configDigest: "config-digest",
  writer: "operator",
  approver: "independent-reviewer",
  retentionUntil: 2_678_401_000,
};

type TestProofRow = typeof identity & {
  promptDigest: string;
  profile: "full_hybrid_per_subject_v2" | "reduced_probe_v2";
  caseId: string;
  arm: "hybrid" | "raw_x_only" | "grok_only";
};

function completeProofRows(target: TestProofRow): TestProofRow[] {
  const arms =
    target.profile === "reduced_probe_v2"
      ? (["hybrid", "raw_x_only"] as const)
      : (["grok_only", "raw_x_only", "hybrid"] as const);
  const caseCount = target.profile === "reduced_probe_v2" ? 2 : 4;
  const cases = [
    target.caseId,
    ...Array.from({ length: caseCount - 1 }, (_, index) => `${target.caseId}-peer-${index + 1}`),
  ];
  let serial = 0;
  return cases.flatMap((caseId) =>
    arms.map((arm) => {
      if (caseId === target.caseId && arm === target.arm) {
        return target;
      }
      serial += 1;
      return Object.assign({}, target, {
        runId: `${target.runId}-${serial}`,
        sessionKey: `agent:x:subagent:${target.runId}-${serial}`,
        sessionId: `${target.sessionId}-${serial}`,
        caseId,
        arm,
      });
    }),
  );
}

describe("X research admission", () => {
  it("creates one product row, locks its subject, and rejects changed input before dispatch", async () => {
    const admission = new XResearchAdmission({
      store: memoryStore(),
      now: () => 1_000,
      priceAuthority,
    });
    const activated = await admission.activateProduct({
      ...identity,
      researcherAgentId: "x-researcher",
    });
    expect(activated.allowed).toBe(true);
    if (!activated.allowed) {
      throw new Error("expected product admission");
    }
    expect(activated.row.ceiling).toMatchObject({
      requests: 48,
      pages: 22,
      posts: 533,
      users: 91,
      counts: 13,
      media: 40,
      dollars: 3.64,
      acquisitionSeconds: 625,
      grokCalls: 6,
      grokDollars: 4.5,
    });
    await expect(
      admission.reserve({
        ...identity,
        toolName: "x_counts",
        toolCallId: "unsupported-all-count",
        params: {
          research_profile: "full_hybrid_per_subject_v2",
          research_stage: "topic_discovery",
          operation: "all",
          query: "a",
        },
      }),
    ).resolves.toEqual({ allowed: false, code: "admission_request_invalid" });
    const first = await admission.reserve({
      ...identity,
      toolName: "x_search",
      toolCallId: "call-1",
      params: {
        research_profile: "full_hybrid_per_subject_v2",
        research_stage: "question_discovery",
        subject_key: "subject-a",
        query: "a",
      },
    });
    expect(first.allowed).toBe(true);
    if (!first.allowed) {
      throw new Error("expected admitted request");
    }
    const firstSlot = Object.values(first.row.stages)[0];
    expect(first.row.requestIdentityDigest).toHaveLength(64);
    expect(firstSlot).toMatchObject({
      requestDigest: expect.any(String),
    });
    expect(firstSlot?.requestDigest).toHaveLength(64);
    const changed = await admission.reserve({
      ...identity,
      toolName: "x_posts",
      toolCallId: "call-2",
      params: {
        research_profile: "full_hybrid_per_subject_v2",
        research_stage: "topic_discovery",
        subject_key: "subject-b",
      },
    });
    expect(changed).toEqual({ allowed: false, code: "admission_subject_changed" });
  });

  it("consumes legacy request state into the unified row and fails closed on unknown old usage", async () => {
    const legacy = memoryStore<{ used: number; updatedAt: number }>();
    const legacyKey = createHash("sha256")
      .update(`${identity.sessionKey}\0question_research`)
      .digest("hex");
    await legacy.register(legacyKey, { used: 2, updatedAt: 500 });
    const admission = new XResearchAdmission({
      store: memoryStore(),
      legacyBudgetStore: legacy,
      now: () => 1_000,
      priceAuthority,
    });
    const activated = await admission.activateProduct({
      ...identity,
      researcherAgentId: "x-researcher",
    });
    expect(activated.allowed && activated.row).toMatchObject({
      direct: { requests: 2 },
      resourceOverrun: true,
      legacyMigration: { usedRequests: 2 },
    });
    expect(await legacy.lookup(legacyKey)).toBeUndefined();
    expect(
      await admission.reserve({
        ...identity,
        toolName: "x_posts",
        toolCallId: "blocked-after-migration",
        params: {
          research_profile: "full_hybrid_per_subject_v2",
          research_stage: "question_discovery",
          operation: "exact",
          id: "post-1",
        },
      }),
    ).toEqual({ allowed: false, code: "admission_legacy_budget_migrated_unknown" });
  });

  it("holds proof rows until root-ready provisioning and requires exact launch identity", async () => {
    const admission = new XResearchAdmission({
      store: memoryStore(),
      now: () => 1_000,
      priceAuthority,
    });
    const provision = await admission.provision({
      manifestDigest: "manifest-1",
      notBefore: 1_000,
      expiresAt: 86_401_000,
      priceAuthority,
      ...proofAuthority,
      rows: completeProofRows({
        ...identity,
        promptDigest: "5f8368d643022c015855422d0a88d1968b456809d58389653f8fc970701b8870",
        profile: "reduced_probe_v2",
        caseId: "H0-05",
        arm: "hybrid",
      }),
    });
    expect(provision).toEqual({ ok: true });
    const launched = await admission.launch({
      manifestDigest: "manifest-1",
      runId: identity.runId,
      message: "research",
      run: async (params) => {
        expect(params.provider).toBe(identity.modelProviderId);
        expect(params.model).toBe(identity.modelId);
        expect((await admission.activateProof(identity)).allowed).toBe(true);
        return { runId: params.idempotencyKey, sessionKey: params.sessionKey };
      },
    });
    expect(launched).toEqual({ ok: true });
    await expect(admission.store.lookup(`row:${identity.runId}`)).resolves.toMatchObject({
      state: "active",
      launchedAt: 1_000,
    });
  });

  it("rejects a late launch transition when the row terminalizes before run returns", async () => {
    let now = 1_000;
    const admission = new XResearchAdmission({
      store: memoryStore(),
      now: () => now,
      priceAuthority,
      schedule: () => 0,
    });
    await admission.provision({
      manifestDigest: "manifest-terminal-launch",
      notBefore: 1_000,
      expiresAt: 86_401_000,
      priceAuthority,
      ...proofAuthority,
      rows: completeProofRows({
        ...identity,
        promptDigest: "5f8368d643022c015855422d0a88d1968b456809d58389653f8fc970701b8870",
        profile: "reduced_probe_v2",
        caseId: "case-terminal-launch",
        arm: "hybrid",
      }),
    });

    const launched = await admission.launch({
      manifestDigest: "manifest-terminal-launch",
      runId: identity.runId,
      message: identity.prompt,
      run: async (params) => {
        expect((await admission.activateProof(identity)).allowed).toBe(true);
        await admission.terminal(identity);
        now = 6_000;
        await admission.closeout(identity.runId);
        return {
          runId: params.idempotencyKey,
          sessionKey: params.sessionKey,
          taskId: "late-task",
        };
      },
    });

    expect(launched).toEqual({ ok: false, code: "admission_row_terminal" });
    const terminal = (await admission.read("manifest-terminal-launch"))?.rows.find(
      (row) => row.runId === identity.runId,
    );
    expect(terminal).toMatchObject({ state: "terminal" });
    expect(terminal).not.toHaveProperty("launchedAt");
    expect(terminal).not.toHaveProperty("taskId");
  });

  it("retains proof intent in the ready root when an individual row is missing", async () => {
    const admission = new XResearchAdmission({
      store: memoryStore(),
      now: () => 1_000,
      priceAuthority,
    });
    await admission.provision({
      manifestDigest: "manifest-missing-row",
      notBefore: 1_000,
      expiresAt: 86_401_000,
      priceAuthority,
      ...proofAuthority,
      rows: completeProofRows({
        ...identity,
        promptDigest: "5f8368d643022c015855422d0a88d1968b456809d58389653f8fc970701b8870",
        profile: "reduced_probe_v2",
        caseId: "missing-row",
        arm: "hybrid",
      }),
    });
    await admission.store.delete(`row:${identity.runId}`);

    await expect(admission.isKnownProofRun(identity.runId)).resolves.toBe(true);
    await expect(admission.isKnownProofRun("ordinary-product-run")).resolves.toBe(false);
  });

  it("requires exact benchmark shapes and rejects mixed profiles and duplicate rows", async () => {
    const admission = new XResearchAdmission({
      store: memoryStore(),
      now: () => 1_000,
      priceAuthority,
    });
    const reduced = completeProofRows({
      ...identity,
      promptDigest: "5f8368d643022c015855422d0a88d1968b456809d58389653f8fc970701b8870",
      profile: "reduced_probe_v2",
      caseId: "case-a",
      arm: "hybrid",
    });
    const baseManifest = {
      notBefore: 1_000,
      expiresAt: 86_401_000,
      priceAuthority,
      ...proofAuthority,
    };
    await expect(
      admission.provision({
        ...baseManifest,
        manifestDigest: "manifest-approved-subset",
        rows: reduced.slice(0, 3),
      }),
    ).resolves.toEqual({ ok: false, code: "admission_provision_identity_invalid" });
    await expect(
      admission.provision({
        ...baseManifest,
        manifestDigest: "manifest-reduced",
        rows: reduced,
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      admission.provision({
        ...baseManifest,
        retentionUntil: baseManifest.retentionUntil + 1,
        manifestDigest: "manifest-wrong-retention",
        rows: reduced.map((row, index) => ({
          ...row,
          runId: `${row.runId}-retention-${index}`,
          sessionKey: `${row.sessionKey}-retention-${index}`,
        })),
      }),
    ).resolves.toEqual({ ok: false, code: "admission_provision_invalid" });
    await expect(
      admission.provision({
        ...baseManifest,
        manifestDigest: "manifest-mixed",
        rows: [{ ...reduced[0], profile: "full_hybrid_per_subject_v2" }, ...reduced.slice(1)],
      }),
    ).resolves.toEqual({ ok: false, code: "admission_provision_identity_invalid" });
    await expect(
      admission.provision({
        ...baseManifest,
        manifestDigest: "manifest-duplicate-case-arm",
        rows: [reduced[0], { ...reduced[1], caseId: reduced[0].caseId, arm: reduced[0].arm }],
      }),
    ).resolves.toEqual({ ok: false, code: "admission_provision_identity_invalid" });

    const fullIdentity = {
      ...identity,
      runId: "run-full",
      sessionKey: "agent:x:subagent:full",
      sessionId: "session-full",
    };
    await expect(
      admission.provision({
        ...baseManifest,
        manifestDigest: "manifest-full",
        rows: completeProofRows({
          ...fullIdentity,
          promptDigest: "5f8368d643022c015855422d0a88d1968b456809d58389653f8fc970701b8870",
          profile: "full_hybrid_per_subject_v2",
          caseId: "case-full-a",
          arm: "hybrid",
        }),
      }),
    ).resolves.toEqual({ ok: true });
    const fullRaw = (await admission.read("manifest-full"))?.rows.find(
      (row) => row.arm === "raw_x_only",
    );
    expect(fullRaw).toMatchObject({
      ceiling: {
        requests: 51,
        pages: 37,
        posts: 590,
        users: 40,
        counts: 10,
        media: 40,
        dollars: 3.4,
        acquisitionSeconds: 465,
      },
      stageCeilings: {
        question_discovery: { requests: 17, pages: 15, posts: 180, users: 40 },
        topic_discovery: { requests: 18, pages: 8, posts: 80, counts: 10 },
        influence_discovery: { requests: 9, pages: 8, posts: 110 },
        format_analysis: { requests: 7, pages: 6, posts: 220, media: 40 },
      },
    });
  });

  it("seals delayed reservations as consumed_unknown at one immutable terminal deadline", async () => {
    let now = 1_000;
    const scheduled: Array<() => void> = [];
    const admission = new XResearchAdmission({
      store: memoryStore(),
      now: () => now,
      priceAuthority,
      schedule: (fn) => {
        scheduled.push(fn);
        return 0;
      },
    });
    await admission.activateProduct({ ...identity, researcherAgentId: "x-researcher" });
    await admission.reserve({
      ...identity,
      toolName: "x_search",
      toolCallId: "call-1",
      params: {
        research_profile: "full_hybrid_per_subject_v2",
        research_stage: "question_discovery",
        query: "a",
      },
    });
    await admission.terminal({
      runId: identity.runId,
      sessionKey: identity.sessionKey,
      sessionId: identity.sessionId,
    });
    now = 6_000;
    scheduled.forEach((fn) => fn());
    const late = await admission.reserve({
      ...identity,
      toolName: "x_posts",
      toolCallId: "call-2",
      params: { research_profile: "full_hybrid_per_subject_v2", research_stage: "topic_discovery" },
    });
    expect(late).toEqual({ allowed: false, code: "admission_row_terminal" });
  });

  it("accepts native terminal identity without an optional session-id projection", async () => {
    const admission = new XResearchAdmission({
      store: memoryStore(),
      now: () => 1_000,
      priceAuthority,
      schedule: () => 0,
    });
    await admission.activateProduct({ ...identity, researcherAgentId: "x-researcher" });

    await admission.terminal({
      runId: identity.runId,
      sessionKey: identity.sessionKey,
      outcome: "ok",
    });

    await expect(admission.store.lookup(`row:${identity.runId}`)).resolves.toMatchObject({
      terminalAnchorAt: 1_000,
      closeoutDueAt: 6_000,
      terminalOutcome: "ok",
    });
  });

  it("reschedules only a persisted immutable closeout deadline", async () => {
    const scheduled: Array<() => void> = [];
    const store = memoryStore() as ConstructorParameters<typeof XResearchAdmission>[0]["store"];
    const admission = new XResearchAdmission({
      store,
      now: () => 1_000,
      priceAuthority,
      schedule: () => 0,
    });
    await admission.activateProduct({ ...identity, researcherAgentId: "x-researcher" });
    await admission.terminal({
      runId: identity.runId,
      sessionKey: identity.sessionKey,
      sessionId: identity.sessionId,
    });

    const recovered = new XResearchAdmission({
      store,
      now: () => 1_000,
      priceAuthority,
      schedule: (fn) => {
        scheduled.push(fn);
        return 0;
      },
    });
    await recovered.recover();

    expect(scheduled).toHaveLength(1);
    await expect(recovered.store.lookup(`row:${identity.runId}`)).resolves.toMatchObject({
      terminalAnchorAt: 1_000,
      closeoutDueAt: 6_000,
    });
  });

  it("leaves active runs to native subagent completion recovery", async () => {
    const scheduled: Array<() => void> = [];
    const admission = new XResearchAdmission({
      store: memoryStore(),
      now: () => 1_000,
      priceAuthority,
      schedule: (fn) => {
        scheduled.push(fn);
        return 0;
      },
    });
    await admission.activateProduct({ ...identity, researcherAgentId: "x-researcher" });

    await admission.recover();

    expect(scheduled).toHaveLength(0);
  });

  it("uses native run readback to recover a missed terminal event", async () => {
    let now = 1_000;
    const scheduled: Array<{ fn: () => void; delayMs: number }> = [];
    const admission = new XResearchAdmission({
      store: memoryStore(),
      now: () => now,
      priceAuthority,
      waitForRun: async ({ runId, timeoutMs }) => {
        expect(runId).toBe(identity.runId);
        expect(timeoutMs).toBe(0);
        return { status: "ok" };
      },
      schedule: (fn, delayMs) => {
        scheduled.push({ fn, delayMs });
        return 0;
      },
    });
    await admission.activateProduct({ ...identity, researcherAgentId: "x-researcher" });

    await admission.recover();

    await expect(admission.store.lookup(`row:${identity.runId}`)).resolves.toMatchObject({
      terminalAnchorAt: 1_000,
      closeoutDueAt: 6_000,
      terminalOutcome: "ok",
    });
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.delayMs).toBe(5_000);
    now = 6_000;
    scheduled[0]?.fn();
  });

  it("rejects settlement after the immutable terminal deadline", async () => {
    let now = 1_000;
    const admission = new XResearchAdmission({
      store: memoryStore(),
      now: () => now,
      priceAuthority,
      schedule: () => 0,
    });
    await admission.activateProduct({ ...identity, researcherAgentId: "x-researcher" });
    await admission.reserve({
      ...identity,
      toolName: "x_search",
      toolCallId: "late-settlement",
      params: {
        query: "bounded discovery",
        subject_key: "subject-a",
        research_profile: "full_hybrid_per_subject_v2",
        research_stage: "question_discovery",
      },
    });
    await admission.terminal({ runId: identity.runId, sessionKey: identity.sessionKey });
    now = 6_000;

    await expect(
      admission.settle({
        runId: identity.runId,
        toolCallId: "late-settlement",
        toolName: "x_search",
        params: {
          research_profile: "full_hybrid_per_subject_v2",
          research_stage: "question_discovery",
        },
        result: { status: "complete" },
      }),
    ).resolves.toEqual({ rejected: "admission_closeout_deadline_elapsed" });
  });

  it("fails closeout when the immediate durable reread is not digest-equal", async () => {
    let now = 1_000;
    let corruptTerminalRead = false;
    const baseStore = memoryStore<Record<string, unknown>>();
    const store = {
      ...baseStore,
      async lookup(key: string) {
        const value = await baseStore.lookup(key);
        if (corruptTerminalRead && value?.state === "closing") {
          return { ...value, terminalDigest: "mismatched-terminal-digest" };
        }
        return value;
      },
    };
    const admission = new XResearchAdmission({
      store: store as never,
      now: () => now,
      priceAuthority,
      schedule: () => 0,
    });
    await admission.activateProduct({ ...identity, researcherAgentId: "x-researcher" });
    await admission.terminal({ runId: identity.runId, sessionKey: identity.sessionKey });
    now = 6_000;
    corruptTerminalRead = true;

    await expect(admission.closeout(identity.runId)).rejects.toThrow(
      "admission_closeout_reread_mismatch",
    );
  });

  it("reports a scheduled closeout reread failure without an unhandled rejection", async () => {
    let now = 1_000;
    let corruptTerminalRead = false;
    const scheduled: Array<() => void> = [];
    const errors: unknown[] = [];
    const baseStore = memoryStore<Record<string, unknown>>();
    const store = {
      ...baseStore,
      async lookup(key: string) {
        const value = await baseStore.lookup(key);
        return corruptTerminalRead && value?.state === "closing"
          ? { ...value, terminalDigest: "mismatched-terminal-digest" }
          : value;
      },
    };
    const admission = new XResearchAdmission({
      store: store as never,
      now: () => now,
      priceAuthority,
      schedule: (fn) => {
        scheduled.push(fn);
        return 0;
      },
      onCloseoutError: (error) => errors.push(error),
    });
    await admission.activateProduct({ ...identity, researcherAgentId: "x-researcher" });
    await admission.terminal({ runId: identity.runId, sessionKey: identity.sessionKey });
    now = 6_000;
    corruptTerminalRead = true;

    scheduled[0]?.();
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    expect(errors).toEqual([
      expect.objectContaining({ message: "admission_closeout_reread_mismatch" }),
    ]);
  });

  it("rejects model-authored cache policy before trusted hook injection", async () => {
    const admission = new XResearchAdmission({
      store: memoryStore(),
      now: () => 1_000,
      priceAuthority,
    });
    await admission.activateProduct({ ...identity, researcherAgentId: "x-researcher" });

    await expect(
      admission.reserve({
        ...identity,
        toolName: "x_search",
        toolCallId: "model-cache-control",
        params: {
          research_profile: "full_hybrid_per_subject_v2",
          research_stage: "question_discovery",
          query: "bounded discovery",
          research_cache_control: { mode: "bypass" },
        },
      }),
    ).resolves.toEqual({
      allowed: false,
      code: "admission_cache_control_not_model_authorized",
    });
  });

  it("allows distinct direct-X request identities in one stage and rejects cross-settlement", async () => {
    const admission = new XResearchAdmission({
      store: memoryStore(),
      now: () => 1_000,
      priceAuthority,
    });
    await admission.activateProduct({ ...identity, researcherAgentId: "x-researcher" });
    const params = {
      research_profile: "full_hybrid_per_subject_v2",
      research_stage: "topic_discovery",
      operation: "exact",
      id: "post-1",
    };
    expect(
      (await admission.reserve({ ...identity, toolName: "x_posts", toolCallId: "one", params }))
        .allowed,
    ).toBe(true);
    expect(
      (
        await admission.reserve({
          ...identity,
          toolName: "x_posts",
          toolCallId: "two",
          params: { ...params, id: "post-2" },
        })
      ).allowed,
    ).toBe(true);
    expect(
      await admission.reserve({ ...identity, toolName: "x_posts", toolCallId: "retry", params }),
    ).toMatchObject({ allowed: false, code: "admission_idempotent_receipt" });
    expect(
      await admission.settle({
        runId: identity.runId,
        toolName: "x_posts",
        toolCallId: "wrong",
        params,
      }),
    ).toEqual({ rejected: "admission_settlement_mismatch" });
  });

  it("blocks a successor while any predecessor request is unsettled", async () => {
    const admission = new XResearchAdmission({
      store: memoryStore(),
      now: () => 1_000,
      priceAuthority,
    });
    await admission.activateProduct({ ...identity, researcherAgentId: "x-researcher" });
    const discovery = {
      research_profile: "full_hybrid_per_subject_v2",
      research_stage: "question_discovery",
      query: "a",
    };
    expect(
      (
        await admission.reserve({
          ...identity,
          toolName: "x_search",
          toolCallId: "grok",
          params: discovery,
        })
      ).allowed,
    ).toBe(true);
    expect(
      (
        await admission.reserve({
          ...identity,
          toolName: "x_posts",
          toolCallId: "post",
          params: { ...discovery, operation: "exact", id: "1" },
        })
      ).allowed,
    ).toBe(true);
    await admission.settle({
      runId: identity.runId,
      toolName: "x_search",
      toolCallId: "grok",
      params: discovery,
      result: { status: "complete" },
    });
    expect(
      await admission.reserve({
        ...identity,
        toolName: "x_search",
        toolCallId: "analysis",
        params: {
          research_profile: "full_hybrid_per_subject_v2",
          research_stage: "question_verified_analysis",
          query: "verified",
        },
      }),
    ).toEqual({ allowed: false, code: "stage_settlement_pending" });
  });

  it("reserves serialized bytes and blocks later calls after an observed byte overrun", async () => {
    const admission = new XResearchAdmission({
      store: memoryStore(),
      now: () => 1_000,
      priceAuthority,
    });
    await admission.activateProduct({ ...identity, researcherAgentId: "x-researcher" });
    const params = {
      research_profile: "full_hybrid_per_subject_v2",
      research_stage: "topic_discovery",
      operation: "exact",
      id: "post-1",
    };
    const reserved = await admission.reserve({
      ...identity,
      toolName: "x_posts",
      toolCallId: "byte-overrun",
      params,
    });
    expect(reserved.allowed && reserved.row.direct.bytes).toBe(36_864);
    await admission.settle({
      runId: identity.runId,
      toolName: "x_posts",
      toolCallId: "byte-overrun",
      params,
      result: {
        status: "complete",
        resources: {
          requests: 1,
          pages: 0,
          posts: 1,
          users: 0,
          counts: 0,
          media: 0,
          serialized_bytes: 36_865,
        },
      },
    });

    await expect(
      admission.reserve({
        ...identity,
        toolName: "x_posts",
        toolCallId: "after-byte-overrun",
        params: { ...params, id: "post-2" },
      }),
    ).resolves.toEqual({ allowed: false, code: "admission_inner_overrun" });
  });

  it("enforces observed stage wall time rather than only reserving a nominal ceiling", async () => {
    let now = 1_000;
    const admission = new XResearchAdmission({
      store: memoryStore(),
      now: () => now,
      priceAuthority,
    });
    await admission.activateProduct({ ...identity, researcherAgentId: "x-researcher" });
    const params = {
      research_profile: "full_hybrid_per_subject_v2",
      research_stage: "question_discovery",
      operation: "exact",
      id: "post-1",
    };
    await admission.reserve({
      ...identity,
      toolName: "x_posts",
      toolCallId: "slow-stage",
      params,
    });
    now += 85_001;

    await admission.settle({
      runId: identity.runId,
      toolName: "x_posts",
      toolCallId: "slow-stage",
      params,
      result: { status: "complete", resources: { duration_ms: 85_001 } },
    });

    const row = await admission.store.lookup(`row:${identity.runId}`);
    expect(row?.kind === "row" ? row.resourceOverrun : undefined).toBe(true);
    expect(row?.kind === "row" ? Object.values(row.stages)[0]?.state : undefined).toBe("error");
  });

  it("reserves all three owned-metrics requests and the verified account identity", async () => {
    const admission = new XResearchAdmission({
      store: memoryStore(),
      now: () => 1_000,
      priceAuthority,
    });
    await admission.activateProduct({ ...identity, researcherAgentId: "x-researcher" });
    const result = await admission.reserve({
      ...identity,
      toolName: "x_metrics",
      toolCallId: "owned-metrics",
      params: {
        research_profile: "full_hybrid_per_subject_v2",
        research_stage: "question_discovery",
        operation: "owned",
        post_ids: ["owned-1", "owned-2"],
      },
    });

    expect(result.allowed && result.row.direct).toEqual({
      requests: 3,
      pages: 0,
      posts: 2,
      users: 1,
      counts: 0,
      media: 0,
      bytes: 94_208,
      dollars: 0.02,
      acquisitionSeconds: 85,
    });
  });

  it("marks partial analytics payloads failed and never unlocks a dependent stage", async () => {
    const admission = new XResearchAdmission({
      store: memoryStore(),
      now: () => 1_000,
      priceAuthority,
    });
    await admission.activateProduct({ ...identity, researcherAgentId: "x-researcher" });
    const discovery = {
      research_profile: "full_hybrid_per_subject_v2",
      research_stage: "question_discovery",
      operation: "exact",
      id: "post-1",
    };
    expect(
      (
        await admission.reserve({
          ...identity,
          toolName: "x_posts",
          toolCallId: "failed-direct",
          params: discovery,
        })
      ).allowed,
    ).toBe(true);
    await admission.settle({
      runId: identity.runId,
      toolName: "x_posts",
      toolCallId: "failed-direct",
      params: discovery,
      result: { status: "partial", analytics: { status: "failed" } },
    });
    await expect(
      admission.reserve({
        ...identity,
        toolName: "x_search",
        toolCallId: "must-not-run",
        params: {
          research_profile: "full_hybrid_per_subject_v2",
          research_stage: "question_verified_analysis",
          query: "verified",
        },
      }),
    ).resolves.toEqual({ allowed: false, code: "stage_predecessor_failed" });
  });

  it("redacts provider secrets before persisting settlement errors", async () => {
    const admission = new XResearchAdmission({
      store: memoryStore(),
      now: () => 1_000,
      priceAuthority,
    });
    await admission.activateProduct({ ...identity, researcherAgentId: "x-researcher" });
    const params = {
      research_profile: "full_hybrid_per_subject_v2",
      research_stage: "topic_discovery",
      operation: "exact",
      id: "post-1",
    };
    await admission.reserve({
      ...identity,
      toolName: "x_posts",
      toolCallId: "provider-secret",
      params,
    });
    const secret = "sk-provider-secret-value-that-must-not-persist";
    await admission.settle({
      runId: identity.runId,
      toolName: "x_posts",
      toolCallId: "provider-secret",
      params,
      error: `Authorization: Bearer ${secret}`,
    });

    const persisted = await admission.store.lookup(`row:${identity.runId}`);
    const serialized = JSON.stringify(persisted);
    expect(serialized).not.toContain(secret);
    expect(serialized).toContain("Authorization: Bearer");
    expect(serialized).not.toContain(`Authorization: Bearer ${secret}`);
  });

  it("reserves the exact three-call $1.45 reduced Grok envelope", async () => {
    const admission = new XResearchAdmission({
      store: memoryStore(),
      now: () => 1_000,
      priceAuthority,
    });
    await admission.provision({
      manifestDigest: "manifest-reduced",
      notBefore: 1_000,
      expiresAt: 86_401_000,
      priceAuthority,
      ...proofAuthority,
      rows: completeProofRows({
        ...identity,
        promptDigest: "5f8368d643022c015855422d0a88d1968b456809d58389653f8fc970701b8870",
        profile: "reduced_probe_v2",
        caseId: "H0-05",
        arm: "hybrid",
      }),
    });
    expect((await admission.activateProof(identity)).allowed).toBe(true);
    let latest;
    for (const [index, stage] of [
      "question_discovery",
      "topic_discovery",
      "influence_discovery",
    ].entries()) {
      const params = { research_profile: "reduced_probe_v2", research_stage: stage, query: stage };
      latest = await admission.reserve({
        ...identity,
        toolName: "x_search",
        toolCallId: `grok-${index}`,
        params,
      });
      expect(latest.allowed).toBe(true);
      await admission.settle({
        runId: identity.runId,
        toolName: "x_search",
        toolCallId: `grok-${index}`,
        params,
        result: { status: "complete" },
      });
    }
    expect(latest?.allowed && latest.row.grok).toEqual({ calls: 3, dollars: 1.45 });
    expect(latest?.allowed && latest.row.direct.acquisitionSeconds).toBe(230);
  });

  it("reserves the exact reduced hybrid direct-X envelope with endpoint-valid calls", async () => {
    const admission = new XResearchAdmission({
      store: memoryStore(),
      now: () => 1_000,
      priceAuthority,
    });
    await admission.provision({
      manifestDigest: "manifest-reduced-direct",
      notBefore: 1_000,
      expiresAt: 86_401_000,
      priceAuthority,
      ...proofAuthority,
      rows: completeProofRows({
        ...identity,
        promptDigest: "5f8368d643022c015855422d0a88d1968b456809d58389653f8fc970701b8870",
        profile: "reduced_probe_v2",
        caseId: "H0-05",
        arm: "hybrid",
      }),
    });
    expect((await admission.activateProof(identity)).allowed).toBe(true);
    let call = 0;
    let latest;
    const reserve = async (stage: string, toolName: string, params: Record<string, unknown>) => {
      const toolCallId = `direct-${call++}`;
      const request = {
        research_profile: "reduced_probe_v2",
        research_stage: stage,
        ...params,
      };
      latest = await admission.reserve({ ...identity, toolName, toolCallId, params: request });
      expect(latest.allowed).toBe(true);
      await admission.settle({
        runId: identity.runId,
        toolName,
        toolCallId,
        params: request,
        result: { status: "complete" },
      });
    };

    await reserve("question_discovery", "x_posts", {
      operation: "batch",
      ids: ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"],
    });
    await reserve("question_discovery", "x_posts", {
      operation: "batch",
      ids: ["q9", "q10", "q11", "q12", "q13", "q14", "q15", "q16"],
    });
    await reserve("question_discovery", "x_posts", { operation: "recent", max_results: 10 });
    await reserve("question_discovery", "x_users", {
      operation: "identity",
      ids: Array.from({ length: 8 }, (_, index) => `qu${index}`),
    });
    await reserve("question_discovery", "x_counts", { operation: "recent", query: "q" });
    await reserve("topic_discovery", "x_posts", {
      operation: "batch",
      ids: Array.from({ length: 8 }, (_, index) => `t${index}`),
    });
    await reserve("topic_discovery", "x_users", {
      operation: "identity",
      ids: Array.from({ length: 8 }, (_, index) => `tu${index}`),
    });
    for (let index = 0; index < 4; index += 1) {
      await reserve("topic_discovery", "x_counts", { operation: "recent", query: `t${index}` });
    }
    for (let index = 0; index < 6; index += 1) {
      await reserve("influence_discovery", "x_timelines", {
        operation: "authored",
        max_results: 5,
        pagination_token: `influence-${index}`,
      });
    }
    await reserve("influence_discovery", "x_posts", {
      operation: "batch",
      ids: Array.from({ length: 12 }, (_, index) => `i${index}`),
    });
    await reserve("influence_discovery", "x_users", {
      operation: "identity",
      ids: Array.from({ length: 12 }, (_, index) => `iu${index}`),
    });

    const row = await admission.store.lookup(`row:${identity.runId}`);
    expect(row?.kind === "row" ? row.direct : undefined).toEqual({
      requests: 19,
      pages: 7,
      posts: 76,
      users: 28,
      counts: 5,
      media: 0,
      bytes: 3_354_624,
      dollars: 0.685,
      acquisitionSeconds: 230,
    });
  });

  it("reserves the exact reduced raw-X envelope without Grok leakage", async () => {
    const rawIdentity = {
      ...identity,
      runId: "run-raw",
      sessionKey: "agent:x:subagent:raw",
      sessionId: "session-raw",
    };
    const admission = new XResearchAdmission({
      store: memoryStore(),
      now: () => 1_000,
      priceAuthority,
    });
    await admission.provision({
      manifestDigest: "manifest-reduced-raw",
      notBefore: 1_000,
      expiresAt: 86_401_000,
      priceAuthority,
      ...proofAuthority,
      rows: completeProofRows({
        ...rawIdentity,
        promptDigest: "5f8368d643022c015855422d0a88d1968b456809d58389653f8fc970701b8870",
        profile: "reduced_probe_v2",
        caseId: "H0-06",
        arm: "raw_x_only",
      }),
    });
    expect((await admission.activateProof(rawIdentity)).allowed).toBe(true);
    let call = 0;
    let latest;
    const reserve = async (
      stage: "question_discovery" | "topic_discovery" | "influence_discovery",
      toolName: string,
      params: Record<string, unknown>,
    ) => {
      latest = await admission.reserve({
        ...rawIdentity,
        toolName,
        toolCallId: `raw-${call++}`,
        params: {
          research_profile: "reduced_probe_v2",
          research_stage: stage,
          ...params,
        },
      });
      expect(latest.allowed).toBe(true);
    };
    for (let index = 0; index < 3; index += 1) {
      await reserve("question_discovery", "x_posts", {
        operation: "recent",
        query: `question-${index}`,
        max_results: 10,
      });
    }
    await reserve("question_discovery", "x_posts", {
      operation: "batch",
      ids: Array.from({ length: 8 }, (_, index) => `rp${index}`),
    });
    await reserve("question_discovery", "x_users", {
      operation: "identity",
      ids: Array.from({ length: 12 }, (_, index) => `ru${index}`),
    });
    await reserve("question_discovery", "x_posts", {
      operation: "recent",
      query: "question-context",
      max_results: 10,
    });
    await reserve("topic_discovery", "x_posts", {
      operation: "recent",
      query: "topic-expansion",
      max_results: 10,
    });
    for (let index = 0; index < 4; index += 1) {
      await reserve("topic_discovery", "x_counts", {
        operation: "recent",
        query: `r${index}`,
      });
    }
    for (let index = 0; index < 3; index += 1) {
      await reserve("influence_discovery", "x_timelines", {
        operation: "authored",
        max_results: 5,
        pagination_token: `raw-${index}`,
      });
    }
    const row = await admission.store.lookup(`row:${rawIdentity.runId}`);
    expect(row?.kind === "row" ? row.grok : undefined).toEqual({ calls: 0, dollars: 0 });
    expect(row?.kind === "row" ? row.direct : undefined).toEqual({
      requests: 14,
      pages: 8,
      posts: 73,
      users: 12,
      counts: 4,
      media: 0,
      bytes: 2_908_160,
      dollars: 0.505,
      acquisitionSeconds: 120,
    });
  });

  it("leaves a changed proof manifest held and refuses byte-different reprovisioning", async () => {
    const admission = new XResearchAdmission({
      store: memoryStore(),
      now: () => 1_000,
      priceAuthority,
    });
    const manifest = {
      manifestDigest: "manifest-1",
      notBefore: 1_000,
      expiresAt: 86_401_000,
      priceAuthority,
      ...proofAuthority,
      rows: completeProofRows({
        ...identity,
        promptDigest: "5f8368d643022c015855422d0a88d1968b456809d58389653f8fc970701b8870",
        profile: "reduced_probe_v2" as const,
        caseId: "H0-05",
        arm: "hybrid" as const,
      }),
    };
    expect(await admission.provision(manifest)).toEqual({ ok: true });
    expect(
      await admission.provision({
        ...manifest,
        rows: manifest.rows.map((row, index) =>
          index === 0 ? Object.assign({}, row, { modelId: "changed" }) : row,
        ),
      }),
    ).toEqual({ ok: false, code: "admission_provision_changed" });
  });

  it("verifies serialized manifest bytes before provisioning and returns root plus rows", async () => {
    const admission = new XResearchAdmission({
      store: memoryStore(),
      now: () => 1_000,
      priceAuthority,
    });
    const manifestJson = JSON.stringify({
      notBefore: 1_000,
      expiresAt: 86_401_000,
      priceAuthority,
      ...proofAuthority,
      rows: completeProofRows({
        ...identity,
        promptDigest: "5f8368d643022c015855422d0a88d1968b456809d58389653f8fc970701b8870",
        profile: "reduced_probe_v2",
        caseId: "H0-05",
        arm: "raw_x_only",
      }),
    });
    const manifestDigest = createHash("sha256").update(manifestJson).digest("hex");
    expect(await admission.provisionSerialized(manifestJson, manifestDigest)).toEqual({ ok: true });
    const readback = await admission.read(manifestDigest);
    expect(readback).toMatchObject({
      root: { manifestDigest, commitState: "ready", rows: 4 },
    });
    expect(readback?.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runId: identity.runId,
          arm: "raw_x_only",
          state: "held",
        }),
      ]),
    );
    expect(await admission.provisionSerialized(`${manifestJson} `, manifestDigest)).toEqual({
      ok: false,
      code: "admission_manifest_digest_mismatch",
    });
  });
});
