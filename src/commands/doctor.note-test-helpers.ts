import { vi } from "vitest";
import type { MockFn } from "../test-utils/vitest-mock-fn.js";

export const terminalNoteMock: MockFn = vi.fn();

vi.mock("../terminal/note.js", () => ({
  note: (...args: unknown[]) => terminalNoteMock(...args),
}));

export async function loadDoctorCommandForTest(params?: { unmockModules?: string[] }) {
  vi.resetModules();
  vi.doMock("../terminal/note.js", () => ({
    note: (...args: unknown[]) => terminalNoteMock(...args),
  }));
  for (const modulePath of params?.unmockModules ?? []) {
    vi.doUnmock(modulePath);
  }
  const { doctorCommand } = await import("./doctor.js");
  terminalNoteMock.mockClear();
  return doctorCommand;
}
