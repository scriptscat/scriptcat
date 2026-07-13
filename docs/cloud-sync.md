# 云同步实现说明

本文是 ScriptCat 云同步的维护文档，描述当前分支上的实际实现。它面向需要修改或 review 同步逻辑的维护者，重点解释同步操作、状态文件、provider 差异、错误分类和生产数据兼容要求。

相关代码入口：

- [`src/app/service/service_worker/synchronize.ts`](../src/app/service/service_worker/synchronize.ts)：同步服务、队列、状态合并、digest 更新。
- [`packages/filesystem/filesystem.ts`](../packages/filesystem/filesystem.ts)：统一文件系统接口、条件操作参数、provider capability。
- [`packages/filesystem/error.ts`](../packages/filesystem/error.ts)：统一 typed provider error。
- [`packages/filesystem/*`](../packages/filesystem/)：各云盘 provider 实现。

## 维护目标

云同步的第一目标不是强事务，而是在浏览器扩展和多 provider 限制下做到“尽量正确且不破坏旧数据”。

必须保持的不变量：

1. 单个脚本失败不能阻塞其他脚本同步。
2. 成功脚本可以推进自己的 `file_digest`，失败脚本必须保留旧 digest。
3. `scriptcat-sync.json` 写回前要合并远端较新状态，避免覆盖其他设备状态。
4. provider 没有声明原子能力时，同步层不能传条件写删参数，也不能把 best-effort 行为描述成 CAS。
5. 旧 `.user.js`、旧 `.meta.json`、旧 `file_digest` string map、缺字段 `scriptcat-sync.json` 必须继续可读。
6. filesystem 包只负责暴露能力、执行文件操作、抛 typed error；同步冲突策略属于 `SynchronizeService`。

## 同步目录和文件

同步目录由云同步配置决定，业务上使用 `ScriptCat/sync` 作为脚本同步目录。同步目录中主要有四类文件。

### `<uuid>.user.js`

脚本源码文件。同步层用文件名中的 `uuid` 和 `FileInfo.digest` 识别脚本及远端内容状态。

### `<uuid>.meta.json`

脚本元信息文件。当前读取时只要求兼容以下字段：

```ts
type SyncMeta = {
  uuid: string;
  origin?: string;
  downloadUrl?: string;
  checkUpdateUrl?: string;
  isDeleted?: boolean;
};
```

`origin`、`downloadUrl`、`checkUpdateUrl` 是安装或更新时的辅助信息。新增字段必须保持 optional，读取旧文件时不能要求存在。

### tombstone 删除标记

当用户启用同步删除时，删除云端脚本不会简单移除所有文件，而是删除 `<uuid>.user.js` 并写入 `<uuid>.meta.json`：

```json
{
  "uuid": "<uuid>",
  "isDeleted": true
}
```

其他设备看到“只有 `.meta.json` 且 `isDeleted: true`”时，会删除本地脚本。当前没有单独的 `tombstone_digest`，也没有 tombstone GC 机制；不要在没有生命周期设计前新增这类状态。

### `scriptcat-sync.json`

保存脚本启用状态、排序和更新时间。当前结构：

```ts
type ScriptcatSync = {
  version: string;
  status: {
    scripts: {
      [uuid: string]: {
        enable: boolean;
        sort: number;
        updatetime: number;
      } | undefined;
    };
  };
};
```

兼容要求：

- 文件可能不存在。
- 文件可能缺少 `status` 或 `status.scripts`。
- 文件可能损坏或无法 JSON parse。
- 写回时必须尽量保留远端较新状态，尤其是本轮失败脚本和 orphan 脚本的状态。

## 本地 `file_digest`

`file_digest` 存在 `ChromeStorage("sync")` 中，用于记录上一次确认同步成功的云端文件 digest。

当前格式：

```ts
type FileDigestMap = {
  [filename: string]: string;
};
```

注意事项：

- digest 是 provider 返回的 opaque token，不一定是 md5。
- WebDAV、S3、OneDrive 使用 ETag 风格 digest。
- Dropbox 使用 `content_hash`。
- Google Drive、Baidu 接近 md5。
- Zip 可能为空。
- 不能用本地 md5 覆盖 provider 已返回的原生 digest。
- 文件操作失败时，对应文件名必须保留旧 digest，不能写入“看起来成功”的新值。

`updateFileDigest()` 会重新 `fs.list()` 构造新 map；对于刚 push 但 provider list 暂时不可见的文件，才使用 `pushScript()` 返回的本地 md5 作为兜底。

## 同步入口和队列

`SynchronizeService` 使用 `SYNC_SERVICE_TASK_KEY = "cloud_sync_queue"` 串行化同步任务。以下入口都会进入同一队列：

- 配置启用后触发的 `syncOnce()`。
- 定时同步，Chrome alarm 名称为 `cloudSync`，周期为 60 分钟。
- 非 sync 来源安装脚本后的 `scriptInstall()`。
- 非 sync 来源删除脚本后的 `scriptsDelete()`。

串行队列很重要：安装、删除和定时同步都可能写同一批云端文件，如果并发执行，会扩大覆盖和 digest 污染风险。

## `syncOnceInternal()` 流程

`syncOnceInternal(syncConfig, fs)` 是主同步流程：

1. 调用 `fs.list()` 获取云端目录。
2. 按文件名把 `<uuid>.user.js` 和 `<uuid>.meta.json` 组装成 `uuidMap`。
3. 读取本地脚本列表，生成 `scriptMap`。
4. 尝试读取 `scriptcat-sync.json`，失败时允许脚本同步继续，但本轮跳过 status 写回。
5. 对每个云端 uuid 和本地脚本做决策。
6. 用 `Promise.allSettled()` 等待所有文件任务，保持 per-file best-effort。
7. 收集成功任务返回的 digest patch。
8. 对失败任务记录 `failedSyncUuids` 和 `preserveDigestFiles`。
9. 如果启用 `syncStatus`，合并本地状态、初始云端状态、写回前重新读取的最新云端状态。
10. 调用 `updateFileDigest()`，成功文件推进 digest，失败文件保留旧 digest。

### 决策规则

本地脚本存在、云端脚本也存在：

- 如果 `.user.js` digest 与 `file_digest` 一致，跳过。
- 如果本地脚本更新时间更晚，push 本地脚本。
- 如果云端更新时间更晚，pull 云端脚本。
- 如果云端缺 `.meta.json`，push 本地脚本补齐 meta。

本地脚本存在、云端只有 `.meta.json`：

- 如果 meta 是 tombstone，本地删除脚本。
- 如果 meta 不是 tombstone，删除无效 meta 并重新 push 本地脚本。

本地脚本不存在、云端 `.user.js` 和 `.meta.json` 都存在：

- pull 并安装云端脚本。

本地脚本不存在、云端只有 `.user.js`：

- 视为 orphan cloud script，跳过。
- 不删除、不覆盖、不清空对应远端 status。

遍历结束后，剩余只存在于本地的脚本会 push 到云端。

## push / pull / delete

### `pushScript()`

`pushScript()` 写两个文件：

- `<uuid>.user.js`
- `<uuid>.meta.json`

`modifiedDate` 使用 `script.updatetime || script.createtime || Date.now()`。

写入参数由 `buildPushCreateOptions()` 决定：

- 云端文件不存在且 provider 支持 `supportsCreateOnly`：传 `createOnly: true`。
- 云端文件存在且 provider 支持 `supportsAtomicCompareAndSwap`，并且 `file_digest` 中有旧 digest：传 `expectedDigest`。
- provider 未声明能力时，只传 `modifiedDate`，保持旧覆盖语义。

`pushScript()` 成功后返回本地计算的 md5 patch，仅用于 provider list 暂时看不到刚上传文件时兜底。它不能覆盖 provider 已返回的原生 digest。

### `pullScript()`

`pullScript()` 会读取源码和 meta：

1. `fs.open(file.script).read("string")`。
2. `fs.open(file.meta).read("string")`。
3. `JSON.parse(meta)`。
4. `prepareScriptByCode()` 解析脚本。
5. 根据 `scriptcat-sync.json` status 调整 enable/sort。
6. `script.installScript({ upsertBy: "sync" })` 写入本地。

真实失败会向上抛出，由 `syncOnceInternal()` 作为单文件失败处理。不要在 `pullScript()` 内吞掉错误，否则会重新引入 digest 污染。

### `deleteCloudScript()`

删除云端脚本时：

- 先删除 `<uuid>.user.js`。
- 如果 `syncDelete` 为 true，写 tombstone meta。
- 如果 `syncDelete` 为 false，删除 `<uuid>.meta.json`。

删除参数由 `buildDeleteOptions()` 决定：

- provider 支持 `supportsConditionalDelete` 且 `file_digest` 有旧 digest 时，传 `expectedDigest`。
- 否则走普通 delete。

失败会向上抛出。`scriptsDelete()` 必须逐条 catch，保证批量删除中一个 uuid 失败不影响后续 uuid。

## status 合并

`scriptcat-sync.json` 是 best-effort 状态同步，不是强事务。合并时遵守以下规则：

1. 本轮文件同步失败的 uuid 保留云端原 status。
2. 本轮刚 pull 的脚本保留云端 status，避免刚按云端更新后又写回本地旧状态。
3. 本地状态更新时间更新时，候选写回本地 status。
4. 云端状态更新时，应用云端 enable/sort 到本地。
5. orphan uuid 的云端 status 保留。
6. 写回前重新读取最新 `scriptcat-sync.json`，再用 `mergeScriptcatSyncStatus()` 合并，减少覆盖其他设备更新的概率。

如果初始读取 `scriptcat-sync.json` 失败，本轮不会写回 status 文件。

## 错误分类

provider 应尽量抛 `FileSystemError`。同步层用 `classifySyncError()` 映射：

| 条件 | `SyncErrorKind` | 语义 |
| --- | --- | --- |
| `FileSystemError.conflict` | `conflict` | 条件写删失败或 provider 冲突 |
| `FileSystemError.rateLimit` 或 `retryable` | `transient` | 429、5xx、可重试错误 |
| `FileSystemError.notFound` | `stale_snapshot` | list 到操作之间远端消失或缓存过期 |
| `FileSystemError.auth` 或 `WarpTokenError` | `fatal` | 授权失败 |
| error message 包含 `unsupported` | `unsupported` | provider 不支持 |
| 其他 | `fatal` | 未分类错误 |

错误分类主要用于日志、保留 digest、后续 retry 策略和 review 判断。它不是用户可见错误协议。

## retry 策略

`LimiterFileSystem` 对不同操作使用不同重试策略：

- 会重试：`verify`、`open`、`read`、`openDir`、`list`、`getDirUrl`。
- 会重试：带 `expectedDigest` 或 `createOnly` 的 `writer.write()`。
- 会重试：带 `expectedDigest` 的 `delete()`。
- 不重试：普通 `create`、`createDir`、普通 `writer.write()`、普通 `delete()`。

原因：没有条件保护的写入和删除不是安全幂等操作。重复执行可能创建重复文件、覆盖并发更新或误删。

## provider 差异

| Provider | digest 来源 | atomic CAS | create-only | conditional delete | 关键实现 |
| --- | --- | --- | --- | --- | --- |
| WebDAV | `etag` | 支持 | 支持 | 支持 | 写入用 `If-Match`；create-only 用 `overwrite: false`；删除用 `If-Match` |
| S3 | `ETag` 去引号 | 支持 | 支持 | 支持 | 写入用 `if-match`；create-only 用 `if-none-match: *`；删除用 `if-match` |
| OneDrive | `eTag` | 支持 | 支持 | 支持 | simple upload / upload session 带 `If-Match` 或 `If-None-Match`；删除带 `If-Match` |
| Google Drive | `md5Checksum` | 不支持 | 不支持 | 不支持 | 先按路径查 fileId，再 PATCH 或 POST；path cache 可能 stale |
| Dropbox | `content_hash` | 不支持 | 不支持 | 不支持 | 先 `exists()`，存在 overwrite，不存在 add；未暴露 rev CAS |
| Baidu | `md5` | 不支持 | 不支持 | 不支持 | precreate/upload/create，`rtype=3` 覆盖；HTTP 429/5xx typed |
| Zip | 空或 zip metadata | 不支持 | 不支持 | 不支持 | 备份用途，不参与云端 CAS |

### WebDAV

WebDAV 是原生条件能力 provider。维护时注意：

- `capabilities` 三项均为 true。
- ETag 写入和删除时需要保持引号，`quoteETag()` 会补齐。
- create-only 依赖 `putFileContents(..., { overwrite: false })`。
- `putFileContents()` 返回 false 时，在 create-only 场景转 typed conflict。
- 删除 404 视为幂等成功。

### S3

S3 是原生条件能力 provider。维护时注意：

- `capabilities` 三项均为 true。
- list 返回的 `ETag` 会去掉引号作为 digest。
- 写入 `expectedDigest` 时发送 `if-match`。
- create-only 发送 `if-none-match: *`。
- 删除 `expectedDigest` 时发送 `if-match`。
- `PreconditionFailed` / 412 转 typed conflict。
- `NoSuchKey` 删除视为成功。

### OneDrive

OneDrive 是原生条件能力 provider。维护时注意：

- `capabilities` 三项均为 true。
- list 使用 `eTag` 作为 digest。
- 空内容走 simple PUT，非空内容走 upload session。
- 条件写会把 `If-Match` / `If-None-Match` 放到 simple PUT 或 upload session 创建请求。
- upload session URL 不带 bearer token，request 层保留这个特殊路径。
- read/delete 使用 raw `Response` 路径，需要手动转 typed error。

### Google Drive

Google Drive 当前不声明 atomic 能力。维护时注意：

- digest 来自 `md5Checksum`。
- 目录和文件通过 appDataFolder + path cache 查 fileId。
- 写入是“先查同名文件，再 PATCH 或 POST”，不是 atomic CAS。
- 删除是“先查 fileId，再 DELETE”，不是 conditional delete。
- reader path lookup miss 已转 typed notFound。
- path cache stale 时 writer/list 会清缓存并重试一次。
- 不要把 `fileId` 或 `fileId:version` 包装成通用 version 语义。

### Dropbox

Dropbox 当前不声明 atomic 能力。维护时注意：

- digest 来自 `content_hash`，必须当作 opaque provider digest。
- 写入是 `exists()` 后 overwrite 或 add，存在 TOCTOU。
- 当前没有使用 Dropbox rev CAS。
- request 层已解析 `error_summary` 和 structured `path_lookup` / `path`。
- raw download 429 会转 typed rateLimit。
- 删除 not_found 视为幂等成功。

### Baidu

Baidu 当前不声明 atomic 能力。维护时注意：

- digest 来自 `md5`。
- 写入流程是 precreate、upload、create，`rtype=3` 覆盖。
- 只把明确 file-exists errno 判为 conflict。
- HTTP 429 转 typed rateLimit。
- HTTP 5xx 转 typed retryable。
- `filemetas` errno 或空列表转 typed notFound。
- request 显式 `credentials: "omit"`，不要重新依赖全局 DNR 规则。
- Baidu 没有被声明为 create-only 或 CAS provider。

### Zip

ZipFileSystem 主要服务备份/导出，不应接入云同步 CAS 语义。它不声明 capabilities。

## 生产兼容要求

改同步逻辑前必须检查：

1. 旧云端目录只有 `.user.js` 和 `.meta.json` 时能否继续同步。
2. 旧 `file_digest` 只有 string digest 时能否继续比较。
3. 旧 `scriptcat-sync.json` 缺字段时是否会崩溃。
4. 损坏 `scriptcat-sync.json` 是否会被本轮覆盖。
5. orphan `.user.js` 是否仍被跳过而不是删除。
6. 单文件失败是否只保留该文件旧 digest。
7. provider 原生 digest 是否被本地 md5 覆盖。
8. 非 atomic provider 是否被错误声明 capability。

## 不要做的事

- 不要把整个 sync round 改成 all-or-nothing。
- 不要在 `pullScript()` 或 `deleteCloudScript()` 内 catch 后吞掉真实失败。
- 不要让失败文件推进 digest。
- 不要在无法读取远端 `scriptcat-sync.json` 时覆盖写回。
- 不要把 Google Drive / Baidu 的 preflight 当 atomic CAS。
- 不要把 Dropbox `content_hash` 当 rev。
- 不要新增 `tombstone_digest`，除非同时定义 GC 和兼容策略。
- 不要对普通无条件写入开启 transient retry。

## 测试重点

同步层测试在 [`src/app/service/service_worker/synchronize.test.ts`](../src/app/service/service_worker/synchronize.test.ts)。provider 测试在各自 `packages/filesystem/*/*.test.ts`。

修改同步逻辑时至少考虑以下场景：

1. 多个文件中一个 push/pull/delete 失败，其他文件继续同步。
2. 失败文件 digest 保留，成功文件 digest 推进。
3. `scriptcat-sync.json` 写回失败不污染文件 digest。
4. 损坏或旧格式 `scriptcat-sync.json` 不阻塞脚本同步。
5. orphan `.user.js` 跳过并保留 status。
6. provider conflict/transient/notFound 能映射到正确 `SyncErrorKind`。
7. 条件写删只在 provider 声明能力时使用。
8. Google Drive / Dropbox / Baidu 明确保持非 atomic capability。

真实 provider 验证仍需要账号和夹具。不能把 unit test 或 mock response 结果宣称为真实云端验证。

