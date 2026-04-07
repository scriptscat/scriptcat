import type { IGetSender } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import type { OPFSApiRequest } from "@App/app/service/agent/core/types";
import { createOPFSTools, guessMimeType } from "@App/app/service/agent/core/tools/opfs_tools";
import { sanitizePath, getWorkspaceRoot, getDirectory, splitPath } from "@App/app/service/agent/core/opfs_helpers";
import { createObjectURL } from "@App/app/service/offscreen/client";
import { sendMessage } from "@Packages/message/client";
import type { AgentChatRepo } from "@App/app/repo/agent_chat";

export class AgentOPFSService {
  constructor(private sender: MessageSend) {}

  // 处理 CAT.agent.opfs API 请求
  // sender.getSender() 有值 → 来自 chrome.runtime（content script），不支持 Blob
  // sender.getSender() 为空 → 来自 postMessage（offscreen），支持 Blob
  async handleOPFSApi(request: OPFSApiRequest, sender: IGetSender, repo: AgentChatRepo): Promise<unknown> {
    const supportBlob = !sender.getSender();
    const opfsTools = createOPFSTools();
    const toolMap = new Map(opfsTools.tools.map((t) => [t.definition.name, t.executor]));

    switch (request.action) {
      case "write": {
        let content = request.content;
        // chrome.runtime 通道：content script 已将 Blob 转为 blob URL，需还原
        if (!supportBlob && typeof content === "string" && content.startsWith("blob:")) {
          content = await this.fetchBlobFromOffscreen(content);
        }
        const executor = toolMap.get("opfs_write")!;
        return JSON.parse((await executor.execute({ path: request.path, content })) as string);
      }
      case "read": {
        if (request.format === "blob") {
          const safePath = sanitizePath(request.path);
          if (!safePath) throw new Error("path is required");
          const workspace = await getWorkspaceRoot();
          const { dirPath, fileName } = splitPath(safePath);
          const dir = dirPath ? await getDirectory(workspace, dirPath) : workspace;
          const fileHandle = await dir.getFileHandle(fileName);
          const file = await fileHandle.getFile();
          const mimeType = guessMimeType(safePath);
          const blob = new Blob([await file.arrayBuffer()], { type: mimeType });
          if (supportBlob) {
            // postMessage 通道：直接返回 Blob
            return { path: safePath, data: blob, size: file.size, mimeType };
          }
          // chrome.runtime 通道：通过 offscreen 创建 blob URL，客户端通过 CAT_fetchBlob 还原
          const blobUrl = (await createObjectURL(this.sender, { blob, persistence: true })) as string;
          return { path: safePath, blobUrl, size: file.size, mimeType };
        }
        // 默认 text 模式：直接返回文件文本内容（GM API 独立实现，不走 opfs_read executor 的分页逻辑）
        const safePath2 = sanitizePath(request.path);
        if (!safePath2) throw new Error("path is required");
        const workspace2 = await getWorkspaceRoot();
        const { dirPath: dirPath2, fileName: fileName2 } = splitPath(safePath2);
        const dir2 = dirPath2 ? await getDirectory(workspace2, dirPath2) : workspace2;
        const fileHandle2 = await dir2.getFileHandle(fileName2);
        const file2 = await fileHandle2.getFile();
        const textContent = await file2.text();
        return { path: safePath2, content: textContent, size: file2.size };
      }
      case "readAttachment": {
        const blob = await repo.getAttachment(request.id);
        if (!blob) {
          throw new Error(`Attachment not found: ${request.id}`);
        }
        if (supportBlob) {
          // postMessage 通道：直接返回 Blob
          return { id: request.id, data: blob, size: blob.size, mimeType: blob.type };
        }
        // chrome.runtime 通道：通过 offscreen 创建 blob URL，客户端通过 CAT_fetchBlob 还原
        const blobUrl = (await createObjectURL(this.sender, { blob, persistence: true })) as string;
        return { id: request.id, blobUrl, size: blob.size, mimeType: blob.type };
      }
      case "list": {
        const executor = toolMap.get("opfs_list")!;
        return JSON.parse((await executor.execute({ path: request.path || "" })) as string);
      }
      case "delete": {
        const executor = toolMap.get("opfs_delete")!;
        return JSON.parse((await executor.execute({ path: request.path })) as string);
      }
      default:
        throw new Error(`Unknown OPFS action: ${(request as any).action}`);
    }
  }

  // 通过 offscreen fetch blob URL 还原为 Blob（用于 chrome.runtime 通道下 content script 传来的 blob URL）
  private async fetchBlobFromOffscreen(blobUrl: string): Promise<Blob> {
    return (await sendMessage(this.sender, "offscreen/fetchBlob", { url: blobUrl })) as Blob;
  }
}
