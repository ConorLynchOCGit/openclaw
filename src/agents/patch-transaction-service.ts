export type PatchTransactionEdit = {
  path?: string;
  oldText?: string;
  newText: string;
  startLine?: number;
  endLine?: number;
  insertBeforeLine?: number;
  insertAfterLine?: number;
  expectedOldText?: string;
};

type RequiredParamGroupLike = {
  keys: readonly string[];
  allowEmpty?: boolean;
  label?: string;
  validator?: (record: Record<string, unknown>) => boolean;
};

const EDIT_OPERATION_TYPES = ["replace", "replace_lines", "insert_before", "insert_after"] as const;

function cloneRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : null;
}

function readPositiveInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value);
    return parsed >= 1 ? parsed : undefined;
  }
  return undefined;
}

function readOptionalPath(record: Record<string, unknown>): string | undefined {
  const pathValue = record.filePath ?? record.path ?? record.file_path;
  return typeof pathValue === "string" && pathValue.trim().length > 0 ? pathValue : undefined;
}

function readReplacementText(record: Record<string, unknown>): string | undefined {
  const value = record.newString ?? record.newText;
  return typeof value === "string" ? value : undefined;
}

function readOldText(record: Record<string, unknown>): string | undefined {
  const value = record.oldString ?? record.oldText;
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readGuardText(record: Record<string, unknown>): string | undefined {
  const value = record.guard ?? record.expectedOldText ?? record.expectedOldString;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeLegacyEditOperation(value: unknown): PatchTransactionEdit | null {
  const record = cloneRecord(value);
  if (!record) {
    return null;
  }
  const newText = readReplacementText(record);
  if (typeof newText !== "string") {
    return null;
  }
  const pathValue = readOptionalPath(record);
  const expectedOldText = readGuardText(record);
  const base = {
    ...(pathValue ? { path: pathValue } : {}),
    newText,
    ...(expectedOldText ? { expectedOldText } : {}),
  };
  const oldText = readOldText(record);
  if (oldText) {
    return { ...base, oldText };
  }
  const startLine = readPositiveInteger(record.startLine);
  const endLine = readPositiveInteger(record.endLine);
  if (startLine !== undefined && endLine !== undefined && endLine >= startLine) {
    return { ...base, startLine, endLine };
  }
  const insertBeforeLine = readPositiveInteger(record.insertBeforeLine);
  const insertAfterLine = readPositiveInteger(record.insertAfterLine);
  if (insertBeforeLine !== undefined && insertAfterLine === undefined) {
    return { ...base, insertBeforeLine };
  }
  if (insertAfterLine !== undefined && insertBeforeLine === undefined) {
    return { ...base, insertAfterLine };
  }
  return null;
}

function normalizeCanonicalOperation(value: unknown): PatchTransactionEdit | null {
  const record = cloneRecord(value);
  if (!record) {
    return null;
  }
  const type = record.type;
  if (type === "replace") {
    return normalizeLegacyEditOperation(record);
  }
  if (type === "replace_lines") {
    const newText = typeof record.text === "string" ? record.text : undefined;
    const startLine = readPositiveInteger(record.startLine);
    const endLine = readPositiveInteger(record.endLine);
    if (
      newText === undefined ||
      startLine === undefined ||
      endLine === undefined ||
      endLine < startLine
    ) {
      return null;
    }
    const pathValue = readOptionalPath(record);
    return {
      ...(pathValue ? { path: pathValue } : {}),
      startLine,
      endLine,
      newText,
      ...(readGuardText(record) ? { expectedOldText: readGuardText(record) } : {}),
    };
  }
  if (type === "insert_before" || type === "insert_after") {
    const newText = typeof record.text === "string" ? record.text : undefined;
    const line = readPositiveInteger(record.line);
    if (newText === undefined || line === undefined) {
      return null;
    }
    const pathValue = readOptionalPath(record);
    return {
      ...(pathValue ? { path: pathValue } : {}),
      ...(type === "insert_before" ? { insertBeforeLine: line } : { insertAfterLine: line }),
      newText,
      ...(readGuardText(record) ? { expectedOldText: readGuardText(record) } : {}),
    };
  }
  return normalizeLegacyEditOperation(record);
}

function pushUniqueEditOperation(edits: PatchTransactionEdit[], edit: PatchTransactionEdit): void {
  const key = JSON.stringify(edit);
  if (!edits.some((existing) => JSON.stringify(existing) === key)) {
    edits.push(edit);
  }
}

export function normalizeEditToolParams(params: unknown): unknown {
  const record = cloneRecord(params);
  if (!record) {
    return params;
  }
  const pathValue = readOptionalPath(record);
  const normalized: Record<string, unknown> = {
    ...record,
    ...(pathValue ? { path: pathValue } : {}),
  };
  const normalizedEdits: PatchTransactionEdit[] = [];

  if (Array.isArray(record.operations)) {
    for (const operation of record.operations) {
      const normalizedEdit = normalizeCanonicalOperation(operation);
      if (normalizedEdit) {
        pushUniqueEditOperation(normalizedEdits, normalizedEdit);
      }
    }
  }
  if (Array.isArray(record.edits)) {
    for (const edit of record.edits) {
      const normalizedEdit = normalizeCanonicalOperation(edit);
      if (normalizedEdit) {
        pushUniqueEditOperation(normalizedEdits, normalizedEdit);
      }
    }
  }
  const topLevelEdit = normalizeLegacyEditOperation(record);
  if (topLevelEdit) {
    pushUniqueEditOperation(normalizedEdits, topLevelEdit);
  }
  if (normalizedEdits.length > 0) {
    normalized.edits = normalizedEdits;
    delete normalized.operations;
  }
  if (typeof record.replaceAll === "boolean") {
    normalized.replaceAll = record.replaceAll;
  }
  return normalized;
}

function isValidNormalizedOperation(value: unknown): value is PatchTransactionEdit {
  const edit = normalizeCanonicalOperation(value);
  return Boolean(edit);
}

export function hasValidEditTarget(record: Record<string, unknown>): boolean {
  const normalized = normalizeEditToolParams(record);
  const normalizedRecord = cloneRecord(normalized);
  if (typeof normalizedRecord?.path === "string" && normalizedRecord.path.trim().length > 0) {
    return true;
  }
  const edits = normalizedRecord?.edits;
  return (
    Array.isArray(edits) &&
    edits.length > 0 &&
    edits.every(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        typeof (entry as { path?: unknown }).path === "string" &&
        (entry as { path: string }).path.trim().length > 0,
    )
  );
}

export function hasValidEditOperations(record: Record<string, unknown>): boolean {
  const normalized = normalizeEditToolParams(record);
  const normalizedRecord = cloneRecord(normalized);
  const edits = normalizedRecord?.edits;
  return (
    Array.isArray(edits) &&
    edits.length > 0 &&
    edits.every((entry) => isValidNormalizedOperation(entry))
  );
}

export function buildEditToolVisibleSchema(parameters: unknown): unknown {
  const schema = cloneRecord(parameters) ?? { type: "object" };
  const lineNumberSchema = { type: "integer", minimum: 1 };
  return {
    ...schema,
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "File path to mutate.",
      },
      oldString: {
        type: "string",
        description: "Exact existing text to replace.",
      },
      newString: {
        type: "string",
        description: "Replacement text.",
      },
      replaceAll: {
        type: "boolean",
        description:
          "Replace every exact oldString occurrence. Use only when every match should change.",
      },
      operations: {
        type: "array",
        description:
          "Atomic multi-location edit batch. Use this when line/range insertion or multiple non-overlapping edits are clearer than one exact replacement.",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: [...EDIT_OPERATION_TYPES],
              description: "Operation type.",
            },
            filePath: {
              type: "string",
              description: "File path for this operation.",
            },
            oldString: {
              type: "string",
              description: "Exact text for a replace operation.",
            },
            newString: {
              type: "string",
              description: "Replacement text for a replace operation.",
            },
            startLine: {
              ...lineNumberSchema,
              description: "One-based first line for replace_lines.",
            },
            endLine: {
              ...lineNumberSchema,
              description: "One-based last line for replace_lines.",
            },
            line: {
              ...lineNumberSchema,
              description: "One-based anchor line for insert_before or insert_after.",
            },
            text: {
              type: "string",
              description: "Replacement or insertion text for line operations.",
            },
            guard: {
              type: "string",
              description:
                "Optional text expected in the selected range or anchor before mutating.",
            },
          },
          required: ["type", "filePath"],
          anyOf: [
            { required: ["type", "filePath", "oldString", "newString"] },
            { required: ["type", "filePath", "startLine", "endLine", "text"] },
            { required: ["type", "filePath", "line", "text"] },
          ],
          additionalProperties: false,
        },
      },
    },
    required: [],
    anyOf: [{ required: ["filePath", "oldString", "newString"] }, { required: ["operations"] }],
    additionalProperties: false,
  };
}

export function editRequiredParamGroups(): readonly RequiredParamGroupLike[] {
  return [
    {
      keys: ["filePath", "operations"],
      label: "filePath or operations[].filePath",
      validator: hasValidEditTarget,
    },
    {
      keys: ["oldString", "operations"],
      label: "oldString/newString or operations[]",
      validator: hasValidEditOperations,
    },
  ];
}

export function buildInvalidEditParameterMessage(record: Record<string, unknown>): string {
  const hasOld = typeof (record.oldString ?? record.oldText) === "string";
  const hasNew = typeof (record.newString ?? record.newText) === "string";
  if (hasOld && !hasNew) {
    return [
      "Cannot apply edit: replacement text is missing.",
      "",
      "You supplied oldString but no newString.",
      "Use one of:",
      "",
      "edit({filePath, oldString, newString})",
      "",
      'edit({operations:[{type:"insert_after", filePath, line, text}]})',
      "",
      'edit({operations:[{type:"replace_lines", filePath, startLine, endLine, text}]})',
      "",
      "If this repeats, do not call edit again with oldString only. Provide newString or use edit({operations:[...]}).",
    ].join("\n");
  }
  if (Array.isArray(record.operations)) {
    return [
      "Invalid edit operations.",
      "Use one of:",
      "",
      'edit({operations:[{type:"replace", filePath, oldString, newString}]})',
      'edit({operations:[{type:"insert_after", filePath, line, text}]})',
      'edit({operations:[{type:"replace_lines", filePath, startLine, endLine, text}]})',
    ].join("\n");
  }
  return [
    "Missing required edit shape.",
    "Use edit({filePath, oldString, newString}) or edit({operations:[...]}).",
    "Supported operation types: replace, replace_lines, insert_before, insert_after.",
  ].join("\n");
}
