// can be tested with vitest-environment node
import { describe, it, expect } from "vitest";
import type { Script } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import { editorTabsReducer, initialEditorTabsState, type EditorTab, type EditorTabsState } from "./useEditorTabs";

// 构造最小可用的 Script
const mkScript = (uuid: string, name = uuid): Script =>
  ({
    uuid,
    name,
    namespace: "",
    metadata: { name: [name] },
    type: SCRIPT_TYPE_NORMAL,
    status: SCRIPT_STATUS_ENABLE,
    sort: 0,
    runStatus: "complete",
    createtime: 0,
    checktime: 0,
  }) as unknown as Script;

const mkTab = (uuid: string, code = `// ${uuid}`): EditorTab => ({
  uuid,
  script: mkScript(uuid),
  code,
  isChanged: false,
});

// 依次 open 多个标签，返回最终 state
const openMany = (uuids: string[]): EditorTabsState =>
  uuids.reduce<EditorTabsState>(
    (state, uuid) => editorTabsReducer(state, { type: "open", tab: mkTab(uuid) }),
    initialEditorTabsState
  );

describe("editorTabsReducer 多标签状态机", () => {
  describe("open", () => {
    it("打开到空列表时应新增标签并激活", () => {
      const state = editorTabsReducer(initialEditorTabsState, { type: "open", tab: mkTab("a") });
      expect(state.tabs.map((t) => t.uuid)).toEqual(["a"]);
      expect(state.activeUuid).toBe("a");
    });

    it("打开已存在的标签时只激活，不重复插入", () => {
      const state = openMany(["a", "b"]);
      const next = editorTabsReducer(state, { type: "open", tab: mkTab("a") });
      expect(next.tabs.map((t) => t.uuid)).toEqual(["a", "b"]);
      expect(next.activeUuid).toBe("a");
    });

    it("新标签应插入在当前激活标签之后并激活", () => {
      // a,b,c 后激活 a，再打开 d -> a,d,b,c
      let state = openMany(["a", "b", "c"]);
      state = editorTabsReducer(state, { type: "activate", uuid: "a" });
      state = editorTabsReducer(state, { type: "open", tab: mkTab("d") });
      expect(state.tabs.map((t) => t.uuid)).toEqual(["a", "d", "b", "c"]);
      expect(state.activeUuid).toBe("d");
    });
  });

  describe("activate", () => {
    it("应切换激活标签", () => {
      const state = editorTabsReducer(openMany(["a", "b"]), { type: "activate", uuid: "a" });
      expect(state.activeUuid).toBe("a");
    });

    it("激活不存在的标签时保持不变", () => {
      const state = openMany(["a", "b"]);
      const next = editorTabsReducer(state, { type: "activate", uuid: "x" });
      expect(next.activeUuid).toBe("b");
    });
  });

  describe("markChanged / commitSaved 脏标记", () => {
    it("代码与基线不同应标脏，相同应清脏", () => {
      let state = openMany(["a"]); // 基线 "// a"
      state = editorTabsReducer(state, { type: "markChanged", uuid: "a", code: "changed" });
      expect(state.tabs[0].isChanged).toBe(true);
      state = editorTabsReducer(state, { type: "markChanged", uuid: "a", code: "// a" });
      expect(state.tabs[0].isChanged).toBe(false);
    });

    it("commitSaved 应更新基线、清脏并合并脚本字段", () => {
      let state = openMany(["a"]);
      state = editorTabsReducer(state, { type: "markChanged", uuid: "a", code: "new code" });
      const saved = mkScript("a", "新名字");
      state = editorTabsReducer(state, { type: "commitSaved", uuid: "a", code: "new code", script: saved });
      expect(state.tabs[0].isChanged).toBe(false);
      expect(state.tabs[0].code).toBe("new code");
      expect(state.tabs[0].script.name).toBe("新名字");
    });
  });

  describe("close", () => {
    it("关闭非激活标签时激活标签不变", () => {
      let state = openMany(["a", "b", "c"]); // active=c
      state = editorTabsReducer(state, { type: "activate", uuid: "b" });
      state = editorTabsReducer(state, { type: "close", uuid: "a" });
      expect(state.tabs.map((t) => t.uuid)).toEqual(["b", "c"]);
      expect(state.activeUuid).toBe("b");
    });

    it("关闭激活的中间标签时激活后一个（同位置）", () => {
      let state = openMany(["a", "b", "c"]);
      state = editorTabsReducer(state, { type: "activate", uuid: "b" });
      state = editorTabsReducer(state, { type: "close", uuid: "b" });
      expect(state.tabs.map((t) => t.uuid)).toEqual(["a", "c"]);
      expect(state.activeUuid).toBe("c");
    });

    it("关闭激活的末尾标签时激活前一个", () => {
      const state = editorTabsReducer(openMany(["a", "b", "c"]), { type: "close", uuid: "c" });
      expect(state.tabs.map((t) => t.uuid)).toEqual(["a", "b"]);
      expect(state.activeUuid).toBe("b");
    });

    it("关闭最后一个标签时列表清空、无激活", () => {
      const state = editorTabsReducer(openMany(["a"]), { type: "close", uuid: "a" });
      expect(state.tabs).toEqual([]);
      expect(state.activeUuid).toBeNull();
    });
  });

  describe("右键批量关闭", () => {
    it("closeOthers 只保留目标并激活它", () => {
      const state = editorTabsReducer(openMany(["a", "b", "c"]), { type: "closeOthers", uuid: "b" });
      expect(state.tabs.map((t) => t.uuid)).toEqual(["b"]);
      expect(state.activeUuid).toBe("b");
    });

    it("closeLeft 移除目标左侧；若激活被移除则激活剩余第一个", () => {
      let state = openMany(["a", "b", "c"]); // active=c
      state = editorTabsReducer(state, { type: "activate", uuid: "a" });
      state = editorTabsReducer(state, { type: "closeLeft", uuid: "b" });
      expect(state.tabs.map((t) => t.uuid)).toEqual(["b", "c"]);
      expect(state.activeUuid).toBe("b");
    });

    it("closeRight 移除目标右侧；若激活被移除则激活剩余第一个", () => {
      let state = openMany(["a", "b", "c"]); // active=c
      state = editorTabsReducer(state, { type: "closeRight", uuid: "b" });
      expect(state.tabs.map((t) => t.uuid)).toEqual(["a", "b"]);
      expect(state.activeUuid).toBe("a");
    });

    it("closeRight 不影响仍存在的激活标签", () => {
      let state = openMany(["a", "b", "c"]); // active=c
      state = editorTabsReducer(state, { type: "activate", uuid: "a" });
      state = editorTabsReducer(state, { type: "closeRight", uuid: "b" });
      expect(state.activeUuid).toBe("a");
    });
  });
});
