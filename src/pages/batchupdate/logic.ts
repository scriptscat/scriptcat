import type { TBatchUpdateRecord, TBatchUpdateRecordObject } from "@App/app/service/service_worker/types";

export type UpdateRisk = "major" | "noticeable" | "tiny";

export interface UpdateItem {
  uuid: string;
  name: string;
  enabled: boolean;
  oldVersion: string;
  newVersion: string;
  similarity: number;
  risk: UpdateRisk;
  withNewConnect: boolean;
  source: string;
  ignored: boolean;
}

export function riskLevel(similarity: number): UpdateRisk {
  if (similarity < 0.75) return "major";
  if (similarity < 0.95) return "noticeable";
  return "tiny";
}

export function getSource(record: TBatchUpdateRecord): string {
  if (!record.checkUpdate) return "";
  if (record.script.originDomain) return record.script.originDomain;
  if (!record.script.downloadUrl) return "";
  try {
    return new URL(record.script.downloadUrl).hostname;
  } catch {
    return "";
  }
}

export function toUpdateItem(record: TBatchUpdateRecord): UpdateItem | null {
  if (!record.checkUpdate) return null;

  const oldVersion = record.script.metadata.version?.[0] ?? "";
  const newVersion = record.newMeta.version?.[0] ?? "";

  return {
    uuid: record.uuid,
    name: record.script.name,
    enabled: record.script.status === 1,
    oldVersion,
    newVersion,
    similarity: record.codeSimilarity,
    risk: riskLevel(record.codeSimilarity),
    withNewConnect: record.withNewConnect,
    source: getSource(record),
    ignored: record.script.ignoreVersion === newVersion,
  };
}

export function categorize(records: TBatchUpdateRecord[]): {
  updates: UpdateItem[];
  ignored: UpdateItem[];
} {
  const updates: UpdateItem[] = [];
  const ignored: UpdateItem[] = [];

  for (const record of records) {
    const item = toUpdateItem(record);
    if (!item) continue;
    if (item.ignored) {
      ignored.push(item);
    } else {
      updates.push(item);
    }
  }

  return { updates, ignored };
}

export async function assembleRecord(
  fetchChunk: (index: number) => Promise<{ chunk: string; ended: boolean }>
): Promise<TBatchUpdateRecordObject | null> {
  let text = "";

  for (let index = 0; ; index += 1) {
    const { chunk, ended } = await fetchChunk(index);
    text += chunk;
    if (ended) break;
  }

  if (!text) return null;
  return JSON.parse(text) as TBatchUpdateRecordObject;
}
