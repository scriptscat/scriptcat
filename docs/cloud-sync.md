# 云同步实现说明

本文是 ScriptCat 云同步的维护文档，描述当前分支上的实际实现。它面向需要修改或 review 同步逻辑的维护者，重点解释同步操作、状态文件、provider 差异、错误分类和生产数据兼容要求。

相关代码入口：

- [`src/app/service/service_worker/synchronize.ts`](../src/app/service/service_worker/synchronize.ts)：同步服务、队列、状态合并、digest 更新。
- [`packages/filesystem/filesystem.ts`](../packages/filesystem/filesystem.ts)：统一文件系统接口。
- [`packages/filesystem/error.ts`](../packages/filesystem/error.ts)：统一 typed provider error。
- [`packages/filesystem/*`](../packages/filesystem/)：各云盘 provider 实现。

## 维护目标

云同步的第一目标不是强事务，而是在浏览器扩展和多 provider 限制下做到“尽量正确且不破坏旧数据”。

必须保持的不变量：

1. 单个脚本失败不能阻塞其他脚本同步。
2. 成功脚本可以推进自己的 `file_digest`，失败脚本必须保留旧 digest。
3. `scriptcat-sync.json` 写回前要合并远端较新状态，避免覆盖其他设备状态。
4. provider 写入使用普通覆盖语义；同步层必须诚实记录无法检测的并发覆盖窗口。
5. 旧 `.user.js`、旧 `.meta.json`、旧 `file_digest` string map、缺字段 `scriptcat-sync.json` 必须继续可读。
6. filesystem 包只负责执行文件操作、抛 typed error；同步冲突策略属于 `SynchronizeService`。
7. 本地与云端都改过的脚本（真冲突）不自动覆盖任何一端：跳过、保留基线、聚合通知用户。

功能范围：云同步只同步脚本源码、来源 metadata（`.meta.json`）、启用状态与排序（`scriptcat-sync.json`）。GM storage 值和 `@require`/`@resource` 资源缓存**不**参与云同步（它们只在完整备份/导出路径处理），属于有意取舍，扩展需另行设计（隐私、容量、二进制资源、多端 merge）。

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

digest 更新有两条路径，区别在于对账范围：

- `updateFileDigest()`（`syncOnce` 用）重新 `fs.list()` 全量构造新 map。`syncOnce` 已逐文件对账整份云端列表，可以安全全量盖章。
- `updateFileDigestForUuids()`（`scriptInstall` / `scriptsDelete` 队列用）只更新本次涉及 uuid 的文件。队列路径没有对账整份云端列表，若也全量盖章，会把他端已更新、本机尚未 pull 的文件误标成已同步，导致下一轮 `syncOnce` 早退漏 pull。

两条路径都遵守同一套规则：云端仍在则记录 `fs.list()` 返回的原生 digest；刚 push 但 provider list 暂时不可见时才用 `pushScript()` 返回的本地 md5 兜底；云端已删除则移除记录；失败文件保留旧 digest，不写入“看起来成功”的新值。

## `sync_content_md5`（本地内容基线）

另有一份独立的 `sync_content_md5`（同存 `ChromeStorage("sync")`，格式同 `FileDigestMap`）记录本机每次成功推送**或拉取**的内容 md5，即"上次同步成功时的本地内容基线"。它用于云端变化时判断本地内容是否也发生变化：

- **方向判定（L4 修复）**：云端 digest 相对 `file_digest` 已变时，用本地当前内容 md5 与基线比较判断"本地是否也改过"，取代跨时钟域的墙钟比较（本地毫秒 updatetime vs 服务端整秒 mtime 在同一秒内会误判方向，导致 push 覆盖较新的云端内容）。

它与 `file_digest` 用途不同：`file_digest` 存 provider 原生 digest 检测云端变化，`sync_content_md5` 存本地内容 md5 检测本地变化，二者不可混用。

`sync_content_md5` 随 `file_digest` 生命周期收敛，不会只增不删：`updateFileDigest()` 全量对账后清理 `file_digest` 之外的条目；`updateFileDigestForUuids()` 只清理本次确认已从云端删除的目标文件（队列路径未全量对账，不能全局清理）。

## 同步入口和队列

`SynchronizeService` 使用 `SYNC_SERVICE_TASK_KEY = "cloud_sync_queue"` 串行化同步任务。以下入口都会进入同一队列：

- 配置启用后触发的 `syncOnce()`。
- 定时同步，Chrome alarm 名称为 `cloudSync`，周期为 60 分钟。
- 非 sync 来源安装脚本后的 `scriptInstall()`。push 失败时按 `PushScriptPartialError` 只保留失败文件的旧 digest，已成功文件推进到云端最新值。
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
8. 对失败任务记录 `failedSyncUuids` 和 `preserveDigestFiles`；push 部分失败时（`PushScriptPartialError`），已成功写入云端的文件不保留旧 digest，让下一轮只重试真正失败的文件。
9. 如果启用 `syncStatus`，合并本地状态、初始云端状态、写回前重新读取的最新云端状态。
10. 调用 `updateFileDigest()`，成功文件推进 digest，失败文件保留旧 digest。

### 决策规则

本地脚本存在、云端脚本也存在：

- 云端缺 `.meta.json`（上一轮分片上传残留）：push 本地脚本补齐 meta。
- 云端 digest 与 `file_digest` 一致（云端自上次同步未变）：
  - 本地更新时间不比云端新：跳过。
  - 本地更新时间更晚：补偿 push——云端 digest 检测不到本地编辑，队列 push 失败后也靠这里兜底。
- 云端 digest 与 `file_digest` 不一致（云端自上次同步已变，或本机无记录），由 `decideDirectionOnRemoteChange()` 决定方向。**不比较本地毫秒时钟与服务端整秒 mtime**（对端更新落在同一秒内时"本地时间戳更大"是误报，会 push 覆盖较新的云端内容，即 L4 同秒竞态）：
  - 本地内容 md5 == `sync_content_md5` 基线（本地未改）：pull。
  - 本地内容已改，但与云端当前内容一致（两台设备做了同样编辑，或本机记账失败后云端实为本机所写）：直接采用云端 digest 收敛基线，不产生写操作（adopt）。
  - 本地与云端都改了（真冲突）：抛 `SyncBothChangedConflictError`，本轮跳过该脚本（沿用失败路径保留旧 digest 与云端 status），并聚合通知用户（见下）。
  - 无基线（升级前旧数据/从未同步成功）：退回旧的时间比较规则（时间更晚一方胜出）。
- 冲突通知：一轮同步只发一条通知，列出所有冲突脚本名；同一批脚本持续冲突时后续轮次不重复通知（集合变化后重新通知）。冲突脚本会一直停走，直到某一端内容与另一端一致（自动收敛）或某一端被删除/重装。

注意：push 是普通覆盖写。`list → 决策 → write` 之间存在 TOCTOU 窗口：若对端恰好在这几秒内写入同一文件，后写者胜（last-writer-wins），同步层无法察觉。内容基线只能减少基于旧快照做出错误方向判断的概率，不能消除请求之间的并发窗口。

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
写入使用 provider 的普通覆盖语义，不附加条件请求参数。

`pushScript()` 成功后返回本地计算的 md5 patch，仅用于 provider list 暂时看不到刚上传文件时兜底。它不能覆盖 provider 已返回的原生 digest。

### `pullScript()`

`pullScript()` 会读取源码和 meta：

1. `fs.open(file.script).read("string")`。
2. `fs.open(file.meta).read("string")`。
3. `JSON.parse(meta)`。
4. `prepareScriptByCode()` 解析脚本。
5. 根据 `scriptcat-sync.json` status 调整 enable/sort。
6. `script.installScript({ upsertBy: "sync", updatetime: file.script.updatetime })` 写入本地——本地 updatetime 必须采用云端文件时间（与 push 对称），否则下一轮会把刚拉下来的内容误判为本地编辑触发补偿 push，在 etag 型 provider 上形成双设备永久 pull/push 振荡。
7. 成功后把拉取内容的 md5 记入 `sync_content_md5` 基线，供下轮云端再变时判定本地是否也改过。

真实失败会向上抛出，由 `syncOnceInternal()` 作为单文件失败处理。不要在 `pullScript()` 内吞掉错误，否则会重新引入 digest 污染。

### `deleteCloudScript()`

删除云端脚本时：

- 先删除 `<uuid>.user.js`。
- 如果 `syncDelete` 为 true，写 tombstone meta。
- 如果 `syncDelete` 为 false，删除 `<uuid>.meta.json`。

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
| `FileSystemError.conflict` | `conflict` | provider 报告文件冲突 |
| `FileSystemError.rateLimit` 或 `retryable` | `transient` | 429、瞬时 5xx（500/502/503/504）等可重试错误 |
| `FileSystemError.notFound` | `stale_snapshot` | list 到操作之间远端消失或缓存过期 |
| `FileSystemError.auth` 或 `WarpTokenError` | `fatal` | 授权失败 |
| error message 包含 `unsupported` | `unsupported` | provider 不支持 |
| 其他 | `fatal` | 未分类错误 |

错误分类主要用于日志、保留 digest、后续 retry 策略和 review 判断。它不是用户可见错误协议。

## retry 策略

`LimiterFileSystem` 对不同操作使用不同重试策略：

- 会重试：`verify`、`open`、`read`、`openDir`、`list`、`getDirUrl`。
- 不重试：`create`、`createDir`、`writer.write()`、`delete()`。

原因：写入和删除不是安全幂等操作。重复执行可能创建重复文件、覆盖并发更新或误删。

typed `retryable` 只覆盖瞬时 5xx（500/502/503/504）。501、505、507 等属于永久失败，不标记可重试，避免 limiter 空转退避。

## provider 差异

| Provider | digest 来源 | 写入方式 | 关键实现 |
| --- | --- | --- | --- |
| WebDAV | `etag` | 普通覆盖写入 | `putFileContents()` |
| S3 | `ETag` 去引号 | 普通覆盖写入 | PUT Object |
| OneDrive | `eTag` | 普通覆盖写入 | simple PUT / upload session |
| Google Drive | `md5Checksum` | 普通覆盖写入 | 先按路径查 fileId，再 PATCH 或 POST；path cache 可能 stale |
| Dropbox | `content_hash` | 普通覆盖写入 | 先 `exists()`，存在 overwrite，不存在 add |
| Baidu | `md5` | 普通覆盖写入 | precreate/upload/create，`rtype=3` 覆盖；HTTP 429/5xx typed |
| Zip | 空或 zip metadata | 普通覆盖写入 | 备份用途 |

### WebDAV

维护时注意：

- `putFileContents()` 返回 false 时转为写入失败。
- 删除 404 视为幂等成功。

### S3

维护时注意：

- list 返回的 `ETag` 会去掉引号作为 digest。
- `PreconditionFailed` / 412 转 typed conflict。
- `NoSuchKey` 删除视为成功。

### OneDrive

维护时注意：

- list 使用 `eTag` 作为 digest。
- 空内容走 simple PUT，非空内容走 upload session。
- upload session URL 不带 bearer token，request 层保留这个特殊路径。
- read/delete 使用 raw `Response` 路径，需要手动转 typed error。

### Google Drive

Google Drive 维护时注意：

- digest 来自 `md5Checksum`。
- 目录和文件通过 appDataFolder + path cache 查 fileId。
- 写入是“先查同名文件，再 PATCH 或 POST”。
- 删除是“先查 fileId，再 DELETE”。
- reader path lookup miss 已转 typed notFound。
- path cache stale 时 writer/list 会清缓存并重试一次。

### Dropbox

Dropbox 维护时注意：

- digest 来自 `content_hash`，必须当作 opaque provider digest。
- 写入是 `exists()` 后 overwrite 或 add，存在 TOCTOU。
- request 层已解析 `error_summary` 和 structured `path_lookup` / `path`。
- 只有 `path/conflict` / `path_write/conflict` 判 conflict；其余 409（无写权限、空间不足等）保留原错误语义，不能被 createDir 当"目录已存在"吞掉。
- raw download 429 会转 typed rateLimit。
- 删除 not_found 视为幂等成功。

### Baidu

Baidu 维护时注意：

- digest 来自 `md5`。
- 写入流程是 precreate、upload、create，`rtype=3` 覆盖。
- 只把明确 file-exists errno 判为 conflict。
- HTTP 429 转 typed rateLimit，瞬时 5xx（500/502/503/504）转 typed retryable。
- 2xx 非 JSON 响应（如代理返回 HTML）会报错，不能当作成功——否则 list 会被判空触发全量覆盖。
- `filemetas` 空列表强制转 typed notFound（errno -9）；服务端返回的其他 errno 走通用 errno 分类，不一定是 notFound。
- request 显式 `credentials: "omit"`，不要重新依赖全局 DNR 规则。

### Zip

ZipFileSystem 主要服务备份/导出。

## 覆盖/冲突可见性

云同步在 best-effort、last-writer-wins 下可能静默覆盖或停走脚本。为让用户可感知、可回溯，增加了三处可见性（**不改变同步语义**，只增加提示与记录）。

### 同步状态 `cloud_sync_state`

`syncOnce()` 每轮把设备本地同步状态写入 `ChromeStorage("sync")`（即 `chrome.storage.local`，物理键 `sync_cloud_sync_state`）：

```ts
type CloudSyncState = {
  syncing: boolean;
  lastSyncAt: number; // ms，从未同步为 0
  error?: string; // 最近一次失败原因（如账号验证失败）
  counts: { total: number; overwrite: number; conflict: number; failed: number };
};
```

- 开始置 `syncing:true`，结束写 `counts`/`lastSyncAt`，异常写 `error`。注意：读旧值与写 `syncing` **不能** await 在 `syncOnceInternal` 之前，否则存储 I/O 会推迟内部起始，打乱测试的微任务门控。
- 设置页「脚本同步」卡片顶部状态条（`SyncSection.tsx` + `syncStatus.ts`）读取并订阅 `chrome.storage.onChanged` 实时展示四态：正常 / 同步中 / 有覆盖或冲突（琥珀警示）/ 失败。单文件 best-effort 失败通过 `counts.failed` 显示为失败，不能回落成“同步正常”。
- `立即同步` 按钮经 `SynchronizeClient.cloudSyncOnce()` → SW `group.on("cloudSyncOnce")` → 用**已保存**配置跑一次 `syncOnce`（未启用则不触发）。构建文件系统失败发生在 `syncOnce()` 之前，因此 `cloudSyncOnce()` 会单独写入 `error` 状态并向 UI 抛出，由设置页显示 toast。

### 覆盖日志（`action` 标签）

`decideDirectionOnRemoteChange()` 的**无内容基线兜底**分支（`baselineMd5 === undefined`）只能按跨时钟域墙钟比较 pull/push，可能覆盖未知改动。该分支返回 `{ action, unverified: true }`，调用点据此打警告日志：

```ts
this.logger.warn("sync overwrite", { action: "overwrite", direction, uuid, name });
```

日志经现有 `LoggerDAO` 落 IndexedDB（`service: "synchronize"`）。日志 `message` 保持稳定英文标识（与既有同步日志一致），人类可读文案由状态条与通知承载。

### 通知与深链

本轮有覆盖时聚合一条 `InfoNotification`，点击打开 `/src/options.html#/logs?query=...`。覆盖和冲突的已通知集合存入设备本地 sync storage，因此 MV3 Service Worker 重启后同一批问题也不会重复通知；集合或覆盖方向变化时重新提醒，问题消失时清空。

`?query` 载荷 `[{key,value}]` 由 Logger 页 `parseInitialQueries` 解析。只有纯覆盖状态才预过滤到 `service=synchronize` 且 `action=overwrite`；存在冲突或失败时只过滤 `service=synchronize`，避免把对应失败日志隐藏掉。覆盖通知与状态文案使用中性“同步时发生覆盖”，具体是本地覆盖云端还是云端覆盖本地以日志的 `direction` 标签为准。

### 边界

- 日志按 `LogCleanCycle`（默认 7 天，`LoggerDAO.deleteBefore`）自动清理，回溯窗口约最近 7 天。
- `overwrite` 只覆盖「无基线兜底」这一**可检测**的静默覆盖；纯 TOCTOU last-writer-wins（见上文 push 一节）客户端无法察觉，不在本轮可见性范围内。

## 生产兼容要求

改同步逻辑前必须检查：

1. 旧云端目录只有 `.user.js` 和 `.meta.json` 时能否继续同步。
2. 旧 `file_digest` 只有 string digest 时能否继续比较。
3. 旧 `scriptcat-sync.json` 缺字段时是否会崩溃。
4. 损坏 `scriptcat-sync.json` 是否会被本轮覆盖。
5. orphan `.user.js` 是否仍被跳过而不是删除。
6. 单文件失败是否只保留该文件旧 digest。
7. provider 原生 digest 是否被本地 md5 覆盖。

## 不要做的事

- 不要把整个 sync round 改成 all-or-nothing。
- 不要在 `pullScript()` 或 `deleteCloudScript()` 内 catch 后吞掉真实失败。
- 不要让失败文件推进 digest。
- 不要在无法读取远端 `scriptcat-sync.json` 时覆盖写回。
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
7. 云端已变、本地内容基线未变时必须 pull——即使本地 updatetime 大于云端 mtime（同秒竞态 L4）。
8. 本地与云端都变（真冲突）时不 push 不 pull，保留旧 digest 与云端 status，一轮只发一条聚合通知，同一批冲突不重复通知。
9. 云端已变、本地也变但内容与云端一致时，收敛基线且不产生写操作。
10. 无内容基线（升级前旧数据）时退回时间比较规则。
11. 队列路径 digest 只更新本次 uuid 文件，不全量盖章漏 pull。
12. 同步失败计数必须在设置页显示为失败，不能显示为同步正常。
13. 冲突或失败状态的日志深链不能被覆盖过滤条件隐藏。

真实 provider 验证仍需要账号和夹具。不能把 unit test 或 mock response 结果宣称为真实云端验证。
