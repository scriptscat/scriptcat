import LoggerCore from "@App/app/logger/core";
import type Logger from "@App/app/logger/logger";
import { type Script, ScriptDAO } from "@App/app/repo/scripts";
import { type Value, ValueDAO } from "@App/app/repo/value";
import type { IGetSender, Group } from "@Packages/message/server";
import { type RuntimeService } from "./runtime";
import { type PopupService } from "./popup";
import { getStorageName } from "@App/pkg/utils/utils";
import type { ValueUpdateDataEncoded, ValueUpdateSender } from "../content/types";
import type { TScriptValueUpdate } from "../queue";
import { type TDeleteScript } from "../queue";
import { type IMessageQueue } from "@Packages/message/message_queue";
import { CACHE_KEY_SET_VALUE } from "@App/app/cache_key";
import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import { encodeMessage } from "@App/pkg/utils/message_value";

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

  async getScriptValue(script: Script) {
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
    return newValues;
  }

  async setValue(uuid: string, id: string, key: string, value: any, sender: ValueUpdateSender) {
    // 查询出脚本
    const script = await this.scriptDAO.get(uuid);
    if (!script) {
      throw new Error("script not found");
    }
    // 查询老的值
    const storageName = getStorageName(script);
    let oldValue;
    // 使用事务来保证数据一致性
    const cacheKey = `${CACHE_KEY_SET_VALUE}${storageName}`;
    const valueUpdated = await stackAsyncTask<boolean>(cacheKey, async () => {
      let valueModel: Value | undefined = await this.valueDAO.get(storageName);
      if (!valueModel) {
        const now = Date.now();
        valueModel = {
          uuid: script.uuid,
          storageName: storageName,
          data: { [key]: value },
          createtime: now,
          updatetime: now,
        };
      } else {
        let dataModel = valueModel.data;
        // 值没有发生变化, 不进行操作
        oldValue = dataModel[key];
        if (oldValue === value) {
          return false;
        }
        dataModel = { ...dataModel }; // 每次储存使用新参考
        if (value === undefined) {
          delete dataModel[key];
        } else {
          dataModel[key] = value;
        }
        valueModel.data = dataModel; // 每次储存使用新参考
      }
      await this.valueDAO.save(storageName, valueModel);
      return true;
    });

    this.pushValueToTab({
      id,
      entries: encodeMessage([[key, value, oldValue]]),
      uuid,
      storageName,
      sender,
      valueUpdated,
    } as ValueUpdateDataEncoded);
    // valueUpdate 消息用于 early script 的处理
    this.mq.emit<TScriptValueUpdate>("valueUpdate", { script, valueUpdated });
  }

  // 推送值到tab
  async pushValueToTab<T extends ValueUpdateDataEncoded>(sendData: T) {
    const { storageName } = sendData;
    chrome.tabs.query({}, (tabs) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.tabs.query:", lastError);
        // 没有 tabs 资讯，无法发推送到 tabs
        return;
      }
      // 推送到所有加载了本脚本的tab中
      for (const tab of tabs) {
        const tabId = tab.id!;
        this.popup!.getScriptMenu(tabId).then((scriptMenu) => {
          if (scriptMenu.find((item) => item.storageName === storageName)) {
            this.runtime!.sendMessageToTab(
              {
                tabId,
              },
              "valueUpdate",
              sendData
            );
          }
        });
      }
    });
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
  async setValues(
    uuid: string,
    id: string,
    values: { [key: string]: any },
    sender: ValueUpdateSender,
    removeNotProvided: boolean
  ) {
    const script = await this.scriptDAO.get(uuid);
    if (!script) {
      throw new Error("script not found");
    }
    const storageName = getStorageName(script);
    let oldValueRecord: { [key: string]: any } = {};
    const cacheKey = `${CACHE_KEY_SET_VALUE}${storageName}`;
    const entries = [] as [string, any, any][];
    const _flag = await stackAsyncTask<boolean>(cacheKey, async () => {
      let valueModel: Value | undefined = await this.valueDAO.get(storageName);
      if (!valueModel) {
        const now = Date.now();
        valueModel = {
          uuid: script.uuid,
          storageName: storageName,
          data: values,
          createtime: now,
          updatetime: now,
        };
      } else {
        let changed = false;
        let dataModel = (oldValueRecord = valueModel.data);
        dataModel = { ...dataModel }; // 每次储存使用新参考
        for (const [key, value] of Object.entries(values)) {
          const oldValue = dataModel[key];
          if (oldValue === value) continue;
          changed = true;
          if (values[key] === undefined) {
            delete dataModel[key];
          } else {
            dataModel[key] = value;
          }
          entries.push([key, value, oldValue]);
        }
        if (removeNotProvided) {
          // 处理oldValue有但是没有在data.values中的情况
          for (const key of Object.keys(oldValueRecord)) {
            if (!(key in values)) {
              changed = true;
              const oldValue = oldValueRecord[key];
              delete dataModel[key]; // 这里使用delete是因为保存不需要这个字段了
              values[key] = undefined; // 而这里使用undefined是为了在推送时能够正确处理
              entries.push([key, undefined, oldValue]);
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
      entries: encodeMessage(entries),
      uuid,
      storageName,
      sender,
      valueUpdated,
    } as ValueUpdateDataEncoded);
    // valueUpdate 消息用于 early script 的处理
    this.mq.emit<TScriptValueUpdate>("valueUpdate", { script, valueUpdated });
  }

  setScriptValue({ uuid, key, value }: { uuid: string; key: string; value: any }, _sender: IGetSender) {
    const valueSender = {
      runFlag: "user",
      tabId: -2,
    };
    return this.setValue(uuid, "", key, value, valueSender);
  }

  setScriptValues({ uuid, values }: { uuid: string; values: { [key: string]: any } }, _sender: IGetSender) {
    const valueSender = {
      runFlag: "user",
      tabId: -2,
    };
    return this.setValues(uuid, "", values, valueSender, true);
  }

  init(runtime: RuntimeService, popup: PopupService) {
    this.popup = popup;
    this.runtime = runtime;
    this.group.on("getScriptValue", this.getScriptValue.bind(this));
    this.group.on("setScriptValue", this.setScriptValue.bind(this));
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
