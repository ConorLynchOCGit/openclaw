#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const PRODUCT_SPEC_PLANNING_PRODUCTION_UPGRADE = true;

const REQUIRED_PLANNING_NODE_CAPABILITIES = [
  "planning_orchestrator",
  "web_research",
  "planning_capsule_draft",
  "planning_capsule_revision",
  "human_planning_decision",
  "action_graph_proposal",
  "compile_runtime_plan",
  "planning_closeout",
];

const PRODUCTION_RUNTIME_ARTIFACT_TYPES = [
  "agent_team.product_spec_planning_capability_manifest",
  "agent_team.product_spec_planning_scheduler_result",
  "agent_team.product_spec_planning_research_brief",
  "agent_team.product_spec_planning_capsule_draft",
  "agent_team.product_spec_planning_capsule_revision",
  "agent_team.product_spec_planning_human_decision",
  "agent_team.product_spec_planning_action_graph_proposal",
  "agent_team.product_spec_planning_compile_runtime_plan",
  "agent_team.product_spec_planning_work_queue_readback",
  "agent_team.product_spec_planning_closeout",
];

const PRODUCTION_UPGRADE_ARTIFACT_NAMES = [
  "product-spec-planning-production-upgrade-preflight.json",
  "product-spec-planning-capability-manifest-proof.json",
  "product-spec-planning-scheduler-integration-proof.json",
  "product-spec-planning-research-brief-proof.json",
  "product-spec-planning-capsule-lifecycle-proof.json",
  "product-spec-planning-human-decision-proof.json",
  "product-spec-planning-action-graph-proposal-proof.json",
  "product-spec-planning-compile-readiness-proof.json",
  "product-spec-planning-work-queue-readback-proof.json",
  "product-spec-planning-validation-proof.json",
  "product-spec-planning-production-upgrade-summary.json",
];

const { createHash } = await import("node:crypto");
const fs = await import("node:fs");
const path = await import("node:path");
const { OperatorBrowserHarness } = await import("./lib/operator-browser-harness.mjs");

// Product/spec planning production proof artifacts stay bounded to refs and hashes.
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

function buildProductionUpgradeSummary({ evidence, review, runArtifact }) {
  return {
    productionUpgrade: PRODUCT_SPEC_PLANNING_PRODUCTION_UPGRADE,
    status: review.passed ? "passed" : "needs_review",
    workflowId: evidence?.workflowId ?? null,
    runtimeJobId: evidence?.jobId ?? null,
    graphId: evidence?.graphId ?? null,
    planningMode: evidence?.planningMode ?? null,
    requiredPlanningNodeCapabilities: REQUIRED_PLANNING_NODE_CAPABILITIES,
    requiredRuntimeArtifactTypes: PRODUCTION_RUNTIME_ARTIFACT_TYPES,
    observedArtifactTypes: Array.isArray(evidence?.artifactTypes)
      ? evidence.artifactTypes.slice(0, 40)
      : [],
    childActionProposalRefCount: evidence?.childActionProposalRefs?.length ?? 0,
    validationRefCount: evidence?.validationRefs?.length ?? 0,
    humanDecisionRefPresent: Boolean(evidence?.humanDecisionRef),
    closeoutCapsuleRefPresent: Boolean(evidence?.closeoutCapsuleId),
    sourceRunRef: runArtifact.path,
    sourceRunHash: runArtifact.sha256,
    reasonCodes: review.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
    workQueueLifecycleMutated: false,
  };
}

function writeProductionUpgradeArtifactSet({ evidence, review, runArtifact }) {
  const summary = buildProductionUpgradeSummary({ evidence, review, runArtifact });
  return PRODUCTION_UPGRADE_ARTIFACT_NAMES.map((name) =>
    writeArtifact(name, {
      artifactKind: "product_spec_planning_production_upgrade_proof",
      ...summary,
    }),
  );
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
    "You are OpenClaw running a real owner-local Product/Spec Planning workflow through the live UX path.",
    "",
    `Runtime proof run id: ${runTag}.`,
    "",
    "Primary objective:",
    "",
    "Create a production-grade Product/Spec Planning plan for the next OpenClaw slice: Canonical Work Queue Runtime Redesign.",
    "",
    "This is planning work, not code implementation. The output should be useful enough for a later compiler/reviewer to turn into child action items, but this run must not execute those child actions.",
    "",
    "Workflow selection:",
    "",
    "Use the first-class Product/Spec Planning workflow, not the coding-team implementation workflow.",
    "",
    "The desired workflow id is:",
    "",
    "- agent_team.product_spec_planning",
    "",
    "The Product/Spec Planning workflow should produce a bounded planning artifact and a Closeout Capsule. It may propose child action graph refs, but it must not compile or run those child actions.",
    "",
    "Current system truth:",
    "",
    "- Work Queue is projection/control/readback, not execution lifecycle truth.",
    "- Runtime jobs, runtime events, runtime artifacts, leases, validation refs, and Closeout Capsules are lifecycle/evidence truth.",
    "- Product/Spec Planning can produce either plan_only output or child_action_graph_proposal output.",
    "- child_action_graph_proposal means proposed children only. It does not mean runtime jobs were created for those children.",
    "- Proposed child actions need a later compile/review/authority boundary before execution.",
    "- The owner wants active/closed Work Queue state to become DB/runtime-derived instead of static file-tracker-derived.",
    "- The owner wants human-readable readback with role/workflow/model refs, limitations, and ELI5 progress.",
    "- The owner does not want semantic keyword forests, brittle prompt-specific hacks, or deterministic English judgment.",
    "- Deterministic code should validate shape, refs, bounds, storage, lifecycle, dependencies, and authority.",
    "- Model-authored planning should judge product structure, implementation sequence, quality risks, and follow-up opportunities.",
    "",
    "Planning decision for this run:",
    "",
    "Use child_action_graph_proposal as the Product/Spec Planning mode.",
    "",
    "Record the decision as a bounded human/operator planning decision ref. This should be visible in runtime artifacts and Work Queue readback. The decision is not permission to execute child actions.",
    "",
    "Planning scope:",
    "",
    "Plan the Canonical Work Queue Runtime Redesign slice. The plan should cover the production implementation path for these requirements:",
    "",
    "1. Canonical active and closed buckets",
    "",
    "- Move active and closed queue state to DB/runtime truth.",
    "- Active queue position should be computed dynamically from DB/runtime state.",
    "- Closed queue history should preserve stable ids, legacy slice ids, artifact refs, and closeout refs.",
    "- Static tracker files should become seed/history/audit inputs, not live queue truth.",
    "- Work Queue UI should read the runtime/DB projection, not a stale source array.",
    "",
    "2. Parent/child updates",
    "",
    "- Parent work items should be able to spawn child action items through the runtime work graph.",
    "- Child actions should carry workflow kind, assigned role/workflow/human owner, dependency refs, graph node refs, runtime job refs, blocker state, evidence refs, and closeout refs.",
    "- Parent readback should show child status and blockers without claiming execution lifecycle ownership.",
    "- Child runtime jobs should remain the lifecycle truth for execution.",
    "",
    "3. Closeout-driven queue projection",
    "",
    "- Accepted Closeout Capsules should be able to update projection/readback fields.",
    "- Closeout-driven queue updates must not directly mark runtime jobs succeeded or mutate execution lifecycle.",
    "- Closeout evidence should be model-authored where it interprets quality, but deterministic code should validate refs, bounds, no-raw-storage flags, and lifecycle separation.",
    "",
    "4. Runtime graph integration",
    "",
    "- The redesign should integrate with the Runtime Work Graph.",
    "- Dynamic child nodes, repeated role calls, repair loops, human decision nodes, and closeout state should be visible in Work Queue readback.",
    "- Readback should show active worker, last worker, current stage, validation attempts, repair attempts, and limitations where runtime evidence exists.",
    "",
    "5. Human-readable owner UX",
    "",
    "- The resulting Work Queue/readback should be understandable to the owner without reading raw reason-code dumps.",
    "- It should include a plain-English summary, technical refs, limitations, next step, and ELI5 progress.",
    "- Reason codes are still useful, but they should be bounded technical refs after the human report, not the primary product surface.",
    "",
    "6. Migration and compatibility",
    "",
    "- Existing completed slice history must remain traceable.",
    "- Existing artifacts must remain linked.",
    "- Existing static tracker definitions may be used as seed/history refs during migration.",
    "- Do not silently drop old completed work.",
    "- Do not rewrite runtime truth from docs or tracker text.",
    "",
    "7. Validation strategy",
    "",
    "- Plan focused tests for projection, parent/child graph state, active/closed dynamic numbering, closeout-driven projection updates, lifecycle separation, no-raw-storage flags, and owner readback.",
    "- Plan at least one live UX/runtime proof after implementation.",
    "- Plan failure cases: stale projection, missing child refs, invalid dependency graph, closeout without accepted evidence, and attempted Work Queue lifecycle mutation.",
    "",
    "Expected Product/Spec Planning output:",
    "",
    "- A planning mode of child_action_graph_proposal.",
    "- A bounded product/spec planning report.",
    "- Proposed child action refs for the redesign slice.",
    "- Validation refs proving the planning contract shape and no-auto-execution boundary.",
    "- Human decision refs showing why child_action_graph_proposal mode was chosen.",
    "- A model-authored closeout that explains what was planned and what remains unexecuted.",
    "- ELI5 progress that a non-engineer can understand.",
    "",
    "Suggested child action themes:",
    "",
    "- DB/runtime projection model and repository changes.",
    "- Work Queue read model and UI projection changes.",
    "- Parent/child mutation and dependency handling.",
    "- Closeout Capsule to queue projection update path.",
    "- Migration from static tracker seed to DB/runtime truth.",
    "- Focused validation and live UX proof.",
    "- Documentation and runbook updates.",
    "",
    "Hard boundaries:",
    "",
    "- Do not implement source code in this workflow.",
    "- Do not create runtime jobs for the proposed child actions.",
    "- Do not deploy.",
    "- Do not send outbound messages.",
    "- Do not promote models.",
    "- Do not grant authority.",
    "- Do not apply controls.",
    "- Do not mutate Work Queue lifecycle directly.",
    "- Do not change gateway port, auth, pairing state, ACP endpoint, or unrelated environment.",
    "- Do not store raw prompts, raw responses, raw transcripts, provider logs, tool logs, command logs, DB rows, secrets, hidden reasoning, or unbounded logs.",
    "- Store only bounded summaries, hashes, refs, reason codes, runtime ids, model refs, provider refs, graph refs, node refs, validation refs, and closeout refs.",
    "",
    "Required runtime evidence:",
    "",
    "- Product/Spec Planning workflow selected.",
    "- planningMode is child_action_graph_proposal.",
    "- bounded human decision ref is recorded.",
    "- child action proposal refs exist.",
    "- validation refs exist.",
    "- closeout capsule exists and is owner-readable.",
    "- raw prompts, raw responses, transcripts, provider logs, tool logs, command logs, DB rows, secrets, and hidden reasoning are not stored.",
    "- Work Queue lifecycle is not mutated.",
    "",
    "Required human-readable closeout:",
    "",
    "The final closeout should explain:",
    "",
    "- what the workflow was asked to do.",
    "- which workflow was selected.",
    "- what planning mode was chosen.",
    "- what child action themes were proposed.",
    "- what validation evidence exists.",
    "- what did not execute.",
    "- what remains for the implementation slice.",
    "- limitations and risks.",
    "- ELI5 progress.",
    "",
    "Success condition:",
    "",
    "This Product/Spec Planning run succeeds only if runtime evidence shows the workflow selected agent_team.product_spec_planning, produced a child_action_graph_proposal contract, recorded human decision and validation refs, produced a model-authored closeout, and preserved the no-execution/no-raw-storage/no-lifecycle-mutation boundaries.",
  ].join("\n");
}

function queryRuntimeEvidence(input) {
  const script = `
    import { createExecutionPlatformDatabaseRuntime } from "./extensions/execution-platform/src/db/runtime.ts";
    import { RuntimeJobRepository } from "./extensions/execution-platform/src/runtime-job-repository.ts";
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
    const productionRuntimeArtifactTypes = new Set(${JSON.stringify(PRODUCTION_RUNTIME_ARTIFACT_TYPES)});
    async function main() {
      const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
      try {
        const repo = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
        const jobs = await repo.listRecentJobs({ jobTypes: ["executor.workflow", "executor.agent_team"], limit: 80 });
        const candidates = [];
        for (const job of jobs) {
          const createdAtMs = Date.parse(job.createdAt?.toISOString?.() ?? String(job.createdAt ?? ""));
          if (Number.isFinite(startedAfter) && Number.isFinite(createdAtMs) && createdAtMs + 120000 < startedAfter) {
            continue;
          }
          const artifacts = await repo.listArtifacts(job.jobId);
          const routerArtifact = artifacts.find((artifact) => artifact.artifactType === "execution.front_door.router_result");
          const sourcePromptMatch = artifacts.some((artifact) => {
            const metadata = asRecord(artifact.metadata);
            const source = asRecord(metadata.sourcePromptResolution);
            return source.promptHash === promptHash;
          });
          if (artifactPromptHash(routerArtifact) !== promptHash && !sourcePromptMatch) {
            continue;
          }
          const productOutput = latestByType(artifacts, "agent_team.product_spec_planning_output");
          const productContract = latestByType(artifacts, "agent_team.product_spec_planning_worker_contract");
          const humanDecision = latestByType(artifacts, "agent_team.human_scope_decision");
          const closeout = latestByType(artifacts, "execution_platform.closeout_capsule");
          const workflowCloseout = latestByType(artifacts, "workflow_review.human_closeout_summary");
          const contract = asRecord(productContract?.metadata);
          const productionArtifacts = artifacts.filter((artifact) =>
            productionRuntimeArtifactTypes.has(artifact.artifactType),
          );
          candidates.push({
            jobId: job.jobId,
            jobType: job.jobType,
            state: job.state,
            workItemId: job.workItemId,
            workflowId: asRecord(job.payload).workflowId ?? null,
            createdAt: job.createdAt?.toISOString?.() ?? null,
            completedAt: job.completedAt?.toISOString?.() ?? null,
            graphId: asRecord(job.payload).runtimeGraphId ?? asRecord(job.payload).graphId ?? null,
            artifactTypes: [...new Set(artifacts.map((artifact) => artifact.artifactType))].sort(),
            productionRuntimeArtifactTypes: [
              ...new Set(productionArtifacts.map((artifact) => artifact.artifactType)),
            ].sort(),
            planningMode: contract.planningMode ?? asRecord(productOutput?.metadata).planningMode ?? null,
            childActionProposalRefs: Array.isArray(contract.childActionProposalRefs)
              ? contract.childActionProposalRefs.slice(0, 12)
              : [],
            validationRefs: Array.isArray(contract.validationRefs) ? contract.validationRefs.slice(0, 12) : [],
            humanDecisionRef: asRecord(humanDecision?.metadata).boundedDecisionRef ?? null,
            closeoutCapsuleId: asRecord(closeout?.metadata).capsuleId ?? null,
            closeoutTaskSuccess: asRecord(asRecord(closeout?.metadata).structuredSummary).taskSuccess ?? null,
            closeoutEli5: asRecord(asRecord(closeout?.metadata).humanReport).eli5Progress ?? null,
            workflowHumanSummaryPresent: Boolean(workflowCloseout),
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            workQueueLifecycleMutated: false,
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
    const stdout = execFileSync("pnpm", ["exec", "tsx", "--eval", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 45_000,
      maxBuffer: 512 * 1024,
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
    if (latest?.jobId && ["succeeded", "failed", "canceled", "timed_out"].includes(latest.state)) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    latest = queryRuntimeEvidence(input);
  }
  return latest ?? { blocked: true, reasonCode: "runtime_evidence_timeout" };
}

function evaluate(evidence) {
  const productionArtifactCoverage = new Set(
    Array.isArray(evidence?.productionRuntimeArtifactTypes)
      ? evidence.productionRuntimeArtifactTypes
      : [],
  );
  const hasSchedulerProductionProof = productionArtifactCoverage.has(
    "agent_team.product_spec_planning_scheduler_result",
  );
  const passed =
    evidence?.state === "succeeded" &&
    evidence.workflowId === "agent_team.product_spec_planning" &&
    evidence.planningMode === "child_action_graph_proposal" &&
    Array.isArray(evidence.childActionProposalRefs) &&
    evidence.childActionProposalRefs.length >= 2 &&
    Array.isArray(evidence.validationRefs) &&
    evidence.validationRefs.length >= 2 &&
    Boolean(evidence.humanDecisionRef) &&
    Boolean(evidence.closeoutCapsuleId) &&
    evidence.rawPromptStored === false &&
    evidence.rawResponseStored === false &&
    evidence.rawProviderLogStored === false &&
    evidence.workQueueLifecycleMutated === false &&
    hasSchedulerProductionProof;
  const reasonCodes = [
    ...(evidence?.state === "succeeded" ? [] : ["runtime_job_not_succeeded"]),
    ...(evidence?.workflowId === "agent_team.product_spec_planning"
      ? []
      : ["product_spec_planning_workflow_not_selected"]),
    ...(evidence?.planningMode === "child_action_graph_proposal"
      ? []
      : ["product_spec_planning_mode_not_child_action_graph_proposal"]),
    ...((evidence?.childActionProposalRefs?.length ?? 0) >= 2
      ? []
      : ["child_action_proposal_refs_missing"]),
    ...((evidence?.validationRefs?.length ?? 0) >= 2 ? [] : ["validation_refs_missing"]),
    ...(evidence?.humanDecisionRef ? [] : ["human_decision_ref_missing"]),
    ...(evidence?.closeoutCapsuleId ? [] : ["closeout_capsule_missing"]),
    ...(hasSchedulerProductionProof ? [] : ["scheduler_production_proof_missing"]),
  ];
  return {
    passed,
    reasonCodes: passed ? ["product_spec_planning_live_ux_proof_passed"] : reasonCodes,
    qualitativeAssessment: passed
      ? "The live UX path selected Product/Spec Planning, recorded the bounded child-action planning contract, preserved the no-execution boundary, and produced closeout/readback evidence."
      : "The live UX Product/Spec Planning proof did not meet all production gates.",
  };
}

async function main() {
  const runTag = `product-spec-planning-live-ux-${Date.now().toString(36)}`;
  const prompt = buildPrompt(runTag);
  const promptHash = sha256(prompt);
  const startedAt = new Date().toISOString();
  const safeBridgeRef = safeBridgeOrigin.replace(/\/$/u, "");
  const preflight = {
    localHealth: await boundedFetch("http://127.0.0.1:28789/healthz"),
    localReady: await boundedFetch("http://127.0.0.1:28789/readyz"),
    tailscaleHealth: await boundedFetch(`${safeBridgeRef}/healthz`),
    tailscaleReady: await boundedFetch(`${safeBridgeRef}/readyz`),
    safeBridgeRef,
    promptHash,
    promptLength: prompt.length,
    runTag,
  };
  writeArtifact("product-spec-planning-live-ux-proof-preflight.json", {
    artifactKind: "product_spec_planning_live_ux_proof_preflight",
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
      waitFor: "terminal",
      timeoutMs: Number(process.env.OPENCLAW_PRODUCT_SPEC_PLANNING_UX_TIMEOUT_MS ?? "300000"),
    });
    browserStatus = "prompt_submitted";
    browserReasonCodes = ["browser_prompt_submitted"];
  } catch (error) {
    browserStatus = "browser_prompt_submission_needs_review";
    browserReasonCodes = [
      error?.name === "TimeoutError" ? "browser_terminal_timeout" : "browser_prompt_failed",
    ];
    browserResult = { errorHash: sha256(error instanceof Error ? error.message : String(error)) };
  } finally {
    await harness.close();
  }
  const evidence = await waitForRuntimeEvidence({
    promptHash,
    startedAfter: startedAt,
    timeoutMs: Number(process.env.OPENCLAW_PRODUCT_SPEC_PLANNING_RUNTIME_TIMEOUT_MS ?? "900000"),
  });
  const review = evaluate(evidence);
  const runArtifact = writeArtifact("product-spec-planning-live-ux-proof-run.json", {
    artifactKind: "product_spec_planning_live_ux_proof_run",
    status: review.passed ? "passed" : "needs_review",
    reasonCodes: review.passed
      ? ["browser_prompt_submitted", ...review.reasonCodes]
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
  const productionUpgradeArtifacts = writeProductionUpgradeArtifactSet({
    evidence,
    review,
    runArtifact,
  });
  writeArtifact("product-spec-planning-live-ux-work-queue-readback.json", {
    artifactKind: "product_spec_planning_live_ux_work_queue_readback",
    status: review.passed ? "passed" : "needs_review",
    runtimeJobId: evidence?.jobId ?? null,
    workItemId: evidence?.workItemId ?? null,
    workflowId: evidence?.workflowId ?? null,
    planningMode: evidence?.planningMode ?? null,
    childActionProposalRefs: evidence?.childActionProposalRefs ?? [],
    validationRefs: evidence?.validationRefs ?? [],
    humanDecisionRef: evidence?.humanDecisionRef ?? null,
    closeoutCapsuleId: evidence?.closeoutCapsuleId ?? null,
    sourceRunRef: runArtifact.path,
    productionUpgradeProofRefs: productionUpgradeArtifacts.map((artifact) => artifact.path),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    workQueueLifecycleMutated: false,
  });
  writeArtifact("product-spec-planning-live-ux-quality-review.json", {
    artifactKind: "product_spec_planning_live_ux_quality_review",
    status: review.passed ? "passed" : "needs_review",
    assessment: review.qualitativeAssessment,
    reasonCodes: review.reasonCodes,
    runtimeJobId: evidence?.jobId ?? null,
    workflowId: evidence?.workflowId ?? null,
    planningMode: evidence?.planningMode ?? null,
    childActionProposalRefCount: evidence?.childActionProposalRefs?.length ?? 0,
    validationRefCount: evidence?.validationRefs?.length ?? 0,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });
  console.log(
    JSON.stringify(
      {
        status: review.passed ? "passed" : "needs_review",
        runtimeJobId: evidence?.jobId ?? null,
        workflowId: evidence?.workflowId ?? null,
        reasonCodes: review.reasonCodes,
      },
      null,
      2,
    ),
  );
  if (!review.passed) {
    process.exitCode = 1;
  }
}

await main();
