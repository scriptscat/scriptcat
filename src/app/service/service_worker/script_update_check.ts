import { type SystemConfig } from "@App/pkg/config/config";
import type { TBatchUpdateRecordObject } from "./types";
import stringSimilarity from "string-similarity-js";
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

const getSimilarityScore = (oldCode: string, newCode: string) => {
  if (!oldCode.length || !newCode.length) return 0;
  // 转换 tab, 换行符，zero-width space, half-width space, full-width space 等为单一空格
  oldCode = oldCode.replace(
    /[\s\xA0\u2000-\u200D\u2028\u2029\u202F\u205F\u3000\u180E\u2060-\u2064\u3164\uFEFF\uFFA0]+/g,
    " "
  );
  newCode = newCode.replace(
    /[\s\xA0\u2000-\u200D\u2028\u2029\u202F\u205F\u3000\u180E\u2060-\u2064\u3164\uFEFF\uFFA0]+/g,
    " "
  );
  // 计算平均单词长度
  let x = 0,
    y = 0,
    t1 = 0,
    t2 = 0;
  oldCode.replace(/[^-+.*/\\,#@!$%^&()[\]{}|?<>:;"'=`~\s]+/g, (d) => (x++, (t1 += d.length), ""));
  newCode.replace(/[^-+.*/\\,#@!$%^&()[\]{}|?<>:;"'=`~\s]+/g, (d) => (y++, (t2 += d.length), ""));
  // 两者取其小
  let p = Math.floor(Math.min(t1 / x, t2 / y));
  // 单词长度最小为 2 (即计算库的预设值)
  if (p < 2 || Number.isNaN(p)) p = 2;
  else p = Math.floor(p / 2) * 2; // 取双数p
  // 重复使总长度大于 4096. 如果 oldCode 和 newCode 长度短而接近，两者会重复至 2048 长。如 oldCode 或 newCode 过短，则较长的会接近 4096 长。
  const repeatN = Math.ceil(4096 / (oldCode.length + newCode.length + 4));
  const oldCodeRepeated = new Array(repeatN + 1).join(`\n${oldCode}\n`);
  const newCodeRepeated = new Array(repeatN + 1).join(`\n${newCode}\n`);
  // 添加 prefix suffix 使最小长为 >6
  return stringSimilarity(`\n\n${oldCodeRepeated}\n\n`, `\n\n${newCodeRepeated}\n\n`, p, true);
};

export { ScriptUpdateCheck, getSimilarityScore };
