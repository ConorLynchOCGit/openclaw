#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";
import { chromium } from "playwright";

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

async function main() {
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN ?? "https://srv1425839.tailbcf154.ts.net";
  const token = readGatewayToken();
  const targetUrl = `${origin}/chat?session=main#token=${encodeURIComponent(token)}`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.addInitScript(() => {
    const probe = {
      events: [],
      sessionOps: [],
      historyOps: [],
      wsFrames: [],
      wsMessages: [],
      wsCloses: [],
    };
    window.__OPENCLAW_AUTH_PROBE__ = probe;

    const originalSetItem = Object.getOwnPropertyDescriptor(Storage.prototype, "setItem")?.value;
    const originalRemoveItem = Object.getOwnPropertyDescriptor(
      Storage.prototype,
      "removeItem",
    )?.value;
    if (typeof originalSetItem !== "function" || typeof originalRemoveItem !== "function") {
      throw new Error("Unable to install sessionStorage probe");
    }
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
    Storage.prototype.removeItem = function (key) {
      if (this === window.sessionStorage) {
        probe.sessionOps.push({ op: "removeItem", key });
      }
      return originalRemoveItem.call(this, key);
    };

    const originalReplaceState = history.replaceState.bind(history);
    history.replaceState = function (state, unused, url) {
      probe.historyOps.push({
        method: "replaceState",
        url: String(url ?? ""),
      });
      return originalReplaceState(state, unused, url);
    };

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
                  kind: "json",
                  type: parsed.type ?? null,
                  event: parsed.event ?? null,
                  ok: parsed.ok ?? null,
                  id: parsed.id ?? null,
                  errorMessage: parsed.error?.message ?? null,
                  errorCode: parsed.error?.details?.code ?? null,
                  payloadType: parsed.payload?.type ?? null,
                }
              : {
                  kind: typeof event.data,
                  rawLength: typeof event.data === "string" ? event.data.length : null,
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
                kind: "json",
                method: parsed.method ?? null,
                id: parsed.id ?? null,
                hasDevice: Boolean(parsed.params?.device),
                deviceId: parsed.params?.device?.id ?? null,
                authKeys: Object.keys(parsed.params?.auth ?? {}),
                hasToken: Boolean(parsed.params?.auth?.token),
                hasDeviceToken: Boolean(parsed.params?.auth?.deviceToken),
                scopes: Array.isArray(parsed.params?.scopes) ? parsed.params.scopes : null,
              }
            : {
                kind: typeof data,
                rawLength: typeof data === "string" ? data.length : null,
              },
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

    probe.events.push({
      type: "init",
      href: location.href,
      hash: location.hash,
    });
  });

  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    const result = await page.evaluate(() => {
      const probe = window.__OPENCLAW_AUTH_PROBE__ ?? {};
      const sessionKeys = [];
      for (let i = 0; i < window.sessionStorage.length; i += 1) {
        const key = window.sessionStorage.key(i);
        if (key) {
          sessionKeys.push(key);
        }
      }
      const selector = document.querySelector(
        'select[aria-label="Select session"], .chat-controls__session select',
      );
      const loginGate = document.querySelector(".login-gate");
      const connectButton = document.querySelector(".login-gate__connect");
      return {
        href: location.href,
        hash: location.hash,
        title: document.title,
        hasSelector: Boolean(selector),
        selectorOptionCount: selector ? selector.querySelectorAll("option").length : 0,
        hasLoginGate: Boolean(loginGate),
        hasConnectButton: Boolean(connectButton),
        sessionKeys,
        probe,
        bodyTextSnippet: document.body?.innerText?.slice(0, 400) ?? "",
      };
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await browser.close();
  }
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
