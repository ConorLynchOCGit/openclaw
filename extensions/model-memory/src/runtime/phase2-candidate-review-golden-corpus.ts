import { sha256JsonValue } from "../hashing.ts";
import type { GoldenCandidateReviewCase } from "./phase2-candidate-review-validation.ts";
import type {
  CandidateReviewProposal,
  ProactivityReviewEpisodePacket,
} from "./phase2-model-reviewed-candidate-discovery.ts";

function hash(value: unknown): string {
  return sha256JsonValue(value);
}

function episodeTurn(input: {
  role: "user" | "assistant";
  sourceRuntime: "openclaw" | "codex";
  ref: string;
  boundedText: string;
}): ProactivityReviewEpisodePacket["episodeTurns"][number] {
  return {
    role: input.role,
    sourceRuntime: input.sourceRuntime,
    ref: input.ref,
    boundedText: input.boundedText,
    hash: hash({ ref: input.ref, boundedText: input.boundedText }),
    excerptPolicy: {
      maxChars: input.role === "assistant" ? 12_000 : 8_000,
      redacted: false,
      rawTranscriptPersisted: false,
    },
  };
}

function packet(input: {
  caseId: string;
  turns: ProactivityReviewEpisodePacket["episodeTurns"];
  loadedSkills?: Array<{ name: string; description?: string; source: string }>;
  codexTouchedAreas?: string[];
  validationFailures?: ProactivityReviewEpisodePacket["codexActivitySummary"]["validationFailures"];
}): ProactivityReviewEpisodePacket {
  const sourceRuntimes = new Set(input.turns.map((turn) => turn.sourceRuntime));
  const runtime =
    sourceRuntimes.size > 1 ? "mixed" : sourceRuntimes.has("codex") ? "codex" : "openclaw";
  const assistantFinalCount = input.turns.filter((turn) => turn.role === "assistant").length;
  const openClawTurnCount = input.turns.filter((turn) => turn.sourceRuntime === "openclaw").length;
  const codexTurnCount = input.turns.filter((turn) => turn.sourceRuntime === "codex").length;
  const validationFailures = input.validationFailures ?? [];
  const touchedAreas = input.codexTouchedAreas ?? [];
  return {
    schemaVersion: "proactivity_review_episode.v2",
    reviewGoal: "find_few_high_value_candidates",
    sessionWindow: {
      runtime,
      sessionKey: `golden:${input.caseId}`,
      startRef: input.turns[0]?.ref ?? `golden://${input.caseId}/start`,
      endRef: input.turns.at(-1)?.ref ?? `golden://${input.caseId}/end`,
      turnCount: input.turns.length,
      timeWindowLabel: "golden-corpus bounded episode",
    },
    episodeTurns: input.turns,
    userIntentArc: {
      currentObjective:
        "Validate whether high-context candidate review recovers useful plans and skills.",
      recentConcerns: [],
      explicitAsks: input.turns
        .filter((turn) => turn.role === "user")
        .map((turn) => turn.boundedText.slice(0, 220)),
      decisionPressure: ["Before Milestone 4, separate packet misses from model misses."],
    },
    codexActivitySummary: {
      status: codexTurnCount > 0 ? "loaded" : "skipped",
      reasonCode: codexTurnCount > 0 ? undefined : "codex_not_in_fixture",
      sessionRefs: codexTurnCount > 0 ? [`codex://golden/${input.caseId}`] : [],
      commandSummaries:
        codexTurnCount > 0
          ? [
              {
                ref: `codex://golden/${input.caseId}/command/1`,
                commandFamily: "pnpm test:file",
                status: validationFailures.length > 0 ? "failed" : "passed",
                failureClass:
                  validationFailures.length > 0 ? "validation_or_command_failure" : undefined,
                boundedSummary:
                  validationFailures.length > 0
                    ? "Command pnpm test:file failed during candidate-review repair validation."
                    : "Command pnpm test:file passed for candidate-review validation changes.",
                hash: hash({ caseId: input.caseId, command: "pnpm test:file" }),
              },
            ]
          : [],
      validationFailures,
      touchedAreas,
      outcomeSummaries: input.turns
        .filter((turn) => turn.role === "assistant")
        .map((turn) => turn.boundedText.slice(0, 220)),
    },
    packetQuality: {
      status: assistantFinalCount > 0 && input.turns.length >= 3 ? "pass" : "degraded",
      reasonCodes:
        assistantFinalCount > 0 && input.turns.length >= 3 ? [] : ["golden_packet_too_thin"],
      contiguousWindowPresent: input.turns.length > 0,
      openClawTurnCount,
      codexTurnCount,
      duplicatedTurnCount: 0,
      genericCommandSummaryCount: 0,
      validationFailureSummaryCount: validationFailures.length,
      touchedAreaCount: touchedAreas.length,
      assistantFinalCount,
      rawFullTranscriptPersisted: false,
    },
    observedWorkPatterns: [
      {
        summary: "High-context review should find only high-leverage repeatable plans and skills.",
        recurrenceEvidence: [
          "The same architecture concern recurred across OpenClaw and Codex work.",
        ],
        frictionSignals: validationFailures.map((failure) => failure.boundedSummary),
        successSignals: input.turns
          .filter((turn) => turn.role === "assistant")
          .map((turn) => turn.boundedText.slice(0, 160)),
      },
    ],
    existingContext: {
      loadedSkills: input.loadedSkills ?? [],
      activeMilestone: "pre-Milestone-4 candidate review validation",
      activeDocsOrBranches: ["phase2-contiguous-candidate-packets-and-model-cards"],
      recentProactivityItems: [],
    },
    candidateLedgerContext: {
      recentCandidateIds: [],
      possibleDuplicateTitles: [],
      rejectedOrDemotedSummary: [],
    },
    reviewPolicy: {
      maxSurfaceCandidates: 3,
      preferNoCandidateOverWeakCandidate: true,
      requireRepeatabilityOrLargeAvoidedCost: true,
      rejectTinyCleanupCandidates: true,
      proposalOnly: true,
    },
    safetyEnvelope: {
      proposalOnly: true,
      noActionExecution: true,
      noSkillInstallOrPromotion: true,
      noCanonicalMemoryTruth: true,
      noRawToolLogs: true,
      rawFullTranscriptPersisted: false,
    },
  };
}

function proposal(
  input: Omit<CandidateReviewProposal, "schemaVersion" | "proposalId">,
): CandidateReviewProposal {
  return {
    schemaVersion: "candidate_review_proposal.v2",
    proposalId: hash(input).slice(0, 24),
    ...input,
  };
}

export function buildPhase2CandidateReviewGoldenCorpus(): GoldenCandidateReviewCase[] {
  return [
    {
      caseId: "route_and_packet_audit_episode",
      description:
        "Recent discussion where route isolation, packet context, and card quality failures are all high-leverage.",
      packet: packet({
        caseId: "route_and_packet_audit_episode",
        codexTouchedAreas: [
          "src/agents/openai-codex-chatgpt-backend.ts",
          "extensions/model-memory/src/runtime/phase2-model-reviewed-candidate-discovery.ts",
          "scripts/model-memory-phase2-local-high-context-candidate-review.mjs",
        ],
        turns: [
          episodeTurn({
            role: "user",
            sourceRuntime: "openclaw",
            ref: "chat://golden/user/route-concern",
            boundedText:
              "The default model for OpenClaw is GPT 5.4, memory capture uses gpt 5.4-mini with specific schema, and skill/proactive card review needs more reasoning. Do not break one route to fix another.",
          }),
          episodeTurn({
            role: "assistant",
            sourceRuntime: "openclaw",
            ref: "chat://golden/assistant/route-plan",
            boundedText:
              "We need explicit route isolation so chat, memory capture, memory retrieval, candidate review, and presentation briefs each report model id, reasoning level, schema family, and persistence boundary.",
          }),
          episodeTurn({
            role: "user",
            sourceRuntime: "openclaw",
            ref: "chat://golden/user/packet-concern",
            boundedText:
              "Candidate packets are still too deterministic. Include contiguous OpenClaw and Codex windows, not selected snippets, and validate whether the process misses legitimate candidates.",
          }),
          episodeTurn({
            role: "assistant",
            sourceRuntime: "codex",
            ref: "codex://golden/session/assistant/fix-summary",
            boundedText:
              "Implemented a local high-context candidate review script, repaired the OpenAI-Codex streaming JSON spacing bug, and confirmed no gateway rebuild is needed for function-level proof.",
          }),
        ],
      }),
      expectations: [
        {
          expectationId: "route-isolation-proactive-plan",
          proposalKind: "proactive_plan",
          requiredConcepts: ["route isolation", "model config", "persistence boundary"],
          minMatchedConcepts: 2,
          expectedDisposition: "surface",
        },
        {
          expectationId: "candidate-packet-review-validation",
          proposalKind: "new_skill_candidate",
          allowedProposalKinds: ["proactive_plan"],
          requiredConcepts: ["candidate review", "packet", "missed candidates"],
          minMatchedConcepts: 2,
          expectedDisposition: "surface",
        },
      ],
    },
    {
      caseId: "weak_tiny_cleanup_episode",
      description: "A weak one-off cleanup should not surface as a skill or proactive plan.",
      packet: packet({
        caseId: "weak_tiny_cleanup_episode",
        turns: [
          episodeTurn({
            role: "user",
            sourceRuntime: "openclaw",
            ref: "chat://golden/user/tiny",
            boundedText: "Rename that heading to make it a little shorter.",
          }),
          episodeTurn({
            role: "assistant",
            sourceRuntime: "openclaw",
            ref: "chat://golden/assistant/tiny",
            boundedText:
              "Updated the heading wording locally. There is no broader recurring workflow.",
          }),
          episodeTurn({
            role: "user",
            sourceRuntime: "openclaw",
            ref: "chat://golden/user/tiny-close",
            boundedText: "That is fine.",
          }),
        ],
      }),
      expectations: [],
      expectNoSurfaceCandidates: true,
    },
    {
      caseId: "existing_skill_enhancement_episode",
      description: "Explicit loaded skill metadata should allow enhancement classification.",
      packet: packet({
        caseId: "existing_skill_enhancement_episode",
        loadedSkills: [
          {
            name: "skill-vetter",
            description: "Security-first skill vetting for AI agents and third-party skills.",
            source: "codex-user",
          },
        ],
        turns: [
          episodeTurn({
            role: "user",
            sourceRuntime: "openclaw",
            ref: "chat://golden/user/vetter",
            boundedText:
              "The third-party ClawHub skill review keeps coming up. We already have skill-vetter, so this should probably enhance that path rather than create another skill.",
          }),
          episodeTurn({
            role: "assistant",
            sourceRuntime: "openclaw",
            ref: "chat://golden/assistant/vetter",
            boundedText:
              "A repeatable ClawHub quarantine and review workflow would extend skill-vetter with acceptance checks, destination authority checks, and rollback-safe review notes.",
          }),
          episodeTurn({
            role: "user",
            sourceRuntime: "openclaw",
            ref: "chat://golden/user/vetter-next",
            boundedText: "Make sure the candidate says improve skill-vetter, not new skill.",
          }),
        ],
      }),
      expectations: [
        {
          expectationId: "skill-vetter-enhancement",
          proposalKind: "existing_skill_enhancement",
          requiredConcepts: ["skill vetter", "ClawHub review", "quarantine"],
          minMatchedConcepts: 2,
          expectedDisposition: "surface",
        },
      ],
    },
    {
      caseId: "skill_dropoff_known_skill_shape_codex_episode",
      description:
        "A known skill-shaped release-gate workflow should survive candidate-review dropoff diagnostics with Codex evidence present.",
      packet: packet({
        caseId: "skill_dropoff_known_skill_shape_codex_episode",
        codexTouchedAreas: [
          "scripts/model-memory-phase2-live-gateway-ui-validation-proof.mjs",
          "src/infra/heartbeat-runner.ts",
          "ui/src/ui/views/chat.ts",
        ],
        validationFailures: [
          {
            ref: "codex://golden/skill-dropoff/validation/failure",
            lane: "live_gateway_ui_validation",
            boundedSummary:
              "Live gateway proof previously reported green while artifact review showed missing stage-level evidence for memory capture and card quality.",
            hash: hash({ caseId: "skill_dropoff_known_skill_shape_codex_episode", failure: 1 }),
          },
        ],
        turns: [
          episodeTurn({
            role: "user",
            sourceRuntime: "openclaw",
            ref: "chat://golden/user/artifact-audit-skill",
            boundedText:
              "We keep repeating proof artifact quality review before release. This should be a reusable QA gate with a trigger, inputs, checklist, output artifact, and quality criteria, not a vague review task.",
          }),
          episodeTurn({
            role: "assistant",
            sourceRuntime: "openclaw",
            ref: "chat://golden/assistant/artifact-audit-skill-shape",
            boundedText:
              "A skill-shaped workflow would trigger before live gateway release, take proof artifacts and bounded packets as inputs, check source-to-packet-to-model-to-admission stage evidence, verify card formatting and safety flags, and output a pass/fail artifact review report.",
          }),
          episodeTurn({
            role: "assistant",
            sourceRuntime: "codex",
            ref: "codex://golden/skill-dropoff/assistant/fix-summary",
            boundedText:
              "Codex repaired heartbeat fallback behavior, planned-card persistence, and candidate-review golden corpus coverage after repeated proof artifact quality issues.",
          }),
          episodeTurn({
            role: "user",
            sourceRuntime: "openclaw",
            ref: "chat://golden/user/artifact-audit-quality-gate",
            boundedText:
              "The skill should produce an artifact quality audit with acceptance gates: stage counts present, lost-stage diagnostics present, no raw logs persisted, card text is model-authored, and no action or install happened.",
          }),
        ],
      }),
      expectations: [
        {
          expectationId: "live-proof-artifact-quality-audit-skill",
          proposalKind: "new_skill_candidate",
          requiredConcepts: ["artifact quality", "audit", "stage evidence", "quality gate"],
          minMatchedConcepts: 3,
          expectedDisposition: "surface",
        },
      ],
    },
  ];
}

export function buildPassingGoldenCorpusProposalFixtures(): Record<
  string,
  CandidateReviewProposal[]
> {
  return {
    route_and_packet_audit_episode: [
      proposal({
        proposalKind: "proactive_plan",
        title: "Verify model route isolation",
        purpose:
          "Prove chat, memory capture, retrieval, candidate review, and presentation routes keep separate model configs and persistence boundaries.",
        recommendedNextStep:
          "Run a route matrix proof that records model id, reasoning effort, schema family, and persistence boundary.",
        expectedUserValue:
          "Prevents one model route change from breaking another route before Milestone 4.",
        leverageClass: "stability_risk",
        whyHighImpact:
          "Route confusion can break chat, memory, candidate review, and card rendering at once.",
        whyNotSmallCleanup: "This is a cross-route stability proof, not local wording cleanup.",
        suggestedSkillName: undefined,
        suggestedExistingSkillName: undefined,
        mergeTargetCandidateId: undefined,
        sourceRuntime: "mixed",
        evidenceRefs: ["chat://golden/user/route-concern", "chat://golden/assistant/route-plan"],
        evidenceHashes: [],
        recurrenceSignals: ["route isolation recurred across model-memory and card review work"],
        frictionSignals: ["user flagged risk of breaking one model pathway to fix another"],
        confidence: "high",
        riskTier: "low",
        shouldSurface: true,
        demotionReason: undefined,
      }),
      proposal({
        proposalKind: "new_skill_candidate",
        title: "Candidate review packet auditor",
        purpose:
          "Audit candidate review packets for contiguous context, provenance, Codex coverage, and safe persistence before surfacing skills or plans.",
        recommendedNextStep:
          "Draft the repeatable audit checklist covering packet quality, model output, validation suppression, and visible card source.",
        expectedUserValue:
          "Makes missed-candidate investigations repeatable instead of re-debugging the whole funnel each time.",
        leverageClass: "workflow_acceleration",
        whyHighImpact:
          "Packet quality controls whether the reviewer can recover high-value candidates at all.",
        whyNotSmallCleanup: "This is a reusable audit workflow across OpenClaw and Codex sessions.",
        suggestedSkillName: "candidate-review-packet-auditor",
        suggestedExistingSkillName: undefined,
        mergeTargetCandidateId: undefined,
        sourceRuntime: "mixed",
        evidenceRefs: [
          "chat://golden/user/packet-concern",
          "codex://golden/session/assistant/fix-summary",
        ],
        evidenceHashes: [],
        recurrenceSignals: ["packet starvation recurred across multiple repair passes"],
        frictionSignals: ["deterministic packet assembly hid model-relevant context"],
        confidence: "high",
        riskTier: "low",
        shouldSurface: true,
        demotionReason: undefined,
      }),
    ],
    weak_tiny_cleanup_episode: [],
    existing_skill_enhancement_episode: [
      proposal({
        proposalKind: "existing_skill_enhancement",
        title: "Improve skill-vetter with ClawHub quarantine review",
        purpose:
          "Add a repeatable ClawHub quarantine and review workflow to the existing skill-vetter path.",
        recommendedNextStep:
          "Draft the enhancement checklist with acceptance checks, destination authority checks, and rollback notes.",
        expectedUserValue:
          "Keeps third-party skill review in the existing vetted workflow instead of creating duplicate skills.",
        leverageClass: "large_repeated_cost",
        whyHighImpact: "Third-party skill vetting is recurring and security-sensitive.",
        whyNotSmallCleanup:
          "This extends an existing safety skill with a reusable review workflow.",
        suggestedSkillName: undefined,
        suggestedExistingSkillName: "skill-vetter",
        mergeTargetCandidateId: undefined,
        sourceRuntime: "openclaw",
        evidenceRefs: ["chat://golden/user/vetter", "chat://golden/assistant/vetter"],
        evidenceHashes: [],
        recurrenceSignals: ["ClawHub and third-party skill review keeps recurring"],
        frictionSignals: ["risk of creating duplicate skills instead of enhancing skill-vetter"],
        confidence: "high",
        riskTier: "low",
        shouldSurface: true,
        demotionReason: undefined,
      }),
    ],
    skill_dropoff_known_skill_shape_codex_episode: [
      proposal({
        proposalKind: "new_skill_candidate",
        title: "Live Proof Artifact Quality Audit",
        purpose:
          "Run a reusable QA gate over live proof artifacts before release so green checks cannot hide missing stage evidence or poor card quality.",
        recommendedNextStep:
          "Draft the SKILL.md checklist covering trigger, input artifacts, stage-count review, card-quality checks, safety flags, and pass/fail report output.",
        expectedUserValue:
          "Reduces repeated release debugging by making proof artifact quality review consistent across future live gateway and memory validation passes.",
        leverageClass: "workflow_acceleration",
        whyHighImpact:
          "The same proof artifact quality gap has caused repeated false-green or under-instrumented release decisions.",
        whyNotSmallCleanup:
          "It has a clear trigger, repeatable inputs, checklist, output artifact, and validation gate.",
        suggestedSkillName: "live-proof-artifact-quality-audit",
        suggestedExistingSkillName: undefined,
        mergeTargetCandidateId: undefined,
        sourceRuntime: "mixed",
        evidenceRefs: [
          "chat://golden/user/artifact-audit-skill",
          "chat://golden/assistant/artifact-audit-skill-shape",
          "codex://golden/skill-dropoff/assistant/fix-summary",
          "chat://golden/user/artifact-audit-quality-gate",
        ],
        evidenceHashes: [],
        recurrenceSignals: [
          "proof artifact quality review recurred across OpenClaw and Codex validation passes",
        ],
        frictionSignals: [
          "missing stage-level evidence can make live proof runs look greener than they are",
        ],
        confidence: "high",
        riskTier: "low",
        shouldSurface: true,
        demotionReason: undefined,
      }),
    ],
  };
}
