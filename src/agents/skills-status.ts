import path from "node:path";
import {
  loadSessionStore,
  resolveAgentMainSessionKey,
  resolveSessionStoreEntry,
  resolveStorePath,
  type SessionSkillSnapshot,
} from "../config/sessions.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { evaluateEntryRequirementsForCurrentPlatform } from "../shared/entry-status.js";
import type { RequirementConfigCheck, Requirements } from "../shared/requirements.js";
import { CONFIG_DIR } from "../utils.js";
import { resolveSkillTrustTierFromOrigin, type SkillTrustTier } from "./skills-vetting.js";
import {
  hasBinary,
  isBundledSkillAllowed,
  isConfigPathTruthy,
  isSkillVisibleInModelCatalog,
  loadWorkspaceSkillEntries,
  resolveBundledAllowlist,
  resolveSkillConfig,
  resolveSkillsInstallPreferences,
  resolveSkillTrustGate,
  type SkillEntry,
  type SkillEligibilityContext,
  type SkillInstallSpec,
  type SkillsInstallPreferences,
} from "./skills.js";
import { resolveBundledSkillsContext } from "./skills/bundled-context.js";
import { getSkillsSnapshotVersion, shouldRefreshSnapshotForVersion } from "./skills/refresh.js";
import { resolveSkillSource } from "./skills/source.js";

export type SkillStatusConfigCheck = RequirementConfigCheck;

export type SkillInstallOption = {
  id: string;
  kind: SkillInstallSpec["kind"];
  label: string;
  bins: string[];
};

export type SkillAvailabilityState =
  | "loaded"
  | "activatable"
  | "needs_setup"
  | "blocked_disabled"
  | "blocked_allowlist"
  | "blocked_permissions"
  | "blocked_trust_vetting";

export type SkillStatusEntry = {
  name: string;
  description: string;
  source: string;
  bundled: boolean;
  filePath: string;
  baseDir: string;
  skillKey: string;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  always: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  blockedByPermissions: boolean;
  blockedByTrustVetting: boolean;
  trustTier: SkillTrustTier;
  activatable: boolean;
  eligible: boolean;
  modelVisible: boolean;
  loadedInCurrentSession: boolean | null;
  newSessionRequired: boolean | null;
  availabilityState: SkillAvailabilityState;
  availabilityReason?: string;
  requirements: Requirements;
  missing: Requirements;
  configChecks: SkillStatusConfigCheck[];
  install: SkillInstallOption[];
};

export type SkillLoadedSnapshotStatus = {
  sessionKey?: string;
  sessionId?: string;
  updatedAt?: number;
  skillsSnapshot?: SessionSkillSnapshot;
  currentSnapshotVersion?: number;
  unavailableReason?: string;
};

export type SkillStatusReport = {
  workspaceDir: string;
  managedSkillsDir: string;
  configuredSkillDirs: Array<{ kind: string; path: string }>;
  discoveredSkillNames: string[];
  activatableSkillNames: string[];
  modelVisibleSkillNames: string[];
  loadedSkillNames: string[] | null;
  loadedState: "not_available" | "available";
  loadedStateReason?: string;
  loadedSessionKey?: string;
  loadedSessionId?: string;
  loadedSnapshotVersion?: number;
  currentSnapshotVersion?: number;
  hotReloadState: "current" | "stale" | "unknown" | "not_available";
  lastSnapshotPersistedAt?: number;
  skills: SkillStatusEntry[];
};

function resolveSkillKey(entry: SkillEntry): string {
  return entry.metadata?.skillKey ?? entry.skill.name;
}

function selectPreferredInstallSpec(
  install: SkillInstallSpec[],
  prefs: SkillsInstallPreferences,
): { spec: SkillInstallSpec; index: number } | undefined {
  if (install.length === 0) {
    return undefined;
  }

  const indexed = install.map((spec, index) => ({ spec, index }));
  const findKind = (kind: SkillInstallSpec["kind"]) =>
    indexed.find((item) => item.spec.kind === kind);

  const brewSpec = findKind("brew");
  const nodeSpec = findKind("node");
  const goSpec = findKind("go");
  const uvSpec = findKind("uv");
  const downloadSpec = findKind("download");
  const brewAvailable = hasBinary("brew");

  // Table-driven preference chain; first match wins.
  const pickers: Array<() => { spec: SkillInstallSpec; index: number } | undefined> = [
    () => (prefs.preferBrew && brewAvailable ? brewSpec : undefined),
    () => uvSpec,
    () => nodeSpec,
    // Only prefer brew when available to avoid guaranteed failure on Linux/Docker.
    () => (brewAvailable ? brewSpec : undefined),
    () => goSpec,
    // Prefer download over an unavailable brew spec.
    () => downloadSpec,
    // Last resort: surface descriptive brew-missing error instead of "no installer found".
    () => brewSpec,
    () => indexed[0],
  ];

  for (const pick of pickers) {
    const selected = pick();
    if (selected) {
      return selected;
    }
  }

  return undefined;
}

function normalizeInstallOptions(
  entry: SkillEntry,
  prefs: SkillsInstallPreferences,
): SkillInstallOption[] {
  // If the skill is explicitly OS-scoped, don't surface install actions on unsupported platforms.
  // (Installers run locally; remote OS eligibility is handled separately.)
  const requiredOs = entry.metadata?.os ?? [];
  if (requiredOs.length > 0 && !requiredOs.includes(process.platform)) {
    return [];
  }

  const install = entry.metadata?.install ?? [];
  if (install.length === 0) {
    return [];
  }

  const platform = process.platform;
  const filtered = install.filter((spec) => {
    const osList = spec.os ?? [];
    return osList.length === 0 || osList.includes(platform);
  });
  if (filtered.length === 0) {
    return [];
  }

  const toOption = (spec: SkillInstallSpec, index: number): SkillInstallOption => {
    const id = (spec.id ?? `${spec.kind}-${index}`).trim();
    const bins = spec.bins ?? [];
    let label = (spec.label ?? "").trim();
    if (spec.kind === "node" && spec.package) {
      label = `Install ${spec.package} (${prefs.nodeManager})`;
    }
    if (!label) {
      if (spec.kind === "brew" && spec.formula) {
        label = `Install ${spec.formula} (brew)`;
      } else if (spec.kind === "node" && spec.package) {
        label = `Install ${spec.package} (${prefs.nodeManager})`;
      } else if (spec.kind === "go" && spec.module) {
        label = `Install ${spec.module} (go)`;
      } else if (spec.kind === "uv" && spec.package) {
        label = `Install ${spec.package} (uv)`;
      } else if (spec.kind === "download" && spec.url) {
        const url = spec.url.trim();
        const last = url.split("/").pop();
        label = `Download ${last && last.length > 0 ? last : url}`;
      } else {
        label = "Run installer";
      }
    }
    return { id, kind: spec.kind, label, bins };
  };

  const allDownloads = filtered.every((spec) => spec.kind === "download");
  if (allDownloads) {
    return filtered.map((spec, index) => toOption(spec, index));
  }

  const preferred = selectPreferredInstallSpec(filtered, prefs);
  if (!preferred) {
    return [];
  }
  return [toOption(preferred.spec, preferred.index)];
}

type RawSkillStatusEntry = Omit<SkillStatusEntry, "loadedInCurrentSession" | "newSessionRequired">;

function formatMissingRequirementSummary(missing: Requirements): string {
  const parts: string[] = [];
  if (missing.bins.length > 0) {
    parts.push(`missing binaries: ${missing.bins.join(", ")}`);
  }
  if (missing.anyBins.length > 0) {
    parts.push(`missing any-of binaries: ${missing.anyBins.join(", ")}`);
  }
  if (missing.env.length > 0) {
    parts.push(`missing env: ${missing.env.join(", ")}`);
  }
  if (missing.config.length > 0) {
    parts.push(`missing config: ${missing.config.join(", ")}`);
  }
  if (missing.os.length > 0) {
    parts.push(`unsupported os: ${missing.os.join(", ")}`);
  }
  return parts.join("; ");
}

function finalizeSkillStatus(params: {
  skill: RawSkillStatusEntry;
  loadedSkillNames: readonly string[] | null;
  loadedState: SkillStatusReport["loadedState"];
  hotReloadState: SkillStatusReport["hotReloadState"];
}): SkillStatusEntry {
  const loadedInCurrentSession =
    params.loadedState === "available"
      ? (params.loadedSkillNames ?? []).includes(params.skill.name)
      : null;

  const newSessionRequired =
    params.loadedState === "available"
      ? !loadedInCurrentSession && params.skill.activatable && params.hotReloadState === "current"
      : null;

  if (params.skill.disabled) {
    return {
      ...params.skill,
      loadedInCurrentSession,
      newSessionRequired,
      availabilityState: "blocked_disabled",
      availabilityReason: "skill is disabled in config",
    };
  }

  if (params.skill.blockedByAllowlist) {
    return {
      ...params.skill,
      loadedInCurrentSession,
      newSessionRequired,
      availabilityState: "blocked_allowlist",
      availabilityReason: "bundled skill is not allowed by the current allowlist",
    };
  }

  if (params.skill.blockedByTrustVetting) {
    return {
      ...params.skill,
      loadedInCurrentSession,
      newSessionRequired,
      availabilityState: "blocked_trust_vetting",
      availabilityReason: params.skill.availabilityReason,
    };
  }

  if (params.skill.blockedByPermissions) {
    return {
      ...params.skill,
      loadedInCurrentSession,
      newSessionRequired,
      availabilityState: "blocked_permissions",
      availabilityReason: params.skill.availabilityReason,
    };
  }

  if (!params.skill.activatable) {
    return {
      ...params.skill,
      loadedInCurrentSession,
      newSessionRequired,
      availabilityState: "needs_setup",
      availabilityReason: params.skill.availabilityReason,
    };
  }

  return {
    ...params.skill,
    loadedInCurrentSession,
    newSessionRequired,
    availabilityState: loadedInCurrentSession ? "loaded" : "activatable",
    availabilityReason:
      loadedInCurrentSession === true
        ? "skill is loaded in the persisted warm-session snapshot"
        : params.loadedState !== "available"
          ? "skill is activatable on disk; current-session loaded state is unavailable until a warm-session snapshot exists"
          : newSessionRequired
            ? "skill is activatable on disk but missing from the current session snapshot; start a new session to load it"
            : params.hotReloadState === "stale"
              ? "skill is activatable on disk and the current session snapshot is stale; the next run will refresh it"
              : "skill is activatable on disk",
  };
}

function buildSkillStatus(
  entry: SkillEntry,
  config?: OpenClawConfig,
  prefs?: SkillsInstallPreferences,
  eligibility?: SkillEligibilityContext,
  bundledNames?: Set<string>,
): RawSkillStatusEntry {
  const skillKey = resolveSkillKey(entry);
  const skillConfig = resolveSkillConfig(config, skillKey);
  const disabled = skillConfig?.enabled === false;
  const allowBundled = resolveBundledAllowlist(config);
  const blockedByAllowlist = !isBundledSkillAllowed(entry, allowBundled);
  const trustGate = resolveSkillTrustGate(entry);
  const always = entry.metadata?.always === true;
  const isEnvSatisfied = (envName: string) =>
    Boolean(
      process.env[envName] ||
      skillConfig?.env?.[envName] ||
      (skillConfig?.apiKey && entry.metadata?.primaryEnv === envName),
    );
  const isConfigSatisfied = (pathStr: string) => isConfigPathTruthy(config, pathStr);
  const skillSource = resolveSkillSource(entry.skill);
  const bundled =
    skillSource === "openclaw-bundled" ||
    (skillSource === "unknown" && bundledNames?.has(entry.skill.name) === true);

  const { emoji, homepage, required, missing, requirementsSatisfied, configChecks } =
    evaluateEntryRequirementsForCurrentPlatform({
      always,
      entry,
      hasLocalBin: hasBinary,
      remote: eligibility?.remote,
      isEnvSatisfied,
      isConfigSatisfied,
    });
  const blockedByPermissions = false;
  const activatable =
    !disabled &&
    !blockedByAllowlist &&
    !blockedByPermissions &&
    !trustGate.blockedByTrustVetting &&
    requirementsSatisfied;
  const modelVisible = activatable && isSkillVisibleInModelCatalog(entry);

  return {
    name: entry.skill.name,
    description: entry.skill.description,
    source: skillSource,
    bundled,
    filePath: entry.skill.filePath,
    baseDir: entry.skill.baseDir,
    skillKey,
    primaryEnv: entry.metadata?.primaryEnv,
    emoji,
    homepage,
    always,
    disabled,
    blockedByAllowlist,
    blockedByPermissions,
    blockedByTrustVetting: trustGate.blockedByTrustVetting,
    trustTier: resolveSkillTrustTierFromOrigin({
      source: skillSource,
      baseDir: entry.skill.baseDir,
    }),
    activatable,
    eligible: activatable,
    modelVisible,
    availabilityState: activatable ? "activatable" : "needs_setup",
    availabilityReason:
      trustGate.trustReason ??
      (blockedByPermissions
        ? "skill is blocked by permissions"
        : activatable
          ? "skill is activatable on disk"
          : formatMissingRequirementSummary(missing) || "skill is not activatable yet"),
    requirements: required,
    missing,
    configChecks,
    install: normalizeInstallOptions(entry, prefs ?? resolveSkillsInstallPreferences(config)),
  };
}

function loadedSkillNamesFromSnapshot(snapshot: SessionSkillSnapshot): string[] {
  const resolvedNames =
    snapshot.resolvedSkills
      ?.map((skill) => skill.name)
      .filter((name): name is string => typeof name === "string" && name.trim().length > 0) ?? [];
  const promptNames = snapshot.skills
    .map((skill) => skill.name)
    .filter((name): name is string => typeof name === "string" && name.trim().length > 0);
  return [...new Set([...resolvedNames, ...promptNames])].toSorted();
}

export function resolveAgentLoadedSkillSnapshotStatus(params: {
  config: OpenClawConfig;
  agentId: string;
  workspaceDir: string;
}): SkillLoadedSnapshotStatus {
  const currentSnapshotVersion = getSkillsSnapshotVersion(params.workspaceDir);
  const sessionKey = resolveAgentMainSessionKey({
    cfg: params.config,
    agentId: params.agentId,
  });
  const storePath = resolveStorePath(params.config.session?.store, { agentId: params.agentId });
  try {
    const store = loadSessionStore(storePath);
    const resolved = resolveSessionStoreEntry({ store, sessionKey });
    const entry = resolved.existing;
    if (!entry) {
      return {
        sessionKey: resolved.normalizedKey,
        currentSnapshotVersion,
        unavailableReason: "no persisted main-session entry was found for this agent",
      };
    }
    return {
      sessionKey: resolved.normalizedKey,
      sessionId: entry.sessionId,
      updatedAt: entry.updatedAt,
      skillsSnapshot: entry.skillsSnapshot,
      currentSnapshotVersion,
      unavailableReason: entry.skillsSnapshot
        ? undefined
        : "persisted session exists but has no skills snapshot yet",
    };
  } catch (error) {
    return {
      sessionKey,
      currentSnapshotVersion,
      unavailableReason: `session store unavailable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function buildLoadedState(
  loadedSession?: SkillLoadedSnapshotStatus,
): Pick<
  SkillStatusReport,
  | "loadedSkillNames"
  | "loadedState"
  | "loadedStateReason"
  | "loadedSessionKey"
  | "loadedSessionId"
  | "loadedSnapshotVersion"
  | "currentSnapshotVersion"
  | "hotReloadState"
  | "lastSnapshotPersistedAt"
> {
  if (!loadedSession) {
    return {
      loadedSkillNames: null,
      loadedState: "not_available",
      loadedStateReason:
        "This diagnostic can prove installed/discovered skills; pass a persisted session snapshot to prove warm-session loaded state.",
      hotReloadState: "not_available",
    };
  }
  if (!loadedSession.skillsSnapshot) {
    return {
      loadedSkillNames: null,
      loadedState: "not_available",
      loadedStateReason: loadedSession.unavailableReason ?? "warm-session skills snapshot missing",
      loadedSessionKey: loadedSession.sessionKey,
      loadedSessionId: loadedSession.sessionId,
      currentSnapshotVersion: loadedSession.currentSnapshotVersion,
      hotReloadState: "not_available",
      lastSnapshotPersistedAt: loadedSession.updatedAt,
    };
  }

  const snapshotVersion = loadedSession.skillsSnapshot.version;
  const stale = shouldRefreshSnapshotForVersion(
    snapshotVersion,
    loadedSession.currentSnapshotVersion,
  );
  return {
    loadedSkillNames: loadedSkillNamesFromSnapshot(loadedSession.skillsSnapshot),
    loadedState: "available",
    loadedStateReason: stale
      ? "persisted warm-session skills snapshot is stale and will refresh on the next run"
      : "persisted warm-session skills snapshot is current",
    loadedSessionKey: loadedSession.sessionKey,
    loadedSessionId: loadedSession.sessionId,
    loadedSnapshotVersion: snapshotVersion,
    currentSnapshotVersion: loadedSession.currentSnapshotVersion,
    hotReloadState: stale ? "stale" : "current",
    lastSnapshotPersistedAt: loadedSession.updatedAt,
  };
}

export function buildWorkspaceSkillStatus(
  workspaceDir: string,
  opts?: {
    config?: OpenClawConfig;
    managedSkillsDir?: string;
    entries?: SkillEntry[];
    eligibility?: SkillEligibilityContext;
    loadedSession?: SkillLoadedSnapshotStatus;
  },
): SkillStatusReport {
  const managedSkillsDir = opts?.managedSkillsDir ?? path.join(CONFIG_DIR, "skills");
  const bundledContext = resolveBundledSkillsContext();
  const skillEntries =
    opts?.entries ??
    loadWorkspaceSkillEntries(workspaceDir, {
      config: opts?.config,
      managedSkillsDir,
      bundledSkillsDir: bundledContext.dir,
    });
  const prefs = resolveSkillsInstallPreferences(opts?.config);
  const configuredSkillDirs: SkillStatusReport["configuredSkillDirs"] = [
    { kind: "workspace", path: path.join(workspaceDir, "skills") },
    { kind: "workspace_agents", path: path.join(workspaceDir, ".agents", "skills") },
    { kind: "managed", path: managedSkillsDir },
  ];
  if (bundledContext.dir) {
    configuredSkillDirs.push({ kind: "bundled", path: bundledContext.dir });
  }
  const loadedState = buildLoadedState(opts?.loadedSession);
  const skillStatuses = skillEntries
    .map((entry) =>
      buildSkillStatus(entry, opts?.config, prefs, opts?.eligibility, bundledContext.names),
    )
    .map((skill) =>
      finalizeSkillStatus({
        skill,
        loadedSkillNames: loadedState.loadedSkillNames,
        loadedState: loadedState.loadedState,
        hotReloadState: loadedState.hotReloadState,
      }),
    );
  const discoveredSkillNames = [...new Set(skillStatuses.map((skill) => skill.name))].toSorted();
  const activatableSkillNames = skillStatuses
    .filter((skill) => skill.activatable)
    .map((skill) => skill.name)
    .toSorted();
  const modelVisibleSkillNames = skillStatuses
    .filter((skill) => skill.modelVisible)
    .map((skill) => skill.name)
    .toSorted();

  return {
    workspaceDir,
    managedSkillsDir,
    configuredSkillDirs,
    discoveredSkillNames,
    activatableSkillNames,
    modelVisibleSkillNames,
    ...loadedState,
    skills: skillStatuses,
  };
}
