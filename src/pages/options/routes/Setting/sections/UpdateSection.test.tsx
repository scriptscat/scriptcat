// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const { get, set } = vi.hoisted(() => ({
  get: vi.fn(() => Promise.resolve(86400)),
  set: vi.fn(),
}));
vi.mock("@App/pages/store/global", () => ({
  systemConfig: { get, set },
  subscribeMessage: () => () => {},
}));

import { UpdateSection } from "./UpdateSection";

afterEach(cleanup);

describe("更新分区", () => {
  it("切换「更新被禁用的脚本」写入 update_disable_script", async () => {
    render(<UpdateSection register={() => () => {}} />);
    const sw = await screen.findByTestId("update_disabled_scripts_switch");
    fireEvent.click(sw);
    await waitFor(() => expect(set).toHaveBeenCalledWith("update_disable_script", expect.any(Boolean)));
  });
});
