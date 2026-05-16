#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { OperatorBrowserHarness } from "./lib/operator-browser-harness.mjs";

const artifactRoot = ".artifacts/execution-platform";
const safeBridgeOrigin =
  process.env.OPENCLAW_TAILSCALE_SAFE_UI_BRIDGE_URL?.trim() ||
  process.env.OPENCLAW_SAFE_UI_BRIDGE_URL?.trim() ||
  process.env.OPENCLAW_TAILSCALE_GATEWAY_BASE_URL?.trim() ||
  "https://srv1425839.tailbcf154.ts.net";

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactRoot, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  const filePath = path.join(artifactRoot, name);
  fs.writeFileSync(filePath, body, "utf8");
  return { path: `${artifactRoot}/${name}`, sha256: sha256(body) };
}

async function boundedFetch(url) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    await response.arrayBuffer();
    return { ok: response.ok, status: response.status, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      status: null,
      latencyMs: Date.now() - startedAt,
      reasonCode: error?.name === "AbortError" ? "timeout" : "fetch_failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt(runTag) {
  return [
    "You are OpenClaw running a real owner-local coding-team implementation job through the live UX path.",
    "",
    `Runtime proof run id: ${runTag}.`,
    "",
    "Goal for this job:",
    "",
    "Implement Work Queue Canonical Runtime Redesign as a production feature, not a proof runner and not a skeleton. This is the next real OpenClaw Platform Convergence work item.",
    "",
    "Canonical queue target:",
    "",
    "- openclaw-convergence.active-queue-18",
    "- title: Work Queue Canonical Runtime Redesign",
    "",
    "This must route to the coding-team workflow because source changes are required.",
    "",
    "Required workflow behavior:",
    "",
    "1. Use agent_team.coding through the live Runtime Work Graph path.",
    "2. The orchestrator must run first and create OpenClaw-visible child nodes.",
    "3. Kimi must attempt the first scoped standard implementation edit.",
    "4. Kimi must successfully complete at least one scoped source/test/doc edit before Codex handles the complex follow-up lane.",
    "5. After Kimi succeeds, continue into the Codex parity implementation adapter inside the same runtime job so both implementation lanes are proven.",
    "6. At least context scout, implementation, test/review, reviewer, observability/readback, and closeout roles must run as OpenClaw-visible role invocations.",
    "7. The same role may be called more than once if the graph needs it.",
    "8. Include one bounded human/scope decision node and resume from it.",
    "9. Exercise validation failure and repair inside the same runtime job. A first failed validation is acceptable only if the job classifies it, repairs it, reruns validation, and records final passing validation.",
    "10. Generate the final Closeout Capsule only after runtime evidence is accepted or explicitly needs_review.",
    "11. Do not claim success from process completion or prose.",
    "",
    "Bounded human/scope decision for this run:",
    "",
    "Decision question:",
    "Should the Work Queue Canonical Runtime Redesign make DB/runtime records the production primary source for active/closed queue projection now, while keeping source tracker files as seed/history/audit refs only?",
    "",
    "Use this bounded owner decision:",
    "",
    "- decision: proceed_with_db_runtime_primary_projection",
    "- reasonCode: owner_prioritizes_live_runtime_truth_over_static_tracker_drift",
    "- scope: work-queue read model, repository projection helpers, convergence tracker projection, tests, docs, and owner readback.",
    "- non-goal: do not mutate execution lifecycle directly and do not delete historical slice/artifact refs.",
    "",
    "Implementation objective:",
    "",
    "Move Work Queue owner-facing active/closed projection toward DB/runtime truth so the Work Queue stops depending on stale static source arrays as the live owner state.",
    "",
    "Current problems to solve:",
    "",
    "- The source tracker has been useful for planning, but live queue state drifts because closing work items does not automatically update source files.",
    "- Active queue numbering should be derived from current open DB/runtime records, not baked into permanent labels.",
    "- Parent items spawning children should update live queue data, not just future docs or proof artifacts.",
    "- Closeout evidence should update bounded projection/readback fields without pretending Work Queue owns runtime job lifecycle.",
    "- The Work Queue interface should be a projection of the real queue, not a separate stale system.",
    "- Owner-facing workflow output still sometimes degenerates into reason-code dumps; the redesign should reinforce useful human-readable readback.",
    "",
    "Production design requirements:",
    "",
    "1. Active and closed buckets",
    "",
    "- Add or harden a canonical DB/runtime-backed queue projection with exactly two owner-facing buckets: active and closed.",
    "- Active positions must be derived at read time from current DB/runtime state.",
    "- Closed positions must be derived at read time from current DB/runtime state.",
    "- Stable internal ids, historical slice ids, legacy refs, artifact refs, runtime job refs, and closeout refs must remain preserved.",
    "- Static tracker definitions may remain as seed/history/audit input, but they must not be described as live queue lifecycle truth.",
    "",
    "2. Parent/child queue mutation",
    "",
    "- Add or harden repository/read-model helpers for parent work items and child action items.",
    "- Parent items should surface child refs, dependency refs, assignments, blocker state, runtime job refs, graph refs, validation refs, and closeout refs.",
    "- Child items should surface parent refs, action kind, workflow/role/human assignment, dependency state, runtime refs, evidence refs, and limitations.",
    "- If child creation is not yet safe to execute directly, implement the production-safe bounded path and mark exact remaining authority boundary in readback.",
    "- Do not mutate runtime job lifecycle from Work Queue code.",
    "",
    "3. Closeout-driven projection updates",
    "",
    "- Add or harden a path where accepted Closeout Capsule refs can update Work Queue projection/readback metadata.",
    "- Closeout may propose follow-up work, child items, priority notes, limitations, and owner-readable ELI5 progress.",
    "- Deterministic code validates ids, refs, bounds, storage flags, lifecycle boundaries, and dependency shape.",
    "- Model-authored closeout judges work quality and next-step usefulness.",
    "- Closeout-driven updates must not directly mark runtime jobs succeeded or mutate execution lifecycle.",
    "",
    "4. Runtime graph readback",
    "",
    "- Work Queue readback must show dynamic graph state where evidence exists.",
    "- Include current stage, active node, last worker, child node count, repeated role calls, Kimi attempt, Codex escalation or repair, validation attempts, repair attempts, human decision, final review, and closeout state.",
    "- Do not show only a thin nodeCount summary if richer runtime evidence exists.",
    "",
    "5. Owner-readable output",
    "",
    "- Improve or preserve the gateway/chat/readback behavior so the owner sees a clear human-language report, not only runtime ids and reason codes.",
    "- The report should include what workflow ran, what changed, files changed, validation, models/roles, limitations, ELI5 progress, and next step.",
    "- Reason codes may appear after the human-readable summary as technical refs.",
    "",
    "6. Kimi implementation contract",
    "",
    "- Kimi must attempt and complete a scoped standard implementation first.",
    "- Kimi success requires real changed-file refs, validation refs, and no raw provider storage.",
    "- If Kimi returns no valid patch, out-of-scope patch, no file changes, failed validation, or low-confidence output, the job is not allowed to mark Kimi ready; repair Kimi if possible and only then proceed. If Kimi cannot complete after bounded repair attempts, mark the Kimi lane needs_review and do not claim maximal pass.",
    "- Do not count Kimi as successful unless Kimi actually edits an approved source/test/doc file and validation accepts it.",
    "",
    "7. Validation repair",
    "",
    "- A validation failure must not kill the job.",
    "- The test engineer should classify bounded validation evidence.",
    "- The implementation worker should repair within the same runtime job.",
    "- Validation must rerun after repair.",
    "- The final Closeout Capsule must accurately report that a failure happened and was repaired.",
    "",
    "8. Gateway rebuild/recovery proof",
    "",
    "- If gateway-facing code or live UX readback code changes, rebuild/reload the gateway through the approved rebuild path.",
    "- Record pre/post health evidence for local /healthz, local /readyz, Tailscale /healthz, and Tailscale /readyz.",
    "- If the runtime worker policy does not permit the worker to rebuild, record exact blocker and include the rebuild/recovery requirement in closeout as pending operator action.",
    "- Do not change gateway port, auth, pairing state, ACP endpoint, or unrelated environment.",
    "",
    "Suggested implementation areas:",
    "",
    "- extensions/execution-platform/src/work-queue/canonical-runtime-queue.ts",
    "- extensions/execution-platform/src/work-queue/canonical-runtime-queue.test.ts",
    "- extensions/execution-platform/src/work-queue/work-queue-repository.ts",
    "- extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "- extensions/execution-platform/src/work-queue/db-primary-work-queue-projection.ts",
    "- extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "- src/gateway/server-methods/chat.ts",
    "- ui/src/ui/views/work-queue.ts",
    "- ui/src/ui/views/work-queue.test.ts",
    "- docs/projects/execution-platform/specs/work-queue-execution-truth.md",
    "- docs/projects/execution-platform/specs/runtime-work-graph.md",
    "- docs/projects/execution-platform/specs/codex-parity-runtime.md",
    "- docs/projects/execution-platform/STATUS.md",
    "- docs/projects/execution-platform/CURRENT_SLICE.md",
    "",
    "Use existing local patterns. Do not invent a second queue store if the existing Execution Platform WorkQueueRepository and DB truth model can represent the data. If new helpers are needed, build them in sympathy with the existing repository/read-model structure.",
    "",
    "Minimum code outcome:",
    "",
    "- A production canonical runtime queue projection path that reads WorkItemTruth/WorkQueueRepository-shaped data.",
    "- Active/closed dynamic numbering by DB/runtime state.",
    "- Parent/child refs, runtime job refs, graph refs, blockers, closeout refs, and ELI5/readback fields in projection or readback.",
    "- Closeout-driven projection helper or documented production-safe adapter boundary with tests.",
    "- Source tracker status or docs updated so static tracker files are seed/history/audit, not live queue truth.",
    "- Focused tests proving the behavior.",
    "",
    "Minimum proof outcome:",
    "",
    "- The job creates a runtime job through OpenClaw UX.",
    "- The job uses agent_team.coding.",
    "- The dynamic Runtime Work Graph is used.",
    "- Kimi completes a scoped accepted edit with changed-file refs and validation refs.",
    "- Codex complex follow-up or repair is recorded after Kimi success.",
    "- Human/scope decision is recorded and resumed.",
    "- Validation failure/repair loop records at least one repair attempt, then passes.",
    "- Real source files are changed.",
    "- Focused validation passes.",
    "- Work Queue readback shows the richer graph and queue evidence.",
    "- Closeout Capsule is model-authored and owner-readable.",
    "",
    "Focused validation expectations:",
    "",
    "Run the focused tests for touched files. At minimum, validation should include the Work Queue readback/projection tests and UI tests if UI files change.",
    "",
    "Expected test coverage:",
    "",
    "- active and closed bucket derivation.",
    "- dynamic active/closed positions after item close.",
    "- parent/child refs and dependency refs.",
    "- runtime job refs and graph refs projected without lifecycle ownership.",
    "- closeout refs projected without mutating runtime job lifecycle.",
    "- source tracker mode is seed/history/audit only.",
    "- owner-readable readback includes graph, repair, Kimi/handoff, human decision, validation, closeout, and ELI5.",
    "- no raw prompt, raw response, raw transcript, provider log, tool log, command log, DB row, secret, or hidden reasoning storage.",
    "",
    "Hard boundaries:",
    "",
    "- Do not deploy.",
    "- Do not send outbound messages.",
    "- Do not promote models.",
    "- Do not grant authority.",
    "- Do not apply Work Queue controls.",
    "- Do not mutate Work Queue lifecycle directly.",
    "- Do not change gateway port, auth, pairing state, ACP endpoint, or unrelated gateway env.",
    "- Do not store raw prompts, raw responses, raw transcripts, provider logs, tool logs, command logs, DB rows, secrets, hidden reasoning, or unbounded logs.",
    "- Store only bounded summaries, hashes, refs, reason codes, runtime ids, model refs, provider refs, graph refs, node refs, validation refs, artifact refs, and closeout refs.",
    "- Deterministic code validates shape, refs, bounds, lifecycle, authority, dependency graph, storage flags, and budgets.",
    "- Model-authored roles judge implementation quality, workflow fit, closeout quality, and owner usefulness.",
    "- No deterministic English semantic routing, keyword forests, brittle prompt-specific hacks, or fake proof-only success.",
    "",
    "Closeout requirements:",
    "",
    "The final model-authored Closeout Capsule must include:",
    "",
    "- workflow selected.",
    "- runtime job id.",
    "- graph id.",
    "- roles/agents used.",
    "- models used.",
    "- Kimi attempt result.",
    "- Codex escalation/repair result if used.",
    "- human/scope decision result.",
    "- validation failure and repair history.",
    "- files changed.",
    "- tests run.",
    "- whether gateway rebuild/recovery was performed or exactly why it was deferred.",
    "- what changed in the Work Queue runtime redesign.",
    "- what remains unproven.",
    "- whether this closes active-queue-18.",
    "- whether it also closes the remaining Codex parity gates for Kimi, repair, human nodes, readback, closeout ordering, and long-form UX proof.",
    "- ELI5 progress.",
    "",
    "Success condition:",
    "",
    "This job succeeds only if runtime evidence proves real source edits, Kimi successful edit, Codex complex follow-up or repair, same-job validation repair, human/scope decision, passing focused validation, useful Work Queue readback, and model-authored closeout. If any of those are missing, mark needs_review with exact reason codes instead of pretending success.",
  ].join("\n");
}

function queryRuntimeEvidence(input) {
  const script = `
    import { createExecutionPlatformDatabaseRuntime } from "./dist/extensions/execution-platform/runtime-api.js";
    function asRecord(value) {
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    }
    function artifactPromptHash(artifact) {
      const metadata = asRecord(artifact.metadata);
      return metadata.promptHash ?? asRecord(metadata.metadata).promptHash ?? null;
    }
    function latestByType(artifacts, type) {
      return artifacts.filter((artifact) => artifact.artifactType === type).at(-1) ?? null;
    }
    const promptHash = ${JSON.stringify(input.promptHash)};
    const startedAfter = Date.parse(${JSON.stringify(input.startedAfter)});
    function summarizeParity(metadata) {
      const record = asRecord(metadata);
      const validation = asRecord(record.validation);
      const records = Array.isArray(validation.records) ? validation.records : [];
      return {
        status: record.status ?? null,
        modelRef: asRecord(record.modelSelection).modelRef ?? null,
        providerPath: asRecord(record.modelSelection).providerPath ?? null,
        executionMode: record.executionMode ?? null,
        changedFileRefs: Array.isArray(record.changedFileRefs) ? record.changedFileRefs.slice(0, 60) : [],
        diffChangedFileRefs: Array.isArray(asRecord(record.diff).changedFiles) ? asRecord(record.diff).changedFiles.map((file) => file.fileRef).slice(0, 60) : [],
        validationRecords: records.map((item) => ({
          commandRef: item.commandRef ?? null,
          status: item.status ?? null,
          exitCode: item.exitCode ?? null,
          durationMs: item.durationMs ?? null,
        })).slice(0, 20),
        reasonCodes: Array.isArray(record.reasonCodes) ? record.reasonCodes.slice(0, 60) : [],
        rawPromptStored: record.rawPromptStored ?? null,
        rawResponseStored: record.rawResponseStored ?? null,
        rawProviderLogStored: record.rawProviderLogStored ?? null,
        rawCommandLogsStored: record.rawCommandLogsStored ?? null,
      };
    }
    function toIso(value) {
      if (!value) {
        return null;
      }
      const date = value instanceof Date ? value : new Date(value);
      return Number.isFinite(date.getTime()) ? date.toISOString() : null;
    }
    function decodeJobRow(row) {
      return {
        jobId: row.job_id,
        jobType: row.job_type,
        state: row.state,
        workItemId: row.work_item_id,
        payload: row.payload,
        error: row.error,
        createdAt: row.created_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
      };
    }
    function decodeArtifactRow(row) {
      return {
        artifactId: row.artifact_id,
        jobId: row.job_id,
        artifactType: row.artifact_type,
        uri: row.uri,
        sha256: row.sha256,
        metadata: row.metadata,
      };
    }
    function decodeEventRow(row) {
      return {
        eventType: row.event_type,
      };
    }
    async function main() {
      const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
      try {
        const jobRows = await runtime.sqlClient.query(
          \`
            SELECT *
            FROM execution_platform.runtime_jobs
            WHERE job_type = ANY($1::text[])
              AND created_at >= $2::timestamptz - interval '2 minutes'
            ORDER BY created_at DESC, job_id ASC
            LIMIT 50
          \`,
          [["executor.agent_team", "executor.workflow"], new Date(startedAfter).toISOString()],
        );
        const jobs = jobRows.rows.map(decodeJobRow);
        const candidates = [];
        for (const job of jobs) {
          const createdAtMs = Date.parse(toIso(job.createdAt) ?? String(job.createdAt ?? ""));
          if (Number.isFinite(startedAfter) && Number.isFinite(createdAtMs) && createdAtMs + 120000 < startedAfter) {
            continue;
          }
          const artifactRows = await runtime.sqlClient.query(
            \`
              SELECT *
              FROM execution_platform.runtime_job_artifacts
              WHERE job_id = $1
              ORDER BY created_at ASC, artifact_id ASC
            \`,
            [job.jobId],
          );
          const artifacts = artifactRows.rows.map(decodeArtifactRow);
          const routerArtifact = artifacts.find((artifact) => artifact.artifactType === "execution.front_door.router_result");
          const sourcePromptMatch = artifacts.some((artifact) => {
            const metadata = asRecord(artifact.metadata);
            const source = asRecord(metadata.sourcePromptResolution);
            return source.promptHash === promptHash;
          });
          if (artifactPromptHash(routerArtifact) !== promptHash && !sourcePromptMatch) {
            continue;
          }
          const eventRows = await runtime.sqlClient.query(
            \`
              SELECT event_type
              FROM execution_platform.runtime_job_events
              WHERE job_id = $1
              ORDER BY event_time ASC, event_id ASC
              LIMIT 500
            \`,
            [job.jobId],
          );
          const events = eventRows.rows.map(decodeEventRow);
          const parityArtifact = latestByType(artifacts, "codex_parity.runtime_adapter_result");
          const taskGraph = latestByType(artifacts, "agent_team.coding_real_work_task_graph");
          const dynamicOrchestrator = latestByType(artifacts, "agent_team.dynamic_orchestrator_plan");
          const dynamicValidationRepair = latestByType(artifacts, "agent_team.dynamic_validation_repair_loop");
          const kimiAttempt = latestByType(artifacts, "agent_team.kimi_standard_implementation_attempt");
          const humanScopeDecision = latestByType(artifacts, "agent_team.human_scope_decision");
          const runtimeEvidence = latestByType(artifacts, "agent_team.runtime_evidence");
          const closeout = latestByType(artifacts, "execution_platform.closeout_capsule");
          const closeoutTiming = latestByType(artifacts, "agent_team.closeout_model_timing");
          const dynamicProgress = artifacts
            .filter((artifact) => artifact.artifactType === "agent_team.dynamic_progress")
            .map((artifact) => asRecord(artifact.metadata));
          const evidenceMetadata = asRecord(runtimeEvidence?.metadata);
          const roleEvidence = Array.isArray(evidenceMetadata.roleExecutionEvidence)
            ? evidenceMetadata.roleExecutionEvidence
            : [];
          candidates.push({
            jobId: job.jobId,
            jobType: job.jobType,
            state: job.state,
            workItemId: job.workItemId,
            workflowId: asRecord(job.payload).workflowId ?? null,
            createdAt: toIso(job.createdAt),
            startedAt: toIso(job.startedAt),
            completedAt: toIso(job.completedAt),
            errorCode: asRecord(job.error).code ?? null,
            artifactTypes: [...new Set(artifacts.map((artifact) => artifact.artifactType))].sort(),
            eventTypes: [...new Set(events.map((event) => event.eventType))].sort(),
            parity: parityArtifact ? summarizeParity(parityArtifact.metadata) : null,
            taskGraph: taskGraph ? {
              graphId: asRecord(taskGraph.metadata).graphId ?? null,
              nodeCount: Array.isArray(asRecord(taskGraph.metadata).nodes) ? asRecord(taskGraph.metadata).nodes.length : 0,
            } : null,
            dynamicTaskGraph: dynamicOrchestrator ? {
              graphId: asRecord(dynamicOrchestrator.metadata).graphId ?? null,
              nodeCount: Array.isArray(asRecord(asRecord(dynamicOrchestrator.metadata).plan).childTasks)
                ? asRecord(asRecord(dynamicOrchestrator.metadata).plan).childTasks.length
                : 0,
              modelRef: asRecord(dynamicOrchestrator.metadata).modelRef ?? null,
              providerPath: asRecord(dynamicOrchestrator.metadata).providerPath ?? null,
            } : null,
            dynamicValidationRepair: dynamicValidationRepair ? {
              finalState: asRecord(dynamicValidationRepair.metadata).finalState ?? null,
              repairAttemptCount: asRecord(dynamicValidationRepair.metadata).repairAttemptCount ?? null,
              validationRefs: Array.isArray(asRecord(dynamicValidationRepair.metadata).validationRefs)
                ? asRecord(dynamicValidationRepair.metadata).validationRefs.slice(0, 20)
                : [],
              reasonCodes: Array.isArray(asRecord(dynamicValidationRepair.metadata).reasonCodes)
                ? asRecord(dynamicValidationRepair.metadata).reasonCodes.slice(0, 40)
                : [],
            } : null,
            kimiAttempt: kimiAttempt ? {
              status: asRecord(kimiAttempt.metadata).status ?? null,
              modelRef: asRecord(kimiAttempt.metadata).modelRef ?? null,
              providerPath: asRecord(kimiAttempt.metadata).providerPath ?? null,
              changedFileRefs: Array.isArray(asRecord(kimiAttempt.metadata).changedFileRefs)
                ? asRecord(kimiAttempt.metadata).changedFileRefs.slice(0, 30)
                : [],
              validationRefs: Array.isArray(asRecord(kimiAttempt.metadata).validationRefs)
                ? asRecord(kimiAttempt.metadata).validationRefs.slice(0, 20)
                : [],
              attemptDiagnostics: Array.isArray(asRecord(kimiAttempt.metadata).attemptDiagnostics)
                ? asRecord(kimiAttempt.metadata).attemptDiagnostics.map((item) => ({
                    attempt: item.attempt ?? null,
                    responsePresent: item.responsePresent ?? null,
                    responseLength: item.responseLength ?? null,
                    latencyMs: item.latencyMs ?? null,
                    maxOutputTokens: item.maxOutputTokens ?? null,
                    timeoutMs: item.timeoutMs ?? null,
                    hadJsonObject: item.hadJsonObject ?? null,
                    hadPatchLikeContent: item.hadPatchLikeContent ?? null,
                    schemaParseState: item.schemaParseState ?? null,
                    schemaFailureCategories: Array.isArray(item.schemaFailureCategories)
                      ? item.schemaFailureCategories.slice(0, 12)
                      : [],
                    normalizedEditCount: item.normalizedEditCount ?? null,
                    rejectionStage: item.rejectionStage ?? null,
                    reasonCodes: Array.isArray(item.reasonCodes) ? item.reasonCodes.slice(0, 12) : [],
                  })).slice(0, 6)
                : [],
              reasonCodes: Array.isArray(asRecord(kimiAttempt.metadata).reasonCodes)
                ? asRecord(kimiAttempt.metadata).reasonCodes.slice(0, 30)
                : [],
            } : null,
            humanScopeDecision: humanScopeDecision ? {
              present: true,
              boundedDecisionRef: asRecord(humanScopeDecision.metadata).boundedDecisionRef ?? null,
            } : null,
            runtimeEvidence: runtimeEvidence ? {
              teamRunId: evidenceMetadata.teamRunId ?? null,
              reviewState: evidenceMetadata.reviewState ?? null,
              validationState: evidenceMetadata.validationState ?? null,
              closeoutState: evidenceMetadata.closeoutState ?? null,
              dynamicGraphId: asRecord(evidenceMetadata.modelRoutingEvidence).graphId ?? null,
              staticSingleJobSequenceUsed: asRecord(evidenceMetadata.modelRoutingEvidence).staticSingleJobSequenceUsed ?? null,
              inlineRoleOnlyExecutionAllowed: asRecord(evidenceMetadata.modelRoutingEvidence).inlineRoleOnlyExecutionAllowed ?? null,
              roleExecutionEvidenceCount: roleEvidence.length,
              roles: roleEvidence.map((item) => ({
                roleId: item.roleId ?? null,
                modelRef: item.modelRef ?? null,
                transportKind: item.transportKind ?? null,
              })).slice(0, 30),
              artifactRefs: Array.isArray(evidenceMetadata.artifactRefs) ? evidenceMetadata.artifactRefs.slice(0, 60) : [],
            } : null,
            dynamicProgress: {
              count: dynamicProgress.length,
              stages: dynamicProgress.map((item) => ({
                stage: item.stage ?? null,
                status: item.status ?? null,
                roleId: item.roleId ?? null,
              })).slice(-40),
            },
            closeout: closeout ? {
              uri: closeout.uri,
              hash: closeout.sha256 ?? null,
            } : null,
            closeoutTiming: closeoutTiming ? asRecord(closeoutTiming.metadata) : null,
          });
        }
        candidates.sort((left, right) => Date.parse(right.createdAt ?? "") - Date.parse(left.createdAt ?? ""));
        console.log(JSON.stringify(candidates[0] ?? null));
      } finally {
        await runtime.pool.end();
      }
    }
    main();
  `;
  try {
    const stdout = execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 45_000,
      maxBuffer: 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch (error) {
    return {
      blocked: true,
      reasonCode: "runtime_evidence_query_failed",
      errorHash: sha256(error instanceof Error ? error.message : String(error)),
    };
  }
}

async function waitForRuntimeEvidence(input) {
  const deadline = Date.now() + input.timeoutMs;
  let latest = queryRuntimeEvidence(input);
  while (Date.now() < deadline) {
    if (latest?.blocked) {
      return latest;
    }
    if (
      latest?.jobId &&
      (["succeeded", "failed", "canceled", "timed_out"].includes(latest.state) || latest.errorCode)
    ) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    latest = queryRuntimeEvidence(input);
  }
  return latest ?? { blocked: true, reasonCode: "runtime_evidence_timeout" };
}

function evaluate(evidence) {
  const parity = evidence?.parity;
  const validationRecords = Array.isArray(parity?.validationRecords)
    ? parity.validationRecords
    : [];
  const changedFiles = Array.isArray(parity?.changedFileRefs) ? parity.changedFileRefs : [];
  const roleIds = Array.isArray(evidence?.runtimeEvidence?.roles)
    ? evidence.runtimeEvidence.roles.map((role) => role.roleId).filter(Boolean)
    : [];
  const repeatedRolePresent = roleIds.some((roleId, index) => roleIds.indexOf(roleId) !== index);
  const dynamicGraphPresent = Boolean(
    evidence?.dynamicTaskGraph?.graphId &&
    evidence?.runtimeEvidence?.dynamicGraphId &&
    evidence?.runtimeEvidence?.staticSingleJobSequenceUsed === false &&
    evidence?.runtimeEvidence?.inlineRoleOnlyExecutionAllowed === false,
  );
  const validationPassed =
    validationRecords.length > 0 && validationRecords.every((record) => record.status === "passed");
  const validationRepairAccepted = evidence?.dynamicValidationRepair?.finalState === "passed";
  const repairAttemptRecorded = (evidence?.dynamicValidationRepair?.repairAttemptCount ?? 0) >= 1;
  const kimiAttemptPresent = Boolean(evidence?.kimiAttempt?.modelRef);
  const kimiCompleted =
    evidence?.kimiAttempt?.status === "completed" &&
    Array.isArray(evidence?.kimiAttempt?.changedFileRefs) &&
    evidence.kimiAttempt.changedFileRefs.length > 0;
  const codexFollowupPresent =
    Array.isArray(evidence?.runtimeEvidence?.roles) &&
    evidence.runtimeEvidence.roles.some(
      (role) =>
        role.roleId === "implementation_engineer" &&
        String(role.transportKind) === "codex_parity_runtime_adapter",
    );
  const humanScopeDecisionPresent = Boolean(evidence?.humanScopeDecision?.present);
  const dynamicProgressVisible = (evidence?.dynamicProgress?.count ?? 0) >= 8;
  const closeoutPresent = Boolean(evidence?.closeout?.uri);
  const workQueueFilesTouched = changedFiles.some((file) =>
    String(file).startsWith("extensions/execution-platform/src/work-queue/"),
  );
  const docsOrGatewayOrUiTouched = changedFiles.some(
    (file) =>
      String(file).startsWith("docs/projects/execution-platform/") ||
      String(file).startsWith("ui/src/ui/") ||
      String(file).startsWith("src/gateway/"),
  );
  const passed =
    evidence?.state === "succeeded" &&
    evidence?.workflowId === "agent_team.coding" &&
    parity?.status === "completed" &&
    parity?.executionMode === "direct_main_repo" &&
    changedFiles.length > 0 &&
    workQueueFilesTouched &&
    validationPassed &&
    dynamicGraphPresent &&
    (evidence?.runtimeEvidence?.roleExecutionEvidenceCount ?? 0) >= 5 &&
    repeatedRolePresent &&
    validationRepairAccepted &&
    repairAttemptRecorded &&
    kimiAttemptPresent &&
    kimiCompleted &&
    codexFollowupPresent &&
    humanScopeDecisionPresent &&
    dynamicProgressVisible &&
    closeoutPresent &&
    parity.rawPromptStored === false &&
    parity.rawResponseStored === false &&
    parity.rawProviderLogStored === false &&
    parity.rawCommandLogsStored === false;
  const reasonCodes = [
    ...(evidence?.state === "succeeded" ? [] : ["runtime_job_not_succeeded"]),
    ...(evidence?.workflowId === "agent_team.coding" ? [] : ["workflow_not_agent_team_coding"]),
    ...(parity?.status === "completed" ? [] : ["codex_parity_adapter_not_completed"]),
    ...(parity?.executionMode === "direct_main_repo" ? [] : ["not_direct_main_repo_execution"]),
    ...(changedFiles.length > 0 ? [] : ["no_source_files_changed"]),
    ...(workQueueFilesTouched ? [] : ["work_queue_files_not_touched"]),
    ...(validationPassed ? [] : ["validation_not_all_passed"]),
    ...(dynamicGraphPresent ? [] : ["dynamic_runtime_work_graph_missing"]),
    ...((evidence?.runtimeEvidence?.roleExecutionEvidenceCount ?? 0) >= 5
      ? []
      : ["insufficient_openclaw_role_evidence"]),
    ...(repeatedRolePresent ? [] : ["repeated_role_invocation_missing"]),
    ...(validationRepairAccepted ? [] : ["validation_repair_loop_not_passed"]),
    ...(repairAttemptRecorded ? [] : ["validation_repair_attempt_missing"]),
    ...(kimiAttemptPresent ? [] : ["kimi_standard_implementation_attempt_missing"]),
    ...(kimiCompleted ? [] : ["kimi_standard_implementation_not_successful"]),
    ...(codexFollowupPresent ? [] : ["codex_complex_followup_missing"]),
    ...(humanScopeDecisionPresent ? [] : ["human_scope_decision_missing"]),
    ...(dynamicProgressVisible ? [] : ["dynamic_runtime_progress_missing"]),
    ...(closeoutPresent ? [] : ["closeout_missing"]),
  ];
  return {
    passed,
    reasonCodes: passed
      ? ["work_queue_canonical_runtime_redesign_live_ux_proof_passed"]
      : reasonCodes,
    changedFiles,
    validationRecords,
    roleIds,
    repeatedRolePresent,
    roleCount: evidence?.runtimeEvidence?.roleExecutionEvidenceCount ?? 0,
    dynamicProgressCount: evidence?.dynamicProgress?.count ?? 0,
    validationRepairAccepted,
    repairAttemptRecorded,
    kimiAttemptPresent,
    kimiCompleted,
    codexFollowupPresent,
    humanScopeDecisionPresent,
    workQueueFilesTouched,
    docsOrGatewayOrUiTouched,
  };
}

async function main() {
  const runTag = `work-queue-canonical-runtime-redesign-${Date.now().toString(36)}`;
  const prompt = buildPrompt(runTag);
  const promptHash = sha256(prompt);
  const startedAt = new Date().toISOString();
  const safeBridgeRef = safeBridgeOrigin.replace(/\/$/, "");
  const preflight = {
    localHealth: await boundedFetch("http://127.0.0.1:28789/healthz"),
    localReady: await boundedFetch("http://127.0.0.1:28789/readyz"),
    tailscaleHealth: await boundedFetch(`${safeBridgeRef}/healthz`),
    tailscaleReady: await boundedFetch(`${safeBridgeRef}/readyz`),
    safeBridgeRef,
    promptHash,
    promptLength: prompt.length,
    runTag,
    expectedRuntimeFlags: {
      kimiFirst: "OPENCLAW_CODEX_PARITY_KIMI_MAIN_EDIT_ENABLED=true",
      forcedRepair: "OPENCLAW_CODEX_PARITY_FORCE_VALIDATION_REPAIR_PROOF=true",
      humanScope: "OPENCLAW_CODEX_PARITY_REQUIRE_HUMAN_SCOPE_DECISION=true",
      codexAfterKimiSuccess: "OPENCLAW_CODEX_PARITY_CODEX_AFTER_KIMI_SUCCESS_REQUIRED=true",
    },
  };
  writeArtifact("work-queue-canonical-runtime-redesign-live-ux-preflight.json", {
    artifactKind: "work_queue_canonical_runtime_redesign_live_ux_preflight",
    status: preflight.localReady.ok && preflight.tailscaleReady.ok ? "ready" : "blocked_health",
    preflight,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
  });
  const harness = await new OperatorBrowserHarness({
    origin: safeBridgeOrigin,
    headless: true,
  }).start();
  let browserResult = null;
  let browserStatus = "not_attempted";
  let browserReasonCodes = [];
  try {
    browserResult = await harness.sendPrompt(prompt, {
      sessionKey: "agent:main:main",
      waitFor: "dispatch",
      timeoutMs: Number(
        process.env.OPENCLAW_WORK_QUEUE_CANONICAL_UX_PROGRESS_TIMEOUT_MS ?? "240000",
      ),
    });
    browserStatus = "prompt_submitted";
    browserReasonCodes = ["browser_prompt_submitted"];
  } catch (error) {
    browserStatus = "browser_prompt_submission_needs_review";
    browserReasonCodes = [
      error?.name === "TimeoutError" ? "browser_progress_timeout" : "browser_prompt_failed",
    ];
    browserResult = {
      errorHash: sha256(error instanceof Error ? error.message : String(error)),
      boundedError:
        error instanceof Error ? error.message.slice(0, 700) : String(error).slice(0, 700),
    };
  } finally {
    await harness.close();
  }
  writeArtifact("work-queue-canonical-runtime-redesign-live-ux-browser-dispatch.json", {
    artifactKind: "work_queue_canonical_runtime_redesign_live_ux_browser_dispatch",
    status: browserStatus,
    reasonCodes: browserReasonCodes,
    runTag,
    promptHash,
    promptLength: prompt.length,
    browserRunId: browserResult?.runId ?? null,
    sessionKey: browserResult?.sessionKey ?? "agent:main:main",
    errorHash: browserResult?.errorHash ?? null,
    boundedError: browserResult?.boundedError ?? null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
  });
  const dispatchAcknowledged =
    browserStatus === "prompt_submitted" && Boolean(browserResult?.runId);
  const evidence = dispatchAcknowledged
    ? await waitForRuntimeEvidence({
        promptHash,
        startedAfter: startedAt,
        timeoutMs: Number(
          process.env.OPENCLAW_WORK_QUEUE_CANONICAL_RUNTIME_TIMEOUT_MS ?? "3600000",
        ),
      })
    : {
        blocked: true,
        reasonCode: "browser_prompt_dispatch_not_acknowledged",
        jobId: null,
        state: "not_created",
      };
  const review = evaluate(evidence);
  const runArtifact = writeArtifact("work-queue-canonical-runtime-redesign-live-ux-run.json", {
    artifactKind: "work_queue_canonical_runtime_redesign_live_ux_run",
    status: review.passed ? "passed" : "needs_review",
    reasonCodes: review.passed
      ? [
          "browser_prompt_submitted",
          "runtime_job_succeeded",
          "canonical_runtime_redesign_evidence_passed",
        ]
      : [...browserReasonCodes, ...review.reasonCodes],
    runTag,
    promptHash,
    promptLength: prompt.length,
    browserStatus,
    browserRunId: browserResult?.runId ?? null,
    sessionKey: browserResult?.sessionKey ?? "agent:main:main",
    runtimeEvidence: evidence,
    qualityReview: review,
    runtimeJobsCreated: Boolean(evidence?.jobId),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  });
  writeArtifact("work-queue-canonical-runtime-redesign-live-ux-readback.json", {
    artifactKind: "work_queue_canonical_runtime_redesign_live_ux_readback",
    status: review.passed ? "passed" : "needs_review",
    runtimeJobId: evidence?.jobId ?? null,
    workItemId: evidence?.workItemId ?? null,
    workflowId: evidence?.workflowId ?? null,
    teamRunId: evidence?.runtimeEvidence?.teamRunId ?? null,
    dynamicTaskGraph: evidence?.dynamicTaskGraph ?? null,
    roleEvidence: evidence?.runtimeEvidence?.roles ?? [],
    dynamicProgress: evidence?.dynamicProgress ?? null,
    kimiAttempt: evidence?.kimiAttempt ?? null,
    humanScopeDecision: evidence?.humanScopeDecision ?? null,
    validationRepair: evidence?.dynamicValidationRepair ?? null,
    changedFiles: review.changedFiles,
    validationRecords: review.validationRecords,
    sourceRunRef: runArtifact.path,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    workQueueLifecycleMutated: false,
  });
  writeArtifact("work-queue-canonical-runtime-redesign-live-ux-quality-review.json", {
    artifactKind: "work_queue_canonical_runtime_redesign_live_ux_quality_review",
    status: review.passed ? "passed" : "needs_review",
    assessment: review.passed
      ? "The live UX prompt created a real coding-team runtime job, used dynamic OpenClaw graph evidence, attempted Kimi, exercised same-job validation repair, resumed a human/scope decision, changed Work Queue source files, passed focused validation, and produced closeout/readback evidence."
      : "The live UX prompt did not meet every strict Work Queue Canonical Runtime Redesign and Codex-parity gate; inspect reason codes and runtime evidence before broad soak.",
    reasonCodes: review.reasonCodes,
    runtimeJobId: evidence?.jobId ?? null,
    changedFiles: review.changedFiles,
    validationRecords: review.validationRecords,
    roleCount: review.roleCount,
    dynamicProgressCount: review.dynamicProgressCount,
    kimiAttemptPresent: review.kimiAttemptPresent,
    humanScopeDecisionPresent: review.humanScopeDecisionPresent,
    repairAttemptRecorded: review.repairAttemptRecorded,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    workQueueLifecycleMutated: false,
  });
  if (!review.passed) {
    process.exitCode = 2;
  }
}

await main().catch((error) => {
  writeArtifact("work-queue-canonical-runtime-redesign-live-ux-run.json", {
    artifactKind: "work_queue_canonical_runtime_redesign_live_ux_run",
    status: "blocked",
    reasonCodes: ["work_queue_canonical_runtime_redesign_live_ux_script_failed"],
    errorHash: sha256(error instanceof Error ? error.message : String(error)),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    workQueueLifecycleMutated: false,
  });
  process.exitCode = 1;
});
