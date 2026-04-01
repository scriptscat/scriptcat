# i18n Solution

The i18n implementation uses [i18next](https://www.i18next.com/). We chose this over `chrome.i18n` because the latter
does not support dynamic language switching. However, to meet the requirements of certain extension markets, we still
add `chrome.i18n` language files in the `src/assets/_locales` directory.

## Language Files

Language files are located in the `src/locales` directory and are divided by pages, with each page having a
corresponding language file. These files are ultimately merged and exported through `locales.ts`.

## Keyword Conflicts

If keywords in a page are the same but their translations differ, you can distinguish them using the `page.key` format,
for example:

```json
{
  "list": {
    "confirm_delete": "Are you sure you want to delete? Please note that this is an irreversible operation.",
    "confirm_update": "Are you sure you want to update? Please note that this is an irreversible operation."
  }
}
```

### Help Us Translate

[Crowdin](https://crowdin.com/project/scriptcat)
is an online localization platform that helps us manage translations. If you're interested in helping us translate ScriptCat, you can find the project on Crowdin and start contributing.

- `src/locales` is the translation file directory for the [extension](https://github.com/scriptscat/scriptcat)

# i18n 方案

i18n 使用[i8next](https://www.i18next.com/)实现，之所以不是用`chrome.i18n`的原因是该方案不支持动态切换语言。但是为了某些扩展市场的要求，我们还是在`src/assets/_locales`目录下添加了`chrome.i18n`的语言文件。

## 语言文件

语言文件位于`src/locales`目录下，按照页面划分，每个页面对应一个语言文件，最终由`locales.ts`合并进行导出。

## 关键字冲突

如果页面中的关键字一样，但是翻译不一样，可以使用`page.key`的方式进行区分，例如：

```json
{
  "list": {
    "confirm_delete": "确定要删除吗？请注意这个操作无法恢复！",
    "confirm_update": "确定要更新吗？请注意这个操作无法恢复！"
  }
}
```

### 帮助我们翻译

[Crowdin](https://crowdin.com/project/scriptcat)
是一个在线的多语言翻译平台。如果您有兴趣帮助我们翻译 ScriptCat 的相关内容，您可以在 Crowdin 上找到 ScriptCat 项目，并开始进行翻译工作。

- `src/locales`为[扩展](https://github.com/scriptscat/scriptcat)翻译文件目录
