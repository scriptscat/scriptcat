import { describe, it, expect } from "vitest";
import { agentDocUrl } from "./agentDocs";

describe("agentDocUrl 文档深链", () => {
  it("各页面拼出 /docs/dev/agent/<path> 深链而非站点根", () => {
    expect(agentDocUrl("provider")).toBe("https://docs.scriptcat.org/docs/dev/agent/agent-model");
    expect(agentDocUrl("skills")).toBe("https://docs.scriptcat.org/docs/dev/agent/agent-skill-install");
    expect(agentDocUrl("mcp")).toBe("https://docs.scriptcat.org/docs/dev/agent/agent-mcp");
    expect(agentDocUrl("tasks")).toBe("https://docs.scriptcat.org/docs/dev/agent/agent-task");
    expect(agentDocUrl("opfs")).toBe("https://docs.scriptcat.org/docs/dev/agent/agent-opfs");
    expect(agentDocUrl("settings")).toBe("https://docs.scriptcat.org/docs/dev/agent/agent");
  });
});
