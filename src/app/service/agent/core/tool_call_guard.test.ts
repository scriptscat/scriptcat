import { describe, it, expect } from "vitest";
import { detectToolCallIssues, type ToolCallRecord } from "./tool_call_guard";

describe("detectToolCallIssues", () => {
  it("历史记录不足时不生成警告", () => {
    expect(detectToolCallIssues([])).toBeNull();
    expect(
      detectToolCallIssues([{ name: "web_search", args: '{"query":"test"}', result: "...", iteration: 1 }])
    ).toBeNull();
  });

  describe("完全相同的 tool + args 检测", () => {
    it("相同工具和参数调用2次时生成警告", () => {
      const history: ToolCallRecord[] = [
        { name: "web_fetch", args: '{"url":"https://example.com"}', result: "...", iteration: 1 },
        { name: "web_fetch", args: '{"url":"https://example.com"}', result: "...", iteration: 2 },
      ];
      const warning = detectToolCallIssues(history);
      expect(warning).not.toBeNull();
      expect(warning).toContain("web_fetch");
    });

    it("JSON 格式不同但内容相同时也触发", () => {
      const history: ToolCallRecord[] = [
        { name: "web_fetch", args: '{"url": "https://example.com"}', result: "...", iteration: 1 },
        { name: "web_fetch", args: '{"url":"https://example.com"}', result: "...", iteration: 2 },
      ];
      const warning = detectToolCallIssues(history);
      expect(warning).not.toBeNull();
    });

    it("不同参数不触发警告", () => {
      const history: ToolCallRecord[] = [
        { name: "web_fetch", args: '{"url":"https://a.com"}', result: "...", iteration: 1 },
        { name: "web_fetch", args: '{"url":"https://b.com"}', result: "...", iteration: 2 },
      ];
      expect(detectToolCallIssues(history)).toBeNull();
    });

    it("超过最近10条的重复不触发", () => {
      const history: ToolCallRecord[] = [
        { name: "web_fetch", args: '{"url":"https://old.com"}', result: "...", iteration: 1 },
      ];
      // 插入11条不同的调用（交替使用不同工具避免触发通用重复检测）
      const tools = ["web_search", "web_fetch", "execute_script"];
      for (let i = 0; i < 11; i++) {
        history.push({
          name: tools[i % 3],
          args: `{"q":"pad${i}"}`,
          result: '{"result":"ok"}',
          iteration: i + 2,
        });
      }
      // 再加一条与第1条相同的，但已超出最近10条窗口
      history.push({ name: "web_fetch", args: '{"url":"https://old.com"}', result: "...", iteration: 13 });
      expect(detectToolCallIssues(history)).toBeNull();
    });
  });

  describe("execute_script 返回 null 检测", () => {
    it("连续3次返回 null 时生成警告", () => {
      const history: ToolCallRecord[] = [
        {
          name: "execute_script",
          args: '{"code":"a.click()","target":"page"}',
          result: '{"result":null,"target":"page","tab_id":123}',
          iteration: 1,
        },
        {
          name: "execute_script",
          args: '{"code":"b.click()","target":"page"}',
          result: '{"result":null,"target":"page","tab_id":123}',
          iteration: 2,
        },
        {
          name: "execute_script",
          args: '{"code":"c.click()","target":"page"}',
          result: '{"result":null,"target":"page","tab_id":123}',
          iteration: 3,
        },
      ];
      const warning = detectToolCallIssues(history);
      expect(warning).not.toBeNull();
      expect(warning).toContain("execute_script");
      expect(warning).toContain("return");
    });

    it("中间穿插其他工具但 execute_script 仍然连续 null 时触发", () => {
      const history: ToolCallRecord[] = [
        { name: "execute_script", args: '{"code":"a()"}', result: '{"result":null}', iteration: 1 },
        {
          name: "get_tab_content",
          args: '{"tab_id":1,"prompt":"find buttons"}',
          result: "page content...",
          iteration: 2,
        },
        { name: "execute_script", args: '{"code":"b()"}', result: '{"result":null}', iteration: 3 },
        {
          name: "get_tab_content",
          args: '{"tab_id":1,"prompt":"check state"}',
          result: "page content...",
          iteration: 4,
        },
        { name: "execute_script", args: '{"code":"c()"}', result: '{"result":null}', iteration: 5 },
      ];
      const warning = detectToolCallIssues(history);
      expect(warning).not.toBeNull();
      expect(warning).toContain("execute_script");
    });

    it("2次返回 null 不触发", () => {
      const history: ToolCallRecord[] = [
        { name: "execute_script", args: '{"code":"a()"}', result: '{"result":null}', iteration: 1 },
        { name: "execute_script", args: '{"code":"b()"}', result: '{"result":null}', iteration: 2 },
      ];
      expect(detectToolCallIssues(history)).toBeNull();
    });

    it("中间有非 null 结果打断连续计数", () => {
      const history: ToolCallRecord[] = [
        { name: "execute_script", args: '{"code":"a()"}', result: '{"result":null}', iteration: 1 },
        { name: "execute_script", args: '{"code":"b()"}', result: '{"result":"ok"}', iteration: 2 },
        { name: "execute_script", args: '{"code":"c()"}', result: '{"result":null}', iteration: 3 },
        { name: "execute_script", args: '{"code":"d()"}', result: '{"result":null}', iteration: 4 },
      ];
      // 从最新往回数只有2个连续 null，不足3个
      expect(detectToolCallIssues(history)).toBeNull();
    });
  });

  describe("get_tab_content 重复调用检测", () => {
    it("同一 tab 调用3次时生成警告", () => {
      const history: ToolCallRecord[] = [
        { name: "get_tab_content", args: '{"tab_id":123,"prompt":"find buttons"}', result: "...", iteration: 1 },
        { name: "execute_script", args: '{"code":"click()"}', result: '{"result":"ok"}', iteration: 2 },
        { name: "get_tab_content", args: '{"tab_id":123,"prompt":"find the button"}', result: "...", iteration: 3 },
        { name: "execute_script", args: '{"code":"click2()"}', result: '{"result":"ok"}', iteration: 4 },
        { name: "get_tab_content", args: '{"tab_id":123,"prompt":"detailed info"}', result: "...", iteration: 5 },
      ];
      const warning = detectToolCallIssues(history);
      expect(warning).not.toBeNull();
      expect(warning).toContain("get_tab_content");
    });

    it("不同 tab 不触发", () => {
      const history: ToolCallRecord[] = [
        { name: "get_tab_content", args: '{"tab_id":123}', result: "...", iteration: 1 },
        { name: "get_tab_content", args: '{"tab_id":456}', result: "...", iteration: 2 },
        { name: "get_tab_content", args: '{"tab_id":789}', result: "...", iteration: 3 },
      ];
      expect(detectToolCallIssues(history)).toBeNull();
    });
  });

  describe("通用重复调用检测", () => {
    it("最近8条中同一工具出现5次时生成警告", () => {
      const history: ToolCallRecord[] = [];
      for (let i = 1; i <= 5; i++) {
        history.push({
          name: "web_search",
          args: `{"query":"search ${i}"}`,
          result: "...",
          iteration: i,
        });
      }
      const warning = detectToolCallIssues(history);
      expect(warning).not.toBeNull();
      expect(warning).toContain("web_search");
    });

    it("查询类工具不参与通用计数", () => {
      const history: ToolCallRecord[] = [];
      for (let i = 1; i <= 6; i++) {
        history.push({ name: "list_tasks", args: "{}", result: "[]", iteration: i });
      }
      expect(detectToolCallIssues(history)).toBeNull();
    });

    it("不同工具不合并计数", () => {
      const history: ToolCallRecord[] = [
        { name: "web_search", args: '{"query":"a"}', result: "...", iteration: 1 },
        { name: "web_fetch", args: '{"url":"b"}', result: "...", iteration: 2 },
        { name: "web_search", args: '{"query":"c"}', result: "...", iteration: 3 },
        { name: "web_fetch", args: '{"url":"d"}', result: "...", iteration: 4 },
        { name: "web_search", args: '{"query":"e"}', result: "...", iteration: 5 },
        { name: "web_fetch", args: '{"url":"f"}', result: "...", iteration: 6 },
      ];
      expect(detectToolCallIssues(history)).toBeNull();
    });
  });

  describe("startIndex 防止重复警告", () => {
    it("使用 startIndex 跳过已警告过的记录后不再重复触发", () => {
      const history: ToolCallRecord[] = [
        { name: "get_tab_content", args: '{"tab_id":123,"prompt":"a"}', result: "...", iteration: 1 },
        { name: "get_tab_content", args: '{"tab_id":123,"prompt":"b"}', result: "...", iteration: 2 },
        { name: "get_tab_content", args: '{"tab_id":123,"prompt":"c"}', result: "...", iteration: 3 },
      ];
      // 第一次检测：触发警告
      const warning1 = detectToolCallIssues(history);
      expect(warning1).not.toBeNull();
      expect(warning1).toContain("get_tab_content");

      // 模拟警告后推进 startIndex
      const startIndex = history.length;

      // 后续添加不同工具调用
      history.push({ name: "execute_script", args: '{"code":"click()"}', result: '{"result":"ok"}', iteration: 4 });
      history.push({ name: "list_tabs", args: "{}", result: "[]", iteration: 5 });

      // 使用 startIndex 后不再触发
      expect(detectToolCallIssues(history, startIndex)).toBeNull();
    });

    it("startIndex 之后出现新的违规模式仍然能检测到", () => {
      const history: ToolCallRecord[] = [
        { name: "get_tab_content", args: '{"tab_id":123,"prompt":"a"}', result: "...", iteration: 1 },
        { name: "get_tab_content", args: '{"tab_id":123,"prompt":"b"}', result: "...", iteration: 2 },
        { name: "get_tab_content", args: '{"tab_id":123,"prompt":"c"}', result: "...", iteration: 3 },
      ];
      const startIndex = history.length;

      // 新增的调用在 startIndex 之后再次触发相同问题
      history.push({ name: "get_tab_content", args: '{"tab_id":456,"prompt":"d"}', result: "...", iteration: 4 });
      history.push({ name: "get_tab_content", args: '{"tab_id":456,"prompt":"e"}', result: "...", iteration: 5 });
      history.push({ name: "get_tab_content", args: '{"tab_id":456,"prompt":"f"}', result: "...", iteration: 6 });

      const warning = detectToolCallIssues(history, startIndex);
      expect(warning).not.toBeNull();
      expect(warning).toContain("get_tab_content");
    });
  });

  describe("优先级", () => {
    it("完全相同参数的 execute_script 优先触发重复检测而非 null 检测", () => {
      const history: ToolCallRecord[] = [
        { name: "execute_script", args: '{"code":"a()"}', result: '{"result":null}', iteration: 1 },
        { name: "execute_script", args: '{"code":"b()"}', result: '{"result":null}', iteration: 2 },
        { name: "execute_script", args: '{"code":"a()"}', result: '{"result":null}', iteration: 3 },
      ];
      const warning = detectToolCallIssues(history);
      expect(warning).not.toBeNull();
      // 应该触发重复检测（规则1），而不是 null 检测（规则2）
      expect(warning).toContain("identical arguments");
    });
  });
});
