import type { TInstallScript, TDeleteScript, TScriptRunStatus } from "@App/app/service/queue";
import { messageQueue } from "./global";
import { store } from "./store";
import { batchDeleteScript, scriptSlice, upsertScript } from "./features/script";

export default function storeSubscribe() {
  messageQueue.subscribe<TScriptRunStatus>("scriptRunStatus", (data) => {
    store.dispatch(scriptSlice.actions.updateRunStatus(data));
  });

  messageQueue.subscribe<TInstallScript>("installScript", (message) => {
    store.dispatch(upsertScript(message.script));
  });

  messageQueue.subscribe<TDeleteScript>("deleteScript", (message) => {
    store.dispatch(batchDeleteScript([message.uuid]));
  });
}
