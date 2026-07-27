// Assembled topology proof composes native read-only audit and redaction surfaces.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditGatewayServiceConfig, SERVICE_AUDIT_CODES } from "../../src/daemon/service-audit.js";
import { parseSystemdShow } from "../../src/daemon/systemd.js";
import { sanitizeSupportSnapshotValue } from "../../src/logging/diagnostic-support-redaction.js";
import { parseLinuxMountInfoMountPoints } from "../../src/plugins/bundled-source-overlays.js";

type CapturedAuthority = {
  active: boolean;
  expected: boolean;
  id: string;
  owner: string;
};

type CapturedTopology = {
  authorities: CapturedAuthority[];
  databasePaths: Array<{ owner: string; path: string }>;
  generatedPaths: Array<{ owner: string; path: string; target?: string }>;
  identities: {
    packageVersion: string;
    sourceCommit: string;
    systemProfileDigest: string;
  };
  managerEnvironment: Record<string, string>;
  mounts: string;
  processEnvironment: Record<string, string>;
  service: {
    command: string[];
    dropIns: Array<{ name: string; contents: string }>;
    systemdShow: string;
    unit: string;
  };
  supportServices: Array<{
    endpoints: string[];
    image: string;
    mounts: Array<{ path: string; writable: boolean }>;
    owner: string;
  }>;
  writablePaths: Array<{ owner: string; path: string }>;
};

const secretValues = {
  gateway: "gateway-secret-fixture-value",
  provider: "provider-secret-fixture-value",
};

function createCapturedTopology(): CapturedTopology {
  return {
    authorities: [
      { active: true, expected: true, id: "native-package", owner: "openclaw" },
      { active: true, expected: true, id: "native-config", owner: "openclaw-instance" },
      { active: true, expected: true, id: "persistent-workspace", owner: "openclaw-instance" },
      { active: false, expected: false, id: "retired-controller", owner: "legacy" },
      { active: false, expected: false, id: "nested-source-mount", owner: "legacy" },
      { active: false, expected: false, id: "duplicate-plugin-profile", owner: "legacy" },
    ],
    databasePaths: [
      { owner: "openclaw", path: "/srv/openclaw-next/state/state/openclaw.sqlite" },
      { owner: "gbrain", path: "/srv/openclaw-next/gbrain/data/gbrain.sqlite" },
    ],
    generatedPaths: [
      {
        owner: "openclaw",
        path: "/srv/openclaw-next/state/generated/current-profile",
        target: "/opt/openclaw/system-profile",
      },
    ],
    identities: {
      packageVersion: "2026.7.1-native.1",
      sourceCommit: "0123456789abcdef",
      systemProfileDigest: "sha256:profile-fixture",
    },
    managerEnvironment: {
      HOME: "/srv/openclaw-next",
      OPENCLAW_STATE_DIR: "/srv/openclaw-next/state",
    },
    mounts: [
      "36 25 0:32 / / rw,relatime - ext4 /dev/root rw",
      "37 36 0:33 / /srv/openclaw-next/state rw,relatime - ext4 /dev/root rw",
      "38 36 0:34 / /opt/openclaw ro,relatime - ext4 /dev/root ro",
      "39 36 0:35 / /srv/openclaw-next/workspace\\040fixtures rw,relatime - ext4 /dev/root rw",
    ].join("\n"),
    processEnvironment: {
      HOME: "/srv/openclaw-next",
      OPENAI_API_KEY: secretValues.provider,
      OPENCLAW_GATEWAY_TOKEN: secretValues.gateway,
      OPENCLAW_STATE_DIR: "/srv/openclaw-next/state",
      PATH: "/usr/local/bin:/usr/bin:/bin",
    },
    service: {
      command: ["/usr/bin/node", "/opt/openclaw/dist/index.js", "gateway", "--port", "18889"],
      dropIns: [
        {
          name: "10-hardening.conf",
          contents:
            "[Service]\nReadOnlyPaths=/opt/openclaw\nReadWritePaths=/srv/openclaw-next/state\n",
        },
      ],
      systemdShow: [
        "Id=openclaw-gateway.service",
        "ActiveState=active",
        "SubState=running",
        "MainPID=4242",
        "KillMode=control-group",
        "TasksCurrent=8",
        "MemoryCurrent=268435456",
      ].join("\n"),
      unit: [
        "[Unit]",
        "After=network-online.target",
        "Wants=network-online.target",
        "[Service]",
        "ExecStart=/usr/bin/node /opt/openclaw/dist/index.js gateway --port 18889",
        "EnvironmentFile=/srv/openclaw-next/state/gateway.systemd.env",
        "RestartSec=5s",
        "KillMode=control-group",
      ].join("\n"),
    },
    supportServices: [
      {
        endpoints: ["http://127.0.0.1:3000"],
        image: "browserless/chrome@sha256:browserless-fixture",
        mounts: [],
        owner: "browserless",
      },
      {
        endpoints: ["http://127.0.0.1:3333"],
        image: "openclaw-next-gbrain@sha256:gbrain-fixture",
        mounts: [{ path: "/srv/openclaw-next/gbrain/data", writable: true }],
        owner: "gbrain",
      },
    ],
    writablePaths: [
      { owner: "openclaw", path: "/srv/openclaw-next/state" },
      { owner: "openclaw", path: "/srv/openclaw-next/workspace" },
      { owner: "gbrain", path: "/srv/openclaw-next/gbrain/data" },
    ],
  };
}

function findCompetingAuthorities(capture: CapturedTopology): CapturedAuthority[] {
  return capture.authorities.filter((authority) => authority.active && !authority.expected);
}

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })),
  );
});

describe("assembled topology audit", () => {
  it("composes native read-only facts without retaining secret values", async () => {
    const capture = createCapturedTopology();
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-topology-audit-"));
    tempRoots.push(home);
    const unitDir = path.join(home, ".config", "systemd", "user");
    await fs.mkdir(unitDir, { recursive: true });
    await fs.writeFile(path.join(unitDir, "openclaw-gateway.service"), capture.service.unit);

    const serviceAudit = await auditGatewayServiceConfig({
      command: {
        environment: { PATH: capture.processEnvironment.PATH ?? "" },
        programArguments: capture.service.command,
      },
      env: { HOME: home },
      expectedPort: 18889,
      platform: "linux",
    });
    const forbiddenServiceIssueCodes = new Set<string>([
      SERVICE_AUDIT_CODES.gatewayCommandMissing,
      SERVICE_AUDIT_CODES.gatewayTokenEmbedded,
      SERVICE_AUDIT_CODES.systemdAfterNetworkOnline,
      SERVICE_AUDIT_CODES.systemdKillModeProcessOrNone,
      SERVICE_AUDIT_CODES.systemdRestartSec,
      SERVICE_AUDIT_CODES.systemdWantsNetworkOnline,
    ]);
    expect(
      serviceAudit.issues.filter((issue) => forbiddenServiceIssueCodes.has(issue.code)),
    ).toStrictEqual([]);

    expect(parseSystemdShow(capture.service.systemdShow)).toMatchObject({
      activeState: "active",
      killMode: "control-group",
      mainPid: 4242,
      subState: "running",
      unit: "openclaw-gateway.service",
    });
    expect(parseLinuxMountInfoMountPoints(capture.mounts)).toEqual(
      new Set([
        "/",
        "/opt/openclaw",
        "/srv/openclaw-next/state",
        "/srv/openclaw-next/workspace fixtures",
      ]),
    );
    expect(findCompetingAuthorities(capture)).toStrictEqual([]);

    const sanitized = sanitizeSupportSnapshotValue(capture, {
      env: { HOME: "/srv/openclaw-next" },
      stateDir: "/srv/openclaw-next/state",
    });
    const serialized = JSON.stringify(sanitized);
    expect(serialized).not.toContain(secretValues.gateway);
    expect(serialized).not.toContain(secretValues.provider);
    expect(serialized).toContain('"OPENCLAW_GATEWAY_TOKEN":"<redacted>"');
    expect(serialized).toContain('"OPENAI_API_KEY":"<redacted>"');
    expect(serialized.length).toBeLessThan(20_000);

    expect(capture.service.dropIns).toHaveLength(1);
    expect(capture.generatedPaths).toHaveLength(1);
    expect(capture.databasePaths.map((entry) => entry.owner)).toStrictEqual(["openclaw", "gbrain"]);
    expect(capture.supportServices.map((entry) => entry.owner)).toStrictEqual([
      "browserless",
      "gbrain",
    ]);
  });

  it("reports an active retired authority without mutating the capture", () => {
    const capture = createCapturedTopology();
    const retired = capture.authorities.find((authority) => authority.id === "retired-controller");
    if (!retired) {
      throw new Error("retired controller fixture missing");
    }
    retired.active = true;

    expect(findCompetingAuthorities(capture)).toStrictEqual([retired]);
    expect(retired.active).toBe(true);
  });
});
