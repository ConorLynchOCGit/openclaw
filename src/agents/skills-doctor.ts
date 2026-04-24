import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { CONFIG_DIR, resolveUserPath } from "../utils.js";
import {
  computeSkillFingerprint,
  readTrackedClawHubSkillInstalls,
  type TrackedClawHubSkillInstall,
} from "./skills-clawhub.js";
import {
  buildWorkspaceSkillStatus,
  type SkillLoadedSnapshotStatus,
  type SkillStatusEntry,
} from "./skills-status.js";
import { resolveBundledSkillsContext } from "./skills/bundled-context.js";
import { loadSkillsFromDirSafe } from "./skills/local-loader.js";
import { resolvePluginSkillDirs } from "./skills/plugin-skills.js";

type SkillsDoctorRoot = {
  kind: string;
  path: string;
  source: string;
  precedence: number;
};

export type SkillsDoctorWritableSurface = {
  kind: string;
  path: string;
  state: "writable" | "writable_via_parent" | "blocked";
  reason?: string;
};

export type SkillsDoctorCollision = {
  skillName: string;
  winner: {
    kind: string;
    source: string;
    path: string;
  };
  shadowed: Array<{
    kind: string;
    source: string;
    path: string;
  }>;
};

export type SkillsDoctorConformanceIssue = {
  code:
    | "tracked_skill_missing"
    | "tracked_origin_missing"
    | "tracked_origin_integrity_missing"
    | "tracked_origin_fingerprint_drift"
    | "tracked_origin_review_missing";
  message: string;
  path?: string;
  skillName?: string;
};

export type SkillsDoctorReport = {
  workspaceDir: string;
  managedSkillsDir: string;
  configuredSkillDirs: Array<{ kind: string; path: string }>;
  discoveredSkillNames: string[];
  activatableSkillNames: string[];
  modelVisibleSkillNames: string[];
  loadedSkillNames: string[] | null;
  loadedState: "not_available" | "available";
  loadedStateReason?: string;
  hotReloadState: "current" | "stale" | "unknown" | "not_available";
  watchState: "enabled" | "disabled";
  watchStateReason?: string;
  newSessionRequired: boolean | null;
  newSessionRequiredReason?: string;
  restartRequired: boolean | null;
  restartRequiredReason?: string;
  skills: SkillStatusEntry[];
  trackedClawHubInstalls: TrackedClawHubSkillInstall[];
  writableSurfaces: SkillsDoctorWritableSurface[];
  collisions: SkillsDoctorCollision[];
  conformanceIssues: SkillsDoctorConformanceIssue[];
};

function pushUniqueRoot(
  roots: SkillsDoctorRoot[],
  seen: Set<string>,
  root: Omit<SkillsDoctorRoot, "precedence">,
) {
  const resolvedPath = path.resolve(root.path);
  if (seen.has(`${root.kind}:${resolvedPath}`)) {
    return;
  }
  seen.add(`${root.kind}:${resolvedPath}`);
  roots.push({
    ...root,
    path: resolvedPath,
    precedence: roots.length,
  });
}

function resolveDoctorRoots(params: {
  workspaceDir: string;
  config?: OpenClawConfig;
  managedSkillsDir: string;
}): SkillsDoctorRoot[] {
  const roots: SkillsDoctorRoot[] = [];
  const seen = new Set<string>();
  const extraDirs = params.config?.skills?.load?.extraDirs ?? [];
  const pluginSkillDirs = resolvePluginSkillDirs({
    workspaceDir: params.workspaceDir,
    config: params.config,
  });
  for (const dir of [...extraDirs, ...pluginSkillDirs]) {
    const resolved = resolveUserPath(dir);
    pushUniqueRoot(roots, seen, {
      kind: "extra",
      path: resolved,
      source: "openclaw-extra",
    });
  }
  const bundledContext = resolveBundledSkillsContext();
  if (bundledContext.dir) {
    pushUniqueRoot(roots, seen, {
      kind: "bundled",
      path: bundledContext.dir,
      source: "openclaw-bundled",
    });
  }
  pushUniqueRoot(roots, seen, {
    kind: "managed",
    path: params.managedSkillsDir,
    source: "openclaw-managed",
  });
  pushUniqueRoot(roots, seen, {
    kind: "personal_agents",
    path: path.join(os.homedir(), ".agents", "skills"),
    source: "agents-skills-personal",
  });
  pushUniqueRoot(roots, seen, {
    kind: "workspace_agents",
    path: path.join(params.workspaceDir, ".agents", "skills"),
    source: "agents-skills-project",
  });
  pushUniqueRoot(roots, seen, {
    kind: "workspace",
    path: path.join(params.workspaceDir, "skills"),
    source: "openclaw-workspace",
  });
  return roots;
}

async function inspectWritableSurface(
  kind: string,
  targetPath: string,
): Promise<SkillsDoctorWritableSurface> {
  try {
    await fs.access(targetPath, fsConstants.W_OK);
    return { kind, path: targetPath, state: "writable" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      return {
        kind,
        path: targetPath,
        state: "blocked",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  let current = path.dirname(targetPath);
  while (current !== path.dirname(current)) {
    try {
      const stat = await fs.stat(current);
      if (!stat.isDirectory()) {
        return {
          kind,
          path: targetPath,
          state: "blocked",
          reason: `nearest existing parent is not a directory: ${current}`,
        };
      }
      await fs.access(current, fsConstants.W_OK);
      return {
        kind,
        path: targetPath,
        state: "writable_via_parent",
        reason: `target missing; nearest writable parent is ${current}`,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        current = path.dirname(current);
        continue;
      }
      return {
        kind,
        path: targetPath,
        state: "blocked",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    kind,
    path: targetPath,
    state: "blocked",
    reason: "no writable parent directory found",
  };
}

function buildCollisions(roots: SkillsDoctorRoot[]): SkillsDoctorCollision[] {
  const skillsByName = new Map<
    string,
    Array<{ kind: string; source: string; path: string; precedence: number }>
  >();
  for (const root of roots) {
    const loaded = loadSkillsFromDirSafe({
      dir: root.path,
      source: root.source,
    }).skills;
    for (const skill of loaded) {
      const entries = skillsByName.get(skill.name) ?? [];
      entries.push({
        kind: root.kind,
        source: root.source,
        path: skill.filePath,
        precedence: root.precedence,
      });
      skillsByName.set(skill.name, entries);
    }
  }

  const collisions: SkillsDoctorCollision[] = [];
  for (const [skillName, entries] of skillsByName.entries()) {
    if (entries.length < 2) {
      continue;
    }
    const ordered = entries.toSorted((left, right) => left.precedence - right.precedence);
    const winner = ordered[ordered.length - 1];
    if (!winner) {
      continue;
    }
    collisions.push({
      skillName,
      winner: {
        kind: winner.kind,
        source: winner.source,
        path: winner.path,
      },
      shadowed: ordered.slice(0, -1).map((entry) => ({
        kind: entry.kind,
        source: entry.source,
        path: entry.path,
      })),
    });
  }
  return collisions.toSorted((left, right) => left.skillName.localeCompare(right.skillName));
}

async function buildConformanceIssues(
  trackedInstalls: TrackedClawHubSkillInstall[],
): Promise<SkillsDoctorConformanceIssue[]> {
  const issues: SkillsDoctorConformanceIssue[] = [];
  for (const install of trackedInstalls) {
    const skillMdPath = path.join(install.targetDir, "SKILL.md");
    try {
      await fs.access(skillMdPath, fsConstants.R_OK);
    } catch {
      issues.push({
        code: "tracked_skill_missing",
        skillName: install.slug,
        path: skillMdPath,
        message: `Tracked ClawHub skill "${install.slug}" is missing SKILL.md at ${skillMdPath}.`,
      });
      continue;
    }

    if (!install.review) {
      issues.push({
        code: "tracked_origin_review_missing",
        skillName: install.slug,
        path: install.targetDir,
        message: `Tracked ClawHub skill "${install.slug}" has no persisted install review metadata.`,
      });
    }

    if (!install.integrity) {
      issues.push({
        code: "tracked_origin_integrity_missing",
        skillName: install.slug,
        path: install.targetDir,
        message: `Tracked ClawHub skill "${install.slug}" has no persisted integrity metadata.`,
      });
    }

    if (!install.fingerprint) {
      issues.push({
        code: "tracked_origin_missing",
        skillName: install.slug,
        path: install.targetDir,
        message: `Tracked ClawHub skill "${install.slug}" has no persisted fingerprint in origin metadata.`,
      });
      continue;
    }

    const currentFingerprint = await computeSkillFingerprint(install.targetDir);
    if (currentFingerprint !== install.fingerprint) {
      issues.push({
        code: "tracked_origin_fingerprint_drift",
        skillName: install.slug,
        path: install.targetDir,
        message: `Tracked ClawHub skill "${install.slug}" drifted from its pinned origin fingerprint.`,
      });
    }
  }
  return issues;
}

export async function buildSkillsDoctorReport(params: {
  workspaceDir: string;
  config?: OpenClawConfig;
  managedSkillsDir?: string;
  loadedSession?: SkillLoadedSnapshotStatus;
}): Promise<SkillsDoctorReport> {
  const managedSkillsDir = params.managedSkillsDir ?? path.join(CONFIG_DIR, "skills");
  const status = buildWorkspaceSkillStatus(params.workspaceDir, {
    config: params.config,
    managedSkillsDir,
    loadedSession: params.loadedSession,
  });
  const roots = resolveDoctorRoots({
    workspaceDir: params.workspaceDir,
    config: params.config,
    managedSkillsDir,
  });
  const trackedClawHubInstalls = await readTrackedClawHubSkillInstalls(params.workspaceDir);
  const writableSurfaces = await Promise.all([
    inspectWritableSurface("workspace", path.join(params.workspaceDir, "skills")),
    inspectWritableSurface("workspace_agents", path.join(params.workspaceDir, ".agents", "skills")),
    inspectWritableSurface("managed", managedSkillsDir),
  ]);
  const collisions = buildCollisions(roots);
  const conformanceIssues = await buildConformanceIssues(trackedClawHubInstalls);
  const trustBlockedReasons = new Map<string, string[]>();
  for (const issue of conformanceIssues) {
    if (!issue.skillName) {
      continue;
    }
    if (
      issue.code === "tracked_origin_review_missing" ||
      issue.code === "tracked_origin_integrity_missing" ||
      issue.code === "tracked_origin_fingerprint_drift" ||
      issue.code === "tracked_origin_missing"
    ) {
      const reasons = trustBlockedReasons.get(issue.skillName) ?? [];
      reasons.push(issue.message);
      trustBlockedReasons.set(issue.skillName, reasons);
    }
  }

  const skills = status.skills.map((skill) => {
    const trustReasons = trustBlockedReasons.get(skill.name);
    if (!trustReasons || trustReasons.length === 0) {
      return skill;
    }
    return {
      ...skill,
      blockedByTrustVetting: true,
      activatable: false,
      eligible: false,
      modelVisible: false,
      availabilityState: "blocked_trust_vetting" as const,
      availabilityReason: trustReasons.join(" "),
      newSessionRequired: false,
    };
  });

  const activatableSkillNames = skills
    .filter((skill) => skill.activatable)
    .map((skill) => skill.name)
    .toSorted();
  const modelVisibleSkillNames = skills
    .filter((skill) => skill.modelVisible)
    .map((skill) => skill.name)
    .toSorted();
  const missingLoadedSkills =
    status.loadedState === "available"
      ? skills
          .filter((skill) => skill.activatable && skill.loadedInCurrentSession === false)
          .map((skill) => skill.name)
      : [];
  const watchEnabled = params.config?.skills?.load?.watch !== false;
  const watchState = watchEnabled ? "enabled" : "disabled";
  const watchStateReason = watchEnabled
    ? "watching SKILL.md changes and bumping the session skills snapshot version; current sessions refresh on the next run"
    : "skills.load.watch is disabled, so new skills may require a fresh session before the runtime notices them";
  const newSessionRequired =
    status.loadedState !== "available"
      ? null
      : missingLoadedSkills.length > 0 && status.hotReloadState === "current";
  const newSessionRequiredReason =
    status.loadedState !== "available"
      ? "runtime cannot prove current-session skill load truth until a persisted warm-session snapshot exists"
      : missingLoadedSkills.length === 0
        ? status.hotReloadState === "stale"
          ? "current session snapshot is stale but will refresh on the next run"
          : "current session snapshot already includes all activatable skills"
        : status.hotReloadState === "stale"
          ? `not required: current session snapshot is stale and will refresh on the next run (${missingLoadedSkills.join(", ")})`
          : `warm session has not loaded activatable skills: ${missingLoadedSkills.join(", ")}`;
  const restartRequired = status.loadedState !== "available" ? null : false;
  const restartRequiredReason =
    status.loadedState !== "available"
      ? "runtime does not expose authoritative process-restart skill state until a warm-session snapshot is available"
      : "skill availability is session-scoped; process restart is not the required refresh path";

  return {
    workspaceDir: status.workspaceDir,
    managedSkillsDir: status.managedSkillsDir,
    configuredSkillDirs: roots.map((root) => ({ kind: root.kind, path: root.path })),
    discoveredSkillNames: status.discoveredSkillNames,
    activatableSkillNames,
    modelVisibleSkillNames,
    loadedSkillNames: status.loadedSkillNames,
    loadedState: status.loadedState,
    loadedStateReason: status.loadedStateReason,
    hotReloadState: status.hotReloadState,
    watchState,
    watchStateReason,
    newSessionRequired,
    newSessionRequiredReason,
    restartRequired,
    restartRequiredReason,
    skills,
    trackedClawHubInstalls,
    writableSurfaces,
    collisions,
    conformanceIssues,
  };
}
