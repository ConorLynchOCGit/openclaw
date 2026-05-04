import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { SqlClient } from "../db/sql-client.ts";
import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
import type {
  WorkItem,
  WorkItemArtifact,
  WorkItemAssignment,
  WorkItemDependency,
  WorkItemEvent,
  WorkItemLifecycleState,
  WorkItemParentWorkflowLink,
  WorkItemTruth,
  WorkItemVersion,
  WorkQueueReadModelItem,
  WorkRun,
  WorkRunExecutorKind,
  WorkRunState,
  WorkStep,
  WorkStepState,
} from "./types.ts";

type WorkItemRow = QueryResultRow & {
  work_item_id: string;
  item_type: string;
  title: string;
  description: string | null;
  lifecycle_state: WorkItemLifecycleState;
  current_version_id: string | null;
  metadata: JsonValue;
  created_at: Date | string;
  updated_at: Date | string;
};

type WorkItemVersionRow = QueryResultRow & {
  version_id: string;
  work_item_id: string;
  version_number: number;
  version_state: "draft" | "finalized";
  title: string | null;
  body: string | null;
  artifact_metadata: JsonValue;
  created_at: Date | string;
  finalized_at: Date | string | null;
};

type WorkItemArtifactRow = QueryResultRow & {
  artifact_id: string;
  work_item_id: string;
  version_id: string | null;
  artifact_type: string;
  storage_kind: string;
  uri: string;
  content_type: string | null;
  size_bytes: number | string | null;
  sha256: string | null;
  metadata: JsonValue;
  created_at: Date | string;
};

type WorkItemEventRow = QueryResultRow & {
  event_id: string;
  work_item_id: string;
  run_id: string | null;
  step_id: string | null;
  event_type: string;
  lifecycle_state: WorkItemLifecycleState | null;
  event_time: Date | string;
  actor_id: string | null;
  data: JsonValue;
};

type WorkRunRow = QueryResultRow & {
  run_id: string;
  work_item_id: string;
  executor_kind: WorkRunExecutorKind;
  runtime_job_id: string | null;
  runtime_job_type: string | null;
  run_state: WorkRunState;
  metadata: JsonValue;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type WorkStepRow = QueryResultRow & {
  step_id: string;
  run_id: string;
  work_item_id: string;
  step_type: string;
  step_name: string;
  step_state: WorkStepState;
  runtime_job_id: string | null;
  metadata: JsonValue;
  result: JsonValue | null;
  error: JsonValue | null;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type WorkItemAssignmentRow = QueryResultRow & {
  assignment_id: string;
  work_item_id: string;
  assignee_type: string;
  assignee_id: string;
  role: string;
  metadata: JsonValue;
  created_at: Date | string;
};

type WorkItemDependencyRow = QueryResultRow & {
  dependency_id: string;
  work_item_id: string;
  depends_on_work_item_id: string;
  dependency_type: string;
  metadata: JsonValue;
  created_at: Date | string;
};

type WorkItemParentWorkflowLinkRow = QueryResultRow & {
  link_id: string;
  work_item_id: string;
  parent_workflow_id: string;
  parent_workflow_kind: string;
  metadata: JsonValue;
  created_at: Date | string;
};

export type WorkQueueRepositoryOptions = {
  now?: () => Date;
  maxJsonBytes?: number;
};

export type CreateWorkItemInput = {
  workItemId?: string;
  itemType: string;
  title: string;
  description?: string | null;
  metadata?: JsonValue;
  actorId?: string | null;
};

export type CreateWorkItemVersionInput = {
  versionId?: string;
  workItemId: string;
  title?: string | null;
  body?: string | null;
  artifactMetadata?: JsonValue;
  makeCurrent?: boolean;
};

export type AttachWorkItemArtifactInput = {
  artifactId?: string;
  workItemId: string;
  versionId?: string | null;
  artifactType: string;
  storageKind: string;
  uri: string;
  contentType?: string | null;
  sizeBytes?: number | null;
  sha256?: string | null;
  metadata?: JsonValue;
};

export type CreateWorkRunInput = {
  runId?: string;
  workItemId: string;
  executorKind: WorkRunExecutorKind;
  runtimeJobId?: string | null;
  runState?: WorkRunState;
  metadata?: JsonValue;
};

export type CreateWorkStepInput = {
  stepId?: string;
  runId: string;
  stepType: string;
  stepName: string;
  stepState?: WorkStepState;
  runtimeJobId?: string | null;
  metadata?: JsonValue;
};

const DEFAULT_MAX_JSON_BYTES = 64 * 1024;
const EVIDENCE_REQUIRED_ITEM_STATES = new Set<WorkItemLifecycleState>([
  "running",
  "succeeded",
  "failed",
  "canceled",
]);
const EVIDENCE_REQUIRED_RUN_STATES = new Set<WorkRunState>([
  "running",
  "succeeded",
  "failed",
  "canceled",
]);
const EVIDENCE_REQUIRED_STEP_STATES = new Set<WorkStepState>([
  "running",
  "succeeded",
  "failed",
  "canceled",
]);

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function nullableDate(value: Date | string | null): Date | null {
  return value === null ? null : toDate(value);
}

function encodeJson(value: JsonValue | undefined): string {
  return JSON.stringify(value ?? {});
}

function assertJsonByteLength(value: JsonValue | undefined, maxBytes: number, name: string): void {
  const bytes = Buffer.byteLength(JSON.stringify(value ?? {}), "utf8");
  if (bytes > maxBytes) {
    throw new Error(`${name} exceeds ${maxBytes} bytes`);
  }
}

function decodeItem(row: WorkItemRow): WorkItem {
  return {
    workItemId: row.work_item_id,
    itemType: row.item_type,
    title: row.title,
    description: row.description,
    lifecycleState: row.lifecycle_state,
    currentVersionId: row.current_version_id,
    metadata: row.metadata,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function decodeVersion(row: WorkItemVersionRow): WorkItemVersion {
  return {
    versionId: row.version_id,
    workItemId: row.work_item_id,
    versionNumber: row.version_number,
    versionState: row.version_state,
    title: row.title,
    body: row.body,
    artifactMetadata: row.artifact_metadata,
    createdAt: toDate(row.created_at),
    finalizedAt: nullableDate(row.finalized_at),
  };
}

function decodeArtifact(row: WorkItemArtifactRow): WorkItemArtifact {
  return {
    artifactId: row.artifact_id,
    workItemId: row.work_item_id,
    versionId: row.version_id,
    artifactType: row.artifact_type,
    storageKind: row.storage_kind,
    uri: row.uri,
    contentType: row.content_type,
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    sha256: row.sha256,
    metadata: row.metadata,
    createdAt: toDate(row.created_at),
  };
}

function decodeEvent(row: WorkItemEventRow): WorkItemEvent {
  return {
    eventId: row.event_id,
    workItemId: row.work_item_id,
    runId: row.run_id,
    stepId: row.step_id,
    eventType: row.event_type,
    lifecycleState: row.lifecycle_state,
    eventTime: toDate(row.event_time),
    actorId: row.actor_id,
    data: row.data,
  };
}

function decodeRun(row: WorkRunRow): WorkRun {
  return {
    runId: row.run_id,
    workItemId: row.work_item_id,
    executorKind: row.executor_kind,
    runtimeJobId: row.runtime_job_id,
    runtimeJobType: row.runtime_job_type,
    runState: row.run_state,
    metadata: row.metadata,
    startedAt: nullableDate(row.started_at),
    completedAt: nullableDate(row.completed_at),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function decodeStep(row: WorkStepRow): WorkStep {
  return {
    stepId: row.step_id,
    runId: row.run_id,
    workItemId: row.work_item_id,
    stepType: row.step_type,
    stepName: row.step_name,
    stepState: row.step_state,
    runtimeJobId: row.runtime_job_id,
    metadata: row.metadata,
    result: row.result,
    error: row.error,
    startedAt: nullableDate(row.started_at),
    completedAt: nullableDate(row.completed_at),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function decodeAssignment(row: WorkItemAssignmentRow): WorkItemAssignment {
  return {
    assignmentId: row.assignment_id,
    workItemId: row.work_item_id,
    assigneeType: row.assignee_type,
    assigneeId: row.assignee_id,
    role: row.role,
    metadata: row.metadata,
    createdAt: toDate(row.created_at),
  };
}

function decodeDependency(row: WorkItemDependencyRow): WorkItemDependency {
  return {
    dependencyId: row.dependency_id,
    workItemId: row.work_item_id,
    dependsOnWorkItemId: row.depends_on_work_item_id,
    dependencyType: row.dependency_type,
    metadata: row.metadata,
    createdAt: toDate(row.created_at),
  };
}

function decodeParentWorkflowLink(row: WorkItemParentWorkflowLinkRow): WorkItemParentWorkflowLink {
  return {
    linkId: row.link_id,
    workItemId: row.work_item_id,
    parentWorkflowId: row.parent_workflow_id,
    parentWorkflowKind: row.parent_workflow_kind,
    metadata: row.metadata,
    createdAt: toDate(row.created_at),
  };
}

export class WorkQueueRepository {
  private readonly now: () => Date;
  private readonly maxJsonBytes: number;

  constructor(
    private readonly sql: SqlClient,
    private readonly runtimeJobs: RuntimeJobRepository,
    options: WorkQueueRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxJsonBytes = options.maxJsonBytes ?? DEFAULT_MAX_JSON_BYTES;
  }

  async createWorkItem(input: CreateWorkItemInput): Promise<WorkItem> {
    assertJsonByteLength(input.metadata, this.maxJsonBytes, "work item metadata");
    const now = this.now();
    const workItemId = input.workItemId ?? randomUUID();
    const item = await this.sql.withTransaction(async (tx) => {
      const result = await tx.query<WorkItemRow>(
        `
          INSERT INTO execution_platform.work_items (
            work_item_id,
            item_type,
            title,
            description,
            metadata,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz, $6::timestamptz)
          RETURNING *
        `,
        [
          workItemId,
          input.itemType,
          input.title,
          input.description ?? null,
          encodeJson(input.metadata),
          now,
        ],
      );
      await this.recordLifecycleEventInTx(tx, {
        workItemId,
        eventType: "work_item.created",
        lifecycleState: "draft",
        actorId: input.actorId ?? null,
        data: { itemType: input.itemType, title: input.title },
        eventTime: now,
      });
      return decodeItem(result.rows[0]!);
    });
    return item;
  }

  async createWorkItemVersion(input: CreateWorkItemVersionInput): Promise<WorkItemVersion> {
    assertJsonByteLength(input.artifactMetadata, this.maxJsonBytes, "work item version metadata");
    const now = this.now();
    return this.sql.withTransaction(async (tx) => {
      const versionNumberResult = await tx.query<{ next_version_number: number | string }>(
        `
          SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version_number
          FROM execution_platform.work_item_versions
          WHERE work_item_id = $1
        `,
        [input.workItemId],
      );
      const versionNumber = Number(versionNumberResult.rows[0]?.next_version_number ?? 1);
      const versionId = input.versionId ?? randomUUID();
      const inserted = await tx.query<WorkItemVersionRow>(
        `
          INSERT INTO execution_platform.work_item_versions (
            version_id,
            work_item_id,
            version_number,
            title,
            body,
            artifact_metadata,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz)
          RETURNING *
        `,
        [
          versionId,
          input.workItemId,
          versionNumber,
          input.title ?? null,
          input.body ?? null,
          encodeJson(input.artifactMetadata),
          now,
        ],
      );
      if (input.makeCurrent ?? true) {
        await tx.query(
          `
            UPDATE execution_platform.work_items
            SET current_version_id = $2, updated_at = $3::timestamptz
            WHERE work_item_id = $1
          `,
          [input.workItemId, versionId, now],
        );
      }
      await this.recordLifecycleEventInTx(tx, {
        workItemId: input.workItemId,
        eventType: "work_item.version_created",
        data: { versionId, versionNumber, makeCurrent: input.makeCurrent ?? true },
        eventTime: now,
      });
      return decodeVersion(inserted.rows[0]!);
    });
  }

  async finalizeWorkItemVersion(input: {
    workItemId: string;
    versionId: string;
    actorId?: string | null;
  }): Promise<WorkItem> {
    const now = this.now();
    return this.sql.withTransaction(async (tx) => {
      await tx.query(
        `
          UPDATE execution_platform.work_item_versions
          SET version_state = 'finalized', finalized_at = $3::timestamptz
          WHERE work_item_id = $1 AND version_id = $2
        `,
        [input.workItemId, input.versionId, now],
      );
      const updated = await tx.query<WorkItemRow>(
        `
          UPDATE execution_platform.work_items
          SET lifecycle_state = 'manual_ready',
              current_version_id = $2,
              updated_at = $3::timestamptz
          WHERE work_item_id = $1
          RETURNING *
        `,
        [input.workItemId, input.versionId, now],
      );
      await this.recordLifecycleEventInTx(tx, {
        workItemId: input.workItemId,
        eventType: "work_item.finalized_manual_ready",
        lifecycleState: "manual_ready",
        actorId: input.actorId ?? null,
        data: {
          versionId: input.versionId,
          executionCreated: false,
          meaning: "manual_ready",
        },
        eventTime: now,
      });
      return decodeItem(updated.rows[0]!);
    });
  }

  async attachArtifactReference(input: AttachWorkItemArtifactInput): Promise<WorkItemArtifact> {
    if (input.uri.length > 2048) {
      throw new Error("work item artifact uri exceeds 2048 characters");
    }
    assertJsonByteLength(input.metadata, this.maxJsonBytes, "work item artifact metadata");
    const now = this.now();
    return this.sql.withTransaction(async (tx) => {
      const result = await tx.query<WorkItemArtifactRow>(
        `
          INSERT INTO execution_platform.work_item_artifacts (
            artifact_id,
            work_item_id,
            version_id,
            artifact_type,
            storage_kind,
            uri,
            content_type,
            size_bytes,
            sha256,
            metadata,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::timestamptz)
          RETURNING *
        `,
        [
          input.artifactId ?? randomUUID(),
          input.workItemId,
          input.versionId ?? null,
          input.artifactType,
          input.storageKind,
          input.uri,
          input.contentType ?? null,
          input.sizeBytes ?? null,
          input.sha256 ?? null,
          encodeJson(input.metadata),
          now,
        ],
      );
      await this.recordLifecycleEventInTx(tx, {
        workItemId: input.workItemId,
        eventType: "work_item.artifact_attached",
        data: {
          artifactId: result.rows[0]!.artifact_id,
          artifactType: input.artifactType,
          versionId: input.versionId ?? null,
        },
        eventTime: now,
      });
      return decodeArtifact(result.rows[0]!);
    });
  }

  async recordLifecycleEvent(input: {
    workItemId: string;
    eventType: string;
    lifecycleState?: WorkItemLifecycleState | null;
    runId?: string | null;
    stepId?: string | null;
    actorId?: string | null;
    data?: JsonValue;
  }): Promise<WorkItemEvent> {
    assertJsonByteLength(input.data, this.maxJsonBytes, "work item event data");
    return this.recordLifecycleEventInTx(this.sql, {
      ...input,
      lifecycleState: input.lifecycleState ?? null,
      eventTime: this.now(),
    });
  }

  async updateWorkItemLifecycleState(input: {
    workItemId: string;
    lifecycleState: WorkItemLifecycleState;
    runId?: string | null;
    runtimeJobId?: string | null;
    actorId?: string | null;
    reason?: string;
  }): Promise<WorkItem> {
    if (EVIDENCE_REQUIRED_ITEM_STATES.has(input.lifecycleState)) {
      await this.assertExecutionEvidence({
        runId: input.runId ?? null,
        runtimeJobId: input.runtimeJobId ?? null,
      });
    }
    const now = this.now();
    return this.sql.withTransaction(async (tx) => {
      const updated = await tx.query<WorkItemRow>(
        `
          UPDATE execution_platform.work_items
          SET lifecycle_state = $2, updated_at = $3::timestamptz
          WHERE work_item_id = $1
          RETURNING *
        `,
        [input.workItemId, input.lifecycleState, now],
      );
      await this.recordLifecycleEventInTx(tx, {
        workItemId: input.workItemId,
        runId: input.runId ?? null,
        eventType: "work_item.lifecycle_updated",
        lifecycleState: input.lifecycleState,
        actorId: input.actorId ?? null,
        data: {
          reason: input.reason ?? null,
          runtimeJobId: input.runtimeJobId ?? null,
        },
        eventTime: now,
      });
      return decodeItem(updated.rows[0]!);
    });
  }

  async assignWorkItem(input: {
    assignmentId?: string;
    workItemId: string;
    assigneeType: string;
    assigneeId: string;
    role?: string;
    metadata?: JsonValue;
  }): Promise<WorkItemAssignment> {
    assertJsonByteLength(input.metadata, this.maxJsonBytes, "work item assignment metadata");
    const now = this.now();
    const result = await this.sql.query<WorkItemAssignmentRow>(
      `
        INSERT INTO execution_platform.work_item_assignments (
          assignment_id,
          work_item_id,
          assignee_type,
          assignee_id,
          role,
          metadata,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz)
        RETURNING *
      `,
      [
        input.assignmentId ?? randomUUID(),
        input.workItemId,
        input.assigneeType,
        input.assigneeId,
        input.role ?? "owner",
        encodeJson(input.metadata),
        now,
      ],
    );
    await this.recordLifecycleEvent({
      workItemId: input.workItemId,
      eventType: "work_item.assigned",
      data: { assigneeType: input.assigneeType, assigneeId: input.assigneeId },
    });
    return decodeAssignment(result.rows[0]!);
  }

  async addDependency(input: {
    dependencyId?: string;
    workItemId: string;
    dependsOnWorkItemId: string;
    dependencyType?: string;
    metadata?: JsonValue;
  }): Promise<WorkItemDependency> {
    assertJsonByteLength(input.metadata, this.maxJsonBytes, "work item dependency metadata");
    const now = this.now();
    const result = await this.sql.query<WorkItemDependencyRow>(
      `
        INSERT INTO execution_platform.work_item_dependencies (
          dependency_id,
          work_item_id,
          depends_on_work_item_id,
          dependency_type,
          metadata,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz)
        ON CONFLICT (work_item_id, depends_on_work_item_id, dependency_type) DO UPDATE
        SET metadata = EXCLUDED.metadata
        RETURNING *
      `,
      [
        input.dependencyId ?? randomUUID(),
        input.workItemId,
        input.dependsOnWorkItemId,
        input.dependencyType ?? "blocks",
        encodeJson(input.metadata),
        now,
      ],
    );
    await this.recordLifecycleEvent({
      workItemId: input.workItemId,
      eventType: "work_item.dependency_added",
      data: {
        dependsOnWorkItemId: input.dependsOnWorkItemId,
        dependencyType: input.dependencyType ?? "blocks",
      },
    });
    return decodeDependency(result.rows[0]!);
  }

  async linkParentWorkflow(input: {
    linkId?: string;
    workItemId: string;
    parentWorkflowId: string;
    parentWorkflowKind: string;
    metadata?: JsonValue;
  }): Promise<WorkItemParentWorkflowLink> {
    assertJsonByteLength(input.metadata, this.maxJsonBytes, "work item workflow link metadata");
    const now = this.now();
    const result = await this.sql.query<WorkItemParentWorkflowLinkRow>(
      `
        INSERT INTO execution_platform.work_item_parent_workflow_links (
          link_id,
          work_item_id,
          parent_workflow_id,
          parent_workflow_kind,
          metadata,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz)
        ON CONFLICT (work_item_id, parent_workflow_id, parent_workflow_kind) DO UPDATE
        SET metadata = EXCLUDED.metadata
        RETURNING *
      `,
      [
        input.linkId ?? randomUUID(),
        input.workItemId,
        input.parentWorkflowId,
        input.parentWorkflowKind,
        encodeJson(input.metadata),
        now,
      ],
    );
    await this.recordLifecycleEvent({
      workItemId: input.workItemId,
      eventType: "work_item.parent_workflow_linked",
      data: {
        parentWorkflowId: input.parentWorkflowId,
        parentWorkflowKind: input.parentWorkflowKind,
      },
    });
    return decodeParentWorkflowLink(result.rows[0]!);
  }

  async createWorkRun(input: CreateWorkRunInput): Promise<WorkRun> {
    const runState = input.runState ?? "pending";
    const runtimeJob = input.runtimeJobId ? await this.requireRuntimeJob(input.runtimeJobId) : null;
    if (EVIDENCE_REQUIRED_RUN_STATES.has(runState) && !runtimeJob) {
      throw new Error("work run state requires runtime job evidence");
    }
    assertJsonByteLength(input.metadata, this.maxJsonBytes, "work run metadata");
    const now = this.now();
    return this.sql.withTransaction(async (tx) => {
      const result = await tx.query<WorkRunRow>(
        `
          INSERT INTO execution_platform.work_runs (
            run_id,
            work_item_id,
            executor_kind,
            runtime_job_id,
            runtime_job_type,
            run_state,
            metadata,
            started_at,
            completed_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz, $9::timestamptz, $10::timestamptz, $10::timestamptz)
          RETURNING *
        `,
        [
          input.runId ?? randomUUID(),
          input.workItemId,
          input.executorKind,
          input.runtimeJobId ?? null,
          runtimeJob?.jobType ?? null,
          runState,
          encodeJson(input.metadata),
          runState === "running" ? now : null,
          ["succeeded", "failed", "canceled"].includes(runState) ? now : null,
          now,
        ],
      );
      const run = decodeRun(result.rows[0]!);
      await this.recordLifecycleEventInTx(tx, {
        workItemId: input.workItemId,
        runId: run.runId,
        eventType: "work_run.created",
        lifecycleState: runState === "running" ? "running" : null,
        data: {
          executorKind: input.executorKind,
          runtimeJobId: input.runtimeJobId ?? null,
          runState,
        },
        eventTime: now,
      });
      if (runState === "running") {
        await tx.query(
          `
            UPDATE execution_platform.work_items
            SET lifecycle_state = 'running', updated_at = $2::timestamptz
            WHERE work_item_id = $1
          `,
          [input.workItemId, now],
        );
      }
      return { ...run, runtimeJob };
    });
  }

  async createWorkStep(input: CreateWorkStepInput): Promise<WorkStep> {
    const stepState = input.stepState ?? "pending";
    if (EVIDENCE_REQUIRED_STEP_STATES.has(stepState) && !input.runtimeJobId) {
      throw new Error("work step state requires runtime job evidence");
    }
    if (input.runtimeJobId) {
      await this.requireRuntimeJob(input.runtimeJobId);
    }
    assertJsonByteLength(input.metadata, this.maxJsonBytes, "work step metadata");
    const run = await this.requireRun(input.runId);
    const now = this.now();
    const result = await this.sql.query<WorkStepRow>(
      `
        INSERT INTO execution_platform.work_steps (
          step_id,
          run_id,
          work_item_id,
          step_type,
          step_name,
          step_state,
          runtime_job_id,
          metadata,
          started_at,
          completed_at,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::timestamptz, $10::timestamptz, $11::timestamptz, $11::timestamptz)
        RETURNING *
      `,
      [
        input.stepId ?? randomUUID(),
        input.runId,
        run.workItemId,
        input.stepType,
        input.stepName,
        stepState,
        input.runtimeJobId ?? null,
        encodeJson(input.metadata),
        stepState === "running" ? now : null,
        ["succeeded", "failed", "canceled", "skipped"].includes(stepState) ? now : null,
        now,
      ],
    );
    await this.recordLifecycleEvent({
      workItemId: run.workItemId,
      runId: input.runId,
      stepId: result.rows[0]!.step_id,
      eventType: "work_step.created",
      data: { stepType: input.stepType, stepName: input.stepName, stepState },
    });
    return decodeStep(result.rows[0]!);
  }

  async updateWorkStep(input: {
    stepId: string;
    stepState: WorkStepState;
    result?: JsonValue | null;
    error?: JsonValue | null;
    runtimeJobId?: string | null;
  }): Promise<WorkStep> {
    if (EVIDENCE_REQUIRED_STEP_STATES.has(input.stepState) && !input.runtimeJobId) {
      throw new Error("work step state requires runtime job evidence");
    }
    if (input.runtimeJobId) {
      await this.requireRuntimeJob(input.runtimeJobId);
    }
    const existing = await this.requireStep(input.stepId);
    const now = this.now();
    const updated = await this.sql.query<WorkStepRow>(
      `
        UPDATE execution_platform.work_steps
        SET step_state = $2,
            result = $3::jsonb,
            error = $4::jsonb,
            runtime_job_id = COALESCE($5, runtime_job_id),
            started_at = CASE WHEN $2 = 'running' THEN COALESCE(started_at, $6::timestamptz) ELSE started_at END,
            completed_at = CASE WHEN $2 IN ('succeeded', 'failed', 'canceled', 'skipped') THEN $6::timestamptz ELSE completed_at END,
            updated_at = $6::timestamptz
        WHERE step_id = $1
        RETURNING *
      `,
      [
        input.stepId,
        input.stepState,
        encodeJson(input.result ?? null),
        encodeJson(input.error ?? null),
        input.runtimeJobId ?? null,
        now,
      ],
    );
    await this.recordLifecycleEvent({
      workItemId: existing.workItemId,
      runId: existing.runId,
      stepId: input.stepId,
      eventType: "work_step.updated",
      data: { stepState: input.stepState },
    });
    return decodeStep(updated.rows[0]!);
  }

  async readWorkItemTruth(workItemId: string, eventLimit = 20): Promise<WorkItemTruth | null> {
    const itemResult = await this.sql.query<WorkItemRow>(
      "SELECT * FROM execution_platform.work_items WHERE work_item_id = $1",
      [workItemId],
    );
    const itemRow = itemResult.rows[0];
    if (!itemRow) {
      return null;
    }
    const item = decodeItem(itemRow);
    const [
      versionRows,
      artifactRows,
      eventRows,
      assignmentRows,
      dependencyRows,
      workflowRows,
      runRows,
      stepRows,
    ] = await Promise.all([
      this.sql.query<WorkItemVersionRow>(
        `
          SELECT * FROM execution_platform.work_item_versions
          WHERE work_item_id = $1
          ORDER BY version_number DESC
        `,
        [workItemId],
      ),
      this.sql.query<WorkItemArtifactRow>(
        `
          SELECT * FROM execution_platform.work_item_artifacts
          WHERE work_item_id = $1
          ORDER BY created_at ASC, artifact_id ASC
        `,
        [workItemId],
      ),
      this.sql.query<WorkItemEventRow>(
        `
          SELECT * FROM execution_platform.work_item_events
          WHERE work_item_id = $1
          ORDER BY event_time DESC, event_id DESC
          LIMIT $2
        `,
        [workItemId, eventLimit],
      ),
      this.sql.query<WorkItemAssignmentRow>(
        `
          SELECT * FROM execution_platform.work_item_assignments
          WHERE work_item_id = $1
          ORDER BY created_at ASC, assignment_id ASC
        `,
        [workItemId],
      ),
      this.sql.query<WorkItemDependencyRow>(
        `
          SELECT * FROM execution_platform.work_item_dependencies
          WHERE work_item_id = $1
          ORDER BY created_at ASC, dependency_id ASC
        `,
        [workItemId],
      ),
      this.sql.query<WorkItemParentWorkflowLinkRow>(
        `
          SELECT * FROM execution_platform.work_item_parent_workflow_links
          WHERE work_item_id = $1
          ORDER BY created_at ASC, link_id ASC
        `,
        [workItemId],
      ),
      this.sql.query<WorkRunRow>(
        `
          SELECT * FROM execution_platform.work_runs
          WHERE work_item_id = $1
          ORDER BY created_at ASC, run_id ASC
        `,
        [workItemId],
      ),
      this.sql.query<WorkStepRow>(
        `
          SELECT * FROM execution_platform.work_steps
          WHERE work_item_id = $1
          ORDER BY created_at ASC, step_id ASC
        `,
        [workItemId],
      ),
    ]);
    const versions = versionRows.rows.map(decodeVersion);
    const runs = await Promise.all(
      runRows.rows.map(async (row) => {
        const run = decodeRun(row);
        return {
          ...run,
          runtimeJob: run.runtimeJobId ? await this.runtimeJobs.getJob(run.runtimeJobId) : null,
        };
      }),
    );
    return {
      item,
      currentVersion:
        versions.find((version) => version.versionId === item.currentVersionId) ?? null,
      versions,
      artifacts: artifactRows.rows.map(decodeArtifact),
      events: eventRows.rows.map(decodeEvent),
      assignments: assignmentRows.rows.map(decodeAssignment),
      dependencies: dependencyRows.rows.map(decodeDependency),
      parentWorkflowLinks: workflowRows.rows.map(decodeParentWorkflowLink),
      runs,
      steps: stepRows.rows.map(decodeStep),
    };
  }

  async readWorkQueue(limit = 50): Promise<WorkQueueReadModelItem[]> {
    const result = await this.sql.query<WorkItemRow>(
      `
        SELECT * FROM execution_platform.work_items
        ORDER BY updated_at DESC, work_item_id ASC
        LIMIT $1
      `,
      [limit],
    );
    const items: WorkQueueReadModelItem[] = [];
    for (const row of result.rows) {
      const truth = await this.readWorkItemTruth(row.work_item_id, 1);
      if (!truth) {
        continue;
      }
      items.push({
        workItemId: truth.item.workItemId,
        itemType: truth.item.itemType,
        title: truth.item.title,
        lifecycleState: truth.item.lifecycleState,
        currentVersion: truth.currentVersion,
        assignmentCount: truth.assignments.length,
        dependencyCount: truth.dependencies.length,
        runCount: truth.runs.length,
        artifactCount: truth.artifacts.length,
        latestEvent: truth.events[0] ?? null,
        runtimeJobIds: truth.runs
          .map((run) => run.runtimeJobId)
          .filter((runtimeJobId): runtimeJobId is string => Boolean(runtimeJobId)),
        updatedAt: truth.item.updatedAt,
      });
    }
    return items;
  }

  private async requireRuntimeJob(runtimeJobId: string): Promise<RuntimeJob> {
    const job = await this.runtimeJobs.getJob(runtimeJobId);
    if (!job) {
      throw new Error(`runtime job evidence not found: ${runtimeJobId}`);
    }
    return job;
  }

  private async assertExecutionEvidence(input: {
    runId: string | null;
    runtimeJobId: string | null;
  }): Promise<void> {
    if (input.runtimeJobId) {
      await this.requireRuntimeJob(input.runtimeJobId);
      return;
    }
    if (input.runId) {
      const run = await this.requireRun(input.runId);
      if (run.runtimeJobId) {
        await this.requireRuntimeJob(run.runtimeJobId);
        return;
      }
    }
    throw new Error("work item lifecycle state requires durable run or runtime job evidence");
  }

  private async requireRun(runId: string): Promise<WorkRun> {
    const result = await this.sql.query<WorkRunRow>(
      "SELECT * FROM execution_platform.work_runs WHERE run_id = $1",
      [runId],
    );
    if (!result.rows[0]) {
      throw new Error(`work run not found: ${runId}`);
    }
    return decodeRun(result.rows[0]);
  }

  private async requireStep(stepId: string): Promise<WorkStep> {
    const result = await this.sql.query<WorkStepRow>(
      "SELECT * FROM execution_platform.work_steps WHERE step_id = $1",
      [stepId],
    );
    if (!result.rows[0]) {
      throw new Error(`work step not found: ${stepId}`);
    }
    return decodeStep(result.rows[0]);
  }

  private async recordLifecycleEventInTx(
    tx: SqlClient,
    input: {
      workItemId: string;
      eventType: string;
      lifecycleState?: WorkItemLifecycleState | null;
      runId?: string | null;
      stepId?: string | null;
      actorId?: string | null;
      data?: JsonValue;
      eventTime: Date;
    },
  ): Promise<WorkItemEvent> {
    assertJsonByteLength(input.data, this.maxJsonBytes, "work item event data");
    const result = await tx.query<WorkItemEventRow>(
      `
        INSERT INTO execution_platform.work_item_events (
          event_id,
          work_item_id,
          run_id,
          step_id,
          event_type,
          lifecycle_state,
          event_time,
          actor_id,
          data
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9::jsonb)
        RETURNING *
      `,
      [
        randomUUID(),
        input.workItemId,
        input.runId ?? null,
        input.stepId ?? null,
        input.eventType,
        input.lifecycleState ?? null,
        input.eventTime,
        input.actorId ?? null,
        encodeJson(input.data),
      ],
    );
    return decodeEvent(result.rows[0]!);
  }
}
