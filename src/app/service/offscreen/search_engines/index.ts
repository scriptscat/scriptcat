// 触发所有搜索引擎注册（副作用导入）
import "./bing";
import "./baidu";
import "./duckduckgo";

export { searchEngineRegistry } from "./registry";
export type { SearchEngine, SearchResult } from "./types";
