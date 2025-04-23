import { subscribeScriptDelete, subscribeScriptInstall, subscribeScriptRunStatus } from "@App/app/service/queue";
import { messageQueue } from "./global";
import { store } from "./store";
import { deleteScript, scriptSlice, upsertScript } from "./features/script";

export default function storeSubscribe() {
  subscribeScriptRunStatus(messageQueue, (data) => {
    store.dispatch(scriptSlice.actions.updateRunStatus(data));
  });

  subscribeScriptInstall(messageQueue, (message) => {
    store.dispatch(upsertScript(message.script));
  });

  subscribeScriptDelete(messageQueue, (message) => {
    store.dispatch(deleteScript(message.uuid));
  });
}
