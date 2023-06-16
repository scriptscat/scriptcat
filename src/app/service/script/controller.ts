import { Script, ScriptDAO } from "@App/app/repo/scripts";
import { SubscribeDAO } from "@App/app/repo/subscribe";
import { ScriptInfo } from "@App/pkg/utils/script";
import IoC from "@App/app/ioc";
import MessageInternal from "../../message/internal";
import { ScriptEvent } from "./event";

// 脚本控制器,主要负责与manager交互,控制器发送消息给manager,manager进行处理
@IoC.Singleton(MessageInternal)
export default class ScriptController {
  scriptDAO: ScriptDAO = new ScriptDAO();

  subscribeDAO: SubscribeDAO = new SubscribeDAO();

  internal: MessageInternal;

  constructor(internal: MessageInternal) {
    this.internal = internal;
  }

  public dispatchEvent(event: ScriptEvent, data: any): Promise<any> {
    return this.internal.syncSend(`script-${event}`, data);
  }

  // 安装或者更新脚本
  public upsert(script: Script): Promise<{ id: number }> {
    return this.dispatchEvent("upsert", script);
  }

  public enable(id: number) {
    return this.dispatchEvent("enable", id);
  }

  public disable(id: number) {
    return this.dispatchEvent("disable", id);
  }

  public delete(id: number) {
    return this.dispatchEvent("delete", id);
  }

  public fetchScriptInfo(uuid: string): Promise<ScriptInfo> {
    return this.dispatchEvent("fetch", uuid);
  }

  checkUpdate(id: number) {
    return this.dispatchEvent("checkUpdate", id);
  }

  importByUrl(url: string) {
    return this.dispatchEvent("importByUrl", url);
  }

  exclude(id: number, exclude: string, remove: boolean) {
    return this.dispatchEvent("exclude", { id, exclude, remove });
  }

  resetExclude(id: number, exclude: string[] | undefined) {
    return this.dispatchEvent("resetExclude", { id, exclude });
  }

  resetMatch(id: number, match: string[] | undefined) {
    return this.dispatchEvent("resetMatch", { id, match });
  }

  updateCheckUpdateUrl(id: number, url: string) {
    return this.dispatchEvent("updateCheckUpdateUrl", { id, url });
  }
}
