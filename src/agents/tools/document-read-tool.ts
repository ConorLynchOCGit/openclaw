import path from "node:path";
import { Type } from "@sinclair/typebox";
import {
  DEFAULT_DOCUMENT_READ_CHUNK_BYTES,
  DEFAULT_DOCUMENT_READ_CHUNK_LINES,
  recommendDocumentIngestion,
} from "../document-ingestion-policy.js";
import {
  cleanupDocumentReadSession,
  DEFAULT_DOCUMENT_READ_MAX_LINE_BYTES,
  getDocumentReadSession,
  readDocumentChunk,
  startDocumentReadSession,
  verifyDocumentReadSession,
} from "../document-read.js";
import { optionalStringEnum } from "../schema/typebox.js";
import type { AnyAgentTool } from "./common.js";
import {
  payloadTextResult,
  readNumberParam,
  readStringParam,
  textResult,
  ToolInputError,
} from "./common.js";

const DOCUMENT_READ_ACTIONS = ["start", "next", "chunk", "status", "verify", "cleanup"] as const;

const DocumentReadToolSchema = Type.Object({
  action: optionalStringEnum(DOCUMENT_READ_ACTIONS),
  path: Type.Optional(Type.String({ description: "Workspace-relative path to the file." })),
  sessionId: Type.Optional(Type.String({ description: "Existing document_read session id." })),
  chunkIndex: Type.Optional(Type.Integer({ minimum: 0 })),
  chunkLines: Type.Optional(Type.Integer({ minimum: 1 })),
  chunkBytes: Type.Optional(Type.Integer({ minimum: 1 })),
  maxLineBytes: Type.Optional(Type.Integer({ minimum: 1 })),
});

function formatCoverageSummary(session: Awaited<ReturnType<typeof verifyDocumentReadSession>>) {
  const coverage = session.coverage;
  if (!coverage) {
    return `session ${session.sessionId} has no coverage report yet`;
  }
  const statusLine = coverage.complete
    ? "coverage verified: complete"
    : coverage.allChunksAcquired
      ? "all chunks acquired; verification still required"
      : `coverage incomplete: missing=${coverage.missingChunkIndexes.join(", ") || "none"} contiguous=${coverage.contiguous} hash=${coverage.verifiedFullHash}`;
  return [
    `authoritativeState=${session.status}`,
    `session=${session.sessionId}`,
    `path=${session.fingerprint.workspacePath}`,
    `chunks=${coverage.acquiredChunkCount}/${coverage.expectedChunkCount}`,
    `missing=${coverage.missingChunkIndexes.join(", ") || "none"}`,
    `verifiedFullHash=${coverage.verifiedFullHash}`,
    `fileStillMatchesFingerprint=${coverage.fileStillMatchesFingerprint}`,
    statusLine,
  ].join("\n");
}

function formatChunkHeader(params: {
  sessionId: string;
  workspacePath: string;
  chunkIndex: number;
  totalChunks: number;
  startLine?: number;
  endLine?: number;
  startByte: number;
  endByteExclusive: number;
}) {
  const location =
    typeof params.startLine === "number" && typeof params.endLine === "number"
      ? `lines ${params.startLine}-${params.endLine}`
      : `bytes ${params.startByte}-${params.endByteExclusive - 1}`;
  return [
    `document_read session=${params.sessionId}`,
    `path=${params.workspacePath}`,
    `chunk ${params.chunkIndex + 1}/${params.totalChunks} (${location})`,
    "",
  ].join("\n");
}

export function createDocumentReadTool(workspaceDir: string): AnyAgentTool {
  return {
    name: "document_read",
    label: "document_read",
    description:
      "Deterministically ingest long files from the workspace with a verified chunk plan and coverage report. Use this for long docs instead of relying on a single large read.",
    parameters: DocumentReadToolSchema,
    execute: async (_toolCallId, rawArgs) => {
      const args =
        rawArgs && typeof rawArgs === "object" ? (rawArgs as Record<string, unknown>) : {};
      const action = readStringParam(args, "action", { allowEmpty: false }) ?? "start";
      if (action === "start") {
        const relativePath = readStringParam(args, "path", {
          required: true,
          label: "path",
        });
        const session = await startDocumentReadSession({
          rootDir: workspaceDir,
          relativePath,
          chunkLines: readNumberParam(args, "chunkLines", { integer: true }),
          chunkBytes: readNumberParam(args, "chunkBytes", { integer: true }),
          maxLineBytes: readNumberParam(args, "maxLineBytes", { integer: true }),
        });
        const baseRecommendation = recommendDocumentIngestion({
          workspaceVisible: true,
          fileBytes: session.fingerprint.bytes,
        });
        const proofRecommendation = recommendDocumentIngestion({
          workspaceVisible: true,
          fileBytes: session.fingerprint.bytes,
          proofRequired: true,
        });
        return payloadTextResult({
          status: "started",
          authoritativeState: session.status,
          sessionId: session.sessionId,
          workspacePath: session.fingerprint.workspacePath,
          absolutePath: session.fingerprint.absolutePath,
          bytes: session.fingerprint.bytes,
          lines: session.fingerprint.lines,
          sha256: session.fingerprint.sha256,
          encoding: session.fingerprint.encoding,
          chunkingMode: session.fingerprint.chunkingMode,
          expectedChunkCount: session.fingerprint.expectedChunkCount,
          lineEnding: session.fingerprint.lineEnding,
          chunkDefaults: session.chunkDefaults,
          adaptiveReadCeilingBytes: baseRecommendation.adaptiveReadCeilingBytes,
          readPreferredForThisFile: baseRecommendation.preferredTool === "read",
          documentReadProfile: proofRecommendation.documentReadDefaults.profile,
          documentReadReason: proofRecommendation.useDocumentReadReason,
          planPath: path.relative(
            workspaceDir,
            path.join(".openclaw", "document-read", session.sessionId, "plan.json"),
          ),
          coveragePath: path.relative(
            workspaceDir,
            path.join(".openclaw", "document-read", session.sessionId, "coverage.json"),
          ),
          nextAction:
            session.fingerprint.expectedChunkCount > 0
              ? 'Call document_read with action="next" until all chunks are acquired, then action="verify".'
              : 'Empty file. Call document_read with action="verify" if you need the final report.',
          defaults: {
            chunkLines: DEFAULT_DOCUMENT_READ_CHUNK_LINES,
            chunkBytes: DEFAULT_DOCUMENT_READ_CHUNK_BYTES,
            maxLineBytes: DEFAULT_DOCUMENT_READ_MAX_LINE_BYTES,
          },
        });
      }

      const sessionId = readStringParam(args, "sessionId", {
        required: true,
        label: "sessionId",
      });

      if (action === "next" || action === "chunk") {
        const chunkIndex =
          action === "chunk"
            ? readNumberParam(args, "chunkIndex", {
                required: true,
                integer: true,
                label: "chunkIndex",
              })
            : undefined;
        const chunkResult = await readDocumentChunk({
          rootDir: workspaceDir,
          sessionId,
          chunkIndex,
          nextMissing: action === "next",
        });
        const header = formatChunkHeader({
          sessionId: chunkResult.session.sessionId,
          workspacePath: chunkResult.session.fingerprint.workspacePath,
          chunkIndex: chunkResult.chunk.index,
          totalChunks: chunkResult.session.fingerprint.expectedChunkCount,
          startLine: chunkResult.chunk.startLine,
          endLine: chunkResult.chunk.endLine,
          startByte: chunkResult.chunk.startByte,
          endByteExclusive: chunkResult.chunk.endByteExclusive,
        });
        return textResult(`${header}${chunkResult.text}`, {
          status: "chunk",
          authoritativeState: chunkResult.session.status,
          sessionId: chunkResult.session.sessionId,
          workspacePath: chunkResult.session.fingerprint.workspacePath,
          chunkingMode: chunkResult.session.fingerprint.chunkingMode,
          chunk: chunkResult.chunk,
          coverage: chunkResult.session.coverage,
          lossyUtf8: chunkResult.lossyUtf8,
          complete: chunkResult.session.coverage?.complete === true,
          expectedChunkCount: chunkResult.session.coverage?.expectedChunkCount,
          acquiredChunkCount: chunkResult.session.coverage?.acquiredChunkCount,
          missingChunkIndexes: chunkResult.session.coverage?.missingChunkIndexes,
          verifiedFullHash: chunkResult.session.coverage?.verifiedFullHash,
          fileStillMatchesFingerprint: chunkResult.session.coverage?.fileStillMatchesFingerprint,
          nextAction:
            chunkResult.session.status === "ready_to_verify"
              ? 'All chunks acquired. Call document_read with action="verify" before claiming full coverage.'
              : 'Continue with document_read action="next" until coverage is complete, then action="verify".',
        });
      }

      if (action === "status") {
        const session = await getDocumentReadSession({
          rootDir: workspaceDir,
          sessionId,
        });
        return payloadTextResult({
          status: session.status,
          authoritativeState: session.status,
          sessionId: session.sessionId,
          workspacePath: session.fingerprint.workspacePath,
          fingerprint: session.fingerprint,
          coverage: session.coverage,
          failureReason: session.failureReason,
          failureDetail: session.failureDetail,
          acquiredChunkIndexes: session.acquiredChunkIndexes,
          nextAction:
            session.status === "ready_to_verify"
              ? 'Call document_read with action="verify" to finalize full-document coverage.'
              : session.status === "in_progress" || session.status === "started"
                ? 'Call document_read with action="next" to continue chunk acquisition.'
                : undefined,
        });
      }

      if (action === "verify") {
        const session = await verifyDocumentReadSession({
          rootDir: workspaceDir,
          sessionId,
        });
        return textResult(formatCoverageSummary(session), {
          status: session.status,
          authoritativeState: session.status,
          sessionId: session.sessionId,
          workspacePath: session.fingerprint.workspacePath,
          fingerprint: session.fingerprint,
          coverage: session.coverage,
          failureReason: session.failureReason,
          failureDetail: session.failureDetail,
          goldenRule:
            session.coverage?.complete === true
              ? "Coverage verified. Full-document ingestion is complete."
              : "Coverage not verified. Do not claim the document was fully read.",
        });
      }

      if (action === "cleanup") {
        await cleanupDocumentReadSession({
          rootDir: workspaceDir,
          sessionId,
        });
        return payloadTextResult({
          status: "cleaned",
          sessionId,
        });
      }

      throw new ToolInputError(
        `unsupported action ${JSON.stringify(action)}; expected start|next|chunk|status|verify|cleanup`,
      );
    },
  };
}
