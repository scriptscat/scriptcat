import { type SystemConfig } from "@App/pkg/config/config";
import type { TBatchUpdateRecordObject } from "./types";
import { type Group } from "@Packages/message/server";
import { type IMessageQueue } from "@Packages/message/message_queue";
import { type ValueService } from "./value";
import { type ResourceService } from "./resource";
import { type ScriptDAO } from "@App/app/repo/scripts";
import { type TCheckScriptUpdateOption } from "./script";

class ScriptUpdateCheck {
  constructor(
    private readonly systemConfig: SystemConfig,
    private readonly group: Group,
    private readonly mq: IMessageQueue,
    private readonly valueService: ValueService,
    private readonly resourceService: ResourceService,
    private readonly scriptDAO: ScriptDAO
  ) {
    // do nothing
  }

  public cacheFull: TBatchUpdateRecordObject | null = null;
  public deliveryTexts: string[] | null = null;
  public state: Partial<Record<string, any>> & { status: number; checktime?: number } = { status: 0 };
  public get lastCheck(): number {
    return this.cacheFull?.checktime ?? 0;
  }
  public getTargetSites() {
    const recordObject = this.cacheFull;
    const list = recordObject?.list;
    if (!list) return [] as string[];
    const s = new Set<string>();
    for (const entry of list) {
      const newVersion = entry.newMeta?.version?.[0];
      if (typeof newVersion === "string" && entry.script?.ignoreVersion === newVersion) continue;
      if (entry.script?.status !== 1) continue;
      if (!entry.script?.checkUpdate) continue;
      if (!entry.sites) continue;
      for (const site of entry.sites) {
        s.add(site);
      }
    }
    if (s.size === 0) return [] as string[];
    return [...s];
  }
  public updateDeliveryTexts(recordLite: TBatchUpdateRecordObject | null) {
    const CHUNK_SIZE = 450000; // 0.45MiB
    let str = recordLite === null ? "" : JSON.stringify(recordLite);
    const batchUpdateRecordTexts = (this.deliveryTexts = [] as string[]);
    while (str.length > CHUNK_SIZE) {
      batchUpdateRecordTexts.push(str.substring(0, CHUNK_SIZE));
      str = str.substring(CHUNK_SIZE);
    }
    batchUpdateRecordTexts.push(str);
  }
  public setCacheFull(recordObject: TBatchUpdateRecordObject | null) {
    const list = recordObject?.list;
    list?.sort((a, b) => {
      // 检查期间被改动的脚本只保留 checkUpdate:false 标记,没有可展示的 script 快照。
      // 这类标记仍需进入缓存以表达「已检查」,但不能参与脚本排序。
      if (!a.script || !b.script) return a.script ? -1 : b.script ? 1 : 0;
      if (a.script!.status === 1 && b.script!.status === 2) return -1;
      if (a.script!.status === 2 && b.script!.status === 1) return 1;
      return a.script!.sort! - b.script!.sort!;
    });
    this.cacheFull = recordObject;
    const recordLite = recordObject
      ? {
          ...recordObject,
          list: list?.map((entry) => {
            if (entry.checkUpdate) {
              return {
                uuid: entry.uuid,
                checkUpdate: entry.checkUpdate,
                newCode: "",
                oldCode: "",
                codeSimilarity: entry.codeSimilarity,
                codeComparable: entry.codeComparable,
                metadataComparison: entry.metadataComparison,
                newMeta: {
                  version: entry.newMeta?.version || ([] as string[]),
                  connect: entry.newMeta?.connect || ([] as string[]),
                },
                script: entry.script,
                sites: entry.sites,
                withNewConnect: entry.withNewConnect,
              };
            }
            return {
              uuid: entry.uuid,
              checkUpdate: false,
            };
          }),
        }
      : {};
    this.updateDeliveryTexts(recordLite);
  }
  public makeDeliveryPacket(i: number) {
    const recordStrs = this.deliveryTexts || ([] as string[]);
    const chunk = recordStrs[i] || "";
    return {
      chunk: chunk,
      ended: i >= recordStrs.length - 1,
    };
  }
  public announceMessage(message: Partial<Record<string, any>>) {
    this.mq.publish<any>("onScriptUpdateCheck", { myMessage: { ...message } });
  }

  public canSkipScriptUpdateCheck(opts: TCheckScriptUpdateOption) {
    const lastCheckTime = this.cacheFull?.checktime;
    const noUpdateCheck = opts?.noUpdateCheck;
    if (noUpdateCheck > 0 && lastCheckTime) {
      if (lastCheckTime + noUpdateCheck > Date.now()) {
        return true;
      }
    }
    return false;
  }
}

export { ScriptUpdateCheck };
