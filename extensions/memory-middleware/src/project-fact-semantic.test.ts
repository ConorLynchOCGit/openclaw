import { describe, expect, it } from "vitest";
import {
  detectGenericProjectFactSemanticDecision,
  detectProjectFactSemanticDecision,
} from "./project-fact-semantic.js";

describe("detectProjectFactSemanticDecision", () => {
  it.each([
    [
      "For project atlas forge, the default branch is atlas-main.",
      "explicit_project_fact",
      "default_branch",
      "high",
    ],
    [
      "For project atlas forge, the staging branch is atlas-staging.",
      "explicit_project_fact",
      "staging_branch",
      "high",
    ],
    [
      "For project atlas forge, the repository URL is https://github.com/openclaw/openclaw.",
      "explicit_project_fact",
      "repository_url",
      "high",
    ],
    [
      "For project atlas forge, the deployment URL is https://openclaw.ai/app.",
      "explicit_project_fact",
      "deployment_url",
      "high",
    ],
    [
      "For project atlas forge, the documentation URL is https://docs.openclaw.ai/getting-started.",
      "explicit_project_fact",
      "documentation_url",
      "high",
    ],
    [
      "For project atlas forge, the runbook URL is https://ops.openclaw.ai/runbooks/atlas-forge.",
      "explicit_project_fact",
      "runbook_url",
      "high",
    ],
    [
      "For project atlas forge, we use pnpm.",
      "explicit_project_fact",
      "primary_package_manager",
      "medium",
    ],
    [
      "For project atlas forge, the primary environment name is production.",
      "explicit_project_fact",
      "primary_environment_name",
      "high",
    ],
    [
      "Actually, for project atlas forge, the default branch is atlas-green.",
      "project_fact_correction",
      "default_branch",
      "high",
    ],
    [
      "Actually, for project atlas forge, the repository URL is https://github.com/openclaw/openclaw-next.",
      "project_fact_correction",
      "repository_url",
      "high",
    ],
    [
      "Actually, for project atlas forge, the documentation URL is https://docs.openclaw.ai/atlas-forge.",
      "project_fact_correction",
      "documentation_url",
      "high",
    ],
  ])("captures bounded project-fact phrasing: %s", (text, captureClass, fieldKey, confidence) => {
    expect(detectProjectFactSemanticDecision(text)).toMatchObject({
      action: "capture",
      confidence,
      match: {
        captureClass,
        fieldKey,
      },
    });
  });

  it.each([
    "We should switch the package manager someday.",
    "Atlas forge uses pnpm.",
    "The environment is kind of weird right now.",
    "Project atlas forge might need a new branch setup.",
    "For project atlas forge, the repo is probably somewhere on GitHub.",
    "For project atlas forge, the docs are somewhere online.",
    "For project atlas forge, the runbook is in notion.",
  ])("ignores unsupported or ambiguous project-fact phrasing: %s", (text) => {
    expect(detectProjectFactSemanticDecision(text)).toMatchObject({
      action: "ignore",
    });
  });

  it("captures bounded generic project reference facts with explicit scope", () => {
    expect(
      detectGenericProjectFactSemanticDecision(
        "For project atlas forge, the evidence dashboard is #atlas-rollout-evidence.",
      ),
    ).toMatchObject({
      action: "capture",
      confidence: "high",
      match: {
        captureClass: "explicit_project_fact",
        factFamily: "generalized_reference",
        template: "project_fact_generalized_named_scope",
        projectScope: "atlas forge",
        subject: "atlas forge / evidence dashboard",
        value: "#atlas-rollout-evidence",
      },
    });
  });

  it.each([
    "For project atlas forge, the rollout plan is still messy.",
    "For project atlas forge, the preferred workflow is approvals first.",
    "For project atlas forge, the evidence dashboard is a shared page in notion.",
  ])("ignores over-broad generic project facts: %s", (text) => {
    expect(detectGenericProjectFactSemanticDecision(text)).toMatchObject({
      action: "ignore",
    });
  });
});
