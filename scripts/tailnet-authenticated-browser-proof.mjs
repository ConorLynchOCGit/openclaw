#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readGatewayToken() {
  const envText = fs.readFileSync("/root/.openclaw/.env", "utf8");
  const tokenLine = envText
    .split(/\r?\n/)
    .find((line) => line.startsWith("OPENCLAW_GATEWAY_TOKEN="));
  if (tokenLine == null) {
    throw new Error("missing OPENCLAW_GATEWAY_TOKEN in /root/.openclaw/.env");
  }
  const token = tokenLine.slice("OPENCLAW_GATEWAY_TOKEN=".length).trim();
  if (token.length === 0) {
    throw new Error("OPENCLAW_GATEWAY_TOKEN is empty in /root/.openclaw/.env");
  }
  return token;
}

function runCliJson(args) {
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

async function installBrowserProbe(page) {
  await page.addInitScript(() => {
    const probe = {
      wsFrames: [],
      wsMessages: [],
      wsCloses: [],
    };
    window.__OPENCLAW_AUTH_PROBE__ = probe;

    const OriginalWebSocket = window.WebSocket;
    class ProbeWebSocket extends OriginalWebSocket {
      constructor(...args) {
        super(...args);
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
                  errorMessage: parsed.error?.message ?? null,
                  errorCode: parsed.error?.details?.code ?? null,
                  helloType: parsed.payload?.type ?? null,
                  helloDeviceToken: Boolean(parsed.payload?.auth?.deviceToken),
                }
              : { type: typeof event.data },
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
                hasDevice: Boolean(parsed.params?.device),
                deviceId: parsed.params?.device?.id ?? null,
                hasToken: Boolean(parsed.params?.auth?.token),
                hasDeviceToken: Boolean(parsed.params?.auth?.deviceToken),
                scopes: Array.isArray(parsed.params?.scopes) ? parsed.params.scopes : null,
              }
            : { type: typeof data },
        );
        return super.send(data);
      }
    }
    Object.defineProperty(ProbeWebSocket, "CONNECTING", {
      value: OriginalWebSocket.CONNECTING,
    });
    Object.defineProperty(ProbeWebSocket, "OPEN", {
      value: OriginalWebSocket.OPEN,
    });
    Object.defineProperty(ProbeWebSocket, "CLOSING", {
      value: OriginalWebSocket.CLOSING,
    });
    Object.defineProperty(ProbeWebSocket, "CLOSED", {
      value: OriginalWebSocket.CLOSED,
    });
    window.WebSocket = ProbeWebSocket;
  });
}

async function readPageState(page) {
  return await page.evaluate(() => {
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
    const selector = document.querySelector(
      'select[aria-label="Select session"], .chat-controls__session select',
    );
    const loginGate = document.querySelector(".login-gate");
    const deviceIdentityRaw = window.localStorage.getItem("openclaw-device-identity-v1");
    const deviceAuthRaw = window.localStorage.getItem("openclaw.device.auth.v1");
    const deviceIdentity = deviceIdentityRaw ? JSON.parse(deviceIdentityRaw) : null;
    const deviceAuth = deviceAuthRaw ? JSON.parse(deviceAuthRaw) : null;
    return {
      href: location.href,
      hash: location.hash,
      hasSelector: Boolean(selector),
      selectorOptionCount: selector ? selector.querySelectorAll("option").length : 0,
      hasLoginGate: Boolean(loginGate),
      bodyTextSnippet: document.body?.innerText?.slice(0, 400) ?? "",
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
      probe: window.__OPENCLAW_AUTH_PROBE__ ?? null,
    };
  });
}

async function waitForConnectOutcome(page) {
  await page.waitForFunction(
    () => {
      const selector = document.querySelector(
        'select[aria-label="Select session"], .chat-controls__session select',
      );
      const bodyText = document.body?.innerText ?? "";
      return Boolean(selector) || bodyText.includes("pairing required");
    },
    { timeout: 10_000 },
  );
}

async function main() {
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN ?? "https://srv1425839.tailbcf154.ts.net";
  const token = readGatewayToken();
  const url = `${origin}/chat?session=main#token=${encodeURIComponent(token)}`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await installBrowserProbe(page);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await waitForConnectOutcome(page);
    const initial = await readPageState(page);
    const requestedDeviceId =
      initial.probe?.wsFrames?.find((frame) => frame?.method === "connect")?.deviceId ??
      initial.deviceIdentity?.deviceId ??
      null;
    if (requestedDeviceId == null) {
      throw new Error("missing browser device id from initial connect");
    }

    const beforeList = runCliJson(["devices", "list", "--json"]);
    const pending = Array.isArray(beforeList.pending)
      ? beforeList.pending.find((entry) => entry.deviceId === requestedDeviceId)
      : null;
    if (pending == null) {
      throw new Error(`no pending pairing request found for device ${requestedDeviceId}`);
    }

    const approved = runCliJson(["devices", "approve", pending.requestId, "--json"]);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5_000);
    const afterReload = await readPageState(page);

    process.stdout.write(
      `${JSON.stringify(
        {
          origin,
          requestedDeviceId,
          approvedRequestId: pending.requestId,
          initial,
          approved,
          afterReload,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await browser.close();
  }
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
