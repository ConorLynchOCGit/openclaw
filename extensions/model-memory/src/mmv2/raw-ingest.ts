import { createHash } from "node:crypto";
import { buildDeterministicUuid } from "../deterministic-uuid.ts";
import { RawIngestEventSchema, type RawIngestEvent } from "./contracts.ts";

export type CreateRawIngestEventInput = {
  sourceId: string;
  rawText: string;
  createdAt?: Date;
  eventId?: string;
  tenantId?: string;
  userId?: string;
  sessionId?: string;
  sourceType?: RawIngestEvent["source_type"];
  speaker?: RawIngestEvent["speaker"];
  timezone?: string;
  metadata?: Partial<RawIngestEvent["metadata"]>;
};

export function normalizeRawIngestText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function createRawIngestEvent(input: CreateRawIngestEventInput): RawIngestEvent {
  const rawText = normalizeRawIngestText(input.rawText);
  if (!rawText) {
    throw new Error("raw_text must not be empty");
  }

  const createdAt = input.createdAt ?? new Date();
  const eventId =
    input.eventId ??
    buildDeterministicUuid(
      "mmv2-event",
      createHash("sha256")
        .update(JSON.stringify([input.sourceId, createdAt.toISOString(), rawText]))
        .digest("hex"),
    );

  return RawIngestEventSchema.parse({
    event_id: eventId,
    schema_version: "memory_ingest.v1",
    tenant_id: input.tenantId ?? "openclaw",
    user_id: input.userId ?? "unknown-user",
    session_id: input.sessionId ?? "mmv2-shadow",
    source_type: input.sourceType ?? "document",
    source_id: input.sourceId,
    speaker: input.speaker ?? "unknown",
    created_at: createdAt.toISOString(),
    timezone: input.timezone ?? "Etc/UTC",
    raw_text: rawText,
    metadata: {
      locale: input.metadata?.locale ?? "en",
      channel: input.metadata?.channel ?? "document_ingest_shadow",
      project_id: input.metadata?.project_id ?? null,
      workspace_id: input.metadata?.workspace_id ?? null,
      conversation_title: input.metadata?.conversation_title ?? null,
      sensitivity_hint: input.metadata?.sensitivity_hint ?? "unknown",
    },
  });
}
