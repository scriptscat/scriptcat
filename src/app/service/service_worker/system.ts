import { type SystemConfig } from "@App/pkg/config/config";
import { type Group } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import { VscodeConnectClient } from "../offscreen/client";
import { cacheInstance } from "@App/app/cache";
import type { IMessageQueue } from "@Packages/message/message_queue";
import type { TDeleteScript, TInstallScript } from "../queue";
import type { ScriptDAO } from "@App/app/repo/scripts";
import type { FaviconDAO } from "@App/app/repo/favicon";
import { v5 as uuidv5 } from "uuid";
import { removeFavicon } from "./utils";

// 一些系统服务
export class SystemService {
  constructor(
    private systemConfig: SystemConfig,
    private group: Group,
    private msgSender: MessageSend,
    private mq: IMessageQueue,
    private scriptDAO: ScriptDAO,
    private faviconDAO: FaviconDAO
  ) {}

  init() {
    const vscodeConnect = new VscodeConnectClient(this.msgSender);
    this.group.on("connectVSCode", (params) => {
      return vscodeConnect.connect(params);
    });

    // 脚本更新删除favicon缓存
    this.mq.subscribe<TInstallScript>("installScript", (messages) => {
      if (messages.update) {
        // 删除旧的favicon缓存
        cacheInstance.tx("faviconOPFSControl", async () => {
          const uuid = messages.script.uuid;
          await this.faviconDAO.delete(uuid);
        });
      }
    });

    // 监听脚本删除，清理favicon缓存
    this.mq.subscribe<TDeleteScript[]>("deleteScripts", (message) => {
      cacheInstance.tx("faviconOPFSControl", async () => {
        const faviconDAO = this.faviconDAO;
        const cleanupIcons = new Set<string>();
        // 需要删除的icon
        const uuids = await Promise.all(
          message.map(({ uuid }) =>
            faviconDAO.get(uuid).then((entry) => {
              const icons = entry?.favicons;
              if (icons) {
                for (const icon of icons) {
                  if (icon.icon) {
                    cleanupIcons.add(icon.icon);
                  }
                }
              }
              return uuid;
            })
          )
        );
        // 删除数据
        await faviconDAO.deletes(uuids);
        // 需要保留的icon
        await faviconDAO.all().then((results) => {
          for (const entry of results) {
            for (const icon of entry.favicons) {
              if (icon.icon) {
                cleanupIcons.delete(icon.icon);
              }
            }
          }
        });
        // 删除opfs缓存
        await Promise.all(
          [...cleanupIcons].map((iconUrl) => removeFavicon(`icon_${uuidv5(iconUrl, uuidv5.URL)}.dat`).catch(() => {}))
        );
      });
    });

    // 如果开启了自动连接vscode，则自动连接
    // 使用tx来确保service_worker恢复时不会再执行
    cacheInstance.get<boolean>("vscodeReconnect").then(async (init) => {
      if (!init) {
        if (await this.systemConfig.getVscodeReconnect()) {
          // 调用连接
          vscodeConnect.connect({
            url: await this.systemConfig.getVscodeUrl(),
            reconnect: true,
          });
        }
        await cacheInstance.set<boolean>("vscodeReconnect", true);
      }
    });
  }
}
