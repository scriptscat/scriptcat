# scriptcat-userscript

给 AI 编码代理（Claude Code、Codex 等）用的 Skill：指导编写、修改、调试脚本猫用户脚本——页面脚本（`@match`）、
后台脚本（`@background`）、定时脚本（`@crontab`），并在接入 [sctl](https://github.com/scriptscat/sctl) 时
把脚本装进用户的脚本猫、在真实浏览器里验证。

## 结构

| 文件 | 内容 |
|---|---|
| `SKILL.md` | 入口：选脚本类型、骨架、容易写错的规则、安装与验证的分流 |
| `references/api.md` | 脚本猫实现的全部 GM / CAT API（按 grant 分组），以及与 Tampermonkey 的差异 |
| `references/background.md` | 后台/定时脚本：Promise 生命周期、`CATRetryError` 重试、cron 与 `once` 扩展、日志 |
| `references/userconfig.md` | `==UserConfig==` 用户配置格式 |
| `references/patterns.md` | 常用写法：等待元素、SPA 路由切换、带记忆的菜单开关、跨域请求、样式、多语言、带重试的后台运行 |
| `references/dev-loop.md` | 用 sctl 侦察页面 → 安装 → 看控制台 → 重装或 `sctl edit` 迭代；本地文件热重载（`@require file:///` 壳脚本）；用 `sctl run` / `sctl logs` 运行后台脚本并读日志，旧版本退回探针脚本 |
| `scripts/check.mjs` | 零依赖静态检查：未声明 grant、`@grant none` 误用、缺 `@match`、cron 写法、`@connect` 缺失等；有 error 时退出码 1 |
| `scripts/stub.mjs` | 生成本地热重载用的 `@require file:///` 壳脚本 |

API 以 `src/types/scriptcat.d.ts` 和 `src/pkg/utils/script_compat.ts`（支持的指令与 grant 白名单）为准；
修改这两处时同步检查本 Skill。`scripts/check.mjs` 内置的 grant 清单由 `check.test.mjs` 对照 `SUPPORTED_GRANTS` 守卫，
依赖注入表（`DEPENDS`）与 `src/app/service/content/gm_api/` 的 `depend` 声明需手工同步。sctl 本身的操作规范在 sctl 仓库的 `skills/sctl`，这里只引用、不重复。

## 安装

通过 [scriptscat/skills](https://github.com/scriptscat/skills) 插件市场安装，之后可以检查更新（更新方式见该仓库的 README）。
建议同时安装 `sctl`。

```text
# Claude Code
/plugin marketplace add scriptscat/skills
/plugin install scriptcat-userscript@scriptcat

# Codex
codex plugin marketplace add scriptscat/skills
codex plugin add scriptcat-userscript@scriptcat
```

插件市场从本仓库 `main` 分支的 `skills/` 目录取文件。Codex 要求插件根下有清单，所以 `skills/.codex-plugin/plugin.json`
指向本目录；目录改名或移动时同步修改它和插件市场的目录文件。

开发本 Skill 时改用软链，改动立即生效：

```sh
ln -s "$(pwd)/skills/scriptcat-userscript" ~/.claude/skills/scriptcat-userscript
ln -s "$(pwd)/skills/scriptcat-userscript" ~/.codex/skills/scriptcat-userscript
```

## 已知限制

- `sctl run` / `sctl logs` 需要 sctl 与脚本猫都升级到包含 scriptscat/sctl#17 与 scriptscat/scriptcat#1825 的版本。旧 sctl 不认识
  `run`，旧脚本猫返回 `METHOD_NOT_FOUND` 并提示升级；Skill 遇到这两种情况会退回 `references/dev-loop.md` 里的间接办法（重装即重跑
  `@background`、测试时临时改成每分钟的 cron、用共享 `@storageName` 的探针页面脚本把进度打到控制台）。
- 脚本猫正式版不把 `debug` 级别的 `GM_log` 写进日志，日志页与 `sctl logs` 都看不到。
- 运行状态事件不带运行 id：`sctl run` 等待期间如果用户在编辑器里点运行或 cron 触发，返回的状态可能属于那一次运行。
