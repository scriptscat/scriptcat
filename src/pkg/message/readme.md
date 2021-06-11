## 消息通信和事件



### 定义



扩展中涉及到很多不同页面中的消息传递,不同页面之间消息的API交互方式不同.几乎所有的页面都要以background为中心发送消息进行处理或者通过background监听需要关注的消息.我们定义以下几种通信的类型:

* 将消息发送至background进行处理不需要返回结果内容的定义为消息.
* 将消息发送至background进行处理且需要返回结果或者多次处理的定义为链接.
* 将消息发送至background请求监听某个事件,之后只进行事件消息的接受不发送的定义为事件.实现上可为链接.

每一个消息/链接/事件都应该有一个topic,来区分消息的处理方式.

另外为了**数据的一致性**,要求对数据库的所有**写操作**只能通过消息在background中进行处理.




#### 扩展内消息交互

扩展内的消息主要为各个页面到background的消息,可直接使用浏览器提供的api实现`chrome.runtime.sendMessage`,`chrome.runtime.onMessage.addListener`实现消息,`chrome.runtime.connect`,`chrome.runtime.onConnect.addListener`实现链接和事件




#### 脚本与扩展消息交互

脚本为:injected页面,脚本只能访问到content页,如果要对其它扩展页面进行操作只能通过content页进行中转.另外sandbox页面也是一样的,唯一的区别是sandbox是只能访问到background页.此种页面类型之间的交互使用dispatchEvent进行消息的交互,如果长链接则在其中定义一个requestId.

