## 定时脚本

定时脚本由`@crontab`属性声明,可以精确到秒级调用,提供了一个once,表示某个时间内最多执行一次.

可使用在线工具测试:https://tool.lu/crontab/

### Crontab例子

```javascript
//@crontab * * * * * * 每秒运行一次
//@crontab * * * * * 每分钟运行一次
//@crontab 0 */6 * * * 每6小时执行一次
//@crontab 15 */6 * * * 每6小时的15分执行一次
//@crontab * once * * * 每小时最多运行一次
//@crontab * * once * * 每天最多运行一次
//@crontab * once 13 * * 每个月13号中的每小时最多运行一次
```



### 脚本执行失败

once命令下,可使用`GMSC_reject`命令设置下一次延迟执行的时间

```typescript
declare function GMSC_reject(result: any): void;
GMSC_reject(60);//当result为数字时判断为延迟重试执行,例如此项表示一分钟后重试执行
```



