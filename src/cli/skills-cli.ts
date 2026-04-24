import type { Command } from "commander";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import {
  fetchSkillDetailFromClawHub,
  installSkillFromClawHub,
  readTrackedClawHubSkillSlugs,
  searchSkillsFromClawHub,
  updateSkillsFromClawHub,
} from "../agents/skills-clawhub.js";
import { buildSkillsDoctorReport } from "../agents/skills-doctor.js";
import { vetClawHubSkill } from "../agents/skills-vetting.js";
import { loadConfig } from "../config/config.js";
import { defaultRuntime } from "../runtime.js";
import { normalizeOptionalString } from "../shared/string-coerce.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import { shortenHomePath } from "../utils.js";
import { formatSkillInfo, formatSkillsCheck, formatSkillsList } from "./skills-cli.format.js";

export type {
  SkillInfoOptions,
  SkillsCheckOptions,
  SkillsListOptions,
} from "./skills-cli.format.js";
export { formatSkillInfo, formatSkillsCheck, formatSkillsList } from "./skills-cli.format.js";

type SkillStatusReport = Awaited<
  ReturnType<(typeof import("../agents/skills-status.js"))["buildWorkspaceSkillStatus"]>
>;

async function loadSkillsStatusReport(): Promise<SkillStatusReport> {
  const config = loadConfig();
  const workspaceDir = resolveAgentWorkspaceDir(config, resolveDefaultAgentId(config));
  const { buildWorkspaceSkillStatus } = await import("../agents/skills-status.js");
  return buildWorkspaceSkillStatus(workspaceDir, { config });
}

async function runSkillsAction(render: (report: SkillStatusReport) => string): Promise<void> {
  try {
    const report = await loadSkillsStatusReport();
    defaultRuntime.writeStdout(render(report));
  } catch (err) {
    defaultRuntime.error(String(err));
    defaultRuntime.exit(1);
  }
}

function resolveActiveWorkspaceDir(): string {
  const config = loadConfig();
  return resolveAgentWorkspaceDir(config, resolveDefaultAgentId(config));
}

async function loadSkillsDoctorReport() {
  const config = loadConfig();
  const workspaceDir = resolveAgentWorkspaceDir(config, resolveDefaultAgentId(config));
  const { resolveAgentLoadedSkillSnapshotStatus } = await import("../agents/skills-status.js");
  const loadedSession = resolveAgentLoadedSkillSnapshotStatus({
    config,
    agentId: resolveDefaultAgentId(config),
    workspaceDir,
  });
  return await buildSkillsDoctorReport({
    workspaceDir,
    config,
    loadedSession,
  });
}

function formatSkillsDoctorText(
  report: Awaited<ReturnType<typeof buildSkillsDoctorReport>>,
): string {
  const lines: string[] = [];
  lines.push(`Skills doctor: ${shortenHomePath(report.workspaceDir)}`);
  lines.push(
    `Loaded state: ${report.loadedState}${
      report.loadedStateReason ? ` (${report.loadedStateReason})` : ""
    }`,
  );
  lines.push(`Hot reload: ${report.hotReloadState}`);
  lines.push(`Activatable skills: ${report.activatableSkillNames.length}`);
  lines.push(`Model-visible skills: ${report.modelVisibleSkillNames.length}`);
  lines.push(
    `Restart required: ${
      report.restartRequired === null ? "not_available" : report.restartRequired ? "yes" : "no"
    }${report.restartRequiredReason ? ` (${report.restartRequiredReason})` : ""}`,
  );
  lines.push(
    `New session required: ${
      report.newSessionRequired === null
        ? "not_available"
        : report.newSessionRequired
          ? "yes"
          : "no"
    }${report.newSessionRequiredReason ? ` (${report.newSessionRequiredReason})` : ""}`,
  );
  lines.push(
    `Watch state: ${report.watchState}${report.watchStateReason ? ` (${report.watchStateReason})` : ""}`,
  );
  lines.push(
    `Configured roots: ${report.configuredSkillDirs
      .map((entry) => `${entry.kind}=${shortenHomePath(entry.path)}`)
      .join(", ")}`,
  );
  lines.push(
    `Tracked ClawHub installs: ${report.trackedClawHubInstalls.length > 0 ? report.trackedClawHubInstalls.map((entry) => `${entry.slug}@${entry.installedVersion ?? "unknown"}`).join(", ") : "none"}`,
  );
  lines.push(
    `Writable surfaces: ${report.writableSurfaces
      .map((entry) => `${entry.kind}=${entry.state}${entry.reason ? ` (${entry.reason})` : ""}`)
      .join(", ")}`,
  );
  lines.push(
    `Collisions: ${
      report.collisions.length > 0
        ? report.collisions.map((entry) => `${entry.skillName} -> ${entry.winner.kind}`).join(", ")
        : "none"
    }`,
  );
  lines.push(
    `Conformance issues: ${
      report.conformanceIssues.length > 0
        ? report.conformanceIssues.map((issue) => issue.code).join(", ")
        : "none"
    }`,
  );
  return lines.join("\n");
}

/**
 * Register the skills CLI commands
 */
export function registerSkillsCli(program: Command) {
  const skills = program
    .command("skills")
    .description("List and inspect available skills")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/skills", "docs.openclaw.ai/cli/skills")}\n`,
    );

  skills
    .command("search")
    .description("Search ClawHub skills")
    .argument("[query...]", "Optional search query")
    .option("--limit <n>", "Max results", (value) => Number.parseInt(value, 10))
    .option("--json", "Output as JSON", false)
    .action(async (queryParts: string[], opts: { limit?: number; json?: boolean }) => {
      try {
        const results = await searchSkillsFromClawHub({
          query: normalizeOptionalString(queryParts.join(" ")),
          limit: opts.limit,
        });
        if (opts.json) {
          defaultRuntime.writeJson({ results });
          return;
        }
        if (results.length === 0) {
          defaultRuntime.log("No ClawHub skills found.");
          return;
        }
        for (const entry of results) {
          const version = entry.version ? ` v${entry.version}` : "";
          const summary = entry.summary ? `  ${entry.summary}` : "";
          defaultRuntime.log(
            `${entry.slug}${version}  ${entry.displayName}  [catalogId=${entry.catalogId}]${summary}`,
          );
        }
        defaultRuntime.log(
          "Remote search returns ClawHub catalog ids. Use `openclaw skills info --source clawhub --catalog-id <catalogId>` for remote detail, `openclaw skills vet --catalog-id <catalogId>` to stage/review, `openclaw skills install --catalog-id <catalogId>` to install, and `openclaw skills info <name>` for installed/local skills.",
        );
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  skills
    .command("vet")
    .description("Fetch, quarantine, scan, and report on a ClawHub skill before activation")
    .argument("[slug]", "ClawHub skill slug")
    .option("--catalog-id <catalogId>", "Vet by remote ClawHub catalog id")
    .option("--version <version>", "Vet a specific version")
    .option("--json", "Output as JSON", false)
    .action(
      async (
        slug: string | undefined,
        opts: { catalogId?: string; version?: string; json?: boolean },
      ) => {
        try {
          if (!slug && !opts.catalogId) {
            defaultRuntime.error("Provide a skill slug or --catalog-id.");
            defaultRuntime.exit(1);
            return;
          }
          const workspaceDir = resolveActiveWorkspaceDir();
          const result = await vetClawHubSkill({
            workspaceDir,
            slug,
            catalogId: opts.catalogId,
            version: opts.version,
            logger: {
              info: (message) => defaultRuntime.log(message),
            },
          });
          if (!result.ok) {
            defaultRuntime.error(result.error);
            defaultRuntime.exit(1);
            return;
          }
          if (opts.json) {
            defaultRuntime.writeJson(result);
            return;
          }
          defaultRuntime.log(
            `Vetted ${result.slug}@${result.version} -> outcome=${result.outcome} trust=${result.trustTier}`,
          );
          defaultRuntime.log(`Report: ${result.reportPath}`);
          defaultRuntime.log(`Quarantine: ${result.quarantineDir}`);
        } catch (err) {
          defaultRuntime.error(String(err));
          defaultRuntime.exit(1);
        }
      },
    );

  skills
    .command("install")
    .description("Install a skill from ClawHub into the active workspace")
    .argument("[slug]", "ClawHub skill slug")
    .option("--catalog-id <catalogId>", "Install by remote ClawHub catalog id")
    .option("--version <version>", "Install a specific version")
    .option("--force", "Overwrite an existing workspace skill", false)
    .action(
      async (
        slug: string | undefined,
        opts: { catalogId?: string; version?: string; force?: boolean },
      ) => {
        try {
          if (!slug && !opts.catalogId) {
            defaultRuntime.error("Provide a skill slug or --catalog-id.");
            defaultRuntime.exit(1);
            return;
          }
          const workspaceDir = resolveActiveWorkspaceDir();
          const result = await installSkillFromClawHub({
            workspaceDir,
            slug,
            catalogId: opts.catalogId,
            version: opts.version,
            force: Boolean(opts.force),
            logger: {
              info: (message) => defaultRuntime.log(message),
            },
          });
          if (!result.ok) {
            defaultRuntime.error(result.error);
            defaultRuntime.exit(1);
            return;
          }
          defaultRuntime.log(
            `Installed ${result.slug}@${result.version} [catalogId=${result.catalogId}] -> ${result.targetDir}`,
          );
        } catch (err) {
          defaultRuntime.error(String(err));
          defaultRuntime.exit(1);
        }
      },
    );

  skills
    .command("update")
    .description("Update ClawHub-installed skills in the active workspace")
    .argument("[slug]", "Single skill slug")
    .option("--all", "Update all tracked ClawHub skills", false)
    .action(async (slug: string | undefined, opts: { all?: boolean }) => {
      try {
        if (!slug && !opts.all) {
          defaultRuntime.error("Provide a skill slug or use --all.");
          defaultRuntime.exit(1);
          return;
        }
        if (slug && opts.all) {
          defaultRuntime.error("Use either a skill slug or --all.");
          defaultRuntime.exit(1);
          return;
        }
        const workspaceDir = resolveActiveWorkspaceDir();
        const tracked = await readTrackedClawHubSkillSlugs(workspaceDir);
        if (opts.all && tracked.length === 0) {
          defaultRuntime.log("No tracked ClawHub skills to update.");
          return;
        }
        const results = await updateSkillsFromClawHub({
          workspaceDir,
          slug,
          logger: {
            info: (message) => defaultRuntime.log(message),
          },
        });
        for (const result of results) {
          if (!result.ok) {
            defaultRuntime.error(result.error);
            continue;
          }
          if (result.changed) {
            defaultRuntime.log(
              `Updated ${result.slug}: ${result.previousVersion ?? "unknown"} -> ${result.version}`,
            );
            continue;
          }
          defaultRuntime.log(`${result.slug} already at ${result.version}`);
        }
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  skills
    .command("list")
    .description("List all available skills")
    .option("--json", "Output as JSON", false)
    .option("--eligible", "Show only eligible (ready to use) skills", false)
    .option("-v, --verbose", "Show more details including missing requirements", false)
    .action(async (opts) => {
      await runSkillsAction((report) => formatSkillsList(report, opts));
    });

  skills
    .command("info")
    .description("Show detailed information about a skill")
    .argument("[name]", "Installed/local skill name")
    .option("--source <source>", "Remote source, for example clawhub")
    .option("--catalog-id <catalogId>", "Remote skill catalog id")
    .option("--json", "Output as JSON", false)
    .action(async (name, opts: { source?: string; catalogId?: string; json?: boolean }) => {
      if (opts.source === "clawhub" || opts.catalogId) {
        try {
          const detail = await fetchSkillDetailFromClawHub({
            slug: normalizeOptionalString(name),
            catalogId: opts.catalogId,
          });
          if (opts.json) {
            defaultRuntime.writeJson(detail);
            return;
          }
          const latest = detail.latestVersion?.version ? ` v${detail.latestVersion.version}` : "";
          defaultRuntime.log(
            `${detail.slug}${latest}  ${detail.skill?.displayName ?? detail.slug}\nsource=${detail.source} catalogId=${detail.catalogId}`,
          );
          if (detail.skill?.summary) {
            defaultRuntime.log(detail.skill.summary);
          }
          return;
        } catch (err) {
          defaultRuntime.error(String(err));
          defaultRuntime.exit(1);
          return;
        }
      }
      if (!name) {
        defaultRuntime.error(
          "Provide a local skill name, or use --source clawhub with --catalog-id.",
        );
        defaultRuntime.exit(1);
        return;
      }
      await runSkillsAction((report) => formatSkillInfo(report, name, opts));
    });

  skills
    .command("doctor")
    .description(
      "Diagnose discovery, installs, load-state, collisions, and writable skill surfaces",
    )
    .option("--json", "Output as JSON", false)
    .action(async (opts: { json?: boolean }) => {
      try {
        const report = await loadSkillsDoctorReport();
        if (opts.json) {
          defaultRuntime.writeJson(report);
          return;
        }
        defaultRuntime.writeStdout(`${formatSkillsDoctorText(report)}\n`);
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  skills
    .command("check")
    .description("Check which skills are ready vs missing requirements")
    .option("--json", "Output as JSON", false)
    .action(async (opts) => {
      await runSkillsAction((report) => formatSkillsCheck(report, opts));
    });

  // Default action (no subcommand) - show list
  skills.action(async () => {
    await runSkillsAction((report) => formatSkillsList(report, {}));
  });
}
