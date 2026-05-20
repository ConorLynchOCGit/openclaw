import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { SqlClient } from "../db/sql-client.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  assertBoundedStringArray,
  assertJsonByteLimit,
  assertRuntimeWorkGraphNoRawStorage,
  boundedRuntimeWorkGraphString,
  graphRef,
  parseStringArray,
  type ArtifactManifest,
  type BudgetLedger,
  type GraphCheckpoint,
  type HandoffPacket,
  type HumanTaskInvocation,
  type HumanTaskStatus,
  type RoleInvocation,
  type TeamGraphEdge,
  type TeamGraphEdgeKind,
  type TeamGraphNode,
  type TeamGraphNodeKind,
  type TeamGraphNodeStatus,
  type TeamRunGraph,
  type TeamRunGraphStatus,
} from "./runtime-work-graph.ts";

type GraphRow = QueryResultRow & {
  graph_id: string;
  parent_work_item_id: string | null;
  root_runtime_job_id: string | null;
  workflow_id: string;
  orchestrator_model_ref: string;
  graph_status: TeamRunGraphStatus;
  budget_ledger_ref: string | null;
  checkpoint_refs: JsonValue;
  final_closeout_ref: string | null;
  metadata: JsonValue;
  raw_prompt_stored: false;
  raw_response_stored: false;
  raw_logs_stored: false;
  work_queue_lifecycle_mutated: false;
  created_at: Date | string;
  updated_at: Date | string;
};

type NodeRow = QueryResultRow & {
  node_id: string;
  graph_id: string;
  node_kind: TeamGraphNodeKind;
  assigned_role: string;
  model_or_worker_ref: string | null;
  runtime_job_id: string | null;
  human_task_id: string | null;
  input_handoff_refs: JsonValue;
  output_artifact_refs: JsonValue;
  node_status: TeamGraphNodeStatus;
  budget_usage: JsonValue;
  metadata: JsonValue;
  raw_prompt_stored: false;
  raw_response_stored: false;
  raw_logs_stored: false;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type EdgeRow = QueryResultRow & {
  edge_id: string;
  graph_id: string;
  from_node_id: string | null;
  to_node_id: string | null;
  edge_kind: TeamGraphEdgeKind;
  reason_codes: JsonValue;
  artifact_refs: JsonValue;
  metadata: JsonValue;
  created_at: Date | string;
};

type InvocationRow = QueryResultRow & {
  invocation_id: string;
  graph_id: string;
  node_id: string | null;
  role_id: string;
  model_ref: string | null;
  worker_ref: string | null;
  provider_path: string;
  transport_kind: string;
  model_run_ref: string | null;
  artifact_refs: JsonValue;
  output_hash: string;
  latency_ms: number;
  budget_usage: JsonValue;
  raw_prompt_stored: false;
  raw_response_stored: false;
  raw_provider_log_stored: false;
  created_at: Date | string;
};

type HandoffRow = QueryResultRow & {
  handoff_id: string;
  graph_id: string;
  from_node_id: string | null;
  to_node_id: string | null;
  summary: string;
  artifact_refs: JsonValue;
  validation_refs: JsonValue;
  decision_refs: JsonValue;
  unresolved_questions: JsonValue;
  limitations: JsonValue;
  context_pack_refs: JsonValue;
  raw_prompt_stored: false;
  raw_response_stored: false;
  raw_logs_stored: false;
  created_at: Date | string;
};

type ManifestRow = QueryResultRow & {
  manifest_id: string;
  graph_id: string;
  node_id: string | null;
  artifact_type: string;
  storage_ref: string;
  content_hash: string;
  byte_count: number;
  bounded_summary: string;
  part_number: number;
  metadata: JsonValue;
  raw_content_stored: false;
  created_at: Date | string;
};

type BudgetLedgerRow = QueryResultRow & {
  ledger_id: string;
  graph_id: string;
  scope_kind: BudgetLedger["scopeKind"];
  scope_ref: string;
  wall_time_ms: number;
  lease_renewal_count: number;
  model_timeout_ms: number | null;
  max_output_tokens: number | null;
  retry_count: number;
  continuation_count: number;
  validation_repair_count: number;
  metadata: JsonValue;
  created_at: Date | string;
  updated_at: Date | string;
};

type CheckpointRow = QueryResultRow & {
  checkpoint_id: string;
  graph_id: string;
  checkpoint_kind: string;
  state_summary: string;
  artifact_refs: JsonValue;
  budget_ledger_ref: string | null;
  raw_prompt_stored: false;
  raw_response_stored: false;
  raw_logs_stored: false;
  created_at: Date | string;
};

type HumanTaskRow = QueryResultRow & {
  human_task_id: string;
  graph_id: string;
  node_id: string | null;
  operator_id: string;
  prompt_summary: string;
  required_response_shape: JsonValue;
  deadline_at: Date | string | null;
  blocking_node_refs: JsonValue;
  resume_token_hash: string;
  bounded_response_ref: string | null;
  decision_refs: JsonValue;
  task_status: HumanTaskStatus;
  raw_prompt_stored: false;
  raw_response_stored: false;
  raw_logs_stored: false;
  created_at: Date | string;
  updated_at: Date | string;
};

export type RuntimeWorkGraphSnapshot = {
  graph: TeamRunGraph;
  nodes: TeamGraphNode[];
  edges: TeamGraphEdge[];
  roleInvocations: RoleInvocation[];
  handoffPackets: HandoffPacket[];
  artifactManifests: ArtifactManifest[];
  budgetLedgers: BudgetLedger[];
  checkpoints: GraphCheckpoint[];
  humanTasks: HumanTaskInvocation[];
};

export type RuntimeWorkGraphRepositoryOptions = {
  now?: () => Date;
  maxJsonBytes?: number;
};

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function nullableDate(value: Date | string | null): Date | null {
  return value === null ? null : toDate(value);
}

function json(value: JsonValue | undefined): string {
  return JSON.stringify(value ?? {});
}

function jsonObject(value: JsonValue | undefined): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
}

function stringArray(value: JsonValue): string[] {
  return parseStringArray(value);
}

function decodeGraph(row: GraphRow): TeamRunGraph {
  return {
    graphId: row.graph_id,
    parentWorkItemId: row.parent_work_item_id,
    rootRuntimeJobId: row.root_runtime_job_id,
    workflowId: row.workflow_id,
    orchestratorModelRef: row.orchestrator_model_ref,
    graphStatus: row.graph_status,
    budgetLedgerRef: row.budget_ledger_ref,
    checkpointRefs: stringArray(row.checkpoint_refs),
    finalCloseoutRef: row.final_closeout_ref,
    metadata: row.metadata,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function decodeNode(row: NodeRow): TeamGraphNode {
  return {
    nodeId: row.node_id,
    graphId: row.graph_id,
    nodeKind: row.node_kind,
    assignedRole: row.assigned_role,
    modelOrWorkerRef: row.model_or_worker_ref,
    runtimeJobId: row.runtime_job_id,
    humanTaskId: row.human_task_id,
    inputHandoffRefs: stringArray(row.input_handoff_refs),
    outputArtifactRefs: stringArray(row.output_artifact_refs),
    nodeStatus: row.node_status,
    budgetUsage: row.budget_usage,
    metadata: row.metadata,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    startedAt: nullableDate(row.started_at),
    completedAt: nullableDate(row.completed_at),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function decodeEdge(row: EdgeRow): TeamGraphEdge {
  return {
    edgeId: row.edge_id,
    graphId: row.graph_id,
    fromNodeId: row.from_node_id,
    toNodeId: row.to_node_id,
    edgeKind: row.edge_kind,
    reasonCodes: stringArray(row.reason_codes),
    artifactRefs: stringArray(row.artifact_refs),
    metadata: row.metadata,
    createdAt: toDate(row.created_at),
  };
}

function decodeInvocation(row: InvocationRow): RoleInvocation {
  return {
    invocationId: row.invocation_id,
    graphId: row.graph_id,
    nodeId: row.node_id,
    roleId: row.role_id,
    modelRef: row.model_ref,
    workerRef: row.worker_ref,
    providerPath: row.provider_path,
    transportKind: row.transport_kind,
    modelRunRef: row.model_run_ref,
    artifactRefs: stringArray(row.artifact_refs),
    outputHash: row.output_hash,
    latencyMs: row.latency_ms,
    budgetUsage: row.budget_usage,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    createdAt: toDate(row.created_at),
  };
}

function decodeHandoff(row: HandoffRow): HandoffPacket {
  return {
    handoffId: row.handoff_id,
    graphId: row.graph_id,
    fromNodeId: row.from_node_id,
    toNodeId: row.to_node_id,
    summary: row.summary,
    artifactRefs: stringArray(row.artifact_refs),
    validationRefs: stringArray(row.validation_refs),
    decisionRefs: stringArray(row.decision_refs),
    unresolvedQuestions: stringArray(row.unresolved_questions),
    limitations: stringArray(row.limitations),
    contextPackRefs: stringArray(row.context_pack_refs),
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    createdAt: toDate(row.created_at),
  };
}

function decodeManifest(row: ManifestRow): ArtifactManifest {
  return {
    manifestId: row.manifest_id,
    graphId: row.graph_id,
    nodeId: row.node_id,
    artifactType: row.artifact_type,
    storageRef: row.storage_ref,
    contentHash: row.content_hash,
    byteCount: row.byte_count,
    boundedSummary: row.bounded_summary,
    partNumber: row.part_number,
    metadata: row.metadata,
    rawPromptStored: false,
    rawResponseStored: false,
    rawContentStored: false,
    createdAt: toDate(row.created_at),
  };
}

function decodeBudget(row: BudgetLedgerRow): BudgetLedger {
  return {
    ledgerId: row.ledger_id,
    graphId: row.graph_id,
    scopeKind: row.scope_kind,
    scopeRef: row.scope_ref,
    wallTimeMs: row.wall_time_ms,
    leaseRenewalCount: row.lease_renewal_count,
    modelTimeoutMs: row.model_timeout_ms,
    maxOutputTokens: row.max_output_tokens,
    retryCount: row.retry_count,
    continuationCount: row.continuation_count,
    validationRepairCount: row.validation_repair_count,
    metadata: row.metadata,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function decodeCheckpoint(row: CheckpointRow): GraphCheckpoint {
  return {
    checkpointId: row.checkpoint_id,
    graphId: row.graph_id,
    checkpointKind: row.checkpoint_kind,
    stateSummary: row.state_summary,
    artifactRefs: stringArray(row.artifact_refs),
    budgetLedgerRef: row.budget_ledger_ref,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    createdAt: toDate(row.created_at),
  };
}

function decodeHumanTask(row: HumanTaskRow): HumanTaskInvocation {
  return {
    humanTaskId: row.human_task_id,
    graphId: row.graph_id,
    nodeId: row.node_id,
    operatorId: row.operator_id,
    promptSummary: row.prompt_summary,
    requiredResponseShape: row.required_response_shape,
    deadlineAt: nullableDate(row.deadline_at),
    blockingNodeRefs: stringArray(row.blocking_node_refs),
    resumeTokenHash: row.resume_token_hash,
    boundedResponseRef: row.bounded_response_ref,
    decisionRefs: stringArray(row.decision_refs),
    taskStatus: row.task_status,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

export class RuntimeWorkGraphRepository {
  private readonly now: () => Date;
  private readonly maxJsonBytes: number;

  constructor(
    private readonly sql: SqlClient,
    options: RuntimeWorkGraphRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxJsonBytes = options.maxJsonBytes ?? 64 * 1024;
  }

  async createGraph(input: {
    graphId?: string;
    parentWorkItemId?: string | null;
    rootRuntimeJobId?: string | null;
    workflowId: string;
    orchestratorModelRef: string;
    graphStatus?: TeamRunGraphStatus;
    metadata?: JsonValue;
  }): Promise<TeamRunGraph> {
    this.assertMetadata(input.metadata, "runtime work graph metadata");
    const now = this.now();
    const graphId = input.graphId ?? randomUUID();
    const row = await this.sql.query<GraphRow>(
      `
        INSERT INTO execution_platform.runtime_work_graphs (
          graph_id,
          parent_work_item_id,
          root_runtime_job_id,
          workflow_id,
          orchestrator_model_ref,
          graph_status,
          metadata,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz, $8::timestamptz)
        RETURNING *
      `,
      [
        graphId,
        input.parentWorkItemId ?? null,
        input.rootRuntimeJobId ?? null,
        input.workflowId,
        input.orchestratorModelRef,
        input.graphStatus ?? "planned",
        json(input.metadata),
        now,
      ],
    );
    return decodeGraph(row.rows[0]!);
  }

  async updateGraphStatus(input: {
    graphId: string;
    graphStatus: TeamRunGraphStatus;
    finalCloseoutRef?: string | null;
    metadata?: JsonValue;
  }): Promise<TeamRunGraph> {
    this.assertMetadata(input.metadata, "runtime work graph status metadata");
    const now = this.now();
    const row = await this.sql.query<GraphRow>(
      `
        UPDATE execution_platform.runtime_work_graphs
        SET graph_status = $2,
            final_closeout_ref = COALESCE($3, final_closeout_ref),
            metadata = $4::jsonb,
            updated_at = $5::timestamptz
        WHERE graph_id = $1
        RETURNING *
      `,
      [input.graphId, input.graphStatus, input.finalCloseoutRef ?? null, json(input.metadata), now],
    );
    if (!row.rows[0]) {
      throw new Error(`runtime_work_graph_not_found:${input.graphId}`);
    }
    return decodeGraph(row.rows[0]);
  }

  async addNode(input: {
    nodeId?: string;
    graphId: string;
    nodeKind: TeamGraphNodeKind;
    assignedRole: string;
    modelOrWorkerRef?: string | null;
    runtimeJobId?: string | null;
    humanTaskId?: string | null;
    inputHandoffRefs?: string[];
    outputArtifactRefs?: string[];
    nodeStatus?: TeamGraphNodeStatus;
    budgetUsage?: JsonValue;
    metadata?: JsonValue;
  }): Promise<TeamGraphNode> {
    assertBoundedStringArray(input.inputHandoffRefs ?? [], "input handoff refs");
    assertBoundedStringArray(input.outputArtifactRefs ?? [], "output artifact refs");
    this.assertMetadata(input.budgetUsage, "node budget usage");
    this.assertMetadata(input.metadata, "node metadata");
    const now = this.now();
    const row = await this.sql.query<NodeRow>(
      `
        INSERT INTO execution_platform.runtime_work_graph_nodes (
          node_id,
          graph_id,
          node_kind,
          assigned_role,
          model_or_worker_ref,
          runtime_job_id,
          human_task_id,
          input_handoff_refs,
          output_artifact_refs,
          node_status,
          budget_usage,
          metadata,
          started_at,
          completed_at,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11::jsonb, $12::jsonb, $13::timestamptz, $14::timestamptz, $15::timestamptz, $15::timestamptz)
        RETURNING *
      `,
      [
        input.nodeId ?? randomUUID(),
        input.graphId,
        input.nodeKind,
        input.assignedRole,
        input.modelOrWorkerRef ?? null,
        input.runtimeJobId ?? null,
        input.humanTaskId ?? null,
        JSON.stringify(input.inputHandoffRefs ?? []),
        JSON.stringify(input.outputArtifactRefs ?? []),
        input.nodeStatus ?? "planned",
        json(input.budgetUsage),
        json(input.metadata),
        input.nodeStatus === "running" ? now : null,
        ["succeeded", "failed", "skipped"].includes(input.nodeStatus ?? "") ? now : null,
        now,
      ],
    );
    return decodeNode(row.rows[0]!);
  }

  async updateNodeStatus(input: {
    nodeId: string;
    nodeStatus: TeamGraphNodeStatus;
    outputArtifactRefs?: string[];
    humanTaskId?: string | null;
    metadataPatch?: JsonValue;
  }): Promise<TeamGraphNode> {
    assertBoundedStringArray(input.outputArtifactRefs ?? [], "output artifact refs");
    this.assertMetadata(input.metadataPatch, "node status metadata patch");
    const now = this.now();
    if (input.metadataPatch !== undefined) {
      const existing = await this.sql.query<NodeRow>(
        `SELECT * FROM execution_platform.runtime_work_graph_nodes WHERE node_id = $1`,
        [input.nodeId],
      );
      if (!existing.rows[0]) {
        throw new Error(`runtime_work_graph_node_not_found:${input.nodeId}`);
      }
      const mergedMetadata = {
        ...jsonObject(existing.rows[0].metadata),
        ...jsonObject(input.metadataPatch),
      };
      const row = await this.sql.query<NodeRow>(
        `
          UPDATE execution_platform.runtime_work_graph_nodes
          SET node_status = $2,
              output_artifact_refs = COALESCE($3::jsonb, output_artifact_refs),
              human_task_id = COALESCE($4, human_task_id),
              metadata = $5::jsonb,
              started_at = CASE WHEN $2 = 'running' THEN COALESCE(started_at, $6::timestamptz) ELSE started_at END,
              completed_at = CASE WHEN $2 IN ('succeeded', 'failed', 'skipped') THEN $6::timestamptz ELSE completed_at END,
              updated_at = $6::timestamptz
          WHERE node_id = $1
          RETURNING *
        `,
        [
          input.nodeId,
          input.nodeStatus,
          input.outputArtifactRefs ? JSON.stringify(input.outputArtifactRefs) : null,
          input.humanTaskId ?? null,
          json(mergedMetadata),
          now,
        ],
      );
      if (!row.rows[0]) {
        throw new Error(`runtime_work_graph_node_not_found:${input.nodeId}`);
      }
      return decodeNode(row.rows[0]);
    }
    const row = await this.sql.query<NodeRow>(
      `
        UPDATE execution_platform.runtime_work_graph_nodes
        SET node_status = $2,
            output_artifact_refs = COALESCE($3::jsonb, output_artifact_refs),
            human_task_id = COALESCE($4, human_task_id),
            started_at = CASE WHEN $2 = 'running' THEN COALESCE(started_at, $5::timestamptz) ELSE started_at END,
            completed_at = CASE WHEN $2 IN ('succeeded', 'failed', 'skipped') THEN $5::timestamptz ELSE completed_at END,
            updated_at = $5::timestamptz
        WHERE node_id = $1
        RETURNING *
      `,
      [
        input.nodeId,
        input.nodeStatus,
        input.outputArtifactRefs ? JSON.stringify(input.outputArtifactRefs) : null,
        input.humanTaskId ?? null,
        now,
      ],
    );
    if (!row.rows[0]) {
      throw new Error(`runtime_work_graph_node_not_found:${input.nodeId}`);
    }
    return decodeNode(row.rows[0]);
  }

  async addEdge(input: {
    edgeId?: string;
    graphId: string;
    fromNodeId?: string | null;
    toNodeId?: string | null;
    edgeKind: TeamGraphEdgeKind;
    reasonCodes?: string[];
    artifactRefs?: string[];
    metadata?: JsonValue;
  }): Promise<TeamGraphEdge> {
    assertBoundedStringArray(input.reasonCodes ?? [], "edge reason codes");
    assertBoundedStringArray(input.artifactRefs ?? [], "edge artifact refs");
    this.assertMetadata(input.metadata, "edge metadata");
    const row = await this.sql.query<EdgeRow>(
      `
        INSERT INTO execution_platform.runtime_work_graph_edges (
          edge_id,
          graph_id,
          from_node_id,
          to_node_id,
          edge_kind,
          reason_codes,
          artifact_refs,
          metadata,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::timestamptz)
        ON CONFLICT (edge_id) DO UPDATE
        SET reason_codes = EXCLUDED.reason_codes,
            artifact_refs = EXCLUDED.artifact_refs,
            metadata = EXCLUDED.metadata
        RETURNING *
      `,
      [
        input.edgeId ?? randomUUID(),
        input.graphId,
        input.fromNodeId ?? null,
        input.toNodeId ?? null,
        input.edgeKind,
        JSON.stringify(input.reasonCodes ?? []),
        JSON.stringify(input.artifactRefs ?? []),
        json(input.metadata),
        this.now(),
      ],
    );
    return decodeEdge(row.rows[0]!);
  }

  async recordRoleInvocation(input: {
    invocationId?: string;
    graphId: string;
    nodeId?: string | null;
    roleId: string;
    modelRef?: string | null;
    workerRef?: string | null;
    providerPath: string;
    transportKind: string;
    modelRunRef?: string | null;
    artifactRefs?: string[];
    outputHash: string;
    latencyMs: number;
    budgetUsage?: JsonValue;
  }): Promise<RoleInvocation> {
    assertBoundedStringArray(input.artifactRefs ?? [], "role invocation artifact refs");
    this.assertMetadata(input.budgetUsage, "role invocation budget usage");
    if (input.latencyMs < 0) {
      throw new Error("role invocation latency must be nonnegative");
    }
    const row = await this.sql.query<InvocationRow>(
      `
        INSERT INTO execution_platform.runtime_work_graph_role_invocations (
          invocation_id,
          graph_id,
          node_id,
          role_id,
          model_ref,
          worker_ref,
          provider_path,
          transport_kind,
          model_run_ref,
          artifact_refs,
          output_hash,
          latency_ms,
          budget_usage,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13::jsonb, $14::timestamptz)
        RETURNING *
      `,
      [
        input.invocationId ?? randomUUID(),
        input.graphId,
        input.nodeId ?? null,
        input.roleId,
        input.modelRef ?? null,
        input.workerRef ?? null,
        input.providerPath,
        input.transportKind,
        input.modelRunRef ?? null,
        JSON.stringify(input.artifactRefs ?? []),
        input.outputHash,
        input.latencyMs,
        json(input.budgetUsage),
        this.now(),
      ],
    );
    return decodeInvocation(row.rows[0]!);
  }

  async recordHandoff(input: {
    handoffId?: string;
    graphId: string;
    fromNodeId?: string | null;
    toNodeId?: string | null;
    summary: string;
    artifactRefs?: string[];
    validationRefs?: string[];
    decisionRefs?: string[];
    unresolvedQuestions?: string[];
    limitations?: string[];
    contextPackRefs?: string[];
  }): Promise<HandoffPacket> {
    const arrays = [
      ["artifact refs", input.artifactRefs ?? []],
      ["validation refs", input.validationRefs ?? []],
      ["decision refs", input.decisionRefs ?? []],
      ["unresolved questions", input.unresolvedQuestions ?? []],
      ["limitations", input.limitations ?? []],
      ["context pack refs", input.contextPackRefs ?? []],
    ] as const;
    arrays.forEach(([name, values]) => assertBoundedStringArray(values, name));
    const row = await this.sql.query<HandoffRow>(
      `
        INSERT INTO execution_platform.runtime_work_graph_handoff_packets (
          handoff_id,
          graph_id,
          from_node_id,
          to_node_id,
          summary,
          artifact_refs,
          validation_refs,
          decision_refs,
          unresolved_questions,
          limitations,
          context_pack_refs,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::timestamptz)
        RETURNING *
      `,
      [
        input.handoffId ?? randomUUID(),
        input.graphId,
        input.fromNodeId ?? null,
        input.toNodeId ?? null,
        boundedRuntimeWorkGraphString(input.summary),
        JSON.stringify(input.artifactRefs ?? []),
        JSON.stringify(input.validationRefs ?? []),
        JSON.stringify(input.decisionRefs ?? []),
        JSON.stringify(input.unresolvedQuestions ?? []),
        JSON.stringify(input.limitations ?? []),
        JSON.stringify(input.contextPackRefs ?? []),
        this.now(),
      ],
    );
    return decodeHandoff(row.rows[0]!);
  }

  async recordArtifactManifest(input: {
    manifestId?: string;
    graphId: string;
    nodeId?: string | null;
    artifactType: string;
    storageRef: string;
    contentHash: string;
    byteCount: number;
    boundedSummary: string;
    partNumber?: number;
    metadata?: JsonValue;
  }): Promise<ArtifactManifest> {
    this.assertMetadata(input.metadata, "artifact manifest metadata");
    if (input.byteCount < 0) {
      throw new Error("artifact manifest byte count must be nonnegative");
    }
    const row = await this.sql.query<ManifestRow>(
      `
        INSERT INTO execution_platform.runtime_work_graph_artifact_manifests (
          manifest_id,
          graph_id,
          node_id,
          artifact_type,
          storage_ref,
          content_hash,
          byte_count,
          bounded_summary,
          part_number,
          metadata,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::timestamptz)
        RETURNING *
      `,
      [
        input.manifestId ?? randomUUID(),
        input.graphId,
        input.nodeId ?? null,
        input.artifactType,
        input.storageRef,
        input.contentHash,
        input.byteCount,
        boundedRuntimeWorkGraphString(input.boundedSummary),
        input.partNumber ?? 1,
        json(input.metadata),
        this.now(),
      ],
    );
    return decodeManifest(row.rows[0]!);
  }

  async recordBudgetLedger(input: {
    ledgerId?: string;
    graphId: string;
    scopeKind: BudgetLedger["scopeKind"];
    scopeRef: string;
    wallTimeMs?: number;
    leaseRenewalCount?: number;
    modelTimeoutMs?: number | null;
    maxOutputTokens?: number | null;
    retryCount?: number;
    continuationCount?: number;
    validationRepairCount?: number;
    metadata?: JsonValue;
  }): Promise<BudgetLedger> {
    this.assertMetadata(input.metadata, "budget ledger metadata");
    const now = this.now();
    const row = await this.sql.query<BudgetLedgerRow>(
      `
        INSERT INTO execution_platform.runtime_work_graph_budget_ledgers (
          ledger_id,
          graph_id,
          scope_kind,
          scope_ref,
          wall_time_ms,
          lease_renewal_count,
          model_timeout_ms,
          max_output_tokens,
          retry_count,
          continuation_count,
          validation_repair_count,
          metadata,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::timestamptz, $13::timestamptz)
        RETURNING *
      `,
      [
        input.ledgerId ?? randomUUID(),
        input.graphId,
        input.scopeKind,
        input.scopeRef,
        input.wallTimeMs ?? 0,
        input.leaseRenewalCount ?? 0,
        input.modelTimeoutMs ?? null,
        input.maxOutputTokens ?? null,
        input.retryCount ?? 0,
        input.continuationCount ?? 0,
        input.validationRepairCount ?? 0,
        json(input.metadata),
        now,
      ],
    );
    return decodeBudget(row.rows[0]!);
  }

  async recordCheckpoint(input: {
    checkpointId?: string;
    graphId: string;
    checkpointKind: string;
    stateSummary: string;
    artifactRefs?: string[];
    budgetLedgerRef?: string | null;
  }): Promise<GraphCheckpoint> {
    assertBoundedStringArray(input.artifactRefs ?? [], "checkpoint artifact refs");
    const checkpointId = input.checkpointId ?? randomUUID();
    const now = this.now();
    const row = await this.sql.withTransaction(async (tx) => {
      const inserted = await tx.query<CheckpointRow>(
        `
          INSERT INTO execution_platform.runtime_work_graph_checkpoints (
            checkpoint_id,
            graph_id,
            checkpoint_kind,
            state_summary,
            artifact_refs,
            budget_ledger_ref,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::timestamptz)
          ON CONFLICT (checkpoint_id) DO UPDATE SET
            graph_id = EXCLUDED.graph_id,
            checkpoint_kind = EXCLUDED.checkpoint_kind,
            state_summary = EXCLUDED.state_summary,
            artifact_refs = EXCLUDED.artifact_refs,
            budget_ledger_ref = EXCLUDED.budget_ledger_ref
          RETURNING *
        `,
        [
          checkpointId,
          input.graphId,
          input.checkpointKind,
          boundedRuntimeWorkGraphString(input.stateSummary),
          JSON.stringify(input.artifactRefs ?? []),
          input.budgetLedgerRef ?? null,
          now,
        ],
      );
      const current = await tx.query<{ checkpoint_refs: JsonValue }>(
        "SELECT checkpoint_refs FROM execution_platform.runtime_work_graphs WHERE graph_id = $1",
        [input.graphId],
      );
      const currentRefs = stringArray(current.rows[0]?.checkpoint_refs ?? []);
      const checkpointRef = graphRef("checkpoint", checkpointId);
      await tx.query(
        `
          UPDATE execution_platform.runtime_work_graphs
          SET checkpoint_refs = $2::jsonb,
              updated_at = $3::timestamptz
          WHERE graph_id = $1
        `,
        [input.graphId, JSON.stringify([...new Set([...currentRefs, checkpointRef])]), now],
      );
      return inserted.rows[0]!;
    });
    return decodeCheckpoint(row);
  }

  async createHumanTask(input: {
    humanTaskId?: string;
    graphId: string;
    nodeId?: string | null;
    operatorId: string;
    promptSummary: string;
    requiredResponseShape?: JsonValue;
    deadlineAt?: Date | null;
    blockingNodeRefs?: string[];
    resumeTokenHash: string;
    decisionRefs?: string[];
  }): Promise<HumanTaskInvocation> {
    this.assertMetadata(input.requiredResponseShape, "human task response shape");
    assertBoundedStringArray(input.blockingNodeRefs ?? [], "blocking node refs");
    assertBoundedStringArray(input.decisionRefs ?? [], "human task decision refs");
    const now = this.now();
    const row = await this.sql.query<HumanTaskRow>(
      `
        INSERT INTO execution_platform.runtime_work_graph_human_tasks (
          human_task_id,
          graph_id,
          node_id,
          operator_id,
          prompt_summary,
          required_response_shape,
          deadline_at,
          blocking_node_refs,
          resume_token_hash,
          decision_refs,
          task_status,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz, $8::jsonb, $9, $10::jsonb, 'waiting', $11::timestamptz, $11::timestamptz)
        RETURNING *
      `,
      [
        input.humanTaskId ?? randomUUID(),
        input.graphId,
        input.nodeId ?? null,
        input.operatorId,
        boundedRuntimeWorkGraphString(input.promptSummary),
        json(input.requiredResponseShape),
        input.deadlineAt ?? null,
        JSON.stringify(input.blockingNodeRefs ?? []),
        input.resumeTokenHash,
        JSON.stringify(input.decisionRefs ?? []),
        now,
      ],
    );
    return decodeHumanTask(row.rows[0]!);
  }

  async resumeHumanTask(input: {
    humanTaskId: string;
    boundedResponseRef: string;
    decisionRefs?: string[];
  }): Promise<HumanTaskInvocation> {
    assertBoundedStringArray(input.decisionRefs ?? [], "human task decision refs");
    const now = this.now();
    const row = await this.sql.query<HumanTaskRow>(
      `
        UPDATE execution_platform.runtime_work_graph_human_tasks
        SET task_status = 'resumed',
            bounded_response_ref = $2,
            decision_refs = $3::jsonb,
            updated_at = $4::timestamptz
        WHERE human_task_id = $1
          AND task_status = 'waiting'
          AND (deadline_at IS NULL OR deadline_at > $4::timestamptz)
        RETURNING *
      `,
      [input.humanTaskId, input.boundedResponseRef, JSON.stringify(input.decisionRefs ?? []), now],
    );
    if (!row.rows[0]) {
      throw new Error(`human_task_not_resumable:${input.humanTaskId}`);
    }
    return decodeHumanTask(row.rows[0]);
  }

  async readHumanTask(humanTaskId: string): Promise<HumanTaskInvocation | null> {
    const row = await this.sql.query<HumanTaskRow>(
      `
        SELECT *
        FROM execution_platform.runtime_work_graph_human_tasks
        WHERE human_task_id = $1
      `,
      [humanTaskId],
    );
    return row.rows[0] ? decodeHumanTask(row.rows[0]) : null;
  }

  async readGraphSnapshot(graphId: string): Promise<RuntimeWorkGraphSnapshot | null> {
    const graphResult = await this.sql.query<GraphRow>(
      "SELECT * FROM execution_platform.runtime_work_graphs WHERE graph_id = $1",
      [graphId],
    );
    const graphRow = graphResult.rows[0];
    if (!graphRow) {
      return null;
    }
    const [
      nodeRows,
      edgeRows,
      invocationRows,
      handoffRows,
      manifestRows,
      budgetRows,
      checkpointRows,
      humanTaskRows,
    ] = await Promise.all([
      this.sql.query<NodeRow>(
        "SELECT * FROM execution_platform.runtime_work_graph_nodes WHERE graph_id = $1 ORDER BY created_at, node_id",
        [graphId],
      ),
      this.sql.query<EdgeRow>(
        "SELECT * FROM execution_platform.runtime_work_graph_edges WHERE graph_id = $1 ORDER BY created_at, edge_id",
        [graphId],
      ),
      this.sql.query<InvocationRow>(
        "SELECT * FROM execution_platform.runtime_work_graph_role_invocations WHERE graph_id = $1 ORDER BY created_at, invocation_id",
        [graphId],
      ),
      this.sql.query<HandoffRow>(
        "SELECT * FROM execution_platform.runtime_work_graph_handoff_packets WHERE graph_id = $1 ORDER BY created_at, handoff_id",
        [graphId],
      ),
      this.sql.query<ManifestRow>(
        "SELECT * FROM execution_platform.runtime_work_graph_artifact_manifests WHERE graph_id = $1 ORDER BY created_at, manifest_id",
        [graphId],
      ),
      this.sql.query<BudgetLedgerRow>(
        "SELECT * FROM execution_platform.runtime_work_graph_budget_ledgers WHERE graph_id = $1 ORDER BY created_at, ledger_id",
        [graphId],
      ),
      this.sql.query<CheckpointRow>(
        "SELECT * FROM execution_platform.runtime_work_graph_checkpoints WHERE graph_id = $1 ORDER BY created_at, checkpoint_id",
        [graphId],
      ),
      this.sql.query<HumanTaskRow>(
        "SELECT * FROM execution_platform.runtime_work_graph_human_tasks WHERE graph_id = $1 ORDER BY created_at, human_task_id",
        [graphId],
      ),
    ]);
    return {
      graph: decodeGraph(graphRow),
      nodes: nodeRows.rows.map(decodeNode),
      edges: edgeRows.rows.map(decodeEdge),
      roleInvocations: invocationRows.rows.map(decodeInvocation),
      handoffPackets: handoffRows.rows.map(decodeHandoff),
      artifactManifests: manifestRows.rows.map(decodeManifest),
      budgetLedgers: budgetRows.rows.map(decodeBudget),
      checkpoints: checkpointRows.rows.map(decodeCheckpoint),
      humanTasks: humanTaskRows.rows.map(decodeHumanTask),
    };
  }

  private assertMetadata(value: JsonValue | undefined, name: string): void {
    assertRuntimeWorkGraphNoRawStorage(value, name);
    assertJsonByteLimit(value ?? {}, name, this.maxJsonBytes);
  }
}
