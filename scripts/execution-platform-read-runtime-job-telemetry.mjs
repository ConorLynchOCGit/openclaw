#!/usr/bin/env node
import process from "node:process";
import { createExecutionPlatformDatabaseRuntime } from "../extensions/execution-platform/src/db/runtime.ts";

function flag(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1]?.trim() ?? fallback) : fallback;
}

function numberFlag(name, fallback) {
  const value = flag(name);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function firstNumber(...values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function usageFromMetadata(metadata) {
  const record = asRecord(metadata);
  const diagnostics = asRecord(record.latestDiagnostics);
  const usage = asRecord(record.usage);
  const latestUsage = asRecord(diagnostics.usage);
  const providerDiagnostics = asRecord(diagnostics.providerDiagnostics);
  return {
    inputTokens: firstNumber(
      record.inputTokenCount,
      record.inputTokens,
      record.promptTokens,
      usage.inputTokenCount,
      usage.promptTokens,
      latestUsage.inputTokenCount,
      latestUsage.promptTokens,
      providerDiagnostics.promptTokenCount,
    ),
    outputTokens: firstNumber(
      record.outputTokenCount,
      record.outputTokens,
      record.completionTokens,
      usage.outputTokenCount,
      usage.completionTokens,
      latestUsage.outputTokenCount,
      latestUsage.completionTokens,
      providerDiagnostics.completionTokenCount,
    ),
    totalTokens: firstNumber(
      record.totalTokenCount,
      record.totalTokens,
      usage.totalTokenCount,
      usage.totalTokens,
      latestUsage.totalTokenCount,
      latestUsage.totalTokens,
    ),
    estimatedCostUsd: firstNumber(
      record.estimatedCostUsd,
      usage.estimatedCostUsd,
      latestUsage.estimatedCostUsd,
    ),
  };
}

function modelFromMetadata(metadata) {
  const record = asRecord(metadata);
  const diagnostics = asRecord(record.latestDiagnostics);
  const providerDiagnostics = asRecord(diagnostics.providerDiagnostics);
  return firstString(
    record.modelRef,
    record.model,
    record.providerModel,
    diagnostics.modelRef,
    providerDiagnostics.modelRef,
    asRecord(providerDiagnostics.requestProfileDiagnostics).modelRef,
  );
}

function providerFromMetadata(metadata) {
  const record = asRecord(metadata);
  const diagnostics = asRecord(record.latestDiagnostics);
  return firstString(record.providerPath, record.provider, diagnostics.providerPath);
}

function latencyFromMetadata(metadata) {
  const record = asRecord(metadata);
  const diagnostics = asRecord(record.latestDiagnostics);
  return firstNumber(
    record.latencyMs,
    record.durationMs,
    record.elapsedMs,
    diagnostics.latencyMs,
    diagnostics.durationMs,
    diagnostics.elapsedMs,
  );
}

function phaseFromMetadata(metadata, artifactType) {
  const record = asRecord(metadata);
  return (
    firstString(
      record.phase,
      record.currentPhase,
      record.schedulerPhase,
      record.stage,
      record.latestPhase,
      record.latestStage,
      record.roleId,
      record.nodeKind,
      record.toolId,
    ) ?? artifactType
  );
}

function packetDiagnosticSamples(metadata, artifactType, createdAt, uri) {
  const packetFanout = asRecord(asRecord(metadata).packetFanout);
  if (!Array.isArray(packetFanout.packetDiagnostics)) {
    return [];
  }
  return packetFanout.packetDiagnostics
    .map((diagnostic) => asRecord(diagnostic))
    .filter((diagnostic) => diagnostic.latestDiagnostics)
    .map((diagnostic) => {
      const latest = asRecord(diagnostic.latestDiagnostics);
      const usage = usageFromMetadata({ latestDiagnostics: latest });
      return {
        source: "packet_diagnostic",
        artifactType,
        uri,
        createdAt,
        phase:
          firstString(
            diagnostic.reasonCodes?.at?.(-1),
            asRecord(metadata).latestPhase,
            asRecord(metadata).latestStage,
          ) ?? "commitment_packet_authoring",
        commitmentId: firstString(diagnostic.commitmentId),
        status: firstString(diagnostic.status, latest.status),
        model: firstString(diagnostic.modelRef, latest.modelRef),
        provider: firstString(diagnostic.providerPath, latest.providerPath),
        latencyMs: firstNumber(latest.latencyMs),
        fallbackFromModelRef: firstString(latest.fallbackFromModelRef),
        fallbackReasonCode: firstString(latest.fallbackReasonCode),
        errorReasonCode: firstString(latest.errorReasonCode),
        finishReason: firstString(latest.finishReason),
        outputContentLength: firstNumber(latest.outputContentLength),
        ...usage,
      };
    });
}

function addAggregate(map, key, sample) {
  const aggregate = map.get(key) ?? {
    key,
    callCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    latencyMs: 0,
    latencySamples: 0,
    phases: {},
  };
  aggregate.callCount += 1;
  aggregate.inputTokens += sample.inputTokens ?? 0;
  aggregate.outputTokens += sample.outputTokens ?? 0;
  aggregate.totalTokens += sample.totalTokens ?? 0;
  aggregate.estimatedCostUsd += sample.estimatedCostUsd ?? 0;
  if (sample.latencyMs != null) {
    aggregate.latencyMs += sample.latencyMs;
    aggregate.latencySamples += 1;
  }
  aggregate.phases[sample.phase] = (aggregate.phases[sample.phase] ?? 0) + 1;
  map.set(key, aggregate);
}

function compactAggregate(value) {
  return {
    ...value,
    estimatedCostUsd: Number(value.estimatedCostUsd.toFixed(8)),
    averageLatencyMs:
      value.latencySamples > 0 ? Math.round(value.latencyMs / value.latencySamples) : null,
    phases: Object.fromEntries(
      Object.entries(value.phases).toSorted((left, right) => left[0].localeCompare(right[0])),
    ),
  };
}

async function main() {
  const jobId = flag("--job-id") ?? process.argv[2];
  if (!jobId) {
    throw new Error("job_id_required");
  }
  const recentLimit = numberFlag("--recent", 40);
  const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  try {
    const jobResult = await runtime.sqlClient.query(
      "select job_id,state,attempts,worker_id,started_at,completed_at,canceled_at,created_at,updated_at from execution_platform.runtime_jobs where job_id=$1",
      [jobId],
    );
    const job = jobResult.rows[0] ?? null;
    const artifactsResult = await runtime.sqlClient.query(
      "select artifact_type,uri,metadata,created_at from execution_platform.runtime_job_artifacts where job_id=$1 order by created_at asc",
      [jobId],
    );
    const eventsResult = await runtime.sqlClient.query(
      "select event_type,event_time,worker_id,data from execution_platform.runtime_job_events where job_id=$1 order by event_time asc",
      [jobId],
    );
    const toolsResult = await runtime.sqlClient.query(
      "select tool_id,tool_family,executor_key,role_ref,model_ref,provider_ref,status,started_at,completed_at,latency_ms,metadata,reason_codes from execution_platform.runtime_tool_invocations where runtime_job_id=$1 order by created_at asc",
      [jobId],
    );

    const artifactCounts = {};
    const modelAggregates = new Map();
    const phaseAggregates = new Map();
    const samples = [];

    for (const row of artifactsResult.rows) {
      artifactCounts[row.artifact_type] = (artifactCounts[row.artifact_type] ?? 0) + 1;
      const metadata = asRecord(row.metadata);
      const model = modelFromMetadata(metadata);
      const phase = phaseFromMetadata(metadata, row.artifact_type);
      const usage = usageFromMetadata(metadata);
      const latencyMs = latencyFromMetadata(metadata);
      const sample = {
        source: "artifact",
        artifactType: row.artifact_type,
        uri: row.uri,
        createdAt: row.created_at,
        phase,
        model,
        provider: providerFromMetadata(metadata),
        latencyMs,
        ...usage,
      };
      if (
        model ||
        latencyMs != null ||
        usage.inputTokens != null ||
        usage.outputTokens != null ||
        usage.totalTokens != null
      ) {
        samples.push(sample);
        addAggregate(phaseAggregates, phase, sample);
        if (model) {
          addAggregate(modelAggregates, model, sample);
        }
      }
      for (const packetSample of packetDiagnosticSamples(
        metadata,
        row.artifact_type,
        row.created_at,
        row.uri,
      )) {
        samples.push(packetSample);
        addAggregate(phaseAggregates, packetSample.phase, packetSample);
        if (packetSample.model) {
          addAggregate(modelAggregates, packetSample.model, packetSample);
        }
      }
    }

    for (const row of eventsResult.rows) {
      const data = asRecord(row.data);
      for (const packetSample of packetDiagnosticSamples(
        data,
        row.event_type,
        row.event_time,
        null,
      )) {
        samples.push({ ...packetSample, source: "event_packet_diagnostic" });
        addAggregate(phaseAggregates, packetSample.phase, packetSample);
        if (packetSample.model) {
          addAggregate(modelAggregates, packetSample.model, packetSample);
        }
      }
    }

    for (const row of toolsResult.rows) {
      const metadata = asRecord(row.metadata);
      const usage = usageFromMetadata(metadata);
      const phase = firstString(row.tool_id, row.executor_key, row.role_ref) ?? "runtime_tool";
      const model = firstString(row.model_ref, modelFromMetadata(metadata));
      const sample = {
        source: "tool_invocation",
        artifactType: row.tool_id,
        uri: null,
        createdAt: row.started_at,
        phase,
        model,
        provider: firstString(row.provider_ref, providerFromMetadata(metadata)),
        latencyMs: firstNumber(row.latency_ms, latencyFromMetadata(metadata)),
        ...usage,
      };
      samples.push(sample);
      addAggregate(phaseAggregates, phase, sample);
      if (model) {
        addAggregate(modelAggregates, model, sample);
      }
    }

    const firstEventAt = eventsResult.rows[0]?.event_time ?? null;
    const lastEventAt = eventsResult.rows.at(-1)?.event_time ?? null;
    const summary = {
      artifactKind: "execution_platform_runtime_job_telemetry_summary",
      generatedAt: new Date().toISOString(),
      job,
      eventCount: eventsResult.rows.length,
      artifactCount: artifactsResult.rows.length,
      toolInvocationCount: toolsResult.rows.length,
      firstEventAt,
      lastEventAt,
      wallClockMs:
        firstEventAt && lastEventAt
          ? new Date(lastEventAt).getTime() - new Date(firstEventAt).getTime()
          : null,
      artifactCounts: Object.fromEntries(
        Object.entries(artifactCounts).toSorted((left, right) => left[0].localeCompare(right[0])),
      ),
      modelUsage: [...modelAggregates.values()]
        .map(compactAggregate)
        .toSorted((left, right) => right.totalTokens - left.totalTokens),
      phaseUsage: [...phaseAggregates.values()]
        .map(compactAggregate)
        .toSorted((left, right) => right.callCount - left.callCount),
      recentSamples: samples.slice(-recentLimit),
      recentEvents: eventsResult.rows.slice(-recentLimit).map((row) => ({
        eventType: row.event_type,
        eventTime: row.event_time,
        workerId: row.worker_id,
        stage: asRecord(row.data).stage ?? asRecord(row.data).phase ?? null,
        status: asRecord(row.data).status ?? null,
        reasonCodes: Array.isArray(asRecord(row.data).reasonCodes)
          ? asRecord(row.data).reasonCodes.slice(0, 10)
          : [],
      })),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    await runtime.pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      artifactKind: "execution_platform_runtime_job_telemetry_error",
      generatedAt: new Date().toISOString(),
      errorName: error?.name ?? "unknown_error",
      errorSummary: String(error?.message ?? error).slice(0, 500),
      rawPromptStored: false,
      rawResponseStored: false,
    })}\n`,
  );
  process.exitCode = 1;
});
