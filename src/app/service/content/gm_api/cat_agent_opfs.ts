import type { OPFSApiRequest } from "@App/app/service/agent/types";
import GMContext from "./gm_context";

// 运行时 this 是 GM_Base 实例
interface GMBaseContext {
  sendMessage: (
    api: string,
    params: any[]
  ) => Promise<any>;
  scriptRes?: { uuid: string };
}

// CAT.agent.opfs API，注入到脚本上下文
// 使用 @GMContext.API 装饰器注册到 "CAT.agent.opfs" grant
export default class CATAgentOPFSApi {
  @GMContext.protected()
  protected sendMessage!: GMBaseContext["sendMessage"];

  @GMContext.protected()
  protected scriptRes?: { uuid: string };

  @GMContext.API({ follow: "CAT.agent.opfs" })
  public "CAT.agent.opfs.write"(path: string, content: string | Blob): Promise<{ path: string; size: number }> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentOPFS", [
      { action: "write", path, content, scriptUuid: ctx.scriptRes?.uuid || "" } as OPFSApiRequest,
    ]) as Promise<{ path: string; size: number }>;
  }

  @GMContext.API({ follow: "CAT.agent.opfs" })
  public async "CAT.agent.opfs.read"(
    path: string,
    format?: "text" | "bloburl" | "blob"
  ): Promise<{ path: string; content?: string; blobUrl?: string; data?: Blob; size: number; mimeType?: string }> {
    const ctx = this as unknown as GMBaseContext;
    const result = await ctx.sendMessage("CAT_agentOPFS", [
      { action: "read", path, format, scriptUuid: ctx.scriptRes?.uuid || "" } as OPFSApiRequest,
    ]);
    // blob 格式：SW 返回 blobUrl，通过 CAT_fetchBlob 在 extension-origin 上下文中转换为 Blob
    if (format === "blob" && result.blobUrl) {
      result.data = await ctx.sendMessage("CAT_fetchBlob", [result.blobUrl]);
      delete result.blobUrl;
    }
    return result;
  }

  @GMContext.API({ follow: "CAT.agent.opfs" })
  public "CAT.agent.opfs.list"(path?: string): Promise<Array<{ name: string; type: string; size?: number }>> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentOPFS", [
      { action: "list", path, scriptUuid: ctx.scriptRes?.uuid || "" } as OPFSApiRequest,
    ]) as Promise<Array<{ name: string; type: string; size?: number }>>;
  }

  @GMContext.API({ follow: "CAT.agent.opfs" })
  public async "CAT.agent.opfs.readAttachment"(
    id: string
  ): Promise<{ id: string; data: Blob; size: number; mimeType?: string }> {
    const ctx = this as unknown as GMBaseContext;
    const result = await ctx.sendMessage("CAT_agentOPFS", [
      { action: "readAttachment", id, scriptUuid: ctx.scriptRes?.uuid || "" } as OPFSApiRequest,
    ]);
    // SW 返回 blobUrl（chrome.runtime sendResponse 不支持 Blob），
    // 通过 CAT_fetchBlob 在 extension-origin 上下文（offscreen/content script）中转换为 Blob
    if (result.blobUrl) {
      result.data = await ctx.sendMessage("CAT_fetchBlob", [result.blobUrl]);
      delete result.blobUrl;
    }
    return result;
  }

  @GMContext.API({ follow: "CAT.agent.opfs" })
  public "CAT.agent.opfs.delete"(path: string): Promise<{ success: true }> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentOPFS", [
      { action: "delete", path, scriptUuid: ctx.scriptRes?.uuid || "" } as OPFSApiRequest,
    ]) as Promise<{ success: true }>;
  }
}
