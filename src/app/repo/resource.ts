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
  contentType: string;
  createtime: number;
  updatetime?: number;
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

export type CompliedResource = {
  name: string;
  flag: string;
  uuid: string;
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

// CompliedResource结构变更时，建议修改 CompliedResourceNamespace 以删除旧Cache
export const CompliedResourceNamespace = "a51b9167-fdde-467a-a86f-75e5636adda2";

export class CompliedResourceDAO extends Repo<CompliedResource> {
  constructor() {
    super(`complied_resource`);
    this.enableCache();
  }

  protected joinKey(key: string) {
    return this.prefix + CompliedResourceNamespace + ":" + key;
  }

  save(resource: CompliedResource) {
    return super._save(resource.uuid, resource);
  }
}

// 清理无效的key
export const cleanInvalidKeys = async () => {
  loadCache().then((cache) => {
    const invalidKeys = Object.keys(cache).filter(
      (key) =>
        key.startsWith("complied_resource:") && !key.startsWith("complied_resource:" + CompliedResourceNamespace + ":")
    );
    deletesStorage(invalidKeys);
  });
};
