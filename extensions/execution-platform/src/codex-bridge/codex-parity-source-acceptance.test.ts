import { describe, expect, it } from "vitest";
import {
  buildCodexParityValidationAccounting,
  createAcceptedCodexParityReview,
  createCodexParityValidationRecord,
  decideCodexParitySourceAcceptance,
  type MainRepoChangeManifest,
} from "./index.ts";

function diff(changed = true): MainRepoChangeManifest {
  return {
    artifactKind: "main_repo_change_manifest",
    changeManifestId: "diff-1",
    beforeManifestId: "before",
    afterManifestId: "after",
    changedFiles: changed
      ? [
          {
            fileRef: "src/a.ts",
            changeKind: "modified",
            beforeSha256: "before",
            afterSha256: "after",
            beforeSizeBytes: 1,
            afterSizeBytes: 2,
          },
        ]
      : [],
    diffHash: "hash",
    evidenceStatus: "accepted",
    reasonCodes: [],
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
}

describe("Codex parity source acceptance decision", () => {
  it("allows direct main-repo source acceptance only after source edit, validation, and review pass", () => {
    const validation = buildCodexParityValidationAccounting({
      requiredCommands: [
        { commandRef: "pnpm test:file a.test.ts", approvedCommandId: "a", required: true },
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
    const decision = decideCodexParitySourceAcceptance({
      diff: diff(),
      validation,
      review: createAcceptedCodexParityReview({
        reviewRef: "review://one",
        boundedSummary: "accepted",
      }),
    });

    expect(decision.status).toBe("allowed");
    expect(decision.reasonCodes).toContain("codex_parity_direct_main_repo_source_accepted");
  });

  it("blocks success when source edit evidence is missing", () => {
    const validation = buildCodexParityValidationAccounting({
      requiredCommands: [],
      records: [],
    });
    const decision = decideCodexParitySourceAcceptance({
      diff: diff(false),
      validation,
      review: createAcceptedCodexParityReview({
        reviewRef: "review://one",
        boundedSummary: "accepted",
      }),
    });

    expect(decision.status).toBe("blocked");
    expect(decision.reasonCodes).toContain("source_edit_evidence_missing");
  });
});
