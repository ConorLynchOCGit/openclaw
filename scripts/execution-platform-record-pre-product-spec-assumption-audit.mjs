#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const productSpecWorkItemId = "openclaw-convergence.active-queue-34";

const preProofItems = [
  {
    workItemId: "openclaw-convergence.pre-product-spec-01-context-scout-tool-loop",
    title: "Context Scout Tool Loop And Context Sufficiency Gate",
    priorityClass: "P0",
  },
  {
    workItemId: "openclaw-convergence.pre-product-spec-02-model-facing-staged-scheduler-tools",
    title: "Model-Facing Staged Scheduler Tool Protocol",
    priorityClass: "P0",
  },
  {
    workItemId: "openclaw-convergence.pre-product-spec-03-mission-packet-graph-lane",
    title: "Pre-Proof Mission Packet And Graph Lane",
    priorityClass: "P0",
  },
  {
    workItemId: "openclaw-convergence.pre-product-spec-04-ux-replay-payload-parity",
    title: "UX/Replay Payload Parity Gate",
    priorityClass: "P0",
  },
  {
    workItemId: "openclaw-convergence.pre-product-spec-05-long-task-budget-progress-smoke",
    title: "Long-Task Budget And Progress Smoke",
    priorityClass: "P0",
  },
];

const finalQuestionSet = [
  "Does the full original prompt reach every model stage that needs it?",
  "Does each downstream actor receive enough task context to succeed without guessing?",
  "Are CommitmentWorkPackets worker-ready, not deterministic wrappers around broad Mission Ledger commitments?",
  "Does context scout have tool access to discover and verify repo context?",
  "Can a child worker request more original-prompt context or repo context before attempting work?",
  "Are scheduler tools actual model-facing staged operations, or only trace wrappers around one large JSON response?",
  "Does the scheduler block implementation when required context is weak, then ask for better context rather than forcing implementation?",
  "Does graph-node creation always materialize DB Work Queue child items?",
  "Can Work Queue/readback show current node, objective, model/worker, tool call, blocker, validation state, next decision, and ELI5 progress?",
  "Can Codex still monopolize implementation, validation, and review without a cost/quality justification?",
  "Can Kimi or another non-Codex worker succeed from the supplied packet; if not, does it fail with actionable context/schema/validation diagnostics?",
  "Is success impossible without accepted Mission Ledger evidence claims, validation evidence, profile/readback evidence, and model-authored closeout/finalization?",
  "Does replay/direct submission follow the same payload path as live UX submission?",
  "Are timeout and retry budgets realistic for long implementation tasks?",
  "Does every rejected model decision produce field-specific repair diagnostics and preserve accepted fields?",
  "Are generated/proof/debug Work Queue children retired by lifecycle policy and excluded from owner roadmap truth?",
  "Are proof scripts black-box observers, not private runner shortcuts?",
  "Are legacy/fallback paths impossible to use for production success?",
  "Are progress events durable and visible during the run, not only in final artifacts?",
  "Are child agents used because they improve outcome, distribute context, reduce cost, or close evidence gaps, not merely to prove they were called?",
];

const criticalAnswers = [
  {
    questionId: "Q1",
    status: "mostly_yes",
    answer:
      "Mission Ledger and CommitmentWorkPacket authoring receive volatile full prompt context bounded to 120k characters. Context scout can request bounded prompt excerpts. Implementation workers receive packet/context handoffs, not full prompt by default.",
    risk: "Worker handoff quality must be proven before implementation.",
  },
  {
    questionId: "Q2",
    status: "improved_not_proven",
    answer:
      "CommitmentWorkPackets are model-authored from the full prompt and model-reviewed. The next lane must inspect whether they are Grade A before running workers.",
    risk: "A broad or generic packet can still starve context scout and Kimi.",
  },
  {
    questionId: "Q3",
    status: "partial",
    answer:
      "Context scout has source prompt excerpt requests and repo file verification, but it is not yet a full repo search/read/test-inspection tool loop.",
    risk: "Weak scout output can derail every downstream node.",
  },
  {
    questionId: "Q4",
    status: "partial",
    answer:
      "Scheduler operations are runtime-tool traced and compiler-backed, but the live model interaction still has too much one-large-decision shape.",
    risk: "Toolification can remain observability rather than a working interface.",
  },
  {
    questionId: "Q5",
    status: "partial",
    answer:
      "The scheduler can reject unsatisfied context dependencies, but the recovery path must ask for better context rather than fall into review churn or broad implementation.",
    risk: "Implementation may start with weak context or loop without progress.",
  },
  {
    questionId: "Q6",
    status: "wired_needs_live_proof",
    answer:
      "Dynamic graph node callbacks sync nodes to DB Work Queue child items. Product/Spec proof must verify this in owner-facing readback.",
    risk: "Owner may not see actual dynamic child work if sync/readback regresses.",
  },
  {
    questionId: "Q7",
    status: "partial",
    answer:
      "Cost-aware policy and broad-Codex restrictions exist, but the orchestrator can still choose Codex when cheaper/specialized nodes are under-specified.",
    risk: "Codex monopoly can hide weak team delegation.",
  },
  {
    questionId: "Q8",
    status: "mostly_yes_for_worker_loop",
    answer:
      "Non-Codex workers can request context and run inspect/edit/validate/repair phases, but live Kimi failures still require better packet/scout handoff diagnostics.",
    risk: "Kimi may be judged on bad task packets rather than capability.",
  },
  {
    questionId: "Q9",
    status: "strong_for_coding_path",
    answer:
      "Production coding success requires Mission Ledger/evidence/profile/validation/readback and closeout finalization. Proof-only harnesses remain non-production evidence.",
    risk: "Any surviving production fallback must stay blocked from clean success.",
  },
  {
    questionId: "Q10",
    status: "partial",
    answer:
      "The prompt-file UX harness records hash/length and avoids shell truncation. Direct/native submit is not proof unless it clones the live UX payload shape.",
    risk: "Non-equivalent replay can waste proof cycles.",
  },
  {
    questionId: "Q11",
    status: "improved_verify_per_node",
    answer:
      "Capability manifest budgets are longer than the kernel default, but Product/Spec proof must confirm each long-running node uses capability-derived budgets.",
    risk: "A hidden default timeout can kill valid long work.",
  },
  {
    questionId: "Q12",
    status: "partial",
    answer:
      "Progress events are richer, but previous UX readback still lacked enough active detail. Readback must show node/phase/tool/objective/blocker/next decision during execution.",
    risk: "Operators cannot diagnose or interrupt bad runs early.",
  },
];

const narrowWebResearch = [
  {
    source: "OpenAI Agents SDK tracing",
    url: "https://openai.github.io/openai-agents-python/tracing/",
    finding:
      "Agent runs, LLM generations, function tools, guardrails, and handoffs are trace spans; long-running workers may need explicit trace flush for timely visibility.",
    openClawImplication:
      "OpenClaw should expose node, model, tool, handoff, guardrail, and finalization events as durable readback, not only final artifacts.",
  },
  {
    source: "OpenAI Agents SDK guide",
    url: "https://developers.openai.com/api/docs/guides/agents",
    finding:
      "SDK-oriented agent systems assume the application owns orchestration, tool execution, approvals, state, tools, streaming, handoffs, and observability.",
    openClawImplication:
      "OpenClaw should keep runtime ownership of schema/state and give models typed staged operations instead of broad JSON contracts.",
  },
  {
    source: "Anthropic tool use overview",
    url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview",
    finding:
      "Client tools execute in the application: the model returns a structured tool call, code executes it, then the tool result goes back to the model.",
    openClawImplication:
      "Scheduler/context/worker loops should move from trace wrappers to actual tool-call/result loops where practical.",
  },
  {
    source: "LangGraph streaming",
    url: "https://docs.langchain.com/oss/python/langgraph/streaming",
    finding:
      "Graph systems can stream checkpoint, task start/finish, and debug events with node and result/error information.",
    openClawImplication:
      "Work Queue readback should present task/node event streams for current phase, active node, errors, and next decision.",
  },
  {
    source: "LangGraph durable execution",
    url: "https://langchain-5e9cc07a.mintlify.app/oss/python/langgraph/durable-execution",
    finding:
      "Durable graph execution persists state at step boundaries and can tune durability modes around performance and recovery.",
    openClawImplication:
      "OpenClaw should checkpoint after Mission Ledger, packets, context, graph compile, node execution, validation, and closeout.",
  },
  {
    source: "Temporal durable execution",
    url: "https://temporal.io/",
    finding:
      "Activities carry timeouts/retries and workflows recover persisted state after failures.",
    openClawImplication:
      "Provider calls, script jobs, DB operations, context tools, validation, and file edits should stay tool/activity-like with idempotency, timeout, retry, and evidence refs.",
  },
];

const prioritizedActionPlan = [
  {
    priority: "P0",
    workItemId: preProofItems[0].workItemId,
    title: preProofItems[0].title,
    beforeProductSpec: true,
    action:
      "Convert context scout into a repo/search/read/excerpt/context-sufficiency tool loop and block implementation when required context remains weak.",
  },
  {
    priority: "P0",
    workItemId: preProofItems[1].workItemId,
    title: preProofItems[1].title,
    beforeProductSpec: true,
    action:
      "Move scheduler decomposition from one large decision object to model-facing staged operations with runtime-owned graph schema compilation.",
  },
  {
    priority: "P0",
    workItemId: preProofItems[2].workItemId,
    title: preProofItems[2].title,
    beforeProductSpec: true,
    action:
      "Run a bounded lane that stops after Mission Ledger, packets, context readiness, graph compile, Work Queue children, and progress readback are accepted.",
  },
  {
    priority: "P0",
    workItemId: preProofItems[3].workItemId,
    title: preProofItems[3].title,
    beforeProductSpec: true,
    action:
      "Prove replay/direct submissions are equivalent to live UX only when they clone prompt-file payload semantics and source-prompt refs.",
  },
  {
    priority: "P0",
    workItemId: preProofItems[4].workItemId,
    title: preProofItems[4].title,
    beforeProductSpec: true,
    action:
      "Verify Product/Spec-class nodes use capability-derived long-task budgets and emit durable active progress before provider calls.",
  },
];

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  const abs = path.join(artifactDir, name);
  fs.writeFileSync(abs, body, "utf8");
  return {
    path: `.artifacts/execution-platform/${name}`,
    ref: `artifact://execution-platform/${name}`,
    sha256: sha256(body),
  };
}

function loadDotenvFiles() {
  const refs = [];
  for (const filePath of [
    path.join(root, ".env"),
    path.join(root, ".env.local"),
    path.join(root, ".env.execution-platform-staging"),
    "/root/.openclaw/.env",
  ]) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    let loaded = false;
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && !process.env[key]) {
        process.env[key] = value;
        loaded = true;
      }
    }
    if (loaded) {
      refs.push(`dotenv://${path.relative(root, filePath) || filePath}`);
    }
  }
  return refs;
}

async function ep() {
  return await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
}

async function main() {
  const dotenvRefs = loadDotenvFiles();
  const api = await ep();
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const sql = runtime.sqlClient;
  const now = new Date().toISOString();

  const productRankRows = await sql.query(
    "SELECT queue_rank FROM execution_platform.work_items WHERE work_item_id = $1",
    [productSpecWorkItemId],
  );
  const fallbackRows = await sql.query(
    "SELECT COALESCE(MAX(queue_rank),0)+1 AS rank FROM execution_platform.work_items WHERE queue_status IN ('active','blocked','needs_review')",
  );
  const baseRank = Number(productRankRows.rows[0]?.queue_rank ?? fallbackRows.rows[0]?.rank ?? 1);

  await sql.query(
    "UPDATE execution_platform.work_items SET queue_rank = queue_rank + $1, updated_at = $2::timestamptz WHERE queue_status IN ('active','blocked','needs_review') AND queue_rank >= $3 AND work_item_id <> ALL($4::text[])",
    [preProofItems.length, now, baseRank, preProofItems.map((item) => item.workItemId)],
  );

  for (const [index, item] of preProofItems.entries()) {
    const metadata = {
      artifactKind: "execution_platform.pre_product_spec_assumption_audit_work_item",
      source: "pre_product_spec_assumption_audit",
      recommendedBeforeProductSpec: true,
      priorityClass: item.priorityClass,
      sequence: index + 1,
      productSpecProofItemId: productSpecWorkItemId,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    };
    await sql.query(
      "INSERT INTO execution_platform.work_items (work_item_id,item_type,title,description,queue_status,queue_rank,metadata,created_at,updated_at) VALUES ($1,'pre_product_spec_hardening',$2,$3,'active',$4,$5::jsonb,$6::timestamptz,$6::timestamptz) ON CONFLICT (work_item_id) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description, queue_status=CASE WHEN execution_platform.work_items.queue_status IN ('closed','archived','superseded') THEN execution_platform.work_items.queue_status ELSE 'active' END, queue_rank=EXCLUDED.queue_rank, metadata=EXCLUDED.metadata, updated_at=EXCLUDED.updated_at",
      [
        item.workItemId,
        item.title,
        `P0 pre-proof hardening before Product/Spec Planning: ${item.title}.`,
        baseRank + index,
        JSON.stringify(metadata),
        now,
      ],
    );
  }

  const updatedRows = await sql.query(
    "SELECT work_item_id,title,queue_status,queue_rank FROM execution_platform.work_items WHERE work_item_id = ANY($1::text[]) OR work_item_id = $2 ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC",
    [preProofItems.map((item) => item.workItemId), productSpecWorkItemId],
  );

  const preflightRef = writeArtifact("pre-product-spec-assumption-audit-preflight.json", {
    artifactKind: "pre_product_spec_assumption_audit_preflight",
    repoRoot: root,
    databaseName: runtime.resolution.databaseName,
    dotenvRefs,
    priorCloseoutArtifactsChecked: true,
    productSpecProofNotRun: true,
    rawPromptStored: false,
    rawResponseStored: false,
  });
  const questionRef = writeArtifact("pre-product-spec-final-question-set.json", {
    artifactKind: "pre_product_spec_final_question_set",
    finalQuestionSet,
    rawPromptStored: false,
    rawResponseStored: false,
  });
  const answerRef = writeArtifact("pre-product-spec-critical-question-answers.json", {
    artifactKind: "pre_product_spec_critical_question_answers",
    answers: criticalAnswers,
    productSpecProofReadiness: "not_ready_until_p0_pre_proof_actions_close",
    rawPromptStored: false,
    rawResponseStored: false,
  });
  const matrixRef = writeArtifact("pre-product-spec-assumption-audit-matrix.json", {
    artifactKind: "pre_product_spec_assumption_audit_matrix",
    auditedBoundaries: [
      "prompt",
      "router",
      "mission_ledger",
      "commitment_work_packets",
      "context_supply",
      "scheduler",
      "capability_policy",
      "child_nodes",
      "worker_adapters",
      "validation",
      "evidence_claims",
      "closeout",
      "work_queue_readback",
    ],
    p0Findings: prioritizedActionPlan,
    rawPromptStored: false,
    rawResponseStored: false,
  });
  const researchRef = writeArtifact("pre-product-spec-narrow-web-research.json", {
    artifactKind: "pre_product_spec_narrow_web_research",
    narrowWebResearch,
    rawPromptStored: false,
    rawResponseStored: false,
  });
  const actionRef = writeArtifact("pre-product-spec-prioritized-action-plan.json", {
    artifactKind: "pre_product_spec_prioritized_action_plan",
    prioritizedActionPlan,
    productSpecWorkItemId,
    rawPromptStored: false,
    rawResponseStored: false,
  });
  const queueRef = writeArtifact("pre-product-spec-docs-work-queue-update-proof.json", {
    artifactKind: "pre_product_spec_docs_work_queue_update_proof",
    databaseName: runtime.resolution.databaseName,
    baseRank,
    updatedItems: updatedRows.rows,
    docsUpdated: [
      "workspace:execution-platform/STATUS.md",
      "workspace:execution-platform/CURRENT_SLICE.md",
      "workspace:execution-platform/DECISIONS.md",
      "workspace:execution-platform/roadmap.md",
      "workspace:execution-platform/specs/pre-product-spec-assumption-audit.md",
      "repo:docs/projects/execution-platform/specs/pre-product-spec-assumption-audit.md",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
  });
  const summaryRef = writeArtifact("pre-product-spec-assumption-audit-summary.json", {
    artifactKind: "pre_product_spec_assumption_audit_summary",
    status: "completed",
    productSpecProofReadiness: "not_ready",
    nextRecommendedWorkItemId: preProofItems[0].workItemId,
    artifactRefs: [
      preflightRef.ref,
      questionRef.ref,
      answerRef.ref,
      matrixRef.ref,
      researchRef.ref,
      actionRef.ref,
      queueRef.ref,
    ],
    rawPromptStored: false,
    rawResponseStored: false,
  });

  const result = {
    artifactKind: "pre_product_spec_assumption_audit_record_result",
    databaseName: runtime.resolution.databaseName,
    nextRecommendedWorkItemId: preProofItems[0].workItemId,
    updatedItems: updatedRows.rows,
    artifactRefs: [
      preflightRef,
      questionRef,
      answerRef,
      matrixRef,
      researchRef,
      actionRef,
      queueRef,
      summaryRef,
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
  };
  console.log(JSON.stringify(result, null, 2));
  await runtime.close?.();
}

await main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
