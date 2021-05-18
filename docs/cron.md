## 定时脚本

定时脚本由`@crontab`属性声明,可以精确到秒级调用,提供了一个`once`,表示某个时间内最多执行一次(考虑浏览器未打开的情况).建议脚本的运行时间不要大于定时时间的间隔.

可使用在线工具测试:https://tool.lu/crontab/

### Crontab 例子

```javascript
//@crontab * * * * * * 每秒运行一次
//@crontab * * * * * 每分钟运行一次
//@crontab 0 */6 * * * 每6小时执行一次
//@crontab 15 */6 * * * 每6小时的15分执行一次
//@crontab * once * * * 每小时最多运行一次
//@crontab * * once * * 每天最多运行一次
//@crontab * once 13 * * 每个月13号中的每小时最多运行一次
```

### Promise

> 十分推荐这种写法,也便于脚本管理器的脚本监控

脚本返回`Promise`对象,管理器可以将返回的内容当作日志记录下来.
在`crontab`的`once`中,`reject`的第二个参数将会作为延迟重试执行的时间来处理,单位为秒.

```ts
// ==UserScript==
// @name         Promise测试demo
// @namespace    wyz
// @version      1.0.0
// @author       wyz
// @crontab * * * * *
// ==/UserScript==
return new Promise((resolve, reject) => {
  if (Math.round((Math.random() * 10) % 2)) {
    resolve("ok");
  } else {
    reject("error", 10);
  }
});
```
