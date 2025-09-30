import { Repo } from "./repo";
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

export interface CompliedResource {
  uuid: string;
  storeCode: string;
  matches: string[]; // primary
  includeGlobs: string[]; // includeGlobs applied after matches
  excludeMatches: string[];
  excludeGlobs: string[];
  allFrames: boolean;
  world: string;
  runAt: string;
}

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

// SC代码更新时，建议修改 CompliedResourceNamespace 以删除旧Cache
export const CompliedResourceNamespace = "216d81f5-5e02-4f68-8983-85f11221bee7";

export class CompliedResourceDAO extends Repo<CompliedResource> {
  constructor() {
    super(`complied_resource##${CompliedResourceNamespace}##`);
    Promise.resolve().then(() => this.deferredCleanup());
  }

  protected deferredCleanup() {
    chrome.storage.local.get((result: Partial<Record<string, any>> | undefined) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.storage.local.get:", lastError);
        // 无视storage API错误，继续执行
      }
      if (result) {
        const u = [];
        for (const key in result) {
          if (
            key.startsWith("complied_resource##") &&
            !key.startsWith(`complied_resource##${CompliedResourceNamespace}##`)
          ) {
            u.push(key);
          }
        }
        chrome.storage.local.remove(u, () => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error("chrome.runtime.lastError in chrome.storage.local.remove:", lastError);
            // 无视storage API错误，继续执行
          }
        });
      }
    });
  }

  protected joinKey(key: string) {
    return this.prefix + key;
  }

  save(resource: CompliedResource) {
    return super._save(resource.uuid, resource);
  }
}
