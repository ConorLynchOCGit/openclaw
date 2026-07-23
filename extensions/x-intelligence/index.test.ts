import { describe, expect, it, vi } from "vitest";
import plugin from "./index.js";

describe("X Intelligence plugin registration", () => {
  it("relies on native agent tool policy and registers no parallel admission lifecycle", () => {
    const registerTool = vi.fn();
    const api = {
      pluginConfig: {},
      registerTool,
      registerService: vi.fn(),
      registerGatewayMethod: vi.fn(),
      registerTrustedToolPolicy: vi.fn(),
      on: vi.fn(),
    };

    plugin.register(api as never);

    expect(registerTool).toHaveBeenCalledOnce();
    expect(registerTool.mock.calls[0]?.[1]).toEqual({
      names: ["x_posts", "x_counts", "x_users", "x_timelines", "x_trends", "x_metrics"],
      optional: true,
    });
    expect(api.registerGatewayMethod).not.toHaveBeenCalled();
    expect(api.registerTrustedToolPolicy).not.toHaveBeenCalled();
    expect(api.on).not.toHaveBeenCalled();
  });
});
