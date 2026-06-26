import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { TooltipProvider } from "@App/pages/components/ui/tooltip";
import i18n, { t, changeLanguage } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";
import type { ScriptLoading } from "@App/pages/store/features/script";
import { SourceTag } from "./components";

// 本地脚本(无 subscribeUrl / origin)→ 渲染 t("script:source_local_script")
const localScript = { subscribeUrl: undefined, origin: undefined } as unknown as ScriptLoading;

async function switchTo(lng: string) {
  await act(async () => {
    changeLanguage(lng);
    await i18n.changeLanguage(lng);
  });
}

beforeAll(() => initTestLanguage("zh-CN"));
afterEach(cleanup);

describe("迁移到 useTranslation 后语言切换即时生效(无需重挂载)", () => {
  it("React.memo 组件 SourceTag 切换语言后立即显示新语言", async () => {
    await switchTo("zh-CN");
    render(
      <TooltipProvider>
        <SourceTag script={localScript} />
      </TooltipProvider>
    );
    const zhText = screen.getByText(t("script:source_local_script")).textContent;
    expect(zhText).toBe(t("script:source_local_script"));

    // 切换语言:不重挂载整棵树,仅靠 useTranslation 订阅即应更新
    await switchTo("en-US");

    const enText = screen.getByText(t("script:source_local_script")).textContent;
    expect(enText).toBe(t("script:source_local_script"));
    expect(enText).not.toBe(zhText);
  });
});
