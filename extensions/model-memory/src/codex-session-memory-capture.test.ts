import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  captureCodexMemoryActivityLive,
  loadRecentCodexSessionWindow,
  runCodexSessionMemoryCapture,
  type CodexMemoryActivity,
} from "./codex-session-memory-capture.ts";
import { applyModelMemoryMigrations } from "./db/migrations.ts";
import { MmV2NativeRepository } from "./db/mmv2-native-repository.ts";
import { createPgMemTestDatabase } from "./db/pg-test.ts";
import { RuntimeContextRepository } from "./db/runtime-context-repository.ts";
import {
  buildAdmissionDecision,
  buildAtomicCandidate,
  buildCanonicalCandidate,
  captureOne,
  createScriptedMmV2Interpreter,
} from "./mmv2/test-helpers.ts";

function readMmV2Payload<T>(input: { prompt: { promptPayload?: unknown; userPrompt: string } }): T {
  return (input.prompt.promptPayload as T) ?? (JSON.parse(input.prompt.userPrompt) as T);
}

function createCodexClaimInterpreter(params: {
  evidenceQuote: string;
  canonicalText: string;
  searchText: string;
  subject: string;
  predicate: string;
  object: string;
}) {
  return createScriptedMmV2Interpreter({
    "mmv2-capture-routing-v1": (input) => {
      const payload = readMmV2Payload<{
        raw_event: { event_id: string };
        segments: Array<{ segment_id: string; text: string }>;
      }>(input);
      return captureOne({
        schema_version: "capture_routing.v1",
        event_id: payload.raw_event.event_id,
        routing_decisions: payload.segments.map((segment) =>
          segment.text.includes(params.evidenceQuote)
            ? {
                segment_id: segment.segment_id,
                route: "atomic_candidate",
                candidate_summary: "Model-reviewed Codex memory candidate",
                memory_likelihood: 0.9,
                durability_likelihood: 0.86,
                composite_likelihood: 0.02,
                reason_codes: ["durable_project_fact"],
                evidence_quote: params.evidenceQuote,
                confidence: 0.92,
              }
            : {
                segment_id: segment.segment_id,
                route: "ignore",
                candidate_summary: "Model-reviewed contextual segment.",
                memory_likelihood: 0,
                durability_likelihood: 0,
                composite_likelihood: 0,
                reason_codes: ["not_memory"],
                evidence_quote: segment.text,
                confidence: 0.88,
              },
        ),
      });
    },
    "mmv2-atomic-extraction-v1": (input) => {
      const payload = readMmV2Payload<{
        raw_event: { event_id: string };
        routed_candidates: Array<{ segment_id: string }>;
      }>(input);
      const candidate = payload.routed_candidates[0];
      return captureOne({
        schema_version: "atomic_extraction.v1",
        event_id: payload.raw_event.event_id,
        atomic_candidates: [
          buildAtomicCandidate(candidate.segment_id, params.evidenceQuote, {
            kind: "claim",
            normalized_statement: params.canonicalText,
            payload: {
              payload_type: "claim",
              claim_type: "project_fact",
              subject: params.subject,
              predicate: params.predicate,
              object: params.object,
              qualifiers: [],
              temporal_status: "currently_true",
            },
          }),
        ],
      });
    },
    "mmv2-canonicalization-v1": (input) => {
      const payload = readMmV2Payload<{
        raw_event: {
          event_id: string;
          tenant_id: string;
          user_id: string;
          metadata?: { project_id?: string | null };
        };
        extracted_candidates: Array<{ candidate_id: string; source_segment_id: string }>;
      }>(input);
      const candidate = payload.extracted_candidates[0];
      const rawEventForCandidate = {
        event_id: payload.raw_event.event_id,
        tenant_id: payload.raw_event.tenant_id,
        user_id: payload.raw_event.user_id,
      };
      return captureOne({
        schema_version: "canonical_candidates.v1",
        event_id: payload.raw_event.event_id,
        canonical_candidates: [
          buildCanonicalCandidate(
            rawEventForCandidate,
            candidate.source_segment_id,
            params.evidenceQuote,
            {
              candidate_id: candidate.candidate_id,
              kind: "claim",
              artifact_type: null,
              canonical_text: params.canonicalText,
              search_text: params.searchText,
              payload: {
                claim_type: "project_fact",
                subject: params.subject,
                predicate: params.predicate,
                object: params.object,
              },
              scope: {
                tenant_id: payload.raw_event.tenant_id,
                user_id: payload.raw_event.user_id,
                project_id: payload.raw_event.metadata?.project_id ?? null,
                workspace_id: null,
                subject_type: "project",
                subject_id: payload.raw_event.metadata?.project_id ?? "codex",
                applies_to: payload.raw_event.metadata?.project_id
                  ? "current_project"
                  : "current_workspace",
              },
            },
          ),
        ],
      });
    },
    "mmv2-admission-v1": (input) => {
      const payload = readMmV2Payload<{
        raw_event: { event_id: string };
        canonical_candidates: Array<{ candidate_id: string }>;
      }>(input);
      return captureOne({
        schema_version: "admission_decision.v1",
        event_id: payload.raw_event.event_id,
        decisions: payload.canonical_candidates.map((candidate) =>
          buildAdmissionDecision(candidate.candidate_id),
        ),
      });
    },
    "mmv2-reconciliation-v1": (input) => {
      const payload = readMmV2Payload<{
        event_id: string;
        candidate: { candidate_id: string };
      }>(input);
      return captureOne({
        schema_version: "reconciliation_decision.v1",
        event_id: payload.event_id,
        candidate_id: payload.candidate.candidate_id,
        decision: "insert_new",
        target_memory_ids: [],
        merged_canonical_text: null,
        conflict_type: "none",
        supersedes_memory_ids: [],
        rationale: "Model-owned reconciliation leaves the Codex candidate as a new record.",
        confidence: 0.9,
      });
    },
  });
}

function createCodexWindowEchoInterpreter() {
  const sentence = (value: string) =>
    /[.!?]$/u.test(value.trim()) ? value.trim() : `${value.trim()}.`;
  return createScriptedMmV2Interpreter({
    "mmv2-capture-routing-v1": (input) => {
      const payload = readMmV2Payload<{
        raw_event: { event_id: string };
        segments: Array<{ segment_id: string; text: string }>;
      }>(input);
      return captureOne({
        schema_version: "capture_routing.v1",
        event_id: payload.raw_event.event_id,
        routing_decisions: payload.segments.map((segment) => ({
          segment_id: segment.segment_id,
          route: "atomic_candidate",
          candidate_summary: "Model-reviewed Codex window memory candidate",
          memory_likelihood: 0.9,
          durability_likelihood: 0.86,
          composite_likelihood: 0.02,
          reason_codes: ["durable_project_fact"],
          evidence_quote: segment.text,
          confidence: 0.92,
        })),
      });
    },
    "mmv2-atomic-extraction-v1": (input) => {
      const payload = readMmV2Payload<{
        raw_event: { event_id: string };
        routed_candidates: Array<{ segment_id: string; text: string }>;
      }>(input);
      return captureOne({
        schema_version: "atomic_extraction.v1",
        event_id: payload.raw_event.event_id,
        atomic_candidates: payload.routed_candidates.map((candidate) =>
          buildAtomicCandidate(candidate.segment_id, candidate.text, {
            candidate_id: `atomic-${candidate.segment_id}`,
            kind: "claim",
            normalized_statement: sentence(candidate.text),
            payload: {
              payload_type: "claim",
              claim_type: "project_fact",
              subject: "codex long prompt",
              predicate: "contains",
              object: candidate.text,
              qualifiers: [],
              temporal_status: "currently_true",
            },
          }),
        ),
      });
    },
    "mmv2-canonicalization-v1": (input) => {
      const payload = readMmV2Payload<{
        raw_event: {
          event_id: string;
          tenant_id: string;
          user_id: string;
          metadata?: { project_id?: string | null };
        };
        extracted_candidates: Array<{
          candidate_id: string;
          source_segment_id: string;
          normalized_statement: string;
          evidence_quote: string;
        }>;
      }>(input);
      return captureOne({
        schema_version: "canonical_candidates.v1",
        event_id: payload.raw_event.event_id,
        canonical_candidates: payload.extracted_candidates.map((candidate) =>
          buildCanonicalCandidate(
            {
              event_id: payload.raw_event.event_id,
              tenant_id: payload.raw_event.tenant_id,
              user_id: payload.raw_event.user_id,
            },
            candidate.source_segment_id,
            candidate.evidence_quote,
            {
              candidate_id: candidate.candidate_id,
              kind: "claim",
              canonical_text: sentence(candidate.normalized_statement),
              search_text: sentence(candidate.normalized_statement).toLowerCase(),
              payload: {
                claim_type: "project_fact",
                subject: "codex long prompt",
                predicate: "contains",
                object: sentence(candidate.normalized_statement),
              },
              scope: {
                tenant_id: payload.raw_event.tenant_id,
                user_id: payload.raw_event.user_id,
                project_id: payload.raw_event.metadata?.project_id ?? null,
                workspace_id: null,
                subject_type: "project",
                subject_id: payload.raw_event.metadata?.project_id ?? "codex",
                applies_to: payload.raw_event.metadata?.project_id
                  ? "current_project"
                  : "current_workspace",
              },
            },
          ),
        ),
      });
    },
    "mmv2-admission-v1": (input) => {
      const payload = readMmV2Payload<{
        raw_event: { event_id: string };
        canonical_candidates: Array<{ candidate_id: string }>;
      }>(input);
      return captureOne({
        schema_version: "admission_decision.v1",
        event_id: payload.raw_event.event_id,
        decisions: payload.canonical_candidates.map((candidate) =>
          buildAdmissionDecision(candidate.candidate_id),
        ),
      });
    },
    "mmv2-reconciliation-v1": (input) => {
      const payload = readMmV2Payload<{
        event_id: string;
        candidate: { candidate_id: string };
      }>(input);
      return captureOne({
        schema_version: "reconciliation_decision.v1",
        event_id: payload.event_id,
        candidate_id: payload.candidate.candidate_id,
        decision: "insert_new",
        target_memory_ids: [],
        merged_canonical_text: null,
        conflict_type: "none",
        supersedes_memory_ids: [],
        rationale: "Model-owned reconciliation leaves the Codex window candidate as a new record.",
        confidence: 0.9,
      });
    },
  });
}

function createCodexQualityFixtureInterpreter() {
  const sentence = (value: string) =>
    /[.!?]$/u.test(value.trim()) ? value.trim() : `${value.trim()}.`;
  const shouldIgnore = (text: string) =>
    /no memory candidate|scratchpad only|generic assistant commentary|generic command output/iu.test(
      text,
    );
  const subjectForText = (text: string) => {
    if (/assistant/iu.test(text)) {
      return "codex assistant evidence";
    }
    if (/command summary|validation failure|touched areas/iu.test(text)) {
      return "codex tool evidence";
    }
    if (/temporary|ttl/iu.test(text)) {
      return "codex temporary decision";
    }
    return "codex user decision";
  };
  return createScriptedMmV2Interpreter({
    "mmv2-capture-routing-v1": (input) => {
      const payload = readMmV2Payload<{
        raw_event: { event_id: string };
        segments: Array<{ segment_id: string; text: string }>;
      }>(input);
      return captureOne({
        schema_version: "capture_routing.v1",
        event_id: payload.raw_event.event_id,
        routing_decisions: payload.segments.map((segment) =>
          shouldIgnore(segment.text)
            ? {
                segment_id: segment.segment_id,
                route: "ignore",
                candidate_summary: "Model-reviewed non-memory segment.",
                memory_likelihood: 0,
                durability_likelihood: 0,
                composite_likelihood: 0,
                reason_codes: ["not_memory"],
                evidence_quote: segment.text,
                confidence: 0.9,
              }
            : {
                segment_id: segment.segment_id,
                route: "atomic_candidate",
                candidate_summary: "Model-reviewed Codex quality fixture candidate",
                memory_likelihood: 0.88,
                durability_likelihood: /temporary|ttl/iu.test(segment.text) ? 0.52 : 0.84,
                composite_likelihood: 0.05,
                reason_codes: /temporary|ttl/iu.test(segment.text)
                  ? ["temporary"]
                  : ["durable_project_fact"],
                evidence_quote: segment.text,
                confidence: 0.9,
              },
        ),
      });
    },
    "mmv2-atomic-extraction-v1": (input) => {
      const payload = readMmV2Payload<{
        raw_event: { event_id: string };
        routed_candidates: Array<{ segment_id: string; text: string }>;
      }>(input);
      return captureOne({
        schema_version: "atomic_extraction.v1",
        event_id: payload.raw_event.event_id,
        atomic_candidates: payload.routed_candidates.map((candidate) =>
          buildAtomicCandidate(candidate.segment_id, candidate.text, {
            candidate_id: `atomic-${candidate.segment_id}`,
            kind: "claim",
            normalized_statement: sentence(candidate.text),
            payload: {
              payload_type: "claim",
              claim_type: "project_fact",
              subject: subjectForText(candidate.text),
              predicate: "states",
              object: sentence(candidate.text),
              qualifiers: [],
              temporal_status: "currently_true",
            },
          }),
        ),
      });
    },
    "mmv2-canonicalization-v1": (input) => {
      const payload = readMmV2Payload<{
        raw_event: {
          event_id: string;
          tenant_id: string;
          user_id: string;
          metadata?: { project_id?: string | null };
        };
        extracted_candidates: Array<{
          candidate_id: string;
          source_segment_id: string;
          normalized_statement: string;
          evidence_quote: string;
        }>;
      }>(input);
      return captureOne({
        schema_version: "canonical_candidates.v1",
        event_id: payload.raw_event.event_id,
        canonical_candidates: payload.extracted_candidates.map((candidate) =>
          buildCanonicalCandidate(
            {
              event_id: payload.raw_event.event_id,
              tenant_id: payload.raw_event.tenant_id,
              user_id: payload.raw_event.user_id,
            },
            candidate.source_segment_id,
            candidate.evidence_quote,
            {
              candidate_id: candidate.candidate_id,
              kind: "claim",
              canonical_text: sentence(candidate.normalized_statement),
              search_text: sentence(candidate.normalized_statement).toLowerCase(),
              payload: {
                claim_type: "project_fact",
                subject: subjectForText(candidate.normalized_statement),
                predicate: "states",
                object: sentence(candidate.normalized_statement),
              },
              scope: {
                tenant_id: payload.raw_event.tenant_id,
                user_id: payload.raw_event.user_id,
                project_id: payload.raw_event.metadata?.project_id ?? null,
                workspace_id: null,
                subject_type: "project",
                subject_id: payload.raw_event.metadata?.project_id ?? "codex",
                applies_to: payload.raw_event.metadata?.project_id
                  ? "current_project"
                  : "current_workspace",
              },
              content_hash: `hash-${candidate.candidate_id}`,
            },
          ),
        ),
      });
    },
    "mmv2-admission-v1": (input) => {
      const payload = readMmV2Payload<{
        raw_event: { event_id: string };
        canonical_candidates: Array<{ candidate_id: string; canonical_text: string }>;
      }>(input);
      return captureOne({
        schema_version: "admission_decision.v1",
        event_id: payload.raw_event.event_id,
        decisions: payload.canonical_candidates.map((candidate) =>
          /temporary|ttl/iu.test(candidate.canonical_text)
            ? buildAdmissionDecision(candidate.candidate_id, {
                reason_codes: ["temporary", "useful_future_context"],
                recommended_ttl_seconds: 7 * 24 * 60 * 60,
                rationale: "Model-owned admission keeps this grounded scoped item with TTL.",
              })
            : buildAdmissionDecision(candidate.candidate_id),
        ),
      });
    },
    "mmv2-reconciliation-v1": (input) => {
      const payload = readMmV2Payload<{
        event_id: string;
        candidate: { candidate_id: string };
      }>(input);
      return captureOne({
        schema_version: "reconciliation_decision.v1",
        event_id: payload.event_id,
        candidate_id: payload.candidate.candidate_id,
        decision: "insert_new",
        target_memory_ids: [],
        merged_canonical_text: null,
        conflict_type: "none",
        supersedes_memory_ids: [],
        rationale: "Model-owned reconciliation inserts the quality fixture candidate.",
        confidence: 0.9,
      });
    },
  });
}

async function captureActivity(activity: CodexMemoryActivity) {
  const database = await createPgMemTestDatabase();
  await applyModelMemoryMigrations(database.sql);
  const canonicalRepository = new MmV2NativeRepository(database.sql);
  const runtimeRepository = new RuntimeContextRepository(database.sql);
  const result = await captureCodexMemoryActivityLive({
    canonicalRepository,
    runtimeRepository,
    activity,
    projectId: "project-codex",
    modelId: "openai-codex/gpt-5.4-mini",
    interpreter: createCodexClaimInterpreter({
      evidenceQuote: activity.boundedText,
      canonicalText: activity.boundedText,
      searchText: activity.boundedText.toLowerCase(),
      subject: "codex activity",
      predicate: "states",
      object: activity.boundedText,
    }),
  });
  const durable = await canonicalRepository.listDurableMemories();
  const sources = await canonicalRepository.listSources();
  await database.close();
  return { result, durable, sources };
}

async function writeCodexSessionFixture(): Promise<{
  codexHome: string;
  sessionPath: string;
  sessionId: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "codex-session-runner-"));
  const codexHome = path.join(root, ".codex");
  const sessionId = "019dc217-fbd7-76d3-9088-b72a96d8cba4";
  const sessionDir = path.join(codexHome, "sessions", "2026", "04", "30");
  await mkdir(sessionDir, { recursive: true });
  const sessionPath = path.join(sessionDir, `rollout-2026-04-30T00-00-00-${sessionId}.jsonl`);
  const longUserPrompt = [
    "Codex runner point alpha: regular capture is gated by config.",
    "Codex runner point beta: long prompts use document-style windows.",
    "Codex runner point gamma: source refs and hashes prevent repeated capture.",
    "Codex runner point delta: model-owned MMV2 capture remains the only memory path.",
  ].join(" ");
  const rows = [
    {
      timestamp: "2026-04-30T00:00:00.000Z",
      type: "event_msg",
      payload: {
        type: "user_message",
        message: longUserPrompt,
        images: [],
        local_images: [],
        text_elements: [],
      },
    },
    {
      timestamp: "2026-04-30T00:00:01.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: "Assistant final: Codex capture runner reports bounded stage counts.",
          },
        ],
        phase: "final",
      },
    },
    {
      timestamp: "2026-04-30T00:00:02.000Z",
      type: "response_item",
      payload: {
        type: "function_call",
        name: "exec_command",
        arguments: JSON.stringify({ cmd: "pnpm test:file codex-session-memory-capture.test.ts" }),
        call_id: "call-1",
      },
    },
    {
      timestamp: "2026-04-30T00:00:03.000Z",
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "call-1",
        output: "Process exited with code 0\nRAW TOOL OUTPUT THAT MUST NOT PERSIST",
      },
    },
  ];
  await writeFile(sessionPath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  await writeFile(
    path.join(codexHome, "history.jsonl"),
    `${JSON.stringify({ session_id: sessionId })}\n`,
  );
  return { codexHome, sessionPath, sessionId };
}

async function writeToolHeavyCodexSessionFixture(): Promise<{
  codexHome: string;
  sessionPath: string;
  sessionId: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "codex-session-tool-heavy-"));
  const codexHome = path.join(root, ".codex");
  const sessionId = "019dc217-fbd7-76d3-9088-b72a96d8cba5";
  const sessionDir = path.join(codexHome, "sessions", "2026", "04", "30");
  await mkdir(sessionDir, { recursive: true });
  const sessionPath = path.join(sessionDir, `rollout-2026-04-30T01-00-00-${sessionId}.jsonl`);
  const rows: unknown[] = [
    {
      timestamp: "2026-04-30T01:00:00.000Z",
      type: "event_msg",
      payload: {
        type: "user_message",
        message:
          "Codex user memory: capture runner should prioritize user-authored durable source windows.",
        images: [],
        local_images: [],
        text_elements: [],
      },
    },
  ];
  for (let index = 0; index < 19; index += 1) {
    const callId = `call-tool-${index}`;
    rows.push(
      {
        timestamp: `2026-04-30T01:00:${String(index + 1).padStart(2, "0")}.000Z`,
        type: "response_item",
        payload: {
          type: "function_call",
          name: "exec_command",
          arguments: JSON.stringify({ cmd: `pnpm test:file tool-heavy-${index}.test.ts` }),
          call_id: callId,
        },
      },
      {
        timestamp: `2026-04-30T01:01:${String(index + 1).padStart(2, "0")}.000Z`,
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: callId,
          output: `Process exited with code 0\nRAW TOOL OUTPUT ${index} THAT MUST NOT PERSIST`,
        },
      },
    );
  }
  await writeFile(sessionPath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  await writeFile(
    path.join(codexHome, "history.jsonl"),
    `${JSON.stringify({ session_id: sessionId })}\n`,
    "utf8",
  );
  return { codexHome, sessionPath, sessionId };
}

async function writeCodexQualitySessionFixture(): Promise<{
  codexHome: string;
  sessionPath: string;
  sessionId: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "codex-session-quality-"));
  const codexHome = path.join(root, ".codex");
  const sessionId = "019dc217-fbd7-76d3-9088-b72a96d8cba5";
  const sessionDir = path.join(codexHome, "sessions", "2026", "04", "30");
  await mkdir(sessionDir, { recursive: true });
  const sessionPath = path.join(sessionDir, `rollout-2026-04-30T01-00-00-${sessionId}.jsonl`);
  const longUserPrompt = [
    "Codex durable decision alpha: regular Codex capture should use the gated runner rather than a one-off proof helper.",
    "Codex durable decision beta: long Codex prompts should be split by document-style windows while preserving session order.",
    "Codex scoped project decision gamma: model-memory capture artifacts should include stage counts for routing, extraction, admission, and writes.",
    "Codex temporary TTL decision delta: the branch-specific validation checklist is useful for seven days and should not become a global memory.",
  ].join(" ");
  const rows = [
    {
      timestamp: "2026-04-30T01:00:00.000Z",
      type: "event_msg",
      payload: {
        type: "user_message",
        message: longUserPrompt,
        images: [],
        local_images: [],
        text_elements: [],
      },
    },
    {
      timestamp: "2026-04-30T01:01:00.000Z",
      type: "event_msg",
      payload: {
        type: "user_message",
        message:
          "Codex durable decision epsilon: source refs and activity hashes are the idempotency boundary for regular capture.",
        images: [],
        local_images: [],
        text_elements: [],
      },
    },
    {
      timestamp: "2026-04-30T01:02:00.000Z",
      type: "event_msg",
      payload: {
        type: "user_message",
        message:
          "Scratchpad only, no memory candidate: remind me to rename a local variable after lunch.",
        images: [],
        local_images: [],
        text_elements: [],
      },
    },
    {
      timestamp: "2026-04-30T01:03:00.000Z",
      type: "event_msg",
      payload: {
        type: "user_message",
        message:
          "Codex scoped project decision zeta: assistant and tool evidence should remain lower authority than direct user asks.",
        images: [],
        local_images: [],
        text_elements: [],
      },
    },
    {
      timestamp: "2026-04-30T01:04:00.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: "Assistant evidence: Codex capture now preserves bounded windows and omits raw command logs.",
          },
        ],
        phase: "final",
      },
    },
    {
      timestamp: "2026-04-30T01:05:00.000Z",
      type: "response_item",
      payload: {
        type: "function_call",
        name: "exec_command",
        arguments: JSON.stringify({
          cmd: "pnpm test:file extensions/model-memory/src/codex-session-memory-capture.test.ts",
        }),
        call_id: "call-quality-1",
      },
    },
    {
      timestamp: "2026-04-30T01:06:00.000Z",
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "call-quality-1",
        output: [
          "Process exited with code 1",
          "extensions/model-memory/src/codex-session-memory-capture.test.ts failed before fix",
          "src/infra/model-memory-codex-capture-runtime.ts inspected",
          "RAW TOOL OUTPUT THAT MUST NOT PERSIST",
        ].join("\n"),
      },
    },
    {
      timestamp: "2026-04-30T01:07:00.000Z",
      type: "response_item",
      payload: {
        type: "function_call",
        name: "exec_command",
        arguments: JSON.stringify({
          cmd: "pnpm test:file extensions/model-memory/src/codex-session-memory-capture.test.ts",
        }),
        call_id: "call-quality-2",
      },
    },
    {
      timestamp: "2026-04-30T01:08:00.000Z",
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "call-quality-2",
        output: [
          "Process exited with code 0",
          "extensions/model-memory/src/codex-session-memory-capture.test.ts passed after fix",
          "RAW TOOL OUTPUT THAT MUST NOT PERSIST",
        ].join("\n"),
      },
    },
  ];
  await writeFile(sessionPath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  await writeFile(
    path.join(codexHome, "history.jsonl"),
    `${JSON.stringify({ session_id: sessionId })}\n`,
  );
  return { codexHome, sessionPath, sessionId };
}

describe("codex-session-memory-capture", () => {
  it("loads recent contiguous Codex session activities without semantic pruning", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "codex-session-window-"));
    const codexHome = path.join(root, ".codex");
    const sessionDir = path.join(codexHome, "sessions", "2026", "04", "30");
    await mkdir(sessionDir, { recursive: true });
    const sessionPath = path.join(
      sessionDir,
      "rollout-2026-04-30T00-00-00-019dc217-fbd7-76d3-9088-b72a96d8cba4.jsonl",
    );
    const longUserPrompt = [
      "First structural point says OpenClaw prompts can become document-like.",
      "Second structural point says Codex prompts can become document-like.",
      "Third structural point says chunking is by size and order only.",
      "Fourth structural point says source refs and hashes must survive.",
    ].join(" ");
    const rows = [
      {
        timestamp: "2026-04-30T00:00:00.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: longUserPrompt,
          images: [],
          local_images: [],
          text_elements: [],
        },
      },
      {
        timestamp: "2026-04-30T00:00:01.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: "Assistant final: model-owned capture remains required.",
            },
          ],
          phase: "final",
        },
      },
      {
        timestamp: "2026-04-30T00:00:02.000Z",
        type: "response_item",
        payload: {
          type: "function_call",
          name: "exec_command",
          arguments: JSON.stringify({ cmd: "pnpm test:file example.test.ts" }),
          call_id: "call-1",
        },
      },
      {
        timestamp: "2026-04-30T00:00:03.000Z",
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "call-1",
          output: "Process exited with code 1\nRAW TOOL OUTPUT THAT MUST NOT PERSIST",
        },
      },
    ];
    await writeFile(sessionPath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
    await writeFile(
      path.join(codexHome, "history.jsonl"),
      `${JSON.stringify({
        session_id: "019dc217-fbd7-76d3-9088-b72a96d8cba4",
        text: "latest",
      })}\n`,
      "utf8",
    );

    const loaded = await loadRecentCodexSessionWindow({
      codexHome,
      maxActivities: 4,
      maxCharsPerActivity: 10_000,
      documentLikeWordThreshold: 8,
    });

    expect(loaded.status).toBe("loaded");
    expect(loaded.activities.map((activity) => activity.role)).toEqual([
      "user",
      "assistant",
      "tool_summary",
    ]);
    expect(loaded.activities[0]?.sourceMode).toBe("document_like");
    expect(loaded.activities[0]?.boundedText).toContain(
      "First structural point says OpenClaw prompts can become document-like.",
    );
    expect(loaded.activities[0]?.boundedText).toContain(
      "Fourth structural point says source refs and hashes must survive.",
    );
    expect(loaded.activities[2]?.boundedText).toContain("family=pnpm status=failed");
    expect(loaded.activities[2]?.boundedText).toContain("Raw command output omitted");
    expect(loaded.activities[2]?.boundedText).not.toContain(
      "RAW TOOL OUTPUT THAT MUST NOT PERSIST",
    );
    expect(loaded.selectionPolicy).toMatchObject({
      source: "session_jsonl_contiguous_recent",
      semanticPruning: false,
      rawToolLogsIncluded: false,
    });
    expect(loaded.diagnostics).toMatchObject({
      activityCount: 3,
      userActivityCount: 1,
      assistantActivityCount: 1,
      toolSummaryCount: 1,
      rawFullTranscriptPersisted: false,
      rawToolLogPersisted: false,
    });
    expect(loaded.diagnostics.documentLikeActivityCount).toBeGreaterThanOrEqual(1);
  });

  it("keeps regular Codex capture disabled when explicitly configured off", async () => {
    const database = await createPgMemTestDatabase();
    await applyModelMemoryMigrations(database.sql);
    const canonicalRepository = new MmV2NativeRepository(database.sql);
    const runtimeRepository = new RuntimeContextRepository(database.sql);

    const report = await runCodexSessionMemoryCapture({
      canonicalRepository,
      runtimeRepository,
      interpreter: createCodexWindowEchoInterpreter(),
      env: { MODEL_MEMORY_CODEX_CAPTURE_ENABLED: "false" },
    });
    await database.close();

    expect(report.status).toBe("disabled");
    expect(report.reason).toBe("codex_memory_capture_disabled");
    expect(report.config.enabled).toBe(false);
    expect(report.captures).toEqual([]);
    expect(report.safety).toMatchObject({
      rawFullTranscriptPersisted: false,
      rawToolLogPersisted: false,
      codexTranscriptExecutedAsInstruction: false,
      deterministicSemanticFallbackUsed: false,
    });
  });

  it("enables regular Codex capture by default and degrades when the source is missing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "codex-session-default-enabled-"));
    const database = await createPgMemTestDatabase();
    await applyModelMemoryMigrations(database.sql);
    const canonicalRepository = new MmV2NativeRepository(database.sql);
    const runtimeRepository = new RuntimeContextRepository(database.sql);

    const report = await runCodexSessionMemoryCapture({
      canonicalRepository,
      runtimeRepository,
      interpreter: createCodexWindowEchoInterpreter(),
      codexHome: path.join(root, ".codex"),
      env: {},
    });
    await database.close();

    expect(report.status).toBe("degraded");
    expect(report.reason).toBe("codex_session_files_unavailable");
    expect(report.config.enabled).toBe(true);
    expect(report.captures).toEqual([]);
  });

  it("runs regular Codex capture behind an explicit gate and skips already-ingested refs", async () => {
    const { codexHome } = await writeCodexSessionFixture();
    const database = await createPgMemTestDatabase();
    await applyModelMemoryMigrations(database.sql);
    const canonicalRepository = new MmV2NativeRepository(database.sql);
    const runtimeRepository = new RuntimeContextRepository(database.sql);

    const first = await runCodexSessionMemoryCapture({
      canonicalRepository,
      runtimeRepository,
      codexHome,
      enabled: true,
      maxActivities: 4,
      maxPerRun: 4,
      maxWordsPerWindow: 8,
      documentLikeWordThreshold: 8,
      projectId: "project-codex",
      interpreter: createCodexWindowEchoInterpreter(),
      env: {},
    });
    const durableAfterFirst = await canonicalRepository.listDurableMemories();
    const second = await runCodexSessionMemoryCapture({
      canonicalRepository,
      runtimeRepository,
      codexHome,
      enabled: true,
      maxActivities: 4,
      maxPerRun: 4,
      maxWordsPerWindow: 8,
      documentLikeWordThreshold: 8,
      projectId: "project-codex",
      interpreter: createCodexWindowEchoInterpreter(),
      env: {},
    });
    const durableAfterSecond = await canonicalRepository.listDurableMemories();
    await database.close();

    expect(first.status).toBe("loaded");
    expect(first.activityCounts.loaded).toBe(3);
    expect(first.activityCounts.attempted).toBe(3);
    expect(first.activityCounts.documentLike).toBeGreaterThanOrEqual(1);
    expect(first.writeCounts.write).toBeGreaterThan(0);
    expect(first.idempotency.capturedRefs.length).toBe(3);
    expect(first.config).toMatchObject({
      enabled: true,
      cadence: "manual",
      semanticPruning: false,
      rawToolLogsIncluded: false,
    });
    expect(first.safety.rawToolLogPersisted).toBe(false);
    expect(second.activityCounts.loaded).toBe(3);
    expect(second.activityCounts.alreadyIngested).toBe(3);
    expect(second.activityCounts.attempted).toBe(0);
    expect(second.captures.every((capture) => capture.status === "skipped")).toBe(true);
    expect(durableAfterSecond.length).toBe(durableAfterFirst.length);
  });

  it("prioritizes user-authored Codex activities and captures them as document-like windows", async () => {
    const { codexHome } = await writeToolHeavyCodexSessionFixture();
    const database = await createPgMemTestDatabase();
    await applyModelMemoryMigrations(database.sql);
    const canonicalRepository = new MmV2NativeRepository(database.sql);
    const runtimeRepository = new RuntimeContextRepository(database.sql);

    const report = await runCodexSessionMemoryCapture({
      canonicalRepository,
      runtimeRepository,
      codexHome,
      enabled: true,
      maxActivities: 20,
      maxPerRun: 1,
      maxWordsPerWindow: 24,
      documentLikeWordThreshold: 100,
      projectId: "project-codex",
      interpreter: createCodexWindowEchoInterpreter(),
      env: {},
    });
    const segmentCount = await database.sql.query(
      "SELECT COUNT(*)::int AS count FROM model_memory.ingest_segments",
    );
    const sources = await canonicalRepository.listSources();
    await database.close();

    expect(report.status).toBe("loaded");
    expect(report.activityCounts.loaded).toBe(20);
    expect(report.activityCounts.user).toBe(1);
    expect(report.activityCounts.toolSummary).toBe(19);
    expect(report.activityCounts.attempted).toBe(1);
    expect(report.captures[0]).toMatchObject({
      role: "user",
      sourceMode: "document_like",
      status: "captured",
    });
    expect(Number(segmentCount.rows[0]?.count)).toBeLessThanOrEqual(4);
    expect(JSON.stringify(sources)).not.toContain("RAW TOOL OUTPUT");
  });

  it("reports a degraded reason when the regular Codex source is unavailable", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "codex-session-missing-"));
    const database = await createPgMemTestDatabase();
    await applyModelMemoryMigrations(database.sql);
    const canonicalRepository = new MmV2NativeRepository(database.sql);
    const runtimeRepository = new RuntimeContextRepository(database.sql);

    const report = await runCodexSessionMemoryCapture({
      canonicalRepository,
      runtimeRepository,
      codexHome: path.join(root, ".codex"),
      enabled: true,
      interpreter: createCodexWindowEchoInterpreter(),
      env: {},
    });
    await database.close();

    expect(report.status).toBe("degraded");
    expect(report.reason).toBe("codex_session_files_unavailable");
    expect(report.activityCounts.attempted).toBe(0);
    expect(report.safety.deterministicSemanticFallbackUsed).toBe(false);
  });

  it("captures Codex user turns as user-authoritative MMV2 candidates", async () => {
    const { result, durable, sources } = await captureActivity({
      ref: "codex://session-001/user-1",
      role: "user",
      kind: "ask",
      sessionId: "codex-session-001",
      boundedText: "Codex preference: keep model-memory repair reports concise.",
    });

    expect(result.sourceProfileId).toBe("explicit_user_turn");
    expect(result.capture.writeResults.some((entry) => entry.decision === "write")).toBe(true);
    expect(durable[0]?.payload).toMatchObject({
      sourceProfileId: "explicit_user_turn",
      authorityTier: "user_authoritative",
    });
    expect(sources[0]?.sourceMetadata).toMatchObject({
      sourceRuntime: "codex",
      codexRef: "codex://session-001/user-1",
      rawTranscriptPersisted: false,
      rawToolLogPersisted: false,
    });
  });

  it("captures Codex assistant finals as lower-authority evidence", async () => {
    const { result, durable } = await captureActivity({
      ref: "codex://session-001/assistant-1",
      role: "assistant",
      kind: "final",
      sessionId: "codex-session-001",
      boundedText: "Codex outcome: deterministic routing was replaced by model-owned routing.",
    });

    expect(result.sourceProfileId).toBe("cited_assistant_answer");
    expect(durable[0]?.payload).toMatchObject({
      sourceProfileId: "cited_assistant_answer",
      authorityTier: "cited_soft",
    });
  });

  it("captures Codex command failures as tool-grounded evidence without raw tool logs", async () => {
    const { result, durable, sources } = await captureActivity({
      ref: "codex://session-001/tool-1",
      role: "tool_summary",
      kind: "failure_summary",
      sessionId: "codex-session-001",
      boundedText: "Command pnpm test:file failed in live-document-ingestion-service.",
    });

    expect(result.sourceProfileId).toBe("tool_result_capture");
    expect(durable[0]?.payload).toMatchObject({
      sourceProfileId: "tool_result_capture",
      authorityTier: "tool_grounded",
    });
    expect(JSON.stringify(sources[0]?.sourceMetadata)).not.toContain("function_call_output");
  });

  it("treats long Codex prompts as document-like structural windows", async () => {
    const database = await createPgMemTestDatabase();
    await applyModelMemoryMigrations(database.sql);
    const canonicalRepository = new MmV2NativeRepository(database.sql);
    const runtimeRepository = new RuntimeContextRepository(database.sql);
    const longPrompt = [
      "Codex memory point alpha: long prompts use structural windowing.",
      "Codex memory point beta: each bounded window reaches model-owned capture.",
      "Codex memory point gamma: packet construction avoids semantic snippet choice.",
      "Codex memory point delta: source refs and hashes preserve provenance.",
    ].join(" ");

    const result = await captureCodexMemoryActivityLive({
      canonicalRepository,
      runtimeRepository,
      activity: {
        ref: "codex://session-long/user-1",
        role: "user",
        kind: "ask",
        sessionId: "codex-session-long",
        boundedText: longPrompt,
      },
      projectId: "project-codex",
      modelId: "openai-codex/gpt-5.4-mini",
      interpreter: createCodexWindowEchoInterpreter(),
      maxWordsPerWindow: 8,
      documentLikeWordThreshold: 8,
    });
    const durable = await canonicalRepository.listDurableMemories();
    const sources = await canonicalRepository.listSources();
    const windows = await canonicalRepository.listSourceWindows(sources[0]!.id);
    await database.close();

    expect(result.sourceMode).toBe("document_like");
    expect(result.capture.source.sourceKind).toBe("document");
    expect(windows.length).toBeGreaterThan(1);
    expect(durable.length).toBeGreaterThan(1);
    expect(durable.every((memory) => memory.payload.sourceProfileId === "explicit_user_turn")).toBe(
      true,
    );
    expect(sources[0]?.sourceMetadata).toMatchObject({
      sourceRuntime: "codex",
      codexRef: "codex://session-long/user-1",
      codexSourceMode: "document_like",
      rawTranscriptPersisted: false,
      rawToolLogPersisted: false,
    });
  });

  it("validates user-turn-rich regular Codex capture through the gated runner", async () => {
    const { codexHome } = await writeCodexQualitySessionFixture();
    const database = await createPgMemTestDatabase();
    await applyModelMemoryMigrations(database.sql);
    const canonicalRepository = new MmV2NativeRepository(database.sql);
    const runtimeRepository = new RuntimeContextRepository(database.sql);

    const first = await runCodexSessionMemoryCapture({
      canonicalRepository,
      runtimeRepository,
      codexHome,
      enabled: true,
      maxActivities: 12,
      maxPerRun: 12,
      maxWordsPerWindow: 16,
      documentLikeWordThreshold: 16,
      projectId: "project-codex",
      interpreter: createCodexQualityFixtureInterpreter(),
      env: {},
    });
    const durableAfterFirst = await canonicalRepository.listDurableMemories();
    const sourcesAfterFirst = await canonicalRepository.listSources();
    const second = await runCodexSessionMemoryCapture({
      canonicalRepository,
      runtimeRepository,
      codexHome,
      enabled: true,
      maxActivities: 12,
      maxPerRun: 12,
      maxWordsPerWindow: 16,
      documentLikeWordThreshold: 16,
      projectId: "project-codex",
      interpreter: createCodexQualityFixtureInterpreter(),
      env: {},
    });
    const durableAfterSecond = await canonicalRepository.listDurableMemories();
    await database.close();

    expect(first.status).toBe("loaded");
    expect(first.diagnostics).toMatchObject({
      userActivityCount: 4,
      assistantActivityCount: 1,
      toolSummaryCount: 2,
      rawFullTranscriptPersisted: false,
      rawToolLogPersisted: false,
    });
    expect(first.activityCounts.user).toBe(4);
    expect(first.activityCounts.documentLike).toBeGreaterThanOrEqual(1);
    expect(first.writeCounts.write).toBeGreaterThanOrEqual(4);
    expect(first.idempotency.capturedRefs.length).toBe(first.activityCounts.attempted);
    expect(first.safety).toMatchObject({
      rawFullTranscriptPersisted: false,
      rawToolLogPersisted: false,
      codexTranscriptExecutedAsInstruction: false,
      deterministicSemanticFallbackUsed: false,
    });
    expect(durableAfterFirst.some((memory) => memory.validity.ttl_seconds === 604_800)).toBe(true);
    expect(JSON.stringify(durableAfterFirst)).not.toContain("rename a local variable after lunch");
    expect(
      durableAfterFirst.every((memory) =>
        ["user_authoritative", "cited_soft", "tool_grounded"].includes(
          String(memory.payload.authorityTier),
        ),
      ),
    ).toBe(true);
    expect(
      durableAfterFirst.some((memory) => memory.payload.sourceProfileId === "explicit_user_turn"),
    ).toBe(true);
    expect(
      durableAfterFirst.some(
        (memory) => memory.payload.sourceProfileId === "cited_assistant_answer",
      ),
    ).toBe(true);
    expect(
      durableAfterFirst.some((memory) => memory.payload.sourceProfileId === "tool_result_capture"),
    ).toBe(true);
    expect(JSON.stringify(sourcesAfterFirst)).not.toContain(
      "RAW TOOL OUTPUT THAT MUST NOT PERSIST",
    );
    expect(second.activityCounts.loaded).toBe(first.activityCounts.loaded);
    expect(second.activityCounts.alreadyIngested).toBe(first.activityCounts.loaded);
    expect(second.activityCounts.attempted).toBe(0);
    expect(durableAfterSecond).toHaveLength(durableAfterFirst.length);
  });

  it("keeps mixed Codex assistant and tool evidence lower-authority and excludes raw logs", async () => {
    const { codexHome } = await writeCodexQualitySessionFixture();
    const loaded = await loadRecentCodexSessionWindow({
      codexHome,
      maxActivities: 12,
      maxCharsPerActivity: 10_000,
      documentLikeWordThreshold: 16,
    });

    expect(loaded.status).toBe("loaded");
    expect(loaded.activities.filter((activity) => activity.role === "assistant")).toHaveLength(1);
    expect(loaded.activities.filter((activity) => activity.role === "tool_summary")).toHaveLength(
      2,
    );
    expect(
      loaded.activities.some((activity) => activity.boundedText.includes("status=failed")),
    ).toBe(true);
    expect(
      loaded.activities.some((activity) => activity.boundedText.includes("status=passed")),
    ).toBe(true);
    expect(
      loaded.activities.some((activity) =>
        activity.boundedText.includes(
          "extensions/model-memory/src/codex-session-memory-capture.test.ts",
        ),
      ),
    ).toBe(true);
    expect(
      loaded.activities.some((activity) =>
        activity.boundedText.includes("src/infra/model-memory-codex-capture-runtime.ts"),
      ),
    ).toBe(true);
    expect(JSON.stringify(loaded.activities)).not.toContain(
      "RAW TOOL OUTPUT THAT MUST NOT PERSIST",
    );
    expect(loaded.selectionPolicy).toMatchObject({
      source: "session_jsonl_contiguous_recent",
      semanticPruning: false,
      rawToolLogsIncluded: false,
    });
  });

  it("does not create fallback memories from generic assistant and tool output", async () => {
    const database = await createPgMemTestDatabase();
    await applyModelMemoryMigrations(database.sql);
    const canonicalRepository = new MmV2NativeRepository(database.sql);
    const runtimeRepository = new RuntimeContextRepository(database.sql);

    const assistant = await captureCodexMemoryActivityLive({
      canonicalRepository,
      runtimeRepository,
      activity: {
        ref: "codex://negative/assistant",
        role: "assistant",
        kind: "final",
        sessionId: "codex-negative",
        boundedText: "Generic assistant commentary with no durable project decision.",
      },
      projectId: "project-codex",
      modelId: "openai-codex/gpt-5.4-mini",
      interpreter: createCodexQualityFixtureInterpreter(),
    });
    const tool = await captureCodexMemoryActivityLive({
      canonicalRepository,
      runtimeRepository,
      activity: {
        ref: "codex://negative/tool",
        role: "tool_summary",
        kind: "result_summary",
        sessionId: "codex-negative",
        boundedText: "Generic command output with no durable validated outcome.",
      },
      projectId: "project-codex",
      modelId: "openai-codex/gpt-5.4-mini",
      interpreter: createCodexQualityFixtureInterpreter(),
    });
    const durable = await canonicalRepository.listDurableMemories();
    await database.close();

    expect(assistant.capture.writeResults).toEqual([]);
    expect(tool.capture.writeResults).toEqual([]);
    expect(durable).toEqual([]);
  });
});
