import LoggerCore from "@App/app/logger/core";
import type Logger from "@App/app/logger/logger";
import { type Script, type SCRIPT_STATUS, ScriptDAO } from "@App/app/repo/scripts";
import { type Value, ValueDAO } from "@App/app/repo/value";
import type { IGetSender, Group } from "@Packages/message/server";
import { type RuntimeService } from "./runtime";
import { type PopupService } from "./popup";
import { getStorageName } from "@App/pkg/utils/utils";
import type { ValueUpdateDataEncoded, ValueUpdateSendData, ValueUpdateSender } from "../content/types";
import type { TScriptValueUpdate } from "../queue";
import { type TDeleteScript } from "../queue";
import { type IMessageQueue } from "@Packages/message/message_queue";
import { CACHE_KEY_SET_VALUE } from "@App/app/cache_key";
import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import { encodeMessage } from "@App/pkg/utils/message_value";
import { isEarlyStartScript } from "../content/utils";

type ValueUpdateTaskInfo = {
  uuid: string;
  id: string;
  values: {
    [key: string]: any;
  };
  sender: ValueUpdateSender;
  removeNotProvided: boolean;
  status: SCRIPT_STATUS;
  isEarlyStart: boolean;
};
const valueUpdateTasks = new Map<string, ValueUpdateTaskInfo[]>();

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

  async waitForFreshValueState(uuid: string, _sender: ValueUpdateSender): Promise<number> {
    // 查询出脚本
    const script = await this.scriptDAO.get(uuid);
    if (!script) {
      throw new Error("script not found");
    }
    // 查询老的值
    const storageName = getStorageName(script);
    // 使用事务来保证数据一致性
    const cacheKey = `${CACHE_KEY_SET_VALUE}${storageName}`;
    const ret = await stackAsyncTask<number | undefined>(cacheKey, async () => {
      const valueModel: Value | undefined = await this.valueDAO.get(storageName);
      // await this.valueDAO.save(storageName, valueModel);
      return valueModel?.updatetime;
    });
    return ret || 0;
  }

  // 推送值到tab
  async pushValueToTab<T extends Record<string, ValueUpdateDataEncoded[]>>(storageName: string, data: T) {
    const sendData: ValueUpdateSendData = { storageName, data };
    /*
    --- data structure ---
    {
      storageName: XXXX
      {
        uuid1: data1
        uuid2: data2
        ...
      }
    }
    */
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

  async setValuesByStorageName(storageName: string) {
    const cacheKey = `${CACHE_KEY_SET_VALUE}${storageName}`;
    const taskListRef = valueUpdateTasks.get(cacheKey);
    if (!taskListRef?.length) return;
    const taskList = taskListRef.slice(0);
    taskListRef.length = 0;
    // ------ 读取 & 更新 ------
    let updatetime = 0;
    const listRetToTab: Record<string, ValueUpdateDataEncoded[]> = {};
    let valueModel: Value | undefined = await this.valueDAO.get(storageName);
    let valueModelUpdated = false;
    let hasValueUpdated = false;
    for (const task of taskList) {
      const entries = [] as [string, any, any][];
      const { uuid, values, removeNotProvided } = task;
      let oldValueRecord: { [key: string]: any } = {};
      const now = Date.now();
      let newData;
      if (!valueModel) {
        const dataModel: { [key: string]: any } = {};
        for (const [key, value] of Object.entries(values)) {
          if (value !== undefined) {
            dataModel[key] = value;
            entries.push([key, value, undefined]);
          }
        }
        // 即使是空 dataModel 也进行更新
        // 由于没entries, valueUpdated 是 false, 但 valueDAO 会有一个空的 valueModel 记录 updatetime
        valueModel = {
          uuid: uuid,
          storageName: storageName,
          data: dataModel,
          createtime: now,
          updatetime: now,
        };
        newData = dataModel;
      } else {
        let changed = false;
        oldValueRecord = valueModel.data;
        const dataModel = { ...oldValueRecord }; // 每次储存使用新参考
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
        if (changed) {
          newData = dataModel;
        }
      }
      if (newData) {
        valueModel.updatetime = now;
        valueModel.data = newData; // 每次储存使用新参考
        valueModelUpdated = true;
      }
      updatetime = valueModel.updatetime;

      {
        const { uuid, id, sender } = task;
        let list = listRetToTab[uuid];
        if (!list) {
          listRetToTab[uuid] = list = [];
        }
        const valueUpdated = entries.length > 0;
        if (valueUpdated) hasValueUpdated = true;
        list.push({
          id,
          entries: encodeMessage(entries),
          uuid,
          storageName,
          sender,
          valueUpdated,
          updatetime,
        } as ValueUpdateDataEncoded);
      }
    }
    if (valueModelUpdated) {
      await this.valueDAO.save(storageName, valueModel!);
    }
    // ------ 推送 ------
    // 推送到所有加载了本脚本的tab中
    this.pushValueToTab(storageName, listRetToTab);
    // 针对各脚本，只需要发送一次最后的结果
    const valueUpdateEmits = new Map<string, { status: SCRIPT_STATUS; isEarlyStart: boolean }>();
    for (const task of taskList) {
      const { uuid, status, isEarlyStart } = task;
      valueUpdateEmits.set(uuid, { status, isEarlyStart });
    }
    for (const [uuid, { status, isEarlyStart }] of valueUpdateEmits.entries()) {
      // valueUpdate 消息用于 early script 的处理
      // 由于经过 await, 此处的 status 和 isEarlyStart 只供参考，应在接收端检查最新设置值
      this.mq.emit<TScriptValueUpdate>("valueUpdate", {
        uuid,
        valueUpdated: hasValueUpdated,
        status,
        isEarlyStart,
      });
    }
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
    const cacheKey = `${CACHE_KEY_SET_VALUE}${storageName}`;
    let taskList = valueUpdateTasks.get(cacheKey);
    if (!taskList) {
      valueUpdateTasks.set(cacheKey, (taskList = []));
    }
    taskList.push({
      uuid,
      id,
      values,
      sender,
      removeNotProvided,
      status: script.status,
      isEarlyStart: isEarlyStartScript(script.metadata),
    });

    await stackAsyncTask<void>(cacheKey, () => this.setValuesByStorageName(storageName));
  }

  setScriptValue({ uuid, key, value }: { uuid: string; key: string; value: any }, _sender: IGetSender) {
    const valueSender = {
      runFlag: "user",
      tabId: -2,
    };
    return this.setValues(uuid, "", { [key]: value }, valueSender, false);
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
