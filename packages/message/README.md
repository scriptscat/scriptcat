# 消息

跨 context（service_worker / content / inject / offscreen / sandbox）消息交互的抽象层，也包含与
`scripting` 页面桥接辅助脚本的消息。按调用形态选择传输方式：

- **单次 request/reply**（调用一次拿一次结果，例如大多数 GM API、扩展页面对 service_worker 的一次性调用）——
  使用 `sendMessage`（`Server`/`Group`/`Client` 的 RPC 封装）。
- **流式/进度/长响应，或需要持续双向交换**（例如需要分块返回大响应的 GM API、需要多次调用/多次结果的场景）——
  使用 `connect()`（`MessageConnect`）建立持久连接。
- **广播**（service_worker/offscreen 的状态变化需要通知已实例化 `MessageQueue` 并订阅对应 topic 的上下文）——使用 `MessageQueue` 的
  `publish`/`subscribe`，而不是上面两种点对点方式。

Service Worker → Offscreen 在 Chrome 与 Firefox 上走不同路径（Chrome 使用
`ServiceWorkerMessageSend`/`clients.matchAll()`；Firefox 用 `EventPageOffscreenManager` 替代真实的 offscreen
document）；但 Offscreen/EventPage ↔ Sandbox 两边统一使用 sandbox 主动创建并 transfer 的 private
`MessagePort`，只有一次不带业务 payload 的 Window bootstrap。细节见
[`docs/architecture.md` § Chrome vs Firefox: the offscreen split](../../docs/architecture.md#chrome-vs-firefox-the-offscreen-split)。

## 注意点

- service_worker 和 offscreen 之间可以使用 postMessage 的方式进行通信，避免同时监听 message 与 connect 导致冲突的问题。这个通道不与 sandbox userscript 共用 Window；Offscreen/EventPage ↔ Sandbox 不得使用全局 `window.message` 承载业务 payload。
- service_worker 会在空闲后进入不活动状态；与它建立的 `connect()` 长连接会在此时中断，因此需要长连接的场景要考虑
  重连/状态恢复，而不是假定连接一直存活——这不是禁止在 service_worker 上使用 `connect`，只是需要为其生命周期设计容错。
- USER_SCRIPT content 使用 `ExtensionMessage` 原生扩展通道；专用 USER_SCRIPT listener 不可用时才退到受文档 bootstrap token 约束的普通 extension port。MAIN inject 不维护 native/fallback 双轨。
- `Server("serviceWorker")` 对浏览器标记的 `userScript` 来源仅允许受控的 USER_SCRIPT 注册/GM API/reconnect 路径；普通 extension port fallback 只服务 USER_SCRIPT，并在 `runtime/registerUserScript` 握手中校验文档 bootstrap token。
- `CustomEventMessage` 和 `PageEventMessage` 都使用 `performance` 上的随机 key 事件。前者承载 USER_SCRIPT bootstrap 与同步 DOM 节点引用；后者是 MAIN↔`scripting` 的唯一普通消息桥。不要把 MAIN payload 改回 `window.postMessage`：全局 `"message"` event 会让页面只用一个 listener 就被动观察全部 payload。随机 event key 不是授权秘密；MAIN GM RPC 仍必须先通过 `PageRpcRegistry`，再由 Service Worker 结合真实 sender 重验。

- Sandbox transport 使用 `SandboxChannelHost` + `MessagePortMessage`：sandbox 在可信入口完成 Server/Runtime wiring 后才 transfer peer port；parent 以精确 `event.source === iframe.contentWindow` 校验一次性 bootstrap，成功后立即移除 Window `"message"` listener。background/crontab userscript 只拿到自己的 sandbox facade，不拿到 private port reference，因此不能靠 `window.onmessage` 被动枚举内部 payload。
