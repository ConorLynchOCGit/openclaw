export type StructuralCorrectionTargetType =
  | "memory_id"
  | "candidate_id"
  | "source_event_id"
  | "source_marker"
  | "source_ref";

export type StructuralCorrectionTargetRef = {
  type: StructuralCorrectionTargetType;
  value: string;
};

export type ExplicitMemoryCommand =
  | {
      commandType: "project_fact";
      evidenceQuote: string;
      statement: string;
      sourceProfileId?: "researcher_report_artifact" | "cited_assistant_answer";
      citationRefs?: string[];
    }
  | {
      commandType: "correction_preference";
      evidenceQuote: string;
      preferenceObject: string;
      targetRefs: StructuralCorrectionTargetRef[];
    };

function stripSpeakerPrefix(text: string): string {
  return text.replace(/^\s*(?:user|assistant|system|developer):\s*/iu, "").trim();
}

function stripMarkerPrefix(text: string): string {
  return text.replace(/^[A-Z][A-Z0-9-]*:\s*/u, "").trim();
}

export function stripStorageRequestSuffix(text: string): string {
  return text
    .replace(/\s+please\s+(?:store|remember)\b[\s\S]*$/iu, "")
    .replace(/\s+do\s+not\s+remember\b[\s\S]*$/iu, "")
    .trim();
}

export function normalizeExplicitCommandText(text: string): string {
  return stripMarkerPrefix(stripSpeakerPrefix(text));
}

function cleanStatement(text: string): string {
  return stripStorageRequestSuffix(text)
    .replace(
      /\s+\b(?:citation|citations|source ref|source refs|source|sources)\s*:\s*[\s\S]+$/iu,
      "",
    )
    .trim();
}

function parseCitationRefs(text: string): string[] {
  const match = text.match(
    /\b(?:citation|citations|source ref|source refs|source|sources)\s*:\s*([\s\S]+)$/iu,
  );
  const value = match?.[1]?.trim();
  if (!value) {
    return [];
  }
  const urls = [...value.matchAll(/https?:\/\/[^\s,;)]+/giu)]
    .map((entry) => entry[0]?.replace(/[.]+$/u, "").trim())
    .filter((entry): entry is string => Boolean(entry));
  if (urls.length > 0) {
    return urls;
  }
  return value
    .replace(/\s+\b(?:treat|use|do not|don't|this is)\b[\s\S]*$/iu, "")
    .split(/[,\n;]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseSoftSourceProjectFact(
  normalizedText: string,
  _originalText: string,
): ExplicitMemoryCommand | null {
  const lower = normalizedText.toLowerCase();
  const sourceProfileId = /\bcited\s+assistant\s+answer\b/u.test(lower)
    ? "cited_assistant_answer"
    : /\b(?:researcher\s+report(?:\s+artifact)?|cited\s+soft(?:\s+evidence|\s+source)?)\b/u.test(
          lower,
        )
      ? "researcher_report_artifact"
      : undefined;
  if (!sourceProfileId) {
    return null;
  }

  const factMatch = normalizedText.match(
    /\b(?:cited\s+fact|fact|claim|evidence)\s*:\s*([\s\S]+)$/iu,
  );
  const rawStatement = factMatch?.[1] ?? "";
  const statement = cleanStatement(rawStatement);
  const citationRefs = parseCitationRefs(normalizedText);
  if (statement.length < 8 || citationRefs.length === 0) {
    return null;
  }

  return {
    commandType: "project_fact",
    evidenceQuote: statement,
    statement,
    sourceProfileId,
    citationRefs,
  };
}

function parseRememberProjectFact(
  normalizedText: string,
  originalText: string,
): ExplicitMemoryCommand | null {
  const colonMatch = normalizedText.match(
    /\b(?:please\s+)?(?:remember|store|save)(?:\s+this)?(?:\s+exact)?(?:\s+(?:project\s+)?(?:fact|value|marker|memory))?(?:\s+for\s+(?:project|workspace)\s+[^:,.]+)?\s*:\s*([\s\S]+)$/iu,
  );
  const thatMatch = normalizedText.match(/\b(?:please\s+)?remember\s+that\s+([\s\S]+)$/iu);
  const statement = cleanStatement(colonMatch?.[1] ?? thatMatch?.[1] ?? "");
  if (statement.length < 8) {
    return null;
  }
  return {
    commandType: "project_fact",
    evidenceQuote: originalText,
    statement,
  };
}

export function parseStructuralCorrectionTargetRefs(
  targetText: string | undefined,
): StructuralCorrectionTargetRef[] {
  if (!targetText) {
    return [];
  }
  const refs: StructuralCorrectionTargetRef[] = [];
  const pattern =
    /\b(memory_id|candidate_id|source_event_id|source_marker|source_ref)\s*=\s*([^\s,;]+)/giu;
  for (const match of targetText.matchAll(pattern)) {
    const type = match[1] as StructuralCorrectionTargetType;
    const value = match[2]?.trim();
    if (!value) {
      continue;
    }
    refs.push({ type, value });
  }
  return refs;
}

export function parseExplicitMemoryCommand(text: string): ExplicitMemoryCommand | null {
  const normalizedText = normalizeExplicitCommandText(text);
  const softSourceCommand = parseSoftSourceProjectFact(normalizedText, text);
  if (softSourceCommand) {
    return softSourceCommand;
  }

  const projectFactMatch = normalizedText.match(
    /\bdurable\s+(?:workspace\s+)?project\s+fact:\s*([\s\S]+)$/iu,
  );
  if (projectFactMatch) {
    const statement = cleanStatement(projectFactMatch[1] ?? "");
    if (statement.length >= 12) {
      return {
        commandType: "project_fact",
        evidenceQuote: text,
        statement,
      };
    }
  }

  const rememberProjectFact = parseRememberProjectFact(normalizedText, text);
  if (rememberProjectFact) {
    return rememberProjectFact;
  }

  const correctionMatch = normalizedText.match(
    /\bdurable\s+correction(?:\s+targeting\s+([\s\S]*?))?\s*:\s*replace\b[\s\S]*?\bwith\s+this\s+standing(?:\s+[\w-]+){0,8}\s+preference:\s*([\s\S]+)$/iu,
  );
  if (!correctionMatch) {
    return null;
  }
  const preferenceObject = stripStorageRequestSuffix(correctionMatch[2] ?? "");
  if (preferenceObject.length < 8) {
    return null;
  }
  return {
    commandType: "correction_preference",
    evidenceQuote: text,
    preferenceObject,
    targetRefs: parseStructuralCorrectionTargetRefs(correctionMatch[1]),
  };
}
