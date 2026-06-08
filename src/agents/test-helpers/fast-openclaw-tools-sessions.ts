import { vi } from "vitest";
import { normalizeOptionalLowercaseString } from "../../shared/string-coerce.js";
import { stubTool } from "./fast-tool-stubs.js";

// Sessions-tool tests only exercise sessions/subagent registrations.
// Stub the unrelated tool factories so importing openclaw-tools stays cheap.
vi.mock("../tools/agents-list-tool.js", () => ({
  createAgentsListTool: () => stubTool("agents_list"),
}));

vi.mock("../tools/canvas-tool.js", () => ({
  createCanvasTool: () => stubTool("canvas"),
}));

vi.mock("../tools/cron-tool.js", () => ({
  createCronTool: () => stubTool("cron"),
}));

vi.mock("../tools/gateway-tool.js", () => ({
  createGatewayTool: () => stubTool("gateway"),
}));

vi.mock("../tools/host-operator-repo-tool.js", () => ({
  createHostOperatorRepoTool: () => stubTool("host_operator_repo"),
}));

vi.mock("../tools/image-generate-tool.js", () => ({
  createImageGenerateTool: () => stubTool("image_generate"),
}));

vi.mock("../tools/image-tool.js", () => ({
  createImageTool: () => stubTool("image"),
}));

vi.mock("../tools/message-tool.js", () => ({
  createMessageTool: () => stubTool("message"),
}));

vi.mock("../tools/music-generate-tool.js", () => ({
  createMusicGenerateTool: () => stubTool("music_generate"),
}));

vi.mock("../tools/nodes-tool.js", () => ({
  createNodesTool: () => stubTool("nodes"),
}));

vi.mock("../tools/pdf-tool.js", () => ({
  createPdfTool: () => stubTool("pdf"),
}));

vi.mock("../tools/resolve-openclaw-path-tool.js", () => ({
  createResolveOpenClawPathTool: () => stubTool("openclaw_path_resolve"),
}));

vi.mock("../tools/resolve-openclaw-resource-tool.js", () => ({
  createResolveOpenClawResourceTool: () => stubTool("openclaw_resource_read"),
}));

vi.mock("../tools/session-status-tool.js", () => ({
  createSessionStatusTool: () => stubTool("session_status"),
}));

vi.mock("../tools/tts-tool.js", () => ({
  createTtsTool: () => stubTool("tts"),
}));

vi.mock("../tools/video-generate-tool.js", () => ({
  createVideoGenerateTool: () => stubTool("video_generate"),
}));

vi.mock("../tools/web-tools.js", () => ({
  createWebFetchTool: () => stubTool("web_fetch"),
  createWebSearchTool: () => stubTool("web_search"),
}));

vi.mock("../tools/update-plan-tool.js", () => ({
  createUpdatePlanTool: () => stubTool("update_plan"),
}));

vi.mock("../../channels/plugins/index.js", () => ({
  getChannelPlugin: () => null,
  normalizeChannelId: (channel?: string) => normalizeOptionalLowercaseString(channel),
  listChannelPlugins: () => [],
}));

vi.mock("../../channels/plugins/session-conversation.js", () => ({
  resolveSessionConversationRef: (sessionKey: string) => {
    const match =
      /^(?:agent:[^:]+:)?(?<channel>[^:]+):(?<kind>group|channel):(?<id>[^:]+)(?::topic:(?<threadId>[^:]+))?$/u.exec(
        sessionKey.trim(),
      );
    if (!match?.groups?.channel || !match.groups.kind || !match.groups.id) {
      return null;
    }
    return {
      channel: match.groups.channel,
      kind: match.groups.kind,
      id: match.groups.id,
      threadId: match.groups.threadId,
    };
  },
}));
