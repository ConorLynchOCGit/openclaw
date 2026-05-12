const FALLBACK = "Not reported";

type RoleReadbackInput = {
  roleName?: unknown;
  role?: unknown;
  roleRef?: unknown;
  roleId?: unknown;
  modelRef?: unknown;
  model?: unknown;
  providerModel?: unknown;
  modelRunRef?: unknown;
  status?: unknown;
  source?: unknown;
  modelAuthoredCloseout?: unknown;
  closeout?: unknown;
  closeoutSummary?: unknown;
  summary?: unknown;
  askedToDo?: unknown;
  whatIWasAskedToDo?: unknown;
  did?: unknown;
  workDone?: unknown;
  actions?: unknown;
  whatRoleDid?: unknown;
  actuallyDid?: unknown;
  limitations?: unknown;
  caveats?: unknown;
  filesOrArtifactsTouched?: unknown;
  artifactRefs?: unknown;
  evidenceRefs?: unknown;
  validationEvidence?: unknown;
  validation?: unknown;
  evidence?: unknown;
  eli5Progress?: unknown;
  eli5?: unknown;
  progress?: unknown;
};

type CloseoutReadbackInput = {
  roles?: unknown;
  roleReadbacks?: unknown;
  humanCloseoutSummary?: { roleReadbacks?: unknown } | null;
  leadReport?: unknown;
  leadCloseout?: unknown;
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(asText).filter(Boolean);
  }

  const text = asText(value);
  return text ? [text] : [];
}

function bulletList(items: unknown): string {
  const list = asList(items);
  if (list.length === 0) {
    return `- ${FALLBACK}`;
  }
  return list.map((item) => `- ${item}`).join("\n");
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = asText(value);
    if (text) {
      return text;
    }
  }
  return FALLBACK;
}

function roleTitle(role: RoleReadbackInput, index: number): string {
  return firstText(role.roleName, role.role, role.roleRef, role.roleId, `Role ${index + 1}`);
}

function roleModelLine(role: RoleReadbackInput): string {
  const roleRef = firstText(role.roleRef, role.roleName, role.role, role.roleId);
  const modelRef = firstText(role.modelRef, role.model, role.providerModel);
  const modelRunRef = asText(role.modelRunRef);
  return modelRunRef
    ? `Role ref: ${roleRef} | Model ref: ${modelRef} | Model run ref: ${modelRunRef}`
    : `Role ref: ${roleRef} | Model ref: ${modelRef}`;
}

function roleStatusLine(role: RoleReadbackInput): string | null {
  const status = asText(role.status);
  const source = asText(role.source);
  if (!status && !source) {
    return null;
  }
  if (status && source) {
    return `Role status: ${status} | Closeout source: ${source}`;
  }
  return status ? `Role status: ${status}` : `Closeout source: ${source}`;
}

function roleCloseoutText(role: RoleReadbackInput): string {
  return firstText(role.modelAuthoredCloseout, role.closeout, role.closeoutSummary, role.summary);
}

function roleAskedText(role: RoleReadbackInput): string {
  return firstText(role.whatIWasAskedToDo, role.askedToDo);
}

function readbackRoles(input: CloseoutReadbackInput): RoleReadbackInput[] {
  if (Array.isArray(input.roles)) {
    return input.roles as RoleReadbackInput[];
  }
  if (Array.isArray(input.roleReadbacks)) {
    return input.roleReadbacks as RoleReadbackInput[];
  }
  if (Array.isArray(input.humanCloseoutSummary?.roleReadbacks)) {
    return input.humanCloseoutSummary.roleReadbacks as RoleReadbackInput[];
  }
  return [];
}

export function buildCloseoutCapsuleReadback(input: CloseoutReadbackInput = {}): string {
  const roles = readbackRoles(input);
  const lines = ["## Closeout Capsule Readback"];

  if (roles.length === 0) {
    lines.push("", "No role closeouts were reported.");
  }

  roles.forEach((role, index) => {
    const statusLine = roleStatusLine(role);
    lines.push("", `### ${roleTitle(role, index)}`, roleModelLine(role));
    if (statusLine) {
      lines.push(statusLine);
    }
    lines.push(
      "",
      "What this role was asked to do:",
      bulletList(roleAskedText(role)),
      "",
      "Model-authored closeout:",
      roleCloseoutText(role),
      "",
      "What this role did:",
      bulletList(role.did ?? role.workDone ?? role.actions ?? role.whatRoleDid ?? role.actuallyDid),
      "",
      "Limitations:",
      bulletList(role.limitations ?? role.caveats),
      "",
      "Files/artifacts touched:",
      bulletList(role.filesOrArtifactsTouched ?? role.artifactRefs),
      "",
      "Evidence refs:",
      bulletList(role.evidenceRefs ?? role.evidence),
      "",
      "Validation evidence:",
      bulletList(role.validationEvidence ?? role.validation),
      "",
      "ELI5 progress:",
      bulletList(role.eli5Progress ?? role.eli5 ?? role.progress),
    );
  });

  const leadReport = firstText(input.leadReport, input.leadCloseout);
  if (leadReport !== FALLBACK) {
    lines.push("", "## Lead Report", leadReport);
  }

  return lines.join("\n");
}
