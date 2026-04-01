# 消息

对扩展内消息交互的抽象

主要会有以下几种类型的消息：

- 从脚本发起的GM请求，需要层层传递到service_worker/offscreen进行处理，有的GM只需要进行一次调用获取一次结果，有的需要进行
  多次调用获取多次结果，使用connect的方式实现
- 从service_worker/offscreen发起的请求，类似消息队列，其它页面进行监听，触发后广播给所有页面，使用sendMessage方式实现
- 从扩展页面发起的请求，需要传递到service_worker/offscreen进行处理，如果只是单次调用，获取一次结果，使用sendMessage方式实现，如果需要
  多次调用获取多次结果，使用connect方式实现

## 注意点

- service_worker和offscreen之间可以使用postMessage的方式进行通信，避免同时监听message与connect导致冲突的问题
- service_worker会变为不活动的状态，尽量避免与service_worker建立长连接
