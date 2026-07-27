export type WritableRootProofInput = {
  id: string;
  root: string;
  expectedUid: number;
  expectedGid: number;
  authority: string[];
};

export type WritableRootProof = {
  id: string;
  root: string;
  authority: string[];
  owner: { uid: number; gid: number };
  mode: number;
  device: number;
  payloadSha256: string;
  cycle: string[];
  cleanupVerified: true;
  startedAt: string;
  completedAt: string;
};

export function proveWritableRoot(input: WritableRootProofInput): Promise<WritableRootProof>;
