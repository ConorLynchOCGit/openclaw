import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { WorkspaceProjectionVersionRecord } from "../plugin-sdk/model-memory.js";
import {
  loadBootstrapFileRegistry,
  type BootstrapFileRegistryEntry,
} from "./bootstrap-file-registry.js";
import { resolveBootstrapRepoPath, resolveBootstrapRepoRoot } from "./bootstrap-repo-paths.js";
import { resolveModelMemoryBootstrapOverlay } from "./model-memory.live-runtime.js";
import {
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_BOOTSTRAP_FILENAME,
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_MEMORY_ALT_FILENAME,
  DEFAULT_MEMORY_FILENAME,
  DEFAULT_SOUL_FILENAME,
  DEFAULT_TOOLS_FILENAME,
  DEFAULT_USER_FILENAME,
  type WorkspaceBootstrapFile,
} from "./workspace.js";

const CANONICAL_ZONE_BLOCK_ID = "openclaw-canonical";
const MODEL_MEMORY_ZONE_BLOCK_ID = "model-memory";

type CanonicalProjectRegistryProject = {
  id: string;
  title: string;
  status: string;
  workspacePath?: string;
  startupPath?: string;
  currentSlicePath?: string;
  statusPath?: string;
  priority?: number;
};

type BootstrapCanonicalProjectPointer = {
  title: string;
  workspacePath?: string;
  startupPath?: string;
  currentSlicePath?: string;
  statusPath?: string;
};

export type BootstrapCanonicalSources = {
  activeProjects: BootstrapCanonicalProjectPointer[];
  queuedProjects: BootstrapCanonicalProjectPointer[];
  agentRules: string[];
  memoryRules: string[];
  memoryLayers: string[];
};

type MaterializeBootstrapCompatibilityResult = {
  files: WorkspaceBootstrapFile[];
  modelMemoryOverlay: Awaited<ReturnType<typeof resolveModelMemoryBootstrapOverlay>>;
};

type AgentCanonicalRuntimeSources = {
  runtimeFiles: Map<string, string>;
  extraFiles: Array<{ relativePath: string; content: string }>;
};

function getGeneratedZoneMarkers(blockId: string) {
  return {
    begin: `<!-- BEGIN GENERATED: ${blockId} -->`,
    end: `<!-- END GENERATED: ${blockId} -->`,
  };
}

function upsertGeneratedZone(
  existingContent: string | undefined,
  generatedBody: string,
  blockId: string,
) {
  const normalizedBody = generatedBody.trim();
  const markers = getGeneratedZoneMarkers(blockId);
  const zone = `${markers.begin}\n${normalizedBody}\n${markers.end}`;

  if (!existingContent || existingContent.trim().length === 0) {
    return `${zone}\n`;
  }

  const begin = existingContent.indexOf(markers.begin);
  const end = existingContent.indexOf(markers.end);
  if (begin >= 0 && end > begin) {
    const before = existingContent.slice(0, begin).trimEnd();
    const after = existingContent.slice(end + markers.end.length).trimStart();
    return [before, zone, after].filter((value) => value.length > 0).join("\n\n") + "\n";
  }

  return `${existingContent.trimEnd()}\n\n${zone}\n`;
}

function removeGeneratedZone(existingContent: string | undefined, blockId: string) {
  if (!existingContent || existingContent.trim().length === 0) {
    return existingContent ?? "";
  }
  const markers = getGeneratedZoneMarkers(blockId);
  const begin = existingContent.indexOf(markers.begin);
  const end = existingContent.indexOf(markers.end);
  if (begin < 0 || end <= begin) {
    return existingContent;
  }
  const before = existingContent.slice(0, begin).trimEnd();
  const after = existingContent.slice(end + markers.end.length).trimStart();
  const combined = [before, after].filter((value) => value.length > 0).join("\n\n");
  return combined.length > 0 ? `${combined}\n` : "";
}

function extractGeneratedZone(
  existingContent: string | undefined,
  blockId: string,
): { zone?: string; remaining: string } {
  if (!existingContent || existingContent.trim().length === 0) {
    return { remaining: "" };
  }
  const markers = getGeneratedZoneMarkers(blockId);
  const begin = existingContent.indexOf(markers.begin);
  const end = existingContent.indexOf(markers.end);
  if (begin < 0 || end <= begin) {
    return { remaining: existingContent };
  }

  const zoneEnd = end + markers.end.length;
  const zone = existingContent.slice(begin, zoneEnd).trim();
  const before = existingContent.slice(0, begin).trimEnd();
  const after = existingContent.slice(zoneEnd).trimStart();
  const remaining = [before, after].filter((value) => value.length > 0).join("\n\n");
  return {
    zone: zone.length > 0 ? zone : undefined,
    remaining: remaining.length > 0 ? `${remaining}\n` : "",
  };
}

function prioritizeGeneratedZones(existingContent: string | undefined, blockIds: string[]): string {
  if (!existingContent || existingContent.trim().length === 0) {
    return "";
  }

  let remaining = existingContent;
  const zones: string[] = [];
  for (const blockId of blockIds) {
    const extracted = extractGeneratedZone(remaining, blockId);
    if (extracted.zone) {
      zones.push(extracted.zone);
    }
    remaining = extracted.remaining;
  }

  if (zones.length === 0) {
    return existingContent;
  }

  const segments = [...zones, remaining.trim()].filter((value) => value.length > 0);
  return `${segments.join("\n\n")}\n`;
}

function extractBulletLines(markdown: string, heading: string): string[] {
  const lines = markdown.split(/\r?\n/u);
  const normalizedHeading = heading.trim().toLowerCase();
  let inside = false;
  const collected: string[] = [];
  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/u);
    if (headingMatch) {
      if (inside) {
        break;
      }
      inside = headingMatch[1].trim().toLowerCase() === normalizedHeading;
      continue;
    }
    if (!inside) {
      continue;
    }
    const bulletMatch = line.match(/^-\s+(.+?)\s*$/u);
    if (bulletMatch) {
      collected.push(bulletMatch[1].trim());
    }
  }
  return collected;
}

async function loadCanonicalProjectRegistry(): Promise<CanonicalProjectRegistryProject[]> {
  const raw = await fs.readFile(
    resolveBootstrapRepoPath({
      relativePath: "docs/system/registries/projects.yaml",
      importMetaUrl: import.meta.url,
      cwd: process.cwd(),
    }),
    "utf8",
  );
  const parsed = (await import("yaml")).parse(raw) as {
    projects?: CanonicalProjectRegistryProject[];
  };
  return Array.isArray(parsed.projects)
    ? parsed.projects.toSorted(
        (left, right) =>
          (left.priority ?? Number.MAX_SAFE_INTEGER) - (right.priority ?? Number.MAX_SAFE_INTEGER),
      )
    : [];
}

async function loadCanonicalSources(): Promise<BootstrapCanonicalSources> {
  const [agentsDoc, memoryDoc, projects] = await Promise.all([
    fs.readFile(
      resolveBootstrapRepoPath({
        relativePath: "docs/system/agents.md",
        importMetaUrl: import.meta.url,
        cwd: process.cwd(),
      }),
      "utf8",
    ),
    fs.readFile(
      resolveBootstrapRepoPath({
        relativePath: "docs/system/memory.md",
        importMetaUrl: import.meta.url,
        cwd: process.cwd(),
      }),
      "utf8",
    ),
    loadCanonicalProjectRegistry(),
  ]);

  return {
    activeProjects: projects
      .filter((project) => project.status === "active")
      .map((project) => ({
        title: project.title,
        workspacePath: project.workspacePath,
        startupPath: project.startupPath,
        currentSlicePath: project.currentSlicePath,
        statusPath: project.statusPath,
      })),
    queuedProjects: projects
      .filter((project) => project.status === "queued")
      .map((project) => ({
        title: project.title,
        workspacePath: project.workspacePath,
        startupPath: project.startupPath,
        currentSlicePath: project.currentSlicePath,
        statusPath: project.statusPath,
      })),
    agentRules: extractBulletLines(agentsDoc, "Current rule"),
    memoryRules: extractBulletLines(memoryDoc, "Current rule"),
    memoryLayers: extractBulletLines(memoryDoc, "Memory layers"),
  };
}

const REPO_ROOT_DIR = resolveBootstrapRepoRoot({
  importMetaUrl: import.meta.url,
  cwd: process.cwd(),
});

async function pathExists(pathValue: string): Promise<boolean> {
  try {
    await fs.access(pathValue);
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const nextPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(nextPath)));
      continue;
    }
    if (entry.isFile()) {
      files.push(nextPath);
    }
  }
  return files;
}

async function loadAgentCanonicalRuntimeSources(
  agentId?: string,
): Promise<AgentCanonicalRuntimeSources> {
  if (!agentId) {
    return { runtimeFiles: new Map(), extraFiles: [] };
  }
  const runtimeRoot = path.join(REPO_ROOT_DIR, "docs", "agents", agentId, "runtime");
  if (!(await pathExists(runtimeRoot))) {
    return { runtimeFiles: new Map(), extraFiles: [] };
  }

  const registryEntries = await loadBootstrapFileRegistry();
  const runtimeNames = new Set(
    registryEntries.fileClasses
      .filter((entry) => !entry.runtimePath.includes("*"))
      .map((entry) => entry.runtimePath),
  );
  const runtimeFiles = new Map<string, string>();
  const extraFiles: Array<{ relativePath: string; content: string }> = [];

  for (const absolutePath of await listFilesRecursive(runtimeRoot)) {
    const relativePath = path.relative(runtimeRoot, absolutePath).replace(/\\/g, "/");
    const content = await fs.readFile(absolutePath, "utf8");
    if (runtimeNames.has(relativePath)) {
      runtimeFiles.set(relativePath, content);
      continue;
    }
    extraFiles.push({ relativePath, content });
  }

  return { runtimeFiles, extraFiles };
}

function renderCanonicalBlock(params: {
  fileName: string;
  registryEntry: BootstrapFileRegistryEntry;
  canonicalSources: BootstrapCanonicalSources;
  projectionVersion?: WorkspaceProjectionVersionRecord;
}) {
  const renderProjectPointers = (
    label: string,
    projects: BootstrapCanonicalProjectPointer[],
  ): string[] => {
    if (projects.length === 0) {
      return [`- ${label}: none recorded`];
    }
    return projects.flatMap((project) => {
      const pointerParts = [
        project.workspacePath ? `workspace ${project.workspacePath}` : undefined,
        project.startupPath ? `startup ${project.startupPath}` : undefined,
        project.currentSlicePath ? `current slice ${project.currentSlicePath}` : undefined,
        project.statusPath ? `status ${project.statusPath}` : undefined,
      ].filter((value): value is string => Boolean(value));
      return [`- ${label}: ${project.title}`, ...pointerParts.map((pointer) => `- ${pointer}`)];
    });
  };

  const lines: string[] = ["## Canonical Durable Sources"];
  lines.push(
    `- Runtime path: ${params.registryEntry.runtimePath}`,
    `- Structural mode: ${params.registryEntry.structuralMode}`,
  );

  if (params.fileName === DEFAULT_AGENTS_FILENAME) {
    lines.push(
      "- This compatibility file stays structurally rich and preserves its human-owned operational sections.",
    );
    lines.push(
      ...renderProjectPointers(
        "Active durable project workspace",
        params.canonicalSources.activeProjects,
      ),
    );
    for (const rule of params.canonicalSources.agentRules) {
      lines.push(`- ${rule}`);
    }
    return lines.join("\n");
  }

  if (
    params.fileName === DEFAULT_MEMORY_FILENAME ||
    params.fileName === DEFAULT_MEMORY_ALT_FILENAME
  ) {
    lines.push("## Workspace Recall Index");
    lines.push("- Read first: docs/system/roadmap.md");
    lines.push("- Read first: docs/system/build-plan.md");
    lines.push("- Read first: docs/system/projects.md");
    lines.push("- Read first: docs/system/agents.md");
    lines.push("- Read first: docs/system/deployment.md");
    lines.push(
      ...renderProjectPointers("Active workspace", params.canonicalSources.activeProjects),
    );
    lines.push(
      ...renderProjectPointers("Queued workspace", params.canonicalSources.queuedProjects),
    );
    lines.push("- Loose roadmap ideas: docs/system/roadmap-ideas.md");
    lines.push("## User-Facing Scheduled Flows");
    lines.push("- Automation overview: docs/automation/index.md");
    lines.push("- Scheduled tasks: docs/automation/cron-jobs.md");
    lines.push("- Heartbeat: docs/gateway/heartbeat.md");
    lines.push("- Background tasks ledger: docs/automation/tasks.md");
    lines.push("- Cron CLI: docs/cli/cron.md");
    lines.push("## Generated Memory Pointers");
    if (params.projectionVersion?.canonicalArtifactPath) {
      lines.push(
        `- DB-backed generated memory projection: ${params.projectionVersion.canonicalArtifactPath}`,
      );
    } else {
      lines.push("- DB-backed generated memory projection: .openclaw/model-memory/projections/");
    }
    lines.push("- Daily memory ingestion layer: memory/YYYY-MM-DD.md");
    for (const layer of params.canonicalSources.memoryLayers) {
      lines.push(`- Memory layer: ${layer}`);
    }
    for (const rule of params.canonicalSources.memoryRules) {
      lines.push(`- ${rule}`);
    }
    return lines.join("\n");
  }

  if (params.fileName === DEFAULT_SOUL_FILENAME) {
    lines.push("- Keep this file lean and identity-focused rather than procedural.");
    lines.push(
      "- Deeper durable agent-pack content will move into docs/agents/ during the later agent-foundation slice.",
    );
    return lines.join("\n");
  }

  if (params.fileName === DEFAULT_IDENTITY_FILENAME) {
    lines.push("- This compatibility file should stay concise and identity-specific.");
    lines.push(
      "- Durable identity detail will later live in docs/agents/ and project-local agent packs.",
    );
    return lines.join("\n");
  }

  if (params.fileName === DEFAULT_USER_FILENAME) {
    lines.push(
      "- This compatibility file is assembled from user-facing durable context plus generated memory when available.",
    );
    if (params.projectionVersion?.canonicalArtifactPath) {
      lines.push(
        `- Current generated user projection artifact: ${params.projectionVersion.canonicalArtifactPath}`,
      );
    }
    return lines.join("\n");
  }

  if (params.fileName === DEFAULT_TOOLS_FILENAME) {
    lines.push(
      "- Keep this file local and operational: environment-specific notes belong here, not in shared skills.",
    );
    lines.push(
      ...renderProjectPointers("Active workspace", params.canonicalSources.activeProjects),
    );
    return lines.join("\n");
  }

  if (params.fileName === DEFAULT_BOOTSTRAP_FILENAME) {
    lines.push("- This remains a startup compatibility artifact.");
    lines.push(
      "- Runtime policy still owns first-run ritual behavior until the dedicated agent slice replaces it.",
    );
    return lines.join("\n");
  }

  return lines.join("\n");
}

function resolveProjectionTargetIdForFile(fileName: string): string | undefined {
  if (fileName === DEFAULT_AGENTS_FILENAME) {
    return "agents-md";
  }
  if (fileName === DEFAULT_USER_FILENAME) {
    return "user-md";
  }
  if (fileName === DEFAULT_MEMORY_FILENAME || fileName === DEFAULT_MEMORY_ALT_FILENAME) {
    return "memory-md";
  }
  return undefined;
}

async function writeIfChanged(filePath: string, content: string) {
  let existing: string | undefined;
  try {
    existing = await fs.readFile(filePath, "utf8");
  } catch {
    existing = undefined;
  }
  if (existing === content) {
    return;
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

export function assembleBootstrapCompatibilityContent(params: {
  fileName: string;
  filePath: string;
  existingContent?: string;
  registryEntry: BootstrapFileRegistryEntry;
  canonicalSources: BootstrapCanonicalSources;
  projectionText?: string;
  projectionVersion?: WorkspaceProjectionVersionRecord;
}): string {
  let assembled = params.existingContent ?? "";
  if (params.projectionText) {
    assembled = upsertGeneratedZone(assembled, params.projectionText, MODEL_MEMORY_ZONE_BLOCK_ID);
  } else {
    assembled = removeGeneratedZone(assembled, MODEL_MEMORY_ZONE_BLOCK_ID);
  }

  assembled = upsertGeneratedZone(
    assembled,
    renderCanonicalBlock({
      fileName: params.fileName,
      registryEntry: params.registryEntry,
      canonicalSources: params.canonicalSources,
      projectionVersion: params.projectionVersion,
    }),
    CANONICAL_ZONE_BLOCK_ID,
  );

  if (
    params.fileName === DEFAULT_MEMORY_FILENAME ||
    params.fileName === DEFAULT_MEMORY_ALT_FILENAME
  ) {
    // Keep the live memory digest and canonical recall index above the large
    // legacy body so they survive prompt-budget truncation.
    assembled = prioritizeGeneratedZones(assembled, [
      MODEL_MEMORY_ZONE_BLOCK_ID,
      CANONICAL_ZONE_BLOCK_ID,
    ]);
  }
  return assembled;
}

export async function materializeCanonicalBootstrapCompatibilityFiles(params: {
  workspaceDir: string;
  config?: OpenClawConfig;
  sessionId?: string;
  agentId?: string;
}): Promise<MaterializeBootstrapCompatibilityResult> {
  const [registryEntries, canonicalSources, modelMemoryOverlay, agentCanonicalSources] =
    await Promise.all([
      loadBootstrapFileRegistry(),
      loadCanonicalSources(),
      resolveModelMemoryBootstrapOverlay({
        config: params.config,
        sessionId: params.sessionId,
        agentId: params.agentId,
        workspaceDir: params.workspaceDir,
      }),
      loadAgentCanonicalRuntimeSources(params.agentId),
    ]);

  const files: WorkspaceBootstrapFile[] = [];

  for (const entry of registryEntries.fileClasses.filter(
    (candidate) => !candidate.runtimePath.includes("*"),
  )) {
    const fileName = entry.runtimePath;
    const filePath = path.join(params.workspaceDir, fileName);
    let existingContent: string | undefined;
    try {
      existingContent = await fs.readFile(filePath, "utf8");
    } catch {
      existingContent = undefined;
    }

    const projectionTargetId = resolveProjectionTargetIdForFile(fileName);
    const projectionText = projectionTargetId
      ? modelMemoryOverlay?.projectionOutputs[projectionTargetId]
      : undefined;
    const projectionVersion = projectionTargetId
      ? modelMemoryOverlay?.projectionVersions.find(
          (version) => version.targetId === projectionTargetId,
        )
      : undefined;
    const canonicalRuntimeContent = agentCanonicalSources.runtimeFiles.get(fileName);

    if (
      !existingContent &&
      !canonicalRuntimeContent &&
      !projectionText &&
      fileName === DEFAULT_MEMORY_FILENAME
    ) {
      continue;
    }

    const assembledContent = assembleBootstrapCompatibilityContent({
      fileName,
      filePath,
      existingContent: canonicalRuntimeContent ?? existingContent,
      registryEntry: entry,
      canonicalSources,
      projectionText,
      projectionVersion,
    });

    if (assembledContent.trim().length === 0) {
      continue;
    }

    await writeIfChanged(filePath, assembledContent);
    files.push({
      name: fileName as WorkspaceBootstrapFile["name"],
      path: filePath,
      content: assembledContent,
      missing: false,
    });
  }

  for (const extraFile of agentCanonicalSources.extraFiles) {
    await writeIfChanged(path.join(params.workspaceDir, extraFile.relativePath), extraFile.content);
  }

  return { files, modelMemoryOverlay };
}
