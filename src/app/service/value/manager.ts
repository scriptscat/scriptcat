import MessageCenter from "@App/app/message/center";
import { MessageSender } from "@App/app/message/message";
import { Script } from "@App/app/repo/scripts";
import { Value, ValueDAO } from "@App/app/repo/value";
import { ValueUpdateData } from "@App/runtime/content/exec_script";
import CacheKey from "@App/utils/cache_key";
import Cache from "../../cache";
import Manager from "../manager";
import ScriptManager from "../script/manager";

// value管理器,负责value等更新获取等操作
export class ValueManager extends Manager {
  static instance: ValueManager;

  static getInstance() {
    return ValueManager.instance;
  }

  valueDAO: ValueDAO;

  constructor(center: MessageCenter) {
    super(center);
    if (!ValueManager.instance) {
      ValueManager.instance = this;
    }
    this.valueDAO = new ValueDAO();

    ScriptManager.hook.addHook("delete", () => {
      // 清理缓存
    });
  }

  // 第一次获取后在内存中维护,利用类似指针的特性,实现更新
  public async getScriptValues(
    script: Script
  ): Promise<{ [key: string]: Value }> {
    return Cache.getInstance().getOrSet(
      CacheKey.scriptValue(script.id, script.metadata.storagename),
      () => {
        return this.getValues(script);
      }
    );
  }

  public async getValues(script: Script): Promise<{ [key: string]: Value }> {
    const where: { [key: string]: any } = {};
    if (script.metadata.storagename) {
      [where.storageName] = script.metadata.storagename;
    } else {
      where.scriptId = script.id;
    }
    const list = <Value[]>await this.valueDAO.list(where);
    const ret: { [key: string]: Value } = {};
    list.forEach((val) => {
      ret[val.key] = val;
    });
    return Promise.resolve(ret);
  }

  public async setValue(
    script: Script,
    key: string,
    value: any,
    sender: MessageSender & { runFlag?: string }
  ): Promise<boolean> {
    // 更新数据库中的value
    let model: Value | undefined;
    let oldValue: any;
    if (script.metadata.storagename) {
      model = await this.valueDAO.findOne({
        storageName: script.metadata.storagename[0],
        key,
      });
    } else {
      model = await this.valueDAO.findOne({ scriptId: script?.id, key });
    }
    if (!model) {
      model = {
        id: 0,
        scriptId: script?.id || 0,
        storageName:
          (script?.metadata.storagename && script?.metadata.storagename[0]) ||
          "",
        key,
        value,
        createtime: new Date().getTime(),
      };
    } else {
      oldValue = model.value;
      model.value = value;
    }
    let changeNum = 0;
    // 更新缓存
    const cache = Cache.getInstance().get(
      CacheKey.scriptValue(script.id, script.metadata.storagename)
    );

    if (value === undefined || value === null) {
      model.value = undefined;
      changeNum = await this.valueDAO.delete(model.id);
      if (cache) {
        delete cache[key];
      }
    } else {
      changeNum = await this.valueDAO.save(model);
      if (cache) {
        cache[key] = model;
      }
    }
    if (changeNum <= 0) {
      return Promise.reject(new Error("value no change"));
    }

    const sendData: ValueUpdateData = {
      oldValue,
      sender,
      value: model,
    };
    // 广播value更新
    MessageCenter.getInstance().send("all", "valueUpdate", sendData);

    return Promise.resolve(true);
  }
}

export default ValueManager;
