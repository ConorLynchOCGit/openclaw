import { describe, expect, it } from "vitest";
import { resolveMemoryMiddlewareConfig } from "./config.js";

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
        allowedLessonFamilies: ["generalized_workflow_lesson", "supported_lesson"],
      },
      learnedGuidanceAdvisoryPlanning: {
        mode: "disabled",
        allowedLessonFamilies: ["generalized_workflow_lesson", "supported_lesson"],
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
        allowedLessonFamilies: ["generalized_workflow_lesson", "supported_lesson"],
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
        allowedLessonFamilies: ["generalized_workflow_lesson", "supported_lesson"],
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
        allowedLessonFamilies: ["generalized_workflow_lesson", "supported_lesson"],
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
          allowedLessonFamilies: [" supported_lesson ", "supported_lesson", "ignored"],
        },
        learnedGuidanceAdvisoryPlanning: {
          mode: "inline-only",
          rolloutTarget: "production-canary",
          allowedLessonFamilies: [
            "generalized_workflow_lesson",
            "supported_lesson",
            "generalized_workflow_lesson",
          ],
          defaultMaxSuggestions: 12,
        },
      }),
    ).toMatchObject({
      selfImprovingCapture: {
        mode: "candidate-only",
        rolloutTarget: "off-production",
        allowedLessonFamilies: ["supported_lesson"],
      },
      learnedGuidanceAdvisoryPlanning: {
        mode: "inline-only",
        rolloutTarget: "production-canary",
        allowedLessonFamilies: ["generalized_workflow_lesson", "supported_lesson"],
        defaultMaxSuggestions: 10,
      },
    });
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

  it("keeps retrieval disabled by default when submit-only ingress is enabled", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: { mode: "submit-only" },
      }),
    ).toMatchObject({
      candidateIngress: { mode: "submit-only" },
      memoryObjectQuery: { mode: "disabled" },
    });
  });

  it("keeps retrieval disabled by default when submit-review-only ingress is enabled", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: { mode: "submit-review-only" },
      }),
    ).toMatchObject({
      candidateIngress: { mode: "submit-review-only" },
      memoryObjectQuery: { mode: "disabled" },
    });
  });

  it("keeps retrieval disabled by default when submit-review-promote-memory ingress is enabled", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: { mode: "submit-review-promote-memory" },
      }),
    ).toMatchObject({
      candidateIngress: { mode: "submit-review-promote-memory" },
      memoryObjectQuery: { mode: "disabled" },
    });
  });

  it("keeps retrieval disabled by default when submit-review-promote-memory-procedure ingress is enabled", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: { mode: "submit-review-promote-memory-procedure" },
      }),
    ).toMatchObject({
      candidateIngress: { mode: "submit-review-promote-memory-procedure" },
      memoryObjectQuery: { mode: "disabled" },
    });
  });

  it("keeps retrieval disabled by default when submit-review-promote-memory-procedure-validate ingress is enabled", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: { mode: "submit-review-promote-memory-procedure-validate" },
      }),
    ).toMatchObject({
      candidateIngress: { mode: "submit-review-promote-memory-procedure-validate" },
      memoryObjectQuery: { mode: "disabled" },
    });
  });

  it("keeps retrieval disabled by default when submit-review-promote-memory-procedure-validate-skill ingress is enabled", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: { mode: "submit-review-promote-memory-procedure-validate-skill" },
      }),
    ).toMatchObject({
      candidateIngress: { mode: "submit-review-promote-memory-procedure-validate-skill" },
      memoryObjectQuery: { mode: "disabled" },
    });
  });

  it("keeps retrieval disabled by default when submit-review-promote-memory-procedure-validate-skill-procurement ingress is enabled", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: {
          mode: "submit-review-promote-memory-procedure-validate-skill-procurement",
        },
      }),
    ).toMatchObject({
      candidateIngress: {
        mode: "submit-review-promote-memory-procedure-validate-skill-procurement",
      },
      memoryObjectQuery: { mode: "disabled" },
    });
  });

  it("keeps retrieval disabled by default when submit-review-promote-memory-procedure-validate-skill-procurement-vetting ingress is enabled", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: {
          mode: "submit-review-promote-memory-procedure-validate-skill-procurement-vetting",
        },
      }),
    ).toMatchObject({
      candidateIngress: {
        mode: "submit-review-promote-memory-procedure-validate-skill-procurement-vetting",
      },
      memoryObjectQuery: { mode: "disabled" },
    });
  });

  it("keeps retrieval disabled by default when submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval ingress is enabled", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: {
          mode: "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval",
        },
      }),
    ).toMatchObject({
      candidateIngress: {
        mode: "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval",
      },
      memoryObjectQuery: { mode: "disabled" },
    });
  });

  it("keeps retrieval disabled by default when submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install ingress is enabled", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: {
          mode: "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install",
        },
      }),
    ).toMatchObject({
      candidateIngress: {
        mode: "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install",
      },
      memoryObjectQuery: { mode: "disabled" },
    });
  });

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

  it("allows submit-only ingress while retrieval stays read-only", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: { mode: "submit-only" },
        memoryObjectQuery: { mode: "read-only" },
      }),
    ).toMatchObject({
      candidateIngress: { mode: "submit-only" },
      memoryObjectQuery: { mode: "read-only" },
    });
  });

  it("allows submit-review-only ingress while retrieval stays read-only", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: { mode: "submit-review-only" },
        memoryObjectQuery: { mode: "read-only" },
      }),
    ).toMatchObject({
      candidateIngress: { mode: "submit-review-only" },
      memoryObjectQuery: { mode: "read-only" },
    });
  });

  it("allows submit-review-promote-memory ingress while retrieval stays read-only", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: { mode: "submit-review-promote-memory" },
        memoryObjectQuery: { mode: "read-only" },
      }),
    ).toMatchObject({
      candidateIngress: { mode: "submit-review-promote-memory" },
      memoryObjectQuery: { mode: "read-only" },
    });
  });

  it("allows submit-review-promote-memory-procedure ingress while retrieval stays read-only", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: { mode: "submit-review-promote-memory-procedure" },
        memoryObjectQuery: { mode: "read-only" },
      }),
    ).toMatchObject({
      candidateIngress: { mode: "submit-review-promote-memory-procedure" },
      memoryObjectQuery: { mode: "read-only" },
    });
  });

  it("allows submit-review-promote-memory-procedure-validate ingress while retrieval stays read-only", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: { mode: "submit-review-promote-memory-procedure-validate" },
        memoryObjectQuery: { mode: "read-only" },
      }),
    ).toMatchObject({
      candidateIngress: { mode: "submit-review-promote-memory-procedure-validate" },
      memoryObjectQuery: { mode: "read-only" },
    });
  });

  it("allows submit-review-promote-memory-procedure-validate-skill ingress while retrieval stays read-only", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: { mode: "submit-review-promote-memory-procedure-validate-skill" },
        memoryObjectQuery: { mode: "read-only" },
      }),
    ).toMatchObject({
      candidateIngress: { mode: "submit-review-promote-memory-procedure-validate-skill" },
      memoryObjectQuery: { mode: "read-only" },
    });
  });

  it("allows submit-review-promote-memory-procedure-validate-skill-procurement ingress while retrieval stays read-only", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: {
          mode: "submit-review-promote-memory-procedure-validate-skill-procurement",
        },
        memoryObjectQuery: { mode: "read-only" },
      }),
    ).toMatchObject({
      candidateIngress: {
        mode: "submit-review-promote-memory-procedure-validate-skill-procurement",
      },
      memoryObjectQuery: { mode: "read-only" },
    });
  });

  it("allows submit-review-promote-memory-procedure-validate-skill-procurement-vetting ingress while retrieval stays read-only", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: {
          mode: "submit-review-promote-memory-procedure-validate-skill-procurement-vetting",
        },
        memoryObjectQuery: { mode: "read-only" },
      }),
    ).toMatchObject({
      candidateIngress: {
        mode: "submit-review-promote-memory-procedure-validate-skill-procurement-vetting",
      },
      memoryObjectQuery: { mode: "read-only" },
    });
  });

  it("allows submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval ingress while retrieval stays read-only", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: {
          mode: "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval",
        },
        memoryObjectQuery: { mode: "read-only" },
      }),
    ).toMatchObject({
      candidateIngress: {
        mode: "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval",
      },
      memoryObjectQuery: { mode: "read-only" },
    });
  });

  it("allows submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install ingress while retrieval stays read-only", () => {
    expect(
      resolveMemoryMiddlewareConfig({
        candidateIngress: {
          mode: "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install",
        },
        memoryObjectQuery: { mode: "read-only" },
      }),
    ).toMatchObject({
      candidateIngress: {
        mode: "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install",
      },
      memoryObjectQuery: { mode: "read-only" },
    });
  });
});
