// 缓存key,所有缓存相关的key都需要定义在此
// 使用装饰器维护缓存值

import Cache from "@App/app/cache";
import { Script } from "@App/app/repo/scripts";
import ScriptManager from "@App/app/service/script/manager";
import { ConfirmParam } from "@App/runtime/background/permission_verify";

// 缓存key装饰器
function Handler(
  handler: () => void
): (target: any, propertyName: string, descriptor: PropertyDescriptor) => void {
  return () => {
    handler();
  };
}

export default class CacheKey {
  // 脚本缓存
  @Handler(() => {
    // 监听并删除
    ScriptManager.hook.addHook("upsert", (script: Script) => {
      Cache.getInstance().del(CacheKey.script(script.id));
      return Promise.resolve(true);
    });
    ScriptManager.hook.addHook("delete", (script: Script) => {
      Cache.getInstance().del(CacheKey.script(script.id));
      return Promise.resolve(true);
    });
  })
  static script(id: number): string {
    return `script:${id.toString()}`;
  }

  // 加载脚本信息时的缓存,已处理删除
  static scriptInfo(uuid: string): string {
    return `script:info:${uuid}`;
  }

  // 脚本资源url缓存,可能存在泄漏
  static resourceByUrl(url: string): string {
    return `resource:${url}`;
  }

  // 脚本value缓存,可能存在泄漏
  static scriptValue(id: number, storagename?: string[]): string {
    if (storagename) {
      return `value:storagename:${storagename[0]}`;
    }
    return `value:id:${id.toString()}`;
  }

  static permissionConfirm(scriptId: number, confirm: ConfirmParam): string {
    return `permission:${scriptId.toString()}:${
      confirm.permissionValue || ""
    }:${confirm.permission || ""}`;
  }
}
