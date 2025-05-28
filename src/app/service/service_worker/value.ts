import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { Script, SCRIPT_TYPE_NORMAL, ScriptDAO } from "@App/app/repo/scripts";
import { ValueDAO } from "@App/app/repo/value";
import { GetSender, Group, MessageSend } from "@Packages/message/server";
import { RuntimeService } from "./runtime";
import { PopupService } from "./popup";
import { sendMessage } from "@Packages/message/client";
import Cache from "@App/app/cache";
import { getStorageName } from "@App/pkg/utils/utils";
import { ValueUpdateData, ValueUpdateSender } from "../content/exec_script";
import { subscribeScriptDelete } from "../queue";
import { MessageQueue } from "@Packages/message/message_queue";

export class ValueService {
  logger: Logger;
  scriptDAO: ScriptDAO = new ScriptDAO();
  valueDAO: ValueDAO = new ValueDAO();
  private popup: PopupService | undefined;
  private runtime: RuntimeService | undefined;

  constructor(
    private group: Group,
    private send: MessageSend,
    private mq: MessageQueue
  ) {
    this.logger = LoggerCore.logger().with({ service: "value" });
    this.valueDAO.enableCache();
  }

  async getScriptValue(script: Script) {
    const ret = await this.valueDAO.get(getStorageName(script));
    if (!ret) {
      return {};
    }
    return ret.data;
  }

  async setValue(uuid: string, key: string, value: any, sender: ValueUpdateSender) {
    // 查询出脚本
    const script = await this.scriptDAO.get(uuid);
    if (!script) {
      return Promise.reject(new Error("script not found"));
    }
    // 查询老的值
    const storageName = getStorageName(script);
    let oldValue;
    // 使用事务来保证数据一致性
    const flag = await Cache.getInstance().tx("setValue:" + storageName, async () => {
      const valueModel = await this.valueDAO.get(storageName);
      if (!valueModel) {
        await this.valueDAO.save(storageName, {
          uuid: script.uuid,
          storageName: storageName,
          data: { [key]: value },
          createtime: Date.now(),
          updatetime: Date.now(),
        });
      } else {
        // 值没有发生变化, 不进行操作
        if (valueModel.data[key] === value) {
          return false;
        }
        oldValue = valueModel.data[key];
        if (value === undefined) {
          delete valueModel.data[key];
        } else {
          valueModel.data[key] = value;
        }
        await this.valueDAO.save(storageName, valueModel);
      }
      return true;
    });
    if (flag) {
      this.pushValueToTab(oldValue, key, value, uuid, storageName, sender);
    }
  }

  // 推送值到tab
  async pushValueToTab(
    oldValue: any,
    key: string,
    value: any,
    uuid: string,
    storageName: string,
    sender: ValueUpdateSender
  ) {
    const sendData: ValueUpdateData = {
      oldValue,
      sender,
      value,
      key,
      uuid,
      storageName: storageName,
    };

    chrome.tabs.query({}, (tabs) => {
      // 推送到所有加载了本脚本的tab中
      tabs.forEach(async (tab) => {
        const scriptMenu = await this.popup!.getScriptMenu(tab.id!);
        if (scriptMenu.find((item) => item.storageName === storageName)) {
          this.runtime!.sendMessageToTab(
            {
              tabId: tab.id!,
            },
            "valueUpdate",
            sendData
          );
        }
      });
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
  async setValues(data: { uuid: string; values: { [key: string]: any } }, sender: ValueUpdateSender) {
    const script = await this.scriptDAO.get(data.uuid);
    if (!script) {
      return Promise.reject(new Error("script not found"));
    }
    const storageName = getStorageName(script);
    let oldValue: { [key: string]: any } = {};
    await Cache.getInstance().tx("setValue:" + storageName, async () => {
      const valueModel = await this.valueDAO.get(storageName);
      if (!valueModel) {
        await this.valueDAO.save(storageName, {
          uuid: script.uuid,
          storageName: storageName,
          data: data.values,
          createtime: Date.now(),
          updatetime: Date.now(),
        });
      } else {
        oldValue = valueModel.data;
        for (const key in data.values) {
          if (data.values[key] === undefined) {
            delete valueModel.data[key];
          } else {
            valueModel.data[key] = data.values[key];
          }
        }
        await this.valueDAO.save(storageName, valueModel);
      }
      return true;
    });
    // 推送到所有加载了本脚本的tab中
    Object.keys(data.values).forEach((key) => {
      this.pushValueToTab(oldValue[key], key, data.values[key], data.uuid, storageName, sender);
    });
  }

  setScriptValue(data: { uuid: string; key: string; value: any }, sender: GetSender) {
    return this.setValue(data.uuid, data.key, data.value, {
      runFlag: "user",
      tabId: -2,
    });
  }

  setScriptValues(data: { uuid: string; values: { [key: string]: any } }, sender: GetSender) {
    return this.setValues(data, {
      runFlag: "user",
      tabId: -2,
    });
  }

  init(runtime: RuntimeService, popup: PopupService) {
    this.popup = popup;
    this.runtime = runtime;
    this.group.on("getScriptValue", this.getScriptValue.bind(this));
    this.group.on("setScriptValue", this.setScriptValue.bind(this));
    this.group.on("setScriptValues", this.setScriptValues.bind(this));

    subscribeScriptDelete(this.mq, async (data) => {
      const storageName = getStorageName(data.script);
      // 判断还有没有其他同名storageName
      const list = await this.scriptDAO.find((_, script) => {
        return getStorageName(script) === storageName;
      });
      if (list.length === 0) {
        this.valueDAO.delete(storageName).then(() => {
          this.logger.trace("delete value", { storageName });
        });
      }
    });
  }
}
