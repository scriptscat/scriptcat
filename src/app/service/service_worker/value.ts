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

export class ValueService {
  logger: Logger;
  scriptDAO: ScriptDAO = new ScriptDAO();
  valueDAO: ValueDAO = new ValueDAO();
  private popup: PopupService | undefined;
  private runtime: RuntimeService | undefined;

  constructor(
    private group: Group,
    private send: MessageSend
  ) {
    this.logger = LoggerCore.logger().with({ service: "value" });
  }

  async getScriptValue(script: Script) {
    const ret = await this.valueDAO.get(getStorageName(script));
    if (!ret) {
      return {};
    }
    return ret.data;
  }

  async setValue(uuid: string, key: string, value: any, sender: ValueUpdateSender): Promise<boolean> {
    // 查询出脚本
    const script = await this.scriptDAO.get(uuid);
    if (!script) {
      return Promise.reject(new Error("script not found"));
    }
    // 查询老的值
    const storageName = getStorageName(script);
    let oldValue;
    // 使用事务来保证数据一致性
    await Cache.getInstance().tx("setValue:" + storageName, async () => {
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
        oldValue = valueModel.data[key];
        valueModel.data[key] = value;
        await this.valueDAO.save(storageName, valueModel);
      }
      return true;
    });
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

    return Promise.resolve(true);
  }

  setScriptValue(data: { uuid: string; key: string; value: any }, sender: GetSender) {
    return this.setValue(data.uuid, data.key, data.value, {
      runFlag: "user",
      tabId: -2,
    });
  }

  init(runtime: RuntimeService, popup: PopupService) {
    this.popup = popup;
    this.runtime = runtime;
    this.group.on("getScriptValue", this.getScriptValue.bind(this));
    this.group.on("setScriptValue", this.setScriptValue.bind(this));
  }
}
