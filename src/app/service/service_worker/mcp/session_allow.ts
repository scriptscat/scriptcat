/**
 * 外部接入 · 「本会话允许」缓存（设计 §3 三档决策的第三档）。
 *
 * 用户在确认页选「本会话允许」时，对 (脚本, 操作类别) 记一条免询问授权，存 chrome.storage.session：
 * 浏览器重启 / 扩展重载 / 停止外部接入（废弃密钥 K）时自动清除，绝不跨会话存活。会话锚在扩展侧而
 * 非客户端侧——CLI（每次命令一次性短连接）与 MCP（长连接）因此共享同一「本次会话」概念，授权模型
 * 对二者完全一致。
 *
 * key 由 sessionAllowKey() 生成：对已存在脚本的操作用目标 uuid，安装用脚本稳定身份（namespace:name），
 * 因为安装每次都会 stage 一个全新的 uuid，用它做键会让「本会话允许」退化成「仅允许一次」。
 */
import type { OperationKind } from "./types";

const STORAGE_KEY = "mcp_session_allow";

// 安装/更新共用一个类别（同一张安装页面）；其余操作按各自类别独立授权。
export function sessionAllowKey(kind: OperationKind, identity: string): string {
  const category = kind === "install" || kind === "update" ? "install" : kind;
  return `${category}:${identity}`;
}

export class SessionAllowStore {
  async has(key: string): Promise<boolean> {
    const list = await this.list();
    return list.includes(key);
  }

  async add(key: string): Promise<void> {
    const list = await this.list();
    if (!list.includes(key)) {
      await chrome.storage.session.set({ [STORAGE_KEY]: [...list, key] });
    }
  }

  // 停止外部接入的 kill switch 一并清掉本会话授权。
  async clear(): Promise<void> {
    await chrome.storage.session.remove(STORAGE_KEY);
  }

  private async list(): Promise<string[]> {
    const data = await chrome.storage.session.get(STORAGE_KEY);
    return (data[STORAGE_KEY] as string[] | undefined) ?? [];
  }
}
