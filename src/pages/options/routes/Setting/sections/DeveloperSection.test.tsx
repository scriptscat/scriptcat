import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const { get, set } = vi.hoisted(() => ({
  get: vi.fn((key: string) => {
    if (key === "enable_eslint") return Promise.resolve(true);
    return Promise.resolve("");
  }),
  set: vi.fn(),
}));
vi.mock("@App/pages/store/global", () => ({
  systemConfig: { get, set },
  subscribeMessage: () => () => {},
}));

import { DeveloperSection } from "./DeveloperSection";

afterEach(cleanup);

describe("开发者分区", () => {
  it("编辑器类型定义失焦时写入 editor_type_definition", async () => {
    render(<DeveloperSection register={() => () => {}} />);
    const ta = await screen.findByLabelText("editor_type_definition_textarea");
    // Wait for all async config loads to settle before interacting
    await waitFor(() => expect(get).toHaveBeenCalledWith("editor_type_definition"));
    fireEvent.change(ta, { target: { value: "declare const x: any;" } });
    fireEvent.blur(ta);
    expect(set).toHaveBeenCalledWith(
      "editor_type_definition",
      "declare const x: any;"
    );
  });
});
