import type { SearchEngine } from "./types";

/** 搜索引擎插件注册表，支持运行时注册与查找 */
export class SearchEngineRegistry {
  private engines = new Map<string, SearchEngine>();

  /** 注册一个搜索引擎（同名覆盖） */
  register(engine: SearchEngine): void {
    this.engines.set(engine.name, engine);
  }

  /** 按名称获取引擎，未找到返回 undefined */
  get(name: string): SearchEngine | undefined {
    return this.engines.get(name);
  }

  /** 返回已注册的所有引擎名列表 */
  listNames(): string[] {
    return Array.from(this.engines.keys());
  }
}

export const searchEngineRegistry = new SearchEngineRegistry();
