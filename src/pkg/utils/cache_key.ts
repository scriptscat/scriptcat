// 缓存key,所有缓存相关的key都需要定义在此
// 使用装饰器维护缓存值

import Cache from "@App/app/cache";
import { ConfirmParam } from "@App/runtime/background/permission_verify";

export default class CacheKey {
  // 缓存触发器
  static Trigger(): (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) => void {
    return (target, propertyName, descriptor) => {
      descriptor.value();
    };
  }

  // 脚本缓存
  static script(id: number): string {
    return `script:${id.toString()}`;
  }

  // 加载脚本信息时的缓存,已处理删除
  static scriptInfo(uuid: string): string {
    const key = `scriptInfo:${uuid}`;
    setTimeout(() => {
      // 清理缓存
      Cache.getInstance().del(key);
    }, 60 * 1000);
    return key;
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

  static importInfo(uuid: string): string {
    const key = `import:${uuid}`;
    setTimeout(() => {
      Cache.getInstance().del(key);
    }, 60 * 100000);
    return key;
  }
}
