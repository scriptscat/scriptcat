import { createSandboxChannelClient } from "@Packages/message/sandbox_message_channel";
import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { SandboxManager } from "./app/service/sandbox";

function main() {
  // sandbox 主动创建 private MessageChannel。只有 port2 的一次性 transfer 会经过 parent Window；
  // transfer 完成后所有内部 payload 都只在 MessagePort 上流动。
  const channel = createSandboxChannelClient(parent);
  const message = channel.message;

  const loggerCore = new LoggerCore({
    writer: new MessageWriter(message, "offscreen/logger"),
    labels: { env: "sandbox" },
  });
  loggerCore.logger().debug("offscreen start");

  // 先完成 Server / Runtime wiring，再 transfer port。parent 收到这个 port 本身就代表 sandbox ready。
  const manager = new SandboxManager(message);
  manager.initManager();
  channel.transferToParent();
}

main();
