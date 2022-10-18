import MessageInternal from "@App/app/message/internal";
import Cache from "@App/app/cache";
import { Script } from "@App/app/repo/scripts";
import CacheKey from "@App/utils/cache_key";
import IoC from "@App/app/ioc";
import Runtime, { RuntimeEvent } from "../background/runtime";

@IoC.Singleton(MessageInternal, Runtime)
export default class RuntimeController {
  internal: MessageInternal;

  runtime: Runtime;

  constructor(internal: MessageInternal, runtime: Runtime) {
    this.internal = internal;
    this.runtime = runtime;
  }

  public dispatchEvent(event: RuntimeEvent, data: any): Promise<any> {
    return this.internal.syncSend(`runtime-${event}`, data);
  }

  // 调试脚本,需要先启动GM环境
  async debugScript(script: Script) {
    // 清理脚本缓存,避免GMApi中的缓存影响
    Cache.getInstance().del(CacheKey.script(script.id));
    // 构建脚本代码
    return this.runtime.startBackgroundScript(script);
  }

  watchRunStatus() {
    const channel = this.internal.channel();
    channel.channel("watchRunStatus");
    return channel;
  }

  startScript(id: number) {
    return this.dispatchEvent("start", id);
  }

  stopScript(id: number) {
    return this.dispatchEvent("stop", id);
  }
}
