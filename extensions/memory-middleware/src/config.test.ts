import { describe, expect, it } from "vitest";
import {
  BOUNDED_WORKFLOW_GUIDANCE_CAPTURE_CLASSES,
  resolveMemoryMiddlewareCandidateIngressCapabilities,
  resolveMemoryMiddlewareConfig,
} from "./config.js";

const LEGACY_TO_CANONICAL_INGRESS_MODES = [
  ["submit-review-only", "conversational-review"],
  ["submit-review-promote-memory", "promote-memory"],
  ["submit-review-promote-memory-procedure", "promote-procedure-draft"],
  ["submit-review-promote-memory-procedure-validate", "validate-procedure"],
  ["submit-review-promote-memory-procedure-validate-skill", "skill-candidate"],
  ["submit-review-promote-memory-procedure-validate-skill-procurement", "skill-procurement"],
  ["submit-review-promote-memory-procedure-validate-skill-procurement-vetting", "skill-vetting"],
  [
    "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval",
    "skill-approval",
  ],
  [
    "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install",
    "skill-install",
  ],
] as const;

const READ_ONLY_CANONICAL_INGRESS_MODES = [
  "submit-only",
  "conversational-review",
  "promote-memory",
  "promote-procedure-draft",
  "validate-procedure",
  "skill-candidate",
  "skill-procurement",
  "skill-vetting",
  "skill-approval",
  "skill-install",
] as const;

describe("resolveMemoryMiddlewareConfig", () => {
  it("defaults memory-object query mode to disabled when candidate ingress is disabled", () => {
    expect(resolveMemoryMiddlewareConfig({})).toMatchObject({
      candidateIngress: { mode: "disabled" },
      memoryObjectQuery: { mode: "disabled" },
      autoCapture: {
        profile: "disabled",
        allowedAgents: ["chief", "main"],
      },
      autoPromotion: {
        profile: "disabled",
        allowedAgents: ["chief", "main"],
      },
      selfImprovingCapture: {
        mode: "disabled",
        allowedCaptureClasses: [...BOUNDED_WORKFLOW_GUIDANCE_CAPTURE_CLASSES],
      },
      learnedGuidanceAdvisoryPlanning: {
        mode: "disabled",
        allowedCaptureClasses: [...BOUNDED_WORKFLOW_GUIDANCE_CAPTURE_CLASSES],
        defaultMaxSuggestions: 3,
      },
      backgroundJobs: {
        inspectionMode: "disabled",
        advisorySchedulingMode: "disabled",
        executeSchedulingMode: "disabled",
        advisoryJobClasses: ["proactive_plan"],
        executeJobClasses: ["proactive_execute_run_drift_check"],
      },
    });
  });

  it("keeps background-job automation disabled by default even in candidate-only mode", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: { mode: "candidate-only" },
      }),
    ).toMatchObject({
      candidateIngress: { mode: "candidate-only" },
      selfImprovingCapture: { mode: "disabled" },
      learnedGuidanceAdvisoryPlanning: {
        mode: "disabled",
        allowedCaptureClasses: [...BOUNDED_WORKFLOW_GUIDANCE_CAPTURE_CLASSES],
        defaultMaxSuggestions: 3,
      },
      backgroundJobs: {
        inspectionMode: "disabled",
        advisorySchedulingMode: "disabled",
        executeSchedulingMode: "disabled",
        advisoryJobClasses: ["proactive_plan"],
        executeJobClasses: ["proactive_execute_run_drift_check"],
      },
    });
  });

  it("keeps ordinary-turn auto-capture disabled by default", () => {
    expect(resolveMemoryMiddlewareConfig({})).toMatchObject({
      autoCapture: {
        profile: "disabled",
        allowedAgents: ["chief", "main"],
      },
      autoPromotion: {
        profile: "disabled",
        allowedAgents: ["chief", "main"],
      },
    });
  });

  it("normalizes the narrow ordinary-turn auto-capture profile", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        autoCapture: {
          profile: "user-preference-v1",
          allowedAgents: [" chief ", "main", "chief"],
        },
      }),
    ).toMatchObject({
      autoCapture: {
        profile: "user-preference-v1",
        allowedAgents: ["chief", "main"],
      },
    });
  });

  it("normalizes the broader ordinary-turn auto-capture and auto-promotion profiles", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        autoCapture: {
          profile: "user-preference-v2",
          allowedAgents: [" main ", "chief", "main"],
        },
        autoPromotion: {
          profile: "explicit-user-preference-v1",
          allowedAgents: [" chief ", "main", "chief"],
        },
      }),
    ).toMatchObject({
      autoCapture: {
        profile: "user-preference-v2",
        allowedAgents: ["chief", "main"],
      },
      autoPromotion: {
        profile: "explicit-user-preference-v1",
        allowedAgents: ["chief", "main"],
      },
    });
  });

  it("requires self-improving capture to opt in explicitly even when candidate ingress is candidate-only", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: { mode: "candidate-only" },
        selfImprovingCapture: { mode: "candidate-only" },
      }),
    ).toMatchObject({
      candidateIngress: { mode: "candidate-only" },
      selfImprovingCapture: {
        mode: "candidate-only",
        allowedCaptureClasses: [...BOUNDED_WORKFLOW_GUIDANCE_CAPTURE_CLASSES],
      },
    });
  });

  it("requires learned-guidance advisory planning to opt in explicitly", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: { mode: "candidate-only" },
        learnedGuidanceAdvisoryPlanning: { mode: "inline-only" },
      }),
    ).toMatchObject({
      candidateIngress: { mode: "candidate-only" },
      learnedGuidanceAdvisoryPlanning: {
        mode: "inline-only",
        allowedCaptureClasses: [...BOUNDED_WORKFLOW_GUIDANCE_CAPTURE_CLASSES],
        defaultMaxSuggestions: 3,
      },
    });
  });

  it("normalizes bounded self-improving and learned-guidance rollout controls", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        selfImprovingCapture: {
          mode: "candidate-only",
          rolloutTarget: "off-production",
          allowedCaptureClasses: [
            " unsupported_capture_class ",
            "unsupported_capture_class",
            "ignored",
          ],
        },
        learnedGuidanceAdvisoryPlanning: {
          mode: "inline-only",
          rolloutTarget: "production-canary",
          allowedCaptureClasses: [
            "workflow_generalized_guidance",
            "unsupported_capture_class",
            "workflow_generalized_guidance",
          ],
          defaultMaxSuggestions: 12,
        },
      }),
    ).toMatchObject({
      selfImprovingCapture: {
        mode: "candidate-only",
        rolloutTarget: "off-production",
        allowedCaptureClasses: [...BOUNDED_WORKFLOW_GUIDANCE_CAPTURE_CLASSES],
      },
      learnedGuidanceAdvisoryPlanning: {
        mode: "inline-only",
        rolloutTarget: "production-canary",
        allowedCaptureClasses: ["workflow_generalized_guidance"],
        defaultMaxSuggestions: 10,
      },
    });
  });

  it("derives candidate-ingress automation capabilities from canonical stage names and legacy aliases", () => {
    expect(resolveMemoryMiddlewareCandidateIngressCapabilities("submit-only")).toMatchObject({
      submit: true,
      review: false,
      memoryPromotion: false,
      procedureDraftPromotion: false,
      procedureValidation: false,
      fullCandidateSandbox: false,
    });
    expect(resolveMemoryMiddlewareCandidateIngressCapabilities("skill-install")).toMatchObject({
      submit: true,
      review: true,
      memoryPromotion: true,
      procedureDraftPromotion: true,
      procedureValidation: true,
      skillCandidate: true,
      skillProcurement: true,
      skillVetting: true,
      skillApproval: true,
      skillInstall: true,
      fullCandidateSandbox: false,
    });
    expect(
      resolveMemoryMiddlewareCandidateIngressCapabilities(
        "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install",
      ),
    ).toMatchObject({
      submit: true,
      review: true,
      memoryPromotion: true,
      procedureDraftPromotion: true,
      procedureValidation: true,
      skillCandidate: true,
      skillProcurement: true,
      skillVetting: true,
      skillApproval: true,
      skillInstall: true,
      fullCandidateSandbox: false,
    });
    expect(resolveMemoryMiddlewareCandidateIngressCapabilities("candidate-only")).toMatchObject({
      submit: true,
      review: true,
      memoryPromotion: true,
      procedureDraftPromotion: true,
      procedureValidation: true,
      skillCandidate: true,
      skillProcurement: true,
      skillVetting: true,
      skillApproval: true,
      skillInstall: true,
      fullCandidateSandbox: true,
    });
  });

  it("normalizes legacy ingress ladder values to canonical stage names", () => {
    for (const [legacyMode, canonicalMode] of LEGACY_TO_CANONICAL_INGRESS_MODES) {
      expect(
        resolveMemoryMiddlewareConfig({
          candidateIngress: { mode: legacyMode },
        }),
      ).toMatchObject({
        candidateIngress: { mode: canonicalMode },
      });
    }
  });

  it("allows inspection and advisory scheduling to be enabled without execute-class scheduling", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: { mode: "candidate-only" },
        backgroundJobs: {
          inspectionMode: "enabled",
          advisorySchedulingMode: "enabled",
          executeSchedulingMode: "disabled",
          advisoryJobClasses: ["consolidation_plan", "proactive_plan", "proactive_plan"],
          executeJobClasses: ["consolidation_execute", "proactive_execute_run_drift_check"],
          runnerOwnerId: " runner-1 ",
        },
      }),
    ).toMatchObject({
      backgroundJobs: {
        inspectionMode: "enabled",
        advisorySchedulingMode: "enabled",
        executeSchedulingMode: "disabled",
        advisoryJobClasses: ["consolidation_plan", "proactive_plan"],
        executeJobClasses: ["consolidation_execute", "proactive_execute_run_drift_check"],
        runnerOwnerId: "runner-1",
      },
    });
  });

  it("inherits candidate-only query mode when candidate ingress is enabled", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: { mode: "candidate-only" },
      }),
    ).toMatchObject({
      candidateIngress: { mode: "candidate-only" },
      memoryObjectQuery: { mode: "candidate-only" },
    });
  });

  for (const mode of READ_ONLY_CANONICAL_INGRESS_MODES) {
    it(`keeps retrieval disabled by default when ${mode} ingress is enabled`, () => {
      expect(
        resolveMemoryMiddlewareConfig({
          candidateIngress: { mode },
        }),
      ).toMatchObject({
        candidateIngress: { mode },
        memoryObjectQuery: { mode: "disabled" },
      });
    });
  }

  it("allows explicit read-only query mode while candidate ingress stays disabled", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: { mode: "disabled" },
        memoryObjectQuery: { mode: "read-only" },
      }),
    ).toMatchObject({
      candidateIngress: { mode: "disabled" },
      memoryObjectQuery: { mode: "read-only" },
    });
  });

  for (const mode of READ_ONLY_CANONICAL_INGRESS_MODES) {
    it(`allows ${mode} ingress while retrieval stays read-only`, () => {
      expect(
        resolveMemoryMiddlewareConfig({
          candidateIngress: { mode },
          memoryObjectQuery: { mode: "read-only" },
        }),
      ).toMatchObject({
        candidateIngress: { mode },
        memoryObjectQuery: { mode: "read-only" },
      });
    });
  }
});
