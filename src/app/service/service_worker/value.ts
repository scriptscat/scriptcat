import LoggerCore from "@App/app/logger/core";
import type Logger from "@App/app/logger/logger";
import { type Script, ScriptDAO, type ValueStore } from "@App/app/repo/scripts";
import { type Value, ValueDAO } from "@App/app/repo/value";
import { TrashScriptDAO } from "@App/app/repo/trash_script";
import type { IGetSender, Group } from "@Packages/message/server";
import { type RuntimeService } from "./runtime";
import { type PopupService } from "./popup";
import { aNow, getStorageName } from "@App/pkg/utils/utils";
import type { ValueUpdateDataEncoded, ValueUpdateDataREntry, ValueUpdateSender } from "../content/types";
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

  async pushValueUpdate<T extends ValueUpdateDataEncoded>(script: Script, sendData: T) {
    return this.runtime!.pushValueUpdate(script, sendData);
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
    let oldValueRecord: ValueStore = {};
    const cacheKey = `${CACHE_KEY_SET_VALUE}${storageName}`;
    const entries = [] as ValueUpdateDataREntry[];
    let updatetime = 0;
    const _flag = await stackAsyncTask<boolean>(cacheKey, async () => {
      let valueModel: Value | undefined = await this.valueDAO.get(storageName);
      if (!valueModel) {
        const now = aNow();
        const dataModel: ValueStore = {};
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
        if (!changed) {
          updatetime = valueModel.updatetime;
          return false;
        }
        valueModel.data = dataModel; // 每次储存使用新参考
        valueModel.updatetime = aNow(); // 保证严格递增，供读取端判断新鲜度
      }
      updatetime = valueModel.updatetime;
      await this.valueDAO.save(storageName, valueModel);
      return true;
    });
    // 推送到所有加载了本脚本的tab中
    const valueUpdated = entries.length > 0;
    const sendData = {
      id,
      entries: entries,
      uuid,
      storageName,
      sender: valueSender,
      valueUpdated,
      updatetime,
    } as ValueUpdateDataEncoded;
    this.pushValueUpdate(script, sendData);
  }

  /**
   * 供异步 GM.getValue/getValues/listValues 读取前同步用。
   * id 非空时先执行一次空 setValues：借同一条 valueUpdate 推送通道把当前
   * updatetime（连同 id）送达调用方页面，确保其本地缓存至少同步到该时点。
   * 返回 valueDAO 中该 storageName 当前的 updatetime。
   */
  async waitForFreshValueState(uuid: string, id: string, valueSender: ValueUpdateSender): Promise<number> {
    if (id) {
      await this.setValues({ uuid, id, keyValuePairs: [], valueSender, isReplace: false });
    }
    const script = await this.scriptDAO.get(uuid);
    if (!script) {
      throw new Error("script not found");
    }
    const storageName = getStorageName(script);
    const cacheKey = `${CACHE_KEY_SET_VALUE}${storageName}`;
    // 经同一队列读取，避免读到写入中途的状态
    const ret = await stackAsyncTask<number | undefined>(cacheKey, async () => {
      const valueModel: Value | undefined = await this.valueDAO.get(storageName);
      return valueModel?.updatetime;
    });
    return ret || 0;
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
