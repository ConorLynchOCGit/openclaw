const LIVE_AGENT_WORKSPACE_ROOT = "/home/node/.openclaw/workspace";

const HOST_PATH_PATTERN =
  /\/(?:srv\/openclaw-next\/(?:home-repo|src\/openclaw|artifacts)|root\/services\/openclaw-roles\/live)(?:\/[^\s"'`<>()\]\[]*)?/g;

const DISALLOWED_HOST_PATH_PATTERN = /\/(?:srv|root)(?:\/[^\s"'`<>()\]\[]*)?/g;

const ROOT_WORKSPACE_RELATIVE_PREFIXES = [
  ".agents/",
  ".codex/",
  "artifacts/",
  "business-ops/",
  "concepts/",
  "config/",
  "decisions/",
  "docs/",
  "plans/",
  "prompts/",
  "templates/",
];

function normalizePosixPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/\/+/g, "/");
}

function stripTrailingPathPunctuation(value: string): { core: string; suffix: string } {
  const match = /[.,;:]+$/u.exec(value);
  if (!match) {
    return { core: value, suffix: "" };
  }
  return {
    core: value.slice(0, -match[0].length),
    suffix: match[0],
  };
}

function trimLeadingSlash(value: string): string {
  return value.replace(/^\/+/u, "");
}

function rootAuthoringPathToLiveRelative(relativePath: string): string {
  const normalized = trimLeadingSlash(normalizePosixPath(relativePath));
  if (!normalized) {
    return ".";
  }
  if (ROOT_WORKSPACE_RELATIVE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return normalized;
  }
  return `src/openclaw/${normalized}`;
}

export function renderLiveAgentPathReference(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const { core, suffix } = stripTrailingPathPunctuation(trimmed);
  if (core === "/srv/openclaw-next/home-repo") {
    return `.${suffix}`;
  }
  if (core.startsWith("/srv/openclaw-next/home-repo/")) {
    return `${trimLeadingSlash(core.slice("/srv/openclaw-next/home-repo/".length))}${suffix}`;
  }
  if (core === "/srv/openclaw-next/src/openclaw") {
    return `src/openclaw${suffix}`;
  }
  if (core.startsWith("/srv/openclaw-next/src/openclaw/")) {
    return `src/openclaw/${trimLeadingSlash(
      core.slice("/srv/openclaw-next/src/openclaw/".length),
    )}${suffix}`;
  }
  if (core === "/srv/openclaw-next/artifacts") {
    return `artifacts${suffix}`;
  }
  if (core.startsWith("/srv/openclaw-next/artifacts/")) {
    return `artifacts/${trimLeadingSlash(core.slice("/srv/openclaw-next/artifacts/".length))}${suffix}`;
  }
  if (core === "/root/services/openclaw-roles/live") {
    return `src/openclaw${suffix}`;
  }
  if (core.startsWith("/root/services/openclaw-roles/live/")) {
    return `${rootAuthoringPathToLiveRelative(
      core.slice("/root/services/openclaw-roles/live/".length),
    )}${suffix}`;
  }
  if (core === LIVE_AGENT_WORKSPACE_ROOT || core.startsWith(`${LIVE_AGENT_WORKSPACE_ROOT}/`)) {
    return `${trimLeadingSlash(core.slice(LIVE_AGENT_WORKSPACE_ROOT.length)) || "."}${suffix}`;
  }
  return undefined;
}

export function renderLiveAgentHandoffText(value: string): {
  text: string;
  replacements: Array<{ from: string; to: string }>;
  rejectedHostPaths: string[];
} {
  const replacements: Array<{ from: string; to: string }> = [];
  const text = value.replace(HOST_PATH_PATTERN, (match) => {
    const replacement = renderLiveAgentPathReference(match);
    if (!replacement) {
      return match;
    }
    replacements.push({ from: match, to: replacement });
    return replacement;
  });
  const rejectedHostPaths = Array.from(new Set(text.match(DISALLOWED_HOST_PATH_PATTERN) ?? []));
  return {
    text,
    replacements,
    rejectedHostPaths,
  };
}
