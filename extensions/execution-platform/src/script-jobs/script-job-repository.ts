import type {
  AttachRuntimeJobArtifactInput,
  JsonValue,
  RuntimeJob,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import { ScriptJobDefinitionRegistry, type RegisterScriptJobDefinitionInput } from "./registry.ts";
import {
  isScriptJobPayload,
  isScriptJobResult,
  scriptJobType,
  type ClaimedScriptJob,
  type ScriptJobDefinition,
  type ScriptJobLane,
  type ScriptJobPayload,
  type ScriptJobResult,
  type ScriptJobStatus,
  type ValidationLaneEvidence,
} from "./types.ts";

export type EnqueueScriptJobInput = {
  jobId?: string;
  scriptId: string;
  lane: ScriptJobLane;
  input?: JsonValue;
  queueName?: string;
  priority?: number;
  idempotencyKey?: string;
  parentJobId?: string | null;
  parentWorkflowId?: string | null;
  workItemId?: string | null;
  maxAttempts?: number;
};

export type CompleteScriptJobInput = {
  jobId: string;
  leaseToken: string;
  output?: JsonValue;
  exitCode?: number;
  validationEvidence?: ValidationLaneEvidence;
};

export type FailScriptJobInput = {
  jobId: string;
  leaseToken: string;
  code: string;
  message: string;
  retryDelayMs?: number;
  evidence?: JsonValue;
};

export type ScriptJobRepositoryOptions = {
  registry?: ScriptJobDefinitionRegistry;
};

function jsonByteLength(value: JsonValue | undefined): number {
  return Buffer.byteLength(JSON.stringify(value ?? {}), "utf8");
}

function assertJsonByteLength(value: JsonValue | undefined, maxBytes: number, name: string): void {
  const bytes = jsonByteLength(value);
  if (bytes > maxBytes) {
    throw new Error(`${name} exceeds ${maxBytes} bytes`);
  }
}

function definitionArtifact(jobId: string, metadata: JsonValue): AttachRuntimeJobArtifactInput {
  return {
    jobId,
    artifactType: "script_job.definition",
    storageKind: "metadata",
    uri: `runtime-job://${jobId}/script-job/definition`,
    contentType: "application/json",
    sizeBytes: jsonByteLength(metadata),
    metadata,
  };
}

export class ScriptJobRepository {
  private readonly registry: ScriptJobDefinitionRegistry;

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    options: ScriptJobRepositoryOptions = {},
  ) {
    this.registry = options.registry ?? new ScriptJobDefinitionRegistry();
  }

  registerScriptJobDefinition(input: RegisterScriptJobDefinitionInput): ScriptJobDefinition {
    return this.registry.registerScriptJobDefinition(input);
  }

  listScriptJobDefinitions(): ScriptJobDefinition[] {
    return this.registry.listScriptJobDefinitions();
  }

  getScriptJobDefinition(scriptId: string): ScriptJobDefinition | null {
    return this.registry.getScriptJobDefinition(scriptId);
  }

  async enqueueScriptJob(input: EnqueueScriptJobInput): Promise<RuntimeJob> {
    const definition = this.registry.requireScriptJobDefinition(input.scriptId);
    if (!definition.allowedLanes.includes(input.lane)) {
      throw new Error(`script job lane not allowed for ${input.scriptId}: ${input.lane}`);
    }
    assertJsonByteLength(input.input, definition.artifactPolicy.maxMetadataBytes, "script input");
    const payload: ScriptJobPayload = {
      family: "script_job",
      scriptId: definition.scriptId,
      lane: input.lane,
      input: input.input ?? {},
      definitionSnapshot: {
        handlerId: definition.handlerId,
        timeoutMs: definition.timeoutMs,
        artifactPolicy: definition.artifactPolicy,
        shellExecutionAllowed: false,
      },
    };
    const job = await this.runtimeJobs.enqueueJob({
      jobId: input.jobId,
      jobType: scriptJobType(definition.scriptId),
      queueName: input.queueName,
      priority: input.priority,
      payload,
      idempotencyScope: `script_job:${definition.scriptId}`,
      idempotencyKey: input.idempotencyKey,
      parentJobId: input.parentJobId,
      parentWorkflowId: input.parentWorkflowId,
      workItemId: input.workItemId,
      maxAttempts: input.maxAttempts,
      runTimeoutMs: definition.timeoutMs,
    });
    await this.runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "script_job.enqueued",
      data: {
        scriptId: definition.scriptId,
        handlerId: definition.handlerId,
        lane: input.lane,
        shellExecutionAllowed: false,
      },
    });
    await this.runtimeJobs.attachArtifact(definitionArtifact(job.jobId, payload));
    return job;
  }

  async claimScriptJob(input: {
    workerId: string;
    queueName?: string;
    scriptIds?: string[];
  }): Promise<ClaimedScriptJob | null> {
    const scriptIds =
      input.scriptIds ?? this.registry.listScriptJobDefinitions().map((d) => d.scriptId);
    if (scriptIds.length === 0) {
      return null;
    }
    const claimed = await this.runtimeJobs.claimNextJob({
      workerId: input.workerId,
      queueName: input.queueName,
      jobTypes: scriptIds.map(scriptJobType),
    });
    if (!claimed) {
      return null;
    }
    if (!isScriptJobPayload(claimed.job.payload)) {
      throw new Error(`claimed runtime job is not a script job: ${claimed.job.jobId}`);
    }
    return {
      ...claimed,
      definition: this.registry.requireScriptJobDefinition(claimed.job.payload.scriptId),
      script: claimed.job.payload,
    };
  }

  async completeScriptJob(input: CompleteScriptJobInput): Promise<RuntimeJob | null> {
    const job = await this.runtimeJobs.getJob(input.jobId);
    if (!job || !isScriptJobPayload(job.payload)) {
      throw new Error(`script job not found: ${input.jobId}`);
    }
    const definition = this.registry.requireScriptJobDefinition(job.payload.scriptId);
    assertJsonByteLength(
      input.output,
      definition.artifactPolicy.maxInlineTextBytes,
      "script inline output",
    );
    const result: ScriptJobResult = {
      family: "script_job",
      scriptId: definition.scriptId,
      lane: job.payload.lane,
      output: input.output ?? {},
      exitCode: input.exitCode,
      validationEvidence: input.validationEvidence,
    };
    await this.runtimeJobs.recordEvent({
      jobId: input.jobId,
      eventType: "script_job.completed",
      data: {
        scriptId: definition.scriptId,
        exitCode: input.exitCode ?? null,
        validationEvidence: input.validationEvidence ?? null,
      },
    });
    return this.runtimeJobs.completeJob({
      leaseToken: input.leaseToken,
      result,
    });
  }

  async failScriptJob(input: FailScriptJobInput): Promise<RuntimeJob | null> {
    const job = await this.runtimeJobs.getJob(input.jobId);
    if (!job || !isScriptJobPayload(job.payload)) {
      throw new Error(`script job not found: ${input.jobId}`);
    }
    const error = {
      code: input.code,
      message: input.message,
      scriptId: job.payload.scriptId,
      evidence: input.evidence ?? null,
    };
    await this.runtimeJobs.recordEvent({
      jobId: input.jobId,
      eventType: "script_job.failed",
      data: error,
    });
    return this.runtimeJobs.failJob({
      leaseToken: input.leaseToken,
      error,
      retryDelayMs: input.retryDelayMs,
    });
  }

  async attachScriptJobArtifactMetadata(input: {
    jobId: string;
    artifactId?: string;
    artifactType: string;
    uri: string;
    contentType?: string | null;
    sizeBytes?: number | null;
    sha256?: string | null;
    metadata?: JsonValue;
  }) {
    const job = await this.runtimeJobs.getJob(input.jobId);
    if (!job || !isScriptJobPayload(job.payload)) {
      throw new Error(`script job not found: ${input.jobId}`);
    }
    const definition = this.registry.requireScriptJobDefinition(job.payload.scriptId);
    assertJsonByteLength(
      input.metadata,
      definition.artifactPolicy.maxMetadataBytes,
      "script artifact metadata",
    );
    return this.runtimeJobs.attachArtifact({
      artifactId: input.artifactId,
      jobId: input.jobId,
      artifactType: input.artifactType,
      storageKind: "metadata",
      uri: input.uri,
      contentType: input.contentType ?? "application/json",
      sizeBytes: input.sizeBytes ?? jsonByteLength(input.metadata),
      sha256: input.sha256 ?? null,
      metadata: input.metadata ?? {},
    });
  }

  async recordValidationLaneEvidence(input: { jobId: string; evidence: ValidationLaneEvidence }) {
    await this.runtimeJobs.recordEvent({
      jobId: input.jobId,
      eventType: "script_job.validation_lane_evidence",
      data: input.evidence,
    });
    return this.attachScriptJobArtifactMetadata({
      jobId: input.jobId,
      artifactType: "script_job.validation_lane_evidence",
      uri: `runtime-job://${input.jobId}/script-job/validation-lane-evidence`,
      metadata: input.evidence,
    });
  }

  async readScriptJobStatus(jobId: string): Promise<ScriptJobStatus> {
    const job = await this.runtimeJobs.getJob(jobId);
    return {
      job,
      payload: job && isScriptJobPayload(job.payload) ? job.payload : null,
      result: job && isScriptJobResult(job.result) ? job.result : null,
      evidence: {
        events: await this.runtimeJobs.listEvents(jobId),
        artifacts: await this.runtimeJobs.listArtifacts(jobId),
      },
    };
  }
}
