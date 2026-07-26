import {
  MAX_ARRAY_ITEMS,
  MAX_IDENTIFIER_CHARS,
  assertAllowedKeys,
  assertArtifactSize,
  assertSafeInput,
  boundedString,
  deepFreeze,
  normalizeStringList,
  requiredDigest,
  requiredIdentifier,
  requiredString,
  requiredTimestamp,
} from "./contract-helpers.js";

export const X_CLAIM_LEDGER_V1 = "x_claim_ledger.v1" as const;
export const X_MAX_CLAIM_LEDGER_BYTES = 128 * 1024;

const MAX_CLAIM_CHARS = 4_096;
const MAX_CLAIM_LIMITATION_CHARS = 1_024;
const MAX_CLAIM_LIMITATIONS = 32;
const MAX_CLAIMS = 100;

export type XClaimEvidenceStatus = "support" | "contrary";
export type XClaimInvalidationState = "active" | "invalidated" | "superseded";

export type XClaimLedgerSourceV1 = Readonly<{
  sourceId: string;
  status: XClaimEvidenceStatus;
  evidenceDigest: string | null;
}>;

// Claim text, confidence, and relationships are model-authored. Structural validation never derives them.
export type XClaimLedgerEntryV1 = Readonly<{
  claimId: string;
  statement: string;
  sources: readonly XClaimLedgerSourceV1[];
  asOf: string;
  confidence: number;
  limitations: readonly string[];
  invalidation: Readonly<{
    state: XClaimInvalidationState;
    at: string | null;
    reason: string | null;
  }>;
}>;

export type XClaimLedgerV1 = Readonly<{
  schema: typeof X_CLAIM_LEDGER_V1;
  ledgerId: string;
  authoredAt: string;
  methodVersion: string;
  model: Readonly<{ provider: string; name: string; version: string | null }>;
  claims: readonly XClaimLedgerEntryV1[];
}>;

export type XClaimLedgerV1Input = Omit<XClaimLedgerV1, "schema">;

/** Strict response shape owned here for model-authored claim-ledger output. */
export const X_CLAIM_LEDGER_V1_SCHEMA = {
  $id: X_CLAIM_LEDGER_V1,
  type: "object",
  additionalProperties: false,
  required: ["schema", "ledgerId", "authoredAt", "methodVersion", "model", "claims"],
  properties: {
    schema: { const: X_CLAIM_LEDGER_V1 },
    ledgerId: { type: "string", minLength: 1, maxLength: MAX_IDENTIFIER_CHARS },
    authoredAt: { type: "string", minLength: 1, maxLength: 64 },
    methodVersion: { type: "string", minLength: 1, maxLength: MAX_IDENTIFIER_CHARS },
    model: {
      type: "object",
      additionalProperties: false,
      required: ["provider", "name", "version"],
      properties: {
        provider: { type: "string", minLength: 1, maxLength: MAX_IDENTIFIER_CHARS },
        name: { type: "string", minLength: 1, maxLength: MAX_IDENTIFIER_CHARS },
        version: {
          anyOf: [
            { type: "string", minLength: 1, maxLength: MAX_IDENTIFIER_CHARS },
            { type: "null" },
          ],
        },
      },
    },
    claims: {
      type: "array",
      minItems: 1,
      maxItems: MAX_CLAIMS,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "claimId",
          "statement",
          "sources",
          "asOf",
          "confidence",
          "limitations",
          "invalidation",
        ],
        properties: {
          claimId: { type: "string", minLength: 1, maxLength: MAX_IDENTIFIER_CHARS },
          statement: { type: "string", minLength: 1, maxLength: MAX_CLAIM_CHARS },
          sources: {
            type: "array",
            minItems: 1,
            maxItems: MAX_ARRAY_ITEMS,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["sourceId", "status", "evidenceDigest"],
              properties: {
                sourceId: { type: "string", minLength: 1, maxLength: MAX_IDENTIFIER_CHARS },
                status: { enum: ["support", "contrary"] },
                evidenceDigest: {
                  anyOf: [
                    { type: "string", minLength: 1, maxLength: MAX_IDENTIFIER_CHARS },
                    { type: "null" },
                  ],
                },
              },
            },
          },
          asOf: { type: "string", minLength: 1, maxLength: 64 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          limitations: {
            type: "array",
            maxItems: MAX_CLAIM_LIMITATIONS,
            items: { type: "string", minLength: 1, maxLength: MAX_CLAIM_LIMITATION_CHARS },
          },
          invalidation: {
            type: "object",
            additionalProperties: false,
            required: ["state", "at", "reason"],
            properties: {
              state: { enum: ["active", "invalidated", "superseded"] },
              at: {
                anyOf: [{ type: "string", minLength: 1, maxLength: 64 }, { type: "null" }],
              },
              reason: {
                anyOf: [
                  { type: "string", minLength: 1, maxLength: MAX_CLAIM_LIMITATION_CHARS },
                  { type: "null" },
                ],
              },
            },
          },
        },
      },
    },
  },
} as const;

export function createClaimLedger(input: XClaimLedgerV1Input): XClaimLedgerV1 {
  assertSafeInput(input);
  assertAllowedKeys(
    input,
    ["ledgerId", "authoredAt", "methodVersion", "model", "claims"],
    "claim ledger",
  );
  assertAllowedKeys(input.model, ["provider", "name", "version"], "claim ledger model");
  if (!Array.isArray(input.claims) || input.claims.length < 1 || input.claims.length > MAX_CLAIMS) {
    throw new Error(`claims must contain between 1 and ${MAX_CLAIMS} items`);
  }

  const claimIds = new Set<string>();
  const claims = input.claims.map((claim, claimIndex) => {
    assertAllowedKeys(
      claim,
      ["claimId", "statement", "sources", "asOf", "confidence", "limitations", "invalidation"],
      `claims[${claimIndex}]`,
    );
    const claimId = requiredIdentifier(claim.claimId, `claims[${claimIndex}].claimId`);
    if (claimIds.has(claimId)) {
      throw new Error(`claims contains duplicate claimId: ${claimId}`);
    }
    claimIds.add(claimId);
    if (
      !Array.isArray(claim.sources) ||
      claim.sources.length < 1 ||
      claim.sources.length > MAX_ARRAY_ITEMS
    ) {
      throw new Error(
        `claims[${claimIndex}].sources must contain between 1 and ${MAX_ARRAY_ITEMS} items`,
      );
    }
    const sourceIds = new Set<string>();
    const sources = claim.sources.map((source: XClaimLedgerSourceV1, sourceIndex: number) => {
      assertAllowedKeys(
        source,
        ["sourceId", "status", "evidenceDigest"],
        `claims[${claimIndex}].sources[${sourceIndex}]`,
      );
      const sourceId = requiredIdentifier(
        source.sourceId,
        `claims[${claimIndex}].sources[${sourceIndex}].sourceId`,
      );
      if (sourceIds.has(sourceId)) {
        throw new Error(`claims[${claimIndex}].sources contains duplicate sourceId: ${sourceId}`);
      }
      sourceIds.add(sourceId);
      if (source.status !== "support" && source.status !== "contrary") {
        throw new Error(`claims[${claimIndex}].sources[${sourceIndex}].status is invalid`);
      }
      return {
        sourceId,
        status: source.status,
        evidenceDigest:
          source.evidenceDigest === null
            ? null
            : requiredDigest(
                source.evidenceDigest,
                `claims[${claimIndex}].sources[${sourceIndex}].evidenceDigest`,
              ),
      };
    });

    if (typeof claim.confidence !== "number" || !Number.isFinite(claim.confidence)) {
      throw new Error(`claims[${claimIndex}].confidence must be a finite number`);
    }
    if (claim.confidence < 0 || claim.confidence > 1) {
      throw new Error(`claims[${claimIndex}].confidence must be between 0 and 1`);
    }
    const limitations = normalizeStringList(
      claim.limitations,
      `claims[${claimIndex}].limitations`,
      MAX_CLAIM_LIMITATIONS,
    ).map((limitation) =>
      boundedString(limitation, `claims[${claimIndex}].limitations`, MAX_CLAIM_LIMITATION_CHARS),
    );
    assertAllowedKeys(
      claim.invalidation,
      ["state", "at", "reason"],
      `claims[${claimIndex}].invalidation`,
    );
    const invalidationState = claim.invalidation.state;
    if (!(["active", "invalidated", "superseded"] as const).includes(invalidationState)) {
      throw new Error(`claims[${claimIndex}].invalidation.state is invalid`);
    }
    const invalidationAt =
      claim.invalidation.at === null
        ? null
        : requiredTimestamp(claim.invalidation.at, `claims[${claimIndex}].invalidation.at`);
    const invalidationReason =
      claim.invalidation.reason === null
        ? null
        : requiredString(
            claim.invalidation.reason,
            `claims[${claimIndex}].invalidation.reason`,
            MAX_CLAIM_LIMITATION_CHARS,
          );
    if (
      invalidationState === "active" &&
      (invalidationAt !== null || invalidationReason !== null)
    ) {
      throw new Error(`claims[${claimIndex}] active invalidation must not include at or reason`);
    }
    if (
      invalidationState !== "active" &&
      (invalidationAt === null || invalidationReason === null)
    ) {
      throw new Error(`claims[${claimIndex}] inactive claim requires invalidation at and reason`);
    }

    return {
      claimId,
      statement: requiredString(
        claim.statement,
        `claims[${claimIndex}].statement`,
        MAX_CLAIM_CHARS,
      ),
      sources,
      asOf: requiredTimestamp(claim.asOf, `claims[${claimIndex}].asOf`),
      confidence: claim.confidence,
      limitations,
      invalidation: {
        state: invalidationState,
        at: invalidationAt,
        reason: invalidationReason,
      },
    };
  });

  const ledger: XClaimLedgerV1 = {
    schema: X_CLAIM_LEDGER_V1,
    ledgerId: requiredIdentifier(input.ledgerId, "ledgerId"),
    authoredAt: requiredTimestamp(input.authoredAt, "authoredAt"),
    methodVersion: requiredIdentifier(input.methodVersion, "methodVersion"),
    model: {
      provider: requiredIdentifier(input.model.provider, "model.provider"),
      name: requiredIdentifier(input.model.name, "model.name"),
      version:
        input.model.version === null
          ? null
          : requiredIdentifier(input.model.version, "model.version"),
    },
    claims,
  };
  assertArtifactSize(ledger, "claim ledger", X_MAX_CLAIM_LEDGER_BYTES);
  return deepFreeze(ledger);
}
