# Cloud Script Export

将单个脚本连同其数据打包为可独立执行的归档，而不是同步到远端云存储 —— 与 `packages/filesystem` 的云同步是两回事,
不要混淆。

`CloudScriptFactory`（[`factory.ts`](./factory.ts)）目前只有一个 target：`local`
（[`local.ts`](./local.ts)）。它把脚本源码、`GM_*` values、cookies 和一份 `config.js` 元数据打进一个 zip,
附带 `package.json`/`utils.js`/`index.js`（模板见 `src/template/cloudcat-package/`）。`package.json` 声明了外部
依赖 `scriptcat-nodejs`，因此产出的包**不是**解压后即可直接 `node index.js` 运行 —— 需要先在解压目录执行
`npm install`（安装 `scriptcat-nodejs`）,再 `npm run run`（等价于 `node index.js`），供脚本迁移或离线执行使用,
不涉及任何远端上传。

云端同步/备份（WebDAV、OneDrive、Google Drive、Dropbox、百度网盘、S3）由
[`packages/filesystem`](../filesystem/README.md) 提供，语义细节见 [`docs/cloud-sync.md`](../../docs/cloud-sync.md)。

