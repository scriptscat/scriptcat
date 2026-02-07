import { type Server } from "@Packages/message/server";
import type { Message } from "@Packages/message/types";
import { ExternalWhitelist } from "@App/app/const";
import { sendMessage } from "@Packages/message/client";
import { initEnvInfo, type ScriptExecutor } from "./script_executor";
import type { TScriptInfo } from "@App/app/repo/scripts";
import type { EmitEventRequest } from "../service_worker/types";
import type { GMInfoEnv, ValueUpdateDataEncoded } from "./types";
import type { ScriptEnvTag } from "@Packages/message/consts";

export class ScriptRuntime {
  constructor(
    private readonly scripEnvTag: ScriptEnvTag,
    private readonly server: Server,
    private readonly msg: Message,
    private readonly scriptExecutor: ScriptExecutor,
    private readonly messageFlag: string
  ) {}

  init() {
    this.server.on("runtime/emitEvent", (data: EmitEventRequest) => {
      // 转发给脚本
      this.scriptExecutor.emitEvent(data);
    });
    this.server.on("runtime/valueUpdate", (data: ValueUpdateDataEncoded) => {
      this.scriptExecutor.valueUpdate(data);
    });

    this.server.on("pageLoad", (data: { scripts: TScriptInfo[]; envInfo: GMInfoEnv }) => {
      // 监听事件
      this.startScripts(data.scripts, data.envInfo);
    });

    // 检查early-start的脚本
    this.scriptExecutor.checkEarlyStartScript(this.scripEnvTag, initEnvInfo);
  }

  startScripts(scripts: TScriptInfo[], envInfo: GMInfoEnv) {
    this.scriptExecutor.startScripts(scripts, envInfo);
  }

  externalMessage() {
    onInjectPageLoaded(this.msg);
  }
}

// ================================
// 对外接口：external 注入
// ================================

// 判断当前 hostname 是否命中白名单（含子域名）
const isExternalWhitelisted = (hostname: string) => {
  return ExternalWhitelist.some(
    (t) => hostname.endsWith(t) && (hostname.length === t.length || hostname.endsWith(`.${t}`))
  );
};

// 生成暴露给页面的 Scriptcat 外部接口
const createScriptcatExpose = (msg: Message) => {
  const scriptExpose: App.ExternalScriptCat = {
    isInstalled(name: string, namespace: string, callback: (res: App.IsInstalledResponse | undefined) => unknown) {
      sendMessage<App.IsInstalledResponse>(msg, "scripting/script/isInstalled", { name, namespace }).then(callback);
    },
  };
  return scriptExpose;
};

// 尝试写入 external，失败则忽略
const safeSetExternal = <T extends object>(external: any, key: string, value: T) => {
  try {
    external[key] = value;
    return true;
  } catch {
    // 无法注入到 external，忽略
    return false;
  }
};

// 当 TM 与 SC 同时存在时的兼容处理：TM 未安装脚本时回退查询 SC
const patchTampermonkeyIsInstalled = (external: any, scriptExpose: App.ExternalScriptCat) => {
  const exposedTM = external.Tampermonkey;
  const isInstalledTM = exposedTM?.isInstalled;
  const isInstalledSC = scriptExpose.isInstalled;

  // 满足这些字段时，认为是较完整的 TM 对象
  if (isInstalledTM && exposedTM?.getVersion && exposedTM.openOptions) {
    try {
      exposedTM.isInstalled = (
        name: string,
        namespace: string,
        callback: (res: App.IsInstalledResponse | undefined) => unknown
      ) => {
        isInstalledTM(name, namespace, (res: App.IsInstalledResponse | undefined) => {
          if (res?.installed) callback(res);
          else isInstalledSC(name, namespace, callback);
        });
      };
    } catch {
      // 忽略错误
    }
    return true;
  }

  return false;
};

// inject 环境 pageLoad 后执行：按白名单对页面注入 external 接口
const onInjectPageLoaded = (msg: Message) => {
  const hostname = window.location.hostname;

  // 不在白名单则不对外暴露接口
  if (!isExternalWhitelisted(hostname)) return;

  // 确保 external 存在
  const external: External = (window.external || (window.external = {} as External)) as External;

  // 创建 Scriptcat 暴露对象
  const scriptExpose = createScriptcatExpose(msg);

  // 尝试设置 external.Scriptcat
  safeSetExternal(external, "Scriptcat", scriptExpose);

  // 如果页面已有 Tampermonkey，则做兼容补丁；否则将 Tampermonkey 也指向 Scriptcat 接口
  const patched = patchTampermonkeyIsInstalled(external, scriptExpose);
  if (!patched) {
    safeSetExternal(external, "Tampermonkey", scriptExpose);
  }
};
