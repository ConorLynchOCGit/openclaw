#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { loadConfig } from "../src/config/config.ts";
import { runGatewayAgentTeamRuntimeJobOnce } from "../src/gateway/execution-platform-agent-team-runner.ts";
import { getExecutionPlatformRuntime } from "../src/gateway/execution-platform-http.ts";

const ARTIFACT_DIR = ".artifacts/execution-platform";
const LOCAL_BASE = process.env.OPENCLAW_LOCAL_GATEWAY_BASE ?? "http://127.0.0.1:28789";
const SUBMIT_TIMEOUT_MS = Number(
  process.env.OPENCLAW_PRODUCT_SPEC_DIRECT_SUBMIT_TIMEOUT_MS ?? 600_000,
);
const PROGRESS_INTERVAL_MS = Number(
  process.env.OPENCLAW_PRODUCT_SPEC_DIRECT_PROGRESS_INTERVAL_MS ?? 30_000,
);

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

async function loadEnvFile(filePath) {
  const text = await fs.readFile(filePath, "utf8").catch(() => "");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index === -1) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    if (process.env[key]) {
      continue;
    }
    process.env[key] = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
}

async function writeJson(name, value) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const target = path.join(ARTIFACT_DIR, name);
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(target, body, "utf8");
  return {
    path: target,
    sha256: sha256(body),
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

async function boundedFetchJson(url, options = {}) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - startedAt,
      bodyHash: sha256(text),
      parsed,
      rawResponseStored: false,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      durationMs: Date.now() - startedAt,
      errorName: error?.name ?? "fetch_failed",
      rawResponseStored: false,
    };
  }
}

async function submitPrompt(prompt, promptHash) {
  const token = process.env.OPENCLAW_GATEWAY_TOKEN?.trim();
  if (!token) {
    return {
      ok: false,
      status: null,
      reasonCode: "OPENCLAW_GATEWAY_TOKEN_missing",
      rawResponseStored: false,
    };
  }
  const workItemId = `product-spec-direct-${promptHash.slice(0, 12)}-${Date.now()
    .toString(36)
    .slice(-6)}`;
  const submit = await boundedFetchJson(`${LOCAL_BASE}/api/execution-platform/execution/submit`, {
    method: "POST",
    timeoutMs: SUBMIT_TIMEOUT_MS,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-openclaw-actor-id": "operator:primary",
      "x-openclaw-session-key": "agent:main:main",
      "x-openclaw-source-route": "ux",
    },
    body: JSON.stringify({
      prompt,
      workItemId,
      sourceRoute: "ux",
      sourcePromptRef: {
        refKind: "direct_runtime_after_staged_scheduler",
        sessionKey: "agent:main:main",
        sessionId: "agent:main:main",
        promptHash,
        promptLength: prompt.length,
        runId: null,
        sourceRoute: "ux",
        rawPromptStored: false,
      },
      auth: {
        actorId: "operator:primary",
        authenticated: true,
        role: "operator",
        sessionId: "agent:main:main",
        sourceRoute: "ux",
      },
    }),
  });
  return {
    ...submit,
    workItemId,
    runtimeJobId:
      submit.parsed && typeof submit.parsed.runtimeJobId === "string"
        ? submit.parsed.runtimeJobId
        : null,
    workflowId:
      submit.parsed && typeof submit.parsed.workflowId === "string"
        ? submit.parsed.workflowId
        : null,
    jobType:
      submit.parsed && typeof submit.parsed.jobType === "string" ? submit.parsed.jobType : null,
    accepted: submit.parsed?.accepted === true,
    reasonCodes: Array.isArray(submit.parsed?.reasonCodes)
      ? submit.parsed.reasonCodes.filter((code) => typeof code === "string").slice(0, 40)
      : [],
  };
}

function artifactTypeCounts(artifacts) {
  const counts = new Map();
  for (const artifact of artifacts) {
    counts.set(artifact.artifactType, (counts.get(artifact.artifactType) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([artifactType, count]) => ({ artifactType, count }))
    .toSorted((left, right) => left.artifactType.localeCompare(right.artifactType));
}

function schedulerProgressFromArtifacts(artifacts) {
  return artifacts
    .filter((artifact) => artifact.artifactType === "agent_team.scheduler_progress")
    .map((artifact) => {
      const metadata =
        artifact.metadata && typeof artifact.metadata === "object" ? artifact.metadata : {};
      return {
        createdAt: artifact.createdAt.toISOString(),
        stage: typeof metadata.stage === "string" ? metadata.stage : null,
        status: typeof metadata.status === "string" ? metadata.status : null,
        phase: typeof metadata.schedulerPhase === "string" ? metadata.schedulerPhase : null,
        tool: typeof metadata.schedulerToolId === "string" ? metadata.schedulerToolId : null,
        nodeId: typeof metadata.nodeId === "string" ? metadata.nodeId : null,
        capabilityId: typeof metadata.capabilityId === "string" ? metadata.capabilityId : null,
        objective:
          typeof metadata.currentObjective === "string"
            ? metadata.currentObjective.slice(0, 360)
            : null,
        nextDecision:
          typeof metadata.nextDecisionNeeded === "string" ? metadata.nextDecisionNeeded : null,
        reasonCodes: Array.isArray(metadata.reasonCodes)
          ? metadata.reasonCodes.filter((code) => typeof code === "string").slice(0, 12)
          : [],
      };
    })
    .slice(-40);
}

function missionLedgerReadbackFromArtifacts(artifacts) {
  const ledgers = artifacts
    .filter((artifact) => artifact.artifactType === "execution_platform.mission_contract_ledger")
    .map((artifact) => {
      const metadata =
        artifact.metadata && typeof artifact.metadata === "object" ? artifact.metadata : {};
      const blocking = Array.isArray(metadata.blockingCommitments)
        ? metadata.blockingCommitments
        : [];
      const nonBlocking = Array.isArray(metadata.nonBlockingCommitments)
        ? metadata.nonBlockingCommitments
        : [];
      const commitments = [...blocking, ...nonBlocking]
        .filter((item) => item && typeof item === "object")
        .map((commitment) => ({
          commitmentId:
            typeof commitment.commitmentId === "string" ? commitment.commitmentId : null,
          commitmentText:
            typeof commitment.commitmentText === "string"
              ? commitment.commitmentText.slice(0, 900)
              : null,
          expectedEvidenceDescription:
            typeof commitment.expectedEvidenceDescription === "string"
              ? commitment.expectedEvidenceDescription.slice(0, 700)
              : null,
          status: typeof commitment.status === "string" ? commitment.status : null,
          blocking: commitment.blocking === true,
          acceptedEvidenceRefs: Array.isArray(commitment.acceptedEvidenceRefs)
            ? commitment.acceptedEvidenceRefs.filter((ref) => typeof ref === "string").slice(0, 8)
            : [],
          rejectedEvidenceRefs: Array.isArray(commitment.rejectedEvidenceRefs)
            ? commitment.rejectedEvidenceRefs.filter((ref) => typeof ref === "string").slice(0, 8)
            : [],
          remainingWork: Array.isArray(commitment.remainingWork)
            ? commitment.remainingWork.filter((item) => typeof item === "string").slice(0, 8)
            : [],
        }));
      return {
        artifactRef: artifact.uri,
        createdAt: artifact.createdAt.toISOString(),
        missionId: typeof metadata.missionId === "string" ? metadata.missionId : null,
        ledgerStatus: typeof metadata.ledgerStatus === "string" ? metadata.ledgerStatus : null,
        missionGate: typeof metadata.missionGate === "string" ? metadata.missionGate : null,
        missionGateRationale:
          typeof metadata.missionGateRationale === "string"
            ? metadata.missionGateRationale.slice(0, 900)
            : null,
        ownerObjectiveSummary:
          typeof metadata.ownerObjectiveSummary === "string"
            ? metadata.ownerObjectiveSummary.slice(0, 1_200)
            : null,
        blockingCommitmentCount: blocking.length,
        nonBlockingCommitmentCount: nonBlocking.length,
        openBlockingCommitmentIds: commitments
          .filter(
            (commitment) =>
              commitment.blocking &&
              commitment.status !== "satisfied" &&
              commitment.status !== "impossible",
          )
          .map((commitment) => commitment.commitmentId)
          .filter(Boolean),
        safetyConstraintCount: Array.isArray(metadata.safetyConstraints)
          ? metadata.safetyConstraints.length
          : 0,
        prohibitedDirectiveCandidates: Array.isArray(metadata.prohibitedDirectiveCandidates)
          ? metadata.prohibitedDirectiveCandidates
              .filter((item) => item && typeof item === "object")
              .map((item) => ({
                directiveId: typeof item.directiveId === "string" ? item.directiveId : null,
                classification:
                  typeof item.classification === "string" ? item.classification : null,
                actionCategory:
                  typeof item.actionCategory === "string" ? item.actionCategory : null,
              }))
              .slice(0, 20)
          : [],
        commitments,
        rawPromptStored: false,
        rawResponseStored: false,
      };
    });
  return {
    latest: ledgers.at(-1) ?? null,
    revisions: ledgers.map((ledger) => ({
      artifactRef: ledger.artifactRef,
      createdAt: ledger.createdAt,
      ledgerStatus: ledger.ledgerStatus,
      missionGate: ledger.missionGate,
      openBlockingCommitmentIds: ledger.openBlockingCommitmentIds,
    })),
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

async function collectProgressSnapshot(runtime, input) {
  const job = await runtime.runtimeJobs.getJob(input.runtimeJobId);
  const events = await runtime.runtimeJobs.listEvents(input.runtimeJobId, 250);
  const artifacts = await runtime.runtimeJobs.listArtifacts(input.runtimeJobId);
  const graphId =
    input.teamRunId ??
    artifacts
      .map((artifact) =>
        artifact.metadata && typeof artifact.metadata === "object"
          ? artifact.metadata.graphId
          : null,
      )
      .find((value) => typeof value === "string") ??
    null;
  const snapshot = graphId ? await runtime.runtimeWorkGraphs.readGraphSnapshot(graphId) : null;
  return {
    generatedAt: new Date().toISOString(),
    runtimeJobId: input.runtimeJobId,
    workItemId: input.workItemId,
    jobState: job?.state ?? "missing",
    jobAttempts: job?.attempts ?? null,
    graph: snapshot
      ? {
          graphId: snapshot.graph.graphId,
          status: snapshot.graph.graphStatus,
          nodeCount: snapshot.nodes.length,
          edgeCount: snapshot.edges.length,
          roleInvocationCount: snapshot.roleInvocations.length,
          activeNodes: snapshot.nodes
            .filter(
              (node) => node.nodeStatus === "running" || node.nodeStatus === "waiting_for_human",
            )
            .map((node) => ({
              nodeId: node.nodeId,
              nodeKind: node.nodeKind,
              assignedRole: node.assignedRole,
              modelOrWorkerRef: node.modelOrWorkerRef,
              objective:
                node.metadata && typeof node.metadata === "object"
                  ? String(node.metadata.exactObjective ?? "").slice(0, 360)
                  : null,
              targetRefs:
                node.metadata &&
                typeof node.metadata === "object" &&
                Array.isArray(node.metadata.targetRefs)
                  ? node.metadata.targetRefs.filter((ref) => typeof ref === "string").slice(0, 8)
                  : [],
            }))
            .slice(0, 8),
          nodeKinds: [...new Set(snapshot.nodes.map((node) => node.nodeKind))].toSorted(
            (left, right) => left.localeCompare(right),
          ),
          edgeKinds: [...new Set(snapshot.edges.map((edge) => edge.edgeKind))].toSorted(
            (left, right) => left.localeCompare(right),
          ),
          latestRoleInvocations: snapshot.roleInvocations.slice(-8).map((invocation) => ({
            roleId: invocation.roleId,
            nodeId: invocation.nodeId,
            modelRef: invocation.modelRef,
            providerPath: invocation.providerPath,
            transportKind: invocation.transportKind,
            artifactRefs: invocation.artifactRefs.slice(0, 6),
          })),
        }
      : null,
    eventTypes: [...new Set(events.map((event) => event.eventType))].toSorted((left, right) =>
      left.localeCompare(right),
    ),
    artifactCounts: artifactTypeCounts(artifacts),
    missionLedgerReadback: missionLedgerReadbackFromArtifacts(artifacts),
    schedulerProgress: schedulerProgressFromArtifacts(artifacts),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
  };
}

function progressLine(snapshot) {
  const latestScheduler = snapshot.schedulerProgress.at(-1) ?? null;
  const activeNode = snapshot.graph?.activeNodes?.[0] ?? null;
  const ledger = snapshot.missionLedgerReadback.latest;
  return {
    event: "product_spec_direct_progress",
    at: snapshot.generatedAt,
    runtimeJobId: snapshot.runtimeJobId,
    jobState: snapshot.jobState,
    graphStatus: snapshot.graph?.status ?? null,
    nodeCount: snapshot.graph?.nodeCount ?? 0,
    edgeCount: snapshot.graph?.edgeCount ?? 0,
    roleInvocationCount: snapshot.graph?.roleInvocationCount ?? 0,
    activeNode,
    latestScheduler,
    missionGate: ledger?.missionGate ?? null,
    openBlockingCommitmentIds: ledger?.openBlockingCommitmentIds ?? [],
  };
}

async function streamProgressUntilSettled(runtime, input, runPromise) {
  let settled = false;
  let latestResult = null;
  let latestError = null;
  runPromise
    .then((result) => {
      settled = true;
      latestResult = result;
    })
    .catch((error) => {
      settled = true;
      latestError = error;
    });
  for (;;) {
    if (settled) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, PROGRESS_INTERVAL_MS));
    const snapshot = await collectProgressSnapshot(runtime, input);
    await writeJson("product-spec-planning-direct-after-staged-scheduler-progress-latest.json", {
      artifactKind: "product_spec_planning_direct_after_staged_scheduler_progress_latest",
      ...snapshot,
    });
    process.stdout.write(`${JSON.stringify(progressLine(snapshot))}\n`);
  }
  if (latestError) {
    throw latestError;
  }
  return latestResult;
}

async function main() {
  const promptFile =
    process.argv[2] ??
    "docs/projects/execution-platform/prompts/product-spec-planning-production-upgrade-openclaw.md";
  await loadEnvFile(".env");
  await loadEnvFile(".env.execution-platform-staging");
  const prompt = await fs.readFile(promptFile, "utf8");
  const promptHash = sha256(prompt);
  const preflight = {
    artifactKind: "product_spec_planning_direct_after_staged_scheduler_preflight",
    generatedAt: new Date().toISOString(),
    promptFileHash: sha256(promptFile),
    promptHash,
    promptLength: prompt.length,
    localGatewayBaseHash: sha256(LOCAL_BASE),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
  await writeJson("product-spec-planning-direct-after-staged-scheduler-preflight.json", preflight);

  const submit = await submitPrompt(prompt, promptHash);
  if (!submit.accepted || !submit.runtimeJobId) {
    const summary = {
      artifactKind: "product_spec_planning_direct_after_staged_scheduler_summary",
      status: "submit_failed",
      promptHash,
      promptLength: prompt.length,
      submit: {
        ok: submit.ok,
        status: submit.status,
        accepted: submit.accepted,
        workflowId: submit.workflowId,
        jobType: submit.jobType,
        reasonCodes: submit.reasonCodes,
        workItemId: submit.workItemId,
        runtimeJobId: submit.runtimeJobId,
        rawResponseStored: false,
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
    await writeJson("product-spec-planning-direct-after-staged-scheduler-summary.json", summary);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  const config = loadConfig();
  const runtime = await getExecutionPlatformRuntime(config);
  let runResult = null;
  try {
    const runPromise = runGatewayAgentTeamRuntimeJobOnce({
      runtimeJobs: runtime.runtimeJobs,
      runtimeWorkGraphs: runtime.runtimeWorkGraphs,
      runtimeToolKernel: runtime.runtimeToolKernel,
      workQueue: runtime.workQueue,
      runtimeJobId: submit.runtimeJobId,
      workerId: "product-spec-direct-after-staged-scheduler-worker",
      queueName: "agent-team",
    });
    runResult = await streamProgressUntilSettled(
      runtime,
      {
        runtimeJobId: submit.runtimeJobId,
        workItemId: submit.workItemId,
        teamRunId: null,
      },
      runPromise,
    );
  } catch (error) {
    runResult = {
      claimed: false,
      completed: false,
      failed: true,
      status: "threw",
      runtimeJobId: submit.runtimeJobId,
      teamRunId: null,
      workflowId: "agent_team.coding",
      workerId: "product-spec-direct-after-staged-scheduler-worker",
      reasonCodes: [
        error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
      ],
    };
  }

  const job = await runtime.runtimeJobs.getJob(submit.runtimeJobId);
  const events = await runtime.runtimeJobs.listEvents(submit.runtimeJobId, 200);
  const artifacts = await runtime.runtimeJobs.listArtifacts(submit.runtimeJobId);
  const graphId =
    runResult && typeof runResult.teamRunId === "string" && runResult.teamRunId.length > 0
      ? runResult.teamRunId
      : null;
  const snapshot = graphId ? await runtime.runtimeWorkGraphs.readGraphSnapshot(graphId) : null;
  const summary = {
    artifactKind: "product_spec_planning_direct_after_staged_scheduler_summary",
    generatedAt: new Date().toISOString(),
    status: runResult?.completed ? "passed" : "needs_review",
    promptHash,
    promptLength: prompt.length,
    submit: {
      ok: submit.ok,
      status: submit.status,
      accepted: submit.accepted,
      workflowId: submit.workflowId,
      jobType: submit.jobType,
      reasonCodes: submit.reasonCodes,
      workItemId: submit.workItemId,
      runtimeJobId: submit.runtimeJobId,
      rawResponseStored: false,
    },
    runResult,
    job: job
      ? {
          jobId: job.jobId,
          state: job.state,
          attempts: job.attempts,
          workerId: job.workerId,
          startedAt: job.startedAt?.toISOString() ?? null,
          completedAt: job.completedAt?.toISOString() ?? null,
          errorCode:
            job.error && typeof job.error === "object" && "code" in job.error
              ? JSON.stringify(job.error.code).slice(0, 240)
              : null,
        }
      : null,
    graph: snapshot
      ? {
          graphId: snapshot.graph.graphId,
          workflowId: snapshot.graph.workflowId,
          status: snapshot.graph.graphStatus,
          nodeCount: snapshot.nodes.length,
          edgeCount: snapshot.edges.length,
          nodeKinds: [...new Set(snapshot.nodes.map((node) => node.nodeKind))].toSorted(
            (left, right) => left.localeCompare(right),
          ),
          capabilityIds: [
            ...new Set(
              snapshot.nodes
                .map((node) =>
                  node.metadata && typeof node.metadata === "object"
                    ? node.metadata.capabilityId
                    : null,
                )
                .filter((capabilityId) => typeof capabilityId === "string"),
            ),
          ].toSorted((left, right) => left.localeCompare(right)),
        }
      : null,
    eventTypes: [...new Set(events.map((event) => event.eventType))].toSorted((left, right) =>
      left.localeCompare(right),
    ),
    artifactCounts: artifactTypeCounts(artifacts),
    missionLedgerReadback: missionLedgerReadbackFromArtifacts(artifacts),
    schedulerProgress: schedulerProgressFromArtifacts(artifacts),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    secretsStored: false,
  };
  await writeJson("product-spec-planning-direct-after-staged-scheduler-summary.json", summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

await main().catch(async (error) => {
  const summary = {
    artifactKind: "product_spec_planning_direct_after_staged_scheduler_summary",
    status: "script_failed",
    errorName: error?.name ?? "unknown_error",
    errorSummary:
      error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
  await writeJson("product-spec-planning-direct-after-staged-scheduler-summary.json", summary);
  process.stderr.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(1);
});
