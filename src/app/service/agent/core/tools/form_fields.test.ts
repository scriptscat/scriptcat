import { beforeEach, describe, expect, it, vi } from "vitest";
import { bindToolToAssignedTab, createFormFieldTools, type FormFieldToolDeps } from "./form_fields";

function makeDeps(): FormFieldToolDeps {
  return {
    executeInPage: vi.fn().mockResolvedValue({ result: { selector: "#name", value: "Ada" }, tabId: 42 }),
  };
}

describe("表单字段工具", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("只公开受控字段参数并绑定目标标签页", async () => {
    const deps = makeDeps();
    const tools = createFormFieldTools(deps, 42);
    const fill = tools.find((tool) => tool.definition.name === "fill_form_field");

    expect(fill?.definition.parameters.properties).toEqual(
      expect.objectContaining({ selector: expect.any(Object), value: expect.any(Object) })
    );
    expect(fill?.definition.parameters.properties).not.toHaveProperty("tab_id");
    expect(fill?.definition.parameters.properties).not.toHaveProperty("code");

    await fill?.executor.execute({ selector: "#name", value: "Ada", tab_id: 999 });

    expect(deps.executeInPage).toHaveBeenCalledWith(expect.stringContaining("#name"), { tabId: 42 });
  });

  it.each(["submit", "button", "reset", "file", "hidden"])("填写脚本应拒绝 %s 控件", async (type) => {
    document.body.innerHTML = `<input id="target" type="${type}">`;
    const deps: FormFieldToolDeps = {
      executeInPage: vi.fn(async (code, options) => ({ result: new Function(code)(), tabId: options?.tabId ?? -1 })),
    };
    const fill = createFormFieldTools(deps, 42).find((tool) => tool.definition.name === "fill_form_field");

    await expect(fill?.executor.execute({ selector: "#target", value: "send" })).rejects.toThrow(
      "This control type cannot be filled"
    );
  });

  it("页面 change 监听尝试自动提交时应阻止并报告", async () => {
    document.body.innerHTML = `<form><input id="target"><button type="submit">send</button></form>`;
    const form = document.querySelector("form")!;
    const field = document.querySelector<HTMLInputElement>("#target")!;
    let submissions = 0;
    form.addEventListener("submit", () => submissions++);
    field.addEventListener("change", () => form.requestSubmit());
    const deps: FormFieldToolDeps = {
      executeInPage: vi.fn(async (code, options) => ({ result: new Function(code)(), tabId: options?.tabId ?? -1 })),
    };
    const fill = createFormFieldTools(deps, 42).find((tool) => tool.definition.name === "fill_form_field");

    await expect(fill?.executor.execute({ selector: "#target", value: "Ada" })).rejects.toThrow(
      "Form submission attempt blocked"
    );
    expect(submissions).toBe(0);
  });

  it("继承的标签页工具应隐藏并覆盖 tab_id", async () => {
    const executor = { execute: vi.fn().mockResolvedValue("ok") };
    const bound = bindToolToAssignedTab(
      {
        definition: {
          name: "get_tab_content",
          description: "read",
          parameters: {
            type: "object",
            properties: { tab_id: { type: "number" }, prompt: { type: "string" } },
            required: ["tab_id"],
          },
        },
        executor,
      },
      42
    );

    expect(bound.definition.parameters).not.toMatchObject({ properties: { tab_id: expect.anything() } });
    await bound.executor.execute({ tab_id: 999, prompt: "fields" });
    expect(executor.execute).toHaveBeenCalledWith({ tab_id: 42, prompt: "fields" });
  });
});
