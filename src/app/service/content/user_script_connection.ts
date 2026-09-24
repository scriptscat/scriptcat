import type { Message, MessageConnect, TMessage } from "@Packages/message/types";

type UserScriptPacketHandler = (connection: MessageConnect, packet: TMessage) => void;
type UserScriptDisconnectHandler = (isSelfDisconnected: boolean) => void;

type UserScriptReconnectResponse = {
  code?: unknown;
  data?: unknown;
};

/**
 * 先让 service worker 开启 USER_SCRIPT 监听，再建立连接；浏览器可能立即投递端口，
 * 并发执行两步会丢失首个连接。
 */
export async function connectUserScriptChannel(
  message: Message,
  bootstrapToken: string,
  onPacket: UserScriptPacketHandler,
  onDisconnect?: UserScriptDisconnectHandler
): Promise<MessageConnect | undefined> {
  const enabled = await message.sendMessage<boolean>({ type: "userScripts.LISTEN_CONNECTIONS" } as unknown as TMessage);
  const useExtensionFallback = enabled !== true;
  let connection: MessageConnect;
  try {
    // 缺少专用 USER_SCRIPT 监听器时仍使用扩展原生端口；服务端会用文档绑定的令牌限制该降级路径。
    connection = await message.connect({
      action: "serviceWorker/runtime/registerUserScript",
      data: useExtensionFallback
        ? { world: "USER_SCRIPT", bootstrapToken, transport: "extension" }
        : { world: "USER_SCRIPT", bootstrapToken },
    });
  } catch (error) {
    if (!useExtensionFallback) throw error;
    return undefined;
  }
  connection.onMessage((packet) => onPacket(connection, packet));
  if (onDisconnect) connection.onDisconnect(onDisconnect);
  connection.sendMessage({ action: "userScript/bootstrap" });
  return connection;
}

export async function requestUserScriptReconnect(
  message: Message,
  reconnectToken: string
): Promise<string | undefined> {
  const response = await message.sendMessage<UserScriptReconnectResponse>({
    action: "serviceWorker/runtime/reconnectUserScript",
    data: { reconnectToken },
  });
  if (response?.code !== 0 || response.data === null || typeof response.data !== "object") return undefined;
  const token = (response.data as { bootstrapToken?: unknown }).bootstrapToken;
  return typeof token === "string" && token.length > 0 && token.length <= 256 ? token : undefined;
}
