import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import type { Resource, ResourceType } from "@App/app/repo/resource";
import {
  type Script,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
  type ScriptDAO,
  type ScriptCodeDAO,
} from "@App/app/repo/scripts";
import BackupExport from "@App/pkg/backup/export";
import type { BackupData, ResourceBackup, ScriptBackupData, ScriptOptions, ValueStorage } from "@App/pkg/backup/struct";
import type { FileInfo } from "@Packages/filesystem/filesystem";
import type FileSystem from "@Packages/filesystem/filesystem";
import ZipFileSystem from "@Packages/filesystem/zip/zip";
import FileSystemFactory, { type FileSystemType } from "@Packages/filesystem/factory";
import { FileSystemError, isNotFoundError, isWarpTokenError } from "@Packages/filesystem/error";
import type { Group } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import { type IMessageQueue } from "@Packages/message/message_queue";
import { createJSZip } from "@App/pkg/utils/jszip-x";
import { type ValueService } from "./value";
import { type ResourceService } from "./resource";
import { createObjectURL } from "../offscreen/client";
import {
  type CloudSyncConfig,
  type CloudSyncState,
  type SystemConfig,
  CLOUD_SYNC_STATE_KEY,
  DEFAULT_CLOUD_SYNC_STATE,
} from "@App/pkg/config/config";
import type { TDeleteScript, TInstallScript, TInstallScriptParams } from "../queue";
import { errorMsg, makeBlobURL } from "@App/pkg/utils/utils";
import { t } from "i18next";
import ChromeStorage from "@App/pkg/config/chrome_storage";
import { AgentModelRepo } from "@App/app/repo/agent_model";
import { MCPServerRepo } from "@App/app/repo/mcp_server_repo";
import { AgentTaskRepo } from "@App/app/repo/agent_task";
import { CONFIG_BUNDLE_VERSION, toBundleConfig, type ConfigBundle } from "@App/pkg/backup/config_bundle";
import { type ScriptService } from "./script";
import { prepareScriptByCode } from "@App/pkg/utils/script";
import { ExtVersion } from "@App/app/const";
import { dayFormat } from "@App/pkg/utils/day_format";
import i18n, { i18nName } from "@App/locales/locales";
import { InfoNotification } from "./utils";
import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import { md5OfText } from "@App/pkg/utils/crypto";
import { startDownload } from "./download";

// type SynchronizeTarget = "local";

type SyncFiles = {
  script: FileInfo;
  meta: FileInfo;
};

type SyncMeta = {
  uuid: string;
  origin?: string; // 脚本来源
  downloadUrl?: string;
  checkUpdateUrl?: string;
  isDeleted?: boolean;
};

type ScriptcatSync = {
  version: string; // 脚本猫版本
  status: {
    scripts: {
      [key: string]: ScriptcatSyncStatus | undefined;
    };
  };
};

type ScriptcatSyncStatus = {
  enable: boolean;
  sort: number;
  updatetime: number; // 更新时间
};

type PushScriptParam = TInstallScriptParams & Partial<Pick<Script, "createtime" | "updatetime">>;

export type LocalBackupExport = {
  url: string;
  filename: string;
};

type FileDigestMap = {
  [key: string]: string;
};

type SyncTask = {
  uuid: string;
  promise: Promise<FileDigestMap | void>;
  preserveDigestFiles: string[];
};

type SyncErrorKind = "conflict" | "stale_snapshot" | "transient" | "fatal";

// 本地 updatetime 是客户端毫秒时钟，云端 mtime 是服务端时钟（WebDAV 等仅整秒精度）。
// 跨时钟域比较前两侧都截断到整秒：同一秒内的毫秒余数不构成"本地更新"的证据（L4 同秒竞态）
const isNewerBySecond = (localMs: number, cloudMs: number) => Math.floor(localMs / 1000) > Math.floor(cloudMs / 1000);

// pushScript 分两次写 .user.js / .meta.json，前者成功后者失败时抛出本错误，
// 带出已成功写入的文件名，让调用方只保留真正失败文件的旧 digest、推进成功文件的 digest，
// 避免已成功文件继续保留旧 digest，让下一轮只重试真正失败的文件。
class PushScriptPartialError extends Error {
  constructor(
    readonly originalError: unknown,
    readonly writtenFiles: string[]
  ) {
    super(originalError instanceof Error ? originalError.message : String(originalError));
    this.name = "PushScriptPartialError";
  }
}

// 本地与云端在上次同步后都发生了修改（真冲突）：不自动覆盖任何一端，
// 本轮跳过该脚本（沿用失败路径保留旧 digest 与云端状态），并聚合通知用户手动处理
class SyncBothChangedConflictError extends Error {
  constructor(
    readonly uuid: string,
    readonly scriptName: string
  ) {
    super(`sync conflict: both local and cloud changed for ${uuid}`);
    this.name = "SyncBothChangedConflictError";
  }
}

// 未完成同步操作的持久化登记。file_digest 只是文件快照，表达不了「删除做到一半」
// 「.meta.json 还欠一次写入」这类未完成意图：部分失败后下一轮的方向判定不一定会
// 再生成重试任务（如「本地无脚本 + 云端只剩 .meta.json」不命中任何决策分支），
// 须由本记录在 syncOnce 开头驱动重放，全部步骤成功才清除。
type PendingSyncOp = { op: "delete"; syncDelete: boolean } | { op: "push" };
type PendingSyncOps = { [uuid: string]: PendingSyncOp };

const SYNC_SERVICE_TASK_KEY = "cloud_sync_queue";
const PENDING_SYNC_OPS_KEY = "pending_sync_ops";
const LAST_NOTIFIED_CONFLICT_KEY = "last_notified_sync_conflicts";

function isEquivalentConfigValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => isEquivalentConfigValue(value, right[index]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key) => Object.hasOwn(rightRecord, key) && isEquivalentConfigValue(leftRecord[key], rightRecord[key])
  );
}

function isCloudSyncConnectionEquivalent(left: CloudSyncConfig, right: CloudSyncConfig): boolean {
  return left.filesystem === right.filesystem && isEquivalentConfigValue(left.params, right.params);
}

function isCloudSyncConfigEquivalent(left: CloudSyncConfig, right: CloudSyncConfig): boolean {
  return (
    left.enable === right.enable &&
    left.syncDelete === right.syncDelete &&
    left.syncStatus === right.syncStatus &&
    isCloudSyncConnectionEquivalent(left, right)
  );
}

function getScriptModifiedDate(script: PushScriptParam): number {
  return script.updatetime || script.createtime || Date.now();
}

export class SynchronizeService {
  logger: Logger;

  scriptCodeDAO: ScriptCodeDAO;

  storage: ChromeStorage = new ChromeStorage("sync", false);

  private lastCloudSyncConfig?: CloudSyncConfig;

  constructor(
    private msgSender: MessageSend,
    private group: Group,
    private script: ScriptService,
    private value: ValueService,
    private resource: ResourceService,
    private mq: IMessageQueue,
    private systemConfig: SystemConfig,
    private scriptDAO: ScriptDAO
  ) {
    this.logger = LoggerCore.logger().with({ service: "synchronize" });
    this.scriptCodeDAO = this.scriptDAO.scriptCodeDAO;
  }

  // 生成备份文件到文件系统(includeConfig=true 时附带 ScriptCat 设置 bundle,#1533)
  async backup(fs: FileSystem, uuids?: string[], includeConfig = false) {
    // 生成导出数据
    const data: BackupData = {
      script: await this.getScriptBackupData(uuids),
      subscribe: [],
      config: includeConfig ? await this.getConfigBundle() : undefined,
    };

    await new BackupExport(fs).export(data);
  }

  // 读取 ScriptCat 设置 bundle(SystemConfig 仅 sync 键 + agent 模型/MCP/任务)
  async getConfigBundle(): Promise<ConfigBundle> {
    const modelRepo = new AgentModelRepo();
    const [sync, models, mcp, tasks, defaultModelId, summaryModelId] = await Promise.all([
      new ChromeStorage("system", true).keys(),
      modelRepo.listModels(),
      new MCPServerRepo().listServers(),
      new AgentTaskRepo().listTasks(),
      modelRepo.getDefaultModelId(),
      modelRepo.getSummaryModelId(),
    ]);
    return {
      version: CONFIG_BUNDLE_VERSION,
      systemConfig: toBundleConfig(sync),
      agent: { models, mcp, tasks, defaultModelId, summaryModelId },
    };
  }

  // 还原设置 bundle：合并语义=以备份值覆盖(逐键 set/save)；只写 sync storage
  async restoreConfigBundle(bundle: ConfigBundle): Promise<void> {
    if (!bundle) return;
    const sync = new ChromeStorage("system", true);
    const modelRepo = new AgentModelRepo();
    const mcpRepo = new MCPServerRepo();
    const taskRepo = new AgentTaskRepo();
    await Promise.all([
      ...Object.entries(bundle.systemConfig || {}).map(([k, v]) => sync.set(k, v)),
      ...(bundle.agent?.models || []).map((m) => modelRepo.saveModel(m)),
      ...(bundle.agent?.mcp || []).map((m) => mcpRepo.saveServer(m)),
      ...(bundle.agent?.tasks || []).map((t) => taskRepo.saveTask(t)),
    ]);
    // 仅在备份带出模型选择时覆盖（部分还原未选"AI 模型"时保留本机当前默认/摘要模型）
    if (bundle.agent?.defaultModelId) await modelRepo.setDefaultModelId(bundle.agent.defaultModelId);
    if (bundle.agent?.summaryModelId) await modelRepo.setSummaryModelId(bundle.agent.summaryModelId);
  }

  // 获取脚本备份数据
  async getScriptBackupData(uuids?: string[]) {
    if (uuids) {
      const rets: Promise<ScriptBackupData>[] = [];
      uuids.forEach((uuid) => {
        rets.push(
          this.scriptDAO.get(uuid).then((script) => {
            if (script) {
              return this.generateScriptBackupData(script);
            }
            return Promise.reject(new Error(`Script ${uuid} not found`));
          })
        );
      });
      return Promise.all(rets); // 不处理 Promise.reject ?
    }
    // 获取所有脚本
    const list = await this.scriptDAO.all();
    return Promise.all(list.map((script) => this.generateScriptBackupData(script)));
  }

  async generateScriptBackupData(script: Script): Promise<ScriptBackupData> {
    const code = await this.scriptCodeDAO.get(script.uuid);
    if (!code) {
      throw new Error(`Script ${script.uuid} code not found`);
    }
    const lastModificationDate = script.updatetime || script.createtime || undefined;
    const [values, valueRet] = await this.value.getScriptValueDetails(script);
    const [requires, requiresCss, resources] = await this.resource.getResourceByTypes(script, [
      "require",
      "require-css",
      "resource",
    ]);
    const storage: ValueStorage = {
      data: { ...values },
      ts: valueRet?.updatetime || lastModificationDate || Date.now(),
    };
    const ret = {
      code: code.code,
      options: {
        options: this.scriptOption(script),
        settings: {
          enabled: script.status === SCRIPT_STATUS_ENABLE,
          position: script.sort,
        },
        meta: {
          name: script.name,
          uuid: script.uuid,
          sc_uuid: script.uuid,
          modified: script.updatetime!,
          file_url: script.downloadUrl!,
          subscribe_url: script.subscribeUrl,
        },
        selfMeta: script.selfMetadata && Object.keys(script.selfMetadata).length > 0 ? script.selfMetadata : undefined,
      },
      // storage,
      requires: this.resourceToBackdata(requires),
      requiresCss: this.resourceToBackdata(requiresCss),
      resources: this.resourceToBackdata(resources),
      storage,
      lastModificationDate,
    } satisfies ScriptBackupData;

    return ret;
  }

  resourceToBackdata(resource: { [key: string]: Resource }) {
    const ret: ResourceBackup[] = [];
    for (const key of Object.keys(resource)) {
      const resourceValue = resource[key];
      ret.push({
        meta: {
          name: this.getUrlName(resourceValue.url),
          url: resourceValue.url,
          ts: resourceValue.updatetime || resourceValue.createtime,
          mimetype: resourceValue.contentType,
        },
        source: resourceValue.content || undefined,
        base64: resourceValue.base64,
      });
    }
    return ret;
  }

  // 导入脚本资源；返回失败的资源名列表(不因单个资源失败而整体 reject，供导入页逐项展示)
  async importResources(data: {
    uuid: string;
    requires: ResourceBackup[];
    resources: ResourceBackup[];
    requiresCss: ResourceBackup[];
  }): Promise<string[]> {
    const { uuid, requires, resources, requiresCss } = data;
    const items: Array<{ res: ResourceBackup; type: ResourceType }> = [
      ...requires.map((res) => ({ res, type: "require" as ResourceType })),
      ...resources.map((res) => ({ res, type: "resource" as ResourceType })),
      ...requiresCss.map((res) => ({ res, type: "require-css" as ResourceType })),
    ];
    const settled = await Promise.allSettled(
      items.map(({ res, type }) => this.resource.importResource(uuid, res, type))
    );
    const failed: string[] = [];
    settled.forEach((r, i) => {
      if (r.status === "rejected") {
        const { res } = items[i];
        failed.push(res.meta.name || res.meta.url);
        this.logger.error("import resource failed", { uuid, url: res.meta.url }, Logger.E(r.reason));
      }
    });
    return failed;
  }

  getUrlName(url: string): string {
    let index = url.indexOf("?");
    if (index !== -1) {
      url = url.substring(0, index);
    }
    index = url.lastIndexOf("/");
    if (index !== -1) {
      url = url.substring(index + 1);
    }
    return url;
  }

  // 为了兼容tm
  scriptOption(script: Script): ScriptOptions {
    return {
      check_for_updates: false,
      comment: null,
      compat_foreach: false,
      compat_metadata: false,
      compat_prototypes: false,
      compat_wrappedjsobject: false,
      compatopts_for_requires: true,
      noframes: null,
      override: {
        merge_connects: true,
        merge_excludes: true,
        merge_includes: true,
        merge_matches: true,
        orig_connects: script.metadata.connect || [],
        orig_excludes: script.metadata.exclude || [],
        orig_includes: script.metadata.include || [],
        orig_matches: script.metadata.match || [],
        orig_noframes: script.metadata.noframes ? true : null,
        orig_run_at: (script.metadata.run_at && script.metadata.run_at[0]) || "document-idle",
        use_blockers: [],
        use_connects: [],
        use_excludes: [],
        use_includes: [],
        use_matches: [],
      },
      run_at: null,
    };
  }

  // 请求导出文件(本地文件导出附带设置 bundle,#1533/#684)
  async requestExport(uuids?: string[]): Promise<LocalBackupExport> {
    const zipFile = createJSZip();
    const fs = new ZipFileSystem(zipFile);
    await this.backup(fs, uuids, true);
    // 生成文件,并下载
    const zipOutput = await zipFile.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: {
        level: 9,
      },
      comment: "Created by Scriptcat",
    });
    const url = await makeBlobURL({ blob: zipOutput, persistence: false }, (params) =>
      createObjectURL(this.msgSender, params)
    );
    const filename = `scriptcat-backup-${dayFormat(new Date(), "YYYY-MM-DDTHH-mm-ss")}.zip`;
    void startDownload({
      url,
      saveAs: true,
      filename,
    });
    return { url, filename };
  }

  // 备份到云端
  async backupToCloud({ type, params }: { type: FileSystemType; params: any }) {
    // 首先生成zip文件
    const zipFile = createJSZip();
    const fs = new ZipFileSystem(zipFile);
    await this.backup(fs, undefined, true);
    this.logger.info("backup to cloud");
    // 然后创建云端文件系统
    let cloudFs = await FileSystemFactory.create(type, params);
    try {
      await cloudFs.createDir("ScriptCat");
      cloudFs = await cloudFs.openDir("ScriptCat");
      // 云端文件系统写入文件
      const file = await cloudFs.create(`scriptcat-backup-${dayFormat(new Date(), "YYYY-MM-DDTHH-mm-ss")}.zip`);
      await file.write(
        await zipFile.generateAsync({
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: {
            level: 9,
          },
          comment: "Created by Scriptcat",
        })
      );
    } catch (e) {
      this.logger.error("backup to cloud error", Logger.E(e));
      throw e;
    }
    return;
  }

  // 开始一次云同步
  async buildFileSystem(config: CloudSyncConfig) {
    let fs: FileSystem;
    try {
      fs = await FileSystemFactory.create(config.filesystem, config.params[config.filesystem]);
      // 创建base目录
      await FileSystemFactory.mkdirAll(fs, "ScriptCat/sync");
      fs = await fs.openDir("ScriptCat/sync");
    } catch (e: any) {
      this.logger.error("create filesystem error", Logger.E(e), {
        type: config.filesystem,
      });
      // 判断错误是不是网络类型的错误, 网络类型的错误不做任何处理
      // 如果是token失效之类的错误,通知用户并关闭云同步
      if (isWarpTokenError(e)) {
        InfoNotification(
          `${t("settings:sync_system_connect_failed")}, ${t("settings:sync_system_closed")}`,
          `${t("settings:sync_system_closed_description")}\n${errorMsg(e)}`
        );
        this.systemConfig.setCloudSync({
          ...config,
          enable: false,
        });
      }
      throw e;
    }
    return fs;
  }

  // 同步一次
  async syncOnce(syncConfig: CloudSyncConfig, fs: FileSystem) {
    return stackAsyncTask(SYNC_SERVICE_TASK_KEY, async () => {
      // 设备本地同步状态：开始置 syncing，结束写入计数/时间或错误，供设置页状态条展示。
      // 读旧值与写 syncing 不能 await 在 syncOnceInternal 之前，否则存储 I/O 会推迟内部起始时序（见测试的微任务门控）。
      const prevStatePromise = this.storage.get(CLOUD_SYNC_STATE_KEY).then(async (prev) => {
        const prevState = (prev as CloudSyncState) || DEFAULT_CLOUD_SYNC_STATE;
        await this.storage.set(CLOUD_SYNC_STATE_KEY, { ...prevState, syncing: true, error: undefined });
        return prevState;
      });
      try {
        const counts = await this.syncOnceInternal(syncConfig, fs);
        await prevStatePromise; // 保证 syncing 起始写在结束写之前
        await this.storage.set(CLOUD_SYNC_STATE_KEY, { syncing: false, lastSyncAt: Date.now(), counts });
      } catch (e) {
        this.logger.error("sync once error", Logger.E(e));
        const prevState = await prevStatePromise.catch(() => DEFAULT_CLOUD_SYNC_STATE);
        await this.storage.set(CLOUD_SYNC_STATE_KEY, {
          ...prevState,
          syncing: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }

  private async syncOnceInternal(syncConfig: CloudSyncConfig, fs: FileSystem) {
    this.logger.info("start sync once");
    // 重放上一轮未完成的操作（半途失败的删除、欠写的 .meta.json）。
    // 必须在主流程对账前先落地，否则「本地无脚本 + 云端有 .user.js」会把删到一半的脚本拉回本地
    const pendingOps = await this.getPendingSyncOps();
    const pendingFailedUuids = new Set<string>();
    {
      const pendingUuids = Object.keys(pendingOps);
      if (pendingUuids.length) {
        // push 重放是盲覆盖，须先确认云端 .user.js 仍是本机上次写入的内容；删除重放已幂等无须校验
        const needGuard = pendingUuids.some((uuid) => pendingOps[uuid].op === "push");
        const cloudDigests = needGuard
          ? new Map((await fs.list()).map((file) => [file.name, file.digest]))
          : new Map<string, string>();
        const digestRecord = ((await this.storage.get("file_digest")) as FileDigestMap) || {};
        const replayedUuids: string[] = [];
        const replayedDigests: FileDigestMap = {};
        for (const uuid of pendingUuids) {
          const op = pendingOps[uuid];
          try {
            if (op.op === "delete") {
              await this.deleteCloudScript(fs, uuid, op.syncDelete);
            } else {
              const script = await this.scriptDAO.get(uuid);
              if (!script) {
                // 本地已删，云端文件交给删除事件或主流程处理
                delete pendingOps[uuid];
                continue;
              }
              const name = `${uuid}.user.js`;
              const cloudDigest = cloudDigests.get(name);
              if (cloudDigest === undefined || cloudDigest !== digestRecord[name]) {
                // 云端已被他端改写或删除，盲目补推会覆盖对端更新：交回主流程方向判定
                delete pendingOps[uuid];
                continue;
              }
              Object.assign(replayedDigests, await this.pushScript(fs, script));
            }
            delete pendingOps[uuid];
            replayedUuids.push(uuid);
          } catch (e) {
            // 重放仍失败：保留登记待下一轮，本轮主流程跳过该 uuid，防止半完成状态被误判
            pendingFailedUuids.add(uuid);
            this.logger.warn("replay pending sync op failed", Logger.E(e), {
              uuid,
              op: op.op,
              errorKind: this.classifySyncError(e),
            });
          }
        }
        await this.setPendingSyncOps(pendingOps);
        if (replayedUuids.length) {
          await this.updateFileDigestForUuids(fs, replayedUuids, replayedDigests);
        }
      }
    }
    // 获取文件列表
    const list = await fs.list();
    // 根据文件名生成一个map
    const uuidMap = new Map<string, Partial<SyncFiles>>();
    // 储存文件摘要,用于检测文件是否有变化
    const fileDigestMap = ((await this.storage.get("file_digest")) as FileDigestMap) || {};
    // 上次同步成功时的本地内容基线（md5），用于云端已变时判断本地是否也变过（方向判定不依赖跨时钟时间比较）
    const syncedContentMd5Map = ((await this.storage.get("sync_content_md5")) as FileDigestMap) || {};

    for (const file of list) {
      if (file.name.endsWith(".user.js")) {
        const uuid = file.name.substring(0, file.name.length - 8);
        let files = uuidMap.get(uuid);
        if (!files) {
          files = {};
          uuidMap.set(uuid, files);
        }
        files.script = file;
      } else if (file.name.endsWith(".meta.json")) {
        const uuid = file.name.substring(0, file.name.length - 10);
        let files = uuidMap.get(uuid);
        if (!files) {
          files = {};
          uuidMap.set(uuid, files);
        }
        files.meta = file;
      }
    }

    // 获取脚本列表
    const scriptList = await this.scriptDAO.all();
    // 遍历脚本列表生成一个map
    const scriptMap = new Map<string, Script>();
    scriptList.forEach((script) => {
      scriptMap.set(script.uuid, script);
    });

    // 判断文件系统是否有脚本猫同步文件
    const file = list.find((file) => file.name === "scriptcat-sync.json");
    const scriptcatSync = {
      version: ExtVersion,
      status: {
        scripts: {},
      },
    } as ScriptcatSync;
    let cloudStatus: ScriptcatSync["status"]["scripts"] = {};
    let canWriteScriptcatSync = true;
    if (file) {
      try {
        // 如果有,则读取文件内容
        const cloudScriptCatSync = JSON.parse(
          await fs.open(file).then((f) => f.read("string"))
        ) as Partial<ScriptcatSync>;
        cloudStatus = cloudScriptCatSync.status?.scripts || {};
      } catch (e) {
        canWriteScriptcatSync = false;
        this.logger.warn("read scriptcat-sync.json file failed", Logger.E(e));
      }
    }

    // 对比脚本列表和文件列表,进行同步
    const result: SyncTask[] = [];
    const updateScript: Map<string, boolean> = new Map();
    // 无内容基线兜底覆盖：记录本轮"可能覆盖了未知改动"的脚本，供覆盖日志与聚合通知使用
    const overwriteScripts: { uuid: string; scriptName: string; direction: "pull" | "push" }[] = [];
    // 记录被跳过的孤儿云端脚本（仅 .user.js 无 .meta.json）
    // 避免本机回写 scriptcat-sync.json 时丢失对应 uuid 的云端 status
    const skippedOrphanUuids = new Set<string>();
    let hasNotifiedSyncDelete = false;
    // 需要是同步操作，后续上传剩下的脚本
    // 最后使用 Promise.allSettled 进行等待
    const addSyncTask = (uuid: string, promise: Promise<FileDigestMap | void>, files?: string[]) => {
      result.push({
        uuid,
        promise,
        preserveDigestFiles: files || [`${uuid}.user.js`, `${uuid}.meta.json`],
      });
    };
    uuidMap.forEach((file, uuid) => {
      if (pendingFailedUuids.has(uuid)) {
        // 该 uuid 仍有未完成操作且本轮重放失败：跳过主流程决策，避免在半完成状态上误拉/误推
        scriptMap.delete(uuid);
        return;
      }
      const script = scriptMap.get(uuid);
      if (script) {
        scriptMap.delete(uuid);
        // 脚本存在但是文件不存在,则读取.meta.json内容判断是否需要删除脚本
        if (!file.script) {
          addSyncTask(
            uuid,
            (async () => {
              // 读取meta文件
              const meta = await fs.open(file.meta!);
              const metaJson = (await meta.read("string")) as string;
              const metaObj = JSON.parse(metaJson) as SyncMeta;
              if (metaObj.isDeleted) {
                // 删除脚本
                await this.script.deleteScript(script.uuid, "sync");
                if (!hasNotifiedSyncDelete) {
                  hasNotifiedSyncDelete = true;
                  InfoNotification(
                    i18n.t("settings:notification.script_sync_delete"),
                    i18n.t("settings:notification.script_sync_delete_desc", {
                      scriptName: i18nName(script),
                    })
                  );
                }
              } else {
                // 否则认为是一个无效的.meta文件，进行删除，并进行同步
                await fs.delete(file.meta!.name);
                return await this.pushScript(fs, script);
              }
            })(),
            [file.meta!.name, `${uuid}.user.js`]
          );
          return;
        }
        const updatetime = script.updatetime || script.createtime;
        // 云端缺 .meta.json（上一轮分片上传残留）：无论方向判定如何都需补传修复
        if (!file.meta) {
          addSyncTask(uuid, this.pushScript(fs, script));
          return;
        }
        if (fileDigestMap[file.script!.name] === file.script!.digest) {
          // 云端自上次同步未变：本地更新时间不比云端新（整秒对齐）则无事可做；
          // 否则本地编辑过（digest 相等只反映云端未变），需补偿上传（#1，队列 push 失败后的兜底）
          if (!isNewerBySecond(updatetime, file.script!.updatetime)) {
            // .user.js 未变不代表 .meta.json 未变：他端可能只改了 meta 字段（downloadUrl 等）。
            // 不检查就跳过，收尾的全量盖章会把这份未处理的 meta 标成已同步，之后永不再处理。
            // 无记录（从未成功同步过该 meta）时无法判定变化，交由收尾盖章建立基线
            const metaRecord = fileDigestMap[file.meta!.name];
            if (metaRecord !== undefined && metaRecord !== file.meta!.digest) {
              addSyncTask(
                uuid,
                (async () => {
                  const metaJson = (await fs.open(file.meta!).then((r) => r.read("string"))) as string;
                  const metaObj = JSON.parse(metaJson) as SyncMeta;
                  if (metaObj.isDeleted) {
                    // .user.js 仍在时的 tombstone 是他端部分推送的残留，等对端补完 meta 后再重新判定
                    return;
                  }
                  await this.scriptDAO.update(uuid, {
                    origin: metaObj.origin ?? script.origin,
                    downloadUrl: metaObj.downloadUrl ?? script.downloadUrl,
                    checkUpdateUrl: metaObj.checkUpdateUrl ?? script.checkUpdateUrl,
                  });
                  await this.recordSyncedContentMd5({ [file.meta!.name]: md5OfText(metaJson) });
                })(),
                [file.meta!.name]
              );
            }
            return;
          }
          addSyncTask(uuid, this.pushScript(fs, script));
          return;
        }
        // 云端自上次同步已变（或本机无记录）。本地毫秒时钟与服务端整秒 mtime 属于两个时钟域，
        // 对端更新落在同一秒内时"本地时间戳更大"是误报（L4 同秒竞态），
        // 方向判定优先用本地内容基线：本地内容自上次同步未变 → pull；双方都变 → 冲突，不自动覆盖任何一端
        addSyncTask(
          uuid,
          (async () => {
            const direction = await this.decideDirectionOnRemoteChange(fs, file.script!, script, syncedContentMd5Map);
            // 覆盖日志/通知只在写入成功后登记：失败轮通知会谎报覆盖，
            // 且去重键提前落库后，下一轮真覆盖发生时反而被静默
            const recordOverwrite = (dir: "pull" | "push") => {
              if (direction.action === "adopt" || !direction.unverified) return;
              const scriptName = i18nName(script);
              this.logger.warn("sync overwrite", { action: "overwrite", direction: dir, uuid, name: scriptName });
              overwriteScripts.push({ uuid, scriptName, direction: dir });
            };
            if (direction.action === "pull") {
              updateScript.set(uuid, true);
              await this.pullScript(fs, file as SyncFiles, cloudStatus[uuid], script);
              recordOverwrite("pull");
              return;
            }
            if (direction.action === "push") {
              const pushed = await this.pushScript(fs, script);
              recordOverwrite("push");
              return pushed;
            }
            if (direction.action === "adopt") {
              // 两端内容一致只是基线过期：返回内容 md5 让 updateFileDigest 推进基线，不产生写操作
              return direction.digestMap;
            }
            throw new SyncBothChangedConflictError(uuid, i18nName(script));
          })()
        );
        return;
      }
      // 如果脚本不存在，但文件存在，则安装脚本
      if (file.script) {
        if (!file.meta) {
          // .meta 文件可能尚未上传完成，跳过本次以避免误删云端脚本
          this.logger.warn("skip orphan cloud script without meta", {
            uuid,
            file: file.script.name,
          });
          skippedOrphanUuids.add(uuid);
          return;
        }
        updateScript.set(uuid, true);
        addSyncTask(uuid, this.pullScript(fs, file as SyncFiles, cloudStatus[uuid]));
        return;
      }
      // 本地无脚本、云端只剩 .meta.json：tombstone 是删除标记须保留；
      // 非 tombstone 是他端分片删除的残留，放着会被其他设备当「无效 meta」重新上传脚本。
      // 以 digest 变化为门（tombstone 首轮读取盖章后不再重复读取）
      if (file.meta && fileDigestMap[file.meta.name] !== file.meta.digest) {
        const meta = file.meta;
        addSyncTask(
          uuid,
          (async () => {
            const metaObj = JSON.parse((await fs.open(meta).then((r) => r.read("string"))) as string) as SyncMeta;
            if (!metaObj.isDeleted) {
              await fs.delete(meta.name);
            }
          })(),
          [meta.name]
        );
      }
    });
    // 上传剩下的脚本
    scriptMap.forEach((script) => {
      addSyncTask(script.uuid, this.pushScript(fs, script));
    });
    // 忽略错误
    const syncResults = await Promise.allSettled(result.map((item) => item.promise));
    const pushedFileDigestMap: FileDigestMap = {};
    const preserveDigestFiles = new Set<string>();
    // 重放失败的 uuid 也计入失败：状态条如实显示、status 写回保留云端原值
    const failedSyncUuids = new Set<string>(pendingFailedUuids);
    const conflictScripts: SyncBothChangedConflictError[] = [];
    const partialPushUuids: string[] = [];
    syncResults.forEach((ret, index) => {
      if (ret.status === "fulfilled" && ret.value) {
        Object.assign(pushedFileDigestMap, ret.value);
      } else if (ret.status === "rejected") {
        failedSyncUuids.add(result[index].uuid);
        if (ret.reason instanceof SyncBothChangedConflictError) {
          conflictScripts.push(ret.reason);
        }
        // 分片上传时已成功写入云端的文件（如 .user.js 成功、.meta.json 失败）不保留旧 digest，
        // 让 updateFileDigest 记录其云端最新 digest，下一轮只重试真正失败的文件。
        const writtenFiles = ret.reason instanceof PushScriptPartialError ? ret.reason.writtenFiles : [];
        if (writtenFiles.length > 0) {
          partialPushUuids.push(result[index].uuid);
        }
        result[index].preserveDigestFiles.forEach((name) => {
          if (!writtenFiles.includes(name)) {
            preserveDigestFiles.add(name);
          }
        });
        this.logger.warn("sync task failed", Logger.E(ret.reason), {
          errorKind: this.classifySyncError(ret.reason),
          files: result[index].preserveDigestFiles,
        });
      }
    });
    // push 部分成功的 uuid：.user.js digest 会被推进，下一轮方向判定不会再生成 .meta.json
    // 的重试任务，登记 pending push 由下一轮 syncOnce 开头重放
    if (partialPushUuids.length) {
      for (const uuid of partialPushUuids) {
        pendingOps[uuid] = { op: "push" };
      }
      await this.setPendingSyncOps(pendingOps);
    }
    // 冲突通知：一轮只发一条；同一批脚本持续冲突时不重复轰炸，集合变化或冲突消失后重置
    const conflictKey = conflictScripts
      .map((c) => c.uuid)
      .sort()
      .join(",");
    if (conflictScripts.length) {
      const lastNotifiedConflictKey = ((await this.storage.get(LAST_NOTIFIED_CONFLICT_KEY)) as string) || "";
      if (conflictKey !== lastNotifiedConflictKey) {
        InfoNotification(
          i18n.t("settings:notification.script_sync_conflict"),
          i18n.t("settings:notification.script_sync_conflict_desc", {
            scriptNames: conflictScripts.map((c) => c.scriptName).join(", "),
          }),
          {
            url: chrome.runtime.getURL("/src/options.html#/settings?section=sync"),
          }
        );
        await this.storage.set(LAST_NOTIFIED_CONFLICT_KEY, conflictKey);
      }
    }
    // 覆盖不再弹桌面通知：覆盖是已发生、无需用户处理的信息级事件，仅由上面的 overwrite 日志
    // 与设置页状态条信息行 + 日志深链承载（见 docs/cloud-sync.md 覆盖可见性）。
    // 同步状态
    if (syncConfig.syncStatus && canWriteScriptcatSync) {
      try {
        const scriptlist = await this.scriptDAO.all();
        await Promise.allSettled(
          scriptlist.map(async (script) => {
            if (failedSyncUuids.has(script.uuid)) {
              scriptcatSync.status.scripts[script.uuid] = cloudStatus[script.uuid];
              return;
            }
            // 判断云端状态是否与本地状态一致
            const status = cloudStatus[script.uuid];
            const updatetime = script.updatetime || script.createtime;
            if (!status) {
              scriptcatSync.status.scripts[script.uuid] = {
                enable: script.status === SCRIPT_STATUS_ENABLE,
                sort: script.sort,
                updatetime: updatetime,
              };
            } else {
              if (updateScript.has(script.uuid)) {
                // 脚本已经更新过了,跳过状态同步
                scriptcatSync.status.scripts[script.uuid] = status;
                return;
              }
              // 判断时间
              // 如果云端状态的更新时间小于本地状态的更新时间,则更新云端状态
              if (status.updatetime < updatetime) {
                scriptcatSync.status.scripts[script.uuid] = {
                  enable: script.status === SCRIPT_STATUS_ENABLE,
                  sort: script.sort,
                  updatetime: updatetime,
                };
                return;
              }
              // 否则采用云端状态
              scriptcatSync.status.scripts[script.uuid] = status;
              // 脚本顺序
              if (status.sort !== script.sort) {
                await this.scriptDAO.update(script.uuid, {
                  sort: status.sort,
                });
              }
              // 脚本状态
              if (status.enable !== (script.status === SCRIPT_STATUS_ENABLE)) {
                // 开启脚本
                await this.script.enableScript({
                  uuid: script.uuid,
                  enable: status.enable,
                });
              }
            }
          })
        );
        // 保留被跳过的 orphan uuid 的云端 status，避免覆盖另一台设备半上传的状态
        skippedOrphanUuids.forEach((uuid) => {
          const status = cloudStatus[uuid];
          if (status) {
            scriptcatSync.status.scripts[uuid] = status;
          }
        });
        if (file) {
          const latestCloudStatus = await this.readScriptcatSyncStatus(fs, file);
          scriptcatSync.status.scripts = this.mergeScriptcatSyncStatus(
            cloudStatus,
            latestCloudStatus,
            scriptcatSync.status.scripts
          );
        }
        // 保存脚本猫同步状态
        const modifiedDate = Date.now();
        const syncFile = await fs.create("scriptcat-sync.json", { modifiedDate });
        await syncFile.write(JSON.stringify(scriptcatSync, null, 2));
        this.logger.info("sync scriptcat-sync.json file success");
      } catch (e) {
        this.logger.warn("sync scriptcat-sync.json file failed", Logger.E(e));
      }
    } else if (syncConfig.syncStatus && !canWriteScriptcatSync) {
      this.logger.warn("skip scriptcat-sync.json write because cloud status could not be read");
    }
    // 重新获取文件列表,保存文件摘要
    this.logger.info("update file digest");
    await this.updateFileDigest(fs, pushedFileDigestMap, preserveDigestFiles);
    if (!conflictScripts.length) {
      await this.storage.set(LAST_NOTIFIED_CONFLICT_KEY, "");
    }
    this.logger.info("sync complete");
    // failedSyncUuids 含冲突（冲突走失败路径），failed 计数排除冲突以免与 conflict 重复
    return {
      total: scriptList.length,
      overwrite: overwriteScripts.length,
      conflict: conflictScripts.length,
      failed: Math.max(0, failedSyncUuids.size - conflictScripts.length),
    };
  }

  private classifySyncError(error: unknown): SyncErrorKind {
    if (error instanceof PushScriptPartialError) {
      return this.classifySyncError(error.originalError);
    }
    if (error instanceof SyncBothChangedConflictError) {
      return "conflict";
    }
    if (error instanceof FileSystemError) {
      if (error.conflict) {
        return "conflict";
      }
      if (error.rateLimit || error.retryable) {
        return "transient";
      }
      if (error.notFound) {
        return "stale_snapshot";
      }
      // auth 等其余 typed 错误都属于 fatal
      return "fatal";
    }
    // WarpTokenError 及其他未分类错误一律 fatal
    return "fatal";
  }

  private async readScriptcatSyncStatus(fs: FileSystem, file: FileInfo): Promise<ScriptcatSync["status"]["scripts"]> {
    const cloudScriptCatSync = JSON.parse(await fs.open(file).then((f) => f.read("string"))) as Partial<ScriptcatSync>;
    return cloudScriptCatSync.status?.scripts || {};
  }

  private mergeScriptcatSyncStatus(
    initialStatus: ScriptcatSync["status"]["scripts"],
    latestStatus: ScriptcatSync["status"]["scripts"],
    candidateStatus: ScriptcatSync["status"]["scripts"]
  ): ScriptcatSync["status"]["scripts"] {
    const merged: ScriptcatSync["status"]["scripts"] = { ...latestStatus };
    for (const uuid of Object.keys(candidateStatus)) {
      const candidate = candidateStatus[uuid];
      if (!candidate) {
        continue;
      }
      const initial = initialStatus[uuid];
      const latest = latestStatus[uuid];
      const candidateOnlyPreservedInitial =
        initial &&
        candidate.enable === initial.enable &&
        candidate.sort === initial.sort &&
        candidate.updatetime === initial.updatetime;
      if (candidateOnlyPreservedInitial) {
        // Defer to remote: if another device deleted this uuid, respect the deletion
        if (latest !== undefined) {
          merged[uuid] = latest;
        }
        continue;
      }
      if (!latest || candidate.updatetime >= latest.updatetime) {
        merged[uuid] = candidate;
      }
    }
    return merged;
  }

  async updateFileDigest(
    fs: FileSystem,
    knownFileDigestMap: FileDigestMap = {},
    preserveFileNames = new Set<string>()
  ) {
    // 先落库本次成功推送内容的 md5（独立于易失的 fs.list），供后续同步方向判定
    await this.recordSyncedContentMd5(knownFileDigestMap);
    const oldFileDigestMap = ((await this.storage.get("file_digest")) as FileDigestMap) || {};
    const newList = await fs.list();
    const newFileDigestMap: FileDigestMap = {};
    for (const file of newList) {
      if (preserveFileNames.has(file.name)) {
        if (oldFileDigestMap[file.name] !== undefined) {
          newFileDigestMap[file.name] = oldFileDigestMap[file.name];
        }
        continue;
      }
      newFileDigestMap[file.name] = file.digest;
    }
    // 各后端 digest 格式不一（WebDAV/OneDrive/S3 是 etag、Dropbox 是 content_hash、Zip 为空，
    // 仅 GoogleDrive/Baidu 是 md5），只在云端列表暂时漏掉刚上传的文件时用本地 md5 兜底，
    // 不能覆盖 fs.list 已返回的原生 digest，否则下次同步比对会因格式不一致而误判
    for (const name in knownFileDigestMap) {
      if (!(name in newFileDigestMap) && !preserveFileNames.has(name)) {
        newFileDigestMap[name] = knownFileDigestMap[name];
      }
    }
    preserveFileNames.forEach((name) => {
      if (!(name in newFileDigestMap) && oldFileDigestMap[name] !== undefined) {
        newFileDigestMap[name] = oldFileDigestMap[name];
      }
    });
    await this.storage.set("file_digest", newFileDigestMap);
    // syncOnce 已全量对账整份云端列表，可安全清理 file_digest 之外的 sync_content_md5，避免只增不删
    await this.pruneSyncedContentMd5((name) => !(name in newFileDigestMap));
    return;
  }

  // 队列路径（scriptInstall/scriptsDelete）只推送/删除了指定 uuid 的文件，只能更新这些文件的 digest 记录。
  // 不能像 syncOnce 那样全量盖章：syncOnce 已逐文件对账整份云端列表，而队列路径没有——全量盖章会把
  // 他端已更新但本机尚未 pull 的文件也标成已同步，导致下轮 syncOnce 早退漏 pull。
  async updateFileDigestForUuids(
    fs: FileSystem,
    uuids: string[],
    knownFileDigestMap: FileDigestMap = {},
    preserveFileNames = new Set<string>()
  ) {
    // 先落库本次成功推送内容的 md5（独立于易失的 fs.list），供后续同步方向判定
    await this.recordSyncedContentMd5(knownFileDigestMap);
    const fileDigestMap = ((await this.storage.get("file_digest")) as FileDigestMap) || {};
    const targetFiles = new Set(uuids.flatMap((uuid) => [`${uuid}.user.js`, `${uuid}.meta.json`]));
    const newList = await fs.list();
    const listedDigest = new Map(newList.map((file) => [file.name, file.digest]));
    // 本次确认已从云端删除的目标文件，其 sync_content_md5 一并清理（仅限本次目标，队列路径未全量对账不能全局清理）
    const deletedTargetFiles = new Set<string>();
    for (const name of targetFiles) {
      if (preserveFileNames.has(name)) {
        // 失败文件保留旧 digest，下轮重试
        continue;
      }
      if (listedDigest.has(name)) {
        // 云端仍在：记录原生 digest（各后端 etag/content_hash/md5 格式不一，须用 list 的原生值而非本地 md5）
        fileDigestMap[name] = listedDigest.get(name)!;
      } else if (name in knownFileDigestMap) {
        // 云端列表暂时漏掉刚上传的文件（最终一致性延迟）：用本地 md5 兜底
        fileDigestMap[name] = knownFileDigestMap[name];
      } else {
        // 云端已不存在（删除）：移除记录
        delete fileDigestMap[name];
        deletedTargetFiles.add(name);
      }
    }
    await this.storage.set("file_digest", fileDigestMap);
    await this.pruneSyncedContentMd5((name) => deletedTargetFiles.has(name));
    return;
  }

  private async getPendingSyncOps(): Promise<PendingSyncOps> {
    return ((await this.storage.get(PENDING_SYNC_OPS_KEY)) as PendingSyncOps) || {};
  }

  private async setPendingSyncOps(ops: PendingSyncOps) {
    await this.storage.set(PENDING_SYNC_OPS_KEY, ops);
  }

  // 删除云端脚本数据
  async deleteCloudScript(fs: FileSystem, uuid: string, syncDelete: boolean) {
    const filename = `${uuid}.user.js`;
    const metaFilename = `${uuid}.meta.json`;
    const logger = this.logger.with({
      uuid: uuid,
      file: filename,
    });
    // 删除幂等化：目标文件已不存在即视为达成目的。部分 provider（Google Drive 等）
    // 对缺失文件抛 notFound，重放半途失败的删除时不能被它中断
    const deleteIgnoreMissing = async (name: string) => {
      try {
        await fs.delete(name);
      } catch (e) {
        if (!isNotFoundError(e)) throw e;
      }
    };
    try {
      await deleteIgnoreMissing(filename);
      if (syncDelete) {
        // 留下一个.meta.json删除标记
        const modifiedDate = Date.now();
        const meta = await fs.create(metaFilename, { modifiedDate });
        await meta.write(
          JSON.stringify(<SyncMeta>{
            uuid: uuid,
            isDeleted: true,
          })
        );
      } else {
        // 直接删除所有相关文件
        await deleteIgnoreMissing(metaFilename);
      }
      logger.info("delete success");
    } catch (e) {
      logger.error("delete file error", Logger.E(e));
      throw e;
    }
    return;
  }

  // 上传脚本
  async pushScript(fs: FileSystem, script: PushScriptParam): Promise<FileDigestMap> {
    const filename = `${script.uuid}.user.js`;
    const metaFilename = `${script.uuid}.meta.json`;
    const logger = this.logger.with({
      uuid: script.uuid,
      name: script.name,
      file: filename,
    });
    // 记录本次已成功写入云端的文件，供部分失败时区分「成功文件」与「失败文件」
    const writtenFiles: string[] = [];
    try {
      const modifiedDate = getScriptModifiedDate(script);
      const w = await fs.create(filename, { modifiedDate });
      // 获取脚本代码
      const code = await this.scriptCodeDAO.get(script.uuid);
      const scriptCode = code!.code;
      await w.write(scriptCode);
      writtenFiles.push(filename);
      const meta = await fs.create(metaFilename, { modifiedDate });
      const metaJson = JSON.stringify(<SyncMeta>{
        uuid: script.uuid,
        origin: script.origin,
        downloadUrl: script.downloadUrl,
        checkUpdateUrl: script.checkUpdateUrl,
      });
      await meta.write(metaJson);
      writtenFiles.push(metaFilename);
      logger.info("push script success");
      return {
        [filename]: md5OfText(scriptCode),
        [metaFilename]: md5OfText(metaJson),
      };
    } catch (e) {
      logger.error("push script error", Logger.E(e));
      throw new PushScriptPartialError(e, writtenFiles);
    }
  }

  // 落库本次成功推送/拉取内容的 md5（键为文件名）：作为本地内容基线供方向判定（L4），
  // 在 updateFileDigest* 内部、fs.list 之前调用，确保即便随后 list 抛错也已持久化。
  private async recordSyncedContentMd5(syncedMd5Map: FileDigestMap) {
    const names = Object.keys(syncedMd5Map);
    if (!names.length) {
      return;
    }
    const stored = ((await this.storage.get("sync_content_md5")) as FileDigestMap) || {};
    for (const name of names) {
      stored[name] = syncedMd5Map[name];
    }
    await this.storage.set("sync_content_md5", stored);
  }

  // 随 file_digest 生命周期收敛 sync_content_md5，避免只增不删。shouldRemove 决定某文件名是否移除。
  private async pruneSyncedContentMd5(shouldRemove: (name: string) => boolean) {
    const stored = ((await this.storage.get("sync_content_md5")) as FileDigestMap) || {};
    let changed = false;
    for (const name of Object.keys(stored)) {
      if (shouldRemove(name)) {
        delete stored[name];
        changed = true;
      }
    }
    if (changed) {
      await this.storage.set("sync_content_md5", stored);
    }
  }

  // 云端 digest 相对上次同步已变时决定同步方向。
  // 不比较本地毫秒时钟与服务端整秒 mtime（同秒竞态会误判方向，L4）：
  // 用上次同步的本地内容基线判断本地是否也变过，双方都变才算冲突；
  // 无基线（升级前旧数据/从未同步成功）时退回旧的时间比较规则。
  private async decideDirectionOnRemoteChange(
    fs: FileSystem,
    cloudFile: FileInfo,
    script: Script,
    syncedContentMd5Map: FileDigestMap
  ): Promise<
    { action: "push" | "pull" | "conflict"; unverified?: boolean } | { action: "adopt"; digestMap: FileDigestMap }
  > {
    const baselineMd5 = syncedContentMd5Map[cloudFile.name];
    if (baselineMd5 === undefined) {
      // 无内容基线（升级前旧数据/从未同步成功）：只能退回跨时钟域的墙钟比较（整秒对齐，同秒判 pull），
      // 无法确认落败一端是否真未改动，因此标记 unverified——上层据此打 overwrite 日志并通知用户，
      // 让其自行确认（见 docs/cloud-sync.md 覆盖可见性）。
      const updatetime = script.updatetime || script.createtime;
      return { action: isNewerBySecond(updatetime, cloudFile.updatetime) ? "push" : "pull", unverified: true };
    }
    const code = await this.scriptCodeDAO.get(script.uuid);
    const localMd5 = code ? md5OfText(code.code) : undefined;
    if (localMd5 === baselineMd5) {
      return { action: "pull" };
    }
    // 本地也变了：读取云端内容确认是否真冲突。两端内容一致（两台设备做了同样的编辑，
    // 或本机记账失败后云端内容实为本机所写）只是基线过期，直接采用云端 digest 收敛
    try {
      const cloudCode = (await fs.open(cloudFile).then((r) => r.read("string"))) as string;
      if (localMd5 !== undefined && md5OfText(cloudCode) === localMd5) {
        return { action: "adopt", digestMap: { [cloudFile.name]: localMd5 } };
      }
    } catch (e) {
      this.logger.warn("read cloud content for conflict check failed", Logger.E(e), { uuid: script.uuid });
    }
    return { action: "conflict" };
  }

  async pullScript(fs: FileSystem, file: SyncFiles, status: ScriptcatSyncStatus | undefined, existingScript?: Script) {
    const logger = this.logger.with({
      uuid: existingScript?.uuid || "",
      name: existingScript?.name || "",
      file: file.script.name,
    });
    try {
      // 读取代码文件
      const r = await fs.open(file.script);
      const code = (await r.read("string")) as string;
      // 读取meta文件
      const meta = await fs.open(file.meta);
      const metaJson = (await meta.read("string")) as string;
      const metaObj = JSON.parse(metaJson) as SyncMeta;
      const { script } = await prepareScriptByCode(
        code,
        existingScript?.downloadUrl || metaObj.downloadUrl || "",
        existingScript?.uuid || metaObj.uuid
      );
      script.origin = script.origin || metaObj.origin;
      if (status) {
        if (existingScript) {
          if (!existingScript.updatetime || status.updatetime > existingScript.updatetime) {
            // 如果云端状态的更新时间大于本地状态的更新时间,则采用云端状态
            script.sort = status.sort;
            script.status = status.enable ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE;
          }
        } else {
          // 新安装的脚本采用云端状态
          script.sort = status.sort;
          script.status = status.enable ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE;
        }
      }
      await this.script.installScript({
        script,
        code,
        upsertBy: "sync",
        // 本地 updatetime 采用云端文件时间（与 push 把 modifiedDate 设为本地 updatetime 对称）。
        // 若放任 prepareScriptByCode 的 Date.now()，下一轮会把刚拉下来的内容误判为
        // "本地编辑过"而补偿 push；etag 型 provider 重写会换 etag，两台设备将永久 pull/push 振荡
        updatetime: file.script.updatetime,
      });
      // 记录拉取内容基线：下轮云端再变时用它判断本地是否也改过（方向判定不依赖跨时钟时间比较）
      await this.recordSyncedContentMd5({
        [file.script.name]: md5OfText(code),
        [file.meta.name]: md5OfText(metaJson),
      });
      logger.info("pull script success");
    } catch (e) {
      logger.error("pull script error", Logger.E(e));
      throw e;
    }
  }

  private ensureCloudSyncAlarm() {
    chrome.alarms.get("cloudSync", (alarm) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.alarms.get:", lastError);
      }
      if (!alarm) {
        chrome.alarms.create(
          "cloudSync",
          {
            periodInMinutes: 60,
          },
          () => {
            const lastError = chrome.runtime.lastError;
            if (lastError) {
              console.error("chrome.runtime.lastError in chrome.alarms.create:", lastError);
              // Starting in Chrome 117, the number of active alarms is limited to 500. Once this limit is reached, chrome.alarms.create() will fail.
              console.error("Chrome alarm is unable to create. Please check whether limit is reached.");
            }
          }
        );
      }
    });
  }

  private clearCloudSyncAlarm() {
    chrome.alarms.clear("cloudSync");
  }

  private startCloudSync(value: CloudSyncConfig) {
    this.ensureCloudSyncAlarm();
    this.buildFileSystem(value)
      .then((fs) => this.syncOnce(value, fs))
      .catch((e) => {
        this.logger.error("cloud sync config change error", Logger.E(e));
      });
  }

  cloudSyncConfigChange(value: CloudSyncConfig, previous?: CloudSyncConfig) {
    const knownPrevious = this.lastCloudSyncConfig || previous;
    this.lastCloudSyncConfig = value;
    if (knownPrevious && isCloudSyncConfigEquivalent(value, knownPrevious)) return;

    // 启动时首次处理配置：按当前值恢复运行状态，避免 SW 重启后漏掉同步或小时闹钟。
    if (!knownPrevious) {
      if (value.enable) {
        this.startCloudSync(value);
      } else {
        this.clearCloudSyncAlarm();
      }
      return;
    }

    const connectionChanged = !isCloudSyncConnectionEquivalent(value, knownPrevious);
    if (value.enable && connectionChanged) {
      // 防御非设置页写入：连接变化不得在启用状态下生效，否则连续凭据写入会触发同步风暴。
      this.clearCloudSyncAlarm();
      this.systemConfig.setCloudSync({ ...value, enable: false });
      return;
    }

    if (!knownPrevious.enable && value.enable) {
      this.startCloudSync(value);
    } else if (knownPrevious.enable && !value.enable) {
      this.clearCloudSyncAlarm();
    }
  }

  async scriptInstall(params: TInstallScript) {
    if (params.upsertBy === "sync") {
      return;
    }
    // 判断是否开启了同步
    const config = await this.systemConfig.getCloudSync();
    if (config.enable) {
      stackAsyncTask(SYNC_SERVICE_TASK_KEY, async () => {
        const fs = await this.buildFileSystem(config);
        const script = params.script;
        try {
          const pushedFileDigestMap = await this.pushScript(fs, script);
          await this.updateFileDigestForUuids(fs, [script.uuid], pushedFileDigestMap);
        } catch (e) {
          // 部分成功（如 .user.js 成功、.meta.json 失败）时，已写成功文件的云端 digest 已更新，
          // 必须记录其最新 digest、只保留失败文件的旧值，避免下一轮误判成功文件仍未同步。
          // 全部失败（无文件写入成功）则不动 file_digest，保持"失败不污染"。
          const writtenFiles = e instanceof PushScriptPartialError ? e.writtenFiles : [];
          if (writtenFiles.length > 0) {
            // 部分成功后 .user.js digest 已推进，下一轮「digest 相等 + 本地时间不比云端新」
            // 会跳过整个 uuid（生产安装消息不带时间字段，云端 mtime 是 push 时刻的 Date.now()，
            // 本地时间必然不比它新），失败的 .meta.json 不会再获得重试：登记 pending push 由 syncOnce 重放
            const pendingOps = await this.getPendingSyncOps();
            pendingOps[script.uuid] = { op: "push" };
            await this.setPendingSyncOps(pendingOps);
            const preserve = new Set(
              [`${script.uuid}.user.js`, `${script.uuid}.meta.json`].filter((name) => !writtenFiles.includes(name))
            );
            await this.updateFileDigestForUuids(fs, [script.uuid], {}, preserve);
          }
          throw e;
        }
      }).catch((e) => {
        this.logger.error("push script on install error", Logger.E(e), {
          errorKind: this.classifySyncError(e),
        });
      });
    }
  }

  async scriptsDelete(data: TDeleteScript[]) {
    // 过滤掉来源为 sync 的删除事件，避免 syncOnce 内部触发的 mq 回灌
    // 又排一次 buildFileSystem + updateFileDigest 的空跑任务
    const items = data.filter((d) => d.deleteBy !== "sync");
    if (!items.length) {
      return;
    }
    // 判断是否开启了同步
    const config = await this.systemConfig.getCloudSync();
    if (config.enable) {
      stackAsyncTask(SYNC_SERVICE_TASK_KEY, async () => {
        const fs = await this.buildFileSystem(config);
        // 写前登记删除意图：两步删除（删 .user.js + 写 tombstone/删 .meta.json）中途失败
        // 或 SW 中途重启后，由 syncOnce 开头按登记重放，全部步骤成功才清除
        const pendingOps = await this.getPendingSyncOps();
        for (const { uuid } of items) {
          pendingOps[uuid] = { op: "delete", syncDelete: config.syncDelete };
        }
        await this.setPendingSyncOps(pendingOps);
        const preserveDigestFiles = new Set<string>();
        for (const { uuid } of items) {
          try {
            await this.deleteCloudScript(fs, uuid, config.syncDelete);
            delete pendingOps[uuid];
          } catch (e) {
            preserveDigestFiles.add(`${uuid}.user.js`);
            preserveDigestFiles.add(`${uuid}.meta.json`);
            this.logger.warn("delete cloud script item failed", Logger.E(e), {
              uuid,
              errorKind: this.classifySyncError(e),
            });
          }
        }
        await this.setPendingSyncOps(pendingOps);
        await this.updateFileDigestForUuids(
          fs,
          items.map((item) => item.uuid),
          {},
          preserveDigestFiles
        );
      }).catch((e) => {
        this.logger.error("delete cloud script error", Logger.E(e));
      });
    }
  }

  // 手动触发一次云同步（设置页「立即同步」按钮）。用已保存配置，未启用则不触发。
  async cloudSyncOnce() {
    const config = await this.systemConfig.getCloudSync();
    if (!config.enable) return;
    let fs: FileSystem;
    try {
      fs = await this.buildFileSystem(config);
    } catch (e) {
      // 构建文件系统失败（连接/认证）发生在 syncOnce 之前，syncOnce 的状态处理覆盖不到；
      // 这里补写 error 状态，让设置页状态条反映失败，并向上抛出供 UI 提示用户。
      const prev = ((await this.storage.get(CLOUD_SYNC_STATE_KEY)) as CloudSyncState) || DEFAULT_CLOUD_SYNC_STATE;
      await this.storage.set(CLOUD_SYNC_STATE_KEY, {
        ...prev,
        syncing: false,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
    await this.syncOnce(config, fs);
  }

  init() {
    this.group.on("cloudSyncOnce", this.cloudSyncOnce.bind(this));
    this.group.on("export", this.requestExport.bind(this));
    this.group.on("backupToCloud", this.backupToCloud.bind(this));
    this.group.on("importResources", this.importResources.bind(this));
    this.group.on("restoreConfigBundle", this.restoreConfigBundle.bind(this));
    // 监听脚本变化, 进行同步
    this.mq.subscribe<TInstallScript>("installScript", this.scriptInstall.bind(this));
    this.mq.subscribe<TDeleteScript[]>("trashScripts", this.scriptsDelete.bind(this));
  }
}
