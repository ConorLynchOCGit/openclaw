import { createHash } from "node:crypto";
import type { AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import type { SessionSystemPromptReport } from "../config/sessions/types.js";
import { buildBootstrapInjectionStats } from "./bootstrap-budget.js";
import { buildContextSegmentPlan } from "./context-segment-planner.js";
import type { EmbeddedContextFile } from "./pi-embedded-helpers.js";
import type { WorkspaceBootstrapFile } from "./workspace.js";

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

function parseSkillBlocks(skillsPrompt: string): Array<{ name: string; blockChars: number }> {
  const prompt = skillsPrompt.trim();
  if (!prompt) {
    return [];
  }
  const blocks = Array.from(prompt.matchAll(/<skill>[\s\S]*?<\/skill>/gi)).map(
    (match) => match[0] ?? "",
  );
  return blocks
    .map((block) => {
      const name = block.match(/<name>\s*([^<]+?)\s*<\/name>/i)?.[1]?.trim() || "(unknown)";
      return { name, blockChars: block.length };
    })
    .filter((b) => b.blockChars > 0);
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

function extractToolListText(systemPrompt: string): string {
  const markerA = "Tool names are case-sensitive. Call tools exactly as listed.\n";
  const markerB =
    "\nTOOLS.md does not control tool availability; it is user guidance for how to use external tools.";
  const extracted = extractBetween(systemPrompt, markerA, markerB);
  if (!extracted.found) {
    return "";
  }
  return extracted.text.replace(markerA, "").trim();
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

function extractApprovedMemoryContextText(systemPrompt: string): string {
  const marker = "\n## Approved Durable Memory Context\n";
  const inlineMarker = "## Approved Durable Memory Context\n";
  const start = systemPrompt.indexOf(marker);
  if (start !== -1) {
    return systemPrompt.slice(start + 1).trim();
  }
  if (systemPrompt.startsWith(inlineMarker)) {
    return systemPrompt.trim();
  }
  const directPackMatch = systemPrompt.match(
    /(?:^|\n)(## (?:User|Project|Procedure) Memory Pack\n[\s\S]*)$/u,
  );
  if (directPackMatch?.[1]) {
    return directPackMatch[1].trim();
  }
  return "";
}

function stripApprovedMemoryContextText(systemPrompt: string): string {
  const marker = "\n## Approved Durable Memory Context\n";
  const start = systemPrompt.indexOf(marker);
  if (start !== -1) {
    return systemPrompt.slice(0, start).trimEnd();
  }
  if (systemPrompt.startsWith("## Approved Durable Memory Context\n")) {
    return "";
  }
  const directPackMatch = systemPrompt.match(
    /^(?<prefix>[\s\S]*?)(?:\n)?## (?:User|Project|Procedure) Memory Pack\n[\s\S]*$/u,
  );
  if (directPackMatch?.groups?.prefix !== undefined) {
    return directPackMatch.groups.prefix.trimEnd();
  }
  return systemPrompt;
}

function extractMemoryPackEntries(
  promptText: string,
): NonNullable<SessionSystemPromptReport["memoryPacks"]>["entries"] {
  const titleMatches = Array.from(
    promptText.matchAll(
      /^## (?<title>User Memory Pack|Project Memory Pack|Procedure Memory Pack)$/gmu,
    ),
  );

  return titleMatches.map((match, index) => {
    const title = match.groups?.title?.trim() ?? "User Memory Pack";
    const start = match.index ?? 0;
    const nextStart = titleMatches[index + 1]?.index ?? promptText.length;
    const sectionText = promptText.slice(start, nextStart).trim();
    const body = sectionText.replace(/^## [^\n]+\n?/u, "").trim();
    const kind =
      title === "Project Memory Pack"
        ? "project"
        : title === "Procedure Memory Pack"
          ? "procedure"
          : "user";
    const text = sectionText;
    const itemCount = body
      .split("\n")
      .map((line) => line.trim())
      .filter(
        (line) =>
          line.startsWith("- ") &&
          !line.includes("Additional active entries omitted to stay within"),
      ).length;
    const omittedItemCount = Number(
      body.match(
        /Additional active entries omitted to stay within the prompt budget \((\d+) more\)\./u,
      )?.[1] ?? 0,
    );
    return {
      kind,
      title,
      chars: text.length,
      approxTokens: estimateTokens(text.length),
      hash: hashText(text),
      itemCount,
      omittedItemCount,
    };
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
  runtimeBuild?: SessionSystemPromptReport["runtimeBuild"];
  mainMemoryRouting?: SessionSystemPromptReport["mainMemoryRouting"];
  segmentPlanInput?: {
    tokenBudget?: number;
    contextEngineSystemPromptAddition?: string;
    hookPrependSystemContext?: string;
    hookAppendSystemContext?: string;
    hookSystemPromptOverride?: string;
    promptPrependContext?: string;
    currentPrompt?: string;
    messages?: AgentMessage[];
  };
}): SessionSystemPromptReport {
  const systemPrompt = params.systemPrompt.trim();
  const projectContext = extractBetween(
    systemPrompt,
    "\n# Project Context\n",
    "\n## Silent Replies\n",
  );
  const projectContextChars = projectContext.text.length;
  const toolListText = extractToolListText(systemPrompt);
  const toolListChars = toolListText.length;
  const toolsEntries = buildToolsEntries(params.tools);
  const toolsSchemaChars = toolsEntries.reduce((sum, t) => sum + (t.schemaChars ?? 0), 0);
  const skillsEntries = parseSkillBlocks(params.skillsPrompt);
  const promptPrependContext = params.segmentPlanInput?.promptPrependContext?.trim() ?? "";
  const approvedMemoryContextText =
    extractApprovedMemoryContextText(systemPrompt) ||
    extractApprovedMemoryContextText(promptPrependContext);
  const baseSystemPrompt = stripApprovedMemoryContextText(systemPrompt);
  const memoryPackEntries = extractMemoryPackEntries(approvedMemoryContextText || systemPrompt);
  const injectedFilesHash = hashText(
    params.injectedFiles.map((file) => `${file.path}\n${file.content}`).join("\n\n---\n\n"),
  );
  const toolsListHash = hashText(toolListText);
  const toolsSchemaHash = hashText(
    JSON.stringify(
      toolsEntries.map((entry) => ({
        name: entry.name,
        schemaChars: entry.schemaChars,
        propertiesCount: entry.propertiesCount ?? null,
      })),
    ),
  );
  const contextSegments = buildContextSegmentPlan({
    baseSystemPrompt,
    approvedMemoryContextText,
    tokenBudget: params.segmentPlanInput?.tokenBudget,
    contextEngineSystemPromptAddition: params.segmentPlanInput?.contextEngineSystemPromptAddition,
    hookPrependSystemContext: params.segmentPlanInput?.hookPrependSystemContext,
    hookAppendSystemContext: params.segmentPlanInput?.hookAppendSystemContext,
    hookSystemPromptOverride: params.segmentPlanInput?.hookSystemPromptOverride,
    promptPrependContext,
    currentPrompt: params.segmentPlanInput?.currentPrompt,
    messages: params.segmentPlanInput?.messages,
  });

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
    ...(params.runtimeBuild ? { runtimeBuild: params.runtimeBuild } : {}),
    ...(params.mainMemoryRouting ? { mainMemoryRouting: params.mainMemoryRouting } : {}),
    systemPrompt: {
      chars: systemPrompt.length,
      projectContextChars,
      nonProjectContextChars: Math.max(0, systemPrompt.length - projectContextChars),
    },
    promptArtifacts: {
      fullSystemPromptHash: hashText(systemPrompt),
      fullSystemPromptChars: systemPrompt.length,
      baseSystemPromptHash: hashText(baseSystemPrompt),
      baseSystemPromptChars: baseSystemPrompt.length,
      ...(approvedMemoryContextText
        ? {
            memoryPackPromptHash: hashText(approvedMemoryContextText),
            memoryPackPromptChars: approvedMemoryContextText.length,
          }
        : {}),
      injectedFilesHash,
      injectedFilesChars: params.injectedFiles.reduce((sum, file) => sum + file.content.length, 0),
      skillsHash: hashText(params.skillsPrompt),
      skillsChars: params.skillsPrompt.length,
      toolsListHash,
      toolsListChars: toolListText.length,
      toolsSchemaHash,
      toolsSchemaChars,
    },
    ...(memoryPackEntries.length > 0
      ? {
          memoryPacks: {
            promptChars: memoryPackEntries.reduce((sum, entry) => sum + entry.chars, 0),
            entries: memoryPackEntries,
          },
        }
      : {}),
    contextSegments,
    injectedWorkspaceFiles: buildBootstrapInjectionStats({
      bootstrapFiles: params.bootstrapFiles,
      injectedFiles: params.injectedFiles,
    }),
    skills: {
      promptChars: params.skillsPrompt.length,
      entries: skillsEntries,
    },
    tools: {
      listChars: toolListChars,
      schemaChars: toolsSchemaChars,
      entries: toolsEntries,
    },
  };
}
