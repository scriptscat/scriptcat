import LoggerCore from "@App/app/logger/core";
import type Logger from "@App/app/logger/logger";
import { type Script, ScriptDAO } from "@App/app/repo/scripts";
import { type Value, ValueDAO } from "@App/app/repo/value";
import type { IGetSender, Group } from "@Packages/message/server";
import { type RuntimeService } from "./runtime";
import { type PopupService } from "./popup";
import { getStorageName } from "@App/pkg/utils/utils";
import type { ValueUpdateDataEncoded, ValueUpdateDataREntry, ValueUpdateSender } from "../content/types";
import type { TScriptValueUpdate } from "../queue";
import { type TDeleteScript } from "../queue";
import { type IMessageQueue } from "@Packages/message/message_queue";
import { CACHE_KEY_SET_VALUE } from "@App/app/cache_key";
import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import type { TKeyValuePair } from "@App/pkg/utils/message_value";
import { decodeRValue, R_UNDEFINED, encodeRValue } from "@App/pkg/utils/message_value";

export type TSetValuesParams = {
  uuid: string;
  id?: string;
  keyValuePairs: TKeyValuePair[];
  isReplace: boolean;
  ts?: number;
  valueSender?: ValueUpdateSender;
};

export class ValueService {
  logger: Logger;
  scriptDAO: ScriptDAO = new ScriptDAO();
  valueDAO: ValueDAO = new ValueDAO();
  private popup: PopupService | undefined;
  private runtime: RuntimeService | undefined;

  constructor(
    private group: Group,
    private mq: IMessageQueue
  ) {
    this.logger = LoggerCore.logger().with({ service: "value" });
    this.valueDAO.enableCache();
  }

  async getScriptValueDetails(script: Script) {
    let data: { [key: string]: any } = {};
    const ret = await this.valueDAO.get(getStorageName(script));
    if (ret) {
      data = ret.data;
    }
    const newValues = data;
    // 和userconfig组装
    const { config } = script;
    if (config) {
      for (const tabKey of Object.keys(config)) {
        const tab = config![tabKey];
        if (!(tab instanceof Object)) {
          continue;
        }
        for (const key of Object.keys(tab)) {
          if (!tab[key]) {
            continue;
          }
          // 动态变量
          if (tab[key].bind) {
            const bindKey = tab[key].bind!.substring(1);
            newValues[bindKey] = data[bindKey] === undefined ? undefined : data[bindKey];
          }
          newValues[`${tabKey}.${key}`] =
            data[`${tabKey}.${key}`] === undefined ? tab[key].default : data[`${tabKey}.${key}`];
        }
      }
    }
    return [newValues, ret] as const;
  }

  getScriptValue(script: Script): Promise<Record<string, any>> {
    return this.getScriptValueDetails(script).then((res) => res[0]);
  }

  // 推送值到tab
  async pushValueToTab<T extends ValueUpdateDataEncoded>(sendData: T) {
    chrome.storage.local.set(
      {
        valueUpdateDelivery: {
          rId: `${Date.now()}.${Math.random()}`, // 用于区分不同的更新，确保 chrome.storage.local.onChanged 必能触发
          sendData,
        },
      },
      () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.storage.local.set", lastError);
        }
      }
    );
    // 推送到offscreen中
    this.runtime!.sendMessageToTab(
      {
        tabId: -1,
      },
      "valueUpdate",
      sendData
    );
  }

  // 批量设置
  async setValues(params: TSetValuesParams) {
    const { uuid, keyValuePairs, isReplace } = params;
    const id = params.id || "";
    const ts = params.ts || 0;
    const valueSender = params.valueSender || {
      runFlag: "user",
      tabId: -2,
    };
    // 查询出脚本
    const script = await this.scriptDAO.get(uuid);
    if (!script) {
      throw new Error("script not found");
    }
    // 查询老的值
    const storageName = getStorageName(script);
    let oldValueRecord: { [key: string]: any } = {};
    const cacheKey = `${CACHE_KEY_SET_VALUE}${storageName}`;
    const entries = [] as ValueUpdateDataREntry[];
    const _flag = await stackAsyncTask<boolean>(cacheKey, async () => {
      let valueModel: Value | undefined = await this.valueDAO.get(storageName);
      if (!valueModel) {
        const now = Date.now();
        const dataModel: { [key: string]: any } = {};
        for (const [key, rTyped1] of keyValuePairs) {
          const value = decodeRValue(rTyped1);
          if (value !== undefined) {
            dataModel[key] = value;
            entries.push([key, rTyped1, R_UNDEFINED]);
          }
        }
        // 即使是空 dataModel 也进行更新
        // 由于没entries, valueUpdated 是 false, 但 valueDAO 会有一个空的 valueModel 记录 updatetime
        valueModel = {
          uuid: uuid,
          storageName: storageName,
          data: dataModel,
          createtime: ts ? Math.min(ts, now) : now,
          updatetime: ts ? Math.min(ts, now) : now,
        };
      } else {
        let changed = false;
        let dataModel = (oldValueRecord = valueModel.data);
        dataModel = { ...dataModel }; // 每次储存使用新参考
        const containedKeys = new Set<string>();
        for (const [key, rTyped1] of keyValuePairs) {
          containedKeys.add(key);
          const value = decodeRValue(rTyped1);
          const oldValue = dataModel[key];
          if (oldValue === value) continue;
          changed = true;
          if (value === undefined) {
            delete dataModel[key];
          } else {
            dataModel[key] = value;
          }
          const rTyped2 = encodeRValue(oldValue);
          entries.push([key, rTyped1, rTyped2]);
        }
        if (isReplace) {
          // 处理oldValue有但是没有在data.values中的情况
          for (const key of Object.keys(oldValueRecord)) {
            if (!containedKeys.has(key)) {
              changed = true;
              const oldValue = oldValueRecord[key];
              delete dataModel[key]; // 这里使用delete是因为保存不需要这个字段了
              const rTyped2 = encodeRValue(oldValue);
              entries.push([key, R_UNDEFINED, rTyped2]);
            }
          }
        }
        if (!changed) return false;
        valueModel.data = dataModel; // 每次储存使用新参考
      }
      await this.valueDAO.save(storageName, valueModel);
      return true;
    });
    // 推送到所有加载了本脚本的tab中
    const valueUpdated = entries.length > 0;
    this.pushValueToTab({
      id,
      entries: entries,
      uuid,
      storageName,
      sender: valueSender,
      valueUpdated,
    } as ValueUpdateDataEncoded);
    // valueUpdate 消息用于 early script 的处理
    this.mq.emit<TScriptValueUpdate>("valueUpdate", { script, valueUpdated });
  }

  setScriptValues(params: Pick<TSetValuesParams, "uuid" | "keyValuePairs" | "isReplace" | "ts">, _sender: IGetSender) {
    return this.setValues(params);
  }

  init(runtime: RuntimeService, popup: PopupService) {
    this.popup = popup;
    this.runtime = runtime;
    this.group.on("getScriptValue", this.getScriptValue.bind(this));
    this.group.on("setScriptValues", this.setScriptValues.bind(this));

    this.mq.subscribe<TDeleteScript[]>("deleteScripts", async (data) => {
      for (const { storageName } of data) {
        // 判断还有没有其他同名storageName
        const list = await this.scriptDAO.find((_, script) => {
          return getStorageName(script) === storageName;
        });
        if (list.length === 0) {
          this.valueDAO.delete(storageName).then(() => {
            this.logger.trace("delete value", { storageName });
          });
        }
      }
    });
  }
}
