import { fetchWithSsrFGuard } from "openclaw/plugin-sdk/ssrf-runtime";
import { normalizeLowercaseStringOrEmpty } from "openclaw/plugin-sdk/text-runtime";
import { formatCliCommand } from "../cli/command-format.js";
import { loadConfig } from "../config/config.js";
import { isLoopbackHost } from "../gateway/net.js";
import { getBridgeAuthForPort } from "./bridge-auth-registry.js";
import { resolveBrowserConfig } from "./config.js";
import { resolveBrowserControlAuth } from "./control-auth.js";
import { startBrowserControlServiceFromConfig } from "./control-service.js";
import { resolveBrowserRateLimitMessage } from "./rate-limit-message.js";

// Application-level error from the browser control service (service is reachable
// but returned an error response). Must NOT be wrapped with "Can't reach ..." messaging.
class BrowserServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserServiceError";
  }
}

type LoopbackBrowserAuthDeps = {
  loadConfig: typeof loadConfig;
  resolveBrowserControlAuth: typeof resolveBrowserControlAuth;
  getBridgeAuthForPort: typeof getBridgeAuthForPort;
};

type RelativeBrowserControlDeps = {
  loadConfig: typeof loadConfig;
  resolveBrowserConfig: typeof resolveBrowserConfig;
  startBrowserControlServiceFromConfig: typeof startBrowserControlServiceFromConfig;
};

function isAbsoluteHttp(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

function isLoopbackHttpUrl(url: string): boolean {
  try {
    return isLoopbackHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

function withLoopbackBrowserAuthImpl(
  url: string,
  init: (RequestInit & { timeoutMs?: number }) | undefined,
  deps: LoopbackBrowserAuthDeps,
): RequestInit & { timeoutMs?: number } {
  const headers = new Headers(init?.headers ?? {});
  if (headers.has("authorization") || headers.has("x-openclaw-password")) {
    return { ...init, headers };
  }
  if (!isLoopbackHttpUrl(url)) {
    return { ...init, headers };
  }

  try {
    const cfg = deps.loadConfig();
    const auth = deps.resolveBrowserControlAuth(cfg);
    if (auth.token) {
      headers.set("Authorization", `Bearer ${auth.token}`);
      return { ...init, headers };
    }
    if (auth.password) {
      headers.set("x-openclaw-password", auth.password);
      return { ...init, headers };
    }
  } catch {
    // ignore config/auth lookup failures and continue without auth headers
  }

  // Sandbox bridge servers can run with per-process ephemeral auth on dynamic ports.
  // Fall back to the in-memory registry if config auth is not available.
  try {
    const parsed = new URL(url);
    const port =
      parsed.port && Number.parseInt(parsed.port, 10) > 0
        ? Number.parseInt(parsed.port, 10)
        : parsed.protocol === "https:"
          ? 443
          : 80;
    const bridgeAuth = deps.getBridgeAuthForPort(port);
    if (bridgeAuth?.token) {
      headers.set("Authorization", `Bearer ${bridgeAuth.token}`);
    } else if (bridgeAuth?.password) {
      headers.set("x-openclaw-password", bridgeAuth.password);
    }
  } catch {
    // ignore
  }

  return { ...init, headers };
}

function withLoopbackBrowserAuth(
  url: string,
  init: (RequestInit & { timeoutMs?: number }) | undefined,
): RequestInit & { timeoutMs?: number } {
  return withLoopbackBrowserAuthImpl(url, init, {
    loadConfig,
    resolveBrowserControlAuth,
    getBridgeAuthForPort,
  });
}

async function resolveRelativeBrowserControlUrlImpl(
  deps: RelativeBrowserControlDeps,
): Promise<string> {
  const cfg = deps.loadConfig();
  const resolved = deps.resolveBrowserConfig(cfg.browser, cfg);
  const started = await deps.startBrowserControlServiceFromConfig();
  if (!started || !resolved.enabled) {
    throw new Error("browser control disabled");
  }
  return `http://127.0.0.1:${resolved.controlPort}`;
}

async function resolveRelativeBrowserControlUrl(): Promise<string> {
  return await resolveRelativeBrowserControlUrlImpl({
    loadConfig,
    resolveBrowserConfig,
    startBrowserControlServiceFromConfig,
  });
}

const BROWSER_TOOL_MODEL_HINT =
  "Do NOT retry the browser tool — it will keep failing. " +
  "Use an alternative approach or inform the user that the browser is currently unavailable.";

function isRateLimitStatus(status: number): boolean {
  return status === 429;
}

function resolveBrowserFetchOperatorHint(url: string): string {
  const isLocal = !isAbsoluteHttp(url);
  return isLocal
    ? `Restart the OpenClaw gateway (OpenClaw.app menubar, or \`${formatCliCommand("openclaw gateway")}\`).`
    : "If this is a sandboxed session, ensure the sandbox browser is running.";
}

function appendBrowserToolModelHint(message: string): string {
  if (message.includes(BROWSER_TOOL_MODEL_HINT)) {
    return message;
  }
  return `${message} ${BROWSER_TOOL_MODEL_HINT}`;
}

async function discardResponseBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // Best effort only; we're already returning a stable error message.
  }
}

function enhanceBrowserFetchError(url: string, err: unknown, timeoutMs: number): Error {
  const operatorHint = resolveBrowserFetchOperatorHint(url);
  const msg = String(err);
  const msgLower = normalizeLowercaseStringOrEmpty(msg);
  const looksLikeTimeout =
    msgLower.includes("timed out") ||
    msgLower.includes("timeout") ||
    msgLower.includes("aborted") ||
    msgLower.includes("abort") ||
    msgLower.includes("aborterror");
  if (looksLikeTimeout) {
    return new Error(
      appendBrowserToolModelHint(
        `Can't reach the OpenClaw browser control service (timed out after ${timeoutMs}ms). ${operatorHint}`,
      ),
    );
  }
  return new Error(
    appendBrowserToolModelHint(
      `Can't reach the OpenClaw browser control service. ${operatorHint} (${msg})`,
    ),
  );
}

async function fetchHttpJson<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const timeoutMs = init.timeoutMs ?? 5000;
  const ctrl = new AbortController();
  const upstreamSignal = init.signal;
  let upstreamAbortListener: (() => void) | undefined;
  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      ctrl.abort(upstreamSignal.reason);
    } else {
      upstreamAbortListener = () => ctrl.abort(upstreamSignal.reason);
      upstreamSignal.addEventListener("abort", upstreamAbortListener, { once: true });
    }
  }

  const t = setTimeout(() => ctrl.abort(new Error("timed out")), timeoutMs);
  let release: (() => Promise<void>) | undefined;
  try {
    const guarded = await fetchWithSsrFGuard({
      url,
      init,
      signal: ctrl.signal,
      policy: { allowPrivateNetwork: true },
      auditContext: "browser-control-client",
    });
    release = guarded.release;
    const res = guarded.response;
    if (!res.ok) {
      if (isRateLimitStatus(res.status)) {
        // Do not reflect upstream response text into the error surface (log/agent injection risk)
        await discardResponseBody(res);
        throw new BrowserServiceError(
          `${resolveBrowserRateLimitMessage(url)} ${BROWSER_TOOL_MODEL_HINT}`,
        );
      }
      const text = await res.text().catch(() => "");
      throw new BrowserServiceError(text || `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
    await release?.();
    if (upstreamSignal && upstreamAbortListener) {
      upstreamSignal.removeEventListener("abort", upstreamAbortListener);
    }
  }
}

export async function fetchBrowserJson<T>(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const timeoutMs = init?.timeoutMs ?? 5000;
  try {
    if (isAbsoluteHttp(url)) {
      const httpInit = withLoopbackBrowserAuth(url, init);
      return await fetchHttpJson<T>(url, { ...httpInit, timeoutMs });
    }
    const controlBaseUrl = await resolveRelativeBrowserControlUrl();
    const absoluteUrl = new URL(url, `${controlBaseUrl}/`).toString();
    const httpInit = withLoopbackBrowserAuth(absoluteUrl, init);
    return await fetchHttpJson<T>(absoluteUrl, { ...httpInit, timeoutMs });
  } catch (err) {
    if (err instanceof BrowserServiceError) {
      throw err;
    }
    throw enhanceBrowserFetchError(url, err, timeoutMs);
  }
}

export const __test = {
  withLoopbackBrowserAuth: withLoopbackBrowserAuthImpl,
  resolveRelativeBrowserControlUrl: resolveRelativeBrowserControlUrlImpl,
};
