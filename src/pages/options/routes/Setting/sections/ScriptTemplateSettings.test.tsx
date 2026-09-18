import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { DEFAULT_SCRIPT_TEMPLATES } from "@App/pkg/utils/script_template";

const { get, set, defaultGet } = vi.hoisted(() => {
  const defaultGet = (key: string) => Promise.resolve(key === "script_templates" ? {} : undefined);
  return { get: vi.fn(defaultGet), set: vi.fn(), defaultGet };
});

vi.mock("@App/pages/store/global", async () => {
  const { createGlobalStoreMock } = await import("@Tests/mocks/pageStores.ts");
  return createGlobalStoreMock({ systemConfig: { get, set } });
});

vi.mock("./DeveloperMonacoEditor", () => ({
  DeveloperMonacoEditor: ({
    value,
    onChange,
    onBlur,
    "data-testid": testId,
    ariaLabel,
  }: {
    value: string;
    onChange: (value: string) => void;
    onBlur: () => void;
    ariaLabel: string;
    "data-testid"?: string;
  }) => (
    <textarea
      data-testid={testId}
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
    />
  ),
}));

import { ScriptTemplateSettings } from "./ScriptTemplateSettings";

beforeAll(() => initTestLanguage("en-US"));

beforeEach(() => {
  get.mockReset();
  get.mockImplementation(defaultGet);
  set.mockClear();
});

afterEach(cleanup);

const editTemplate = async (value: string) => {
  const editor = await screen.findByTestId("script_template_editor");
  fireEvent.change(editor, { target: { value } });
  fireEvent.blur(editor);
  return editor;
};

const switchType = (label: string) => {
  const tab = screen.getByText(label).closest("button")!;
  fireEvent.click(tab);
};

describe("新建脚本模板设置", () => {
  it("模板通过校验时写入 script_templates", async () => {
    render(<ScriptTemplateSettings />);
    const custom = DEFAULT_SCRIPT_TEMPLATES.normal.replace("// @author       You", "// @author       me");

    await editTemplate(custom);

    expect(set).toHaveBeenCalledWith("script_templates", { normal: custom });
  });

  it("普通脚本模板含 @crontab 时报错且不写入", async () => {
    render(<ScriptTemplateSettings />);

    await editTemplate(DEFAULT_SCRIPT_TEMPLATES.normal.replace("// @grant        none", "// @crontab * * once * *"));

    expect(await screen.findByRole("alert")).toHaveTextContent("@crontab");
    expect(set).not.toHaveBeenCalled();
  });

  it("模板与默认一致时移除该类型的覆盖", async () => {
    get.mockImplementation((key: string) =>
      Promise.resolve(
        key === "script_templates" ? { normal: "// ==UserScript==\n// @name x\n// ==/UserScript==" } : undefined
      )
    );
    render(<ScriptTemplateSettings />);

    await editTemplate(DEFAULT_SCRIPT_TEMPLATES.normal);

    expect(set).toHaveBeenCalledWith("script_templates", {});
  });

  it("恢复默认会清除覆盖并把编辑器内容改回默认模板", async () => {
    render(<ScriptTemplateSettings />);
    await editTemplate(DEFAULT_SCRIPT_TEMPLATES.normal.replace("// @author       You", "// @author       me"));
    set.mockClear();

    fireEvent.click(screen.getByText("Restore Default Values"));

    expect(set).toHaveBeenCalledWith("script_templates", {});
    expect(await screen.findByTestId("script_template_editor")).toHaveValue(DEFAULT_SCRIPT_TEMPLATES.normal);
  });

  it("切换脚本类型时编辑对应类型的模板", async () => {
    render(<ScriptTemplateSettings />);

    switchType("Scheduled Script");

    expect(await screen.findByTestId("script_template_editor")).toHaveValue(DEFAULT_SCRIPT_TEMPLATES.crontab);

    await editTemplate(DEFAULT_SCRIPT_TEMPLATES.crontab.replace("* * once * *", "0 8 * * *"));

    expect(set).toHaveBeenCalledWith("script_templates", {
      crontab: DEFAULT_SCRIPT_TEMPLATES.crontab.replace("* * once * *", "0 8 * * *"),
    });
  });
});
