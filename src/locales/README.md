# i18n 方案

i18n 使用[i8next](https://www.i18next.com/)实现，之所以不是用`chrome.i18n`的原因是该方案不支持动态切换语言。但是为了某些扩展市场的要求，我们还是在`src/assets/_locales`目录下添加了`chrome.i18n`的语言文件。

## 语言文件

语言文件位于`src/locales`目录下，按照页面划分，每个页面对应一个语言文件，最终由`locales.ts`合并进行导出。

## 关键字冲突

如果页面中的关键字一样，但是翻译不一样，可以使用`page.key`的方式进行区分，例如：

```yaml
list:
  confirm_delete: 确定要删除吗？请注意这个操作无法恢复！
```
