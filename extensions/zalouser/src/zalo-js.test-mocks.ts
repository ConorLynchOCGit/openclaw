import type { MockFn } from "openclaw/plugin-sdk/testing";
import { vi } from "vitest";

const zaloJsMocks = vi.hoisted(() => ({
  checkZaloAuthenticatedMock: vi.fn(async () => false),
  getZaloUserInfoMock: vi.fn(async () => null),
  listZaloFriendsMock: vi.fn(async () => []),
  listZaloFriendsMatchingMock: vi.fn(async () => []),
  listZaloGroupMembersMock: vi.fn(async () => []),
  listZaloGroupsMock: vi.fn(async () => []),
  listZaloGroupsMatchingMock: vi.fn(async () => []),
  logoutZaloProfileMock: vi.fn(async () => {}),
  resolveZaloAllowFromEntriesMock: vi.fn(async ({ entries }: { entries: string[] }) =>
    entries.map((entry) => ({ input: entry, resolved: true, id: entry, note: undefined })),
  ),
  resolveZaloGroupContextMock: vi.fn(async () => null),
  resolveZaloGroupsByEntriesMock: vi.fn(async ({ entries }: { entries: string[] }) =>
    entries.map((entry) => ({ input: entry, resolved: true, id: entry, note: undefined })),
  ),
  startZaloListenerMock: vi.fn(async () => ({ stop: vi.fn() })),
  startZaloQrLoginMock: vi.fn(async () => ({
    message: "qr pending",
    qrDataUrl: undefined,
  })),
  waitForZaloQrLoginMock: vi.fn(async () => ({
    connected: false,
    message: "login pending",
  })),
}));

export const checkZaloAuthenticatedMock: MockFn = zaloJsMocks.checkZaloAuthenticatedMock;
export const getZaloUserInfoMock: MockFn = zaloJsMocks.getZaloUserInfoMock;
export const listZaloFriendsMock: MockFn = zaloJsMocks.listZaloFriendsMock;
export const listZaloFriendsMatchingMock: MockFn = zaloJsMocks.listZaloFriendsMatchingMock;
export const listZaloGroupMembersMock: MockFn = zaloJsMocks.listZaloGroupMembersMock;
export const listZaloGroupsMock: MockFn = zaloJsMocks.listZaloGroupsMock;
export const listZaloGroupsMatchingMock: MockFn = zaloJsMocks.listZaloGroupsMatchingMock;
export const logoutZaloProfileMock: MockFn = zaloJsMocks.logoutZaloProfileMock;
export const resolveZaloAllowFromEntriesMock: MockFn = zaloJsMocks.resolveZaloAllowFromEntriesMock;
export const resolveZaloGroupContextMock: MockFn = zaloJsMocks.resolveZaloGroupContextMock;
export const resolveZaloGroupsByEntriesMock: MockFn = zaloJsMocks.resolveZaloGroupsByEntriesMock;
export const startZaloListenerMock: MockFn = zaloJsMocks.startZaloListenerMock;
export const startZaloQrLoginMock: MockFn = zaloJsMocks.startZaloQrLoginMock;
export const waitForZaloQrLoginMock: MockFn = zaloJsMocks.waitForZaloQrLoginMock;

vi.mock("./zalo-js.js", () => ({
  checkZaloAuthenticated: checkZaloAuthenticatedMock,
  getZaloUserInfo: getZaloUserInfoMock,
  listZaloFriends: listZaloFriendsMock,
  listZaloFriendsMatching: listZaloFriendsMatchingMock,
  listZaloGroupMembers: listZaloGroupMembersMock,
  listZaloGroups: listZaloGroupsMock,
  listZaloGroupsMatching: listZaloGroupsMatchingMock,
  logoutZaloProfile: logoutZaloProfileMock,
  resolveZaloAllowFromEntries: resolveZaloAllowFromEntriesMock,
  resolveZaloGroupContext: resolveZaloGroupContextMock,
  resolveZaloGroupsByEntries: resolveZaloGroupsByEntriesMock,
  startZaloListener: startZaloListenerMock,
  startZaloQrLogin: startZaloQrLoginMock,
  waitForZaloQrLogin: waitForZaloQrLoginMock,
}));
