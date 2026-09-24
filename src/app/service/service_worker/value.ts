import LoggerCore from "@App/app/logger/core";
import type Logger from "@App/app/logger/logger";
import { type Script, ScriptDAO, type ValueStore } from "@App/app/repo/scripts";
import { type Value, ValueDAO } from "@App/app/repo/value";
import { TrashScriptDAO } from "@App/app/repo/trash_script";
import type { IGetSender, Group } from "@Packages/message/server";
import { type RuntimeService } from "./runtime";
import { type PopupService } from "./popup";
import { getStorageName } from "@App/pkg/utils/utils";
import type { ValueUpdateDataEncoded, ValueUpdateDataREntry, ValueUpdateSender } from "../content/types";
import { type TDeleteScript } from "../queue";
import { type IMessageQueue } from "@Packages/message/message_queue";
import { CACHE_KEY_SET_VALUE } from "@App/app/cache_key";
import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import type { TKeyValuePair } from "@App/pkg/utils/message_value";
import { decodeRValue, R_UNDEFINED, encodeRValue } from "@App/pkg/utils/message_value";

const setOwnValue = (store: Record<string, any>, key: string, value: any): void => {
  Object.defineProperty(store, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
};

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

  materializeScriptValue(script: Script, rawValueStore: ValueStore = {}): Record<string, any> {
    // data/newValues 是同一个 Object.create(null) 建出的纯字典，没有可被继承 setter 或
    // __proto__ 劫持的原型，逐键直接赋值即可，不需要 setOwnValue 的 defineProperty。
    const data: { [key: string]: any } = Object.create(null);
    for (const key of Object.keys(rawValueStore)) {
      data[key] = rawValueStore[key];
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

  async getScriptValueDetails(script: Script) {
    const ret = await this.valueDAO.get(getStorageName(script));
    return [this.materializeScriptValue(script, ret?.data), ret] as const;
  }

  getScriptValue(script: Script): Promise<Record<string, any>> {
    return this.getScriptValueDetails(script).then((res) => res[0]);
  }

  async pushValueUpdate<T extends ValueUpdateDataEncoded>(
    script: Script,
    sendData: T,
    committedValueStore?: ValueStore
  ) {
    return this.runtime!.pushValueUpdate(script, sendData, committedValueStore);
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
    const cacheKey = `${CACHE_KEY_SET_VALUE}${storageName}`;
    // DB commit、runtime value delivery 与 early-start registered snapshot refresh 必须在
    // 同一条 storageName 队列中完成。否则 W2 可以在 W1 尚未更新 userScripts registration
    // 时先提交 DB，随后 W1 的较旧 snapshot 又最后写入 registration，造成 generation 倒退。
    await stackAsyncTask<void>(cacheKey, async () => {
      const entries = [] as ValueUpdateDataREntry[];
      let oldValueRecord: ValueStore = {};
      let valueModel: Value | undefined = await this.valueDAO.get(storageName);
      let changed = false;
      if (!valueModel) {
        const now = Date.now();
        const dataModel: ValueStore = {};
        for (const [key, rTyped1] of keyValuePairs) {
          const value = decodeRValue(rTyped1);
          if (value !== undefined) {
            setOwnValue(dataModel, key, value);
            entries.push([key, rTyped1, R_UNDEFINED]);
          }
        }
        // 即使是空 dataModel 也进行更新。
        // entries 为空时 valueUpdated=false，但仍保留 mutation delivery 以维持现有 cache/listener 语义。
        valueModel = {
          uuid: uuid,
          storageName: storageName,
          data: dataModel,
          createtime: ts ? Math.min(ts, now) : now,
          updatetime: ts ? Math.min(ts, now) : now,
        };
        changed = true;
      } else {
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
            setOwnValue(dataModel, key, value);
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
        if (changed) valueModel.data = dataModel; // 每次储存使用新参考
      }

      if (changed) {
        await this.valueDAO.save(storageName, valueModel);
      }

      // 推送到所有加载了本 storage 的 context，并等待 Runtime 完成 early-start snapshot refresh。
      // Promise-based GM.setValue 由这次 SW RPC 的返回值完成，因此 registration refresh 仍是
      // completion barrier；legacy 同步 GM_setValue 继续立即返回，后台写入仍走同一序列化链。
      const sendData = {
        id,
        entries,
        uuid,
        storageName,
        sender: valueSender,
        valueUpdated: entries.length > 0,
      } as ValueUpdateDataEncoded;
      if (this.runtime) {
        await this.pushValueUpdate(script, sendData, valueModel.data);
      } else {
        // Unit-level/custom callers that replace pushValueUpdate before init keep the old call shape.
        await this.pushValueUpdate(script, sendData);
      }
    });
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
