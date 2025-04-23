import { createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { createAppSlice } from "../hooks";
import {
  Script,
  SCRIPT_RUN_STATUS,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
  ScriptDAO,
} from "@App/app/repo/scripts";
import { arrayMove } from "@dnd-kit/sortable";
import {
  PermissionClient,
  PopupClient,
  RuntimeClient,
  ScriptClient,
  SubscribeClient,
  ValueClient,
} from "@App/app/service/service_worker/client";
import { message } from "../global";

export const scriptClient = new ScriptClient(message);
export const subscribeClient = new SubscribeClient(message);
export const runtimeClient = new RuntimeClient(message);
export const popupClient = new PopupClient(message);
export const permissionClient = new PermissionClient(message);
export const valueClient = new ValueClient(message);

export const fetchAndSortScriptList = createAsyncThunk("script/fetchScriptList", async () => {
  // 排序
  const dao = new ScriptDAO();
  const scripts = await dao.all();
  scripts.sort((a, b) => a.sort - b.sort);
  for (let i = 0; i < scripts.length; i += 1) {
    if (scripts[i].sort !== i) {
      dao.update(scripts[i].uuid, { sort: i });
      scripts[i].sort = i;
    }
  }
  return scripts;
});

export const requestEnableScript = createAsyncThunk(
  "script/enableScript",
  (param: { uuid: string; enable: boolean }) => {
    return scriptClient.enable(param.uuid, param.enable);
  }
);

export const requestRunScript = createAsyncThunk("script/runScript", async (uuid: string) => {
  return await runtimeClient.runScript(uuid);
});

export const requestStopScript = createAsyncThunk("script/stopScript", async (uuid: string) => {
  return await runtimeClient.stopScript(uuid);
});

export const requestDeleteScript = createAsyncThunk("script/deleteScript", async (uuid: string) => {
  return scriptClient.delete(uuid);
});

export type ScriptLoading = Script & { enableLoading?: boolean; actionLoading?: boolean };

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
    deleteScript: (state, action: PayloadAction<string>) => {
      state.scripts = state.scripts.filter((s) => s.uuid !== action.payload);
    },
    sortScript: (state, action: PayloadAction<{ uuid: string; newIndex: number; oldIndex: number }>) => {
      const dao = new ScriptDAO();
      const newItems = arrayMove(state.scripts, action.payload.oldIndex, action.payload.newIndex);
      for (let i = 0; i < state.scripts.length; i += 1) {
        if (newItems[i].sort !== i) {
          dao.update(newItems[i].uuid, { sort: i });
          newItems[i].sort = i;
        }
      }
      state.scripts = newItems;
    },
    updateRunStatus: (state, action: PayloadAction<{ uuid: string; runStatus: SCRIPT_RUN_STATUS }>) => {
      const script = state.scripts.find((s) => s.uuid === action.payload.uuid);
      if (script) {
        script.runStatus = action.payload.runStatus;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAndSortScriptList.fulfilled, (state, action) => {
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
      );
  },
  selectors: {
    selectScripts: (state) => state.scripts,
  },
});

export const { sortScript, upsertScript, deleteScript } = scriptSlice.actions;

export const { selectScripts } = scriptSlice.selectors;
