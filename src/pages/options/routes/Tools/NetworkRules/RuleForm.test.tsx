import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockMatchMedia } from "@Tests/mockMatchMedia";
import { parseRuleDomains } from "@App/pkg/utils/network_rule_condition";
import RuleForm, { type RuleFormState } from "./RuleForm";
import { emptyActionDraft } from "./templates";

beforeAll(() => initTestLanguage("zh-CN"));
beforeEach(() => mockMatchMedia());
afterEach(cleanup);

function renderForm(over: Partial<RuleFormState> = {}) {
  const state: RuleFormState = {
    websites: "example.com",
    allSites: false,
    name: "",
    draft: emptyActionDraft("block"),
    resourceTypes: [],
    requestMethods: [],
    excludedWebsites: "",
    tryUrl: "",
    ...over,
  };
  render(
    <RuleForm
      template="block"
      templateLabel="屏蔽请求"
      state={state}
      scope={parseRuleDomains(state.websites)}
      excluded={parseRuleDomains(state.excludedWebsites)}
      actionErrors={{ headers: [] }}
      condition={{ requestDomains: ["example.com"] }}
      touched={false}
      saving={false}
      canSave
      submitError=""
      onChange={() => {}}
      onBlurScope={() => {}}
      onChangeTemplate={() => {}}
      onCancel={() => {}}
      onSubmit={() => {}}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "高级选项" }));
}

describe("规则表单的高级区", () => {
  it("资源类型显示译名而非 DNR 标识符", () => {
    renderForm();

    expect(screen.getByText("主框架")).toBeInTheDocument();
    expect(screen.getByText("XHR")).toBeInTheDocument();
    expect(screen.queryByText("main_frame")).not.toBeInTheDocument();
    expect(screen.queryByText("xmlhttprequest")).not.toBeInTheDocument();
  });

  it("请求方法显示大写的 HTTP 动词而非小写标识符", () => {
    renderForm();

    expect(screen.getByText("GET")).toBeInTheDocument();
    expect(screen.queryByText("get")).not.toBeInTheDocument();
  });

  it("勾选框的无障碍名与可见文本一致，勾选状态仍来自 state", () => {
    renderForm({ resourceTypes: ["main_frame"], requestMethods: ["post"] });

    expect(screen.getByRole("checkbox", { name: "主框架" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "子框架" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "POST" })).toBeChecked();
  });
});
