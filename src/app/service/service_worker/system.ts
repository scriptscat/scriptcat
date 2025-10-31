import { type SystemConfig } from "@App/pkg/config/config";
import { type Group } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import { createObjectURL, VscodeConnectClient } from "../offscreen/client";
import { cacheInstance } from "@App/app/cache";
import { v5 as uuidv5 } from "uuid";
import type { IMessageQueue } from "@Packages/message/message_queue";
import type { TDeleteScript, TInstallScript } from "../queue";
import type { ScriptDAO } from "@App/app/repo/scripts";
import { extractFaviconsDomain, fetchIconByDomain } from "@App/pkg/utils/favicon";
import type { FaviconDAO, FaviconRecord } from "@App/app/repo/favicon";

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

  getFaviconFromDomain(domain: string) {
    return fetchIconByDomain(domain);
  }

  async getScriptFavicon(uuid: string): Promise<FaviconRecord[]> {
    const script = await this.scriptDAO.get(uuid);
    if (!script) {
      return [];
    }
    const favicon = await this.faviconDAO.get(uuid);
    if (favicon) {
      return favicon.favicons;
    }
    // 提取域名
    const domains = extractFaviconsDomain(script.metadata?.match || [], script.metadata?.include || []);

    // 获取favicon
    const faviconUrls = new Array<FaviconRecord>();

    // 并发获取favicon
    const fetchPromises = domains.map(async (domain) => {
      try {
        if (domain.domain) {
          const icons = await fetchIconByDomain(domain.domain);
          if (icons.length > 0) {
            faviconUrls.push({ match: domain.match, website: "http://" + domain.domain, icon: icons[0] });
          } else {
            faviconUrls.push({ match: domain.match, website: "http://" + domain.domain, icon: "" });
          }
        } else {
          faviconUrls.push({ match: domain.match, website: "", icon: "" });
        }
      } catch {
        // 忽略错误
        faviconUrls.push({ match: domain.match, website: "", icon: "" });
      }
    });
    // 等待所有favicon获取完成
    await Promise.all(fetchPromises);
    // 储存并返回结果
    await this.faviconDAO.save(uuid, {
      uuid,
      favicons: faviconUrls,
    });

    return faviconUrls.slice();
  }

  async faviconOPFS(uuid: string) {
    const opfsRoot = await navigator.storage.getDirectory();
    return opfsRoot.getDirectoryHandle(`favicons:${uuid}`, { create: true });
  }

  async loadFavicon({ uuid, url }: { uuid: string; url: string }): Promise<string> {
    // 根据url缓存一下
    return await cacheInstance.tx(`favicon-url:${url}`, async (val: string | undefined, tx) => {
      if (val) {
        return val;
      }
      const directoryHandle = await this.faviconOPFS(uuid);
      // 使用url的uuid作为文件名
      const filename = uuidv5(url, uuidv5.URL);
      // 检查文件是否存在
      let fileHandle: FileSystemFileHandle | undefined;
      try {
        fileHandle = await directoryHandle.getFileHandle(filename);
      } catch {
        // 文件不存在，继续往下走
      }
      let file: Blob;
      if (!fileHandle) {
        // 文件不存在，下载并保存
        const newFileHandle = await directoryHandle.getFileHandle(filename, { create: true });
        const response = await fetch(url);
        const blob = await response.blob();
        const writable = await newFileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        file = blob;
      } else {
        file = await fileHandle.getFile();
      }
      // 返回对象URL
      const blobUrl = await createObjectURL(this.msgSender, file, true);
      tx.set(blobUrl);
      return blobUrl;
    });
  }

  init() {
    const vscodeConnect = new VscodeConnectClient(this.msgSender);
    this.group.on("connectVSCode", (params) => {
      return vscodeConnect.connect(params);
    });
    // 加载favicon并缓存到OPFS
    this.group.on("loadFavicon", this.loadFavicon.bind(this));

    // 获取脚本的favicon
    this.group.on("getScriptFavicon", this.getScriptFavicon.bind(this));

    // 脚本更新删除favicon缓存
    this.mq.subscribe<TInstallScript[]>("installScript", async (message) => {
      for (const { script, update } of message) {
        if (update) {
          // 删除旧的favicon缓存
          await this.faviconDAO.delete(script.uuid);
        }
      }
    });

    // 监听脚本删除，清理favicon缓存
    this.mq.subscribe<TDeleteScript[]>("deleteScripts", async (message) => {
      for (const { uuid } of message) {
        // 删除数据
        await this.faviconDAO.delete(uuid);
        // 删除opfs缓存
        try {
          const opfsRoot = await navigator.storage.getDirectory();
          opfsRoot.removeEntry(`favicons:${uuid}`, { recursive: true });
        } catch {
          // 忽略错误
        }
      }
    });

    this.group.on("getFaviconFromDomain", this.getFaviconFromDomain.bind(this));

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
