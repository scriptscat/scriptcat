import { ConfirmParam } from "./service/service_worker/permission_verify";

// 加载脚本信息时的缓存
export function scriptInstallInfo(uuid: string): string {
  return `scriptInfo:${uuid}`;
}

export function permissionConfirm(scriptUuid: string, confirm: ConfirmParam): string {
  return `permission:${scriptUuid}:${confirm.permission}:${confirm.permissionValue || ""}`;
}

// importFile 导入文件
export function importFile(uuid: string): string {
  return `importFile:${uuid}`;
}
