import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveMemoryMiddlewareConfig } from "./config.js";
import { createDocumentMemoryIngestionService } from "./document-memory-ingestion-service.js";
import { createLegacySemanticTestScaffoldInterpreter } from "./memory-semantic-interpreter.test-helpers.js";

const config = resolveMemoryMiddlewareConfig({});
const semanticInterpreter = createLegacySemanticTestScaffoldInterpreter();

describe("document memory ingestion service", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (directory) => {
        await fs.rm(directory, { recursive: true, force: true });
      }),
    );
  });

  it("extracts identity-style response constraints with dedupe and provenance", async () => {
    const service = createDocumentMemoryIngestionService({ config, semanticInterpreter });
    const plan = await service.planDocument({
      path: "workspace/USER.md",
      profileId: "identity",
      content: [
        "# User profile",
        "",
        "## Response defaults",
        "plain english please",
        "plz keep it short",
        "shorter replies",
        "",
        "## File references",
        "When referencing files in chat, use repo-root relative paths.",
        "",
        "## Noise",
        "remember this later maybe",
      ].join("\n"),
    });

    expect(plan.counts.segmentCount).toBeGreaterThanOrEqual(3);
    expect(plan.counts.candidateCount).toBe(3);
    expect(plan.counts.byCategory.response_style).toBe(3);

    const conciseCandidate = plan.candidates.find(
      (candidate) => candidate.canonicalCandidate.record.statement === "keep responses concise",
    );
    expect(conciseCandidate).toBeDefined();
    expect(conciseCandidate?.duplicateCount).toBe(1);
    expect(conciseCandidate?.suppressedDuplicates).toHaveLength(1);
    expect(conciseCandidate?.submission.metadata.documentIngestion).toMatchObject({
      sourcePath: "workspace/USER.md",
      profileId: "identity",
      headingPath: ["User profile", "Response defaults"],
    });

    const repoRelativeCandidate = plan.candidates.find((candidate) =>
      candidate.canonicalCandidate.record.statement.includes("use repo-root relative paths"),
    );
    expect(repoRelativeCandidate).toMatchObject({
      lineStart: 9,
      lineEnd: 9,
      category: "response_style",
    });
  });

  it("extracts project-style rules, procedures, and unmet needs from a file source", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "document-memory-ingestion-"));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "atlas-ops.md");
    await fs.writeFile(
      filePath,
      [
        "# Atlas Forge Operating Notes",
        "",
        "## Branches",
        "For project atlas forge, the default branch is atlas-main.",
        "For project atlas forge, the staging branch is atlas-staging.",
        "",
        "## Commits",
        "Use scripts/committer for commits here instead of manual git add and git commit.",
        "",
        "## Release Evidence Handoff Checklist",
        "1. Capture the signed evidence bundle.",
        "2. Post the handoff note in the audit channel.",
        "",
        "## Gaps",
        "For project atlas forge, we're missing a release evidence template for rollout audits because audits still arrive ad hoc.",
        "",
        "## Localization",
        "For atlas forge docs, update the English docs first and rerun docs i18n instead of editing docs/zh-CN directly.",
        "",
        "## Noise",
        "The rollout plan is still messy.",
      ].join("\n"),
      "utf8",
    );

    const service = createDocumentMemoryIngestionService({ config, semanticInterpreter });
    const plan = await service.planDocument({
      path: filePath,
      profileId: "project_operating",
      projectId: "atlas-forge",
    });

    expect(plan.counts.candidateCount).toBe(6);
    expect(plan.counts.byCategory.project_fact).toBe(2);
    expect(plan.counts.byCategory.workflow_improvement).toBe(1);
    expect(plan.counts.byCategory.recurring_procedure).toBe(1);
    expect(plan.counts.byCategory.unmet_need).toBe(1);
    expect(plan.counts.byCategory.project_rule).toBe(1);

    const recurringProcedure = plan.candidates.find(
      (candidate) => candidate.category === "recurring_procedure",
    );
    expect(recurringProcedure?.canonicalCandidate.record.statement).toContain(
      "Capture the signed evidence bundle",
    );
    expect(recurringProcedure?.submission.metadata.documentIngestion).toMatchObject({
      profileId: "project_operating",
      segmentStrategy: "checklist",
      headingPath: ["Atlas Forge Operating Notes", "Release Evidence Handoff Checklist"],
    });

    const unmetNeed = plan.candidates.find((candidate) => candidate.category === "unmet_need");
    expect(unmetNeed?.canonicalCandidate.record.statement).toContain("release evidence template");

    const projectRule = plan.candidates.find((candidate) => candidate.category === "project_rule");
    expect(projectRule?.canonicalCandidate.record.statement.toLowerCase()).toContain(
      "update the english docs first and rerun docs i18n",
    );

    expect(
      plan.candidates.some((candidate) =>
        candidate.canonicalCandidate.record.statement.includes("rollout plan is still messy"),
      ),
    ).toBe(false);
  });

  it("builds a bulk plan summary across document classes", async () => {
    const service = createDocumentMemoryIngestionService({ config, semanticInterpreter });
    const plan = await service.planDocuments([
      {
        path: "workspace/USER.md",
        profileId: "identity",
        content: "plain english please\nplz keep it short\n",
      },
      {
        path: "workspace/projects/atlas/STATUS.md",
        profileId: "project_operating",
        projectId: "atlas",
        content: "For project atlas, the default branch is atlas-main.\n",
      },
    ]);

    expect(plan.totals.documentCount).toBe(2);
    expect(plan.totals.candidateCount).toBe(3);
    expect(plan.totals.byCategory.response_style).toBe(2);
    expect(plan.totals.byCategory.project_fact).toBe(1);
  });

  it("extracts workflow runbook guidance from heading-scoped checklist content", async () => {
    const service = createDocumentMemoryIngestionService({ config, semanticInterpreter });
    const plan = await service.planDocument({
      path: "docs/help/slice-workflow.md",
      profileId: "workflow_runbook",
      content: [
        "# Slice Landing Workflow",
        "",
        "## Isolated-proof gate",
        "Even after Turbo adoption, keep `pnpm runtime:proof:fast` as the authoritative proof entrypoint. Turbo can help feed build artifacts into that path, but it is not the owner of gateway restart or `/readyz` proof semantics.",
        "",
        "## Commit and push timing",
        "Use `scripts/committer` for scoped commits.",
        "",
        "## Change class rules",
        "### Docs or process only",
        "- Default validation tier: `pnpm check:fast`",
        "- No `pnpm build` unless generated or build-sensitive artifacts changed",
        "- Helper paths that detect docs or changelog-only changes should follow the same rule: `pnpm check:fast`, no `pnpm build`, and no full-suite `pnpm test`",
        "",
        "## Suggested dry-run checklist",
        "1. trust `/readyz` as the actual readiness gate",
        "2. treat `/healthz` as shallow liveness only",
      ].join("\n"),
    });

    expect(plan.counts.candidateCount).toBe(5);
    expect(plan.counts.byCategory.recurring_procedure).toBe(1);
    expect(plan.counts.byCategory.workflow_improvement).toBe(4);

    expect(
      plan.candidates.some((candidate) =>
        candidate.canonicalCandidate.record.statement.includes("pnpm runtime:proof:fast"),
      ),
    ).toBe(true);
    expect(
      plan.candidates.some((candidate) =>
        candidate.canonicalCandidate.record.statement.includes("scripts/committer"),
      ),
    ).toBe(true);
    expect(
      plan.candidates.some((candidate) =>
        candidate.canonicalCandidate.record.statement.includes(
          "use pnpm check:fast instead of full pnpm check or pnpm build",
        ),
      ),
    ).toBe(true);
    expect(
      plan.candidates.some(
        (candidate) =>
          candidate.canonicalCandidate.record.statement.includes("trust /readyz") &&
          candidate.canonicalCandidate.record.statement.includes("/healthz"),
      ),
    ).toBe(true);
    expect(
      plan.candidates.some(
        (candidate) =>
          candidate.category === "workflow_improvement" &&
          candidate.canonicalCandidate.record.statement.includes("trust /readyz") &&
          candidate.canonicalCandidate.record.statement.includes("/healthz"),
      ),
    ).toBe(true);
  });

  it("captures narrow routing guidance without turning generic references into memory noise", async () => {
    const service = createDocumentMemoryIngestionService({ config, semanticInterpreter });
    const plan = await service.planDocument({
      path: "docs/help/slice-workflow.md",
      profileId: "workflow_runbook",
      content: [
        "# Slice Landing Workflow",
        "",
        "Use it with [Testing](/help/testing) and the existing release policy in",
        "[Release Policy](/reference/RELEASING).",
        "",
        "Use the concrete landing tiers in",
        "[Landing Gate Tiers](/help/landing-gate-tiering-proposal) when you want the",
        "repo's default feature, integration, or production bar.",
        "",
        "This workflow does not replace existing hard gates in `AGENTS.md`; it decides when to pay them.",
      ].join("\n"),
    });

    expect(plan.counts.candidateCount).toBe(2);
    expect(plan.counts.byCategory.reference_routing).toBe(2);
    expect(
      plan.candidates.some(
        (candidate) =>
          candidate.category === "reference_routing" &&
          candidate.canonicalCandidate.record.statement.includes(
            "For slice landing workflow, use Testing and Release Policy.",
          ),
      ),
    ).toBe(true);
    expect(
      plan.candidates.some(
        (candidate) =>
          candidate.category === "reference_routing" &&
          candidate.canonicalCandidate.record.statement.includes(
            "For the repo's default feature, integration, or production bar, use Landing Gate Tiers.",
          ),
      ),
    ).toBe(true);
    expect(
      plan.candidates.some((candidate) =>
        candidate.canonicalCandidate.record.statement.includes("decides when to pay them"),
      ),
    ).toBe(false);
  });

  it("captures actionable quick-start procedures and scoped doc routing from testing guidance", async () => {
    const service = createDocumentMemoryIngestionService({ config, semanticInterpreter });
    const plan = await service.planDocument({
      path: "docs/help/testing.md",
      profileId: "workflow_runbook",
      content: [
        "# Testing",
        "",
        "For the repo-wide order of operations around validation, isolated proof, production proof, commit, push, and closeout, use",
        "[Slice Landing Workflow](/help/slice-workflow).",
        "",
        "## Quick start",
        "",
        "Most days:",
        "",
        "- Default local loop: `pnpm check:fast` plus the strongest nearby targeted tests",
        "- Use the smallest honest landing gate for the touched surface: `pnpm gate:feature` for most bounded slices `pnpm gate:integration` when the change crosses multiple owned surfaces `pnpm gate:production` only when you need the full repo landing bar",
        "- Use `pnpm build:runtime:fast` plus `pnpm runtime:proof:fast` for non-production runtime proof instead of defaulting every feature loop to the full image-based path",
        "",
        "Gate wrapper notes:",
        "",
        "- `pnpm check:fast`, `pnpm check:types`, `pnpm check`, and `pnpm build` now use a repo-local gate wrapper with a shared lock.",
        "- `pnpm test` now uses that same shared repo-heavy lock through the planner wrapper.",
        "- Do not start those commands in parallel on the same checkout.",
        "- On an unchanged landing tree, the canonical flow should pay full `pnpm test` at most once.",
        "",
        "For current timing artifacts and the lighter-weight landing model, see",
        "[Landing Gate Tiers](/help/landing-gate-tiering-proposal).",
      ].join("\n"),
    });

    expect(plan.counts.candidateCount).toBeGreaterThanOrEqual(4);
    expect(plan.counts.byCategory.recurring_procedure).toBeGreaterThanOrEqual(2);
    expect(plan.counts.byCategory.reference_routing).toBe(2);
    expect(
      plan.candidates.some(
        (candidate) =>
          candidate.category === "recurring_procedure" &&
          candidate.canonicalCandidate.record.statement.includes("Default local loop") &&
          candidate.headingPath.join(" > ").includes("Quick start"),
      ),
    ).toBe(true);
    expect(
      plan.candidates.some(
        (candidate) =>
          candidate.category === "recurring_procedure" &&
          candidate.canonicalCandidate.record.statement.includes(
            "Do not start those commands in parallel on the same checkout",
          ),
      ),
    ).toBe(true);
    expect(
      plan.candidates.some(
        (candidate) =>
          candidate.category === "reference_routing" &&
          candidate.canonicalCandidate.record.statement.includes("Slice Landing Workflow"),
      ),
    ).toBe(true);
    expect(
      plan.candidates.some(
        (candidate) =>
          candidate.category === "reference_routing" &&
          candidate.canonicalCandidate.record.statement.includes("Landing Gate Tiers"),
      ),
    ).toBe(true);
  });
});
