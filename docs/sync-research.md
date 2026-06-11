# 云同步一致性与生产兼容性研究

## 目标

本分支用于研究和修复 ScriptCat 云同步在多设备、多 provider、网络异常和并发修改场景下的正确性问题。

核心目标：

1. 避免云端文件被静默覆盖。
2. 避免失败同步污染本地 `file_digest` 或远端 `scriptcat-sync.json`。
3. 保持现有生产用户云端数据兼容。
4. 不把 per-file best-effort 同步退化成整轮 all-or-nothing。
5. 将 provider 能力、同步策略、用户通知分层处理。

## 现有同步数据结构

### `.user.js`

每个脚本的源码文件。

命名规则：

```text
<uuid>.user.js
````

### `.meta.json`

每个脚本的同步元信息。

旧格式大致包含：

```ts
type SyncMeta = {
  uuid: string;
  origin?: string;
  downloadUrl?: string;
  checkUpdateUrl?: string;
  isDeleted?: boolean;
};
```

其中 `isDeleted: true` 表示 tombstone 删除标记。

### `scriptcat-sync.json`

保存脚本启用状态、排序和状态更新时间。

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

### `file_digest`

保存在本地 chrome storage 中，用于判断云端文件是否相对上轮同步有变化。

现有格式：

```ts
type FileDigestMap = {
  [filename: string]: string;
};
```

生产兼容要求：

* 旧用户只有 digest，没有 version。
* 旧用户的云端文件没有 provider token。
* 新逻辑必须能读旧格式。
* 新逻辑不能要求用户手动迁移。

## 已确认问题

### 1. 静默覆盖

旧接口中 `fs.create(path)` 默认覆盖远端文件。多设备并发时，如果设备 A 和设备 B 基于同一旧快照修改同一脚本，后写入者会覆盖先写入者，且用户无提示。

### 2. 失败后状态污染

若上传、下载、删除中某个步骤失败，但后续仍更新 `file_digest` 或 `scriptcat-sync.json`，下轮同步会误以为失败操作已经成功，导致本地与云端状态永久偏离。

### 3. `pullScript` / `deleteCloudScript` 错误粒度不足

旧实现中某些错误只记录日志，不向调用方抛出。这样 `syncOnceInternal` 无法区分成功和失败，容易把失败任务当作成功推进状态。

### 4. orphan `.user.js` 风险

远端可能出现只有 `.user.js`、没有 `.meta.json` 的半上传状态。此时不能安装、删除或覆盖该脚本，应跳过本轮并保留远端 status。

### 5. provider 能力不一致

不同后端能力差异很大：

* WebDAV / S3 / OneDrive：通常可用 ETag / If-Match。
* Dropbox：有 content_hash，但冲突错误需要 typed error，不应靠字符串匹配。
* Google Drive：可读取 file id、version、md5Checksum，但 create / update 的原子 CAS 能力有限。
* Baidu：部分操作只能 preflight，不能假装 atomic。
* Zip：本地备份用途，通常不参与云端 CAS。

## 设计原则

### 原则 1：保持 per-file best-effort

不能因为一个脚本失败，让其他 99 个成功脚本全部不推进。

正确行为：

* 成功文件更新自己的 digest。
* 失败文件保留旧 digest。
* 下轮只重试失败或有变化的文件。
* 冲突只阻塞冲突文件。

### 原则 2：状态推进必须和真实成功绑定

只有真实成功完成的文件，才能推进对应 digest。

不能出现：

* 写文件失败但更新 digest。
* 删除失败但写 tombstone digest。
* pull 失败但认为脚本已更新。
* syncStatus 失败但覆盖远端 status。

### 原则 3：filesystem 不承担业务冲突策略

filesystem 层应该暴露：

* 读取文件
* 写入文件
* 删除文件
* 条件写入能力
* typed error
* provider capabilities

同步层负责：

* 何时 push
* 何时 pull
* 何时认为 conflict
* 如何通知用户
* 如何推进 digest
* 如何处理 tombstone

### 原则 4：provider token 必须 opaque

不要把 Google Drive 的 `fileId:version` 这类 provider 内部结构塞进通用 `version` 字段。

建议：

```ts
interface FileInfo {
  name: string;
  path: string;
  size: number;
  digest: string;
  createtime: number;
  updatetime: number;

  version?: string;
  providerToken?: unknown;
}
```

`providerToken` 只由 provider 自己解释。

### 原则 5：明确 atomic 与 best-effort

接口必须区分：

```ts
type FileSystemCapabilities = {
  atomicCompareAndSwap: boolean;
  createOnly: boolean;
  conditionalDelete: boolean;
  nativeDigest: boolean;
};
```

不能把 preflight 实现伪装成 atomic CAS。

## 建议实现阶段

## Phase 1：研究文档和测试基线

提交：

```text
docs/sync-research.md
```

内容：

* 当前同步机制说明
* PR #1439 分析
* CodFrm review 整理
* provider 能力矩阵
* 生产兼容原则
* 测试计划

不改 runtime 代码。

## Phase 2：修复错误传播和 per-file digest 推进

目标：

* `pullScript` 失败时抛出错误。
* `deleteCloudScript` 失败时抛出错误。
* `syncOnceInternal` 收集每个任务结果。
* 成功任务返回 digest patch。
* 失败任务不推进 digest。
* 不因单个任务失败阻塞其他成功任务。

伪代码：

```ts
const results = await Promise.allSettled(tasks);

const digestPatch: FileDigestMap = {};
const failures: SyncFailure[] = [];

for (const result of results) {
  if (result.status === "fulfilled") {
    Object.assign(digestPatch, result.value?.digestPatch);
  } else {
    failures.push(classifySyncFailure(result.reason));
  }
}

await updateFileDigest(fs, digestPatch, {
  preserveFailedFiles: true,
});
```

## Phase 3：保护 `scriptcat-sync.json`

目标：

* 写入前重新读取远端 `scriptcat-sync.json`。
* 保留 orphan uuid 的远端 status。
* 本轮失败文件不得覆盖远端 status。
* syncStatus 单项失败不导致全局状态污染。

建议：

```ts
const latestSyncFile = await readLatestScriptcatSync(fs);
const merged = mergeStatus({
  base: latestSyncFile,
  localChanges,
  skippedUuids,
  failedUuids,
});
```

## Phase 4：引入 capabilities 和 typed error

新增或扩展：

```ts
type FileSystemErrorKind =
  | "conflict"
  | "stale_snapshot"
  | "transient"
  | "unsupported"
  | "fatal";

class FileSystemError extends Error {
  kind: FileSystemErrorKind;
  status?: number;
  retryAfter?: number;
}
```

provider 需要把 HTTP 409 / 412 / 429 / 5xx 等转换成 typed error。

## Phase 5：条件写入

新增：

```ts
type FileCreateOptions = {
  modifiedDate?: number;
  expectedDigest?: string;
  expectedVersion?: string;
  createOnly?: boolean;
  providerToken?: unknown;
};

type FileDeleteOptions = {
  expectedDigest?: string;
  expectedVersion?: string;
  providerToken?: unknown;
};
```

调用层根据远端 snapshot 生成条件写入参数。

## Phase 6：通知和重试

目标：

* transient 错误自动 retry。
* retry 后仍失败才通知。
* 通知按 provider / sync round 节流。
* 用户提示区分：

  * 正在重试
  * 同步冲突
  * 授权失效
  * 网络失败
  * provider 不支持条件写入

## Provider 注意事项

### WebDAV

优先使用 ETag / `If-Match`。

### S3

优先使用 ETag / conditional request。

### OneDrive

检查所有 `nothen=true` 调用点，避免行为改变导致调用者收到非预期响应。

### Google Drive

不要把 `fileId:version` 放进通用 `version`。

可用方案：

* `version` 保持 provider 原生 version。
* `providerToken` 保存 `{ fileId, version }`。
* createOnly 如果无法 atomic，应标记为 best-effort。

### Dropbox

不要通过错误 message string 匹配冲突。

应在 request 层解析 Dropbox API error，转换成 typed `FileSystemError`.

### Baidu

只把明确的 file-exists errno 转换成 conflict。

不要把所有非零 errno 都当成 createOnly conflict。

### Zip

保持简单实现，不需要云端 CAS 能力。

## 测试矩阵

### 同步任务级别

1. 99 个 push 成功，1 个 push 失败。
2. 99 个 pull 成功，1 个 pull 失败。
3. 删除 10 个脚本，其中 1 个删除失败。
4. syncStatus 单个 enableScript 失败。
5. `scriptcat-sync.json` 写入失败。
6. `file_digest` 更新失败。

### 数据兼容

1. 旧 `.meta.json` 无 version。
2. 旧 `file_digest` 只有 digest。
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
3. OneDrive if-match mismatch。
4. Dropbox conflict typed error。
5. Google Drive best-effort preflight race。
6. Baidu errno 分类。

## 暂不建议立即做的事情

1. 不建议一次性把所有 provider 都改成复杂 CAS。
2. 不建议把 filesystem 变成业务冲突处理层。
3. 不建议新增独立 `tombstone_digest`，除非有明确 GC。
4. 不建议让任何单文件失败阻塞整轮同步。
5. 不建议没有测试就修改 Google Drive / Baidu 的删除逻辑。

## 最小可接受修复

第一轮代码修复可以只做到：

1. `pullScript` 和 `deleteCloudScript` 失败向上抛出。
2. `syncOnceInternal` 按文件收集结果。
3. 成功文件推进 digest，失败文件不推进。
4. orphan `.user.js` 跳过且保留 status。
5. 新增测试证明不会再出现 “99 成功 + 1 失败 => 100 个都重复/污染” 的问题。

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

如果测试无法运行，必须写明原因。
