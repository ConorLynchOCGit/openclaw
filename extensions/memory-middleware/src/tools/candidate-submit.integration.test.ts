import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createMemoryMiddlewareDb,
  createCandidatePromotionPlanPort,
  createCandidatePromotionPort,
  createCandidateQueryPort,
  createCandidateReviewPort,
  createConsolidationExecutionPort,
  createConsolidationPlanningPort,
  createBackgroundJobSchedulerPort,
  createCompactionPlanningPort,
  createDriftCheckExecutionPort,
  createFullCompactionFallbackPort,
  createMemoryObjectQueryPort,
  createProactiveExecutionPort,
  createProactivePlanningPort,
  createSessionMemoryCompactionPort,
  createSessionMemoryPort,
  createToolResultStorePort,
  createSkillCandidatePort,
  createSkillCandidateApprovalPlanPort,
  createSkillCandidateInstallHandoffPort,
  createSkillCandidateInstallRecordPort,
  createSkillCandidateApprovalPort,
  createSkillCandidateProcurementPlanPort,
  createSkillCandidateProcurementRecordPort,
  createSkillCandidateSkillVetterHandoffPort,
  createSkillCandidateVettingResultPort,
  createSkillCandidatePlanPort,
  createProcedureValidationPort,
  createProcedureValidationPlanPort,
  type CandidateSubmissionKind,
  createSelfImprovingCandidateCapturePort,
} from "../../runtime-api.js";
import { createCandidateIngressPort } from "../candidate-ingress.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import { createCandidateGetTool } from "./candidate-get.js";
import { createCandidateListTool } from "./candidate-list.js";
import { createCandidatePromoteMemoryTool } from "./candidate-promote-memory.js";
import { createCandidatePromotePlanTool } from "./candidate-promote-plan.js";
import { createCandidatePromoteProcedureTool } from "./candidate-promote-procedure.js";
import { createCandidateReviewTool } from "./candidate-review.js";
import { createCandidateSubmitTool } from "./candidate-submit.js";
import { createMemoryBackgroundJobEnqueueTool } from "./memory-background-job-enqueue.js";
import { createMemoryBackgroundJobGetTool } from "./memory-background-job-get.js";
import { createMemoryBackgroundJobListTool } from "./memory-background-job-list.js";
import { createMemoryBackgroundJobRunNextTool } from "./memory-background-job-run-next.js";
import { createMemoryCompactionPlanTool } from "./memory-compaction-plan.js";
import { createMemoryConsolidationExecuteTool } from "./memory-consolidation-execute.js";
import { createMemoryConsolidationPlanTool } from "./memory-consolidation-plan.js";
import { createMemoryDriftCheckExecuteTool } from "./memory-drift-check-execute.js";
import { createMemoryFullCompactionFallbackExecuteTool } from "./memory-full-compaction-fallback-execute.js";
import { createMemoryObjectGetTool } from "./memory-object-get.js";
import { createMemoryObjectListTool } from "./memory-object-list.js";
import { createMemoryObjectSearchBasicTool } from "./memory-object-search-basic.js";
import { createMemoryObjectSearchHybridTool } from "./memory-object-search-hybrid.js";
import { createMemoryObjectSearchSemanticTool } from "./memory-object-search-semantic.js";
import { createMemoryProactiveExecuteTool } from "./memory-proactive-execute.js";
import { createMemoryProactivePlanTool } from "./memory-proactive-plan.js";
import { createMemorySelfImprovingCaptureCandidateTool } from "./memory-self-improving-capture-candidate.js";
import { createMemorySessionCompactExecuteTool } from "./memory-session-compact-execute.js";
import { createMemorySessionGetTool } from "./memory-session-get.js";
import { createMemorySessionUpdateTool } from "./memory-session-update.js";
import { createMemoryToolResultGetTool } from "./memory-tool-result-get.js";
import { createMemoryToolResultMicrocompactExecuteTool } from "./memory-tool-result-microcompact-execute.js";
import { createMemoryToolResultMicrocompactPlanTool } from "./memory-tool-result-microcompact-plan.js";
import { createMemoryToolResultPersistTool } from "./memory-tool-result-persist.js";
import { createProcedureValidatePlanTool } from "./procedure-validate-plan.js";
import { createProcedureValidateTool } from "./procedure-validate.js";
import { createSkillCandidateApprovalPlanTool } from "./skill-candidate-approval-plan.js";
import { createSkillCandidateApproveTool } from "./skill-candidate-approve.js";
import { createSkillCandidateCreateTool } from "./skill-candidate-create.js";
import { createSkillCandidateInstallHandoffTool } from "./skill-candidate-install-handoff.js";
import { createSkillCandidateInstallRecordCreateTool } from "./skill-candidate-install-record-create.js";
import { createSkillCandidatePlanTool } from "./skill-candidate-plan.js";
import { createSkillCandidateProcurementPlanTool } from "./skill-candidate-procurement-plan.js";
import { createSkillCandidateProcurementRecordCreateTool } from "./skill-candidate-procurement-record-create.js";
import { createSkillCandidateSkillVetterHandoffTool } from "./skill-candidate-skill-vetter-handoff.js";
import { createSkillCandidateVettingResultRecordTool } from "./skill-candidate-vetting-result-record.js";

const dockerReady = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;

const integrationDescribe = dockerReady ? describe.sequential : describe.skip;

type SeededContext = {
  projectId: string;
  agentId: string;
  sessionId: string;
};

type ReadOnlyRetrievalFixture = SeededContext & {
  approvedMemoryId: string;
  candidateMemoryId: string;
  validatedProcedureId: string;
};

type DbEnvironment = {
  containerName: string;
  connectionString: string;
  schemaV1MigrationApplied: boolean;
  securityRetrievalMigrationApplied: boolean;
};

function docker(args: string[]): string {
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectClient(connectionString: string): Promise<Client> {
  const client = new Client({
    connectionString,
  });
  await client.connect();
  return client;
}

async function waitForContainerReady(containerName: string): Promise<void> {
  const timeoutAt = Date.now() + 30_000;

  while (Date.now() < timeoutAt) {
    const result = spawnSync(
      "docker",
      ["exec", containerName, "pg_isready", "-U", "postgres", "-d", "memory_middleware_test"],
      { stdio: "ignore" },
    );
    if (result.status === 0) {
      return;
    }
    await sleep(500);
  }

  throw new Error(`Postgres container ${containerName} did not become ready in time`);
}

async function startPostgresValidationEnvironment(): Promise<DbEnvironment> {
  const containerName = `memory-middleware-pg-${process.pid}-${Date.now()}`;
  docker([
    "run",
    "-d",
    "--rm",
    "--name",
    containerName,
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "-e",
    "POSTGRES_DB=memory_middleware_test",
    "-P",
    "pgvector/pgvector:pg16",
  ]);

  try {
    await waitForContainerReady(containerName);
    const hostPort = docker([
      "inspect",
      "--format",
      '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',
      containerName,
    ]);
    const connectionString = `postgresql://postgres@127.0.0.1:${hostPort}/memory_middleware_test`;
    const schemaV1MigrationSql = await readFile(
      new URL(
        "../../db/migrations/20260401_000001_memory_middleware_schema_v1.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const securityRetrievalMigrationSql = await readFile(
      new URL(
        "../../db/migrations/20260401_000002_memory_middleware_security_retrieval.sql",
        import.meta.url,
      ),
      "utf8",
    );

    const client = await connectClient(connectionString);
    try {
      await client.query(schemaV1MigrationSql);
      await client.query(securityRetrievalMigrationSql);
    } finally {
      await client.end();
    }

    return {
      containerName,
      connectionString,
      schemaV1MigrationApplied: true,
      securityRetrievalMigrationApplied: true,
    };
  } catch (error) {
    spawnSync("docker", ["rm", "-f", containerName], { stdio: "ignore" });
    throw error;
  }
}

async function truncateValidationData(connectionString: string): Promise<void> {
  const client = await connectClient(connectionString);
  try {
    await client.query(`
      truncate table
        memory_middleware.memory_embeddings,
        memory_middleware.policy_scope_memberships,
        memory_middleware.project_memberships,
        memory_middleware.internal_principals,
        memory_middleware.memory_sources,
        memory_middleware.memory_links,
        memory_middleware.memory_reviews,
        memory_middleware.skill_candidates,
        memory_middleware.procedure_runs,
        memory_middleware.procedures,
        memory_middleware.policies,
        memory_middleware.memory_objects,
        memory_middleware.background_jobs,
        memory_middleware.compaction_events,
        memory_middleware.tool_results,
        memory_middleware.memory_events,
        memory_middleware.agent_state,
        memory_middleware.sessions,
        memory_middleware.agents,
        memory_middleware.projects
      cascade
    `);
  } finally {
    await client.end();
  }
}

async function seedContext(connectionString: string): Promise<SeededContext> {
  const client = await connectClient(connectionString);
  try {
    const project = await client.query<{ id: string }>(
      `
        insert into memory_middleware.projects (slug, name)
        values ($1, $2)
        returning id
      `,
      [`project-${randomUUID()}`, "Memory Middleware Test Project"],
    );
    const agent = await client.query<{ id: string }>(
      `
        insert into memory_middleware.agents (name, role)
        values ($1, $2)
        returning id
      `,
      ["Memory Middleware Test Agent", "tester"],
    );

    const projectId = project.rows[0]?.id;
    const agentId = agent.rows[0]?.id;
    if (!projectId || !agentId) {
      throw new Error("failed to seed project or agent rows");
    }

    const session = await client.query<{ id: string }>(
      `
        insert into memory_middleware.sessions (project_id, agent_id, session_key, title)
        values ($1, $2, $3, $4)
        returning id
      `,
      [projectId, agentId, `session-${randomUUID()}`, "Memory Middleware Test Session"],
    );

    const sessionId = session.rows[0]?.id;
    if (!sessionId) {
      throw new Error("failed to seed session row");
    }

    return {
      projectId,
      agentId,
      sessionId,
    };
  } finally {
    await client.end();
  }
}

async function seedReadOnlyRetrievalFixture(
  connectionString: string,
): Promise<ReadOnlyRetrievalFixture> {
  const seeded = await seedContext(connectionString);
  const client = await connectClient(connectionString);
  try {
    const approvedEvent = await client.query<{ id: string }>(
      `
        insert into memory_middleware.memory_events (
          project_id,
          agent_id,
          session_id,
          event_kind,
          event_name,
          payload,
          metadata
        )
        values ($1, $2, $3, 'memory_capture', $4, '{}'::jsonb, $5::jsonb)
        returning id
      `,
      [
        seeded.projectId,
        seeded.agentId,
        seeded.sessionId,
        "rollout_fixture.approved_memory",
        JSON.stringify({ source: "real_env_read_only_rollout" }),
      ],
    );
    const candidateEvent = await client.query<{ id: string }>(
      `
        insert into memory_middleware.memory_events (
          project_id,
          agent_id,
          session_id,
          event_kind,
          event_name,
          payload,
          metadata
        )
        values ($1, $2, $3, 'candidate_submission', $4, '{}'::jsonb, $5::jsonb)
        returning id
      `,
      [
        seeded.projectId,
        seeded.agentId,
        seeded.sessionId,
        "candidate_submission.learning",
        JSON.stringify({ source: "real_env_read_only_rollout" }),
      ],
    );

    const approvedEventId = approvedEvent.rows[0]?.id;
    const candidateEventId = candidateEvent.rows[0]?.id;
    if (!approvedEventId || !candidateEventId) {
      throw new Error("failed to seed fixture events");
    }

    const approvedMemory = await client.query<{ id: string }>(
      `
        insert into memory_middleware.memory_objects (
          project_id,
          agent_id,
          session_id,
          source_event_id,
          memory_kind,
          review_state,
          title,
          content,
          metadata
        )
        values ($1, $2, $3, $4, 'project', 'approved', $5, $6, $7::jsonb)
        returning id
      `,
      [
        seeded.projectId,
        seeded.agentId,
        seeded.sessionId,
        approvedEventId,
        "Passive rollout approved memory",
        "Approved passive rollout memory for read-only retrieval.",
        JSON.stringify({ source: "real_env_read_only_rollout", visibility: "approved" }),
      ],
    );
    const candidateMemory = await client.query<{ id: string }>(
      `
        insert into memory_middleware.memory_objects (
          project_id,
          agent_id,
          session_id,
          source_event_id,
          memory_kind,
          review_state,
          title,
          content,
          metadata
        )
        values ($1, $2, $3, $4, 'project', 'candidate', $5, $6, $7::jsonb)
        returning id
      `,
      [
        seeded.projectId,
        seeded.agentId,
        seeded.sessionId,
        candidateEventId,
        "Passive rollout candidate memory",
        "Candidate rollout note hidden unless explicit candidate scope is requested.",
        JSON.stringify({ source: "real_env_read_only_rollout", visibility: "candidate" }),
      ],
    );

    const approvedMemoryId = approvedMemory.rows[0]?.id;
    const candidateMemoryId = candidateMemory.rows[0]?.id;
    if (!approvedMemoryId || !candidateMemoryId) {
      throw new Error("failed to seed fixture memory rows");
    }

    const validatedProcedure = await client.query<{ id: string }>(
      `
        insert into memory_middleware.procedures (
          project_id,
          source_memory_object_id,
          status,
          title,
          body,
          metadata,
          validated_at
        )
        values ($1, $2, 'validated', $3, $4, $5::jsonb, now())
        returning id
      `,
      [
        seeded.projectId,
        approvedMemoryId,
        "Passive rollout validated procedure",
        "Validated passive rollout procedure body for explicit procedure retrieval scope.",
        JSON.stringify({ source: "real_env_read_only_rollout", visibility: "validated_procedure" }),
      ],
    );
    const validatedProcedureId = validatedProcedure.rows[0]?.id;
    if (!validatedProcedureId) {
      throw new Error("failed to seed validated procedure fixture");
    }

    return {
      ...seeded,
      approvedMemoryId,
      candidateMemoryId,
      validatedProcedureId,
    };
  } finally {
    await client.end();
  }
}

function createRuntime(params: {
  connectionString: string;
  mode:
    | "disabled"
    | "submit-only"
    | "submit-review-only"
    | "submit-review-promote-memory"
    | "submit-review-promote-memory-procedure"
    | "submit-review-promote-memory-procedure-validate"
    | "submit-review-promote-memory-procedure-validate-skill"
    | "submit-review-promote-memory-procedure-validate-skill-procurement"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
    | "candidate-only";
  autoPromotionProfile?: "disabled" | "explicit-user-preference-v1";
  queryMode?: "disabled" | "read-only" | "candidate-only";
  backgroundJobInspectionMode?: "disabled" | "enabled";
  backgroundJobAdvisorySchedulingMode?: "disabled" | "candidate-only";
  backgroundJobAdvisoryJobClasses?: Array<"proactive_plan" | "consolidation_plan">;
  backgroundJobExecuteSchedulingMode?: "disabled" | "candidate-only";
  backgroundJobExecuteJobClasses?: Array<
    "proactive_execute_run_drift_check" | "consolidation_execute"
  >;
  backgroundJobRunnerOwnerId?: string;
}): MemoryMiddlewareRuntime {
  const queryMode =
    params.queryMode ?? (params.mode === "candidate-only" ? "candidate-only" : "disabled");
  const db = createMemoryMiddlewareDb({
    config: {
      driver: "postgres",
      url: params.connectionString,
      schema: "memory_middleware",
    },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
  });
  const candidateIngress = createCandidateIngressPort({
    db,
    mode: params.mode,
  });
  const fullCandidateMode = params.mode === "candidate-only" ? "candidate-only" : "disabled";
  const backgroundJobInspectionMode = params.backgroundJobInspectionMode ?? "disabled";
  const backgroundJobAdvisorySchedulingMode =
    params.backgroundJobAdvisorySchedulingMode ?? fullCandidateMode;
  const backgroundJobAdvisoryJobClasses =
    params.backgroundJobAdvisoryJobClasses ??
    (fullCandidateMode === "candidate-only"
      ? ["proactive_plan", "consolidation_plan"]
      : ["proactive_plan"]);
  const backgroundJobExecuteSchedulingMode =
    params.backgroundJobExecuteSchedulingMode ?? fullCandidateMode;
  const backgroundJobExecuteJobClasses =
    params.backgroundJobExecuteJobClasses ??
    (fullCandidateMode === "candidate-only"
      ? ["consolidation_execute", "proactive_execute_run_drift_check"]
      : ["proactive_execute_run_drift_check"]);
  const proactivePlanningMode =
    fullCandidateMode === "candidate-only" ||
    backgroundJobAdvisorySchedulingMode === "candidate-only"
      ? "candidate-only"
      : "disabled";
  const candidateReviewMode =
    params.mode === "submit-review-only" ||
    params.mode === "submit-review-promote-memory" ||
    params.mode === "submit-review-promote-memory-procedure" ||
    params.mode === "submit-review-promote-memory-procedure-validate" ||
    params.mode === "submit-review-promote-memory-procedure-validate-skill" ||
    params.mode === "submit-review-promote-memory-procedure-validate-skill-procurement" ||
    params.mode === "submit-review-promote-memory-procedure-validate-skill-procurement-vetting" ||
    params.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval" ||
    params.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" ||
    params.mode === "candidate-only"
      ? params.mode
      : "disabled";
  const candidatePromotionMode =
    params.mode === "submit-review-promote-memory" ||
    params.mode === "submit-review-promote-memory-procedure" ||
    params.mode === "submit-review-promote-memory-procedure-validate" ||
    params.mode === "submit-review-promote-memory-procedure-validate-skill" ||
    params.mode === "submit-review-promote-memory-procedure-validate-skill-procurement" ||
    params.mode === "submit-review-promote-memory-procedure-validate-skill-procurement-vetting" ||
    params.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval" ||
    params.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" ||
    params.mode === "candidate-only"
      ? params.mode
      : "disabled";
  const procedureValidationMode =
    params.mode === "submit-review-promote-memory-procedure-validate" ||
    params.mode === "submit-review-promote-memory-procedure-validate-skill" ||
    params.mode === "submit-review-promote-memory-procedure-validate-skill-procurement" ||
    params.mode === "submit-review-promote-memory-procedure-validate-skill-procurement-vetting" ||
    params.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval" ||
    params.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" ||
    params.mode === "candidate-only"
      ? params.mode
      : "disabled";
  const skillCandidateMode =
    params.mode === "submit-review-promote-memory-procedure-validate-skill" ||
    params.mode === "submit-review-promote-memory-procedure-validate-skill-procurement" ||
    params.mode === "submit-review-promote-memory-procedure-validate-skill-procurement-vetting" ||
    params.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval" ||
    params.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" ||
    params.mode === "candidate-only"
      ? params.mode
      : "disabled";
  const procurementMode =
    params.mode === "submit-review-promote-memory-procedure-validate-skill-procurement" ||
    params.mode === "submit-review-promote-memory-procedure-validate-skill-procurement-vetting" ||
    params.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval" ||
    params.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" ||
    params.mode === "candidate-only"
      ? params.mode
      : "disabled";
  const vettingMode =
    params.mode === "submit-review-promote-memory-procedure-validate-skill-procurement-vetting" ||
    params.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval" ||
    params.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" ||
    params.mode === "candidate-only"
      ? params.mode
      : "disabled";
  const approvalMode =
    params.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval" ||
    params.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" ||
    params.mode === "candidate-only"
      ? params.mode
      : "disabled";
  const installMode =
    params.mode ===
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" ||
    params.mode === "candidate-only"
      ? params.mode
      : "disabled";
  const proactivePlanning = createProactivePlanningPort({
    db,
    mode: proactivePlanningMode,
  });
  const consolidationPlanning = createConsolidationPlanningPort({
    db,
    mode: fullCandidateMode,
  });
  const scheduledConsolidationPlanning = createConsolidationPlanningPort({
    db,
    mode: backgroundJobAdvisorySchedulingMode,
  });
  const driftCheckExecution = createDriftCheckExecutionPort({
    db,
    mode: fullCandidateMode,
  });
  const scheduledDriftCheckExecution = createDriftCheckExecutionPort({
    db,
    mode: backgroundJobExecuteSchedulingMode,
  });
  const consolidationExecution = createConsolidationExecutionPort({
    db,
    mode: fullCandidateMode,
  });
  const scheduledConsolidationExecution = createConsolidationExecutionPort({
    db,
    mode: backgroundJobExecuteSchedulingMode,
  });
  const proactiveExecution = createProactiveExecutionPort({
    proactivePlanning,
    driftCheckExecution,
    mode: fullCandidateMode,
  });
  const scheduledProactiveExecution = createProactiveExecutionPort({
    proactivePlanning,
    driftCheckExecution: scheduledDriftCheckExecution,
    mode: backgroundJobExecuteSchedulingMode,
  });

  return {
    config: {
      database: {
        driver: "postgres",
        url: params.connectionString,
        schema: "memory_middleware",
      },
      candidateIngress: {
        mode: params.mode,
      },
      autoPromotion: {
        profile: params.autoPromotionProfile ?? "disabled",
        allowedAgents: ["chief", "main"],
      },
      memoryObjectQuery: {
        mode: queryMode,
      },
      backgroundJobs: {
        inspectionMode: backgroundJobInspectionMode,
        advisorySchedulingMode:
          backgroundJobAdvisorySchedulingMode === "candidate-only" ? "enabled" : "disabled",
        advisoryJobClasses: backgroundJobAdvisoryJobClasses,
        executeSchedulingMode:
          backgroundJobExecuteSchedulingMode === "candidate-only" ? "enabled" : "disabled",
        executeJobClasses: backgroundJobExecuteJobClasses,
        ...(params.backgroundJobRunnerOwnerId
          ? { runnerOwnerId: params.backgroundJobRunnerOwnerId }
          : {}),
      },
    },
    db,
    candidateIngress,
    selfImprovingCandidateCapture: createSelfImprovingCandidateCapturePort({
      candidateIngress,
      mode: fullCandidateMode,
    }),
    candidateQuery: createCandidateQueryPort({
      db,
      mode: fullCandidateMode,
    }),
    memoryObjectQuery: createMemoryObjectQueryPort({
      db,
      mode: queryMode,
    }),
    toolResultStore: createToolResultStorePort({
      db,
      mode: fullCandidateMode,
    }),
    sessionMemory: createSessionMemoryPort({
      db,
      mode: fullCandidateMode,
    }),
    sessionMemoryCompaction: createSessionMemoryCompactionPort({
      db,
      mode: fullCandidateMode,
    }),
    compactionPlanning: createCompactionPlanningPort({
      db,
      mode: fullCandidateMode,
    }),
    fullCompactionFallback: createFullCompactionFallbackPort({
      db,
      mode: fullCandidateMode,
    }),
    consolidationExecution,
    consolidationPlanning,
    driftCheckExecution,
    proactivePlanning,
    proactiveExecution,
    backgroundJobs: createBackgroundJobSchedulerPort({
      db,
      consolidationExecution: scheduledConsolidationExecution,
      consolidationPlanning: scheduledConsolidationPlanning,
      proactivePlanning,
      proactiveExecution: scheduledProactiveExecution,
      inspectionMode: backgroundJobInspectionMode,
      advisorySchedulingMode: backgroundJobAdvisorySchedulingMode,
      advisoryJobClasses: backgroundJobAdvisoryJobClasses,
      executeSchedulingMode: backgroundJobExecuteSchedulingMode,
      executeJobClasses: backgroundJobExecuteJobClasses,
      runnerOwnerId: params.backgroundJobRunnerOwnerId,
    }),
    candidateReview: createCandidateReviewPort({
      db,
      mode: candidateReviewMode,
    }),
    candidatePromotionPlan: createCandidatePromotionPlanPort({
      db,
      mode: candidatePromotionMode,
    }),
    candidatePromotion: createCandidatePromotionPort({
      db,
      mode: candidatePromotionMode,
    }),
    procedureValidationPlan: createProcedureValidationPlanPort({
      db,
      mode: fullCandidateMode,
    }),
    procedureValidation: createProcedureValidationPort({
      db,
      mode: procedureValidationMode,
    }),
    skillCandidateApprovalPlan: createSkillCandidateApprovalPlanPort({
      db,
      mode: approvalMode,
    }),
    skillCandidateApproval: createSkillCandidateApprovalPort({
      db,
      mode: approvalMode,
    }),
    skillCandidateInstallHandoff: createSkillCandidateInstallHandoffPort({
      db,
      mode: installMode,
    }),
    skillCandidateInstallRecord: createSkillCandidateInstallRecordPort({
      db,
      mode: installMode,
    }),
    skillCandidatePlan: createSkillCandidatePlanPort({
      db,
      mode: skillCandidateMode,
    }),
    skillCandidate: createSkillCandidatePort({
      db,
      mode: skillCandidateMode,
    }),
    skillCandidateProcurementPlan: createSkillCandidateProcurementPlanPort({
      db,
      mode: procurementMode,
    }),
    skillCandidateProcurementRecord: createSkillCandidateProcurementRecordPort({
      db,
      mode: procurementMode,
    }),
    skillCandidateSkillVetterHandoff: createSkillCandidateSkillVetterHandoffPort({
      db,
      mode: vettingMode,
    }),
    skillCandidateVettingResult: createSkillCandidateVettingResultPort({
      db,
      mode: vettingMode,
    }),
  };
}

async function querySingleRow<T extends Record<string, unknown>>(
  connectionString: string,
  sql: string,
  values: readonly unknown[],
): Promise<T> {
  const client = await connectClient(connectionString);
  try {
    const result = await client.query<T>(sql, [...values]);
    const row = result.rows[0];
    if (!row) {
      throw new Error("expected query to return a row");
    }
    return row;
  } finally {
    await client.end();
  }
}

async function readTableCounts(connectionString: string): Promise<Record<string, string>> {
  const row = await querySingleRow<Record<string, string>>(
    connectionString,
    `
      select
        (select count(*)::text from memory_middleware.memory_events) as memory_events,
        (select count(*)::text from memory_middleware.memory_objects) as memory_objects,
        (select count(*)::text from memory_middleware.memory_reviews) as memory_reviews,
        (select count(*)::text from memory_middleware.procedures) as procedures,
        (select count(*)::text from memory_middleware.procedure_runs) as procedure_runs,
        (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates,
        (select count(*)::text from memory_middleware.memory_links) as memory_links,
        (select count(*)::text from memory_middleware.memory_sources) as memory_sources,
        (select count(*)::text from memory_middleware.background_jobs) as background_jobs
    `,
    [],
  );

  if (!row) {
    throw new Error("expected memory middleware table counts row");
  }

  return row;
}

async function insertMemoryEmbedding(params: {
  connectionString: string;
  memoryObjectId: string;
  embeddingModel: string;
  embeddingVersion: string;
  embedding: number[];
  chunkIndex?: number;
  chunkText?: string;
}): Promise<void> {
  const client = await connectClient(params.connectionString);
  try {
    await client.query(
      `
        insert into memory_middleware.memory_embeddings (
          memory_object_id,
          embedding_model,
          embedding_version,
          chunk_index,
          chunk_text,
          embedding
        )
        values ($1::uuid, $2::text, $3::text, $4::int, $5::text, $6::vector)
      `,
      [
        params.memoryObjectId,
        params.embeddingModel,
        params.embeddingVersion,
        params.chunkIndex ?? 0,
        params.chunkText ?? null,
        `[${params.embedding.join(",")}]`,
      ],
    );
  } finally {
    await client.end();
  }
}

integrationDescribe("memory candidate submit postgres integration", () => {
  let dbEnvironment: DbEnvironment;

  beforeAll(async () => {
    dbEnvironment = await startPostgresValidationEnvironment();
  }, 60_000);

  afterAll(() => {
    if (!dbEnvironment?.containerName) {
      return;
    }
    spawnSync("docker", ["rm", "-f", dbEnvironment.containerName], { stdio: "ignore" });
  });

  beforeEach(async () => {
    await truncateValidationData(dbEnvironment.connectionString);
  });

  it.each([
    ["learning", "project"],
    ["correction", "feedback"],
    ["procedure", "procedure"],
    ["improvement", "project"],
  ] satisfies Array<[CandidateSubmissionKind, "project" | "feedback" | "procedure"]>)(
    "writes %s submissions into candidate-state tables",
    async (kind, memoryKind) => {
      const seeded = await seedContext(dbEnvironment.connectionString);
      const runtime = createRuntime({
        connectionString: dbEnvironment.connectionString,
        mode: "candidate-only",
      });
      const tool = createCandidateSubmitTool({
        runtime,
        context: {
          sessionId: seeded.sessionId,
          agentId: seeded.agentId,
        },
      });

      const result = await tool.execute("call-1", {
        kind,
        content: `candidate ${kind} content`,
        projectId: seeded.projectId,
        metadata: { source: "integration-test", rank: 1 },
      });

      expect(result.details).toMatchObject({
        accepted: true,
        status: "accepted",
        kind,
        storage: "database",
        reviewState: "candidate",
      });

      const details = result.details as {
        eventId: string;
        memoryObjectId: string;
      };

      const eventRow = await querySingleRow<{
        event_kind: string;
        event_name: string;
        payload: {
          submissionKind: string;
          content: string;
          candidateMetadata: { source: string; rank: number };
        };
      }>(
        dbEnvironment.connectionString,
        `
          select event_kind, event_name, payload
          from memory_middleware.memory_events
          where id = $1
        `,
        [details.eventId],
      );
      const memoryRow = await querySingleRow<{
        memory_kind: string;
        review_state: string;
        content: string;
        source_event_id: string;
      }>(
        dbEnvironment.connectionString,
        `
          select memory_kind, review_state, content, source_event_id::text as source_event_id
          from memory_middleware.memory_objects
          where id = $1
        `,
        [details.memoryObjectId],
      );
      const sourceRow = await querySingleRow<{
        source_kind: string;
        source_table: string;
        source_id: string;
      }>(
        dbEnvironment.connectionString,
        `
          select source_kind, source_table, source_id::text as source_id
          from memory_middleware.memory_sources
          where memory_object_id = $1
        `,
        [details.memoryObjectId],
      );

      expect(eventRow).toEqual({
        event_kind: "candidate_submission",
        event_name: `candidate_submission.${kind}`,
        payload: {
          submissionKind: kind,
          content: `candidate ${kind} content`,
          candidateMetadata: { source: "integration-test", rank: 1 },
        },
      });
      expect(memoryRow).toEqual({
        memory_kind: memoryKind,
        review_state: "candidate",
        content: `candidate ${kind} content`,
        source_event_id: details.eventId,
      });
      expect(sourceRow).toEqual({
        source_kind: "event",
        source_table: "memory_middleware.memory_events",
        source_id: details.eventId,
      });
    },
  );

  it("stores project fact corrections as project-memory candidates when normalized metadata marks the class", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
      autoPromotionProfile: "explicit-user-preference-v1",
    });
    const tool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });

    const result = await tool.execute("call-project-fact-correction", {
      kind: "correction",
      content: "Project correction [atlas forge]: staging branch is atlas-green.",
      projectId: seeded.projectId,
      metadata: {
        raw: "Actually, for project atlas forge, the staging branch is atlas-green.",
      },
    });

    expect(result.details).toMatchObject({
      accepted: true,
      status: "accepted",
      kind: "correction",
      storage: "database",
      reviewState: "candidate",
    });

    const details = result.details as {
      eventId: string;
      memoryObjectId: string;
    };

    const memoryRow = await querySingleRow<{
      memory_kind: string;
      review_state: string;
      content: string;
      metadata: Record<string, unknown>;
    }>(
      dbEnvironment.connectionString,
      `
        select memory_kind, review_state, content, metadata
        from memory_middleware.memory_objects
        where id = $1
      `,
      [details.memoryObjectId],
    );

    expect(memoryRow).toMatchObject({
      memory_kind: "project",
      review_state: "candidate",
      content: "Project correction [atlas forge]: staging branch is atlas-green.",
      metadata: expect.objectContaining({
        candidateMetadata: expect.objectContaining({
          category: "project_fact_correction",
          source: "conversational_project_fact_correction",
          autoCapture: expect.objectContaining({
            captureClass: "project_fact_correction",
            captureSeam: "model_tool_primary",
            projectScope: "atlas forge",
          }),
        }),
      }),
    });
  });

  it("routes reduced-profile self-improving outputs only through the bounded candidate path", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
      autoPromotionProfile: "explicit-user-preference-v1",
    });
    const tool = createMemorySelfImprovingCaptureCandidateTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);

    const result = await tool.execute("call-self-1", {
      kind: "learning",
      content: "Capture this as a bounded self-improving learning candidate.",
      projectId: seeded.projectId,
      metadata: {
        source: "integration-test",
        trigger: "repeated_mistake",
      },
    });

    expect(result.details).toMatchObject({
      accepted: true,
      status: "accepted",
      kind: "learning",
      target: "candidate_only",
      storage: "database",
      reviewState: "candidate",
    });

    const details = result.details as {
      eventId: string;
      memoryObjectId: string;
    };

    const eventRow = await querySingleRow<{
      event_kind: string;
      event_name: string;
      payload: {
        submissionKind: string;
        candidateMetadata: {
          source: string;
          trigger: string;
          selfImprovingAdaptation: {
            source: string;
            upstreamSkill: string;
            profile: string;
            allowedOutputKind: string;
            outputPosture: string;
          };
        };
      };
      metadata: {
        source: string;
      };
    }>(
      dbEnvironment.connectionString,
      `
        select event_kind, event_name, payload, metadata
        from memory_middleware.memory_events
        where id = $1
      `,
      [details.eventId],
    );
    const memoryRow = await querySingleRow<{
      review_state: string;
      metadata: {
        submissionKind: string;
        candidateMetadata: {
          source: string;
          trigger: string;
          selfImprovingAdaptation: {
            source: string;
            upstreamSkill: string;
            profile: string;
            allowedOutputKind: string;
            outputPosture: string;
          };
        };
      };
    }>(
      dbEnvironment.connectionString,
      `
        select review_state, metadata
        from memory_middleware.memory_objects
        where id = $1
      `,
      [details.memoryObjectId],
    );
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(eventRow).toEqual({
      event_kind: "candidate_submission",
      event_name: "candidate_submission.learning",
      payload: {
        submissionKind: "learning",
        content: "Capture this as a bounded self-improving learning candidate.",
        candidateMetadata: {
          source: "integration-test",
          trigger: "repeated_mistake",
          selfImprovingAdaptation: {
            source: "memory_self_improving_capture_candidate",
            upstreamSkill: "self-improving-agent",
            profile: "reduced_profile_candidate_only",
            allowedOutputKind: "learning",
            outputPosture: "candidate_only",
          },
        },
      },
      metadata: {
        source: "candidate-only-ingress",
      },
    });
    expect(memoryRow).toEqual({
      review_state: "candidate",
      metadata: {
        submissionKind: "learning",
        candidateMetadata: {
          source: "integration-test",
          trigger: "repeated_mistake",
          selfImprovingAdaptation: {
            source: "memory_self_improving_capture_candidate",
            upstreamSkill: "self-improving-agent",
            profile: "reduced_profile_candidate_only",
            allowedOutputKind: "learning",
            outputPosture: "candidate_only",
          },
        },
      },
    });
    expect(countsBefore).toEqual({
      memory_events: "0",
      memory_objects: "0",
      memory_reviews: "0",
      procedures: "0",
      procedure_runs: "0",
      skill_candidates: "0",
      memory_links: "0",
      memory_sources: "0",
      background_jobs: "0",
    });
    expect(countsAfter).toEqual({
      memory_events: "1",
      memory_objects: "1",
      memory_reviews: "0",
      procedures: "0",
      procedure_runs: "0",
      skill_candidates: "0",
      memory_links: "0",
      memory_sources: "1",
      background_jobs: "0",
    });
  });

  it("blocks forbidden self-improving output targets without touching the database", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const tool = createMemorySelfImprovingCaptureCandidateTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });

    const result = await tool.execute("call-self-2", {
      kind: "improvement",
      content: "Do not allow direct approved output posture.",
      projectId: seeded.projectId,
      requestedOutputPosture: "approved_memory",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "blocked",
      kind: "improvement",
      target: "candidate_only",
      reason: "reduced-profile self-improving adaptation may emit candidate_only outputs only",
      blockedOutputPosture: "approved_memory",
    });

    const counts = await readTableCounts(dbEnvironment.connectionString);
    expect(counts).toEqual({
      memory_events: "0",
      memory_objects: "0",
      memory_reviews: "0",
      procedures: "0",
      procedure_runs: "0",
      skill_candidates: "0",
      memory_links: "0",
      memory_sources: "0",
      background_jobs: "0",
    });
  });

  it("returns disabled for self-improving capture before writing any candidate rows", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const tool = createMemorySelfImprovingCaptureCandidateTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });

    const result = await tool.execute("call-self-3", {
      kind: "correction",
      content: "disabled reduced-profile capture",
      projectId: seeded.projectId,
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      kind: "correction",
      target: "candidate_only",
      reason: "self-improving candidate capture mode is not enabled",
    });

    const counts = await readTableCounts(dbEnvironment.connectionString);
    expect(counts).toEqual({
      memory_events: "0",
      memory_objects: "0",
      memory_reviews: "0",
      procedures: "0",
      procedure_runs: "0",
      skill_candidates: "0",
      memory_links: "0",
      memory_sources: "0",
      background_jobs: "0",
    });
  });

  it("fails cleanly for self-improving capture when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const tool = createMemorySelfImprovingCaptureCandidateTool({ runtime });

    const result = await tool.execute("call-self-4", {
      kind: "procedure",
      content: "should fail cleanly when postgres is unreachable",
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
      kind: "procedure",
      target: "candidate_only",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("fails safely without partial writes when foreign-key references are invalid", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const tool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: randomUUID(),
      },
    });

    const result = await tool.execute("call-2", {
      kind: "learning",
      content: "candidate with missing session",
      sessionId: randomUUID(),
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "failed",
      kind: "learning",
      reason: "candidate submission references a missing project, agent, or session",
    });

    const counts = await querySingleRow<{
      event_count: string;
      memory_count: string;
      source_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select count(*)::text from memory_middleware.memory_events) as event_count,
          (select count(*)::text from memory_middleware.memory_objects) as memory_count,
          (select count(*)::text from memory_middleware.memory_sources) as source_count
      `,
      [],
    );

    expect(counts).toEqual({
      event_count: "0",
      memory_count: "0",
      source_count: "0",
    });
  });

  it("returns disabled before touching the database when candidate ingress is off", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const tool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });

    const result = await tool.execute("call-3", {
      kind: "improvement",
      content: "keep disabled candidate ingress inert",
      projectId: seeded.projectId,
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      kind: "improvement",
      reason: "candidate ingress mode is not enabled",
    });

    const counts = await querySingleRow<{ event_count: string }>(
      dbEnvironment.connectionString,
      `select count(*)::text as event_count from memory_middleware.memory_events`,
      [],
    );
    expect(counts).toEqual({ event_count: "0" });
  });

  it("fails cleanly when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const tool = createCandidateSubmitTool({ runtime });

    const result = await tool.execute("call-4", {
      kind: "correction",
      content: "should fail cleanly when postgres is unreachable",
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
      kind: "correction",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("applies both memory-middleware migrations in the controlled validation environment", () => {
    expect(dbEnvironment.schemaV1MigrationApplied).toBe(true);
    expect(dbEnvironment.securityRetrievalMigrationApplied).toBe(true);
  });

  it("validates the drafted security and retrieval substrate on top of schema-v1", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const client = await connectClient(dbEnvironment.connectionString);
    try {
      const principal = await client.query<{ id: string }>(
        `
          insert into memory_middleware.internal_principals (external_key, display_name)
          values ($1, $2)
          returning id::text as id
        `,
        ["principal-validation", "Validation Principal"],
      );
      const principalId = principal.rows[0]?.id;
      expect(principalId).toBeTruthy();

      await client.query(
        `
          insert into memory_middleware.project_memberships (principal_id, project_id, role)
          values ($1::uuid, $2::uuid, 'reviewer')
        `,
        [principalId, seeded.projectId],
      );

      await client.query(
        `
          select set_config('memory_middleware.principal_external_key', $1, false)
        `,
        ["principal-validation"],
      );

      const approvedMemory = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            title,
            content
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4, $5)
          returning id::text as id
        `,
        [
          seeded.projectId,
          seeded.agentId,
          seeded.sessionId,
          "Validation memory title",
          "Validation memory content",
        ],
      );
      const approvedMemoryId = approvedMemory.rows[0]?.id;
      expect(approvedMemoryId).toBeTruthy();

      await client.query(
        `
          insert into memory_middleware.memory_embeddings (
            memory_object_id,
            embedding_model,
            embedding_version,
            chunk_text
          )
          values ($1::uuid, $2, $3, $4)
        `,
        [approvedMemoryId, "test-model", "v1", "Validation memory content"],
      );

      const substrate = await client.query<{
        has_pg_trgm: boolean;
        has_vector: boolean;
        memory_objects_rls: boolean;
        procedures_rls: boolean;
        internal_principals_rls: boolean;
        approved_view_exists: boolean;
        reviewable_candidates_view_exists: boolean;
        procedure_drafts_view_exists: boolean;
        project_search_column_exists: boolean;
        memory_objects_search_column_exists: boolean;
        procedures_search_column_exists: boolean;
        skill_candidates_search_column_exists: boolean;
        embeddings_table_exists: boolean;
        memory_objects_search_idx_exists: boolean;
        procedures_trigram_idx_exists: boolean;
        skill_candidates_search_idx_exists: boolean;
        policy_scope_idx_exists: boolean;
        current_principal_id: string | null;
        project_access: boolean;
        project_review_access: boolean;
        approved_view_rows: string;
        memory_embeddings_rows: string;
        memory_objects_policy_count: string;
        procedures_policy_count: string;
      }>(
        `
          with extension_status as (
            select
              exists(select 1 from pg_extension where extname = 'pg_trgm') as has_pg_trgm,
              exists(select 1 from pg_extension where extname = 'vector') as has_vector
          ),
          table_rls as (
            select
              max(case when c.relname = 'memory_objects' then c.relrowsecurity::int else 0 end)::boolean as memory_objects_rls,
              max(case when c.relname = 'procedures' then c.relrowsecurity::int else 0 end)::boolean as procedures_rls,
              max(case when c.relname = 'internal_principals' then c.relrowsecurity::int else 0 end)::boolean as internal_principals_rls
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'memory_middleware'
              and c.relname in ('memory_objects', 'procedures', 'internal_principals')
          ),
          view_status as (
            select
              exists(select 1 from pg_views where schemaname = 'memory_middleware' and viewname = 'internal_approved_memory_v') as approved_view_exists,
              exists(select 1 from pg_views where schemaname = 'memory_middleware' and viewname = 'internal_reviewable_candidates_v') as reviewable_candidates_view_exists,
              exists(select 1 from pg_views where schemaname = 'memory_middleware' and viewname = 'internal_procedure_drafts_v') as procedure_drafts_view_exists
          ),
          column_status as (
            select
              exists(select 1 from information_schema.columns where table_schema = 'memory_middleware' and table_name = 'projects' and column_name = 'search_document') as project_search_column_exists,
              exists(select 1 from information_schema.columns where table_schema = 'memory_middleware' and table_name = 'memory_objects' and column_name = 'search_document') as memory_objects_search_column_exists,
              exists(select 1 from information_schema.columns where table_schema = 'memory_middleware' and table_name = 'procedures' and column_name = 'search_document') as procedures_search_column_exists,
              exists(select 1 from information_schema.columns where table_schema = 'memory_middleware' and table_name = 'skill_candidates' and column_name = 'search_document') as skill_candidates_search_column_exists,
              exists(select 1 from information_schema.tables where table_schema = 'memory_middleware' and table_name = 'memory_embeddings') as embeddings_table_exists
          ),
          index_status as (
            select
              exists(select 1 from pg_indexes where schemaname = 'memory_middleware' and indexname = 'memory_middleware_memory_objects_search_document_idx') as memory_objects_search_idx_exists,
              exists(select 1 from pg_indexes where schemaname = 'memory_middleware' and indexname = 'memory_middleware_procedures_trigram_idx') as procedures_trigram_idx_exists,
              exists(select 1 from pg_indexes where schemaname = 'memory_middleware' and indexname = 'memory_middleware_skill_candidates_search_document_idx') as skill_candidates_search_idx_exists,
              exists(select 1 from pg_indexes where schemaname = 'memory_middleware' and indexname = 'memory_middleware_policy_scope_memberships_principal_scope_idx') as policy_scope_idx_exists
          ),
          helper_status as (
            select
              memory_middleware.current_principal_id()::text as current_principal_id,
              memory_middleware.has_project_access($1::uuid) as project_access,
              memory_middleware.has_project_review_access($1::uuid) as project_review_access
          ),
          view_counts as (
            select
              (select count(*)::text from memory_middleware.internal_approved_memory_v where id = $2::uuid) as approved_view_rows,
              (select count(*)::text from memory_middleware.memory_embeddings where memory_object_id = $2::uuid) as memory_embeddings_rows
          ),
          policy_counts as (
            select
              (select count(*)::text from pg_policies where schemaname = 'memory_middleware' and tablename = 'memory_objects') as memory_objects_policy_count,
              (select count(*)::text from pg_policies where schemaname = 'memory_middleware' and tablename = 'procedures') as procedures_policy_count
          )
          select *
          from extension_status, table_rls, view_status, column_status, index_status, helper_status, view_counts, policy_counts
        `,
        [seeded.projectId, approvedMemoryId],
      );

      expect(substrate.rows[0]).toMatchObject({
        has_pg_trgm: true,
        has_vector: true,
        memory_objects_rls: true,
        procedures_rls: true,
        internal_principals_rls: true,
        approved_view_exists: true,
        reviewable_candidates_view_exists: true,
        procedure_drafts_view_exists: true,
        project_search_column_exists: true,
        memory_objects_search_column_exists: true,
        procedures_search_column_exists: true,
        skill_candidates_search_column_exists: true,
        embeddings_table_exists: true,
        memory_objects_search_idx_exists: true,
        procedures_trigram_idx_exists: true,
        skill_candidates_search_idx_exists: true,
        policy_scope_idx_exists: true,
        current_principal_id: principalId,
        project_access: true,
        project_review_access: true,
        approved_view_rows: "1",
        memory_embeddings_rows: "1",
      });
      expect(Number(substrate.rows[0]?.memory_objects_policy_count ?? "0")).toBeGreaterThanOrEqual(
        2,
      );
      expect(Number(substrate.rows[0]?.procedures_policy_count ?? "0")).toBeGreaterThanOrEqual(2);
    } finally {
      await client.end();
    }
  });

  it("lists candidate-state rows without exposing approved-memory behavior", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const listTool = createCandidateListTool({ runtime });

    await submitTool.execute("call-5a", {
      kind: "learning",
      content: "First candidate learning",
      projectId: seeded.projectId,
      metadata: { source: "integration-test", order: 1 },
    });
    await submitTool.execute("call-5b", {
      kind: "procedure",
      content: "Second candidate procedure",
      projectId: seeded.projectId,
      metadata: { source: "integration-test", order: 2 },
    });

    const result = await listTool.execute("call-5c", {
      projectId: seeded.projectId,
      limit: 10,
    });

    expect(result.details).toMatchObject({
      accepted: true,
      status: "ok",
    });
    const details = result.details as {
      accepted: true;
      status: "ok";
      candidates: Array<{
        kind: string;
        reviewState: string;
        content: string;
        eventName: string;
      }>;
    };
    expect(details.candidates).toHaveLength(2);
    expect(details.candidates[0]).toMatchObject({
      kind: "procedure",
      reviewState: "candidate",
      content: "Second candidate procedure",
      eventName: "candidate_submission.procedure",
    });
    expect(details.candidates[1]).toMatchObject({
      kind: "learning",
      reviewState: "candidate",
      content: "First candidate learning",
      eventName: "candidate_submission.learning",
    });
  });

  it("gets a candidate row by memory object id", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const getTool = createCandidateGetTool({ runtime });

    const submitResult = await submitTool.execute("call-6a", {
      kind: "correction",
      content: "Candidate correction to inspect",
      projectId: seeded.projectId,
      metadata: { source: "integration-test" },
    });

    const details = submitResult.details as {
      accepted: true;
      memoryObjectId: string;
    };
    const result = await getTool.execute("call-6b", {
      candidateId: details.memoryObjectId,
    });

    expect(result.details).toMatchObject({
      accepted: true,
      status: "ok",
      candidate: {
        id: details.memoryObjectId,
        kind: "correction",
        memoryKind: "feedback",
        reviewState: "candidate",
        content: "Candidate correction to inspect",
        eventName: "candidate_submission.correction",
      },
    });
  });

  it("returns disabled for candidate queries before touching the database when query mode is off", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const listTool = createCandidateListTool({ runtime });
    const getTool = createCandidateGetTool({ runtime });

    const listResult = await listTool.execute("call-7a", {
      projectId: seeded.projectId,
    });
    const getResult = await getTool.execute("call-7b", {
      candidateId: "00000000-0000-0000-0000-000000000001",
    });

    expect(listResult.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "candidate query mode is not enabled",
    });
    expect(getResult.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "candidate query mode is not enabled",
    });
  });

  it("fails cleanly for candidate queries when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const listTool = createCandidateListTool({ runtime });
    const getTool = createCandidateGetTool({ runtime });

    const listResult = await listTool.execute("call-8a", {
      kind: "improvement",
    });
    const getResult = await getTool.execute("call-8b", {
      candidateId: "00000000-0000-0000-0000-000000000001",
    });

    expect(listResult.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((listResult.details as { reason: string }).reason).toContain("database is unavailable");

    expect(getResult.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((getResult.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("records accepted reviews without promoting the candidate memory object", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });

    const submitResult = await submitTool.execute("call-9a", {
      kind: "learning",
      content: "Candidate to accept without promotion",
      projectId: seeded.projectId,
    });
    const submitDetails = submitResult.details as {
      accepted: true;
      memoryObjectId: string;
    };

    const reviewResult = await reviewTool.execute("call-9b", {
      candidateId: submitDetails.memoryObjectId,
      outcome: "accepted",
      rationale: "Accepted as reviewed candidate material only.",
    });

    expect(reviewResult.details).toEqual({
      accepted: true,
      status: "recorded",
      candidateId: submitDetails.memoryObjectId,
      outcome: "accepted",
      reviewId: expect.any(String),
      memoryObjectStateChanged: false,
      reviewState: "candidate",
    });

    const memoryRow = await querySingleRow<{
      review_state: string;
    }>(
      dbEnvironment.connectionString,
      `
        select review_state
        from memory_middleware.memory_objects
        where id = $1::uuid
      `,
      [submitDetails.memoryObjectId],
    );
    const reviewRow = await querySingleRow<{
      action: string;
      resulting_state: string;
      rationale: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select action, resulting_state, rationale
        from memory_middleware.memory_reviews
        where memory_object_id = $1::uuid
      `,
      [submitDetails.memoryObjectId],
    );

    expect(memoryRow).toEqual({
      review_state: "candidate",
    });
    expect(reviewRow).toEqual({
      action: "approve",
      resulting_state: "approved",
      rationale: "Accepted as reviewed candidate material only.",
    });
  });

  it("records rejected and needs_revision reviews without creating follow-on artifacts", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });

    const rejectedSubmit = await submitTool.execute("call-10a", {
      kind: "correction",
      content: "Candidate to reject",
      projectId: seeded.projectId,
    });
    const rejectedId = (rejectedSubmit.details as { memoryObjectId: string }).memoryObjectId;
    const rejectedReview = await reviewTool.execute("call-10b", {
      candidateId: rejectedId,
      outcome: "rejected",
      rationale: "Rejected due to low-quality evidence.",
    });
    expect(rejectedReview.details).toEqual({
      accepted: true,
      status: "recorded",
      candidateId: rejectedId,
      outcome: "rejected",
      reviewId: expect.any(String),
      memoryObjectStateChanged: true,
      reviewState: "rejected",
    });

    const revisionSubmit = await submitTool.execute("call-10c", {
      kind: "procedure",
      content: "Candidate needing revision",
      projectId: seeded.projectId,
    });
    const revisionId = (revisionSubmit.details as { memoryObjectId: string }).memoryObjectId;
    const revisionReview = await reviewTool.execute("call-10d", {
      candidateId: revisionId,
      outcome: "needs_revision",
      rationale: "Needs clearer steps and validation notes.",
    });
    expect(revisionReview.details).toEqual({
      accepted: true,
      status: "recorded",
      candidateId: revisionId,
      outcome: "needs_revision",
      reviewId: expect.any(String),
      memoryObjectStateChanged: true,
      reviewState: "corrected",
    });

    const stateCounts = await querySingleRow<{
      rejected_state: string;
      corrected_state: string;
      procedures_count: string;
      skill_candidates_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select review_state::text from memory_middleware.memory_objects where id = $1::uuid) as rejected_state,
          (select review_state::text from memory_middleware.memory_objects where id = $2::uuid) as corrected_state,
          (select count(*)::text from memory_middleware.procedures) as procedures_count,
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count
      `,
      [rejectedId, revisionId],
    );
    expect(stateCounts).toEqual({
      rejected_state: "rejected",
      corrected_state: "corrected",
      procedures_count: "0",
      skill_candidates_count: "0",
    });
  });

  it("rejects reviews for non-candidate states", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({ runtime });

    const submitResult = await submitTool.execute("call-11a", {
      kind: "improvement",
      content: "Candidate to reject twice",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;

    await reviewTool.execute("call-11b", {
      candidateId,
      outcome: "rejected",
      rationale: "First review rejects it.",
    });
    const secondReview = await reviewTool.execute("call-11c", {
      candidateId,
      outcome: "accepted",
    });

    expect(secondReview.details).toEqual({
      accepted: false,
      status: "invalid_state",
      reason: "candidate review requires candidate state, found rejected",
    });
  });

  it("returns disabled for candidate reviews before touching the database when review mode is off", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const reviewTool = createCandidateReviewTool({ runtime });

    const result = await reviewTool.execute("call-12", {
      candidateId: seeded.sessionId,
      outcome: "accepted",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "candidate review mode is not enabled",
    });
  });

  it("fails cleanly for candidate reviews when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const reviewTool = createCandidateReviewTool({ runtime });

    const result = await reviewTool.execute("call-13", {
      candidateId: "00000000-0000-0000-0000-000000000001",
      outcome: "accepted",
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("returns advisory memory-promotion planning for accepted learning candidates without writes", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const planTool = createCandidatePromotePlanTool({ runtime });

    const submitResult = await submitTool.execute("call-14a", {
      kind: "learning",
      content: "Accepted learning candidate for planning",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-14b", {
      candidateId,
      outcome: "accepted",
      rationale: "Reviewed and accepted for possible future promotion planning.",
    });

    const countsBefore = await querySingleRow<{
      review_count: string;
      procedures_count: string;
      skill_candidates_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select count(*)::text from memory_middleware.memory_reviews) as review_count,
          (select count(*)::text from memory_middleware.procedures) as procedures_count,
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count
      `,
      [],
    );
    const planResult = await planTool.execute("call-14c", {
      candidateId,
    });
    const countsAfter = await querySingleRow<{
      review_count: string;
      procedures_count: string;
      skill_candidates_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select count(*)::text from memory_middleware.memory_reviews) as review_count,
          (select count(*)::text from memory_middleware.procedures) as procedures_count,
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count
      `,
      [],
    );

    expect(planResult.details).toEqual({
      accepted: true,
      status: "ok",
      candidateId,
      candidateKind: "learning",
      reviewState: "candidate",
      latestReviewOutcome: "accepted",
      eligible: true,
      possibleTargets: ["propose_memory_promotion", "remain_candidate_only"],
      rationale: [
        "candidate has an accepted review outcome",
        "this candidate kind can be considered for a future memory-promotion path",
      ],
      requiredGates: [
        "manual promotion confirmation is still required",
        "bounded memory promotion requires an explicit write tool invocation",
        "policy and review checks must pass before any future promotion write",
      ],
    });
    expect(countsAfter).toEqual(countsBefore);
  });

  it("returns advisory procedure-draft planning for accepted procedure candidates", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const planTool = createCandidatePromotePlanTool({ runtime });

    const submitResult = await submitTool.execute("call-15a", {
      kind: "procedure",
      content: "Accepted procedure candidate for planning",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-15b", {
      candidateId,
      outcome: "accepted",
      rationale: "Procedure candidate reviewed and accepted.",
    });

    const planResult = await planTool.execute("call-15c", {
      candidateId,
    });

    expect(planResult.details).toEqual({
      accepted: true,
      status: "ok",
      candidateId,
      candidateKind: "procedure",
      reviewState: "candidate",
      latestReviewOutcome: "accepted",
      eligible: true,
      possibleTargets: ["propose_procedure_draft", "remain_candidate_only"],
      rationale: [
        "candidate has an accepted review outcome",
        "procedure candidates can be considered for a future procedure-draft path",
      ],
      requiredGates: [
        "manual promotion confirmation is still required",
        "bounded procedure-draft promotion requires an explicit write tool invocation",
        "policy and review checks must pass before any future promotion write",
      ],
    });
  });

  it("keeps unreviewed or needs-revision candidates in candidate-only planning", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const planTool = createCandidatePromotePlanTool({ runtime });

    const unreviewedSubmit = await submitTool.execute("call-16a", {
      kind: "improvement",
      content: "Unreviewed candidate",
      projectId: seeded.projectId,
    });
    const unreviewedId = (unreviewedSubmit.details as { memoryObjectId: string }).memoryObjectId;
    const unreviewedPlan = await planTool.execute("call-16b", {
      candidateId: unreviewedId,
    });

    expect(unreviewedPlan.details).toEqual({
      accepted: true,
      status: "ok",
      candidateId: unreviewedId,
      candidateKind: "improvement",
      reviewState: "candidate",
      eligible: false,
      possibleTargets: ["remain_candidate_only"],
      rationale: [
        "candidate does not yet have an accepted review outcome",
        "promotion planning stays advisory-only until a reviewer accepts the candidate",
      ],
      requiredGates: ["record an accepted candidate review before promotion planning"],
    });

    const revisedSubmit = await submitTool.execute("call-16c", {
      kind: "procedure",
      content: "Needs revision candidate",
      projectId: seeded.projectId,
    });
    const revisedId = (revisedSubmit.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-16d", {
      candidateId: revisedId,
      outcome: "needs_revision",
      rationale: "Needs revision before any planning.",
    });
    const revisedPlan = await planTool.execute("call-16e", {
      candidateId: revisedId,
    });

    expect(revisedPlan.details).toEqual({
      accepted: true,
      status: "ok",
      candidateId: revisedId,
      candidateKind: "procedure",
      reviewState: "corrected",
      latestReviewOutcome: "needs_revision",
      eligible: false,
      possibleTargets: ["remain_candidate_only"],
      rationale: [
        "candidate has a needs-revision review outcome",
        "candidates needing revision are not eligible for promotion planning until reviewed again",
      ],
      requiredGates: [
        "revise the candidate content",
        "record a fresh accepted review outcome before promotion planning",
      ],
    });
  });

  it("promotes an accepted learning candidate into bounded durable memory without creating downstream artifacts", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteMemoryTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });

    const submitResult = await submitTool.execute("call-16f", {
      kind: "learning",
      content: "Accepted learning candidate for bounded durable memory promotion",
      projectId: seeded.projectId,
      metadata: { source: "integration-test" },
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;
    const sourceEventId = (submitResult.details as { eventId: string }).eventId;

    const acceptedReview = await reviewTool.execute("call-16g", {
      candidateId,
      outcome: "accepted",
      rationale: "Accepted for bounded durable memory promotion.",
    });
    const acceptedReviewId = (acceptedReview.details as { reviewId: string }).reviewId;

    const promoteResult = await promoteTool.execute("call-16h", {
      candidateId,
      rationale: "Manual promotion into approved durable memory.",
      metadata: {
        source: "integration-test",
        reason: "bounded-memory-promotion",
      },
    });

    expect(promoteResult.details).toMatchObject({
      accepted: true,
      status: "promoted",
      candidateId,
      promotedMemoryKind: "project",
      promotedReviewState: "approved",
      sourceEventId,
    });

    const promotedMemoryObjectId = (promoteResult.details as { promotedMemoryObjectId: string })
      .promotedMemoryObjectId;
    const promotedRow = await querySingleRow<{
      candidate_state: string;
      promoted_review_state: string;
      promoted_memory_kind: string;
      promoted_source_event_id: string;
      promoted_from_candidate_id: string | null;
      promoted_from_review_id: string | null;
      memory_source_count: string;
      memory_link_count: string;
      procedures_count: string;
      skill_candidates_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select review_state::text from memory_middleware.memory_objects where id = $1::uuid) as candidate_state,
          (select review_state::text from memory_middleware.memory_objects where id = $2::uuid) as promoted_review_state,
          (select memory_kind::text from memory_middleware.memory_objects where id = $2::uuid) as promoted_memory_kind,
          (select source_event_id::text from memory_middleware.memory_objects where id = $2::uuid) as promoted_source_event_id,
          (select metadata->>'promotedFromCandidateId' from memory_middleware.memory_objects where id = $2::uuid) as promoted_from_candidate_id,
          (select metadata->>'promotedFromReviewId' from memory_middleware.memory_objects where id = $2::uuid) as promoted_from_review_id,
          (select count(*)::text from memory_middleware.memory_sources where memory_object_id = $2::uuid) as memory_source_count,
          (select count(*)::text from memory_middleware.memory_links where source_memory_object_id = $2::uuid and target_memory_object_id = $1::uuid) as memory_link_count,
          (select count(*)::text from memory_middleware.procedures) as procedures_count,
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count
      `,
      [candidateId, promotedMemoryObjectId],
    );

    expect(promotedRow).toEqual({
      candidate_state: "candidate",
      promoted_review_state: "approved",
      promoted_memory_kind: "project",
      promoted_source_event_id: sourceEventId,
      promoted_from_candidate_id: candidateId,
      promoted_from_review_id: acceptedReviewId,
      memory_source_count: "2",
      memory_link_count: "1",
      procedures_count: "0",
      skill_candidates_count: "0",
    });
  });

  it("returns already_promoted on repeated bounded memory promotion for the same candidate", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteMemoryTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });

    const submitResult = await submitTool.execute("call-16i", {
      kind: "correction",
      content: "Accepted correction candidate for duplicate-promotion handling",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;

    await reviewTool.execute("call-16j", {
      candidateId,
      outcome: "accepted",
      rationale: "Accepted for bounded memory promotion.",
    });

    const firstPromotion = await promoteTool.execute("call-16k", {
      candidateId,
    });
    const secondPromotion = await promoteTool.execute("call-16l", {
      candidateId,
    });

    const promotedMemoryObjectId = (firstPromotion.details as { promotedMemoryObjectId: string })
      .promotedMemoryObjectId;

    expect(firstPromotion.details).toMatchObject({
      accepted: true,
      status: "promoted",
      candidateId,
      promotedMemoryKind: "feedback",
    });
    expect(secondPromotion.details).toEqual({
      accepted: true,
      status: "already_promoted",
      candidateId,
      promotedMemoryObjectId,
      promotedMemoryKind: "feedback",
      promotedReviewState: "approved",
      sourceEventId: (firstPromotion.details as { sourceEventId: string }).sourceEventId,
    });

    const counts = await querySingleRow<{
      promoted_rows: string;
      memory_source_count: string;
      memory_link_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select count(*)::text from memory_middleware.memory_objects where metadata->>'promotedFromCandidateId' = $1 and review_state = 'approved') as promoted_rows,
          (select count(*)::text from memory_middleware.memory_sources where memory_object_id = $2::uuid) as memory_source_count,
          (select count(*)::text from memory_middleware.memory_links where source_memory_object_id = $2::uuid and target_memory_object_id = $1::uuid) as memory_link_count
      `,
      [candidateId, promotedMemoryObjectId],
    );

    expect(counts).toEqual({
      promoted_rows: "1",
      memory_source_count: "2",
      memory_link_count: "1",
    });
  });

  it("supersedes older approved feedback when a reviewed correction promotion targets the same bounded subject", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteMemoryTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });

    const originalSubjectKey = "bounded-subject-proof-key";
    const firstSubmit = await submitTool.execute("call-16m-s4", {
      kind: "learning",
      content: "User preference: preferred proof lantern is ember tide.",
      projectId: seeded.projectId,
      metadata: {
        category: "user_preference",
        source: "explicit_user_statement",
        autoCapture: {
          subjectKey: originalSubjectKey,
          key: "bounded-preference-original",
        },
      },
    });
    const firstCandidateId = (firstSubmit.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-16n-s4", {
      candidateId: firstCandidateId,
      outcome: "accepted",
      rationale: "Accept original preference for bounded proof.",
    });
    const firstPromotion = await promoteTool.execute("call-16o-s4", {
      candidateId: firstCandidateId,
    });
    const firstApprovedId = (firstPromotion.details as { promotedMemoryObjectId: string })
      .promotedMemoryObjectId;

    const correctionSubmit = await submitTool.execute("call-16p-s4", {
      kind: "correction",
      content: "User correction: preferred proof lantern is moon ash glow.",
      projectId: seeded.projectId,
      metadata: {
        category: "user_preference_correction",
        source: "conversational_user_correction",
        autoCapture: {
          subjectKey: originalSubjectKey,
          key: "bounded-preference-correction",
        },
      },
    });
    const correctionCandidateId = (correctionSubmit.details as { memoryObjectId: string })
      .memoryObjectId;
    await reviewTool.execute("call-16q-s4", {
      candidateId: correctionCandidateId,
      outcome: "accepted",
      rationale: "Accept corrected preference for bounded proof.",
    });
    const correctionPromotion = await promoteTool.execute("call-16r-s4", {
      candidateId: correctionCandidateId,
    });
    const correctedApprovedId = (correctionPromotion.details as { promotedMemoryObjectId: string })
      .promotedMemoryObjectId;

    const supersession = await querySingleRow<{
      original_review_state: string;
      original_superseded_by: string | null;
      corrected_review_state: string;
      supersedes_link_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select review_state::text from memory_middleware.memory_objects where id = $1::uuid) as original_review_state,
          (select metadata->>'supersededByObjectId' from memory_middleware.memory_objects where id = $1::uuid) as original_superseded_by,
          (select review_state::text from memory_middleware.memory_objects where id = $2::uuid) as corrected_review_state,
          (
            select count(*)::text
            from memory_middleware.memory_links
            where source_memory_object_id = $1::uuid
              and target_memory_object_id = $2::uuid
              and link_kind = 'supersedes'
          ) as supersedes_link_count
      `,
      [firstApprovedId, correctedApprovedId],
    );

    expect(supersession).toEqual({
      original_review_state: "superseded",
      original_superseded_by: correctedApprovedId,
      corrected_review_state: "approved",
      supersedes_link_count: "1",
    });
  });

  it("auto-promotes bounded response-style correction overrides even when the tool call drifted to learning", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
      autoPromotionProfile: "explicit-user-preference-v1",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });

    const submitResult = await submitTool.execute("call-16s-s7", {
      kind: "learning",
      content: "User prefers bullet-point responses.",
      projectId: seeded.projectId,
      metadata: {
        raw: "No, use bullet points for me.",
      },
    });
    expect(submitResult.details).toMatchObject({
      accepted: true,
      kind: "correction",
      reviewState: "approved",
      memoryObjectId: expect.any(String),
    });
    const promotedMemoryObjectId = (submitResult.details as { memoryObjectId: string })
      .memoryObjectId;

    const row = await querySingleRow<{
      submission_kind: string;
      content: string;
      review_state: string;
      category: string | null;
      template: string | null;
      from_kind: string | null;
      to_kind: string | null;
      promotion_profile: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          metadata->>'submissionKind' as submission_kind,
          content,
          review_state::text as review_state,
          metadata->'candidateMetadata'->>'category' as category,
          metadata->'candidateMetadata'->'autoCapture'->>'template' as template,
          metadata->'candidateMetadata'->'classificationAdjustment'->>'fromKind' as from_kind,
          metadata->'candidateMetadata'->'classificationAdjustment'->>'toKind' as to_kind,
          metadata->'promotionMetadata'->'autoPromotion'->>'profile' as promotion_profile
        from memory_middleware.memory_objects
        where id = $1::uuid
      `,
      [promotedMemoryObjectId],
    );

    expect(row).toEqual({
      submission_kind: "correction",
      content: "User correction: use bullet points when listing items.",
      review_state: "approved",
      category: "user_requirement_correction",
      template: "responses_bullets",
      from_kind: "learning",
      to_kind: "correction",
      promotion_profile: "explicit-user-preference-v1",
    });
  });

  it("promotes a medium-confidence response-style candidate after later confirming evidence without manual review", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
      autoPromotionProfile: "explicit-user-preference-v1",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });

    const initialSubmit = await submitTool.execute("call-16s-semantic-medium", {
      kind: "learning",
      content: "can you use bullets",
      projectId: seeded.projectId,
    });
    const candidateId = (initialSubmit.details as { memoryObjectId: string }).memoryObjectId;

    const initialRow = await querySingleRow<{
      review_state: string;
      content: string;
      template: string | null;
      lifecycle_state: string | null;
      lifecycle_confidence: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          review_state::text as review_state,
          content,
          metadata->'candidateMetadata'->'autoCapture'->>'template' as template,
          metadata->'candidateMetadata'->'candidateLifecycle'->>'state' as lifecycle_state,
          metadata->'candidateMetadata'->'candidateLifecycle'->>'confidence' as lifecycle_confidence
        from memory_middleware.memory_objects
        where id = $1::uuid
      `,
      [candidateId],
    );

    expect(initialRow).toEqual({
      review_state: "candidate",
      content: "can you use bullets",
      template: "responses_bullets",
      lifecycle_state: "pending_confirmation",
      lifecycle_confidence: "medium",
    });

    const client = await connectClient(dbEnvironment.connectionString);
    try {
      await client.query(
        `
          update memory_middleware.memory_objects
          set
            created_at = now() - interval '10 seconds',
            updated_at = now() - interval '10 seconds'
          where id = $1::uuid
        `,
        [candidateId],
      );
    } finally {
      await client.end();
    }

    const confirmingSubmit = await submitTool.execute("call-16t-semantic-confirm", {
      kind: "learning",
      content: "use bullets when listing",
      projectId: seeded.projectId,
    });

    expect(confirmingSubmit.details).toMatchObject({
      accepted: true,
      kind: "learning",
      reviewState: "approved",
      memoryObjectId: expect.any(String),
    });
    const promotedMemoryObjectId = (confirmingSubmit.details as { memoryObjectId: string })
      .memoryObjectId;

    const confirmedRow = await querySingleRow<{
      candidate_review_state: string;
      review_state: string;
      object_count: string;
      promotion_profile: string | null;
      confirmation_state: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select review_state::text from memory_middleware.memory_objects where id = $1::uuid) as candidate_review_state,
          (select review_state::text from memory_middleware.memory_objects where id = $2::uuid) as review_state,
          (
            select count(*)::text
            from memory_middleware.memory_objects
            where metadata->'candidateMetadata'->'autoCapture'->>'key' =
              (
                select metadata->'candidateMetadata'->'autoCapture'->>'key'
                from memory_middleware.memory_objects
                where id = $1::uuid
              )
          ) as object_count,
          (select metadata->'promotionMetadata'->'autoPromotion'->>'profile'
            from memory_middleware.memory_objects where id = $2::uuid) as promotion_profile,
          (select metadata->'promotionMetadata'->'candidateConfirmation'->>'state'
            from memory_middleware.memory_objects where id = $2::uuid) as confirmation_state
      `,
      [candidateId, promotedMemoryObjectId],
    );

    expect(confirmedRow).toEqual({
      candidate_review_state: "candidate",
      review_state: "approved",
      object_count: "2",
      promotion_profile: "response_style_confirmation_v1",
      confirmation_state: "confirmed",
    });
  });

  it("promotes a medium-confidence project fact candidate after later confirming evidence without manual review", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
      autoPromotionProfile: "explicit-user-preference-v1",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });

    const initialSubmit = await submitTool.execute("call-16s-project-fact-medium", {
      kind: "learning",
      content: "For project atlas forge, we use pnpm.",
      projectId: seeded.projectId,
    });
    const candidateId = (initialSubmit.details as { memoryObjectId: string }).memoryObjectId;

    const initialRow = await querySingleRow<{
      review_state: string;
      field_key: string | null;
      lifecycle_state: string | null;
      lifecycle_confidence: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          review_state::text as review_state,
          metadata->'candidateMetadata'->'autoCapture'->>'fieldKey' as field_key,
          metadata->'candidateMetadata'->'candidateLifecycle'->>'state' as lifecycle_state,
          metadata->'candidateMetadata'->'candidateLifecycle'->>'confidence' as lifecycle_confidence
        from memory_middleware.memory_objects
        where id = $1::uuid
      `,
      [candidateId],
    );

    expect(initialRow).toEqual({
      review_state: "candidate",
      field_key: "primary_package_manager",
      lifecycle_state: "pending_confirmation",
      lifecycle_confidence: "medium",
    });

    const client = await connectClient(dbEnvironment.connectionString);
    try {
      await client.query(
        `
          update memory_middleware.memory_objects
          set
            created_at = now() - interval '10 seconds',
            updated_at = now() - interval '10 seconds'
          where id = $1::uuid
        `,
        [candidateId],
      );
    } finally {
      await client.end();
    }

    const confirmingSubmit = await submitTool.execute("call-16t-project-fact-confirm", {
      kind: "learning",
      content: "For project atlas forge, the package manager is pnpm.",
      projectId: seeded.projectId,
    });

    expect(confirmingSubmit.details).toMatchObject({
      accepted: true,
      kind: "learning",
      reviewState: "approved",
      memoryObjectId: expect.any(String),
    });
    const promotedMemoryObjectId = (confirmingSubmit.details as { memoryObjectId: string })
      .memoryObjectId;

    const confirmedRow = await querySingleRow<{
      candidate_review_state: string;
      review_state: string;
      object_count: string;
      promotion_profile: string | null;
      confirmation_state: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select review_state::text from memory_middleware.memory_objects where id = $1::uuid) as candidate_review_state,
          (select review_state::text from memory_middleware.memory_objects where id = $2::uuid) as review_state,
          (
            select count(*)::text
            from memory_middleware.memory_objects
            where metadata->'candidateMetadata'->'autoCapture'->>'key' =
              (
                select metadata->'candidateMetadata'->'autoCapture'->>'key'
                from memory_middleware.memory_objects
                where id = $1::uuid
              )
          ) as object_count,
          (select metadata->'promotionMetadata'->'autoPromotion'->>'profile'
            from memory_middleware.memory_objects where id = $2::uuid) as promotion_profile,
          (select metadata->'promotionMetadata'->'candidateConfirmation'->>'state'
            from memory_middleware.memory_objects where id = $2::uuid) as confirmation_state
      `,
      [candidateId, promotedMemoryObjectId],
    );

    expect(confirmedRow).toEqual({
      candidate_review_state: "candidate",
      review_state: "approved",
      object_count: "2",
      promotion_profile: "project_fact_confirmation_v1",
      confirmation_state: "confirmed",
    });
  });

  it("promotes a medium-confidence workflow-improvement candidate after later confirming evidence without manual review", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
      autoPromotionProfile: "explicit-user-preference-v1",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });

    const initialSubmit = await submitTool.execute("call-16s-workflow-medium", {
      kind: "improvement",
      content: "raw vitest skips the wrapper here, so use pnpm test",
      projectId: seeded.projectId,
    });
    const candidateId = (initialSubmit.details as { memoryObjectId: string }).memoryObjectId;

    const initialRow = await querySingleRow<{
      review_state: string;
      lesson_key: string | null;
      lifecycle_state: string | null;
      lifecycle_confidence: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          review_state::text as review_state,
          metadata->'candidateMetadata'->'autoCapture'->>'lessonKey' as lesson_key,
          metadata->'candidateMetadata'->'candidateLifecycle'->>'state' as lifecycle_state,
          metadata->'candidateMetadata'->'candidateLifecycle'->>'confidence' as lifecycle_confidence
        from memory_middleware.memory_objects
        where id = $1::uuid
      `,
      [candidateId],
    );

    expect(initialRow).toEqual({
      review_state: "candidate",
      lesson_key: "vitest_wrapper_required",
      lifecycle_state: "pending_confirmation",
      lifecycle_confidence: "medium",
    });

    const client = await connectClient(dbEnvironment.connectionString);
    try {
      await client.query(
        `
          update memory_middleware.memory_objects
          set
            created_at = now() - interval '10 seconds',
            updated_at = now() - interval '10 seconds'
          where id = $1::uuid
        `,
        [candidateId],
      );
    } finally {
      await client.end();
    }

    const confirmingSubmit = await submitTool.execute("call-16t-workflow-confirm", {
      kind: "improvement",
      content: "Use pnpm test -- src/foo.test.ts instead of raw vitest here.",
      projectId: seeded.projectId,
    });

    expect(confirmingSubmit.details).toMatchObject({
      accepted: true,
      kind: "improvement",
      reviewState: "approved",
      memoryObjectId: expect.any(String),
    });
    const promotedMemoryObjectId = (confirmingSubmit.details as { memoryObjectId: string })
      .memoryObjectId;

    const confirmedRow = await querySingleRow<{
      candidate_review_state: string;
      review_state: string;
      object_count: string;
      promotion_profile: string | null;
      confirmation_state: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select review_state::text from memory_middleware.memory_objects where id = $1::uuid) as candidate_review_state,
          (select review_state::text from memory_middleware.memory_objects where id = $2::uuid) as review_state,
          (
            select count(*)::text
            from memory_middleware.memory_objects
            where metadata->'candidateMetadata'->'autoCapture'->>'key' =
              (
                select metadata->'candidateMetadata'->'autoCapture'->>'key'
                from memory_middleware.memory_objects
                where id = $1::uuid
              )
          ) as object_count,
          (select metadata->'promotionMetadata'->'autoPromotion'->>'profile'
            from memory_middleware.memory_objects where id = $2::uuid) as promotion_profile,
          (select metadata->'promotionMetadata'->'candidateConfirmation'->>'state'
            from memory_middleware.memory_objects where id = $2::uuid) as confirmation_state
      `,
      [candidateId, promotedMemoryObjectId],
    );

    expect(confirmedRow).toEqual({
      candidate_review_state: "candidate",
      review_state: "approved",
      object_count: "2",
      promotion_profile: "workflow_improvement_confirmation_v1",
      confirmation_state: "confirmed",
    });
  });

  it("allows the same bounded workflow-improvement lesson in a different project", async () => {
    const firstProject = await seedContext(dbEnvironment.connectionString);
    const secondProject = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
      autoPromotionProfile: "explicit-user-preference-v1",
    });
    const firstSubmitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: firstProject.sessionId,
        agentId: firstProject.agentId,
      },
    });
    const secondSubmitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: secondProject.sessionId,
        agentId: secondProject.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: firstProject.agentId,
      },
    });
    const promoteTool = createCandidatePromoteMemoryTool({
      runtime,
      context: {
        agentId: firstProject.agentId,
      },
    });

    const firstSubmit = await firstSubmitTool.execute("call-16u-workflow-project-a", {
      kind: "improvement",
      content: "Use pnpm test -- src/foo.test.ts instead of raw vitest here.",
      projectId: firstProject.projectId,
    });
    const firstCandidateId = (firstSubmit.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-16u-workflow-project-b", {
      candidateId: firstCandidateId,
      outcome: "accepted",
    });
    await promoteTool.execute("call-16u-workflow-project-c", {
      candidateId: firstCandidateId,
    });

    const secondSubmit = await secondSubmitTool.execute("call-16u-workflow-project-d", {
      kind: "improvement",
      content: "raw vitest skips the wrapper here, so use pnpm test",
      projectId: secondProject.projectId,
    });

    expect(secondSubmit.details).toMatchObject({
      accepted: true,
      kind: "improvement",
      reviewState: "candidate",
      memoryObjectId: expect.any(String),
    });

    const secondCandidateId = (secondSubmit.details as { memoryObjectId: string }).memoryObjectId;
    const secondRow = await querySingleRow<{
      project_id: string;
      review_state: string;
      lesson_key: string | null;
      lifecycle_state: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          project_id::text as project_id,
          review_state::text as review_state,
          metadata->'candidateMetadata'->'autoCapture'->>'lessonKey' as lesson_key,
          metadata->'candidateMetadata'->'candidateLifecycle'->>'state' as lifecycle_state
        from memory_middleware.memory_objects
        where id = $1::uuid
      `,
      [secondCandidateId],
    );

    expect(secondRow).toEqual({
      project_id: secondProject.projectId,
      review_state: "candidate",
      lesson_key: "vitest_wrapper_required",
      lifecycle_state: "pending_confirmation",
    });
  });

  it("promotes a medium-confidence environment-constraint candidate after later confirming evidence without manual review", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
      autoPromotionProfile: "explicit-user-preference-v1",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });

    const initialSubmit = await submitTool.execute("call-16u-env-medium", {
      kind: "improvement",
      content: "python isn't available on this host, so use node instead.",
      projectId: seeded.projectId,
    });
    const candidateId = (initialSubmit.details as { memoryObjectId: string }).memoryObjectId;

    const initialRow = await querySingleRow<{
      review_state: string;
      lesson_key: string | null;
      lifecycle_state: string | null;
      lifecycle_confidence: string | null;
      capture_class: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          review_state::text as review_state,
          metadata->'candidateMetadata'->'autoCapture'->>'lessonKey' as lesson_key,
          metadata->'candidateMetadata'->'candidateLifecycle'->>'state' as lifecycle_state,
          metadata->'candidateMetadata'->'candidateLifecycle'->>'confidence' as lifecycle_confidence,
          metadata->'candidateMetadata'->'autoCapture'->>'captureClass' as capture_class
        from memory_middleware.memory_objects
        where id = $1::uuid
      `,
      [candidateId],
    );

    expect(initialRow).toEqual({
      review_state: "candidate",
      lesson_key: "python_command_unavailable",
      lifecycle_state: "pending_confirmation",
      lifecycle_confidence: "medium",
      capture_class: "workflow_environment_constraint",
    });

    const client = await connectClient(dbEnvironment.connectionString);
    try {
      await client.query(
        `
          update memory_middleware.memory_objects
          set
            created_at = now() - interval '10 seconds',
            updated_at = now() - interval '10 seconds'
          where id = $1::uuid
        `,
        [candidateId],
      );
    } finally {
      await client.end();
    }

    const confirmingSubmit = await submitTool.execute("call-16u-env-confirm", {
      kind: "improvement",
      content: "Use node --input-type=module or tsx here because python command is not available.",
      projectId: seeded.projectId,
    });

    expect(confirmingSubmit.details).toMatchObject({
      accepted: true,
      kind: "improvement",
      reviewState: "approved",
      memoryObjectId: expect.any(String),
    });
    const promotedMemoryObjectId = (confirmingSubmit.details as { memoryObjectId: string })
      .memoryObjectId;

    const confirmedRow = await querySingleRow<{
      candidate_review_state: string;
      review_state: string;
      object_count: string;
      promotion_profile: string | null;
      confirmation_state: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select review_state::text from memory_middleware.memory_objects where id = $1::uuid) as candidate_review_state,
          (select review_state::text from memory_middleware.memory_objects where id = $2::uuid) as review_state,
          (
            select count(*)::text
            from memory_middleware.memory_objects
            where metadata->'candidateMetadata'->'autoCapture'->>'key' =
              (
                select metadata->'candidateMetadata'->'autoCapture'->>'key'
                from memory_middleware.memory_objects
                where id = $1::uuid
              )
          ) as object_count,
          (select metadata->'promotionMetadata'->'autoPromotion'->>'profile'
            from memory_middleware.memory_objects where id = $2::uuid) as promotion_profile,
          (select metadata->'promotionMetadata'->'candidateConfirmation'->>'state'
            from memory_middleware.memory_objects where id = $2::uuid) as confirmation_state
      `,
      [candidateId, promotedMemoryObjectId],
    );

    expect(confirmedRow).toEqual({
      candidate_review_state: "candidate",
      review_state: "approved",
      object_count: "2",
      promotion_profile: "workflow_improvement_confirmation_v1",
      confirmation_state: "confirmed",
    });
  });

  it("promotes a medium-confidence API workaround candidate after later confirming evidence without manual review", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
      autoPromotionProfile: "explicit-user-preference-v1",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });

    const initialSubmit = await submitTool.execute("call-16u-api-medium", {
      kind: "improvement",
      content:
        "Semantic memory search with Codex OAuth keeps coming back to the OpenAI API key here.",
      projectId: seeded.projectId,
    });
    const candidateId = (initialSubmit.details as { memoryObjectId: string }).memoryObjectId;

    const initialRow = await querySingleRow<{
      review_state: string;
      lesson_key: string | null;
      lifecycle_state: string | null;
      lifecycle_confidence: string | null;
      capture_class: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          review_state::text as review_state,
          metadata->'candidateMetadata'->'autoCapture'->>'lessonKey' as lesson_key,
          metadata->'candidateMetadata'->'candidateLifecycle'->>'state' as lifecycle_state,
          metadata->'candidateMetadata'->'candidateLifecycle'->>'confidence' as lifecycle_confidence,
          metadata->'candidateMetadata'->'autoCapture'->>'captureClass' as capture_class
        from memory_middleware.memory_objects
        where id = $1::uuid
      `,
      [candidateId],
    );

    expect(initialRow).toEqual({
      review_state: "candidate",
      lesson_key: "openai_embeddings_api_key_required",
      lifecycle_state: "pending_confirmation",
      lifecycle_confidence: "medium",
      capture_class: "workflow_api_workaround",
    });

    const client = await connectClient(dbEnvironment.connectionString);
    try {
      await client.query(
        `
          update memory_middleware.memory_objects
          set
            created_at = now() - interval '10 seconds',
            updated_at = now() - interval '10 seconds'
          where id = $1::uuid
        `,
        [candidateId],
      );
    } finally {
      await client.end();
    }

    const confirmingSubmit = await submitTool.execute("call-16u-api-confirm", {
      kind: "improvement",
      content:
        "Codex OAuth does not help for OpenAI embeddings here; semantic memory search still needs a real OPENAI_API_KEY.",
      projectId: seeded.projectId,
    });

    expect(confirmingSubmit.details).toMatchObject({
      accepted: true,
      kind: "improvement",
      reviewState: "approved",
      memoryObjectId: expect.any(String),
    });
    const promotedMemoryObjectId = (confirmingSubmit.details as { memoryObjectId: string })
      .memoryObjectId;

    const confirmedRow = await querySingleRow<{
      candidate_review_state: string;
      review_state: string;
      object_count: string;
      promotion_profile: string | null;
      confirmation_state: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select review_state::text from memory_middleware.memory_objects where id = $1::uuid) as candidate_review_state,
          (select review_state::text from memory_middleware.memory_objects where id = $2::uuid) as review_state,
          (
            select count(*)::text
            from memory_middleware.memory_objects
            where metadata->'candidateMetadata'->'autoCapture'->>'key' =
              (
                select metadata->'candidateMetadata'->'autoCapture'->>'key'
                from memory_middleware.memory_objects
                where id = $1::uuid
              )
          ) as object_count,
          (select metadata->'promotionMetadata'->'autoPromotion'->>'profile'
            from memory_middleware.memory_objects where id = $2::uuid) as promotion_profile,
          (select metadata->'promotionMetadata'->'candidateConfirmation'->>'state'
            from memory_middleware.memory_objects where id = $2::uuid) as confirmation_state
      `,
      [candidateId, promotedMemoryObjectId],
    );

    expect(confirmedRow).toEqual({
      candidate_review_state: "candidate",
      review_state: "approved",
      object_count: "2",
      promotion_profile: "workflow_improvement_confirmation_v1",
      confirmation_state: "confirmed",
    });
  });

  it("auto-promotes a generalized workflow lesson cluster after later compatible evidence and retrieves it through approved-only hybrid", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
      autoPromotionProfile: "explicit-user-preference-v1",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const searchTool = createMemoryObjectSearchHybridTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      } as never,
    });

    const initialSubmit = await submitTool.execute("call-generic-auto-review-1", {
      kind: "improvement",
      content:
        "For release proof notes here, use bulletized proof IDs instead of paraphrased rollout summaries.",
      projectId: seeded.projectId,
    });
    const candidateId = (initialSubmit.details as { memoryObjectId: string }).memoryObjectId;

    const initialRow = await querySingleRow<{
      review_state: string;
      lesson_family: string | null;
      lifecycle_state: string | null;
      cluster_key: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          review_state::text as review_state,
          metadata->'candidateMetadata'->'autoCapture'->>'lessonFamily' as lesson_family,
          metadata->'candidateMetadata'->'candidateLifecycle'->>'state' as lifecycle_state,
          metadata->'candidateMetadata'->'candidateLifecycle'->>'clusterKey' as cluster_key
        from memory_middleware.memory_objects
        where id = $1::uuid
      `,
      [candidateId],
    );

    expect(initialRow).toEqual({
      review_state: "candidate",
      lesson_family: "generalized_workflow_lesson",
      lifecycle_state: "hold_for_more_evidence",
      cluster_key: expect.any(String),
    });

    const client = await connectClient(dbEnvironment.connectionString);
    try {
      await client.query(
        `
          update memory_middleware.memory_objects
          set
            created_at = now() - interval '10 seconds',
            updated_at = now() - interval '10 seconds'
          where id = $1::uuid
        `,
        [candidateId],
      );
    } finally {
      await client.end();
    }

    const confirmingSubmit = await submitTool.execute("call-generic-auto-review-2", {
      kind: "improvement",
      content:
        "Use bulletized proof IDs for release proof notes here instead of paraphrased rollout summaries.",
      projectId: seeded.projectId,
    });

    expect(confirmingSubmit.details).toMatchObject({
      accepted: true,
      kind: "improvement",
      reviewState: "approved",
      memoryObjectId: expect.any(String),
    });
    const approvedMemoryObjectId = (confirmingSubmit.details as { memoryObjectId: string })
      .memoryObjectId;

    const approvedRow = await querySingleRow<{
      review_state: string;
      promotion_profile: string | null;
      confirmation_method: string | null;
      auto_review_outcome: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          review_state::text as review_state,
          metadata->'promotionMetadata'->'autoPromotion'->>'profile' as promotion_profile,
          metadata->'promotionMetadata'->'candidateConfirmation'->>'method' as confirmation_method,
          metadata->'promotionMetadata'->'workflowAutoReview'->>'outcome' as auto_review_outcome
        from memory_middleware.memory_objects
        where id = $1::uuid
      `,
      [approvedMemoryObjectId],
    );

    expect(approvedRow).toEqual({
      review_state: "approved",
      promotion_profile: "workflow_generalized_auto_review_v1",
      confirmation_method: "generalized_cluster_auto_review",
      auto_review_outcome: "approve",
    });

    const searchResult = await searchTool.execute("call-generic-auto-review-search", {
      query: "what should I use for release proof notes",
      kind: "project",
      projectId: seeded.projectId,
    });
    const records = (
      searchResult.details as {
        accepted: boolean;
        status: string;
        records: Array<{ id: string; matchedFields: string[] }>;
      }
    ).records;

    expect(records[0]).toEqual(
      expect.objectContaining({
        id: approvedMemoryObjectId,
        matchedFields: expect.arrayContaining(["fts_search_document"]),
      }),
    );
  });

  it("rejects an expired generalized workflow lesson hold before creating a fresh cluster candidate", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
      autoPromotionProfile: "explicit-user-preference-v1",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });

    const initialSubmit = await submitTool.execute("call-generic-expire-1", {
      kind: "improvement",
      content:
        "For artifact signoff notes here, use manifest hashes instead of paraphrased artifact summaries.",
      projectId: seeded.projectId,
    });
    const firstCandidateId = (initialSubmit.details as { memoryObjectId: string }).memoryObjectId;

    const client = await connectClient(dbEnvironment.connectionString);
    try {
      await client.query(
        `
          update memory_middleware.memory_objects
          set metadata = jsonb_set(
            metadata,
            '{candidateMetadata,candidateLifecycle,expiresAt}',
            to_jsonb((now() - interval '1 minute')::text),
            true
          )
          where id = $1::uuid
        `,
        [firstCandidateId],
      );
    } finally {
      await client.end();
    }

    const resubmitted = await submitTool.execute("call-generic-expire-2", {
      kind: "improvement",
      content:
        "For artifact signoff notes here, use manifest hashes instead of paraphrased artifact summaries.",
      projectId: seeded.projectId,
    });

    expect(resubmitted.details).toMatchObject({
      accepted: true,
      kind: "improvement",
      reviewState: "candidate",
      memoryObjectId: expect.any(String),
    });
    const replacementCandidateId = (resubmitted.details as { memoryObjectId: string })
      .memoryObjectId;
    expect(replacementCandidateId).not.toBe(firstCandidateId);

    const expiredRow = await querySingleRow<{
      review_state: string;
      lifecycle_state: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          review_state::text as review_state,
          metadata->'candidateMetadata'->'candidateLifecycle'->>'state' as lifecycle_state
        from memory_middleware.memory_objects
        where id = $1::uuid
      `,
      [firstCandidateId],
    );

    expect(expiredRow).toEqual({
      review_state: "rejected",
      lifecycle_state: "hold_for_more_evidence",
    });
  });

  it("supersedes an older approved generalized workflow lesson when stronger newer conflicting evidence wins", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
      autoPromotionProfile: "explicit-user-preference-v1",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });

    const originalFirst = await submitTool.execute("call-generic-supersede-1a", {
      kind: "improvement",
      content:
        "For rollout evidence notes here, use bulletized proof IDs instead of paraphrased rollout summaries.",
      projectId: seeded.projectId,
    });
    const originalCandidateId = (originalFirst.details as { memoryObjectId: string })
      .memoryObjectId;

    let client = await connectClient(dbEnvironment.connectionString);
    try {
      await client.query(
        `
          update memory_middleware.memory_objects
          set
            created_at = now() - interval '10 seconds',
            updated_at = now() - interval '10 seconds'
          where id = $1::uuid
        `,
        [originalCandidateId],
      );
    } finally {
      await client.end();
    }

    const originalSecond = await submitTool.execute("call-generic-supersede-1b", {
      kind: "improvement",
      content:
        "Use bulletized proof IDs for rollout evidence notes here instead of paraphrased rollout summaries.",
      projectId: seeded.projectId,
    });
    const originalApprovedId = (originalSecond.details as { memoryObjectId: string })
      .memoryObjectId;

    const newerFirst = await submitTool.execute("call-generic-supersede-2a", {
      kind: "improvement",
      content:
        "For rollout evidence notes here, use tabulated proof IDs instead of paraphrased rollout summaries.",
      projectId: seeded.projectId,
    });
    const newerCandidateId = (newerFirst.details as { memoryObjectId: string }).memoryObjectId;

    client = await connectClient(dbEnvironment.connectionString);
    try {
      await client.query(
        `
          update memory_middleware.memory_objects
          set
            created_at = now() - interval '10 seconds',
            updated_at = now() - interval '10 seconds'
          where id = $1::uuid
        `,
        [newerCandidateId],
      );
    } finally {
      await client.end();
    }

    const newerSecond = await submitTool.execute("call-generic-supersede-2b", {
      kind: "improvement",
      content:
        "Use tabulated proof IDs for rollout evidence notes here instead of paraphrased rollout summaries.",
      projectId: seeded.projectId,
    });

    expect(newerSecond.details).toMatchObject({
      accepted: true,
      kind: "improvement",
      reviewState: "approved",
      memoryObjectId: expect.any(String),
    });
    const supersedingApprovedId = (newerSecond.details as { memoryObjectId: string })
      .memoryObjectId;

    const originalApprovedRow = await querySingleRow<{
      review_state: string;
      superseded_by_object_id: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          review_state::text as review_state,
          metadata->>'supersededByObjectId' as superseded_by_object_id
        from memory_middleware.memory_objects
        where id = $1::uuid
      `,
      [originalApprovedId],
    );

    expect(originalApprovedRow).toEqual({
      review_state: "superseded",
      superseded_by_object_id: supersedingApprovedId,
    });

    const supersedingRow = await querySingleRow<{
      review_state: string;
      auto_review_outcome: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          review_state::text as review_state,
          metadata->'promotionMetadata'->'workflowAutoReview'->>'outcome' as auto_review_outcome
        from memory_middleware.memory_objects
        where id = $1::uuid
      `,
      [supersedingApprovedId],
    );

    expect(supersedingRow).toEqual({
      review_state: "approved",
      auto_review_outcome: "supersede_existing",
    });
  });

  it("auto-promotes an explicit recurring checklist into a validated procedure without manual review", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
      autoPromotionProfile: "explicit-user-preference-v1",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });

    const submitResult = await submitTool.execute("call-rp-direct", {
      kind: "procedure",
      content: [
        "My deploy checklist:",
        "1. Open the canary lane.",
        "2. Verify health.",
        "3. Roll forward.",
      ].join("\n"),
      projectId: seeded.projectId,
    });

    expect(submitResult.details).toMatchObject({
      accepted: true,
      kind: "procedure",
      reviewState: "approved",
      memoryObjectId: expect.any(String),
    });
    const procedureId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;

    const row = await querySingleRow<{
      status: string;
      title: string;
      procedure_key: string | null;
      promotion_profile: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          status::text as status,
          title,
          metadata->'candidateMetadata'->'autoCapture'->>'procedureKey' as procedure_key,
          metadata->'promotionMetadata'->'autoPromotion'->>'profile' as promotion_profile
        from memory_middleware.procedures
        where id = $1::uuid
      `,
      [procedureId],
    );

    expect(row).toEqual({
      status: "validated",
      title: "Deploy checklist",
      procedure_key: "deploy_checklist",
      promotion_profile: "recurring_procedure_direct_v1",
    });
  });

  it("promotes a medium-confidence recurring checklist candidate after later confirming evidence without manual review", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
      autoPromotionProfile: "explicit-user-preference-v1",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });

    const initialSubmit = await submitTool.execute("call-rp-medium-1", {
      kind: "procedure",
      content: [
        "For releases, we use this checklist:",
        "1. Cut the release branch.",
        "2. Run the smoke suite.",
      ].join("\n"),
      projectId: seeded.projectId,
    });
    const candidateId = (initialSubmit.details as { memoryObjectId: string }).memoryObjectId;

    const initialRow = await querySingleRow<{
      review_state: string;
      lifecycle_state: string | null;
      lifecycle_confidence: string | null;
      procedure_key: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          review_state::text as review_state,
          metadata->'candidateMetadata'->'candidateLifecycle'->>'state' as lifecycle_state,
          metadata->'candidateMetadata'->'candidateLifecycle'->>'confidence' as lifecycle_confidence,
          metadata->'candidateMetadata'->'autoCapture'->>'procedureKey' as procedure_key
        from memory_middleware.memory_objects
        where id = $1::uuid
      `,
      [candidateId],
    );

    expect(initialRow).toEqual({
      review_state: "candidate",
      lifecycle_state: "pending_confirmation",
      lifecycle_confidence: "medium",
      procedure_key: "release_checklist",
    });

    const client = await connectClient(dbEnvironment.connectionString);
    try {
      await client.query(
        `
          update memory_middleware.memory_objects
          set
            created_at = now() - interval '10 seconds',
            updated_at = now() - interval '10 seconds'
          where id = $1::uuid
        `,
        [candidateId],
      );
    } finally {
      await client.end();
    }

    const confirmingSubmit = await submitTool.execute("call-rp-medium-2", {
      kind: "procedure",
      content: [
        "My release checklist:",
        "1. Cut the release branch.",
        "2. Run the smoke suite.",
      ].join("\n"),
      projectId: seeded.projectId,
    });

    expect(confirmingSubmit.details).toMatchObject({
      accepted: true,
      kind: "procedure",
      reviewState: "approved",
      memoryObjectId: expect.any(String),
    });
    const procedureId = (confirmingSubmit.details as { memoryObjectId: string }).memoryObjectId;

    const confirmedRow = await querySingleRow<{
      candidate_review_state: string;
      status: string;
      promotion_profile: string | null;
      confirmation_state: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select review_state::text from memory_middleware.memory_objects where id = $1::uuid) as candidate_review_state,
          (select status::text from memory_middleware.procedures where id = $2::uuid) as status,
          (select metadata->'promotionMetadata'->'autoPromotion'->>'profile'
            from memory_middleware.procedures where id = $2::uuid) as promotion_profile,
          (select metadata->'promotionMetadata'->'candidateConfirmation'->>'state'
            from memory_middleware.procedures where id = $2::uuid) as confirmation_state
      `,
      [candidateId, procedureId],
    );

    expect(confirmedRow).toEqual({
      candidate_review_state: "candidate",
      status: "validated",
      promotion_profile: "recurring_procedure_confirmation_v1",
      confirmation_state: "confirmed",
    });
  });

  it("boosts the most relevant validated recurring checklist in hybrid retrieval", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
      autoPromotionProfile: "explicit-user-preference-v1",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });

    const deploySubmit = await submitTool.execute("call-rp-hybrid-1", {
      kind: "procedure",
      content: ["My deploy checklist:", "1. Open the canary lane.", "2. Verify health."].join("\n"),
      projectId: seeded.projectId,
    });
    const releaseSubmit = await submitTool.execute("call-rp-hybrid-2", {
      kind: "procedure",
      content: [
        "My release checklist:",
        "1. Cut the release branch.",
        "2. Run the smoke suite.",
      ].join("\n"),
      projectId: seeded.projectId,
    });

    const deployProcedureId = (deploySubmit.details as { memoryObjectId: string }).memoryObjectId;
    const releaseProcedureId = (releaseSubmit.details as { memoryObjectId: string }).memoryObjectId;

    const hybridSearch = await runtime.memoryObjectQuery.searchHybrid({
      query: "give me my deploy checklist",
      scope: "include_validated_procedures",
      kind: "procedure",
      projectId: seeded.projectId,
    });

    expect(hybridSearch).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "include_validated_procedures",
    });
    const records = (
      hybridSearch as {
        records: Array<{ id: string; matchedFields: string[]; score: number }>;
      }
    ).records;
    expect(records[0]?.id).toBe(deployProcedureId);
    expect(records[0]?.matchedFields).toContain("procedure_key_match");
    if (records[1]?.id === releaseProcedureId) {
      expect(records[0]?.score).toBeGreaterThan(records[1]?.score ?? 0);
    }
  });

  it("boosts the relevant validated recurring checklist for nearby procedural asks without checklist wording", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
      autoPromotionProfile: "explicit-user-preference-v1",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });

    const deploySubmit = await submitTool.execute("call-rp-nearby-1", {
      kind: "procedure",
      content: ["My deploy checklist:", "1. Open the canary lane.", "2. Verify health."].join("\n"),
      projectId: seeded.projectId,
    });
    const investigationSubmit = await submitTool.execute("call-rp-nearby-2", {
      kind: "procedure",
      content: ["My investigation checklist:", "1. Reproduce the issue.", "2. Gather logs."].join(
        "\n",
      ),
      projectId: seeded.projectId,
    });

    const deployProcedureId = (deploySubmit.details as { memoryObjectId: string }).memoryObjectId;
    const investigationProcedureId = (investigationSubmit.details as { memoryObjectId: string })
      .memoryObjectId;

    const hybridSearch = await runtime.memoryObjectQuery.searchHybrid({
      query: "how should we deploy this safely",
      scope: "include_validated_procedures",
      kind: "procedure",
      projectId: seeded.projectId,
    });

    expect(hybridSearch).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "include_validated_procedures",
      query: "how should we deploy this safely",
    });
    const records = (
      hybridSearch as {
        records: Array<{ id: string; matchedFields: string[]; score: number }>;
      }
    ).records;
    expect(records[0]?.id).toBe(deployProcedureId);
    expect(records[0]?.matchedFields).toContain("procedure_key_match");
    if (records[1]?.id === investigationProcedureId) {
      expect(records[0]?.score).toBeGreaterThan(records[1]?.score ?? 0);
    }
  });

  it("boosts the most relevant approved response-style template in hybrid retrieval when overlapping memories exist", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteMemoryTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });

    const plainEnglishSubmit = await submitTool.execute("call-16t-s7", {
      kind: "learning",
      content: "User requirement: use plain English.",
      projectId: seeded.projectId,
      metadata: {
        category: "user_requirement",
        source: "explicit_user_requirement",
        autoCapture: {
          captureClass: "explicit_requirement",
          template: "responses_plain_english",
          subjectKey: "s7-response-language",
          key: "s7-response-language-plain-english",
          subject: "response language",
          value: "use plain English",
        },
      },
    });
    const plainEnglishCandidateId = (plainEnglishSubmit.details as { memoryObjectId: string })
      .memoryObjectId;
    await reviewTool.execute("call-16u-s7", {
      candidateId: plainEnglishCandidateId,
      outcome: "accepted",
      rationale: "Accept plain-English requirement for overlap ranking proof.",
    });
    const plainEnglishPromotion = await promoteTool.execute("call-16v-s7", {
      candidateId: plainEnglishCandidateId,
    });
    const plainEnglishApprovedId = (
      plainEnglishPromotion.details as { promotedMemoryObjectId: string }
    ).promotedMemoryObjectId;

    const numberedStepsSubmit = await submitTool.execute("call-16w-s7", {
      kind: "learning",
      content: "User requirement: use numbered steps when giving instructions.",
      projectId: seeded.projectId,
      metadata: {
        category: "user_requirement",
        source: "explicit_user_requirement",
        autoCapture: {
          captureClass: "explicit_requirement",
          template: "responses_numbered_steps",
          subjectKey: "s7-response-format-numbered-steps",
          key: "s7-response-format-numbered-steps",
          subject: "response format",
          value: "use numbered steps when giving instructions",
        },
      },
    });
    const numberedStepsCandidateId = (numberedStepsSubmit.details as { memoryObjectId: string })
      .memoryObjectId;
    await reviewTool.execute("call-16x-s7", {
      candidateId: numberedStepsCandidateId,
      outcome: "accepted",
      rationale: "Accept numbered-steps requirement for overlap ranking proof.",
    });
    const numberedStepsPromotion = await promoteTool.execute("call-16y-s7", {
      candidateId: numberedStepsCandidateId,
    });
    const numberedStepsApprovedId = (
      numberedStepsPromotion.details as { promotedMemoryObjectId: string }
    ).promotedMemoryObjectId;

    const hybridSearch = await runtime.memoryObjectQuery.searchHybrid({
      query: "numbered steps when giving instructions response format preference",
      scope: "approved_only",
      kind: "feedback",
      projectId: seeded.projectId,
    });

    expect(hybridSearch).toMatchObject({
      accepted: true,
      status: "ok",
      query: "numbered steps when giving instructions response format preference",
    });
    const records = (
      hybridSearch as {
        accepted: true;
        status: "ok";
        scope: "approved_only";
        query: string;
        records: Array<{
          id: string;
          score: number;
          matchedFields: string[];
          metadata?: Record<string, unknown>;
        }>;
      }
    ).records;
    expect(records.length).toBeGreaterThanOrEqual(1);
    expect(records[0]?.id).toBe(numberedStepsApprovedId);
    expect(records[0]?.matchedFields).toContain("auto_capture_template_match");
    if (records[1]) {
      expect(records[0]?.score).toBeGreaterThan(records[1]?.score ?? 0);
    }
    expect([plainEnglishApprovedId, numberedStepsApprovedId]).toContain(records[0]?.id);
  });

  it("boosts the most relevant approved project fact field in hybrid retrieval when overlapping project memories exist", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteMemoryTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });

    const defaultBranchSubmit = await submitTool.execute("call-16pf-a", {
      kind: "learning",
      content: "Project fact [atlas forge]: default branch is atlas-main.",
      projectId: seeded.projectId,
      metadata: {
        category: "project_fact",
        source: "explicit_project_fact",
        autoCapture: {
          captureClass: "explicit_project_fact",
          template: "project_fact_named_scope",
          fieldKey: "default_branch",
          subjectKey: "atlas-forge-default-branch",
          key: "atlas-forge-default-branch-atlas-main",
          subject: "atlas forge / default branch",
          value: "atlas-main",
          projectScope: "atlas forge",
        },
      },
    });
    const defaultBranchCandidateId = (defaultBranchSubmit.details as { memoryObjectId: string })
      .memoryObjectId;
    await reviewTool.execute("call-16pf-b", {
      candidateId: defaultBranchCandidateId,
      outcome: "accepted",
    });
    const defaultBranchPromotion = await promoteTool.execute("call-16pf-c", {
      candidateId: defaultBranchCandidateId,
    });
    const defaultBranchApprovedId = (
      defaultBranchPromotion.details as { promotedMemoryObjectId: string }
    ).promotedMemoryObjectId;

    const packageManagerSubmit = await submitTool.execute("call-16pf-d", {
      kind: "learning",
      content: "Project fact [atlas forge]: primary package manager is pnpm.",
      projectId: seeded.projectId,
      metadata: {
        category: "project_fact",
        source: "explicit_project_fact",
        autoCapture: {
          captureClass: "explicit_project_fact",
          template: "project_fact_named_scope",
          fieldKey: "primary_package_manager",
          subjectKey: "atlas-forge-package-manager",
          key: "atlas-forge-package-manager-pnpm",
          subject: "atlas forge / primary package manager",
          value: "pnpm",
          projectScope: "atlas forge",
        },
      },
    });
    const packageManagerCandidateId = (packageManagerSubmit.details as { memoryObjectId: string })
      .memoryObjectId;
    await reviewTool.execute("call-16pf-e", {
      candidateId: packageManagerCandidateId,
      outcome: "accepted",
    });
    const packageManagerPromotion = await promoteTool.execute("call-16pf-f", {
      candidateId: packageManagerCandidateId,
    });
    const packageManagerApprovedId = (
      packageManagerPromotion.details as { promotedMemoryObjectId: string }
    ).promotedMemoryObjectId;

    const hybridSearch = await runtime.memoryObjectQuery.searchHybrid({
      query: "what is the default branch for project atlas forge",
      scope: "approved_only",
      kind: "project",
      projectId: seeded.projectId,
    });

    expect(hybridSearch).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
    });
    const records = (
      hybridSearch as {
        accepted: true;
        status: "ok";
        scope: "approved_only";
        records: Array<{
          id: string;
          score: number;
          matchedFields: string[];
        }>;
      }
    ).records;
    expect(records.length).toBeGreaterThanOrEqual(2);
    expect(records[0]?.id).toBe(defaultBranchApprovedId);
    expect(records[0]?.matchedFields).toContain("auto_capture_field_match");
    if (records[1]) {
      expect(records[0]?.score).toBeGreaterThan(records[1]?.score ?? 0);
    }
    expect([defaultBranchApprovedId, packageManagerApprovedId]).toContain(records[0]?.id);
  });

  it("boosts the most relevant approved project URL fact in hybrid retrieval when overlapping URL fields exist", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteMemoryTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });

    const repositorySubmit = await submitTool.execute("call-16pf-url-a", {
      kind: "learning",
      content:
        "Project fact [atlas forge]: repository URL is https://github.com/openclaw/openclaw.",
      projectId: seeded.projectId,
      metadata: {
        category: "project_fact",
        source: "explicit_project_fact",
        autoCapture: {
          captureClass: "explicit_project_fact",
          template: "project_fact_named_scope",
          fieldKey: "repository_url",
          subjectKey: "atlas-forge-repository-url",
          key: "atlas-forge-repository-url-github",
          subject: "atlas forge / repository URL",
          value: "https://github.com/openclaw/openclaw",
          projectScope: "atlas forge",
        },
      },
    });
    const repositoryCandidateId = (repositorySubmit.details as { memoryObjectId: string })
      .memoryObjectId;
    await reviewTool.execute("call-16pf-url-b", {
      candidateId: repositoryCandidateId,
      outcome: "accepted",
    });
    const repositoryPromotion = await promoteTool.execute("call-16pf-url-c", {
      candidateId: repositoryCandidateId,
    });
    const repositoryApprovedId = (repositoryPromotion.details as { promotedMemoryObjectId: string })
      .promotedMemoryObjectId;

    const deploymentSubmit = await submitTool.execute("call-16pf-url-d", {
      kind: "learning",
      content: "Project fact [atlas forge]: deployment URL is https://openclaw.ai/app.",
      projectId: seeded.projectId,
      metadata: {
        category: "project_fact",
        source: "explicit_project_fact",
        autoCapture: {
          captureClass: "explicit_project_fact",
          template: "project_fact_named_scope",
          fieldKey: "deployment_url",
          subjectKey: "atlas-forge-deployment-url",
          key: "atlas-forge-deployment-url-app",
          subject: "atlas forge / deployment URL",
          value: "https://openclaw.ai/app",
          projectScope: "atlas forge",
        },
      },
    });
    const deploymentCandidateId = (deploymentSubmit.details as { memoryObjectId: string })
      .memoryObjectId;
    await reviewTool.execute("call-16pf-url-e", {
      candidateId: deploymentCandidateId,
      outcome: "accepted",
    });
    const deploymentPromotion = await promoteTool.execute("call-16pf-url-f", {
      candidateId: deploymentCandidateId,
    });
    const deploymentApprovedId = (deploymentPromotion.details as { promotedMemoryObjectId: string })
      .promotedMemoryObjectId;

    const hybridSearch = await runtime.memoryObjectQuery.searchHybrid({
      query: "what is the repository url for project atlas forge",
      scope: "approved_only",
      kind: "project",
      projectId: seeded.projectId,
    });

    expect(hybridSearch).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
    });
    const records = (
      hybridSearch as {
        accepted: true;
        status: "ok";
        scope: "approved_only";
        records: Array<{
          id: string;
          score: number;
          matchedFields: string[];
        }>;
      }
    ).records;
    expect(records.length).toBeGreaterThanOrEqual(2);
    expect(records[0]?.id).toBe(repositoryApprovedId);
    expect(records[0]?.matchedFields).toContain("auto_capture_field_match");
    if (records[1]) {
      expect(records[0]?.score).toBeGreaterThan(records[1]?.score ?? 0);
    }
    expect([repositoryApprovedId, deploymentApprovedId]).toContain(records[0]?.id);
  });

  it("boosts the most relevant approved project support URL fact in hybrid retrieval when overlapping support URL fields exist", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteMemoryTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });

    const documentationSubmit = await submitTool.execute("call-16pf-support-a", {
      kind: "learning",
      content:
        "Project fact [atlas forge]: documentation URL is https://docs.openclaw.ai/getting-started.",
      projectId: seeded.projectId,
      metadata: {
        category: "project_fact",
        source: "explicit_project_fact",
        autoCapture: {
          captureClass: "explicit_project_fact",
          template: "project_fact_named_scope",
          fieldKey: "documentation_url",
          subjectKey: "atlas-forge-documentation-url",
          key: "atlas-forge-documentation-url-getting-started",
          subject: "atlas forge / documentation URL",
          value: "https://docs.openclaw.ai/getting-started",
          projectScope: "atlas forge",
        },
      },
    });
    const documentationCandidateId = (documentationSubmit.details as { memoryObjectId: string })
      .memoryObjectId;
    await reviewTool.execute("call-16pf-support-b", {
      candidateId: documentationCandidateId,
      outcome: "accepted",
    });
    const documentationPromotion = await promoteTool.execute("call-16pf-support-c", {
      candidateId: documentationCandidateId,
    });
    const documentationApprovedId = (
      documentationPromotion.details as { promotedMemoryObjectId: string }
    ).promotedMemoryObjectId;

    const runbookSubmit = await submitTool.execute("call-16pf-support-d", {
      kind: "learning",
      content:
        "Project fact [atlas forge]: runbook URL is https://ops.openclaw.ai/runbooks/atlas-forge.",
      projectId: seeded.projectId,
      metadata: {
        category: "project_fact",
        source: "explicit_project_fact",
        autoCapture: {
          captureClass: "explicit_project_fact",
          template: "project_fact_named_scope",
          fieldKey: "runbook_url",
          subjectKey: "atlas-forge-runbook-url",
          key: "atlas-forge-runbook-url-ops",
          subject: "atlas forge / runbook URL",
          value: "https://ops.openclaw.ai/runbooks/atlas-forge",
          projectScope: "atlas forge",
        },
      },
    });
    const runbookCandidateId = (runbookSubmit.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-16pf-support-e", {
      candidateId: runbookCandidateId,
      outcome: "accepted",
    });
    const runbookPromotion = await promoteTool.execute("call-16pf-support-f", {
      candidateId: runbookCandidateId,
    });
    const runbookApprovedId = (runbookPromotion.details as { promotedMemoryObjectId: string })
      .promotedMemoryObjectId;

    const hybridSearch = await runtime.memoryObjectQuery.searchHybrid({
      query: "what is the documentation url for project atlas forge",
      scope: "approved_only",
      kind: "project",
      projectId: seeded.projectId,
    });

    expect(hybridSearch).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
    });
    const records = (
      hybridSearch as {
        accepted: true;
        status: "ok";
        scope: "approved_only";
        records: Array<{
          id: string;
          score: number;
          matchedFields: string[];
        }>;
      }
    ).records;
    expect(records.length).toBeGreaterThanOrEqual(2);
    expect(records[0]?.id).toBe(documentationApprovedId);
    expect(records[0]?.matchedFields).toContain("auto_capture_field_match");
    if (records[1]) {
      expect(records[0]?.score).toBeGreaterThan(records[1]?.score ?? 0);
    }
    expect([documentationApprovedId, runbookApprovedId]).toContain(records[0]?.id);
  });

  it("allows the same approved project URL fact in a different project", async () => {
    const firstProject = await seedContext(dbEnvironment.connectionString);
    const secondProject = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
      autoPromotionProfile: "explicit-user-preference-v1",
    });
    const firstSubmitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: firstProject.sessionId,
        agentId: firstProject.agentId,
      },
    });
    const secondSubmitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: secondProject.sessionId,
        agentId: secondProject.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: firstProject.agentId,
      },
    });
    const promoteTool = createCandidatePromoteMemoryTool({
      runtime,
      context: {
        agentId: firstProject.agentId,
      },
    });

    const firstSubmit = await firstSubmitTool.execute("call-16pf-url-project-a", {
      kind: "learning",
      content:
        "Project fact [atlas forge]: repository URL is https://github.com/openclaw/openclaw.",
      projectId: firstProject.projectId,
      metadata: {
        category: "project_fact",
        source: "explicit_project_fact",
        autoCapture: {
          captureClass: "explicit_project_fact",
          template: "project_fact_named_scope",
          fieldKey: "repository_url",
          subjectKey: "atlas-forge-repository-url",
          key: "atlas-forge-repository-url-github",
          subject: "atlas forge / repository URL",
          value: "https://github.com/openclaw/openclaw",
          projectScope: "atlas forge",
        },
      },
    });
    const firstCandidateId = (firstSubmit.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-16pf-url-project-b", {
      candidateId: firstCandidateId,
      outcome: "accepted",
    });
    await promoteTool.execute("call-16pf-url-project-c", {
      candidateId: firstCandidateId,
    });

    const secondSubmit = await secondSubmitTool.execute("call-16pf-url-project-d", {
      kind: "learning",
      content:
        "Project fact [atlas forge]: repository URL is https://github.com/openclaw/openclaw.",
      projectId: secondProject.projectId,
      metadata: {
        category: "project_fact",
        source: "explicit_project_fact",
        autoCapture: {
          captureClass: "explicit_project_fact",
          template: "project_fact_named_scope",
          fieldKey: "repository_url",
          subjectKey: "atlas-forge-repository-url",
          key: "atlas-forge-repository-url-github",
          subject: "atlas forge / repository URL",
          value: "https://github.com/openclaw/openclaw",
          projectScope: "atlas forge",
        },
      },
    });

    expect(secondSubmit.details).toMatchObject({
      accepted: true,
      kind: "learning",
      reviewState: "candidate",
      memoryObjectId: expect.any(String),
    });

    const secondCandidateId = (secondSubmit.details as { memoryObjectId: string }).memoryObjectId;
    const secondRow = await querySingleRow<{
      project_id: string;
      review_state: string;
      field_key: string | null;
      lifecycle_state: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          project_id::text as project_id,
          review_state::text as review_state,
          metadata->'candidateMetadata'->'autoCapture'->>'fieldKey' as field_key,
          metadata->'candidateMetadata'->'candidateLifecycle'->>'state' as lifecycle_state
        from memory_middleware.memory_objects
        where id = $1::uuid
      `,
      [secondCandidateId],
    );

    expect(secondRow).toEqual({
      project_id: secondProject.projectId,
      review_state: "candidate",
      field_key: "repository_url",
      lifecycle_state: "pending_confirmation",
    });
  });

  it("boosts the most relevant approved workflow-improvement lesson in hybrid retrieval", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteMemoryTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });

    const vitestSubmit = await submitTool.execute("call-16wi-a", {
      kind: "improvement",
      content: "Use pnpm test -- src/foo.test.ts instead of raw vitest here.",
      projectId: seeded.projectId,
    });
    const vitestCandidateId = (vitestSubmit.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-16wi-b", {
      candidateId: vitestCandidateId,
      outcome: "accepted",
    });
    const vitestPromotion = await promoteTool.execute("call-16wi-c", {
      candidateId: vitestCandidateId,
    });
    const vitestApprovedId = (vitestPromotion.details as { promotedMemoryObjectId: string })
      .promotedMemoryObjectId;

    const committerSubmit = await submitTool.execute("call-16wi-d", {
      kind: "improvement",
      content: "Use scripts/committer for commits here instead of manual git add and git commit.",
      projectId: seeded.projectId,
    });
    const committerCandidateId = (committerSubmit.details as { memoryObjectId: string })
      .memoryObjectId;
    await reviewTool.execute("call-16wi-e", {
      candidateId: committerCandidateId,
      outcome: "accepted",
    });
    const committerPromotion = await promoteTool.execute("call-16wi-f", {
      candidateId: committerCandidateId,
    });
    const committerApprovedId = (committerPromotion.details as { promotedMemoryObjectId: string })
      .promotedMemoryObjectId;

    const hybridSearch = await runtime.memoryObjectQuery.searchHybrid({
      query: "use pnpm test instead of raw vitest wrapper",
      scope: "approved_only",
      kind: "project",
      projectId: seeded.projectId,
    });

    expect(hybridSearch).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
    });
    const records = (
      hybridSearch as {
        accepted: true;
        status: "ok";
        scope: "approved_only";
        records: Array<{
          id: string;
          score: number;
          matchedFields: string[];
        }>;
      }
    ).records;
    expect(records.length).toBeGreaterThanOrEqual(1);
    expect(records[0]?.id).toBe(vitestApprovedId);
    expect(records[0]?.matchedFields).toContain("auto_capture_lesson_match");
    if (records[1]) {
      expect(records[0]?.score).toBeGreaterThan(records[1]?.score ?? 0);
    }
    expect([vitestApprovedId, committerApprovedId]).toContain(records[0]?.id);
  });

  it("boosts the most relevant approved workflow-simplification lesson in hybrid retrieval", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteMemoryTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });

    const docsOnlySubmit = await submitTool.execute("call-16wi-v2-a", {
      kind: "improvement",
      content:
        "For docs-only work here, use pnpm check:fast instead of full pnpm check or pnpm build.",
      projectId: seeded.projectId,
    });
    const docsOnlyCandidateId = (docsOnlySubmit.details as { memoryObjectId: string })
      .memoryObjectId;
    await reviewTool.execute("call-16wi-v2-b", {
      candidateId: docsOnlyCandidateId,
      outcome: "accepted",
    });
    const docsOnlyPromotion = await promoteTool.execute("call-16wi-v2-c", {
      candidateId: docsOnlyCandidateId,
    });
    const docsOnlyApprovedId = (docsOnlyPromotion.details as { promotedMemoryObjectId: string })
      .promotedMemoryObjectId;

    const readyzSubmit = await submitTool.execute("call-16wi-v2-d", {
      kind: "improvement",
      content: "Trust /readyz for rollout readiness here; /healthz is only liveness.",
      projectId: seeded.projectId,
    });
    const readyzCandidateId = (readyzSubmit.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-16wi-v2-e", {
      candidateId: readyzCandidateId,
      outcome: "accepted",
    });
    const readyzPromotion = await promoteTool.execute("call-16wi-v2-f", {
      candidateId: readyzCandidateId,
    });
    const readyzApprovedId = (readyzPromotion.details as { promotedMemoryObjectId: string })
      .promotedMemoryObjectId;

    const hybridSearch = await runtime.memoryObjectQuery.searchHybrid({
      query: "docs only change what gate should I run check fast or full check",
      scope: "approved_only",
      kind: "project",
      projectId: seeded.projectId,
    });

    expect(hybridSearch).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
    });
    const records = (
      hybridSearch as {
        accepted: true;
        status: "ok";
        scope: "approved_only";
        records: Array<{
          id: string;
          score: number;
          matchedFields: string[];
        }>;
      }
    ).records;
    expect(records.length).toBeGreaterThanOrEqual(1);
    expect(records[0]?.id).toBe(docsOnlyApprovedId);
    expect(records[0]?.matchedFields).toContain("auto_capture_lesson_match");
    if (records[1]) {
      expect(records[0]?.score).toBeGreaterThan(records[1]?.score ?? 0);
    }
    expect([docsOnlyApprovedId, readyzApprovedId]).toContain(records[0]?.id);
  });

  it("boosts the most relevant approved environment-constraint lesson in hybrid retrieval", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteMemoryTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });

    const pythonSubmit = await submitTool.execute("call-16wj-a", {
      kind: "improvement",
      content: "Use node --input-type=module or tsx here because python command is not available.",
      projectId: seeded.projectId,
    });
    const pythonCandidateId = (pythonSubmit.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-16wj-b", {
      candidateId: pythonCandidateId,
      outcome: "accepted",
    });
    const pythonPromotion = await promoteTool.execute("call-16wj-c", {
      candidateId: pythonCandidateId,
    });
    const pythonApprovedId = (pythonPromotion.details as { promotedMemoryObjectId: string })
      .promotedMemoryObjectId;

    const gatewaySubmit = await submitTool.execute("call-16wj-d", {
      kind: "improvement",
      content:
        "Use direct runtime invocation instead of gateway POST /tools/invoke in this environment.",
      projectId: seeded.projectId,
    });
    const gatewayCandidateId = (gatewaySubmit.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-16wj-e", {
      candidateId: gatewayCandidateId,
      outcome: "accepted",
    });
    await promoteTool.execute("call-16wj-f", {
      candidateId: gatewayCandidateId,
    });

    const hybridSearch = await runtime.memoryObjectQuery.searchHybrid({
      query: "python command not available use node tsx here",
      scope: "approved_only",
      kind: "project",
      projectId: seeded.projectId,
    });

    expect(hybridSearch).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
    });
    const records = (
      hybridSearch as {
        accepted: true;
        status: "ok";
        scope: "approved_only";
        records: Array<{
          id: string;
          score: number;
          matchedFields: string[];
        }>;
      }
    ).records;
    expect(records.length).toBeGreaterThanOrEqual(1);
    expect(records[0]?.id).toBe(pythonApprovedId);
    expect(records[0]?.matchedFields).toContain("auto_capture_lesson_match");
  });

  it("boosts the most relevant approved API workaround lesson in hybrid retrieval", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteMemoryTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });

    const openaiSubmit = await submitTool.execute("call-16wk-a", {
      kind: "improvement",
      content:
        "Codex OAuth does not help for OpenAI embeddings here; semantic memory search still needs a real OPENAI_API_KEY.",
      projectId: seeded.projectId,
    });
    const openaiCandidateId = (openaiSubmit.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-16wk-b", {
      candidateId: openaiCandidateId,
      outcome: "accepted",
    });
    const openaiPromotion = await promoteTool.execute("call-16wk-c", {
      candidateId: openaiCandidateId,
    });
    const openaiApprovedId = (openaiPromotion.details as { promotedMemoryObjectId: string })
      .promotedMemoryObjectId;

    const anthropicSubmit = await submitTool.execute("call-16wk-d", {
      kind: "improvement",
      content:
        "Anthropic Extra usage is required for long context requests means context1m needs an eligible billed API key or a fallback model.",
      projectId: seeded.projectId,
    });
    const anthropicCandidateId = (anthropicSubmit.details as { memoryObjectId: string })
      .memoryObjectId;
    await reviewTool.execute("call-16wk-e", {
      candidateId: anthropicCandidateId,
      outcome: "accepted",
    });
    await promoteTool.execute("call-16wk-f", {
      candidateId: anthropicCandidateId,
    });

    const hybridSearch = await runtime.memoryObjectQuery.searchHybrid({
      query: "does semantic memory search need an openai api key with codex oauth",
      scope: "approved_only",
      kind: "project",
      projectId: seeded.projectId,
    });

    expect(hybridSearch).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
    });
    const records = (
      hybridSearch as {
        accepted: true;
        status: "ok";
        scope: "approved_only";
        records: Array<{
          id: string;
          score: number;
          matchedFields: string[];
        }>;
      }
    ).records;
    expect(records.length).toBeGreaterThanOrEqual(1);
    expect(records[0]?.id).toBe(openaiApprovedId);
    expect(records[0]?.matchedFields).toContain("auto_capture_lesson_match");
  });

  it("rejects bounded memory promotion for accepted procedure candidates", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteMemoryTool({ runtime });

    const submitResult = await submitTool.execute("call-16m", {
      kind: "procedure",
      content: "Accepted procedure candidate that should remain out of memory-promotion scope",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-16n", {
      candidateId,
      outcome: "accepted",
      rationale: "Accepted only for procedure-draft planning.",
    });

    const promoteResult = await promoteTool.execute("call-16o", {
      candidateId,
    });

    expect(promoteResult.details).toEqual({
      accepted: false,
      status: "ineligible",
      reason: "procedure candidates are not eligible for bounded memory promotion",
    });

    const counts = await querySingleRow<{
      promoted_rows: string;
      procedures_count: string;
      skill_candidates_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select count(*)::text from memory_middleware.memory_objects where metadata->>'promotedFromCandidateId' = $1 and review_state = 'approved') as promoted_rows,
          (select count(*)::text from memory_middleware.procedures) as procedures_count,
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count
      `,
      [candidateId],
    );

    expect(counts).toEqual({
      promoted_rows: "0",
      procedures_count: "0",
      skill_candidates_count: "0",
    });
  });

  it("promotes an accepted procedure candidate into a bounded procedure draft without creating skill candidates", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteProcedureTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });

    const submitResult = await submitTool.execute("call-16p", {
      kind: "procedure",
      content: "Step 1: inspect logs.\nStep 2: confirm failure mode.\nStep 3: apply bounded fix.",
      projectId: seeded.projectId,
      metadata: { source: "integration-test" },
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;
    const sourceEventId = (submitResult.details as { eventId: string }).eventId;

    const acceptedReview = await reviewTool.execute("call-16q", {
      candidateId,
      outcome: "accepted",
      rationale: "Accepted for bounded procedure-draft promotion.",
    });
    const acceptedReviewId = (acceptedReview.details as { reviewId: string }).reviewId;

    const promoteResult = await promoteTool.execute("call-16r", {
      candidateId,
      title: "Bounded Procedure Draft",
      rationale: "Manual bounded procedure-draft promotion.",
      metadata: {
        source: "integration-test",
        reason: "bounded-procedure-promotion",
      },
    });

    expect(promoteResult.details).toMatchObject({
      accepted: true,
      status: "promoted",
      candidateId,
      procedureStatus: "draft",
      sourceEventId,
    });

    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;
    const promotedRow = await querySingleRow<{
      procedure_status: string;
      source_memory_object_id: string;
      procedure_title: string;
      procedure_body: string;
      promoted_from_candidate_id: string | null;
      promoted_from_review_id: string | null;
      promoted_source_event_id: string | null;
      procedure_link_count: string;
      skill_candidates_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select status::text from memory_middleware.procedures where id = $2::uuid) as procedure_status,
          (select source_memory_object_id::text from memory_middleware.procedures where id = $2::uuid) as source_memory_object_id,
          (select title from memory_middleware.procedures where id = $2::uuid) as procedure_title,
          (select body from memory_middleware.procedures where id = $2::uuid) as procedure_body,
          (select metadata->>'promotedFromCandidateId' from memory_middleware.procedures where id = $2::uuid) as promoted_from_candidate_id,
          (select metadata->>'promotedFromReviewId' from memory_middleware.procedures where id = $2::uuid) as promoted_from_review_id,
          (select metadata->>'sourceEventId' from memory_middleware.procedures where id = $2::uuid) as promoted_source_event_id,
          (select count(*)::text from memory_middleware.memory_links where source_memory_object_id = $1::uuid and target_table = 'memory_middleware.procedures' and target_id = $2::uuid) as procedure_link_count,
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count
      `,
      [candidateId, procedureId],
    );

    expect(promotedRow).toEqual({
      procedure_status: "draft",
      source_memory_object_id: candidateId,
      procedure_title: "Bounded Procedure Draft",
      procedure_body:
        "Step 1: inspect logs.\nStep 2: confirm failure mode.\nStep 3: apply bounded fix.",
      promoted_from_candidate_id: candidateId,
      promoted_from_review_id: acceptedReviewId,
      promoted_source_event_id: sourceEventId,
      procedure_link_count: "1",
      skill_candidates_count: "0",
    });
  });

  it("returns already_promoted on repeated bounded procedure promotion for the same candidate", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });

    const submitResult = await submitTool.execute("call-16s", {
      kind: "procedure",
      content: "Accepted procedure candidate for duplicate-promotion handling",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;

    await reviewTool.execute("call-16t", {
      candidateId,
      outcome: "accepted",
      rationale: "Accepted for bounded procedure promotion.",
    });

    const firstPromotion = await promoteTool.execute("call-16u", {
      candidateId,
    });
    const secondPromotion = await promoteTool.execute("call-16v", {
      candidateId,
    });

    const procedureId = (firstPromotion.details as { procedureId: string }).procedureId;

    expect(firstPromotion.details).toMatchObject({
      accepted: true,
      status: "promoted",
      candidateId,
      procedureStatus: "draft",
    });
    expect(secondPromotion.details).toEqual({
      accepted: true,
      status: "already_promoted",
      candidateId,
      procedureId,
      procedureStatus: "draft",
      sourceEventId: (firstPromotion.details as { sourceEventId: string }).sourceEventId,
    });

    const counts = await querySingleRow<{
      promoted_rows: string;
      procedure_link_count: string;
      skill_candidates_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select count(*)::text from memory_middleware.procedures where source_memory_object_id = $1::uuid and metadata->>'promotedFromCandidateId' = $1::text and status = 'draft') as promoted_rows,
          (select count(*)::text from memory_middleware.memory_links where source_memory_object_id = $1::uuid and target_table = 'memory_middleware.procedures' and target_id = $2::uuid) as procedure_link_count,
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count
      `,
      [candidateId, procedureId],
    );

    expect(counts).toEqual({
      promoted_rows: "1",
      procedure_link_count: "1",
      skill_candidates_count: "0",
    });
  });

  it("rejects bounded procedure promotion for non-procedure candidates", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });

    const submitResult = await submitTool.execute("call-16w", {
      kind: "learning",
      content: "Accepted learning candidate that should stay out of procedure scope",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-16x", {
      candidateId,
      outcome: "accepted",
      rationale: "Accepted only for bounded memory promotion.",
    });

    const promoteResult = await promoteTool.execute("call-16y", {
      candidateId,
    });

    expect(promoteResult.details).toEqual({
      accepted: false,
      status: "ineligible",
      reason:
        "only accepted reviewed procedure candidates are eligible for bounded procedure promotion",
    });

    const counts = await querySingleRow<{
      procedures_count: string;
      skill_candidates_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select count(*)::text from memory_middleware.procedures) as procedures_count,
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count
      `,
      [],
    );

    expect(counts).toEqual({
      procedures_count: "0",
      skill_candidates_count: "0",
    });
  });

  it("returns advisory validated-procedure planning for accepted draft procedures without writes", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteProcedureTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const validatePlanTool = createProcedureValidatePlanTool({ runtime });

    const submitResult = await submitTool.execute("call-16z1", {
      kind: "procedure",
      content: "Draft procedure candidate for validated-procedure planning",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;

    await reviewTool.execute("call-16z2", {
      candidateId,
      outcome: "accepted",
      rationale: "Accepted for bounded procedure-draft promotion.",
    });

    const promoteResult = await promoteTool.execute("call-16z3", {
      candidateId,
      title: "Draft Procedure For Validation Planning",
    });
    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;

    const countsBefore = await querySingleRow<{
      procedures_count: string;
      procedure_runs_count: string;
      skill_candidates_count: string;
      memory_links_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select count(*)::text from memory_middleware.procedures) as procedures_count,
          (select count(*)::text from memory_middleware.procedure_runs) as procedure_runs_count,
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count,
          (select count(*)::text from memory_middleware.memory_links) as memory_links_count
      `,
      [],
    );

    const planResult = await validatePlanTool.execute("call-16z4", {
      procedureId,
    });

    const countsAfter = await querySingleRow<{
      procedures_count: string;
      procedure_runs_count: string;
      skill_candidates_count: string;
      memory_links_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select count(*)::text from memory_middleware.procedures) as procedures_count,
          (select count(*)::text from memory_middleware.procedure_runs) as procedure_runs_count,
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count,
          (select count(*)::text from memory_middleware.memory_links) as memory_links_count
      `,
      [],
    );

    expect(planResult.details).toEqual({
      accepted: true,
      status: "ok",
      procedureId,
      procedureStatus: "draft",
      sourceCandidateId: candidateId,
      latestCandidateReviewOutcome: "accepted",
      eligible: true,
      possibleTargets: ["propose_validated_procedure", "remain_draft_only"],
      rationale: [
        "procedure draft is backed by an accepted reviewed procedure candidate",
        "draft provenance includes both accepted-review and source-event linkage",
      ],
      requiredGates: [
        "manual validation confirmation is still required",
        "validated-procedure writes require an explicit write tool invocation",
        "procedure-run evidence, policy checks, and review gates must pass before any future validation write",
      ],
    });
    expect(countsAfter).toEqual(countsBefore);
  });

  it("keeps procedures without bounded promotion provenance in remain_draft_only planning", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const validatePlanTool = createProcedureValidatePlanTool({ runtime });

    const insertedProcedure = await querySingleRow<{ id: string }>(
      dbEnvironment.connectionString,
      `
        insert into memory_middleware.procedures (
          project_id,
          status,
          title,
          body,
          metadata
        )
        values ($1::uuid, 'draft', $2, $3, '{}'::jsonb)
        returning id::text as id
      `,
      [
        seeded.projectId,
        "Manual Draft Procedure",
        "Draft body without bounded promotion provenance",
      ],
    );
    const procedureId = insertedProcedure?.id;
    expect(procedureId).toBeTruthy();

    const countsBefore = await querySingleRow<{
      procedures_count: string;
      procedure_runs_count: string;
      skill_candidates_count: string;
      memory_links_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select count(*)::text from memory_middleware.procedures) as procedures_count,
          (select count(*)::text from memory_middleware.procedure_runs) as procedure_runs_count,
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count,
          (select count(*)::text from memory_middleware.memory_links) as memory_links_count
      `,
      [],
    );

    const planResult = await validatePlanTool.execute("call-16z5", {
      procedureId,
    });

    const countsAfter = await querySingleRow<{
      procedures_count: string;
      procedure_runs_count: string;
      skill_candidates_count: string;
      memory_links_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select count(*)::text from memory_middleware.procedures) as procedures_count,
          (select count(*)::text from memory_middleware.procedure_runs) as procedure_runs_count,
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count,
          (select count(*)::text from memory_middleware.memory_links) as memory_links_count
      `,
      [],
    );

    expect(planResult.details).toEqual({
      accepted: true,
      status: "ok",
      procedureId,
      procedureStatus: "draft",
      eligible: false,
      possibleTargets: ["remain_draft_only"],
      rationale: [
        "procedure draft is missing candidate source-memory provenance",
        "validated-procedure planning requires a draft linked back to a reviewed procedure candidate",
      ],
      requiredGates: ["recreate or relink the draft through the bounded procedure-promotion path"],
    });
    expect(countsAfter).toEqual(countsBefore);
  });

  it("validates an eligible draft procedure without creating skill candidates or extra side effects", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteProcedureTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const validateTool = createProcedureValidateTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });

    const submitResult = await submitTool.execute("call-16z6", {
      kind: "procedure",
      content: "Draft procedure candidate that will become a bounded validated procedure",
      projectId: seeded.projectId,
      metadata: { source: "integration-test" },
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;
    const sourceEventId = (submitResult.details as { eventId: string }).eventId;

    const acceptedReview = await reviewTool.execute("call-16z7", {
      candidateId,
      outcome: "accepted",
      rationale: "Accepted for bounded procedure promotion and validation.",
    });
    const acceptedReviewId = (acceptedReview.details as { reviewId: string }).reviewId;

    const promoteResult = await promoteTool.execute("call-16z8", {
      candidateId,
      title: "Validated Procedure Candidate",
    });
    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;

    const validateResult = await validateTool.execute("call-16z9", {
      procedureId,
      rationale: "Validated after bounded review and execution evidence.",
      metadata: {
        source: "integration-test",
        reason: "bounded-procedure-validation",
      },
    });

    expect(validateResult.details).toMatchObject({
      accepted: true,
      status: "validated",
      procedureId,
      procedureStatus: "validated",
      sourceCandidateId: candidateId,
    });

    const procedureRunId = (validateResult.details as { procedureRunId: string }).procedureRunId;
    expect(procedureRunId).toBeTruthy();

    const validatedRow = await querySingleRow<{
      procedure_status: string;
      validated_at_present: string;
      last_validation_run_id: string | null;
      validated_by_agent_id: string | null;
      validation_rationale: string | null;
      promoted_from_candidate_id: string | null;
      promoted_from_review_id: string | null;
      source_event_id: string | null;
      procedure_run_outcome: string;
      procedure_run_notes: string | null;
      run_evidence_source_candidate_id: string | null;
      run_evidence_review_id: string | null;
      run_evidence_source_event_id: string | null;
      skill_candidates_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select status::text from memory_middleware.procedures where id = $2::uuid) as procedure_status,
          (select case when validated_at is null then 'false' else 'true' end from memory_middleware.procedures where id = $2::uuid) as validated_at_present,
          (select metadata->>'lastValidationRunId' from memory_middleware.procedures where id = $2::uuid) as last_validation_run_id,
          (select metadata->>'validatedByAgentId' from memory_middleware.procedures where id = $2::uuid) as validated_by_agent_id,
          (select metadata->>'validationRationale' from memory_middleware.procedures where id = $2::uuid) as validation_rationale,
          (select metadata->>'promotedFromCandidateId' from memory_middleware.procedures where id = $2::uuid) as promoted_from_candidate_id,
          (select metadata->>'promotedFromReviewId' from memory_middleware.procedures where id = $2::uuid) as promoted_from_review_id,
          (select metadata->>'sourceEventId' from memory_middleware.procedures where id = $2::uuid) as source_event_id,
          (select outcome::text from memory_middleware.procedure_runs where id = $1::uuid) as procedure_run_outcome,
          (select notes from memory_middleware.procedure_runs where id = $1::uuid) as procedure_run_notes,
          (select evidence->>'sourceCandidateId' from memory_middleware.procedure_runs where id = $1::uuid) as run_evidence_source_candidate_id,
          (select evidence->>'promotedFromReviewId' from memory_middleware.procedure_runs where id = $1::uuid) as run_evidence_review_id,
          (select evidence->>'sourceEventId' from memory_middleware.procedure_runs where id = $1::uuid) as run_evidence_source_event_id,
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count
      `,
      [procedureRunId, procedureId],
    );

    expect(validatedRow).toEqual({
      procedure_status: "validated",
      validated_at_present: "true",
      last_validation_run_id: procedureRunId,
      validated_by_agent_id: seeded.agentId,
      validation_rationale: "Validated after bounded review and execution evidence.",
      promoted_from_candidate_id: candidateId,
      promoted_from_review_id: acceptedReviewId,
      source_event_id: sourceEventId,
      procedure_run_outcome: "passed",
      procedure_run_notes: "Validated after bounded review and execution evidence.",
      run_evidence_source_candidate_id: candidateId,
      run_evidence_review_id: acceptedReviewId,
      run_evidence_source_event_id: sourceEventId,
      skill_candidates_count: "0",
    });
  });

  it("returns already_validated on repeated bounded procedure validation for the same procedure", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });
    const validateTool = createProcedureValidateTool({ runtime });

    const submitResult = await submitTool.execute("call-16za", {
      kind: "procedure",
      content: "Draft procedure candidate for duplicate validation handling",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;

    await reviewTool.execute("call-16zb", {
      candidateId,
      outcome: "accepted",
      rationale: "Accepted for bounded procedure validation.",
    });

    const promoteResult = await promoteTool.execute("call-16zc", {
      candidateId,
    });
    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;

    const firstValidation = await validateTool.execute("call-16zd", {
      procedureId,
    });
    const secondValidation = await validateTool.execute("call-16ze", {
      procedureId,
    });

    const procedureRunId = (firstValidation.details as { procedureRunId: string }).procedureRunId;

    expect(firstValidation.details).toMatchObject({
      accepted: true,
      status: "validated",
      procedureId,
      procedureStatus: "validated",
    });
    expect(secondValidation.details).toEqual({
      accepted: true,
      status: "already_validated",
      procedureId,
      procedureStatus: "validated",
      procedureRunId,
      sourceCandidateId: candidateId,
    });

    const counts = await querySingleRow<{
      validated_rows: string;
      procedure_runs_count: string;
      skill_candidates_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select count(*)::text from memory_middleware.procedures where id = $1::uuid and status = 'validated') as validated_rows,
          (select count(*)::text from memory_middleware.procedure_runs where procedure_id = $1::uuid) as procedure_runs_count,
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count
      `,
      [procedureId],
    );

    expect(counts).toEqual({
      validated_rows: "1",
      procedure_runs_count: "1",
      skill_candidates_count: "0",
    });
  });

  it("rejects bounded procedure validation for ineligible draft procedures", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const validateTool = createProcedureValidateTool({ runtime });

    const insertedProcedure = await querySingleRow<{ id: string }>(
      dbEnvironment.connectionString,
      `
        insert into memory_middleware.procedures (
          project_id,
          status,
          title,
          body,
          metadata
        )
        values ($1::uuid, 'draft', $2, $3, '{}'::jsonb)
        returning id::text as id
      `,
      [
        seeded.projectId,
        "Manual Draft Procedure",
        "Draft body without bounded promotion provenance",
      ],
    );
    const procedureId = insertedProcedure?.id;
    expect(procedureId).toBeTruthy();

    const validateResult = await validateTool.execute("call-16zf", {
      procedureId,
    });

    expect(validateResult.details).toEqual({
      accepted: false,
      status: "ineligible",
      reason:
        "procedure draft is missing candidate source-memory provenance validated-procedure planning requires a draft linked back to a reviewed procedure candidate",
    });

    const counts = await querySingleRow<{
      procedure_status: string;
      procedure_runs_count: string;
      skill_candidates_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select status::text from memory_middleware.procedures where id = $1::uuid) as procedure_status,
          (select count(*)::text from memory_middleware.procedure_runs where procedure_id = $1::uuid) as procedure_runs_count,
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count
      `,
      [procedureId],
    );

    expect(counts).toEqual({
      procedure_status: "draft",
      procedure_runs_count: "0",
      skill_candidates_count: "0",
    });
  });

  it("returns advisory skill-candidate planning for eligible validated procedures without writes", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });
    const validateTool = createProcedureValidateTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const skillPlanTool = createSkillCandidatePlanTool({ runtime });

    const submitResult = await submitTool.execute("call-16zg", {
      kind: "procedure",
      content: "Validated procedure candidate for advisory skill-candidate planning",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;

    await reviewTool.execute("call-16zh", {
      candidateId,
      outcome: "accepted",
      rationale: "Accepted for bounded procedure validation.",
    });

    const promoteResult = await promoteTool.execute("call-16zi", {
      candidateId,
      title: "Validated Procedure For Skill Planning",
    });
    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;

    await validateTool.execute("call-16zj", {
      procedureId,
      rationale: "Validated before any future skill-candidate planning.",
    });

    const countsBefore = await querySingleRow<{
      procedures_count: string;
      procedure_runs_count: string;
      skill_candidates_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select count(*)::text from memory_middleware.procedures) as procedures_count,
          (select count(*)::text from memory_middleware.procedure_runs) as procedure_runs_count,
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count
      `,
      [],
    );

    const planResult = await skillPlanTool.execute("call-16zk", {
      procedureId,
    });

    const countsAfter = await querySingleRow<{
      procedures_count: string;
      procedure_runs_count: string;
      skill_candidates_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select count(*)::text from memory_middleware.procedures) as procedures_count,
          (select count(*)::text from memory_middleware.procedure_runs) as procedure_runs_count,
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count
      `,
      [],
    );

    expect(planResult.details).toEqual({
      accepted: true,
      status: "ok",
      procedureId,
      procedureStatus: "validated",
      sourceCandidateId: candidateId,
      latestValidationRunOutcome: "passed",
      eligible: true,
      possibleTargets: ["propose_skill_candidate", "remain_validated_procedure_only"],
      rationale: [
        "procedure is in validated state",
        "validated procedure preserves bounded candidate provenance and a passed validation run",
      ],
      requiredGates: [
        "manual skill-candidate confirmation is still required",
        "skill-candidate creation requires an explicit write tool invocation",
        "procurement, review, and policy checks must pass before any future skill-candidate write",
      ],
    });
    expect(countsAfter).toEqual(countsBefore);
  });

  it("keeps procedures without bounded candidate lineage in remain_validated_procedure_only planning", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const skillPlanTool = createSkillCandidatePlanTool({ runtime });

    const insertedProcedure = await querySingleRow<{ id: string }>(
      dbEnvironment.connectionString,
      `
        insert into memory_middleware.procedures (
          project_id,
          status,
          title,
          body,
          metadata,
          validated_at
        )
        values ($1::uuid, 'validated', $2, $3, '{}'::jsonb, now())
        returning id::text as id
      `,
      [seeded.projectId, "Manually Validated Procedure", "Validated body without bounded lineage"],
    );
    const procedureId = insertedProcedure?.id;
    expect(procedureId).toBeTruthy();

    const countsBefore = await querySingleRow<{
      procedures_count: string;
      procedure_runs_count: string;
      skill_candidates_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select count(*)::text from memory_middleware.procedures) as procedures_count,
          (select count(*)::text from memory_middleware.procedure_runs) as procedure_runs_count,
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count
      `,
      [],
    );

    const planResult = await skillPlanTool.execute("call-16zl", {
      procedureId,
    });

    const countsAfter = await querySingleRow<{
      procedures_count: string;
      procedure_runs_count: string;
      skill_candidates_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select count(*)::text from memory_middleware.procedures) as procedures_count,
          (select count(*)::text from memory_middleware.procedure_runs) as procedure_runs_count,
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count
      `,
      [],
    );

    expect(planResult.details).toEqual({
      accepted: true,
      status: "ok",
      procedureId,
      procedureStatus: "validated",
      eligible: false,
      possibleTargets: ["remain_validated_procedure_only"],
      rationale: [
        "validated procedure is missing source candidate provenance",
        "skill-candidate planning requires a procedure that preserves bounded candidate lineage",
      ],
      requiredGates: [
        "recreate the validated procedure through the bounded candidate-to-procedure path",
      ],
    });
    expect(countsAfter).toEqual(countsBefore);
  });

  it("creates one bounded skill-candidate row from an eligible validated procedure", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });
    const validateTool = createProcedureValidateTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const createSkillCandidateTool = createSkillCandidateCreateTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });

    const submitResult = await submitTool.execute("call-16zm", {
      kind: "procedure",
      content: "Validated procedure candidate for bounded skill-candidate creation",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;

    await reviewTool.execute("call-16zn", {
      candidateId,
      outcome: "accepted",
      rationale: "Accepted for bounded skill-candidate creation.",
    });

    const promoteResult = await promoteTool.execute("call-16zo", {
      candidateId,
      title: "Validated Procedure For Skill Candidate",
    });
    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;

    await validateTool.execute("call-16zp", {
      procedureId,
      rationale: "Validated before bounded skill-candidate creation.",
    });

    const createResult = await createSkillCandidateTool.execute("call-16zq", {
      procedureId,
      rationale: "Create one bounded skill-candidate record only.",
    });

    expect(createResult.details).toEqual({
      accepted: true,
      status: "created",
      procedureId,
      skillCandidateId: expect.any(String),
      skillCandidateStatus: "candidate",
      sourceCandidateId: candidateId,
    });

    const details = createResult.details as {
      skillCandidateId: string;
    };
    const skillCandidateRow = await querySingleRow<{
      source_procedure_id: string;
      status: string;
      name: string;
      summary: string;
      metadata: Record<string, unknown>;
    }>(
      dbEnvironment.connectionString,
      `
        select
          source_procedure_id::text as source_procedure_id,
          status::text as status,
          name,
          summary,
          metadata
        from memory_middleware.skill_candidates
        where id = $1::uuid
      `,
      [details.skillCandidateId],
    );
    const counts = await querySingleRow<{
      skill_candidates_count: string;
      procedures_count: string;
      procedure_runs_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count,
          (select count(*)::text from memory_middleware.procedures) as procedures_count,
          (select count(*)::text from memory_middleware.procedure_runs) as procedure_runs_count
      `,
      [],
    );

    expect(skillCandidateRow).toEqual({
      source_procedure_id: procedureId,
      status: "candidate",
      name: "Validated Procedure For Skill Candidate",
      summary: "Validated procedure candidate for bounded skill-candidate creation",
      metadata: {
        source: "skill-candidate-create-tool",
        createdFromProcedureId: procedureId,
        sourceCandidateId: candidateId,
        promotedFromReviewId: expect.any(String),
        sourceEventId: expect.any(String),
        validationRunId: expect.any(String),
        creatorAgentId: seeded.agentId,
        creationRationale: "Create one bounded skill-candidate record only.",
      },
    });
    expect(counts).toEqual({
      skill_candidates_count: "1",
      procedures_count: "1",
      procedure_runs_count: "1",
    });
  });

  it("returns already_created on repeat bounded skill-candidate creation without duplicates", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });
    const validateTool = createProcedureValidateTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const createSkillCandidateTool = createSkillCandidateCreateTool({ runtime });

    const submitResult = await submitTool.execute("call-16zr", {
      kind: "procedure",
      content: "Validated procedure candidate for repeat-safe skill-candidate creation",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;

    await reviewTool.execute("call-16zs", {
      candidateId,
      outcome: "accepted",
    });
    const promoteResult = await promoteTool.execute("call-16zt", {
      candidateId,
      title: "Repeat-safe Skill Candidate Procedure",
    });
    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;
    await validateTool.execute("call-16zu", {
      procedureId,
    });

    const firstCreate = await createSkillCandidateTool.execute("call-16zv", {
      procedureId,
    });
    const secondCreate = await createSkillCandidateTool.execute("call-16zw", {
      procedureId,
      rationale: "Should not create a duplicate bounded skill-candidate row.",
    });

    const firstSkillCandidateId = (firstCreate.details as { skillCandidateId: string })
      .skillCandidateId;
    expect(secondCreate.details).toEqual({
      accepted: true,
      status: "already_created",
      procedureId,
      skillCandidateId: firstSkillCandidateId,
      skillCandidateStatus: "candidate",
      sourceCandidateId: candidateId,
    });

    const counts = await querySingleRow<{
      skill_candidates_count: string;
    }>(
      dbEnvironment.connectionString,
      `select count(*)::text as skill_candidates_count from memory_middleware.skill_candidates`,
      [],
    );
    expect(counts).toEqual({
      skill_candidates_count: "1",
    });
  });

  it("keeps ineligible validated procedures out of bounded skill-candidate creation", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const createSkillCandidateTool = createSkillCandidateCreateTool({ runtime });

    const insertedProcedure = await querySingleRow<{ id: string }>(
      dbEnvironment.connectionString,
      `
        insert into memory_middleware.procedures (
          project_id,
          status,
          title,
          body,
          metadata,
          validated_at
        )
        values ($1::uuid, 'validated', $2, $3, '{}'::jsonb, now())
        returning id::text as id
      `,
      [seeded.projectId, "Manual Validated Procedure", "Validated body without bounded lineage"],
    );
    const procedureId = insertedProcedure?.id;
    expect(procedureId).toBeTruthy();

    const result = await createSkillCandidateTool.execute("call-16zx", {
      procedureId,
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "ineligible",
      reason:
        "validated procedure is missing source candidate provenance skill-candidate planning requires a procedure that preserves bounded candidate lineage",
    });

    const counts = await querySingleRow<{
      skill_candidates_count: string;
    }>(
      dbEnvironment.connectionString,
      `select count(*)::text as skill_candidates_count from memory_middleware.skill_candidates`,
      [],
    );
    expect(counts).toEqual({
      skill_candidates_count: "0",
    });
  });

  it("returns advisory procurement handoff planning for eligible bounded skill candidates without writes", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });
    const validateTool = createProcedureValidateTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const createTool = createSkillCandidateCreateTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const procurementPlanTool = createSkillCandidateProcurementPlanTool({ runtime });

    const submitResult = await submitTool.execute("call-16zya", {
      kind: "procedure",
      content: "Validated procedure candidate for procurement handoff planning",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;

    await reviewTool.execute("call-16zyb", {
      candidateId,
      outcome: "accepted",
      rationale: "Accepted for bounded procurement handoff planning.",
    });

    const promoteResult = await promoteTool.execute("call-16zyc", {
      candidateId,
      title: "Validated Procedure For Procurement Handoff",
    });
    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;

    await validateTool.execute("call-16zyd", {
      procedureId,
      rationale: "Validated before procurement handoff planning.",
    });

    const createResult = await createTool.execute("call-16zye", {
      procedureId,
      rationale: "Create bounded skill candidate for procurement handoff planning.",
    });
    const skillCandidateId = (createResult.details as { skillCandidateId: string })
      .skillCandidateId;

    const countsBefore = await querySingleRow<{
      skill_candidates_count: string;
      procedures_count: string;
      procedure_runs_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count,
          (select count(*)::text from memory_middleware.procedures) as procedures_count,
          (select count(*)::text from memory_middleware.procedure_runs) as procedure_runs_count
      `,
      [],
    );

    const planResult = await procurementPlanTool.execute("call-16zyf", {
      skillCandidateId,
    });

    const countsAfter = await querySingleRow<{
      skill_candidates_count: string;
      procedures_count: string;
      procedure_runs_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count,
          (select count(*)::text from memory_middleware.procedures) as procedures_count,
          (select count(*)::text from memory_middleware.procedure_runs) as procedure_runs_count
      `,
      [],
    );

    expect(planResult.details).toEqual({
      accepted: true,
      status: "ok",
      skillCandidateId,
      skillCandidateStatus: "candidate",
      sourceProcedureId: procedureId,
      sourceCandidateId: candidateId,
      latestValidationRunOutcome: "passed",
      eligible: true,
      possibleTargets: ["propose_procurement_handoff", "remain_internal_skill_candidate_only"],
      rationale: [
        "skill candidate remains in bounded internal candidate state",
        "bounded lineage preserves validated procedure, candidate, review, event, and validation evidence",
      ],
      requiredGates: [
        "manual procurement handoff confirmation is still required",
        "Skill Vetter must be invoked explicitly outside this advisory slice",
        "minimum vetting outputs must be recorded before lifecycle advancement",
        "installation remains blocked until procurement and policy gates pass",
      ],
      handoff: {
        source: {
          sourceType: "bounded_internal_skill_candidate",
          skillCandidateId,
          sourceProcedureId: procedureId,
          sourceCandidateId: candidateId,
          sourceEventId: expect.any(String),
          validationRunId: expect.any(String),
        },
        scope: {
          name: "Validated Procedure For Procurement Handoff",
          summary: "Validated procedure candidate for procurement handoff planning",
          intendedRole: "candidate_reusable_behavior",
          boundaries: [
            "bounded internal skill candidate only",
            "no installation or runtime enablement is implied by this plan",
            "must remain an accelerator and not the canonical memory substrate",
          ],
          overlaps: [
            "candidate reusable behavior distilled from a validated procedure",
            "future external skill evaluation must remain subordinate to repo-native memory architecture",
          ],
        },
        permissionsRisk: {
          currentArtifactRisk: "bounded_internal_record_only",
          installRisk: "external_skill_not_reviewed",
          requiredChecks: [
            "review file, network, secret, and execution expectations during procurement",
            "confirm requested capability is compatible with current policy posture",
            "verify the actual packaged skill before any install decision",
          ],
        },
        suspiciousPatterns: {
          knownConcerns: [
            "no external package has been reviewed yet",
            "Skill Vetter has not been invoked by this planning surface",
          ],
          openQuestions: [
            "determine the packaging or source path for any future external skill candidate",
            "review the actual external implementation for suspicious patterns before installation",
          ],
        },
        operationalFit: {
          roadmapRole: "skill_candidate",
          acceleratorOnly: true,
          canonicalMemorySubstrate: false,
          repoNativeLineagePreserved: true,
        },
        approvalRecommendation: {
          proposedLifecycleState: "under_review",
          installRecommendation: "do_not_install",
          blockers: [
            "Skill Vetter review has not been completed",
            "minimum vetting outputs are not yet recorded",
            "no installation is allowed in this advisory slice",
          ],
        },
      },
    });
    expect(countsAfter).toEqual(countsBefore);
  });

  it("keeps ineligible bounded skill candidates in remain_internal_skill_candidate_only planning", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const procurementPlanTool = createSkillCandidateProcurementPlanTool({ runtime });

    const insertedSkillCandidate = await querySingleRow<{ id: string }>(
      dbEnvironment.connectionString,
      `
        insert into memory_middleware.skill_candidates (
          project_id,
          status,
          name,
          summary,
          metadata
        )
        values ($1::uuid, 'candidate', $2, $3, '{}'::jsonb)
        returning id::text as id
      `,
      [seeded.projectId, "Manual Skill Candidate", "Candidate summary without bounded lineage"],
    );
    const skillCandidateId = insertedSkillCandidate?.id;
    expect(skillCandidateId).toBeTruthy();

    const countsBefore = await querySingleRow<{
      skill_candidates_count: string;
      procedures_count: string;
      procedure_runs_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count,
          (select count(*)::text from memory_middleware.procedures) as procedures_count,
          (select count(*)::text from memory_middleware.procedure_runs) as procedure_runs_count
      `,
      [],
    );

    const planResult = await procurementPlanTool.execute("call-16zyg", {
      skillCandidateId,
    });

    const countsAfter = await querySingleRow<{
      skill_candidates_count: string;
      procedures_count: string;
      procedure_runs_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count,
          (select count(*)::text from memory_middleware.procedures) as procedures_count,
          (select count(*)::text from memory_middleware.procedure_runs) as procedure_runs_count
      `,
      [],
    );

    expect(planResult.details).toEqual({
      accepted: true,
      status: "ok",
      skillCandidateId,
      skillCandidateStatus: "candidate",
      eligible: false,
      possibleTargets: ["remain_internal_skill_candidate_only"],
      rationale: [
        "skill candidate is missing source procedure provenance",
        "procurement handoff planning requires a bounded skill candidate linked to a validated procedure",
      ],
      requiredGates: ["recreate the skill candidate through the bounded procedure-to-skill path"],
    });
    expect(countsAfter).toEqual(countsBefore);
  });

  it("creates one bounded internal procurement record from an eligible skill candidate", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });
    const validateTool = createProcedureValidateTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const createSkillCandidateTool = createSkillCandidateCreateTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const createProcurementRecordTool = createSkillCandidateProcurementRecordCreateTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });

    const submitResult = await submitTool.execute("call-16zyh", {
      kind: "procedure",
      content: "Validated procedure candidate for procurement record creation",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;

    await reviewTool.execute("call-16zyi", {
      candidateId,
      outcome: "accepted",
    });
    const promoteResult = await promoteTool.execute("call-16zyj", {
      candidateId,
      title: "Validated Procedure For Procurement Record",
    });
    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;
    await validateTool.execute("call-16zyk", {
      procedureId,
    });
    const createSkillCandidateResult = await createSkillCandidateTool.execute("call-16zyl", {
      procedureId,
    });
    const skillCandidateId = (createSkillCandidateResult.details as { skillCandidateId: string })
      .skillCandidateId;

    const createResult = await createProcurementRecordTool.execute("call-16zym", {
      skillCandidateId,
      rationale: "Persist internal procurement handoff context only.",
    });

    expect(createResult.details).toEqual({
      accepted: true,
      status: "created",
      skillCandidateId,
      procurementRecordId: expect.any(String),
      skillCandidateStatus: "candidate",
      sourceProcedureId: procedureId,
      sourceCandidateId: candidateId,
    });

    const details = createResult.details as { procurementRecordId: string };
    const eventRow = await querySingleRow<{
      event_kind: string;
      event_name: string;
      payload: {
        source: string;
        handoff: {
          source: {
            skillCandidateId: string;
            sourceProcedureId: string;
            sourceCandidateId: string;
            sourceEventId: string;
            validationRunId: string;
          };
        };
        rationale: string[];
        requiredGates: string[];
      };
      metadata: Record<string, unknown>;
    }>(
      dbEnvironment.connectionString,
      `
        select event_kind, event_name, payload, metadata
        from memory_middleware.memory_events
        where id = $1::uuid
      `,
      [details.procurementRecordId],
    );

    expect(eventRow).toEqual({
      event_kind: "review",
      event_name: "skill_candidate.procurement_record",
      payload: {
        source: "skill-candidate-procurement-record-tool",
        handoff: {
          source: {
            sourceType: "bounded_internal_skill_candidate",
            skillCandidateId,
            sourceProcedureId: procedureId,
            sourceCandidateId: candidateId,
            sourceEventId: expect.any(String),
            validationRunId: expect.any(String),
          },
          scope: {
            name: "Validated Procedure For Procurement Record",
            summary: "Validated procedure candidate for procurement record creation",
            intendedRole: "candidate_reusable_behavior",
            boundaries: [
              "bounded internal skill candidate only",
              "no installation or runtime enablement is implied by this plan",
              "must remain an accelerator and not the canonical memory substrate",
            ],
            overlaps: [
              "candidate reusable behavior distilled from a validated procedure",
              "future external skill evaluation must remain subordinate to repo-native memory architecture",
            ],
          },
          permissionsRisk: {
            currentArtifactRisk: "bounded_internal_record_only",
            installRisk: "external_skill_not_reviewed",
            requiredChecks: [
              "review file, network, secret, and execution expectations during procurement",
              "confirm requested capability is compatible with current policy posture",
              "verify the actual packaged skill before any install decision",
            ],
          },
          suspiciousPatterns: {
            knownConcerns: [
              "no external package has been reviewed yet",
              "Skill Vetter has not been invoked by this planning surface",
            ],
            openQuestions: [
              "determine the packaging or source path for any future external skill candidate",
              "review the actual external implementation for suspicious patterns before installation",
            ],
          },
          operationalFit: {
            roadmapRole: "skill_candidate",
            acceleratorOnly: true,
            canonicalMemorySubstrate: false,
            repoNativeLineagePreserved: true,
          },
          approvalRecommendation: {
            proposedLifecycleState: "under_review",
            installRecommendation: "do_not_install",
            blockers: [
              "Skill Vetter review has not been completed",
              "minimum vetting outputs are not yet recorded",
              "no installation is allowed in this advisory slice",
            ],
          },
        },
        rationale: [
          "skill candidate remains in bounded internal candidate state",
          "bounded lineage preserves validated procedure, candidate, review, event, and validation evidence",
        ],
        requiredGates: [
          "manual procurement handoff confirmation is still required",
          "Skill Vetter must be invoked explicitly outside this advisory slice",
          "minimum vetting outputs must be recorded before lifecycle advancement",
          "installation remains blocked until procurement and policy gates pass",
        ],
      },
      metadata: {
        source: "skill-candidate-procurement-record-tool",
        skillCandidateId,
        sourceProcedureId: procedureId,
        sourceCandidateId: candidateId,
        recorderAgentId: seeded.agentId,
        recordRationale: "Persist internal procurement handoff context only.",
      },
    });
  });

  it("returns already_created on repeat procurement-record creation without duplicates", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({ runtime });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });
    const validateTool = createProcedureValidateTool({ runtime });
    const createSkillCandidateTool = createSkillCandidateCreateTool({ runtime });
    const createProcurementRecordTool = createSkillCandidateProcurementRecordCreateTool({
      runtime,
    });

    const submitResult = await submitTool.execute("call-16zyn", {
      kind: "procedure",
      content: "Validated procedure candidate for repeat-safe procurement records",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-16zyo", {
      candidateId,
      outcome: "accepted",
    });
    const promoteResult = await promoteTool.execute("call-16zyp", {
      candidateId,
      title: "Repeat-safe Procurement Record Procedure",
    });
    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;
    await validateTool.execute("call-16zyq", { procedureId });
    const createSkillCandidateResult = await createSkillCandidateTool.execute("call-16zyr", {
      procedureId,
    });
    const skillCandidateId = (createSkillCandidateResult.details as { skillCandidateId: string })
      .skillCandidateId;

    const firstCreate = await createProcurementRecordTool.execute("call-16zys", {
      skillCandidateId,
    });
    const secondCreate = await createProcurementRecordTool.execute("call-16zyt", {
      skillCandidateId,
      rationale: "Should not create a duplicate internal procurement record.",
    });

    const procurementRecordId = (firstCreate.details as { procurementRecordId: string })
      .procurementRecordId;
    expect(secondCreate.details).toEqual({
      accepted: true,
      status: "already_created",
      skillCandidateId,
      procurementRecordId,
      skillCandidateStatus: "candidate",
      sourceProcedureId: procedureId,
      sourceCandidateId: candidateId,
    });

    const counts = await querySingleRow<{
      procurement_record_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select count(*)::text as procurement_record_count
        from memory_middleware.memory_events
        where event_name = 'skill_candidate.procurement_record'
      `,
      [],
    );
    expect(counts).toEqual({
      procurement_record_count: "1",
    });
  });

  it("keeps ineligible skill candidates out of procurement-record creation", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const createProcurementRecordTool = createSkillCandidateProcurementRecordCreateTool({
      runtime,
    });

    const insertedSkillCandidate = await querySingleRow<{ id: string }>(
      dbEnvironment.connectionString,
      `
        insert into memory_middleware.skill_candidates (
          project_id,
          status,
          name,
          summary,
          metadata
        )
        values ($1::uuid, 'candidate', $2, $3, '{}'::jsonb)
        returning id::text as id
      `,
      [seeded.projectId, "Manual Skill Candidate", "Candidate summary without bounded lineage"],
    );
    const skillCandidateId = insertedSkillCandidate?.id;
    expect(skillCandidateId).toBeTruthy();

    const result = await createProcurementRecordTool.execute("call-16zyu", {
      skillCandidateId,
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "ineligible",
      reason:
        "skill candidate is missing source procedure provenance procurement handoff planning requires a bounded skill candidate linked to a validated procedure",
    });
  });

  it("returns advisory manual Skill Vetter handoff planning for eligible skill candidates with procurement records without writes", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });
    const validateTool = createProcedureValidateTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const createSkillCandidateTool = createSkillCandidateCreateTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const createProcurementRecordTool = createSkillCandidateProcurementRecordCreateTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const handoffTool = createSkillCandidateSkillVetterHandoffTool({ runtime });

    const submitResult = await submitTool.execute("call-16zyv", {
      kind: "procedure",
      content: "Validated procedure candidate for manual Skill Vetter handoff",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-16zyw", {
      candidateId,
      outcome: "accepted",
    });
    const promoteResult = await promoteTool.execute("call-16zyx", {
      candidateId,
      title: "Validated Procedure For Manual Skill Vetter Handoff",
    });
    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;
    await validateTool.execute("call-16zyy", {
      procedureId,
    });
    const createSkillCandidateResult = await createSkillCandidateTool.execute("call-16zyz", {
      procedureId,
    });
    const skillCandidateId = (createSkillCandidateResult.details as { skillCandidateId: string })
      .skillCandidateId;
    const procurementRecordResult = await createProcurementRecordTool.execute("call-16zz0", {
      skillCandidateId,
      rationale: "Persist procurement record before manual Skill Vetter handoff.",
    });
    const procurementRecordId = (procurementRecordResult.details as { procurementRecordId: string })
      .procurementRecordId;

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const handoffResult = await handoffTool.execute("call-16zz1", {
      skillCandidateId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(handoffResult.details).toEqual({
      accepted: true,
      status: "ok",
      skillCandidateId,
      skillCandidateStatus: "candidate",
      procurementRecordId,
      sourceProcedureId: procedureId,
      sourceCandidateId: candidateId,
      latestValidationRunOutcome: "passed",
      eligible: true,
      possibleTargets: ["propose_skill_vetter_handoff", "remain_internal_only"],
      rationale: [
        "skill candidate remains in bounded internal candidate state",
        "a procurement record already preserves the structured handoff package for manual vetting",
      ],
      requiredGates: [
        "manual Skill Vetter invocation is still required",
        "manual procurement handoff confirmation is still required",
        "Skill Vetter must be invoked explicitly outside this advisory slice",
        "minimum vetting outputs must be recorded before lifecycle advancement",
        "installation remains blocked until procurement and policy gates pass",
        "manual Skill Vetter findings must be recorded before lifecycle advancement",
        "installation remains blocked until procurement, vetting, and policy gates pass",
      ],
      handoff: {
        procurementRecord: {
          procurementRecordId,
          eventName: "skill_candidate.procurement_record",
          recordedAt: expect.any(String),
        },
        handoff: {
          source: {
            sourceType: "bounded_internal_skill_candidate",
            skillCandidateId,
            sourceProcedureId: procedureId,
            sourceCandidateId: candidateId,
            sourceEventId: expect.any(String),
            validationRunId: expect.any(String),
          },
          scope: {
            name: "Validated Procedure For Manual Skill Vetter Handoff",
            summary: "Validated procedure candidate for manual Skill Vetter handoff",
            intendedRole: "candidate_reusable_behavior",
            boundaries: [
              "bounded internal skill candidate only",
              "no installation or runtime enablement is implied by this plan",
              "must remain an accelerator and not the canonical memory substrate",
            ],
            overlaps: [
              "candidate reusable behavior distilled from a validated procedure",
              "future external skill evaluation must remain subordinate to repo-native memory architecture",
            ],
          },
          permissionsRisk: {
            currentArtifactRisk: "bounded_internal_record_only",
            installRisk: "external_skill_not_reviewed",
            requiredChecks: [
              "review file, network, secret, and execution expectations during procurement",
              "confirm requested capability is compatible with current policy posture",
              "verify the actual packaged skill before any install decision",
            ],
          },
          suspiciousPatterns: {
            knownConcerns: [
              "no external package has been reviewed yet",
              "Skill Vetter has not been invoked by this planning surface",
            ],
            openQuestions: [
              "determine the packaging or source path for any future external skill candidate",
              "review the actual external implementation for suspicious patterns before installation",
            ],
          },
          operationalFit: {
            roadmapRole: "skill_candidate",
            acceleratorOnly: true,
            canonicalMemorySubstrate: false,
            repoNativeLineagePreserved: true,
          },
          approvalRecommendation: {
            proposedLifecycleState: "under_review",
            installRecommendation: "do_not_install",
            blockers: [
              "Skill Vetter review has not been completed",
              "minimum vetting outputs are not yet recorded",
              "no installation is allowed in this advisory slice",
            ],
          },
        },
        manualSkillVetterInputs: {
          source: {
            sourceType: "bounded_internal_skill_candidate",
            skillCandidateId,
            sourceProcedureId: procedureId,
            sourceCandidateId: candidateId,
            sourceEventId: expect.any(String),
            validationRunId: expect.any(String),
          },
          scope: {
            name: "Validated Procedure For Manual Skill Vetter Handoff",
            summary: "Validated procedure candidate for manual Skill Vetter handoff",
            intendedRole: "candidate_reusable_behavior",
            boundaries: [
              "bounded internal skill candidate only",
              "no installation or runtime enablement is implied by this plan",
              "must remain an accelerator and not the canonical memory substrate",
            ],
            overlaps: [
              "candidate reusable behavior distilled from a validated procedure",
              "future external skill evaluation must remain subordinate to repo-native memory architecture",
            ],
          },
          permissionsRisk: {
            currentArtifactRisk: "bounded_internal_record_only",
            installRisk: "external_skill_not_reviewed",
            requiredChecks: [
              "review file, network, secret, and execution expectations during procurement",
              "confirm requested capability is compatible with current policy posture",
              "verify the actual packaged skill before any install decision",
            ],
          },
          suspiciousPatterns: {
            knownConcerns: [
              "no external package has been reviewed yet",
              "Skill Vetter has not been invoked by this planning surface",
            ],
            openQuestions: [
              "determine the packaging or source path for any future external skill candidate",
              "review the actual external implementation for suspicious patterns before installation",
            ],
          },
          operationalFit: {
            roadmapRole: "skill_candidate",
            acceleratorOnly: true,
            canonicalMemorySubstrate: false,
            repoNativeLineagePreserved: true,
          },
          approvalRecommendation: {
            proposedLifecycleState: "under_review",
            installRecommendation: "do_not_install",
            blockers: [
              "Skill Vetter review has not been completed",
              "minimum vetting outputs are not yet recorded",
              "no installation is allowed in this advisory slice",
            ],
          },
        },
        manualSteps: [
          "run Skill Vetter manually against the actual external skill artifact or source path",
          "compare Skill Vetter findings against the preserved bounded lineage and procurement record",
          "record minimum vetting outputs before any lifecycle advancement or install decision",
        ],
        installGuardrails: [
          "do not install any skill from this handoff package alone",
          "do not treat this handoff as Skill Vetter output",
          "keep the candidate in internal-only state until manual vetting and approval gates complete",
        ],
      },
    });
    expect(countsAfter).toEqual(countsBefore);
  });

  it("keeps skill candidates without procurement records out of manual Skill Vetter handoff planning", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({ runtime });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });
    const validateTool = createProcedureValidateTool({ runtime });
    const createSkillCandidateTool = createSkillCandidateCreateTool({ runtime });
    const handoffTool = createSkillCandidateSkillVetterHandoffTool({ runtime });

    const submitResult = await submitTool.execute("call-16zz2", {
      kind: "procedure",
      content: "Validated procedure candidate without procurement record",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-16zz3", {
      candidateId,
      outcome: "accepted",
    });
    const promoteResult = await promoteTool.execute("call-16zz4", {
      candidateId,
      title: "Procedure Without Procurement Record",
    });
    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;
    await validateTool.execute("call-16zz5", { procedureId });
    const createSkillCandidateResult = await createSkillCandidateTool.execute("call-16zz6", {
      procedureId,
    });
    const skillCandidateId = (createSkillCandidateResult.details as { skillCandidateId: string })
      .skillCandidateId;

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await handoffTool.execute("call-16zz7", {
      skillCandidateId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(result.details).toEqual({
      accepted: true,
      status: "ok",
      skillCandidateId,
      skillCandidateStatus: "candidate",
      sourceProcedureId: procedureId,
      sourceCandidateId: candidateId,
      latestValidationRunOutcome: "passed",
      eligible: false,
      possibleTargets: ["remain_internal_only"],
      rationale: [
        "skill candidate is missing an internal procurement record",
        "manual Skill Vetter handoff requires a persisted procurement record before review handoff",
      ],
      requiredGates: [
        "create a bounded procurement record before preparing manual Skill Vetter handoff",
      ],
    });
    expect(countsAfter).toEqual(countsBefore);
  });

  it("creates one bounded internal vetting-result record from an eligible manual Skill Vetter handoff context", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });
    const validateTool = createProcedureValidateTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const createSkillCandidateTool = createSkillCandidateCreateTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const createProcurementRecordTool = createSkillCandidateProcurementRecordCreateTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const createVettingResultTool = createSkillCandidateVettingResultRecordTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });

    const submitResult = await submitTool.execute("call-16zz8", {
      kind: "procedure",
      content: "Validated procedure candidate for manual vetting-result recording",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-16zz9", {
      candidateId,
      outcome: "accepted",
    });
    const promoteResult = await promoteTool.execute("call-16zza", {
      candidateId,
      title: "Validated Procedure For Manual Vetting Result",
    });
    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;
    await validateTool.execute("call-16zzb", {
      procedureId,
    });
    const createSkillCandidateResult = await createSkillCandidateTool.execute("call-16zzc", {
      procedureId,
    });
    const skillCandidateId = (createSkillCandidateResult.details as { skillCandidateId: string })
      .skillCandidateId;
    const procurementRecordResult = await createProcurementRecordTool.execute("call-16zzd", {
      skillCandidateId,
      rationale: "Persist procurement record before manual vetting-result recording.",
    });
    const procurementRecordId = (procurementRecordResult.details as { procurementRecordId: string })
      .procurementRecordId;

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const createResult = await createVettingResultTool.execute("call-16zze", {
      skillCandidateId,
      decision: "approve_limited",
      summary: "Manual Skill Vetter review completed for bounded limited use only.",
      permissionsRisk: {
        level: "medium",
        notes: ["file access needs explicit review before any install decision"],
        requiredChecks: ["verify runtime write surfaces remain bounded"],
      },
      suspiciousPatterns: {
        redFlags: ["no automatic install path should be enabled from this result"],
        unresolvedQuestions: ["review the exact packaged artifact before any install decision"],
      },
      operationalFit: {
        fit: "limited",
        notes: ["bounded candidate lineage is preserved", "use remains accelerator-only"],
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
      },
      approvalRecommendation: {
        proposedLifecycleState: "approved_limited",
        installRecommendation: "manual_followup_required",
        blockers: ["manual install approval remains out of scope for this slice"],
      },
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(createResult.details).toEqual({
      accepted: true,
      status: "created",
      skillCandidateId,
      procurementRecordId,
      vettingResultRecordId: expect.any(String),
      decision: "approve_limited",
      skillCandidateStatus: "candidate",
      sourceProcedureId: procedureId,
      sourceCandidateId: candidateId,
    });

    const details = createResult.details as { vettingResultRecordId: string };
    const eventRow = await querySingleRow<{
      event_kind: string;
      event_name: string;
      payload: {
        source: string;
        procurementRecordId: string;
        decision: string;
        summary: string;
        requiredGates: string[];
        result: {
          permissionsRisk: Record<string, unknown>;
          suspiciousPatterns: Record<string, unknown>;
          operationalFit: Record<string, unknown>;
          approvalRecommendation: Record<string, unknown>;
        };
      };
      metadata: Record<string, unknown>;
    }>(
      dbEnvironment.connectionString,
      `
        select event_kind, event_name, payload, metadata
        from memory_middleware.memory_events
        where id = $1::uuid
      `,
      [details.vettingResultRecordId],
    );

    expect(eventRow).toEqual({
      event_kind: "review",
      event_name: "skill_candidate.vetting_result",
      payload: {
        source: "skill-candidate-vetting-result-tool",
        procurementRecordId,
        handoff: expect.any(Object),
        decision: "approve_limited",
        summary: "Manual Skill Vetter review completed for bounded limited use only.",
        result: {
          permissionsRisk: {
            level: "medium",
            notes: ["file access needs explicit review before any install decision"],
            requiredChecks: ["verify runtime write surfaces remain bounded"],
          },
          suspiciousPatterns: {
            redFlags: ["no automatic install path should be enabled from this result"],
            unresolvedQuestions: ["review the exact packaged artifact before any install decision"],
          },
          operationalFit: {
            fit: "limited",
            notes: ["bounded candidate lineage is preserved", "use remains accelerator-only"],
            acceleratorOnly: true,
            canonicalMemorySubstrate: false,
          },
          approvalRecommendation: {
            proposedLifecycleState: "approved_limited",
            installRecommendation: "manual_followup_required",
            blockers: ["manual install approval remains out of scope for this slice"],
          },
        },
        requiredGates: expect.arrayContaining([
          "manual Skill Vetter invocation is still required",
          "installation remains blocked until procurement, vetting, and policy gates pass",
        ]),
      },
      metadata: {
        source: "skill-candidate-vetting-result-tool",
        skillCandidateId,
        procurementRecordId,
        vettingDecision: "approve_limited",
        sourceProcedureId: procedureId,
        sourceCandidateId: candidateId,
        reviewerAgentId: seeded.agentId,
        vettingSummary: "Manual Skill Vetter review completed for bounded limited use only.",
      },
    });
    expect(countsAfter).toEqual({
      ...countsBefore,
      memory_events: String(Number(countsBefore.memory_events) + 1),
    });
  });

  it("returns already_created on repeat vetting-result creation without duplicates", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({ runtime });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });
    const validateTool = createProcedureValidateTool({ runtime });
    const createSkillCandidateTool = createSkillCandidateCreateTool({ runtime });
    const createProcurementRecordTool = createSkillCandidateProcurementRecordCreateTool({
      runtime,
    });
    const createVettingResultTool = createSkillCandidateVettingResultRecordTool({ runtime });

    const submitResult = await submitTool.execute("call-16zzf", {
      kind: "procedure",
      content: "Validated procedure candidate for repeat-safe vetting results",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-16zzg", {
      candidateId,
      outcome: "accepted",
    });
    const promoteResult = await promoteTool.execute("call-16zzh", {
      candidateId,
      title: "Repeat-safe Vetting Result Procedure",
    });
    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;
    await validateTool.execute("call-16zzi", { procedureId });
    const createSkillCandidateResult = await createSkillCandidateTool.execute("call-16zzj", {
      procedureId,
    });
    const skillCandidateId = (createSkillCandidateResult.details as { skillCandidateId: string })
      .skillCandidateId;
    const procurementRecordResult = await createProcurementRecordTool.execute("call-16zzk", {
      skillCandidateId,
    });
    const procurementRecordId = (procurementRecordResult.details as { procurementRecordId: string })
      .procurementRecordId;

    const firstCreate = await createVettingResultTool.execute("call-16zzl", {
      skillCandidateId,
      decision: "defer",
      permissionsRisk: {
        level: "medium",
        notes: ["needs more review"],
        requiredChecks: ["manual follow-up required"],
      },
      suspiciousPatterns: {
        redFlags: [],
        unresolvedQuestions: ["review packaged entrypoint"],
      },
      operationalFit: {
        fit: "limited",
        notes: ["bounded but not yet ready"],
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
      },
      approvalRecommendation: {
        proposedLifecycleState: "under_review",
        installRecommendation: "do_not_install",
        blockers: ["manual review still open"],
      },
    });
    const secondCreate = await createVettingResultTool.execute("call-16zzm", {
      skillCandidateId,
      decision: "approve_normal",
      permissionsRisk: {
        level: "low",
        notes: ["should not be written on repeat"],
        requiredChecks: ["ignore repeat payload"],
      },
      suspiciousPatterns: {
        redFlags: [],
        unresolvedQuestions: [],
      },
      operationalFit: {
        fit: "good",
        notes: ["should not overwrite"],
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
      },
      approvalRecommendation: {
        proposedLifecycleState: "approved_normal",
        installRecommendation: "manual_followup_required",
        blockers: [],
      },
    });

    const vettingResultRecordId = (firstCreate.details as { vettingResultRecordId: string })
      .vettingResultRecordId;
    expect(secondCreate.details).toEqual({
      accepted: true,
      status: "already_created",
      skillCandidateId,
      procurementRecordId,
      vettingResultRecordId,
      decision: "defer",
      skillCandidateStatus: "candidate",
      sourceProcedureId: procedureId,
      sourceCandidateId: candidateId,
    });

    const counts = await querySingleRow<{
      vetting_result_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select count(*)::text as vetting_result_count
        from memory_middleware.memory_events
        where event_name = 'skill_candidate.vetting_result'
      `,
      [],
    );
    expect(counts).toEqual({
      vetting_result_count: "1",
    });
  });

  it("keeps ineligible skill candidates out of vetting-result creation", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const createVettingResultTool = createSkillCandidateVettingResultRecordTool({
      runtime,
    });

    const insertedSkillCandidate = await querySingleRow<{ id: string }>(
      dbEnvironment.connectionString,
      `
        insert into memory_middleware.skill_candidates (
          project_id,
          status,
          name,
          summary,
          metadata
        )
        values ($1::uuid, 'candidate', $2, $3, '{}'::jsonb)
        returning id::text as id
      `,
      [seeded.projectId, "Manual Skill Candidate", "Candidate summary without procurement record"],
    );
    const skillCandidateId = insertedSkillCandidate?.id;
    expect(skillCandidateId).toBeTruthy();

    const result = await createVettingResultTool.execute("call-16zzn", {
      skillCandidateId,
      decision: "defer",
      permissionsRisk: {
        level: "low",
        notes: ["none"],
        requiredChecks: ["manual review still required"],
      },
      suspiciousPatterns: {
        redFlags: [],
        unresolvedQuestions: ["confirm packaged entrypoint"],
      },
      operationalFit: {
        fit: "good",
        notes: ["roadmap-aligned"],
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
      },
      approvalRecommendation: {
        proposedLifecycleState: "under_review",
        installRecommendation: "do_not_install",
        blockers: ["manual review still open"],
      },
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "ineligible",
      reason:
        "skill candidate is missing source procedure provenance manual Skill Vetter handoff requires a bounded skill candidate linked to a validated procedure",
    });
  });

  it("returns advisory limited-use approval planning for eligible skill candidates with recorded limited vetting results without writes", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({ runtime });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });
    const validateTool = createProcedureValidateTool({ runtime });
    const createSkillCandidateTool = createSkillCandidateCreateTool({ runtime });
    const createProcurementRecordTool = createSkillCandidateProcurementRecordCreateTool({
      runtime,
    });
    const createVettingResultTool = createSkillCandidateVettingResultRecordTool({ runtime });
    const approvalPlanTool = createSkillCandidateApprovalPlanTool({ runtime });

    const submitResult = await submitTool.execute("call-16zzo", {
      kind: "procedure",
      content: "Validated procedure candidate for limited approval planning",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-16zzp", {
      candidateId,
      outcome: "accepted",
    });
    const promoteResult = await promoteTool.execute("call-16zzq", {
      candidateId,
      title: "Limited Approval Planning Procedure",
    });
    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;
    await validateTool.execute("call-16zzr", { procedureId });
    const createSkillCandidateResult = await createSkillCandidateTool.execute("call-16zzs", {
      procedureId,
    });
    const skillCandidateId = (createSkillCandidateResult.details as { skillCandidateId: string })
      .skillCandidateId;
    const procurementRecordResult = await createProcurementRecordTool.execute("call-16zzt", {
      skillCandidateId,
    });
    const procurementRecordId = (procurementRecordResult.details as { procurementRecordId: string })
      .procurementRecordId;
    const createVettingResult = await createVettingResultTool.execute("call-16zzu", {
      skillCandidateId,
      decision: "approve_limited",
      summary: "Manual vetting supports bounded limited-use approval planning only.",
      permissionsRisk: {
        level: "medium",
        notes: ["install remains out of scope"],
        requiredChecks: ["confirm later install stays explicit and manual"],
      },
      suspiciousPatterns: {
        redFlags: [],
        unresolvedQuestions: ["confirm packaged artifact before any install action"],
      },
      operationalFit: {
        fit: "limited",
        notes: ["bounded lineage is preserved"],
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
      },
      approvalRecommendation: {
        proposedLifecycleState: "approved_limited",
        installRecommendation: "manual_followup_required",
        blockers: [],
      },
    });
    const vettingResultRecordId = (createVettingResult.details as { vettingResultRecordId: string })
      .vettingResultRecordId;

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await approvalPlanTool.execute("call-16zzv", {
      skillCandidateId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(result.details).toEqual({
      accepted: true,
      status: "ok",
      skillCandidateId,
      skillCandidateStatus: "candidate",
      procurementRecordId,
      vettingResultRecordId,
      sourceProcedureId: procedureId,
      sourceCandidateId: candidateId,
      latestValidationRunOutcome: "passed",
      latestVettingDecision: "approve_limited",
      eligible: true,
      possibleTargets: ["propose_approved_for_limited_use", "remain_internal_only"],
      rationale: [
        "manual vetting result supports bounded limited approval planning",
        "installation remains separate and guarded even when limited approval is proposed",
      ],
      requiredGates: [
        "manual approval-state mutation requires an explicit later write slice",
        "installation still requires a separate explicit action and policy confirmation",
      ],
      installGuardrails: [
        "do not install any skill from this planning result alone",
        "keep any later installation as a separate explicit action",
        "do not let the skill candidate replace the canonical memory substrate",
      ],
      remainingBlockers: [],
    });
    expect(countsAfter).toEqual(countsBefore);
  });

  it("returns advisory normal-use approval planning for eligible skill candidates with recorded normal vetting results without writes", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({ runtime });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });
    const validateTool = createProcedureValidateTool({ runtime });
    const createSkillCandidateTool = createSkillCandidateCreateTool({ runtime });
    const createProcurementRecordTool = createSkillCandidateProcurementRecordCreateTool({
      runtime,
    });
    const createVettingResultTool = createSkillCandidateVettingResultRecordTool({ runtime });
    const approvalPlanTool = createSkillCandidateApprovalPlanTool({ runtime });

    const submitResult = await submitTool.execute("call-16zzw", {
      kind: "procedure",
      content: "Validated procedure candidate for normal approval planning",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-16zzx", {
      candidateId,
      outcome: "accepted",
    });
    const promoteResult = await promoteTool.execute("call-16zzy", {
      candidateId,
      title: "Normal Approval Planning Procedure",
    });
    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;
    await validateTool.execute("call-16zzz", { procedureId });
    const createSkillCandidateResult = await createSkillCandidateTool.execute("call-17000", {
      procedureId,
    });
    const skillCandidateId = (createSkillCandidateResult.details as { skillCandidateId: string })
      .skillCandidateId;
    await createProcurementRecordTool.execute("call-17001", {
      skillCandidateId,
    });
    await createVettingResultTool.execute("call-17002", {
      skillCandidateId,
      decision: "approve_normal",
      summary: "Manual vetting supports bounded normal-use approval planning only.",
      permissionsRisk: {
        level: "low",
        notes: ["no additional blockers in the bounded record"],
        requiredChecks: ["keep install explicit and separate"],
      },
      suspiciousPatterns: {
        redFlags: [],
        unresolvedQuestions: ["confirm published package content before any install action"],
      },
      operationalFit: {
        fit: "good",
        notes: ["bounded lineage is preserved"],
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
      },
      approvalRecommendation: {
        proposedLifecycleState: "approved_normal",
        installRecommendation: "manual_followup_required",
        blockers: [],
      },
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await approvalPlanTool.execute("call-17003", {
      skillCandidateId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(result.details).toMatchObject({
      accepted: true,
      status: "ok",
      skillCandidateId,
      skillCandidateStatus: "candidate",
      sourceProcedureId: procedureId,
      sourceCandidateId: candidateId,
      latestValidationRunOutcome: "passed",
      latestVettingDecision: "approve_normal",
      eligible: true,
      possibleTargets: ["propose_approved_for_normal_use", "remain_internal_only"],
      rationale: [
        "manual vetting result supports bounded normal-use approval planning",
        "installation remains a separate guarded action even when normal-use approval is proposed",
      ],
      requiredGates: [
        "manual approval-state mutation requires an explicit later write slice",
        "installation still requires a separate explicit action and policy confirmation",
      ],
      installGuardrails: [
        "do not install any skill from this planning result alone",
        "keep any later installation as a separate explicit action",
        "do not let the skill candidate replace the canonical memory substrate",
      ],
      remainingBlockers: [],
    });
    expect(countsAfter).toEqual(countsBefore);
  });

  it("keeps skill candidates without recorded vetting results blocked in approval planning", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({ runtime });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });
    const validateTool = createProcedureValidateTool({ runtime });
    const createSkillCandidateTool = createSkillCandidateCreateTool({ runtime });
    const createProcurementRecordTool = createSkillCandidateProcurementRecordCreateTool({
      runtime,
    });
    const approvalPlanTool = createSkillCandidateApprovalPlanTool({ runtime });

    const submitResult = await submitTool.execute("call-17004", {
      kind: "procedure",
      content: "Validated procedure candidate without vetting result",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-17005", {
      candidateId,
      outcome: "accepted",
    });
    const promoteResult = await promoteTool.execute("call-17006", {
      candidateId,
      title: "Approval Planning Without Vetting Result",
    });
    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;
    await validateTool.execute("call-17007", { procedureId });
    const createSkillCandidateResult = await createSkillCandidateTool.execute("call-17008", {
      procedureId,
    });
    const skillCandidateId = (createSkillCandidateResult.details as { skillCandidateId: string })
      .skillCandidateId;
    const procurementRecordResult = await createProcurementRecordTool.execute("call-17009", {
      skillCandidateId,
    });
    const procurementRecordId = (procurementRecordResult.details as { procurementRecordId: string })
      .procurementRecordId;

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await approvalPlanTool.execute("call-17010", {
      skillCandidateId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(result.details).toEqual({
      accepted: true,
      status: "ok",
      skillCandidateId,
      skillCandidateStatus: "candidate",
      procurementRecordId,
      sourceProcedureId: procedureId,
      sourceCandidateId: candidateId,
      latestValidationRunOutcome: "passed",
      eligible: false,
      possibleTargets: ["remain_blocked"],
      rationale: [
        "skill candidate is missing a manual vetting result",
        "approval planning requires a recorded manual vetting result before any later approval consideration",
      ],
      requiredGates: ["record a bounded manual vetting result before approval planning"],
      installGuardrails: [
        "do not install any skill from this planning result alone",
        "keep any later installation as a separate explicit action",
        "do not let the skill candidate replace the canonical memory substrate",
      ],
      remainingBlockers: ["manual vetting result is missing"],
    });
    expect(countsAfter).toEqual(countsBefore);
  });

  it("records bounded limited approval state for eligible skill candidates", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({ runtime });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });
    const validateTool = createProcedureValidateTool({ runtime });
    const createSkillCandidateTool = createSkillCandidateCreateTool({ runtime });
    const createProcurementRecordTool = createSkillCandidateProcurementRecordCreateTool({
      runtime,
    });
    const createVettingResultTool = createSkillCandidateVettingResultRecordTool({ runtime });
    const approveTool = createSkillCandidateApproveTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });

    const submitResult = await submitTool.execute("call-17011", {
      kind: "procedure",
      content: "Validated procedure candidate for bounded limited approval",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-17012", { candidateId, outcome: "accepted" });
    const promoteResult = await promoteTool.execute("call-17013", {
      candidateId,
      title: "Bounded Limited Approval Procedure",
    });
    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;
    await validateTool.execute("call-17014", { procedureId });
    const createSkillCandidateResult = await createSkillCandidateTool.execute("call-17015", {
      procedureId,
    });
    const skillCandidateId = (createSkillCandidateResult.details as { skillCandidateId: string })
      .skillCandidateId;
    const procurementRecordResult = await createProcurementRecordTool.execute("call-17016", {
      skillCandidateId,
    });
    const procurementRecordId = (procurementRecordResult.details as { procurementRecordId: string })
      .procurementRecordId;
    const vettingResult = await createVettingResultTool.execute("call-17017", {
      skillCandidateId,
      decision: "approve_limited",
      summary: "Manual vetting supports bounded limited approval.",
      permissionsRisk: {
        level: "medium",
        notes: ["install remains separate"],
        requiredChecks: ["preserve accelerator-only posture"],
      },
      suspiciousPatterns: {
        redFlags: [],
        unresolvedQuestions: ["review packaged artifact before install"],
      },
      operationalFit: {
        fit: "limited",
        notes: ["bounded lineage preserved"],
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
      },
      approvalRecommendation: {
        proposedLifecycleState: "approved_limited",
        installRecommendation: "manual_followup_required",
        blockers: [],
      },
    });
    const vettingResultRecordId = (vettingResult.details as { vettingResultRecordId: string })
      .vettingResultRecordId;

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await approveTool.execute("call-17018", {
      skillCandidateId,
      scope: "limited",
      rationale: "Record bounded limited approval without installing.",
      metadata: {
        source: "integration-test",
      },
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(result.details).toEqual({
      accepted: true,
      status: "approved",
      skillCandidateId,
      approvalRecordId: expect.any(String),
      approvedScope: "limited",
      skillCandidateStatus: "approved_limited",
      procurementRecordId,
      vettingResultRecordId,
      sourceProcedureId: procedureId,
      sourceCandidateId: candidateId,
    });

    const approvalRecordId = (result.details as { approvalRecordId: string }).approvalRecordId;
    const stateRow = await querySingleRow<{
      status: string;
      vetted_at: string | null;
      latest_approval_record_id: string | null;
      latest_approved_scope: string | null;
      latest_procurement_record_id: string | null;
      latest_vetting_result_record_id: string | null;
      latest_approver_agent_id: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          status::text as status,
          to_char(vetted_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as vetted_at,
          metadata->>'latestApprovalRecordId' as latest_approval_record_id,
          metadata->>'latestApprovedScope' as latest_approved_scope,
          metadata->>'latestApprovalProcurementRecordId' as latest_procurement_record_id,
          metadata->>'latestApprovalVettingResultRecordId' as latest_vetting_result_record_id,
          metadata->>'latestApproverAgentId' as latest_approver_agent_id
        from memory_middleware.skill_candidates
        where id = $1::uuid
      `,
      [skillCandidateId],
    );
    const eventRow = await querySingleRow<{
      event_kind: string;
      event_name: string;
      payload: Record<string, unknown>;
      metadata: Record<string, unknown>;
    }>(
      dbEnvironment.connectionString,
      `
        select event_kind, event_name, payload, metadata
        from memory_middleware.memory_events
        where id = $1::uuid
      `,
      [approvalRecordId],
    );

    expect(stateRow).toEqual({
      status: "approved_limited",
      vetted_at: expect.any(String),
      latest_approval_record_id: approvalRecordId,
      latest_approved_scope: "limited",
      latest_procurement_record_id: procurementRecordId,
      latest_vetting_result_record_id: vettingResultRecordId,
      latest_approver_agent_id: seeded.agentId,
    });
    expect(eventRow).toEqual({
      event_kind: "review",
      event_name: "skill_candidate.approval",
      payload: {
        source: "skill-candidate-approve-tool",
        approvedScope: "limited",
        procurementRecordId,
        vettingResultRecordId,
        installGuardrails: [
          "do not install any skill from this planning result alone",
          "keep any later installation as a separate explicit action",
          "do not let the skill candidate replace the canonical memory substrate",
        ],
        requiredGates: [
          "manual approval-state mutation requires an explicit later write slice",
          "installation still requires a separate explicit action and policy confirmation",
        ],
        remainingBlockers: [],
        rationale: [
          "manual vetting result supports bounded limited approval planning",
          "installation remains separate and guarded even when limited approval is proposed",
        ],
      },
      metadata: {
        source: "skill-candidate-approve-tool",
        skillCandidateId,
        approvedScope: "limited",
        procurementRecordId,
        vettingResultRecordId,
        sourceProcedureId: procedureId,
        sourceCandidateId: candidateId,
        approverAgentId: seeded.agentId,
        approvalRationale: "Record bounded limited approval without installing.",
        approvalMetadata: {
          source: "integration-test",
        },
      },
    });
    expect(countsAfter).toEqual({
      ...countsBefore,
      memory_events: String(Number(countsBefore.memory_events) + 1),
    });
  });

  it("records bounded normal approval state for eligible skill candidates", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({ runtime });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });
    const validateTool = createProcedureValidateTool({ runtime });
    const createSkillCandidateTool = createSkillCandidateCreateTool({ runtime });
    const createProcurementRecordTool = createSkillCandidateProcurementRecordCreateTool({
      runtime,
    });
    const createVettingResultTool = createSkillCandidateVettingResultRecordTool({ runtime });
    const approveTool = createSkillCandidateApproveTool({ runtime });

    const submitResult = await submitTool.execute("call-17019", {
      kind: "procedure",
      content: "Validated procedure candidate for bounded normal approval",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-17020", { candidateId, outcome: "accepted" });
    const promoteResult = await promoteTool.execute("call-17021", {
      candidateId,
      title: "Bounded Normal Approval Procedure",
    });
    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;
    await validateTool.execute("call-17022", { procedureId });
    const createSkillCandidateResult = await createSkillCandidateTool.execute("call-17023", {
      procedureId,
    });
    const skillCandidateId = (createSkillCandidateResult.details as { skillCandidateId: string })
      .skillCandidateId;
    await createProcurementRecordTool.execute("call-17024", {
      skillCandidateId,
    });
    await createVettingResultTool.execute("call-17025", {
      skillCandidateId,
      decision: "approve_normal",
      permissionsRisk: {
        level: "low",
        notes: ["no bounded blockers remain"],
        requiredChecks: ["keep install explicit and separate"],
      },
      suspiciousPatterns: {
        redFlags: [],
        unresolvedQuestions: ["confirm published package before any install action"],
      },
      operationalFit: {
        fit: "good",
        notes: ["bounded lineage preserved"],
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
      },
      approvalRecommendation: {
        proposedLifecycleState: "approved_normal",
        installRecommendation: "manual_followup_required",
        blockers: [],
      },
    });

    const result = await approveTool.execute("call-17026", {
      skillCandidateId,
      scope: "normal",
    });

    expect(result.details).toMatchObject({
      accepted: true,
      status: "approved",
      skillCandidateId,
      approvedScope: "normal",
      skillCandidateStatus: "approved_normal",
      sourceProcedureId: procedureId,
      sourceCandidateId: candidateId,
    });
  });

  it("returns already_approved on repeated bounded approval writes without duplicates", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({ runtime });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });
    const validateTool = createProcedureValidateTool({ runtime });
    const createSkillCandidateTool = createSkillCandidateCreateTool({ runtime });
    const createProcurementRecordTool = createSkillCandidateProcurementRecordCreateTool({
      runtime,
    });
    const createVettingResultTool = createSkillCandidateVettingResultRecordTool({ runtime });
    const approveTool = createSkillCandidateApproveTool({ runtime });

    const submitResult = await submitTool.execute("call-17027", {
      kind: "procedure",
      content: "Repeat-safe bounded approval candidate",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-17028", { candidateId, outcome: "accepted" });
    const promoteResult = await promoteTool.execute("call-17029", {
      candidateId,
      title: "Repeat-safe Approval Procedure",
    });
    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;
    await validateTool.execute("call-17030", { procedureId });
    const createSkillCandidateResult = await createSkillCandidateTool.execute("call-17031", {
      procedureId,
    });
    const skillCandidateId = (createSkillCandidateResult.details as { skillCandidateId: string })
      .skillCandidateId;
    const procurementRecord = await createProcurementRecordTool.execute("call-17032", {
      skillCandidateId,
    });
    const procurementRecordId = (procurementRecord.details as { procurementRecordId: string })
      .procurementRecordId;
    const vettingResult = await createVettingResultTool.execute("call-17033", {
      skillCandidateId,
      decision: "approve_limited",
      permissionsRisk: {
        level: "medium",
        notes: ["repeat-safe approval test"],
        requiredChecks: ["keep install explicit"],
      },
      suspiciousPatterns: {
        redFlags: [],
        unresolvedQuestions: [],
      },
      operationalFit: {
        fit: "limited",
        notes: ["bounded lineage preserved"],
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
      },
      approvalRecommendation: {
        proposedLifecycleState: "approved_limited",
        installRecommendation: "manual_followup_required",
        blockers: [],
      },
    });
    const vettingResultRecordId = (vettingResult.details as { vettingResultRecordId: string })
      .vettingResultRecordId;

    const firstApproval = await approveTool.execute("call-17034", {
      skillCandidateId,
      scope: "limited",
    });
    const secondApproval = await approveTool.execute("call-17035", {
      skillCandidateId,
      scope: "limited",
    });

    const approvalRecordId = (firstApproval.details as { approvalRecordId: string })
      .approvalRecordId;
    expect(secondApproval.details).toEqual({
      accepted: true,
      status: "already_approved",
      skillCandidateId,
      approvalRecordId,
      approvedScope: "limited",
      skillCandidateStatus: "approved_limited",
      procurementRecordId,
      vettingResultRecordId,
      sourceProcedureId: procedureId,
      sourceCandidateId: candidateId,
    });

    const counts = await querySingleRow<{ approval_record_count: string }>(
      dbEnvironment.connectionString,
      `
        select count(*)::text as approval_record_count
        from memory_middleware.memory_events
        where event_name = 'skill_candidate.approval'
      `,
      [],
    );
    expect(counts).toEqual({
      approval_record_count: "1",
    });
  });

  it("keeps blocked skill candidates out of approval writes", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({ runtime });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });
    const validateTool = createProcedureValidateTool({ runtime });
    const createSkillCandidateTool = createSkillCandidateCreateTool({ runtime });
    const createProcurementRecordTool = createSkillCandidateProcurementRecordCreateTool({
      runtime,
    });
    const approveTool = createSkillCandidateApproveTool({ runtime });

    const submitResult = await submitTool.execute("call-17036", {
      kind: "procedure",
      content: "Validated procedure candidate without manual vetting result",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-17037", { candidateId, outcome: "accepted" });
    const promoteResult = await promoteTool.execute("call-17038", {
      candidateId,
      title: "Approval Write Blocked Procedure",
    });
    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;
    await validateTool.execute("call-17039", { procedureId });
    const createSkillCandidateResult = await createSkillCandidateTool.execute("call-17040", {
      procedureId,
    });
    const skillCandidateId = (createSkillCandidateResult.details as { skillCandidateId: string })
      .skillCandidateId;
    await createProcurementRecordTool.execute("call-17041", {
      skillCandidateId,
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await approveTool.execute("call-17042", {
      skillCandidateId,
      scope: "limited",
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(result.details).toEqual({
      accepted: false,
      status: "ineligible",
      reason:
        "skill candidate is missing a manual vetting result approval planning requires a recorded manual vetting result before any later approval consideration",
    });
    expect(countsAfter).toEqual(countsBefore);
  });

  it("returns advisory manual install handoff for approved bounded skill candidates without writes", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({ runtime });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });
    const validateTool = createProcedureValidateTool({ runtime });
    const createSkillCandidateTool = createSkillCandidateCreateTool({ runtime });
    const createProcurementRecordTool = createSkillCandidateProcurementRecordCreateTool({
      runtime,
    });
    const createVettingResultTool = createSkillCandidateVettingResultRecordTool({ runtime });
    const approveTool = createSkillCandidateApproveTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const installHandoffTool = createSkillCandidateInstallHandoffTool({ runtime });

    const submitResult = await submitTool.execute("call-17043", {
      kind: "procedure",
      content: "Approved bounded skill candidate for manual install handoff",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-17044", { candidateId, outcome: "accepted" });
    const promoteResult = await promoteTool.execute("call-17045", {
      candidateId,
      title: "Manual Install Handoff Procedure",
    });
    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;
    await validateTool.execute("call-17046", { procedureId });
    const createSkillCandidateResult = await createSkillCandidateTool.execute("call-17047", {
      procedureId,
    });
    const skillCandidateId = (createSkillCandidateResult.details as { skillCandidateId: string })
      .skillCandidateId;
    const procurementRecord = await createProcurementRecordTool.execute("call-17048", {
      skillCandidateId,
    });
    const procurementRecordId = (procurementRecord.details as { procurementRecordId: string })
      .procurementRecordId;
    const vettingResult = await createVettingResultTool.execute("call-17049", {
      skillCandidateId,
      decision: "approve_limited",
      permissionsRisk: {
        level: "medium",
        notes: ["manual install remains separate"],
        requiredChecks: ["preserve accelerator-only posture"],
      },
      suspiciousPatterns: {
        redFlags: [],
        unresolvedQuestions: ["verify actual package before any install action"],
      },
      operationalFit: {
        fit: "limited",
        notes: ["bounded lineage preserved"],
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
      },
      approvalRecommendation: {
        proposedLifecycleState: "approved_limited",
        installRecommendation: "manual_followup_required",
        blockers: [],
      },
    });
    const vettingResultRecordId = (vettingResult.details as { vettingResultRecordId: string })
      .vettingResultRecordId;
    const approvalResult = await approveTool.execute("call-17050", {
      skillCandidateId,
      scope: "limited",
      rationale: "Record bounded limited approval before any manual install review.",
    });
    const approvalRecordId = (approvalResult.details as { approvalRecordId: string })
      .approvalRecordId;

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await installHandoffTool.execute("call-17051", {
      skillCandidateId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(result.details).toEqual({
      accepted: true,
      status: "ok",
      skillCandidateId,
      skillCandidateStatus: "approved_limited",
      approvedScope: "limited",
      approvalRecordId,
      procurementRecordId,
      vettingResultRecordId,
      sourceProcedureId: procedureId,
      sourceCandidateId: candidateId,
      latestValidationRunOutcome: "passed",
      eligible: true,
      possibleTargets: ["propose_manual_install_handoff", "remain_approved_internal_only"],
      rationale: [
        "manual vetting result supports bounded limited approval planning",
        "installation remains separate and guarded even when limited approval is proposed",
        "installation remains a separate explicit manual step even after bounded approval is recorded",
      ],
      requiredGates: [
        "manual installation remains a separate explicit action",
        "respect the recorded install guardrails during any later install review",
      ],
      remainingBlockers: [],
      installGuardrails: [
        "do not install any skill from this planning result alone",
        "keep any later installation as a separate explicit action",
        "do not let the skill candidate replace the canonical memory substrate",
      ],
      handoff: {
        approval: {
          approvalRecordId,
          eventName: "skill_candidate.approval",
          recordedAt: expect.any(String),
          approvedScope: "limited",
        },
        source: {
          skillCandidateId,
          sourceProcedureId: procedureId,
          sourceCandidateId: candidateId,
          procurementRecordId,
          vettingResultRecordId,
          validationRunId: expect.any(String),
        },
        rationale: [
          "manual vetting result supports bounded limited approval planning",
          "installation remains separate and guarded even when limited approval is proposed",
        ],
        remainingBlockers: [],
        installGuardrails: [
          "do not install any skill from this planning result alone",
          "keep any later installation as a separate explicit action",
          "do not let the skill candidate replace the canonical memory substrate",
        ],
        manualSteps: [
          "treat this handoff as preparation only and keep installation as a separate explicit action",
          "verify the target artifact or package against the recorded approval scope and install guardrails",
          "preserve accelerator-only boundaries and do not replace the canonical memory substrate during install review",
        ],
      },
    });
    expect(countsAfter).toEqual(countsBefore);
  });

  it("keeps approved skill candidates internal-only when approval provenance is missing", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const installHandoffTool = createSkillCandidateInstallHandoffTool({ runtime });

    const insertedSkillCandidate = await querySingleRow<{ id: string }>(
      dbEnvironment.connectionString,
      `
        insert into memory_middleware.skill_candidates (
          project_id,
          status,
          name,
          summary,
          metadata
        )
        values ($1::uuid, 'approved_limited', $2, $3, $4::jsonb)
        returning id::text as id
      `,
      [
        seeded.projectId,
        "Approved Without Record",
        "Missing approval record provenance",
        JSON.stringify({
          sourceCandidateId: "candidate-1",
          validationRunId: "validation-run-1",
        }),
      ],
    );
    const skillCandidateId = insertedSkillCandidate?.id;
    expect(skillCandidateId).toBeTruthy();

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await installHandoffTool.execute("call-17052", {
      skillCandidateId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(result.details).toEqual({
      accepted: true,
      status: "ok",
      skillCandidateId,
      skillCandidateStatus: "approved_limited",
      approvedScope: "limited",
      sourceCandidateId: "candidate-1",
      eligible: false,
      possibleTargets: ["remain_approved_internal_only"],
      rationale: [
        "skill candidate is missing validated procedure provenance",
        "manual install handoff requires a bounded approved skill candidate linked to a validated procedure",
      ],
      requiredGates: ["restore validated procedure provenance before any manual install handoff"],
      remainingBlockers: ["validated procedure provenance is incomplete"],
      installGuardrails: [
        "do not install any skill from this handoff alone",
        "keep installation as a separate explicit manual action",
        "do not let the skill candidate replace the canonical memory substrate",
      ],
    });
    expect(countsAfter).toEqual(countsBefore);
  });

  it("records one bounded install record for approved skill candidates without mutating skill state", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({ runtime });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });
    const validateTool = createProcedureValidateTool({ runtime });
    const createSkillCandidateTool = createSkillCandidateCreateTool({ runtime });
    const createProcurementRecordTool = createSkillCandidateProcurementRecordCreateTool({
      runtime,
    });
    const createVettingResultTool = createSkillCandidateVettingResultRecordTool({ runtime });
    const approveTool = createSkillCandidateApproveTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });
    const installRecordTool = createSkillCandidateInstallRecordCreateTool({
      runtime,
      context: {
        agentId: seeded.agentId,
      },
    });

    const submitResult = await submitTool.execute("call-17053", {
      kind: "procedure",
      content: "Approved bounded skill candidate for manual install record creation",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-17054", { candidateId, outcome: "accepted" });
    const promoteResult = await promoteTool.execute("call-17055", {
      candidateId,
      title: "Manual Install Record Procedure",
    });
    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;
    await validateTool.execute("call-17056", { procedureId });
    const createSkillCandidateResult = await createSkillCandidateTool.execute("call-17057", {
      procedureId,
    });
    const skillCandidateId = (createSkillCandidateResult.details as { skillCandidateId: string })
      .skillCandidateId;
    const procurementRecord = await createProcurementRecordTool.execute("call-17058", {
      skillCandidateId,
    });
    const procurementRecordId = (procurementRecord.details as { procurementRecordId: string })
      .procurementRecordId;
    const vettingResult = await createVettingResultTool.execute("call-17059", {
      skillCandidateId,
      decision: "approve_limited",
      permissionsRisk: {
        level: "medium",
        notes: ["manual install remains separate"],
        requiredChecks: ["preserve accelerator-only posture"],
      },
      suspiciousPatterns: {
        redFlags: [],
        unresolvedQuestions: ["verify actual package before any install action"],
      },
      operationalFit: {
        fit: "limited",
        notes: ["bounded lineage preserved"],
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
      },
      approvalRecommendation: {
        proposedLifecycleState: "approved_limited",
        installRecommendation: "manual_followup_required",
        blockers: [],
      },
    });
    const vettingResultRecordId = (vettingResult.details as { vettingResultRecordId: string })
      .vettingResultRecordId;
    const approvalResult = await approveTool.execute("call-17060", {
      skillCandidateId,
      scope: "limited",
      rationale: "Record bounded limited approval before any manual install record.",
    });
    const approvalRecordId = (approvalResult.details as { approvalRecordId: string })
      .approvalRecordId;

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await installRecordTool.execute("call-17061", {
      skillCandidateId,
      installNotes: "Manual install completed separately by operator.",
      metadata: { source: "integration-test" },
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(result.details).toEqual({
      accepted: true,
      status: "created",
      skillCandidateId,
      installRecordId: expect.any(String),
      installedScope: "limited",
      skillCandidateStatus: "approved_limited",
      approvalRecordId,
      procurementRecordId,
      vettingResultRecordId,
      sourceProcedureId: procedureId,
      sourceCandidateId: candidateId,
    });

    const installRecordId = (result.details as { installRecordId: string }).installRecordId;
    const stateRow = await querySingleRow<{
      status: string;
      latest_approval_record_id: string | null;
      latest_approved_scope: string | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          status::text as status,
          metadata->>'latestApprovalRecordId' as latest_approval_record_id,
          metadata->>'latestApprovedScope' as latest_approved_scope
        from memory_middleware.skill_candidates
        where id = $1::uuid
      `,
      [skillCandidateId],
    );
    const eventRow = await querySingleRow<{
      event_kind: string;
      event_name: string;
      payload: Record<string, unknown>;
      metadata: Record<string, unknown>;
    }>(
      dbEnvironment.connectionString,
      `
        select event_kind, event_name, payload, metadata
        from memory_middleware.memory_events
        where id = $1::uuid
      `,
      [installRecordId],
    );

    expect(stateRow).toEqual({
      status: "approved_limited",
      latest_approval_record_id: approvalRecordId,
      latest_approved_scope: "limited",
    });
    expect(eventRow).toEqual({
      event_kind: "review",
      event_name: "skill_candidate.install_record",
      payload: {
        source: "skill-candidate-install-record-create-tool",
        installedScope: "limited",
        approvalRecordId,
        procurementRecordId,
        vettingResultRecordId,
        installGuardrails: [
          "do not install any skill from this planning result alone",
          "keep any later installation as a separate explicit action",
          "do not let the skill candidate replace the canonical memory substrate",
        ],
        manualSteps: [
          "treat this handoff as preparation only and keep installation as a separate explicit action",
          "verify the target artifact or package against the recorded approval scope and install guardrails",
          "preserve accelerator-only boundaries and do not replace the canonical memory substrate during install review",
        ],
        requiredGates: [
          "manual installation remains a separate explicit action",
          "respect the recorded install guardrails during any later install review",
        ],
        remainingBlockers: [],
        rationale: [
          "manual vetting result supports bounded limited approval planning",
          "installation remains separate and guarded even when limited approval is proposed",
          "installation remains a separate explicit manual step even after bounded approval is recorded",
        ],
        installNotes: "Manual install completed separately by operator.",
      },
      metadata: {
        source: "skill-candidate-install-record-create-tool",
        skillCandidateId,
        installedScope: "limited",
        approvalRecordId,
        procurementRecordId,
        vettingResultRecordId,
        sourceProcedureId: procedureId,
        sourceCandidateId: candidateId,
        installerAgentId: seeded.agentId,
        installNotes: "Manual install completed separately by operator.",
        installMetadata: {
          source: "integration-test",
        },
      },
    });
    expect(countsAfter).toEqual({
      ...countsBefore,
      memory_events: String(Number(countsBefore.memory_events) + 1),
    });
  });

  it("returns already_created on repeated bounded install-record writes without duplicates", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({ runtime });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });
    const validateTool = createProcedureValidateTool({ runtime });
    const createSkillCandidateTool = createSkillCandidateCreateTool({ runtime });
    const createProcurementRecordTool = createSkillCandidateProcurementRecordCreateTool({
      runtime,
    });
    const createVettingResultTool = createSkillCandidateVettingResultRecordTool({ runtime });
    const approveTool = createSkillCandidateApproveTool({ runtime });
    const installRecordTool = createSkillCandidateInstallRecordCreateTool({ runtime });

    const submitResult = await submitTool.execute("call-17062", {
      kind: "procedure",
      content: "Repeat-safe bounded install record candidate",
      projectId: seeded.projectId,
    });
    const candidateId = (submitResult.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-17063", { candidateId, outcome: "accepted" });
    const promoteResult = await promoteTool.execute("call-17064", {
      candidateId,
      title: "Repeat-safe Install Record Procedure",
    });
    const procedureId = (promoteResult.details as { procedureId: string }).procedureId;
    await validateTool.execute("call-17065", { procedureId });
    const createSkillCandidateResult = await createSkillCandidateTool.execute("call-17066", {
      procedureId,
    });
    const skillCandidateId = (createSkillCandidateResult.details as { skillCandidateId: string })
      .skillCandidateId;
    const procurementRecord = await createProcurementRecordTool.execute("call-17067", {
      skillCandidateId,
    });
    const procurementRecordId = (procurementRecord.details as { procurementRecordId: string })
      .procurementRecordId;
    const vettingResult = await createVettingResultTool.execute("call-17068", {
      skillCandidateId,
      decision: "approve_limited",
      permissionsRisk: {
        level: "medium",
        notes: ["repeat-safe install record test"],
        requiredChecks: ["keep install explicit"],
      },
      suspiciousPatterns: {
        redFlags: [],
        unresolvedQuestions: [],
      },
      operationalFit: {
        fit: "limited",
        notes: ["bounded lineage preserved"],
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
      },
      approvalRecommendation: {
        proposedLifecycleState: "approved_limited",
        installRecommendation: "manual_followup_required",
        blockers: [],
      },
    });
    const vettingResultRecordId = (vettingResult.details as { vettingResultRecordId: string })
      .vettingResultRecordId;
    const approvalResult = await approveTool.execute("call-17069", {
      skillCandidateId,
      scope: "limited",
    });
    const approvalRecordId = (approvalResult.details as { approvalRecordId: string })
      .approvalRecordId;

    const firstInstallRecord = await installRecordTool.execute("call-17070", {
      skillCandidateId,
      installNotes: "First manual install record.",
    });
    const secondInstallRecord = await installRecordTool.execute("call-17071", {
      skillCandidateId,
      installNotes: "Repeated manual install record should not duplicate.",
    });

    const installRecordId = (firstInstallRecord.details as { installRecordId: string })
      .installRecordId;
    expect(secondInstallRecord.details).toEqual({
      accepted: true,
      status: "already_created",
      skillCandidateId,
      installRecordId,
      installedScope: "limited",
      skillCandidateStatus: "approved_limited",
      approvalRecordId,
      procurementRecordId,
      vettingResultRecordId,
      sourceProcedureId: procedureId,
      sourceCandidateId: candidateId,
    });

    const counts = await querySingleRow<{ install_record_count: string }>(
      dbEnvironment.connectionString,
      `
        select count(*)::text as install_record_count
        from memory_middleware.memory_events
        where event_name = 'skill_candidate.install_record'
      `,
      [],
    );
    expect(counts).toEqual({
      install_record_count: "1",
    });
  });

  it("keeps blocked skill candidates out of install-record writes", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const installRecordTool = createSkillCandidateInstallRecordCreateTool({ runtime });

    const insertedSkillCandidate = await querySingleRow<{ id: string }>(
      dbEnvironment.connectionString,
      `
        insert into memory_middleware.skill_candidates (
          project_id,
          status,
          name,
          summary,
          metadata
        )
        values ($1::uuid, 'approved_limited', $2, $3, $4::jsonb)
        returning id::text as id
      `,
      [
        seeded.projectId,
        "Blocked Install Record",
        "Missing approval record provenance",
        JSON.stringify({
          sourceCandidateId: "candidate-1",
          validationRunId: "validation-run-1",
        }),
      ],
    );
    const skillCandidateId = insertedSkillCandidate?.id;
    expect(skillCandidateId).toBeTruthy();

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await installRecordTool.execute("call-17072", {
      skillCandidateId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(result.details).toEqual({
      accepted: false,
      status: "ineligible",
      reason:
        "skill candidate is missing validated procedure provenance manual install handoff requires a bounded approved skill candidate linked to a validated procedure",
    });
    expect(countsAfter).toEqual(countsBefore);
  });

  it("persists oversized tool results and rehydrates them by id with stable preview substitution", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const persistTool = createMemoryToolResultPersistTool({ runtime });
    const getTool = createMemoryToolResultGetTool({ runtime });
    const oversizedPayload = `Large bounded tool result ${"x".repeat(5000)}`;

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const persistResult = await persistTool.execute("call-17073", {
      sessionId: seeded.sessionId,
      projectId: seeded.projectId,
      agentId: seeded.agentId,
      toolName: "memory_object_search_hybrid",
      payloadText: oversizedPayload,
      metadata: {
        source: "integration-test",
        query: "bounded retrieval",
      },
    });

    expect(persistResult.details).toMatchObject({
      accepted: true,
      status: "persisted",
      persisted: true,
      sessionId: seeded.sessionId,
      toolName: "memory_object_search_hybrid",
      contentType: "text/plain",
      thresholdBytes: 4096,
      preview: {
        kind: "tool_result_preview",
        shouldSubstitute: true,
        retrievalToolName: "memory_tool_result_get",
        truncated: true,
      },
    });

    const persistedDetails = persistResult.details as {
      toolResultId: string;
      memoryEventId: string;
      checksumSha256: string;
      preview: {
        retrievalArgs?: {
          toolResultId: string;
        };
        referenceToken?: string;
        substitutionText: string;
      };
    };
    expect(persistedDetails.preview.retrievalArgs).toEqual({
      toolResultId: persistedDetails.toolResultId,
    });
    expect(persistedDetails.preview.referenceToken).toBe(
      `tool_result:${persistedDetails.toolResultId}`,
    );
    expect(persistedDetails.preview.substitutionText).toContain(
      `[tool-result:${persistedDetails.toolResultId}]`,
    );

    const countsAfterPersist = await readTableCounts(dbEnvironment.connectionString);
    expect(countsAfterPersist).toEqual({
      ...countsBefore,
      memory_events: String(Number(countsBefore.memory_events) + 1),
    });

    const storedToolResult = await querySingleRow<{
      id: string;
      tool_name: string;
      status: string;
      preview_text: string | null;
      payload_text: string | null;
      size_bytes: string;
      checksum_sha256: string | null;
      metadata: Record<string, unknown> | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          id::text as id,
          tool_name,
          status::text as status,
          preview_text,
          payload_text,
          size_bytes::text as size_bytes,
          checksum_sha256,
          metadata
        from memory_middleware.tool_results
        where id = $1::uuid
      `,
      [persistedDetails.toolResultId],
    );
    expect(storedToolResult).toEqual({
      id: persistedDetails.toolResultId,
      tool_name: "memory_object_search_hybrid",
      status: "persisted",
      preview_text: expect.any(String),
      payload_text: oversizedPayload,
      size_bytes: String(Buffer.byteLength(oversizedPayload, "utf8")),
      checksum_sha256: persistedDetails.checksumSha256,
      metadata: {
        source: "tool-result-persist-tool",
        thresholdBytes: 4096,
        previewCharLimit: 280,
        projectId: seeded.projectId,
        agentId: seeded.agentId,
        toolMetadata: {
          source: "integration-test",
          query: "bounded retrieval",
        },
      },
    });

    const persistedEvent = await querySingleRow<{
      id: string;
      event_kind: string;
      event_name: string;
      payload: Record<string, unknown> | null;
      metadata: Record<string, unknown> | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          id::text as id,
          event_kind::text as event_kind,
          event_name,
          payload,
          metadata
        from memory_middleware.memory_events
        where id = $1::uuid
      `,
      [persistedDetails.memoryEventId],
    );
    expect(persistedEvent).toEqual({
      id: persistedDetails.memoryEventId,
      event_kind: "tool_result",
      event_name: "tool_result.persisted",
      payload: {
        source: "tool-result-persist-tool",
        toolName: "memory_object_search_hybrid",
        toolResultId: persistedDetails.toolResultId,
        contentType: "text/plain",
        sizeBytes: Buffer.byteLength(oversizedPayload, "utf8"),
        previewText: expect.any(String),
        referenceToken: `tool_result:${persistedDetails.toolResultId}`,
        checksumSha256: persistedDetails.checksumSha256,
      },
      metadata: {
        source: "tool-result-persist-tool",
        persistMetadata: {
          source: "integration-test",
          query: "bounded retrieval",
        },
      },
    });

    const getResult = await getTool.execute("call-17074", {
      toolResultId: persistedDetails.toolResultId,
    });
    expect(getResult.details).toMatchObject({
      accepted: true,
      status: "ok",
      toolResult: {
        id: persistedDetails.toolResultId,
        sessionId: seeded.sessionId,
        toolName: "memory_object_search_hybrid",
        storageStatus: "persisted",
        contentType: "text/plain",
        previewText: expect.any(String),
        payloadText: oversizedPayload,
        sizeBytes: Buffer.byteLength(oversizedPayload, "utf8"),
        checksumSha256: persistedDetails.checksumSha256,
        projectId: seeded.projectId,
        agentId: seeded.agentId,
        memoryEventId: persistedDetails.memoryEventId,
        metadata: {
          source: "tool-result-persist-tool",
          thresholdBytes: 4096,
          previewCharLimit: 280,
          projectId: seeded.projectId,
          agentId: seeded.agentId,
          toolMetadata: {
            source: "integration-test",
            query: "bounded retrieval",
          },
        },
      },
    });
    const getDetails = getResult.details as {
      accepted?: boolean;
      status?: string;
      toolResult?: {
        createdAt?: string;
        updatedAt?: string;
      };
    };
    if (!getDetails.accepted || getDetails.status !== "ok" || !getDetails.toolResult) {
      throw new Error("expected persisted tool result lookup to succeed");
    }
    expect(typeof getDetails.toolResult.createdAt).toBe("string");
    expect(typeof getDetails.toolResult.updatedAt).toBe("string");
  });

  it("returns inline preview contracts below the persistence threshold without writing tool-result rows", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const persistTool = createMemoryToolResultPersistTool({ runtime });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await persistTool.execute("call-17075", {
      sessionId: seeded.sessionId,
      toolName: "memory_object_search_basic",
      payloadText: "small bounded result",
    });

    expect(result.details).toEqual({
      accepted: true,
      status: "inline",
      persisted: false,
      sessionId: seeded.sessionId,
      toolName: "memory_object_search_basic",
      contentType: "text/plain",
      sizeBytes: Buffer.byteLength("small bounded result", "utf8"),
      thresholdBytes: 4096,
      preview: {
        kind: "tool_result_preview",
        shouldSubstitute: false,
        previewText: "small bounded result",
        substitutionText: "small bounded result",
        retrievalToolName: "memory_tool_result_get",
        contentType: "text/plain",
        sizeBytes: Buffer.byteLength("small bounded result", "utf8"),
        truncated: false,
        omittedBytes: 0,
      },
    });

    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    expect(countsAfter).toEqual(countsBefore);

    const toolResultCount = await querySingleRow<{ tool_result_count: string }>(
      dbEnvironment.connectionString,
      `
        select count(*)::text as tool_result_count
        from memory_middleware.tool_results
      `,
      [],
    );
    expect(toolResultCount).toEqual({
      tool_result_count: "0",
    });
  });

  it("returns a no-op microcompaction plan when persisted tool-result pressure stays below threshold", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const persistTool = createMemoryToolResultPersistTool({ runtime });
    const microcompactPlanTool = createMemoryToolResultMicrocompactPlanTool({ runtime });

    const firstPersist = await persistTool.execute("call-17075a", {
      sessionId: seeded.sessionId,
      toolName: "memory_object_search_hybrid",
      payloadText: `oversized ${"a".repeat(5000)}`,
      forcePersist: true,
    });
    const secondPersist = await persistTool.execute("call-17075b", {
      sessionId: seeded.sessionId,
      toolName: "memory_object_search_hybrid",
      payloadText: `oversized ${"b".repeat(5000)}`,
      forcePersist: true,
    });

    const firstToolResultId = (firstPersist.details as { toolResultId: string }).toolResultId;
    const secondToolResultId = (secondPersist.details as { toolResultId: string }).toolResultId;
    const timestampClient = await connectClient(dbEnvironment.connectionString);
    try {
      await timestampClient.query(
        `alter table memory_middleware.tool_results disable trigger set_tool_results_updated_at`,
      );
      await timestampClient.query(
        `
          update memory_middleware.tool_results
          set updated_at = case id
            when $1::uuid then now() - interval '20 minutes'
            when $2::uuid then now() - interval '5 minutes'
            else updated_at
          end
          where id in ($1::uuid, $2::uuid)
        `,
        [firstToolResultId, secondToolResultId],
      );
      await timestampClient.query(
        `alter table memory_middleware.tool_results enable trigger set_tool_results_updated_at`,
      );
    } finally {
      await timestampClient.end();
    }
    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const compactionBefore = await querySingleRow<{ compaction_event_count: string }>(
      dbEnvironment.connectionString,
      `
        select count(*)::text as compaction_event_count
        from memory_middleware.compaction_events
      `,
      [],
    );

    const result = await microcompactPlanTool.execute("call-17075c", {
      sessionId: seeded.sessionId,
      persistedCountThreshold: 3,
      recentFloorCount: 2,
      idleGapSeconds: 3600,
    });

    expect(result.details).toEqual({
      accepted: true,
      status: "ok",
      sessionId: seeded.sessionId,
      shouldCompact: false,
      recommendedAction: "none",
      triggers: [],
      rationale: [
        "persisted tool-result previews remain within bounded microcompaction thresholds",
      ],
      persistedResultCount: 2,
      recentFloorCount: 2,
      preservedToolResultIds: [secondToolResultId, firstToolResultId],
      clearCandidates: [],
      estimatedPromptTokenThreshold: 12000,
    });

    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    const compactionAfter = await querySingleRow<{ compaction_event_count: string }>(
      dbEnvironment.connectionString,
      `
        select count(*)::text as compaction_event_count
        from memory_middleware.compaction_events
      `,
      [],
    );
    expect(countsAfter).toEqual(countsBefore);
    expect(compactionAfter).toEqual(compactionBefore);
  });

  it("plans deterministic persisted-preview clearing when count, idle-gap, and token-pressure thresholds are exceeded while preserving a recent floor", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const persistTool = createMemoryToolResultPersistTool({ runtime });
    const microcompactPlanTool = createMemoryToolResultMicrocompactPlanTool({ runtime });

    const persistResults = await Promise.all([
      persistTool.execute("call-17075d", {
        sessionId: seeded.sessionId,
        toolName: "memory_object_search_hybrid",
        payloadText: `oversized-oldest ${"1".repeat(5000)}`,
        forcePersist: true,
      }),
      persistTool.execute("call-17075e", {
        sessionId: seeded.sessionId,
        toolName: "memory_object_search_hybrid",
        payloadText: `oversized-older ${"2".repeat(5000)}`,
        forcePersist: true,
      }),
      persistTool.execute("call-17075f", {
        sessionId: seeded.sessionId,
        toolName: "memory_object_search_hybrid",
        payloadText: `oversized-newer ${"3".repeat(5000)}`,
        forcePersist: true,
      }),
      persistTool.execute("call-17075g", {
        sessionId: seeded.sessionId,
        toolName: "memory_object_search_hybrid",
        payloadText: `oversized-newest ${"4".repeat(5000)}`,
        forcePersist: true,
      }),
    ]);

    const toolResultIds = persistResults.map(
      (entry) => (entry.details as { toolResultId: string }).toolResultId,
    );
    const timestampClient = await connectClient(dbEnvironment.connectionString);
    try {
      await timestampClient.query(
        `alter table memory_middleware.tool_results disable trigger set_tool_results_updated_at`,
      );
      await timestampClient.query(
        `
          update memory_middleware.tool_results
          set updated_at = case id
            when $1::uuid then now() - interval '60 minutes'
            when $2::uuid then now() - interval '40 minutes'
            when $3::uuid then now() - interval '20 minutes'
            when $4::uuid then now() - interval '5 minutes'
            else updated_at
          end
          where id in ($1::uuid, $2::uuid, $3::uuid, $4::uuid)
        `,
        toolResultIds,
      );
      await timestampClient.query(
        `alter table memory_middleware.tool_results enable trigger set_tool_results_updated_at`,
      );
    } finally {
      await timestampClient.end();
    }

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const compactionBefore = await querySingleRow<{ compaction_event_count: string }>(
      dbEnvironment.connectionString,
      `
        select count(*)::text as compaction_event_count
        from memory_middleware.compaction_events
      `,
      [],
    );

    const result = await microcompactPlanTool.execute("call-17075h", {
      sessionId: seeded.sessionId,
      persistedCountThreshold: 3,
      recentFloorCount: 2,
      idleGapSeconds: 1800,
      estimatedPromptTokens: 18000,
      estimatedPromptTokenThreshold: 12000,
      maxClearCount: 3,
    });

    expect(result.details).toMatchObject({
      accepted: true,
      status: "ok",
      sessionId: seeded.sessionId,
      shouldCompact: true,
      recommendedAction: "clear_persisted_previews",
      triggers: ["idle_gap_threshold", "persisted_count_threshold", "estimated_token_pressure"],
      persistedResultCount: 4,
      recentFloorCount: 2,
      preservedToolResultIds: [toolResultIds[3], toolResultIds[2]],
      estimatedPromptTokens: 18000,
      estimatedPromptTokenThreshold: 12000,
    });
    expect(
      (result.details as { clearCandidates: Array<{ toolResultId: string }> }).clearCandidates,
    ).toEqual([
      expect.objectContaining({
        toolResultId: toolResultIds[0],
        referenceToken: `tool_result:${toolResultIds[0]}`,
      }),
      expect.objectContaining({
        toolResultId: toolResultIds[1],
        referenceToken: `tool_result:${toolResultIds[1]}`,
      }),
    ]);
    expect((result.details as { rationale: string[] }).rationale.join(" ")).toContain(
      "persisted tool-result count 4 exceeds threshold 3",
    );

    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    const compactionAfter = await querySingleRow<{ compaction_event_count: string }>(
      dbEnvironment.connectionString,
      `
        select count(*)::text as compaction_event_count
        from memory_middleware.compaction_events
      `,
      [],
    );
    expect(countsAfter).toEqual(countsBefore);
    expect(compactionAfter).toEqual(compactionBefore);
  });

  it("executes persisted-preview clearing while preserving recent-floor items", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const persistTool = createMemoryToolResultPersistTool({ runtime });
    const executeTool = createMemoryToolResultMicrocompactExecuteTool({ runtime });

    const persistResults = await Promise.all([
      persistTool.execute("call-17075i", {
        sessionId: seeded.sessionId,
        toolName: "memory_object_search_hybrid",
        payloadText: `oversized-oldest ${"1".repeat(5000)}`,
        forcePersist: true,
      }),
      persistTool.execute("call-17075j", {
        sessionId: seeded.sessionId,
        toolName: "memory_object_search_hybrid",
        payloadText: `oversized-older ${"2".repeat(5000)}`,
        forcePersist: true,
      }),
      persistTool.execute("call-17075k", {
        sessionId: seeded.sessionId,
        toolName: "memory_object_search_hybrid",
        payloadText: `oversized-newer ${"3".repeat(5000)}`,
        forcePersist: true,
      }),
      persistTool.execute("call-17075l", {
        sessionId: seeded.sessionId,
        toolName: "memory_object_search_hybrid",
        payloadText: `oversized-newest ${"4".repeat(5000)}`,
        forcePersist: true,
      }),
    ]);

    const toolResultIds = persistResults.map(
      (entry) => (entry.details as { toolResultId: string }).toolResultId,
    );
    const timestampClient = await connectClient(dbEnvironment.connectionString);
    try {
      await timestampClient.query(
        `alter table memory_middleware.tool_results disable trigger set_tool_results_updated_at`,
      );
      await timestampClient.query(
        `
          update memory_middleware.tool_results
          set updated_at = case id
            when $1::uuid then now() - interval '60 minutes'
            when $2::uuid then now() - interval '40 minutes'
            when $3::uuid then now() - interval '20 minutes'
            when $4::uuid then now() - interval '5 minutes'
            else updated_at
          end
          where id in ($1::uuid, $2::uuid, $3::uuid, $4::uuid)
        `,
        toolResultIds,
      );
      await timestampClient.query(
        `alter table memory_middleware.tool_results enable trigger set_tool_results_updated_at`,
      );
    } finally {
      await timestampClient.end();
    }

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const compactionBefore = await querySingleRow<{ compaction_event_count: string }>(
      dbEnvironment.connectionString,
      `select count(*)::text as compaction_event_count from memory_middleware.compaction_events`,
      [],
    );

    const result = await executeTool.execute("call-17075m", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      persistedCountThreshold: 3,
      recentFloorCount: 2,
      idleGapSeconds: 1800,
      estimatedPromptTokens: 18000,
    });

    expect(result.details).toMatchObject({
      accepted: true,
      status: "executed",
      sessionId: seeded.sessionId,
      compactionEventId: expect.any(String),
      preservedToolResultIds: [toolResultIds[3], toolResultIds[2]],
      skippedRequestedToolResultIds: [],
      estimatedPromptTokens: 18000,
      estimatedPromptTokenThreshold: 12000,
    });
    expect(
      (result.details as { clearedToolResultIds: string[] }).clearedToolResultIds,
    ).toHaveLength(2);
    expect((result.details as { clearedToolResultIds: string[] }).clearedToolResultIds).toEqual(
      expect.arrayContaining([toolResultIds[0], toolResultIds[1]]),
    );
    expect(
      (result.details as { clearCandidates: Array<{ toolResultId: string }> }).clearCandidates,
    ).toEqual([
      expect.objectContaining({ toolResultId: toolResultIds[0] }),
      expect.objectContaining({ toolResultId: toolResultIds[1] }),
    ]);

    const storedResults = await querySingleRow<{
      compacted_count: string;
      preserved_count: string;
      cleared_preview_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          count(*) filter (where status = 'compacted')::text as compacted_count,
          count(*) filter (where status = 'persisted')::text as preserved_count,
          count(*) filter (where status = 'compacted' and preview_text is null)::text as cleared_preview_count
        from memory_middleware.tool_results
        where session_id = $1::uuid
      `,
      [seeded.sessionId],
    );
    expect(storedResults).toEqual({
      compacted_count: "2",
      preserved_count: "2",
      cleared_preview_count: "2",
    });

    const compactionEvent = await querySingleRow<{
      status: string;
      compaction_kind: string;
      details: Record<string, unknown> | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          status::text as status,
          compaction_kind::text as compaction_kind,
          details
        from memory_middleware.compaction_events
        order by created_at desc
        limit 1
      `,
      [],
    );
    expect(compactionEvent).toEqual({
      status: "completed",
      compaction_kind: "micro",
      details: {
        requestedToolResultIds: null,
        plannerClearCandidateIds: [toolResultIds[0], toolResultIds[1]],
        clearedToolResultIds: expect.arrayContaining([toolResultIds[0], toolResultIds[1]]),
        skippedRequestedToolResultIds: [],
        preservedToolResultIds: [toolResultIds[3], toolResultIds[2]],
      },
    });

    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    const compactionAfter = await querySingleRow<{ compaction_event_count: string }>(
      dbEnvironment.connectionString,
      `select count(*)::text as compaction_event_count from memory_middleware.compaction_events`,
      [],
    );
    expect(countsAfter).toEqual(countsBefore);
    expect(compactionBefore).toEqual({ compaction_event_count: "0" });
    expect(compactionAfter).toEqual({ compaction_event_count: "1" });
  });

  it("returns a no-op microcompaction execution when nothing should be cleared and remains idempotent on repeat", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const persistTool = createMemoryToolResultPersistTool({ runtime });
    const executeTool = createMemoryToolResultMicrocompactExecuteTool({ runtime });

    const persisted = await persistTool.execute("call-17075n", {
      sessionId: seeded.sessionId,
      toolName: "memory_object_search_hybrid",
      payloadText: `oversized ${"x".repeat(5000)}`,
      forcePersist: true,
    });
    const toolResultId = (persisted.details as { toolResultId: string }).toolResultId;
    const timestampClient = await connectClient(dbEnvironment.connectionString);
    try {
      await timestampClient.query(
        `alter table memory_middleware.tool_results disable trigger set_tool_results_updated_at`,
      );
      await timestampClient.query(
        `
          update memory_middleware.tool_results
          set updated_at = now() - interval '60 minutes'
          where id = $1::uuid
        `,
        [toolResultId],
      );
      await timestampClient.query(
        `alter table memory_middleware.tool_results enable trigger set_tool_results_updated_at`,
      );
    } finally {
      await timestampClient.end();
    }

    const noOpResult = await executeTool.execute("call-17075o", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      persistedCountThreshold: 5,
      recentFloorCount: 1,
    });
    expect(noOpResult.details).toEqual({
      accepted: true,
      status: "no_op",
      sessionId: seeded.sessionId,
      clearedToolResultIds: [],
      preservedToolResultIds: [toolResultId],
      clearCandidates: [],
      skippedRequestedToolResultIds: [],
      estimatedPromptTokenThreshold: 12000,
    });

    const firstExecute = await executeTool.execute("call-17075p", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      clearToolResultIds: [toolResultId],
      idleGapSeconds: 1800,
      recentFloorCount: 0,
      estimatedPromptTokens: 18000,
    });
    expect(firstExecute.details).toMatchObject({
      accepted: true,
      status: "executed",
      clearedToolResultIds: [toolResultId],
      requestedToolResultIds: [toolResultId],
    });

    const repeatExecute = await executeTool.execute("call-17075q", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      clearToolResultIds: [toolResultId],
      idleGapSeconds: 1800,
      recentFloorCount: 0,
      estimatedPromptTokens: 18000,
    });
    expect(repeatExecute.details).toEqual({
      accepted: true,
      status: "no_op",
      sessionId: seeded.sessionId,
      requestedToolResultIds: [toolResultId],
      clearedToolResultIds: [],
      preservedToolResultIds: [],
      clearCandidates: [],
      skippedRequestedToolResultIds: [toolResultId],
      estimatedPromptTokens: 18000,
      estimatedPromptTokenThreshold: 12000,
    });
  });

  it("returns disabled for tool-result persistence, retrieval, microcompaction planning, and microcompaction execution before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const persistTool = createMemoryToolResultPersistTool({ runtime });
    const getTool = createMemoryToolResultGetTool({ runtime });
    const microcompactPlanTool = createMemoryToolResultMicrocompactPlanTool({ runtime });
    const microcompactExecuteTool = createMemoryToolResultMicrocompactExecuteTool({ runtime });

    const persistResult = await persistTool.execute("call-17076", {
      sessionId: "00000000-0000-0000-0000-000000000001",
      toolName: "memory_object_search_hybrid",
      payloadText: "oversized result",
      forcePersist: true,
    });
    expect(persistResult.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "tool-result persistence mode is not enabled",
    });

    const getResult = await getTool.execute("call-17077", {
      toolResultId: "00000000-0000-0000-0000-000000000001",
    });
    expect(getResult.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "tool-result persistence mode is not enabled",
    });

    const planResult = await microcompactPlanTool.execute("call-17077b", {
      sessionId: "00000000-0000-0000-0000-000000000001",
    });
    expect(planResult.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "tool-result microcompaction mode is not enabled",
    });

    const executeResult = await microcompactExecuteTool.execute("call-17077c", {
      sessionId: "00000000-0000-0000-0000-000000000001",
    });
    expect(executeResult.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "tool-result microcompaction mode is not enabled",
    });
  });

  it("fails cleanly for tool-result persistence, retrieval, microcompaction planning, and microcompaction execution when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const persistTool = createMemoryToolResultPersistTool({ runtime });
    const getTool = createMemoryToolResultGetTool({ runtime });
    const microcompactPlanTool = createMemoryToolResultMicrocompactPlanTool({ runtime });
    const microcompactExecuteTool = createMemoryToolResultMicrocompactExecuteTool({ runtime });

    const persistResult = await persistTool.execute("call-17078", {
      sessionId: "00000000-0000-0000-0000-000000000001",
      toolName: "memory_object_search_hybrid",
      payloadText: `oversized ${"x".repeat(6000)}`,
    });
    expect(persistResult.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((persistResult.details as { reason: string }).reason).toContain(
      "database is unavailable",
    );

    const getResult = await getTool.execute("call-17079", {
      toolResultId: "00000000-0000-0000-0000-000000000001",
    });
    expect(getResult.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((getResult.details as { reason: string }).reason).toContain("database is unavailable");

    const planResult = await microcompactPlanTool.execute("call-17079b", {
      sessionId: "00000000-0000-0000-0000-000000000001",
    });
    expect(planResult.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((planResult.details as { reason: string }).reason).toContain("database is unavailable");

    const executeResult = await microcompactExecuteTool.execute("call-17079c", {
      sessionId: "00000000-0000-0000-0000-000000000001",
    });
    expect(executeResult.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((executeResult.details as { reason: string }).reason).toContain(
      "database is unavailable",
    );
  });

  it("creates and retrieves bounded session memory through agent_state without side effects on other memory tables", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const updateTool = createMemorySessionUpdateTool({ runtime });
    const getTool = createMemorySessionGetTool({ runtime });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const agentStateBefore = await querySingleRow<{ state_count: string }>(
      dbEnvironment.connectionString,
      `
        select count(*)::text as state_count
        from memory_middleware.agent_state
      `,
      [],
    );

    const updateResult = await updateTool.execute("call-17079c", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      title: " Session memory slice ",
      currentState: " Implementing deterministic session state ",
      taskSpecification: " Track current work without transcript summarization ",
      relevantFiles: [
        " extensions/memory-middleware/src/db/queries.ts ",
        "extensions/memory-middleware/src/tools/memory-session-update.ts",
      ],
      commandsUsed: [" pnpm test -- focused ", "pnpm build"],
      errorsAndCorrections: [" Missing query path corrected "],
      decisionsMade: [" Use agent_state with state_key session_memory "],
      importantFactsLearned: [" agent_state already exists in schema v1 "],
      keyResults: [" runtime seam wired "],
      pendingTasks: [" update docs "],
      worklog: [" added query-layer support "],
      updateReason: " progress checkpoint ",
      metadata: {
        source: "integration-test",
      },
    });

    expect(updateResult.details).toMatchObject({
      accepted: true,
      status: "created",
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      stateKey: "session_memory",
      lifecycle: "active",
      updateCount: 1,
      updateReason: "progress checkpoint",
      memory: {
        title: "Session memory slice",
        currentState: "Implementing deterministic session state",
        taskSpecification: "Track current work without transcript summarization",
        relevantFiles: [
          "extensions/memory-middleware/src/db/queries.ts",
          "extensions/memory-middleware/src/tools/memory-session-update.ts",
        ],
        commandsUsed: ["pnpm test -- focused", "pnpm build"],
        errorsAndCorrections: ["Missing query path corrected"],
        decisionsMade: ["Use agent_state with state_key session_memory"],
        importantFactsLearned: ["agent_state already exists in schema v1"],
        keyResults: ["runtime seam wired"],
        pendingTasks: ["update docs"],
        worklog: ["added query-layer support"],
      },
    });

    const storedState = await querySingleRow<{
      id: string;
      state_key: string;
      lifecycle: string;
      state_json: Record<string, unknown> | null;
      metadata: Record<string, unknown> | null;
    }>(
      dbEnvironment.connectionString,
      `
        select
          id::text as id,
          state_key,
          lifecycle::text as lifecycle,
          state_json,
          metadata
        from memory_middleware.agent_state
        where agent_id = $1::uuid
          and session_id = $2::uuid
          and state_key = 'session_memory'
      `,
      [seeded.agentId, seeded.sessionId],
    );
    expect(storedState).toEqual({
      id: expect.any(String),
      state_key: "session_memory",
      lifecycle: "active",
      state_json: {
        title: "Session memory slice",
        currentState: "Implementing deterministic session state",
        taskSpecification: "Track current work without transcript summarization",
        relevantFiles: [
          "extensions/memory-middleware/src/db/queries.ts",
          "extensions/memory-middleware/src/tools/memory-session-update.ts",
        ],
        commandsUsed: ["pnpm test -- focused", "pnpm build"],
        errorsAndCorrections: ["Missing query path corrected"],
        decisionsMade: ["Use agent_state with state_key session_memory"],
        importantFactsLearned: ["agent_state already exists in schema v1"],
        keyResults: ["runtime seam wired"],
        pendingTasks: ["update docs"],
        worklog: ["added query-layer support"],
      },
      metadata: {
        source: "session-memory-tool",
        updateCount: 1,
        updateReason: "progress checkpoint",
        sessionMemoryMetadata: {
          source: "integration-test",
        },
      },
    });

    const getResult = await getTool.execute("call-17079d", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
    });
    expect(getResult.details).toMatchObject({
      accepted: true,
      status: "ok",
      exists: true,
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      stateKey: "session_memory",
      updateCount: 1,
      memory: {
        title: "Session memory slice",
      },
    });

    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    const agentStateAfter = await querySingleRow<{ state_count: string }>(
      dbEnvironment.connectionString,
      `
        select count(*)::text as state_count
        from memory_middleware.agent_state
      `,
      [],
    );
    expect(countsAfter).toEqual(countsBefore);
    expect(agentStateBefore).toEqual({ state_count: "0" });
    expect(agentStateAfter).toEqual({ state_count: "1" });
  });

  it("updates existing session memory deterministically while preserving omitted fields and bounding list entries", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const updateTool = createMemorySessionUpdateTool({ runtime });
    const getTool = createMemorySessionGetTool({ runtime });

    await updateTool.execute("call-17079e", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      title: "Session memory slice",
      currentState: "Initial state",
      decisionsMade: ["Keep scope narrow"],
      worklog: ["Created initial row"],
    });

    const repeatedFiles = Array.from({ length: 30 }, (_, index) =>
      index % 2 === 0 ? " src/db/queries.ts " : `src/file-${index}.ts`,
    );
    const repeatedWorklog = Array.from({ length: 60 }, (_, index) => ` worklog entry ${index} `);
    const secondUpdate = await updateTool.execute("call-17079f", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      currentState: "Refined state",
      relevantFiles: repeatedFiles,
      worklog: repeatedWorklog,
      pendingTasks: [" Add tests ", "Add tests", "Ship docs"],
      updateReason: "second pass",
    });

    expect(secondUpdate.details).toMatchObject({
      accepted: true,
      status: "updated",
      updateCount: 2,
      updateReason: "second pass",
      memory: {
        title: "Session memory slice",
        currentState: "Refined state",
        decisionsMade: ["Keep scope narrow"],
        pendingTasks: ["Add tests", "Ship docs"],
      },
    });
    const secondMemory = (secondUpdate.details as { memory: Record<string, unknown> }).memory;
    expect((secondMemory.relevantFiles as string[])[0]).toBe("src/db/queries.ts");
    expect((secondMemory.relevantFiles as string[]).length).toBeLessThanOrEqual(20);
    expect((secondMemory.worklog as string[]).length).toBe(40);

    const storedState = await querySingleRow<{
      state_json: Record<string, unknown> | null;
      metadata: Record<string, unknown> | null;
    }>(
      dbEnvironment.connectionString,
      `
        select state_json, metadata
        from memory_middleware.agent_state
        where agent_id = $1::uuid
          and session_id = $2::uuid
          and state_key = 'session_memory'
      `,
      [seeded.agentId, seeded.sessionId],
    );
    expect(storedState?.metadata).toEqual({
      source: "session-memory-tool",
      updateCount: 2,
      updateReason: "second pass",
    });
    expect((storedState?.state_json?.worklog as string[]).length).toBe(40);

    const getResult = await getTool.execute("call-17079g", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
    });
    expect(getResult.details).toMatchObject({
      accepted: true,
      status: "ok",
      exists: true,
      updateCount: 2,
      memory: {
        title: "Session memory slice",
        currentState: "Refined state",
        decisionsMade: ["Keep scope narrow"],
      },
    });
  });

  it("returns disabled for session-memory get and update before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const getTool = createMemorySessionGetTool({ runtime });
    const updateTool = createMemorySessionUpdateTool({ runtime });

    const getResult = await getTool.execute("call-17079h", {
      sessionId: "00000000-0000-0000-0000-000000000001",
      agentId: "00000000-0000-0000-0000-000000000002",
    });
    expect(getResult.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "session-memory mode is not enabled",
    });

    const updateResult = await updateTool.execute("call-17079i", {
      sessionId: "00000000-0000-0000-0000-000000000001",
      agentId: "00000000-0000-0000-0000-000000000002",
      title: "Session memory",
    });
    expect(updateResult.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "session-memory mode is not enabled",
    });
  });

  it("fails cleanly for session-memory get and update when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const getTool = createMemorySessionGetTool({ runtime });
    const updateTool = createMemorySessionUpdateTool({ runtime });

    const getResult = await getTool.execute("call-17079j", {
      sessionId: "00000000-0000-0000-0000-000000000001",
      agentId: "00000000-0000-0000-0000-000000000002",
    });
    expect(getResult.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((getResult.details as { reason: string }).reason).toContain("database is unavailable");

    const updateResult = await updateTool.execute("call-17079k", {
      sessionId: "00000000-0000-0000-0000-000000000001",
      agentId: "00000000-0000-0000-0000-000000000002",
      title: "Session memory",
    });
    expect(updateResult.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((updateResult.details as { reason: string }).reason).toContain(
      "database is unavailable",
    );
  });

  it("returns a no-op compaction plan under low context pressure", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const planTool = createMemoryCompactionPlanTool({ runtime });
    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const agentStateBefore = await querySingleRow<{ state_count: string }>(
      dbEnvironment.connectionString,
      `select count(*)::text as state_count from memory_middleware.agent_state`,
      [],
    );

    const result = await planTool.execute("call-17079l", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      estimatedPromptTokens: 2000,
    });

    expect(result.details).toEqual({
      accepted: true,
      status: "ok",
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      outcome: "none",
      rationale: [
        "bounded context pressure remains within the current compaction thresholds",
        "session memory does not exist for this session",
      ],
      requiredInputs: [],
      clearCandidates: [],
      microcompactionRecommended: false,
      sessionMemoryStatus: "missing",
      sessionMemoryExists: false,
      sessionMemorySufficient: false,
      sessionMemoryFresh: false,
      estimatedPromptTokens: 2000,
      estimatedPromptTokenThreshold: 12000,
    });

    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    const agentStateAfter = await querySingleRow<{ state_count: string }>(
      dbEnvironment.connectionString,
      `select count(*)::text as state_count from memory_middleware.agent_state`,
      [],
    );
    expect(countsAfter).toEqual(countsBefore);
    expect(agentStateAfter).toEqual(agentStateBefore);
  });

  it("recommends bounded microcompaction when persisted-preview pressure exceeds thresholds", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const persistTool = createMemoryToolResultPersistTool({ runtime });
    const planTool = createMemoryCompactionPlanTool({ runtime });

    const persistResults = await Promise.all([
      persistTool.execute("call-17079m", {
        sessionId: seeded.sessionId,
        toolName: "memory_object_search_hybrid",
        payloadText: `oversized-oldest ${"1".repeat(5000)}`,
        forcePersist: true,
      }),
      persistTool.execute("call-17079n", {
        sessionId: seeded.sessionId,
        toolName: "memory_object_search_hybrid",
        payloadText: `oversized-newest ${"2".repeat(5000)}`,
        forcePersist: true,
      }),
    ]);
    const toolResultIds = persistResults.map(
      (entry) => (entry.details as { toolResultId: string }).toolResultId,
    );
    const timestampClient = await connectClient(dbEnvironment.connectionString);
    try {
      await timestampClient.query(
        `alter table memory_middleware.tool_results disable trigger set_tool_results_updated_at`,
      );
      await timestampClient.query(
        `
          update memory_middleware.tool_results
          set updated_at = case id
            when $1::uuid then now() - interval '45 minutes'
            when $2::uuid then now() - interval '5 minutes'
            else updated_at
          end
          where id in ($1::uuid, $2::uuid)
        `,
        toolResultIds,
      );
      await timestampClient.query(
        `alter table memory_middleware.tool_results enable trigger set_tool_results_updated_at`,
      );
    } finally {
      await timestampClient.end();
    }

    const result = await planTool.execute("call-17079o", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      persistedCountThreshold: 1,
      recentFloorCount: 1,
      idleGapSeconds: 1800,
      estimatedPromptTokens: 18000,
    });

    expect(result.details).toMatchObject({
      accepted: true,
      status: "ok",
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      outcome: "use_microcompaction",
      microcompactionRecommended: true,
      sessionMemoryStatus: "missing",
      estimatedPromptTokens: 18000,
      estimatedPromptTokenThreshold: 12000,
    });
    expect(
      (result.details as { clearCandidates: Array<{ toolResultId: string }> }).clearCandidates,
    ).toEqual([
      expect.objectContaining({
        toolResultId: toolResultIds[0],
        referenceToken: `tool_result:${toolResultIds[0]}`,
      }),
    ]);
  });

  it("recommends using fresh sufficient session memory when prompt pressure is high without microcompaction pressure", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const updateTool = createMemorySessionUpdateTool({ runtime });
    const planTool = createMemoryCompactionPlanTool({ runtime });

    await updateTool.execute("call-17079p", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      title: "Context-plane session memory",
      currentState: "Ready to continue work from session memory",
      decisionsMade: ["Prefer session memory before full compaction fallback"],
      keyResults: ["Bounded planner implemented"],
    });

    const result = await planTool.execute("call-17079q", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      estimatedPromptTokens: 18000,
      persistedCountThreshold: 10,
    });

    expect(result.details).toMatchObject({
      accepted: true,
      status: "ok",
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      outcome: "use_session_memory",
      clearCandidates: [],
      microcompactionRecommended: false,
      sessionMemoryStatus: "fresh_and_sufficient",
      sessionMemoryExists: true,
      sessionMemorySufficient: true,
      sessionMemoryFresh: true,
      estimatedPromptTokens: 18000,
    });
  });

  it("proposes full compaction fallback when prompt pressure is high and session memory is missing", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const planTool = createMemoryCompactionPlanTool({ runtime });

    const result = await planTool.execute("call-17079r", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      estimatedPromptTokens: 18000,
      persistedCountThreshold: 10,
    });

    expect(result.details).toEqual({
      accepted: true,
      status: "ok",
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      outcome: "propose_full_compaction_fallback",
      rationale: [
        "prompt pressure exceeds the bounded threshold and session memory is missing, stale, or insufficient",
        "session memory does not exist for this session",
      ],
      requiredInputs: [
        "fresh sufficient session memory or a future full compaction implementation",
      ],
      clearCandidates: [],
      microcompactionRecommended: false,
      sessionMemoryStatus: "missing",
      sessionMemoryExists: false,
      sessionMemorySufficient: false,
      sessionMemoryFresh: false,
      estimatedPromptTokens: 18000,
      estimatedPromptTokenThreshold: 12000,
    });
  });

  it("returns disabled for compaction planning before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const planTool = createMemoryCompactionPlanTool({ runtime });

    const result = await planTool.execute("call-17079s", {
      sessionId: "00000000-0000-0000-0000-000000000001",
      agentId: "00000000-0000-0000-0000-000000000002",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "compaction planning mode is not enabled",
    });
  });

  it("fails cleanly for compaction planning when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const planTool = createMemoryCompactionPlanTool({ runtime });

    const result = await planTool.execute("call-17079t", {
      sessionId: "00000000-0000-0000-0000-000000000001",
      agentId: "00000000-0000-0000-0000-000000000002",
      estimatedPromptTokens: 18000,
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("executes bounded session-memory-backed compaction when planner pressure prefers reusing fresh session memory", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const updateTool = createMemorySessionUpdateTool({ runtime });
    const executeTool = createMemorySessionCompactExecuteTool({ runtime });

    await updateTool.execute("call-17079ta", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      title: "Context-plane session memory",
      currentState: "Ready to continue work from session memory",
      taskSpecification: "Execute the bounded session-memory compaction path",
      decisionsMade: ["Prefer session memory before fallback compaction"],
      pendingTasks: ["Update docs"],
      keyResults: ["Planner recommends session memory"],
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);

    const beforeCompactionCount = await querySingleRow<{ count: string }>(
      dbEnvironment.connectionString,
      `select count(*)::text as count from memory_middleware.compaction_events`,
      [],
    );

    const result = await executeTool.execute("call-17079tb", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      estimatedPromptTokens: 18000,
      persistedCountThreshold: 10,
    });

    expect(result.details).toMatchObject({
      accepted: true,
      status: "executed",
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      plannerOutcome: "use_session_memory",
      sessionMemoryStatus: "fresh_and_sufficient",
      rationale: ["session memory was reused as the bounded compaction substrate"],
      requiredInputs: [],
      estimatedPromptTokens: 18000,
      estimatedPromptTokenThreshold: 12000,
    });
    expect(
      (result.details as { payload: { kind: string; shouldSubstitute: boolean } }).payload,
    ).toMatchObject({
      kind: "session_memory_compaction",
      shouldSubstitute: true,
    });

    const afterCompactionCount = await querySingleRow<{ count: string }>(
      dbEnvironment.connectionString,
      `select count(*)::text as count from memory_middleware.compaction_events`,
      [],
    );
    expect(Number(afterCompactionCount.count)).toBe(Number(beforeCompactionCount.count) + 1);

    const compactionRow = await querySingleRow<{
      compaction_substrate: string;
      session_memory_state_id: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          details ->> 'compactionSubstrate' as compaction_substrate,
          details ->> 'sessionMemoryStateId' as session_memory_state_id
        from memory_middleware.compaction_events
        order by created_at desc
        limit 1
      `,
      [],
    );
    expect(compactionRow.compaction_substrate).toBe("session_memory");
    expect(compactionRow.session_memory_state_id).toBeTruthy();

    const sessionState = await querySingleRow<{ count: string }>(
      dbEnvironment.connectionString,
      `
        select count(*)::text as count
        from memory_middleware.agent_state
        where session_id = $1::uuid
          and agent_id = $2::uuid
          and state_key = 'session_memory'
      `,
      [seeded.sessionId, seeded.agentId],
    );
    expect(sessionState.count).toBe("1");

    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    expect(countsAfter.memory_events).toBe(countsBefore.memory_events);
    expect(countsAfter.tool_results).toBe(countsBefore.tool_results);
    expect(countsAfter.agent_state).toBe(countsBefore.agent_state);
  });

  it("returns a no-op for session-memory-backed compaction when session memory is missing", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const executeTool = createMemorySessionCompactExecuteTool({ runtime });
    const countsBefore = await readTableCounts(dbEnvironment.connectionString);

    const result = await executeTool.execute("call-17079tc", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      estimatedPromptTokens: 18000,
      persistedCountThreshold: 10,
    });

    expect(result.details).toMatchObject({
      accepted: true,
      status: "no_op",
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      plannerOutcome: "propose_full_compaction_fallback",
      sessionMemoryStatus: "missing",
      rationale: [
        "prompt pressure exceeds the bounded threshold and session memory is missing, stale, or insufficient",
        "session memory does not exist for this session",
      ],
      requiredInputs: [
        "fresh sufficient session memory or a future full compaction implementation",
      ],
      estimatedPromptTokens: 18000,
      estimatedPromptTokenThreshold: 12000,
    });

    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    expect(countsAfter).toEqual(countsBefore);
  });

  it("returns a no-op for session-memory-backed compaction when session memory is stale", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const updateTool = createMemorySessionUpdateTool({ runtime });
    const executeTool = createMemorySessionCompactExecuteTool({ runtime });
    const countsBefore = await readTableCounts(dbEnvironment.connectionString);

    await updateTool.execute("call-17079td", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      title: "Stale session memory",
      keyResults: ["This state will be forced stale"],
    });

    const staleClient = await connectClient(dbEnvironment.connectionString);
    try {
      await staleClient.query(
        `alter table memory_middleware.agent_state disable trigger set_agent_state_updated_at`,
      );
      await staleClient.query(
        `
          update memory_middleware.agent_state
          set updated_at = now() - interval '3 hours'
          where session_id = $1::uuid
            and agent_id = $2::uuid
            and state_key = 'session_memory'
        `,
        [seeded.sessionId, seeded.agentId],
      );
      await staleClient.query(
        `alter table memory_middleware.agent_state enable trigger set_agent_state_updated_at`,
      );
    } finally {
      await staleClient.end();
    }

    const result = await executeTool.execute("call-17079te", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      estimatedPromptTokens: 18000,
      persistedCountThreshold: 10,
      sessionMemoryStaleAfterSeconds: 1800,
    });

    expect(result.details).toMatchObject({
      accepted: true,
      status: "no_op",
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      plannerOutcome: "propose_full_compaction_fallback",
      sessionMemoryStatus: "stale",
      rationale: [
        "prompt pressure exceeds the bounded threshold and session memory is missing, stale, or insufficient",
        "session memory exists but is older than the bounded freshness window",
      ],
      requiredInputs: [
        "fresh sufficient session memory or a future full compaction implementation",
      ],
      estimatedPromptTokens: 18000,
      estimatedPromptTokenThreshold: 12000,
    });

    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    expect(countsAfter).toEqual(countsBefore);
  });

  it("keeps session-memory-backed compaction idempotent for the same session-memory state", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const updateTool = createMemorySessionUpdateTool({ runtime });
    const executeTool = createMemorySessionCompactExecuteTool({ runtime });

    await updateTool.execute("call-17079tf", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      title: "Stable session memory",
      currentState: "Ready for repeated bounded compaction execution",
      keyResults: ["No second event should be created"],
    });

    const firstResult = await executeTool.execute("call-17079tg", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      estimatedPromptTokens: 18000,
      persistedCountThreshold: 10,
    });
    const secondResult = await executeTool.execute("call-17079th", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      estimatedPromptTokens: 18000,
      persistedCountThreshold: 10,
    });

    expect((firstResult.details as { status: string }).status).toBe("executed");
    expect(secondResult.details).toMatchObject({
      accepted: true,
      status: "already_executed",
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      plannerOutcome: "use_session_memory",
      sessionMemoryStatus: "fresh_and_sufficient",
    });
    expect((secondResult.details as { compactionEventId: string }).compactionEventId).toBeTruthy();
    expect(
      (secondResult.details as { payload: { kind: string; shouldSubstitute: boolean } }).payload,
    ).toMatchObject({
      kind: "session_memory_compaction",
      shouldSubstitute: true,
    });

    const compactionCount = await querySingleRow<{ count: string }>(
      dbEnvironment.connectionString,
      `
        select count(*)::text as count
        from memory_middleware.compaction_events
        where session_id = $1::uuid
          and details ->> 'compactionSubstrate' = 'session_memory'
      `,
      [seeded.sessionId],
    );
    expect(compactionCount.count).toBe("1");
  });

  it("returns disabled for session-memory-backed compaction execution before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const executeTool = createMemorySessionCompactExecuteTool({ runtime });

    const result = await executeTool.execute("call-17079ti", {
      sessionId: "00000000-0000-0000-0000-000000000001",
      agentId: "00000000-0000-0000-0000-000000000002",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "session-memory compaction mode is not enabled",
    });
  });

  it("fails cleanly for session-memory-backed compaction execution when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const executeTool = createMemorySessionCompactExecuteTool({ runtime });

    const result = await executeTool.execute("call-17079tj", {
      sessionId: "00000000-0000-0000-0000-000000000001",
      agentId: "00000000-0000-0000-0000-000000000002",
      estimatedPromptTokens: 18000,
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("executes bounded full-fallback compaction when the planner recommends the fallback path", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const executeTool = createMemoryFullCompactionFallbackExecuteTool({ runtime });
    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const beforeCompactionCount = await querySingleRow<{ count: string }>(
      dbEnvironment.connectionString,
      `select count(*)::text as count from memory_middleware.compaction_events`,
      [],
    );

    const result = await executeTool.execute("call-17079tk", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      estimatedPromptTokens: 18000,
      persistedCountThreshold: 10,
    });

    expect(result.details).toMatchObject({
      accepted: true,
      status: "executed",
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      plannerOutcome: "propose_full_compaction_fallback",
      sessionMemoryStatus: "missing",
      rationale: [
        "bounded existing state was packaged into a deterministic full-fallback compaction artifact",
      ],
      requiredInputs: [
        "fresh sufficient session memory or a future full compaction implementation",
      ],
      estimatedPromptTokens: 18000,
      estimatedPromptTokenThreshold: 12000,
    });
    expect(
      (
        result.details as {
          payload: {
            kind: string;
            shouldSubstitute: boolean;
            substrate: { plannerOutcome: string; sessionMemoryStatus: string };
          };
        }
      ).payload,
    ).toMatchObject({
      kind: "full_compaction_fallback",
      shouldSubstitute: true,
      substrate: {
        plannerOutcome: "propose_full_compaction_fallback",
        sessionMemoryStatus: "missing",
      },
    });

    const afterCompactionCount = await querySingleRow<{ count: string }>(
      dbEnvironment.connectionString,
      `select count(*)::text as count from memory_middleware.compaction_events`,
      [],
    );
    expect(Number(afterCompactionCount.count)).toBe(Number(beforeCompactionCount.count) + 1);

    const compactionRow = await querySingleRow<{
      compaction_kind: string;
      compaction_substrate: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          compaction_kind::text as compaction_kind,
          details ->> 'compactionSubstrate' as compaction_substrate
        from memory_middleware.compaction_events
        order by created_at desc
        limit 1
      `,
      [],
    );
    expect(compactionRow).toEqual({
      compaction_kind: "full",
      compaction_substrate: "full_fallback",
    });

    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    expect(countsAfter).toEqual(countsBefore);
  });

  it("returns a no-op for full-fallback compaction when planner pressure remains low", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const executeTool = createMemoryFullCompactionFallbackExecuteTool({ runtime });
    const beforeCompactionCount = await querySingleRow<{ count: string }>(
      dbEnvironment.connectionString,
      `select count(*)::text as count from memory_middleware.compaction_events`,
      [],
    );

    const result = await executeTool.execute("call-17079tl", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      estimatedPromptTokens: 2000,
    });

    expect(result.details).toMatchObject({
      accepted: true,
      status: "no_op",
      plannerOutcome: "none",
      sessionMemoryStatus: "missing",
    });

    const afterCompactionCount = await querySingleRow<{ count: string }>(
      dbEnvironment.connectionString,
      `select count(*)::text as count from memory_middleware.compaction_events`,
      [],
    );
    expect(afterCompactionCount).toEqual(beforeCompactionCount);
  });

  it("returns a no-op for full-fallback compaction when planner recommends microcompaction instead", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const persistTool = createMemoryToolResultPersistTool({ runtime });
    const executeTool = createMemoryFullCompactionFallbackExecuteTool({ runtime });

    const firstPersist = await persistTool.execute("call-17079tm", {
      sessionId: seeded.sessionId,
      toolName: "memory_object_search_hybrid",
      payloadText: `oversized-old ${"1".repeat(5000)}`,
      forcePersist: true,
    });
    await persistTool.execute("call-17079tn", {
      sessionId: seeded.sessionId,
      toolName: "memory_object_search_hybrid",
      payloadText: `oversized-new ${"2".repeat(5000)}`,
      forcePersist: true,
    });

    const oldToolResultId = (firstPersist.details as { toolResultId: string }).toolResultId;
    const timestampClient = await connectClient(dbEnvironment.connectionString);
    try {
      await timestampClient.query(
        `alter table memory_middleware.tool_results disable trigger set_tool_results_updated_at`,
      );
      await timestampClient.query(
        `
          update memory_middleware.tool_results
          set updated_at = now() - interval '45 minutes'
          where id = $1::uuid
        `,
        [oldToolResultId],
      );
      await timestampClient.query(
        `alter table memory_middleware.tool_results enable trigger set_tool_results_updated_at`,
      );
    } finally {
      await timestampClient.end();
    }

    const beforeCompactionCount = await querySingleRow<{ count: string }>(
      dbEnvironment.connectionString,
      `select count(*)::text as count from memory_middleware.compaction_events`,
      [],
    );

    const result = await executeTool.execute("call-17079to", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      estimatedPromptTokens: 18000,
      persistedCountThreshold: 1,
      recentFloorCount: 1,
      idleGapSeconds: 1800,
    });

    expect(result.details).toMatchObject({
      accepted: true,
      status: "no_op",
      plannerOutcome: "use_microcompaction",
    });

    const afterCompactionCount = await querySingleRow<{ count: string }>(
      dbEnvironment.connectionString,
      `select count(*)::text as count from memory_middleware.compaction_events`,
      [],
    );
    expect(afterCompactionCount).toEqual(beforeCompactionCount);
  });

  it("returns a no-op for full-fallback compaction when planner recommends session-memory compaction instead", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const updateTool = createMemorySessionUpdateTool({ runtime });
    const executeTool = createMemoryFullCompactionFallbackExecuteTool({ runtime });

    await updateTool.execute("call-17079tp", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      title: "Fresh session memory",
      currentState: "Ready to continue",
      keyResults: ["Session memory can absorb the bounded context pressure"],
    });

    const beforeCompactionCount = await querySingleRow<{ count: string }>(
      dbEnvironment.connectionString,
      `select count(*)::text as count from memory_middleware.compaction_events`,
      [],
    );

    const result = await executeTool.execute("call-17079tq", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      estimatedPromptTokens: 18000,
      persistedCountThreshold: 10,
    });

    expect(result.details).toMatchObject({
      accepted: true,
      status: "no_op",
      plannerOutcome: "use_session_memory",
      sessionMemoryStatus: "fresh_and_sufficient",
    });

    const afterCompactionCount = await querySingleRow<{ count: string }>(
      dbEnvironment.connectionString,
      `select count(*)::text as count from memory_middleware.compaction_events`,
      [],
    );
    expect(afterCompactionCount).toEqual(beforeCompactionCount);
  });

  it("keeps full-fallback compaction idempotent for the same bounded substrate", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const executeTool = createMemoryFullCompactionFallbackExecuteTool({ runtime });

    const firstResult = await executeTool.execute("call-17079tr", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      estimatedPromptTokens: 18000,
      persistedCountThreshold: 10,
    });
    const secondResult = await executeTool.execute("call-17079ts", {
      sessionId: seeded.sessionId,
      agentId: seeded.agentId,
      estimatedPromptTokens: 18000,
      persistedCountThreshold: 10,
    });

    expect((firstResult.details as { status: string }).status).toBe("executed");
    expect(secondResult.details).toMatchObject({
      accepted: true,
      status: "already_executed",
      plannerOutcome: "propose_full_compaction_fallback",
      sessionMemoryStatus: "missing",
    });

    const compactionCount = await querySingleRow<{ count: string }>(
      dbEnvironment.connectionString,
      `
        select count(*)::text as count
        from memory_middleware.compaction_events
        where session_id = $1::uuid
          and compaction_kind = 'full'
          and details ->> 'compactionSubstrate' = 'full_fallback'
      `,
      [seeded.sessionId],
    );
    expect(compactionCount.count).toBe("1");
  });

  it("returns disabled for full-fallback compaction execution before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const executeTool = createMemoryFullCompactionFallbackExecuteTool({ runtime });

    const result = await executeTool.execute("call-17079tt", {
      sessionId: "00000000-0000-0000-0000-000000000001",
      agentId: "00000000-0000-0000-0000-000000000002",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "full compaction fallback mode is not enabled",
    });
  });

  it("fails cleanly for full-fallback compaction execution when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const executeTool = createMemoryFullCompactionFallbackExecuteTool({ runtime });

    const result = await executeTool.execute("call-17079tu", {
      sessionId: "00000000-0000-0000-0000-000000000001",
      agentId: "00000000-0000-0000-0000-000000000002",
      estimatedPromptTokens: 18000,
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("plans duplicate-merge review for duplicate approved durable memory without writes", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const planTool = createMemoryConsolidationPlanTool({ runtime });
    const client = await connectClient(dbEnvironment.connectionString);
    let firstId = "";
    let secondId = "";
    try {
      const first = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4)
          returning id::text as id
        `,
        [seeded.projectId, seeded.agentId, seeded.sessionId, "Shared durable insight"],
      );
      const second = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4)
          returning id::text as id
        `,
        [seeded.projectId, seeded.agentId, seeded.sessionId, "Shared durable insight"],
      );
      firstId = first.rows[0]?.id ?? "";
      secondId = second.rows[0]?.id ?? "";
    } finally {
      await client.end();
    }
    const countsBefore = await readTableCounts(dbEnvironment.connectionString);

    const result = await planTool.execute("call-17079tv", {
      projectId: seeded.projectId,
      includeValidatedProcedures: false,
      maxFindings: 10,
    });

    expect(result.details).toMatchObject({
      accepted: true,
      status: "ok",
      outcome: "review_needed",
      includeValidatedProcedures: false,
      rationale: ["bounded durable memory contains 1 consolidation finding"],
    });
    expect(
      (
        result.details as {
          findings: Array<{ actionType: string; affectedObjectIds: string[]; confidence: string }>;
        }
      ).findings,
    ).toEqual([
      expect.objectContaining({
        actionType: "duplicate_merge_review",
        confidence: "high",
        affectedObjectIds: [firstId, secondId].sort(),
      }),
    ]);

    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    expect(countsAfter).toEqual(countsBefore);
  });

  it("plans contradiction, stale, and drift review findings across durable memory and validated procedures without writes", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const planTool = createMemoryConsolidationPlanTool({ runtime });
    const client = await connectClient(dbEnvironment.connectionString);
    try {
      const contradictionBaseMetadata = {
        consolidationKey: "runtime_mode",
      };
      await client.query(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content,
            metadata
          )
          values
            ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4, $5::jsonb),
            ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $6, $7::jsonb)
        `,
        [
          seeded.projectId,
          seeded.agentId,
          seeded.sessionId,
          "Runtime mode is enabled",
          JSON.stringify({ ...contradictionBaseMetadata, consolidationValue: "enabled" }),
          "Runtime mode is disabled",
          JSON.stringify({ ...contradictionBaseMetadata, consolidationValue: "disabled" }),
        ],
      );

      const superseding = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4)
          returning id::text as id
        `,
        [seeded.projectId, seeded.agentId, seeded.sessionId, "New canonical deployment workflow"],
      );
      const supersedingId = superseding.rows[0]?.id;
      expect(supersedingId).toBeTruthy();

      await client.query(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content,
            metadata
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4, $5::jsonb)
        `,
        [
          seeded.projectId,
          seeded.agentId,
          seeded.sessionId,
          "Old deployment workflow",
          JSON.stringify({ supersededByObjectId: supersedingId }),
        ],
      );

      await client.query(
        `
          insert into memory_middleware.procedures (
            project_id,
            title,
            body,
            status,
            metadata
          )
          values ($1::uuid, $2, $3, 'validated', $4::jsonb)
        `,
        [
          seeded.projectId,
          "Rotate credentials",
          "Rotate service credentials every 30 days.",
          JSON.stringify({ driftCheckDueAt: "2026-03-01T00:00:00.000Z" }),
        ],
      );
    } finally {
      await client.end();
    }
    const countsBefore = await readTableCounts(dbEnvironment.connectionString);

    const result = await planTool.execute("call-17079tw", {
      projectId: seeded.projectId,
      includeValidatedProcedures: true,
      maxFindings: 10,
    });

    expect(result.details).toMatchObject({
      accepted: true,
      status: "ok",
      outcome: "review_needed",
      includeValidatedProcedures: true,
    });
    const findings = (
      result.details as {
        findings: Array<{ actionType: string; affectedObjectTypes: string[]; priority: string }>;
      }
    ).findings;
    expect(findings.map((entry) => entry.actionType)).toEqual(
      expect.arrayContaining([
        "contradiction_review",
        "stale_superseded_review",
        "drift_check_review",
      ]),
    );
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionType: "contradiction_review",
          priority: "high",
        }),
        expect.objectContaining({
          actionType: "drift_check_review",
          affectedObjectTypes: ["procedure"],
        }),
      ]),
    );

    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    expect(countsAfter).toEqual(countsBefore);
  });

  it("returns no_action when bounded durable memory has no consolidation signals", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const planTool = createMemoryConsolidationPlanTool({ runtime });
    const client = await connectClient(dbEnvironment.connectionString);
    try {
      await client.query(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4)
        `,
        [seeded.projectId, seeded.agentId, seeded.sessionId, "Unique healthy durable note"],
      );
    } finally {
      await client.end();
    }
    const countsBefore = await readTableCounts(dbEnvironment.connectionString);

    const result = await planTool.execute("call-17079tx", {
      projectId: seeded.projectId,
      includeValidatedProcedures: true,
    });

    expect(result.details).toEqual({
      accepted: true,
      status: "ok",
      outcome: "no_action",
      inspectedRecordCount: 1,
      includeValidatedProcedures: true,
      findings: [],
      rationale: ["bounded durable memory does not currently require consolidation review"],
    });

    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    expect(countsAfter).toEqual(countsBefore);
  });

  it("executes duplicate consolidation conservatively by superseding duplicate approved memory without unrelated writes", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const executeTool = createMemoryConsolidationExecuteTool({ runtime });
    let firstId = "";
    let secondId = "";
    const client = await connectClient(dbEnvironment.connectionString);
    try {
      const first = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4)
          returning id::text as id
        `,
        [seeded.projectId, seeded.agentId, seeded.sessionId, "Shared durable duplicate"],
      );
      const second = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4)
          returning id::text as id
        `,
        [seeded.projectId, seeded.agentId, seeded.sessionId, "Shared durable duplicate"],
      );
      firstId = first.rows[0]?.id ?? "";
      secondId = second.rows[0]?.id ?? "";
    } finally {
      await client.end();
    }

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await executeTool.execute("call-17080aa", {
      projectId: seeded.projectId,
      includeValidatedProcedures: false,
      approvedFindings: [
        {
          actionType: "duplicate_merge_review",
          affectedObjectIds: [firstId, secondId],
        },
      ],
    });

    const action = (
      result.details as {
        actions: Array<{
          actionType: string;
          status: string;
          affectedObjectIds: string[];
          supersededObjectIds: string[];
          survivorObjectId?: string;
        }>;
      }
    ).actions[0];

    expect(result.details).toMatchObject({
      accepted: true,
      status: "executed",
      executionMode: "approved_subset",
      reviewedFindingCount: 1,
      executedActionCount: 1,
      alreadyExecutedCount: 0,
      skippedFindingCount: 0,
    });
    expect(action).toMatchObject({
      actionType: "duplicate_merge_review",
      status: "executed",
      affectedObjectIds: expect.arrayContaining([firstId, secondId]),
    });
    expect(action.affectedObjectIds).toHaveLength(2);
    expect(action.supersededObjectIds).toHaveLength(1);
    expect(action.survivorObjectId === firstId || action.survivorObjectId === secondId).toBe(true);
    const expectedSupersededId = action.supersededObjectIds[0] ?? "";
    const expectedSurvivorId = action.survivorObjectId ?? "";
    expect([firstId, secondId]).toContain(expectedSupersededId);
    expect([firstId, secondId]).toContain(expectedSurvivorId);
    expect(expectedSupersededId).not.toBe(expectedSurvivorId);

    const duplicateState = await querySingleRow<{
      review_state: string;
      superseded_at: string | null;
      metadata: { supersededByObjectId?: string };
    }>(
      dbEnvironment.connectionString,
      `
        select
          review_state::text as review_state,
          superseded_at::text as superseded_at,
          metadata
        from memory_middleware.memory_objects
        where id = $1::uuid
      `,
      [expectedSupersededId],
    );
    expect(duplicateState).toMatchObject({
      review_state: "superseded",
      metadata: expect.objectContaining({
        supersededByObjectId: expectedSurvivorId,
      }),
    });
    expect(duplicateState?.superseded_at).toBeTruthy();

    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    expect(countsAfter).toEqual({
      ...countsBefore,
      memory_reviews: String(Number.parseInt(countsBefore.memory_reviews, 10) + 1),
      memory_links: String(Number.parseInt(countsBefore.memory_links, 10) + 1),
    });
  });

  it("executes stale-superseded consolidation conservatively and is idempotent on repeat calls", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const executeTool = createMemoryConsolidationExecuteTool({ runtime });
    let staleId = "";
    let targetId = "";
    const client = await connectClient(dbEnvironment.connectionString);
    try {
      const target = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4)
          returning id::text as id
        `,
        [seeded.projectId, seeded.agentId, seeded.sessionId, "New canonical rollout note"],
      );
      targetId = target.rows[0]?.id ?? "";
      const stale = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content,
            metadata
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4, $5::jsonb)
          returning id::text as id
        `,
        [
          seeded.projectId,
          seeded.agentId,
          seeded.sessionId,
          "Old rollout note",
          JSON.stringify({ supersededByObjectId: targetId }),
        ],
      );
      staleId = stale.rows[0]?.id ?? "";
    } finally {
      await client.end();
    }

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const firstResult = await executeTool.execute("call-17080ab", {
      projectId: seeded.projectId,
      includeValidatedProcedures: false,
      approvedFindings: [
        {
          actionType: "stale_superseded_review",
          affectedObjectIds: [staleId],
        },
      ],
    });
    expect(firstResult.details).toMatchObject({
      accepted: true,
      status: "executed",
      actions: [
        expect.objectContaining({
          actionType: "stale_superseded_review",
          status: "executed",
          supersededObjectIds: [staleId],
          survivorObjectId: targetId,
        }),
      ],
    });

    const countsAfterFirst = await readTableCounts(dbEnvironment.connectionString);
    expect(countsAfterFirst).toEqual({
      ...countsBefore,
      memory_reviews: String(Number.parseInt(countsBefore.memory_reviews, 10) + 1),
      memory_links: String(Number.parseInt(countsBefore.memory_links, 10) + 1),
    });

    const secondResult = await executeTool.execute("call-17080ac", {
      projectId: seeded.projectId,
      includeValidatedProcedures: false,
      approvedFindings: [
        {
          actionType: "stale_superseded_review",
          affectedObjectIds: [staleId],
        },
      ],
    });
    expect(secondResult.details).toMatchObject({
      accepted: true,
      status: "already_executed",
      executedActionCount: 0,
      alreadyExecutedCount: 1,
      skippedFindingCount: 0,
    });

    const countsAfterSecond = await readTableCounts(dbEnvironment.connectionString);
    expect(countsAfterSecond).toEqual(countsAfterFirst);
  });

  it("leaves contradiction and drift findings advisory-only during bounded consolidation execution", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const executeTool = createMemoryConsolidationExecuteTool({ runtime });
    const countsBefore = await readTableCounts(dbEnvironment.connectionString);

    const result = await executeTool.execute("call-17080ad", {
      projectId: seeded.projectId,
      approvedFindings: [
        {
          actionType: "contradiction_review",
          affectedObjectIds: ["00000000-0000-0000-0000-000000000011"],
        },
        {
          actionType: "drift_check_review",
          affectedObjectIds: ["00000000-0000-0000-0000-000000000012"],
        },
      ],
    });

    expect(result.details).toMatchObject({
      accepted: true,
      status: "no_op",
      executedActionCount: 0,
      alreadyExecutedCount: 0,
      skippedFindingCount: 2,
      actions: [
        expect.objectContaining({
          actionType: "contradiction_review",
          status: "skipped_ineligible",
        }),
        expect.objectContaining({
          actionType: "drift_check_review",
          status: "skipped_ineligible",
        }),
      ],
    });

    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    expect(countsAfter).toEqual(countsBefore);
  });

  it("records bounded drift-check artifacts for overdue approved memory and validated procedures without rewriting content", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const executeTool = createMemoryDriftCheckExecuteTool({ runtime });
    let memoryObjectId = "";
    let procedureId = "";
    const client = await connectClient(dbEnvironment.connectionString);
    try {
      const memoryObject = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content,
            metadata
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4, $5::jsonb)
          returning id::text as id
        `,
        [
          seeded.projectId,
          seeded.agentId,
          seeded.sessionId,
          "Deployment note that needs freshness review",
          JSON.stringify({ driftCheckDueAt: "2026-03-01T00:00:00.000Z" }),
        ],
      );
      memoryObjectId = memoryObject.rows[0]?.id ?? "";

      const procedure = await client.query<{ id: string }>(
        `
          insert into memory_middleware.procedures (
            project_id,
            title,
            body,
            status,
            metadata
          )
          values ($1::uuid, $2, $3, 'validated', $4::jsonb)
          returning id::text as id
        `,
        [
          seeded.projectId,
          "Rotate deployment key",
          "Rotate the deployment key every 30 days.",
          JSON.stringify({ driftCheckDueAt: "2026-03-01T00:00:00.000Z" }),
        ],
      );
      procedureId = procedure.rows[0]?.id ?? "";
    } finally {
      await client.end();
    }

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await executeTool.execute("call-17080ba", {
      projectId: seeded.projectId,
      includeValidatedProcedures: true,
      approvedFindings: [
        {
          actionType: "drift_check_review",
          affectedObjectIds: [memoryObjectId],
        },
        {
          actionType: "drift_check_review",
          affectedObjectIds: [procedureId],
        },
      ],
    });

    expect(result.details).toMatchObject({
      accepted: true,
      status: "executed",
      executionMode: "approved_subset",
      reviewedFindingCount: 2,
      executedActionCount: 2,
      alreadyExecutedCount: 0,
      skippedFindingCount: 0,
      actions: [
        expect.objectContaining({
          affectedObjectId: memoryObjectId,
          affectedObjectType: "memory_object",
          status: "executed",
          eventId: expect.any(String),
        }),
        expect.objectContaining({
          affectedObjectId: procedureId,
          affectedObjectType: "procedure",
          status: "executed",
          eventId: expect.any(String),
        }),
      ],
    });

    const memoryState = await querySingleRow<{
      content: string;
      metadata: { driftCheckedAt?: string; driftCheckOutcome?: string; driftCheckEventId?: string };
    }>(
      dbEnvironment.connectionString,
      `
        select content, metadata
        from memory_middleware.memory_objects
        where id = $1::uuid
      `,
      [memoryObjectId],
    );
    expect(memoryState?.content).toBe("Deployment note that needs freshness review");
    expect(memoryState?.metadata).toEqual(
      expect.objectContaining({
        driftCheckOutcome: "review_recorded",
        driftCheckedAt: expect.any(String),
        driftCheckEventId: expect.any(String),
      }),
    );

    const procedureState = await querySingleRow<{
      body: string;
      metadata: { driftCheckedAt?: string; driftCheckOutcome?: string; driftCheckEventId?: string };
    }>(
      dbEnvironment.connectionString,
      `
        select body, metadata
        from memory_middleware.procedures
        where id = $1::uuid
      `,
      [procedureId],
    );
    expect(procedureState?.body).toBe("Rotate the deployment key every 30 days.");
    expect(procedureState?.metadata).toEqual(
      expect.objectContaining({
        driftCheckOutcome: "review_recorded",
        driftCheckedAt: expect.any(String),
        driftCheckEventId: expect.any(String),
      }),
    );

    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    expect(countsAfter).toEqual({
      ...countsBefore,
      memory_events: String(Number.parseInt(countsBefore.memory_events, 10) + 2),
    });
  });

  it("is idempotent for repeated bounded drift-check execution on the same overdue object", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const executeTool = createMemoryDriftCheckExecuteTool({ runtime });
    let memoryObjectId = "";
    const client = await connectClient(dbEnvironment.connectionString);
    try {
      const memoryObject = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content,
            metadata
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4, $5::jsonb)
          returning id::text as id
        `,
        [
          seeded.projectId,
          seeded.agentId,
          seeded.sessionId,
          "Overdue note",
          JSON.stringify({ driftCheckDueAt: "2026-03-01T00:00:00.000Z" }),
        ],
      );
      memoryObjectId = memoryObject.rows[0]?.id ?? "";
    } finally {
      await client.end();
    }

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const firstResult = await executeTool.execute("call-17080bb", {
      approvedFindings: [
        {
          actionType: "drift_check_review",
          affectedObjectIds: [memoryObjectId],
        },
      ],
    });
    expect(firstResult.details).toMatchObject({
      accepted: true,
      status: "executed",
      executedActionCount: 1,
    });
    const countsAfterFirst = await readTableCounts(dbEnvironment.connectionString);
    expect(countsAfterFirst).toEqual({
      ...countsBefore,
      memory_events: String(Number.parseInt(countsBefore.memory_events, 10) + 1),
    });

    const secondResult = await executeTool.execute("call-17080bc", {
      approvedFindings: [
        {
          actionType: "drift_check_review",
          affectedObjectIds: [memoryObjectId],
        },
      ],
    });
    expect(secondResult.details).toMatchObject({
      accepted: true,
      status: "already_executed",
      executedActionCount: 0,
      alreadyExecutedCount: 1,
      skippedFindingCount: 0,
    });
    const countsAfterSecond = await readTableCounts(dbEnvironment.connectionString);
    expect(countsAfterSecond).toEqual(countsAfterFirst);
  });

  it("returns advisory proactive follow-up opportunities without writing any rows", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const reviewTool = createCandidateReviewTool({ runtime });
    const promoteProcedureTool = createCandidatePromoteProcedureTool({ runtime });
    const validateProcedureTool = createProcedureValidateTool({ runtime });
    const createSkillCandidateTool = createSkillCandidateCreateTool({ runtime });
    const proactivePlanTool = createMemoryProactivePlanTool({ runtime });

    const pendingCandidateResult = await submitTool.execute("call-17080ca", {
      kind: "learning",
      content: "Pending review candidate",
      projectId: seeded.projectId,
    });
    const pendingCandidateId = (
      pendingCandidateResult.details as { accepted: true; memoryObjectId: string }
    ).memoryObjectId;

    const procedureCandidateResult = await submitTool.execute("call-17080cb", {
      kind: "procedure",
      content: "Document the deployment rollback checklist",
      projectId: seeded.projectId,
    });
    const procedureCandidateId = (
      procedureCandidateResult.details as { accepted: true; memoryObjectId: string }
    ).memoryObjectId;
    await reviewTool.execute("call-17080cc", {
      candidateId: procedureCandidateId,
      outcome: "accepted",
      rationale: "Looks reusable",
    });
    const promoteProcedureResult = await promoteProcedureTool.execute("call-17080cd", {
      candidateId: procedureCandidateId,
      title: "Deployment rollback checklist",
      rationale: "Promote to draft",
    });
    const procedureId = (promoteProcedureResult.details as { procedureId: string }).procedureId;
    const governanceProcedureCandidateResult = await submitTool.execute("call-17080cd2", {
      kind: "procedure",
      content: "Document the release smoke checklist",
      projectId: seeded.projectId,
    });
    const governanceProcedureCandidateId = (
      governanceProcedureCandidateResult.details as { accepted: true; memoryObjectId: string }
    ).memoryObjectId;
    await reviewTool.execute("call-17080cd3", {
      candidateId: governanceProcedureCandidateId,
      outcome: "accepted",
      rationale: "Looks reusable for governance follow-up",
    });
    const governanceProcedureResult = await promoteProcedureTool.execute("call-17080cd4", {
      candidateId: governanceProcedureCandidateId,
      title: "Release smoke checklist",
      rationale: "Promote to draft for governance follow-up",
    });
    const governanceProcedureId = (governanceProcedureResult.details as { procedureId: string })
      .procedureId;
    await validateProcedureTool.execute("call-17080ce", {
      procedureId: governanceProcedureId,
      rationale: "Validated through bounded review",
    });
    const skillCandidateResult = await createSkillCandidateTool.execute("call-17080cf", {
      procedureId: governanceProcedureId,
      name: "rollback-checklist-skill",
      summary: "Skill candidate for rollback checklist follow-up",
    });
    const skillCandidateId = (skillCandidateResult.details as { skillCandidateId: string })
      .skillCandidateId;

    let staleMemoryId = "";
    let duplicateAId = "";
    let duplicateBId = "";
    let overdueMemoryId = "";
    const client = await connectClient(dbEnvironment.connectionString);
    try {
      const staleInsert = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content,
            metadata
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4, $5::jsonb)
          returning id::text as id
        `,
        [
          seeded.projectId,
          seeded.agentId,
          seeded.sessionId,
          "Stale durable note",
          JSON.stringify({ lifecycleHint: "stale" }),
        ],
      );
      staleMemoryId = staleInsert.rows[0]?.id ?? "";

      const duplicateInsert = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content,
            metadata
          )
          values
            ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4, '{}'::jsonb),
            ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4, '{}'::jsonb)
          returning id::text as id
        `,
        [seeded.projectId, seeded.agentId, seeded.sessionId, "Duplicate durable note"],
      );
      duplicateAId = duplicateInsert.rows[0]?.id ?? "";
      duplicateBId = duplicateInsert.rows[1]?.id ?? "";

      const overdueInsert = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content,
            metadata
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4, $5::jsonb)
          returning id::text as id
        `,
        [
          seeded.projectId,
          seeded.agentId,
          seeded.sessionId,
          "Overdue drift review note",
          JSON.stringify({ driftCheckDueAt: "2026-03-01T00:00:00.000Z" }),
        ],
      );
      overdueMemoryId = overdueInsert.rows[0]?.id ?? "";
    } finally {
      await client.end();
    }

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await proactivePlanTool.execute("call-17080cg", {
      projectId: seeded.projectId,
      maxActions: 6,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(countsAfter).toEqual(countsBefore);
    expect(result.details).toMatchObject({
      accepted: true,
      status: "ok",
      outcome: "actions_available",
      projectId: seeded.projectId,
      advisoryOnly: true,
      advisoryNote: "Advisory only. No proactive actions were executed.",
    });
    expect((result.details as { actions: Array<{ actionType: string }> }).actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionType: "follow_up_candidate_review",
          affectedIds: [pendingCandidateId],
        }),
        expect.objectContaining({
          actionType: "follow_up_procedure_validation",
          affectedIds: [procedureId],
        }),
        expect.objectContaining({
          actionType: "follow_up_skill_candidate_governance",
          affectedIds: [skillCandidateId],
        }),
        expect.objectContaining({
          actionType: "revisit_stale_memory",
          affectedIds: [staleMemoryId],
        }),
        expect.objectContaining({
          actionType: "run_drift_check",
          affectedIds: [overdueMemoryId],
        }),
        expect.objectContaining({
          actionType: "review_consolidation_findings",
          affectedIds: expect.arrayContaining([duplicateAId, duplicateBId]),
        }),
      ]),
    );
  });

  it("returns advisory no-action when bounded state has no proactive follow-up", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const proactivePlanTool = createMemoryProactivePlanTool({ runtime });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await proactivePlanTool.execute("call-17080ch", {
      projectId: seeded.projectId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(countsAfter).toEqual(countsBefore);
    expect(result.details).toEqual({
      accepted: true,
      status: "ok",
      outcome: "no_action",
      projectId: seeded.projectId,
      advisoryOnly: true,
      advisoryNote: "Advisory only. No proactive actions were executed.",
      actions: [
        {
          actionType: "no_action",
          priority: "none",
          actionClass: "none",
          requiredApprovalClass: "none",
          affectedIds: [],
          rationale: [
            "bounded internal memory-middleware state does not currently suggest a useful proactive follow-up",
          ],
          advisoryOnly: true,
          advisoryNote: "Advisory only. No proactive actions were executed.",
        },
      ],
      inspectedState: {
        pendingCandidateReviewCount: 0,
        eligibleProcedureValidationCount: 0,
        candidateSkillGovernanceCount: 0,
        staleMemoryCount: 0,
        driftCheckCount: 0,
        consolidationReviewCount: 0,
      },
      rationale: ["no bounded proactive follow-up opportunities were identified"],
    });
  });

  it("executes the derived proactive run_drift_check action through the bounded drift-check seam", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const proactiveExecuteTool = createMemoryProactiveExecuteTool({ runtime });
    let memoryObjectId = "";
    const client = await connectClient(dbEnvironment.connectionString);
    try {
      const memoryObject = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content,
            metadata
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4, $5::jsonb)
          returning id::text as id
        `,
        [
          seeded.projectId,
          seeded.agentId,
          seeded.sessionId,
          "Proactive drift-check target",
          JSON.stringify({ driftCheckDueAt: "2026-03-01T00:00:00.000Z" }),
        ],
      );
      memoryObjectId = memoryObject.rows[0]?.id ?? "";
    } finally {
      await client.end();
    }

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await proactiveExecuteTool.execute("call-17080cl", {
      actionType: "run_drift_check",
      projectId: seeded.projectId,
      reviewerAgentId: seeded.agentId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(result.details).toMatchObject({
      accepted: true,
      status: "executed",
      actionType: "run_drift_check",
      executionSource: "derived_plan",
      affectedIds: [memoryObjectId],
      driftCheckExecution: expect.objectContaining({
        accepted: true,
        status: "executed",
        executionMode: "approved_subset",
        executedActionCount: 1,
      }),
    });
    expect(countsAfter).toEqual({
      ...countsBefore,
      memory_events: String(Number.parseInt(countsBefore.memory_events, 10) + 1),
    });

    const memoryState = await querySingleRow<{
      metadata: { driftCheckedAt?: string; driftCheckOutcome?: string; driftCheckEventId?: string };
      content: string;
    }>(
      dbEnvironment.connectionString,
      `
        select metadata, content
        from memory_middleware.memory_objects
        where id = $1::uuid
      `,
      [memoryObjectId],
    );
    expect(memoryState?.content).toBe("Proactive drift-check target");
    expect(memoryState?.metadata).toEqual(
      expect.objectContaining({
        driftCheckOutcome: "review_recorded",
        driftCheckedAt: expect.any(String),
        driftCheckEventId: expect.any(String),
      }),
    );
  });

  it("blocks non-drift proactive actions without any side effects", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });
    const proactiveExecuteTool = createMemoryProactiveExecuteTool({ runtime });

    const candidateResult = await submitTool.execute("call-17080cm", {
      kind: "learning",
      content: "Candidate awaiting review",
      projectId: seeded.projectId,
    });
    const candidateId = (candidateResult.details as { accepted: true; memoryObjectId: string })
      .memoryObjectId;

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await proactiveExecuteTool.execute("call-17080cn", {
      actionType: "follow_up_candidate_review",
      affectedIds: [candidateId],
      projectId: seeded.projectId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(result.details).toEqual({
      accepted: true,
      status: "blocked",
      actionType: "follow_up_candidate_review",
      executionSource: "explicit_selection",
      affectedIds: [candidateId],
      rationale: [
        "proactive execution for follow_up_candidate_review is out of scope in this slice",
        "only the bounded run_drift_check action class may execute proactively",
      ],
    });
    expect(countsAfter).toEqual(countsBefore);
  });

  it("is repeat-safe for explicit proactive run_drift_check execution", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const proactiveExecuteTool = createMemoryProactiveExecuteTool({ runtime });
    let memoryObjectId = "";
    const client = await connectClient(dbEnvironment.connectionString);
    try {
      const memoryObject = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content,
            metadata
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4, $5::jsonb)
          returning id::text as id
        `,
        [
          seeded.projectId,
          seeded.agentId,
          seeded.sessionId,
          "Repeat-safe proactive drift-check target",
          JSON.stringify({ driftCheckDueAt: "2026-03-01T00:00:00.000Z" }),
        ],
      );
      memoryObjectId = memoryObject.rows[0]?.id ?? "";
    } finally {
      await client.end();
    }

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const firstResult = await proactiveExecuteTool.execute("call-17080co", {
      actionType: "run_drift_check",
      affectedIds: [memoryObjectId],
      reviewerAgentId: seeded.agentId,
    });
    expect(firstResult.details).toMatchObject({
      accepted: true,
      status: "executed",
      executionSource: "explicit_selection",
      affectedIds: [memoryObjectId],
    });
    const countsAfterFirst = await readTableCounts(dbEnvironment.connectionString);
    expect(countsAfterFirst).toEqual({
      ...countsBefore,
      memory_events: String(Number.parseInt(countsBefore.memory_events, 10) + 1),
    });

    const secondResult = await proactiveExecuteTool.execute("call-17080cp", {
      actionType: "run_drift_check",
      affectedIds: [memoryObjectId],
      reviewerAgentId: seeded.agentId,
    });
    expect(secondResult.details).toMatchObject({
      accepted: true,
      status: "already_executed",
      executionSource: "explicit_selection",
      affectedIds: [memoryObjectId],
      driftCheckExecution: expect.objectContaining({
        accepted: true,
        status: "already_executed",
      }),
    });
    const countsAfterSecond = await readTableCounts(dbEnvironment.connectionString);
    expect(countsAfterSecond).toEqual(countsAfterFirst);
  });

  it("enqueues a bounded proactive-plan background job without side effects outside the job table", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const enqueueTool = createMemoryBackgroundJobEnqueueTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await enqueueTool.execute("call-17080ct", {
      jobClass: "proactive_plan",
      projectId: seeded.projectId,
      maxActions: 2,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(result.details).toMatchObject({
      accepted: true,
      status: "queued",
      jobClass: "proactive_plan",
      jobKind: "maintenance",
    });
    expect(countsAfter).toEqual({
      ...countsBefore,
      background_jobs: String(Number.parseInt(countsBefore.background_jobs, 10) + 1),
    });

    const jobRow = await querySingleRow<{
      status: string;
      job_kind: string;
      payload: { jobClass?: string; maxActions?: number };
      metadata: { source?: string; payloadFingerprint?: string };
    }>(
      dbEnvironment.connectionString,
      `
        select status, job_kind, payload, metadata
        from memory_middleware.background_jobs
        where id = $1::uuid
      `,
      [(result.details as { jobId: string }).jobId],
    );
    expect(jobRow).toEqual({
      status: "queued",
      job_kind: "maintenance",
      payload: expect.objectContaining({
        jobClass: "proactive_plan",
        projectId: seeded.projectId,
        maxActions: 2,
      }),
      metadata: expect.objectContaining({
        source: "memory_background_job_enqueue",
        payloadFingerprint: expect.any(String),
      }),
    });
  });

  it("dedupes repeated enqueue requests for the same bounded background job payload", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const enqueueTool = createMemoryBackgroundJobEnqueueTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });

    const firstResult = await enqueueTool.execute("call-17080cu", {
      jobClass: "proactive_plan",
      projectId: seeded.projectId,
      maxActions: 3,
    });
    const secondResult = await enqueueTool.execute("call-17080cv", {
      jobClass: "proactive_plan",
      projectId: seeded.projectId,
      maxActions: 3,
    });

    expect(secondResult.details).toMatchObject({
      accepted: true,
      status: "already_queued",
      jobId: (firstResult.details as { jobId: string }).jobId,
      jobClass: "proactive_plan",
    });

    const queuedJobs = await querySingleRow<{ count: string }>(
      dbEnvironment.connectionString,
      `
        select count(*)::text as count
        from memory_middleware.background_jobs
        where status = 'queued'
      `,
      [],
    );
    expect(queuedJobs?.count).toBe("1");
  });

  it("lists and gets queued background jobs through the bounded inspection seam without side effects", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
      backgroundJobInspectionMode: "enabled",
    });
    const enqueueTool = createMemoryBackgroundJobEnqueueTool({ runtime });
    const listTool = createMemoryBackgroundJobListTool({ runtime });
    const getTool = createMemoryBackgroundJobGetTool({ runtime });

    const enqueueResult = await enqueueTool.execute("call-17080cvv", {
      jobClass: "proactive_plan",
      projectId: seeded.projectId,
    });
    const jobId = (enqueueResult.details as { jobId: string }).jobId;
    const countsBefore = await readTableCounts(dbEnvironment.connectionString);

    const listResult = await listTool.execute("call-17080cvw", {
      projectId: seeded.projectId,
      status: "queued",
    });
    const getResult = await getTool.execute("call-17080cvx", {
      jobId,
    });

    expect(listResult.details).toMatchObject({
      accepted: true,
      status: "ok",
      jobs: [expect.objectContaining({ jobId, jobClass: "proactive_plan", status: "queued" })],
    });
    expect(getResult.details).toMatchObject({
      accepted: true,
      status: "ok",
      job: expect.objectContaining({ jobId, jobClass: "proactive_plan", status: "queued" }),
    });
    expect(await readTableCounts(dbEnvironment.connectionString)).toEqual(countsBefore);
  });

  it("runs the next proactive-plan background job and only updates job state", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const enqueueTool = createMemoryBackgroundJobEnqueueTool({ runtime });
    const runNextTool = createMemoryBackgroundJobRunNextTool({ runtime });

    await enqueueTool.execute("call-17080cw", {
      jobClass: "proactive_plan",
      projectId: seeded.projectId,
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await runNextTool.execute("call-17080cx", {
      projectId: seeded.projectId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(result.details).toMatchObject({
      accepted: true,
      status: "executed",
      jobClass: "proactive_plan",
      jobStatus: "succeeded",
      proactivePlanResult: expect.objectContaining({
        accepted: true,
      }),
    });
    expect(countsAfter).toEqual(countsBefore);

    const jobRow = await querySingleRow<{
      status: string;
      attempts: string;
      last_error: string | null;
      metadata: { lastRun?: { status?: string; executionMetadata?: { plannerStatus?: string } } };
    }>(
      dbEnvironment.connectionString,
      `
        select status, attempts::text as attempts, last_error, metadata
        from memory_middleware.background_jobs
        order by created_at desc, id desc
        limit 1
      `,
      [],
    );
    expect(jobRow).toEqual({
      status: "succeeded",
      attempts: "1",
      last_error: null,
      metadata: expect.objectContaining({
        lastRun: expect.objectContaining({
          status: "succeeded",
          executionMetadata: expect.objectContaining({
            plannerStatus: "ok",
          }),
        }),
      }),
    });
  });

  it("blocks background-job inspection before touching the database when inspection mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
      backgroundJobInspectionMode: "disabled",
      backgroundJobAdvisorySchedulingMode: "disabled",
      backgroundJobExecuteSchedulingMode: "disabled",
    });
    const listTool = createMemoryBackgroundJobListTool({ runtime });
    const getTool = createMemoryBackgroundJobGetTool({ runtime });

    const listResult = await listTool.execute("call-17080cxy", {});
    const getResult = await getTool.execute("call-17080cxz", {
      jobId: randomUUID(),
    });

    expect(listResult.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "background job inspection is not enabled",
    });
    expect(getResult.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "background job inspection is not enabled",
    });
  });

  it("runs the next proactive drift-check background job only through the bounded drift-check path", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const enqueueTool = createMemoryBackgroundJobEnqueueTool({ runtime });
    const runNextTool = createMemoryBackgroundJobRunNextTool({ runtime });
    let memoryObjectId = "";
    const client = await connectClient(dbEnvironment.connectionString);
    try {
      const memoryObject = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content,
            metadata
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4, $5::jsonb)
          returning id::text as id
        `,
        [
          seeded.projectId,
          seeded.agentId,
          seeded.sessionId,
          "Background-job drift target",
          JSON.stringify({ driftCheckDueAt: "2026-03-01T00:00:00.000Z" }),
        ],
      );
      memoryObjectId = memoryObject.rows[0]?.id ?? "";
    } finally {
      await client.end();
    }

    await enqueueTool.execute("call-17080cy", {
      jobClass: "proactive_execute_run_drift_check",
      projectId: seeded.projectId,
      reviewerAgentId: seeded.agentId,
      affectedIds: [memoryObjectId],
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await runNextTool.execute("call-17080cz", {
      projectId: seeded.projectId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(result.details).toMatchObject({
      accepted: true,
      status: "executed",
      jobClass: "proactive_execute_run_drift_check",
      jobStatus: "succeeded",
      proactiveExecuteResult: expect.objectContaining({
        accepted: true,
        status: "executed",
        actionType: "run_drift_check",
        affectedIds: [memoryObjectId],
      }),
    });
    expect(countsAfter).toEqual({
      ...countsBefore,
      memory_events: String(Number.parseInt(countsBefore.memory_events, 10) + 1),
    });

    const sideEffectCounts = await querySingleRow<{
      procedure_runs: string;
      skill_candidates: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select count(*)::text from memory_middleware.procedure_runs) as procedure_runs,
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates
      `,
      [],
    );
    expect(sideEffectCounts).toEqual({
      procedure_runs: countsAfter.procedure_runs,
      skill_candidates: countsAfter.skill_candidates,
    });
  });

  it("enqueues a bounded consolidation-plan background job with advisory planner parameters only", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const enqueueTool = createMemoryBackgroundJobEnqueueTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      },
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await enqueueTool.execute("call-17080dk", {
      jobClass: "consolidation_plan",
      projectId: seeded.projectId,
      includeValidatedProcedures: true,
      limit: 8,
      maxFindings: 4,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(result.details).toMatchObject({
      accepted: true,
      status: "queued",
      jobClass: "consolidation_plan",
      jobKind: "maintenance",
    });
    expect(countsAfter).toEqual({
      ...countsBefore,
      background_jobs: String(Number.parseInt(countsBefore.background_jobs, 10) + 1),
    });

    const jobRow = await querySingleRow<{
      payload: {
        jobClass?: string;
        projectId?: string;
        includeValidatedProcedures?: boolean;
        limit?: number;
        maxFindings?: number;
      };
    }>(
      dbEnvironment.connectionString,
      `
        select payload
        from memory_middleware.background_jobs
        where id = $1::uuid
      `,
      [(result.details as { jobId: string }).jobId],
    );
    expect(jobRow).toEqual({
      payload: {
        jobClass: "consolidation_plan",
        projectId: seeded.projectId,
        includeValidatedProcedures: true,
        limit: 8,
        maxFindings: 4,
      },
    });
  });

  it("runs the next consolidation-plan background job through the advisory consolidation planner only", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const enqueueTool = createMemoryBackgroundJobEnqueueTool({ runtime });
    const runNextTool = createMemoryBackgroundJobRunNextTool({ runtime });
    const client = await connectClient(dbEnvironment.connectionString);
    let firstId = "";
    let secondId = "";
    try {
      const first = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4)
          returning id::text as id
        `,
        [seeded.projectId, seeded.agentId, seeded.sessionId, "Background-job duplicate insight"],
      );
      const second = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4)
          returning id::text as id
        `,
        [seeded.projectId, seeded.agentId, seeded.sessionId, "Background-job duplicate insight"],
      );
      firstId = first.rows[0]?.id ?? "";
      secondId = second.rows[0]?.id ?? "";
    } finally {
      await client.end();
    }

    await enqueueTool.execute("call-17080dl", {
      jobClass: "consolidation_plan",
      projectId: seeded.projectId,
      includeValidatedProcedures: false,
      maxFindings: 5,
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await runNextTool.execute("call-17080dm", {
      projectId: seeded.projectId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(result.details).toMatchObject({
      accepted: true,
      status: "executed",
      jobClass: "consolidation_plan",
      jobStatus: "succeeded",
      consolidationPlanResult: expect.objectContaining({
        accepted: true,
        status: "ok",
        outcome: "review_needed",
        includeValidatedProcedures: false,
        findings: [
          expect.objectContaining({
            actionType: "duplicate_merge_review",
            affectedObjectIds: [firstId, secondId].sort(),
          }),
        ],
      }),
    });
    expect(countsAfter).toEqual(countsBefore);

    const jobRow = await querySingleRow<{
      status: string;
      attempts: string;
      metadata: {
        lastRun?: {
          status?: string;
          executionMetadata?: {
            plannerStatus?: string;
            plannerOutcome?: string;
            findingTypes?: string[];
          };
        };
      };
    }>(
      dbEnvironment.connectionString,
      `
        select status, attempts::text as attempts, metadata
        from memory_middleware.background_jobs
        order by created_at desc, id desc
        limit 1
      `,
      [],
    );
    expect(jobRow).toEqual({
      status: "succeeded",
      attempts: "1",
      metadata: expect.objectContaining({
        lastRun: expect.objectContaining({
          status: "succeeded",
          executionMetadata: expect.objectContaining({
            plannerStatus: "ok",
            plannerOutcome: "review_needed",
            findingTypes: ["duplicate_merge_review"],
          }),
        }),
      }),
    });

    const memoryStates = await querySingleRow<{
      state_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select count(*)::text as state_count
        from memory_middleware.memory_objects
        where review_state <> 'approved'
          and content = 'Background-job duplicate insight'
      `,
      [],
    );
    expect(memoryStates?.state_count).toBe("0");
  });

  it("blocks unsafe consolidation_execute enqueue requests without a safe approved subset", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const enqueueTool = createMemoryBackgroundJobEnqueueTool({ runtime });
    const countsBefore = await readTableCounts(dbEnvironment.connectionString);

    const result = await enqueueTool.execute("call-17080dn", {
      jobClass: "consolidation_execute",
      projectId: seeded.projectId,
    });

    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    expect(result.details).toEqual({
      accepted: false,
      status: "blocked",
      jobClass: "consolidation_execute",
      reason:
        "consolidation_execute requires explicit approvedFindings limited to duplicate_merge_review or stale_superseded_review",
    });
    expect(countsAfter).toEqual(countsBefore);
  });

  it("runs the next consolidation_execute background job only through the bounded safe consolidation execution path", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const enqueueTool = createMemoryBackgroundJobEnqueueTool({ runtime });
    const runNextTool = createMemoryBackgroundJobRunNextTool({ runtime });
    let firstId = "";
    let secondId = "";
    const client = await connectClient(dbEnvironment.connectionString);
    try {
      const first = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4)
          returning id::text as id
        `,
        [seeded.projectId, seeded.agentId, seeded.sessionId, "Scheduled duplicate insight"],
      );
      const second = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4)
          returning id::text as id
        `,
        [seeded.projectId, seeded.agentId, seeded.sessionId, "Scheduled duplicate insight"],
      );
      firstId = first.rows[0]?.id ?? "";
      secondId = second.rows[0]?.id ?? "";
    } finally {
      await client.end();
    }

    await enqueueTool.execute("call-17080do", {
      jobClass: "consolidation_execute",
      projectId: seeded.projectId,
      reviewerAgentId: seeded.agentId,
      approvedFindings: [
        {
          actionType: "duplicate_merge_review",
          affectedObjectIds: [firstId, secondId],
        },
      ],
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await runNextTool.execute("call-17080dp", {
      projectId: seeded.projectId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(result.details).toMatchObject({
      accepted: true,
      status: "executed",
      jobClass: "consolidation_execute",
      jobStatus: "succeeded",
      consolidationExecuteResult: expect.objectContaining({
        accepted: true,
        status: "executed",
        executionMode: "approved_subset",
        reviewedFindingCount: 1,
        executedActionCount: 1,
        actions: [
          expect.objectContaining({
            actionType: "duplicate_merge_review",
            status: "executed",
            affectedObjectIds: [firstId, secondId].sort(),
          }),
        ],
      }),
    });
    expect(countsAfter).toEqual({
      ...countsBefore,
      memory_reviews: String(Number.parseInt(countsBefore.memory_reviews, 10) + 1),
      memory_links: String(Number.parseInt(countsBefore.memory_links, 10) + 1),
    });

    const sideEffectCounts = await querySingleRow<{
      memory_events: string;
      procedure_runs: string;
      skill_candidates: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select count(*)::text from memory_middleware.memory_events) as memory_events,
          (select count(*)::text from memory_middleware.procedure_runs) as procedure_runs,
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates
      `,
      [],
    );
    expect(sideEffectCounts).toEqual({
      memory_events: countsAfter.memory_events,
      procedure_runs: countsAfter.procedure_runs,
      skill_candidates: countsAfter.skill_candidates,
    });

    const duplicateState = await querySingleRow<{
      id: string;
      review_state: string;
      metadata: { supersededByObjectId?: string; consolidationActionType?: string };
    }>(
      dbEnvironment.connectionString,
      `
        select id::text as id, review_state::text as review_state, metadata
        from memory_middleware.memory_objects
        where content = 'Scheduled duplicate insight'
          and review_state = 'superseded'
        order by created_at desc, id desc
        limit 1
      `,
      [],
    );
    expect(duplicateState?.id === firstId || duplicateState?.id === secondId).toBe(true);
    expect(duplicateState).toEqual(
      expect.objectContaining({
        review_state: "superseded",
        metadata: expect.objectContaining({
          consolidationActionType: "duplicate_merge_review",
        }),
      }),
    );
  });

  it("returns no_job after a queued background job has already been consumed", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const enqueueTool = createMemoryBackgroundJobEnqueueTool({ runtime });
    const runNextTool = createMemoryBackgroundJobRunNextTool({ runtime });

    await enqueueTool.execute("call-17080da", {
      jobClass: "proactive_plan",
      projectId: seeded.projectId,
    });
    await runNextTool.execute("call-17080db", {
      projectId: seeded.projectId,
    });

    const result = await runNextTool.execute("call-17080dc", {
      projectId: seeded.projectId,
    });

    expect(result.details).toEqual({
      accepted: true,
      status: "no_job",
      rationale: ["no queued bounded background job is currently ready to run"],
    });
  });

  it("requires the configured runner owner before claiming the next queued background job", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
      backgroundJobAdvisorySchedulingMode: "candidate-only",
      backgroundJobExecuteSchedulingMode: "disabled",
      backgroundJobRunnerOwnerId: "runner-allowed",
    });
    const enqueueTool = createMemoryBackgroundJobEnqueueTool({ runtime });
    const runNextTool = createMemoryBackgroundJobRunNextTool({ runtime });

    await enqueueTool.execute("call-17080dea", {
      jobClass: "proactive_plan",
      projectId: seeded.projectId,
    });
    const countsBefore = await readTableCounts(dbEnvironment.connectionString);

    const result = await runNextTool.execute("call-17080deb", {
      projectId: seeded.projectId,
      runnerId: "runner-blocked",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "background job runner ownership is not authorized",
    });
    expect(await readTableCounts(dbEnvironment.connectionString)).toEqual(countsBefore);

    const jobRow = await querySingleRow<{ status: string; attempts: string }>(
      dbEnvironment.connectionString,
      `
        select status, attempts::text as attempts
        from memory_middleware.background_jobs
        order by created_at desc, id desc
        limit 1
      `,
      [],
    );
    expect(jobRow).toEqual({ status: "queued", attempts: "0" });
  });

  it("keeps execute-class jobs disabled while advisory scheduling remains enabled", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
      backgroundJobAdvisorySchedulingMode: "candidate-only",
      backgroundJobExecuteSchedulingMode: "disabled",
    });
    const enqueueTool = createMemoryBackgroundJobEnqueueTool({ runtime });
    const countsBefore = await readTableCounts(dbEnvironment.connectionString);

    const result = await enqueueTool.execute("call-17080dec", {
      jobClass: "proactive_execute_run_drift_check",
      projectId: seeded.projectId,
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      jobClass: "proactive_execute_run_drift_check",
      reason: "background job execute-class scheduling is not enabled",
    });
    expect(await readTableCounts(dbEnvironment.connectionString)).toEqual(countsBefore);
  });

  it("keeps consolidation-plan scheduling disabled when advisory scheduling is narrowed to proactive-plan only", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
      backgroundJobAdvisorySchedulingMode: "candidate-only",
      backgroundJobAdvisoryJobClasses: ["proactive_plan"],
      backgroundJobExecuteSchedulingMode: "disabled",
    });
    const enqueueTool = createMemoryBackgroundJobEnqueueTool({ runtime });
    const countsBefore = await readTableCounts(dbEnvironment.connectionString);

    const result = await enqueueTool.execute("call-17080ded", {
      jobClass: "consolidation_plan",
      projectId: seeded.projectId,
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      jobClass: "consolidation_plan",
      reason: "background job advisory class consolidation_plan is not enabled",
    });
    expect(await readTableCounts(dbEnvironment.connectionString)).toEqual(countsBefore);
  });

  it("supports proactive-plan-only advisory scheduling in the install-enabled governance posture", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install",
      queryMode: "read-only",
      backgroundJobInspectionMode: "enabled",
      backgroundJobAdvisorySchedulingMode: "candidate-only",
      backgroundJobAdvisoryJobClasses: ["proactive_plan"],
      backgroundJobExecuteSchedulingMode: "disabled",
      backgroundJobRunnerOwnerId: "rollout-runner-1",
    });
    const retrievalTool = createMemoryObjectListTool({ runtime });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      } as never,
    });
    const enqueueTool = createMemoryBackgroundJobEnqueueTool({ runtime });
    const listTool = createMemoryBackgroundJobListTool({ runtime });
    const getTool = createMemoryBackgroundJobGetTool({ runtime });
    const runNextTool = createMemoryBackgroundJobRunNextTool({ runtime });

    const retrievalResult = await retrievalTool.execute("call-17080dee", {
      scope: "approved_only",
      projectId: seeded.projectId,
      limit: 5,
    });
    expect(retrievalResult.details).toMatchObject({
      accepted: true,
      status: "ok",
    });

    const submitResult = await submitTool.execute("call-17080def", {
      kind: "learning",
      content: "First live automation enablement submit check",
      projectId: seeded.projectId,
    });
    expect(submitResult.details).toMatchObject({
      accepted: true,
      status: "accepted",
      kind: "learning",
    });

    const enqueueResult = await enqueueTool.execute("call-17080deg", {
      jobClass: "proactive_plan",
      projectId: seeded.projectId,
      maxActions: 2,
    });
    expect(enqueueResult.details).toMatchObject({
      accepted: true,
      status: "queued",
      jobClass: "proactive_plan",
    });
    const jobId = (enqueueResult.details as { jobId: string }).jobId;

    const listQueuedResult = await listTool.execute("call-17080deh", {
      projectId: seeded.projectId,
      status: "queued",
      jobClass: "proactive_plan",
    });
    expect(listQueuedResult.details).toMatchObject({
      accepted: true,
      status: "ok",
      jobs: [expect.objectContaining({ jobId, status: "queued" })],
    });

    const blockedRunnerResult = await runNextTool.execute("call-17080dei", {
      projectId: seeded.projectId,
      runnerId: "wrong-runner",
    });
    expect(blockedRunnerResult.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "background job runner ownership is not authorized",
    });

    const runNextResult = await runNextTool.execute("call-17080dej", {
      projectId: seeded.projectId,
      runnerId: "rollout-runner-1",
    });
    expect(runNextResult.details).toMatchObject({
      accepted: true,
      status: "executed",
      jobClass: "proactive_plan",
      jobStatus: "succeeded",
      proactivePlanResult: expect.objectContaining({
        accepted: true,
        advisoryOnly: true,
      }),
    });

    const getResult = await getTool.execute("call-17080dek", {
      jobId,
    });
    expect(getResult.details).toMatchObject({
      accepted: true,
      status: "ok",
      job: expect.objectContaining({
        jobId,
        status: "succeeded",
        metadata: expect.objectContaining({
          lastRun: expect.objectContaining({
            status: "succeeded",
            executionMetadata: expect.objectContaining({
              runnerId: "rollout-runner-1",
              plannerStatus: "ok",
            }),
          }),
        }),
      }),
    });

    const blockedExecuteClass = await enqueueTool.execute("call-17080del", {
      jobClass: "proactive_execute_run_drift_check",
      projectId: seeded.projectId,
    });
    expect(blockedExecuteClass.details).toEqual({
      accepted: false,
      status: "disabled",
      jobClass: "proactive_execute_run_drift_check",
      reason: "background job execute-class scheduling is not enabled",
    });

    const blockedConsolidation = await enqueueTool.execute("call-17080dem", {
      jobClass: "consolidation_plan",
      projectId: seeded.projectId,
    });
    expect(blockedConsolidation.details).toEqual({
      accepted: false,
      status: "disabled",
      jobClass: "consolidation_plan",
      reason: "background job advisory class consolidation_plan is not enabled",
    });

    const disabledRuntime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install",
      queryMode: "read-only",
      backgroundJobInspectionMode: "disabled",
      backgroundJobAdvisorySchedulingMode: "disabled",
      backgroundJobExecuteSchedulingMode: "disabled",
      backgroundJobRunnerOwnerId: "rollout-runner-1",
    });
    const disabledEnqueueTool = createMemoryBackgroundJobEnqueueTool({ runtime: disabledRuntime });
    const disabledListTool = createMemoryBackgroundJobListTool({ runtime: disabledRuntime });

    const disabledEnqueueResult = await disabledEnqueueTool.execute("call-17080den", {
      jobClass: "proactive_plan",
      projectId: seeded.projectId,
    });
    const disabledListResult = await disabledListTool.execute("call-17080deo", {
      projectId: seeded.projectId,
    });
    expect(disabledEnqueueResult.details).toEqual({
      accepted: false,
      status: "disabled",
      jobClass: "proactive_plan",
      reason: "background job scheduling mode is not enabled",
    });
    expect(disabledListResult.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "background job inspection is not enabled",
    });
  });

  it("supports proactive_execute_run_drift_check only in the install-enabled governance posture", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install",
      queryMode: "read-only",
      backgroundJobInspectionMode: "enabled",
      backgroundJobAdvisorySchedulingMode: "candidate-only",
      backgroundJobAdvisoryJobClasses: ["proactive_plan"],
      backgroundJobExecuteSchedulingMode: "candidate-only",
      backgroundJobExecuteJobClasses: ["proactive_execute_run_drift_check"],
      backgroundJobRunnerOwnerId: "rollout-runner-1",
    });
    const retrievalTool = createMemoryObjectListTool({ runtime });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      } as never,
    });
    const enqueueTool = createMemoryBackgroundJobEnqueueTool({ runtime });
    const getTool = createMemoryBackgroundJobGetTool({ runtime });
    const runNextTool = createMemoryBackgroundJobRunNextTool({ runtime });

    expect(
      await retrievalTool.execute("call-17080dep", {
        scope: "approved_only",
        projectId: seeded.projectId,
        limit: 5,
      }),
    ).toMatchObject({
      details: expect.objectContaining({
        accepted: true,
        status: "ok",
      }),
    });
    expect(
      await submitTool.execute("call-17080deq", {
        kind: "learning",
        content: "First live execute-class automation enablement submit check",
        projectId: seeded.projectId,
      }),
    ).toMatchObject({
      details: expect.objectContaining({
        accepted: true,
        status: "accepted",
        kind: "learning",
      }),
    });

    let memoryObjectId = "";
    const client = await connectClient(dbEnvironment.connectionString);
    try {
      const memoryObject = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content,
            metadata
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4, $5::jsonb)
          returning id::text as id
        `,
        [
          seeded.projectId,
          seeded.agentId,
          seeded.sessionId,
          "Install-enabled proactive drift-check target",
          JSON.stringify({ driftCheckDueAt: "2026-03-01T00:00:00.000Z" }),
        ],
      );
      memoryObjectId = memoryObject.rows[0]?.id ?? "";
    } finally {
      await client.end();
    }

    const proactivePlanJob = await enqueueTool.execute("call-17080der", {
      jobClass: "proactive_plan",
      projectId: seeded.projectId,
      maxActions: 2,
    });
    expect(proactivePlanJob.details).toMatchObject({
      accepted: true,
      status: "queued",
      jobClass: "proactive_plan",
    });
    expect(
      await runNextTool.execute("call-17080des", {
        projectId: seeded.projectId,
        runnerId: "rollout-runner-1",
      }),
    ).toMatchObject({
      details: expect.objectContaining({
        accepted: true,
        status: "executed",
        jobClass: "proactive_plan",
        jobStatus: "succeeded",
      }),
    });

    const enqueueResult = await enqueueTool.execute("call-17080det", {
      jobClass: "proactive_execute_run_drift_check",
      projectId: seeded.projectId,
      reviewerAgentId: seeded.agentId,
      affectedIds: [memoryObjectId],
    });
    expect(enqueueResult.details).toMatchObject({
      accepted: true,
      status: "queued",
      jobClass: "proactive_execute_run_drift_check",
    });
    const jobId = (enqueueResult.details as { jobId: string }).jobId;

    const blockedRunnerResult = await runNextTool.execute("call-17080deu", {
      projectId: seeded.projectId,
      runnerId: "wrong-runner",
    });
    expect(blockedRunnerResult.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "background job runner ownership is not authorized",
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const runNextResult = await runNextTool.execute("call-17080dev", {
      projectId: seeded.projectId,
      runnerId: "rollout-runner-1",
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    expect(runNextResult.details).toMatchObject({
      accepted: true,
      status: "executed",
      jobClass: "proactive_execute_run_drift_check",
      jobStatus: "succeeded",
      proactiveExecuteResult: expect.objectContaining({
        accepted: true,
        status: "executed",
        actionType: "run_drift_check",
        affectedIds: [memoryObjectId],
      }),
    });
    expect(countsAfter).toEqual({
      ...countsBefore,
      memory_events: String(Number.parseInt(countsBefore.memory_events, 10) + 1),
    });

    const getResult = await getTool.execute("call-17080dew", {
      jobId,
    });
    expect(getResult.details).toMatchObject({
      accepted: true,
      status: "ok",
      job: expect.objectContaining({
        jobId,
        status: "succeeded",
        metadata: expect.objectContaining({
          lastRun: expect.objectContaining({
            status: "succeeded",
            executionMetadata: expect.objectContaining({
              runnerId: "rollout-runner-1",
              executeStatus: "executed",
              affectedIds: [memoryObjectId],
            }),
          }),
        }),
      }),
    });

    const repeatEnqueueResult = await enqueueTool.execute("call-17080dex", {
      jobClass: "proactive_execute_run_drift_check",
      projectId: seeded.projectId,
      reviewerAgentId: seeded.agentId,
      affectedIds: [memoryObjectId],
    });
    expect(repeatEnqueueResult.details).toMatchObject({
      accepted: true,
      status: "queued",
      jobClass: "proactive_execute_run_drift_check",
    });

    const repeatCountsBefore = await readTableCounts(dbEnvironment.connectionString);
    const repeatRunResult = await runNextTool.execute("call-17080dey", {
      projectId: seeded.projectId,
      runnerId: "rollout-runner-1",
    });
    const repeatCountsAfter = await readTableCounts(dbEnvironment.connectionString);
    expect(repeatRunResult.details).toMatchObject({
      accepted: true,
      status: "executed",
      jobClass: "proactive_execute_run_drift_check",
      jobStatus: "succeeded",
      proactiveExecuteResult: expect.objectContaining({
        accepted: true,
        status: "already_executed",
        actionType: "run_drift_check",
        affectedIds: [memoryObjectId],
      }),
    });
    expect(repeatCountsAfter).toEqual(repeatCountsBefore);

    const blockedConsolidationPlan = await enqueueTool.execute("call-17080dez", {
      jobClass: "consolidation_plan",
      projectId: seeded.projectId,
    });
    expect(blockedConsolidationPlan.details).toEqual({
      accepted: false,
      status: "disabled",
      jobClass: "consolidation_plan",
      reason: "background job advisory class consolidation_plan is not enabled",
    });

    const blockedConsolidationExecute = await enqueueTool.execute("call-17080dfa", {
      jobClass: "consolidation_execute",
      projectId: seeded.projectId,
    });
    expect(blockedConsolidationExecute.details).toEqual({
      accepted: false,
      status: "disabled",
      jobClass: "consolidation_execute",
      reason: "background job execute-class consolidation_execute is not enabled",
    });

    const disabledRuntime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install",
      queryMode: "read-only",
      backgroundJobInspectionMode: "enabled",
      backgroundJobAdvisorySchedulingMode: "candidate-only",
      backgroundJobAdvisoryJobClasses: ["proactive_plan"],
      backgroundJobExecuteSchedulingMode: "disabled",
      backgroundJobExecuteJobClasses: ["proactive_execute_run_drift_check"],
      backgroundJobRunnerOwnerId: "rollout-runner-1",
    });
    const disabledEnqueueTool = createMemoryBackgroundJobEnqueueTool({ runtime: disabledRuntime });

    const disabledExecuteResult = await disabledEnqueueTool.execute("call-17080dfb", {
      jobClass: "proactive_execute_run_drift_check",
      projectId: seeded.projectId,
    });
    expect(disabledExecuteResult.details).toEqual({
      accepted: false,
      status: "disabled",
      jobClass: "proactive_execute_run_drift_check",
      reason: "background job execute-class scheduling is not enabled",
    });
  });

  it("supports consolidation_plan advisory scheduling in the install-enabled governance posture while consolidation_execute stays disabled", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install",
      queryMode: "read-only",
      backgroundJobInspectionMode: "enabled",
      backgroundJobAdvisorySchedulingMode: "candidate-only",
      backgroundJobAdvisoryJobClasses: ["consolidation_plan", "proactive_plan"],
      backgroundJobExecuteSchedulingMode: "candidate-only",
      backgroundJobExecuteJobClasses: ["proactive_execute_run_drift_check"],
      backgroundJobRunnerOwnerId: "rollout-runner-1",
    });
    const retrievalTool = createMemoryObjectListTool({ runtime });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      } as never,
    });
    const enqueueTool = createMemoryBackgroundJobEnqueueTool({ runtime });
    const listTool = createMemoryBackgroundJobListTool({ runtime });
    const getTool = createMemoryBackgroundJobGetTool({ runtime });
    const runNextTool = createMemoryBackgroundJobRunNextTool({ runtime });

    expect(
      await retrievalTool.execute("call-17080dfc", {
        scope: "approved_only",
        projectId: seeded.projectId,
        limit: 5,
      }),
    ).toMatchObject({
      details: expect.objectContaining({
        accepted: true,
        status: "ok",
      }),
    });
    expect(
      await submitTool.execute("call-17080dfd", {
        kind: "learning",
        content: "Live advisory consolidation scheduling bounded submit check",
        projectId: seeded.projectId,
      }),
    ).toMatchObject({
      details: expect.objectContaining({
        accepted: true,
        status: "accepted",
        kind: "learning",
      }),
    });

    let firstId = "";
    let secondId = "";
    const client = await connectClient(dbEnvironment.connectionString);
    try {
      const first = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4)
          returning id::text as id
        `,
        [
          seeded.projectId,
          seeded.agentId,
          seeded.sessionId,
          "Install-enabled consolidation duplicate insight",
        ],
      );
      const second = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4)
          returning id::text as id
        `,
        [
          seeded.projectId,
          seeded.agentId,
          seeded.sessionId,
          "Install-enabled consolidation duplicate insight",
        ],
      );
      firstId = first.rows[0]?.id ?? "";
      secondId = second.rows[0]?.id ?? "";
    } finally {
      await client.end();
    }

    expect(
      await enqueueTool.execute("call-17080dfe", {
        jobClass: "proactive_plan",
        projectId: seeded.projectId,
        maxActions: 2,
      }),
    ).toMatchObject({
      details: expect.objectContaining({
        accepted: true,
        status: "queued",
        jobClass: "proactive_plan",
      }),
    });
    expect(
      await runNextTool.execute("call-17080dff", {
        projectId: seeded.projectId,
        runnerId: "rollout-runner-1",
      }),
    ).toMatchObject({
      details: expect.objectContaining({
        accepted: true,
        status: "executed",
        jobClass: "proactive_plan",
        jobStatus: "succeeded",
      }),
    });

    const enqueueResult = await enqueueTool.execute("call-17080dfg", {
      jobClass: "consolidation_plan",
      projectId: seeded.projectId,
      includeValidatedProcedures: false,
      maxFindings: 5,
    });
    expect(enqueueResult.details).toMatchObject({
      accepted: true,
      status: "queued",
      jobClass: "consolidation_plan",
    });
    const jobId = (enqueueResult.details as { jobId: string }).jobId;

    expect(
      await listTool.execute("call-17080dfh", {
        projectId: seeded.projectId,
        status: "queued",
        jobClass: "consolidation_plan",
      }),
    ).toMatchObject({
      details: expect.objectContaining({
        accepted: true,
        status: "ok",
        jobs: [expect.objectContaining({ jobId, status: "queued" })],
      }),
    });

    const blockedRunnerResult = await runNextTool.execute("call-17080dfi", {
      projectId: seeded.projectId,
      runnerId: "wrong-runner",
    });
    expect(blockedRunnerResult.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "background job runner ownership is not authorized",
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const runNextResult = await runNextTool.execute("call-17080dfj", {
      projectId: seeded.projectId,
      runnerId: "rollout-runner-1",
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    expect(runNextResult.details).toMatchObject({
      accepted: true,
      status: "executed",
      jobClass: "consolidation_plan",
      jobStatus: "succeeded",
      consolidationPlanResult: expect.objectContaining({
        accepted: true,
        status: "ok",
        outcome: "review_needed",
        includeValidatedProcedures: false,
        findings: [
          expect.objectContaining({
            actionType: "duplicate_merge_review",
            affectedObjectIds: [firstId, secondId].sort(),
          }),
        ],
      }),
    });
    expect(countsAfter).toEqual(countsBefore);

    const getResult = await getTool.execute("call-17080dfk", {
      jobId,
    });
    expect(getResult.details).toMatchObject({
      accepted: true,
      status: "ok",
      job: expect.objectContaining({
        jobId,
        status: "succeeded",
        metadata: expect.objectContaining({
          lastRun: expect.objectContaining({
            status: "succeeded",
            executionMetadata: expect.objectContaining({
              runnerId: "rollout-runner-1",
              plannerStatus: "ok",
              plannerOutcome: "review_needed",
            }),
          }),
        }),
      }),
    });

    const blockedConsolidationExecute = await enqueueTool.execute("call-17080dfl", {
      jobClass: "consolidation_execute",
      projectId: seeded.projectId,
      approvedFindings: [
        {
          actionType: "duplicate_merge_review",
          affectedObjectIds: [firstId, secondId].sort(),
        },
      ],
    });
    expect(blockedConsolidationExecute.details).toEqual({
      accepted: false,
      status: "disabled",
      jobClass: "consolidation_execute",
      reason: "background job execute-class consolidation_execute is not enabled",
    });

    const disabledRuntime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install",
      queryMode: "read-only",
      backgroundJobInspectionMode: "enabled",
      backgroundJobAdvisorySchedulingMode: "candidate-only",
      backgroundJobAdvisoryJobClasses: ["proactive_plan"],
      backgroundJobExecuteSchedulingMode: "candidate-only",
      backgroundJobExecuteJobClasses: ["proactive_execute_run_drift_check"],
      backgroundJobRunnerOwnerId: "rollout-runner-1",
    });
    const disabledEnqueueTool = createMemoryBackgroundJobEnqueueTool({ runtime: disabledRuntime });

    const disabledConsolidationResult = await disabledEnqueueTool.execute("call-17080dfm", {
      jobClass: "consolidation_plan",
      projectId: seeded.projectId,
    });
    expect(disabledConsolidationResult.details).toEqual({
      accepted: false,
      status: "disabled",
      jobClass: "consolidation_plan",
      reason: "background job advisory class consolidation_plan is not enabled",
    });
  });

  it("supports low-risk consolidation_execute scheduling in the install-enabled governance posture while unsafe consolidation actions stay blocked", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install",
      queryMode: "read-only",
      backgroundJobInspectionMode: "enabled",
      backgroundJobAdvisorySchedulingMode: "candidate-only",
      backgroundJobAdvisoryJobClasses: ["consolidation_plan", "proactive_plan"],
      backgroundJobExecuteSchedulingMode: "candidate-only",
      backgroundJobExecuteJobClasses: [
        "consolidation_execute",
        "proactive_execute_run_drift_check",
      ],
      backgroundJobRunnerOwnerId: "rollout-runner-1",
    });
    const retrievalTool = createMemoryObjectListTool({ runtime });
    const submitTool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: seeded.sessionId,
        agentId: seeded.agentId,
      } as never,
    });
    const enqueueTool = createMemoryBackgroundJobEnqueueTool({ runtime });
    const getTool = createMemoryBackgroundJobGetTool({ runtime });
    const runNextTool = createMemoryBackgroundJobRunNextTool({ runtime });

    expect(
      await retrievalTool.execute("call-17080dfn", {
        scope: "approved_only",
        projectId: seeded.projectId,
        limit: 5,
      }),
    ).toMatchObject({
      details: expect.objectContaining({
        accepted: true,
        status: "ok",
      }),
    });
    expect(
      await submitTool.execute("call-17080dfo", {
        kind: "learning",
        content: "Live consolidation execute rollout bounded submit check",
        projectId: seeded.projectId,
      }),
    ).toMatchObject({
      details: expect.objectContaining({
        accepted: true,
        status: "accepted",
        kind: "learning",
      }),
    });

    let firstId = "";
    let secondId = "";
    const client = await connectClient(dbEnvironment.connectionString);
    try {
      const first = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4)
          returning id::text as id
        `,
        [
          seeded.projectId,
          seeded.agentId,
          seeded.sessionId,
          "Install-enabled scheduled duplicate insight",
        ],
      );
      const second = await client.query<{ id: string }>(
        `
          insert into memory_middleware.memory_objects (
            project_id,
            agent_id,
            session_id,
            memory_kind,
            review_state,
            content
          )
          values ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4)
          returning id::text as id
        `,
        [
          seeded.projectId,
          seeded.agentId,
          seeded.sessionId,
          "Install-enabled scheduled duplicate insight",
        ],
      );
      firstId = first.rows[0]?.id ?? "";
      secondId = second.rows[0]?.id ?? "";
    } finally {
      await client.end();
    }

    expect(
      await enqueueTool.execute("call-17080dfp", {
        jobClass: "proactive_plan",
        projectId: seeded.projectId,
        maxActions: 2,
      }),
    ).toMatchObject({
      details: expect.objectContaining({
        accepted: true,
        status: "queued",
        jobClass: "proactive_plan",
      }),
    });
    expect(
      await runNextTool.execute("call-17080dfq", {
        projectId: seeded.projectId,
        runnerId: "rollout-runner-1",
      }),
    ).toMatchObject({
      details: expect.objectContaining({
        accepted: true,
        status: "executed",
        jobClass: "proactive_plan",
        jobStatus: "succeeded",
      }),
    });

    const enqueueResult = await enqueueTool.execute("call-17080dfr", {
      jobClass: "consolidation_execute",
      projectId: seeded.projectId,
      reviewerAgentId: seeded.agentId,
      approvedFindings: [
        {
          actionType: "duplicate_merge_review",
          affectedObjectIds: [firstId, secondId],
        },
      ],
    });
    expect(enqueueResult.details).toMatchObject({
      accepted: true,
      status: "queued",
      jobClass: "consolidation_execute",
    });
    const jobId = (enqueueResult.details as { jobId: string }).jobId;

    const blockedRunnerResult = await runNextTool.execute("call-17080dfs", {
      projectId: seeded.projectId,
      runnerId: "wrong-runner",
    });
    expect(blockedRunnerResult.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "background job runner ownership is not authorized",
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const runNextResult = await runNextTool.execute("call-17080dft", {
      projectId: seeded.projectId,
      runnerId: "rollout-runner-1",
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    expect(runNextResult.details).toMatchObject({
      accepted: true,
      status: "executed",
      jobClass: "consolidation_execute",
      jobStatus: "succeeded",
      consolidationExecuteResult: expect.objectContaining({
        accepted: true,
        status: "executed",
        executionMode: "approved_subset",
        reviewedFindingCount: 1,
        executedActionCount: 1,
        actions: [
          expect.objectContaining({
            actionType: "duplicate_merge_review",
            status: "executed",
            affectedObjectIds: [firstId, secondId].sort(),
          }),
        ],
      }),
    });
    expect(countsAfter).toEqual({
      ...countsBefore,
      memory_reviews: String(Number.parseInt(countsBefore.memory_reviews, 10) + 1),
      memory_links: String(Number.parseInt(countsBefore.memory_links, 10) + 1),
    });

    const getResult = await getTool.execute("call-17080dfu", {
      jobId,
    });
    expect(getResult.details).toMatchObject({
      accepted: true,
      status: "ok",
      job: expect.objectContaining({
        jobId,
        status: "succeeded",
        metadata: expect.objectContaining({
          lastRun: expect.objectContaining({
            status: "succeeded",
            executionMetadata: expect.objectContaining({
              runnerId: "rollout-runner-1",
              executeStatus: "executed",
              actionTypes: ["duplicate_merge_review"],
            }),
          }),
        }),
      }),
    });

    const disabledRuntime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install",
      queryMode: "read-only",
      backgroundJobInspectionMode: "enabled",
      backgroundJobAdvisorySchedulingMode: "candidate-only",
      backgroundJobAdvisoryJobClasses: ["consolidation_plan", "proactive_plan"],
      backgroundJobExecuteSchedulingMode: "candidate-only",
      backgroundJobExecuteJobClasses: ["proactive_execute_run_drift_check"],
      backgroundJobRunnerOwnerId: "rollout-runner-1",
    });
    const disabledEnqueueTool = createMemoryBackgroundJobEnqueueTool({ runtime: disabledRuntime });

    const disabledConsolidationExecute = await disabledEnqueueTool.execute("call-17080dfv", {
      jobClass: "consolidation_execute",
      projectId: seeded.projectId,
      approvedFindings: [
        {
          actionType: "duplicate_merge_review",
          affectedObjectIds: [firstId, secondId],
        },
      ],
    });
    expect(disabledConsolidationExecute.details).toEqual({
      accepted: false,
      status: "disabled",
      jobClass: "consolidation_execute",
      reason: "background job execute-class consolidation_execute is not enabled",
    });
  });

  it("leaves already-running jobs alone and reports no_job for lock-safe run-next behavior", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const runNextTool = createMemoryBackgroundJobRunNextTool({ runtime });
    const client = await connectClient(dbEnvironment.connectionString);
    try {
      await client.query(
        `
          insert into memory_middleware.background_jobs (
            project_id,
            session_id,
            agent_id,
            job_kind,
            status,
            payload,
            run_after,
            attempts,
            max_attempts,
            metadata,
            started_at
          )
          values (
            $1::uuid,
            $2::uuid,
            $3::uuid,
            'maintenance',
            'running',
            $4::jsonb,
            now(),
            1,
            3,
            $5::jsonb,
            now()
          )
        `,
        [
          seeded.projectId,
          seeded.sessionId,
          seeded.agentId,
          JSON.stringify({ jobClass: "proactive_plan", projectId: seeded.projectId }),
          JSON.stringify({ payloadFingerprint: "already-running-1" }),
        ],
      );
    } finally {
      await client.end();
    }

    const result = await runNextTool.execute("call-17080dd", {
      projectId: seeded.projectId,
    });

    expect(result.details).toEqual({
      accepted: true,
      status: "no_job",
      rationale: ["no queued bounded background job is currently ready to run"],
    });
  });

  it("returns disabled for background-job scheduling before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const enqueueTool = createMemoryBackgroundJobEnqueueTool({ runtime });
    const runNextTool = createMemoryBackgroundJobRunNextTool({ runtime });

    const enqueueResult = await enqueueTool.execute("call-17080de", {
      jobClass: "proactive_plan",
    });
    const runNextResult = await runNextTool.execute("call-17080df", {});

    expect(enqueueResult.details).toEqual({
      accepted: false,
      status: "disabled",
      jobClass: "proactive_plan",
      reason: "background job scheduling mode is not enabled",
    });
    expect(runNextResult.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "background job scheduling mode is not enabled",
    });
  });

  it("returns not_configured for background-job enqueue or run-next when the database URL is absent", async () => {
    const runtime = createRuntime({
      connectionString: "",
      mode: "candidate-only",
    });
    const enqueueTool = createMemoryBackgroundJobEnqueueTool({ runtime });
    const runNextTool = createMemoryBackgroundJobRunNextTool({ runtime });

    const enqueueResult = await enqueueTool.execute("call-17080dg", {
      jobClass: "proactive_plan",
    });
    const runNextResult = await runNextTool.execute("call-17080dh", {});

    expect(enqueueResult.details).toEqual({
      accepted: false,
      status: "not_configured",
      jobClass: "proactive_plan",
      reason: "memory middleware database URL is not configured",
    });
    expect(runNextResult.details).toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });
  });

  it("fails cleanly for background-job enqueue or run-next when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const enqueueTool = createMemoryBackgroundJobEnqueueTool({ runtime });
    const runNextTool = createMemoryBackgroundJobRunNextTool({ runtime });

    const enqueueResult = await enqueueTool.execute("call-17080di", {
      jobClass: "proactive_plan",
    });
    const runNextResult = await runNextTool.execute("call-17080dj", {});

    expect(enqueueResult.details).toMatchObject({
      accepted: false,
      status: "failed",
      jobClass: "proactive_plan",
    });
    expect((enqueueResult.details as { reason: string }).reason).toContain(
      "database is unavailable",
    );
    expect(runNextResult.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((runNextResult.details as { reason: string }).reason).toContain(
      "database is unavailable",
    );
  });

  it("returns disabled for proactive planning before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const proactivePlanTool = createMemoryProactivePlanTool({ runtime });

    const result = await proactivePlanTool.execute("call-17080ci", {
      maxActions: 3,
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "proactive planning mode is not enabled",
    });
  });

  it("returns disabled for proactive execution before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const proactiveExecuteTool = createMemoryProactiveExecuteTool({ runtime });

    const result = await proactiveExecuteTool.execute("call-17080cq", {
      actionType: "run_drift_check",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      actionType: "run_drift_check",
      reason: "proactive execution mode is not enabled",
    });
  });

  it("returns not_configured for proactive planning when the database URL is absent", async () => {
    const runtime = createRuntime({
      connectionString: "",
      mode: "candidate-only",
    });
    const proactivePlanTool = createMemoryProactivePlanTool({ runtime });

    const result = await proactivePlanTool.execute("call-17080cj", {
      maxActions: 2,
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });
  });

  it("returns not_configured for proactive execution when the database URL is absent", async () => {
    const runtime = createRuntime({
      connectionString: "",
      mode: "candidate-only",
    });
    const proactiveExecuteTool = createMemoryProactiveExecuteTool({ runtime });

    const result = await proactiveExecuteTool.execute("call-17080cr", {
      actionType: "run_drift_check",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "not_configured",
      actionType: "run_drift_check",
      reason: "memory middleware database URL is not configured",
    });
  });

  it("fails cleanly for proactive planning when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const proactivePlanTool = createMemoryProactivePlanTool({ runtime });

    const result = await proactivePlanTool.execute("call-17080ck", {
      maxActions: 2,
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("fails cleanly for proactive execution when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const proactiveExecuteTool = createMemoryProactiveExecuteTool({ runtime });

    const result = await proactiveExecuteTool.execute("call-17080cs", {
      actionType: "run_drift_check",
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
      actionType: "run_drift_check",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("returns disabled for consolidation planning before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const planTool = createMemoryConsolidationPlanTool({ runtime });

    const result = await planTool.execute("call-17079ty", {
      includeValidatedProcedures: true,
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "consolidation planning mode is not enabled",
    });
  });

  it("returns disabled for consolidation execution before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const executeTool = createMemoryConsolidationExecuteTool({ runtime });

    const result = await executeTool.execute("call-17080ae", {
      approvedFindings: [
        {
          actionType: "duplicate_merge_review",
          affectedObjectIds: ["memory-1", "memory-2"],
        },
      ],
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "consolidation execution mode is not enabled",
    });
  });

  it("returns disabled for drift-check execution before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const executeTool = createMemoryDriftCheckExecuteTool({ runtime });

    const result = await executeTool.execute("call-17080bd", {
      approvedFindings: [
        {
          actionType: "drift_check_review",
          affectedObjectIds: ["memory-1"],
        },
      ],
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "drift-check execution mode is not enabled",
    });
  });

  it("fails cleanly for consolidation planning when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const planTool = createMemoryConsolidationPlanTool({ runtime });

    const result = await planTool.execute("call-17079tz", {
      includeValidatedProcedures: true,
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("fails cleanly for consolidation execution when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const executeTool = createMemoryConsolidationExecuteTool({ runtime });

    const result = await executeTool.execute("call-17080af", {
      approvedFindings: [
        {
          actionType: "duplicate_merge_review",
          affectedObjectIds: [
            "00000000-0000-0000-0000-000000000021",
            "00000000-0000-0000-0000-000000000022",
          ],
        },
      ],
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("fails cleanly for drift-check execution when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const executeTool = createMemoryDriftCheckExecuteTool({ runtime });

    const result = await executeTool.execute("call-17080be", {
      approvedFindings: [
        {
          actionType: "drift_check_review",
          affectedObjectIds: ["00000000-0000-0000-0000-000000000031"],
        },
      ],
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("returns disabled for candidate promotion planning before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const planTool = createCandidatePromotePlanTool({ runtime });

    const result = await planTool.execute("call-17", {
      candidateId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "candidate promotion planning mode is not enabled",
    });
  });

  it("fails cleanly for candidate promotion planning when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const planTool = createCandidatePromotePlanTool({ runtime });

    const result = await planTool.execute("call-18", {
      candidateId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("returns disabled for candidate memory promotion before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const promoteTool = createCandidatePromoteMemoryTool({ runtime });

    const result = await promoteTool.execute("call-19", {
      candidateId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "candidate memory promotion mode is not enabled",
    });
  });

  it("fails cleanly for candidate memory promotion when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const promoteTool = createCandidatePromoteMemoryTool({ runtime });

    const result = await promoteTool.execute("call-20", {
      candidateId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("returns disabled for candidate procedure promotion before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });

    const result = await promoteTool.execute("call-21", {
      candidateId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "candidate procedure promotion mode is not enabled",
    });
  });

  it("fails cleanly for candidate procedure promotion when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const promoteTool = createCandidatePromoteProcedureTool({ runtime });

    const result = await promoteTool.execute("call-22", {
      candidateId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("returns disabled for procedure validation planning before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const validatePlanTool = createProcedureValidatePlanTool({ runtime });

    const result = await validatePlanTool.execute("call-23", {
      procedureId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "procedure validation planning mode is not enabled",
    });
  });

  it("fails cleanly for procedure validation planning when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const validatePlanTool = createProcedureValidatePlanTool({ runtime });

    const result = await validatePlanTool.execute("call-24", {
      procedureId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("returns disabled for procedure validation before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const validateTool = createProcedureValidateTool({ runtime });

    const result = await validateTool.execute("call-25", {
      procedureId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "procedure validation mode is not enabled",
    });
  });

  it("fails cleanly for procedure validation when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const validateTool = createProcedureValidateTool({ runtime });

    const result = await validateTool.execute("call-26", {
      procedureId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("returns disabled for skill-candidate planning before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const planTool = createSkillCandidatePlanTool({ runtime });

    const result = await planTool.execute("call-27", {
      procedureId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate planning mode is not enabled",
    });
  });

  it("fails cleanly for skill-candidate planning when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const planTool = createSkillCandidatePlanTool({ runtime });

    const result = await planTool.execute("call-28", {
      procedureId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("returns disabled for skill-candidate creation before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const createTool = createSkillCandidateCreateTool({ runtime });

    const result = await createTool.execute("call-29", {
      procedureId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate creation mode is not enabled",
    });
  });

  it("fails cleanly for skill-candidate creation when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const createTool = createSkillCandidateCreateTool({ runtime });

    const result = await createTool.execute("call-30", {
      procedureId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("returns disabled for skill-candidate procurement planning before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const planTool = createSkillCandidateProcurementPlanTool({ runtime });

    const result = await planTool.execute("call-31", {
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate procurement planning mode is not enabled",
    });
  });

  it("fails cleanly for skill-candidate procurement planning when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const planTool = createSkillCandidateProcurementPlanTool({ runtime });

    const result = await planTool.execute("call-32", {
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("returns disabled for skill-candidate procurement-record creation before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const createTool = createSkillCandidateProcurementRecordCreateTool({ runtime });

    const result = await createTool.execute("call-33", {
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate procurement record mode is not enabled",
    });
  });

  it("fails cleanly for skill-candidate procurement-record creation when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const createTool = createSkillCandidateProcurementRecordCreateTool({ runtime });

    const result = await createTool.execute("call-34", {
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("returns disabled for skill-candidate Skill Vetter handoff planning before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const handoffTool = createSkillCandidateSkillVetterHandoffTool({ runtime });

    const result = await handoffTool.execute("call-35", {
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate Skill Vetter handoff mode is not enabled",
    });
  });

  it("fails cleanly for skill-candidate Skill Vetter handoff planning when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const handoffTool = createSkillCandidateSkillVetterHandoffTool({ runtime });

    const result = await handoffTool.execute("call-36", {
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("returns disabled for skill-candidate vetting-result creation before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const createTool = createSkillCandidateVettingResultRecordTool({ runtime });

    const result = await createTool.execute("call-37", {
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
      decision: "defer",
      permissionsRisk: {
        level: "low",
        notes: ["none"],
        requiredChecks: ["manual review still required"],
      },
      suspiciousPatterns: {
        redFlags: [],
        unresolvedQuestions: ["confirm packaged entrypoint"],
      },
      operationalFit: {
        fit: "good",
        notes: ["roadmap-aligned"],
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
      },
      approvalRecommendation: {
        proposedLifecycleState: "under_review",
        installRecommendation: "do_not_install",
        blockers: ["manual review still open"],
      },
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate vetting-result mode is not enabled",
    });
  });

  it("fails cleanly for skill-candidate vetting-result creation when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const createTool = createSkillCandidateVettingResultRecordTool({ runtime });

    const result = await createTool.execute("call-38", {
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
      decision: "defer",
      permissionsRisk: {
        level: "low",
        notes: ["none"],
        requiredChecks: ["manual review still required"],
      },
      suspiciousPatterns: {
        redFlags: [],
        unresolvedQuestions: ["confirm packaged entrypoint"],
      },
      operationalFit: {
        fit: "good",
        notes: ["roadmap-aligned"],
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
      },
      approvalRecommendation: {
        proposedLifecycleState: "under_review",
        installRecommendation: "do_not_install",
        blockers: ["manual review still open"],
      },
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("returns disabled for skill-candidate approval planning before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const approvalPlanTool = createSkillCandidateApprovalPlanTool({ runtime });

    const result = await approvalPlanTool.execute("call-39", {
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate approval planning mode is not enabled",
    });
  });

  it("fails cleanly for skill-candidate approval planning when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const approvalPlanTool = createSkillCandidateApprovalPlanTool({ runtime });

    const result = await approvalPlanTool.execute("call-40", {
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("returns disabled for skill-candidate approval writes before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const approveTool = createSkillCandidateApproveTool({ runtime });

    const result = await approveTool.execute("call-41", {
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
      scope: "limited",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate approval mode is not enabled",
    });
  });

  it("fails cleanly for skill-candidate approval writes when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const approveTool = createSkillCandidateApproveTool({ runtime });

    const result = await approveTool.execute("call-42", {
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
      scope: "limited",
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("returns disabled for skill-candidate install handoff planning before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const installHandoffTool = createSkillCandidateInstallHandoffTool({ runtime });

    const result = await installHandoffTool.execute("call-43", {
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate install handoff mode is not enabled",
    });
  });

  it("fails cleanly for skill-candidate install handoff planning when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const installHandoffTool = createSkillCandidateInstallHandoffTool({ runtime });

    const result = await installHandoffTool.execute("call-44", {
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("returns disabled for skill-candidate install-record creation before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const installRecordTool = createSkillCandidateInstallRecordCreateTool({ runtime });

    const result = await installRecordTool.execute("call-45", {
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate install record mode is not enabled",
    });
  });

  it("fails cleanly for skill-candidate install-record creation when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const installRecordTool = createSkillCandidateInstallRecordCreateTool({ runtime });

    const result = await installRecordTool.execute("call-46", {
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.details).toMatchObject({
      accepted: false,
      status: "failed",
    });
    expect((result.details as { reason: string }).reason).toContain("database is unavailable");
  });

  it("retrieves approved bounded memory objects without write side effects by default", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({ runtime });
    const reviewTool = createCandidateReviewTool({ runtime });
    const promoteMemoryTool = createCandidatePromoteMemoryTool({ runtime });
    const listTool = createMemoryObjectListTool({ runtime });
    const getTool = createMemoryObjectGetTool({ runtime });
    const searchTool = createMemoryObjectSearchBasicTool({ runtime });

    const submission = await submitTool.execute("call-45", {
      kind: "learning" satisfies CandidateSubmissionKind,
      content: "Bounded approved memory for retrieval.",
      projectId: seeded.projectId,
      agentId: seeded.agentId,
      sessionId: seeded.sessionId,
    });
    const candidateId = (submission.details as { memoryObjectId: string }).memoryObjectId;

    await reviewTool.execute("call-46", {
      candidateId,
      outcome: "accepted",
    });

    const promotion = await promoteMemoryTool.execute("call-47", {
      candidateId,
    });
    const promotedMemoryObjectId = (promotion.details as { promotedMemoryObjectId: string })
      .promotedMemoryObjectId;
    const approvedViewClient = await connectClient(dbEnvironment.connectionString);
    const approvedViewRow = await approvedViewClient.query<{
      approved_view_rows: string;
      source_event_name: string | null;
    }>(
      `
        select
          count(*)::text as approved_view_rows,
          max(source_event_name)::text as source_event_name
        from memory_middleware.internal_approved_memory_v
        where id = $1::uuid
      `,
      [promotedMemoryObjectId],
    );
    await approvedViewClient.end();

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);

    const listResult = await listTool.execute("call-48", {
      scope: "approved_only",
      projectId: seeded.projectId,
    });
    const getResult = await getTool.execute("call-49", {
      objectId: promotedMemoryObjectId,
    });
    const searchResult = await searchTool.execute("call-50", {
      query: "bounded retrieval",
      scope: "approved_only",
    });

    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(countsAfter).toEqual(countsBefore);
    expect(approvedViewRow.rows[0]).toEqual({
      approved_view_rows: "1",
      source_event_name: "candidate_submission.learning",
    });
    expect(listResult.details).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      records: [
        expect.objectContaining({
          objectType: "memory_object",
          readSurface: "approved_memory_view",
          id: promotedMemoryObjectId,
          reviewState: "approved",
        }),
      ],
    });
    expect(getResult.details).toMatchObject({
      accepted: true,
      status: "ok",
      record: expect.objectContaining({
        objectType: "memory_object",
        readSurface: "approved_memory_view",
        id: promotedMemoryObjectId,
        reviewState: "approved",
        content: "Bounded approved memory for retrieval.",
      }),
    });
    expect(searchResult.details).toMatchObject({
      accepted: true,
      status: "ok",
      query: "bounded retrieval",
      records: [
        expect.objectContaining({
          objectType: "memory_object",
          readSurface: "approved_memory_view",
          id: promotedMemoryObjectId,
        }),
      ],
    });
  });

  it("supports read-only retrieval when query mode is enabled while write paths stay disabled", async () => {
    const fixture = await seedReadOnlyRetrievalFixture(dbEnvironment.connectionString);
    const countsBeforeRuntime = await readTableCounts(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
      queryMode: "read-only",
    });
    const countsAfterRuntime = await readTableCounts(dbEnvironment.connectionString);
    expect(countsAfterRuntime).toEqual(countsBeforeRuntime);

    const approvedList = await runtime.memoryObjectQuery.list({
      scope: "approved_only",
      projectId: fixture.projectId,
    });
    const approvedGet = await runtime.memoryObjectQuery.get({
      objectId: fixture.approvedMemoryId,
    });
    const basicSearch = await runtime.memoryObjectQuery.searchBasic({
      query: "passive rollout memory",
      scope: "approved_only",
      projectId: fixture.projectId,
    });
    const hybridSearch = await runtime.memoryObjectQuery.searchHybrid({
      query: "validated procedure",
      scope: "include_validated_procedures",
      projectId: fixture.projectId,
    });
    const hiddenCandidate = await runtime.memoryObjectQuery.get({
      objectId: fixture.candidateMemoryId,
    });
    const visibleCandidate = await runtime.memoryObjectQuery.get({
      objectId: fixture.candidateMemoryId,
      scope: "include_candidates",
    });
    const hiddenProcedure = await runtime.memoryObjectQuery.get({
      objectId: fixture.validatedProcedureId,
    });
    const visibleProcedure = await runtime.memoryObjectQuery.get({
      objectId: fixture.validatedProcedureId,
      scope: "include_validated_procedures",
    });

    const countsBeforeDisabledWrite = await readTableCounts(dbEnvironment.connectionString);
    const disabledWrite = await runtime.candidateIngress.submitLearning({
      content: "disabled write attempt should not persist",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
    });
    const countsAfterDisabledWrite = await readTableCounts(dbEnvironment.connectionString);

    expect(approvedList).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      records: [
        expect.objectContaining({
          objectType: "memory_object",
          readSurface: "approved_memory_view",
          id: fixture.approvedMemoryId,
          reviewState: "approved",
        }),
      ],
    });
    expect(approvedGet).toMatchObject({
      accepted: true,
      status: "ok",
      record: expect.objectContaining({
        objectType: "memory_object",
        readSurface: "approved_memory_view",
        id: fixture.approvedMemoryId,
        content: "Approved passive rollout memory for read-only retrieval.",
      }),
    });
    expect(basicSearch).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      records: [
        expect.objectContaining({
          objectType: "memory_object",
          readSurface: "approved_memory_view",
          id: fixture.approvedMemoryId,
        }),
      ],
    });
    expect(hybridSearch).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "include_validated_procedures",
      records: [
        expect.objectContaining({
          objectType: "procedure",
          readSurface: "validated_procedure_read_model",
          id: fixture.validatedProcedureId,
        }),
      ],
    });
    expect(hiddenCandidate).toMatchObject({
      accepted: false,
      status: "not_found",
    });
    expect(visibleCandidate).toMatchObject({
      accepted: true,
      status: "ok",
      record: expect.objectContaining({
        objectType: "memory_object",
        readSurface: "reviewable_candidates_view",
        id: fixture.candidateMemoryId,
        reviewState: "candidate",
      }),
    });
    expect(hiddenProcedure).toMatchObject({
      accepted: false,
      status: "not_found",
    });
    expect(visibleProcedure).toMatchObject({
      accepted: true,
      status: "ok",
      record: expect.objectContaining({
        objectType: "procedure",
        readSurface: "validated_procedure_read_model",
        id: fixture.validatedProcedureId,
      }),
    });
    expect(disabledWrite).toMatchObject({
      accepted: false,
      status: "disabled",
      reason: "candidate ingress mode is not enabled",
    });
    expect(countsAfterDisabledWrite).toEqual(countsBeforeDisabledWrite);
  });

  it("supports submit-only ingress while broader write and automation surfaces stay disabled", async () => {
    const fixture = await seedReadOnlyRetrievalFixture(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "submit-only",
      queryMode: "read-only",
    });

    const countsBeforeSubmit = await readTableCounts(dbEnvironment.connectionString);
    const approvedListBeforeSubmit = await runtime.memoryObjectQuery.list({
      scope: "approved_only",
      projectId: fixture.projectId,
    });

    const submission = await runtime.candidateIngress.submitLearning({
      content: "Submit-only rollout candidate write.",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
      metadata: {
        source: "submit-only-rollout-test",
        path: "candidate_submit",
      },
    });

    const reviewAttempt = await runtime.candidateReview.review({
      candidateId: fixture.candidateMemoryId,
      outcome: "accepted",
    });
    const proactiveAttempt = await runtime.proactiveExecution.execute({
      actionType: "run_drift_check",
      projectId: fixture.projectId,
    });
    const backgroundJobAttempt = await runtime.backgroundJobs.enqueue({
      jobClass: "proactive_plan",
      projectId: fixture.projectId,
    });

    const approvedListAfterSubmit = await runtime.memoryObjectQuery.list({
      scope: "approved_only",
      projectId: fixture.projectId,
    });
    const submittedCandidate = submission.accepted
      ? await runtime.memoryObjectQuery.get({
          objectId: submission.memoryObjectId,
          scope: "include_candidates",
        })
      : null;
    const countsAfterSubmit = await readTableCounts(dbEnvironment.connectionString);

    expect(approvedListBeforeSubmit).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      records: [
        expect.objectContaining({
          id: fixture.approvedMemoryId,
          reviewState: "approved",
        }),
      ],
    });
    expect(submission).toMatchObject({
      accepted: true,
      status: "accepted",
      kind: "learning",
      storage: "database",
      reviewState: "candidate",
    });
    expect(reviewAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      reason: "candidate review mode is not enabled",
    });
    expect(proactiveAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      actionType: "run_drift_check",
      reason: "proactive execution mode is not enabled",
    });
    expect(backgroundJobAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      jobClass: "proactive_plan",
      reason: "background job scheduling mode is not enabled",
    });
    expect(approvedListAfterSubmit).toEqual(approvedListBeforeSubmit);
    expect(submittedCandidate).toMatchObject({
      accepted: true,
      status: "ok",
      record: expect.objectContaining({
        objectType: "memory_object",
        readSurface: "reviewable_candidates_view",
        reviewState: "candidate",
        content: "Submit-only rollout candidate write.",
      }),
    });
    expect(countsBeforeSubmit).toEqual({
      memory_events: "2",
      memory_objects: "2",
      memory_reviews: "0",
      procedures: "1",
      procedure_runs: "0",
      skill_candidates: "0",
      memory_links: "0",
      memory_sources: "0",
      background_jobs: "0",
    });
    expect(countsAfterSubmit).toEqual({
      memory_events: "3",
      memory_objects: "3",
      memory_reviews: "0",
      procedures: "1",
      procedure_runs: "0",
      skill_candidates: "0",
      memory_links: "0",
      memory_sources: "1",
      background_jobs: "0",
    });
  });

  it("supports submit-review-only mode while promotion and automation surfaces stay disabled", async () => {
    const fixture = await seedReadOnlyRetrievalFixture(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "submit-review-only",
      queryMode: "read-only",
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const approvedListBefore = await runtime.memoryObjectQuery.list({
      scope: "approved_only",
      projectId: fixture.projectId,
    });
    const submission = await runtime.candidateIngress.submitLearning({
      content: "Submit-review rollout candidate write.",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
      metadata: {
        source: "submit-review-rollout-test",
        path: "candidate_submit",
      },
    });
    expect(submission.accepted).toBe(true);

    const submittedCandidateId = submission.accepted
      ? submission.memoryObjectId
      : fixture.candidateMemoryId;
    const review = await runtime.candidateReview.review({
      candidateId: submittedCandidateId,
      outcome: "accepted",
      reviewerAgentId: fixture.agentId,
      metadata: {
        source: "submit-review-rollout-test",
        path: "candidate_review",
      },
    });
    const promotionPlanAttempt = await runtime.candidatePromotionPlan.plan({
      candidateId: submittedCandidateId,
    });
    const proactiveAttempt = await runtime.proactiveExecution.execute({
      actionType: "run_drift_check",
      projectId: fixture.projectId,
    });
    const backgroundJobAttempt = await runtime.backgroundJobs.enqueue({
      jobClass: "proactive_plan",
      projectId: fixture.projectId,
    });
    const selfImprovingAttempt = await runtime.selfImprovingCandidateCapture.capture({
      kind: "learning",
      content: "submit-review mode should still block self-improving capture",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
    });

    const approvedListAfter = await runtime.memoryObjectQuery.list({
      scope: "approved_only",
      projectId: fixture.projectId,
    });
    const reviewedCandidate = await runtime.memoryObjectQuery.get({
      objectId: submittedCandidateId,
      scope: "include_candidates",
    });
    const reviewRow = await querySingleRow<{
      memory_object_id: string;
      action: string;
      resulting_state: string;
      reviewer_agent_id: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          memory_object_id::text as memory_object_id,
          action,
          resulting_state,
          reviewer_agent_id::text as reviewer_agent_id
        from memory_middleware.memory_reviews
        where memory_object_id = $1::uuid
        order by created_at desc
        limit 1
      `,
      [submittedCandidateId],
    );
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(approvedListBefore).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      records: [
        expect.objectContaining({
          id: fixture.approvedMemoryId,
          reviewState: "approved",
        }),
      ],
    });
    expect(review).toMatchObject({
      accepted: true,
      status: "recorded",
      candidateId: submittedCandidateId,
      outcome: "accepted",
    });
    expect(promotionPlanAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      reason: "candidate promotion planning mode is not enabled",
    });
    expect(proactiveAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      actionType: "run_drift_check",
      reason: "proactive execution mode is not enabled",
    });
    expect(backgroundJobAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      jobClass: "proactive_plan",
      reason: "background job scheduling mode is not enabled",
    });
    expect(selfImprovingAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      kind: "learning",
      target: "candidate_only",
      reason: "self-improving candidate capture mode is not enabled",
    });
    expect(approvedListAfter).toEqual(approvedListBefore);
    expect(reviewedCandidate).toMatchObject({
      accepted: true,
      status: "ok",
      record: expect.objectContaining({
        objectType: "memory_object",
        readSurface: "reviewable_candidates_view",
        id: submittedCandidateId,
        reviewState: "candidate",
        content: "Submit-review rollout candidate write.",
      }),
    });
    expect(reviewRow).toEqual({
      memory_object_id: submittedCandidateId,
      action: "approve",
      resulting_state: "approved",
      reviewer_agent_id: fixture.agentId,
    });
    expect(countsBefore).toEqual({
      memory_events: "2",
      memory_objects: "2",
      memory_reviews: "0",
      procedures: "1",
      procedure_runs: "0",
      skill_candidates: "0",
      memory_links: "0",
      memory_sources: "0",
      background_jobs: "0",
    });
    expect(countsAfter).toEqual({
      memory_events: "3",
      memory_objects: "3",
      memory_reviews: "1",
      procedures: "1",
      procedure_runs: "0",
      skill_candidates: "0",
      memory_links: "0",
      memory_sources: "1",
      background_jobs: "0",
    });
  });

  it("supports submit-review-promote-memory mode while procedure and automation surfaces stay disabled", async () => {
    const fixture = await seedReadOnlyRetrievalFixture(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "submit-review-promote-memory",
      queryMode: "read-only",
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const approvedListBefore = await runtime.memoryObjectQuery.list({
      scope: "approved_only",
      projectId: fixture.projectId,
    });
    const submission = await runtime.candidateIngress.submitLearning({
      content: "Submit-review-promote rollout candidate write.",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
      metadata: {
        source: "submit-review-promote-rollout-test",
        path: "candidate_submit",
      },
    });
    expect(submission.accepted).toBe(true);
    const submittedCandidateId = submission.accepted
      ? submission.memoryObjectId
      : fixture.candidateMemoryId;
    const submitEventId = submission.accepted ? submission.eventId : "";

    const review = await runtime.candidateReview.review({
      candidateId: submittedCandidateId,
      outcome: "accepted",
      reviewerAgentId: fixture.agentId,
      metadata: {
        source: "submit-review-promote-rollout-test",
        path: "candidate_review",
      },
    });
    expect(review.accepted).toBe(true);
    const reviewId = review.accepted ? review.reviewId : "";

    const promotionPlan = await runtime.candidatePromotionPlan.plan({
      candidateId: submittedCandidateId,
    });
    const memoryPromotion = await runtime.candidatePromotion.promoteToMemory({
      candidateId: submittedCandidateId,
      promoterAgentId: fixture.agentId,
      rationale: "Manual promotion into approved durable memory during bounded rollout.",
      metadata: {
        source: "submit-review-promote-rollout-test",
        path: "candidate_promote_memory",
      },
    });
    const procedurePromotionAttempt = await runtime.candidatePromotion.promoteToProcedureDraft({
      candidateId: submittedCandidateId,
      promoterAgentId: fixture.agentId,
      title: "Should stay disabled",
    });
    const procedureValidationAttempt = await runtime.procedureValidation.validate({
      procedureId: fixture.validatedProcedureId,
      rationale: "should stay disabled",
    });
    const proactiveAttempt = await runtime.proactiveExecution.execute({
      actionType: "run_drift_check",
      projectId: fixture.projectId,
    });
    const backgroundJobAttempt = await runtime.backgroundJobs.enqueue({
      jobClass: "proactive_plan",
      projectId: fixture.projectId,
    });
    const selfImprovingAttempt = await runtime.selfImprovingCandidateCapture.capture({
      kind: "learning",
      content: "submit-review-promote mode should still block self-improving capture",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
    });

    expect(memoryPromotion.accepted).toBe(true);
    const promotedMemoryObjectId = memoryPromotion.accepted
      ? memoryPromotion.promotedMemoryObjectId
      : "";
    const approvedListAfter = await runtime.memoryObjectQuery.list({
      scope: "approved_only",
      projectId: fixture.projectId,
    });
    const promotedMemory = await runtime.memoryObjectQuery.get({
      objectId: promotedMemoryObjectId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    const promotedRow = await querySingleRow<{
      candidate_state: string;
      promoted_review_state: string;
      promoted_memory_kind: string;
      promoted_source_event_id: string;
      promoted_from_candidate_id: string | null;
      promoted_from_review_id: string | null;
      memory_source_count: string;
      memory_link_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select review_state::text from memory_middleware.memory_objects where id = $1::uuid) as candidate_state,
          (select review_state::text from memory_middleware.memory_objects where id = $2::uuid) as promoted_review_state,
          (select memory_kind::text from memory_middleware.memory_objects where id = $2::uuid) as promoted_memory_kind,
          (select source_event_id::text from memory_middleware.memory_objects where id = $2::uuid) as promoted_source_event_id,
          (select metadata->>'promotedFromCandidateId' from memory_middleware.memory_objects where id = $2::uuid) as promoted_from_candidate_id,
          (select metadata->>'promotedFromReviewId' from memory_middleware.memory_objects where id = $2::uuid) as promoted_from_review_id,
          (select count(*)::text from memory_middleware.memory_sources where memory_object_id = $2::uuid) as memory_source_count,
          (select count(*)::text from memory_middleware.memory_links where source_memory_object_id = $2::uuid and target_memory_object_id = $1::uuid) as memory_link_count
      `,
      [submittedCandidateId, promotedMemoryObjectId],
    );

    expect(approvedListBefore).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      records: [
        expect.objectContaining({
          id: fixture.approvedMemoryId,
          reviewState: "approved",
        }),
      ],
    });
    expect(review).toMatchObject({
      accepted: true,
      status: "recorded",
      candidateId: submittedCandidateId,
      outcome: "accepted",
    });
    expect(promotionPlan).toEqual({
      accepted: true,
      status: "ok",
      candidateId: submittedCandidateId,
      candidateKind: "learning",
      reviewState: "candidate",
      latestReviewOutcome: "accepted",
      eligible: true,
      possibleTargets: ["propose_memory_promotion", "remain_candidate_only"],
      rationale: [
        "candidate has an accepted review outcome",
        "this candidate kind can be considered for a future memory-promotion path",
      ],
      requiredGates: [
        "manual promotion confirmation is still required",
        "bounded memory promotion requires an explicit write tool invocation",
        "policy and review checks must pass before any future promotion write",
      ],
    });
    expect(memoryPromotion).toMatchObject({
      accepted: true,
      status: "promoted",
      candidateId: submittedCandidateId,
      promotedMemoryKind: "project",
      promotedReviewState: "approved",
      sourceEventId: submitEventId,
    });
    expect(procedurePromotionAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      reason: "candidate procedure promotion mode is not enabled",
    });
    expect(procedureValidationAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      reason: "procedure validation mode is not enabled",
    });
    expect(proactiveAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      actionType: "run_drift_check",
      reason: "proactive execution mode is not enabled",
    });
    expect(backgroundJobAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      jobClass: "proactive_plan",
      reason: "background job scheduling mode is not enabled",
    });
    expect(selfImprovingAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      kind: "learning",
      target: "candidate_only",
      reason: "self-improving candidate capture mode is not enabled",
    });
    expect(approvedListAfter).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      records: expect.arrayContaining([
        expect.objectContaining({
          id: fixture.approvedMemoryId,
          reviewState: "approved",
        }),
        expect.objectContaining({
          id: promotedMemoryObjectId,
          reviewState: "approved",
          readSurface: "approved_memory_view",
        }),
      ]),
    });
    expect(promotedMemory).toMatchObject({
      accepted: true,
      status: "ok",
      record: expect.objectContaining({
        id: promotedMemoryObjectId,
        reviewState: "approved",
        readSurface: "approved_memory_view",
        content: "Submit-review-promote rollout candidate write.",
      }),
    });
    expect(promotedRow).toEqual({
      candidate_state: "candidate",
      promoted_review_state: "approved",
      promoted_memory_kind: "project",
      promoted_source_event_id: submitEventId,
      promoted_from_candidate_id: submittedCandidateId,
      promoted_from_review_id: reviewId,
      memory_source_count: "2",
      memory_link_count: "1",
    });
    expect(countsBefore).toEqual({
      memory_events: "2",
      memory_objects: "2",
      memory_reviews: "0",
      procedures: "1",
      procedure_runs: "0",
      skill_candidates: "0",
      memory_links: "0",
      memory_sources: "0",
      background_jobs: "0",
    });
    expect(countsAfter).toEqual({
      memory_events: "3",
      memory_objects: "4",
      memory_reviews: "1",
      procedures: "1",
      procedure_runs: "0",
      skill_candidates: "0",
      memory_links: "1",
      memory_sources: "3",
      background_jobs: "0",
    });
  });

  it("supports submit-review-promote-memory-procedure mode while later procedure and automation surfaces stay disabled", async () => {
    const fixture = await seedReadOnlyRetrievalFixture(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "submit-review-promote-memory-procedure",
      queryMode: "read-only",
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const approvedListBefore = await runtime.memoryObjectQuery.list({
      scope: "approved_only",
      projectId: fixture.projectId,
    });

    const learningSubmission = await runtime.candidateIngress.submitLearning({
      content: "Submit-review-promote-procedure rollout learning candidate write.",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
      metadata: {
        source: "submit-review-promote-procedure-rollout-test",
        path: "candidate_submit_learning",
      },
    });
    expect(learningSubmission.accepted).toBe(true);
    const learningCandidateId = learningSubmission.accepted
      ? learningSubmission.memoryObjectId
      : fixture.candidateMemoryId;
    const learningSubmitEventId = learningSubmission.accepted ? learningSubmission.eventId : "";

    const procedureSubmission = await runtime.candidateIngress.submitProcedureSuggestion({
      content:
        "Step 1: capture the failure details.\nStep 2: confirm bounded scope.\nStep 3: write the patch.",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
      metadata: {
        source: "submit-review-promote-procedure-rollout-test",
        path: "candidate_submit_procedure",
      },
    });
    expect(procedureSubmission.accepted).toBe(true);
    const procedureCandidateId = procedureSubmission.accepted
      ? procedureSubmission.memoryObjectId
      : fixture.candidateMemoryId;
    const procedureSubmitEventId = procedureSubmission.accepted ? procedureSubmission.eventId : "";

    const learningReview = await runtime.candidateReview.review({
      candidateId: learningCandidateId,
      outcome: "accepted",
      reviewerAgentId: fixture.agentId,
      metadata: {
        source: "submit-review-promote-procedure-rollout-test",
        path: "candidate_review_learning",
      },
    });
    expect(learningReview.accepted).toBe(true);
    const learningReviewId = learningReview.accepted ? learningReview.reviewId : "";

    const procedureReview = await runtime.candidateReview.review({
      candidateId: procedureCandidateId,
      outcome: "accepted",
      reviewerAgentId: fixture.agentId,
      metadata: {
        source: "submit-review-promote-procedure-rollout-test",
        path: "candidate_review_procedure",
      },
    });
    expect(procedureReview.accepted).toBe(true);
    const procedureReviewId = procedureReview.accepted ? procedureReview.reviewId : "";

    const learningPromotionPlan = await runtime.candidatePromotionPlan.plan({
      candidateId: learningCandidateId,
    });
    const procedurePromotionPlan = await runtime.candidatePromotionPlan.plan({
      candidateId: procedureCandidateId,
    });
    const memoryPromotion = await runtime.candidatePromotion.promoteToMemory({
      candidateId: learningCandidateId,
      promoterAgentId: fixture.agentId,
      rationale: "Manual promotion into approved durable memory during bounded rollout.",
      metadata: {
        source: "submit-review-promote-procedure-rollout-test",
        path: "candidate_promote_memory",
      },
    });
    const procedurePromotion = await runtime.candidatePromotion.promoteToProcedureDraft({
      candidateId: procedureCandidateId,
      promoterAgentId: fixture.agentId,
      title: "Bounded Procedure Draft",
      rationale: "Manual promotion into a bounded draft procedure during rollout.",
      metadata: {
        source: "submit-review-promote-procedure-rollout-test",
        path: "candidate_promote_procedure",
      },
    });
    const procedureValidationAttempt = await runtime.procedureValidation.validate({
      procedureId: fixture.validatedProcedureId,
      rationale: "should stay disabled",
    });
    const skillCandidateAttempt = await runtime.skillCandidate.create({
      procedureId: fixture.validatedProcedureId,
      name: "Should stay disabled",
      summary: "Blocked in this rollout posture.",
    });
    const proactiveAttempt = await runtime.proactiveExecution.execute({
      actionType: "run_drift_check",
      projectId: fixture.projectId,
    });
    const backgroundJobAttempt = await runtime.backgroundJobs.enqueue({
      jobClass: "proactive_plan",
      projectId: fixture.projectId,
    });
    const selfImprovingAttempt = await runtime.selfImprovingCandidateCapture.capture({
      kind: "procedure",
      content: "submit-review-promote-memory-procedure should still block self-improving capture",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
    });

    expect(memoryPromotion.accepted).toBe(true);
    expect(procedurePromotion.accepted).toBe(true);
    const promotedMemoryObjectId = memoryPromotion.accepted
      ? memoryPromotion.promotedMemoryObjectId
      : "";
    const promotedProcedureId = procedurePromotion.accepted ? procedurePromotion.procedureId : "";

    const approvedListAfter = await runtime.memoryObjectQuery.list({
      scope: "approved_only",
      projectId: fixture.projectId,
    });
    const promotedMemory = await runtime.memoryObjectQuery.get({
      objectId: promotedMemoryObjectId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    const promotedMemoryRow = await querySingleRow<{
      candidate_state: string;
      promoted_review_state: string;
      promoted_memory_kind: string;
      promoted_source_event_id: string;
      promoted_from_candidate_id: string | null;
      promoted_from_review_id: string | null;
      memory_source_count: string;
      memory_link_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select review_state::text from memory_middleware.memory_objects where id = $1::uuid) as candidate_state,
          (select review_state::text from memory_middleware.memory_objects where id = $2::uuid) as promoted_review_state,
          (select memory_kind::text from memory_middleware.memory_objects where id = $2::uuid) as promoted_memory_kind,
          (select source_event_id::text from memory_middleware.memory_objects where id = $2::uuid) as promoted_source_event_id,
          (select metadata->>'promotedFromCandidateId' from memory_middleware.memory_objects where id = $2::uuid) as promoted_from_candidate_id,
          (select metadata->>'promotedFromReviewId' from memory_middleware.memory_objects where id = $2::uuid) as promoted_from_review_id,
          (select count(*)::text from memory_middleware.memory_sources where memory_object_id = $2::uuid) as memory_source_count,
          (select count(*)::text from memory_middleware.memory_links where source_memory_object_id = $2::uuid and target_memory_object_id = $1::uuid) as memory_link_count
      `,
      [learningCandidateId, promotedMemoryObjectId],
    );
    const promotedProcedureRow = await querySingleRow<{
      procedure_status: string;
      source_memory_object_id: string;
      procedure_title: string;
      procedure_body: string;
      promoted_from_candidate_id: string | null;
      promoted_from_review_id: string | null;
      promoted_source_event_id: string | null;
      procedure_link_count: string;
      skill_candidates_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select status::text from memory_middleware.procedures where id = $2::uuid) as procedure_status,
          (select source_memory_object_id::text from memory_middleware.procedures where id = $2::uuid) as source_memory_object_id,
          (select title from memory_middleware.procedures where id = $2::uuid) as procedure_title,
          (select body from memory_middleware.procedures where id = $2::uuid) as procedure_body,
          (select metadata->>'promotedFromCandidateId' from memory_middleware.procedures where id = $2::uuid) as promoted_from_candidate_id,
          (select metadata->>'promotedFromReviewId' from memory_middleware.procedures where id = $2::uuid) as promoted_from_review_id,
          (select metadata->>'sourceEventId' from memory_middleware.procedures where id = $2::uuid) as promoted_source_event_id,
          (select count(*)::text from memory_middleware.memory_links where source_memory_object_id = $1::uuid and target_table = 'memory_middleware.procedures' and target_id = $2::uuid) as procedure_link_count,
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count
      `,
      [procedureCandidateId, promotedProcedureId],
    );

    expect(approvedListBefore).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      records: [
        expect.objectContaining({
          id: fixture.approvedMemoryId,
          reviewState: "approved",
        }),
      ],
    });
    expect(learningPromotionPlan).toEqual({
      accepted: true,
      status: "ok",
      candidateId: learningCandidateId,
      candidateKind: "learning",
      reviewState: "candidate",
      latestReviewOutcome: "accepted",
      eligible: true,
      possibleTargets: ["propose_memory_promotion", "remain_candidate_only"],
      rationale: [
        "candidate has an accepted review outcome",
        "this candidate kind can be considered for a future memory-promotion path",
      ],
      requiredGates: [
        "manual promotion confirmation is still required",
        "bounded memory promotion requires an explicit write tool invocation",
        "policy and review checks must pass before any future promotion write",
      ],
    });
    expect(procedurePromotionPlan).toEqual({
      accepted: true,
      status: "ok",
      candidateId: procedureCandidateId,
      candidateKind: "procedure",
      reviewState: "candidate",
      latestReviewOutcome: "accepted",
      eligible: true,
      possibleTargets: ["propose_procedure_draft", "remain_candidate_only"],
      rationale: [
        "candidate has an accepted review outcome",
        "procedure candidates can be considered for a future procedure-draft path",
      ],
      requiredGates: [
        "manual promotion confirmation is still required",
        "bounded procedure-draft promotion requires an explicit write tool invocation",
        "policy and review checks must pass before any future promotion write",
      ],
    });
    expect(memoryPromotion).toMatchObject({
      accepted: true,
      status: "promoted",
      candidateId: learningCandidateId,
      promotedMemoryKind: "project",
      promotedReviewState: "approved",
      sourceEventId: learningSubmitEventId,
    });
    expect(procedurePromotion).toMatchObject({
      accepted: true,
      status: "promoted",
      candidateId: procedureCandidateId,
      procedureStatus: "draft",
      sourceEventId: procedureSubmitEventId,
    });
    expect(procedureValidationAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      reason: "procedure validation mode is not enabled",
    });
    expect(skillCandidateAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate creation mode is not enabled",
    });
    expect(proactiveAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      actionType: "run_drift_check",
      reason: "proactive execution mode is not enabled",
    });
    expect(backgroundJobAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      jobClass: "proactive_plan",
      reason: "background job scheduling mode is not enabled",
    });
    expect(selfImprovingAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      kind: "procedure",
      target: "candidate_only",
      reason: "self-improving candidate capture mode is not enabled",
    });
    expect(approvedListAfter).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      records: expect.arrayContaining([
        expect.objectContaining({
          id: fixture.approvedMemoryId,
          reviewState: "approved",
        }),
        expect.objectContaining({
          id: promotedMemoryObjectId,
          reviewState: "approved",
          readSurface: "approved_memory_view",
        }),
      ]),
    });
    expect(promotedMemory).toMatchObject({
      accepted: true,
      status: "ok",
      record: expect.objectContaining({
        id: promotedMemoryObjectId,
        reviewState: "approved",
        readSurface: "approved_memory_view",
        content: "Submit-review-promote-procedure rollout learning candidate write.",
      }),
    });
    expect(promotedMemoryRow).toEqual({
      candidate_state: "candidate",
      promoted_review_state: "approved",
      promoted_memory_kind: "project",
      promoted_source_event_id: learningSubmitEventId,
      promoted_from_candidate_id: learningCandidateId,
      promoted_from_review_id: learningReviewId,
      memory_source_count: "2",
      memory_link_count: "1",
    });
    expect(promotedProcedureRow).toEqual({
      procedure_status: "draft",
      source_memory_object_id: procedureCandidateId,
      procedure_title: "Bounded Procedure Draft",
      procedure_body:
        "Step 1: capture the failure details.\nStep 2: confirm bounded scope.\nStep 3: write the patch.",
      promoted_from_candidate_id: procedureCandidateId,
      promoted_from_review_id: procedureReviewId,
      promoted_source_event_id: procedureSubmitEventId,
      procedure_link_count: "1",
      skill_candidates_count: "0",
    });
    expect(countsBefore).toEqual({
      memory_events: "2",
      memory_objects: "2",
      memory_reviews: "0",
      procedures: "1",
      procedure_runs: "0",
      skill_candidates: "0",
      memory_links: "0",
      memory_sources: "0",
      background_jobs: "0",
    });
    expect(countsAfter).toEqual({
      memory_events: "4",
      memory_objects: "5",
      memory_reviews: "2",
      procedures: "2",
      procedure_runs: "0",
      skill_candidates: "0",
      memory_links: "2",
      memory_sources: "4",
      background_jobs: "0",
    });
  });

  it("supports submit-review-promote-memory-procedure-validate mode while skill and automation surfaces stay disabled", async () => {
    const fixture = await seedReadOnlyRetrievalFixture(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "submit-review-promote-memory-procedure-validate",
      queryMode: "read-only",
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const approvedListBefore = await runtime.memoryObjectQuery.list({
      scope: "approved_only",
      projectId: fixture.projectId,
    });

    const learningSubmission = await runtime.candidateIngress.submitLearning({
      content: "Submit-review-promote-procedure-validate rollout learning candidate write.",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
      metadata: {
        source: "submit-review-promote-procedure-validate-rollout-test",
        path: "candidate_submit_learning",
      },
    });
    expect(learningSubmission.accepted).toBe(true);
    const learningCandidateId = learningSubmission.accepted
      ? learningSubmission.memoryObjectId
      : fixture.candidateMemoryId;
    const learningSubmitEventId = learningSubmission.accepted ? learningSubmission.eventId : "";

    const procedureSubmission = await runtime.candidateIngress.submitProcedureSuggestion({
      content:
        "Step 1: capture the error details.\nStep 2: confirm bounded scope.\nStep 3: write the patch.",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
      metadata: {
        source: "submit-review-promote-procedure-validate-rollout-test",
        path: "candidate_submit_procedure",
      },
    });
    expect(procedureSubmission.accepted).toBe(true);
    const procedureCandidateId = procedureSubmission.accepted
      ? procedureSubmission.memoryObjectId
      : fixture.candidateMemoryId;
    const procedureSubmitEventId = procedureSubmission.accepted ? procedureSubmission.eventId : "";

    const learningReview = await runtime.candidateReview.review({
      candidateId: learningCandidateId,
      outcome: "accepted",
      reviewerAgentId: fixture.agentId,
      metadata: {
        source: "submit-review-promote-procedure-validate-rollout-test",
        path: "candidate_review_learning",
      },
    });
    expect(learningReview.accepted).toBe(true);
    const learningReviewId = learningReview.accepted ? learningReview.reviewId : "";

    const procedureReview = await runtime.candidateReview.review({
      candidateId: procedureCandidateId,
      outcome: "accepted",
      reviewerAgentId: fixture.agentId,
      metadata: {
        source: "submit-review-promote-procedure-validate-rollout-test",
        path: "candidate_review_procedure",
      },
    });
    expect(procedureReview.accepted).toBe(true);
    const procedureReviewId = procedureReview.accepted ? procedureReview.reviewId : "";

    const memoryPromotion = await runtime.candidatePromotion.promoteToMemory({
      candidateId: learningCandidateId,
      promoterAgentId: fixture.agentId,
      rationale: "Manual promotion into approved durable memory during bounded rollout.",
      metadata: {
        source: "submit-review-promote-procedure-validate-rollout-test",
        path: "candidate_promote_memory",
      },
    });
    const procedurePromotion = await runtime.candidatePromotion.promoteToProcedureDraft({
      candidateId: procedureCandidateId,
      promoterAgentId: fixture.agentId,
      title: "Bounded Procedure Draft",
      rationale: "Manual promotion into a bounded draft procedure during rollout.",
      metadata: {
        source: "submit-review-promote-procedure-validate-rollout-test",
        path: "candidate_promote_procedure",
      },
    });
    expect(memoryPromotion.accepted).toBe(true);
    expect(procedurePromotion.accepted).toBe(true);

    const validatedProcedureId = procedurePromotion.accepted ? procedurePromotion.procedureId : "";
    const procedureValidation = await runtime.procedureValidation.validate({
      procedureId: validatedProcedureId,
      validatorAgentId: fixture.agentId,
      rationale: "Validated after bounded review and preserved promotion lineage.",
      metadata: {
        source: "submit-review-promote-procedure-validate-rollout-test",
        path: "procedure_validate",
      },
    });
    const procedureValidationPlanAttempt = await runtime.procedureValidationPlan.plan({
      procedureId: validatedProcedureId,
    });
    const skillCandidatePlanAttempt = await runtime.skillCandidatePlan.plan({
      procedureId: validatedProcedureId,
    });
    const skillCandidateAttempt = await runtime.skillCandidate.create({
      procedureId: validatedProcedureId,
      name: "Should stay disabled",
      summary: "Blocked in this rollout posture.",
    });
    const proactiveAttempt = await runtime.proactiveExecution.execute({
      actionType: "run_drift_check",
      projectId: fixture.projectId,
    });
    const backgroundJobAttempt = await runtime.backgroundJobs.enqueue({
      jobClass: "proactive_plan",
      projectId: fixture.projectId,
    });
    const selfImprovingAttempt = await runtime.selfImprovingCandidateCapture.capture({
      kind: "procedure",
      content:
        "submit-review-promote-memory-procedure-validate should still block self-improving capture",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
    });

    const promotedMemoryObjectId = memoryPromotion.accepted
      ? memoryPromotion.promotedMemoryObjectId
      : "";
    const approvedListAfter = await runtime.memoryObjectQuery.list({
      scope: "approved_only",
      projectId: fixture.projectId,
    });
    const promotedMemory = await runtime.memoryObjectQuery.get({
      objectId: promotedMemoryObjectId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    const promotedMemoryRow = await querySingleRow<{
      candidate_state: string;
      promoted_review_state: string;
      promoted_memory_kind: string;
      promoted_source_event_id: string;
      promoted_from_candidate_id: string | null;
      promoted_from_review_id: string | null;
      memory_source_count: string;
      memory_link_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select review_state::text from memory_middleware.memory_objects where id = $1::uuid) as candidate_state,
          (select review_state::text from memory_middleware.memory_objects where id = $2::uuid) as promoted_review_state,
          (select memory_kind::text from memory_middleware.memory_objects where id = $2::uuid) as promoted_memory_kind,
          (select source_event_id::text from memory_middleware.memory_objects where id = $2::uuid) as promoted_source_event_id,
          (select metadata->>'promotedFromCandidateId' from memory_middleware.memory_objects where id = $2::uuid) as promoted_from_candidate_id,
          (select metadata->>'promotedFromReviewId' from memory_middleware.memory_objects where id = $2::uuid) as promoted_from_review_id,
          (select count(*)::text from memory_middleware.memory_sources where memory_object_id = $2::uuid) as memory_source_count,
          (select count(*)::text from memory_middleware.memory_links where source_memory_object_id = $2::uuid and target_memory_object_id = $1::uuid) as memory_link_count
      `,
      [learningCandidateId, promotedMemoryObjectId],
    );
    const validatedProcedureRow = await querySingleRow<{
      procedure_status: string;
      validated_at_present: string;
      last_validation_run_id: string | null;
      validated_by_agent_id: string | null;
      validation_rationale: string | null;
      promoted_from_candidate_id: string | null;
      promoted_from_review_id: string | null;
      source_event_id: string | null;
      procedure_run_outcome: string;
      procedure_run_notes: string | null;
      run_evidence_source_candidate_id: string | null;
      run_evidence_review_id: string | null;
      run_evidence_source_event_id: string | null;
      skill_candidates_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select status::text from memory_middleware.procedures where id = $2::uuid) as procedure_status,
          (select case when validated_at is null then 'false' else 'true' end from memory_middleware.procedures where id = $2::uuid) as validated_at_present,
          (select metadata->>'lastValidationRunId' from memory_middleware.procedures where id = $2::uuid) as last_validation_run_id,
          (select metadata->>'validatedByAgentId' from memory_middleware.procedures where id = $2::uuid) as validated_by_agent_id,
          (select metadata->>'validationRationale' from memory_middleware.procedures where id = $2::uuid) as validation_rationale,
          (select metadata->>'promotedFromCandidateId' from memory_middleware.procedures where id = $2::uuid) as promoted_from_candidate_id,
          (select metadata->>'promotedFromReviewId' from memory_middleware.procedures where id = $2::uuid) as promoted_from_review_id,
          (select metadata->>'sourceEventId' from memory_middleware.procedures where id = $2::uuid) as source_event_id,
          (select outcome::text from memory_middleware.procedure_runs where id = $1::uuid) as procedure_run_outcome,
          (select notes from memory_middleware.procedure_runs where id = $1::uuid) as procedure_run_notes,
          (select evidence->>'sourceCandidateId' from memory_middleware.procedure_runs where id = $1::uuid) as run_evidence_source_candidate_id,
          (select evidence->>'promotedFromReviewId' from memory_middleware.procedure_runs where id = $1::uuid) as run_evidence_review_id,
          (select evidence->>'sourceEventId' from memory_middleware.procedure_runs where id = $1::uuid) as run_evidence_source_event_id,
          (select count(*)::text from memory_middleware.skill_candidates) as skill_candidates_count
      `,
      [
        procedureValidation.accepted ? procedureValidation.procedureRunId : "",
        validatedProcedureId,
      ],
    );

    expect(approvedListBefore).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      records: [
        expect.objectContaining({
          id: fixture.approvedMemoryId,
          reviewState: "approved",
        }),
      ],
    });
    expect(procedureValidation).toMatchObject({
      accepted: true,
      status: "validated",
      procedureId: validatedProcedureId,
      procedureStatus: "validated",
      sourceCandidateId: procedureCandidateId,
    });
    expect(procedureValidationPlanAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      reason: "procedure validation planning mode is not enabled",
    });
    expect(skillCandidatePlanAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate planning mode is not enabled",
    });
    expect(skillCandidateAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate creation mode is not enabled",
    });
    expect(proactiveAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      actionType: "run_drift_check",
      reason: "proactive execution mode is not enabled",
    });
    expect(backgroundJobAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      jobClass: "proactive_plan",
      reason: "background job scheduling mode is not enabled",
    });
    expect(selfImprovingAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      kind: "procedure",
      target: "candidate_only",
      reason: "self-improving candidate capture mode is not enabled",
    });
    expect(approvedListAfter).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      records: expect.arrayContaining([
        expect.objectContaining({
          id: fixture.approvedMemoryId,
          reviewState: "approved",
        }),
        expect.objectContaining({
          id: promotedMemoryObjectId,
          reviewState: "approved",
          readSurface: "approved_memory_view",
        }),
      ]),
    });
    expect(promotedMemory).toMatchObject({
      accepted: true,
      status: "ok",
      record: expect.objectContaining({
        id: promotedMemoryObjectId,
        reviewState: "approved",
        readSurface: "approved_memory_view",
        content: "Submit-review-promote-procedure-validate rollout learning candidate write.",
      }),
    });
    expect(promotedMemoryRow).toEqual({
      candidate_state: "candidate",
      promoted_review_state: "approved",
      promoted_memory_kind: "project",
      promoted_source_event_id: learningSubmitEventId,
      promoted_from_candidate_id: learningCandidateId,
      promoted_from_review_id: learningReviewId,
      memory_source_count: "2",
      memory_link_count: "1",
    });
    expect(validatedProcedureRow).toEqual({
      procedure_status: "validated",
      validated_at_present: "true",
      last_validation_run_id: procedureValidation.accepted
        ? procedureValidation.procedureRunId
        : null,
      validated_by_agent_id: fixture.agentId,
      validation_rationale: "Validated after bounded review and preserved promotion lineage.",
      promoted_from_candidate_id: procedureCandidateId,
      promoted_from_review_id: procedureReviewId,
      source_event_id: procedureSubmitEventId,
      procedure_run_outcome: "passed",
      procedure_run_notes: "Validated after bounded review and preserved promotion lineage.",
      run_evidence_source_candidate_id: procedureCandidateId,
      run_evidence_review_id: procedureReviewId,
      run_evidence_source_event_id: procedureSubmitEventId,
      skill_candidates_count: "0",
    });
    expect(countsBefore).toEqual({
      memory_events: "2",
      memory_objects: "2",
      memory_reviews: "0",
      procedures: "1",
      procedure_runs: "0",
      skill_candidates: "0",
      memory_links: "0",
      memory_sources: "0",
      background_jobs: "0",
    });
    expect(countsAfter).toEqual({
      memory_events: "4",
      memory_objects: "5",
      memory_reviews: "2",
      procedures: "2",
      procedure_runs: "1",
      skill_candidates: "0",
      memory_links: "2",
      memory_sources: "4",
      background_jobs: "0",
    });
  });

  it("supports submit-review-promote-memory-procedure-validate-skill mode while procurement and automation surfaces stay disabled", async () => {
    const fixture = await seedReadOnlyRetrievalFixture(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "submit-review-promote-memory-procedure-validate-skill",
      queryMode: "read-only",
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const approvedListBefore = await runtime.memoryObjectQuery.list({
      scope: "approved_only",
      projectId: fixture.projectId,
    });

    const learningSubmission = await runtime.candidateIngress.submitLearning({
      content: "Submit-review-promote-procedure-validate-skill rollout learning candidate write.",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-rollout-test",
        path: "candidate_submit_learning",
      },
    });
    expect(learningSubmission.accepted).toBe(true);
    const learningCandidateId = learningSubmission.accepted
      ? learningSubmission.memoryObjectId
      : fixture.candidateMemoryId;
    const learningSubmitEventId = learningSubmission.accepted ? learningSubmission.eventId : "";

    const procedureSubmission = await runtime.candidateIngress.submitProcedureSuggestion({
      content:
        "Step 1: capture the error details.\nStep 2: confirm bounded scope.\nStep 3: write the patch.",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-rollout-test",
        path: "candidate_submit_procedure",
      },
    });
    expect(procedureSubmission.accepted).toBe(true);
    const procedureCandidateId = procedureSubmission.accepted
      ? procedureSubmission.memoryObjectId
      : fixture.candidateMemoryId;
    const procedureSubmitEventId = procedureSubmission.accepted ? procedureSubmission.eventId : "";

    const learningReview = await runtime.candidateReview.review({
      candidateId: learningCandidateId,
      outcome: "accepted",
      reviewerAgentId: fixture.agentId,
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-rollout-test",
        path: "candidate_review_learning",
      },
    });
    expect(learningReview.accepted).toBe(true);
    const learningReviewId = learningReview.accepted ? learningReview.reviewId : "";

    const procedureReview = await runtime.candidateReview.review({
      candidateId: procedureCandidateId,
      outcome: "accepted",
      reviewerAgentId: fixture.agentId,
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-rollout-test",
        path: "candidate_review_procedure",
      },
    });
    expect(procedureReview.accepted).toBe(true);
    const procedureReviewId = procedureReview.accepted ? procedureReview.reviewId : "";

    const memoryPromotion = await runtime.candidatePromotion.promoteToMemory({
      candidateId: learningCandidateId,
      promoterAgentId: fixture.agentId,
      rationale: "Manual promotion into approved durable memory during bounded rollout.",
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-rollout-test",
        path: "candidate_promote_memory",
      },
    });
    const procedurePromotion = await runtime.candidatePromotion.promoteToProcedureDraft({
      candidateId: procedureCandidateId,
      promoterAgentId: fixture.agentId,
      title: "Bounded Procedure Draft",
      rationale: "Manual promotion into a bounded draft procedure during rollout.",
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-rollout-test",
        path: "candidate_promote_procedure",
      },
    });
    expect(memoryPromotion.accepted).toBe(true);
    expect(procedurePromotion.accepted).toBe(true);

    const validatedProcedure = await runtime.procedureValidation.validate({
      procedureId: procedurePromotion.accepted ? procedurePromotion.procedureId : "",
      validatorAgentId: fixture.agentId,
      rationale: "Validated after bounded review and preserved promotion lineage.",
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-rollout-test",
        path: "procedure_validate",
      },
    });
    expect(validatedProcedure.accepted).toBe(true);

    const skillCandidatePlan = await runtime.skillCandidatePlan.plan({
      procedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
    });
    const skillCandidateCreate = await runtime.skillCandidate.create({
      procedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
      creatorAgentId: fixture.agentId,
      rationale: "Create one bounded skill-candidate record only.",
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-rollout-test",
        path: "skill_candidate_create",
      },
    });
    const procurementPlanAttempt = await runtime.skillCandidateProcurementPlan.plan({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
    });
    const skillVetterAttempt = await runtime.skillCandidateSkillVetterHandoff.plan({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
    });
    const approvalPlanAttempt = await runtime.skillCandidateApprovalPlan.plan({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
    });
    const installHandoffAttempt = await runtime.skillCandidateInstallHandoff.plan({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
    });
    const proactiveAttempt = await runtime.proactiveExecution.execute({
      actionType: "run_drift_check",
      projectId: fixture.projectId,
    });
    const backgroundJobAttempt = await runtime.backgroundJobs.enqueue({
      jobClass: "proactive_plan",
      projectId: fixture.projectId,
    });
    const selfImprovingAttempt = await runtime.selfImprovingCandidateCapture.capture({
      kind: "procedure",
      content:
        "submit-review-promote-memory-procedure-validate-skill should still block self-improving capture",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
    });

    const promotedMemoryObjectId = memoryPromotion.accepted
      ? memoryPromotion.promotedMemoryObjectId
      : "";
    const approvedListAfter = await runtime.memoryObjectQuery.list({
      scope: "approved_only",
      projectId: fixture.projectId,
    });
    const promotedMemory = await runtime.memoryObjectQuery.get({
      objectId: promotedMemoryObjectId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    const promotedMemoryRow = await querySingleRow<{
      candidate_state: string;
      promoted_review_state: string;
      promoted_memory_kind: string;
      promoted_source_event_id: string;
      promoted_from_candidate_id: string | null;
      promoted_from_review_id: string | null;
      memory_source_count: string;
      memory_link_count: string;
    }>(
      dbEnvironment.connectionString,
      `
        select
          (select review_state::text from memory_middleware.memory_objects where id = $1::uuid) as candidate_state,
          (select review_state::text from memory_middleware.memory_objects where id = $2::uuid) as promoted_review_state,
          (select memory_kind::text from memory_middleware.memory_objects where id = $2::uuid) as promoted_memory_kind,
          (select source_event_id::text from memory_middleware.memory_objects where id = $2::uuid) as promoted_source_event_id,
          (select metadata->>'promotedFromCandidateId' from memory_middleware.memory_objects where id = $2::uuid) as promoted_from_candidate_id,
          (select metadata->>'promotedFromReviewId' from memory_middleware.memory_objects where id = $2::uuid) as promoted_from_review_id,
          (select count(*)::text from memory_middleware.memory_sources where memory_object_id = $2::uuid) as memory_source_count,
          (select count(*)::text from memory_middleware.memory_links where source_memory_object_id = $2::uuid and target_memory_object_id = $1::uuid) as memory_link_count
      `,
      [learningCandidateId, promotedMemoryObjectId],
    );
    const skillCandidateRow = await querySingleRow<{
      source_procedure_id: string;
      status: string;
      name: string;
      summary: string;
      metadata: Record<string, unknown>;
    }>(
      dbEnvironment.connectionString,
      `
        select
          source_procedure_id::text as source_procedure_id,
          status::text as status,
          name,
          summary,
          metadata
        from memory_middleware.skill_candidates
        where id = $1::uuid
      `,
      [skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : ""],
    );

    expect(approvedListBefore).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      records: [
        expect.objectContaining({
          id: fixture.approvedMemoryId,
          reviewState: "approved",
        }),
      ],
    });
    expect(skillCandidatePlan).toEqual({
      accepted: true,
      status: "ok",
      procedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
      procedureStatus: "validated",
      sourceCandidateId: procedureCandidateId,
      latestValidationRunOutcome: "passed",
      eligible: true,
      possibleTargets: ["propose_skill_candidate", "remain_validated_procedure_only"],
      rationale: [
        "procedure is in validated state",
        "validated procedure preserves bounded candidate provenance and a passed validation run",
      ],
      requiredGates: [
        "manual skill-candidate confirmation is still required",
        "skill-candidate creation requires an explicit write tool invocation",
        "procurement, review, and policy checks must pass before any future skill-candidate write",
      ],
    });
    expect(skillCandidateCreate).toMatchObject({
      accepted: true,
      status: "created",
      procedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
      skillCandidateStatus: "candidate",
      sourceCandidateId: procedureCandidateId,
    });
    expect(procurementPlanAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate procurement planning mode is not enabled",
    });
    expect(skillVetterAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate Skill Vetter handoff mode is not enabled",
    });
    expect(approvalPlanAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate approval planning mode is not enabled",
    });
    expect(installHandoffAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate install handoff mode is not enabled",
    });
    expect(proactiveAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      actionType: "run_drift_check",
      reason: "proactive execution mode is not enabled",
    });
    expect(backgroundJobAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      jobClass: "proactive_plan",
      reason: "background job scheduling mode is not enabled",
    });
    expect(selfImprovingAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      kind: "procedure",
      target: "candidate_only",
      reason: "self-improving candidate capture mode is not enabled",
    });
    expect(approvedListAfter).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      records: expect.arrayContaining([
        expect.objectContaining({
          id: fixture.approvedMemoryId,
          reviewState: "approved",
        }),
        expect.objectContaining({
          id: promotedMemoryObjectId,
          reviewState: "approved",
          readSurface: "approved_memory_view",
        }),
      ]),
    });
    expect(promotedMemory).toMatchObject({
      accepted: true,
      status: "ok",
      record: expect.objectContaining({
        id: promotedMemoryObjectId,
        reviewState: "approved",
        readSurface: "approved_memory_view",
        content: "Submit-review-promote-procedure-validate-skill rollout learning candidate write.",
      }),
    });
    expect(promotedMemoryRow).toEqual({
      candidate_state: "candidate",
      promoted_review_state: "approved",
      promoted_memory_kind: "project",
      promoted_source_event_id: learningSubmitEventId,
      promoted_from_candidate_id: learningCandidateId,
      promoted_from_review_id: learningReviewId,
      memory_source_count: "2",
      memory_link_count: "1",
    });
    expect(skillCandidateRow).toEqual({
      source_procedure_id: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
      status: "candidate",
      name: "Bounded Procedure Draft",
      summary:
        "Step 1: capture the error details.\nStep 2: confirm bounded scope.\nStep 3: write the patch.",
      metadata: {
        source: "skill-candidate-create-tool",
        createdFromProcedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
        sourceCandidateId: procedureCandidateId,
        promotedFromReviewId: procedureReviewId,
        sourceEventId: procedureSubmitEventId,
        validationRunId: validatedProcedure.accepted ? validatedProcedure.procedureRunId : "",
        creatorAgentId: fixture.agentId,
        creationRationale: "Create one bounded skill-candidate record only.",
        skillCandidateMetadata: {
          source: "submit-review-promote-procedure-validate-skill-rollout-test",
          path: "skill_candidate_create",
        },
      },
    });
    expect(countsBefore).toEqual({
      memory_events: "2",
      memory_objects: "2",
      memory_reviews: "0",
      procedures: "1",
      procedure_runs: "0",
      skill_candidates: "0",
      memory_links: "0",
      memory_sources: "0",
      background_jobs: "0",
    });
    expect(countsAfter).toEqual({
      memory_events: "4",
      memory_objects: "5",
      memory_reviews: "2",
      procedures: "2",
      procedure_runs: "1",
      skill_candidates: "1",
      memory_links: "2",
      memory_sources: "4",
      background_jobs: "0",
    });
  });

  it("supports submit-review-promote-memory-procedure-validate-skill-procurement mode while vetting and automation surfaces stay disabled", async () => {
    const fixture = await seedReadOnlyRetrievalFixture(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "submit-review-promote-memory-procedure-validate-skill-procurement",
      queryMode: "read-only",
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const approvedListBefore = await runtime.memoryObjectQuery.list({
      scope: "approved_only",
      projectId: fixture.projectId,
    });

    const learningSubmission = await runtime.candidateIngress.submitLearning({
      content:
        "Submit-review-promote-procedure-validate-skill-procurement rollout learning candidate write.",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-procurement-rollout-test",
        path: "candidate_submit_learning",
      },
    });
    expect(learningSubmission.accepted).toBe(true);
    const learningCandidateId = learningSubmission.accepted
      ? learningSubmission.memoryObjectId
      : fixture.candidateMemoryId;

    const procedureSubmission = await runtime.candidateIngress.submitProcedureSuggestion({
      content:
        "Step 1: collect the rollout evidence.\nStep 2: create the bounded procedure draft.\nStep 3: prepare the internal procurement record.",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-procurement-rollout-test",
        path: "candidate_submit_procedure",
      },
    });
    expect(procedureSubmission.accepted).toBe(true);
    const procedureCandidateId = procedureSubmission.accepted
      ? procedureSubmission.memoryObjectId
      : fixture.candidateMemoryId;

    const learningReview = await runtime.candidateReview.review({
      candidateId: learningCandidateId,
      outcome: "accepted",
      reviewerAgentId: fixture.agentId,
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-procurement-rollout-test",
        path: "candidate_review_learning",
      },
    });
    expect(learningReview.accepted).toBe(true);
    const learningReviewId = learningReview.accepted ? learningReview.reviewId : "";

    const procedureReview = await runtime.candidateReview.review({
      candidateId: procedureCandidateId,
      outcome: "accepted",
      reviewerAgentId: fixture.agentId,
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-procurement-rollout-test",
        path: "candidate_review_procedure",
      },
    });
    expect(procedureReview.accepted).toBe(true);
    const procedureReviewId = procedureReview.accepted ? procedureReview.reviewId : "";

    const memoryPromotion = await runtime.candidatePromotion.promoteToMemory({
      candidateId: learningCandidateId,
      promoterAgentId: fixture.agentId,
      rationale: "Manual promotion into approved durable memory during bounded rollout.",
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-procurement-rollout-test",
        path: "candidate_promote_memory",
      },
    });
    const procedurePromotion = await runtime.candidatePromotion.promoteToProcedureDraft({
      candidateId: procedureCandidateId,
      promoterAgentId: fixture.agentId,
      title: "Bounded Procedure Draft For Procurement",
      rationale: "Manual promotion into a bounded draft procedure during rollout.",
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-procurement-rollout-test",
        path: "candidate_promote_procedure",
      },
    });
    expect(memoryPromotion.accepted).toBe(true);
    expect(procedurePromotion.accepted).toBe(true);

    const validatedProcedure = await runtime.procedureValidation.validate({
      procedureId: procedurePromotion.accepted ? procedurePromotion.procedureId : "",
      validatorAgentId: fixture.agentId,
      rationale: "Validated after bounded review and preserved promotion lineage.",
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-procurement-rollout-test",
        path: "procedure_validate",
      },
    });
    expect(validatedProcedure.accepted).toBe(true);

    const skillCandidatePlan = await runtime.skillCandidatePlan.plan({
      procedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
    });
    const skillCandidateCreate = await runtime.skillCandidate.create({
      procedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
      creatorAgentId: fixture.agentId,
      rationale: "Create one bounded skill-candidate record only.",
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-procurement-rollout-test",
        path: "skill_candidate_create",
      },
    });
    expect(skillCandidatePlan.accepted).toBe(true);
    expect(skillCandidateCreate.accepted).toBe(true);

    const procurementPlan = await runtime.skillCandidateProcurementPlan.plan({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
    });
    const procurementRecord = await runtime.skillCandidateProcurementRecord.create({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
      recorderAgentId: fixture.agentId,
      rationale: "Persist internal procurement handoff context only.",
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-procurement-rollout-test",
        path: "skill_candidate_procurement_record_create",
      },
    });
    const skillVetterAttempt = await runtime.skillCandidateSkillVetterHandoff.plan({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
    });
    const vettingResultAttempt = await runtime.skillCandidateVettingResult.create({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
      decision: "approve_limited",
      reviewerAgentId: fixture.agentId,
      summary: "This should remain disabled in the bounded procurement rollout.",
      permissionsRisk: {
        level: "medium",
        notes: ["disabled rollout should not record vetting outputs"],
        requiredChecks: ["do not bypass manual vetting during bounded procurement rollout"],
      },
      suspiciousPatterns: {
        redFlags: ["disabled rollout should keep this surface inert"],
        unresolvedQuestions: ["manual vetting remains out of scope in this slice"],
      },
      operationalFit: {
        fit: "limited",
        notes: ["bounded rollout stops before vetting-result persistence"],
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
      },
      approvalRecommendation: {
        proposedLifecycleState: "under_review",
        installRecommendation: "do_not_install",
        blockers: ["vetting-result recording is intentionally disabled in this slice"],
      },
    });
    const approvalPlanAttempt = await runtime.skillCandidateApprovalPlan.plan({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
    });
    const installHandoffAttempt = await runtime.skillCandidateInstallHandoff.plan({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
    });
    const proactiveAttempt = await runtime.proactiveExecution.execute({
      actionType: "run_drift_check",
      projectId: fixture.projectId,
    });
    const backgroundJobAttempt = await runtime.backgroundJobs.enqueue({
      jobClass: "proactive_plan",
      projectId: fixture.projectId,
    });
    const selfImprovingAttempt = await runtime.selfImprovingCandidateCapture.capture({
      kind: "improvement",
      content:
        "submit-review-promote-memory-procedure-validate-skill-procurement should still block self-improving capture",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
    });

    const promotedMemoryObjectId = memoryPromotion.accepted
      ? memoryPromotion.promotedMemoryObjectId
      : "";
    const approvedListAfter = await runtime.memoryObjectQuery.list({
      scope: "approved_only",
      projectId: fixture.projectId,
    });
    const promotedMemory = await runtime.memoryObjectQuery.get({
      objectId: promotedMemoryObjectId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    const procurementRecordRow = await querySingleRow<{
      event_kind: string;
      event_name: string;
      metadata: Record<string, unknown>;
    }>(
      dbEnvironment.connectionString,
      `
        select event_kind, event_name, metadata
        from memory_middleware.memory_events
        where id = $1::uuid
      `,
      [procurementRecord.accepted ? procurementRecord.procurementRecordId : ""],
    );

    expect(approvedListBefore).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      records: [
        expect.objectContaining({
          id: fixture.approvedMemoryId,
          reviewState: "approved",
        }),
      ],
    });
    expect(skillCandidatePlan).toMatchObject({
      accepted: true,
      status: "ok",
      procedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
      procedureStatus: "validated",
      sourceCandidateId: procedureCandidateId,
      latestValidationRunOutcome: "passed",
      eligible: true,
      possibleTargets: ["propose_skill_candidate", "remain_validated_procedure_only"],
    });
    expect(skillCandidateCreate).toMatchObject({
      accepted: true,
      status: "created",
      procedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
      skillCandidateStatus: "candidate",
      sourceCandidateId: procedureCandidateId,
    });
    expect(procurementPlan).toMatchObject({
      accepted: true,
      status: "ok",
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
      skillCandidateStatus: "candidate",
      eligible: true,
      possibleTargets: ["propose_procurement_handoff", "remain_internal_skill_candidate_only"],
      sourceProcedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
      sourceCandidateId: procedureCandidateId,
      latestValidationRunOutcome: "passed",
      rationale: [
        "skill candidate remains in bounded internal candidate state",
        "bounded lineage preserves validated procedure, candidate, review, event, and validation evidence",
      ],
      requiredGates: [
        "manual procurement handoff confirmation is still required",
        "Skill Vetter must be invoked explicitly outside this advisory slice",
        "minimum vetting outputs must be recorded before lifecycle advancement",
        "installation remains blocked until procurement and policy gates pass",
      ],
      handoff: expect.objectContaining({
        source: expect.objectContaining({
          skillCandidateId: skillCandidateCreate.accepted
            ? skillCandidateCreate.skillCandidateId
            : "",
          sourceProcedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
          sourceCandidateId: procedureCandidateId,
        }),
      }),
    });
    expect(procurementRecord).toMatchObject({
      accepted: true,
      status: "created",
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
      skillCandidateStatus: "candidate",
      sourceProcedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
      sourceCandidateId: procedureCandidateId,
      procurementRecordId: expect.any(String),
    });
    expect(skillVetterAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate Skill Vetter handoff mode is not enabled",
    });
    expect(vettingResultAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate vetting-result mode is not enabled",
    });
    expect(approvalPlanAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate approval planning mode is not enabled",
    });
    expect(installHandoffAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate install handoff mode is not enabled",
    });
    expect(proactiveAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      actionType: "run_drift_check",
      reason: "proactive execution mode is not enabled",
    });
    expect(backgroundJobAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      jobClass: "proactive_plan",
      reason: "background job scheduling mode is not enabled",
    });
    expect(selfImprovingAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      kind: "improvement",
      target: "candidate_only",
      reason: "self-improving candidate capture mode is not enabled",
    });
    expect(approvedListAfter).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      records: expect.arrayContaining([
        expect.objectContaining({
          id: fixture.approvedMemoryId,
          reviewState: "approved",
        }),
        expect.objectContaining({
          id: promotedMemoryObjectId,
          reviewState: "approved",
          readSurface: "approved_memory_view",
        }),
      ]),
    });
    expect(promotedMemory).toMatchObject({
      accepted: true,
      status: "ok",
      record: expect.objectContaining({
        id: promotedMemoryObjectId,
        reviewState: "approved",
        readSurface: "approved_memory_view",
        content:
          "Submit-review-promote-procedure-validate-skill-procurement rollout learning candidate write.",
      }),
    });
    expect(procurementRecordRow).toEqual({
      event_kind: "review",
      event_name: "skill_candidate.procurement_record",
      metadata: {
        source: "skill-candidate-procurement-record-tool",
        skillCandidateId: skillCandidateCreate.accepted
          ? skillCandidateCreate.skillCandidateId
          : "",
        sourceProcedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
        sourceCandidateId: procedureCandidateId,
        recorderAgentId: fixture.agentId,
        recordRationale: "Persist internal procurement handoff context only.",
        procurementRecordMetadata: {
          source: "submit-review-promote-procedure-validate-skill-procurement-rollout-test",
          path: "skill_candidate_procurement_record_create",
        },
      },
    });
    expect(learningReviewId).not.toBe("");
    expect(procedureReviewId).not.toBe("");
    expect(countsBefore).toEqual({
      memory_events: "2",
      memory_objects: "2",
      memory_reviews: "0",
      procedures: "1",
      procedure_runs: "0",
      skill_candidates: "0",
      memory_links: "0",
      memory_sources: "0",
      background_jobs: "0",
    });
    expect(countsAfter).toEqual({
      memory_events: "5",
      memory_objects: "5",
      memory_reviews: "2",
      procedures: "2",
      procedure_runs: "1",
      skill_candidates: "1",
      memory_links: "2",
      memory_sources: "4",
      background_jobs: "0",
    });
  });

  it("supports submit-review-promote-memory-procedure-validate-skill-procurement-vetting mode while approval and automation surfaces stay disabled", async () => {
    const fixture = await seedReadOnlyRetrievalFixture(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "submit-review-promote-memory-procedure-validate-skill-procurement-vetting",
      queryMode: "read-only",
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const approvedListBefore = await runtime.memoryObjectQuery.list({
      scope: "approved_only",
      projectId: fixture.projectId,
    });

    const learningSubmission = await runtime.candidateIngress.submitLearning({
      content:
        "Submit-review-promote-procedure-validate-skill-procurement-vetting rollout learning candidate write.",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-procurement-vetting-rollout-test",
        path: "candidate_submit_learning",
      },
    });
    expect(learningSubmission.accepted).toBe(true);
    const learningCandidateId = learningSubmission.accepted
      ? learningSubmission.memoryObjectId
      : fixture.candidateMemoryId;

    const procedureSubmission = await runtime.candidateIngress.submitProcedureSuggestion({
      content:
        "Step 1: collect the rollout evidence.\nStep 2: create the bounded procedure draft.\nStep 3: prepare the internal procurement and vetting records.",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-procurement-vetting-rollout-test",
        path: "candidate_submit_procedure",
      },
    });
    expect(procedureSubmission.accepted).toBe(true);
    const procedureCandidateId = procedureSubmission.accepted
      ? procedureSubmission.memoryObjectId
      : fixture.candidateMemoryId;

    const learningReview = await runtime.candidateReview.review({
      candidateId: learningCandidateId,
      outcome: "accepted",
      reviewerAgentId: fixture.agentId,
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-procurement-vetting-rollout-test",
        path: "candidate_review_learning",
      },
    });
    expect(learningReview.accepted).toBe(true);

    const procedureReview = await runtime.candidateReview.review({
      candidateId: procedureCandidateId,
      outcome: "accepted",
      reviewerAgentId: fixture.agentId,
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-procurement-vetting-rollout-test",
        path: "candidate_review_procedure",
      },
    });
    expect(procedureReview.accepted).toBe(true);

    const memoryPromotion = await runtime.candidatePromotion.promoteToMemory({
      candidateId: learningCandidateId,
      promoterAgentId: fixture.agentId,
      rationale: "Manual promotion into approved durable memory during bounded rollout.",
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-procurement-vetting-rollout-test",
        path: "candidate_promote_memory",
      },
    });
    const procedurePromotion = await runtime.candidatePromotion.promoteToProcedureDraft({
      candidateId: procedureCandidateId,
      promoterAgentId: fixture.agentId,
      title: "Bounded Procedure Draft For Manual Vetting",
      rationale: "Manual promotion into a bounded draft procedure during rollout.",
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-procurement-vetting-rollout-test",
        path: "candidate_promote_procedure",
      },
    });
    expect(memoryPromotion.accepted).toBe(true);
    expect(procedurePromotion.accepted).toBe(true);

    const validatedProcedure = await runtime.procedureValidation.validate({
      procedureId: procedurePromotion.accepted ? procedurePromotion.procedureId : "",
      validatorAgentId: fixture.agentId,
      rationale: "Validated after bounded review and preserved promotion lineage.",
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-procurement-vetting-rollout-test",
        path: "procedure_validate",
      },
    });
    expect(validatedProcedure.accepted).toBe(true);

    const skillCandidatePlan = await runtime.skillCandidatePlan.plan({
      procedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
    });
    const skillCandidateCreate = await runtime.skillCandidate.create({
      procedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
      creatorAgentId: fixture.agentId,
      rationale: "Create one bounded skill-candidate record only.",
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-procurement-vetting-rollout-test",
        path: "skill_candidate_create",
      },
    });
    expect(skillCandidatePlan.accepted).toBe(true);
    expect(skillCandidateCreate.accepted).toBe(true);

    const procurementPlan = await runtime.skillCandidateProcurementPlan.plan({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
    });
    const procurementRecord = await runtime.skillCandidateProcurementRecord.create({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
      recorderAgentId: fixture.agentId,
      rationale: "Persist internal procurement handoff context only.",
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-procurement-vetting-rollout-test",
        path: "skill_candidate_procurement_record_create",
      },
    });
    expect(procurementPlan.accepted).toBe(true);
    expect(procurementRecord.accepted).toBe(true);

    const skillVetterHandoff = await runtime.skillCandidateSkillVetterHandoff.plan({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
    });
    const vettingResult = await runtime.skillCandidateVettingResult.create({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
      decision: "approve_limited",
      reviewerAgentId: fixture.agentId,
      summary: "Manual Skill Vetter review completed for bounded limited use only.",
      permissionsRisk: {
        level: "medium",
        notes: ["file access needs explicit review before any install decision"],
        requiredChecks: ["verify runtime write surfaces remain bounded"],
      },
      suspiciousPatterns: {
        redFlags: ["no automatic install path should be enabled from this result"],
        unresolvedQuestions: ["review the exact packaged artifact before any install decision"],
      },
      operationalFit: {
        fit: "limited",
        notes: ["bounded candidate lineage is preserved", "use remains accelerator-only"],
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
      },
      approvalRecommendation: {
        proposedLifecycleState: "approved_limited",
        installRecommendation: "manual_followup_required",
        blockers: ["manual install approval remains out of scope for this slice"],
      },
      metadata: {
        source: "submit-review-promote-procedure-validate-skill-procurement-vetting-rollout-test",
        path: "skill_candidate_vetting_result_record",
      },
    });

    const approvalPlanAttempt = await runtime.skillCandidateApprovalPlan.plan({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
    });
    const installHandoffAttempt = await runtime.skillCandidateInstallHandoff.plan({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
    });
    const proactiveAttempt = await runtime.proactiveExecution.execute({
      actionType: "run_drift_check",
      projectId: fixture.projectId,
    });
    const backgroundJobAttempt = await runtime.backgroundJobs.enqueue({
      jobClass: "proactive_plan",
      projectId: fixture.projectId,
    });
    const selfImprovingAttempt = await runtime.selfImprovingCandidateCapture.capture({
      kind: "improvement",
      content:
        "submit-review-promote-memory-procedure-validate-skill-procurement-vetting should still block self-improving capture",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
    });

    const promotedMemoryObjectId = memoryPromotion.accepted
      ? memoryPromotion.promotedMemoryObjectId
      : "";
    const approvedListAfter = await runtime.memoryObjectQuery.list({
      scope: "approved_only",
      projectId: fixture.projectId,
    });
    const promotedMemory = await runtime.memoryObjectQuery.get({
      objectId: promotedMemoryObjectId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    const vettingEventRow = await querySingleRow<{
      event_kind: string;
      event_name: string;
      metadata: Record<string, unknown>;
    }>(
      dbEnvironment.connectionString,
      `
        select event_kind, event_name, metadata
        from memory_middleware.memory_events
        where id = $1::uuid
      `,
      [vettingResult.accepted ? vettingResult.vettingResultRecordId : ""],
    );

    expect(approvedListBefore).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      records: [
        expect.objectContaining({
          id: fixture.approvedMemoryId,
          reviewState: "approved",
        }),
      ],
    });
    expect(skillCandidatePlan).toMatchObject({
      accepted: true,
      status: "ok",
      procedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
      procedureStatus: "validated",
      sourceCandidateId: procedureCandidateId,
      latestValidationRunOutcome: "passed",
      eligible: true,
      possibleTargets: ["propose_skill_candidate", "remain_validated_procedure_only"],
    });
    expect(procurementPlan).toMatchObject({
      accepted: true,
      status: "ok",
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
      eligible: true,
      possibleTargets: ["propose_procurement_handoff", "remain_internal_skill_candidate_only"],
    });
    expect(skillVetterHandoff).toMatchObject({
      accepted: true,
      status: "ok",
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
      skillCandidateStatus: "candidate",
      procurementRecordId: procurementRecord.accepted ? procurementRecord.procurementRecordId : "",
      sourceProcedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
      sourceCandidateId: procedureCandidateId,
      latestValidationRunOutcome: "passed",
      eligible: true,
      possibleTargets: ["propose_skill_vetter_handoff", "remain_internal_only"],
    });
    expect(vettingResult).toMatchObject({
      accepted: true,
      status: "created",
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
      procurementRecordId: procurementRecord.accepted ? procurementRecord.procurementRecordId : "",
      decision: "approve_limited",
      skillCandidateStatus: "candidate",
      sourceProcedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
      sourceCandidateId: procedureCandidateId,
      vettingResultRecordId: expect.any(String),
    });
    expect(approvalPlanAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate approval planning mode is not enabled",
    });
    expect(installHandoffAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate install handoff mode is not enabled",
    });
    expect(proactiveAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      actionType: "run_drift_check",
      reason: "proactive execution mode is not enabled",
    });
    expect(backgroundJobAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      jobClass: "proactive_plan",
      reason: "background job scheduling mode is not enabled",
    });
    expect(selfImprovingAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      kind: "improvement",
      target: "candidate_only",
      reason: "self-improving candidate capture mode is not enabled",
    });
    expect(approvedListAfter).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      records: expect.arrayContaining([
        expect.objectContaining({
          id: fixture.approvedMemoryId,
          reviewState: "approved",
        }),
        expect.objectContaining({
          id: promotedMemoryObjectId,
          reviewState: "approved",
          readSurface: "approved_memory_view",
        }),
      ]),
    });
    expect(promotedMemory).toMatchObject({
      accepted: true,
      status: "ok",
      record: expect.objectContaining({
        id: promotedMemoryObjectId,
        reviewState: "approved",
        readSurface: "approved_memory_view",
        content:
          "Submit-review-promote-procedure-validate-skill-procurement-vetting rollout learning candidate write.",
      }),
    });
    expect(vettingEventRow).toEqual({
      event_kind: "review",
      event_name: "skill_candidate.vetting_result",
      metadata: {
        source: "skill-candidate-vetting-result-tool",
        skillCandidateId: skillCandidateCreate.accepted
          ? skillCandidateCreate.skillCandidateId
          : "",
        procurementRecordId: procurementRecord.accepted
          ? procurementRecord.procurementRecordId
          : "",
        vettingDecision: "approve_limited",
        sourceProcedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
        sourceCandidateId: procedureCandidateId,
        reviewerAgentId: fixture.agentId,
        vettingSummary: "Manual Skill Vetter review completed for bounded limited use only.",
        vettingResultMetadata: {
          source: "submit-review-promote-procedure-validate-skill-procurement-vetting-rollout-test",
          path: "skill_candidate_vetting_result_record",
        },
      },
    });
    expect(countsBefore).toEqual({
      memory_events: "2",
      memory_objects: "2",
      memory_reviews: "0",
      procedures: "1",
      procedure_runs: "0",
      skill_candidates: "0",
      memory_links: "0",
      memory_sources: "0",
      background_jobs: "0",
    });
    expect(countsAfter).toEqual({
      memory_events: "6",
      memory_objects: "5",
      memory_reviews: "2",
      procedures: "2",
      procedure_runs: "1",
      skill_candidates: "1",
      memory_links: "2",
      memory_sources: "4",
      background_jobs: "0",
    });
  });

  it("supports submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval mode while install and automation surfaces stay disabled", async () => {
    const fixture = await seedReadOnlyRetrievalFixture(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval",
      queryMode: "read-only",
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const approvedListBefore = await runtime.memoryObjectQuery.list({
      scope: "approved_only",
      projectId: fixture.projectId,
    });

    const learningSubmission = await runtime.candidateIngress.submitLearning({
      content:
        "Submit-review-promote-procedure-validate-skill-procurement-vetting-approval rollout learning candidate write.",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
      metadata: {
        source:
          "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-rollout-test",
        path: "candidate_submit_learning",
      },
    });
    expect(learningSubmission.accepted).toBe(true);
    const learningCandidateId = learningSubmission.accepted
      ? learningSubmission.memoryObjectId
      : fixture.candidateMemoryId;

    const procedureSubmission = await runtime.candidateIngress.submitProcedureSuggestion({
      content:
        "Step 1: collect the rollout evidence.\nStep 2: create the bounded procedure draft.\nStep 3: record procurement, vetting, and approval state.",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
      metadata: {
        source:
          "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-rollout-test",
        path: "candidate_submit_procedure",
      },
    });
    expect(procedureSubmission.accepted).toBe(true);
    const procedureCandidateId = procedureSubmission.accepted
      ? procedureSubmission.memoryObjectId
      : fixture.candidateMemoryId;

    const learningReview = await runtime.candidateReview.review({
      candidateId: learningCandidateId,
      outcome: "accepted",
      reviewerAgentId: fixture.agentId,
      metadata: {
        source:
          "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-rollout-test",
        path: "candidate_review_learning",
      },
    });
    expect(learningReview.accepted).toBe(true);

    const procedureReview = await runtime.candidateReview.review({
      candidateId: procedureCandidateId,
      outcome: "accepted",
      reviewerAgentId: fixture.agentId,
      metadata: {
        source:
          "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-rollout-test",
        path: "candidate_review_procedure",
      },
    });
    expect(procedureReview.accepted).toBe(true);
    const procedureReviewId = procedureReview.accepted ? procedureReview.reviewId : "";

    const memoryPromotion = await runtime.candidatePromotion.promoteToMemory({
      candidateId: learningCandidateId,
      promoterAgentId: fixture.agentId,
      rationale: "Manual promotion into approved durable memory during bounded rollout.",
      metadata: {
        source:
          "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-rollout-test",
        path: "candidate_promote_memory",
      },
    });
    const procedurePromotion = await runtime.candidatePromotion.promoteToProcedureDraft({
      candidateId: procedureCandidateId,
      promoterAgentId: fixture.agentId,
      title: "Bounded Procedure Draft For Approval",
      rationale: "Manual promotion into a bounded draft procedure during rollout.",
      metadata: {
        source:
          "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-rollout-test",
        path: "candidate_promote_procedure",
      },
    });
    expect(memoryPromotion.accepted).toBe(true);
    expect(procedurePromotion.accepted).toBe(true);

    const validatedProcedure = await runtime.procedureValidation.validate({
      procedureId: procedurePromotion.accepted ? procedurePromotion.procedureId : "",
      validatorAgentId: fixture.agentId,
      rationale: "Validated after bounded review and preserved promotion lineage.",
      metadata: {
        source:
          "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-rollout-test",
        path: "procedure_validate",
      },
    });
    expect(validatedProcedure.accepted).toBe(true);

    const skillCandidatePlan = await runtime.skillCandidatePlan.plan({
      procedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
    });
    const skillCandidateCreate = await runtime.skillCandidate.create({
      procedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
      creatorAgentId: fixture.agentId,
      rationale: "Create one bounded skill-candidate record only.",
      metadata: {
        source:
          "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-rollout-test",
        path: "skill_candidate_create",
      },
    });
    expect(skillCandidatePlan.accepted).toBe(true);
    expect(skillCandidateCreate.accepted).toBe(true);

    const procurementPlan = await runtime.skillCandidateProcurementPlan.plan({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
    });
    const procurementRecord = await runtime.skillCandidateProcurementRecord.create({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
      recorderAgentId: fixture.agentId,
      rationale: "Persist internal procurement handoff context only.",
      metadata: {
        source:
          "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-rollout-test",
        path: "skill_candidate_procurement_record_create",
      },
    });
    expect(procurementPlan.accepted).toBe(true);
    expect(procurementRecord.accepted).toBe(true);

    const skillVetterHandoff = await runtime.skillCandidateSkillVetterHandoff.plan({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
    });
    const vettingResult = await runtime.skillCandidateVettingResult.create({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
      decision: "approve_limited",
      reviewerAgentId: fixture.agentId,
      summary: "Manual Skill Vetter review completed for bounded limited use only.",
      permissionsRisk: {
        level: "medium",
        notes: ["file access needs explicit review before any install decision"],
        requiredChecks: ["verify runtime write surfaces remain bounded"],
      },
      suspiciousPatterns: {
        redFlags: ["no automatic install path should be enabled from this result"],
        unresolvedQuestions: ["review the exact packaged artifact before any install decision"],
      },
      operationalFit: {
        fit: "limited",
        notes: ["bounded candidate lineage is preserved", "use remains accelerator-only"],
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
      },
      approvalRecommendation: {
        proposedLifecycleState: "approved_limited",
        installRecommendation: "manual_followup_required",
        blockers: [],
      },
      metadata: {
        source:
          "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-rollout-test",
        path: "skill_candidate_vetting_result_record",
      },
    });
    expect(skillVetterHandoff.accepted).toBe(true);
    expect(vettingResult.accepted).toBe(true);

    const approvalPlan = await runtime.skillCandidateApprovalPlan.plan({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
    });
    const approvalWrite = await runtime.skillCandidateApproval.approve({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
      scope: "limited",
      approverAgentId: fixture.agentId,
      rationale: "Bounded limited approval recorded after manual vetting.",
      metadata: {
        source:
          "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-rollout-test",
        path: "skill_candidate_approve",
      },
    });

    const installHandoffAttempt = await runtime.skillCandidateInstallHandoff.plan({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
    });
    const proactiveAttempt = await runtime.proactiveExecution.execute({
      actionType: "run_drift_check",
      projectId: fixture.projectId,
    });
    const backgroundJobAttempt = await runtime.backgroundJobs.enqueue({
      jobClass: "proactive_plan",
      projectId: fixture.projectId,
    });
    const selfImprovingAttempt = await runtime.selfImprovingCandidateCapture.capture({
      kind: "improvement",
      content:
        "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval should still block self-improving capture",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
    });

    const promotedMemoryObjectId = memoryPromotion.accepted
      ? memoryPromotion.promotedMemoryObjectId
      : "";
    const approvedListAfter = await runtime.memoryObjectQuery.list({
      scope: "approved_only",
      projectId: fixture.projectId,
    });
    const promotedMemory = await runtime.memoryObjectQuery.get({
      objectId: promotedMemoryObjectId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    const approvalEventRow = await querySingleRow<{
      event_kind: string;
      event_name: string;
      metadata: Record<string, unknown>;
    }>(
      dbEnvironment.connectionString,
      `
        select event_kind, event_name, metadata
        from memory_middleware.memory_events
        where id = $1::uuid
      `,
      [approvalWrite.accepted ? approvalWrite.approvalRecordId : ""],
    );
    const skillCandidateRow = await querySingleRow<{
      status: string;
      source_procedure_id: string;
      metadata: Record<string, unknown>;
    }>(
      dbEnvironment.connectionString,
      `
        select
          status::text as status,
          source_procedure_id::text as source_procedure_id,
          metadata
        from memory_middleware.skill_candidates
        where id = $1::uuid
      `,
      [skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : ""],
    );

    expect(approvedListBefore).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      records: [expect.objectContaining({ id: fixture.approvedMemoryId, reviewState: "approved" })],
    });
    expect(approvalPlan).toMatchObject({
      accepted: true,
      status: "ok",
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
      skillCandidateStatus: "candidate",
      procurementRecordId: procurementRecord.accepted ? procurementRecord.procurementRecordId : "",
      vettingResultRecordId: vettingResult.accepted ? vettingResult.vettingResultRecordId : "",
      sourceProcedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
      sourceCandidateId: procedureCandidateId,
      latestValidationRunOutcome: "passed",
      latestVettingDecision: "approve_limited",
      eligible: true,
      possibleTargets: ["propose_approved_for_limited_use", "remain_internal_only"],
      remainingBlockers: [],
    });
    expect(approvalWrite).toMatchObject({
      accepted: true,
      status: "approved",
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
      approvalRecordId: expect.any(String),
      approvedScope: "limited",
      skillCandidateStatus: "approved_limited",
      procurementRecordId: procurementRecord.accepted ? procurementRecord.procurementRecordId : "",
      vettingResultRecordId: vettingResult.accepted ? vettingResult.vettingResultRecordId : "",
      sourceProcedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
      sourceCandidateId: procedureCandidateId,
    });
    expect(installHandoffAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      reason: "skill-candidate install handoff mode is not enabled",
    });
    expect(proactiveAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      actionType: "run_drift_check",
      reason: "proactive execution mode is not enabled",
    });
    expect(backgroundJobAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      jobClass: "proactive_plan",
      reason: "background job scheduling mode is not enabled",
    });
    expect(selfImprovingAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      kind: "improvement",
      target: "candidate_only",
      reason: "self-improving candidate capture mode is not enabled",
    });
    expect(approvedListAfter).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      records: expect.arrayContaining([
        expect.objectContaining({
          id: fixture.approvedMemoryId,
          reviewState: "approved",
        }),
        expect.objectContaining({
          id: promotedMemoryObjectId,
          reviewState: "approved",
          readSurface: "approved_memory_view",
        }),
      ]),
    });
    expect(promotedMemory).toMatchObject({
      accepted: true,
      status: "ok",
      record: expect.objectContaining({
        id: promotedMemoryObjectId,
        reviewState: "approved",
        readSurface: "approved_memory_view",
        content:
          "Submit-review-promote-procedure-validate-skill-procurement-vetting-approval rollout learning candidate write.",
      }),
    });
    expect(approvalEventRow).toEqual({
      event_kind: "review",
      event_name: "skill_candidate.approval",
      metadata: {
        source: "skill-candidate-approve-tool",
        skillCandidateId: skillCandidateCreate.accepted
          ? skillCandidateCreate.skillCandidateId
          : "",
        approvedScope: "limited",
        procurementRecordId: procurementRecord.accepted
          ? procurementRecord.procurementRecordId
          : "",
        vettingResultRecordId: vettingResult.accepted ? vettingResult.vettingResultRecordId : "",
        sourceProcedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
        sourceCandidateId: procedureCandidateId,
        approverAgentId: fixture.agentId,
        approvalRationale: "Bounded limited approval recorded after manual vetting.",
        approvalMetadata: {
          source:
            "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-rollout-test",
          path: "skill_candidate_approve",
        },
      },
    });
    expect(skillCandidateRow).toEqual({
      status: "approved_limited",
      source_procedure_id: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
      metadata: expect.objectContaining({
        source: "skill-candidate-create-tool",
        createdFromProcedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
        sourceCandidateId: procedureCandidateId,
        promotedFromReviewId: procedureReviewId,
        latestApprovalRecordId: approvalWrite.accepted ? approvalWrite.approvalRecordId : "",
        latestApprovedScope: "limited",
        latestApprovalProcurementRecordId: procurementRecord.accepted
          ? procurementRecord.procurementRecordId
          : "",
        latestApprovalVettingResultRecordId: vettingResult.accepted
          ? vettingResult.vettingResultRecordId
          : "",
        latestApproverAgentId: fixture.agentId,
      }),
    });
    expect(countsBefore).toEqual({
      memory_events: "2",
      memory_objects: "2",
      memory_reviews: "0",
      procedures: "1",
      procedure_runs: "0",
      skill_candidates: "0",
      memory_links: "0",
      memory_sources: "0",
      background_jobs: "0",
    });
    expect(countsAfter).toEqual({
      memory_events: "7",
      memory_objects: "5",
      memory_reviews: "2",
      procedures: "2",
      procedure_runs: "1",
      skill_candidates: "1",
      memory_links: "2",
      memory_sources: "4",
      background_jobs: "0",
    });
  });

  it("supports submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install mode while actual installation and automation surfaces stay disabled", async () => {
    const fixture = await seedReadOnlyRetrievalFixture(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install",
      queryMode: "read-only",
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const approvedListBefore = await runtime.memoryObjectQuery.list({
      scope: "approved_only",
      projectId: fixture.projectId,
    });

    const learningSubmission = await runtime.candidateIngress.submitLearning({
      content:
        "Submit-review-promote-procedure-validate-skill-procurement-vetting-approval-install rollout learning candidate write.",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
      metadata: {
        source:
          "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-install-rollout-test",
        path: "candidate_submit_learning",
      },
    });
    expect(learningSubmission.accepted).toBe(true);
    const learningCandidateId = learningSubmission.accepted
      ? learningSubmission.memoryObjectId
      : fixture.candidateMemoryId;

    const procedureSubmission = await runtime.candidateIngress.submitProcedureSuggestion({
      content:
        "Step 1: collect the rollout evidence.\nStep 2: create the bounded procedure draft.\nStep 3: record procurement, vetting, approval, and install lineage.",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
      metadata: {
        source:
          "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-install-rollout-test",
        path: "candidate_submit_procedure",
      },
    });
    expect(procedureSubmission.accepted).toBe(true);
    const procedureCandidateId = procedureSubmission.accepted
      ? procedureSubmission.memoryObjectId
      : fixture.candidateMemoryId;

    const learningReview = await runtime.candidateReview.review({
      candidateId: learningCandidateId,
      outcome: "accepted",
      reviewerAgentId: fixture.agentId,
      metadata: {
        source:
          "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-install-rollout-test",
        path: "candidate_review_learning",
      },
    });
    expect(learningReview.accepted).toBe(true);

    const procedureReview = await runtime.candidateReview.review({
      candidateId: procedureCandidateId,
      outcome: "accepted",
      reviewerAgentId: fixture.agentId,
      metadata: {
        source:
          "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-install-rollout-test",
        path: "candidate_review_procedure",
      },
    });
    expect(procedureReview.accepted).toBe(true);
    const procedureReviewId = procedureReview.accepted ? procedureReview.reviewId : "";

    const memoryPromotion = await runtime.candidatePromotion.promoteToMemory({
      candidateId: learningCandidateId,
      promoterAgentId: fixture.agentId,
      rationale: "Manual promotion into approved durable memory during bounded rollout.",
      metadata: {
        source:
          "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-install-rollout-test",
        path: "candidate_promote_memory",
      },
    });
    const procedurePromotion = await runtime.candidatePromotion.promoteToProcedureDraft({
      candidateId: procedureCandidateId,
      promoterAgentId: fixture.agentId,
      title: "Bounded Procedure Draft For Install",
      rationale: "Manual promotion into a bounded draft procedure during rollout.",
      metadata: {
        source:
          "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-install-rollout-test",
        path: "candidate_promote_procedure",
      },
    });
    expect(memoryPromotion.accepted).toBe(true);
    expect(procedurePromotion.accepted).toBe(true);

    const validatedProcedure = await runtime.procedureValidation.validate({
      procedureId: procedurePromotion.accepted ? procedurePromotion.procedureId : "",
      validatorAgentId: fixture.agentId,
      rationale: "Validated after bounded review and preserved promotion lineage.",
      metadata: {
        source:
          "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-install-rollout-test",
        path: "procedure_validate",
      },
    });
    expect(validatedProcedure.accepted).toBe(true);

    const skillCandidatePlan = await runtime.skillCandidatePlan.plan({
      procedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
    });
    const skillCandidateCreate = await runtime.skillCandidate.create({
      procedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
      creatorAgentId: fixture.agentId,
      rationale: "Create one bounded skill-candidate record only.",
      metadata: {
        source:
          "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-install-rollout-test",
        path: "skill_candidate_create",
      },
    });
    expect(skillCandidatePlan.accepted).toBe(true);
    expect(skillCandidateCreate.accepted).toBe(true);

    const procurementPlan = await runtime.skillCandidateProcurementPlan.plan({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
    });
    const procurementRecord = await runtime.skillCandidateProcurementRecord.create({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
      recorderAgentId: fixture.agentId,
      rationale: "Persist internal procurement handoff context only.",
      metadata: {
        source:
          "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-install-rollout-test",
        path: "skill_candidate_procurement_record_create",
      },
    });
    expect(procurementPlan.accepted).toBe(true);
    expect(procurementRecord.accepted).toBe(true);

    const skillVetterHandoff = await runtime.skillCandidateSkillVetterHandoff.plan({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
    });
    const vettingResult = await runtime.skillCandidateVettingResult.create({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
      decision: "approve_limited",
      reviewerAgentId: fixture.agentId,
      summary: "Manual Skill Vetter review completed for bounded limited use only.",
      permissionsRisk: {
        level: "medium",
        notes: ["file access needs explicit review before any install decision"],
        requiredChecks: ["verify runtime write surfaces remain bounded"],
      },
      suspiciousPatterns: {
        redFlags: ["no automatic install path should be enabled from this result"],
        unresolvedQuestions: ["review the exact packaged artifact before any install decision"],
      },
      operationalFit: {
        fit: "limited",
        notes: ["bounded candidate lineage is preserved", "use remains accelerator-only"],
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
      },
      approvalRecommendation: {
        proposedLifecycleState: "approved_limited",
        installRecommendation: "manual_followup_required",
        blockers: [],
      },
      metadata: {
        source:
          "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-install-rollout-test",
        path: "skill_candidate_vetting_result_record",
      },
    });
    expect(skillVetterHandoff.accepted).toBe(true);
    expect(vettingResult.accepted).toBe(true);

    const approvalPlan = await runtime.skillCandidateApprovalPlan.plan({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
    });
    const approvalWrite = await runtime.skillCandidateApproval.approve({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
      scope: "limited",
      approverAgentId: fixture.agentId,
      rationale: "Bounded limited approval recorded after manual vetting.",
      metadata: {
        source:
          "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-install-rollout-test",
        path: "skill_candidate_approve",
      },
    });
    expect(approvalPlan.accepted).toBe(true);
    expect(approvalWrite.accepted).toBe(true);

    const installHandoff = await runtime.skillCandidateInstallHandoff.plan({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
    });
    const installRecord = await runtime.skillCandidateInstallRecord.create({
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
      installerAgentId: fixture.agentId,
      installNotes: "Manual install completed separately by operator.",
      metadata: {
        source:
          "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-install-rollout-test",
        path: "skill_candidate_install_record_create",
      },
    });
    const proactiveAttempt = await runtime.proactiveExecution.execute({
      actionType: "run_drift_check",
      projectId: fixture.projectId,
    });
    const backgroundJobAttempt = await runtime.backgroundJobs.enqueue({
      jobClass: "proactive_plan",
      projectId: fixture.projectId,
    });
    const selfImprovingAttempt = await runtime.selfImprovingCandidateCapture.capture({
      kind: "improvement",
      content:
        "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install should still block self-improving capture",
      projectId: fixture.projectId,
      agentId: fixture.agentId,
      sessionId: fixture.sessionId,
    });

    const promotedMemoryObjectId = memoryPromotion.accepted
      ? memoryPromotion.promotedMemoryObjectId
      : "";
    const approvedListAfter = await runtime.memoryObjectQuery.list({
      scope: "approved_only",
      projectId: fixture.projectId,
    });
    const promotedMemory = await runtime.memoryObjectQuery.get({
      objectId: promotedMemoryObjectId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);
    const installEventRow = await querySingleRow<{
      event_kind: string;
      event_name: string;
      metadata: Record<string, unknown>;
    }>(
      dbEnvironment.connectionString,
      `
        select event_kind, event_name, metadata
        from memory_middleware.memory_events
        where id = $1::uuid
      `,
      [installRecord.accepted ? installRecord.installRecordId : ""],
    );
    const skillCandidateRow = await querySingleRow<{
      status: string;
      source_procedure_id: string;
      metadata: Record<string, unknown>;
    }>(
      dbEnvironment.connectionString,
      `
        select
          status::text as status,
          source_procedure_id::text as source_procedure_id,
          metadata
        from memory_middleware.skill_candidates
        where id = $1::uuid
      `,
      [skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : ""],
    );

    expect(approvedListBefore).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      records: [expect.objectContaining({ id: fixture.approvedMemoryId, reviewState: "approved" })],
    });
    expect(installHandoff).toMatchObject({
      accepted: true,
      status: "ok",
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
      skillCandidateStatus: "approved_limited",
      approvalRecordId: approvalWrite.accepted ? approvalWrite.approvalRecordId : "",
      procurementRecordId: procurementRecord.accepted ? procurementRecord.procurementRecordId : "",
      vettingResultRecordId: vettingResult.accepted ? vettingResult.vettingResultRecordId : "",
      sourceProcedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
      sourceCandidateId: procedureCandidateId,
      eligible: true,
      possibleTargets: ["propose_manual_install_handoff", "remain_approved_internal_only"],
      remainingBlockers: [],
    });
    expect(installRecord).toMatchObject({
      accepted: true,
      status: "created",
      skillCandidateId: skillCandidateCreate.accepted ? skillCandidateCreate.skillCandidateId : "",
      installRecordId: expect.any(String),
      installedScope: "limited",
      skillCandidateStatus: "approved_limited",
      approvalRecordId: approvalWrite.accepted ? approvalWrite.approvalRecordId : "",
      procurementRecordId: procurementRecord.accepted ? procurementRecord.procurementRecordId : "",
      vettingResultRecordId: vettingResult.accepted ? vettingResult.vettingResultRecordId : "",
      sourceProcedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
      sourceCandidateId: procedureCandidateId,
    });
    expect(proactiveAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      actionType: "run_drift_check",
      reason: "proactive execution mode is not enabled",
    });
    expect(backgroundJobAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      jobClass: "proactive_plan",
      reason: "background job scheduling mode is not enabled",
    });
    expect(selfImprovingAttempt).toMatchObject({
      accepted: false,
      status: "disabled",
      kind: "improvement",
      target: "candidate_only",
      reason: "self-improving candidate capture mode is not enabled",
    });
    expect(approvedListAfter).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      records: expect.arrayContaining([
        expect.objectContaining({
          id: fixture.approvedMemoryId,
          reviewState: "approved",
        }),
        expect.objectContaining({
          id: promotedMemoryObjectId,
          reviewState: "approved",
          readSurface: "approved_memory_view",
        }),
      ]),
    });
    expect(promotedMemory).toMatchObject({
      accepted: true,
      status: "ok",
      record: expect.objectContaining({
        id: promotedMemoryObjectId,
        reviewState: "approved",
        readSurface: "approved_memory_view",
        content:
          "Submit-review-promote-procedure-validate-skill-procurement-vetting-approval-install rollout learning candidate write.",
      }),
    });
    expect(installEventRow).toEqual({
      event_kind: "review",
      event_name: "skill_candidate.install_record",
      metadata: {
        source: "skill-candidate-install-record-create-tool",
        skillCandidateId: skillCandidateCreate.accepted
          ? skillCandidateCreate.skillCandidateId
          : "",
        installedScope: "limited",
        approvalRecordId: approvalWrite.accepted ? approvalWrite.approvalRecordId : "",
        procurementRecordId: procurementRecord.accepted
          ? procurementRecord.procurementRecordId
          : "",
        vettingResultRecordId: vettingResult.accepted ? vettingResult.vettingResultRecordId : "",
        sourceProcedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
        sourceCandidateId: procedureCandidateId,
        installerAgentId: fixture.agentId,
        installNotes: "Manual install completed separately by operator.",
        installMetadata: {
          source:
            "submit-review-promote-procedure-validate-skill-procurement-vetting-approval-install-rollout-test",
          path: "skill_candidate_install_record_create",
        },
      },
    });
    expect(skillCandidateRow).toEqual({
      status: "approved_limited",
      source_procedure_id: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
      metadata: expect.objectContaining({
        source: "skill-candidate-create-tool",
        createdFromProcedureId: validatedProcedure.accepted ? validatedProcedure.procedureId : "",
        sourceCandidateId: procedureCandidateId,
        promotedFromReviewId: procedureReviewId,
        latestApprovalRecordId: approvalWrite.accepted ? approvalWrite.approvalRecordId : "",
        latestApprovedScope: "limited",
        latestApprovalProcurementRecordId: procurementRecord.accepted
          ? procurementRecord.procurementRecordId
          : "",
        latestApprovalVettingResultRecordId: vettingResult.accepted
          ? vettingResult.vettingResultRecordId
          : "",
        latestApproverAgentId: fixture.agentId,
      }),
    });
    expect(countsBefore).toEqual({
      memory_events: "2",
      memory_objects: "2",
      memory_reviews: "0",
      procedures: "1",
      procedure_runs: "0",
      skill_candidates: "0",
      memory_links: "0",
      memory_sources: "0",
      background_jobs: "0",
    });
    expect(countsAfter).toEqual({
      memory_events: "8",
      memory_objects: "5",
      memory_reviews: "2",
      procedures: "2",
      procedure_runs: "1",
      skill_candidates: "1",
      memory_links: "2",
      memory_sources: "4",
      background_jobs: "0",
    });
  });

  it("keeps candidate objects hidden unless candidate scope is explicitly requested", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({ runtime });
    const listTool = createMemoryObjectListTool({ runtime });
    const getTool = createMemoryObjectGetTool({ runtime });
    const searchTool = createMemoryObjectSearchBasicTool({ runtime });

    const submission = await submitTool.execute("call-51", {
      kind: "correction" satisfies CandidateSubmissionKind,
      content: "Candidate-only retrieval check.",
      projectId: seeded.projectId,
      agentId: seeded.agentId,
      sessionId: seeded.sessionId,
    });
    const candidateId = (submission.details as { memoryObjectId: string }).memoryObjectId;

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);

    const hiddenList = await listTool.execute("call-52", {
      scope: "approved_only",
      projectId: seeded.projectId,
    });
    const hiddenGet = await getTool.execute("call-53", {
      objectId: candidateId,
    });
    const visibleList = await listTool.execute("call-54", {
      scope: "include_candidates",
      projectId: seeded.projectId,
    });
    const visibleGet = await getTool.execute("call-55", {
      objectId: candidateId,
      scope: "include_candidates",
    });
    const visibleSearch = await searchTool.execute("call-56", {
      query: "retrieval check",
      scope: "include_candidates",
    });

    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(countsAfter).toEqual(countsBefore);
    expect(hiddenList.details).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      records: [],
    });
    expect(hiddenGet.details).toMatchObject({
      accepted: false,
      status: "not_found",
    });
    expect(visibleList.details).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "include_candidates",
      records: [
        expect.objectContaining({
          objectType: "memory_object",
          readSurface: "reviewable_candidates_view",
          id: candidateId,
          reviewState: "candidate",
        }),
      ],
    });
    expect(visibleGet.details).toMatchObject({
      accepted: true,
      status: "ok",
      record: expect.objectContaining({
        objectType: "memory_object",
        readSurface: "reviewable_candidates_view",
        id: candidateId,
        reviewState: "candidate",
      }),
    });
    expect(visibleSearch.details).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "include_candidates",
      records: [
        expect.objectContaining({
          objectType: "memory_object",
          readSurface: "reviewable_candidates_view",
          id: candidateId,
        }),
      ],
    });
  });

  it("retrieves validated procedures only when validated-procedure scope is explicitly requested", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({ runtime });
    const reviewTool = createCandidateReviewTool({ runtime });
    const promoteProcedureTool = createCandidatePromoteProcedureTool({ runtime });
    const validateProcedureTool = createProcedureValidateTool({ runtime });
    const listTool = createMemoryObjectListTool({ runtime });
    const getTool = createMemoryObjectGetTool({ runtime });
    const searchTool = createMemoryObjectSearchBasicTool({ runtime });

    const submission = await submitTool.execute("call-57", {
      kind: "procedure" satisfies CandidateSubmissionKind,
      content: "Validated procedure retrieval body.",
      projectId: seeded.projectId,
      agentId: seeded.agentId,
      sessionId: seeded.sessionId,
    });
    const candidateId = (submission.details as { memoryObjectId: string }).memoryObjectId;

    await reviewTool.execute("call-58", {
      candidateId,
      outcome: "accepted",
    });

    const promotion = await promoteProcedureTool.execute("call-59", {
      candidateId,
      title: "Validated procedure retrieval title",
    });
    const procedureId = (promotion.details as { procedureId: string }).procedureId;

    await validateProcedureTool.execute("call-60", {
      procedureId,
      rationale: "validate for bounded retrieval",
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);

    const hiddenGet = await getTool.execute("call-61", {
      objectId: procedureId,
    });
    const visibleList = await listTool.execute("call-62", {
      scope: "include_validated_procedures",
      kind: "procedure",
      projectId: seeded.projectId,
    });
    const visibleGet = await getTool.execute("call-63", {
      objectId: procedureId,
      scope: "include_validated_procedures",
    });
    const visibleSearch = await searchTool.execute("call-64", {
      query: "retrieval title",
      scope: "include_validated_procedures",
      kind: "procedure",
    });

    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(countsAfter).toEqual(countsBefore);
    expect(hiddenGet.details).toMatchObject({
      accepted: false,
      status: "not_found",
    });
    expect(visibleList.details).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "include_validated_procedures",
      records: [
        expect.objectContaining({
          objectType: "procedure",
          readSurface: "validated_procedure_read_model",
          id: procedureId,
          status: "validated",
        }),
      ],
    });
    expect(visibleGet.details).toMatchObject({
      accepted: true,
      status: "ok",
      record: expect.objectContaining({
        objectType: "procedure",
        readSurface: "validated_procedure_read_model",
        id: procedureId,
        status: "validated",
      }),
    });
    expect(visibleSearch.details).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "include_validated_procedures",
      records: [
        expect.objectContaining({
          objectType: "procedure",
          readSurface: "validated_procedure_read_model",
          id: procedureId,
        }),
      ],
    });
  });

  it("returns disabled for bounded memory-object retrieval before touching the database when mode is off", async () => {
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const listTool = createMemoryObjectListTool({ runtime });
    const getTool = createMemoryObjectGetTool({ runtime });
    const searchTool = createMemoryObjectSearchBasicTool({ runtime });

    await expect(listTool.execute("call-65", {})).resolves.toMatchObject({
      details: {
        accepted: false,
        status: "disabled",
        reason: "memory object query mode is not enabled",
      },
    });
    await expect(
      getTool.execute("call-66", {
        objectId: "00000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toMatchObject({
      details: {
        accepted: false,
        status: "disabled",
        reason: "memory object query mode is not enabled",
      },
    });
    await expect(
      searchTool.execute("call-67", {
        query: "bounded",
      }),
    ).resolves.toMatchObject({
      details: {
        accepted: false,
        status: "disabled",
        reason: "memory object query mode is not enabled",
      },
    });
  });

  it("fails cleanly for bounded memory-object retrieval when the configured database endpoint is unavailable", async () => {
    const runtime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const listTool = createMemoryObjectListTool({ runtime });
    const getTool = createMemoryObjectGetTool({ runtime });
    const searchTool = createMemoryObjectSearchBasicTool({ runtime });

    await expect(listTool.execute("call-68", {})).resolves.toMatchObject({
      details: {
        accepted: false,
        status: "failed",
      },
    });
    await expect(
      getTool.execute("call-69", {
        objectId: "00000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toMatchObject({
      details: {
        accepted: false,
        status: "failed",
      },
    });
    await expect(
      searchTool.execute("call-70", {
        query: "bounded",
      }),
    ).resolves.toMatchObject({
      details: {
        accepted: false,
        status: "failed",
      },
    });
  });

  it("returns ranked hybrid retrieval results for approved memory objects and explicitly requested validated procedures", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({ runtime });
    const reviewTool = createCandidateReviewTool({ runtime });
    const promoteMemoryTool = createCandidatePromoteMemoryTool({ runtime });
    const promoteProcedureTool = createCandidatePromoteProcedureTool({ runtime });
    const validateProcedureTool = createProcedureValidateTool({ runtime });
    const searchHybridTool = createMemoryObjectSearchHybridTool({ runtime });

    const memorySubmission = await submitTool.execute("call-71", {
      kind: "learning" satisfies CandidateSubmissionKind,
      content: "Deploy agent safely with the bounded rollout checklist.",
      projectId: seeded.projectId,
      agentId: seeded.agentId,
      sessionId: seeded.sessionId,
    });
    const memoryCandidateId = (memorySubmission.details as { memoryObjectId: string })
      .memoryObjectId;
    await reviewTool.execute("call-72", {
      candidateId: memoryCandidateId,
      outcome: "accepted",
    });
    await promoteMemoryTool.execute("call-73", {
      candidateId: memoryCandidateId,
    });

    const procedureSubmission = await submitTool.execute("call-74", {
      kind: "procedure" satisfies CandidateSubmissionKind,
      content: "Deploy agent patch in a bounded canary sequence.",
      projectId: seeded.projectId,
      agentId: seeded.agentId,
      sessionId: seeded.sessionId,
    });
    const procedureCandidateId = (procedureSubmission.details as { memoryObjectId: string })
      .memoryObjectId;
    await reviewTool.execute("call-75", {
      candidateId: procedureCandidateId,
      outcome: "accepted",
    });
    const procedurePromotion = await promoteProcedureTool.execute("call-76", {
      candidateId: procedureCandidateId,
      title: "Deploy agent patch",
    });
    const procedureId = (procedurePromotion.details as { procedureId: string }).procedureId;
    await validateProcedureTool.execute("call-77", {
      procedureId,
      rationale: "validate ranked retrieval",
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await searchHybridTool.execute("call-78", {
      query: "deploy agent",
      scope: "include_validated_procedures",
      projectId: seeded.projectId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(countsAfter).toEqual(countsBefore);
    expect(result.details).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "include_validated_procedures",
      query: "deploy agent",
    });
    const records = (
      result.details as {
        records: Array<{
          objectType: string;
          readSurface: string;
          score: number;
          matchedFields: string[];
        }>;
      }
    ).records;
    expect(records.length).toBeGreaterThanOrEqual(2);
    expect(records[0]?.objectType).toBe("procedure");
    expect(records[0]?.readSurface).toBe("validated_procedure_read_model");
    expect(records[0]?.score).toBeGreaterThan(records[1]?.score ?? 0);
    expect(records[0]?.matchedFields).toContain("fts_search_document");
  });

  it("keeps candidate memory out of ranked hybrid retrieval unless candidate scope is explicit", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({ runtime });
    const searchHybridTool = createMemoryObjectSearchHybridTool({ runtime });

    await submitTool.execute("call-79", {
      kind: "improvement" satisfies CandidateSubmissionKind,
      content: "Hidden hybrid candidate rollout note.",
      projectId: seeded.projectId,
      agentId: seeded.agentId,
      sessionId: seeded.sessionId,
    });

    const hidden = await searchHybridTool.execute("call-80", {
      query: "rollout note",
      scope: "approved_only",
      projectId: seeded.projectId,
    });
    const visible = await searchHybridTool.execute("call-81", {
      query: "rollout note",
      scope: "include_candidates",
      projectId: seeded.projectId,
    });

    expect(hidden.details).toMatchObject({
      accepted: true,
      status: "ok",
      records: [],
    });
    expect(visible.details).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "include_candidates",
      records: [
        expect.objectContaining({
          objectType: "memory_object",
          readSurface: "reviewable_candidates_view",
          reviewState: "candidate",
        }),
      ],
    });
  });

  it("returns bounded semantic retrieval results from memory_embeddings for approved memory and explicitly requested validated procedures", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({ runtime });
    const reviewTool = createCandidateReviewTool({ runtime });
    const promoteMemoryTool = createCandidatePromoteMemoryTool({ runtime });
    const promoteProcedureTool = createCandidatePromoteProcedureTool({ runtime });
    const validateProcedureTool = createProcedureValidateTool({ runtime });
    const semanticTool = createMemoryObjectSearchSemanticTool({ runtime });

    const memorySubmission = await submitTool.execute("call-82", {
      kind: "learning" satisfies CandidateSubmissionKind,
      content: "Approved semantic memory about deployment guardrails.",
      projectId: seeded.projectId,
      agentId: seeded.agentId,
      sessionId: seeded.sessionId,
    });
    const memoryCandidateId = (memorySubmission.details as { memoryObjectId: string })
      .memoryObjectId;
    await reviewTool.execute("call-83", {
      candidateId: memoryCandidateId,
      outcome: "accepted",
    });
    const memoryPromotion = await promoteMemoryTool.execute("call-84", {
      candidateId: memoryCandidateId,
    });
    const approvedMemoryId = (memoryPromotion.details as { promotedMemoryObjectId: string })
      .promotedMemoryObjectId;

    const procedureSubmission = await submitTool.execute("call-85", {
      kind: "procedure" satisfies CandidateSubmissionKind,
      content: "Procedure candidate describing staged deployment rollout.",
      projectId: seeded.projectId,
      agentId: seeded.agentId,
      sessionId: seeded.sessionId,
    });
    const procedureCandidateId = (procedureSubmission.details as { memoryObjectId: string })
      .memoryObjectId;
    await reviewTool.execute("call-86", {
      candidateId: procedureCandidateId,
      outcome: "accepted",
    });
    const procedurePromotion = await promoteProcedureTool.execute("call-87", {
      candidateId: procedureCandidateId,
      title: "Staged deployment rollout",
    });
    const procedureId = (procedurePromotion.details as { procedureId: string }).procedureId;
    await validateProcedureTool.execute("call-88", {
      procedureId,
      rationale: "validate for semantic retrieval",
    });

    const procedureRow = await querySingleRow<{ source_memory_object_id: string }>(
      dbEnvironment.connectionString,
      `
        select source_memory_object_id::text as source_memory_object_id
        from memory_middleware.procedures
        where id = $1::uuid
      `,
      [procedureId],
    );
    expect(procedureRow?.source_memory_object_id).toBeTruthy();

    await insertMemoryEmbedding({
      connectionString: dbEnvironment.connectionString,
      memoryObjectId: approvedMemoryId,
      embeddingModel: "test-semantic",
      embeddingVersion: "v1",
      embedding: [0.9, 0.1, 0],
      chunkText: "Approved semantic memory about deployment guardrails.",
    });
    await insertMemoryEmbedding({
      connectionString: dbEnvironment.connectionString,
      memoryObjectId: procedureRow?.source_memory_object_id ?? "",
      embeddingModel: "test-semantic",
      embeddingVersion: "v1",
      embedding: [0.05, 0.95, 0],
      chunkText: "Procedure candidate describing staged deployment rollout.",
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const approvedOnly = await semanticTool.execute("call-89", {
      embedding: [0.8, 0.2, 0],
      embeddingModel: "test-semantic",
      embeddingVersion: "v1",
      scope: "approved_only",
      projectId: seeded.projectId,
    });
    const withProcedures = await semanticTool.execute("call-90", {
      embedding: [0.1, 0.9, 0],
      embeddingModel: "test-semantic",
      embeddingVersion: "v1",
      scope: "include_validated_procedures",
      projectId: seeded.projectId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(countsAfter).toEqual(countsBefore);
    expect(approvedOnly.details).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      embeddingModel: "test-semantic",
      embeddingVersion: "v1",
      records: [
        expect.objectContaining({
          objectType: "memory_object",
          readSurface: "approved_memory_view",
          id: approvedMemoryId,
          matchedFields: ["semantic_embedding"],
        }),
      ],
    });
    const approvedOnlyRecords = (
      approvedOnly.details as {
        records: Array<{ objectType: string; id: string; distance: number; score: number }>;
      }
    ).records;
    expect(approvedOnlyRecords).toHaveLength(1);
    expect(approvedOnlyRecords[0]?.distance).toBeGreaterThanOrEqual(0);
    expect(approvedOnlyRecords[0]?.score).toBeGreaterThan(0);

    expect(withProcedures.details).toMatchObject({
      accepted: true,
      status: "ok",
      scope: "include_validated_procedures",
      embeddingModel: "test-semantic",
      embeddingVersion: "v1",
    });
    const semanticRecords = (
      withProcedures.details as {
        records: Array<{
          objectType: string;
          readSurface: string;
          id: string;
          distance: number;
          score: number;
          matchedFields: string[];
          embeddingModel: string;
          embeddingVersion: string;
        }>;
      }
    ).records;
    expect(semanticRecords.length).toBeGreaterThanOrEqual(2);
    expect(semanticRecords[0]?.objectType).toBe("procedure");
    expect(semanticRecords[0]?.readSurface).toBe("validated_procedure_read_model");
    expect(semanticRecords[0]?.id).toBe(procedureId);
    expect(semanticRecords[0]?.matchedFields).toEqual(["semantic_embedding"]);
    expect(semanticRecords[0]?.embeddingModel).toBe("test-semantic");
    expect(semanticRecords[0]?.embeddingVersion).toBe("v1");
    expect(semanticRecords[0]?.score).toBeGreaterThan(semanticRecords[1]?.score ?? 0);
  });

  it("returns empty semantic retrieval results when matching embeddings are absent", async () => {
    const seeded = await seedContext(dbEnvironment.connectionString);
    const runtime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "candidate-only",
    });
    const submitTool = createCandidateSubmitTool({ runtime });
    const reviewTool = createCandidateReviewTool({ runtime });
    const promoteMemoryTool = createCandidatePromoteMemoryTool({ runtime });
    const semanticTool = createMemoryObjectSearchSemanticTool({ runtime });

    const submission = await submitTool.execute("call-91", {
      kind: "learning" satisfies CandidateSubmissionKind,
      content: "Approved memory with no semantic embedding yet.",
      projectId: seeded.projectId,
      agentId: seeded.agentId,
      sessionId: seeded.sessionId,
    });
    const candidateId = (submission.details as { memoryObjectId: string }).memoryObjectId;
    await reviewTool.execute("call-92", {
      candidateId,
      outcome: "accepted",
    });
    await promoteMemoryTool.execute("call-93", {
      candidateId,
    });

    const countsBefore = await readTableCounts(dbEnvironment.connectionString);
    const result = await semanticTool.execute("call-94", {
      embedding: [0.4, 0.4, 0.2],
      embeddingModel: "missing-model",
      embeddingVersion: "v1",
      scope: "approved_only",
      projectId: seeded.projectId,
    });
    const countsAfter = await readTableCounts(dbEnvironment.connectionString);

    expect(countsAfter).toEqual(countsBefore);
    expect(result.details).toEqual({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      embeddingModel: "missing-model",
      embeddingVersion: "v1",
      records: [],
    });
  });

  it("returns disabled and unavailable results for bounded hybrid retrieval without writes", async () => {
    const disabledRuntime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const disabledTool = createMemoryObjectSearchHybridTool({ runtime: disabledRuntime });

    await expect(
      disabledTool.execute("call-82", {
        query: "deploy",
      }),
    ).resolves.toMatchObject({
      details: {
        accepted: false,
        status: "disabled",
        reason: "memory object query mode is not enabled",
      },
    });

    const unavailableRuntime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const unavailableTool = createMemoryObjectSearchHybridTool({ runtime: unavailableRuntime });

    await expect(
      unavailableTool.execute("call-83", {
        query: "deploy",
      }),
    ).resolves.toMatchObject({
      details: {
        accepted: false,
        status: "failed",
      },
    });
  });

  it("returns disabled and unavailable results for bounded semantic retrieval without writes", async () => {
    const disabledRuntime = createRuntime({
      connectionString: dbEnvironment.connectionString,
      mode: "disabled",
    });
    const disabledTool = createMemoryObjectSearchSemanticTool({ runtime: disabledRuntime });

    await expect(
      disabledTool.execute("call-95", {
        embedding: [0.1, 0.2, 0.3],
        embeddingModel: "test-semantic",
        embeddingVersion: "v1",
      }),
    ).resolves.toMatchObject({
      details: {
        accepted: false,
        status: "disabled",
        reason: "memory object query mode is not enabled",
      },
    });

    const unavailableRuntime = createRuntime({
      connectionString:
        "postgresql://postgres@127.0.0.1:1/memory_middleware_test?connect_timeout=1",
      mode: "candidate-only",
    });
    const unavailableTool = createMemoryObjectSearchSemanticTool({ runtime: unavailableRuntime });

    await expect(
      unavailableTool.execute("call-96", {
        embedding: [0.1, 0.2, 0.3],
        embeddingModel: "test-semantic",
        embeddingVersion: "v1",
      }),
    ).resolves.toMatchObject({
      details: {
        accepted: false,
        status: "failed",
      },
    });
  });
});
