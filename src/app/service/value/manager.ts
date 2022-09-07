import MessageCenter from "@App/app/message/center";
import { Script } from "@App/app/repo/scripts";
import { Value, ValueDAO } from "@App/app/repo/value";
import { keyScriptValue } from "@App/utils/cache_key";
import Cache from "../../cache";
import Manager from "../manager";

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
  }

  // 第一次获取后在内存中维护
  public async getScriptValues(
    script: Script
  ): Promise<{ [key: string]: Value }> {
    return Cache.getInstance().getOrSet(
      keyScriptValue(script.id, script.metadata.storagename),
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
}

export default ValueManager;
