import MessageInternal from "@App/app/message/internal";
import { Script } from "@App/app/repo/scripts";
import {
  ConfirmParam,
  UserConfirm,
} from "@App/runtime/background/permission_verify";

export default class PermissionController {
  static instance: PermissionController;

  static getInstance() {
    return PermissionController.instance;
  }

  msg: MessageInternal;

  constructor(msg: MessageInternal) {
    this.msg = msg;
    if (!PermissionController.instance) {
      PermissionController.instance = this;
    }
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
}
