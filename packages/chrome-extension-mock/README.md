# mock一个chrome扩展环境

`@Packages/chrome-extension-mock` 的默认导出 `chromeMock` 为测试提供 `chrome.*` API mock。仓库测试在
[`tests/vitest.setup.ts`](../../tests/vitest.setup.ts) 中将其注册为全局 `chrome` 并调用 `init()`，以重置下载、权限和
WebRequest mock 的状态。
