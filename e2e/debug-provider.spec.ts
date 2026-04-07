import { test, expect } from "./fixtures";
import { openAgentProviderPage, openOptionsPage, setupAgentModel } from "./utils";

test("debug: check rendered model card content", async ({ context, extensionId }) => {
  // 先写入 storage
  const setupPage = await openOptionsPage(context, extensionId);
  await setupPage.waitForTimeout(1000);
  const modelId = await setupAgentModel(setupPage, { name: "Debug Model" });
  console.log("Model ID created:", modelId);
  await setupPage.close();

  // 打开 provider 页面
  const page = await openAgentProviderPage(context, extensionId);
  await page.waitForTimeout(3000);

  // 获取 card 内部的所有文本
  const cardBody = page.locator(".arco-card-body");
  const cardText = await cardBody.innerText();
  console.log("Card body text:", JSON.stringify(cardText));

  // 截图
  await page.screenshot({ path: "e2e/debug-provider2.png", fullPage: true });

  // 检查各个组件
  const emptyCount = await page.locator(".arco-empty").count();
  console.log("Empty count:", emptyCount);

  // Typography.Text 元素
  const texts = await page.locator(".arco-typography").allInnerTexts();
  console.log("All typography texts:", texts);

  await page.close();
});
