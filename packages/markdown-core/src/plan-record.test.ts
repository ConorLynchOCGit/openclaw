import { describe, expect, it } from "vitest";
import { parsePlanRecord } from "./plan-record.js";

describe("parsePlanRecord", () => {
  it("extracts the canonical plan-record template shape", () => {
    const result = parsePlanRecord(`---
type: plan_record
title: Template Backed Record
project: OpenClaw Next
domain: agency-intelligence
created: 2026-06-17
status: draft
owner_agent: planning
implementation_agent: coding
gbrain_slug: concepts/phase-0-plan-record-validator-smoke
---

# Goal

Validate the template contract.

# Risks

- Existing records may vary.

# Risk Mitigations

- Keep diagnostics precise.

# Execution Slices

## Slice 1

Implement only the pure parser.

## Slice 2

Defer integration.

# Definition Of Done

- Required fields are extracted.
- Required sections are validated.
`);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.record).toEqual({
      title: "Template Backed Record",
      project: "OpenClaw Next",
      status: "draft",
      executionSlices: [
        "Slice 1\n\nImplement only the pure parser.",
        "Slice 2\n\nDefer integration.",
      ],
      risks: ["Existing records may vary."],
      acceptanceCriteria: ["Required fields are extracted.", "Required sections are validated."],
    });
  });

  it("extracts the canonical frontmatter and native Definition Of Done section", () => {
    const result = parsePlanRecord(`---
type: plan_record
title: Phase 0 Plan Validator
project: OpenClaw Next
status: approved
---

# Goal

Validate plan records.

# Risks

- Existing records may vary.

# Execution Slices

## Slice 1

Build the pure parser.

## Slice 2

Wire later integration.

# Definition Of Done

- Parser returns structured fields.
- Diagnostics are actionable.
`);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.record).toEqual({
      title: "Phase 0 Plan Validator",
      project: "OpenClaw Next",
      status: "approved",
      executionSlices: ["Slice 1\n\nBuild the pure parser.", "Slice 2\n\nWire later integration."],
      risks: ["Existing records may vary."],
      acceptanceCriteria: ["Parser returns structured fields.", "Diagnostics are actionable."],
    });
    expect(result.warnings).toEqual([]);
  });

  it("rejects non-canonical statuses in the planning-artifact prose shape", () => {
    const result = parsePlanRecord(`# Plan Record: Markdown Validator

Project: OpenClaw Next
Status: Planned

## Execution Slices

- Parser and validator only.

## Risks

- Over-validating too early.

## Acceptance Criteria

- Extracts all required fields.
`);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.partialRecord).toMatchObject({
      title: "Markdown Validator",
      project: "OpenClaw Next",
      status: "Planned",
      executionSlices: ["Parser and validator only."],
      acceptanceCriteria: ["Extracts all required fields."],
    });
    expect(result.errors).toContainEqual({
      code: "unknown_status",
      message: 'Unknown plan record status "Planned".',
      path: "status",
    });
  });

  it("rejects an explicit non-plan-record frontmatter type", () => {
    const result = parsePlanRecord(`---
type: research_brief
title: Wrong Type
project: OpenClaw Next
status: draft
---

# Execution Slices

- Parser and validator only.

# Risks

- Wrong artifact type could pass.

# Definition Of Done

- Wrong artifact types fail validation.
`);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors).toContainEqual({
      code: "unexpected_type",
      message: 'Expected frontmatter type "plan_record", got "research_brief".',
      path: "type",
    });
  });

  it("returns precise errors for missing required fields and sections", () => {
    const result = parsePlanRecord(`# Goal

No metadata here.
`);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors).toEqual([
      {
        code: "missing_required_field",
        message: "Missing required plan record field: title.",
        path: "title",
      },
      {
        code: "missing_required_field",
        message: "Missing required plan record field: project.",
        path: "project",
      },
      {
        code: "missing_required_field",
        message: "Missing required plan record field: status.",
        path: "status",
      },
      {
        code: "missing_required_section",
        message: "Missing required plan record section content: executionSlices.",
        path: "executionSlices",
      },
      {
        code: "missing_required_section",
        message: "Missing required plan record section content: risks.",
        path: "risks",
      },
      {
        code: "missing_required_section",
        message: "Missing required plan record section content: acceptanceCriteria.",
        path: "acceptanceCriteria",
      },
    ]);
  });

  it("does not accept metadata scalars inside fenced code blocks", () => {
    const result = parsePlanRecord(`# Plan Record: Fenced Metadata

\`\`\`md
Project: Not metadata
Status: approved
\`\`\`

## Execution Slices

- Parser only.

## Risks

- Fence drift.

## Acceptance Criteria

- Fenced metadata is ignored.
`);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.partialRecord.title).toBe("Fenced Metadata");
    expect(result.partialRecord.project).toBeUndefined();
    expect(result.partialRecord.status).toBeUndefined();
    expect(result.errors.slice(0, 2)).toEqual([
      {
        code: "missing_required_field",
        message: "Missing required plan record field: project.",
        path: "project",
      },
      {
        code: "missing_required_field",
        message: "Missing required plan record field: status.",
        path: "status",
      },
    ]);
  });

  it("keeps nested list content within its parent section", () => {
    const result = parsePlanRecord(`---
type: plan_record
title: Nested Lists
project: OpenClaw Next
status: draft
---

# Execution Slices

- Slice 1
  - Parse text only.
  - No runtime changes.

# Risks

- Parser drift.
  - Mitigation: focused tests.

# Definition Of Done

- Valid records pass.
  - Missing sections fail.
`);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.record.executionSlices).toEqual([
      "Slice 1\nParse text only.\nNo runtime changes.",
    ]);
    expect(result.record.risks).toEqual(["Parser drift.\nMitigation: focused tests."]);
    expect(result.record.acceptanceCriteria).toEqual([
      "Valid records pass.\nMissing sections fail.",
    ]);
  });

  it("flags duplicate matched sections", () => {
    const result = parsePlanRecord(`---
type: plan_record
title: Duplicate Sections
project: OpenClaw Next
status: draft
---

# Execution Slices
- First

# Execution Slices
- Second

# Risks
- Risk

# Definition Of Done
- Done
`);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors[0]).toEqual({
      code: "duplicate_section",
      message: "Multiple sections matched executionSlices.",
      path: "executionSlices",
    });
    expect(result.partialRecord.executionSlices).toEqual(["First"]);
  });

  it("does not treat nested per-slice headings as global required sections", () => {
    const result = parsePlanRecord(`---
type: plan_record
title: Nested Headings
project: OpenClaw Next
status: approved
---

# Execution Slices

## Slice 1

Implement the parser.

### Acceptance Criteria

- Slice-local check only.

### Risks

- Slice-local risk only.

## Slice 2

Add tests.

# Risks

- Global risk.

# Definition Of Done

- Global acceptance criterion.
`);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.record.executionSlices).toEqual([
      "Slice 1\n\nImplement the parser.\n\n### Acceptance Criteria\n\n- Slice-local check only.\n\n### Risks\n\n- Slice-local risk only.",
      "Slice 2\n\nAdd tests.",
    ]);
    expect(result.record.risks).toEqual(["Global risk."]);
    expect(result.record.acceptanceCriteria).toEqual(["Global acceptance criterion."]);
  });

  it("ignores headings and list markers inside fenced code blocks", () => {
    const result = parsePlanRecord(`---
type: plan_record
title: Fenced Markdown
project: OpenClaw Next
status: draft
---

# Execution Slices

## Slice 1

\`\`\`md
# Risks
- Not a real risk.
# Acceptance Criteria
- Not a real criterion.
\`\`\`

# Risks

- Real risk.

# Definition Of Done

- Real criterion.
`);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.record.executionSlices).toEqual([
      "Slice 1\n\n```md\n# Risks\n- Not a real risk.\n# Acceptance Criteria\n- Not a real criterion.\n```",
    ]);
    expect(result.record.risks).toEqual(["Real risk."]);
    expect(result.record.acceptanceCriteria).toEqual(["Real criterion."]);
  });

  it("keeps mixed fence markers inside the opening fenced block", () => {
    const result = parsePlanRecord(`---
type: plan_record
title: Mixed Fences
project: OpenClaw Next
status: draft
---

# Execution Slices

## Slice 1

\`\`\`md
~~~
# Risks
- Not a real risk.
~~~
\`\`\`

# Risks

- Real risk.

# Definition Of Done

- Real criterion.
`);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.record.executionSlices).toEqual([
      "Slice 1\n\n```md\n~~~\n# Risks\n- Not a real risk.\n~~~\n```",
    ]);
    expect(result.record.risks).toEqual(["Real risk."]);
    expect(result.record.acceptanceCriteria).toEqual(["Real criterion."]);
  });
});
