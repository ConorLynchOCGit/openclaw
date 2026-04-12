import type { OpenClawPluginToolContext } from "../../api.js";
import { withMemoryMiddlewarePgClient } from "../db/pg-pool.js";
import type { CandidateSubmissionInput } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import { resolveManagedAutoCaptureKey as resolveManagedAutoCaptureKeyStage } from "./candidate-submit-managed-resolution.js";
import { readNestedMetadataString } from "./candidate-submit-profile-helpers.js";

async function resolveManagedAutoCaptureKey(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<string | null> {
  return resolveManagedAutoCaptureKeyStage({
    runtime: params.runtime,
    input: params.input,
    context: params.context,
  });
}

export async function findExistingAutoCaptureManagedDuplicate(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
  context?: OpenClawPluginToolContext;
}): Promise<{ id: string; reviewState: string } | null> {
  const key = await resolveManagedAutoCaptureKey({
    runtime: params.runtime,
    input: params.input,
    context: params.context,
  });
  const databaseUrl = params.runtime.config.database.url;
  if (!key || !databaseUrl) {
    return null;
  }

  const schema = params.runtime.config.database.schema ?? "memory_middleware";
  const inputCategory = readNestedMetadataString(params.input.metadata, ["category"]);
  const projectScopedAutoCaptureProjectId =
    typeof params.input.projectId === "string" &&
    (params.input.kind === "improvement" ||
      inputCategory === "project_fact" ||
      inputCategory === "project_fact_correction")
      ? params.input.projectId
      : null;
  try {
    return await withMemoryMiddlewarePgClient({
      config: params.runtime.config,
      run: async (client) => {
        const result = await client.query<{ id: string; review_state: string }>(
          `
        select id::text as id, review_state::text as review_state
        from "${schema}"."memory_objects"
        where (
          coalesce(
            metadata->'canonicalIngestionCandidate'->'identity'->>'dedupeKey',
            metadata->'candidateMetadata'->'canonicalIngestionCandidate'->'identity'->>'dedupeKey',
            metadata->'promotionMetadata'->'canonicalIngestionCandidate'->'identity'->>'dedupeKey',
            metadata->'autoPromotion'->'canonicalIngestionCandidate'->'identity'->>'dedupeKey',
            ''
          ) = $1
          or
          metadata->'candidateMetadata'->'autoCapture'->>'key' = $1
          or metadata->'autoCapture'->>'key' = $1
        )
          and ($2::uuid is null or project_id = $2::uuid)
          and review_state in ('candidate', 'approved', 'corrected')
        order by created_at desc
        limit 1
          `,
          [key, projectScopedAutoCaptureProjectId],
        );
        const row = result.rows[0];
        return row ? { id: row.id, reviewState: row.review_state } : null;
      },
    });
  } catch {
    return null;
  }
}
