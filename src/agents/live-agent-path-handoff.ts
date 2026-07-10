const LIVE_AGENT_WORKSPACE_ROOT = "/home/node/.openclaw/workspace";

const HOST_PATH_PATTERN =
  /\/(?:srv\/openclaw-next\/(?:home-repo|src\/openclaw|artifacts)|home\/node\/\.openclaw\/workspace)(?:\/[^\s"'`<>()\][]*)?/g;

const DISALLOWED_HOST_PATH_PATTERN =
  /(?:^|[\s"'`<>()\][{}])(?<path>\/(?:srv|root)(?:\/[^\s"'`<>()\][{}]*)?)(?=$|[\s"'`<>()\][{},.;:!?])/gu;

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
  const rejectedHostPaths = Array.from(
    new Set(
      Array.from(text.matchAll(DISALLOWED_HOST_PATH_PATTERN), (match) => match.groups?.path).filter(
        (candidate): candidate is string => Boolean(candidate),
      ),
    ),
  );
  return {
    text,
    replacements,
    rejectedHostPaths,
  };
}
