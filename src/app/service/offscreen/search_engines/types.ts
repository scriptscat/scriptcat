/** 搜索结果条目（通用格式） */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * 搜索引擎解析器接口。
 * 每个引擎独立实现此接口，由 searchEngineRegistry 统一管理。
 */
export interface SearchEngine {
  /** 引擎名（全局唯一，用于注册与查找） */
  readonly name: string;
  /**
   * 解析已解析好的 Document，返回搜索结果数组。
   * DOM 解析由外层统一完成，避免各引擎重复 DOMParser 实例化。
   */
  extract(document: Document): SearchResult[];
}
