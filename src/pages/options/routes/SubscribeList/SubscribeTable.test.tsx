import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { renderWithRouterTooltip } from "@Tests/renderWithTooltip";
import { t } from "@App/locales/locales";
import { SubscribeStatusType } from "@App/app/repo/subscribe";
import type { SubscribeLoading } from "@App/pages/store/features/subscribe";
import type { SubscribeSort } from "./filter";

vi.mock("@App/pages/store/features/subscribe", () => ({
  requestEnableSubscribe: vi.fn(() => Promise.resolve(true)),
  requestCheckSubscribeUpdate: vi.fn(() => Promise.resolve(false)),
}));

vi.mock("@App/pages/components/ui/toast", () => ({
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import SubscribeTable from "./SubscribeTable";

beforeAll(() => initTestLanguage("zh-CN"));
afterEach(cleanup);

const mk = (url: string, name: string, overrides: Partial<SubscribeLoading> = {}): SubscribeLoading =>
  ({
    url,
    name,
    code: "",
    author: "tester",
    scripts: { s1: { uuid: "s1", url: "https://example.com/a.user.js" } },
    metadata: { version: ["1.2.3"], connect: ["example.com"] },
    status: SubscribeStatusType.enable,
    createtime: 1700000000000,
    updatetime: 1700000100000,
    checktime: 1700000100000,
    ...overrides,
  }) as SubscribeLoading;

const noop = () => {};

// 排序与状态筛选都由本组件的工具栏驱动，harness 只负责把状态回灌，
// 好让三态循环与筛选切换在组件外可观察。
const Harness = ({ list }: { list: SubscribeLoading[] }) => {
  const [sort, setSort] = useState<SubscribeSort | null>(null);
  const [statusFilter, setStatusFilter] = useState<SubscribeStatusType | null>(null);
  return (
    <>
      <span data-testid="sort-state">{sort ? `${sort.field}:${sort.order}` : "none"}</span>
      <span data-testid="status-state">{statusFilter === null ? "none" : String(statusFilter)}</span>
      <SubscribeTable
        subscribeList={list}
        loadingList={false}
        updateSubscribes={noop}
        handleDelete={noop}
        searchKeyword=""
        setSearchKeyword={noop}
        totalCount={list.length}
        sort={sort}
        setSort={setSort}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
      />
    </>
  );
};

// Radix 下拉需要 pointerDown 才会展开（同 FilterBar.test.tsx 的既有写法）
function openMenu(testId: string) {
  const trigger = screen.getByTestId(testId);
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
}

describe("桌面订阅列表行", () => {
  it("行使用统一列表行骨架，不再有强制横向滚动的宽度下限", () => {
    const { container } = renderWithRouterTooltip(<Harness list={[mk("https://a.example/s.user.sub.js", "订阅甲")]} />);

    expect(container.querySelectorAll('[data-slot="list-row"]')).toHaveLength(1);
    expect(container.querySelector('[data-slot="list-row-leading"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="list-row-main"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="list-row-trailing"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="list-row-actions"]')).not.toBeNull();
    expect(container.querySelector(".min-w-\\[820px\\]")).toBeNull();
  });

  it("表头移除后版本与来源徽章下沉到名称下方的元信息行", () => {
    const { container } = renderWithRouterTooltip(<Harness list={[mk("https://a.example/s.user.sub.js", "订阅甲")]} />);

    const main = container.querySelector('[data-slot="list-row-main"]')!;
    expect(main.textContent).toContain("1.2.3");
    expect(main.textContent).toContain(t("script:subscribe_url"));
    expect(main.textContent).toContain("tester");
  });

  it("左锚区只有开关，权限站点与更新时间留在右锚区，删除是唯一操作槽", () => {
    const { container } = renderWithRouterTooltip(<Harness list={[mk("https://a.example/s.user.sub.js", "订阅甲")]} />);

    const leading = container.querySelector('[data-slot="list-row-leading"]')!;
    expect(leading.querySelector('[role="switch"]')).not.toBeNull();
    // 行号随排序重新编号、且 Subscribe 没有持久顺序字段，故不再渲染
    expect(leading.textContent).not.toMatch(/\d/);

    const trailing = container.querySelector('[data-slot="list-row-trailing"]')!;
    expect(trailing.querySelector(`[aria-label="${t("check_update")}"]`)).not.toBeNull();

    const actions = container.querySelector('[data-slot="list-row-actions"]')!;
    expect(actions.querySelectorAll("button")).toHaveLength(1);
    expect(actions.querySelector(`[aria-label="${t("delete")}"]`)).not.toBeNull();
  });
});

describe("桌面订阅工具栏", () => {
  it("排序下拉承接原表头的三个排序键", () => {
    renderWithRouterTooltip(<Harness list={[mk("https://a.example/s.user.sub.js", "订阅甲")]} />);

    openMenu("sort-menu");

    expect(screen.getByText(t("script:sort_create_time"))).toBeInTheDocument();
    expect(screen.getByText(t("name"))).toBeInTheDocument();
    expect(screen.getByText(t("logs:last_updated"))).toBeInTheDocument();
  });

  it("排序下拉按升序→降序→取消循环，取消后回到未排序", () => {
    renderWithRouterTooltip(<Harness list={[mk("https://a.example/s.user.sub.js", "订阅甲")]} />);

    openMenu("sort-menu");
    fireEvent.click(screen.getByText(t("name")));
    expect(screen.getByTestId("sort-state")).toHaveTextContent("name:asc");

    openMenu("sort-menu");
    fireEvent.click(screen.getByText(t("name")));
    expect(screen.getByTestId("sort-state")).toHaveTextContent("name:desc");

    openMenu("sort-menu");
    fireEvent.click(screen.getByText(t("name")));
    expect(screen.getByTestId("sort-state")).toHaveTextContent("none");
  });

  it("状态筛选下拉承接原表头的状态筛选", () => {
    renderWithRouterTooltip(<Harness list={[mk("https://a.example/s.user.sub.js", "订阅甲")]} />);

    openMenu("subscribe-status-filter");
    fireEvent.click(screen.getByText(t("disable")));

    expect(screen.getByTestId("status-state")).toHaveTextContent(String(SubscribeStatusType.disable));
  });

  it("按传入顺序渲染", () => {
    const { container } = renderWithRouterTooltip(
      <Harness
        list={[mk("https://b.example/s.user.sub.js", "订阅乙"), mk("https://a.example/s.user.sub.js", "订阅甲")]}
      />
    );

    const names = [...container.querySelectorAll('[data-slot="list-row-main"] .text-sm')].map((n) => n.textContent);
    expect(names).toEqual(["订阅乙", "订阅甲"]);
  });
});
