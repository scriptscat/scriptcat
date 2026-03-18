export type SearchEngineConfig = {
  engine: "bing" | "duckduckgo" | "baidu" | "google_custom";
  googleApiKey?: string;
  googleCseId?: string;
};

const STORAGE_KEY = "agent_search_config";

const DEFAULT_CONFIG: SearchEngineConfig = {
  engine: "bing",
};

export class SearchConfigRepo {
  async getConfig(): Promise<SearchEngineConfig> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      return result[STORAGE_KEY] || DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  async saveConfig(config: SearchEngineConfig): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: config });
  }
}
