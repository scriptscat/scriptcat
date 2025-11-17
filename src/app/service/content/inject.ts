import { type Server } from "@Packages/message/server";
import type { Message } from "@Packages/message/types";
import { ExternalWhitelist } from "@App/app/const";
import { sendMessage } from "@Packages/message/client";
import type { ScriptExecutor } from "./script_executor";
import type { TScriptInfo } from "@App/app/repo/scripts";
import type { EmitEventRequest } from "../service_worker/types";
import type { GMInfoEnv, ValueUpdateDataEncoded } from "./types";

export class InjectRuntime {
  constructor(
    private readonly server: Server,
    private readonly msg: Message,
    private readonly scriptExecutor: ScriptExecutor
  ) {}

  init() {
    this.server.on("runtime/emitEvent", (data: EmitEventRequest) => {
      // 转发给脚本
      this.scriptExecutor.emitEvent(data);
    });
    this.server.on("runtime/valueUpdate", (data: ValueUpdateDataEncoded) => {
      this.scriptExecutor.valueUpdate(data);
    });
  }

  setEnvInfo(envInfo: GMInfoEnv) {
    this.scriptExecutor.setEnvInfo(envInfo);
  }

  startScripts(injectScriptList: TScriptInfo[]) {
    this.scriptExecutor.startScripts(injectScriptList);
  }

  onInjectPageLoaded() {
    // 注入允许外部调用
    this.externalMessage();
  }

  externalMessage() {
    // 对外接口白名单
    const hostname = window.location.hostname;
    if (
      ExternalWhitelist.some(
        // 如果当前页面的 hostname 是白名单的网域或其子网域
        (t) => hostname.endsWith(t) && (hostname.length === t.length || hostname.endsWith(`.${t}`))
      )
    ) {
      const msg = this.msg;
      // 注入
      const external: External = window.external || (window.external = {} as External);
      const scriptExpose: App.ExternalScriptCat = {
        isInstalled(name: string, namespace: string, callback: (res: App.IsInstalledResponse | undefined) => unknown) {
          sendMessage<App.IsInstalledResponse>(msg, "content/script/isInstalled", {
            name,
            namespace,
          }).then(callback);
        },
      };
      try {
        external.Scriptcat = scriptExpose;
      } catch {
        // 无法注入到 external，忽略
      }
      const exposedTM = external.Tampermonkey;
      const isInstalledTM = exposedTM?.isInstalled;
      const isInstalledSC = scriptExpose.isInstalled;
      if (isInstalledTM && exposedTM?.getVersion && exposedTM.openOptions) {
        // 当TM和SC同时启动的特殊处理：如TM没有安装，则查SC的安装状态
        try {
          exposedTM.isInstalled = (
            name: string,
            namespace: string,
            callback: (res: App.IsInstalledResponse | undefined) => unknown
          ) => {
            isInstalledTM(name, namespace, (res) => {
              if (res?.installed) callback(res);
              else
                isInstalledSC(name, namespace, (res) => {
                  callback(res);
                });
            });
          };
        } catch {
          // 忽略错误
        }
      } else {
        try {
          external.Tampermonkey = scriptExpose;
        } catch {
          // 无法注入到 external，忽略
        }
      }
    }
  }
}
