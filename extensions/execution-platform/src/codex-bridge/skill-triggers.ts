import { readFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_DIAGNOSTIC_LIMITS, boundDiagnosticJson } from "../observability/redaction.ts";
import type {
  JsonValue,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import type { CodexBridgeControlReasonCategory } from "./control-bridge.ts";

const DEFAULT_SKILL_ROOT = "/root/.codex/skills";
const WORKSPACE_DOC_ROOT = "/root/.openclaw/workspace/docs/projects/execution-platform";
const DEFAULT_MAX_SKILL_TRIGGER_METADATA_BYTES = 64 * 1024;

export const CODEX_BRIDGE_SKILL_EXECUTION_MODES = [
  "observe_only_smoke",
  "fake_control_loop",
  "code_writing_bridge_pilot",
  "trusted_yolo_local",
  "rebuild",
  "autobailout",
] as const;

export type CodexBridgeSkillExecutionMode = (typeof CODEX_BRIDGE_SKILL_EXECUTION_MODES)[number];

export type CodexBridgeSkillCategory =
  | "active_local_skill"
  | "workspace_skill_doc"
  | "workspace_role_doc"
  | "runtime_guardrail";

export type CodexBridgeSkillActivationState =
  | "active"
  | "covered_by_active_bridge_safety"
  | "draft_only"
  | "missing"
  | "blocked";

export type CodexBridgeSkillDocRegistryEntry = {
  skillDocId: string;
  displayName: string;
  category: CodexBridgeSkillCategory;
  requiredBefore: CodexBridgeSkillExecutionMode[];
  triggerPhrases: string[];
  requiredContextRefs: string[];
  expectedEvidence: string[];
  prohibitedActions: string[];
  readinessGateImpact: "allows_fake_only" | "blocks_live_authority" | "blocks_all_until_present";
  currentActivationState: CodexBridgeSkillActivationState;
};

export type ActiveLocalSkillDiscovery = {
  skillId: string;
  path: string;
  exists: boolean;
  activationState: CodexBridgeSkillActivationState;
  requiredGuidance: Array<{
    requirement: string;
    present: boolean;
  }>;
  missingGuidance: string[];
};

export type OpenClawClawHubSkillDiscovery = {
  skillId: "clawhub";
  path: string;
  openClawRepoSkillInstalled: boolean;
  codexSessionSkillActive: boolean;
  searchGuidancePresent: boolean;
  quarantineGuidancePresent: boolean;
  installWithoutReviewProhibited: boolean;
  activationStateForBridgeHarness: "available_as_openclaw_skill" | "missing" | "blocked";
  notes: string[];
};

export type CodexBridgeSkillTriggerInput = {
  userPrompt?: string;
  runtimeJobType?: string;
  bridgeEventKinds?: string[];
  controlReasonCategory?: CodexBridgeControlReasonCategory;
  closeoutGateState?: "present" | "missing" | "blocked" | "not_required";
  workQueueLinkPresent?: boolean;
  repoPath?: string;
  workspaceDocsPath?: string;
  requestedOperationType?:
    | CodexBridgeSkillExecutionMode
    | "work_queue_review"
    | "proactivity_review";
  observedHazards?: string[];
};

export type CodexBridgeSkillTriggerReport = {
  artifactKind: "codex_bridge_skill_trigger_report";
  triggeredSkillDocIds: string[];
  activeTriggeredIds: string[];
  draftOnlyTriggeredIds: string[];
  missingRequiredSkillDocIds: string[];
  coveredByBridgeSafetySkillDocIds: string[];
  blockingReasons: string[];
  readinessImpact: "none" | "fake_only_allowed" | "blocks_live_execution" | "blocks_requested_mode";
  evidenceRefs: string[];
  noModelJudgmentUsed: true;
};

export type CodexBridgeSkillReadinessReport = {
  artifactKind: "codex_bridge_skill_readiness_report";
  requestedMode: CodexBridgeSkillExecutionMode;
  allowed: boolean;
  blockingReasons: string[];
  activeSkillIds: string[];
  draftOnlySkillDocIds: string[];
  missingSkillDocIds: string[];
  coveredByBridgeSafetySkillDocIds: string[];
  triggerTestedSkillDocIds: string[];
  skillLayerReady: boolean;
  codeWritingBridgePilotBlocked: boolean;
  trustedYoloBlocked: boolean;
  rebuildBlocked: boolean;
  autobailoutBlocked: boolean;
  liveAuthorityGranted: false;
  noModelJudgmentUsed: true;
};

export type CodexBridgeFakeControlLoopReadiness = {
  artifactKind: "codex_bridge_fake_control_loop_readiness";
  allowed: boolean;
  blockingReasons: string[];
  controlBridgeReady: boolean;
  closeoutGateSatisfied: boolean;
  skillReadiness: CodexBridgeSkillReadinessReport;
  liveAuthorityGranted: false;
  codexCliInvoked: false;
  acpSessionStarted: false;
  providerCallMade: false;
  rebuildPerformed: false;
  schedulerStarted: false;
  daemonStarted: false;
  subagentStarted: false;
  workQueueLifecycleMutated: false;
};

export type CodexBridgeSkillTriggerOptions = {
  skillRoot?: string;
  workspaceDocRoot?: string;
  now?: () => Date;
  maxArtifactMetadataBytes?: number;
};

const COMMON_PROHIBITED_ACTIONS = [
  "bypass Execution Platform runtime truth",
  "treat process completion as task success",
  "store raw transcripts or hidden reasoning",
  "mutate Work Queue lifecycle without server evidence",
  "grant live authority from skill metadata",
];

const ROLE_DOC_IDS = [
  "orchestrator-role-contract",
  "implementer-role-contract",
  "tester-role-contract",
  "reviewer-role-contract",
  "bailout-role-contract",
  "docs-skills-writer-role-contract",
] as const;

const ROLE_DOC_PATHS: Record<(typeof ROLE_DOC_IDS)[number], string> = {
  "orchestrator-role-contract": "orchestrator.md",
  "implementer-role-contract": "implementation_engineer.md",
  "tester-role-contract": "test_engineer.md",
  "reviewer-role-contract": "reviewer.md",
  "bailout-role-contract": "rebuild_bailout_engineer.md",
  "docs-skills-writer-role-contract": "docs_skills_writer.md",
};

const REQUIRED_REGISTRY: CodexBridgeSkillDocRegistryEntry[] = [
  skillDoc("openclaw-engineering-standards", "OpenClaw Engineering Standards", [
    "code_writing_bridge_pilot",
    "trusted_yolo_local",
  ]),
  skillDoc("repo-boundary-and-path-awareness", "Repo Boundary and Path Awareness", [
    "observe_only_smoke",
    "fake_control_loop",
    "code_writing_bridge_pilot",
    "trusted_yolo_local",
  ]),
  skillDoc("tailscale-safe-ui-bridge", "Tailscale Safe UI Bridge", [
    "code_writing_bridge_pilot",
    "trusted_yolo_local",
  ]),
  skillDoc(
    "deterministic-vs-model-judgment-guardrail",
    "Deterministic vs Model Judgment Guardrail",
    ["code_writing_bridge_pilot", "trusted_yolo_local"],
  ),
  skillDoc("prohibited-semantic-drift-guardrail", "Prohibited Semantic Drift Guardrail", [
    "code_writing_bridge_pilot",
    "trusted_yolo_local",
  ]),
  skillDoc("execution-platform-runtime-truth", "Execution Platform Runtime Truth", [
    "observe_only_smoke",
    "fake_control_loop",
    "code_writing_bridge_pilot",
    "trusted_yolo_local",
  ]),
  skillDoc("work-queue-lifecycle-semantics", "Work Queue Lifecycle Semantics", [
    "fake_control_loop",
    "code_writing_bridge_pilot",
    "trusted_yolo_local",
  ]),
  skillDoc("rebuild-and-container-recovery", "Rebuild and Container Recovery", [
    "rebuild",
    "autobailout",
  ]),
  skillDoc("codex-bailout-protocol", "Codex Bailout Protocol", ["autobailout"]),
  skillDoc("validation-and-proof-policy", "Validation and Proof Policy", [
    "code_writing_bridge_pilot",
    "trusted_yolo_local",
    "rebuild",
    "autobailout",
  ]),
  skillDoc("artifact-and-stream-capture-policy", "Artifact and Stream Capture Policy", [
    "observe_only_smoke",
    "fake_control_loop",
    "code_writing_bridge_pilot",
    "trusted_yolo_local",
  ]),
  runtimeGuardrail("work-episode-outcome-pack-closeout", "Work Episode Outcome Pack Closeout", [
    "fake_control_loop",
    "code_writing_bridge_pilot",
    "trusted_yolo_local",
  ]),
  runtimeGuardrail("pause-redirect-cancel-control-bridge", "Pause Redirect Cancel Control Bridge", [
    "fake_control_loop",
    "code_writing_bridge_pilot",
    "trusted_yolo_local",
  ]),
  activeLocalSkill("work-queue-ux-review", "Work Queue UX Review", [
    "fake_control_loop",
    "code_writing_bridge_pilot",
    "trusted_yolo_local",
  ]),
  activeLocalSkill("openclaw-bridge-safety", "OpenClaw Bridge Safety", [
    "fake_control_loop",
    "code_writing_bridge_pilot",
    "trusted_yolo_local",
    "rebuild",
    "autobailout",
  ]),
  ...ROLE_DOC_IDS.map((id) =>
    roleDoc(id, titleize(id), ["code_writing_bridge_pilot", "trusted_yolo_local"]),
  ),
];

function skillDoc(
  skillDocId: string,
  displayName: string,
  requiredBefore: CodexBridgeSkillExecutionMode[],
): CodexBridgeSkillDocRegistryEntry {
  return {
    skillDocId,
    displayName,
    category: "workspace_skill_doc",
    requiredBefore,
    triggerPhrases: triggerPhrasesFor(skillDocId),
    requiredContextRefs: [`${WORKSPACE_DOC_ROOT}/skills/${skillDocId}.md`],
    expectedEvidence: ["workspace skill doc present", "trigger path tested"],
    prohibitedActions: COMMON_PROHIBITED_ACTIONS,
    readinessGateImpact: "blocks_live_authority",
    currentActivationState: "draft_only",
  };
}

function roleDoc(
  skillDocId: string,
  displayName: string,
  requiredBefore: CodexBridgeSkillExecutionMode[],
): CodexBridgeSkillDocRegistryEntry {
  return {
    skillDocId,
    displayName,
    category: "workspace_role_doc",
    requiredBefore,
    triggerPhrases: triggerPhrasesFor(skillDocId),
    requiredContextRefs: [
      `${WORKSPACE_DOC_ROOT}/roles/${ROLE_DOC_PATHS[skillDocId as (typeof ROLE_DOC_IDS)[number]]}`,
    ],
    expectedEvidence: ["workspace role contract doc present", "role trigger path tested"],
    prohibitedActions: COMMON_PROHIBITED_ACTIONS,
    readinessGateImpact: "blocks_live_authority",
    currentActivationState: "draft_only",
  };
}

function runtimeGuardrail(
  skillDocId: string,
  displayName: string,
  requiredBefore: CodexBridgeSkillExecutionMode[],
): CodexBridgeSkillDocRegistryEntry {
  return {
    skillDocId,
    displayName,
    category: "runtime_guardrail",
    requiredBefore,
    triggerPhrases: triggerPhrasesFor(skillDocId),
    requiredContextRefs: ["runtime-job://execution-platform"],
    expectedEvidence: ["runtime guardrail API present", "focused tests pass"],
    prohibitedActions: COMMON_PROHIBITED_ACTIONS,
    readinessGateImpact: "blocks_live_authority",
    currentActivationState: "active",
  };
}

function activeLocalSkill(
  skillDocId: string,
  displayName: string,
  requiredBefore: CodexBridgeSkillExecutionMode[],
): CodexBridgeSkillDocRegistryEntry {
  return {
    skillDocId,
    displayName,
    category: "active_local_skill",
    requiredBefore,
    triggerPhrases: triggerPhrasesFor(skillDocId),
    requiredContextRefs: [`${DEFAULT_SKILL_ROOT}/${skillDocId}/SKILL.md`],
    expectedEvidence: ["local SKILL.md exists", "required guidance present", "trigger path tested"],
    prohibitedActions: COMMON_PROHIBITED_ACTIONS,
    readinessGateImpact: "allows_fake_only",
    currentActivationState: "missing",
  };
}

function titleize(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function triggerPhrasesFor(id: string): string[] {
  const map: Record<string, string[]> = {
    "work-queue-ux-review": ["work queue", "proactivity", "skills", "artifact", "agent-work ux"],
    "openclaw-bridge-safety": [
      "execution platform",
      "codex bridge",
      "acp bridge",
      "bridge safety",
      "code-writing bridge",
      "runtime substrate",
      "wrong repo",
      "safe ui bridge",
      "closeout",
      "pause",
      "redirect",
      "cancel",
    ],
    "repo-boundary-and-path-awareness": ["repo path", "workspace path", "wrong repo"],
    "execution-platform-runtime-truth": [
      "runtime truth",
      "runtime substrate",
      "supabase",
      "pg-mem",
    ],
    "tailscale-safe-ui-bridge": ["tailscale", "safe ui bridge"],
    "deterministic-vs-model-judgment-guardrail": ["deterministic", "model judgment", "semantic"],
    "prohibited-semantic-drift-guardrail": ["semantic drift", "prohibited semantic"],
    "work-episode-outcome-pack-closeout": ["closeout", "outcome pack", "work episode"],
    "pause-redirect-cancel-control-bridge": ["pause", "redirect", "cancel", "control bridge"],
    "rebuild-and-container-recovery": ["rebuild", "container recovery"],
    "codex-bailout-protocol": ["bailout", "autobailout"],
    "validation-and-proof-policy": ["validation", "proof", "tests"],
    "artifact-and-stream-capture-policy": ["artifact", "stream", "oversight"],
  };
  return map[id] ?? [id.replaceAll("-", " ")];
}

function registryWithActivation(
  activation: Map<string, CodexBridgeSkillActivationState>,
): CodexBridgeSkillDocRegistryEntry[] {
  return REQUIRED_REGISTRY.map((entry) => ({
    ...entry,
    requiredBefore: [...entry.requiredBefore],
    triggerPhrases: [...entry.triggerPhrases],
    requiredContextRefs: [...entry.requiredContextRefs],
    expectedEvidence: [...entry.expectedEvidence],
    prohibitedActions: [...entry.prohibitedActions],
    currentActivationState: activation.get(entry.skillDocId) ?? entry.currentActivationState,
  }));
}

function hasAny(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

function unique(values: string[]): string[] {
  return [...new Set(values)].toSorted();
}

function boundSkillMetadata(value: JsonValue): JsonValue {
  return boundDiagnosticJson(value, {
    ...DEFAULT_DIAGNOSTIC_LIMITS,
    maxObjectKeys: 260,
    maxArrayItems: 180,
    maxDepth: 10,
    maxStringLength: 2_000,
  });
}

function jsonByteLength(value: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function assertJsonByteLength(value: JsonValue, maxBytes: number, name: string): void {
  if (jsonByteLength(value) > maxBytes) {
    throw new Error(`${name} exceeds ${maxBytes} bytes`);
  }
}

export function listRequiredCodexBridgeSkillDocs(): CodexBridgeSkillDocRegistryEntry[] {
  return registryWithActivation(new Map());
}

export function applyBridgeSafetySkillCoverage(
  registry: CodexBridgeSkillDocRegistryEntry[],
): CodexBridgeSkillDocRegistryEntry[] {
  const bridgeSafetyActive = registry.some(
    (entry) =>
      entry.skillDocId === "openclaw-bridge-safety" && entry.currentActivationState === "active",
  );
  if (!bridgeSafetyActive) {
    return registry;
  }
  return registry.map((entry) => {
    if (entry.category === "workspace_skill_doc" || entry.category === "workspace_role_doc") {
      return {
        ...entry,
        currentActivationState: "covered_by_active_bridge_safety",
      };
    }
    return entry;
  });
}

export async function discoverActiveLocalCodexSkills(
  input: { skillRoot?: string; readSkillFile?: (path: string) => Promise<string> } = {},
): Promise<ActiveLocalSkillDiscovery[]> {
  const skillRoot = input.skillRoot ?? DEFAULT_SKILL_ROOT;
  const readSkillFile = input.readSkillFile ?? ((filePath: string) => readFile(filePath, "utf8"));
  const workQueueSkillPath = path.join(skillRoot, "work-queue-ux-review", "SKILL.md");
  const bridgeSafetySkillPath = path.join(skillRoot, "openclaw-bridge-safety", "SKILL.md");
  const requiredGuidance = [
    {
      requirement: "global_outcome_pack_closeout_protocol",
      needles: ["global closeout protocol", "not as a model memory-only artifact"],
    },
    {
      requirement: "missing_closeout_process_gap",
      needles: ["missing outcome pack", "process gap"],
    },
    {
      requirement: "process_completion_distinct_from_task_success",
      needles: ["process completion", "task success"],
    },
    {
      requirement: "no_execution_ui_before_execution_exists",
      needles: ["no execution ui before execution exists"],
    },
  ];
  try {
    const text = (await readSkillFile(workQueueSkillPath)).toLowerCase();
    const guidance = requiredGuidance.map((requirement) => ({
      requirement: requirement.requirement,
      present: requirement.needles.every((needle) => text.includes(needle)),
    }));
    const workQueueDiscovery = {
      skillId: "work-queue-ux-review",
      path: workQueueSkillPath,
      exists: true,
      activationState: guidance.every((item) => item.present) ? "active" : "blocked",
      requiredGuidance: guidance,
      missingGuidance: guidance.filter((item) => !item.present).map((item) => item.requirement),
    } satisfies ActiveLocalSkillDiscovery;
    return [
      workQueueDiscovery,
      await discoverBridgeSafetySkill(bridgeSafetySkillPath, readSkillFile),
    ];
  } catch {
    return [
      {
        skillId: "work-queue-ux-review",
        path: workQueueSkillPath,
        exists: false,
        activationState: "missing",
        requiredGuidance: requiredGuidance.map((requirement) => ({
          requirement: requirement.requirement,
          present: false,
        })),
        missingGuidance: requiredGuidance.map((requirement) => requirement.requirement),
      },
      await discoverBridgeSafetySkill(bridgeSafetySkillPath, readSkillFile),
    ];
  }
}

async function discoverBridgeSafetySkill(
  bridgeSafetySkillPath: string,
  readSkillFile: (path: string) => Promise<string>,
): Promise<ActiveLocalSkillDiscovery> {
  const requiredGuidance = [
    {
      requirement: "runtime_truth_execution_platform_not_skill_text",
      needles: ["runtime truth is execution platform", "skill text is guidance"],
    },
    {
      requirement: "missing_closeout_pause_redirect_worthy",
      needles: ["missing closeout", "pause/redirect-worthy"],
    },
    {
      requirement: "process_completion_not_task_success",
      needles: ["process completion", "not task success"],
    },
    {
      requirement: "work_queue_does_not_own_execution",
      needles: ["work queue does not own execution"],
    },
    {
      requirement: "same_exact_session_unsupported",
      needles: ["same-exact-session operation is unsupported"],
    },
    {
      requirement: "no_live_authority_from_skill_metadata",
      needles: ["do not grant live authority from skill metadata"],
    },
  ];
  try {
    const text = (await readSkillFile(bridgeSafetySkillPath)).toLowerCase().replace(/\s+/g, " ");
    const guidance = requiredGuidance.map((requirement) => ({
      requirement: requirement.requirement,
      present: requirement.needles.every((needle) => text.includes(needle)),
    }));
    return {
      skillId: "openclaw-bridge-safety",
      path: bridgeSafetySkillPath,
      exists: true,
      activationState: guidance.every((item) => item.present) ? "active" : "blocked",
      requiredGuidance: guidance,
      missingGuidance: guidance.filter((item) => !item.present).map((item) => item.requirement),
    };
  } catch {
    return {
      skillId: "openclaw-bridge-safety",
      path: bridgeSafetySkillPath,
      exists: false,
      activationState: "missing",
      requiredGuidance: requiredGuidance.map((requirement) => ({
        requirement: requirement.requirement,
        present: false,
      })),
      missingGuidance: requiredGuidance.map((requirement) => requirement.requirement),
    };
  }
}

export async function discoverOpenClawClawHubSkill(
  input: {
    repoRoot?: string;
    codexSessionSkillIds?: string[];
    readSkillFile?: (path: string) => Promise<string>;
  } = {},
): Promise<OpenClawClawHubSkillDiscovery> {
  const repoRoot = input.repoRoot ?? "/root/services/openclaw-roles/live";
  const skillPath = path.join(repoRoot, "skills", "clawhub", "SKILL.md");
  const readSkillFile = input.readSkillFile ?? ((filePath: string) => readFile(filePath, "utf8"));
  try {
    const text = (await readSkillFile(skillPath)).toLowerCase();
    const searchGuidancePresent =
      text.includes("openclaw skills search") && text.includes("clawhub search");
    const quarantineGuidancePresent =
      text.includes("quarantine") && text.includes("--workdir") && text.includes("--no-input");
    const installWithoutReviewProhibited =
      text.includes("do not use `openclaw skills install` for first-pass review") ||
      text.includes("do not use openclaw skills install for first-pass review");
    return {
      skillId: "clawhub",
      path: skillPath,
      openClawRepoSkillInstalled: true,
      codexSessionSkillActive: (input.codexSessionSkillIds ?? []).includes("clawhub"),
      searchGuidancePresent,
      quarantineGuidancePresent,
      installWithoutReviewProhibited,
      activationStateForBridgeHarness:
        searchGuidancePresent && quarantineGuidancePresent && installWithoutReviewProhibited
          ? "available_as_openclaw_skill"
          : "blocked",
      notes: [
        "OpenClaw repo skill availability does not make it an active Codex-session skill.",
        "ClawHub comparison must remain search-only or quarantine-only unless separately approved.",
      ],
    };
  } catch {
    return {
      skillId: "clawhub",
      path: skillPath,
      openClawRepoSkillInstalled: false,
      codexSessionSkillActive: (input.codexSessionSkillIds ?? []).includes("clawhub"),
      searchGuidancePresent: false,
      quarantineGuidancePresent: false,
      installWithoutReviewProhibited: false,
      activationStateForBridgeHarness: "missing",
      notes: ["OpenClaw repo ClawHub skill was not found."],
    };
  }
}

export function evaluateCodexBridgeSkillTriggers(input: {
  triggerInput: CodexBridgeSkillTriggerInput;
  registry?: CodexBridgeSkillDocRegistryEntry[];
}): CodexBridgeSkillTriggerReport {
  const registry = input.registry ?? listRequiredCodexBridgeSkillDocs();
  const text = [
    input.triggerInput.userPrompt,
    input.triggerInput.repoPath,
    input.triggerInput.workspaceDocsPath,
    ...(input.triggerInput.bridgeEventKinds ?? []),
    ...(input.triggerInput.observedHazards ?? []),
    input.triggerInput.runtimeJobType,
    input.triggerInput.requestedOperationType,
    input.triggerInput.controlReasonCategory,
    input.triggerInput.closeoutGateState,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const triggered = new Set<string>();

  for (const entry of registry) {
    if (
      hasAny(
        text,
        entry.triggerPhrases.map((phrase) => phrase.toLowerCase()),
      )
    ) {
      triggered.add(entry.skillDocId);
    }
  }
  if (input.triggerInput.workQueueLinkPresent) {
    triggered.add("work-queue-ux-review");
    triggered.add("work-queue-lifecycle-semantics");
  }
  if (input.triggerInput.controlReasonCategory === "runtime_substrate_mismatch") {
    triggered.add("openclaw-bridge-safety");
    triggered.add("repo-boundary-and-path-awareness");
    triggered.add("execution-platform-runtime-truth");
  }
  if (input.triggerInput.controlReasonCategory === "wrong_repo_or_workspace") {
    triggered.add("openclaw-bridge-safety");
    triggered.add("repo-boundary-and-path-awareness");
  }
  if (
    input.triggerInput.controlReasonCategory === "missing_closeout_evidence" ||
    input.triggerInput.closeoutGateState === "missing" ||
    input.triggerInput.closeoutGateState === "blocked"
  ) {
    triggered.add("openclaw-bridge-safety");
    triggered.add("work-episode-outcome-pack-closeout");
    triggered.add("pause-redirect-cancel-control-bridge");
  }
  if (input.triggerInput.controlReasonCategory === "missing_safe_ui_bridge_context") {
    triggered.add("openclaw-bridge-safety");
    triggered.add("tailscale-safe-ui-bridge");
  }
  if (input.triggerInput.controlReasonCategory === "deterministic_vs_model_judgment_violation") {
    triggered.add("openclaw-bridge-safety");
    triggered.add("deterministic-vs-model-judgment-guardrail");
  }
  if (input.triggerInput.controlReasonCategory === "prohibited_semantic_drift") {
    triggered.add("openclaw-bridge-safety");
    triggered.add("prohibited-semantic-drift-guardrail");
  }
  if (input.triggerInput.controlReasonCategory === "unsafe_authority_request") {
    triggered.add("openclaw-bridge-safety");
  }
  if ((input.triggerInput.bridgeEventKinds ?? []).includes("rebuild_failed")) {
    triggered.add("openclaw-bridge-safety");
    triggered.add("rebuild-and-container-recovery");
    triggered.add("codex-bailout-protocol");
  }
  if ((input.triggerInput.userPrompt ?? "").toLowerCase().includes("work queue lifecycle")) {
    triggered.add("openclaw-bridge-safety");
    triggered.add("work-queue-lifecycle-semantics");
  }
  if (
    ["pause", "redirect", "cancel"].some((kind) =>
      (input.triggerInput.bridgeEventKinds ?? []).includes(`${kind}_requested`),
    )
  ) {
    triggered.add("openclaw-bridge-safety");
    triggered.add("pause-redirect-cancel-control-bridge");
  }
  if (input.triggerInput.requestedOperationType === "code_writing_bridge_pilot") {
    triggered.add("openclaw-bridge-safety");
    for (const id of [
      "orchestrator-role-contract",
      "implementer-role-contract",
      "tester-role-contract",
      "reviewer-role-contract",
      "validation-and-proof-policy",
      "artifact-and-stream-capture-policy",
      "repo-boundary-and-path-awareness",
      "execution-platform-runtime-truth",
      "work-episode-outcome-pack-closeout",
      "work-queue-lifecycle-semantics",
    ]) {
      triggered.add(id);
    }
  }

  const triggeredEntries = registry.filter((entry) => triggered.has(entry.skillDocId));
  const activeTriggeredIds = triggeredEntries
    .filter((entry) => entry.currentActivationState === "active")
    .map((entry) => entry.skillDocId);
  const draftOnlyTriggeredIds = triggeredEntries
    .filter((entry) => entry.currentActivationState === "draft_only")
    .map((entry) => entry.skillDocId);
  const coveredByBridgeSafetySkillDocIds = triggeredEntries
    .filter((entry) => entry.currentActivationState === "covered_by_active_bridge_safety")
    .map((entry) => entry.skillDocId);
  const missingRequiredSkillDocIds = triggeredEntries
    .filter(
      (entry) =>
        entry.currentActivationState === "missing" || entry.currentActivationState === "blocked",
    )
    .map((entry) => entry.skillDocId);
  const blockingReasons = missingRequiredSkillDocIds.map((id) => `skill_or_doc_missing:${id}`);
  const hasLiveBlockingDraft = draftOnlyTriggeredIds.length > 0;
  return {
    artifactKind: "codex_bridge_skill_trigger_report",
    triggeredSkillDocIds: unique([...triggered]),
    activeTriggeredIds: unique(activeTriggeredIds),
    draftOnlyTriggeredIds: unique(draftOnlyTriggeredIds),
    missingRequiredSkillDocIds: unique(missingRequiredSkillDocIds),
    coveredByBridgeSafetySkillDocIds: unique(coveredByBridgeSafetySkillDocIds),
    blockingReasons,
    readinessImpact: blockingReasons.length
      ? "blocks_requested_mode"
      : hasLiveBlockingDraft
        ? "blocks_live_execution"
        : activeTriggeredIds.length
          ? "fake_only_allowed"
          : "none",
    evidenceRefs: unique(triggeredEntries.flatMap((entry) => entry.requiredContextRefs)),
    noModelJudgmentUsed: true,
  };
}

export function produceCodexBridgeSkillReadinessReport(input: {
  requestedMode: CodexBridgeSkillExecutionMode;
  registry?: CodexBridgeSkillDocRegistryEntry[];
  triggerTestedSkillDocIds?: string[];
  observeOnlyAssumptionsSatisfied?: boolean;
  liveAuthorityRequested?: boolean;
}): CodexBridgeSkillReadinessReport {
  const registry = input.registry ?? listRequiredCodexBridgeSkillDocs();
  const required = registry.filter((entry) => entry.requiredBefore.includes(input.requestedMode));
  const activeSkillIds = required
    .filter((entry) => entry.currentActivationState === "active")
    .map((entry) => entry.skillDocId);
  const coveredByBridgeSafetySkillDocIds = required
    .filter((entry) => entry.currentActivationState === "covered_by_active_bridge_safety")
    .map((entry) => entry.skillDocId);
  const draftOnlySkillDocIds = required
    .filter((entry) => entry.currentActivationState === "draft_only")
    .map((entry) => entry.skillDocId);
  const missingSkillDocIds = required
    .filter(
      (entry) =>
        entry.currentActivationState === "missing" || entry.currentActivationState === "blocked",
    )
    .map((entry) => entry.skillDocId);
  const triggerTested = new Set(input.triggerTestedSkillDocIds ?? []);
  const blockingReasons: string[] = [];
  if (missingSkillDocIds.length > 0) {
    blockingReasons.push(...missingSkillDocIds.map((id) => `skill_or_doc_missing:${id}`));
  }
  if (
    input.requestedMode === "observe_only_smoke" &&
    input.observeOnlyAssumptionsSatisfied !== true
  ) {
    blockingReasons.push("observe_only_assumptions_required");
  }
  if (input.requestedMode === "fake_control_loop") {
    if (!activeSkillIds.includes("work-queue-ux-review")) {
      blockingReasons.push("active_work_queue_ux_review_required");
    }
    if (input.liveAuthorityRequested === true) {
      blockingReasons.push("fake_control_loop_requires_no_live_authority");
    }
  }
  const strictModes = new Set<CodexBridgeSkillExecutionMode>([
    "code_writing_bridge_pilot",
    "trusted_yolo_local",
    "rebuild",
    "autobailout",
  ]);
  if (strictModes.has(input.requestedMode)) {
    const notActive = required.filter(
      (entry) =>
        entry.currentActivationState !== "active" &&
        entry.currentActivationState !== "covered_by_active_bridge_safety",
    );
    blockingReasons.push(...notActive.map((entry) => `skill_not_active:${entry.skillDocId}`));
    const notTested = required.filter((entry) => !triggerTested.has(entry.skillDocId));
    blockingReasons.push(
      ...notTested.map((entry) => `skill_not_trigger_tested:${entry.skillDocId}`),
    );
  }
  if (input.requestedMode === "trusted_yolo_local") {
    blockingReasons.push("trusted_yolo_local_blocked_until_active_skill_trigger_rollout");
  }
  if (input.requestedMode === "rebuild") {
    blockingReasons.push("rebuild_blocked_until_rebuild_skill_trigger_rollout");
  }
  if (input.requestedMode === "autobailout") {
    blockingReasons.push("autobailout_blocked_until_bailout_skill_trigger_rollout");
  }
  const skillLayerReady = missingSkillDocIds.length === 0 && blockingReasons.length === 0;
  return {
    artifactKind: "codex_bridge_skill_readiness_report",
    requestedMode: input.requestedMode,
    allowed: blockingReasons.length === 0,
    blockingReasons: unique(blockingReasons),
    activeSkillIds: unique(activeSkillIds),
    draftOnlySkillDocIds: unique(draftOnlySkillDocIds),
    missingSkillDocIds: unique(missingSkillDocIds),
    coveredByBridgeSafetySkillDocIds: unique(coveredByBridgeSafetySkillDocIds),
    triggerTestedSkillDocIds: unique([...triggerTested]),
    skillLayerReady,
    codeWritingBridgePilotBlocked:
      input.requestedMode === "code_writing_bridge_pilot" ||
      strictModes.has("code_writing_bridge_pilot"),
    trustedYoloBlocked: true,
    rebuildBlocked: true,
    autobailoutBlocked: true,
    liveAuthorityGranted: false,
    noModelJudgmentUsed: true,
  };
}

export function produceFakeControlLoopReadiness(input: {
  controlBridgeReady: boolean;
  closeoutGateSatisfied: boolean;
  skillReadiness: CodexBridgeSkillReadinessReport;
}): CodexBridgeFakeControlLoopReadiness {
  const blockingReasons: string[] = [];
  if (!input.controlBridgeReady) {
    blockingReasons.push("control_bridge_not_ready");
  }
  if (!input.closeoutGateSatisfied) {
    blockingReasons.push("closeout_gate_not_satisfied");
  }
  if (!input.skillReadiness.allowed) {
    blockingReasons.push(...input.skillReadiness.blockingReasons);
  }
  return {
    artifactKind: "codex_bridge_fake_control_loop_readiness",
    allowed: blockingReasons.length === 0,
    blockingReasons: unique(blockingReasons),
    controlBridgeReady: input.controlBridgeReady,
    closeoutGateSatisfied: input.closeoutGateSatisfied,
    skillReadiness: input.skillReadiness,
    liveAuthorityGranted: false,
    codexCliInvoked: false,
    acpSessionStarted: false,
    providerCallMade: false,
    rebuildPerformed: false,
    schedulerStarted: false,
    daemonStarted: false,
    subagentStarted: false,
    workQueueLifecycleMutated: false,
  };
}

export class CodexBridgeSkillTriggerRepository {
  private readonly maxArtifactMetadataBytes: number;

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    options: CodexBridgeSkillTriggerOptions = {},
  ) {
    this.maxArtifactMetadataBytes =
      options.maxArtifactMetadataBytes ?? DEFAULT_MAX_SKILL_TRIGGER_METADATA_BYTES;
  }

  async persistSkillTriggerReport(input: {
    runtimeJobId: string;
    report: CodexBridgeSkillTriggerReport;
  }): Promise<RuntimeJobArtifact> {
    return this.recordReport(input.runtimeJobId, "codex_bridge.skill_trigger_report", input.report);
  }

  async persistSkillReadinessReport(input: {
    runtimeJobId: string;
    report: CodexBridgeSkillReadinessReport;
  }): Promise<RuntimeJobArtifact> {
    return this.recordReport(
      input.runtimeJobId,
      "codex_bridge.skill_readiness_report",
      input.report,
    );
  }

  private async recordReport(
    runtimeJobId: string,
    artifactType: string,
    report: JsonValue,
  ): Promise<RuntimeJobArtifact> {
    const bounded = boundSkillMetadata(report);
    assertJsonByteLength(bounded, this.maxArtifactMetadataBytes, "skill trigger metadata");
    const artifact = await this.runtimeJobs.attachArtifact({
      jobId: runtimeJobId,
      artifactType,
      storageKind: "metadata",
      uri: `runtime-job://${runtimeJobId}/codex-bridge/${artifactType}`,
      contentType: "application/json",
      sizeBytes: jsonByteLength(bounded),
      metadata: bounded,
    });
    await this.runtimeJobs.recordEvent({
      jobId: runtimeJobId,
      eventType: "codex_bridge.skill_trigger_checked",
      data: {
        artifactType,
        artifactId: artifact.artifactId,
        noModelJudgmentUsed: true,
      },
    });
    return artifact;
  }
}
