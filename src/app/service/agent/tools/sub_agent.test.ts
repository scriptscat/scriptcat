import { describe, it, expect, vi } from "vitest";
import { createSubAgentTool } from "./sub_agent";

describe("sub_agent", () => {
  it("should call runSubAgent with correct parameters", async () => {
    const mockRunSubAgent = vi.fn().mockResolvedValue("Sub-agent result");

    const { definition, executor } = createSubAgentTool({ runSubAgent: mockRunSubAgent });

    expect(definition.name).toBe("agent");

    const result = await executor.execute({ prompt: "Search for X", description: "Searching X" });

    expect(mockRunSubAgent).toHaveBeenCalledWith("Search for X", "Searching X");
    expect(result).toBe("Sub-agent result");
  });

  it("should use default description if not provided", async () => {
    const mockRunSubAgent = vi.fn().mockResolvedValue("done");
    const { executor } = createSubAgentTool({ runSubAgent: mockRunSubAgent });

    await executor.execute({ prompt: "Do something" });
    expect(mockRunSubAgent).toHaveBeenCalledWith("Do something", "Sub-agent task");
  });

  it("should throw if prompt is missing", async () => {
    const mockRunSubAgent = vi.fn();
    const { executor } = createSubAgentTool({ runSubAgent: mockRunSubAgent });

    await expect(executor.execute({})).rejects.toThrow("prompt is required");
    expect(mockRunSubAgent).not.toHaveBeenCalled();
  });

  it("should propagate errors from runSubAgent", async () => {
    const mockRunSubAgent = vi.fn().mockRejectedValue(new Error("Agent failed"));
    const { executor } = createSubAgentTool({ runSubAgent: mockRunSubAgent });

    await expect(executor.execute({ prompt: "fail" })).rejects.toThrow("Agent failed");
  });
});
