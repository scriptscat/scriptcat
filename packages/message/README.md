# 消息

跨 context（service_worker / content / inject / offscreen / sandbox）消息交互的抽象层。按调用形态选择传输方式：

- **单次 request/reply**（调用一次拿一次结果，例如大多数 GM API、扩展页面对 service_worker 的一次性调用）——
  使用 `sendMessage`（`Server`/`Group`/`Client` 的 RPC 封装）。
- **流式/进度/长响应，或需要持续双向交换**（例如需要分块返回大响应的 GM API、需要多次调用/多次结果的场景）——
  使用 `connect()`（`MessageConnect`）建立持久连接。
- **广播**（service_worker/offscreen 触发的状态变化需要通知所有页面）——使用 `MessageQueue` 的
  `publish`/`subscribe`，而不是上面两种点对点方式。

Service Worker → Offscreen 在 Chrome 与 Firefox 上走不同路径（Chrome 使用
`ServiceWorkerMessageSend`/`clients.matchAll()`；Firefox 用 `EventPageOffscreenManager` 替代真实的 offscreen
document），细节见
[`docs/architecture.md` § Chrome vs Firefox: the offscreen split](../../docs/architecture.md#chrome-vs-firefox-the-offscreen-split)。

## 注意点

- service_worker 和 offscreen 之间可以使用 postMessage 的方式进行通信，避免同时监听 message 与 connect 导致冲突的问题。
- service_worker 会在空闲后进入不活动状态；与它建立的 `connect()` 长连接会在此时中断，因此需要长连接的场景要考虑
  重连/状态恢复，而不是假定连接一直存活——这不是禁止在 service_worker 上使用 `connect`，只是需要为其生命周期设计容错。
