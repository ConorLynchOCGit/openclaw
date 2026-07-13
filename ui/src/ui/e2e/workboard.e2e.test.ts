// Control UI tests cover workboard behavior.
import { copyFile, mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "../../../../packages/gateway-protocol/src/version.js";
import {
  canRunPlaywrightChromium,
  installMockGateway,
  resolvePlaywrightChromiumExecutablePath,
  startControlUiE2eServer,
  type ControlUiE2eServer,
  type MockGatewayControls,
  type MockGatewayRequest,
} from "../../test-helpers/control-ui-e2e.ts";
import { WORKBOARD_STATUSES, type WorkboardCard } from "../controllers/workboard.ts";
import type { GatewaySessionRow } from "../types.ts";

const chromiumExecutablePath = resolvePlaywrightChromiumExecutablePath(chromium.executablePath());
const chromiumAvailable = canRunPlaywrightChromium(chromiumExecutablePath);
const allowMissingChromium = process.env.OPENCLAW_UI_E2E_ALLOW_MISSING_CHROMIUM === "1";
const describeControlUiE2e = chromiumAvailable || !allowMissingChromium ? describe : describe.skip;
const artifactDir = path.resolve(process.cwd(), ".artifacts/control-ui-e2e/workboard");
const viewport = { height: 1000, width: 2400 };
const baseTime = Date.parse("2026-06-01T18:00:00.000Z");
const linkedSessionKey = "agent:main:workboard-proof";
const linkedSessionName = "Implementation session";

let browser: Browser;
let server: ControlUiE2eServer;

type RecordedPage = {
  context: BrowserContext;
  diagnostics: PageDiagnostics;
  page: Page;
  rawVideoDir: string;
};

type ProofArtifacts = {
  accessibility: string[];
  diagnostics: string[];
  screenshots: string[];
  traces: string[];
  videos: string[];
};

type PageDiagnostics = {
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
};

function emptyProofArtifacts(): ProofArtifacts {
  return { accessibility: [], diagnostics: [], screenshots: [], traces: [], videos: [] };
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected object value");
  }
  return value as Record<string, unknown>;
}

function requestParams(request: MockGatewayRequest): Record<string, unknown> {
  return requireRecord(request.params);
}

async function waitForRequests(
  gateway: MockGatewayControls,
  method: string,
  count: number,
): Promise<MockGatewayRequest[]> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const requests = await gateway.getRequests(method);
    if (requests.length >= count) {
      return requests;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }
  throw new Error(`Timed out waiting for ${count} ${method} requests`);
}

async function waitForNextRequest(
  gateway: MockGatewayControls,
  method: string,
  previousCount: number,
): Promise<MockGatewayRequest> {
  const requests = await waitForRequests(gateway, method, previousCount + 1);
  const request = requests.at(-1);
  if (!request) {
    throw new Error(`No ${method} request found`);
  }
  return request;
}

function workboardConfigSnapshot() {
  const config = {
    plugins: {
      entries: {
        workboard: { enabled: true },
      },
    },
  };
  return {
    config,
    hash: "workboard-e2e-config",
    path: "/tmp/openclaw-e2e/openclaw.json",
    raw: JSON.stringify(config, null, 2),
    resolved: config,
    sourceConfig: config,
  };
}

function sessionsListResponse(sessions: GatewaySessionRow[]) {
  return {
    count: sessions.length,
    defaults: {
      contextTokens: null,
      model: "gpt-5.5",
      modelProvider: "openai",
    },
    path: "",
    sessions,
    ts: baseTime,
  };
}

function sessionRow(overrides: Partial<GatewaySessionRow> = {}): GatewaySessionRow {
  return {
    contextTokens: 0,
    displayName: linkedSessionName,
    hasActiveRun: false,
    key: linkedSessionKey,
    kind: "direct",
    label: linkedSessionName,
    model: "gpt-5.5",
    modelProvider: "openai",
    totalTokens: 0,
    updatedAt: baseTime,
    ...overrides,
  };
}

function readOnlyConnectResponse() {
  return {
    auth: {
      deviceToken: "e2e-read-only-device-token",
      role: "operator",
      scopes: ["operator.read"],
    },
    features: { events: [], methods: ["chat.startup"] },
    protocol: PROTOCOL_VERSION,
    server: { connId: "control-ui-e2e-read-only", version: "e2e" },
    snapshot: {
      sessionDefaults: {
        defaultAgentId: "main",
        mainKey: "main",
        mainSessionKey: "main",
        scope: "agent",
      },
    },
    type: "hello-ok",
  };
}

function writableConnectResponseWithUpdate() {
  const response = readOnlyConnectResponse();
  return {
    ...response,
    auth: {
      ...response.auth,
      scopes: [
        "operator.admin",
        "operator.read",
        "operator.write",
        "operator.approvals",
        "operator.pairing",
      ],
    },
    snapshot: {
      ...response.snapshot,
      updateAvailable: {
        channel: "latest",
        currentVersion: "2026.7.11",
        latestVersion: "2026.7.12",
      },
    },
  };
}

function card(
  overrides: Partial<WorkboardCard> & Pick<WorkboardCard, "id" | "title">,
): WorkboardCard {
  return {
    createdAt: baseTime,
    labels: [],
    notes: "",
    position: 1000,
    priority: "normal",
    status: "todo",
    updatedAt: baseTime,
    ...overrides,
  };
}

function cardsListResponse(cards: WorkboardCard[]) {
  return {
    cards,
    statuses: WORKBOARD_STATUSES,
  };
}

function statusColumn(page: Page, status: string) {
  return page
    .locator(".workboard-column")
    .filter({
      has: page.locator(".workboard-column__header h2", {
        hasText: new RegExp(`^${status}$`, "u"),
      }),
    })
    .first();
}

function cardInColumn(page: Page, status: string, title: string) {
  return statusColumn(page, status).locator(".workboard-card", { hasText: title }).first();
}

async function newRecordedPage(label: string): Promise<RecordedPage> {
  await mkdir(artifactDir, { recursive: true });
  const rawVideoDir = path.join(artifactDir, `${label}-raw`);
  await rm(rawVideoDir, { force: true, recursive: true });
  await mkdir(rawVideoDir, { recursive: true });
  const context = await browser.newContext({
    locale: "en-US",
    recordVideo: {
      dir: rawVideoDir,
      size: viewport,
    },
    serviceWorkers: "block",
    viewport,
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  const diagnostics: PageDiagnostics = {
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
  };
  page.on("console", (message) => {
    if (message.type() === "error") {
      diagnostics.consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(String(error)));
  page.on("requestfailed", (request) => {
    diagnostics.requestFailures.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "unknown failure"}`,
    );
  });
  page.setDefaultTimeout(10_000);
  return { context, diagnostics, page, rawVideoDir };
}

async function captureScreenshot(
  page: Page,
  artifacts: ProofArtifacts,
  name: string,
): Promise<void> {
  const screenshotPath = path.join(artifactDir, `${name}.png`);
  await page.screenshot({ fullPage: true, path: screenshotPath });
  artifacts.screenshots.push(screenshotPath);
}

async function captureAccessibility(
  page: Page,
  artifacts: ProofArtifacts,
  name: string,
): Promise<void> {
  const session = await page.context().newCDPSession(page);
  try {
    const snapshot = await session.send("Accessibility.getFullAXTree");
    const nodes = snapshot.nodes.map((node) => ({
      ignored: node.ignored,
      name: node.name?.value ?? "",
      role: node.role?.value ?? "",
    }));
    const unnamedInteractive = nodes.filter(
      (node) =>
        !node.ignored &&
        ["button", "checkbox", "combobox", "link", "searchbox", "textbox"].includes(node.role) &&
        !node.name,
    );
    expect(unnamedInteractive).toEqual([]);
    const outputPath = path.join(artifactDir, `${name}-accessibility.json`);
    await writeFile(
      outputPath,
      `${JSON.stringify({ nodes, unnamedInteractive }, null, 2)}\n`,
      "utf-8",
    );
    artifacts.accessibility.push(outputPath);
  } finally {
    await session.detach();
  }
}

async function closeRecordedPage(
  recorded: RecordedPage,
  artifacts: ProofArtifacts,
  label: string,
  failed = false,
): Promise<void> {
  const video = recorded.page.video();
  try {
    const diagnosticsPath = path.join(artifactDir, `${label}-diagnostics.json`);
    await writeFile(diagnosticsPath, `${JSON.stringify(recorded.diagnostics, null, 2)}\n`, "utf-8");
    artifacts.diagnostics.push(diagnosticsPath);
    if (failed) {
      const tracePath = path.join(artifactDir, `${label}-failure-trace.zip`);
      await recorded.context.tracing.stop({ path: tracePath });
      artifacts.traces.push(tracePath);
    } else {
      await recorded.context.tracing.stop();
      expect(recorded.diagnostics).toEqual({
        consoleErrors: [],
        pageErrors: [],
        requestFailures: [],
      });
    }
    await recorded.context.close();
    if (!video) {
      return;
    }
    const rawVideoPath = await video.path();
    const videoPath = path.join(artifactDir, `${label}.webm`);
    await copyFile(rawVideoPath, videoPath);
    artifacts.videos.push(videoPath);
  } finally {
    await rm(recorded.rawVideoDir, { force: true, recursive: true });
  }
}

describeControlUiE2e("Control UI Workboard mocked Gateway E2E", () => {
  beforeAll(async () => {
    if (!chromiumAvailable) {
      throw new Error(
        `Playwright Chromium is not installed at ${chromiumExecutablePath}. Run \`pnpm --dir ui exec playwright install chromium\`, or set OPENCLAW_UI_E2E_ALLOW_MISSING_CHROMIUM=1 only when intentionally skipping this lane.`,
      );
    }
    server = await startControlUiE2eServer();
    browser = await chromium.launch({ executablePath: chromiumExecutablePath });
  });

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it("persists Workboard create, edit, running move, lifecycle sync, reload, and read-only state", async () => {
    await rm(artifactDir, { force: true, recursive: true });
    const artifacts = emptyProofArtifacts();
    const createdCard = card({
      id: "card-1",
      labels: ["ui", "proof"],
      notes: "Acceptance: browser proof",
      sessionKey: linkedSessionKey,
      title: "Draft Workboard browser proof",
      updatedAt: baseTime + 1,
    });
    const editedCard = card({
      ...createdCard,
      labels: ["ui", "proof", "e2e"],
      notes: "Acceptance: mocked Gateway browser proof\nProof: pending",
      priority: "high",
      title: "Workboard browser proof",
      updatedAt: baseTime + 2,
    });
    const runningCard = card({
      ...editedCard,
      status: "running",
      updatedAt: baseTime + 3,
    });
    const reviewedCard = card({
      ...runningCard,
      events: [
        {
          at: baseTime + 4,
          fromStatus: "running",
          id: "event-review",
          kind: "moved",
          toStatus: "review",
        },
      ],
      status: "review",
      updatedAt: baseTime + 4,
    });

    const writable = await newRecordedPage("workboard-writable");
    const writableGateway = await installMockGateway(writable.page, {
      methodResponses: {
        "config.get": workboardConfigSnapshot(),
        "sessions.list": sessionsListResponse([sessionRow()]),
        "tasks.list": { nextCursor: null, tasks: [] },
        "workboard.cards.list": cardsListResponse([]),
      },
    });

    let writableFailed = false;
    try {
      const response = await writable.page.goto(`${server.baseUrl}workboard`);
      expect(response?.status()).toBe(200);
      await statusColumn(writable.page, "Todo").waitFor({ state: "visible" });
      await captureScreenshot(writable.page, artifacts, "01-empty-board");

      await writableGateway.deferNext("workboard.cards.create");
      await writable.page
        .locator(".workboard-toolbar__actions")
        .getByRole("button", { name: /New card/u })
        .click();
      const createDialog = writable.page.getByRole("dialog", { name: "New card" });
      await createDialog.getByLabel("Title").fill(createdCard.title);
      await createDialog.getByLabel("Notes").fill(createdCard.notes ?? "");
      await createDialog.getByLabel("Session").selectOption(linkedSessionKey);
      await createDialog.getByLabel("Labels").fill("ui, proof");
      await captureScreenshot(writable.page, artifacts, "02-create-dialog");
      const createBefore = (await writableGateway.getRequests("workboard.cards.create")).length;
      await createDialog.getByRole("button", { name: /^Create$/u }).click();
      const createRequest = await waitForNextRequest(
        writableGateway,
        "workboard.cards.create",
        createBefore,
      );
      expect(requestParams(createRequest)).toMatchObject({
        labels: ["ui", "proof"],
        notes: createdCard.notes,
        sessionKey: linkedSessionKey,
        status: "todo",
        title: createdCard.title,
      });
      await writableGateway.resolveDeferred("workboard.cards.create", { card: createdCard });
      await cardInColumn(writable.page, "Todo", createdCard.title).waitFor({ state: "visible" });
      await captureScreenshot(writable.page, artifacts, "03-created-card");

      await writableGateway.deferNext("workboard.cards.update");
      await cardInColumn(writable.page, "Todo", createdCard.title)
        .locator('button[title="Edit card"]')
        .click();
      const editDialog = writable.page.getByRole("dialog", { name: "Edit card" });
      await editDialog.getByLabel("Title").fill(editedCard.title);
      await editDialog.getByLabel("Notes").fill(editedCard.notes ?? "");
      await editDialog.getByLabel("Priority").selectOption("high");
      await editDialog.getByLabel("Labels").fill("ui, proof, e2e");
      const updateBeforeEdit = (await writableGateway.getRequests("workboard.cards.update")).length;
      await editDialog.getByRole("button", { name: /^Save$/u }).click();
      const editRequest = await waitForNextRequest(
        writableGateway,
        "workboard.cards.update",
        updateBeforeEdit,
      );
      expect(requestParams(editRequest)).toMatchObject({ id: createdCard.id });
      expect(requireRecord(requestParams(editRequest).patch)).toMatchObject({
        labels: ["ui", "proof", "e2e"],
        notes: editedCard.notes,
        priority: "high",
        sessionKey: linkedSessionKey,
        title: editedCard.title,
      });
      await writableGateway.resolveDeferred("workboard.cards.update", { card: editedCard });
      await cardInColumn(writable.page, "Todo", editedCard.title).waitFor({ state: "visible" });
      await captureScreenshot(writable.page, artifacts, "04-edited-card");

      await cardInColumn(writable.page, "Todo", editedCard.title).click();
      const details = writable.page.locator(".workboard-detail");
      await details.getByText(editedCard.title).waitFor({ state: "visible" });
      await details.getByText("Acceptance: mocked Gateway browser proof").waitFor({
        state: "visible",
      });
      await details.locator('button[title="Cancel"]').click();

      await writableGateway.deferNext("workboard.cards.move");
      const moveBefore = (await writableGateway.getRequests("workboard.cards.move")).length;
      await cardInColumn(writable.page, "Todo", editedCard.title).dragTo(
        statusColumn(writable.page, "Running").locator(".workboard-column__cards"),
      );
      const moveRequest = await waitForNextRequest(
        writableGateway,
        "workboard.cards.move",
        moveBefore,
      );
      expect(requestParams(moveRequest)).toMatchObject({
        id: editedCard.id,
        status: "running",
      });
      await writableGateway.resolveDeferred("workboard.cards.move", { card: runningCard });
      await cardInColumn(writable.page, "Running", editedCard.title).waitFor({
        state: "visible",
      });
      await captureScreenshot(writable.page, artifacts, "05-moved-running");

      await writableGateway.deferNext("workboard.cards.update");
      const syncBefore = (await writableGateway.getRequests("workboard.cards.update")).length;
      await writableGateway.emitGatewayEvent("sessions.changed", {
        ...sessionRow({
          hasActiveRun: false,
          status: "done",
          updatedAt: baseTime + 4,
        }),
        reason: "lifecycle",
        sessionKey: linkedSessionKey,
        ts: baseTime + 4,
      });
      const syncRequest = await waitForNextRequest(
        writableGateway,
        "workboard.cards.update",
        syncBefore,
      );
      expect(requestParams(syncRequest)).toMatchObject({ id: runningCard.id });
      expect(requireRecord(requestParams(syncRequest).patch)).toMatchObject({
        status: "review",
      });
      await writableGateway.resolveDeferred("workboard.cards.update", { card: reviewedCard });
      const reviewedCardSurface = cardInColumn(writable.page, "Review", editedCard.title);
      await reviewedCardSurface.waitFor({ state: "visible" });
      await reviewedCardSurface.getByTitle("View details").click();
      await writable.page.locator(".workboard-detail").getByText("Moved to Review").waitFor({
        state: "visible",
      });
      await captureScreenshot(writable.page, artifacts, "06-lifecycle-review");
      await details.locator('button[title="Cancel"]').click();
      await details.waitFor({ state: "hidden" });

      await writableGateway.deferNext("workboard.cards.list");
      const listBeforeReload = (await writableGateway.getRequests("workboard.cards.list")).length;
      await writable.page
        .locator(".workboard-toolbar__actions")
        .getByRole("button", { name: /^Refresh$/u })
        .click();
      await waitForNextRequest(writableGateway, "workboard.cards.list", listBeforeReload);
      await writableGateway.resolveDeferred("workboard.cards.list", {
        cards: [reviewedCard],
        statuses: WORKBOARD_STATUSES,
      });
      await cardInColumn(writable.page, "Review", editedCard.title).waitFor({ state: "visible" });
      await writable.page.getByText("Acceptance: mocked Gateway browser proof").waitFor({
        state: "visible",
      });
      await captureScreenshot(writable.page, artifacts, "07-reloaded-review");
      await captureAccessibility(writable.page, artifacts, "07-reloaded-review");
    } catch (error) {
      writableFailed = true;
      throw error;
    } finally {
      await closeRecordedPage(writable, artifacts, "workboard-writable", writableFailed);
    }

    const readOnly = await newRecordedPage("workboard-read-only");
    const readOnlyGateway = await installMockGateway(readOnly.page, {
      methodResponses: {
        connect: readOnlyConnectResponse(),
        "config.get": workboardConfigSnapshot(),
        "sessions.list": sessionsListResponse([
          sessionRow({ hasActiveRun: false, status: "done", updatedAt: baseTime + 4 }),
        ]),
        "tasks.list": { nextCursor: null, tasks: [] },
        "workboard.cards.list": cardsListResponse([runningCard]),
      },
    });

    let readOnlyFailed = false;
    try {
      const response = await readOnly.page.goto(`${server.baseUrl}workboard`);
      expect(response?.status()).toBe(200);
      await cardInColumn(readOnly.page, "Running", editedCard.title).waitFor({
        state: "visible",
      });
      await captureScreenshot(readOnly.page, artifacts, "08-read-only-board");
      expect(await readOnly.page.getByRole("button", { name: /New card/u }).count()).toBe(0);
      expect(await readOnly.page.locator('button[title="Edit card"]').count()).toBe(0);
      expect(await readOnly.page.locator('button[title="Delete card"]').count()).toBe(0);
      expect(await readOnly.page.locator('button[title="Run default agent"]').count()).toBe(0);
      expect(
        await cardInColumn(readOnly.page, "Running", editedCard.title).getAttribute("draggable"),
      ).toBe("false");

      await cardInColumn(readOnly.page, "Running", editedCard.title).click();
      await readOnly.page.locator(".workboard-detail").getByText(editedCard.title).waitFor({
        state: "visible",
      });
      expect(await readOnly.page.locator(".workboard-detail__note").count()).toBe(0);
      expect(await readOnly.page.getByRole("button", { name: /Add note/u }).count()).toBe(0);
      expect(await readOnlyGateway.getRequests("workboard.cards.update")).toHaveLength(0);
      expect(await readOnlyGateway.getRequests("workboard.cards.move")).toHaveLength(0);
      expect(await readOnlyGateway.getRequests("workboard.cards.create")).toHaveLength(0);
      await captureAccessibility(readOnly.page, artifacts, "08-read-only-board");
    } catch (error) {
      readOnlyFailed = true;
      throw error;
    } finally {
      await closeRecordedPage(readOnly, artifacts, "workboard-read-only", readOnlyFailed);
    }

    await writeFile(
      path.join(artifactDir, "manifest.json"),
      `${JSON.stringify(artifacts, null, 2)}\n`,
      "utf-8",
    );
  });

  it("previews and explicitly approves one Business Ops commitment on desktop and mobile", async () => {
    const artifacts = emptyProofArtifacts();
    const promotedCard = card({
      id: "card-business-ops",
      title: "Review American Atomics proof-before-promotion revision packet",
      priority: "high",
      labels: ["business-ops", "investor-comms"],
      sourceUrl:
        "business-ops/companies/american-atomics/projects/investor-content-system/campaign-revision-cycle.md#exact-native-workboard-preview-intent",
      metadata: {
        businessOpsPromotion: {
          candidateId: "AA-CYCLE-001",
          projectRef: "business-ops/companies/american-atomics/projects/investor-content-system",
          ownerMode: "shared",
          targetWindow: "After source, asset-rights, and reviewer-route intake",
          decisionBoundary:
            "Internal revision review only; no claim, legal/securities, publication, external-record, or learning acceptance authority.",
          promotedBy: "operator",
          promotedAt: baseTime + 10,
          approvalNote:
            "Operator approves one native internal review commitment only; candidate content remains unpublished and unapproved.",
        },
        comments: [
          {
            id: "learning-1",
            body: "Proposed Business Ops learning (review required): A known/unknown/next-proof structure may improve internal credibility scores versus a generic macro hook; review after approved evidence exists.",
            createdAt: baseTime + 10,
          },
        ],
      },
      updatedAt: baseTime + 10,
    });
    const recorded = await newRecordedPage("workboard-business-ops-promotion");
    const gateway = await installMockGateway(recorded.page, {
      methodResponses: {
        connect: writableConnectResponseWithUpdate(),
        "config.get": workboardConfigSnapshot(),
        "sessions.list": sessionsListResponse([sessionRow()]),
        "tasks.list": { nextCursor: null, tasks: [] },
        "workboard.cards.list": cardsListResponse([]),
      },
    });
    let recordedFailed = false;
    try {
      const response = await recorded.page.goto(`${server.baseUrl}workboard`);
      expect(response?.status()).toBe(200);
      await statusColumn(recorded.page, "Todo").waitFor({ state: "visible" });
      const updateBanner = recorded.page.locator(".update-banner");
      await updateBanner.waitFor({ state: "visible" });
      expect(await updateBanner.evaluate((element) => getComputedStyle(element).position)).toBe(
        "relative",
      );
      await recorded.page.getByRole("button", { name: "Promote candidate" }).click();
      const dialog = recorded.page.getByRole("dialog", { name: "Business Ops promotion" });
      await dialog.getByLabel("Candidate ID").fill("AA-CYCLE-001");
      await dialog
        .getByLabel("Source reference")
        .fill(
          "business-ops/companies/american-atomics/projects/investor-content-system/campaign-revision-cycle.md#exact-native-workboard-preview-intent",
        );
      await dialog
        .getByLabel("Project reference")
        .fill("business-ops/companies/american-atomics/projects/investor-content-system");
      await dialog.getByLabel("Title").fill(promotedCard.title);
      await dialog.getByLabel("Owner mode").selectOption("shared");
      await dialog
        .getByLabel("Target window")
        .fill("After source, asset-rights, and reviewer-route intake");
      await dialog
        .getByLabel("Decision boundary")
        .fill(
          "Internal revision review only; no claim, legal/securities, publication, external-record, or learning acceptance authority.",
        );
      await dialog
        .getByLabel("Approval note")
        .fill(
          "Operator approves one native internal review commitment only; candidate content remains unpublished and unapproved.",
        );
      await dialog
        .getByLabel("Proposed learning")
        .fill(
          "A known/unknown/next-proof structure may improve internal credibility scores versus a generic macro hook; review after approved evidence exists.",
        );
      await captureScreenshot(recorded.page, artifacts, "09-business-ops-promotion-draft");

      await gateway.deferNext("workboard.cards.promoteBusinessOpsCandidate");
      const previewBefore = (
        await gateway.getRequests("workboard.cards.promoteBusinessOpsCandidate")
      ).length;
      await dialog.getByRole("button", { name: "Preview" }).click();
      const previewRequest = await waitForNextRequest(
        gateway,
        "workboard.cards.promoteBusinessOpsCandidate",
        previewBefore,
      );
      expect(requestParams(previewRequest)).toMatchObject({
        approved: false,
        candidateId: "AA-CYCLE-001",
        targetWindow: "After source, asset-rights, and reviewer-route intake",
      });
      expect(await cardInColumn(recorded.page, "Todo", promotedCard.title).count()).toBe(0);
      await gateway.resolveDeferred("workboard.cards.promoteBusinessOpsCandidate", {
        approved: false,
        action: "create",
        changes: ["card"],
      });
      await dialog.getByText("Create one commitment").waitFor({ state: "visible" });
      await captureScreenshot(recorded.page, artifacts, "10-business-ops-promotion-preview");

      await gateway.deferNext("workboard.cards.promoteBusinessOpsCandidate");
      const approvalBefore = (
        await gateway.getRequests("workboard.cards.promoteBusinessOpsCandidate")
      ).length;
      await dialog.getByRole("button", { name: "Approve commitment" }).click();
      const approvalRequest = await waitForNextRequest(
        gateway,
        "workboard.cards.promoteBusinessOpsCandidate",
        approvalBefore,
      );
      expect(requestParams(approvalRequest)).toMatchObject({ approved: true });
      await gateway.resolveDeferred("workboard.cards.promoteBusinessOpsCandidate", {
        approved: true,
        action: "create",
        changes: ["card"],
        card: promotedCard,
      });
      const details = recorded.page.locator(".workboard-detail");
      await details.getByText("Business Ops provenance").waitFor({ state: "visible" });
      await details.getByText("AA-CYCLE-001", { exact: true }).waitFor({ state: "visible" });
      await details
        .getByText("After source, asset-rights, and reviewer-route intake")
        .waitFor({ state: "visible" });
      await details
        .getByText(
          "A known/unknown/next-proof structure may improve internal credibility scores versus a generic macro hook; review after approved evidence exists.",
          {
            exact: true,
          },
        )
        .waitFor({ state: "visible" });
      await captureScreenshot(recorded.page, artifacts, "11-business-ops-promotion-approved");
      await captureAccessibility(recorded.page, artifacts, "11-business-ops-promotion-approved");

      await recorded.page.setViewportSize({ width: 390, height: 844 });
      await details.waitFor({ state: "visible" });
      await captureScreenshot(recorded.page, artifacts, "12-business-ops-promotion-mobile");
      await details.locator('button[title="Cancel"]').click();
      await details.waitFor({ state: "hidden" });
      const board = recorded.page.locator(".workboard-board");
      const laneNavigation = recorded.page.getByRole("navigation", { name: "Workboard lanes" });
      await laneNavigation.getByRole("button", { name: /Review/u }).click();
      await expect.poll(() => board.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      await expect
        .poll(() => recorded.page.evaluate(() => document.activeElement?.id ?? ""))
        .toBe("workboard-column-review");
      await recorded.page
        .locator(".workboard-toolbar__actions .btn")
        .last()
        .scrollIntoViewIfNeeded();
      const lowerActionBox = await recorded.page
        .locator(".workboard-toolbar__actions .btn")
        .last()
        .boundingBox();
      expect(lowerActionBox).not.toBeNull();
      expect((lowerActionBox?.y ?? 0) + (lowerActionBox?.height ?? 0)).toBeLessThanOrEqual(844);
      await captureScreenshot(recorded.page, artifacts, "13-business-ops-mobile-board");
      await captureAccessibility(recorded.page, artifacts, "13-business-ops-mobile-board");
    } catch (error) {
      recordedFailed = true;
      throw error;
    } finally {
      await closeRecordedPage(
        recorded,
        artifacts,
        "workboard-business-ops-promotion",
        recordedFailed,
      );
    }
    await writeFile(
      path.join(artifactDir, "manifest-business-ops-promotion.json"),
      `${JSON.stringify(artifacts, null, 2)}\n`,
      "utf-8",
    );
  });

  it("retains a Playwright trace when an acceptance step fails", async () => {
    const artifacts = emptyProofArtifacts();
    const recorded = await newRecordedPage("workboard-intentional-failure");
    let failed = false;
    try {
      await recorded.page.goto(`${server.baseUrl}workboard`);
      throw new Error("intentional trace-retention proof");
    } catch (error) {
      expect(String(error)).toContain("intentional trace-retention proof");
      failed = true;
    } finally {
      await closeRecordedPage(recorded, artifacts, "workboard-intentional-failure", failed);
    }
    expect(artifacts.traces).toHaveLength(1);
    expect((await stat(artifacts.traces[0])).size).toBeGreaterThan(0);
  });
});
