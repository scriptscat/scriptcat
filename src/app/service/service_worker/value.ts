import LoggerCore from "@App/app/logger/core";
import type Logger from "@App/app/logger/logger";
import { type Script, ScriptDAO, type ValueStore } from "@App/app/repo/scripts";
import { type Value, ValueDAO } from "@App/app/repo/value";
import { TrashScriptDAO } from "@App/app/repo/trash_script";
import type { IGetSender, Group } from "@Packages/message/server";
import { type RuntimeService } from "./runtime";
import { getStorageName } from "@App/pkg/utils/utils";
import type {
  ValueSubscription,
  ValueSubscriptionAck,
  ValueUpdateDataEncoded,
  ValueUpdateDataREntry,
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

// 毫秒时间戳 × 1000，并保证比上一次大：记录被删除后重建，新版本号仍大于页面里记着的旧版本
const nextValueRevision = (prev = 0) => Math.max(Date.now() * 1000, prev + 1);

export class ValueService {
  logger: Logger;
  scriptDAO: ScriptDAO = new ScriptDAO();
  valueDAO: ValueDAO = new ValueDAO();
  trashScriptDAO: TrashScriptDAO = new TrashScriptDAO();
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
    // 复制一份再合并：data 是 ValueDAO 缓存里的记录本身，直接改会让默认值混进其他脚本的值并被持久化
    const newValues = { ...data };
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
    let revision = 0;
    await stackAsyncTask<boolean>(cacheKey, async () => {
      let valueModel: Value | undefined = await this.valueDAO.get(storageName);
      if (!valueModel) {
        const now = Date.now();
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
          revision = valueModel.revision ?? 0;
          return false;
        }
        valueModel.data = dataModel; // 每次储存使用新参考
      }
      revision = valueModel.revision = nextValueRevision(valueModel.revision);
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
      revision,
    } as ValueUpdateDataEncoded;
    this.pushValueUpdate(script, sendData);
    // 写入方凭这份响应完成回执；Port 推送可能因 SW 重启、重连而丢失
    return sendData;
  }

  // 与写入共用写锁，并且先登记订阅、再读版本：并发写入要么在登记前保存（已含在快照里），
  // 要么在登记后保存（会推送给刚登记的 Port），不会两边都漏
  subscribeSnapshot(sub: ValueSubscription, register: () => void): Promise<ValueSubscriptionAck> {
    const { storageName } = sub;
    return stackAsyncTask(`${CACHE_KEY_SET_VALUE}${storageName}`, async () => {
      register();
      const record = await this.valueDAO.get(storageName);
      const revision = record?.revision ?? 0;
      if (revision === sub.revision) return { storageName, revision };
      // 按脚本计算：共用 storageName 的脚本，各自的用户配置默认值不同
      const values: Record<string, ValueStore> = {};
      for (const uuid of sub.uuids) {
        const script = await this.scriptDAO.get(uuid);
        if (script && getStorageName(script) === storageName) values[uuid] = await this.getScriptValue(script);
      }
      return { storageName, revision, values };
    });
  }

  setScriptValues(params: Pick<TSetValuesParams, "uuid" | "keyValuePairs" | "isReplace" | "ts">, _sender: IGetSender) {
    return this.setValues(params);
  }

  init(runtime: RuntimeService) {
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
