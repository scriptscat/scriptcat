import { subscribeScriptDelete, subscribeScriptInstall, subscribeScriptRunStatus } from "@App/app/service/queue";
import { messageQueue } from "./global";
import { store } from "./store";
import { batchDeleteScript, scriptSlice, upsertScript } from "./features/script";

export function storeSubscribe() {
  subscribeScriptRunStatus(messageQueue, (data) => {
    store.dispatch(scriptSlice.actions.updateRunStatus(data));
  });

  subscribeScriptInstall(messageQueue, (message) => {
    store.dispatch(upsertScript(message.script));
  });

  subscribeScriptDelete(messageQueue, (message) => {
    store.dispatch(batchDeleteScript([message.uuid]));
  });
}
