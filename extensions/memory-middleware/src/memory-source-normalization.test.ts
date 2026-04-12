import { describe, expect, it } from "vitest";
import {
  normalizeDocumentMemorySource,
  normalizeTranscriptMemorySource,
  type MemorySourceEnvelope,
} from "./memory-source-normalization.js";

describe("memory source normalization", () => {
  it("keeps document normalization structural with shared source/provenance contracts", () => {
    const source: MemorySourceEnvelope = {
      kind: "document",
      sourceId: "doc:workflow",
      path: "docs/help/slice-workflow.md",
      projectId: "atlas-forge",
      sourceClass: "workflow_runbook",
    };

    const blocks = normalizeDocumentMemorySource({
      source,
      projectScope: "atlas forge",
      maxBlockChars: 160,
      content: [
        "# Slice Landing Workflow",
        "",
        "## Suggested dry-run checklist",
        "1. trust `/readyz` as the actual readiness gate",
        "2. treat `/healthz` as shallow liveness only",
        "",
        "## Notes",
        "Run nearby targeted tests only and avoid broad sweeps during the implementation loop.",
      ].join("\n"),
    });

    expect(blocks.length).toBeGreaterThanOrEqual(4);

    const checklistBlock = blocks.find((block) => block.listKind === "ordered");
    expect(checklistBlock).toMatchObject({
      headingPath: ["Slice Landing Workflow", "Suggested dry-run checklist"],
      structuredChildren: [
        "trust `/readyz` as the actual readiness gate",
        "treat `/healthz` as shallow liveness only",
      ],
      scope: {
        projectScope: "atlas forge",
        explicitScopeMarkers: ["Slice Landing Workflow", "Suggested dry-run checklist"],
      },
    });
    expect(checklistBlock?.provenance.source).toEqual(source);
    expect(checklistBlock?.provenance.headingPath).toEqual([
      "Slice Landing Workflow",
      "Suggested dry-run checklist",
    ]);
    expect(checklistBlock?.provenance.anchors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "segment" }),
        expect.objectContaining({ kind: "line_range", lineStart: 4, lineEnd: 5 }),
      ]),
    );
  });

  it("keeps transcript normalization structural and carries parent context without inferring semantic scope", () => {
    const source: MemorySourceEnvelope = {
      kind: "transcript",
      sourceId: "turn:1",
      sessionKey: "session-1",
    };

    const blocks = normalizeTranscriptMemorySource({
      source,
      text: [
        "Release Evidence Handoff Checklist:",
        "1. Capture the signed evidence bundle.",
        "2. Post the handoff note in the audit channel.",
      ].join("\n"),
      parentContext: [
        {
          role: "system",
          text: "For project atlas forge, branch settings are under review.",
        },
      ],
      maxSegments: 1,
      timestamp: "2026-04-12T00:00:00.000Z",
    });

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      headingPath: ["Release Evidence Handoff Checklist"],
      listKind: "ordered",
      structuredChildren: [
        "Capture the signed evidence bundle.",
        "Post the handoff note in the audit channel.",
      ],
      scope: {
        headingPath: ["Release Evidence Handoff Checklist"],
        parentContext: [
          {
            role: "system",
            text: "For project atlas forge, branch settings are under review.",
          },
        ],
      },
      provenance: {
        source,
        headingPath: ["Release Evidence Handoff Checklist"],
        messageTimestamp: "2026-04-12T00:00:00.000Z",
      },
    });
    expect(blocks[0]?.provenance.anchors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "segment", segmentIndex: 1 }),
        expect.objectContaining({
          kind: "message",
          messageTimestamp: "2026-04-12T00:00:00.000Z",
        }),
      ]),
    );
  });
});
