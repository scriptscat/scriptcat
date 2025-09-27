import type { Script } from "@App/app/repo/scripts";
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
import type { SearchType, TBatchUpdateListAction } from "@App/app/service/service_worker/types";
import { type TCheckScriptUpdateOption } from "@App/app/service/service_worker/script";

export const scriptClient = new ScriptClient(message);
export const subscribeClient = new SubscribeClient(message);
export const runtimeClient = new RuntimeClient(message);
export const popupClient = new PopupClient(message);
export const permissionClient = new PermissionClient(message);
export const valueClient = new ValueClient(message);
export const resourceClient = new ResourceClient(message);
export const synchronizeClient = new SynchronizeClient(message);

export const fetchScriptList = async () => {
  return await scriptClient.getAllScripts();
};

export const fetchScript = async (uuid: string) => {
  return await scriptClient.info(uuid);
};

export const requestEnableScript = async (param: { uuid: string; enable: boolean }) => {
  return await scriptClient.enable(param.uuid, param.enable);
};

export const requestRunScript = async (uuid: string) => {
  return await runtimeClient.runScript(uuid);
};

export const requestStopScript = async (uuid: string) => {
  return await runtimeClient.stopScript(uuid);
};

// export const requestDeleteScript = createAsyncThunk("script/deleteScript", async (uuid: string) => {
//   return await scriptClient.delete(uuid);
// });

export const requestDeleteScripts = async (uuids: string[]) => {
  return await scriptClient.deletes(uuids);
};

export const requestFilterResult = async (req: { type: SearchType; value: string }) => {
  return await scriptClient.getFilterResult(req);
};

export const requestBatchUpdateListAction = async (action: TBatchUpdateListAction) => {
  return await scriptClient.batchUpdateListAction(action);
};

export const requestOpenUpdatePageByUUID = async (uuid: string) => {
  return await scriptClient.openUpdatePageByUUID(uuid);
};

export const requestOpenBatchUpdatePage = async (q: string) => {
  return await scriptClient.openBatchUpdatePage(q);
};

export const requestCheckScriptUpdate = async (opts: TCheckScriptUpdateOption) => {
  return await scriptClient.checkScriptUpdate(opts);
};

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

export const sortScript = async ({ active, over }: { active: string; over: string }) => {
  return await scriptClient.sortScript(active, over);
};

export const pinToTop = async (uuids: string[]) => {
  return await scriptClient.pinToTop(uuids);
};
