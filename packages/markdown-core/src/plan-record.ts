import { parseFrontmatterBlock } from "./frontmatter.js";

export type PlanRecord = {
  title: string;
  project: string;
  status: string;
  executionSlices: string[];
  risks: string[];
  acceptanceCriteria: string[];
};

export type PlanRecordDiagnostic = {
  code: string;
  message: string;
  path: string;
};

export type PlanRecordParseResult =
  | {
      ok: true;
      record: PlanRecord;
      warnings: PlanRecordDiagnostic[];
    }
  | {
      ok: false;
      partialRecord: Partial<PlanRecord>;
      errors: PlanRecordDiagnostic[];
      warnings: PlanRecordDiagnostic[];
    };

type Section = {
  title: string;
  normalizedTitle: string;
  level: number;
  lines: string[];
};

type FenceState = {
  marker: "`" | "~";
  length: number;
};

const KNOWN_STATUSES = new Set(["draft", "red_teamed", "approved", "in_execution", "superseded"]);

const SECTION_ALIASES = {
  executionSlices: new Set(["execution slices"]),
  risks: new Set(["risks"]),
  acceptanceCriteria: new Set(["acceptance criteria", "definition of done"]),
};

function normalizeMarkdown(markdown: string): string {
  return (markdown ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---")) {
    return markdown;
  }
  const endIndex = markdown.indexOf("\n---", 3);
  if (endIndex === -1) {
    return markdown;
  }
  return markdown.slice(endIndex + 4).replace(/^\n/, "");
}

function normalizeHeading(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseHeading(line: string): { level: number; title: string } | undefined {
  const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
  if (!match) {
    return undefined;
  }
  return {
    level: match[1].length,
    title: match[2].trim(),
  };
}

function parseFenceLine(line: string): FenceState | undefined {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
  if (!match) {
    return undefined;
  }
  const marker = match[1][0] as "`" | "~";
  return {
    marker,
    length: match[1].length,
  };
}

function nextFenceState(line: string, state: FenceState | undefined): FenceState | undefined {
  const fence = parseFenceLine(line);
  if (!fence) {
    return state;
  }
  if (!state) {
    return fence;
  }
  if (fence.marker === state.marker && fence.length >= state.length) {
    return undefined;
  }
  return state;
}

function splitSections(body: string): Section[] {
  const sections: Section[] = [];
  const lines = body.split("\n");
  const headingAtLine = new Map<number, { level: number; title: string }>();
  let fenceState: FenceState | undefined;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const nextState = nextFenceState(line, fenceState);
    if (nextState !== fenceState) {
      fenceState = nextState;
      continue;
    }
    if (fenceState) {
      continue;
    }
    const heading = parseHeading(line);
    if (heading) {
      headingAtLine.set(i, heading);
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const heading = headingAtLine.get(i);
    if (!heading) {
      continue;
    }

    const sectionLines: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const nextHeading = headingAtLine.get(j);
      if (nextHeading && nextHeading.level <= heading.level) {
        break;
      }
      sectionLines.push(lines[j]);
    }

    sections.push({
      title: heading.title,
      normalizedTitle: normalizeHeading(heading.title),
      level: heading.level,
      lines: sectionLines,
    });
  }

  return sections;
}

function findScalar(body: string, key: string): string | undefined {
  const pattern = new RegExp(`^${key}:\\s*(.+?)\\s*$`, "i");
  let fenceState: FenceState | undefined;

  for (const line of body.split("\n")) {
    const nextState = nextFenceState(line, fenceState);
    if (nextState !== fenceState) {
      fenceState = nextState;
      continue;
    }
    if (fenceState) {
      continue;
    }
    const match = line.match(pattern);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return undefined;
}

function findTitle(frontmatter: Record<string, string>, sections: Section[]): string | undefined {
  const frontmatterTitle = frontmatter.title?.trim();
  if (frontmatterTitle) {
    return frontmatterTitle;
  }

  const firstH1 = sections.find((section) => section.level === 1);
  if (!firstH1 || !/^plan record:\s*/i.test(firstH1.title)) {
    return undefined;
  }
  return firstH1.title.replace(/^plan record:\s*/i, "").trim();
}

function findSection(
  sections: Section[],
  aliases: Set<string>,
  path: string,
  diagnostics: PlanRecordDiagnostic[],
): Section | undefined {
  const matches = sections.filter(
    (section) => section.level <= 2 && aliases.has(section.normalizedTitle),
  );
  if (matches.length > 1) {
    diagnostics.push({
      code: "duplicate_section",
      message: `Multiple sections matched ${path}.`,
      path,
    });
  }
  return matches[0];
}

function firstParagraph(lines: string[]): string | undefined {
  const paragraph: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      if (paragraph.length > 0) {
        break;
      }
      continue;
    }
    paragraph.push(line.trim());
  }
  const text = paragraph.join(" ").trim();
  return text || undefined;
}

function extractListItems(lines: string[]): string[] {
  const items: string[] = [];
  let current: string[] = [];
  let fenceState: FenceState | undefined;

  function flush(): void {
    const text = current.join("\n").trim();
    if (text) {
      items.push(text);
    }
    current = [];
  }

  for (const line of lines) {
    const nextState = nextFenceState(line, fenceState);
    if (nextState !== fenceState) {
      fenceState = nextState;
      continue;
    }
    if (fenceState) {
      continue;
    }
    const item = line.match(/^ {0,1}(?:[-*+]|\d+[.)])\s+(.+)$/);
    if (item) {
      flush();
      current.push(item[1].trim());
      continue;
    }
    if (current.length > 0 && (line.trim() === "" || /^\s{2,}\S/.test(line))) {
      current.push(line.trim().replace(/^(?:[-*+]|\d+[.)])\s+/, ""));
      continue;
    }
  }

  flush();
  return items;
}

function extractChildHeadingBlocks(section: Section): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let fenceState: FenceState | undefined;

  function flush(): void {
    const text = current.join("\n").trim();
    if (text) {
      blocks.push(text);
    }
    current = [];
  }

  for (const line of section.lines) {
    const nextState = nextFenceState(line, fenceState);
    if (nextState !== fenceState) {
      fenceState = nextState;
      if (current.length > 0) {
        current.push(line);
      }
      continue;
    }
    const heading = fenceState ? undefined : parseHeading(line);
    if (heading && heading.level === section.level + 1) {
      flush();
      current.push(heading.title);
      continue;
    }
    if (current.length > 0) {
      current.push(line);
    }
  }

  flush();
  return blocks;
}

function extractSectionItems(section: Section | undefined, preferChildHeadings = false): string[] {
  if (!section) {
    return [];
  }
  if (preferChildHeadings) {
    const blocks = extractChildHeadingBlocks(section);
    if (blocks.length > 0) {
      return blocks;
    }
  }
  const listItems = extractListItems(section.lines);
  if (listItems.length > 0) {
    return listItems;
  }
  const paragraph = firstParagraph(section.lines);
  return paragraph ? [paragraph] : [];
}

function requireString(
  value: string | undefined,
  path: string,
  errors: PlanRecordDiagnostic[],
): string | undefined {
  if (value?.trim()) {
    return value.trim();
  }
  errors.push({
    code: "missing_required_field",
    message: `Missing required plan record field: ${path}.`,
    path,
  });
  return undefined;
}

function requireItems(
  value: string[],
  path: string,
  errors: PlanRecordDiagnostic[],
): string[] | undefined {
  if (value.length > 0) {
    return value;
  }
  errors.push({
    code: "missing_required_section",
    message: `Missing required plan record section content: ${path}.`,
    path,
  });
  return undefined;
}

export function parsePlanRecord(markdown: string): PlanRecordParseResult {
  const normalized = normalizeMarkdown(markdown);
  const frontmatter = parseFrontmatterBlock(normalized);
  const body = stripFrontmatter(normalized);
  const sections = splitSections(body);
  const errors: PlanRecordDiagnostic[] = [];
  const warnings: PlanRecordDiagnostic[] = [];

  if (frontmatter.type && frontmatter.type !== "plan_record") {
    errors.push({
      code: "unexpected_type",
      message: `Expected frontmatter type "plan_record", got "${frontmatter.type}".`,
      path: "type",
    });
  }

  const executionSection = findSection(
    sections,
    SECTION_ALIASES.executionSlices,
    "executionSlices",
    errors,
  );
  const risksSection = findSection(sections, SECTION_ALIASES.risks, "risks", errors);
  const acceptanceSection = findSection(
    sections,
    SECTION_ALIASES.acceptanceCriteria,
    "acceptanceCriteria",
    errors,
  );

  const title = requireString(findTitle(frontmatter, sections), "title", errors);
  const project = requireString(
    frontmatter.project ?? findScalar(body, "Project"),
    "project",
    errors,
  );
  const status = requireString(frontmatter.status ?? findScalar(body, "Status"), "status", errors);
  const executionSlices = requireItems(
    extractSectionItems(executionSection, true),
    "executionSlices",
    errors,
  );
  const risks = requireItems(extractSectionItems(risksSection), "risks", errors);
  const acceptanceCriteria = requireItems(
    extractSectionItems(acceptanceSection),
    "acceptanceCriteria",
    errors,
  );

  if (status && !KNOWN_STATUSES.has(status)) {
    errors.push({
      code: "unknown_status",
      message: `Unknown plan record status "${status}".`,
      path: "status",
    });
  }

  const partialRecord: Partial<PlanRecord> = {
    ...(title ? { title } : {}),
    ...(project ? { project } : {}),
    ...(status ? { status } : {}),
    ...(executionSlices ? { executionSlices } : {}),
    ...(risks ? { risks } : {}),
    ...(acceptanceCriteria ? { acceptanceCriteria } : {}),
  };

  if (errors.length > 0) {
    return {
      ok: false,
      partialRecord,
      errors,
      warnings,
    };
  }

  return {
    ok: true,
    record: partialRecord as PlanRecord,
    warnings,
  };
}
