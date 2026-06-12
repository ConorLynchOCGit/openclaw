import path from "node:path";
import { loadExecApprovals, resolveExecApprovalsFromFile } from "../infra/exec-approvals.js";

/**
 * Show the exact approved token in hints. Absolute paths stay absolute so the
 * hint cannot imply an equivalent PATH lookup that resolves to a different binary.
 */
function deriveExecShortName(fullPath: string): string {
  if (path.isAbsolute(fullPath)) {
    return fullPath;
  }
  const base = path.basename(fullPath);
  return base.replace(/\.exe$/i, "") || base;
}

function normalizedAgentId(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function describeExecTool(params?: { agentId?: string; hasCronTool?: boolean }): string {
  if (normalizedAgentId(params?.agentId) === "execution-validation-scout") {
    return [
      "Run focused validation commands only.",
      "Prefer repo-native commands: `pnpm test:file <test-file>`, `pnpm test:file <test-file> -- -t <name>`, or a named repo proof script from the prompt.",
      "Do not improvise raw TypeScript flag combinations or project-wide compiles unless a repo-native command failed and proves no focused command can answer the validation question.",
      "Do not use exec for file search, reading, editing, or writing; use read, grep, and glob for source navigation.",
      "Use workdir instead of `cd` chains. Keep output bounded; full oversized output is saved for normal read/grep follow-up.",
      "Independent validation commands may be run in parallel when they do not mutate shared state.",
    ].join(" ");
  }
  const base = [
    "Execute shell commands with background continuation for work that starts now.",
    "Use yieldMs/background to continue later via process tool.",
    "For long-running work started now, rely on automatic completion wake when it is enabled and the command emits output or fails; otherwise use process to confirm completion. Use process whenever you need logs, status, input, or intervention.",
    "Do not use exec for file search, reading, editing, or writing when native read, grep, glob, edit, or write tools can do the work.",
    "Use workdir instead of `cd` chains when possible. Do not shrink output with head/tail just to hide useful diagnostics; oversized output is saved for follow-up.",
    params?.hasCronTool
      ? "Do not use exec sleep or delay loops for reminders or deferred follow-ups; use cron instead."
      : undefined,
    "Use pty=true for TTY-required commands (terminal UIs, coding agents).",
  ]
    .filter(Boolean)
    .join(" ");
  if (process.platform !== "win32") {
    return base;
  }
  const lines: string[] = [base];
  lines.push(
    "IMPORTANT (Windows): Run executables directly; do NOT wrap commands in `cmd /c`, `powershell -Command`, `& ` prefix, or WSL. Use backslash paths (C:\\path), not forward slashes. Use short executable names (e.g. `node`, `python3`) instead of full paths.",
  );
  try {
    const approvalsFile = loadExecApprovals();
    const approvals = resolveExecApprovalsFromFile({
      file: approvalsFile,
      agentId: params?.agentId,
    });
    const allowlist = approvals.allowlist.filter((entry) => {
      const pattern = entry.pattern?.trim() ?? "";
      return (
        pattern.length > 0 &&
        pattern !== "*" &&
        !pattern.startsWith("=command:") &&
        (pattern.includes("/") || pattern.includes("\\") || pattern.includes("~"))
      );
    });
    if (allowlist.length > 0) {
      lines.push(
        "Pre-approved executables (exact arguments are enforced at runtime; no approval prompt needed when args match):",
      );
      for (const entry of allowlist.slice(0, 10)) {
        const shortName = deriveExecShortName(entry.pattern);
        const argNote = entry.argPattern ? "(restricted args)" : "(any arguments)";
        lines.push(`  ${shortName} ${argNote}`);
      }
    }
  } catch {
    // Allowlist loading is best-effort; don't block tool creation.
  }
  return lines.join("\n");
}

export function describeProcessTool(params?: { hasCronTool?: boolean }): string {
  return [
    "Manage running exec sessions for commands already started: list, poll, log, write, send-keys, submit, paste, kill.",
    "Use poll/log when you need status, logs, quiet-success confirmation, or completion confirmation when automatic completion wake is unavailable. Use write/send-keys/submit/paste/kill for input or intervention.",
    params?.hasCronTool
      ? "Do not use process polling to emulate timers or reminders; use cron for scheduled follow-ups."
      : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}
