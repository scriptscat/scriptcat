# 云同步一致性与生产兼容性研究

## 目标

本分支用于研究 ScriptCat 云同步在多设备、多 provider、网络异常、并发修改和旧数据兼容场景下的正确性问题。目标不是把 PR #1439 原样搬进来，而是在 `upstream/main` / `main` 现有同步语义上做可验证、可分阶段合并的修复。

核心目标：

1. 避免云端文件被静默覆盖。
2. 避免失败同步污染本地 `file_digest` 或远端 `scriptcat-sync.json`。
3. 保持现有生产用户云端数据兼容，不要求手动迁移。
4. 不把 per-file best-effort 同步退化成整轮 all-or-nothing。
5. 将 provider 能力、同步策略、错误分类和用户通知分层处理。

## 当前同步架构

入口在 `src/app/service/service_worker/synchronize.ts` 的 `SynchronizeService`。云同步由 `buildFileSystem()` 建立 provider 文件系统，然后通过 `syncOnce()` 进入 `cloud_sync_queue` 串行队列，最终执行 `syncOnceInternal()`。安装脚本和删除脚本的消息也复用同一个队列，避免和定时同步并发写云端。

### `syncOnceInternal`

当前流程：

1. `fs.list()` 读取 `ScriptCat/sync` 目录。
2. 按文件名把 `<uuid>.user.js` 和 `<uuid>.meta.json` 组装成 `uuidMap`。
3. 从本地 DAO 读取脚本列表，生成 `scriptMap`。
4. 如果存在 `scriptcat-sync.json`，读取其中的 `status.scripts` 作为云端状态。
5. 遍历 `uuidMap` 决定每个 uuid 的动作：
   - 本地脚本存在，云端只有 `.meta.json`：如果 meta 是 tombstone，则本地删除；否则删除无效 meta 并重新 push。
   - 本地脚本存在，云端 `.user.js` digest 与 `file_digest` 一致：跳过。
   - 本地脚本更新时间更晚，或云端缺 `.meta.json`：`pushScript()`。
   - 云端更新时间更晚：`pullScript()`。
   - 本地脚本不存在但云端 `.user.js` 和 `.meta.json` 都存在：`pullScript()` 安装。
   - 云端只有 `.user.js`、没有 `.meta.json`：跳过并记录 orphan uuid，避免误删或覆盖半上传文件。
6. 剩余本地脚本全部 `pushScript()`。
7. `Promise.allSettled()` 等待所有任务；fulfilled 且返回 digest patch 的任务合并到 `pushedFileDigestMap`。
8. 如果开启 `syncStatus`，用本地状态和 `scriptcat-sync.json` 的 status 时间戳合并 enable/sort，然后直接 `fs.create("scriptcat-sync.json")` 覆盖写回。
9. `updateFileDigest(fs, pushedFileDigestMap)` 重新 list 云端，把当前云端 digest 写入本地 `file_digest`；如果刚 push 的文件未出现在 list 里，用本地 md5 兜底。

重要现状：当前 `syncOnceInternal()` 仍保持 task 级 `Promise.allSettled()`，不会因为单个 push/pull Promise rejected 而停止所有任务；但 `pullScript()` 和 `deleteCloudScript()` 内部会 catch 后只记录日志，导致上层无法知道真实失败。

### `pushScript`

`pushScript(fs, script)` 当前无条件覆盖写：

1. 写 `${uuid}.user.js`，`modifiedDate` 使用脚本 `updatetime || createtime || Date.now()`。
2. 从 `scriptCodeDAO` 读取源码并写入 `.user.js`。
3. 写 `${uuid}.meta.json`，内容包含 `uuid`、`origin`、`downloadUrl`、`checkUpdateUrl`。
4. 返回本地计算的 md5 digest patch，供 `updateFileDigest()` 在云端 list 暂时不可见时兜底。

风险：`fs.create()` 的 provider 实现通常是覆盖写或先查再写，当前没有 create-only、expected digest、expected version，也没有原子 CAS。

### `pullScript`

`pullScript(fs, file, status, existingScript?)` 当前流程：

1. 读取 `.user.js` 源码。
2. 读取 `.meta.json` 并 `JSON.parse`。
3. `prepareScriptByCode()` 解析脚本元信息。
4. 如果有 `scriptcat-sync.json` status，则根据 status 更新时间决定 enable/sort。
5. `script.installScript({ upsertBy: "sync" })` 写入本地。
6. catch 所有异常，只记录日志，不向调用方抛出。

风险：下载、解析、安装失败都会被视为任务 fulfilled，后续可能继续写 `scriptcat-sync.json` 和 `file_digest`，造成状态污染。另一方面，不能简单把所有错误都抛成整轮失败，因为坏单文件不应卡死其他脚本。

### `deleteCloudScript`

`deleteCloudScript(fs, uuid, syncDelete)` 当前流程：

1. 删除 `${uuid}.user.js`。
2. 如果 `syncDelete` 为 true，写 `${uuid}.meta.json` tombstone：`{ uuid, isDeleted: true }`。
3. 如果 `syncDelete` 为 false，删除 `${uuid}.meta.json`。
4. catch 所有异常，只记录日志，不向调用方抛出。

风险：删除失败、tombstone 写失败或 meta 删除失败都会被调用方当作成功；`scriptsDelete()` 随后仍会 `updateFileDigest()`。

### `updateFileDigest`

`file_digest` 是本地 `ChromeStorage("sync")` 中的 digest cache。当前 `updateFileDigest()` 会：

1. `fs.list()` 读取云端当前文件。
2. 用云端返回的 `file.digest` 生成完整新 map。
3. 对刚 push 但 list 缺失的文件，用 `knownFileDigestMap` 的本地 md5 兜底。
4. `storage.set("file_digest", newFileDigestMap)` 全量替换。

当前实现已经避免在云端 list 返回 provider 原生 digest 时用本地 md5 覆盖它，这对 WebDAV/OneDrive/S3 的 ETag 和 Dropbox content_hash 很关键。

仍需注意：全量替换适合“完整 list 成功”场景；如果某个文件操作失败但 `updateFileDigest()` 仍基于新 list 全量写入，失败文件也可能被推进。

### `scriptInstall`

非 sync 来源安装脚本时：

1. 读取云同步配置。
2. 如果启用，进入 `cloud_sync_queue`。
3. `buildFileSystem()`。
4. `pushScript()`。
5. `updateFileDigest(fs, pushedFileDigestMap)`。

失败只记录日志。这个路径的本地安装已经成功，云端失败可由后续定时 sync 补偿；通知需要谨慎，避免 transient 失败造成噪声。

### `scriptsDelete`

非 sync 来源删除脚本时：

1. 过滤 `deleteBy === "sync"` 的事件，避免同步拉取/删除造成回灌。
2. 如果启用云同步，进入 `cloud_sync_queue`。
3. `buildFileSystem()`。
4. 顺序调用 `deleteCloudScript()`。
5. `updateFileDigest(fs)`。

当前 `deleteCloudScript()` 吞错，所以循环会继续；如果未来改为抛错，必须逐条 catch，否则批量删除中第 3 条失败会阻止后续 7 条处理。

## 同步文件语义

### `.user.js`

每个脚本的源码文件，命名为 `<uuid>.user.js`。当前同步判断主要看它的 `digest` 和 `updatetime`。

### `.meta.json`

每个脚本的同步元信息，命名为 `<uuid>.meta.json`。生产旧格式大致为：

```ts
type SyncMeta = {
  uuid: string;
  origin?: string;
  downloadUrl?: string;
  checkUpdateUrl?: string;
  isDeleted?: boolean;
};
```

旧用户云端可能只有这些字段。新增字段必须 optional，读取时必须容忍缺失。

### tombstone 删除标记

当 `syncDelete` 开启时，删除云端脚本不是简单移除所有文件，而是保留 `.meta.json` 且写入 `isDeleted: true`。其他设备看到“只有 meta 且 isDeleted=true”时会删除本地脚本并通知用户。

不建议立即新增独立 `tombstone_digest`。它会引入生命周期、清理时机和最终一致性下误保留的问题；除非先定义 GC 规则，否则会增加状态面。

### `scriptcat-sync.json`

保存脚本启用状态、排序和更新时间：

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

当前写回是覆盖式 `fs.create("scriptcat-sync.json")`。生产兼容要求：

- 旧文件可能没有未来新增字段。
- orphan `.user.js` 对应 uuid 的远端 status 必须保留，避免本机把另一台设备半上传状态覆盖掉。
- 一轮同步中失败的 uuid 不应导致 status 被错误清空或推进。
- 写回前应尽量基于最新远端状态合并，避免覆盖其他设备刚写入的 status。

### `file_digest`

本地 digest cache，当前格式是：

```ts
type FileDigestMap = {
  [filename: string]: string;
};
```

生产兼容要求：

- 旧记录只有 digest，没有 version/provider token。
- 新逻辑必须能读取旧格式。
- 新增结构时应支持 string 旧值和 object 新值并存。
- digest 只能代表“上轮已确认成功同步的远端文件状态”，不能写入失败任务的结果。

## Provider 实现差异

当前 `FileSystem` 接口已经有最小 capabilities，并允许 `create()` / `delete()` 接收条件参数：

- `supportsAtomicCompareAndSwap`
- `supportsCreateOnly`
- `supportsConditionalDelete`
- `FileCreateOptions.expectedDigest`
- `FileCreateOptions.createOnly`
- `FileDeleteOptions.expectedDigest`

同步层只在 provider 显式声明能力时传条件参数；未声明能力的 provider 继续保持旧覆盖语义，避免把 best-effort preflight 伪装成 atomic CAS。

| Provider | `list()` digest | `create()` 当前语义 | `delete()` 当前语义 | 关键差异 |
| --- | --- | --- | --- | --- |
| WebDAV | `etag` | `putFileContents` 覆盖写；有能力时支持 `If-Match` / `overwrite=false` | 404 幂等成功；有能力时支持 `If-Match` | 原生条件写/删；create-only false 响应已转 typed conflict |
| S3 | 去引号 ETag | PUT 覆盖写；有能力时支持 `If-Match` / `If-None-Match` | DELETE 幂等，`NoSuchKey` 成功；有能力时支持 `If-Match` | 原生条件请求；412 / `PreconditionFailed` 归类为 typed conflict |
| OneDrive | `eTag` | simple/upload session；有能力时传 `If-Match` / `If-None-Match` | raw Response 路径，404 成功；有能力时传 `If-Match` | 原生条件请求；`nothen=true` raw response 路径已覆盖 429/404/409/412 typed error 测试 |
| Google Drive | `md5Checksum` | 查同名后 PATCH 或 POST | 先查 fileId 再 DELETE，404 成功 | 未声明 atomic/create-only/conditional delete；path cache 和同名文件仍是主要风险 |
| Dropbox | `content_hash` | 先 `exists()`，存在 overwrite，不存在 add | `delete_v2`，typed not_found 幂等成功 | rev 未暴露；request 层已把 not_found/conflict/rate-limit 转 typed error |
| Baidu | `md5` | precreate/upload/create，`rtype=3` 覆盖 | filemanager delete，非 0 errno 转 typed error | 未声明 atomic 能力；只有明确 file-exists errno 才标记 conflict |
| Zip | 空或 JSZip 元数据 | 本地 zip 写入 | 删除 zip entry | 备份用途，不应强行接入云端 CAS 语义 |

`LimiterFileSystem` 当前只对白名单操作的 transient 错误自动重试：`verify/open/read/openDir/list/getDirUrl`，以及受 `expectedDigest` / `createOnly` 保护的 `write` 和受 `expectedDigest` 保护的 `delete`。普通 `create/createDir/write/delete` 仍不重试，避免重复非幂等写。

## 已确认问题

1. 静默覆盖：`fs.create()` 默认覆盖，两个设备基于旧快照修改同一文件时后写覆盖先写。
2. 失败后状态污染：本分支已修复主要路径，push/pull/delete 失败文件保留旧 `file_digest`；失败 uuid 的 status 回写会保留云端状态。
3. `pullScript()` 吞错：本分支已改为让真实失败向上表现为单文件任务失败。
4. `deleteCloudScript()` 吞错：本分支已改为删除或 tombstone 写失败时向上抛错，批量删除调用方逐条 catch。
5. orphan `.user.js`：当前已跳过且保留 status，这是正确方向；后续不能回退成删除或覆盖。
6. `scriptcat-sync.json` 覆盖写：本分支已在写回前重新读取并合并远端最新状态；仍需真实 provider 环境验证竞态窗口。
7. provider 能力不一致：本分支用 capabilities 控制条件操作，未把 Google Drive / Baidu preflight 声明为 atomic。
8. 错误类型不完整：WebDAV/S3/OneDrive/GoogleDrive/Dropbox/Baidu 的关键 404/409/412/429/5xx 路径已有 typed error 覆盖；普通网络错误仍可能保持原始 Error。
9. transient 写失败有限 retry：本分支只对有条件保护的 `write/delete` 开启 retry；无条件写/删仍直接失败。
10. 通知策略未分层：安装/删除触发的 transient 同步失败不一定应该马上打扰用户。

## PR #1439 分析

PR #1439 试图修复多设备并发写入、删除、拉取/推送失败导致的静默覆盖和状态污染。方向上，它抓到了真实问题：写入应带前置条件，失败不能推进本地 digest，provider 错误应类型化，tombstone 和 orphan 需要明确语义。

### cyfung1031 的改动意图

- 给 `FileInfo` 增加 version 类 token。
- 给 create/delete 增加 expected digest/version 和 createOnly。
- provider 使用 ETag/rev/version/content_hash/md5 做条件写入或 preflight。
- `syncOnceInternal()` 在失败时避免继续推进 `scriptcat-sync.json` 和 `file_digest`。
- 处理 orphan `.user.js`、tombstone 收敛、Google Drive 重名、Baidu errno、OneDrive/Google raw response 等具体问题。
- 增加同步失败通知和大量 provider/sync 测试。

### CodFrm review 核心意见

CodFrm 的核心担忧是：PR 修了“报错”，但没有保留“消化错误”的粒度。旧代码的问题是 silent data loss，新代码的风险是 all-or-nothing 事务。

需要吸收的意见：

- filesystem 包不应承担业务冲突策略；它应暴露原子能力、条件操作和 typed error，同步层决定业务冲突处理。
- 99 个成功 + 1 个失败时，成功文件 digest 应推进，失败文件保留旧 digest，下轮只重试失败文件。
- transient、conflict、fatal、unsupported 应分类，不能都当作整轮失败。
- status sync 是 best-effort，单个 enable/sort 更新失败不应让整轮 sync 卡死。
- `pullScript()` 不应吞掉真实失败，但坏 `.meta.json` 或坏 userscript 也不应卡死整个账号。
- `deleteCloudScript()` 抛错后，`scriptsDelete()` 必须逐条 catch，不能中断后续 uuid。
- 安装/删除事件触发的同步通知要节流，transient 失败可让定时同步兜底。
- `updateFileDigest()` 的 list retry / known digest 兜底不能掩盖 provider 最终一致性和 digest 格式差异。
- Google Drive 的 `fileId:version` 不应被包装成通用 version 语义。
- `tombstone_digest` 会带来额外生命周期和 GC 问题。

### Copilot / reviewer 指出的问题

- `FileSystem.delete()` 签名改变后必须更新所有实现，例如 zip，否则 TypeScript 接口不匹配。
- Baidu `createOnly` 不能把所有非 0 `errno` 都判为 conflict；只能匹配明确 file-exists / duplicate-name 错误。
- Dropbox 不能靠 message string 长期判断冲突，应在 request 层转换 typed error。
- OneDrive / Google Drive 的 `nothen=true` raw response 调用点必须全部审计，否则 typed error 不完整。

### 正确方向

- 保持旧数据可读，新增字段 optional。
- 成功文件和失败文件分开推进状态。
- provider 层暴露能力和原子操作，不写业务策略。
- 能 atomic 的 provider 使用原生条件写；只能 preflight 的 provider 明确标记 best-effort。
- orphan `.user.js` without `.meta.json` 跳过并保留远端 status。
- `scriptcat-sync.json` 写回前合并远端最新状态，避免覆盖其他设备。

### 可能过度设计或破坏语义的方向

- 一次性改所有 provider、通知、tombstone digest、导出、alarm，改动面过大。
- 任一文件失败就跳过全部 digest 更新，导致成功文件下轮重做甚至自冲突。
- filesystem 层承载“同步冲突业务策略”，增加包职责。
- 将 Google Drive `fileId:version` 暴露为通用 `version`。
- 独立 `tombstone_digest` 未定义 GC 前就落地。
- 每个 install/delete transient 失败都通知用户。

## 兼容生产数据的设计原则

1. 读旧格式：`.meta.json`、`scriptcat-sync.json`、`file_digest` 必须容忍缺字段。
2. 写新格式要 optional：新增字段不能成为读取旧数据的前提。
3. per-file best-effort：成功文件推进自己的 digest，失败文件保留旧 digest。
4. 状态推进绑定真实成功：失败任务不得写成功 digest，不得覆盖对应 status。
5. `scriptcat-sync.json` 合并写：保留 orphan、失败 uuid 和远端较新的 status。
6. provider token opaque：同步层只传回 provider 给出的 token，不解析 provider 内部结构。
7. 明确 atomic vs best-effort：preflight 只能降低风险，不能宣称 CAS。
8. transient 有限 retry：只在幂等或有条件保护的写路径开启。
9. 通知节流：按 sync round 聚合，不逐文件弹。

## 分阶段实现计划

### Phase 1：研究文档和测试基线

只更新 `docs/sync-research.md` 和文档索引。提交前不改 runtime 代码。

### Phase 2：最小测试

先写失败测试，覆盖：

- 99 个文件成功、1 个文件失败时，成功文件 digest 可推进，失败文件不推进。
- `pullScript()` 失败不能写入成功 digest。
- `deleteCloudScript()` 失败不能推进 digest。
- orphan `.user.js` without `.meta.json` 跳过且保留 `scriptcat-sync.json` status。
- syncStatus 单个 enable/sort 更新失败不能卡死整轮。

### Phase 3：最小实现

不引入 provider CAS，先修同步层状态污染：

- 让 `pullScript()` 对真实失败向上返回失败，但坏远端单文件只阻塞该 uuid。
- 让 `deleteCloudScript()` 返回成功/失败结果；`scriptsDelete()` 逐条 catch 并继续。
- `syncOnceInternal()` 记录成功 uuid 和失败 uuid。
- `updateFileDigest()` 支持基于旧 digest map + 成功 patch 的局部推进，失败文件保留旧值。
- 有失败时 `scriptcat-sync.json` 只写安全合并结果，或跳过会污染的 uuid。

### Phase 4：capabilities 和 typed error

新增最小能力描述，而不是把冲突策略塞进 filesystem：

```ts
type FileSystemCapabilities = {
  supportsAtomicCompareAndSwap: boolean;
  supportsCreateOnly: boolean;
  supportsConditionalDelete: boolean;
};
```

错误分类建议：

```ts
type SyncErrorKind = "conflict" | "stale_snapshot" | "transient" | "unsupported" | "fatal";
```

本分支当前已实现 capabilities、provider typed error 的关键路径、同步层 `SyncErrorKind` 日志分类（包括 `syncOnce` per-file 失败、`scriptInstall` 排队 push 失败、`scriptsDelete` 单项删除失败），以及读类和受条件保护写/删的 transient 有限 retry。

### Phase 5：provider 条件操作 follow-up

分 provider 小步提交：

- WebDAV / S3 / OneDrive：已优先用 If-Match / ETag，并有条件写/删测试。
- Dropbox：request 层 typed error 已落地；rev 作为 opaque token 尚未实现。
- Google Drive：仍不声明 atomic 能力；若未来做 preflight，必须明确 best-effort。当前 `nothen=true` raw `Response` 路径只用于 read/delete，request 层会在 401 后刷新 token 并返回重试后的 `Response`。
- OneDrive：read/delete 使用 `nothen=true` raw `Response` 路径；request 层覆盖 401 token refresh，upload session 不带 bearer token 的路径保持原有语义。
- Baidu：只把明确 file-exists errno 判 conflict 已落地；md5 preflight 尚未实现，且只能标记 best-effort。
- Zip：保持简单，不参与云端 CAS。

### Phase 6：重试和通知

- transient 429/5xx 有限 retry/backoff 已在 `LimiterFileSystem` 落地，范围限于读类操作和受条件保护的写/删。
- install/delete 触发路径优先日志和下轮 sync 兜底，最终失败再聚合通知。
- 通知包含失败数量和首个错误类型，不逐文件弹。

## 剩余 rollout checklist

后续提交应继续保持小步、可回滚，并按“测试先行、实现随后、文档同步”的顺序推进。

### 必须继续验证

1. queued delete 的 typed `transient` / `conflict` 分类：已覆盖 fatal，仍需确认 provider typed error 在 `scriptsDelete()` 单项失败路径中保持 per-item best-effort。
2. provider token opaque：继续用测试确认 WebDAV/S3/OneDrive/Dropbox 的 digest/token 只作为 provider 回传值使用，不在同步层解析成通用 version。
3. `scriptcat-sync.json` 真实 provider 竞态：当前已有重新读取合并逻辑，仍需要真实 WebDAV/S3/OneDrive 环境手工验证。
4. 旧数据兼容回归：旧 `.user.js` + `.meta.json`、旧 `file_digest` string map、缺字段 `scriptcat-sync.json` 必须持续可读。

### 可以做的小步 commit

1. `✅ test(sync): cover queued delete typed failures`
   - 只补 `scriptsDelete()` 单项 `FileSystemError` transient/conflict 测试。
   - 验证失败 uuid 保留旧 digest，后续 uuid 继续处理，日志含 `errorKind`。
2. `🐛 fix(sync): preserve queued delete error kinds`
   - 仅在测试暴露缺口时提交。
   - 不改变队列、digest、status 合并语义。
3. `✅ test(fs): cover provider opaque tokens`
   - 补 provider digest/token 不被同步层改写的回归测试。
   - 不引入 Google Drive `fileId:version`。
4. `🐛 fix(fs): harden provider typed conflicts`
   - 只修测试证明的 typed error 漏洞。
   - 优先 Dropbox raw error shape、OneDrive 409/412、WebDAV/S3 412。
5. `docs(sync): document manual verification path`
   - 写清真实扩展手工验证步骤和旧云目录样例。
   - 不增加新 runtime 行为。

### 暂不进入本轮

1. Dropbox `rev` CAS：需要独立设计，不能把 `content_hash` 当 rev。
2. Google Drive / Baidu atomic CAS：没有原生条件写时只能 best-effort preflight。
3. `tombstone_digest`：没有 GC 设计前不新增。
4. 通知聚合 UI：先保留日志和定时同步兜底，避免扩大 UI / i18n 范围。
5. 既有 React hooks lint warning：与同步修复无关。

## 测试矩阵

### 同步任务级别

1. 99 个 push 成功，1 个 push 失败。
2. 99 个 pull 成功，1 个 pull 失败。
3. 删除 10 个脚本，其中 1 个删除失败，后续 9 个仍处理。
4. syncStatus 单个 `enableScript` 或 sort 更新失败。
5. `scriptcat-sync.json` 写入失败。
6. `file_digest` 更新失败。
7. install 触发 push transient 失败，不污染 digest。

### 数据兼容

1. 旧 `.meta.json` 无新增字段。
2. 旧 `file_digest` 只有 digest string。
3. 旧 `scriptcat-sync.json` 无新增字段。
4. 云端只有 `.user.js`。
5. 云端只有 `.meta.json` tombstone。
6. 云端 `.user.js` 和 `.meta.json` 更新时间不一致。

### 并发冲突

1. 两台设备同时修改同一脚本。
2. 一台删除，另一台修改。
3. 一台新增，另一台同时新增同 uuid。
4. 一台更新 status，另一台更新 code。
5. 远端文件在 list 和 write 之间变化。

### provider

1. WebDAV ETag mismatch。
2. S3 ETag mismatch。
3. OneDrive If-Match mismatch。
4. Dropbox typed conflict。
5. Google Drive best-effort preflight race。
6. Baidu errno 分类。
7. Limiter 对 read 类 transient 错误重试；只对受条件保护的 write/delete transient 错误重试，普通 write/delete 不重复非幂等操作。

## 风险清单

1. 把单文件失败升级为整轮失败，会让大批量同步重复执行并制造自冲突。
2. 把失败文件 digest 写成成功，会永久隐藏失败。
3. 覆盖式写 `scriptcat-sync.json` 会丢掉其他设备状态。
4. provider 原生 digest 与本地 md5 混用会导致误判变更。
5. Google Drive 同名文件和 path cache 会导致读写非预期文件。
6. Baidu/Google Drive preflight 不是 atomic，不能承诺完全消除 TOCTOU。
7. Dropbox 字符串匹配错误脆弱，API 文案变化会破坏分类。
8. tombstone 状态若无 GC，会让删除收敛和 status 合并越来越复杂。
9. 写路径 retry 若没有幂等保护，可能重复创建或覆盖。
10. 过早改所有 provider 会让 PR 过大，难以 review 和回滚。

## 暂不建议实现的内容

1. 不建议一次性把 PR #1439 全量合并。
2. 不建议把整个同步 round 改成 all-or-nothing。
3. 不建议让 filesystem 包承担业务冲突策略。
4. 不建议新增独立 `tombstone_digest`，除非同时设计 GC。
5. 不建议把 Google Drive `fileId:version` 暴露成通用 version。
6. 不建议在没有 typed error 前按字符串大规模分类冲突。
7. 不建议没有测试就修改 Google Drive / Baidu 删除逻辑。

## 最小可接受修复

第一轮 runtime 修复应只做到：

1. `pullScript()` 和 `deleteCloudScript()` 的失败可被上层识别。
2. `syncOnceInternal()` 按文件收集结果。
3. 成功文件推进 digest，失败文件不推进。
4. orphan `.user.js` 跳过且保留 status。
5. syncStatus 单项失败不阻塞整轮。
6. 新增测试证明不会再出现“99 成功 + 1 失败导致 100 个都重复/污染”的问题。

## 验证要求

每次提交前记录：

```text
repo:
branch:
commit:
changed files:
tests run:
tests failed:
tests skipped:
known risks:
```

如果测试无法运行，必须写明原因，不能写“已验证”。
