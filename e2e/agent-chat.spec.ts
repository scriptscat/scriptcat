import { test, expect } from "./agent-fixtures";
import { openAgentChatPage, buildOpenAISSEResponse } from "./utils";

test.describe("Agent Chat", () => {
  test("should show new chat button and conversation list", async ({ context, extensionId }) => {
    const page = await openAgentChatPage(context, extensionId);
    await page.waitForTimeout(2000);

    // 新建会话按钮应可见
    const newChatBtn = page.locator("button", { hasText: /new|新建/i }).first();
    await expect(newChatBtn).toBeVisible({ timeout: 10000 });

    // 模型选择器应包含预设的模型
    const modelSelect = page.locator(".arco-select");
    await expect(modelSelect.first()).toBeVisible({ timeout: 5000 });

    await page.close();
  });

  test("should create a new conversation", async ({ context, extensionId }) => {
    const page = await openAgentChatPage(context, extensionId);
    await page.waitForTimeout(2000);

    // 点击新建会话
    const newChatBtn = page.locator("button", { hasText: /new|新建/i }).first();
    await newChatBtn.click();
    await page.waitForTimeout(1000);

    // 应该创建一个 "New Chat" 会话
    const convItem = page.locator(".agent-conversation-item");
    await expect(convItem.first()).toBeVisible({ timeout: 5000 });

    // 会话标题应该包含 "New Chat"
    await expect(convItem.first().locator("span", { hasText: "New Chat" })).toBeVisible({ timeout: 5000 });

    await page.close();
  });

  test("should rename a conversation", async ({ context, extensionId }) => {
    const page = await openAgentChatPage(context, extensionId);
    await page.waitForTimeout(2000);

    // 创建会话
    await page
      .locator("button", { hasText: /new|新建/i })
      .first()
      .click();
    await page.waitForTimeout(1000);

    // hover 会话项以显示操作按钮
    const convItem = page.locator(".agent-conversation-item").first();
    await convItem.hover();
    await page.waitForTimeout(300);

    // 点击编辑按钮
    const editBtn = convItem.locator("button").first();
    await editBtn.click();
    await page.waitForTimeout(300);

    // 输入新标题
    const renameInput = convItem.locator("input");
    await renameInput.clear();
    await renameInput.fill("Renamed Chat");
    await renameInput.press("Enter");
    await page.waitForTimeout(1000);

    // 验证重命名成功
    await expect(page.locator("text=Renamed Chat")).toBeVisible({ timeout: 5000 });

    await page.close();
  });

  test("should delete a conversation", async ({ context, extensionId }) => {
    const page = await openAgentChatPage(context, extensionId);
    await page.waitForTimeout(2000);

    // 创建两个会话
    const newBtn = page.locator("button", { hasText: /new|新建/i }).first();
    await newBtn.click();
    await page.waitForTimeout(1000);
    await newBtn.click();
    await page.waitForTimeout(1000);

    const convItems = page.locator(".agent-conversation-item");
    const initialCount = await convItems.count();
    expect(initialCount).toBeGreaterThanOrEqual(2);

    // hover 到第一个会话项并删除
    await convItems.first().hover();
    await page.waitForTimeout(300);
    await convItems.first().locator("button.arco-btn-status-danger").click();
    await page.waitForTimeout(300);

    // 确认删除
    await page.locator(".arco-popconfirm button.arco-btn-primary").first().click();
    await page.waitForTimeout(1000);

    // 会话数量应减少
    expect(await convItems.count()).toBeLessThan(initialCount);

    await page.close();
  });

  test("should send a message and receive streamed response", async ({ context, extensionId }) => {
    // 拦截 LLM API 请求
    await context.route("**/v1/chat/completions", async (route) => {
      const sseBody = buildOpenAISSEResponse("Hello! I am a test assistant response.");
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sseBody,
      });
    });

    const page = await openAgentChatPage(context, extensionId);
    await page.waitForTimeout(2000);

    // 创建会话
    await page
      .locator("button", { hasText: /new|新建/i })
      .first()
      .click();
    await page.waitForTimeout(1000);

    // 输入并发送消息
    const textarea = page.locator("textarea");
    await textarea.fill("Hello, test message");
    await textarea.press("Enter");
    await page.waitForTimeout(5000);

    // 验证用户消息显示
    await expect(page.locator("text=Hello, test message")).toBeVisible({ timeout: 10000 });

    // 验证助手回复显示
    await expect(page.locator("text=/test assistant response/i")).toBeVisible({ timeout: 15000 });

    await page.close();
  });

  test("should display error when LLM API returns error", async ({ context, extensionId }) => {
    await context.route("**/v1/chat/completions", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Invalid API key" } }),
      });
    });

    const page = await openAgentChatPage(context, extensionId);
    await page.waitForTimeout(2000);

    // 创建会话并发送消息
    await page
      .locator("button", { hasText: /new|新建/i })
      .first()
      .click();
    await page.waitForTimeout(1000);

    const textarea = page.locator("textarea");
    await textarea.fill("This should fail");
    await textarea.press("Enter");
    await page.waitForTimeout(5000);

    // 验证错误信息显示
    await expect(page.locator("text=/error|Invalid API key|失败/i")).toBeVisible({ timeout: 15000 });

    await page.close();
  });

  test("should handle multi-turn conversation", async ({ context, extensionId }) => {
    let requestCount = 0;
    await context.route("**/v1/chat/completions", async (route) => {
      requestCount++;
      const sseBody = buildOpenAISSEResponse(`Response number ${requestCount} from assistant.`);
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sseBody,
      });
    });

    const page = await openAgentChatPage(context, extensionId);
    await page.waitForTimeout(2000);

    await page
      .locator("button", { hasText: /new|新建/i })
      .first()
      .click();
    await page.waitForTimeout(1000);

    const textarea = page.locator("textarea");

    // 第一轮
    await textarea.fill("First question");
    await textarea.press("Enter");
    await page.waitForTimeout(5000);

    await expect(page.locator("text=First question")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=/Response number 1/")).toBeVisible({ timeout: 15000 });

    // 第二轮
    await textarea.fill("Second question");
    await textarea.press("Enter");
    await page.waitForTimeout(5000);

    await expect(page.locator("text=Second question")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=/Response number 2/")).toBeVisible({ timeout: 15000 });

    expect(requestCount).toBe(2);
    await page.close();
  });

  test("should update conversation title after first message", async ({ context, extensionId }) => {
    await context.route("**/v1/chat/completions", async (route) => {
      const sseBody = buildOpenAISSEResponse("I can help with that!");
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sseBody,
      });
    });

    const page = await openAgentChatPage(context, extensionId);
    await page.waitForTimeout(2000);

    await page
      .locator("button", { hasText: /new|新建/i })
      .first()
      .click();
    await page.waitForTimeout(1000);

    // 验证初始标题
    await expect(page.locator(".agent-conversation-item span", { hasText: "New Chat" })).toBeVisible();

    // 发送消息
    const textarea = page.locator("textarea");
    await textarea.fill("Help me write a script for automation");
    await textarea.press("Enter");
    await page.waitForTimeout(5000);

    // 标题应被更新为消息的前缀
    await expect(page.locator(".agent-conversation-item span", { hasText: /Help me write/i })).toBeVisible({
      timeout: 10000,
    });

    await page.close();
  });

  test("should clear conversation with /new command", async ({ context, extensionId }) => {
    await context.route("**/v1/chat/completions", async (route) => {
      const sseBody = buildOpenAISSEResponse("Hello there!");
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sseBody,
      });
    });

    const page = await openAgentChatPage(context, extensionId);
    await page.waitForTimeout(2000);

    await page
      .locator("button", { hasText: /new|新建/i })
      .first()
      .click();
    await page.waitForTimeout(1000);

    // 发送一条消息
    const textarea = page.locator("textarea");
    await textarea.fill("Some message");
    await textarea.press("Enter");
    await page.waitForTimeout(5000);

    await expect(page.locator("text=Some message")).toBeVisible({ timeout: 10000 });

    // 发送 /new 清空上下文
    await textarea.fill("/new");
    await textarea.press("Enter");
    await page.waitForTimeout(2000);

    // 消息应被清空
    expect(await page.locator("text=Some message").count()).toBe(0);

    await page.close();
  });

  test("should handle tool calling flow", async ({ context, extensionId }) => {
    let callCount = 0;
    await context.route("**/v1/chat/completions", async (route) => {
      callCount++;
      if (callCount === 1) {
        // 第一次：返回 tool call
        const sseBody = buildOpenAISSEResponse("", {
          toolCalls: [{ id: "call_test123", name: "dom_list_tabs", arguments: "{}" }],
        });
        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: sseBody,
        });
      } else {
        // 后续：返回最终回复
        const sseBody = buildOpenAISSEResponse("I found 2 open tabs.");
        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: sseBody,
        });
      }
    });

    const page = await openAgentChatPage(context, extensionId);
    await page.waitForTimeout(2000);

    await page
      .locator("button", { hasText: /new|新建/i })
      .first()
      .click();
    await page.waitForTimeout(1000);

    const textarea = page.locator("textarea");
    await textarea.fill("List all open tabs");
    await textarea.press("Enter");

    // 等待 tool calling 完成
    await page.waitForTimeout(10000);

    // 验证最终回复
    await expect(page.locator("text=/found.*tabs/i")).toBeVisible({ timeout: 20000 });

    // 至少触发了两次 API 调用
    expect(callCount).toBeGreaterThanOrEqual(2);

    await page.close();
  });
});
