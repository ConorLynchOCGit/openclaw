#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MAIN_SESSION_ALIAS,
  OperatorBrowserHarness,
} from "./lib/operator-browser-harness.mjs";

const OUTPUT_ROOT = ".artifacts/model-memory/work-queue-ui-slice";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function timestampId() {
  return new Date().toISOString().replace(/[-:.]/gu, "").replace(/Z$/u, "Z");
}

async function withTimeout(label, promise, timeoutMs) {
  let timeout = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function normalizeDuplicateKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/gu, " ")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim();
}

function groupDuplicateTitles(items) {
  const groups = new Map();
  for (const item of items) {
    const key = normalizeDuplicateKey(item.title);
    if (!key) {
      continue;
    }
    const current = groups.get(key) ?? [];
    current.push(item);
    groups.set(key, current);
  }
  return [...groups.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([key, entries]) => ({
      key,
      count: entries.length,
      titles: [...new Set(entries.map((entry) => entry.title))],
      items: entries.map((entry) => ({
        id: entry.id,
        lane: entry.lane,
        status: entry.status,
        queueItemId: entry.queueItemId,
        opportunityId: entry.opportunityId,
      })),
    }));
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(root, OUTPUT_ROOT, stamp);
  await mkdir(outputDir, { recursive: true });
  const screenshotPath = path.join(outputDir, "work-queue.png");
  const domPath = path.join(outputDir, "work-queue-dom.json");
  const reportPath = path.join(outputDir, "work-queue-ui-slice-proof.json");

  const harness = await new OperatorBrowserHarness({ headless: true }).start();
  try {
    process.stderr.write("[work-queue-proof] opening authenticated session\n");
    await withTimeout(
      "authenticated session open",
      harness.openSession(DEFAULT_MAIN_SESSION_ALIAS),
      60_000,
    );
    process.stderr.write("[work-queue-proof] loading Work Queue state\n");
    const state = await withTimeout(
      "work queue page evaluation",
      harness.page.evaluate(async () => {
        const boundedTextInPage = (value, maxChars = 2000) => {
          const text = String(value ?? "")
            .replace(/\s+/gu, " ")
            .trim();
          return text.length <= maxChars ? text : `${text.slice(0, maxChars)} [bounded-truncated]`;
        };
        const app = document.querySelector("openclaw-app");
        if (!app?.client) {
          throw new Error("openclaw app client is unavailable");
        }
        const waitForIdle = async () => {
          const deadline = Date.now() + 90_000;
          while (
            (app.productProactivityLoading || app.proactivityInboxLoading) &&
            Date.now() < deadline
          ) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          if (app.productProactivityLoading || app.proactivityInboxLoading) {
            throw new Error("proactivity loaders did not become idle");
          }
        };

        app.setTab?.("workQueue");
        await waitForIdle();
        await Promise.all([app.loadProductProactivityQueue(), app.loadProactivityInbox()]);
        await waitForIdle();

        const objects = app.getWorkQueueObjects?.() ?? [];
        const visible = app.getVisibleWorkQueueObjects?.() ?? [];
        const visibleActiveObjects = visible.filter((object) =>
          ["new", "drafted", "needs_revision", "failed"].includes(object.visibleStatus),
        );
        const selected = app.getSelectedWorkQueueObject?.() ?? null;
        const preferredSelection =
          visible.find(
            (object) => object.artifact?.kind === "plan" || object.artifact?.kind === "skill",
          ) ??
          visible[0] ??
          null;
        if ((!selected || selected.artifact?.kind === "none") && preferredSelection?.id) {
          app.selectWorkQueueObject?.(preferredSelection.id, { replace: true });
          await app.updateComplete;
        }

        const selectedAfter = app.getSelectedWorkQueueObject?.() ?? null;
        const section = document.querySelector(".work-queue-page");
        const detail = document.querySelector(".work-queue-detail");
        const evidence = document.querySelector(".work-queue-detail details");
        const listGroups = Array.from(
          document.querySelectorAll(".work-queue-list-group__title"),
        ).map((node) => node.textContent?.trim() ?? "");
        const actions = Array.from(
          document.querySelectorAll(".work-queue-detail .work-queue-actions button"),
        ).map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "");
        const codexPrompt = document.querySelector(".work-queue-artifact-body code");
        return {
          href: location.href,
          pathname: location.pathname,
          search: location.search,
          tab: app.tab,
          objectCount: objects.length,
          visibleCount: visible.length,
          queueCount: app.productProactivityQueue?.length ?? 0,
          inboxCount: app.proactivityInboxDigest?.items?.length ?? 0,
          selectedObjectId: selectedAfter?.id ?? null,
          selectedStatus: selectedAfter?.visibleStatus ?? null,
          selectedLane: selectedAfter?.lane ?? null,
          selectedArtifactKind: selectedAfter?.artifact?.kind ?? null,
          listGroups,
          actions,
          hasWorkQueuePage: Boolean(section),
          hasDetail: Boolean(detail),
          detailText: boundedTextInPage(detail?.textContent ?? ""),
          evidenceClosed: evidence ? evidence.open === false : null,
          codexPromptVisible: Boolean(codexPrompt?.textContent?.trim()),
          visibleActiveTitles: visibleActiveObjects.map((object) => ({
            id: object.id,
            queueItemId: object.queueItemId,
            opportunityId: object.queueItem?.opportunityId ?? null,
            lane: object.lane,
            status: object.visibleStatus,
            title: object.title,
          })),
          selectedSummary: selectedAfter
            ? {
                title: selectedAfter.title,
                summary: selectedAfter.summary,
                recommendedNextStep: selectedAfter.recommendedNextStep,
              }
            : null,
          queueSummaries: (app.productProactivityQueue ?? []).slice(0, 8).map((item) => ({
            queueItemId: item.queueItemId,
            opportunityId: item.opportunityId ?? null,
            status: item.status,
            layer: item.layer,
            reviewStatus: item.reviewStatus ?? item.plannedArtifact?.reviewStatus ?? null,
            title: item.userFacingBrief?.title ?? item.planTitle ?? null,
            kindLabel: item.userFacingBrief?.kindLabel ?? null,
            hasPlannedArtifact: Boolean(item.plannedArtifact),
            hasSkillifierDraft: Boolean(item.skillifierDraft),
          })),
        };
      }),
      150_000,
    );

    process.stderr.write("[work-queue-proof] writing artifact snapshots\n");
    await harness.page.screenshot({ path: screenshotPath, fullPage: true });
    await writeFile(domPath, JSON.stringify(state, null, 2));

    const duplicateTitleGroups = groupDuplicateTitles(state.visibleActiveTitles ?? []);
    const report = {
      generatedAt: new Date().toISOString(),
      artifactRoot: outputDir,
      screenshotPath,
      domPath,
      checks: {
        routeOpened: state.pathname.includes("/work-queue") || state.tab === "workQueue",
        selectedObjectResolved: Boolean(state.selectedObjectId),
        groupsVisible: state.listGroups.length > 0,
        detailVisible: state.hasDetail,
        artifactVisible:
          state.selectedArtifactKind === "plan" || state.selectedArtifactKind === "skill",
        evidenceHiddenByDefault: state.evidenceClosed === true,
        noExactDuplicateActiveTitles: duplicateTitleGroups.length === 0,
      },
      duplicateTitleGroups,
      state,
    };

    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await harness.close();
  }
}

await main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
