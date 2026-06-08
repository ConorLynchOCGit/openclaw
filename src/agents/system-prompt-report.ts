import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { SessionSystemPromptReport } from "../config/sessions/types.js";
import { buildBootstrapInjectionStats } from "./bootstrap-budget.js";
import type { EmbeddedContextFile } from "./pi-embedded-helpers.js";
import type { WorkspaceBootstrapFile } from "./workspace.js";

export type RequiredProviderSkillSource = {
  name: string;
  path?: string;
  sourceRef?: string;
  sourceHash?: string | null;
};

export type RequiredProviderContextAdmission = {
  workspaceFileNames?: readonly string[];
  skillNames?: readonly string[];
  skillSources?: readonly RequiredProviderSkillSource[];
  rejectTruncatedWorkspaceFiles?: boolean;
};

export type RequiredProviderContextAdmissionDecision = {
  admitted: boolean;
  missingWorkspaceFileNames: string[];
  missingSkillNames: string[];
  truncatedWorkspaceFileNames: string[];
  reasonCodes: string[];
  message: string | null;
};

function extractBetween(
  input: string,
  startMarker: string,
  endMarker: string,
): { text: string; found: boolean } {
  const start = input.indexOf(startMarker);
  if (start === -1) {
    return { text: "", found: false };
  }
  const end = input.indexOf(endMarker, start + startMarker.length);
  if (end === -1) {
    return { text: input.slice(start), found: true };
  }
  return { text: input.slice(start, end), found: true };
}

function parseXmlAttr(attrs: string, name: string): string | undefined {
  return attrs.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"))?.[1]?.trim() || undefined;
}

function normalizeAdmissionLookupName(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }
  const parts = trimmed.split(/[\\/]/u);
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]?.trim();
    if (part) {
      return part;
    }
  }
  return "";
}

function normalizeAdmissionPath(value: string | null | undefined): string {
  return value?.trim().replace(/\\/gu, "/").replace(/\/+/gu, "/") ?? "";
}

function hasPathSeparator(value: string): boolean {
  return /[\\/]/u.test(value);
}

function matchesRequiredWorkspaceFile(
  entry: SessionSystemPromptReport["injectedWorkspaceFiles"][number],
  required: string,
): boolean {
  if (hasPathSeparator(required)) {
    const normalizedRequired = normalizeAdmissionPath(required);
    return (
      normalizeAdmissionPath(entry.path) === normalizedRequired ||
      normalizeAdmissionPath(entry.name) === normalizedRequired
    );
  }
  const requiredName = normalizeAdmissionLookupName(required);
  return normalizeAdmissionLookupName(entry.name || entry.path) === requiredName;
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeRequiredSkillSources(
  sources: readonly RequiredProviderSkillSource[] | undefined,
): RequiredProviderSkillSource[] {
  return (sources ?? [])
    .map((source) => ({
      name: source.name.trim(),
      ...(source.path?.trim() ? { path: source.path.trim() } : {}),
      ...(source.sourceRef?.trim() ? { sourceRef: source.sourceRef.trim() } : {}),
      ...(hasOwn(source, "sourceHash") ? { sourceHash: source.sourceHash ?? null } : {}),
    }))
    .filter((source) => source.name.length > 0);
}

function matchesRequiredSkillSource(
  entry: SessionSystemPromptReport["skills"]["entries"][number],
  required: RequiredProviderSkillSource,
): boolean {
  if ((entry.blockChars ?? 0) <= 0) {
    return false;
  }
  if (
    required.path &&
    normalizeAdmissionPath(entry.location) !== normalizeAdmissionPath(required.path)
  ) {
    return false;
  }
  if (required.sourceRef && entry.sourceRef !== required.sourceRef) {
    return false;
  }
  if (hasOwn(required, "sourceHash")) {
    const expectedHash = required.sourceHash?.trim() ?? "";
    if (!expectedHash || entry.sourceHash !== expectedHash) {
      return false;
    }
  }
  return true;
}

function parseSkillBlocks(skillsPrompt: string): SessionSystemPromptReport["skills"]["entries"] {
  const prompt = skillsPrompt.trim();
  if (!prompt) {
    return [];
  }
  const catalogBlocks = Array.from(prompt.matchAll(/<skill>[\s\S]*?<\/skill>/gi)).map(
    (match) => match[0] ?? "",
  );
  const activeBlocks = Array.from(
    prompt.matchAll(/<active_skill\b([^>]*)>[\s\S]*?<\/active_skill>/gi),
  ).map((match) => ({
    block: match[0] ?? "",
    attrs: match[1] ?? "",
  }));
  const parsed = catalogBlocks.map((block) => {
    const name = block.match(/<name>\s*([^<]+?)\s*<\/name>/i)?.[1]?.trim() || "(unknown)";
    return { name, blockChars: block.length };
  });
  for (const active of activeBlocks) {
    const name = parseXmlAttr(active.attrs, "name") || "(unknown)";
    parsed.push({
      name,
      blockChars: active.block.length,
      ...(parseXmlAttr(active.attrs, "location")
        ? { location: parseXmlAttr(active.attrs, "location") }
        : {}),
      ...(parseXmlAttr(active.attrs, "source_ref")
        ? { sourceRef: parseXmlAttr(active.attrs, "source_ref") }
        : {}),
      ...(parseXmlAttr(active.attrs, "source_hash")
        ? { sourceHash: parseXmlAttr(active.attrs, "source_hash") }
        : {}),
    });
  }
  return parsed.filter((b) => b.blockChars > 0);
}

function buildToolsEntries(tools: AgentTool[]): SessionSystemPromptReport["tools"]["entries"] {
  return tools.map((tool) => {
    const name = tool.name;
    const summary = tool.description?.trim() || tool.label?.trim() || "";
    const summaryChars = summary.length;
    const schemaChars = (() => {
      if (!tool.parameters || typeof tool.parameters !== "object") {
        return 0;
      }
      try {
        return JSON.stringify(tool.parameters).length;
      } catch {
        return 0;
      }
    })();
    const propertiesCount = (() => {
      const schema =
        tool.parameters && typeof tool.parameters === "object"
          ? (tool.parameters as Record<string, unknown>)
          : null;
      const props = schema && typeof schema.properties === "object" ? schema.properties : null;
      if (!props || typeof props !== "object") {
        return null;
      }
      return Object.keys(props as Record<string, unknown>).length;
    })();
    return { name, summaryChars, schemaChars, propertiesCount };
  });
}

export function buildSystemPromptReport(params: {
  source: SessionSystemPromptReport["source"];
  generatedAt: number;
  sessionId?: string;
  sessionKey?: string;
  provider?: string;
  model?: string;
  workspaceDir?: string;
  bootstrapMaxChars: number;
  bootstrapTotalMaxChars?: number;
  bootstrapTruncation?: SessionSystemPromptReport["bootstrapTruncation"];
  sandbox?: SessionSystemPromptReport["sandbox"];
  systemPrompt: string;
  bootstrapFiles: WorkspaceBootstrapFile[];
  injectedFiles: EmbeddedContextFile[];
  skillsPrompt: string;
  tools: AgentTool[];
}): SessionSystemPromptReport {
  const systemPrompt = params.systemPrompt.trim();
  const projectContext = extractBetween(
    systemPrompt,
    "\n# Project Context\n",
    "\n## Silent Replies\n",
  );
  const projectContextChars = projectContext.text.length;
  const toolsEntries = buildToolsEntries(params.tools);
  const toolsSchemaChars = toolsEntries.reduce((sum, t) => sum + (t.schemaChars ?? 0), 0);
  const skillsEntries = parseSkillBlocks(params.skillsPrompt);

  return {
    source: params.source,
    generatedAt: params.generatedAt,
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    provider: params.provider,
    model: params.model,
    workspaceDir: params.workspaceDir,
    bootstrapMaxChars: params.bootstrapMaxChars,
    bootstrapTotalMaxChars: params.bootstrapTotalMaxChars,
    ...(params.bootstrapTruncation ? { bootstrapTruncation: params.bootstrapTruncation } : {}),
    sandbox: params.sandbox,
    systemPrompt: {
      chars: systemPrompt.length,
      projectContextChars,
      nonProjectContextChars: Math.max(0, systemPrompt.length - projectContextChars),
    },
    injectedWorkspaceFiles: buildBootstrapInjectionStats({
      bootstrapFiles: params.bootstrapFiles,
      injectedFiles: params.injectedFiles,
    }),
    skills: {
      promptChars: params.skillsPrompt.length,
      entries: skillsEntries,
    },
    tools: {
      listChars: 0,
      schemaChars: toolsSchemaChars,
      entries: toolsEntries,
    },
  };
}

export function evaluateRequiredProviderContextAdmission(params: {
  report: SessionSystemPromptReport;
  required: RequiredProviderContextAdmission;
}): RequiredProviderContextAdmissionDecision {
  const requiredWorkspaceFileNames = Array.from(
    new Set((params.required.workspaceFileNames ?? []).map((name) => name.trim()).filter(Boolean)),
  );
  const requiredSkillNames = Array.from(
    new Set([
      ...(params.required.skillNames ?? []).map((name) => name.trim()).filter(Boolean),
      ...normalizeRequiredSkillSources(params.required.skillSources).map((source) => source.name),
    ]),
  );
  const requiredSkillSourcesByName = new Map(
    normalizeRequiredSkillSources(params.required.skillSources).map((source) => [
      source.name,
      source,
    ]),
  );
  const rejectTruncatedWorkspaceFiles = params.required.rejectTruncatedWorkspaceFiles !== false;
  const filesByName = new Map(
    params.report.injectedWorkspaceFiles.map((entry) => [
      normalizeAdmissionLookupName(entry.name || entry.path),
      entry,
    ]),
  );
  const skillsByName = new Map(
    params.report.skills.entries.map((entry) => [entry.name.trim(), entry]),
  );

  const missingWorkspaceFileNames: string[] = [];
  const truncatedWorkspaceFileNames: string[] = [];
  for (const name of requiredWorkspaceFileNames) {
    const entry = hasPathSeparator(name)
      ? params.report.injectedWorkspaceFiles.find((candidate) =>
          matchesRequiredWorkspaceFile(candidate, name),
        )
      : filesByName.get(normalizeAdmissionLookupName(name));
    if (!entry || entry.missing || entry.injectedChars <= 0) {
      missingWorkspaceFileNames.push(name);
    }
    if (rejectTruncatedWorkspaceFiles && entry?.truncated) {
      truncatedWorkspaceFileNames.push(name);
    }
  }

  const missingSkillNames: string[] = [];
  const mismatchedSkillSourceNames: string[] = [];
  for (const name of requiredSkillNames) {
    const entry = skillsByName.get(name);
    if (!entry || (entry.blockChars ?? 0) <= 0) {
      missingSkillNames.push(name);
      continue;
    }
    const requiredSource = requiredSkillSourcesByName.get(name);
    if (requiredSource && !matchesRequiredSkillSource(entry, requiredSource)) {
      missingSkillNames.push(name);
      mismatchedSkillSourceNames.push(name);
    }
  }

  const admitted =
    missingWorkspaceFileNames.length === 0 &&
    missingSkillNames.length === 0 &&
    truncatedWorkspaceFileNames.length === 0;
  const reasonCodes = [
    admitted
      ? "provider_context_required_admission_accepted"
      : "provider_context_required_admission_blocked",
    missingWorkspaceFileNames.length > 0
      ? "provider_context_required_workspace_files_missing"
      : null,
    truncatedWorkspaceFileNames.length > 0
      ? "provider_context_required_workspace_files_truncated"
      : null,
    mismatchedSkillSourceNames.length > 0
      ? "provider_context_required_skill_sources_mismatched"
      : null,
    missingSkillNames.length > 0 ? "provider_context_required_skills_missing" : null,
  ].filter((code): code is string => Boolean(code));
  const message = admitted
    ? null
    : [
        "Provider context admission failed before model invocation.",
        missingWorkspaceFileNames.length > 0
          ? `Missing workspace files: ${missingWorkspaceFileNames.join(", ")}.`
          : null,
        truncatedWorkspaceFileNames.length > 0
          ? `Truncated workspace files: ${truncatedWorkspaceFileNames.join(", ")}.`
          : null,
        missingSkillNames.length > 0
          ? `Missing or mismatched skills: ${missingSkillNames.join(", ")}.`
          : null,
      ]
        .filter((line): line is string => Boolean(line))
        .join(" ");
  return {
    admitted,
    missingWorkspaceFileNames,
    missingSkillNames,
    truncatedWorkspaceFileNames,
    reasonCodes,
    message,
  };
}
