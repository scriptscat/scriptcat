import { test, expect } from "./fixtures";
import { openAgentProviderPage } from "./utils";

// new-ui Agent 模型服务页（shadcn）：空状态 data-testid="empty-state"，添加按钮
// "model-add"，对话框为 Radix Dialog(role=dialog)，表单字段 model-name/model-provider/
// model-base-url/model-api-key/model-id/model-test，Provider 为 Radix Select(role=option)。
test.describe("Agent 模型服务管理", () => {
  test("未配置模型时应显示空状态", async ({ context, extensionId }) => {
    const page = await openAgentProviderPage(context, extensionId);
    await expect(page.getByTestId("empty-state")).toBeVisible({ timeout: 10_000 });
    await page.close();
  });

  test("应打开添加模型对话框且含正确表单字段", async ({ context, extensionId }) => {
    const page = await openAgentProviderPage(context, extensionId);
    await page.getByTestId("model-add").click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await expect(dialog.getByTestId("model-name")).toBeVisible();
    await expect(dialog.getByTestId("model-provider")).toBeVisible();
    // 默认 provider 为 openai，API 地址 placeholder 含 openai
    await expect(dialog.getByTestId("model-base-url")).toHaveAttribute("placeholder", /openai/i);
    await expect(dialog.getByTestId("model-api-key")).toHaveAttribute("type", "password");
    await expect(dialog.getByTestId("model-id")).toBeVisible();
    await expect(dialog.getByTestId("model-test")).toBeVisible();

    // 取消关闭对话框
    await dialog.getByRole("button", { name: /cancel|取消/i }).click();
    await expect(dialog).not.toBeVisible();
    await page.close();
  });

  test("应能在 OpenAI 与 Anthropic 间切换 Provider", async ({ context, extensionId }) => {
    const page = await openAgentProviderPage(context, extensionId);
    await page.getByTestId("model-add").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const baseUrl = dialog.getByTestId("model-base-url");
    await expect(baseUrl).toHaveAttribute("placeholder", /openai/i);

    // 打开 Provider Select 并选择 Anthropic（Radix Select 选项渲染在 portal）
    await dialog.getByTestId("model-provider").click();
    await page.getByRole("option", { name: /anthropic/i }).click();

    await expect(baseUrl).toHaveAttribute("placeholder", /anthropic/i);
    await page.close();
  });
});
