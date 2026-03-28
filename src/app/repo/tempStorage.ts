import { Repo } from "./repo";

export const TempStorageItemType = {
  tempCode: 1,
} as const;

export type TempStorageItemType = ValueOf<typeof TempStorageItemType>;

export interface TempStorageItem {
  key: string;
  value: any;
  savedAt: number;
  type: TempStorageItemType;
}

export const TEMP_ENTRY_MIN_TIME = 60_000;

export class TempStorageDAO extends Repo<TempStorageItem> {
  constructor() {
    super("tempStorage");
  }

  save(value: TempStorageItem) {
    return super._save(value.key, value);
  }

  async getValue<T>(key: string) {
    return (await super.get(key))?.value as T | undefined;
  }

  async entries(type?: TempStorageItemType) {
    const data = await super.find((key, value) => {
      return type ? value.type === type : true;
    });
    return data;
  }

  async staleEntries(keeps: Set<string>) {
    const now = Date.now();
    const entries = await new TempStorageDAO().entries();
    return entries.filter((entry) => !keeps.has(entry.key) && now - entry.savedAt > TEMP_ENTRY_MIN_TIME);
  }
}
