import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export const DEFAULT_TAILNET_ORIGIN = "https://srv1425839.tailbcf154.ts.net";
export const DEFAULT_MAIN_SESSION_ALIAS = "main";
export const DEFAULT_CHAT_URL_PATH = "/chat";
export const TRANSCRIPT_WAIT_TIMEOUT_MS = 120_000;
export const DEFAULT_BROWSER_PROFILE_DIR = "/root/.openclaw/playwright/operator-browser-harness";
const DEVICE_APPROVAL_LOOKUP_TIMEOUT_MS = 15_000;
const DEVICE_APPROVAL_LOOKUP_POLL_MS = 500;
const PROBE_MESSAGE_MAX_CHARS = 400;
const PROGRESS_RENDER_PATTERN = /\b(?:Queued|Working|Completed)(?::|\b)/i;
const HOST_MAIN_SESSIONS_DIR = "/root/.openclaw/agents/main/sessions";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function readGatewayToken() {
  const envText = fs.readFileSync("/root/.openclaw/.env", "utf8");
  const tokenLine = envText
    .split(/\r?\n/)
    .find((line) => line.startsWith("OPENCLAW_GATEWAY_TOKEN="));
  if (tokenLine == null) {
    throw new Error("missing OPENCLAW_GATEWAY_TOKEN in /root/.openclaw/.env");
  }
  const token = tokenLine.slice("OPENCLAW_GATEWAY_TOKEN=".length).trim();
  if (!token) {
    throw new Error("OPENCLAW_GATEWAY_TOKEN is empty in /root/.openclaw/.env");
  }
  return token;
}

export function runCliJson(args) {
  const result = spawnSync(process.execPath, ["dist/index.js", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `command failed: node dist/index.js ${args.join(" ")}`,
        result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status ?? "unknown"}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return JSON.parse(result.stdout);
}

export function buildChatUrl(params) {
  const origin = (params.origin || DEFAULT_TAILNET_ORIGIN).replace(/\/$/, "");
  const url = new URL(`${origin}${DEFAULT_CHAT_URL_PATH}`);
  if (params.sessionKey?.trim()) {
    url.searchParams.set("session", params.sessionKey.trim());
  }
  if (params.token?.trim()) {
    url.hash = `token=${encodeURIComponent(params.token.trim())}`;
  }
  return url.toString();
}

export function normalizeTranscriptGroups(groups) {
  if (!Array.isArray(groups)) {
    return [];
  }
  return groups.map((group) => ({
    roleClass: typeof group?.roleClass === "string" ? group.roleClass : "unknown",
    senderName: typeof group?.senderName === "string" ? group.senderName : "",
    footer: typeof group?.footer === "string" ? group.footer : "",
    text: typeof group?.text === "string" ? group.text : "",
  }));
}

function normalizePromptForProbe(prompt) {
  return typeof prompt === "string" ? prompt.slice(0, PROBE_MESSAGE_MAX_CHARS) : "";
}

export function summarizeTurnEvidence(turn) {
  const after = turn?.after ?? {};
  const groups = normalizeTranscriptGroups(after.transcriptGroups);
  const lastAssistant = [...groups].toReversed().find((group) => group.roleClass === "assistant");
  const lastUser = [...groups].toReversed().find((group) => group.roleClass === "user");
  return {
    prompt: typeof turn?.prompt === "string" ? turn.prompt : "",
    sessionKey: typeof after.sessionKey === "string" ? after.sessionKey : null,
    queueTitle: typeof after.queueTitle === "string" ? after.queueTitle : null,
    sendButtonLabel: typeof after.sendButtonLabel === "string" ? after.sendButtonLabel : null,
    lastUserText: lastUser?.text ?? "",
    lastAssistantText: lastAssistant?.text ?? "",
    transcriptGroupCount: groups.length,
    transcriptTailText:
      typeof after?.transcriptTailText === "string" ? after.transcriptTailText : "",
  };
}

export function hasRenderedProgressEvidence(state) {
  const bodyText = typeof state?.bodyTextSnippet === "string" ? state.bodyTextSnippet : "";
  if (PROGRESS_RENDER_PATTERN.test(bodyText)) {
    return true;
  }
  const queueTitle = typeof state?.queueTitle === "string" ? state.queueTitle : "";
  if (PROGRESS_RENDER_PATTERN.test(queueTitle)) {
    return true;
  }
  const queueItems = Array.isArray(state?.queueItems) ? state.queueItems : [];
  if (queueItems.some((item) => typeof item === "string" && PROGRESS_RENDER_PATTERN.test(item))) {
    return true;
  }
  const transcriptTailText =
    typeof state?.transcriptTailText === "string" ? state.transcriptTailText : "";
  if (PROGRESS_RENDER_PATTERN.test(transcriptTailText)) {
    return true;
  }
  const groups = Array.isArray(state?.transcriptGroups) ? state.transcriptGroups : [];
  return groups.some(
    (group) => typeof group?.text === "string" && PROGRESS_RENDER_PATTERN.test(group.text),
  );
}

export function hasRenderedTerminalEvidence(state, params = {}) {
  if (state?.sendButtonLabel === "Stop generating") {
    return false;
  }
  const prompt = typeof params.prompt === "string" ? params.prompt : "";
  const promptForProbe = normalizePromptForProbe(prompt);
  if (!prompt && !promptForProbe) {
    return false;
  }
  const previousCount =
    typeof params.previousTranscriptCount === "number" &&
    Number.isFinite(params.previousTranscriptCount)
      ? Math.max(0, params.previousTranscriptCount)
      : 0;
  const groups = normalizeTranscriptGroups(state?.transcriptGroups).slice(previousCount);
  const promptMatches = (text) =>
    typeof text === "string" &&
    ((prompt && text.includes(prompt)) || (promptForProbe && text.includes(promptForProbe)));
  const userIndex = groups.findIndex(
    (group) => group.roleClass === "user" && promptMatches(group.text),
  );
  if (userIndex < 0) {
    return false;
  }
  return groups
    .slice(userIndex + 1)
    .some((group) => group.roleClass === "assistant" && group.text.trim().length > 0);
}

function readMessageText(message) {
  const content = message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function readEventTimestampMs(event) {
  if (typeof event?.timestamp === "string") {
    const parsed = Date.parse(event.timestamp);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (typeof event?.message?.timestamp === "number" && Number.isFinite(event.message.timestamp)) {
    return event.message.timestamp;
  }
  return 0;
}

export function findTranscriptTerminalEvidenceFromEvents(events, params = {}) {
  const prompt = typeof params.prompt === "string" ? params.prompt : "";
  const promptForProbe = normalizePromptForProbe(prompt);
  const assistantPattern =
    typeof params.assistantPattern === "string" && params.assistantPattern.trim()
      ? new RegExp(params.assistantPattern, "i")
      : null;
  const startedAtMs =
    typeof params.startedAtMs === "number" && Number.isFinite(params.startedAtMs)
      ? Math.max(0, params.startedAtMs)
      : 0;
  const messages = (Array.isArray(events) ? events : [])
    .map((event, index) => ({
      index,
      id: typeof event?.id === "string" ? event.id : "",
      timestamp: typeof event?.timestamp === "string" ? event.timestamp : null,
      timestampMs: readEventTimestampMs(event),
      role: typeof event?.message?.role === "string" ? event.message.role : "",
      text: readMessageText(event?.message),
      openclawKind:
        typeof event?.message?.__openclaw?.kind === "string" ? event.message.__openclaw.kind : "",
    }))
    .filter((entry) => entry.role && entry.text);

  let userIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const entry = messages[index];
    if (entry.timestampMs && entry.timestampMs + 5_000 < startedAtMs) {
      continue;
    }
    if (
      entry.role === "user" &&
      ((prompt && entry.text.includes(prompt)) ||
        (promptForProbe && entry.text.includes(promptForProbe)))
    ) {
      userIndex = index;
      break;
    }
  }
  if (userIndex < 0) {
    return null;
  }
  const nextUserOffset = messages.slice(userIndex + 1).findIndex((entry) => entry.role === "user");
  const candidateSlice =
    nextUserOffset >= 0
      ? messages.slice(userIndex + 1, userIndex + 1 + nextUserOffset)
      : messages.slice(userIndex + 1);
  const assistantCandidates = candidateSlice.filter(
    (entry) => entry.role === "assistant" && !entry.openclawKind && entry.text.trim().length > 0,
  );
  const assistant = assistantPattern
    ? assistantCandidates.find((entry) => assistantPattern.test(entry.text))
    : assistantCandidates[0];
  if (!assistant) {
    return null;
  }
  const user = messages[userIndex];
  return {
    source: "session-jsonl",
    userMessageId: user.id || null,
    assistantMessageId: assistant.id || null,
    userTimestamp: user.timestamp,
    assistantTimestamp: assistant.timestamp,
    assistantText: assistant.text,
  };
}

function hostSessionPath(sessionFile) {
  if (typeof sessionFile !== "string" || !sessionFile) {
    return null;
  }
  if (sessionFile.startsWith("/home/node/.openclaw/")) {
    return sessionFile.replace(/^\/home\/node\/\.openclaw\//, "/root/.openclaw/");
  }
  return sessionFile;
}

export function readTranscriptTerminalEvidence(params = {}) {
  const sessionKey = typeof params.sessionKey === "string" ? params.sessionKey : "";
  if (!sessionKey) {
    return null;
  }
  const sessionsPath = path.join(HOST_MAIN_SESSIONS_DIR, "sessions.json");
  if (!fs.existsSync(sessionsPath)) {
    return null;
  }
  const sessions = JSON.parse(fs.readFileSync(sessionsPath, "utf8"));
  const entry =
    sessions[sessionKey] ??
    sessions[`agent:main:${sessionKey}`] ??
    sessions[sessionKey.replace(/^agent:main:/, "")] ??
    null;
  if (!entry) {
    return null;
  }
  const sessionFile =
    hostSessionPath(entry.sessionFile) ??
    (typeof entry.sessionId === "string"
      ? path.join(HOST_MAIN_SESSIONS_DIR, `${entry.sessionId}.jsonl`)
      : null);
  if (!sessionFile || !fs.existsSync(sessionFile)) {
    return null;
  }
  const events = fs
    .readFileSync(sessionFile, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const evidence = findTranscriptTerminalEvidenceFromEvents(events, params);
  if (!evidence) {
    return null;
  }
  return {
    ...evidence,
    sessionId: typeof entry.sessionId === "string" ? entry.sessionId : null,
    sessionKey,
    sessionFile,
  };
}

export function resolvePromptRunFromProbeSlice(probeSlice, prompt) {
  const normalizedPrompt = normalizePromptForProbe(prompt);
  const frames = Array.isArray(probeSlice?.wsFrames) ? probeSlice.wsFrames : [];
  const messages = Array.isArray(probeSlice?.wsMessages) ? probeSlice.wsMessages : [];
  const frame = [...frames]
    .toReversed()
    .find((entry) => entry?.method === "chat.send" && entry?.message === normalizedPrompt);
  if (!frame?.id) {
    return null;
  }
  const ack = messages.find((entry) => entry?.id === frame.id && entry?.ok === true);
  if (!ack) {
    return null;
  }
  return {
    requestId: frame.id,
    runId: typeof ack?.runId === "string" ? ack.runId : null,
    sessionKey: typeof frame.sessionKey === "string" ? frame.sessionKey : null,
  };
}

export async function waitForPromptRunDispatch(page, params) {
  const timeoutMs = params.timeoutMs ?? 15_000;
  const prompt = normalizePromptForProbe(params.prompt);
  await page.waitForFunction(
    ({ mark, prompt, sessionKey }) => {
      const probe = window.__OPENCLAW_OPERATOR_PROMPT_PROBE__ ?? {
        wsFrames: [],
        wsMessages: [],
      };
      const frame = probe.wsFrames
        .slice(mark.wsFrames ?? 0)
        .toReversed()
        .find(
          (entry) =>
            entry?.method === "chat.send" &&
            entry?.message === prompt &&
            (!sessionKey || entry?.sessionKey === sessionKey),
        );
      if (!frame?.id) {
        return false;
      }
      return probe.wsMessages
        .slice(mark.wsMessages ?? 0)
        .some((entry) => entry?.id === frame.id && entry?.ok === true);
    },
    {
      mark: params.mark,
      prompt,
      sessionKey: params.sessionKey ?? null,
    },
    { timeout: timeoutMs },
  );
  const probeSlice = await sliceProbe(page, params.mark);
  return resolvePromptRunFromProbeSlice(probeSlice, prompt);
}

function resolveEffectiveSessionKey(state, requestedSessionKey) {
  const selectedOption = Array.isArray(state?.selectorOptions)
    ? state.selectorOptions.find((option) => option?.selected)
    : null;
  return (
    selectedOption?.value || state?.sessionKey || requestedSessionKey || DEFAULT_MAIN_SESSION_ALIAS
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function installOperatorPromptProbe(page) {
  await page.addInitScript((probeMessageMaxChars) => {
    const probe = {
      wsFrames: [],
      wsMessages: [],
      wsCloses: [],
      historyOps: [],
      sessionOps: [],
    };
    Object.defineProperty(probe, "sockets", {
      value: [],
      enumerable: false,
    });
    window.__OPENCLAW_OPERATOR_PROMPT_PROBE__ = probe;

    const originalReplaceState = history.replaceState.bind(history);
    history.replaceState = function (state, unused, url) {
      probe.historyOps.push({ method: "replaceState", url: String(url ?? "") });
      return originalReplaceState(state, unused, url);
    };

    const originalSetItem = Object.getOwnPropertyDescriptor(Storage.prototype, "setItem")?.value;
    Storage.prototype.setItem = function (key, value) {
      if (this === window.sessionStorage) {
        probe.sessionOps.push({
          op: "setItem",
          key,
          valueLength: value.length,
        });
      }
      return originalSetItem.call(this, key, value);
    };

    const OriginalWebSocket = window.WebSocket;
    class ProbeWebSocket extends OriginalWebSocket {
      constructor(...args) {
        super(...args);
        probe.sockets.push(this);
        this.addEventListener("message", (event) => {
          let parsed = null;
          if (typeof event.data === "string") {
            try {
              parsed = JSON.parse(event.data);
            } catch {
              parsed = null;
            }
          }
          probe.wsMessages.push(
            parsed && typeof parsed === "object"
              ? {
                  type: parsed.type ?? null,
                  event: parsed.event ?? null,
                  ok: parsed.ok ?? null,
                  id: parsed.id ?? null,
                  method: parsed.method ?? null,
                  runId: parsed.payload?.runId ?? null,
                  sessionKey: parsed.payload?.sessionKey ?? null,
                  state: parsed.payload?.state ?? null,
                  errorMessage: parsed.error?.message ?? null,
                  errorCode: parsed.error?.details?.code ?? null,
                  helloType: parsed.payload?.type ?? null,
                  helloDeviceToken: Boolean(parsed.payload?.auth?.deviceToken),
                }
              : {
                  type: typeof event.data,
                  event: null,
                  ok: null,
                  id: null,
                  method: null,
                  runId: null,
                  sessionKey: null,
                  state: null,
                  errorMessage: null,
                  errorCode: null,
                  helloType: null,
                  helloDeviceToken: false,
                },
          );
        });
        this.addEventListener("close", (event) => {
          probe.wsCloses.push({
            code: event.code,
            reason: event.reason,
          });
        });
      }

      send(data) {
        let parsed = null;
        if (typeof data === "string") {
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = null;
          }
        }
        probe.wsFrames.push(
          parsed && typeof parsed === "object"
            ? {
                method: parsed.method ?? null,
                id: parsed.id ?? null,
                sessionKey: parsed.params?.sessionKey ?? null,
                message:
                  typeof parsed.params?.message === "string"
                    ? parsed.params.message.slice(0, probeMessageMaxChars)
                    : null,
                hasDevice: Boolean(parsed.params?.device),
                deviceId: parsed.params?.device?.id ?? null,
                hasToken: Boolean(parsed.params?.auth?.token),
                hasDeviceToken: Boolean(parsed.params?.auth?.deviceToken),
                scopes: Array.isArray(parsed.params?.scopes) ? parsed.params.scopes : null,
              }
            : {
                method: null,
                id: null,
                sessionKey: null,
                message: null,
                hasDevice: false,
                deviceId: null,
                hasToken: false,
                hasDeviceToken: false,
                scopes: null,
              },
        );
        return super.send(data);
      }
    }
    Object.defineProperty(ProbeWebSocket, "CONNECTING", { value: OriginalWebSocket.CONNECTING });
    Object.defineProperty(ProbeWebSocket, "OPEN", { value: OriginalWebSocket.OPEN });
    Object.defineProperty(ProbeWebSocket, "CLOSING", { value: OriginalWebSocket.CLOSING });
    Object.defineProperty(ProbeWebSocket, "CLOSED", { value: OriginalWebSocket.CLOSED });
    window.WebSocket = ProbeWebSocket;
  }, PROBE_MESSAGE_MAX_CHARS);
}

export async function readOperatorChatState(page) {
  return await page.evaluate(() => {
    const selector = document.querySelector(
      'select[aria-label="Select session"], .chat-controls__session select',
    );
    const sendButton =
      document.querySelector('button[aria-label="Stop generating"]') ??
      document.querySelector('button[aria-label="Send message"]') ??
      document.querySelector('button[aria-label="Queue message"]');
    const textarea = document.querySelector(".agent-chat__input textarea");
    const transcriptGroups = Array.from(document.querySelectorAll(".chat-group")).map((group) => {
      const roleClass =
        Array.from(group.classList).find((entry) =>
          ["assistant", "user", "tool", "other"].includes(entry),
        ) ?? "unknown";
      const senderName = group.querySelector(".chat-sender-name")?.textContent?.trim() ?? "";
      const footer = group.querySelector(".chat-group-footer")?.textContent?.trim() ?? "";
      const bodyParts = Array.from(
        group.querySelectorAll(
          ".chat-bubble, .tool-card, .tool-preview, .tool-call-card, .tool-call, .tool-result, .msg-markdown, .tool-card__body",
        ),
      )
        .map((node) => node.textContent?.trim() ?? "")
        .filter(Boolean);
      const text = bodyParts.join("\n").trim() || group.textContent?.trim() || "";
      return { roleClass, senderName, footer, text };
    });
    const selectorOptions = selector
      ? Array.from(selector.querySelectorAll("option")).map((option) => ({
          value: option.value,
          label: option.textContent?.trim() ?? "",
          title: option.getAttribute("title") ?? "",
          selected: option.selected,
          group:
            option.parentElement?.tagName === "OPTGROUP"
              ? (option.parentElement.getAttribute("label") ?? "")
              : "",
        }))
      : [];
    const queueTitle = document.querySelector(".chat-queue__title")?.textContent?.trim() ?? null;
    const queueItems = Array.from(document.querySelectorAll(".chat-queue__item"))
      .map((item) => item.textContent?.trim() ?? "")
      .filter(Boolean);
    const transcriptTailText = transcriptGroups
      .slice(-3)
      .map((group) => group.text)
      .filter(Boolean)
      .join("\n")
      .trim();
    const sessionStorageKeys = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (key) {
        sessionStorageKeys.push(key);
      }
    }
    const localStorageKeys = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key) {
        localStorageKeys.push(key);
      }
    }
    const deviceIdentityRaw = window.localStorage.getItem("openclaw-device-identity-v1");
    const deviceAuthRaw = window.localStorage.getItem("openclaw.device.auth.v1");
    const deviceIdentity = deviceIdentityRaw ? JSON.parse(deviceIdentityRaw) : null;
    const deviceAuth = deviceAuthRaw ? JSON.parse(deviceAuthRaw) : null;
    return {
      href: location.href,
      hash: location.hash,
      sessionKey: new URLSearchParams(location.search).get("session"),
      hasSelector: Boolean(selector),
      selectorOptions,
      hasLoginGate: Boolean(document.querySelector(".login-gate")),
      hasTextarea: Boolean(textarea),
      textareaDisabled: textarea ? textarea.hasAttribute("disabled") : null,
      sendButtonLabel: sendButton?.getAttribute("aria-label") ?? null,
      queueTitle,
      queueItems,
      transcriptGroups,
      transcriptTailText,
      sessionStorageKeys,
      localStorageKeys,
      deviceIdentity: deviceIdentity
        ? {
            deviceId: deviceIdentity.deviceId ?? null,
            createdAtMs: deviceIdentity.createdAtMs ?? null,
          }
        : null,
      deviceAuth: deviceAuth
        ? {
            deviceId: deviceAuth.deviceId ?? null,
            roles: Object.keys(deviceAuth.tokens ?? {}),
          }
        : null,
      probe: window.__OPENCLAW_OPERATOR_PROMPT_PROBE__ ?? null,
      bodyTextSnippet: document.body?.innerText?.slice(0, 1200) ?? "",
    };
  });
}

export async function readSessionsViewState(page) {
  return await page.evaluate(() => {
    const headers = Array.from(document.querySelectorAll(".data-table thead th")).map((th) =>
      (th.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase(),
    );
    const firstDataColumnIndex = (() => {
      const keyIndex = headers.findIndex((header) => header === "key");
      return keyIndex >= 0 ? keyIndex : 1;
    })();
    const relativeIndex = (label) => {
      const absoluteIndex = headers.findIndex((header) => header === label);
      if (absoluteIndex < 0) {
        return null;
      }
      return Math.max(0, absoluteIndex - firstDataColumnIndex);
    };
    const keyIndex = relativeIndex("key") ?? 0;
    const labelIndex = relativeIndex("label") ?? 1;
    const kindIndex = relativeIndex("kind") ?? 2;
    const stateIndex = relativeIndex("state");
    const updatedIndex =
      relativeIndex("updated") ?? (typeof stateIndex === "number" ? stateIndex + 1 : 3);
    const rows = Array.from(document.querySelectorAll(".data-table tbody tr"))
      .map((row) => {
        const cells = row.querySelectorAll("td");
        if (cells.length < firstDataColumnIndex + 4) {
          return null;
        }
        const dataCells = Array.from(cells).slice(firstDataColumnIndex);
        return {
          key: dataCells[keyIndex]?.textContent?.trim() ?? "",
          label: dataCells[labelIndex]?.querySelector("input")?.value ?? "",
          kind: dataCells[kindIndex]?.textContent?.trim() ?? "",
          state:
            typeof stateIndex === "number"
              ? (dataCells[stateIndex]?.textContent?.trim() ?? "")
              : "",
          updated: dataCells[updatedIndex]?.textContent?.trim() ?? "",
        };
      })
      .filter(Boolean);
    return {
      href: location.href,
      title: document.title,
      rows,
      bodyTextSnippet: document.body?.innerText?.slice(0, 1200) ?? "",
    };
  });
}

export async function markProbe(page) {
  return await page.evaluate(() => {
    const probe = window.__OPENCLAW_OPERATOR_PROMPT_PROBE__ ?? {
      wsFrames: [],
      wsMessages: [],
      wsCloses: [],
      historyOps: [],
      sessionOps: [],
    };
    return {
      wsFrames: probe.wsFrames.length,
      wsMessages: probe.wsMessages.length,
      wsCloses: probe.wsCloses.length,
      historyOps: probe.historyOps.length,
      sessionOps: probe.sessionOps.length,
    };
  });
}

export async function sliceProbe(page, mark) {
  return await page.evaluate((start) => {
    const probe = window.__OPENCLAW_OPERATOR_PROMPT_PROBE__ ?? {
      wsFrames: [],
      wsMessages: [],
      wsCloses: [],
      historyOps: [],
      sessionOps: [],
    };
    return {
      wsFrames: probe.wsFrames.slice(start.wsFrames ?? 0),
      wsMessages: probe.wsMessages.slice(start.wsMessages ?? 0),
      wsCloses: probe.wsCloses.slice(start.wsCloses ?? 0),
      historyOps: probe.historyOps.slice(start.historyOps ?? 0),
      sessionOps: probe.sessionOps.slice(start.sessionOps ?? 0),
    };
  }, mark);
}

async function waitForChatShell(page) {
  await page.waitForFunction(
    () =>
      Boolean(
        document.querySelector(".login-gate") ||
        document.querySelector(".agent-chat__input textarea") ||
        document.querySelector('select[aria-label="Select session"]'),
      ),
    { timeout: 20_000 },
  );
}

function resolveRequestedDeviceId(state) {
  return (
    state?.probe?.wsFrames?.find((frame) => frame?.method === "connect")?.deviceId ??
    state?.deviceIdentity?.deviceId ??
    null
  );
}

export function listPendingRequests() {
  try {
    const beforeList = runCliJson(["devices", "list", "--json"]);
    return Array.isArray(beforeList.pending) ? beforeList.pending : [];
  } catch {
    return [];
  }
}

async function approvePendingDevice(params) {
  const deviceId = params.deviceId ?? null;
  const knownRequestIds = new Set(params.knownRequestIds ?? []);
  const startedAtMs =
    typeof params.startedAtMs === "number" && Number.isFinite(params.startedAtMs)
      ? params.startedAtMs
      : Date.now();
  const deadline = Date.now() + DEVICE_APPROVAL_LOOKUP_TIMEOUT_MS;
  let lastPendingIds = [];
  let pending = null;
  let matchedBy = null;
  while (Date.now() < deadline) {
    const pendingEntries = listPendingRequests();
    lastPendingIds = pendingEntries
      .map((entry) => (typeof entry?.deviceId === "string" ? entry.deviceId : null))
      .filter(Boolean);
    pending =
      (deviceId
        ? ((matchedBy = "deviceId"), pendingEntries.find((entry) => entry.deviceId === deviceId))
        : null) ??
      (() => {
        const createdDuringRun =
          pendingEntries.find((entry) => {
            const requestId = typeof entry?.requestId === "string" ? entry.requestId : "";
            const ts = typeof entry?.ts === "number" ? entry.ts : 0;
            return requestId && !knownRequestIds.has(requestId) && ts >= startedAtMs;
          }) ?? null;
        if (createdDuringRun) {
          matchedBy = "newPendingRequest";
          return createdDuringRun;
        }
        const exactAutomationEntries = pendingEntries.filter(
          (entry) =>
            entry?.clientId === "openclaw-control-ui" &&
            entry?.clientMode === "webchat" &&
            entry?.role === "operator",
        );
        if (exactAutomationEntries.length === 1) {
          matchedBy = "singleAutomationPendingFallback";
          return exactAutomationEntries[0];
        }
        return null;
      })();
    if (pending) {
      break;
    }
    await sleep(DEVICE_APPROVAL_LOOKUP_POLL_MS);
  }
  if (!pending) {
    throw new Error(
      `no pending pairing request found for device ${deviceId ?? "(unknown)"}; visible pending devices: ${lastPendingIds.join(", ") || "(none)"}`,
    );
  }
  const approved = runCliJson(["devices", "approve", pending.requestId, "--json"]);
  return {
    requestId: pending.requestId,
    matchedDeviceId: pending.deviceId ?? null,
    matchedBy,
    pending,
    approved,
  };
}

export async function ensureAuthenticatedChatPage(params) {
  const origin = params.origin || DEFAULT_TAILNET_ORIGIN;
  const sessionKey = params.sessionKey || DEFAULT_MAIN_SESSION_ALIAS;
  const token = params.token || readGatewayToken();
  const url = buildChatUrl({
    origin,
    sessionKey,
    token: params.includeToken === false ? null : token,
  });
  const knownPendingRequestIds = listPendingRequests()
    .map((entry) => (typeof entry?.requestId === "string" ? entry.requestId : null))
    .filter(Boolean);
  const startedAtMs = Date.now();
  await params.page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForChatShell(params.page);
  await params.page.waitForTimeout(3_000);
  let state = await readOperatorChatState(params.page);
  let approval = null;
  if (state.hasLoginGate) {
    const requestedDeviceId = resolveRequestedDeviceId(state);
    approval = await approvePendingDevice({
      deviceId: requestedDeviceId,
      knownRequestIds: knownPendingRequestIds,
      startedAtMs,
    });
    await params.page.reload({ waitUntil: "domcontentloaded" });
    await waitForChatShell(params.page);
    await params.page.waitForTimeout(3_000);
    await params.page.waitForFunction(
      () =>
        Boolean(document.querySelector(".agent-chat__input textarea")) &&
        !document.querySelector(".login-gate"),
      { timeout: 20_000 },
    );
    state = await readOperatorChatState(params.page);
  }
  if (!state.hasTextarea) {
    throw new Error("authenticated chat shell did not expose the chat textarea");
  }
  return { url, state, approval };
}

export async function waitForTurnStart(page, params) {
  const previousCount = params.previousTranscriptCount ?? 0;
  const promptForProbe = normalizePromptForProbe(params.prompt);
  await page.waitForFunction(
    ({ expectedPrompt, promptForProbe, previousCount, sessionKey, mark }) => {
      const probe = window.__OPENCLAW_OPERATOR_PROMPT_PROBE__ ?? { wsFrames: [] };
      const chatSendSeen = probe.wsFrames
        .slice(mark.wsFrames ?? 0)
        .some(
          (frame) =>
            frame?.method === "chat.send" &&
            (!sessionKey || frame?.sessionKey === sessionKey) &&
            frame?.message === promptForProbe,
        );
      if (chatSendSeen) {
        return true;
      }
      const sendButton =
        document.querySelector('button[aria-label="Stop generating"]') ??
        document.querySelector('button[aria-label="Queue message"]');
      if (sendButton) {
        return true;
      }
      const queue = document.querySelector(".chat-queue");
      if (queue) {
        return true;
      }
      const groups = Array.from(document.querySelectorAll(".chat-group"));
      if (groups.length > previousCount) {
        const lastUser = [...groups].toReversed().find((group) => group.classList.contains("user"));
        if (
          lastUser?.textContent?.includes(expectedPrompt) ||
          (promptForProbe && lastUser?.textContent?.includes(promptForProbe))
        ) {
          return true;
        }
      }
      return false;
    },
    {
      expectedPrompt: params.prompt,
      promptForProbe,
      previousCount,
      sessionKey: params.sessionKey ?? null,
      mark: params.mark ?? null,
    },
    { timeout: params.timeoutMs ?? 15_000 },
  );
}

export async function waitForTurnTerminal(page, params) {
  const timeoutMs = params.timeoutMs ?? TRANSCRIPT_WAIT_TIMEOUT_MS;
  const assistantPatternSource =
    typeof params.assistantPattern === "string" && params.assistantPattern.trim()
      ? params.assistantPattern
      : null;
  const startedAtMs =
    typeof params.startedAtMs === "number" && Number.isFinite(params.startedAtMs)
      ? params.startedAtMs
      : Date.now();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const renderedTerminal = await page.evaluate(
      ({
        sessionKey,
        mark,
        runId,
        prompt,
        promptForProbe,
        previousTranscriptCount,
        assistantPatternSource,
      }) => {
        const probe = window.__OPENCLAW_OPERATOR_PROMPT_PROBE__ ?? { wsMessages: [] };
        const terminalSeen = probe.wsMessages
          .slice(mark.wsMessages ?? 0)
          .some(
            (msg) =>
              msg?.event === "chat" &&
              msg?.sessionKey === sessionKey &&
              (!runId || msg?.runId === runId) &&
              (msg?.state === "final" || msg?.state === "error" || msg?.state === "aborted"),
          );
        const stop = document.querySelector('button[aria-label="Stop generating"]');
        if (terminalSeen && !assistantPatternSource) {
          return !stop;
        }
        if (stop) {
          return false;
        }
        const assistantPattern = assistantPatternSource
          ? new RegExp(assistantPatternSource, "i")
          : null;
        const groups = Array.from(document.querySelectorAll(".chat-group")).map((group) => {
          const roleClass =
            Array.from(group.classList).find((entry) =>
              ["assistant", "user", "tool", "other"].includes(entry),
            ) ?? "unknown";
          const bodyParts = Array.from(
            group.querySelectorAll(
              ".chat-bubble, .tool-card, .tool-preview, .tool-call-card, .tool-call, .tool-result, .msg-markdown, .tool-card__body",
            ),
          )
            .map((node) => node.textContent?.trim() ?? "")
            .filter(Boolean);
          const text = bodyParts.join("\n").trim() || group.textContent?.trim() || "";
          return { roleClass, text };
        });
        const visibleGroups = groups.slice(Math.max(0, previousTranscriptCount ?? 0));
        const userIndex = visibleGroups.findIndex(
          (group) =>
            group.roleClass === "user" &&
            ((prompt && group.text.includes(prompt)) ||
              (promptForProbe && group.text.includes(promptForProbe))),
        );
        if (userIndex < 0) {
          return false;
        }
        return visibleGroups
          .slice(userIndex + 1)
          .some(
            (group) =>
              group.roleClass === "assistant" &&
              group.text.trim().length > 0 &&
              (!assistantPattern || assistantPattern.test(group.text)),
          );
      },
      {
        sessionKey: params.sessionKey,
        mark: params.mark,
        runId: params.runId ?? null,
        prompt: params.prompt ?? "",
        promptForProbe: normalizePromptForProbe(params.prompt ?? ""),
        previousTranscriptCount: params.previousTranscriptCount ?? 0,
        assistantPatternSource,
      },
    );
    if (renderedTerminal) {
      await page.waitForTimeout(750);
      return { mode: "terminal", source: "rendered-or-websocket" };
    }
    const transcriptEvidence = readTranscriptTerminalEvidence({
      sessionKey: params.sessionKey,
      prompt: params.prompt ?? "",
      startedAtMs: startedAtMs - 5_000,
      assistantPattern: assistantPatternSource,
    });
    if (transcriptEvidence) {
      await page.waitForTimeout(750);
      return {
        mode: "terminal",
        source: "session-jsonl-fallback",
        reason: "websocket-or-rendered-terminal-wait-timeout",
        transcript: transcriptEvidence,
      };
    }
    await sleep(500);
  }
  throw new Error(`page.waitForFunction: Timeout ${timeoutMs}ms exceeded.`);
}

export async function waitForProgressEvidence(page, params) {
  await page.waitForFunction(
    ({ mark, sessionKey, progressPatternSource, runId }) => {
      const probe = window.__OPENCLAW_OPERATOR_PROMPT_PROBE__ ?? { wsMessages: [] };
      const progressPattern = new RegExp(progressPatternSource, "i");
      const bodyText = document.body?.innerText ?? "";
      const queueTitle = document.querySelector(".chat-queue__title")?.textContent ?? "";
      const queueItems = Array.from(document.querySelectorAll(".chat-queue__item"))
        .map((item) => item.textContent ?? "")
        .join("\n");
      const transcriptText = Array.from(document.querySelectorAll(".chat-group"))
        .map((group) => group.textContent ?? "")
        .join("\n");
      const progressRendered =
        progressPattern.test(bodyText) ||
        progressPattern.test(queueTitle) ||
        progressPattern.test(queueItems) ||
        progressPattern.test(transcriptText);
      const matchingChatEventSeen = probe.wsMessages
        .slice(mark.wsMessages ?? 0)
        .some(
          (msg) =>
            msg?.event === "chat" &&
            msg?.sessionKey === sessionKey &&
            (!runId || msg?.runId === runId) &&
            (msg?.state === "delta" || msg?.state === "final"),
        );
      return progressRendered && matchingChatEventSeen;
    },
    {
      mark: params.mark,
      sessionKey: params.sessionKey,
      progressPatternSource: PROGRESS_RENDER_PATTERN.source,
      runId: params.runId ?? null,
    },
    { timeout: params.timeoutMs ?? 30_000 },
  );
  await page.waitForTimeout(500);
}

export async function fillOperatorChatTextarea(page, prompt) {
  const textarea = page.locator(".agent-chat__input textarea").first();
  const setViaDom = async (value) =>
    await page.evaluate((value) => {
      const element = document.querySelector(".agent-chat__input textarea");
      if (!(element instanceof HTMLTextAreaElement)) {
        return { ok: false };
      }
      const descriptor =
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value") ??
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      descriptor?.set?.call(element, value);
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    }, value);
  if (prompt.length > 8_000) {
    const fallback = await setViaDom(prompt);
    if (!fallback.ok) {
      throw new Error("operator chat textarea not found for large prompt fallback");
    }
  } else {
    try {
      await textarea.fill(prompt, { timeout: 30_000 });
    } catch (error) {
      const fallback = await setViaDom(prompt);
      if (!fallback.ok) {
        throw new Error("operator chat textarea not found for prompt fallback", {
          cause: error,
        });
      }
    }
  }
  const valueLength = await page.evaluate(() => {
    const element = document.querySelector(".agent-chat__input textarea");
    return element instanceof HTMLTextAreaElement ? element.value.length : -1;
  });
  if (valueLength !== prompt.length) {
    throw new Error(
      `operator chat textarea prompt length mismatch: expected ${prompt.length}, observed ${valueLength}`,
    );
  }
}

export class OperatorBrowserHarness {
  constructor(options = {}) {
    this.origin = options.origin || process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
    this.token = options.token || readGatewayToken();
    this.headless = options.headless !== false;
    this.userDataDir =
      options.userDataDir ||
      process.env.OPENCLAW_OPERATOR_HARNESS_PROFILE ||
      DEFAULT_BROWSER_PROFILE_DIR;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async start() {
    fs.mkdirSync(this.userDataDir, { recursive: true });
    this.context = await chromium.launchPersistentContext(this.userDataDir, {
      headless: this.headless,
    });
    this.page = this.context.pages()[0] ?? (await this.context.newPage());
    await installOperatorPromptProbe(this.page);
    return this;
  }

  async ensureAuthenticated(sessionKey = DEFAULT_MAIN_SESSION_ALIAS, options = {}) {
    const result = await ensureAuthenticatedChatPage({
      page: this.page,
      origin: this.origin,
      sessionKey,
      token: this.token,
      includeToken: options.includeToken,
    });
    this.lastAuth = result;
    return result;
  }

  async openSession(sessionKey) {
    const includeToken = !(
      typeof this.lastAuth?.state?.deviceAuth?.deviceId === "string" &&
      this.lastAuth.state.deviceAuth.deviceId
    );
    return await this.ensureAuthenticated(sessionKey, { includeToken });
  }

  async gotoSessionsView() {
    const url = new URL(`${this.origin}/sessions`);
    await this.page.goto(url.toString(), { waitUntil: "domcontentloaded" });
    await this.page.waitForFunction(() => Boolean(document.querySelector(".data-table")));
    return await readSessionsViewState(this.page);
  }

  async snapshotChat() {
    return await readOperatorChatState(this.page);
  }

  async sendPrompt(prompt, options = {}) {
    const requestedSessionKey = options.sessionKey || DEFAULT_MAIN_SESSION_ALIAS;
    await this.openSession(requestedSessionKey);
    const before = await readOperatorChatState(this.page);
    const effectiveSessionKey = resolveEffectiveSessionKey(before, requestedSessionKey);
    const mark = await markProbe(this.page);
    await fillOperatorChatTextarea(this.page, prompt);
    const sendButton = this.page
      .locator('button[aria-label="Send message"], button[aria-label="Queue message"]')
      .first();
    const sentAtMs = Date.now();
    try {
      await sendButton.click({ timeout: options.sendClickTimeoutMs ?? 30_000 });
    } catch (error) {
      const state = await readOperatorChatState(this.page).catch(() => null);
      const diagnostic = {
        sendButtonLabel: state?.sendButtonLabel ?? null,
        textareaDisabled: state?.textareaDisabled ?? null,
        hasTextarea: state?.hasTextarea ?? null,
        bodyTextHash: state?.bodyTextSnippet ? String(state.bodyTextSnippet.length) : "0",
      };
      throw new Error(`operator chat send click failed:${JSON.stringify(diagnostic)}`, {
        cause: error,
      });
    }
    await waitForTurnStart(this.page, {
      prompt,
      sessionKey: effectiveSessionKey,
      mark,
      previousTranscriptCount: Array.isArray(before.transcriptGroups)
        ? before.transcriptGroups.length
        : 0,
      timeoutMs: options.startTimeoutMs,
    });
    let promptRun = null;
    try {
      promptRun = await waitForPromptRunDispatch(this.page, {
        mark,
        prompt,
        sessionKey: effectiveSessionKey,
        timeoutMs: options.startTimeoutMs,
      });
    } catch (error) {
      const timeoutMessage = error instanceof Error ? error.message : String(error);
      if (!/Timeout .*exceeded/i.test(timeoutMessage)) {
        throw error;
      }
    }

    let completionEvidence = {
      mode: options.waitFor === "progress" ? "progress" : "terminal",
      source: "rendered-or-websocket",
    };

    if (options.waitFor === "dispatch") {
      completionEvidence = {
        mode: "dispatch",
        source: promptRun?.requestId ? "websocket-ack" : "turn-start",
      };
    } else if (options.waitFor === "progress") {
      await waitForProgressEvidence(this.page, {
        mark,
        sessionKey: effectiveSessionKey,
        runId: promptRun?.runId ?? null,
        timeoutMs: options.timeoutMs,
      });
    } else {
      completionEvidence = await waitForTurnTerminal(this.page, {
        mark,
        sessionKey: effectiveSessionKey,
        runId: promptRun?.runId ?? null,
        prompt,
        previousTranscriptCount: Array.isArray(before.transcriptGroups)
          ? before.transcriptGroups.length
          : 0,
        startedAtMs: sentAtMs,
        assistantPattern: options.assistantPattern,
        timeoutMs: options.timeoutMs,
      });
    }

    const after = await readOperatorChatState(this.page);
    const probeSlice = await sliceProbe(this.page, mark);
    const summary = summarizeTurnEvidence({ prompt, after });
    if (
      completionEvidence.source === "session-jsonl-fallback" &&
      !summary.lastAssistantText.trim()
    ) {
      summary.lastAssistantText = completionEvidence.transcript.assistantText;
    }
    return {
      prompt,
      sessionKey: effectiveSessionKey,
      waitFor: options.waitFor || "terminal",
      runId: promptRun?.runId ?? null,
      sentAtMs,
      completionEvidence,
      before,
      after,
      probeSlice,
      summary,
    };
  }

  async close() {
    await this.page?.close();
    await this.context?.close();
  }
}
