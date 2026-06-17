import type { Script } from "@App/app/repo/scripts";

// 单个打开的编辑器标签（仅数据状态，不持有 Monaco 实例）
export interface EditorTab {
  uuid: string;
  script: Script;
  code: string; // 最近一次保存的基线代码，用于计算脏标记
  isChanged: boolean;
}

export interface EditorTabsState {
  tabs: EditorTab[];
  activeUuid: string | null;
}

export const initialEditorTabsState: EditorTabsState = {
  tabs: [],
  activeUuid: null,
};

export type EditorTabsAction =
  | { type: "open"; tab: EditorTab }
  | { type: "activate"; uuid: string }
  | { type: "close"; uuid: string }
  | { type: "closeOthers"; uuid: string }
  | { type: "closeLeft"; uuid: string }
  | { type: "closeRight"; uuid: string }
  | { type: "markChanged"; uuid: string; code: string }
  | { type: "commitSaved"; uuid: string; code: string; script: Script };

const has = (tabs: EditorTab[], uuid: string) => tabs.some((t) => t.uuid === uuid);

// 批量关闭后，若激活标签已被移除，则激活剩余的第一个
const ensureActive = (tabs: EditorTab[], activeUuid: string | null): string | null => {
  if (tabs.length === 0) return null;
  if (activeUuid && has(tabs, activeUuid)) return activeUuid;
  return tabs[0].uuid;
};

export function editorTabsReducer(state: EditorTabsState, action: EditorTabsAction): EditorTabsState {
  switch (action.type) {
    case "open": {
      const { tab } = action;
      // 已打开则仅激活
      if (has(state.tabs, tab.uuid)) {
        return { ...state, activeUuid: tab.uuid };
      }
      // 插入在当前激活标签之后；无激活则追加到末尾
      const activeIndex = state.activeUuid ? state.tabs.findIndex((t) => t.uuid === state.activeUuid) : -1;
      const insertIdx = activeIndex >= 0 ? activeIndex + 1 : state.tabs.length;
      const tabs = [...state.tabs];
      tabs.splice(insertIdx, 0, tab);
      return { tabs, activeUuid: tab.uuid };
    }
    case "activate": {
      if (!has(state.tabs, action.uuid)) return state;
      return { ...state, activeUuid: action.uuid };
    }
    case "close": {
      const index = state.tabs.findIndex((t) => t.uuid === action.uuid);
      if (index === -1) return state;
      const tabs = state.tabs.filter((t) => t.uuid !== action.uuid);
      let activeUuid = state.activeUuid;
      if (state.activeUuid === action.uuid) {
        if (tabs.length === 0) {
          activeUuid = null;
        } else {
          const nextIndex = index >= tabs.length ? tabs.length - 1 : index;
          activeUuid = tabs[nextIndex].uuid;
        }
      }
      return { tabs, activeUuid };
    }
    case "closeOthers": {
      const tabs = state.tabs.filter((t) => t.uuid === action.uuid);
      return { tabs, activeUuid: tabs.length ? action.uuid : null };
    }
    case "closeLeft": {
      const idx = state.tabs.findIndex((t) => t.uuid === action.uuid);
      if (idx === -1) return state;
      const tabs = state.tabs.slice(idx);
      return { tabs, activeUuid: ensureActive(tabs, state.activeUuid) };
    }
    case "closeRight": {
      const idx = state.tabs.findIndex((t) => t.uuid === action.uuid);
      if (idx === -1) return state;
      const tabs = state.tabs.slice(0, idx + 1);
      return { tabs, activeUuid: ensureActive(tabs, state.activeUuid) };
    }
    case "markChanged": {
      return {
        ...state,
        tabs: state.tabs.map((t) => (t.uuid === action.uuid ? { ...t, isChanged: t.code !== action.code } : t)),
      };
    }
    case "commitSaved": {
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.uuid === action.uuid
            ? { ...t, code: action.code, isChanged: false, script: { ...t.script, ...action.script } }
            : t
        ),
      };
    }
    default:
      return state;
  }
}
