import type {
  SessionSourceResolutionCoverageRequirement,
  SessionSourceResolutionCoverageState,
  SessionSourceResolutionDomain,
  SessionSourceResolutionEscalationReason,
  SessionSourceResolutionQuestionKind,
  SessionSourceResolutionReport,
  SessionSourceResolutionSourceCandidate,
} from "../config/sessions/types.js";

type SourceResolutionDomainEntry = {
  id: Exclude<SessionSourceResolutionDomain, "none">;
  patterns: RegExp[];
  workspaceEntrypoints: string[];
  canonicalEntrypoints: string[];
  requiresCanonicalVerification: boolean;
};

const CONTINUITY_PATTERNS = [
  /\b(?:what did we decide|what (?:were|was) we doing|what happened (?:today|yesterday)|remember|todo|todos|follow-?through|status of our work|prior work|recent context|yesterday|today)\b/i,
  /\b(?:workspace memory|daily memory|continuity|project context)\b/i,
];

const EXPLICIT_MOUNTED_PATTERNS = [
  /\b(?:mounted [\w\s/-]+ files?|mounted (?:repo|project|memory) files?|read the mounted files|imported project files?|curated import|imports\/|source[- ]of[- ]truth|repo-canonical)\b/i,
];

const SOURCE_RESOLUTION_DOMAINS: readonly SourceResolutionDomainEntry[] = [
  {
    id: "memory_system",
    patterns: [
      /\b(?:canonical memory classes?|memory-system|capture\/recall|retrieval\/capture|memory roadmap|memory architecture|memory spec)\b/i,
    ],
    workspaceEntrypoints: ["projects/memory/INDEX.md", "memory/INDEX.md"],
    canonicalEntrypoints: [
      "imports/engineering_repo/INDEX.md",
      "imports/engineering_repo/content/docs/memory-system/README.md",
      "imports/engineering_repo/content/docs/memory-system/STATUS.md",
    ],
    requiresCanonicalVerification: true,
  },
  {
    id: "plugin_sdk",
    patterns: [
      /\b(?:plugin sdk|openclaw\/plugin-sdk|public seam|public surface|plugin contract|channel plugin|provider plugin|plugin manifest)\b/i,
    ],
    workspaceEntrypoints: ["projects/maintenance/INDEX.md"],
    canonicalEntrypoints: [
      "imports/engineering_repo/content/docs/plugins/sdk-overview.md",
      "imports/engineering_repo/content/docs/plugins/architecture.md",
      "imports/engineering_repo/content/src/plugin-sdk/",
    ],
    requiresCanonicalVerification: true,
  },
  {
    id: "gateway_protocol",
    patterns: [
      /\b(?:gateway protocol|bridge protocol|wire protocol|protocol contract|gateway schema)\b/i,
    ],
    workspaceEntrypoints: ["projects/maintenance/INDEX.md"],
    canonicalEntrypoints: [
      "imports/engineering_repo/content/docs/gateway/protocol.md",
      "imports/engineering_repo/content/src/gateway/protocol/",
    ],
    requiresCanonicalVerification: true,
  },
];

function hasPatternMatch(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function resolveSourceResolutionDomain(text: string): SourceResolutionDomainEntry | undefined {
  return SOURCE_RESOLUTION_DOMAINS.find((entry) => hasPatternMatch(text, entry.patterns));
}

function dedupeSources(
  values: readonly SessionSourceResolutionSourceCandidate[],
): SessionSourceResolutionSourceCandidate[] {
  return Array.from(new Set(values));
}

function dedupeReasons(
  values: readonly SessionSourceResolutionEscalationReason[],
): SessionSourceResolutionEscalationReason[] {
  return Array.from(new Set(values));
}

function resolveQuestionKind(params: {
  text: string;
  hasContinuitySignals: boolean;
  hasMountedSignals: boolean;
  domain?: SourceResolutionDomainEntry;
}): SessionSourceResolutionQuestionKind {
  if (!params.text.trim()) {
    return "unclassified";
  }
  if (params.domain && params.hasContinuitySignals) {
    return "mixed";
  }
  if (params.domain || params.hasMountedSignals) {
    return "implementation";
  }
  if (params.hasContinuitySignals) {
    return "continuity";
  }
  return "unclassified";
}

export function resolveSourceResolutionReport(params: {
  text: string;
  bootstrapTruncated?: boolean;
  workspaceContextMissing?: boolean;
}): SessionSourceResolutionReport {
  const text = params.text.trim();
  const domain = resolveSourceResolutionDomain(text);
  const hasContinuitySignals = hasPatternMatch(text, CONTINUITY_PATTERNS);
  const hasMountedSignals = hasPatternMatch(text, EXPLICIT_MOUNTED_PATTERNS);
  const questionKind = resolveQuestionKind({
    text,
    hasContinuitySignals,
    hasMountedSignals,
    domain,
  });

  const escalationReasons: SessionSourceResolutionEscalationReason[] = [];
  if (hasMountedSignals) {
    escalationReasons.push("explicit_mounted_request");
  }
  if (domain) {
    escalationReasons.push("repo_coupled_domain");
  }
  if (params.bootstrapTruncated) {
    escalationReasons.push("bootstrap_truncated");
  }
  if (params.workspaceContextMissing) {
    escalationReasons.push("workspace_context_missing");
  }

  if (questionKind === "continuity") {
    return {
      questionKind,
      domain: "none",
      candidates: ["workspace_continuity", "workspace_project"],
      authoritativeSource: "workspace_continuity",
      supportingSources: ["workspace_project"],
      workspaceEntrypoints: ["MEMORY.md", "memory/YYYY-MM-DD*.md", "projects/INDEX.md"],
      canonicalEntrypoints: [],
      coverageRequirement: "not_required",
      coverageState: "not_required",
      escalationReasons: dedupeReasons(escalationReasons),
    };
  }

  if (questionKind === "implementation" || questionKind === "mixed") {
    const canonicalEntrypoints = domain?.canonicalEntrypoints ?? [
      "imports/engineering_repo/INDEX.md",
    ];
    const workspaceEntrypoints = domain?.workspaceEntrypoints ?? ["projects/INDEX.md"];
    const coverageRequirement: SessionSourceResolutionCoverageRequirement =
      domain?.requiresCanonicalVerification === false
        ? "not_required"
        : "verify_before_exact_answer";
    const coverageState: SessionSourceResolutionCoverageState =
      coverageRequirement === "not_required" ? "not_required" : "unread";
    return {
      questionKind,
      domain: domain?.id ?? "none",
      candidates: dedupeSources([
        "workspace_continuity",
        "workspace_project",
        "mounted_curated_import",
        "repo_canonical_doc",
      ]),
      authoritativeSource: "repo_canonical_doc",
      supportingSources:
        questionKind === "mixed"
          ? ["mounted_curated_import", "workspace_project", "workspace_continuity"]
          : ["mounted_curated_import"],
      workspaceEntrypoints,
      canonicalEntrypoints,
      coverageRequirement,
      coverageState,
      escalationReasons: dedupeReasons(escalationReasons),
    };
  }

  return {
    questionKind: "unclassified",
    domain: "none",
    candidates: ["workspace_continuity", "workspace_project"],
    authoritativeSource: "workspace_project",
    supportingSources: ["workspace_continuity"],
    workspaceEntrypoints: ["projects/INDEX.md", "MEMORY.md"],
    canonicalEntrypoints: [],
    coverageRequirement: "not_required",
    coverageState: "not_required",
    escalationReasons: dedupeReasons(escalationReasons),
  };
}

export function resolveCoverageGatedAnswerPolicy(params: {
  sourceResolution: Pick<
    SessionSourceResolutionReport,
    "coverageRequirement" | "coverageState" | "authoritativeSource"
  >;
}): {
  exactAnswerAllowed: boolean;
  mustContinueReading: boolean;
  mustDiscloseIncompleteCoverage: boolean;
} {
  const { sourceResolution } = params;
  if (
    sourceResolution.authoritativeSource !== "repo_canonical_doc" ||
    sourceResolution.coverageRequirement === "not_required" ||
    sourceResolution.coverageState === "not_required"
  ) {
    return {
      exactAnswerAllowed: true,
      mustContinueReading: false,
      mustDiscloseIncompleteCoverage: false,
    };
  }
  if (sourceResolution.coverageState === "verified") {
    return {
      exactAnswerAllowed: true,
      mustContinueReading: false,
      mustDiscloseIncompleteCoverage: false,
    };
  }
  return {
    exactAnswerAllowed: false,
    mustContinueReading: true,
    mustDiscloseIncompleteCoverage: true,
  };
}
