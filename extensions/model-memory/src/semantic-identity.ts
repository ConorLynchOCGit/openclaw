import { createHash } from "node:crypto";
import type { ModelMemoryObject } from "./semantic-schema.ts";

export type MemoryIdentityDescriptor = {
  identityKey: string;
  slotKey?: string;
  scopeKey: string;
  normalizedSubject?: string;
  normalizedTitle?: string;
  normalizedSearchText: string;
};

const SAME_SLOT_KINDS = new Set<ModelMemoryObject["kind"]>(["preference", "fact"]);

function hashValue(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function normalizeIdentityText(value: string): string {
  const trimmed = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  try {
    const url = new URL(trimmed);
    url.hash = "";
    if (url.pathname.endsWith("/") && url.pathname !== "/") {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString().toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

function normalizeStringArray(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => normalizeIdentityText(value));
}

function assertUnreachable(value: never): never {
  throw new Error(`unhandled memory object kind: ${JSON.stringify(value)}`);
}

function normalizeScope(scope: ModelMemoryObject["scope"]): Record<string, unknown> {
  if (!scope) {
    return {};
  }

  const normalizedEntries = Object.entries(scope)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return [key, normalizeStringArray(value)];
      }
      if (typeof value === "string") {
        return [key, normalizeIdentityText(value)];
      }
      return [key, value];
    })
    .toSorted((leftEntry, rightEntry) => String(leftEntry[0]).localeCompare(String(rightEntry[0])));

  return Object.fromEntries(normalizedEntries);
}

function buildIdentityParts(object: ModelMemoryObject): string[] {
  switch (object.kind) {
    case "preference":
      return [
        normalizeIdentityText(object.payload.subject),
        normalizeIdentityText(object.payload.instruction),
        normalizeIdentityText(object.payload.operation),
      ];
    case "fact":
      return [
        normalizeIdentityText(object.payload.subject),
        normalizeIdentityText(object.payload.value),
      ];
    case "rule":
      return [
        normalizeIdentityText(object.payload.subject),
        object.payload.recommendedAction
          ? normalizeIdentityText(object.payload.recommendedAction)
          : "",
        object.payload.avoidAction ? normalizeIdentityText(object.payload.avoidAction) : "",
        object.payload.neededCapability
          ? normalizeIdentityText(object.payload.neededCapability)
          : "",
      ];
    case "procedure":
      return [
        normalizeIdentityText(object.payload.title),
        ...object.payload.steps.map((step) => normalizeIdentityText(step)),
      ];
    case "reference":
      return [
        normalizeIdentityText(object.payload.task),
        normalizeIdentityText(object.payload.primaryResource),
        ...normalizeStringArray(object.payload.companionResources),
      ];
    default:
      return assertUnreachable(object);
  }
}

function buildNormalizedSearchText(object: ModelMemoryObject): string {
  return buildIdentityParts(object)
    .filter((part) => part.length > 0)
    .join(" ");
}

export function deriveMemoryIdentity(object: ModelMemoryObject): MemoryIdentityDescriptor {
  const normalizedScope = normalizeScope(object.scope);
  const scopeKey = `scope_${hashValue(JSON.stringify(normalizedScope)).slice(0, 16)}`;
  const identityParts = [
    object.canonicalClass,
    object.kind,
    scopeKey,
    ...buildIdentityParts(object),
  ];
  const identityKey = `${object.kind}_${hashValue(identityParts.join("|")).slice(0, 24)}`;
  const normalizedSubject =
    "subject" in object.payload ? normalizeIdentityText(object.payload.subject) : undefined;
  const normalizedTitle =
    "title" in object.payload ? normalizeIdentityText(object.payload.title) : undefined;
  const slotKey =
    SAME_SLOT_KINDS.has(object.kind) && normalizedSubject
      ? `slot_${hashValue([object.canonicalClass, object.kind, scopeKey, normalizedSubject].join("|")).slice(0, 24)}`
      : undefined;

  return {
    identityKey,
    slotKey,
    scopeKey,
    normalizedSubject,
    normalizedTitle,
    normalizedSearchText: buildNormalizedSearchText(object),
  };
}

export function isDeterministicSameSlotSupersession(
  prior: Pick<MemoryIdentityDescriptor, "identityKey" | "slotKey"> & {
    kind: ModelMemoryObject["kind"];
  },
  next: Pick<MemoryIdentityDescriptor, "identityKey" | "slotKey"> & {
    kind: ModelMemoryObject["kind"];
  },
): boolean {
  return (
    SAME_SLOT_KINDS.has(prior.kind) &&
    SAME_SLOT_KINDS.has(next.kind) &&
    prior.kind === next.kind &&
    !!prior.slotKey &&
    prior.slotKey === next.slotKey &&
    prior.identityKey !== next.identityKey
  );
}
