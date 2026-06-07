export type OpenClawNodeAuthorityOverlay = {
  readablePathRefs?: readonly string[];
  writablePathRefs?: readonly string[];
  deniedPathRefs?: readonly string[];
  validationCommandRefs?: readonly string[];
  authorityRef?: string | null;
};
