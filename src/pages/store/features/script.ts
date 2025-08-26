import type { PayloadAction } from "@reduxjs/toolkit";
import { createAsyncThunk } from "@reduxjs/toolkit";
import { createAppSlice } from "../hooks";
import type { Script, SCRIPT_RUN_STATUS } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE } from "@App/app/repo/scripts";
import { arrayMove } from "@dnd-kit/sortable";
import {
  PermissionClient,
  PopupClient,
  ResourceClient,
  RuntimeClient,
  ScriptClient,
  SubscribeClient,
  SynchronizeClient,
  ValueClient,
} from "@App/app/service/service_worker/client";
import { message } from "../global";

export const scriptClient = new ScriptClient(message);
export const subscribeClient = new SubscribeClient(message);
export const runtimeClient = new RuntimeClient(message);
export const popupClient = new PopupClient(message);
export const permissionClient = new PermissionClient(message);
export const valueClient = new ValueClient(message);
export const resourceClient = new ResourceClient(message);
export const synchronizeClient = new SynchronizeClient(message);

export const fetchScriptList = createAsyncThunk("script/fetchScriptList", async () => {
  return await scriptClient.getAllScripts();
});

export const requestEnableScript = createAsyncThunk(
  "script/enableScript",
  async (param: { uuid: string; enable: boolean }) => {
    return await scriptClient.enable(param.uuid, param.enable);
  }
);

export const requestRunScript = createAsyncThunk("script/runScript", async (uuid: string) => {
  return await runtimeClient.runScript(uuid);
});

export const requestStopScript = createAsyncThunk("script/stopScript", async (uuid: string) => {
  return await runtimeClient.stopScript(uuid);
});

export const requestDeleteScript = createAsyncThunk("script/deleteScript", async (uuid: string) => {
  return await scriptClient.delete(uuid);
});

export const requestScriptCode = createAsyncThunk("script/requestScriptCode", async (uuid: string, { getState }) => {
  const state = getState() as { script: { scripts: ScriptLoading[] } };
  const script = state.script.scripts.find((s) => s.uuid === uuid);

  // 如果已经有代码了，直接返回
  if (script?.code !== undefined) {
    return { code: script.code };
  }

  return await scriptClient.getCode(uuid);
});

export type ScriptLoading = Script & {
  enableLoading?: boolean;
  actionLoading?: boolean;
  favorite?: {
    match: string;
    website?: string;
    icon?: string;
  }[];
  code?: string; // 用于搜索的脚本代码
};

const updateScript = (scripts: ScriptLoading[], uuid: string, update: (s: ScriptLoading) => void) => {
  const script = scripts.find((s) => s.uuid === uuid);
  if (script) {
    update(script);
  }
};

export const scriptSlice = createAppSlice({
  name: "script",
  initialState: {
    scripts: [] as ScriptLoading[],
  },
  reducers: {
    upsertScript: (state, action: PayloadAction<Script>) => {
      const script = state.scripts.find((s) => s.uuid === action.payload.uuid);
      if (script) {
        Object.assign(script, action.payload);
      } else {
        // 放到第一
        state.scripts.splice(0, 0, action.payload);
      }
    },
    batchDeleteScript: (state, action: PayloadAction<string[]>) => {
      state.scripts = state.scripts.filter((s) => !action.payload.includes(s.uuid));
    },
    sortScript: (state, action: PayloadAction<{ active: string; over: string }>) => {
      let oldIndex = 0;
      let newIndex = 0;
      state.scripts.forEach((item, index) => {
        if (item.uuid === action.payload.active) {
          oldIndex = index;
        } else if (item.uuid === action.payload.over) {
          newIndex = index;
        }
      });
      const newItems = arrayMove(state.scripts, oldIndex, newIndex);
      state.scripts = newItems;
      for (let i = 0; i < state.scripts.length; i += 1) {
        if (state.scripts[i].sort !== i) {
          state.scripts[i].sort = i;
        }
      }
      scriptClient.sortScript(action.payload.active, action.payload.over);
    },
    updateRunStatus: (state, action: PayloadAction<{ uuid: string; runStatus: SCRIPT_RUN_STATUS }>) => {
      const script = state.scripts.find((s) => s.uuid === action.payload.uuid);
      if (script) {
        script.runStatus = action.payload.runStatus;
      }
    },
    updateEnableStatus: (state, action: PayloadAction<{ uuids: string[]; enable: boolean }>) => {
      state.scripts = state.scripts.map((s) => {
        if (action.payload.uuids.includes(s.uuid)) {
          s.status = action.payload.enable ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE;
        }
        return s;
      });
    },
    enableLoading(state, action: PayloadAction<{ uuids: string[]; loading: boolean }>) {
      state.scripts = state.scripts.map((s) => {
        if (action.payload.uuids.includes(s.uuid)) {
          s.enableLoading = action.payload.loading;
        }
        return s;
      });
    },
    setScriptFavicon: (state, action: PayloadAction<{ uuid: string; fav: { match: string; icon?: string }[] }[]>) => {
      const scriptMap = new Map<string, ScriptLoading>();
      state.scripts.forEach((s) => {
        scriptMap.set(s.uuid, s);
      });
      action.payload.forEach((item) => {
        const script = scriptMap.get(item.uuid);
        if (script) {
          script.favorite = item.fav;
        }
      });
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchScriptList.fulfilled, (state, action) => {
        state.scripts = action.payload;
      })
      // 处理enableScript
      .addCase(requestEnableScript.fulfilled, (state, action) => {
        updateScript(state.scripts, action.meta.arg.uuid, (script) => {
          script.enableLoading = false;
          script.status = action.meta.arg.enable ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE;
        });
      })
      .addCase(requestEnableScript.pending, (state, action) =>
        updateScript(state.scripts, action.meta.arg.uuid, (s) => (s.enableLoading = true))
      )
      // 处理deleteScript
      .addCase(requestDeleteScript.fulfilled, (state, action) => {
        state.scripts = state.scripts.filter((s) => s.uuid !== action.meta.arg);
      })
      .addCase(requestDeleteScript.pending, (state, action) =>
        updateScript(state.scripts, action.meta.arg, (s) => (s.actionLoading = true))
      )
      // 处理runScript和stopScript
      .addCase(requestRunScript.pending, (state, action) =>
        updateScript(state.scripts, action.meta.arg, (s) => (s.actionLoading = true))
      )
      .addCase(requestRunScript.fulfilled, (state, action) =>
        updateScript(state.scripts, action.meta.arg, (s) => (s.actionLoading = false))
      )
      .addCase(requestStopScript.pending, (state, action) =>
        updateScript(state.scripts, action.meta.arg, (s) => (s.actionLoading = true))
      )
      .addCase(requestStopScript.fulfilled, (state, action) =>
        updateScript(state.scripts, action.meta.arg, (s) => (s.actionLoading = false))
      )
      //处理请求脚本代码
      .addCase(requestScriptCode.fulfilled, (state, action) => {
        updateScript(state.scripts, action.meta.arg, (s) => {
          s.code = action.payload?.code.toLocaleLowerCase();
        });
      });
  },
  selectors: {
    selectScripts: (state) => state.scripts,
  },
});

export const { sortScript, upsertScript, batchDeleteScript, enableLoading, updateEnableStatus } = scriptSlice.actions;

export const { selectScripts } = scriptSlice.selectors;
