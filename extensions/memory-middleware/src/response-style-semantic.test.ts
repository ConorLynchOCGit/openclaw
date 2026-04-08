import { describe, expect, it } from "vitest";
import { detectResponseStyleSemanticDecision } from "./response-style-semantic.js";

describe("detectResponseStyleSemanticDecision", () => {
  it.each([
    ["plain english please", "responses_plain_english", "high"],
    ["can you use bullets", "responses_bullets", "medium"],
    ["shorter replies", "responses_concise", "medium"],
    ["when giving instructions use numbered steps", "responses_numbered_steps", "high"],
    ["please no tables unless asked", "responses_no_tables", "high"],
    ["plz keep it short", "responses_concise", "high"],
    ["can you avoid jargon", "responses_plain_english", "high"],
  ])("captures bounded response-style phrasing: %s", (text, template, confidence) => {
    expect(detectResponseStyleSemanticDecision(text)).toMatchObject({
      action: "capture",
      confidence,
      match: {
        template,
      },
    });
  });

  it.each([
    ["i meant plain english not jargon", "responses_plain_english"],
    ["no, use bullet points for me", "responses_bullets"],
    ["actually, use short section headers in longer replies", "response structure"],
  ])("captures bounded response-style corrections: %s", (text, template) => {
    expect(detectResponseStyleSemanticDecision(text)).toMatchObject({
      action: "capture",
      confidence: "high",
      match: {
        captureClass: "requirement_correction",
        ...(template === "response structure"
          ? {
              template: "response_style_generalized_guidance",
              subject: "response structure",
            }
          : { template }),
      },
    });
  });

  it.each([
    [
      "For future replies, start with the direct answer first.",
      "response opening",
      "start with the direct answer first",
    ],
    [
      "Please remember to use short section headers in longer replies.",
      "response structure",
      "use short section headers in longer replies",
    ],
    ["Default to no emoji in responses.", "response tone", "no emoji in responses"],
    [
      "By default, keep explanations high level unless I ask for more detail.",
      "response detail level",
      "keep explanations high level unless I ask for more detail",
    ],
    [
      "From now on, end longer replies with next steps.",
      "response wrap up",
      "end longer replies with next steps",
    ],
    [
      "When referencing files in chat, use repo-root relative paths.",
      "file references",
      "When referencing files in chat, use repo-root relative paths",
    ],
    [
      "Don't use absolute paths when citing files to me.",
      "file references",
      "Don't use absolute paths when citing files to me",
    ],
  ])("captures bounded generic response-style guidance: %s", (text, subject, value) => {
    expect(detectResponseStyleSemanticDecision(text)).toMatchObject({
      action: "capture",
      match: {
        template: "response_style_generalized_guidance",
        family: "generalized_guidance",
        subject,
        value,
      },
    });
  });

  it("strips correction prefixes case-insensitively for bounded generic response-style guidance", () => {
    expect(
      detectResponseStyleSemanticDecision("Actually, include a brief summary first."),
    ).toMatchObject({
      action: "capture",
      confidence: "high",
      match: {
        template: "response_style_generalized_guidance",
        captureClass: "requirement_correction",
        subject: "response opening",
        value: "include a brief summary first",
      },
    });
  });

  it("captures bounded generic response-style wrap-up corrections", () => {
    expect(
      detectResponseStyleSemanticDecision("Actually, end longer replies with a short recap."),
    ).toMatchObject({
      action: "capture",
      confidence: "high",
      match: {
        template: "response_style_generalized_guidance",
        captureClass: "requirement_correction",
        subject: "response wrap up",
        value: "end longer replies with a short recap",
      },
    });
  });

  it.each([
    ["actually, not bullets", "responses_bullets"],
    ["forget the table preference", "responses_no_tables"],
    ["dont remember that jargon preference", "responses_plain_english"],
    ["Forget the header preference.", "response_style_generalized_guidance"],
  ])("detects targetable conversational forget requests: %s", (text, template) => {
    expect(detectResponseStyleSemanticDecision(text)).toMatchObject({
      action: "forget",
      confidence: "high",
      template,
    });
  });

  it.each([
    "the table migration is still blocked",
    "the workflow needs a shorter release window",
    "we should add bullets to the changelog generator",
    "remember this later maybe",
    "For this reply, start with the direct answer first.",
    "the project needs more detail in the rollout plan",
    "next steps for this project are still blocked",
    "the repo layout still needs a clearer docs path",
  ])("ignores false-positive traps: %s", (text) => {
    expect(detectResponseStyleSemanticDecision(text)).toMatchObject({
      action: "ignore",
    });
  });
});
