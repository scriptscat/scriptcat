import IoC from "@App/app/ioc";
import { MessageHander } from "@App/app/message/message";
import BackupExport from "@App/pkg/backup/export";
import { BackupData } from "@App/pkg/backup/struct";
import { SystemConfig } from "@App/pkg/config/config";
import { FileSystem } from "@Pkg/filesystem/filesystem";
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

  // 生成备份文件到文件系统
  async backup(fs: FileSystem) {
    const data: BackupData = { script: [], subscribe: [] };
    // 生成导出数据
    await new BackupExport(fs).export(data);
  }

  // 恢复,由于恢复除了数据外还有一些其它操作,所以将恢复的逻辑放入background中
  // controller只负责将数据传递给background,在传递时还需要注意数据的大小
  // 每一次请求只发送一条数据
  restore(data: BackupData) {}

  // 同步
  sync(fs: FileSystem) {}

  // sync(targer: SynchronizeTarget): Promise<void> {}
}
