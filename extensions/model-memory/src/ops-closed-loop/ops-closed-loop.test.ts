import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listFutureMechanicalFixes, resolveMemoryOpsConfig } from "./config.ts";
import {
  discoverMemoryOpsHooksFromRepo,
  mergeProductionHookProbeEvidence,
  runSafeHookFiringCanaries,
  summarizeHookDiscovery,
  writeHookDiscoveryArtifact,
} from "./hook-discovery.ts";
import { JsonlMemoryOpsSink, readJsonlFile } from "./jsonl-sink.ts";
import {
  buildConflictAndSupersessionObservationSignals,
  buildContextRunLedgerSignals,
  buildInjectionObservationSignals,
  buildRetrievalObservationSignals,
} from "./observers.ts";
import { recordProductionHookProbe } from "./production-hook-probe.ts";
import {
  buildHookHealthRecommendations,
  buildRecommendationsFromSignals,
} from "./recommendations.ts";
import { generateMemoryOpsHealthReport, writeMemoryOpsHealthReport } from "./report.ts";
import { buildSafeLevel1AutoFixPlan, executeSafeLevel1AutoFixPlan } from "./safe-level1-autofix.ts";
import {
  createMemoryOpsSignal,
  prepareSignalForPersistence,
  validateMemoryOpsSignal,
} from "./signals.ts";
import type { MemoryOpsSignal } from "./types.ts";

const NOW = "2026-04-21T12:00:00.000Z";

function validSignal(overrides: Partial<MemoryOpsSignal> = {}): MemoryOpsSignal {
  return createMemoryOpsSignal({
    signal_id: "signal-001",
    signal_type: "memory_injection_observed",
    observed_at: NOW,
    severity: "warning",
    consumers: ["retrieval_quality", "conflict_resolution", "cron_recommendation"],
    payload: {
      injected_memory_statuses: [{ memory_id: "memory-001", status: "superseded" }],
    },
    retention: { policy: "bounded_audit", ttl_seconds: 60 },
    privacy: {
      contains_raw_text: false,
      contains_user_content: false,
      contains_prompt_content: false,
      contains_secret: false,
      redacted: false,
    },
    usage_contract: {
      used_by: ["retrieval_quality", "conflict_resolution", "cron_recommendation"],
      action: "Detect stale or conflicted memory injection.",
    },
    ...overrides,
  });
}

describe("memory ops closed loop", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "memory-ops-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("drops signals that violate no-dark-data validation", () => {
    expect(
      validateMemoryOpsSignal(
        validSignal({
          consumers: [],
        }),
      ),
    ).toEqual({
      ok: false,
      reason: "memory ops signal requires at least one consumer",
    });

    expect(
      validateMemoryOpsSignal(
        validSignal({
          usage_contract: {
            used_by: ["retrieval_quality"],
            action: "",
          },
        }),
      ),
    ).toEqual({
      ok: false,
      reason: "memory ops signal requires a usage action",
    });

    expect(
      validateMemoryOpsSignal(
        validSignal({
          usage_contract: {
            used_by: ["dedupe"],
            action: "Invalid consumer mismatch.",
          },
        }),
      ),
    ).toEqual({
      ok: false,
      reason: "memory ops usage consumers must be a subset of signal consumers",
    });
  });

  it("redacts raw prompt/transcript/tool-log payload fields before persistence", async () => {
    const signal = validSignal({
      payload: {
        prompt: "full prompt must not persist",
        transcript: "full transcript must not persist",
        raw_tool_log: "tool log must not persist",
        prompt_sha256: "safe-hash",
      },
    });
    const prepared = prepareSignalForPersistence(signal);
    expect(prepared.validation).toEqual({ ok: true });
    expect(JSON.stringify(prepared.signal)).not.toContain("full prompt must not persist");
    expect(JSON.stringify(prepared.signal)).not.toContain("full transcript must not persist");
    expect(JSON.stringify(prepared.signal)).not.toContain("tool log must not persist");
    expect(prepared.signal?.payload.prompt_sha256).toBe("safe-hash");

    const sink = new JsonlMemoryOpsSink({ baseDir: tempDir });
    const result = await sink.appendSignal(signal);
    expect(result.persisted).toBe(true);
    const rows = await readJsonlFile<MemoryOpsSignal>(
      path.join(tempDir, "signals", "2026-04-21.jsonl"),
    );
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toContain("full prompt must not persist");
  });

  it("writes valid JSONL signal rows and recommendations", async () => {
    const sink = new JsonlMemoryOpsSink({ baseDir: tempDir });
    const signal = validSignal();
    await expect(sink.appendSignal(signal)).resolves.toMatchObject({ persisted: true });
    const recommendations = buildRecommendationsFromSignals({ signals: [signal], nowIso: NOW });
    expect(recommendations).toHaveLength(1);
    await sink.appendRecommendation(recommendations[0]);

    const signalRows = await readJsonlFile<MemoryOpsSignal>(
      path.join(tempDir, "signals", "2026-04-21.jsonl"),
    );
    const recommendationRows = await readJsonlFile(
      path.join(tempDir, "recommendations", "2026-04-21.jsonl"),
    );
    expect(signalRows).toHaveLength(1);
    expect(recommendationRows).toHaveLength(1);
  });

  it("creates recommendation rules for superseded, conflicted, duplicate, and hook-health findings", async () => {
    const injection = validSignal({
      payload: {
        injected_memory_statuses: [
          { memory_id: "memory-sup", status: "superseded" },
          { memory_id: "memory-conflict", status: "conflicted", conflict_marked: false },
        ],
      },
    });
    const duplicate = validSignal({
      signal_id: "signal-duplicate",
      signal_type: "duplicate_hash_observed",
      consumers: ["dedupe", "reconciliation", "cron_recommendation"],
      payload: { hash: "hash-001", duplicate_count: 2 },
      usage_contract: {
        used_by: ["dedupe", "reconciliation", "cron_recommendation"],
        action: "Detect duplicate hashes.",
      },
    });
    const recommendations = buildRecommendationsFromSignals({
      signals: [injection, duplicate],
      nowIso: NOW,
    });
    expect(recommendations.map((entry) => entry.category).toSorted()).toEqual([
      "bad_injection",
      "dedupe_failure",
      "superseded_memory_injected",
    ]);
    expect(recommendations.every((entry) => !entry.auto_fix_enabled)).toBe(true);

    const hookRecommendations = buildHookHealthRecommendations({
      discovery: {
        schema_version: "memory_ops_hook_discovery.v1",
        created_at: NOW,
        repo_root: tempDir,
        git_head: "head",
        targets: [
          {
            hook_name: "missing_hook",
            registration_surface_exists: false,
            registration_succeeded: false,
            fired: false,
            observed_payload_keys: [],
            status: "blocked",
            source_files: [],
            notes: [],
          },
        ],
      },
      nowIso: NOW,
    });
    expect(hookRecommendations).toHaveLength(1);
    expect(hookRecommendations[0]?.category).toBe("hook_health");
  });

  it("does not report clean fixture-safe retrieval observations as live hygiene defects", () => {
    const cleanInjection = validSignal({
      signal_id: "signal-clean-injection",
      severity: "info",
      related_memory_ids: ["memory-active"],
      payload: {
        injected_memory_statuses: [{ memory_id: "memory-active", status: "active" }],
      },
    });
    const cleanDuplicate = validSignal({
      signal_id: "signal-clean-duplicate",
      signal_type: "duplicate_hash_observed",
      severity: "info",
      consumers: ["dedupe", "reconciliation", "cron_recommendation"],
      payload: { hash: "hash-clean", duplicate_count: 0, admitted_count: 1 },
      usage_contract: {
        used_by: ["dedupe", "reconciliation", "cron_recommendation"],
        action: "Detect duplicate hashes.",
      },
    });

    expect(
      buildRecommendationsFromSignals({
        signals: [cleanInjection, cleanDuplicate],
        nowIso: NOW,
      }),
    ).toHaveLength(0);
  });

  it("generates markdown report and latest copy without private content", async () => {
    const signal = validSignal();
    const recommendations = buildRecommendationsFromSignals({ signals: [signal], nowIso: NOW });
    const markdown = generateMemoryOpsHealthReport({
      signals: [signal],
      recommendations,
      generatedAt: NOW,
    });
    expect(markdown).toContain("# Memory Ops Health Report");
    expect(markdown).toContain("## Action-required Issues");
    expect(markdown).not.toContain("full prompt");

    const written = await writeMemoryOpsHealthReport({
      signals: [signal],
      recommendations,
      generatedAt: NOW,
      config: { baseDir: tempDir },
    });
    expect(await readFile(written.reportPath, "utf8")).toBe(markdown);
    expect(await readFile(written.latestPath, "utf8")).toBe(markdown);
  });

  it("keeps auto-fix disabled even when overrides ask for it", () => {
    const config = resolveMemoryOpsConfig({
      autoFix: {
        enabled: true as false,
        excludeSupersededFromInjection: true as false,
        excludeConflictedUnlessMarked: true as false,
        regenerateReports: true as false,
        retryFailedBatchFlush: true as false,
      },
    });
    expect(config.autoFix.enabled).toBe(false);
    expect(config.safeLevel1AutoFix.enabled).toBe(true);
    expect(listFutureMechanicalFixes().every((entry) => !entry.enabled)).toBe(true);
  });

  it("builds only safe Level 1 auto-fix actions and never semantic truth mutations", () => {
    const plan = buildSafeLevel1AutoFixPlan({
      captureJobs: [
        { jobId: "job-timeout", status: "failed", failureClass: "timeout" },
        { jobId: "job-privacy", status: "failed", failureClass: "privacy_no_store" },
      ],
      runtimeDirtyStates: [{ dirtyId: "dirty-1", status: "dirty" }],
      projections: [
        {
          projectionId: "projection-stale",
          freshnessStatus: "stale",
          staleMarkers: ["source_hash_changed"],
          hashValid: true,
          activeSourceMemoryIdsValid: true,
        },
        {
          projectionId: "projection-invalid",
          freshnessStatus: "fresh",
          hashValid: false,
          activeSourceMemoryIdsValid: true,
        },
      ],
      providerRoutes: [
        {
          routeId: "openrouter/openai/gpt-5.4-nano",
          failoverSafe: true,
          schemaSuccessRate: 0.5,
        },
      ],
      runtimeStateJsonlPaths: [".openclaw/model-memory/capture-jobs/events.jsonl"],
      semanticTruthTouchRequested: [
        { ticketId: "approval-1", reason: "would touch semantic truth" },
      ],
    });

    expect(plan.actions.map((entry) => entry.action_kind)).toEqual(
      expect.arrayContaining([
        "retry_failed_capture_job",
        "mark_runtime_dirty_and_schedule_rebuild",
        "rebuild_stale_projection_artifact",
        "quarantine_invalid_projection_artifact",
        "rotate_runtime_state_jsonl",
        "refresh_provider_scorecard",
        "disable_failover_safe_model_route",
        "operator_approval_ticket",
      ]),
    );
    expect(plan.actions.find((entry) => entry.target_id === "job-privacy")).toBeUndefined();
    expect(plan.actions.every((entry) => entry.safe_to_apply_without_semantic_truth_mutation)).toBe(
      true,
    );
    expect(plan.forbidden_semantic_truth_actions).toEqual(
      expect.arrayContaining(["auto_delete_memory", "semantic_candidate_auto_repair"]),
    );
    expect(JSON.stringify(plan)).not.toContain("full prompt");
    expect(plan.actions.every((entry) => !entry.contains_transcript)).toBe(true);
  });

  it("executes safe Level 1 auto-fixes against operational artifacts without semantic truth mutation", async () => {
    const jsonlPath = path.join(tempDir, "model-memory/capture-jobs/events.jsonl");
    await mkdir(path.dirname(jsonlPath), { recursive: true });
    await writeFile(jsonlPath, '{"event":"safe"}\n', "utf8");
    const plan = buildSafeLevel1AutoFixPlan({
      captureJobs: [{ jobId: "job-timeout", status: "failed", failureClass: "timeout" }],
      runtimeDirtyStates: [{ dirtyId: "dirty-1", status: "dirty" }],
      projections: [
        {
          projectionId: "projection-stale",
          freshnessStatus: "stale",
          staleMarkers: ["source_hash_changed"],
          hashValid: true,
          activeSourceMemoryIdsValid: true,
        },
        {
          projectionId: "projection-invalid",
          freshnessStatus: "fresh",
          hashValid: false,
          activeSourceMemoryIdsValid: true,
        },
      ],
      providerRoutes: [
        {
          routeId: "openrouter/openai/gpt-5.4-nano",
          failoverSafe: true,
          schemaSuccessRate: 0.5,
        },
      ],
      runtimeStateJsonlPaths: ["model-memory/capture-jobs/events.jsonl"],
      semanticTruthTouchRequested: [
        { ticketId: "approval-1", reason: "would touch semantic truth" },
      ],
    });

    const dryRun = await executeSafeLevel1AutoFixPlan({
      plan,
      baseDir: tempDir,
      mode: "dry_run",
      enabled: true,
      now: new Date(NOW),
    });
    const executed = await executeSafeLevel1AutoFixPlan({
      plan,
      baseDir: tempDir,
      mode: "execute",
      enabled: true,
      now: new Date(NOW),
    });

    expect(dryRun.dry_run_count).toBe(plan.actions.length);
    expect(executed.executed_count).toBe(plan.actions.length);
    expect(executed.semantic_truth_mutated).toBe(false);
    expect(executed.results.map((entry) => entry.action_kind)).toEqual(
      expect.arrayContaining([
        "retry_failed_capture_job",
        "mark_runtime_dirty_and_schedule_rebuild",
        "rebuild_stale_projection_artifact",
        "quarantine_invalid_projection_artifact",
        "rotate_runtime_state_jsonl",
        "refresh_provider_scorecard",
        "disable_failover_safe_model_route",
        "operator_approval_ticket",
      ]),
    );
    const executionText = await readFile(
      path.join(tempDir, "auto-fix/safe-level1-execution.json"),
      "utf8",
    );
    expect(executionText).toContain("memory_ops_safe_level1_autofix_execution.v1");
    expect(executionText).not.toContain("full prompt");
    expect(executionText).not.toContain("full transcript");
    expect(await readFile(jsonlPath, "utf8")).toBe("");
  });

  it("discovers hook surfaces and writes an artifact with honest non-fired statuses", async () => {
    await mkdir(path.join(tempDir, "src"), { recursive: true });
    await writeFile(
      path.join(tempDir, "src", "hooks.ts"),
      [
        'createInternalHookEvent("message", "preprocessed", "session", {})',
        "before_prompt_build",
        "runToolResultPersist",
      ].join("\n"),
      "utf8",
    );
    const artifact = await discoverMemoryOpsHooksFromRepo({
      repoRoot: tempDir,
      createdAt: NOW,
    });
    const summary = summarizeHookDiscovery(artifact);
    expect(summary.registered_not_fired).toContain("message:preprocessed");
    expect(summary.blocked).toContain("message:received");
    expect(summary.registered_not_fired).toContain("tool_result_persist");
    expect(summary.blocked).toContain("after_tool_call");

    const artifactPath = await writeHookDiscoveryArtifact({
      artifact,
      config: { baseDir: tempDir },
    });
    const artifactText = await readFile(artifactPath, "utf8");
    expect(artifactText).toContain("memory_ops_hook_discovery.v1");
  });

  it("runs safe synthetic hook canaries without claiming production runtime firing", async () => {
    await mkdir(path.join(tempDir, "src", "hooks"), { recursive: true });
    await writeFile(
      path.join(tempDir, "src", "hooks", "internal-hooks.ts"),
      `
        const handlers = new Map<string, Function[]>();
        export function registerInternalHook(key: string, handler: Function) {
          handlers.set(key, [...(handlers.get(key) ?? []), handler]);
        }
        export function unregisterInternalHook(key: string, handler: Function) {
          handlers.set(key, (handlers.get(key) ?? []).filter((entry) => entry !== handler));
        }
        export function createInternalHookEvent(type: string, action: string, sessionKey: string, context = {}) {
          return { type, action, sessionKey, context, timestamp: new Date(), messages: [] };
        }
        export async function triggerInternalHook(event: { type: string; action: string }) {
          for (const handler of handlers.get(\`\${event.type}:\${event.action}\`) ?? []) {
            await handler(event);
          }
        }
      `,
      "utf8",
    );
    await writeFile(
      path.join(tempDir, "src", "hooks.ts"),
      [
        'createInternalHookEvent("message", "preprocessed", "session", {})',
        '"command", "reset"',
      ].join("\n"),
      "utf8",
    );
    await mkdir(path.join(tempDir, "src", "plugins"), { recursive: true });
    await writeFile(
      path.join(tempDir, "src", "plugins", "hooks.ts"),
      `
        export function createHookRunner(registry: any) {
          const run = async (hookName: string, event: any, context: any) => {
            for (const hook of registry.typedHooks.filter((entry: any) => entry.hookName === hookName)) {
              await hook.handler(event, context);
            }
          };
          const runSync = (hookName: string, event: any, context: any) => {
            let result;
            for (const hook of registry.typedHooks.filter((entry: any) => entry.hookName === hookName)) {
              result = hook.handler(event, context) ?? result;
            }
            return result;
          };
          return {
            runToolResultPersist: (event: any, context: any) => runSync("tool_result_persist", event, context),
            runAfterToolCall: (event: any, context: any) => run("after_tool_call", event, context),
            runAgentEnd: (event: any, context: any) => run("agent_end", event, context),
            runBeforeCompaction: (event: any, context: any) => run("before_compaction", event, context),
            runAfterCompaction: (event: any, context: any) => run("after_compaction", event, context),
            runSessionEnd: (event: any, context: any) => run("session_end", event, context),
          };
        }
      `,
      "utf8",
    );
    await writeFile(
      path.join(tempDir, "src", "plugin-surfaces.ts"),
      [
        "runToolResultPersist",
        "after_tool_call",
        "embedded_run_agent_end",
        "before_compaction",
        "after_compaction",
        "session_end",
        ".ingest(",
        ".ingestBatch(",
        ".afterTurn(",
      ].join("\n"),
      "utf8",
    );

    const artifact = await discoverMemoryOpsHooksFromRepo({
      repoRoot: tempDir,
      createdAt: NOW,
    });
    const canaried = await runSafeHookFiringCanaries({ artifact, repoRoot: tempDir });
    const preprocessed = canaried.targets.find(
      (target) => target.hook_name === "message:preprocessed",
    );
    expect(preprocessed).toMatchObject({
      status: "synthetic_only",
      fired: true,
      trigger_method: "synthetic_in_process_internal_hook",
      verification_level: "synthetic_in_process",
    });
    expect(preprocessed?.notes.join(" ")).toContain("not production lifecycle firing");

    const toolResultPersist = canaried.targets.find(
      (target) => target.hook_name === "tool_result_persist",
    );
    expect(toolResultPersist).toMatchObject({
      status: "synthetic_only",
      fired: true,
      trigger_method: "synthetic_in_process_plugin_hook_runner",
      verification_level: "synthetic_in_process",
    });
    expect(toolResultPersist?.observed_payload_keys).toContain("event.toolName");
    expect(toolResultPersist?.notes.join(" ")).toContain("not production lifecycle firing");

    const contextIngest = canaried.targets.find(
      (target) => target.hook_name === "ContextEngine.ingest()",
    );
    expect(contextIngest).toMatchObject({
      status: "synthetic_only",
      fired: true,
      trigger_method: "synthetic_in_process_context_engine_lifecycle",
      verification_level: "synthetic_in_process",
    });
    expect(contextIngest?.observed_payload_keys).toContain("params.content_sha256");

    const summary = summarizeHookDiscovery(canaried);
    expect(summary.synthetic_only).toContain("message:preprocessed");
    expect(summary.synthetic_only).toContain("tool_result_persist");
    expect(summary.synthetic_only).toContain("ContextEngine.ingest()");
  });

  it("merges production runtime probe evidence as production_verified", async () => {
    await mkdir(path.join(tempDir, "src"), { recursive: true });
    await writeFile(
      path.join(tempDir, "src", "hooks.ts"),
      'createInternalHookEvent("message", "preprocessed", "session", {})',
      "utf8",
    );
    const artifact = await discoverMemoryOpsHooksFromRepo({
      repoRoot: tempDir,
      createdAt: NOW,
    });
    await recordProductionHookProbe({
      hookName: "message:preprocessed",
      triggerSurface: "test.production",
      payload: { body: "must be hashed only" },
      context: { sessionKey: "agent:main:test" },
      observedAt: new Date(NOW),
      outputDir: path.join(tempDir, "hook-runtime-canaries"),
      env: { MODEL_MEMORY_HOOK_PROBE_ENABLED: "true" } as NodeJS.ProcessEnv,
    });

    const merged = await mergeProductionHookProbeEvidence({
      artifact,
      config: { baseDir: tempDir },
    });
    const target = merged.targets.find((entry) => entry.hook_name === "message:preprocessed");
    expect(target).toMatchObject({
      status: "production_verified",
      fired: true,
      trigger_method: "production_runtime_probe",
      verification_level: "runtime_observed",
    });
    expect(JSON.stringify(target)).not.toContain("must be hashed only");
  });

  it("builds observe-only retrieval, injection, context, and edge signals without raw content", () => {
    const createdAt = new Date(NOW);
    const resultSet = {
      id: "retrieval-set-1",
      retrievalRequestId: "retrieval-request-1",
      contentHash: "content-hash",
      resultCount: 2,
      createdAt,
    };
    const retrievalSignals = buildRetrievalObservationSignals({
      observedAt: NOW,
      requests: [
        {
          id: "retrieval-request-1",
          sessionId: "session-1",
          agentId: "main",
          queryText: "raw user query must not persist",
          requestPurpose: "answer",
          scope: {},
          desiredResultCount: 2,
          contractName: "contract",
          contractVersion: "v1",
          modelId: "model",
          createdAt,
        },
      ],
      resultSets: [resultSet],
      resultItems: [
        {
          id: "item-1",
          retrievalResultSetId: resultSet.id,
          memoryObjectId: "memory-active",
          rankIndex: 0,
          rankBand: "primary",
          retrievalReasonCodes: ["scope_match"],
          selectedForContext: true,
          createdAt,
        },
        {
          id: "item-2",
          retrievalResultSetId: resultSet.id,
          memoryObjectId: "memory-conflicted",
          rankIndex: 1,
          rankBand: "primary",
          retrievalReasonCodes: ["text_match"],
          selectedForContext: true,
          createdAt,
        },
      ],
    });
    expect(retrievalSignals).toHaveLength(1);
    expect(JSON.stringify(retrievalSignals)).not.toContain("raw user query must not persist");
    expect(retrievalSignals[0]?.payload.query_hash).toHaveLength(64);

    const injectionSignals = buildInjectionObservationSignals({
      observedAt: NOW,
      resultSets: [resultSet],
      resultItems: [
        {
          id: "item-1",
          retrievalResultSetId: resultSet.id,
          memoryObjectId: "memory-superseded",
          rankIndex: 0,
          rankBand: "primary",
          retrievalReasonCodes: [],
          selectedForContext: true,
          createdAt,
        },
        {
          id: "item-2",
          retrievalResultSetId: resultSet.id,
          memoryObjectId: "memory-conflicted",
          rankIndex: 1,
          rankBand: "primary",
          retrievalReasonCodes: [],
          selectedForContext: true,
          createdAt,
        },
      ],
      memoryStatusesById: new Map([
        ["memory-superseded", { status: "superseded" }],
        ["memory-conflicted", { status: "conflicted" }],
      ]),
    });
    const recommendations = buildRecommendationsFromSignals({
      signals: injectionSignals,
      nowIso: NOW,
    });
    expect(recommendations.map((entry) => entry.category).toSorted()).toEqual([
      "bad_injection",
      "superseded_memory_injected",
    ]);

    const contextSignals = buildContextRunLedgerSignals({
      observedAt: NOW,
      runs: [
        {
          id: "run-1",
          sessionId: "session-1",
          agentId: "main",
          provider: "openai",
          model: "gpt",
          stableLayerHash: "stable",
          semiStableLayerHash: "semi",
          volatileLayerHash: "volatile",
          estimatedInputTokens: 100,
          compactionUsed: false,
          pruningUsed: false,
          assembledAt: createdAt,
        },
      ],
      segments: [
        {
          id: "segment-1",
          runId: "run-1",
          segmentOrder: 0,
          segmentType: "retrieval_pack",
          sourceArtifactId: "artifact-1",
          sourceKind: "memory",
          segmentHash: "segment-hash",
          estimatedTokens: 12,
          dropped: false,
          trimmed: false,
        },
      ],
    });
    expect(contextSignals[0]?.signal_type).toBe("prompt_assembly_audit");
    expect(JSON.stringify(contextSignals)).not.toContain("prompt text");

    const edgeSignals = buildConflictAndSupersessionObservationSignals({
      observedAt: NOW,
      events: [
        {
          memory_event_id: "event-1",
          schema_version: "memory_event.v1",
          event_type: "conflict_recorded",
          occurred_at: NOW,
          actor: "system",
          source_ingest_event_id: "ingest-1",
          candidate_id: "candidate-1",
          memory_id: "memory-conflict-new",
          target_memory_ids: ["memory-conflict-old"],
          payload: { conflict_type: "direct_contradiction" },
        },
      ],
      edges: [
        {
          edge_id: "edge-1",
          schema_version: "memory_edge.v1",
          from_memory_id: "memory-new",
          to_memory_id: "memory-old",
          edge_type: "supersedes",
          created_at: NOW,
          metadata: {},
        },
      ],
    });
    expect(edgeSignals.map((signal) => signal.signal_type).toSorted()).toEqual([
      "conflict_observed",
      "supersession_observed",
    ]);
  });
});
