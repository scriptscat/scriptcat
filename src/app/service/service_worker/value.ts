import LoggerCore from "@App/app/logger/core";
import type Logger from "@App/app/logger/logger";
import { type Script, ScriptDAO, type ValueStore } from "@App/app/repo/scripts";
import { type Value, ValueDAO } from "@App/app/repo/value";
import { TrashScriptDAO } from "@App/app/repo/trash_script";
import type { IGetSender, Group } from "@Packages/message/server";
import { type RuntimeService } from "./runtime";
import { type PopupService } from "./popup";
import { aNow, getStorageName } from "@App/pkg/utils/utils";
import type {
  ValueUpdateDataEncoded,
  ValueUpdateDataREntry,
  ValueUpdateSendData,
  ValueUpdateSender,
} from "../content/types";
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

type ValueUpdateTask = {
  script: Script;
  id: string;
  keyValuePairs: TKeyValuePair[];
  valueSender: ValueUpdateSender;
  isReplace: boolean;
  ts: number;
};

export class ValueService {
  logger: Logger;
  scriptDAO: ScriptDAO = new ScriptDAO();
  valueDAO: ValueDAO = new ValueDAO();
  trashScriptDAO: TrashScriptDAO = new TrashScriptDAO();
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

  async pushValueUpdate(updatedScripts: Script[], sendData: ValueUpdateSendData) {
    return this.runtime!.pushValueUpdate(updatedScripts, sendData);
  }

  // 排队中的 setValues 任务，以 storageName 分组，由 setValuesByStorageName 集中处理
  private valueUpdateTasks = new Map<string, ValueUpdateTask[]>();

  // 集中处理同一 storageName 下累积的 setValues 任务：一次读取、按序应用、一次保存、一次推送
  async setValuesByStorageName(storageName: string) {
    const taskList = this.valueUpdateTasks.get(storageName);
    if (!taskList?.length) return;
    // 同步取走整批任务；之后入队的任务会建立新列表，由其对应的队列调用处理
    this.valueUpdateTasks.delete(storageName);
    let valueModel: Value | undefined = await this.valueDAO.get(storageName);
    const storageChanges: Record<string, ValueUpdateDataEncoded[]> = {};
    // 有实际值变更的脚本（uuid 去重），供 early-start 脚本重新注册使用
    const updatedScripts = new Map<string, Script>();
    let valueModelUpdated = false;
    for (const task of taskList) {
      const { script, id, keyValuePairs, valueSender, isReplace, ts } = task;
      const uuid = script.uuid;
      const entries = [] as ValueUpdateDataREntry[];
      const now = aNow(); // 保证 updatetime 严格递增
      let changed = false;
      let isNewModel = false;
      let oldValueRecord: ValueStore = {};
      let dataModel: ValueStore;
      if (!valueModel) {
        isNewModel = true;
        // 即使无实际变更也保存空 dataModel，让 valueDAO 记录 updatetime
        changed = true;
        dataModel = {};
        valueModel = {
          uuid: uuid,
          storageName: storageName,
          data: dataModel,
          createtime: ts ? Math.min(ts, now) : now,
          updatetime: ts ? Math.min(ts, now) : now,
        };
      } else {
        oldValueRecord = valueModel.data;
        dataModel = { ...oldValueRecord }; // 每次储存使用新参考
      }
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
      if (changed) {
        valueModel.data = dataModel; // 每次储存使用新参考
        if (!isNewModel) {
          valueModel.updatetime = now;
        }
        valueModelUpdated = true;
      }
      if (entries.length > 0 && !updatedScripts.has(uuid)) {
        updatedScripts.set(uuid, script);
      }
      const list = storageChanges[uuid] || (storageChanges[uuid] = []);
      list.push({
        id,
        valueChanges: entries,
        uuid,
        storageName,
        sender: valueSender,
      });
    }
    if (valueModelUpdated) {
      await this.valueDAO.save(storageName, valueModel!);
    }
    // 推送到所有加载了本脚本的tab中；即使无实际变更也要推送，客户端依赖 id 回执解除等待
    this.pushValueUpdate([...updatedScripts.values()], { storageName, storageChanges });
  }

  // 批量设置
  async setValues(params: TSetValuesParams): Promise<void> {
    const { uuid, keyValuePairs, isReplace } = params;
    const id = params.id || "";
    const ts = params.ts || 0;
    const valueSender = params.valueSender || {
      runFlag: "user",
      tabId: -2,
    };
    let storageName!: string;
    // 顺序队列：入队顺序与 setValues 调用顺序一致，
    // 不因 scriptDAO.get 的异步耗时差异而打乱
    await stackAsyncTask<void>("valueChangeOnSequence", async () => {
      // 查询出脚本
      const script = await this.scriptDAO.get(uuid);
      if (!script) {
        throw new Error("script not found");
      }
      storageName = getStorageName(script);
      let taskList = this.valueUpdateTasks.get(storageName);
      if (!taskList) {
        this.valueUpdateTasks.set(storageName, (taskList = []));
      }
      taskList.push({ script, id, keyValuePairs, valueSender, isReplace, ts });
    });
    // valueDAO 读写以 storageName 为单位串行
    await stackAsyncTask<void>(`${CACHE_KEY_SET_VALUE}${storageName}`, () => this.setValuesByStorageName(storageName));
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
        // 判断还有没有其他同名storageName —— 必须同时查回收站,
        // 否则共用 @storagename 的脚本还在回收站等还原时,其 value 会被误删
        const matcher = (_: string, script: Script) => getStorageName(script) === storageName;
        const [alive, trashed] = await Promise.all([this.scriptDAO.find(matcher), this.trashScriptDAO.find(matcher)]);
        if (alive.length === 0 && trashed.length === 0) {
          this.valueDAO.delete(storageName).then(() => {
            this.logger.trace("delete value", { storageName });
          });
        }
      }
    });
  }
}
