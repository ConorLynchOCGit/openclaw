import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type { BoundedWorkflowGuidanceCaptureClass } from "./config.js";
import type { CandidateSubmissionResult, RankedRetrievedMemoryRecord } from "./db/runtime.js";
import type { LearnedGuidanceAdvisoryPlanningAcceptedResult } from "./learned-guidance-advisory-planning.js";
import type { MemoryMiddlewareRuntime } from "./runtime.js";
import type {
  SelfImprovingCandidateCaptureAcceptedResult,
  SelfImprovingCandidateCaptureRejectedResult,
} from "./self-improving-candidate-capture.js";
import { createMemoryObjectSearchHybridTool } from "./tools/memory-object-search-hybrid.js";
import {
  REAL_WORKSPACE_EXPLICIT_DOCS_LOCALIZATION_PACKET,
  REAL_WORKSPACE_EXPLICIT_FILE_REFERENCE_PACKET,
  REAL_WORKSPACE_NATIVE_WORKFLOW_PACKET,
  REAL_WORKSPACE_SELF_IMPROVING_WORKFLOW_PACKET,
} from "./tools/real-workspace-memory-packets.fixture.js";

export type AutomatedRolloutEvalSeededContext = {
  projectId: string;
  agentId: string;
  sessionId: string;
};

export type AutomatedRolloutEvalRankingSignal = {
  approvedMemoryObjectId: string;
  weakerCandidateId: string;
  strongerApprovedRankedFirst: boolean;
  weakerCandidateRank: number | null;
  topMatchedFields: string[];
  approvedReviewState: string;
  weakerReviewState: string;
  metadata: {
    familyOrTemplate?: string;
    captureClass?: string;
    subject?: string;
  };
};

export type AutomatedRolloutEvalGuidanceSignal = {
  outcome: "guidance_available" | "no_guidance" | "conflict_suppressed";
  advisoryOnly: boolean;
  suggestionCount: number;
  suppressedConflictCount: number;
  estimatedPromptTokens: number;
  provenances: Array<"native_capture" | "self_improving_capture">;
  captureClasses: Array<BoundedWorkflowGuidanceCaptureClass>;
  guidancePatterns: string[];
  recommendedActions: string[];
  avoidActions: string[];
};

export type AutomatedRolloutEvalReport = {
  generatedAt: string;
  rolloutTarget?: "off-production" | "production-canary";
  schema: string;
  context: AutomatedRolloutEvalSeededContext;
  summary: {
    passed: boolean;
    docsLocalizationRankingPassed: boolean;
    fileReferenceRankingPassed: boolean;
    selfImprovingCandidateOnlyPassed: boolean;
    learnedGuidanceNativePassed: boolean;
    learnedGuidanceSelfImprovingPassed: boolean;
    learnedGuidanceConflictPassed: boolean;
    remainingWeakSpots: string[];
  };
  explicitDocsLocalization: AutomatedRolloutEvalRankingSignal;
  explicitFileReference: AutomatedRolloutEvalRankingSignal;
  selfImprovingCandidateOnly: {
    initialCandidateId: string;
    approvedMemoryObjectId: string;
    initialOutcomeCode: string;
    duplicateReplayAccepted: boolean;
    duplicateReplayStatus: string;
    duplicateReplayOutcomeCode: string;
    duplicateReplayReason?: string;
    replayBlocked: boolean;
  };
  learnedGuidance: {
    nativeWorkflow: AutomatedRolloutEvalGuidanceSignal;
    selfImprovingWorkflow: AutomatedRolloutEvalGuidanceSignal;
    conflictingWorkflowGuidance: AutomatedRolloutEvalGuidanceSignal & {
      subjectKeys: string[];
    };
  };
};

type MemoryObjectMetadataView = {
  reviewState: string;
  familyOrTemplate?: string;
  captureClass?: string;
  subject?: string;
};

function assertSafeSchemaName(schema: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error(`unsafe schema name: ${schema}`);
  }
  return schema;
}

function summarizeFailure(result: { status: string; reason?: string }): string {
  return result.reason ? `${result.status}: ${result.reason}` : result.status;
}

function buildApprovedCanonicalWorkflowGuidanceMetadata(params: {
  lessonFamily: "generalized_workflow_lesson";
  subject: string;
  subjectKey: string;
  recommendedAction: string;
  avoidAction?: string;
  guidancePattern: "use_instead_of" | "trust_for_scope" | "avoid_only";
}): Record<string, unknown> {
  const statement =
    params.guidancePattern === "use_instead_of" && params.avoidAction
      ? `for ${params.subject}, use ${params.recommendedAction} instead of ${params.avoidAction}`
      : params.guidancePattern === "trust_for_scope" && params.avoidAction
        ? `for ${params.subject}, trust ${params.recommendedAction}; ${params.avoidAction} is only a narrower signal`
        : params.guidancePattern === "avoid_only" && params.avoidAction
          ? `for ${params.subject}, avoid ${params.avoidAction}`
          : `for ${params.subject}, use ${params.recommendedAction}`;
  return {
    candidateMetadata: {
      canonicalIngestionCandidate: {
        record: {
          kind: "feedback",
          subject: params.subject,
          statement,
          tags: ["feedback", "workflow_guidance", "workflow_improvement"],
          facets: {
            workflow_guidance: true,
            lessonFamily: params.lessonFamily,
            subjectKey: params.subjectKey,
            captureClass: "workflow_generalized_guidance",
            guidancePattern: params.guidancePattern,
            recommendedAction: params.recommendedAction,
            ...(params.avoidAction ? { avoidAction: params.avoidAction } : {}),
          },
          provenance: {
            captureSeam: "tool-submitted",
            captureProfile: "tool-submitted",
            reviewState: "approved",
          },
          compatibility: {
            captureCategory: "workflow_improvement",
            captureSource: "explicit_workflow_improvement",
          },
        },
      },
    },
  };
}

function requireAcceptedCandidateSubmission(
  result: CandidateSubmissionResult,
  label: string,
): Extract<CandidateSubmissionResult, { accepted: true }> {
  if (!result.accepted) {
    throw new Error(`${label} failed: ${summarizeFailure(result)}`);
  }
  return result;
}

function requireAcceptedResult<T extends { accepted: boolean; status: string; reason?: string }>(
  result: T,
  label: string,
): Extract<T, { accepted: true }> {
  if (!result.accepted) {
    throw new Error(`${label} failed: ${summarizeFailure(result)}`);
  }
  return result as Extract<T, { accepted: true }>;
}

function buildGuidanceSignal(
  result: LearnedGuidanceAdvisoryPlanningAcceptedResult,
): AutomatedRolloutEvalGuidanceSignal {
  return {
    outcome: result.outcome,
    advisoryOnly: result.advisoryOnly,
    suggestionCount: result.suggestions.length,
    suppressedConflictCount: result.suppressedConflicts.length,
    estimatedPromptTokens: result.observability.estimatedPromptTokens,
    provenances: result.suggestions.map((suggestion) => suggestion.provenance),
    captureClasses: result.suggestions.map((suggestion) => suggestion.captureClass),
    guidancePatterns: result.suggestions
      .map((suggestion) => suggestion.guidancePattern)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
    recommendedActions: result.suggestions
      .map((suggestion) => suggestion.recommendedAction)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
    avoidActions: result.suggestions
      .map((suggestion) => suggestion.avoidAction)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  };
}

async function connectClient(connectionString: string): Promise<Client> {
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

export async function seedAutomatedRolloutEvalContext(params: {
  connectionString: string;
  schema?: string;
}): Promise<AutomatedRolloutEvalSeededContext> {
  const schema = assertSafeSchemaName(params.schema ?? "memory_middleware");
  const client = await connectClient(params.connectionString);
  try {
    const project = await client.query<{ id: string }>(
      `
        insert into ${schema}.projects (slug, name)
        values ($1, $2)
        returning id::text as id
      `,
      [`rollout-eval-${randomUUID()}`, "Memory Rollout Eval Project"],
    );
    const agent = await client.query<{ id: string }>(
      `
        insert into ${schema}.agents (name, role)
        values ($1, $2)
        returning id::text as id
      `,
      ["Memory Rollout Eval Agent", "tester"],
    );

    const projectId = project.rows[0]?.id;
    const agentId = agent.rows[0]?.id;
    if (!projectId || !agentId) {
      throw new Error("failed to seed rollout eval project or agent");
    }

    const session = await client.query<{ id: string }>(
      `
        insert into ${schema}.sessions (project_id, agent_id, session_key, title)
        values ($1::uuid, $2::uuid, $3::text, $4::text)
        returning id::text as id
      `,
      [projectId, agentId, `rollout-eval-${randomUUID()}`, "Memory Rollout Eval Session"],
    );

    const sessionId = session.rows[0]?.id;
    if (!sessionId) {
      throw new Error("failed to seed rollout eval session");
    }

    return { projectId, agentId, sessionId };
  } finally {
    await client.end();
  }
}

async function ageMemoryObject(params: {
  connectionString: string;
  schema: string;
  objectId: string;
}): Promise<void> {
  const client = await connectClient(params.connectionString);
  try {
    await client.query(
      `
        update ${params.schema}.memory_objects
        set
          created_at = now() - interval '10 seconds',
          updated_at = now() - interval '10 seconds'
        where id = $1::uuid
      `,
      [params.objectId],
    );
  } finally {
    await client.end();
  }
}

async function insertConflictingApprovedGuidance(params: {
  connectionString: string;
  schema: string;
  context: AutomatedRolloutEvalSeededContext;
}): Promise<string[]> {
  const client = await connectClient(params.connectionString);
  try {
    const result = await client.query<{ id: string }>(
      `
        insert into ${params.schema}.memory_objects (
          project_id,
          agent_id,
          session_id,
          memory_kind,
          review_state,
          content,
          metadata
        )
        values
          ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $4::text, $5::jsonb),
          ($1::uuid, $2::uuid, $3::uuid, 'project', 'approved', $6::text, $7::jsonb)
        returning id::text as id
      `,
      [
        params.context.projectId,
        params.context.agentId,
        params.context.sessionId,
        "Workflow improvement: for release proof notes, use PRE_CAPTURE_HARDENING_BATCH_REPORT_V1.md instead of ad hoc scratch notes.",
        JSON.stringify(
          buildApprovedCanonicalWorkflowGuidanceMetadata({
            lessonFamily: "generalized_workflow_lesson",
            subject: "release proof notes",
            subjectKey: "release-proof-notes",
            guidancePattern: "use_instead_of",
            recommendedAction: "PRE_CAPTURE_HARDENING_BATCH_REPORT_V1.md",
            avoidAction: "ad hoc scratch notes",
          }),
        ),
        "Workflow improvement: for release proof notes, use SELF_IMPROVING_AND_ADVISORY_BATCH_REPORT_V1.md instead of ad hoc scratch notes.",
        JSON.stringify(
          buildApprovedCanonicalWorkflowGuidanceMetadata({
            lessonFamily: "generalized_workflow_lesson",
            subject: "release proof notes",
            subjectKey: "release-proof-notes",
            guidancePattern: "use_instead_of",
            recommendedAction: "SELF_IMPROVING_AND_ADVISORY_BATCH_REPORT_V1.md",
            avoidAction: "ad hoc scratch notes",
          }),
        ),
      ],
    );
    return result.rows.map((row) => row.id);
  } finally {
    await client.end();
  }
}

async function approveAndPromoteCandidate(params: {
  runtime: MemoryMiddlewareRuntime;
  candidateId: string;
  agentId: string;
  rationale: string;
}): Promise<string> {
  const review = await params.runtime.candidateReview.review({
    candidateId: params.candidateId,
    outcome: "accepted",
    reviewerAgentId: params.agentId,
    rationale: params.rationale,
  });
  requireAcceptedResult(review, "candidate review");

  const promotion = await params.runtime.candidatePromotion.promoteToMemory({
    candidateId: params.candidateId,
    promoterAgentId: params.agentId,
    rationale: params.rationale,
  });
  return requireAcceptedResult(promotion, "candidate promotion").promotedMemoryObjectId;
}

async function readMemoryObjectMetadata(params: {
  connectionString: string;
  schema: string;
  objectId: string;
}): Promise<MemoryObjectMetadataView> {
  const client = await connectClient(params.connectionString);
  try {
    const result = await client.query<{
      review_state: string;
      lesson_family: string | null;
      template: string | null;
      response_style_family: string | null;
      capture_class: string | null;
      subject: string | null;
    }>(
      `
        select
          review_state::text as review_state,
          metadata->'candidateMetadata'->'autoCapture'->>'lessonFamily' as lesson_family,
          metadata->'candidateMetadata'->'autoCapture'->>'template' as template,
          metadata->'candidateMetadata'->'autoCapture'->>'responseStyleFamily' as response_style_family,
          metadata->'candidateMetadata'->'autoCapture'->>'captureClass' as capture_class,
          metadata->'candidateMetadata'->'autoCapture'->>'subject' as subject
        from ${params.schema}.memory_objects
        where id = $1::uuid
      `,
      [params.objectId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error(`missing memory object ${params.objectId}`);
    }
    return {
      reviewState: row.review_state,
      familyOrTemplate: row.lesson_family ?? row.template ?? row.response_style_family ?? undefined,
      captureClass: row.capture_class ?? undefined,
      subject: row.subject ?? undefined,
    };
  } finally {
    await client.end();
  }
}

function extractRankingSignal(params: {
  approvedMemoryObjectId: string;
  weakerCandidateId: string;
  searchRecords: RankedRetrievedMemoryRecord[];
  approvedMetadata: MemoryObjectMetadataView;
  weakerMetadata: MemoryObjectMetadataView;
}): AutomatedRolloutEvalRankingSignal {
  const weakerCandidateRank = params.searchRecords.findIndex(
    (record) => record.id === params.weakerCandidateId,
  );
  const approvedIndex = params.searchRecords.findIndex(
    (record) => record.id === params.approvedMemoryObjectId,
  );
  const topMatchedFields = params.searchRecords[0]?.matchedFields ?? [];

  return {
    approvedMemoryObjectId: params.approvedMemoryObjectId,
    weakerCandidateId: params.weakerCandidateId,
    strongerApprovedRankedFirst: approvedIndex === 0,
    weakerCandidateRank: weakerCandidateRank >= 0 ? weakerCandidateRank : null,
    topMatchedFields,
    approvedReviewState: params.approvedMetadata.reviewState,
    weakerReviewState: params.weakerMetadata.reviewState,
    metadata: {
      familyOrTemplate: params.approvedMetadata.familyOrTemplate,
      captureClass: params.approvedMetadata.captureClass,
      subject: params.approvedMetadata.subject,
    },
  };
}

async function evaluateExplicitDocsLocalization(params: {
  runtime: MemoryMiddlewareRuntime;
  context: AutomatedRolloutEvalSeededContext;
  connectionString: string;
  schema: string;
}): Promise<AutomatedRolloutEvalRankingSignal> {
  const explicitSubmission = requireAcceptedCandidateSubmission(
    await params.runtime.candidateIngress.submitImprovementNote({
      content: REAL_WORKSPACE_EXPLICIT_DOCS_LOCALIZATION_PACKET.content,
      projectId: params.context.projectId,
      sessionId: params.context.sessionId,
      agentId: params.context.agentId,
    }),
    "explicit docs-localization submission",
  );

  const approvedMemoryObjectId = await approveAndPromoteCandidate({
    runtime: params.runtime,
    candidateId: explicitSubmission.memoryObjectId,
    agentId: params.context.agentId,
    rationale: "Approve the explicit docs-localization packet for automated rollout eval.",
  });

  const weakerSubmission = requireAcceptedCandidateSubmission(
    await params.runtime.candidateIngress.submitImprovementNote({
      content: REAL_WORKSPACE_EXPLICIT_DOCS_LOCALIZATION_PACKET.weakerNearbyContent,
      projectId: params.context.projectId,
      sessionId: params.context.sessionId,
      agentId: params.context.agentId,
    }),
    "weaker docs-localization submission",
  );

  const searchToolResult = await createMemoryObjectSearchHybridTool({
    runtime: params.runtime,
    context: {
      sessionId: params.context.sessionId,
      agentId: params.context.agentId,
    } as never,
  }).execute("automated-rollout-eval-docs-search", {
    query: REAL_WORKSPACE_EXPLICIT_DOCS_LOCALIZATION_PACKET.retrievalQuery,
    scope: "include_candidates",
    kind: "project",
    projectId: params.context.projectId,
  });
  const search = searchToolResult.details as {
    accepted: boolean;
    status: string;
    reason?: string;
    records: RankedRetrievedMemoryRecord[];
  };
  if (!search.accepted) {
    throw new Error(`docs-localization hybrid search failed: ${summarizeFailure(search)}`);
  }

  const approvedMetadata = await readMemoryObjectMetadata({
    connectionString: params.connectionString,
    schema: params.schema,
    objectId: approvedMemoryObjectId,
  });
  const weakerMetadata = await readMemoryObjectMetadata({
    connectionString: params.connectionString,
    schema: params.schema,
    objectId: weakerSubmission.memoryObjectId,
  });

  return extractRankingSignal({
    approvedMemoryObjectId,
    weakerCandidateId: weakerSubmission.memoryObjectId,
    searchRecords: search.records,
    approvedMetadata,
    weakerMetadata,
  });
}

async function evaluateExplicitFileReference(params: {
  runtime: MemoryMiddlewareRuntime;
  context: AutomatedRolloutEvalSeededContext;
  connectionString: string;
  schema: string;
}): Promise<AutomatedRolloutEvalRankingSignal> {
  const explicitSubmission = requireAcceptedCandidateSubmission(
    await params.runtime.candidateIngress.submitLearning({
      content: REAL_WORKSPACE_EXPLICIT_FILE_REFERENCE_PACKET.content,
      projectId: params.context.projectId,
      sessionId: params.context.sessionId,
      agentId: params.context.agentId,
    }),
    "explicit file-reference submission",
  );

  const approvedMemoryObjectId = await approveAndPromoteCandidate({
    runtime: params.runtime,
    candidateId: explicitSubmission.memoryObjectId,
    agentId: params.context.agentId,
    rationale: "Approve the explicit file-reference packet for automated rollout eval.",
  });

  const weakerSubmission = requireAcceptedCandidateSubmission(
    await params.runtime.candidateIngress.submitLearning({
      content: REAL_WORKSPACE_EXPLICIT_FILE_REFERENCE_PACKET.weakerNearbyContent,
      projectId: params.context.projectId,
      sessionId: params.context.sessionId,
      agentId: params.context.agentId,
    }),
    "weaker file-reference submission",
  );
  await ageMemoryObject({
    connectionString: params.connectionString,
    schema: params.schema,
    objectId: weakerSubmission.memoryObjectId,
  });

  const searchToolResult = await createMemoryObjectSearchHybridTool({
    runtime: params.runtime,
    context: {
      sessionId: params.context.sessionId,
      agentId: params.context.agentId,
    } as never,
  }).execute("automated-rollout-eval-file-search", {
    query: REAL_WORKSPACE_EXPLICIT_FILE_REFERENCE_PACKET.retrievalQuery,
    scope: "include_candidates",
    kind: "feedback",
    projectId: params.context.projectId,
  });
  const search = searchToolResult.details as {
    accepted: boolean;
    status: string;
    reason?: string;
    records: RankedRetrievedMemoryRecord[];
  };
  if (!search.accepted) {
    throw new Error(`file-reference hybrid search failed: ${summarizeFailure(search)}`);
  }

  const approvedMetadata = await readMemoryObjectMetadata({
    connectionString: params.connectionString,
    schema: params.schema,
    objectId: approvedMemoryObjectId,
  });
  const weakerMetadata = await readMemoryObjectMetadata({
    connectionString: params.connectionString,
    schema: params.schema,
    objectId: weakerSubmission.memoryObjectId,
  });

  return extractRankingSignal({
    approvedMemoryObjectId,
    weakerCandidateId: weakerSubmission.memoryObjectId,
    searchRecords: search.records,
    approvedMetadata,
    weakerMetadata,
  });
}

async function evaluateSelfImprovingCandidateOnly(params: {
  runtime: MemoryMiddlewareRuntime;
  context: AutomatedRolloutEvalSeededContext;
}): Promise<AutomatedRolloutEvalReport["selfImprovingCandidateOnly"]> {
  const initialCapture = await params.runtime.selfImprovingCandidateCapture.capture({
    kind: REAL_WORKSPACE_SELF_IMPROVING_WORKFLOW_PACKET.kind,
    content: REAL_WORKSPACE_SELF_IMPROVING_WORKFLOW_PACKET.content,
    projectId: params.context.projectId,
    sessionId: params.context.sessionId,
    agentId: params.context.agentId,
    metadata: {
      source: "automated-rollout-eval",
      packetId: REAL_WORKSPACE_SELF_IMPROVING_WORKFLOW_PACKET.id,
    },
  });
  const acceptedInitial = requireAcceptedResult(initialCapture, "self-improving capture");

  const approvedMemoryObjectId = await approveAndPromoteCandidate({
    runtime: params.runtime,
    candidateId: acceptedInitial.memoryObjectId,
    agentId: params.context.agentId,
    rationale: "Approve the self-improving workflow packet for automated rollout eval.",
  });

  const duplicateReplay = await params.runtime.selfImprovingCandidateCapture.capture({
    kind: REAL_WORKSPACE_SELF_IMPROVING_WORKFLOW_PACKET.kind,
    content: REAL_WORKSPACE_SELF_IMPROVING_WORKFLOW_PACKET.content,
    projectId: params.context.projectId,
    sessionId: params.context.sessionId,
    agentId: params.context.agentId,
    metadata: {
      source: "automated-rollout-eval",
      packetId: `${REAL_WORKSPACE_SELF_IMPROVING_WORKFLOW_PACKET.id}-duplicate`,
    },
  });

  const duplicateDetails = duplicateReplay as
    | SelfImprovingCandidateCaptureAcceptedResult
    | SelfImprovingCandidateCaptureRejectedResult;

  return {
    initialCandidateId: acceptedInitial.memoryObjectId,
    approvedMemoryObjectId,
    initialOutcomeCode: acceptedInitial.evaluation.outcomeCode,
    duplicateReplayAccepted: duplicateDetails.accepted,
    duplicateReplayStatus: duplicateDetails.status,
    duplicateReplayOutcomeCode: duplicateDetails.evaluation.outcomeCode,
    duplicateReplayReason: duplicateDetails.accepted ? undefined : duplicateDetails.reason,
    replayBlocked: duplicateDetails.evaluation.replayBlocked,
  };
}

async function evaluateLearnedGuidance(params: {
  runtime: MemoryMiddlewareRuntime;
  context: AutomatedRolloutEvalSeededContext;
  connectionString: string;
  schema: string;
}): Promise<AutomatedRolloutEvalReport["learnedGuidance"]> {
  const nativeWorkflowSubmission = requireAcceptedCandidateSubmission(
    await params.runtime.candidateIngress.submitImprovementNote({
      content: REAL_WORKSPACE_NATIVE_WORKFLOW_PACKET.content,
      projectId: params.context.projectId,
      sessionId: params.context.sessionId,
      agentId: params.context.agentId,
    }),
    "native workflow submission",
  );
  await approveAndPromoteCandidate({
    runtime: params.runtime,
    candidateId: nativeWorkflowSubmission.memoryObjectId,
    agentId: params.context.agentId,
    rationale: "Approve the native workflow packet for automated rollout eval.",
  });

  const nativeGuidance = requireAcceptedResult(
    await params.runtime.learnedGuidanceAdvisoryPlanning.plan({
      query: REAL_WORKSPACE_NATIVE_WORKFLOW_PACKET.advisoryQuery,
      projectId: params.context.projectId,
      maxSuggestions: 2,
    }),
    "native learned-guidance advisory plan",
  ) as LearnedGuidanceAdvisoryPlanningAcceptedResult;

  const selfImprovingGuidance = requireAcceptedResult(
    await params.runtime.learnedGuidanceAdvisoryPlanning.plan({
      query: REAL_WORKSPACE_SELF_IMPROVING_WORKFLOW_PACKET.advisoryQuery,
      projectId: params.context.projectId,
      maxSuggestions: 2,
    }),
    "self-improving learned-guidance advisory plan",
  ) as LearnedGuidanceAdvisoryPlanningAcceptedResult;

  const conflictingIds = await insertConflictingApprovedGuidance({
    connectionString: params.connectionString,
    schema: params.schema,
    context: params.context,
  });
  const conflictGuidance = requireAcceptedResult(
    await params.runtime.learnedGuidanceAdvisoryPlanning.plan({
      query: "what should I use for release proof notes?",
      projectId: params.context.projectId,
      maxSuggestions: 2,
    }),
    "conflicting learned-guidance advisory plan",
  ) as LearnedGuidanceAdvisoryPlanningAcceptedResult;

  return {
    nativeWorkflow: buildGuidanceSignal(nativeGuidance),
    selfImprovingWorkflow: buildGuidanceSignal(selfImprovingGuidance),
    conflictingWorkflowGuidance: {
      ...buildGuidanceSignal(conflictGuidance),
      subjectKeys: conflictGuidance.suppressedConflicts.map((conflict) => conflict.subjectKey),
    },
  };
}

export async function runAutomatedRolloutEval(params: {
  runtime: MemoryMiddlewareRuntime;
  connectionString: string;
  context: AutomatedRolloutEvalSeededContext;
  schema?: string;
}): Promise<AutomatedRolloutEvalReport> {
  const schema = assertSafeSchemaName(
    params.schema ?? params.runtime.config.database.schema ?? "memory_middleware",
  );
  const explicitDocsLocalization = await evaluateExplicitDocsLocalization({
    runtime: params.runtime,
    context: params.context,
    connectionString: params.connectionString,
    schema,
  });
  const explicitFileReference = await evaluateExplicitFileReference({
    runtime: params.runtime,
    context: params.context,
    connectionString: params.connectionString,
    schema,
  });
  const selfImprovingCandidateOnly = await evaluateSelfImprovingCandidateOnly({
    runtime: params.runtime,
    context: params.context,
  });
  const learnedGuidance = await evaluateLearnedGuidance({
    runtime: params.runtime,
    context: params.context,
    connectionString: params.connectionString,
    schema,
  });

  const docsLocalizationRankingPassed =
    explicitDocsLocalization.strongerApprovedRankedFirst &&
    explicitDocsLocalization.approvedReviewState === "approved" &&
    explicitDocsLocalization.weakerReviewState === "candidate" &&
    explicitDocsLocalization.metadata.familyOrTemplate === "generalized_project_rule";
  const fileReferenceRankingPassed =
    explicitFileReference.strongerApprovedRankedFirst &&
    explicitFileReference.approvedReviewState === "approved" &&
    explicitFileReference.weakerReviewState === "candidate" &&
    explicitFileReference.metadata.familyOrTemplate === "response_style_generalized_guidance";
  const selfImprovingCandidateOnlyPassed =
    selfImprovingCandidateOnly.initialOutcomeCode === "candidate_created" &&
    selfImprovingCandidateOnly.duplicateReplayAccepted === false &&
    selfImprovingCandidateOnly.duplicateReplayOutcomeCode === "approved_memory_already_exists" &&
    selfImprovingCandidateOnly.replayBlocked === false;
  const learnedGuidanceNativePassed =
    learnedGuidance.nativeWorkflow.outcome === "guidance_available" &&
    learnedGuidance.nativeWorkflow.advisoryOnly &&
    learnedGuidance.nativeWorkflow.provenances.includes("native_capture") &&
    learnedGuidance.nativeWorkflow.captureClasses.includes("workflow_generalized_guidance") &&
    learnedGuidance.nativeWorkflow.guidancePatterns.includes(
      REAL_WORKSPACE_NATIVE_WORKFLOW_PACKET.expectedGuidancePattern,
    ) &&
    learnedGuidance.nativeWorkflow.recommendedActions.includes(
      REAL_WORKSPACE_NATIVE_WORKFLOW_PACKET.expectedRecommendedAction,
    ) &&
    learnedGuidance.nativeWorkflow.avoidActions.includes(
      REAL_WORKSPACE_NATIVE_WORKFLOW_PACKET.expectedAvoidAction,
    );
  const learnedGuidanceSelfImprovingPassed =
    learnedGuidance.selfImprovingWorkflow.outcome === "guidance_available" &&
    learnedGuidance.selfImprovingWorkflow.advisoryOnly &&
    learnedGuidance.selfImprovingWorkflow.provenances.includes("self_improving_capture") &&
    learnedGuidance.selfImprovingWorkflow.captureClasses.includes(
      "workflow_generalized_guidance",
    ) &&
    learnedGuidance.selfImprovingWorkflow.guidancePatterns.includes(
      REAL_WORKSPACE_SELF_IMPROVING_WORKFLOW_PACKET.expectedGuidancePattern,
    ) &&
    learnedGuidance.selfImprovingWorkflow.recommendedActions.includes(
      REAL_WORKSPACE_SELF_IMPROVING_WORKFLOW_PACKET.expectedRecommendedAction,
    ) &&
    learnedGuidance.selfImprovingWorkflow.avoidActions.includes(
      REAL_WORKSPACE_SELF_IMPROVING_WORKFLOW_PACKET.expectedAvoidAction,
    );
  const learnedGuidanceConflictPassed =
    learnedGuidance.conflictingWorkflowGuidance.outcome === "conflict_suppressed" &&
    learnedGuidance.conflictingWorkflowGuidance.advisoryOnly &&
    learnedGuidance.conflictingWorkflowGuidance.suppressedConflictCount === 1 &&
    learnedGuidance.conflictingWorkflowGuidance.subjectKeys.includes("release-proof-notes");
  const remainingWeakSpots = [
    ...(docsLocalizationRankingPassed
      ? []
      : ["docs_localization_explicit_ranking_or_metadata_incomplete"]),
    ...(fileReferenceRankingPassed ? [] : ["file_reference_explicit_under_retrieved"]),
    ...(learnedGuidanceNativePassed ? [] : ["native_workflow_guidance_under_retrieved"]),
  ];

  return {
    generatedAt: new Date().toISOString(),
    rolloutTarget:
      params.runtime.config.selfImprovingCapture?.rolloutTarget ??
      params.runtime.config.learnedGuidanceAdvisoryPlanning?.rolloutTarget,
    schema,
    context: params.context,
    summary: {
      passed:
        selfImprovingCandidateOnlyPassed &&
        learnedGuidanceSelfImprovingPassed &&
        learnedGuidanceConflictPassed,
      docsLocalizationRankingPassed,
      fileReferenceRankingPassed,
      selfImprovingCandidateOnlyPassed,
      learnedGuidanceNativePassed,
      learnedGuidanceSelfImprovingPassed,
      learnedGuidanceConflictPassed,
      remainingWeakSpots,
    },
    explicitDocsLocalization,
    explicitFileReference,
    selfImprovingCandidateOnly,
    learnedGuidance,
  };
}
