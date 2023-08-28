import IoC from "@App/app/ioc";
import MessageInternal from "@App/app/message/internal";
import { Permission, PermissionDAO } from "@App/app/repo/permission";
import { Script } from "@App/app/repo/scripts";
import {
  ConfirmParam,
  UserConfirm,
} from "@App/runtime/background/permission_verify";

@IoC.Singleton(MessageInternal)
export default class PermissionController {
  msg: MessageInternal;

  dao: PermissionDAO;

  constructor(msg: MessageInternal) {
    this.msg = msg;
    this.dao = new PermissionDAO();
  }

  // 通过uuid获取确认信息
  getConfirm(
    uuid: string
  ): Promise<{ script: Script; confirm: ConfirmParam; likeNum: number }> {
    return this.msg.syncSend("getConfirm", uuid);
  }

  // 发送确认信息
  sendConfirm(uuid: string, userConfirm: UserConfirm) {
    return this.msg.syncSend("permissionConfirm", {
      uuid,
      userConfirm,
    });
  }

  // 获取脚本权限列表
  getPermissions(scriptId: number): Promise<Permission[]> {
    return this.dao.find().where({ scriptId }).toArray();
  }

  // 删除权限
  deletePermission(scriptId: number, confirm: ConfirmParam) {
    return this.msg.syncSend("deletePermission", {
      scriptId,
      confirm,
    });
  }

  // 添加权限
  addPermission(scriptId: number, permission: Permission) {
    return this.msg.syncSend("addPermission", {
      scriptId,
      permission,
    });
  }

  // 重置权限
  resetPermission(scriptId: number) {
    return this.msg.syncSend("resetPermission", {
      scriptId,
    });
  }
}
