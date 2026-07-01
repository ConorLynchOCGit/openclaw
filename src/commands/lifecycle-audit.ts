// Read-only agent/skill lifecycle diagnostics composed from existing evidence.
import fs from "node:fs";
import path from "node:path";
import { theme } from "../../packages/terminal-core/src/theme.js";
import { listAgentEntries, listAgentIds, resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { PluginRegistryStatusReport } from "../plugins/status-snapshot.js";
import { buildAdvisoryReadback, type AdvisoryReadback } from "../readback/advisory.js";
import type { RuntimeEnv } from "../runtime.js";
import { writeRuntimeJson } from "../runtime.js";
import type { SkillStatusReport } from "../skills/discovery/status.js";

type FindingSeverity = "info" | "warn";
type FindingCode =
  | "missing_runtime_prompt_file"
  | "missing_agent_docs"
  | "skill_agent_filter_missing"
  | "duplicate_skill_name"
  | "shared_agent_workspace"
  | "plugin_registry_diagnostic"
  | "configured_plugin_unknown";

export type LifecycleAuditFinding = {
  severity: FindingSeverity;
  code: FindingCode;
  message: string;
  evidence: Record<string, unknown>;
};

export type LifecycleAuditAgentReport = {
  agentId: string;
  configured: boolean;
  workspaceDir: string;
  skillFilter: string[] | null;
  skills: {
    total: number;
    modelVisible: number;
    commandVisible: number;
    blockedByAgentFilter: number;
    missingRequirements: number;
  };
  promptBootstrap: {
    contractPack: string | null;
    runtimePromptFiles: Array<{
      path: string;
      exists: boolean;
    }>;
    contextInjection: string | null;
  };
};

export type LifecycleAuditReport = {
  schema: "openclaw.lifecycle_audit.v1";
  generatedAt: string;
  advisory: AdvisoryReadback;
  filters: {
    agent: string | null;
  };
  summary: {
    agents: number;
    skills: number;
    modelVisibleSkills: number;
    commandVisibleSkills: number;
    plugins: number | null;
    findings: number;
    unknowns: number;
  };
  evidencePointers: string[];
  unknowns: Array<{
    surface: string;
    pointer: string;
    reason: string;
  }>;
  agents: LifecycleAuditAgentReport[];
  skills: Array<{
    name: string;
    skillKey: string;
    source: string;
    filePath: string;
    eligible: boolean;
    modelVisible: boolean;
    commandVisible: boolean;
    blockedByAllowlist: boolean;
    blockedByAgentFilter: boolean;
    missingRequirements: string[];
  }>;
  plugins: {
    registrySource: string | null;
    count: number | null;
    diagnostics: string[];
  };
  promptBootstrapFootprint: {
    workspaceDocs: Array<{
      path: string;
      exists: boolean;
    }>;
    runtimePromptFileCount: number;
    modelVisibleSkillCount: number;
  };
  findings: LifecycleAuditFinding[];
};

export type LifecycleAuditOptions = {
  json?: boolean;
  agent?: string;
};

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function missingRequirementLabels(skill: SkillStatusReport["skills"][number]): string[] {
  return [
    ...skill.missing.bins.map((value) => `bin:${value}`),
    ...skill.missing.anyBins.map((value) => `anyBin:${value}`),
    ...skill.missing.env.map((value) => `env:${value}`),
    ...skill.missing.config.map((value) => `config:${value}`),
    ...skill.missing.os.map((value) => `os:${value}`),
  ];
}

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function resolveRuntimePromptFile(params: {
  workspaceDir: string;
  contractPack?: string;
  fileName: string;
}): string {
  if (path.isAbsolute(params.fileName)) {
    return params.fileName;
  }
  const base = params.contractPack
    ? path.resolve(params.workspaceDir, params.contractPack)
    : params.workspaceDir;
  return path.resolve(base, params.fileName);
}

function configuredPluginIds(config: OpenClawConfig): string[] {
  const plugins = config.plugins;
  const ids = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string" && value.trim()) {
      ids.add(value.trim());
    }
  };
  if (Array.isArray(plugins?.allow)) {
    plugins.allow.forEach(add);
  }
  if (Array.isArray(plugins?.deny)) {
    plugins.deny.forEach(add);
  }
  if (plugins?.entries && typeof plugins.entries === "object") {
    Object.keys(plugins.entries).forEach(add);
  }
  return [...ids].toSorted();
}

function buildAgentReports(params: {
  config: OpenClawConfig;
  skillReport: SkillStatusReport;
  agent?: string;
}): LifecycleAuditAgentReport[] {
  const entries = listAgentEntries(params.config);
  const ids = params.agent ? [params.agent] : listAgentIds(params.config);
  return ids.map((agentId) => {
    const entry = entries.find(
      (candidate) => normalizeName(candidate.id) === normalizeName(agentId),
    );
    const workspaceDir = resolveAgentWorkspaceDir(params.config, agentId);
    const runtimePromptFiles = (entry?.runtimePromptFiles ?? []).map((fileName) => {
      const filePath = resolveRuntimePromptFile({
        workspaceDir,
        contractPack: entry?.contractPack,
        fileName,
      });
      return {
        path: filePath,
        exists: fileExists(filePath),
      };
    });
    const agentSkills = params.skillReport.skills;
    return {
      agentId,
      configured: Boolean(entry),
      workspaceDir,
      skillFilter: entry?.skills ?? params.config.agents?.defaults?.skills ?? null,
      skills: {
        total: agentSkills.length,
        modelVisible: agentSkills.filter((skill) => skill.modelVisible).length,
        commandVisible: agentSkills.filter((skill) => skill.commandVisible).length,
        blockedByAgentFilter: agentSkills.filter((skill) => skill.blockedByAgentFilter).length,
        missingRequirements: agentSkills.filter(
          (skill) => missingRequirementLabels(skill).length > 0,
        ).length,
      },
      promptBootstrap: {
        contractPack: entry?.contractPack ?? null,
        runtimePromptFiles,
        contextInjection: entry?.contextInjection ?? null,
      },
    };
  });
}

function buildFindings(params: {
  config: OpenClawConfig;
  skillReport: SkillStatusReport;
  pluginReport?: PluginRegistryStatusReport | null;
  agents: LifecycleAuditAgentReport[];
}): LifecycleAuditFinding[] {
  const findings: LifecycleAuditFinding[] = [];
  for (const agent of params.agents) {
    for (const promptFile of agent.promptBootstrap.runtimePromptFiles) {
      if (!promptFile.exists) {
        findings.push({
          severity: "warn",
          code: "missing_runtime_prompt_file",
          message: `${agent.agentId} references a runtime prompt file that was not found.`,
          evidence: { agentId: agent.agentId, path: promptFile.path },
        });
      }
    }
    const missingSkills = (agent.skillFilter ?? []).filter((skillName) => {
      const normalized = normalizeName(skillName);
      return !params.skillReport.skills.some(
        (skill) =>
          normalizeName(skill.name) === normalized || normalizeName(skill.skillKey) === normalized,
      );
    });
    if (missingSkills.length > 0) {
      findings.push({
        severity: "warn",
        code: "skill_agent_filter_missing",
        message: `${agent.agentId} skill allowlist references skill(s) not present in skill discovery.`,
        evidence: { agentId: agent.agentId, skills: missingSkills },
      });
    }
  }

  const bySkillName = new Map<string, string[]>();
  for (const skill of params.skillReport.skills) {
    const key = normalizeName(skill.name);
    bySkillName.set(key, [...(bySkillName.get(key) ?? []), skill.filePath]);
  }
  for (const [name, files] of bySkillName) {
    if (name && files.length > 1) {
      findings.push({
        severity: "warn",
        code: "duplicate_skill_name",
        message: `Multiple discovered skills normalize to "${name}".`,
        evidence: { normalizedName: name, files },
      });
    }
  }

  const byWorkspace = new Map<string, string[]>();
  for (const agent of params.agents) {
    byWorkspace.set(agent.workspaceDir, [
      ...(byWorkspace.get(agent.workspaceDir) ?? []),
      agent.agentId,
    ]);
  }
  for (const [workspaceDir, agentIds] of byWorkspace) {
    if (agentIds.length > 1) {
      findings.push({
        severity: "info",
        code: "shared_agent_workspace",
        message:
          "Multiple agents resolve to the same workspace; review docs and prompt ownership for duplication.",
        evidence: { workspaceDir, agentIds },
      });
    }
  }

  for (const diagnostic of params.pluginReport?.registryDiagnostics ?? []) {
    findings.push({
      severity: "warn",
      code: "plugin_registry_diagnostic",
      message: diagnostic.message,
      evidence: { code: diagnostic.code, level: diagnostic.level },
    });
  }

  const loadedPluginIds = new Set(params.pluginReport?.plugins.map((plugin) => plugin.id) ?? []);
  for (const pluginId of configuredPluginIds(params.config)) {
    if (!loadedPluginIds.has(pluginId)) {
      findings.push({
        severity: "info",
        code: "configured_plugin_unknown",
        message: `Configured plugin "${pluginId}" was not present in plugin registry readback.`,
        evidence: { pluginId, pointer: "openclaw plugins status --json" },
      });
    }
  }
  return findings;
}

export function buildLifecycleAuditReport(params: {
  config: OpenClawConfig;
  skillReport: SkillStatusReport;
  pluginReport?: PluginRegistryStatusReport | null;
  agent?: string;
  now?: number;
}): LifecycleAuditReport {
  const agents = buildAgentReports({
    config: params.config,
    skillReport: params.skillReport,
    agent: params.agent,
  });
  const workspaceDocs = ["AGENTS.md", "TOOLS.md", "SOUL.md", "USER.md", "MEMORY.md"].map(
    (fileName) => ({
      path: path.join(params.skillReport.workspaceDir, fileName),
      exists: fileExists(path.join(params.skillReport.workspaceDir, fileName)),
    }),
  );
  const unknowns: LifecycleAuditReport["unknowns"] = [];
  if (!params.pluginReport) {
    unknowns.push({
      surface: "plugins",
      pointer: "openclaw plugins status --json",
      reason: "plugin registry readback was unavailable to this audit run",
    });
  }
  for (const doc of workspaceDocs) {
    if (!doc.exists) {
      unknowns.push({
        surface: "workspace_doc",
        pointer: doc.path,
        reason: "workspace prompt/support document was not found",
      });
    }
  }
  const missingDocs = workspaceDocs.filter((doc) => !doc.exists);
  const findings = [
    ...missingDocs.map<LifecycleAuditFinding>((doc) => ({
      severity: "info",
      code: "missing_agent_docs",
      message: "Workspace prompt/support document was not found; audit reports it as unknown.",
      evidence: { path: doc.path },
    })),
    ...buildFindings({
      config: params.config,
      skillReport: params.skillReport,
      pluginReport: params.pluginReport,
      agents,
    }),
  ];
  const evidencePointers = uniqueStrings([
    "openclaw skills check --json",
    "openclaw skills audit-lifecycle --json",
    params.skillReport.workspaceDir,
    params.skillReport.managedSkillsDir,
    params.pluginReport ? "openclaw plugins status --json" : undefined,
    ...workspaceDocs.map((doc) => doc.path),
    ...agents.flatMap((agent) => agent.promptBootstrap.runtimePromptFiles.map((file) => file.path)),
  ]);
  return {
    schema: "openclaw.lifecycle_audit.v1",
    generatedAt: new Date(params.now ?? Date.now()).toISOString(),
    advisory: buildAdvisoryReadback({
      surface: "Agent/Skill Lifecycle Auditor",
      pointers: evidencePointers,
      caveats: [
        "Skill visibility comes from skill discovery status, not from a lifecycle state machine.",
        "Plugin evidence is registry readback only; plugin runtime truth remains with the plugin loader/runtime.",
      ],
    }),
    filters: {
      agent: params.agent ?? null,
    },
    summary: {
      agents: agents.length,
      skills: params.skillReport.skills.length,
      modelVisibleSkills: params.skillReport.skills.filter((skill) => skill.modelVisible).length,
      commandVisibleSkills: params.skillReport.skills.filter((skill) => skill.commandVisible)
        .length,
      plugins: params.pluginReport?.plugins.length ?? null,
      findings: findings.length,
      unknowns: unknowns.length,
    },
    evidencePointers,
    unknowns,
    agents,
    skills: params.skillReport.skills.map((skill) => ({
      name: skill.name,
      skillKey: skill.skillKey,
      source: skill.source,
      filePath: skill.filePath,
      eligible: skill.eligible,
      modelVisible: skill.modelVisible,
      commandVisible: skill.commandVisible,
      blockedByAllowlist: skill.blockedByAllowlist,
      blockedByAgentFilter: skill.blockedByAgentFilter,
      missingRequirements: missingRequirementLabels(skill),
    })),
    plugins: {
      registrySource: params.pluginReport?.registrySource ?? null,
      count: params.pluginReport?.plugins.length ?? null,
      diagnostics: [
        ...(params.pluginReport?.diagnostics.map((diagnostic) => diagnostic.message) ?? []),
        ...(params.pluginReport?.registryDiagnostics.map((diagnostic) => diagnostic.message) ?? []),
      ],
    },
    promptBootstrapFootprint: {
      workspaceDocs,
      runtimePromptFileCount: agents.reduce(
        (sum, agent) => sum + agent.promptBootstrap.runtimePromptFiles.length,
        0,
      ),
      modelVisibleSkillCount: params.skillReport.skills.filter((skill) => skill.modelVisible)
        .length,
    },
    findings,
  };
}

function formatLifecycleAuditReport(report: LifecycleAuditReport): string[] {
  const lines = [
    theme.heading("Agent/Skill Lifecycle Audit"),
    `Authority: ${report.advisory.semantics}`,
    `Agents: ${report.summary.agents}; skills: ${report.summary.skills}; model-visible skills: ${report.summary.modelVisibleSkills}; plugins: ${report.summary.plugins ?? "unknown"}.`,
    `Findings: ${report.summary.findings}; unknowns: ${report.summary.unknowns}.`,
    "",
    theme.heading("Findings"),
    ...(report.findings.length === 0
      ? ["  No lifecycle audit findings in bounded readback."]
      : report.findings
          .slice(0, 12)
          .map(
            (finding) => `  ${finding.severity.toUpperCase()} ${finding.code}: ${finding.message}`,
          )),
    "",
    theme.heading("Agents"),
    ...report.agents.map(
      (agent) =>
        `  ${agent.agentId} workspace=${agent.workspaceDir} skills=${agent.skills.modelVisible}/${agent.skills.total} model-visible promptFiles=${agent.promptBootstrap.runtimePromptFiles.length}`,
    ),
    "",
    theme.heading("Unknowns"),
    ...(report.unknowns.length === 0
      ? ["  No missing evidence pointers in bounded readback."]
      : report.unknowns
          .slice(0, 12)
          .map((unknown) => `  ${unknown.surface}: ${unknown.reason} (${unknown.pointer})`)),
    "",
    theme.heading("Pointers"),
    ...report.evidencePointers.slice(0, 16).map((pointer) => `  ${pointer}`),
  ];
  return lines;
}

export async function lifecycleAuditCommand(
  options: LifecycleAuditOptions,
  runtime: RuntimeEnv,
  deps: {
    config: OpenClawConfig;
    skillReport: SkillStatusReport;
    pluginReport?: PluginRegistryStatusReport | null;
  },
): Promise<void> {
  const report = buildLifecycleAuditReport({
    config: deps.config,
    skillReport: deps.skillReport,
    pluginReport: deps.pluginReport,
    agent: options.agent,
  });
  if (options.json) {
    writeRuntimeJson(runtime, report);
    return;
  }
  for (const line of formatLifecycleAuditReport(report)) {
    runtime.log(line);
  }
}
