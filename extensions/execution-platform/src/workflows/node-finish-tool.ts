import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../../../../src/agents/pi-tools.types.js";
import { jsonResult } from "../../../../src/agents/tools/common.js";
import type { JsonValue } from "../runtime-job-types.ts";
import {
  NODE_EXECUTION_STORAGE_POLICY,
  type NodeExecutionStoragePolicy,
} from "./node-execution-snapshot.ts";
import type { SharedExecutionFinishResult } from "./shared-execution-finish-service.ts";

export const NODE_FINISH_ARTIFACT_TYPE = "execution_platform.node_finish" as const;
export const NODE_FINISH_SCHEMA_VERSION = "execution-platform.node-finish.v1" as const;
export const NODE_FINISH_TOOL_NAME = "node_finish" as const;

export type NodeFinishStatus = "completed" | "blocked" | "needs_escalation";
const NODE_FINISH_VALID_STATUSES = ["completed", "blocked", "needs_escalation"] as const;

export type NodeFinish = {
  artifactKind: typeof NODE_FINISH_ARTIFACT_TYPE;
  schemaVersion: typeof NODE_FINISH_SCHEMA_VERSION;
  nodeRunId: string;
  status: NodeFinishStatus;
  summary: string;
  evidenceRefs: string[];
  blockerKind: string | null;
  attemptedRefs: string[];
  reason: string | null;
  storagePolicy: NodeExecutionStoragePolicy;
};

type NodeFinishNativeEvidence = {
  evidenceRefs: string[];
  changeSetRefs: string[];
  changedFileRefs: string[];
  validationEvidenceRefs: string[];
  diagnosticRefs: string[];
  artifactRefs: string[];
  snapshotRefs: string[];
  graphRefs: string[];
  runtimeEventRefs: string[];
  workingContextRefs: string[];
  reasonCodes: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown, max = 80): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) {
      continue;
    }
    const normalized = item.trim();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= max) {
      break;
    }
  }
  return result;
}

function uniqueStrings(values: Array<string | null | undefined>, max = 120): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= max) {
      break;
    }
  }
  return result;
}

function isNodeFinishStatus(value: string): value is NodeFinishStatus {
  return (NODE_FINISH_VALID_STATUSES as readonly string[]).includes(value);
}

export function normalizeNodeFinish(input: { nodeRunId: string; raw: unknown }): NodeFinish {
  const record = asRecord(input.raw);
  const statusRaw = typeof record.status === "string" ? record.status.trim() : "";
  const status: NodeFinishStatus = isNodeFinishStatus(statusRaw) ? statusRaw : "blocked";
  const summary =
    typeof record.summary === "string" && record.summary.trim()
      ? record.summary.trim().slice(0, 2_000)
      : "Node finished without a model-authored summary.";
  return {
    artifactKind: NODE_FINISH_ARTIFACT_TYPE,
    schemaVersion: NODE_FINISH_SCHEMA_VERSION,
    nodeRunId: input.nodeRunId,
    status,
    summary,
    evidenceRefs: stringArray(record.evidenceRefs, 80),
    blockerKind:
      typeof record.blockerKind === "string" && record.blockerKind.trim()
        ? record.blockerKind.trim().slice(0, 160)
        : null,
    attemptedRefs: stringArray(record.attemptedRefs, 80),
    reason:
      typeof record.reason === "string" && record.reason.trim()
        ? record.reason.trim().slice(0, 1_000)
        : null,
    storagePolicy: NODE_EXECUTION_STORAGE_POLICY,
  };
}

const NodeFinishToolSchema = Type.Object({
  status: Type.Union(
    [Type.Literal("completed"), Type.Literal("blocked"), Type.Literal("needs_escalation")],
    {
      description:
        "Required terminal status. Valid values: completed, blocked, needs_escalation. Do not use ok, success, done, needs_review, or $success.",
    },
  ),
  summary: Type.String({
    minLength: 1,
    maxLength: 2000,
    description: "Bounded terminal summary for the graph node.",
  }),
  evidenceRefs: Type.Optional(
    Type.Array(Type.String({ minLength: 1, maxLength: 500 }), { maxItems: 80 }),
  ),
  blockerKind: Type.Optional(Type.String({ minLength: 1, maxLength: 160 })),
  attemptedRefs: Type.Optional(
    Type.Array(Type.String({ minLength: 1, maxLength: 500 }), { maxItems: 80 }),
  ),
  reason: Type.Optional(Type.String({ minLength: 1, maxLength: 1000 })),
});

function invalidNodeFinishStatusResult(statusRaw: unknown): JsonValue {
  const invalidStatus =
    typeof statusRaw === "string" && statusRaw.trim() ? statusRaw.trim().slice(0, 120) : null;
  const validStatuses = [...NODE_FINISH_VALID_STATUSES];
  return {
    accepted: false,
    reason: "invalid_status_enum",
    invalidStatus,
    validStatuses,
    message: `Invalid node_finish status${invalidStatus ? ` "${invalidStatus}"` : ""}. status must be one of: ${validStatuses.join(", ")}.`,
    examples: [
      {
        status: "completed",
        summary: "Applied the scoped edit and validated the touched behavior.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    ],
  };
}

export function createNodeFinishTool(input: {
  nodeRunId: string;
  onFinish?: (finish: NodeFinish) => Promise<void> | void;
  resolveNativeEvidence?: () => NodeFinishNativeEvidence | Promise<NodeFinishNativeEvidence>;
  onSharedFinish?: (
    finish: NodeFinish,
    nativeEvidence: NodeFinishNativeEvidence | null,
  ) => Promise<SharedExecutionFinishResult>;
}): AnyAgentTool {
  let rejectCount = 0;
  return {
    name: NODE_FINISH_TOOL_NAME,
    label: "Finish execution node",
    displaySummary:
      "Finish the current Execution Platform graph node with typed evidence or blocker.",
    description:
      'Terminal tool for an Execution Platform node session. Call this exactly once when the node is completed, blocked, or needs escalation. status must be one of: completed, blocked, needs_escalation. Do not use ok, success, done, needs_review, or $success. Example completed call: {"status":"completed","summary":"Applied the scoped edit and validated the touched behavior."}. Assistant prose does not complete the node. The runtime auto-attaches changed files, validation results, diagnostics, artifacts, and node snapshot evidence from durable runtime events; evidenceRefs are optional hints, not hidden ref choreography.',
    parameters: NodeFinishToolSchema,
    execute: async (_callId, rawParams) => {
      const rawRecord = asRecord(rawParams);
      const statusRaw = rawRecord.status;
      const statusText = typeof statusRaw === "string" ? statusRaw.trim() : "";
      if (!isNodeFinishStatus(statusText)) {
        return jsonResult(invalidNodeFinishStatusResult(statusRaw));
      }

      let finish = normalizeNodeFinish({ nodeRunId: input.nodeRunId, raw: rawParams });
      const nativeEvidence = (await input.resolveNativeEvidence?.()) ?? null;
      const autoAttachedEvidenceRefs = nativeEvidence
        ? uniqueStrings(
            nativeEvidence.evidenceRefs.filter((ref) => !finish.evidenceRefs.includes(ref)),
            80,
          )
        : [];
      if (autoAttachedEvidenceRefs.length > 0) {
        finish = {
          ...finish,
          evidenceRefs: uniqueStrings([...finish.evidenceRefs, ...autoAttachedEvidenceRefs], 80),
        };
      }

      if (input.onSharedFinish) {
        const sharedFinish = await input.onSharedFinish(finish, nativeEvidence);
        if (!sharedFinish.accepted) {
          rejectCount += 1;
          if (rejectCount >= 2) {
            const terminalFinish: NodeFinish = {
              ...finish,
              status: "blocked",
              blockerKind: "evidence_closure_missing",
              reason:
                "Runtime could not accept node_finish after repeated shared evidence closure failures.",
            };
            const terminalSharedFinish = await input.onSharedFinish(terminalFinish, nativeEvidence);
            await input.onFinish?.(terminalFinish);
            return jsonResult({
              accepted: true,
              nodeRunId: terminalFinish.nodeRunId,
              requestedStatus: finish.status,
              status: terminalFinish.status,
              lifecycle: "needs_review",
              reason: "terminalized_after_repeated_shared_evidence_closure_failure",
              evidenceRefCount: terminalSharedFinish.evidence.evidenceRefs.length,
              changedFileRefCount: terminalSharedFinish.evidence.changedFileRefs.length,
              changeSetRefCount: terminalSharedFinish.evidence.mutationRefs.length,
              validationEvidenceRefCount: terminalSharedFinish.evidence.validationRefs.length,
              artifactRefCount: terminalSharedFinish.evidence.artifactRefs.length,
              blockerKind: terminalFinish.blockerKind,
              correction: terminalSharedFinish.correction,
              reasonCodes: uniqueStrings([
                "node_finish_terminalized_needs_review_after_repeated_shared_evidence_closure_failure",
                ...sharedFinish.reasonCodes,
                ...terminalSharedFinish.reasonCodes,
              ]),
            });
          }
          return jsonResult({
            accepted: false,
            nodeRunId: finish.nodeRunId,
            status: finish.status,
            reason: "shared_runtime_finish_rejected",
            evidenceRefCount: sharedFinish.evidence.evidenceRefs.length,
            changedFileRefCount: sharedFinish.evidence.changedFileRefs.length,
            changeSetRefCount: sharedFinish.evidence.mutationRefs.length,
            validationEvidenceRefCount: sharedFinish.evidence.validationRefs.length,
            artifactRefCount: sharedFinish.evidence.artifactRefs.length,
            blockerKind: "evidence_closure_missing",
            correction:
              sharedFinish.correction ??
              "If edits and validation already ran, call node_finish once more with status completed and a summary only; the runtime will attach evidence. If they did not run, edit or validate first.",
            reasonCodes: uniqueStrings([
              "node_finish_tool_call_rejected_by_shared_finish_service",
              ...sharedFinish.reasonCodes,
            ]),
          });
        }
        await input.onFinish?.(finish);
        return jsonResult({
          accepted: true,
          nodeRunId: finish.nodeRunId,
          status: finish.status,
          sharedFinishStatus: sharedFinish.finishStatus,
          evidenceRefCount: sharedFinish.evidence.evidenceRefs.length,
          autoAttachedEvidenceRefCount: autoAttachedEvidenceRefs.length,
          changedFileRefCount: sharedFinish.evidence.changedFileRefs.length,
          changeSetRefCount: sharedFinish.evidence.mutationRefs.length,
          validationEvidenceRefCount: sharedFinish.evidence.validationRefs.length,
          artifactRefCount: sharedFinish.evidence.artifactRefs.length,
          blockerKind: finish.blockerKind,
          reasonCodes: uniqueStrings([
            "node_finish_tool_call_accepted_by_shared_finish_service",
            ...sharedFinish.reasonCodes,
          ]),
        });
      }

      await input.onFinish?.(finish);
      return jsonResult({
        accepted: true,
        nodeRunId: finish.nodeRunId,
        status: finish.status,
        evidenceRefCount: finish.evidenceRefs.length,
        autoAttachedEvidenceRefCount: autoAttachedEvidenceRefs.length,
        blockerKind: finish.blockerKind,
        reasonCodes: uniqueStrings([
          "node_finish_tool_call_accepted",
          autoAttachedEvidenceRefs.length > 0
            ? "node_finish_auto_attached_native_evidence_refs"
            : null,
        ]),
      });
    },
  };
}
