import { describe, it, expect, vi } from "vitest";
import { createSubAgentTool } from "./sub_agent";

describe("sub_agent", () => {
  it("should call runSubAgent with correct parameters", async () => {
    const mockRunSubAgent = vi.fn().mockResolvedValue({ agentId: "test-id", result: "Sub-agent result" });

    const { definition, executor } = createSubAgentTool({ runSubAgent: mockRunSubAgent });

    expect(definition.name).toBe("agent");

    const result = await executor.execute({ prompt: "Search for X", description: "Searching X" });

    expect(mockRunSubAgent).toHaveBeenCalledWith({
      prompt: "Search for X",
      description: "Searching X",
      type: undefined,
    });
    expect(result).toContain("[agentId: test-id]");
    expect(result).toContain("Sub-agent result");
  });

  it("should use default description if not provided", async () => {
    const mockRunSubAgent = vi.fn().mockResolvedValue({ agentId: "id2", result: "done" });
    const { executor } = createSubAgentTool({ runSubAgent: mockRunSubAgent });

    await executor.execute({ prompt: "Do something" });
    expect(mockRunSubAgent).toHaveBeenCalledWith({
      prompt: "Do something",
      description: "Sub-agent task",
      type: undefined,
    });
  });

  it("should pass type parameter", async () => {
    const mockRunSubAgent = vi.fn().mockResolvedValue({ agentId: "id3", result: "ok" });
    const { executor } = createSubAgentTool({ runSubAgent: mockRunSubAgent });

    await executor.execute({ prompt: "Research X", type: "researcher" });
    expect(mockRunSubAgent).toHaveBeenCalledWith({
      prompt: "Research X",
      description: "Sub-agent task",
      type: "researcher",
    });
  });

  it("should throw if prompt is missing", async () => {
    const mockRunSubAgent = vi.fn();
    const { executor } = createSubAgentTool({ runSubAgent: mockRunSubAgent });

    await expect(executor.execute({})).rejects.toThrow('缺少必填参数 "prompt"');
    expect(mockRunSubAgent).not.toHaveBeenCalled();
  });

  it("should propagate errors from runSubAgent", async () => {
    const mockRunSubAgent = vi.fn().mockRejectedValue(new Error("Agent failed"));
    const { executor } = createSubAgentTool({ runSubAgent: mockRunSubAgent });

    await expect(executor.execute({ prompt: "fail" })).rejects.toThrow("Agent failed");
  });
});
