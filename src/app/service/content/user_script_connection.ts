import type { Message, MessageConnect, TMessage } from "@Packages/message/types";

type UserScriptPacketHandler = (connection: MessageConnect, packet: TMessage) => void;

/**
 * 先让 service worker 开启 USER_SCRIPT 监听，再建立连接；浏览器可能立即投递端口，
 * 并发执行两步会丢失首个连接。
 */
export async function connectUserScriptChannel(
  message: Message,
  bootstrapToken: string,
  onPacket: UserScriptPacketHandler
): Promise<MessageConnect | undefined> {
  const enabled = await message.sendMessage<boolean>({ type: "userScripts.LISTEN_CONNECTIONS" } as unknown as TMessage);
  if (enabled === false) return undefined;
  const connection = await message.connect({
    action: "serviceWorker/runtime/registerUserScript",
    data: { world: "USER_SCRIPT", bootstrapToken },
  });
  connection.onMessage((packet) => onPacket(connection, packet));
  connection.sendMessage({ action: "userScript/bootstrap" });
  return connection;
}
