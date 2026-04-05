import { describe, expect, it } from "vitest";
import { detectProjectFactSemanticDecision } from "./project-fact-semantic.js";

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
  ])("ignores unsupported or ambiguous project-fact phrasing: %s", (text) => {
    expect(detectProjectFactSemanticDecision(text)).toMatchObject({
      action: "ignore",
    });
  });
});
