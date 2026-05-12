import { z } from "zod";

export const SIMPLE_TRIAGE_ROUTER_SCHEMA_VERSION = "intent-front-door.simple-triage-router.v1";
export const SIMPLE_TRIAGE_REASON_CODE_MAX_COUNT = 12;
export const SIMPLE_TRIAGE_REASON_CODE_MAX_CHARS = 120;
export const SIMPLE_TRIAGE_BOUNDED_RATIONALE_MAX_CHARS = 300;

export const SIMPLE_TRIAGE_LANES = [
  "chat_send",
  "advanced_intent_front_door",
  "protocol_or_control_reject",
] as const;

export type SimpleTriageLane = (typeof SIMPLE_TRIAGE_LANES)[number];

const reasonCodeSchema = z
  .string()
  .min(1)
  .max(SIMPLE_TRIAGE_REASON_CODE_MAX_CHARS)
  .regex(/^[a-z0-9_.:-]+$/u);

export const simpleTriageRouterOutputSchema = z
  .object({
    schemaVersion: z.literal(SIMPLE_TRIAGE_ROUTER_SCHEMA_VERSION),
    lane: z.enum(SIMPLE_TRIAGE_LANES),
    confidence: z.number().min(0).max(1),
    reasonCodes: z.array(reasonCodeSchema).max(SIMPLE_TRIAGE_REASON_CODE_MAX_COUNT),
    boundedRationale: z.string().min(0).max(SIMPLE_TRIAGE_BOUNDED_RATIONALE_MAX_CHARS),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
  })
  .strict();

export type SimpleTriageRouterOutput = z.infer<typeof simpleTriageRouterOutputSchema>;

export type SimpleTriageRouterParseResult =
  | {
      valid: true;
      output: SimpleTriageRouterOutput;
      reasonCodes: string[];
      rawPromptStored: false;
      rawResponseStored: false;
    }
  | {
      valid: false;
      output: null;
      reasonCodes: string[];
      rawPromptStored: false;
      rawResponseStored: false;
    };

export function parseSimpleTriageRouterOutput(input: unknown): SimpleTriageRouterParseResult {
  const parsed = simpleTriageRouterOutputSchema.safeParse(input);
  if (parsed.success) {
    return {
      valid: true,
      output: parsed.data,
      reasonCodes: ["simple_triage_router_schema_valid"],
      rawPromptStored: false,
      rawResponseStored: false,
    };
  }
  return {
    valid: false,
    output: null,
    reasonCodes: [
      "simple_triage_router_schema_invalid",
      ...parsed.error.issues.map(
        (issue) => `simple_triage_schema:${issue.path.join(".") || "root"}`,
      ),
    ].slice(0, SIMPLE_TRIAGE_REASON_CODE_MAX_COUNT),
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function createSimpleTriageRouterOutput(
  input: Omit<SimpleTriageRouterOutput, "schemaVersion" | "rawPromptStored" | "rawResponseStored">,
): SimpleTriageRouterOutput {
  return {
    schemaVersion: SIMPLE_TRIAGE_ROUTER_SCHEMA_VERSION,
    lane: input.lane,
    confidence: input.confidence,
    reasonCodes: input.reasonCodes.slice(0, SIMPLE_TRIAGE_REASON_CODE_MAX_COUNT),
    boundedRationale: input.boundedRationale.slice(0, SIMPLE_TRIAGE_BOUNDED_RATIONALE_MAX_CHARS),
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export const SIMPLE_TRIAGE_ROUTER_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "lane",
    "confidence",
    "reasonCodes",
    "boundedRationale",
    "rawPromptStored",
    "rawResponseStored",
  ],
  properties: {
    schemaVersion: { type: "string", const: SIMPLE_TRIAGE_ROUTER_SCHEMA_VERSION },
    lane: { type: "string", enum: SIMPLE_TRIAGE_LANES },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reasonCodes: {
      type: "array",
      items: {
        type: "string",
        minLength: 1,
        maxLength: SIMPLE_TRIAGE_REASON_CODE_MAX_CHARS,
        pattern: "^[a-z0-9_.:-]+$",
      },
      maxItems: SIMPLE_TRIAGE_REASON_CODE_MAX_COUNT,
    },
    boundedRationale: { type: "string", maxLength: SIMPLE_TRIAGE_BOUNDED_RATIONALE_MAX_CHARS },
    rawPromptStored: { type: "boolean", const: false },
    rawResponseStored: { type: "boolean", const: false },
  },
} as const;
