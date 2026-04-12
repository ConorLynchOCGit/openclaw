import { describe, expect, it } from "vitest";
import {
  resolveCoverageGatedAnswerPolicy,
  resolveSourceResolutionReport,
} from "./source-resolution.js";

describe("resolveSourceResolutionReport", () => {
  it("resolves continuity questions to workspace continuity authority", () => {
    const report = resolveSourceResolutionReport({
      text: "What did we decide yesterday and what follow-through did we leave in memory?",
    });

    expect(report).toMatchObject({
      questionKind: "continuity",
      domain: "none",
      authoritativeSource: "workspace_continuity",
      supportingSources: ["workspace_project"],
      coverageRequirement: "not_required",
      coverageState: "not_required",
    });
  });

  it("resolves memory-system implementation questions to canonical repo authority", () => {
    const report = resolveSourceResolutionReport({
      text: "Where does this fit in the canonical memory classes in the memory-system architecture?",
    });

    expect(report).toMatchObject({
      questionKind: "implementation",
      domain: "memory_system",
      authoritativeSource: "repo_canonical_doc",
      supportingSources: ["mounted_curated_import"],
      coverageRequirement: "verify_before_exact_answer",
      coverageState: "unread",
    });
    expect(report.canonicalEntrypoints).toContain(
      "imports/engineering_repo/content/docs/memory-system/README.md",
    );
  });

  it("resolves mixed questions to canonical authority with workspace support", () => {
    const report = resolveSourceResolutionReport({
      text: "Use the mounted memory-system roadmap, but relate it to what we were doing yesterday.",
    });

    expect(report).toMatchObject({
      questionKind: "mixed",
      domain: "memory_system",
      authoritativeSource: "repo_canonical_doc",
      supportingSources: expect.arrayContaining([
        "mounted_curated_import",
        "workspace_project",
        "workspace_continuity",
      ]),
    });
  });

  it("records truncation and missing-context escalation reasons generically", () => {
    const report = resolveSourceResolutionReport({
      text: "Read the mounted plugin sdk files and confirm the public seam.",
      bootstrapTruncated: true,
      workspaceContextMissing: true,
    });

    expect(report).toMatchObject({
      questionKind: "implementation",
      domain: "plugin_sdk",
      escalationReasons: expect.arrayContaining([
        "explicit_mounted_request",
        "repo_coupled_domain",
        "bootstrap_truncated",
        "workspace_context_missing",
      ]),
    });
  });
});

describe("resolveCoverageGatedAnswerPolicy", () => {
  it("blocks exact canonical answers when coverage is partial", () => {
    expect(
      resolveCoverageGatedAnswerPolicy({
        sourceResolution: {
          authoritativeSource: "repo_canonical_doc",
          coverageRequirement: "verify_before_exact_answer",
          coverageState: "partial",
        },
      }),
    ).toEqual({
      exactAnswerAllowed: false,
      mustContinueReading: true,
      mustDiscloseIncompleteCoverage: true,
    });
  });

  it("allows exact canonical answers only after verification", () => {
    expect(
      resolveCoverageGatedAnswerPolicy({
        sourceResolution: {
          authoritativeSource: "repo_canonical_doc",
          coverageRequirement: "verify_before_exact_answer",
          coverageState: "verified",
        },
      }),
    ).toEqual({
      exactAnswerAllowed: true,
      mustContinueReading: false,
      mustDiscloseIncompleteCoverage: false,
    });
  });
});
