import type { JsonObject, JsonValue } from "./protocol-json.js";

export type CodexPluginSummary = {
  id: string;
  remotePluginId?: string;
  name: string;
  source?: JsonObject;
  installed: boolean;
  enabled: boolean;
  installPolicy?: string;
  authPolicy?: string;
  availability?: string;
  interface?: JsonValue;
};

export type CodexAppSummary = {
  id: string;
  name: string;
  description?: string | null;
  installUrl?: string | null;
  needsAuth: boolean;
};

export type CodexPluginDetail = {
  marketplaceName?: string;
  marketplacePath?: string | null;
  summary: CodexPluginSummary;
  description?: string | null;
  skills?: JsonValue[];
  apps: CodexAppSummary[];
  mcpServers: string[];
};

export type CodexPluginMarketplaceEntry = {
  name: string;
  path?: string | null;
  interface?: JsonValue;
  plugins: CodexPluginSummary[];
};

export type CodexPluginListResponse = {
  marketplaces: CodexPluginMarketplaceEntry[];
  marketplaceLoadErrors?: JsonValue[];
  featuredPluginIds?: string[];
};

export type CodexPluginReadResponse = {
  plugin: CodexPluginDetail;
};

type CodexPluginListMarketplaceKind =
  | "local"
  | "vertical"
  | "workspace-directory"
  | "shared-with-me"
  | "created-by-me-remote";

export type CodexPluginListParams = {
  cwds?: string[];
  marketplaceKinds?: CodexPluginListMarketplaceKind[];
};

export type CodexPluginReadParams = {
  marketplacePath?: string;
  remoteMarketplaceName?: string;
  pluginName: string;
};

export type CodexPluginInstallParams = CodexPluginReadParams;

export type CodexPluginInstallResponse = {
  authPolicy: string;
  appsNeedingAuth: CodexAppSummary[];
};

export type CodexAppInfo = {
  id: string;
  name: string;
  description?: string | null;
  logoUrl?: string | null;
  logoUrlDark?: string | null;
  distributionChannel?: string | null;
  branding?: JsonValue;
  appMetadata?: JsonValue;
  labels?: JsonValue;
  installUrl?: string | null;
  isAccessible: boolean;
  isEnabled: boolean;
  pluginDisplayNames: string[];
};

export type CodexAppsListParams = {
  cursor?: string | null;
  limit?: number;
  forceRefetch?: boolean;
};

export type CodexAppsListResponse = {
  data: CodexAppInfo[];
  nextCursor?: string | null;
};

export type CodexSkillsListParams = {
  cwds: string[];
  forceReload?: boolean;
};

type CodexSkillScope = "user" | "repo" | "system" | "admin";

type CodexSkillMetadata = {
  name: string;
  description: string;
  shortDescription?: string;
  interface?: JsonObject;
  dependencies?: JsonObject;
  path: string;
  scope: CodexSkillScope;
  enabled: boolean;
};

type CodexSkillErrorInfo = {
  path: string;
  message: string;
};

type CodexSkillsListEntry = {
  cwd: string;
  skills: CodexSkillMetadata[];
  errors: CodexSkillErrorInfo[];
};

export type CodexSkillsListResponse = {
  data: CodexSkillsListEntry[];
};

export type CodexHooksListParams = {
  cwds: string[];
};

export type CodexHooksListResponse = {
  data: JsonValue[];
  nextCursor?: string | null;
};
