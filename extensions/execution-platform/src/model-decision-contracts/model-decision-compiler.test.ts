import { describe, expect, it } from "vitest";
import {
  firstStructuralString,
  firstStructuralStringArray,
  flattenModelDecisionFields,
  missingField,
  repairRequestForMissingFields,
} from "./model-decision-compiler.ts";

describe("model decision compiler helpers", () => {
  it("accepts structural aliases without semantic prompt-specific judgment", () => {
    const record = {
      taskDetails: {
        objective: "Identify target files.",
        commitmentIds: ["commitment-context"],
      },
    };

    const flattened = flattenModelDecisionFields(record);

    expect(firstStructuralString(flattened, ["exactObjective", "objective"]).value).toBe(
      "Identify target files.",
    );
    expect(
      firstStructuralStringArray(flattened, ["commitmentIdsAdvanced", "commitmentIds"]).value,
    ).toEqual(["commitment-context"]);
    expect(flattened).toMatchObject({
      objective: "Identify target files.",
      commitmentIds: ["commitment-context"],
    });
  });

  it("builds field-specific repair requests with bounded paths and preserve fields", () => {
    const request = repairRequestForMissingFields({
      failedDecisionId: "decision-failed",
      missingFields: [
        missingField(
          "newNodes[0].expectedHumanReadableOutput",
          "string",
          "Node output must be inspectable by downstream workers.",
          "Bounded context handoff.",
        ),
      ],
      preserveFields: ["decisionId", "newNodes[0].capabilityId"],
      acceptedFields: ["capabilityId"],
      rejectedReasonCodes: ["node_expected_output_missing:context-1"],
    });

    expect(request).toMatchObject({
      failedDecisionId: "decision-failed",
      missingFields: [
        expect.objectContaining({
          path: "newNodes[0].expectedHumanReadableOutput",
          expectedType: "string",
        }),
      ],
      preserveFields: ["decisionId", "newNodes[0].capabilityId"],
      acceptedFields: ["capabilityId"],
      rawPromptStored: false,
      rawResponseStored: false,
    });
  });
});
