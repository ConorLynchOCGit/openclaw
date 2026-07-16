import { describe, expect, it } from "vitest";
import { describeTaskTool } from "./tool-description-presets.js";

describe("tool description presets", () => {
  it("makes completed inline task results authoritative without a history reread", () => {
    const description = describeTaskTool();

    expect(description).toContain("resultInline=true");
    expect(description).toContain("consume it directly");
    expect(description).toContain("do not call sessions_history");
  });
});
