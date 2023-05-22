# i18n 方案

i18n 使用[i8next](https://www.i18next.com/)实现，之所以不是用`chrome.i18n`的原因是该方案不支持动态切换语言。但是为了某些扩展市场的要求，我们还是在`build/assets/_locales`目录下添加了`chrome.i18n`的语言文件。

## 语言文件

语言文件位于`src/locales`目录下，每个语言文件夹下有一个`translation.json`文件，该文件 i18next 的语言文件，与`chrome.i18n`的`message.json`不同。
