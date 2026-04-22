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
  const projectFactMatch = normalizedText.match(
    /\bdurable\s+(?:workspace\s+)?project\s+fact:\s*([\s\S]+)$/iu,
  );
  if (projectFactMatch) {
    const statement = stripStorageRequestSuffix(projectFactMatch[1] ?? "");
    if (statement.length >= 12) {
      return {
        commandType: "project_fact",
        evidenceQuote: text,
        statement,
      };
    }
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
