import fs from "node:fs/promises";
import path from "node:path";
import { upsertGeneratedSectionBlock } from "./generated-sections.js";

export type DailyMemoryLeaf = {
  fileName: string;
  content: string;
};

function resolveDailyContinuityBlockId(date: string): string {
  return `memory-projection:daily-continuity:${date}`;
}

export async function listDailyMemoryLeafFiles(params: {
  workspaceDir: string;
  date: string;
}): Promise<string[]> {
  const memoryDir = path.join(params.workspaceDir, "memory");
  let entries: string[];
  try {
    entries = await fs.readdir(memoryDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.startsWith(`${params.date}-`) && entry.endsWith(".md"))
    .toSorted((left, right) => left.localeCompare(right));
}

export async function loadDailyMemoryLeaves(params: {
  workspaceDir: string;
  date: string;
}): Promise<DailyMemoryLeaf[]> {
  const memoryDir = path.join(params.workspaceDir, "memory");
  const fileNames = await listDailyMemoryLeafFiles(params);
  const leaves: DailyMemoryLeaf[] = [];
  for (const fileName of fileNames) {
    const content = await fs.readFile(path.join(memoryDir, fileName), "utf-8");
    leaves.push({
      fileName,
      content: content.replace(/\r\n/g, "\n").trim(),
    });
  }
  return leaves;
}

export function renderDailyContinuityBody(params: {
  date: string;
  leaves: DailyMemoryLeaf[];
}): string {
  const lines = [
    `# Daily Continuity: ${params.date}`,
    "",
    "This file is a compiled continuity view built from the raw dated session-memory leaves for this day.",
    "",
    "## Included leaves",
  ];

  if (params.leaves.length === 0) {
    lines.push("", "- No raw session-memory leaves were present for this day.");
    return lines.join("\n");
  }

  lines.push(...params.leaves.map((leaf) => `- ${leaf.fileName}`), "", "## Combined continuity");
  for (const leaf of params.leaves) {
    lines.push("", `### ${leaf.fileName}`, "", leaf.content);
  }
  return lines.join("\n");
}

export async function syncDailyContinuityFile(params: {
  workspaceDir: string;
  date: string;
  write: boolean;
}): Promise<{
  relPath: string;
  changed: boolean;
  wroteFile: boolean;
  leafCount: number;
  generatedChars: number;
}> {
  const leaves = await loadDailyMemoryLeaves({
    workspaceDir: params.workspaceDir,
    date: params.date,
  });
  const relPath = `memory/${params.date}.md`;
  const filePath = path.join(params.workspaceDir, relPath);
  const body = renderDailyContinuityBody({
    date: params.date,
    leaves,
  });

  let existing = "";
  try {
    existing = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const next = upsertGeneratedSectionBlock({
    content: existing,
    blockId: resolveDailyContinuityBlockId(params.date),
    body,
  });

  if (params.write && next.changed) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, next.content, "utf-8");
  }

  return {
    relPath,
    changed: next.changed,
    wroteFile: params.write && next.changed,
    leafCount: leaves.length,
    generatedChars: body.length,
  };
}
