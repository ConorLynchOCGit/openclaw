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
import {
  hasBinary,
  isBundledSkillAllowed,
  isConfigPathTruthy,
  loadWorkspaceSkillEntries,
  resolveBundledAllowlist,
  resolveSkillConfig,
  resolveSkillsInstallPreferences,
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
  eligible: boolean;
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

function buildSkillStatus(
  entry: SkillEntry,
  config?: OpenClawConfig,
  prefs?: SkillsInstallPreferences,
  eligibility?: SkillEligibilityContext,
  bundledNames?: Set<string>,
): SkillStatusEntry {
  const skillKey = resolveSkillKey(entry);
  const skillConfig = resolveSkillConfig(config, skillKey);
  const disabled = skillConfig?.enabled === false;
  const allowBundled = resolveBundledAllowlist(config);
  const blockedByAllowlist = !isBundledSkillAllowed(entry, allowBundled);
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
  const eligible = !disabled && !blockedByAllowlist && requirementsSatisfied;

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
    eligible,
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
  const skillStatuses = skillEntries.map((entry) =>
    buildSkillStatus(entry, opts?.config, prefs, opts?.eligibility, bundledContext.names),
  );
  const configuredSkillDirs: SkillStatusReport["configuredSkillDirs"] = [
    { kind: "workspace", path: path.join(workspaceDir, "skills") },
    { kind: "workspace_agents", path: path.join(workspaceDir, ".agents", "skills") },
    { kind: "managed", path: managedSkillsDir },
  ];
  if (bundledContext.dir) {
    configuredSkillDirs.push({ kind: "bundled", path: bundledContext.dir });
  }
  const loadedState = buildLoadedState(opts?.loadedSession);
  return {
    workspaceDir,
    managedSkillsDir,
    configuredSkillDirs,
    discoveredSkillNames: [...new Set(skillStatuses.map((skill) => skill.name))].toSorted(),
    ...loadedState,
    skills: skillStatuses,
  };
}
