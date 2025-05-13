import { ConfirmParam } from "./service/service_worker/permission_verify";

export default class CacheKey {
  // 加载脚本信息时的缓存
  static scriptInstallInfo(uuid: string): string {
    return `scriptInfo:${uuid}`;
  }

  static permissionConfirm(scriptUuid: string, confirm: ConfirmParam): string {
    return `permission:${scriptUuid}:${confirm.permissionValue || ""}:${confirm.permission || ""}`;
  }

  // importFile 导入文件
  static importFile(uuid: string): string {
    return `importFile:${uuid}`;
  }
}
