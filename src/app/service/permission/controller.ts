import IoC from "@App/app/ioc";
import MessageInternal from "@App/app/message/internal";
import { Script } from "@App/app/repo/scripts";
import {
  ConfirmParam,
  UserConfirm,
} from "@App/runtime/background/permission_verify";

@IoC.Singleton(MessageInternal)
export default class PermissionController {
  msg: MessageInternal;

  constructor(msg: MessageInternal) {
    this.msg = msg;
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
