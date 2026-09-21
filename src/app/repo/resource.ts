import { type URLRuleEntry } from "@App/pkg/utils/url_matcher";
import { deletesStorage, loadCache, Repo } from "./repo";
import { v5 as uuidv5 } from "uuid";

export type ResourceType = "require" | "require-css" | "resource";

export interface Resource {
  url: string; // key
  content: string;
  base64: string;
  hash: ResourceHash;
  type: ResourceType;
  link: { [key: string]: boolean }; // 关联的脚本
  contentType: string; // 下载成功的话必定有 contentType. 下载失败的话则没有 （空Resource）
  createtime: number;
  updatetime?: number;
}

export interface ResourceListItem {
  key: string;
  url: string;
  type: ResourceType;
  contentType: string;
  byteSize: number;
}

export interface ResourceListPage {
  items: ResourceListItem[];
  offset: number;
  limit: number;
  total: number;
  nextOffset?: number;
}

export interface ResourceChunkRequest {
  uuid: string;
  url: string;
  offset: number;
  length: number;
}

export interface ResourceChunk {
  url: string;
  offset: number;
  length: number;
  total: number;
  /** Base64-encoded bytes without a data-URI prefix. */
  base64: string;
}

export const RESOURCE_LIST_PAGE_SIZE = 100;
export const RESOURCE_CHUNK_BYTES = 16 * 1024 * 1024;

export function getResourceByteSize(resource: { content: string; base64?: string }): number {
  if (resource.base64) {
    const comma = resource.base64.indexOf(",");
    const encoded = comma === -1 ? resource.base64 : resource.base64.slice(comma + 1);
    return atob(encoded).length;
  }
  return new TextEncoder().encode(resource.content).byteLength;
}

export interface ResourceHash {
  md5: string;
  sha1: string;
  sha256: string;
  sha384: string;
  sha512: string;
  integrity?: {
    md5: string;
    sha1: string;
    sha256: string;
    sha384: string;
    sha512: string;
  };
}

export type CompiledResource = {
  name: string;
  flag: string;
  uuid: string;
  scriptRevision: string;
  require: string[]; // 仅存储url，节省空间
  matches: string[]; // primary
  includeGlobs: string[]; // includeGlobs applied after matches
  excludeMatches: string[];
  excludeGlobs: string[];
  allFrames: boolean;
  world: string;
  runAt: string;
  scriptUrlPatterns: URLRuleEntry[];
  originalUrlPatterns: URLRuleEntry[] | null;
};

export const ResourceNamespace = "76f45084-91b1-42c1-8be8-cbcc54b171f0";

export class ResourceDAO extends Repo<Resource> {
  constructor() {
    super("resource");
  }

  protected joinKey(key: string) {
    return this.prefix + uuidv5(key, ResourceNamespace);
  }

  save(resource: Resource) {
    return super._save(resource.url, resource);
  }
}

// CompiledResource结构变更时，建议修改 CompiledResourceNamespace 以删除旧Cache
export const CompiledResourceNamespace = "9a12f3c8-1b72-4c8a-875c-8a941f44d9f1";

export class CompiledResourceDAO extends Repo<CompiledResource> {
  constructor() {
    super(`compiled_resource`);
    this.enableCache();
  }

  protected joinKey(key: string) {
    return this.prefix + CompiledResourceNamespace + ":" + key;
  }

  save(resource: CompiledResource) {
    return super._save(resource.uuid, resource);
  }
}

// 清理无效的key
export const cleanInvalidKeys = async () => {
  loadCache().then((cache) => {
    const invalidKeys = Object.keys(cache).filter(
      (key) =>
        key.startsWith("compiled_resource:") && !key.startsWith("compiled_resource:" + CompiledResourceNamespace + ":")
    );
    deletesStorage(invalidKeys);
  });
};
