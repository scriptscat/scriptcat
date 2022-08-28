# Runtime

主要会分为两种脚本：油猴脚本与后台脚本，然后 GM 的 API 实现是需要通过通讯机制调用到 background 来实际执行的。

## 油猴脚本

油猴脚本运行在页面中，首先会由 content 页面发送一个消息到 background，然后 background 会将 url 进行匹配，如果有匹配的则会往下继续执行，并且通过`chrome.tabs.executeScript`将`injected.ts`脚本运行环境注入到页面中去，然后再使用`chrome.tabs.executeScript`将油猴脚本注入到页面中去，至此脚本就都进入了用户页面运行，后续再通过`injected.ts`->`content`->`background`的消息机制实现 GMApi 的调用。

因为需要尽快的注入脚本，需要在 background 中实现脚本的缓存。

### 沙盒

需要实现一个沙盒，对脚本运行环境与页面环境进行隔离，使页面不能影响到脚本的运行，并且也禁止页面上能够调用 GMApi。

这块就是由`injected.ts`实现的了，他还将脚本申请的 GMApi 注入到脚本中，与 content 页面使用 CustomEvent 实现通讯。

## 后台脚本

后台脚本运行在 sandbox 页面中，只能通过 sandbox.postMessage 进行通讯。此处的 sanbox 页面是指的 chrome 扩展 sandbox 与油猴脚本中的沙盒无关，因为 chrome 扩展中不允许执行动态代码，所以提供了一个 sandbox 页来做这些操作（但 chrome MV3 还未发现替代品，不知道后续发展如何）。但为了隔离各个脚本并且也需要将 GMApi 注入到脚本中，所以也需要使用到油猴脚本中的沙盒，不过因为 sandbox 页中是没有 DOM 的，所以可以将 window、DOM 相关的操作简化。

在脚本开启时 background 将脚本信息发送给 sandbox，由 sandbox 页去运行脚本，对于定时脚本也由 sandbox 页解析 crontab 表达式，然后到时间运行。

运行开始与结束需要发送一个消息给 background 更新状态。

## GMAPI
