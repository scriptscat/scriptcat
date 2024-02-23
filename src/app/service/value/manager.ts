import IoC from "@App/app/ioc";
import {
  IMessageBroadcast,
  MessageBroadcast,
  MessageHander,
  MessageSender,
} from "@App/app/message/message";
import { Script, ScriptDAO } from "@App/app/repo/scripts";
import { Value, ValueDAO } from "@App/app/repo/value";
import { ValueUpdateData } from "@App/runtime/content/exec_script";
import CacheKey from "@App/pkg/utils/cache_key";
import { isEqual } from "lodash";
import { db } from "@App/app/repo/dao";
import Cache from "../../cache";
import Manager from "../manager";
import ScriptManager from "../script/manager";
import Hook from "../hook";

export type ValueEvent = "upsert";

// value管理器,负责value等更新获取等操作
@IoC.Singleton(MessageHander, MessageBroadcast)
export class ValueManager extends Manager {
  valueDAO: ValueDAO;

  scriptDAO: ScriptDAO;

  broadcast: IMessageBroadcast;

  static hook: Hook = new Hook<"upsert">();

  constructor(message: MessageHander, broadcast: IMessageBroadcast) {
    super(message, "value");

    this.broadcast = broadcast;
    this.scriptDAO = new ScriptDAO();
    this.valueDAO = new ValueDAO();
  }

  start() {
    // 监听消息
    this.listenEvent(
      "upsert",
      async (data: { scriptId: number; key: string; value: any }, sender) => {
        const { scriptId, key, value } = data;
        const script = await this.scriptDAO.findById(scriptId);
        if (!script) {
          return Promise.reject(new Error("script not found"));
        }
        return this.setValue(script, key, value, sender);
      }
    );

    this.message.setHandlerWithChannel(
      "watchValue",
      async (channel, _action, script: Script) => {
        const hook = (value: Value) => {
          // 判断是否是当前脚本关注的value
          if (script.metadata.storagename) {
            if (value.storageName !== script.metadata.storagename[0]) {
              return;
            }
          } else if (value.scriptId !== script.id) {
            return;
          }
          channel.send(value);
        };
        ValueManager.hook.addListener("upsert", hook);
        channel.setDisChannelHandler(() => {
          ValueManager.hook.removeListener("upsert", hook);
        });
      }
    );

    ScriptManager.hook.addListener("delete", () => {
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
    const valueTable = db.table("value");
    return db.transaction("rw", valueTable, async (tr) => {
      const valueDAO = new ValueDAO(tr.table("value"));
      if (script.metadata.storagename) {
        model = await valueDAO.findOne({
          storageName: script.metadata.storagename[0],
          key,
        });
      } else {
        model = await valueDAO.findOne({ scriptId: script.id, key });
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
          updatetime: 0,
        };
      } else {
        // 值未发生改变
        if (isEqual(model.value, value)) {
          return Promise.resolve(true);
        }
        oldValue = model.value;
        model.value = value;
        model.updatetime = new Date().getTime();
      }
      let changeNum = 0;
      // 更新缓存
      const cache = Cache.getInstance().get(
        CacheKey.scriptValue(script.id, script.metadata.storagename)
      );

      if (value === undefined || value === null) {
        model.value = undefined;
        changeNum = await valueDAO.delete(model.id);
        if (cache) {
          delete cache[key];
        }
      } else {
        changeNum = await valueDAO.save(model);
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
      this.broadcast.broadcast({ tag: "all" }, "valueUpdate", sendData);

      // 触发hook
      ValueManager.hook.trigger("upsert", model);
      return Promise.resolve(true);
    });
  }
}

export default ValueManager;
