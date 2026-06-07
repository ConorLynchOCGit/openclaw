import { vi } from "vitest";
import type * as SessionWriteLockModule from "../agents/session-write-lock.js";

type SessionWriteLockModuleShape = typeof SessionWriteLockModule;
type SessionWriteLockAcquirerForMock = (
  params: Parameters<SessionWriteLockModuleShape["acquireSessionWriteLock"]>[0],
) => Promise<{
  release: () => Promise<void>;
  trace?: Awaited<ReturnType<SessionWriteLockModuleShape["acquireSessionWriteLock"]>>["trace"];
}>;

function defaultSessionLockTrace(
  params: Parameters<SessionWriteLockModuleShape["acquireSessionWriteLock"]>[0],
): Awaited<ReturnType<SessionWriteLockModuleShape["acquireSessionWriteLock"]>>["trace"] {
  const sessionFile = params.sessionFile;
  return {
    outcome: "active_current_session_acquired",
    sessionFile,
    lockPath: `${sessionFile}.lock`,
    acquired: true,
    reclaimed: false,
    attempts: 0,
    timeoutMs: params.timeoutMs ?? 0,
    staleMs: params.staleMs ?? 0,
    ownerPid: null,
    ownerPidAlive: null,
    ownerCreatedAt: null,
    ownerAgeMs: null,
    staleReasons: [],
  };
}

function withDefaultTrace(
  acquireSessionWriteLock: SessionWriteLockAcquirerForMock,
): SessionWriteLockModuleShape["acquireSessionWriteLock"] {
  return async (params) => {
    const result = await acquireSessionWriteLock(params);
    return {
      ...result,
      trace: result.trace ?? defaultSessionLockTrace(params),
    };
  };
}

export async function buildSessionWriteLockModuleMock(
  loadActual: () => Promise<SessionWriteLockModuleShape>,
  acquireSessionWriteLock: SessionWriteLockAcquirerForMock,
): Promise<SessionWriteLockModuleShape> {
  const original = await loadActual();
  return {
    ...original,
    acquireSessionWriteLock: withDefaultTrace(acquireSessionWriteLock),
  };
}

export function resetModulesWithSessionWriteLockDoMock(
  modulePath: string,
  acquireSessionWriteLock: SessionWriteLockAcquirerForMock,
): void {
  vi.resetModules();
  vi.doMock(modulePath, () =>
    buildSessionWriteLockModuleMock(
      () => vi.importActual<SessionWriteLockModuleShape>(modulePath),
      acquireSessionWriteLock,
    ),
  );
}
