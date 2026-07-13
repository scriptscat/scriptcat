import { describe, it, expect, vi, beforeAll, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import type { Script } from "@App/app/repo/scripts";
import EditorTabs from "./EditorTabs";
import type { EditorTab } from "./useEditorTabs";

afterEach(cleanup);
beforeAll(() => initTestLanguage("zh-CN"));
beforeEach(() => {
  vi.clearAllMocks();
});

const makeTab = (uuid: string, name: string): EditorTab => ({
  uuid,
  script: { uuid, name, metadata: {} } as Script,
  code: "",
  subView: "code",
  isChanged: false,
});

const onNew = vi.fn();

function renderTabs() {
  return render(
    <EditorTabs
      tabs={[makeTab("u1", "脚本一")]}
      activeUuid="u1"
      onActivate={vi.fn()}
      onClose={vi.fn()}
      onCloseOthers={vi.fn()}
      onCloseLeft={vi.fn()}
      onCloseRight={vi.fn()}
      onNew={onNew}
    />
  );
}

describe("EditorTabs「＋」新建菜单", () => {
  it("hover「＋」展开脚本类型选择菜单", async () => {
    renderTabs();
    const plusBtn = screen.getByLabelText("新建脚本");

    await act(async () => {
      fireEvent.mouseEnter(plusBtn);
    });

    expect(screen.getByText("新建普通脚本")).toBeInTheDocument();
    expect(screen.getByText("新建后台脚本")).toBeInTheDocument();
    expect(screen.getByText("新建定时脚本")).toBeInTheDocument();
  });

  it("点击「新建后台脚本」以 background 模板回调 onNew", async () => {
    renderTabs();
    const plusBtn = screen.getByLabelText("新建脚本");

    await act(async () => {
      fireEvent.mouseEnter(plusBtn);
    });
    await act(async () => {
      fireEvent.click(screen.getByText("新建后台脚本"));
    });

    expect(onNew).toHaveBeenCalledTimes(1);
    expect(onNew).toHaveBeenCalledWith("background");
  });

  it("点击「新建定时脚本」以 crontab 模板回调 onNew", async () => {
    renderTabs();
    const plusBtn = screen.getByLabelText("新建脚本");

    await act(async () => {
      fireEvent.mouseEnter(plusBtn);
    });
    await act(async () => {
      fireEvent.click(screen.getByText("新建定时脚本"));
    });

    expect(onNew).toHaveBeenCalledTimes(1);
    expect(onNew).toHaveBeenCalledWith("crontab");
  });

  it("点击「新建普通脚本」以空模板回调 onNew", async () => {
    renderTabs();
    const plusBtn = screen.getByLabelText("新建脚本");

    await act(async () => {
      fireEvent.mouseEnter(plusBtn);
    });
    await act(async () => {
      fireEvent.click(screen.getByText("新建普通脚本"));
    });

    expect(onNew).toHaveBeenCalledTimes(1);
    expect(onNew).toHaveBeenCalledWith("");
  });

  it("直接点击「＋」沿用默认模板新建(不传模板参数)", async () => {
    renderTabs();
    const plusBtn = screen.getByLabelText("新建脚本");

    await act(async () => {
      fireEvent.pointerDown(plusBtn, { button: 0 });
      fireEvent.click(plusBtn);
    });

    expect(onNew).toHaveBeenCalledTimes(1);
    expect(onNew).toHaveBeenCalledWith();
  });
});

describe("EditorTabs 关闭按钮可见性", () => {
  // tabs 按顺序渲染,故 closeButtons[0]=激活的 u1、[1]=未激活的 u2
  function renderActiveAndInactive() {
    render(
      <EditorTabs
        tabs={[makeTab("u1", "脚本一"), makeTab("u2", "脚本二")]}
        activeUuid="u1"
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onCloseOthers={vi.fn()}
        onCloseLeft={vi.fn()}
        onCloseRight={vi.fn()}
        onNew={onNew}
      />
    );
    return screen.getAllByLabelText("关闭当前标签页");
  }

  it("激活标签的关闭按钮持续可见,不依赖 hover", () => {
    const [activeClose] = renderActiveAndInactive();
    expect(activeClose).toHaveClass("opacity-100");
    expect(activeClose).not.toHaveClass("opacity-0");
  });

  it("未激活标签的关闭按钮默认隐藏,仅 hover 时显示", () => {
    const [, inactiveClose] = renderActiveAndInactive();
    expect(inactiveClose).toHaveClass("opacity-0");
    expect(inactiveClose).toHaveClass("group-hover/tab:opacity-100");
    expect(inactiveClose).not.toHaveClass("opacity-100");
  });
});
