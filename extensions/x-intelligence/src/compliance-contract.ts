import {
  normalizeAcquisitionSubject,
  type XAcquisitionSubjectKind,
} from "./acquisition-contract.js";
import {
  assertAllowedKeys,
  assertArtifactSize,
  assertSafeInput,
  compact,
  deepFreeze,
  normalizeIdentifierList,
  optionalDigest,
  requiredIdentifier,
  requiredTimestamp,
} from "./contract-helpers.js";

export const X_COMPLIANCE_EVENT_V1 = "x_compliance_event.v1" as const;
export const X_MAX_COMPLIANCE_EVENT_BYTES = 32 * 1024;

export type XComplianceEventType =
  | "refresh"
  | "edit"
  | "deletion"
  | "protection"
  | "suspension"
  | "tombstone"
  | "takedown";

export type XComplianceEventV1 = Readonly<{
  schema: typeof X_COMPLIANCE_EVENT_V1;
  eventId: string;
  type: XComplianceEventType;
  occurredAt: string;
  subject: Readonly<{ kind: XAcquisitionSubjectKind; ids: readonly string[] }>;
  reasonCodes: readonly string[];
  manifestDigest?: string;
}>;

export type XComplianceEventV1Input = Omit<XComplianceEventV1, "schema">;

export function createComplianceEvent(input: XComplianceEventV1Input): XComplianceEventV1 {
  assertSafeInput(input);
  assertAllowedKeys(
    input,
    ["eventId", "type", "occurredAt", "subject", "reasonCodes", "manifestDigest"],
    "compliance event",
  );
  const types: readonly XComplianceEventType[] = [
    "refresh",
    "edit",
    "deletion",
    "protection",
    "suspension",
    "tombstone",
    "takedown",
  ];
  if (!types.includes(input.type)) {
    throw new Error("compliance event type is invalid");
  }
  const event: XComplianceEventV1 = {
    schema: X_COMPLIANCE_EVENT_V1,
    eventId: requiredIdentifier(input.eventId, "eventId"),
    type: input.type,
    occurredAt: requiredTimestamp(input.occurredAt, "occurredAt"),
    subject: normalizeAcquisitionSubject(input.subject),
    reasonCodes: normalizeIdentifierList(input.reasonCodes, "reasonCodes", 16),
    ...compact({ manifestDigest: optionalDigest(input.manifestDigest, "manifestDigest") }),
  };
  assertArtifactSize(event, "compliance event", X_MAX_COMPLIANCE_EVENT_BYTES);
  return deepFreeze(event);
}
