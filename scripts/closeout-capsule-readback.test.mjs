import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCloseoutCapsuleReadback } from "../extensions/execution-platform/src/codex-bridge/closeout-capsule-readback.ts";

await test("renders owner-facing role closeout details", () => {
  const readback = buildCloseoutCapsuleReadback({
    roles: [
      {
        roleName: "implementation",
        roleRef: "role:implementation",
        modelRef: "model:gpt-5.4",
        modelAuthoredCloseout: "Implemented the minimal readback formatter.",
        did: ["Added role sections", "Kept output allowlisted"],
        limitations: ["Runtime wiring was intentionally unchanged"],
        validationEvidence: ["node --test scripts/closeout-capsule-readback.test.mjs"],
        eli5Progress: ["The report now says who did what and how it was checked"],
      },
    ],
    leadReport: "Lead verified the capsule is readable without raw logs.",
  });

  assert.match(readback, /### implementation/);
  assert.match(readback, /Role ref: role:implementation \| Model ref: model:gpt-5\.4/);
  assert.match(readback, /Model-authored closeout:\nImplemented the minimal readback formatter\./);
  assert.match(readback, /What this role did:\n- Added role sections\n- Kept output allowlisted/);
  assert.match(readback, /Limitations:\n- Runtime wiring was intentionally unchanged/);
  assert.match(
    readback,
    /Validation evidence:\n- node --test scripts\/closeout-capsule-readback\.test\.mjs/,
  );
  assert.match(
    readback,
    /ELI5 progress:\n- The report now says who did what and how it was checked/,
  );
  assert.match(readback, /## Lead Report\nLead verified/);
});

await test("uses placeholders and does not leak non-readback fields", () => {
  const readback = buildCloseoutCapsuleReadback({
    roles: [
      {
        roleRef: "role:qa",
        modelRef: "model:reviewer",
        rawPrompt: "hidden prompt should not render",
        rawResponse: "hidden response should not render",
        providerLog: "hidden provider log should not render",
      },
    ],
  });

  assert.match(readback, /### role:qa/);
  assert.match(readback, /Model-authored closeout:\nNot reported/);
  assert.match(readback, /What this role did:\n- Not reported/);
  assert.doesNotMatch(readback, /hidden prompt/);
  assert.doesNotMatch(readback, /hidden response/);
  assert.doesNotMatch(readback, /hidden provider log/);
});
