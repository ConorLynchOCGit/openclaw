import { Type } from "typebox";
import { NonEmptyString } from "./primitives.js";

export const ReleasePrepareParamsSchema = Type.Object(
  {
    codingTaskId: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ReleasePrepareResultSchema = Type.Object(
  {
    status: Type.Union([
      Type.Literal("started"),
      Type.Literal("running"),
      Type.Literal("accepted"),
    ]),
    operationId: NonEmptyString,
    unitName: NonEmptyString,
    acceptedReleaseReceiptId: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);
