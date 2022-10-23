import IoC from "@App/app/ioc";
import { MessageHander } from "@App/app/message/message";
import { SystemConfig } from "@App/pkg/config/config";
import Manager from "../manager";
import SynchronizeEventListener from "./event";

export type SynchronizeTarget = "local";

// 同步控件
@IoC.Singleton(MessageHander, SystemConfig)
export default class SynchronizeManager extends Manager {
  systemConfig: SystemConfig;

  event: SynchronizeEventListener;

  constructor(center: MessageHander, systemConfig: SystemConfig) {
    super(center);
    this.systemConfig = systemConfig;
    this.event = new SynchronizeEventListener(this);
  }

  start() {}

  // 备份
  backup() {}

  // 恢复
  restore() {}

  // sync(targer: SynchronizeTarget): Promise<void> {}
}
