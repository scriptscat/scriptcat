## 描述文档

`==UserScript==` 中的内容,用于描述脚本所需要的权限和脚本的信息作用等,在脚本的最开始的位置.

```js
// ==UserScript==
// @name         New Userscript
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  try to take over the world!
// @author       You
// @crontab      * * once * *
// ==/UserScript==
```


### 主要值

#### name

脚本名称

#### namespace

脚本命名空间,同一`namespace`空间中的脚本,数据可以共享🧪.

#### version

脚本的版本,建议遵循[语义化版本规则](https://semver.org/lang/zh-CN/),在检测到脚本的版本变化后,会提示用户进行更新等操作.

#### description

对于脚本的详细描述

#### author

脚本作者

#### run-at

脚本的运行时间

| 值             | 运行时                                                     | 支持   |
| -------------- | ---------------------------------------------------------- | ------ |
| document-start | 在前端匹配到网址后,以最快的速度注入脚本到页面中            | v0.3.0 |
| document-end   | DOM加载完成后注入脚本,此时页面脚本和图像等资源可能仍在加载 | v0.3.0 |
| document-idle  | 所有内容加载完成后注入脚本                                 | v0.3.0 |
| document-body  | 脚本只会在页面中有body元素时才会注入                       | ❌      |
| document-menu  | 在页面右键时会显示一个菜单,点击时运行脚本                  | ❌      |

对于menu图标可参考:[Unicode Symbols](https://unicode-table.com/en/)和[emoji](https://www.emojiall.com/zh-hans)

#### background

表示本脚本为后台脚本,需要运行在后台环境,具体请看[后台脚本](background.md)

#### crontab

表示脚本为定时脚本,会在后台环境中定时运行,具体请看[定时脚本](cron.md)

#### match

被match的url才会运行脚本,遵循[Match patterns](https://developer.chrome.com/docs/extensions/mv3/match_patterns/),match中使用*表示通配:

| 值                             | 正确案例                                                     | 错误案例                               |
| ------------------------------ | ------------------------------------------------------------ | -------------------------------------- |
| http://scriptcat.org/doc/match | http://scriptcat.org/doc/match                               | http://scriptcat.org/doc/runAt         |
| \*://\*/param?*                | https://scriptcat.org/param\|http://scriptcat.org/param?search=油猴 | https://scriptcat.org/test/param       |
| \*://\*/prefix*suffix          | http://scriptcat.org/prefix/suffix\|http://scriptcat.org/prefix/mid/suffix\|http://scriptcat.org/prefixsuffix | http://scriptcat.org/prefix/suffix/end |
| http\*://scriptcat.org/*       | https://scriptcat.org/\|https://scriptcat.org/doc\|http://scriptcat.org/doc/match\|http://scriptcat.org/param?search=油猴 | https://doc.scriptcat.org/             |
| http\*://scriptcat.org/doc/*   | https://scriptcat.org/doc\|http://scriptcat.org/doc/match    | http://scriptcat.org/param?search=油猴 |

#### include

match的别名

#### exclude

不匹配url

#### grant

申请API权限,需要申请了API之后才能调用,api列表请看:[API文档](./api.md)和[CAT API文档](cat-api.md).

两个特殊的值:

* **none**: 表示不在沙盒环境中运行,直接存在页面环境中,此环境下无法使用任何的API,可以直接范围页面的`window`对象.

* **unsafeWindow**在沙盒环境中如果需要范围页面的`window`对象,需要使用`unsafeWindow`来进行范围

#### require

引入外部js文件,可以进行[资源校验](#资源校验)

#### require-css🧪

引入外部css文件,可以进行[资源校验](#资源校验)


### 额外描述值

#### license

当前脚本的开源协议

#### supportURL

支持站点

#### homepage

脚本主页



#### 附注

#### 资源校验

使用md5,sha1,sha224,sha256,sha384,sha512方法对资源进行校验防止篡改,不同的校验方式之间可用`;`或者`,`分开,例如:

```js
// @require https://cdn.jsdelivr.net/npm/darkmode-js@1.5.7/lib/darkmode-js.min.js#md5=d55836f30c097da753179f82fa6f108f;sha256=a476ab8560837a51938aa6e1720c8be87c2862b6221690e9de7ffac113811a90
```



