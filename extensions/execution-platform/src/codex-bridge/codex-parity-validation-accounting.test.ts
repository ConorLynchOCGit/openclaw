import { describe, expect, it } from "vitest";
import {
  buildCodexParityValidationAccounting,
  createCodexParityValidationRecord,
  runCodexParityValidationAccounting,
} from "./index.ts";

describe("Codex parity validation accounting", () => {
  it("requires every required validation command to be known", () => {
    const accounting = buildCodexParityValidationAccounting({
      requiredCommands: [
        { commandRef: "pnpm test:file a.test.ts", approvedCommandId: "a", required: true },
        { commandRef: "pnpm test:file b.test.ts", approvedCommandId: "b", required: true },
      ],
      records: [
        createCodexParityValidationRecord({
          commandRef: "pnpm test:file a.test.ts",
          approvedCommandId: "a",
          status: "passed",
          exitCode: 0,
          boundedSummary: "passed",
        }),
      ],
    });

    expect(accounting.allRequiredValidationStatesKnown).toBe(false);
    expect(accounting.allRequiredValidationAccepted).toBe(false);
    expect(accounting.reasonCodes).toContain("required_validation_state_unknown");
  });

  it("records skipped commands as known but not accepted success", async () => {
    const accounting = await runCodexParityValidationAccounting({
      requiredCommands: [
        { commandRef: "pnpm test:file a.test.ts", approvedCommandId: "a", required: true },
      ],
      async runner(command) {
        return createCodexParityValidationRecord({
          commandRef: command.commandRef,
          approvedCommandId: command.approvedCommandId,
          status: "skipped",
          boundedSummary: "owner accepted skip",
          skippedReason: "unrelated_fixture_unavailable",
        });
      },
    });

    expect(accounting.allRequiredValidationStatesKnown).toBe(true);
    expect(accounting.allRequiredValidationAccepted).toBe(false);
    expect(accounting.records[0]?.rawCommandLogStored).toBe(false);
  });
});
